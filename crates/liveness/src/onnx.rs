//! Real face-match pipeline via ONNX Runtime (`onnx` feature).
//!
//! Two-stage InsightFace pipeline, run INSIDE the enclave (ARCHITECTURE.md §2
//! step 5):
//!   1. **SCRFD** (`scrfd_10g_bnkps`) detects the most prominent face and its
//!      5 landmarks, which drive a similarity-transform alignment to the
//!      canonical ArcFace 112×112 template.
//!   2. **ArcFace r100** (`glintr100`, 512-d) embeds the aligned crop; the pair
//!      is accepted iff the cosine similarity of the two embeddings clears
//!      [`DEFAULT_ARCFACE_THRESHOLD`].
//!
//! No model ships with the repo (InsightFace pretrained weights are
//! non-commercial-research-only); provision them with
//! `scripts/fetch-face-models.sh` and pass the two paths at construction. If
//! `onnx` is requested but a model is missing, construction fails honestly —
//! the caller MUST NOT silently fall back to the sim matcher (the security
//! claim of this layer depends on it being the real thing).
//!
//! ## Privacy
//! Faces are PII. The decoded reference, the live frame, and every aligned
//! crop are [`Image`]s (`ZeroizeOnDrop`). The float embeddings are NOT
//! `Zeroize`-derivable (f32), so [`match_faces`] overwrites them via
//! [`zeroize_f32`] before returning. Buffers handed into `ort`'s `Tensor` are
//! released when the tensor drops and are not reachable through ort's API — the
//! enclave boundary is the backstop there (same discipline palc documents for
//! libcrux's internal seed copy).

use std::path::Path;
use std::sync::Mutex;

use ort::session::Session;
use ort::value::{Tensor, ValueType};

use crate::{Error, FaceMatcher, Image, MatchScore, MatcherKind};

/// Mapped-cosine acceptance threshold, on the same [0, 1] scale as
/// [`MatchScore`] (raw cosine `c` maps to `(c + 1) / 2`).
///
/// Chosen as **raw cosine 0.40 → mapped 0.70**. Basis: ArcFace / glint360k-r100
/// embeddings separate same-vs-different identities with near-ceiling
/// verification accuracy across a wide band of cosine thresholds
/// (~0.28–0.45 depending on the target FAR). 0.40 sits toward the
/// low-false-accept end of that band, which is the right bias for an
/// *attestation* gate (a false ACCEPT mints an unearned "human verified" fact,
/// which is worse here than a false reject the user can retry). The exact
/// FAR/FRR is population- and capture-quality-dependent and is NOT claimed
/// numerically; this is a documented, tunable operating point.
pub const DEFAULT_ARCFACE_THRESHOLD: f32 = 0.70;

/// SCRFD square input side (the `_10g` model is exported for 640×640).
const SCRFD_INPUT: u32 = 640;
/// SCRFD detection score cutoff and NMS IoU (InsightFace defaults).
const DET_THRESHOLD: f32 = 0.5;
const NMS_IOU: f32 = 0.4;
/// SCRFD pyramid strides and anchors-per-location (the `bnkps` config).
const STRIDES: [u32; 3] = [8, 16, 32];
const NUM_ANCHORS: usize = 2;

/// The canonical ArcFace 5-point template (left eye, right eye, nose, left
/// mouth, right mouth) for a 112×112 aligned crop. Detected landmarks are
/// similarity-transformed onto these coordinates before embedding.
const ARCFACE_TEMPLATE: [[f32; 2]; 5] = [
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
];

/// A detected face: bounding box (unused downstream beyond area ranking),
/// landmarks, and score, all in the ORIGINAL image's pixel coordinates.
#[derive(Debug, Clone, Copy)]
struct Detection {
    score: f32,
    /// x1, y1, x2, y2.
    bbox: [f32; 4],
    /// 5 (x, y) landmarks.
    kps: [[f32; 2]; 5],
}

