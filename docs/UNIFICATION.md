# Unification: V2 vs V3 Capability Diff

This document is the reconciliation bible. For each component, it compares V2
(`Dasika-Vaishnavi/pramaana-identity-v2` @ `583df8e`) and V3
(`yayati-codes/Pramaana-v2` @ `d211b57`), marks the stronger implementation,
and records the carry-forward decision.

**Rule**: V3's cryptographic core is canonical UNLESS V2 demonstrably has a
stronger, safer implementation of the same primitive. Any such case is flagged
with ⚠️ DECISION REQUIRED.

---

## 1. PALC / Kyber Commitment

| Aspect | V2 | V3 |
|---|---|---|
| **Location** | Supabase Edge Function `palc-enroll` (Deno/TS) | Rust crate `crates/palc` (1 crate, ~400 LoC) |
| **KEM implementation** | Simulated — returns plausible sizes/hashes; uses `@noble/hashes` for SHA3 only | Real FIPS 203 ML-KEM-1024 via `libcrux-ml-kem`; explicit `KeyGen_internal` / `Encaps_internal` |
| **Key derivation** | `SHA3-512 → HKDF → "Kyber keygen"` (simulated) | `HKDF-SHA3-512(salt=0^512, IKM=oprf_output ‖ h_stable, info="pramaana-v1", L=64)` → real ML-KEM-1024 |
| **Golden vector** | ❌ None | ✅ Pinned Φ — test fails if derivation changes |
| **PII zeroization** | Claimed in UI text, not verified | Observer-tested wipe; every buffer zeroed before `derive` returns |
| **Timing** | Reports ms values in UI (cosmetic) | Real timing from actual crypto operations |

**Stronger**: **V3** — by a wide margin. V2 simulates the primitive; V3 implements
FIPS 203 with deterministic keygen, golden-vector pinning, and verified zeroization.

**Decision**: V3 carries forward unchanged. V2's `palc-enroll` Edge Function is dropped.

---

## 2. VOPRF (Verifiable Oblivious Pseudorandom Function)

| Aspect | V2 | V3 |
|---|---|---|
| **Implementation** | ❌ Not implemented anywhere in the codebase | Rust crate `crates/voprf` wrapping `facebook/voprf 0.5.0` |
| **Protocol** | N/A | RFC 9497 VOPRF mode, ristretto255-SHA512, DLEQ verification |
| **Vault separation** | N/A | Separate `voprf-vault` binary; key k held in its own process |
| **Issuer de-anon protection** | ❌ Seeds are plain hashes of PII — UIDAI can enumerate | ✅ OPRF key k is issuer-unknown; output is unpredictable without k |
| **Tests** | N/A | Blindness smoke test, per-user-key attack test, DLEQ verification |

**Stronger**: **V3** — V2 has no VOPRF at all. This is the most critical gap in V2:
without the VOPRF, the entire unlinkability-vs-issuer claim is broken.

**Decision**: V3 carries forward unchanged. This is non-negotiable (CLAUDE.md §2.2).

No ⚠️ flags — V2 cannot be stronger here because the component doesn't exist.

---

## 3. Aadhaar QR Handling

| Aspect | V2 | V3 |
|---|---|---|
| **Input method** | Manual form: user types Gov ID, selects DOB from calendar, picks jurisdiction dropdown | Programmatic: scan Aadhaar Secure QR (numeric payload) |
| **QR parsing** | ❌ None | Decompress (zlib/gzip/DEFLATE), extract 16 fields (0xFF-delimited), decode JP2 photo |
| **Signature verification** | ❌ None | UIDAI RSA-2048/SHA-256 signature verification against public certificate |
| **Stable digest** | Concatenates form fields with `\|` separator | SHA-256 over signed message with 17 timestamp bytes zeroed (re-scan deterministic) |
| **Photo extraction** | ❌ None | JP2 photo extracted from QR for in-enclave face matching |
| **Test generator** | N/A | Built-in `testgen` module: synthetic signed QR with real JP2 face photo |

**Stronger**: **V3** — V2 doesn't parse or verify any credential; it accepts
arbitrary text input. V3 implements the full Aadhaar Secure QR spec with
cryptographic verification.

**Decision**: V3 carries forward. V2's form-based PII collection is dropped as an
enrollment method (it was a UI convenience that bypasses all security guarantees).
The V2 UI's enrollment page will be rewired to drive V3's QR-based enrollment.

---

## 4. TEE / Attestation

