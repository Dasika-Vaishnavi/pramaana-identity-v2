# Pramaana Unified Architecture — Aadhaar Variant

> Single-source architectural description of the unified Pramaana system.
> Origins: V3 crypto spine (`yayati-codes/Pramaana-v2`) + V2 frontend
> (`Dasika-Vaishnavi/pramaana-identity-v2`). See `docs/UNIFICATION.md`
> for the reconciliation decisions.

## §1 Participants

- **C** = Client (React web frontend at `:5173`, or headless SDK)
- **T** = Enrollment TEE (attested confidential VM, Intel TDX; sim on laptop)
- **O** = VOPRF Vault holding key k, in its own TDX CVM
- **R** = Registry (on-chain, EVM — anvil locally, any EVM chain in production)

## §2 Enrollment sequence

1. **Gate 0** — C asks T to start. T returns an RA-TLS quote proving genuine enclave +
   reviewed code, with `report_data = H(nonce ‖ ephemeral_TLS_pubkey)`. C verifies the
   appraisal policy; **if it fails, C stops and sends NOTHING**.
2. C scans the **Aadhaar Secure QR** and extracts `(signed_data, UIDAI_signature)`.
   (ePassport NFC is a drop-in adapter for later.)
3. C records a **live face capture** + device check (liveness).
4. C sends QR signed_data + signature + liveness artifacts to T over the RA-TLS channel.
5. T verifies the **UIDAI RSA-2048/SHA-256 signature** over signed_data against the
   UIDAI public certificate; extracts demographic fields + the JPEG2000 photo; and
   **matches the live face to the QR photo INSIDE the enclave**.
6. T computes a **STABLE identifier** from timestamp-stripped reference fields
   `(last-4 ‖ name ‖ DOB ‖ gender ‖ pincode)`, then **BLINDS** it so the vault can't read it.
7. **Gate b** — T presents a quote to O with report_data bound to the blinded input
   (prevents replay-based grinding). O verifies T's quote.
8. O evaluates the **VOPRF** with sealed key k and returns the evaluation + a DLEQ proof.
9. **Gate k** — T verifies O's proof that k lives in a genuine sealed TDX CVM, then unblinds.
10. **PALC** — T derives:
    ```
    seed     = HKDF-SHA3-512(salt=0^512, IKM = oprf_output ‖ H(stable_id), info="pramaana-v1", L=64)
    (ek, dk) = ML-KEM-1024.KeyGen_internal(d = seed[0..32], z = seed[32..64])
    m        = SHA3-512(seed)[0..32]
    (ct, K)  = ML-KEM-1024.Encaps_internal(ek, m)
    C_commit = ek ‖ ct              (1568 + 1568 = 3136 bytes)
    Φ        = SHA3-512(C_commit)   // master identity (64 bytes)
    sk_IdR   = dk                   (3168 bytes)
    ```
11. **Dedup** — T computes `dedup_tag = SHA3-256("pramaana-dedup-v1" ‖ Φ)` and queries R.
    Seen → return existing identity (Sybil block; do NOT mint a second). New → continue.
12. **Gate Z** — T produces a ZK proof that C_commit came from reviewed code on approved
    hardware. R verifies and only then records the Φ commitment.
13. **Erase** — T wipes PII, live face, and QR bytes. Returns `(Φ, sk_IdR)` to C over
    the attested channel. sk_IdR is recomputable later by re-scan + re-derive; it is
    NEVER stored by T.

## §3 Post-enrollment (per-service unlinkable identity)

For each service s, the user derives a Semaphore identity from `(Φ, sk_IdR)`:
```
secret = SHA3-256("pramaana-semaphore-identity-v1" ‖ u16_le(64) ‖ Φ ‖ u16_le(3168) ‖ sk_IdR)
scope  = keccak256(utf8(serviceId)) >> 8    // BN254-safe
```
and produces a Groth16 membership proof with `nullifier = H(secret, scope)`.
Cross-service correlation is impossible without the user's secret. Reusing the same
service twice is detectable (same nullifier) → one identity per service.

## §4 Key derivation discipline

- OPRF input MUST be the stable, timestamp-stripped identifier (recovery-by-rescan works).
- The 17 timestamp bytes in the QR reference region are zeroed before hashing so re-scans
  are deterministic (same technique as Anon Aadhaar / Nova Aadhaar).
