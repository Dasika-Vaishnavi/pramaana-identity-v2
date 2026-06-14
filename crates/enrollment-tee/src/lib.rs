//! Enrollment TEE T (ARCHITECTURE.md §5): orchestrates §2 steps 1, 4–13.
//!
//! Gate 0 (RA-TLS-style quote to C) → receive QR + liveness artifacts →
//! verify UIDAI signature + face match in-enclave → stable id → blind →
//! Gate b (attested call to O over HTTP) → Gate k (DLEQ verify against the
//! PINNED vault key) + unblind → PALC → dedup query → Gate Z → register Φ
//! commitment → ERASE all PII (QR bytes, live face, intermediates).
//!
//! sk_IdR is derived and RETURNED TO C once over the attested channel (§3
//! requires the user to hold it for Semaphore identity derivation); T never
//! stores it — it is recomputable by re-scan + re-derive (§2 step 13). See
//! docs/DECISIONS.md.

#[cfg(feature = "http-server")]
pub mod http;
pub mod registry;
mod vault_client;

pub use vault_client::HttpVaultClient;

use aadhaar_qr::{AadhaarRecord, RsaPublicKey};
use attestation::sim::SimAttester;
use attestation::{bind_report_data, Attester};
use liveness::{
    decode_jp2, verify_capture, ChallengeNonce, FaceMatcher, Image, LiveCapture, MatcherKind,
};
use rand_core::{OsRng, RngCore};
use registry::{Registry, RegistryError, GATE_Z_CONTEXT};
use sha3::{Digest, Sha3_256};
use zeroize::{Zeroize, Zeroizing};

const STABLE_ID_DOMAIN: &[u8] = b"pramaana-stable-id-v1";
const DEDUP_DOMAIN: &[u8] = b"pramaana-dedup-v1";
/// Domain separator between Φ and the biometric fact in the Gate Z statement.
const GATE_Z_BIOMETRIC_TAG: u8 = 0xB1;