impl Detection {
    fn area(&self) -> f32 {
        (self.bbox[2] - self.bbox[0]).max(0.0) * (self.bbox[3] - self.bbox[1]).max(0.0)
    }
}

pub struct OnnxMatcher {
    /// `Session::run` needs `&mut`; Mutex keeps `FaceMatcher` usable by `&self`.
    detector: Mutex<Session>,
    embedder: Mutex<Session>,
    threshold: f32,
    /// ArcFace input dims (read from model metadata; default 112×112).
    embed_w: u32,
    embed_h: u32,
}

fn ort_err(e: ort::Error) -> Error {
    Error::Onnx(e.to_string())
}

impl OnnxMatcher {
    /// Load the SCRFD detector and the ArcFace embedder. Either path missing or
    /// unreadable is a hard error (no silent sim fallback).
    pub fn from_model_files(
        scrfd: impl AsRef<Path>,
        arcface: impl AsRef<Path>,
        threshold: f32,
    ) -> Result<Self, Error> {
        let detector = Session::builder()
            .map_err(ort_err)?
            .commit_from_file(scrfd)
            .map_err(ort_err)?;
        let embedder = Session::builder()
            .map_err(ort_err)?
            .commit_from_file(arcface)
            .map_err(ort_err)?;

        // Static NCHW input dims from the embedder; default 112×112 if dynamic.
        let (mut embed_w, mut embed_h) = (112u32, 112u32);
        if let Some(input) = embedder.inputs().first() {
            if let ValueType::Tensor { shape, .. } = input.dtype() {
                if let [_, _, h, w] = shape[..] {
                    if h > 0 && w > 0 {
                        embed_h = h as u32;
                        embed_w = w as u32;
                    }
                }
            }
        }

        Ok(Self {
            detector: Mutex::new(detector),
            embedder: Mutex::new(embedder),
            threshold,
            embed_w,
            embed_h,
        })
    }

    /// Detect → align → embed one image into a unit-relevant 512-d vector.
    /// `which` labels the image ("live" / "reference") for error messages.
    fn detect_align_embed(&self, image: &Image, which: &'static str) -> Result<Vec<f32>, Error> {
        let landmarks = self.detect_largest_face(image, which)?;
        // The aligned crop is itself a face image → ZeroizeOnDrop wipes it.
        let aligned = align_to_template(image, &landmarks, self.embed_w, self.embed_h);
        self.embed(&aligned)
    }

    /// Run SCRFD and return the 5 landmarks of the largest detected face, in
    /// the original image's coordinates.
    fn detect_largest_face(&self, image: &Image, which: &'static str) -> Result<[[f32; 2]; 5], Error> {
        // Letterbox-resize into a square SCRFD input, keeping aspect; track the
        // scale so detections map back to original coordinates.
        let scale = (SCRFD_INPUT as f32 / image.width() as f32)
            .min(SCRFD_INPUT as f32 / image.height() as f32);
        let mut input = letterbox(image, SCRFD_INPUT, scale);

        let dets = {
            let mut session = self.detector.lock().expect("SCRFD session poisoned");
            let outputs = session
                .run(ort::inputs![Tensor::from_array((
                    [1usize, 3, SCRFD_INPUT as usize, SCRFD_INPUT as usize],
                    input.clone(),
                ))
                .map_err(ort_err)?])
                .map_err(ort_err)?;
            // Collect (last_dim, rows, data) for each output, decode by shape.
            let mut raw = Vec::with_capacity(outputs.len());
            for i in 0..outputs.len() {
                let (shape, data) = outputs[i].try_extract_tensor::<f32>().map_err(ort_err)?;
                let last = *shape.last().unwrap_or(&1) as usize;
                let rows = if last == 0 { 0 } else { data.len() / last };
                raw.push((last, rows, data.to_vec()));
            }
            decode_scrfd(&raw, scale)
        };
        // The letterboxed input float buffer is derived from the face; wipe it.
        zeroize_f32(&mut input);

        let kept = nms(dets, NMS_IOU);
        // Most prominent face = largest area (the person enrolling, closest to
        // the camera). Ties are broken by the earlier (higher-score) entry.
        kept.into_iter()
            .max_by(|a, b| a.area().partial_cmp(&b.area()).unwrap_or(std::cmp::Ordering::Equal))
            .map(|d| d.kps)
            .ok_or(Error::NoFaceDetected(which))
    }

