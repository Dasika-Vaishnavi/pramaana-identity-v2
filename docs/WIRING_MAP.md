# Frontend ⇄ Backend Wiring Map — `@pramaana/web`

> Per-page audit of every backend call the React frontend makes, the V3 endpoint
> that *should* serve it, and whether that endpoint exists today. This is a
> **descriptive snapshot** of the current (broken) wiring, not a design — see the
> "Concrete bugs" section at the end for the load-bearing defects.
>
> Companion to [ARCHITECTURE.md](docs/ARCHITECTURE.md) §5 (frontend) and
> [PROGRESS.md](docs/PROGRESS.md) component #14.

## Status legend

| Status | Meaning |
|---|---|
| **REAL** | A V3 REST endpoint exists and runs the real crypto for this call (may still have a shape/semantics mismatch — flagged in Notes). |
| **NEEDS-ENDPOINT** | The underlying V3 crypto exists (PALC / VOPRF / Semaphore / Registry / NullifierRegistry), but **no REST endpoint** serves this call yet. |
| **NO-CRYPTO-BASIS** | A V2-only feature with **no V3 equivalent**: wallet/tx scanner, multichain registration, BIP-360 migration, Claude agent, ASC U2SSO Schnorr login. |

## The V3 backend surface (what actually exists)

The entire backend the web app can reach is the demo server in
[app/src/server.ts](app/src/server.ts). It exposes exactly five routes:

| Route | Method | Handler | Returns |
|---|---|---|---|
| `/api/enroll` | POST | `handleEnroll` — **ignores the request body**, pulls its own synthetic fixture via `pramaana.fixture()`, runs the full §2 enroll | `{ phi, phiShort, alreadyEnrolled }` |
| `/api/claim` | POST | `handleClaim` — **requires** `{ service, worldIdProof }`; World ID gate → Semaphore prove → on-chain spend | `{ status: "claimed"\|"blocked", nullifier, scope, worldIdMode }` |
| `/api/worldid/challenge` | GET | `handleChallenge(?service=)` | World ID challenge |
| `/api/state` | GET | `state()` — current single session only | `{ services, worldId, enrollment, claims }` |
| `/api/reset` | POST | re-enroll a fresh "human" | `{ ok: true }` |

There is **no** `/api/fixture`, no Φ-lookup, no registry-stats, no event-feed, no
Semaphore-prove (standalone), no verify, and no realtime channel. Everything the V2
pages assumed Supabase + Postgres provided (tables, counts, subscriptions) is absent.

## The call-routing layers (there are three, and they disagree)

1. **Supabase compat shim** — [web/src/integrations/supabase/client.ts](web/src/integrations/supabase/client.ts).
   Provides `supabase.functions.invoke()` (POSTs to a `ROUTE_MAP` of V3 routes),
   `supabase.channel()` (no-op), `supabase.removeChannel()` (no-op). **Does not
   provide `supabase.from()`.** Used by 11 pages.