#[derive(Debug, thiserror::Error)]
pub enum EnrollError {
    #[error("attestation mode {0:?} is not available in this build (set SIMULATION=1)")]
    UnsupportedMode(String),
    #[error("QR rejected: {0}")]
    Qr(#[from] aadhaar_qr::Error),
    #[error("liveness rejected: {0}")]
    Liveness(#[from] liveness::Error),
    #[error("live face does not match the QR photo (score {score}, threshold {threshold})")]
    FaceMismatch {
        score: f32,
        threshold: f32,
        /// Which matcher rejected — surfaced as the {performed:true, passed:false}
        /// biometric fact's `kind` at the app layer (C3).
        kind: MatcherKind,
    },
    #[error("vault call failed: {0}")]
    Vault(String),
    #[error("gate k / VOPRF failure: {0}")]
    GateK(voprf::Error),
    #[error("PALC derivation failed: {0}")]
    Palc(#[from] palc::Error),
    #[error("registry: {0}")]
    Registry(#[from] RegistryError),
    #[error("attestation: {0}")]
    Attestation(#[from] attestation::Error),
}

/// §6: SIM by default. `SIMULATION` unset / `1` / `true` selects sim; any
/// other value is rejected until the tdx/dstack backends are wired in at
/// deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttestationMode {
    Sim,
}

impl AttestationMode {
    pub fn from_env() -> Result<Self, EnrollError> {
        match std::env::var("SIMULATION") {
            Err(_) => Ok(Self::Sim),
            Ok(v) if v == "1" || v.eq_ignore_ascii_case("true") => Ok(Self::Sim),
            Ok(other) => Err(EnrollError::UnsupportedMode(other)),
        }
    }
}

/// Gate 0 output: an attested handshake. `ephemeral_pubkey` stands in for
/// the RA-TLS key the session would be terminated with; the quote's
/// report_data binds it to the client's nonce so C can verify it speaks to
/// a genuine, reviewed T before sending ANYTHING (§2 step 1).
pub struct Handshake {
    pub quote: Vec<u8>,
    pub ephemeral_pubkey: [u8; 32],
}

/// What C sends to T over the attested channel (§2 step 4). Owns its PII;
/// consumed (and wiped) by [`EnrollmentTee::enroll`].
pub struct EnrollmentRequest {
    pub qr_numeric: String,
    pub live_capture: LiveCapture,
    pub liveness_nonce: ChallengeNonce,
    /// Optional DEMO reference photo (the user's own face) used as the match
    /// reference INSTEAD of the QR JP2. SIM/DEMO ONLY — clearly NOT a verified
    /// credential. `None` ⇒ the real path decodes the credential photo from the
    /// signature-verified QR. Either way the face never enters Φ derivation.
    pub demo_reference: Option<Image>,
}

/// The public, NON-BIOMETRIC fact that an in-enclave live-face ↔ credential-photo
/// match was performed for this Φ (ARCHITECTURE.md §2 step 5). This is the ONLY
/// thing about the biometric that survives enrollment: no frame, no decoded
/// photo, no embedding — just `{performed, passed, kind}`. It is bound into the
/// Gate Z attestation statement ([`gate_z_value`]) so a verifier recomputes and
/// rejects a tampered fact (it is tamper-evident, not self-reported).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BiometricMatch {
    /// A match was attempted in-enclave (always true once step 5 runs).
    pub performed: bool,
    /// The live face matched the credential photo at/above threshold. A `false`
    /// here ABORTS enrollment (no Φ minted), so a minted handle always carries
    /// `passed: true`; `false` is only surfaced on the FaceMismatch error path.
    pub passed: bool,
    /// Sim stand-in vs the real SCRFD+ArcFace pipeline.
    pub kind: MatcherKind,
}

/// §2 step 13 output: public data only. No PII, no sk_IdR.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnrollmentHandle {
    /// Φ = SHA3-512(C_commit), the registered master-identity commitment.
    pub phi: [u8; 64],
    pub dedup_tag: [u8; 32],
    /// True when dedup found an existing identity (Sybil block: the SAME Φ
    /// is returned, no second identity is minted).
    pub already_enrolled: bool,
    /// The attested, non-biometric "a face match was performed and passed" fact.
    pub biometric: BiometricMatch,
}

/// What `enroll` hands back to C over the attested channel: the public
/// handle PLUS sk_IdR. The user must hold sk_IdR to derive their Semaphore
/// identity (§3); T transmits it exactly once and persists nothing — it is
/// recomputable by re-scan + re-derive, which is also why the
/// already-enrolled path can return it (PALC re-derives the same key).
pub struct EnrollmentOutput {
    pub handle: EnrollmentHandle,
    /// ML-KEM-1024 decapsulation key (3168 bytes). Wiped on drop.
    pub sk_idr: Zeroizing<Vec<u8>>,
}

impl std::fmt::Debug for EnrollmentOutput {
    /// Redacted: never prints sk_IdR (same hygiene as `Palc`).
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("EnrollmentOutput")
            .field("handle", &self.handle)
            .finish_non_exhaustive()
    }
}

pub struct EnrollmentTee<M: FaceMatcher, R: Registry> {
    attester: SimAttester,
    vault: HttpVaultClient,
    registry: R,
    matcher: M,
    uidai_pubkey: RsaPublicKey,
}

impl<M: FaceMatcher, R: Registry> EnrollmentTee<M, R> {
    pub fn new(
        mode: AttestationMode,
        uidai_pubkey: RsaPublicKey,
        vault: HttpVaultClient,
        registry: R,
        matcher: M,
    ) -> Self {
        let AttestationMode::Sim = mode;
        Self {
            attester: SimAttester::default(),
            vault,
            registry,
            matcher,
            uidai_pubkey,
        }
    }

    pub fn registry(&self) -> &R {
        &self.registry
    }

    /// Gate 0 (§2 step 1): attested handshake. C verifies the quote against
    /// its appraisal policy and checks report_data binds (nonce, pubkey);
    /// on failure C sends NOTHING.
    pub fn gate0_handshake(&self, client_nonce: &[u8]) -> Result<Handshake, EnrollError> {
        let mut ephemeral_pubkey = [0u8; 32];
        OsRng.fill_bytes(&mut ephemeral_pubkey);
        let report_data = bind_report_data(client_nonce, &ephemeral_pubkey);
        Ok(Handshake {
            quote: self.attester.quote(&report_data)?,
            ephemeral_pubkey,
        })
    }

    /// §2 steps 4–13. Consumes the request; all PII is wiped before return.
    pub fn enroll(&self, request: EnrollmentRequest) -> Result<EnrollmentOutput, EnrollError> {
        self.enroll_inner(request, |_, _| {})
    }