    fn embed(&self, aligned: &Image) -> Result<Vec<f32>, Error> {
        let data = preprocess_arcface(aligned);
        let tensor = Tensor::from_array((
            [1usize, 3, self.embed_h as usize, self.embed_w as usize],
            data,
        ))
        .map_err(ort_err)?;
        let mut session = self.embedder.lock().expect("ArcFace session poisoned");
        let outputs = session.run(ort::inputs![tensor]).map_err(ort_err)?;
        let (_, embedding) = outputs[0].try_extract_tensor::<f32>().map_err(ort_err)?;
        Ok(embedding.to_vec())
    }
}

impl FaceMatcher for OnnxMatcher {
    fn match_faces(&self, live: &Image, reference: &Image) -> Result<MatchScore, Error> {
        let mut a = self.detect_align_embed(live, "live")?;
        let mut b = self.detect_align_embed(reference, "reference")?;
        let raw = cosine(&a, &b);
        // Embeddings are face-derived: wipe before returning (only score escapes).
        zeroize_f32(&mut a);
        zeroize_f32(&mut b);
        Ok(MatchScore {
            score: ((raw + 1.0) / 2.0).clamp(0.0, 1.0),
            threshold: self.threshold,
        })
    }

    fn kind(&self) -> MatcherKind {
        MatcherKind::ArcFaceScrfd
    }
}

// ── SCRFD output decoding (pure; unit-tested without a model) ────────────────

/// Decode SCRFD outputs into detections in ORIGINAL-image coordinates.
///
/// `raw[i] = (last_dim, rows, data)`. Outputs are matched by `last_dim`
/// (1 = score, 4 = bbox-distance, 10 = kps-distance) and by `rows` to a stride
/// — `rows = (SCRFD_INPUT/stride)² · NUM_ANCHORS` — so decoding is robust to
/// the model's output ORDERING. `scale` maps SCRFD-input pixels back to the
/// original (letterbox is top-left, so no offset to subtract).
fn decode_scrfd(raw: &[(usize, usize, Vec<f32>)], scale: f32) -> Vec<Detection> {
    let find = |want_last: usize, want_rows: usize| -> Option<&Vec<f32>> {
        raw.iter()
            .find(|(last, rows, _)| *last == want_last && *rows == want_rows)
            .map(|(_, _, data)| data)
    };

    let mut dets = Vec::new();
    for stride in STRIDES {
        let grid = (SCRFD_INPUT / stride) as usize;
        let rows = grid * grid * NUM_ANCHORS;
        let (Some(scores), Some(bboxes), Some(kpss)) =
            (find(1, rows), find(4, rows), find(10, rows))
        else {
            continue; // a stride's heads are absent / unexpected shape
        };

        for gy in 0..grid {
            for gx in 0..grid {
                for a in 0..NUM_ANCHORS {
                    let row = (gy * grid + gx) * NUM_ANCHORS + a;
                    let score = scores[row];
                    if score < DET_THRESHOLD {
                        continue;
                    }
                    let cx = (gx as f32) * stride as f32;
                    let cy = (gy as f32) * stride as f32;
                    let s = stride as f32;
                    let bb = &bboxes[row * 4..row * 4 + 4];
                    let bbox = [
                        (cx - bb[0] * s) / scale,
                        (cy - bb[1] * s) / scale,
                        (cx + bb[2] * s) / scale,
                        (cy + bb[3] * s) / scale,
                    ];
                    let kp = &kpss[row * 10..row * 10 + 10];
                    let mut kps = [[0.0f32; 2]; 5];
                    for (k, point) in kps.iter_mut().enumerate() {
                        *point = [
                            (cx + kp[k * 2] * s) / scale,
                            (cy + kp[k * 2 + 1] * s) / scale,
                        ];
                    }
                    dets.push(Detection { score, bbox, kps });
                }
            }
        }
    }
    dets
}

