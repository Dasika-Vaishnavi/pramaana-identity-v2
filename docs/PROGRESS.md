# Progress — Unified Pramaana

Component checklist for the unified repo. Merged from V3's crypto spine +
V2's React frontend (see `docs/UNIFICATION.md` for reconciliation details).

## Component Status

| # | Component | Origin | Status | Tests | Notes |
|---|---|---|---|---|---|
| 1 | `aadhaar-qr` | V3 | ✅ Real | 6 Rust | Parse, verify UIDAI sig, extract, stable digest. Real UIDAI cert validation pending. |
| 2 | `liveness` | V3 | ✅ Real | 5 Rust | JP2 decode (openjp2), sim matcher. ONNX feature-gated. |
| 3 | `palc` | V3 | ✅ Real | 5 Rust | FIPS 203 ML-KEM-1024 via libcrux-ml-kem. Golden vector pinned. |
| 4 | `voprf` | V3 | ✅ Real | 4 Rust | RFC 9497, ristretto255-SHA512, DLEQ. |
| 5 | `attestation` | V3 | ✅ Real (sim) | 5 Rust | 3 backends: sim/tdx/dstack. tdx/dstack compile-verified. |
| 6 | `enrollment-tee` | V3 | ✅ Real | 5 Rust | Full §2 pipeline over vault HTTP. |
| 7 | `voprf-vault` | V3 | ✅ Real | 5 Rust | Standalone binary, holds k. |
| 8 | `Registry.sol` | V3 | ✅ Real | 7 Forge (2 fuzz) | Φ-novelty + dedup + Gate Z. |
| 9 | `NullifierRegistry.sol` | V3 | ✅ Real | 3 Forge | On-chain double-use ledger. |
| 10 | `GateZVerifier.sol` | V3 | ✅ Sim | 4 Forge | Sim proof = keccak256("pramaana-sim-attestation", Φ). |
| 11 | `@pramaana/semaphore` | V3 | ✅ Real | 13 vitest | Groth16/BN254, Semaphore v4. Unlinkability tested. |
| 12 | `@pramaana/sdk` | V3 | ✅ Real | 11 vitest | enroll/prove/verifyOnChain/claim. Gate 0 client-side. |
| 13 | `@pramaana/app` | V3 | ✅ Real | 3 vitest | Sybil-resistant airdrop demo (headless + interactive). |
| 14 | `@pramaana/web` | V2→unified | ✅ Real | 1 vitest | 14 React pages, Shadcn/UI, Tailwind, Framer Motion. Rewired to V3. |
| 15 | `circuits` | V3 | ❌ Stub | 0 | Gate Z (DCAP-in-ZK) — post-hackathon. |

## Test Summary

| Suite | Count | Status |
|---|---|---|
| Rust (`cargo test`) | 35 | ✅ All passed |
| Solidity (`forge test`) | 14 (incl. 2 fuzz) | ✅ All passed |
| Semaphore (vitest) | 13 | ✅ All passed |
| SDK e2e (vitest) | 11 | ✅ All passed |
| App e2e (vitest) | 3 | ✅ All passed |
| Web (vitest) | 1 | ✅ All passed |
| **Total** | **77** | ✅ **All passed** |

## E2E Pipeline (`make demo`)

✅ GREEN — full enrollment pipeline in sim mode:
- Gate 0 verified client-side before PII sent
- UIDAI signature verified, face matched
- VOPRF blind → eval → unblind with DLEQ
- PALC: HKDF → ML-KEM-1024 → Φ
- Dedup blocks second mint (Sybil block @ enrollment)
- Semaphore proof generated, nullifier spent on-chain
- Second claim for same service REVERTS (Sybil block @ service)
- Different service → different nullifier, no shared value (unlinkability)

## Open Items

- [ ] `circuits` — Gate Z DCAP-in-ZK circuit
- [ ] Registry.sol on-chain Φ registration wired into SDK enroll path
- [ ] Φ64→bytes32 mapping pinned at SDK/contracts boundary
- [ ] RA-TLS termination for production TEE deployment
- [ ] Real UIDAI certificate fixture for aadhaar-qr validation
- [ ] ONNX face matcher model provisioning
- [ ] ETHGlobal bounty integrations (see `docs/BOUNTIES.md`)
- [ ] V2 frontend pages fully wired to V3 backend (Supabase shim → direct SDK calls)
