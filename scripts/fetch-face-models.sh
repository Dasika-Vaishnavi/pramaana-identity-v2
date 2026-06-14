#!/usr/bin/env bash
# Provision the real face-match weights for `liveness --features onnx`
# (ARCHITECTURE.md §2 step 5): InsightFace SCRFD detector + ArcFace r100 embedder.
#
#   crates/liveness uses, by default:
#     models/scrfd_10g_bnkps.onnx   (SCRFD-10GF detector + 5 keypoints)
#     models/glintr100.onnx         (ArcFace ResNet100, glint360k, 512-d)
#   both shipped in the InsightFace "antelopev2" pack.
#
# ⚠️  LICENSE: InsightFace PRETRAINED MODELS ARE FOR NON-COMMERCIAL RESEARCH USE
#     ONLY (the code is MIT; the weights are not). By running this you accept
#     that. Do NOT use these weights in a commercial deployment. See
#     https://github.com/deepinsight/insightface.
#
# models/ is gitignored (weights are never committed). Override the source with
# ANTELOPEV2_URL=... if the default release URL has moved.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_DIR="$ROOT/models"
URL="${ANTELOPEV2_URL:-https://github.com/deepinsight/insightface/releases/download/v0.7/antelopev2.zip}"
SCRFD="scrfd_10g_bnkps.onnx"
ARCFACE="glintr100.onnx"

mkdir -p "$MODELS_DIR"

if [[ -f "$MODELS_DIR/$SCRFD" && -f "$MODELS_DIR/$ARCFACE" ]]; then
  echo "✓ models already present in $MODELS_DIR"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  echo "↓ downloading antelopev2 from $URL"
  curl -fL "$URL" -o "$tmp/antelopev2.zip"
  echo "↪ extracting $SCRFD + $ARCFACE"
  # The pack may nest the .onnx files under an antelopev2/ folder; -j flattens.
  unzip -joq "$tmp/antelopev2.zip" "*$SCRFD" "*$ARCFACE" -d "$MODELS_DIR"
fi

if [[ ! -f "$MODELS_DIR/$SCRFD" || ! -f "$MODELS_DIR/$ARCFACE" ]]; then
  echo "✗ expected $SCRFD and $ARCFACE in $MODELS_DIR — check the archive layout / ANTELOPEV2_URL" >&2
  exit 1
fi

echo
echo "✓ models ready in $MODELS_DIR:"
# Print sha256 so a reviewer can PIN the exact weights (paste into a checksum
# file or CI). We do not hardcode a hash here — verify against a trusted source.
if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "$MODELS_DIR/$SCRFD" "$MODELS_DIR/$ARCFACE"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$MODELS_DIR/$SCRFD" "$MODELS_DIR/$ARCFACE"
fi
echo
echo "Next: run the real matcher tests"
echo "  cargo test -p liveness --features onnx -- --nocapture"