/// Greedy non-max suppression by IoU, highest score first.
fn nms(mut dets: Vec<Detection>, iou_thresh: f32) -> Vec<Detection> {
    dets.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut kept: Vec<Detection> = Vec::new();
    'outer: for d in dets {
        for k in &kept {
            if iou(&d.bbox, &k.bbox) > iou_thresh {
                continue 'outer;
            }
        }
        kept.push(d);
    }
    kept
}

fn iou(a: &[f32; 4], b: &[f32; 4]) -> f32 {
    let x1 = a[0].max(b[0]);
    let y1 = a[1].max(b[1]);
    let x2 = a[2].min(b[2]);
    let y2 = a[3].min(b[3]);
    let inter = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = (a[2] - a[0]).max(0.0) * (a[3] - a[1]).max(0.0);
    let area_b = (b[2] - b[0]).max(0.0) * (b[3] - b[1]).max(0.0);
    let union = area_a + area_b - inter;
    if union <= f32::EPSILON {
        0.0
    } else {
        inter / union
    }
}

// ── Alignment (pure; unit-tested without a model) ────────────────────────────

/// Non-reflective similarity transform (scale·rotation + translation) mapping
/// `src` onto `dst` in a least-squares sense, returned as the forward affine
/// `[a, -b, tx; b, a, ty]` (flattened `[a, b, tx, ty]`). This is the
/// closed-form (no-SVD) Umeyama-without-reflection used by InsightFace's
/// `estimate_norm`.
fn similarity_transform(src: &[[f32; 2]; 5], dst: &[[f32; 2]; 5]) -> [f32; 4] {
    let n = 5.0f32;
    let mean = |p: &[[f32; 2]; 5], c: usize| p.iter().map(|q| q[c]).sum::<f32>() / n;
    let (mx, my) = (mean(src, 0), mean(src, 1));
    let (ux, uy) = (mean(dst, 0), mean(dst, 1));

    let (mut sxx, mut num_a, mut num_b) = (0.0f32, 0.0f32, 0.0f32);
    for i in 0..5 {
        let (x, y) = (src[i][0] - mx, src[i][1] - my);
        let (u, v) = (dst[i][0] - ux, dst[i][1] - uy);
        sxx += x * x + y * y;
        num_a += x * u + y * v;
        num_b += x * v - y * u;
    }
    let (a, b) = if sxx > f32::EPSILON {
        (num_a / sxx, num_b / sxx)
    } else {
        (1.0, 0.0)
    };
    // t = mean_dst - [[a,-b],[b,a]] · mean_src
    let tx = ux - (a * mx - b * my);
    let ty = uy - (b * mx + a * my);
    [a, b, tx, ty]
}

/// Warp `image` into a `w`×`h` aligned crop using the inverse of the forward
/// similarity transform that maps detected landmarks → the template.
fn align_to_template(image: &Image, landmarks: &[[f32; 2]; 5], w: u32, h: u32) -> Image {
    let [a, b, tx, ty] = similarity_transform(landmarks, &ARCFACE_TEMPLATE);
    // Inverse of q = [[a,-b],[b,a]]·p + t  ⇒  p = (1/det)·[[a,b],[-b,a]]·(q - t).
    let det = a * a + b * b;
    let inv = if det > f32::EPSILON { 1.0 / det } else { 0.0 };

    let mut rgb = vec![0u8; (w * h * 3) as usize];
    for dy in 0..h {
        for dx in 0..w {
            let (qx, qy) = (dx as f32 - tx, dy as f32 - ty);
            let sx = inv * (a * qx + b * qy);
            let sy = inv * (-b * qx + a * qy);
            let px = sample_bilinear(image, sx, sy);
            let i = ((dy * w + dx) * 3) as usize;
            rgb[i] = px[0] as u8;
            rgb[i + 1] = px[1] as u8;
            rgb[i + 2] = px[2] as u8;
        }
    }
    Image::new(w, h, rgb).expect("warp produces a w*h*3 RGB buffer")
}