| Aspect | V2 | V3 |
|---|---|---|
| **Implementation** | Referenced in README text; no code | `crates/attestation` — 3 backends: sim, tdx (configfs-tsm), dstack (Phala Cloud) |
| **Gate 0** (client verifies TEE) | ❌ | ✅ Client checks quote before sending PII |
| **Gate b** (TEE proves to vault) | ❌ | ✅ Quote with report_data bound to blinded input |
| **Gate k** (TEE verifies vault's key custody) | ❌ | ✅ DLEQ proof verified against committed vault pubkey |
| **Gate Z** (ZK proof of honest enrollment) | ❌ | Sim stub (real DCAP-in-ZK is post-hackathon) |
| **Report data binding** | N/A | SHA-512 domain-separated, length-framed, SHA-256 wrapped — uniform across all 3 backends |
| **Tests** | None | Binding-check tests, cross-language vector pin (Rust ↔ TS) |

**Stronger**: **V3** — V2 has no attestation code. V3 implements the full gate
protocol with three interchangeable backends.

**Decision**: V3 carries forward unchanged. Gate Z stub remains until the DCAP-in-ZK
circuit is built (tracked in `circuits/`).

---

## 5. Liveness / Face Match

| Aspect | V2 | V3 |
|---|---|---|
| **Implementation** | ❌ Not implemented | `crates/liveness` — JP2 decode via pure-Rust `openjp2`, sim matcher + ONNX feature gate |
| **JP2 decoding** | N/A | Real JP2 decode (box-format, like genuine Aadhaar photos) |
| **Face matching** | N/A | Sim: 8×8 block-luma fingerprint, cosine similarity. Real: ONNX (feature-gated) |
| **Anti-spoofing** | N/A | Capture nonce stub (anti-replay, not anti-spoofing) |

**Stronger**: **V3** — V2 has no liveness implementation.

**Decision**: V3 carries forward. The sim matcher is acceptable for demo; production
uses the `onnx` feature with an external model file.

---

## 6. Semaphore / ZK Proofs

| Aspect | V2 | V3 |
|---|---|---|
| **ZK proof system** | Supabase Edge Functions (`asc-prove`, `asc-verify`, `zk-membership-proof`) — server-side simulation | Real Groth16/BN254 via `@semaphore-protocol/core` v4.14.2 |
| **Identity derivation** | Unknown (Edge Function internals) | `SHA3-256("pramaana-semaphore-identity-v1" ‖ Φ ‖ sk_IdR)` — identity-critical, pinned |
| **Scope mapping** | Unknown | `keccak256(utf8(serviceId)) >> 8` (BN254-safe) |
| **Nullifier spending** | Not implemented on-chain | `NullifierRegistry.sol` — on-chain `NullifierAlreadySpent` revert |
| **Unlinkability test** | ❌ No test proves two services can't correlate | ✅ `unlinkability.test.ts` + assertions in 4 separate test suites |
| **Groth16 artifacts** | N/A | Downloaded on first proof, cached; MERKLE_DEPTH=10 |

**Stronger**: **V3** — V2's "ZK proofs" are serverless function calls that simulate
the concept. V3 generates and verifies real Groth16 proofs with tested unlinkability.

**Decision**: V3 carries forward. V2's `asc-prove`, `asc-verify`, `zk-membership-proof`,
and `verify-zk-proof` Edge Functions are all dropped.

---

## 7. Smart Contracts

| Aspect | V2 | V3 |
|---|---|---|
| **Contracts** | 1 Identity Registry (deployed on Sepolia) | 4: `Registry.sol`, `NullifierRegistry.sol`, `GateZVerifier.sol`, `IGateZVerifier.sol` |
| **Network** | Ethereum Sepolia (live testnet) | Local anvil (Foundry devnet) |
| **Dedup logic** | Φ-hash collision check only | Φ-novelty + dedup-tag check + Gate Z proof verification (cheapest-first) |
| **Verifier seam** | None | `IGateZVerifier` interface — swap sim for real DCAP-in-ZK without touching Registry |
| **Nullifier registry** | Not implemented | `NullifierRegistry.sol` with `NullifierAlreadySpent` custom error |
| **Test suite** | Tested via Edge Function calls | 14 Forge tests (incl. event assertions) + 2 fuzz properties, forge-std-free |
| **Tooling** | ethers.js in Supabase | Foundry (forge build/test), no git submodules |

**Stronger**: **V3** — more contracts, more comprehensive logic, far better test coverage,
replaceable verifier seam. V2's live Sepolia deployment is a nice demo artifact but
architecturally inferior.

**Decision**: V3 contracts carry forward. V2's `register-on-chain` Edge Function is dropped.
V2's Sepolia deployment address may be referenced in docs as historical context.

---

## 8. SDK

| Aspect | V2 | V3 |
|---|---|---|
| **Exists** | ❌ No SDK — frontend calls Supabase Edge Functions directly | ✅ `@pramaana/sdk`: `class Pramaana` |
| **API surface** | 15 independent Edge Function endpoints | 4 methods: `enroll()`, `prove(serviceId)`, `verifyOnChain(proof)`, `claim(proof)` |
| **Transport** | HTTPS to Supabase (shared infra) | HTTP to TEE-server (attested channel in production) |
| **Client-side Gate 0** | ❌ | ✅ TS sim-quote verifier, cross-language vector pinned |
| **State** | Stateless (each call independent) | Stateful: holds (Φ, sk_IdR) in memory after enrollment |
| **Tests** | None | 11 e2e vitest tests (spawns tee-server + anvil) |

**Stronger**: **V3** — V2 has no SDK abstraction. V3's SDK is the drop-in integration
point that makes the protocol usable.

**Decision**: V3 carries forward. The V2 React frontend will be rewired to call
the V3 SDK (via the `app/` server's JSON API).

---

## 9. Frontend / UX

| Aspect | V2 | V3 |
|---|---|---|
| **Framework** | React 18 + Vite + TailwindCSS + Shadcn/UI + Framer Motion | Vanilla HTML/JS, no framework |
| **Pages** | 14: Index, Dashboard, Enroll, Verify, WalletConnect, Agent, Attestation, Benchmarks, OnChain, Migrate, RegisterService, About, NotFound | 1: `index.html` (110 lines) |
| **MetaMask** | ✅ Full: connect, analyze, quantum risk, Sybil scoring | ❌ None |
| **Wallet scanner** | ✅ Transaction analyzer, contract scanner, Sybil exposure | ❌ None |
| **AI agent** | ✅ Claude-powered natural language identity management | ❌ None |
| **Multichain** | ✅ Identity mirroring concept (Ethereum/Arbitrum/Base) | ❌ Single chain |
| **BIP-360** | ✅ Bitcoin PQ migration planning UI | ❌ None |
| **Visual polish** | Dark theme, glassmorphism, animated steppers, skeleton loaders, toasts | Basic dark theme, CSS variables only |
| **Responsive** | ✅ Mobile-responsive with breakpoints | ✅ Minimal but responsive |
| **LoC** | 13,787 (TSX) | 110 (HTML) + 67 (JS) |

**Stronger**: **V2** — overwhelmingly. V2's frontend is a polished, feature-rich
web application. V3's UI is a minimal functional demo.

**Decision**: V2's React frontend carries forward as a new `web/` workspace package
in the merged repo. It will be rewired to call V3's backend (SDK + TEE-server)
instead of Supabase Edge Functions. Pages that depended on simulated crypto
(Enroll, Verify) will be adapted to drive the real V3 enrollment flow.

**What carries from V2 UI:**
- All 14 page components (rewired)
- Shadcn/UI component library
- TailwindCSS config + dark theme
- Framer Motion animations
- MetaMask integration
- Layout, Navbar, Footer

**What is dropped from V2 UI (replaced by V3 equivalents):**
- Supabase client calls → V3 SDK client
- Simulated PALC enrollment UI steps → real TEE enrollment flow
- Simulated ZK proof UI → real Groth16 proof display

---

## 10. Demo / E2E

| Aspect | V2 | V3 |
|---|---|---|
| **How to run** | Lovable-hosted preview (external service) | `make demo` from clean checkout — single command |
| **What it proves** | UI walkthrough of simulated enrollment | Asserts: Sybil block at BOTH layers (enrollment dedup + nullifier double-spend) + cross-service unlinkability |
| **Backend orchestration** | Requires Supabase project + env vars | Orchestrates anvil + voprf-vault + tee-server automatically |
| **Asserting** | ❌ No assertions | ✅ Exits non-zero on failure |
| **Interactive version** | Lovable preview | `pnpm --filter @pramaana/app demo` → browser at :8080 |
| **E2E tests** | Playwright fixture (unclear) | 3 app e2e tests + 11 SDK e2e tests |

**Stronger**: **V3** — V3's demo is self-contained, asserting, and reproducible
from a clean checkout. V2's demo depends on an external hosted service.

**Decision**: V3's demo infrastructure carries forward unchanged. The merged repo's
`web/` frontend will be an additional interactive surface, not a replacement for
the headless asserting demo.

---

## Summary Verdicts

| # | Component | Stronger | Confidence |
|---|---|---|---|
| 1 | PALC / Kyber | **V3** | Definitive — real vs simulated |
| 2 | VOPRF | **V3** | Definitive — exists vs absent |
| 3 | Aadhaar QR | **V3** | Definitive — parsed vs manual input |
| 4 | TEE / Attestation | **V3** | Definitive — implemented vs absent |
| 5 | Liveness | **V3** | Definitive — implemented vs absent |
| 6 | Semaphore / ZK | **V3** | Definitive — real Groth16 vs simulated |
| 7 | Smart Contracts | **V3** | Definitive — 4 contracts + 14 tests vs 1 contract + 0 tests |
| 8 | SDK | **V3** | Definitive — exists vs absent |
| 9 | Frontend / UX | **V2** | Definitive — 14 polished pages vs 1 minimal page |
| 10 | Demo / E2E | **V3** | Definitive — asserting + reproducible vs hosted preview |

**⚠️ DECISION REQUIRED flags: NONE.**

No component in V2 has a stronger, safer implementation of a cryptographic primitive
than V3. The only component where V2 is stronger is the frontend/UX layer, which
is a presentation concern, not a security-critical primitive.

---

## Merge Strategy (for reference — not executed in this prompt)

```
V3 repo (canonical spine)
  └── + web/        ← V2's React frontend, rewired to V3 SDK
  └── + bounties/   ← ETHGlobal NY integrations (see docs/BOUNTIES.md)
```

The merged repo preserves V3's directory structure unchanged. V2's contribution
is isolated to a new `web/` workspace package. No V2 code touches `crates/`,
`contracts/`, `sdk/`, `semaphore/`, or `app/`.