2. **`PramaanaClient`** — [web/src/lib/pramaana-client.ts](web/src/lib/pramaana-client.ts).
   A clean, typed HTTP client for the V3 API. **Imported by zero pages** — entirely
   dead. (Its `fixture()` even calls `GET /api/fixture`, which the server doesn't expose.)
3. **WalletConnect's private `invokeFn`** — [web/src/pages/WalletConnect.tsx:91](web/src/pages/WalletConnect.tsx#L91).
   Raw `fetch()` straight to `VITE_SUPABASE_URL/functions/v1/<fn>` — **bypasses the
   shim entirely** and points at legacy Supabase (env var unset in this repo).

---

## Per-page wiring

### [Index.tsx](web/src/pages/Index.tsx) — landing page · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `supabase.from("commitments").select(count)` [:147](web/src/pages/Index.tsx#L147) | total registered-identity count | registry-stats endpoint over `Registry.sol` | **NEEDS-ENDPOINT** |
| `supabase.from("commitments")…not("tx_hash",null)` [:148](web/src/pages/Index.tsx#L148) | on-chain-confirmed count | registry-stats endpoint | **NEEDS-ENDPOINT** |
| `supabase.channel("landing-live")` [:157](web/src/pages/Index.tsx#L157) | live identity counter (realtime INSERT) | poll `/api/state` or a registry event stream | **NEEDS-ENDPOINT** |

### [Enroll.tsx](web/src/pages/Enroll.tsx) — enrollment wizard · uses shim

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `invoke("palc-enroll", { pii_input })` [:136](web/src/pages/Enroll.tsx#L136) | `EnrollmentResult` w/ `phi_hash`, timing, `set_id` | `POST /api/enroll` | **REAL** — but `/api/enroll` **ignores `pii_input`** (uses synthetic fixture) and returns `{ phi }` not `{ phi_hash }` (shape mismatch) |
| `invoke("register-on-chain", { phi_hash, private_key_env })` [:198](web/src/pages/Enroll.tsx#L198) | `OnChainResult` w/ `tx_hash`, `block_number`, `set_id`, `set_index`, `explorer_url` | `Registry.sol` Φ-registration endpoint | **NEEDS-ENDPOINT** — shim maps this to `/api/enroll`, which returns none of those fields (PROGRESS open item: Registry wired into enroll path) |

### [Verify.tsx](web/src/pages/Verify.tsx) — check / dashboard / Sybil / ASC-auth demos · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `from("commitments").select(created_at).eq(phi_hash)` [:54](web/src/pages/Verify.tsx#L54) | Φ-registration lookup | Φ-membership query over `Registry.sol` | **NEEDS-ENDPOINT** |
| `from("commitments")` count [:140](web/src/pages/Verify.tsx#L140) | total identities | registry-stats endpoint | **NEEDS-ENDPOINT** |
| `from("enrollment_logs")` [:144](web/src/pages/Verify.tsx#L144) | recent enrollment timings | enrollment-log endpoint | **NEEDS-ENDPOINT** |
| `channel("enrollment-updates")` [:166](web/src/pages/Verify.tsx#L166) | realtime new-enrollment feed | registry event stream | **NEEDS-ENDPOINT** |
| `invoke("palc-enroll", { pii_input })` (SybilDemo) [:278](web/src/pages/Verify.tsx#L278) | a **Sybil rejection** (error contains "Sybil") on re-enroll | `POST /api/enroll` (dedup) | **REAL** — but dedup is signaled by `alreadyEnrolled:true`, not an error string; page never detects it |
| `from("commitments").select(phi_hash).eq(set_id,1)` (ASCAuthDemo) [:410](web/src/pages/Verify.tsx#L410) | a real Φ to register a pseudonym for | Φ-list endpoint | **NEEDS-ENDPOINT** |
| `invoke("asc-prove", { master_secret_key, phi_hash, set_id, sp_identifier, random_material_r })` [:438](web/src/pages/Verify.tsx#L438) | `{ pseudonym, nullifier, set_id }` | Semaphore prove endpoint (derive per-service nullifier) | **NEEDS-ENDPOINT** — shim maps to `/api/claim`, which spends on-chain + requires `worldIdProof` (different semantics) |
| `invoke("authenticate", { action:"challenge", … })` [:471](web/src/pages/Verify.tsx#L471) | a login challenge | — | **NO-CRYPTO-BASIS** — ASC U2SSO Schnorr challenge/response; V3 has no login endpoint (personhood = Semaphore nullifier-spend) |
| `invoke("demo-sign-challenge", { master_secret_key, random_material_r, … })` [:507](web/src/pages/Verify.tsx#L507) | server-side Schnorr signature | — | **NO-CRYPTO-BASIS** — explicit demo signing crutch |
| `invoke("authenticate", { action:"verify", signature })` [:525](web/src/pages/Verify.tsx#L525) | `{ authenticated, message }` | — | **NO-CRYPTO-BASIS** — see above |

### [Dashboard.tsx](web/src/pages/Dashboard.tsx) — registry/SP/security/multichain/agent dashboard · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `from("enrollment_logs")` [:188](web/src/pages/Dashboard.tsx#L188) | recent enrollment events | enrollment-log / event-feed endpoint | **NEEDS-ENDPOINT** |
| `from("nullifier_registry")` [:193](web/src/pages/Dashboard.tsx#L193) | recent pseudonym/SP events | `NullifierRegistry.sol` event-feed endpoint | **NEEDS-ENDPOINT** |
| `channel("dashboard-enrollments")` / `channel("dashboard-nullifiers")` [:231](web/src/pages/Dashboard.tsx#L231) | realtime event feed | event stream | **NEEDS-ENDPOINT** |
| `from("nullifier_registry")` per-SP stats [:324](web/src/pages/Dashboard.tsx#L324) | spend counts grouped by SP | `NullifierRegistry.sol` stats endpoint | **NEEDS-ENDPOINT** |
| `channel("dashboard-sp-stats")` [:347](web/src/pages/Dashboard.tsx#L347) | realtime SP-stats refresh | event stream | **NEEDS-ENDPOINT** |
| `from("commitments").eq(set_id,1)` (unlinkability test) [:488](web/src/pages/Dashboard.tsx#L488) | a real Φ to prove against | Φ-list endpoint | **NEEDS-ENDPOINT** |
| `invoke("asc-prove", …)` ×2 SPs (unlinkability test) [:496](web/src/pages/Dashboard.tsx#L496) | two distinct nullifiers proving unlinkability | Semaphore prove endpoint | **NEEDS-ENDPOINT** |
| `from("nullifier_registry")` / `from("anonymity_sets")` (anonymity test) [:511](web/src/pages/Dashboard.tsx#L511) | anonymity-set size + a nullifier | stats endpoint | **NEEDS-ENDPOINT** |
| `from("chain_configs")` [:660](web/src/pages/Dashboard.tsx#L660) | active chain list | — | **NO-CRYPTO-BASIS** (multichain) |
| `from("multichain_registrations")` [:666](web/src/pages/Dashboard.tsx#L666) | per-chain registration counts | — | **NO-CRYPTO-BASIS** (multichain) |
| `invoke("multichain-register", { phi_hash, commitment_size, chains })` [:692](web/src/pages/Dashboard.tsx#L692) | multichain registration result | — | **NO-CRYPTO-BASIS** (multichain) |
| `from("agent_conversations")` [:808](web/src/pages/Dashboard.tsx#L808) | recent AI-agent chats | — | **NO-CRYPTO-BASIS** (Claude agent) |

### [OnChain.tsx](web/src/pages/OnChain.tsx) — on-chain registry explorer · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `from("commitments")` count [:172](web/src/pages/OnChain.tsx#L172) | total identities | registry-stats endpoint | **NEEDS-ENDPOINT** |
| `from("commitments")…not("tx_hash",null)` [:178](web/src/pages/OnChain.tsx#L178) | recent on-chain events (`phi_hash`, `tx_hash`, `set_id`, `set_index`) | `Registry.sol` event-feed endpoint | **NEEDS-ENDPOINT** |
| `invoke("register-on-chain", { phi_hash })` [:210](web/src/pages/OnChain.tsx#L210) | `OnChainResult` (`tx_hash`, `block_number`, `set_id`, `set_index`, `explorer_url`) | `Registry.sol` Φ-registration endpoint | **NEEDS-ENDPOINT** (shim → `/api/enroll`, wrong shape) |
| `from("commitments").eq(phi_hash)` (check) [:277](web/src/pages/OnChain.tsx#L277) | per-Φ on-chain status | Φ-lookup endpoint | **NEEDS-ENDPOINT** |

### [Benchmarks.tsx](web/src/pages/Benchmarks.tsx) — PALC timing benchmarks · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `from("enrollment_logs")` [:149](web/src/pages/Benchmarks.tsx#L149) | historical PALC timings | enrollment-log endpoint | **NEEDS-ENDPOINT** |
| `invoke("palc-enroll", { pii_input })` reading `data.timing.total_ms` [:201](web/src/pages/Benchmarks.tsx#L201) | per-run PALC timing | `POST /api/enroll` | **REAL** — but `/api/enroll` returns no `timing` field; every benchmark row errors |

### [RegisterService.tsx](web/src/pages/RegisterService.tsx) — Semaphore service registration · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `from("service_providers")` [:126](web/src/pages/RegisterService.tsx#L126) | service-provider directory | service-directory endpoint (metadata only, no crypto) | **NEEDS-ENDPOINT** |
| `invoke("zk-membership-proof", { phi_hash, set_id, sp_identifier, master_secret_key })` [:194](web/src/pages/RegisterService.tsx#L194) | `ZkProofResult` (`public_inputs.merkle_root/nullifier/external_nullifier`, `proof.*`) | Semaphore (Groth16) prove endpoint | **NEEDS-ENDPOINT** — shim → `/api/claim` (spends + needs `worldIdProof`, returns no proof object) |
| `invoke("verify-zk-proof", { merkle_root, nullifier, external_nullifier, proof })` [:237](web/src/pages/RegisterService.tsx#L237) | `VerifyResult` | Semaphore verify endpoint | **NEEDS-ENDPOINT** — shim → `/api/state` (GET-only ⇒ 404) |
| `invoke("zk-membership-proof", …)` ×2 (unlinkability demo) [:295](web/src/pages/RegisterService.tsx#L295) | two unlinkable proofs | Semaphore prove endpoint | **NEEDS-ENDPOINT** |

### [Authenticate.tsx](web/src/pages/Authenticate.tsx) — ASC U2SSO login demo · uses shim (Schnorr signing done client-side)

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `invoke("authenticate", { action:"challenge", sp_identifier, pseudonym })` [:129](web/src/pages/Authenticate.tsx#L129) | a login challenge | — | **NO-CRYPTO-BASIS** — V3 has no per-SP Schnorr login; auth model is nullifier-spend |
| `invoke("authenticate", { action:"verify", challenge, signature })` [:191](web/src/pages/Authenticate.tsx#L191) | `{ authenticated, message }` | — | **NO-CRYPTO-BASIS** — shim → `/api/state` (GET-only ⇒ 404) |

### [Attestation.tsx](web/src/pages/Attestation.tsx) — enrollment attestation viewer · uses shim · **crashes on `from()`**

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `from("enrollment_logs").eq(phi_hash)` [:46](web/src/pages/Attestation.tsx#L46) | per-Φ enrollment/attestation record (`palc_total_ms`, `created_at`) | enrollment-log / attestation endpoint (`attestation` crate is real; no REST surface) | **NEEDS-ENDPOINT** |

### [Agent.tsx](web/src/pages/Agent.tsx) — Claude AI assistant · uses shim

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `invoke("pramaana-agent", { message, conversation_history, user_context })` [:143](web/src/pages/Agent.tsx#L143) | LLM reply + `tool_results[]` | — | **NO-CRYPTO-BASIS** (Claude agent) — shim → `/api/state` (GET-only ⇒ 404) |

### [WalletConnect.tsx](web/src/pages/WalletConnect.tsx) — wallet quantum-risk scanner · **bypasses the shim** (raw `fetch` to `VITE_SUPABASE_URL`, unset)

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| `fetch(.../analyze-transaction)` { tx_hash, chain_id } [:364](web/src/pages/WalletConnect.tsx#L364) | tx quantum-risk analysis | — | **NO-CRYPTO-BASIS** (tx scanner) |
| `invokeFn("analyze-contract", { contract_address, chain_id })` [:528](web/src/pages/WalletConnect.tsx#L528) | contract risk analysis | — | **NO-CRYPTO-BASIS** (contract scanner) |
| `invokeFn("sybil-check", { wallet_address, context })` [:666](web/src/pages/WalletConnect.tsx#L666) | wallet Sybil score | — | **NO-CRYPTO-BASIS** (heuristic scanner, unrelated to Pramaana Sybil block) |
| `invokeFn("analyze-wallet", { address, chain_id })` [:773](web/src/pages/WalletConnect.tsx#L773) | wallet risk + balance/tx-count | — | **NO-CRYPTO-BASIS** (wallet scanner) |

### [Migrate.tsx](web/src/pages/Migrate.tsx) — BIP-360 migration planner

| Call | Expects | Should be served by | Status |
|---|---|---|---|
| *(none — pure client-side simulation; no backend call)* | — | — | **NO-CRYPTO-BASIS** (BIP-360 migrate) |

### [About.tsx](web/src/pages/About.tsx) · [NotFound.tsx](web/src/pages/NotFound.tsx) — static

No backend calls. Pure presentation.

---

## Concrete bugs

### 1. `supabase.from()` is undefined → pages crash

The shim ([client.ts](web/src/integrations/supabase/client.ts)) exposes only
`functions`, `channel`, and `removeChannel`. It has **no `from()`**. Every
`supabase.from(table)` therefore throws `TypeError: supabase.from is not a function`,
breaking the page's data load (or click handler) at runtime.

**7 pages, 8 tables affected:** `commitments`, `enrollment_logs`, `nullifier_registry`,
`anonymity_sets`, `chain_configs`, `multichain_registrations`, `service_providers`,
`agent_conversations` — across
[Index](web/src/pages/Index.tsx#L147),
[Verify](web/src/pages/Verify.tsx#L54),
[Dashboard](web/src/pages/Dashboard.tsx#L188),
[OnChain](web/src/pages/OnChain.tsx#L172),
[Benchmarks](web/src/pages/Benchmarks.tsx#L149),
[RegisterService](web/src/pages/RegisterService.tsx#L126),
[Attestation](web/src/pages/Attestation.tsx#L46).
All are **reads** (no `.insert/.update/.upsert/.delete` anywhere), so each needs a
GET endpoint, not a write path.

### 2. ~12 functions dumped onto `/api/state`

[ROUTE_MAP](web/src/integrations/supabase/client.ts#L23) points **11** distinct
edge-function names at `/api/state`:
`asc-verify`, `verify-zk-proof`, `authenticate`, `demo-sign-challenge`, `sybil-check`,
`analyze-wallet`, `analyze-transaction`, `analyze-contract`, `bind-wallet`,
`multichain-register`, `pramaana-agent`.

Two compounding problems:
- `/api/state` returns the **current session snapshot** — it cannot prove, verify,
  authenticate, or analyze anything. The mapping is a placeholder, not a wiring.
- The shim always issues **`POST`**, but `/api/state` is registered **GET-only**
  ([server.ts](app/src/server.ts#L188)). A POST falls through to `serveStatic` and
  **404s** — so these calls don't even reach the stub they were aimed at.

(`asc-verify` and `bind-wallet` are mapped but **never called** by any page — dead
ROUTE_MAP entries.)

### 3. Two (really three) client layers that disagree

- The **shim** ([client.ts](web/src/integrations/supabase/client.ts)) is what 11
  pages use via `supabase.functions.invoke()`.
- The clean, typed **`PramaanaClient`** ([pramaana-client.ts](web/src/lib/pramaana-client.ts))
  — the layer that actually matches the V3 API — is **imported by zero pages**. It's
  dead code, and its `fixture()` even targets a non-existent `GET /api/fixture`.
- [WalletConnect](web/src/pages/WalletConnect.tsx#L91) ignores both and raw-`fetch`es
  `VITE_SUPABASE_URL/functions/v1/<fn>` directly — pointing at **legacy Supabase**
  (the env var is unset in the unified repo).

Net effect: there is no single source of truth for "how the frontend talks to the
backend." Consolidating onto `PramaanaClient` is the obvious fix.

### 4. `/api/enroll` ignores QR + liveness

[`handleEnroll`](app/src/server.ts#L108) never reads the request body. It calls
`pramaana.fixture()` to fetch a **synthetic** Aadhaar QR + face frames and enrolls
those, no matter what the client sent. Consequences:
- [Enroll](web/src/pages/Enroll.tsx#L136) sends `{ pii_input }` (gov-id|DOB|jurisdiction|biometric)
  — **silently discarded**. Every user enrolls the same fixture identity.
- The response is `{ phi, phiShort, alreadyEnrolled }`, but the page reads
  `data.phi_hash` (and [Benchmarks](web/src/pages/Benchmarks.tsx#L201) reads
  `data.timing.total_ms`) — **shape mismatch**, both `undefined`.
- A real enroll path must accept the scanned QR + liveness frames over the body and
  drive §2 steps 2–4 from client input (matching the SDK's
  `enroll(qrNumeric, { frames })` signature).

### Secondary mismatches (same root cause as above)

- **`register-on-chain` → `/api/enroll`**: [Enroll](web/src/pages/Enroll.tsx#L198) and
  [OnChain](web/src/pages/OnChain.tsx#L210) expect `{ tx_hash, block_number, set_id,
  set_index, explorer_url }`; `/api/enroll` returns none of them. The Registry.sol
  Φ-registration path is still a [PROGRESS open item](docs/PROGRESS.md#L53).
- **`asc-prove` / `zk-membership-proof` → `/api/claim`**: pages want a *returned proof
  object / pseudonym + nullifier*; `/api/claim` instead **spends** the nullifier
  on-chain and **requires** a `worldIdProof` the pages never send (→ 403).
- **Realtime is silently dead**: `supabase.channel().on().subscribe()` is a no-op
  shim, so the live counters/feeds in
  [Index](web/src/pages/Index.tsx#L157),
  [Dashboard](web/src/pages/Dashboard.tsx#L231), and
  [Verify](web/src/pages/Verify.tsx#L166) never update.

## Summary by status

| Status | Count (call sites) | Where the work is |
|---|---|---|
| **REAL** (endpoint exists, may need shape fix) | 3 | `palc-enroll` in Enroll / Verify-SybilDemo / Benchmarks → `/api/enroll` |
| **NEEDS-ENDPOINT** (real crypto, no REST yet) | ~22 | registry stats/lookup/feed, enrollment-log, Semaphore prove/verify, service directory |
| **NO-CRYPTO-BASIS** (no V3 equivalent) | ~12 | wallet/tx/contract scanner + sybil-check, multichain (3), BIP-360 migrate, Claude agent, ASC U2SSO auth (3) |

**Bottom line:** the web app *renders*, but almost no page is actually wired to the
V3 backend. The crypto-bearing pages (Enroll, Verify, RegisterService, OnChain,
Dashboard, Benchmarks, Attestation, Index) are blocked on (a) restoring a read API
to replace `supabase.from()`, (b) adding the missing prove/verify/registry endpoints,
and (c) making `/api/enroll` consume real QR + liveness input. The NO-CRYPTO-BASIS
pages are V2 carryovers and are out of scope for the V3 spine.