// ── Preprocess / sampling / similarity (pure) ────────────────────────────────

/// ArcFace NCHW input, normalized `(px - 127.5) / 128`.
fn preprocess_arcface(image: &Image) -> Vec<f32> {
    let (w, h) = (image.width() as usize, image.height() as usize);
    let plane = w * h;
    let mut out = vec![0.0f32; 3 * plane];
    for y in 0..h {
        for x in 0..w {
            let i = ((y * w + x) * 3) as usize;
            for c in 0..3 {
                out[c * plane + y * w + x] = (f32::from(image.rgb()[i + c]) - 127.5) / 128.0;
            }
        }
    }
    out
}

/// Resize `image` into a `side`×`side` SCRFD input by `scale` (top-left
/// placement, zero-padded), normalized `(px - 127.5) / 128`, NCHW.
fn letterbox(image: &Image, side: u32, scale: f32) -> Vec<f32> {
    let plane = (side * side) as usize;
    let mut out = vec![-127.5 / 128.0; 3 * plane]; // padded region = (0 - 127.5)/128
    let new_w = ((image.width() as f32) * scale).round() as u32;
    let new_h = ((image.height() as f32) * scale).round() as u32;
    for dy in 0..new_h.min(side) {
        for dx in 0..new_w.min(side) {
            // Map dst pixel back into the source for bilinear sampling.
            let sx = (dx as f32 + 0.5) / scale - 0.5;
            let sy = (dy as f32 + 0.5) / scale - 0.5;
            let px = sample_bilinear(image, sx, sy);
            for c in 0..3 {
                out[c * plane + (dy * side + dx) as usize] = (px[c] - 127.5) / 128.0;
            }
        }
    }
    out
}

/// Bilinear sample at float `(x, y)` with edge clamping; returns RGB in [0,255].
fn sample_bilinear(image: &Image, x: f32, y: f32) -> [f32; 3] {
    let (w, h) = (image.width(), image.height());
    let x = x.clamp(0.0, (w - 1) as f32);
    let y = y.clamp(0.0, (h - 1) as f32);
    let x0 = x.floor() as u32;
    let y0 = y.floor() as u32;
    let x1 = (x0 + 1).min(w - 1);
    let y1 = (y0 + 1).min(h - 1);
    let (fx, fy) = (x - x0 as f32, y - y0 as f32);
    let at = |xx: u32, yy: u32, c: usize| -> f32 {
        f32::from(image.rgb()[((yy * w + xx) * 3) as usize + c])
    };
    core::array::from_fn(|c| {
        let top = at(x0, y0, c) * (1.0 - fx) + at(x1, y0, c) * fx;
        let bottom = at(x0, y1, c) * (1.0 - fx) + at(x1, y1, c) * fx;
        top * (1.0 - fy) + bottom * fy
    })
}

fn cosine(a: &[f32], b: &[f32]) -> f32 {
    let n = a.len().min(b.len());
    let dot: f32 = (0..n).map(|i| a[i] * b[i]).sum();
    let na: f32 = a[..n].iter().map(|v| v * v).sum::<f32>().sqrt();
    let nb: f32 = b[..n].iter().map(|v| v * v).sum::<f32>().sqrt();
    if na <= f32::EPSILON || nb <= f32::EPSILON {
        return 0.0;
    }
    dot / (na * nb)
}

/// Overwrite an embedding/scratch float buffer in place (f32 is not
/// `Zeroize`-derivable, so we wipe explicitly) then drop its capacity.
fn zeroize_f32(v: &mut Vec<f32>) {
    for x in v.iter_mut() {
        *x = 0.0;
    }
    v.clear();
    v.shrink_to_fit();
}

#[cfg(test)]
mod onnx_tests {
    use super::*;