    /// Implementation seam (same pattern as palc): `post_wipe` observes the
    /// wiped PII — the QR/stable-id/decoded-photo scratch AND the live capture
    /// frames — before they are freed (step 13).
    pub(crate) fn enroll_inner(
        &self,
        request: EnrollmentRequest,
        post_wipe: impl FnOnce(&PiiScratch, &LiveCapture),
    ) -> Result<EnrollmentOutput, EnrollError> {
        let EnrollmentRequest {
            qr_numeric,
            mut live_capture,
            liveness_nonce,
            demo_reference,
        } = request;
        let mut scratch = PiiScratch {
            qr_numeric,
            stable_id: Vec::new(),
            reference: None,
        };

        // Run all steps, then wipe ALL PII on BOTH success and error paths: the
        // scratch (QR, stable_id, decoded/demo reference photo) AND the live
        // frames — explicitly, not just via ZeroizeOnDrop, so the observer sees
        // zeroed buffers. Embeddings are wiped inside the matcher (liveness, C1).
        let result = self.enroll_steps(&mut scratch, &live_capture, &liveness_nonce, demo_reference);
        for frame in &mut live_capture.frames {
            frame.zeroize();
        }
        scratch.wipe();
        post_wipe(&scratch, &live_capture);
        result
    }

    fn enroll_steps(
        &self,
        scratch: &mut PiiScratch,
        capture: &LiveCapture,
        liveness_nonce: &ChallengeNonce,
        demo_reference: Option<Image>,
    ) -> Result<EnrollmentOutput, EnrollError> {
        // §2 step 5: UIDAI signature verification (never OCR) + extraction.
        let record = aadhaar_qr::parse_and_verify(&scratch.qr_numeric, &self.uidai_pubkey)?;

        // §2 steps 3/5: accept the capture (nonce echo, anti-replay), then
        // match the live face to the QR photo INSIDE the enclave. The decoded
        // photo lives in `scratch` so it is wiped (and observed) before return.
        verify_capture(capture, liveness_nonce)?;
        // DEMO path: an explicit reference photo (the user's own face) replaces
        // the credential photo for the match ONLY. Φ still derives from the QR
        // fields below, so the face never enters Φ. Real path: decode the JP2
        // credential photo from the (signature-verified) QR.
        scratch.reference = Some(match demo_reference {
            Some(demo) => demo,
            None => decode_jp2(&record.photo_jp2)?,
        });
        let score = {
            let reference = scratch
                .reference
                .as_ref()
                .expect("reference photo just set");
            let live_frame = capture
                .frames
                .first()
                .expect("verify_capture requires frames");
            self.matcher.match_faces(live_frame, reference)?
        };
        let kind = self.matcher.kind();
        // A failed match ABORTS — no Φ minted, no registration. The
        // {performed:true, passed:false} fact is reconstructed from this error
        // at the app layer (C3).
        if !score.is_match() {
            return Err(EnrollError::FaceMismatch {
                score: score.score,
                threshold: score.threshold,
                kind,
            });
        }
        let biometric = BiometricMatch {
            performed: true,
            passed: true,
            kind,
        };

        // §2 step 6: stable timestamp-stripped identifier, then blind it.
        scratch.stable_id = encode_stable_id(&record);
        drop(record);
        let (state, blinded) = voprf::blind(&scratch.stable_id).map_err(EnrollError::GateK)?;

        // §2 steps 7–8 (Gate b): quote bound to the blinded input, attested
        // evaluation by O.
        let vault_nonce = self.vault.challenge()?;
        let quote = self
            .attester
            .quote(&bind_report_data(&vault_nonce, &blinded.0))?;
        let (evaluation, proof) = self.vault.evaluate(&vault_nonce, &blinded.0, &quote)?;

        // §2 step 9 (Gate k): DLEQ verification against the PINNED committed
        // key happens inside unblind; a per-user-key vault fails here.
        let oprf_output = voprf::unblind(
            state,
            &scratch.stable_id,
            &evaluation,
            &proof,
            self.vault.public_key(),
        )
        .map_err(EnrollError::GateK)?;

        // §2 step 10: PALC.
        let palc = palc::derive(oprf_output.as_bytes(), &scratch.stable_id)?;

        // §2 step 11: dedup — derived THROUGH Φ (and so through the
        // issuer-unknown k); a tag computable from QR fields alone would be
        // issuer-enumerable on-chain (CLAUDE.md non-negotiable).
        let dedup_tag = dedup_tag(&palc.phi);
        if self.registry.is_seen(&dedup_tag)? {
            // Sybil block: return the existing identity, do NOT mint a
            // second. sk_IdR is the same re-derivation (recovery-by-rescan).
            return Ok(EnrollmentOutput {
                handle: EnrollmentHandle {
                    phi: palc.phi,
                    dedup_tag,
                    already_enrolled: true,
                    biometric,
                },
                sk_idr: Zeroizing::new(palc.sk_idr().to_vec()),
            });
        }

        // §2 step 12 (Gate Z, sim): prove C_commit came from reviewed code on
        // approved hardware. The attested statement binds Φ TOGETHER WITH the
        // biometric-match fact (gate_z_value), so R recomputes and rejects a
        // tampered fact — it is tamper-evident, not self-reported. This is the
        // seam a real DCAP-in-ZK / ProveKit Gate Z verifier proves over;
        // IGateZVerifier stays swappable. R verifies and only then records.
        let gatez_proof = self.attester.quote(&bind_report_data(
            GATE_Z_CONTEXT,
            &gate_z_value(&palc.phi, &biometric),
        ))?;
        self.registry
            .register(&palc.phi, &dedup_tag, &biometric, &gatez_proof)?;

        // §2 step 13: palc and oprf_output drop here → zeroized. The single
        // surviving copy of sk_IdR rides back to C (Zeroizing) — T keeps
        // nothing.
        Ok(EnrollmentOutput {
            handle: EnrollmentHandle {
                phi: palc.phi,
                dedup_tag,
                already_enrolled: false,
                biometric,
            },
            sk_idr: Zeroizing::new(palc.sk_idr().to_vec()),
        })
    }
}

/// PII-derived buffers owned by the enrollment flow, wiped before return.
pub(crate) struct PiiScratch {
    pub(crate) qr_numeric: String,
    pub(crate) stable_id: Vec<u8>,
    /// The decoded credential photo (PII). Held here — not just as a local —
    /// so it is wiped and observed before enroll returns (step 13).
    pub(crate) reference: Option<Image>,
}

impl PiiScratch {
    fn wipe(&mut self) {
        self.qr_numeric.zeroize();
        self.stable_id.zeroize();
        if let Some(photo) = &mut self.reference {
            photo.zeroize();
        }
    }