- Do NOT use the photo bytes as the seed (photo can change; it's for liveness only).
- Domain-separate every hash (distinct info/label strings).
- Zeroize all PII-derived intermediates after Φ and sk_IdR exist.
- The dedup tag is derived THROUGH Φ (and therefore through k), never from QR fields.
- Identity secret, scope mapping, and PALC golden vector are IDENTITY-CRITICAL:
  changing any one orphans enrolled identities. Investigate; never re-pin casually.

## §5 System components

### Rust crates (`crates/`)

| Crate | Responsibility | Status |
|---|---|---|
| `aadhaar-qr` | Parse Secure QR, verify UIDAI signature, extract fields/photo, stable digest | Real (validated via synthetic testgen) |
| `liveness` | Decode JP2 photo, accept live face, match | Real (sim matcher; ONNX behind feature gate) |
| `palc` | HKDF-SHA3-512 + deterministic ML-KEM-1024 + commitment + Φ + zeroize | Real (FIPS 203 via libcrux-ml-kem, golden vector pinned) |
| `voprf` | Client blind/unblind + DLEQ verify (ristretto255) | Real (RFC 9497 via facebook/voprf 0.5.0) |
| `attestation` | TDX quote gen (configfs-tsm) + verify (dcap-rs) + simulation mode | Real sim; tdx/dstack compile-verified |
| `enrollment-tee` | Orchestrates §2 steps 1,4–13; HTTP server for SDK | Real (full pipeline, sim mode) |
| `voprf-vault` | O — holds k, attested eval (Gate b/k server side) | Real (standalone binary with HTTP) |

### Smart contracts (`contracts/`)

| Contract | Responsibility |
|---|---|
| `Registry.sol` | Φ-novelty + dedup-tag Sybil block + Gate Z verification |
| `NullifierRegistry.sol` | Per-service nullifier spending (double-use ledger) |
| `GateZVerifier.sol` | Sim Gate Z proof verifier (swappable via interface) |
| `IGateZVerifier.sol` | Interface seam for production DCAP-in-ZK verifier |

### TypeScript packages

| Package | Responsibility | Status |
|---|---|---|
| `@pramaana/semaphore` | Per-service unlinkable nullifiers (Groth16/BN254) | Real (Semaphore v4, 13 tests) |
| `@pramaana/sdk` | Drop-in SDK: `enroll()` / `prove()` / `verifyOnChain()` / `claim()` | Real (11 e2e tests) |
| `@pramaana/app` | Headless + interactive Sybil-resistant airdrop demo | Real (3 e2e tests, `make demo`) |
| `@pramaana/web` | Polished React frontend (14 pages, Shadcn/UI, Tailwind, Framer Motion) | Real (builds, proxies to V3 backend) |
| `circuits` | Gate Z circom stub | Stub |

### Frontend (`web/`)

The web frontend is V2's React application, rewired to call the V3 backend:

- 14 pages: Index, Dashboard, Enroll, Verify, WalletConnect, Attestation, Benchmarks,
  OnChain, Migrate, RegisterService, Agent, Authenticate, About, NotFound
- Supabase Edge Functions replaced by a compatibility shim (`web/src/integrations/supabase/client.ts`)
  that routes `supabase.functions.invoke()` calls to V3's app server REST API
- Clean SDK HTTP client at `web/src/lib/pramaana-client.ts`
- Dev server at `:5173` proxies `/api` to V3 backend at `:8080`

## §6 Simulation flags

Attestation runs in **SIM mode** by default (deterministic mock quotes). Real path behind
cargo feature `tdx` or `dstack`. GateZVerifier has a sim mode that checks mock attestation.
Three interchangeable backends share the same gate logic:

| Backend | Feature | Use case |
|---|---|---|
| `sim` | default | Laptop development, CI |
| `tdx` | `--features tdx` | Bare Intel TDX host |
| `dstack` | `--features dstack` | Phala Cloud CVM |

## §7 Build & run

```bash
# Prerequisites: Rust 1.96+, Node 20+, pnpm 11.6+, Foundry 1.7+
make setup              # verify toolchains
make build              # cargo build + forge build + pnpm install

make test               # all tests (Rust + Solidity + TS)
make demo               # headless asserting e2e

make web-dev            # React frontend → http://localhost:5173
pnpm --filter @pramaana/app demo   # interactive demo → http://127.0.0.1:8080
```