    fn approx(a: f32, b: f32, eps: f32) -> bool {
        (a - b).abs() <= eps
    }

    #[test]
    fn cosine_identity_and_orthogonal() {
        assert!(approx(cosine(&[1.0, 2.0, 3.0], &[1.0, 2.0, 3.0]), 1.0, 1e-6));
        assert!(approx(cosine(&[1.0, 0.0], &[0.0, 1.0]), 0.0, 1e-6));
        assert!(approx(cosine(&[1.0, 0.0], &[-1.0, 0.0]), -1.0, 1e-6));
    }

    #[test]
    fn zeroize_f32_wipes_and_empties() {
        let mut v = vec![1.0f32, -2.0, 3.5, 4.0];
        zeroize_f32(&mut v);
        assert!(v.is_empty());
    }

    #[test]
    fn iou_overlap_and_disjoint() {
        let a = [0.0, 0.0, 10.0, 10.0];
        assert!(approx(iou(&a, &a), 1.0, 1e-6));
        let disjoint = [20.0, 20.0, 30.0, 30.0];
        assert!(approx(iou(&a, &disjoint), 0.0, 1e-6));
        // Half-overlap: [0,0,10,10] vs [5,0,15,10] → inter 50, union 150.
        assert!(approx(iou(&a, &[5.0, 0.0, 15.0, 10.0]), 50.0 / 150.0, 1e-6));
    }

    #[test]
    fn nms_drops_overlapping_keeps_distinct() {
        let det = |score, bbox| Detection { score, bbox, kps: [[0.0; 2]; 5] };
        let kept = nms(
            vec![
                det(0.9, [0.0, 0.0, 10.0, 10.0]),
                det(0.8, [1.0, 1.0, 11.0, 11.0]), // ~64% IoU with the first → dropped
                det(0.7, [50.0, 50.0, 60.0, 60.0]), // disjoint → kept
            ],
            NMS_IOU,
        );
        assert_eq!(kept.len(), 2);
        assert!(approx(kept[0].score, 0.9, 1e-6)); // highest score first
    }

    #[test]
    fn similarity_transform_recovers_known_mapping() {
        // Apply a known scale(2)·rot(90°) + translation, then recover it.
        let (a, b, tx, ty) = (0.0f32, 2.0f32, 5.0f32, -3.0f32); // a=s·cosθ, b=s·sinθ
        let mut dst = [[0.0f32; 2]; 5];
        for i in 0..5 {
            let [x, y] = ARCFACE_TEMPLATE[i];
            dst[i] = [a * x - b * y + tx, b * x + a * y + ty];
        }
        let [ra, rb, rtx, rty] = similarity_transform(&ARCFACE_TEMPLATE, &dst);
        assert!(approx(ra, a, 1e-3), "a={ra}");
        assert!(approx(rb, b, 1e-3), "b={rb}");
        assert!(approx(rtx, tx, 1e-2), "tx={rtx}");
        assert!(approx(rty, ty, 1e-2), "ty={rty}");
    }

    #[test]
    fn align_identity_transform_is_a_passthrough() {
        // A 112×112 image whose "landmarks" already equal the template should
        // warp to (very nearly) itself — exercises align_to_template end to end.
        let w = 112u32;
        let mut rgb = vec![0u8; (w * w * 3) as usize];
        for y in 0..w {
            for x in 0..w {
                let i = ((y * w + x) * 3) as usize;
                rgb[i] = (x * 2) as u8;
                rgb[i + 1] = (y * 2) as u8;
                rgb[i + 2] = 100;
            }
        }
        let img = Image::new(w, w, rgb).unwrap();
        let aligned = align_to_template(&img, &ARCFACE_TEMPLATE, w, w);
        // Interior pixel preserved under the identity similarity transform.
        let i = ((56 * w + 56) * 3) as usize;
        assert!(aligned.rgb()[i].abs_diff(112) <= 1);
        assert!(aligned.rgb()[i + 1].abs_diff(112) <= 1);
        assert_eq!(aligned.rgb()[i + 2], 100);
    }

