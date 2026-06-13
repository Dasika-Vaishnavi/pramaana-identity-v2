# Pramaana — Agent Context (read this first, every session)

Pramaana is a post-quantum, self-sovereign identity protocol. It provides
anonymous-but-verified identity via a drop-in SDK, with structural unlinkability
across services enforced by cryptography, not policy. Beachhead: Sybil resistance for
crypto-native use cases (airdrops, quadratic funding, DAO governance).

## §1 Architecture recap

A user proves real-world uniqueness ONCE, inside a trusted enclave, using a
government-signed credential (here: the Aadhaar Secure QR, UIDAI-signed; ePassport
NFC is a later adapter). The enclave derives a master identity Φ from that credential
through an issuer-unknown secret (a VOPRF), wraps it in a post-quantum lattice
commitment (Kyber-1024), registers Φ's commitment on-chain, and ERASES all PII.
Afterwards the user derives a DIFFERENT unlinkable pseudonym (nullifier) for every
service via Semaphore. No party except the user can correlate identities across
services — structurally impossible, unlike OAuth/SSO.

### Participants

- **C** = Client (phone/browser)
- **T** = Enrollment TEE (attested confidential VM, Intel TDX)
- **O** = VOPRF Vault holding key k, in its own TDX CVM
- **R** = Registry (on-chain, EVM)

### Enrollment sequence (§2)

1. **Gate 0** — C asks T to start. T returns an RA-TLS quote proving genuine enclave +
   reviewed code, with report_data = H(nonce ‖ ephemeral_TLS_pubkey). C verifies the
   appraisal policy; if it fails, C stops and sends NOTHING.
2. C scans the Aadhaar Secure QR and extracts (signed_data, UIDAI_signature).
3. C records a live face capture + device check (liveness).
4. C sends QR signed_data + signature + liveness artifacts to T over the RA-TLS channel.
5. T verifies the UIDAI RSA-2048/SHA-256 signature over signed_data against the
   UIDAI public certificate; extracts demographic fields + the JPEG2000 photo; and matches
   the live face to the QR photo INSIDE the enclave.
6. T computes a STABLE identifier from timestamp-stripped reference fields
   (last-4 ‖ name ‖ DOB ‖ gender ‖ pincode), then BLINDS it so the vault can't read it.
7. **Gate b** — T presents a quote to O with report_data bound to the blinded input.
   O verifies T's quote.
8. O evaluates the VOPRF with sealed key k and returns the evaluation + a DLEQ proof.
9. **Gate k** — T verifies O's proof that k lives in a genuine sealed TDX CVM, then unblinds.
10. **PALC** — T derives:
    ```
    seed = HKDF-SHA3-512(salt=0^512, IKM = oprf_output ‖ H(stable_id), info="pramaana-v1", L=64)
    (pk_IdR, sk_IdR) = Kyber1024.KeyGen(seed)
    C_commit = pk_IdR ‖ Kyber1024.Enc(pk_IdR, H(seed))
    Φ = H(C_commit)              // master identity
    ```
11. **Dedup** — T computes a per-person dedup tag `SHA3-256("pramaana-dedup-v1" ‖ Φ)`
    and queries R. seen → return existing identity (Sybil block). new → continue.
12. **Gate Z** — T produces a ZK proof that C_commit came from reviewed code on approved
    hardware. R verifies and only then records the Φ commitment.
13. **Erase** — T wipes PII, live face, and QR bytes. Returns (Φ, sk_IdR) to C.
    sk_IdR is recomputable later by re-scan + re-derive; it is NEVER stored by T.

### Post-enrollment (§3)

For each service s, the user derives a Semaphore identity from (Φ, sk_IdR) and proves
membership with external nullifier = serviceId. `nullifier_s = H(secret, serviceId)`.
Cross-service correlation is impossible without the user's secret. Reusing the same
service twice is detectable (same nullifier) → one identity per service.

## §2 V3-crypto-spine non-negotiables

These are the load-bearing cryptographic components. Whatever integrations or UI
layers are added, they must NOT weaken any of the following:

1. **PALC** (HKDF-SHA3-512 → deterministic ML-KEM-1024 → commitment → Φ).
   FIPS 203 KeyGen_internal/Encaps_internal via libcrux-ml-kem. Golden vector pins Φ —
   if it changes after a dep bump, enrolled identities break. Investigate; never re-pin.

2. **Attestation-gated VOPRF** (issuer-unknown k — the ONLY thing preventing issuer
   de-anonymization). RFC 9497 VOPRF mode, ristretto255-SHA512, via facebook/voprf 0.5.0.
   The VOPRF key k is the sole structural blocker against UIDAI re-computing Φ from
   their database. Never make the seed a plain hash of QR fields.

3. **Enrollment TEE gates 0/b/k/Z**. Three attestation backends (sim/tdx/dstack), same
   gate logic. C verifies T's quote BEFORE sending PII (Gate 0). O verifies T's quote
   BEFORE evaluating (Gate b). T verifies O's key custody proof (Gate k). R verifies
   the ZK proof of honest enrollment (Gate Z).

4. **Semaphore per-service nullifiers**. Real Groth16/BN254 proofs via
   @semaphore-protocol/core v4. Identity secret =
   `SHA3-256("pramaana-semaphore-identity-v1" ‖ Φ ‖ sk_IdR)`. Scope =
   `keccak256(utf8(serviceId)) >> 8`. Changing either formula orphans all identities.

5. **Transient compute + cryptographic erasure**. Only the OPRF key k is a durable
   TEE-held secret. PII is touched once, never stored, non-recoverable from the
   commitment. sk_IdR exists only in memory during enrollment, then returned to C.
   T persists nothing.

## §3 Privacy invariants

- PII is consumed once as cryptographic entropy, then permanently erased.
- The VOPRF with issuer-unknown key k is the sole structural blocker against
  credential-issuer de-anonymization. Any nullifier that is a deterministic function
  of QR data + public salt is trivially issuer-de-anonymizable.
- Per-service nullifiers share no user-derivable value across services.
- The on-chain dedup tag is derived THROUGH Φ (and therefore through k), never from
  QR fields directly.
- Post-quantum claim is scoped to the IdR/registry-at-rest layer (PALC's Kyber-1024).
  RSA verify + Groth16 are classical. Do not claim end-to-end PQ.

## §4 Read next

- `docs/ARCHITECTURE.md` — canonical spec (§1–§6 from V3)
- `docs/UNIFICATION.md` — V2 vs V3 capability diff and reconciliation decisions
- `docs/BOUNTIES.md` — ETHGlobal NY bounty integration plan
- `docs/THREAT_MODEL.md` — bearer credential, issuer de-anon, TDX scope
- `docs/DECISIONS.md` — architecture decision log

## §5 Build & run (after merge)

```bash
# Prerequisites: Rust 1.96+, Node 20+, pnpm 11.6+, Foundry 1.7+
make setup          # verify toolchains
make build          # cargo build + forge build + pnpm install
make demo           # headless asserting e2e (anvil + vault + tee-server)

# Interactive demo
pnpm --filter @pramaana/app demo    # → http://127.0.0.1:8080

# Web frontend (after merge)
pnpm --filter @pramaana/web dev     # → http://localhost:5173
```

## §6 Origins

This repo is a unification of two predecessor repos:
- **V2** (`Dasika-Vaishnavi/pramaana-identity-v2`): Rich React frontend, 14 pages,
  Supabase backend, MetaMask integration, wallet security scanner, AI agent.
  Crypto primitives were simulated in Edge Functions.
- **V3** (`yayati-codes/Pramaana-v2`): Full cryptographic protocol implementation.
  7 Rust crates, real PALC/VOPRF/TEE/Semaphore, 4 Solidity contracts, drop-in SDK.
  Minimal UI.

V3's crypto spine is canonical. V2's UI/UX is the presentation layer.
See `docs/UNIFICATION.md` for the complete reconciliation.