    /// `String`/`Vec`/`Image` zeroize wipe the bytes then clear the length.
    #[cfg(test)]
    pub(crate) fn is_wiped(&self) -> bool {
        self.qr_numeric.is_empty()
            && self.stable_id.is_empty()
            && self.reference.as_ref().is_none_or(|p| p.rgb().is_empty())
    }
}

/// §2 step 6 encoding (golden-tested; these bytes must never change):
/// "pramaana-stable-id-v1" ‖ (u16_le(len) ‖ field) for
/// last-4, name, DOB, gender, pincode. Length framing keeps field
/// boundaries unambiguous.
fn encode_stable_id(record: &AadhaarRecord) -> Vec<u8> {
    let fields: [&str; 5] = [
        &record.reference_last4,
        &record.name,
        &record.dob,
        &record.gender,
        &record.address.pincode,
    ];
    let mut out = Vec::with_capacity(
        STABLE_ID_DOMAIN.len() + fields.iter().map(|f| 2 + f.len()).sum::<usize>(),
    );
    out.extend_from_slice(STABLE_ID_DOMAIN);
    for field in fields {
        let len = u16::try_from(field.len()).expect("QR fields are far below 64 KiB");
        out.extend_from_slice(&len.to_le_bytes());
        out.extend_from_slice(field.as_bytes());
    }
    out
}

/// §2 step 11: per-person dedup tag = SHA3-256(domain ‖ Φ).
fn dedup_tag(phi: &[u8; 64]) -> [u8; 32] {
    let mut h = Sha3_256::new();
    h.update(DEDUP_DOMAIN);
    h.update(phi);
    h.finalize().into()
}

/// §2 step 12 Gate Z statement value: Φ bound TOGETHER WITH the biometric-match
/// fact (domain-separated). Both the produce side (the attester quote in
/// `enroll_steps`) and the verify side ([`registry::InMemoryRegistry::register`])
/// recompute this and feed it to the attestation report_data binding, so
/// swapping the fact invalidates the proof — the fact is tamper-evident, not
/// self-reported. Φ derivation is untouched: the face never enters Φ; this only
/// binds the already-derived Φ to the public fact.
pub(crate) fn gate_z_value(phi: &[u8; 64], biometric: &BiometricMatch) -> Vec<u8> {
    let mut v = Vec::with_capacity(phi.len() + 1 + 3);
    v.extend_from_slice(phi);
    v.push(GATE_Z_BIOMETRIC_TAG);
    v.push(u8::from(biometric.performed));
    v.push(u8::from(biometric.passed));
    v.push(match biometric.kind {
        MatcherKind::Sim => 0,
        MatcherKind::ArcFaceScrfd => 1,
    });
    v
}

#[cfg(test)]
mod tests;
