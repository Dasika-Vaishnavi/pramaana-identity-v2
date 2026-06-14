# Face fixtures for the `onnx` accept/reject test

The real-matcher test `onnx_accept_same_person_reject_different`
([../../src/onnx.rs](../../src/onnx.rs)) loads three faces from this directory:

| File | Role |
|---|---|
| `a1.{png,jpg}` | person A, capture 1 |
| `a2.{png,jpg}` | person A, capture 2 (different photo of the **same** person) → must **accept** |
| `b.{png,jpg}`  | person B (a **different** person) → must **reject** |

The test (and the whole `onnx` feature) is **gated**: with no faces here — or no
weights in `models/` — it **skips and passes**, so default CI / `make demo` stay
green on the sim matcher. Provision to run it for real:

```bash
scripts/fetch-face-models.sh                 # weights → models/ (non-commercial license)
# add a1/a2/b here (see licensing below)
cargo test -p liveness --features onnx -- --nocapture
```

## Licensing — only commit CC0 / public-domain faces

These images are checked into a public repo, so they must be **CC0 or
public-domain** (and ideally not an identifiable private individual). Good
sources: CC0 synthetic-face datasets, or public-domain portraits. Everything in
this folder except this README and `.gitkeep` is gitignored by default — add a
specific file via `git add -f` only once you've confirmed its license.

Faces captured live in the browser demo (Enroll → "Live face match (DEMO)") are
**never** written here or anywhere on disk; they are matched in memory and wiped.