    #[test]
    fn decode_scrfd_maps_anchor_to_box_and_scales_back() {
        // One stride-32 grid (20×20×2 = 800 rows); put a high score at row 0
        // (anchor center (0,0)) and check the decoded, scale-corrected box.
        let rows = 800;
        let mut scores = vec![0.0f32; rows];
        let mut bboxes = vec![0.0f32; rows * 4];
        let kpss = vec![0.0f32; rows * 10];
        scores[0] = 0.99;
        bboxes[0..4].copy_from_slice(&[1.0, 1.0, 2.0, 2.0]); // l,t,r,b (×stride)
        let raw = vec![(1usize, rows, scores), (4usize, rows, bboxes), (10usize, rows, kpss)];
        let dets = decode_scrfd(&raw, 0.5); // scale 0.5 → original coords ×2
        assert_eq!(dets.len(), 1);
        // cx=cy=0, stride 32: x1=(0-1*32)/0.5=-64, x2=(0+2*32)/0.5=128.
        assert!(approx(dets[0].bbox[0], -64.0, 1e-3));
        assert!(approx(dets[0].bbox[2], 128.0, 1e-3));
    }

    // ── Gated end-to-end accept/reject (needs real weights + face fixtures) ──
    //
    // This is the real-matcher acceptance test. It is SKIPPED (and passes) when
    // the antelopev2 weights or the CC0 face fixtures are absent, so default CI
    // and `make demo` stay green on the sim path. To run it for real:
    //   1. scripts/fetch-face-models.sh          (→ models/{scrfd_10g_bnkps,glintr100}.onnx)
    //   2. drop three CC0 faces in crates/liveness/testdata/faces/:
    //        a1.{png,jpg}, a2.{png,jpg}  — same person (accept)
    //        b.{png,jpg}                 — a different person (reject)
    //   3. cargo test -p liveness --features onnx -- --nocapture

    fn load_face(path: &std::path::Path) -> Option<Image> {
        let img = image::open(path).ok()?.to_rgb8();
        let (w, h) = img.dimensions();
        Image::new(w, h, img.into_raw()).ok()
    }

    fn model_paths() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
        let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../models");
        let scrfd = std::env::var("PRAMAANA_SCRFD_MODEL")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| base.join("scrfd_10g_bnkps.onnx"));
        let arcface = std::env::var("PRAMAANA_ARCFACE_MODEL")
            .map(std::path::PathBuf::from)
            .unwrap_or_else(|_| base.join("glintr100.onnx"));
        (scrfd.exists() && arcface.exists()).then_some((scrfd, arcface))
    }

    fn fixture_faces() -> Option<(Image, Image, Image)> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("testdata/faces");
        let load_any = |stem: &str| -> Option<Image> {
            ["png", "jpg", "jpeg"]
                .iter()
                .map(|ext| dir.join(format!("{stem}.{ext}")))
                .find(|p| p.exists())
                .and_then(|p| load_face(&p))
        };
        Some((load_any("a1")?, load_any("a2")?, load_any("b")?))
    }

    #[test]
    fn onnx_accept_same_person_reject_different() {
        let Some((scrfd, arcface)) = model_paths() else {
            eprintln!("SKIP onnx accept/reject: weights absent (run scripts/fetch-face-models.sh)");
            return;
        };
        let Some((a1, a2, b)) = fixture_faces() else {
            eprintln!("SKIP onnx accept/reject: add CC0 faces to testdata/faces/{{a1,a2,b}}");
            return;
        };
        let matcher =
            OnnxMatcher::from_model_files(scrfd, arcface, DEFAULT_ARCFACE_THRESHOLD).unwrap();

        let accept = matcher.match_faces(&a1, &a2).unwrap();
        assert!(accept.is_match(), "same person should match (score {})", accept.score);

        let reject = matcher.match_faces(&a1, &b).unwrap();
        assert!(!reject.is_match(), "different people should not match (score {})", reject.score);
    }
}
