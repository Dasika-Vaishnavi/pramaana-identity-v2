# Frontend ⇄ Backend Wiring Map — `@pramaana/web`

> Per-page audit of every backend call the React frontend makes and the V3
> endpoint that serves it. This is a **descriptive snapshot of the current
> (wired) state** after the C4–C6 arc: the read API, the standalone
> prove/verify endpoints, and on-chain Φ registration all landed, and the
> crypto-bearing pages were consolidated onto a single client (`PramaanaClient`).
>
> Companion to [ARCHITECTURE.md](docs/ARCHITECTURE.md) §5 (frontend) and
> [PROGRESS.md](docs/PROGRESS.md) component #14.
>
> Last reconciled against `app/src/server.ts` + live `curl` on the running
> `:8080` backend (see "Verification" at the end).

## Status legend

| Status | Meaning |
|---|---|
| **REAL** | A V3 REST endpoint exists and runs the real crypto/contract for this call. |
| **NEEDS-ENDPOINT** | The underlying capability exists, but **no REST endpoint** serves this call yet. |
| **NO-CRYPTO-BASIS** | A V2-only feature with **no V3 equivalent**: wallet/tx scanner, multichain registration, BIP-360 migration, Claude agent, ASC U2SSO Schnorr login. Stays stubbed by design. |

## The V3 backend surface (what actually exists)

The entire backend the web app reaches is the demo server in
[app/src/server.ts](app/src/server.ts). Its route table
([server.ts:484](app/src/server.ts#L484)) is **11 routes** plus a static
fallthrough:

| Route | Method | Handler | Returns |
|---|---|---|---|
| `/api/enroll` | POST | `handleEnroll` — runs the full §2 enroll over the server's sim fixture, then **registers Φ on-chain** (`Registry.register`, Gate Z–gated) or recovers the prior registration on a dedup hit | `{ phi, phiShort, alreadyEnrolled, timing.total_ms, setId, setIndex, txHash, blockNumber, explorerUrl }` |
| `/api/claim` | POST | `handleClaim` — World ID gate → Semaphore prove → on-chain `NullifierRegistry` spend | `{ status: "claimed"\|"blocked", nullifier, scope, worldIdMode }` |
| `/api/prove` | POST | `handleProve` — standalone §3 Semaphore proof; **no World ID, no spend** | `{ proof_type:"groth16", zk_note, public_inputs:{merkle_root,nullifier,external_nullifier}, proof:{points,merkle_path:[],binding_commitment:null} }` |
| `/api/verify` | POST | `verifyProvePayload` — real **off-chain Groth16** verify over a prove() payload | `{ verified: boolean }` |
| `/api/worldid/challenge` | GET | `handleChallenge(?service=)` | World ID challenge (`mode` = `live`\|`stub`) |
| `/api/state` | GET | `state()` — current single session | `{ services, worldId:{mode,action}, enrollment, claims }` |
| `/api/registry/stats` | GET | `registryStats` — counts from `Registry.sol` | `{ total, onChainConfirmed }` |
| `/api/registry/feed` | GET | `registryFeed(?limit=)` — `Registry.sol` `Registered` events, newest first | `[{ phi, dedupTag, setIndex, txHash, blockNumber }]` |
| `/api/registry/lookup` | GET | `registryLookup(?phi=)` — is this Φ registered, and where | `{ registered, setIndex, txHash, blockNumber }` |
| `/api/enrollment-log` | GET | `enrollmentLog(?limit=)` — in-memory enroll history, newest first | `[{ phiShort, total_ms, setIndex, txHash, createdAt }]` |
| `/api/reset` | POST | re-enroll a fresh "human" (session only; the on-chain ledger persists) | `{ ok: true }` |
| *(any other)* | — | `serveStatic` | static UI assets |

> **On-chain Φ registration is real.** `handleEnroll` → `recordOnChain` calls
> `Registry.register(phi32, dedupTag, simGateZProof(phi32))`
> ([server.ts:294](app/src/server.ts#L294)) with `phi32 = keccak256(Φ64)`. The
> `registry/*` reads derive from `Registry.sol`'s own `Registered` event stream —
> i.e. `onChainConfirmed` reflects the **Φ Registry**, *not* `NullifierRegistry`
> (which is touched only by `/api/claim`'s spend). Attestation is **sim**;
> Gate Z uses the EVM-sim verifier (disclosed in ARCHITECTURE.md §6).

There is still **no** `/api/services` (service-provider directory) — see "One
real gap" below.

## The call-routing layer (now a single source of truth)

1. **`PramaanaClient`** — [web/src/lib/pramaana-client.ts](web/src/lib/pramaana-client.ts).
   The one typed HTTP client, aligned 1:1 with the routes above. Issues relative
   `/api/...` requests that Vite proxies to `:8080` ([vite.config.ts](web/vite.config.ts)).
   **7 pages import it directly** (Index, Verify, Dashboard, OnChain, Benchmarks,
   RegisterService, Attestation).
2. **Supabase compat shim** — [web/src/integrations/supabase/client.ts](web/src/integrations/supabase/client.ts).
   Now a **thin wrapper over `PramaanaClient`** (does no independent HTTP). Still
   used by Enroll (`palc-enroll`, `register-on-chain`) and the NO-CRYPTO-BASIS
   pages. Its `from()` builder and the `asc-prove`/`zk-membership-proof`/
   `verify-zk-proof` invokers are retained for compat (and unit-tested in
   [data-layer.test.ts](web/src/test/data-layer.test.ts)) but **called by zero
   pages** — those pages moved to `PramaanaClient.prove`/`.verify` directly.
   `channel()`/`removeChannel()` are safe no-ops (realtime is gone).
3. **WalletConnect's private `invokeFn`** — [WalletConnect.tsx](web/src/pages/WalletConnect.tsx).
   Raw `fetch()` to `VITE_SUPABASE_URL/functions/v1/<fn>` (env unset). Pure
   NO-CRYPTO-BASIS; left as-is.

---

## Per-page wiring

### [Index.tsx](web/src/pages/Index.tsx) — landing page · `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| `pramaana.registryStats()` [:150](web/src/pages/Index.tsx#L150) | `GET /api/registry/stats` | **REAL** — live `total` / `onChainConfirmed` from `Registry.sol` |

### [Enroll.tsx](web/src/pages/Enroll.tsx) — enrollment wizard · shim → `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| `invoke("palc-enroll", { pii_input })` | `POST /api/enroll` (via `pramaana.enroll()`) | **REAL** — drives the real §2 pipeline + on-chain Φ registration. *By design* it enrolls the server's **synthetic sim fixture**, not user-typed `pii_input` (the SIM boundary; the SDK accepts real QR, the web demo does not feed it). |
| `invoke("register-on-chain", { phi_hash })` | replayed from the enroll response | **REAL** — in V3 `register()` runs *inside* enroll, so this returns the real coords enroll already recorded (`tx_hash`, `block_number`, `set_id`, `set_index`); `explorer_url` is null on local anvil. |

### [Verify.tsx](web/src/pages/Verify.tsx) — check / Sybil / ASC-auth demos · `PramaanaClient` (+ shim for ASC)

| Call | Served by | Status |
|---|---|---|
| `pramaana.registryLookup(phi)` [:56](web/src/pages/Verify.tsx#L56) | `GET /api/registry/lookup` | **REAL** |
| `pramaana.registryStats()` [:136](web/src/pages/Verify.tsx#L136) | `GET /api/registry/stats` | **REAL** |
| `pramaana.enrollmentLog(10)` [:137](web/src/pages/Verify.tsx#L137) | `GET /api/enrollment-log` | **REAL** |
| `pramaana.enroll()` (SybilDemo) [:262](web/src/pages/Verify.tsx#L262) | `POST /api/enroll` | **REAL** — re-enroll returns `alreadyEnrolled:true`, surfaced as the Sybil block |
| `invoke("authenticate", …)` / `invoke("demo-sign-challenge", …)` (ASCAuthDemo) | — | **NO-CRYPTO-BASIS** — ASC U2SSO Schnorr; V3 auth is nullifier-spend, not login |

### [Dashboard.tsx](web/src/pages/Dashboard.tsx) — registry / SP / unlinkability dashboard · `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| `pramaana.registryStats()` [:32](web/src/pages/Dashboard.tsx#L32) | `GET /api/registry/stats` | **REAL** |
| `pramaana.registryFeed(15)` [:107](web/src/pages/Dashboard.tsx#L107) | `GET /api/registry/feed` | **REAL** — `Registry.sol` `Registered` events |
| `pramaana.enroll()` + `pramaana.prove(sp)` ×2 (unlinkability) [:248](web/src/pages/Dashboard.tsx#L248),[:271](web/src/pages/Dashboard.tsx#L271) | `POST /api/enroll`, `POST /api/prove` | **REAL** — two distinct nullifiers/scopes, no shared user-derivable value |
| multichain / agent panels (`chain_configs`, `multichain_registrations`, `agent_conversations`, `multichain-register`) | — | **NO-CRYPTO-BASIS** — empty-but-valid stubs |

### [OnChain.tsx](web/src/pages/OnChain.tsx) — on-chain registry explorer · `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| `pramaana.registryStats()` [:162](web/src/pages/OnChain.tsx#L162) | `GET /api/registry/stats` | **REAL** |
| `pramaana.registryFeed(20)` [:163](web/src/pages/OnChain.tsx#L163) | `GET /api/registry/feed` | **REAL** — `phi`, `txHash`, `setIndex`, `blockNumber` |
| `pramaana.registryLookup(hash)` [:188](web/src/pages/OnChain.tsx#L188) | `GET /api/registry/lookup` | **REAL** |

### [Benchmarks.tsx](web/src/pages/Benchmarks.tsx) — PALC timing benchmarks · `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| `pramaana.enrollmentLog(50)` [:130](web/src/pages/Benchmarks.tsx#L130) | `GET /api/enrollment-log` | **REAL** — historical enroll timings |
| `pramaana.enroll()` reading `r.timing.total_ms` [:186](web/src/pages/Benchmarks.tsx#L186) | `POST /api/enroll` | **REAL** — server-measured total wall-clock (no per-phase breakdown by design; the §2 phases run inside the TEE behind one round-trip) |

### [RegisterService.tsx](web/src/pages/RegisterService.tsx) — Semaphore service registration · `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| service-provider list (`selectedSP`) | client-side const (`airdrop-alpha`/`-beta` + free input) | **NEEDS-ENDPOINT** — no `/api/services` directory (metadata only, no crypto) |
| `pramaana.enroll()` [:216](web/src/pages/RegisterService.tsx#L216) | `POST /api/enroll` | **REAL** |
| `pramaana.prove(selectedSP)` [:218](web/src/pages/RegisterService.tsx#L218) | `POST /api/prove` | **REAL** — real Groth16 proof |
| `pramaana.verify(proof)` [:245](web/src/pages/RegisterService.tsx#L245) | `POST /api/verify` | **REAL** — real off-chain Groth16 check |
| `pramaana.prove(sp)` ×2 (unlinkability demo) [:293](web/src/pages/RegisterService.tsx#L293) | `POST /api/prove` | **REAL** |

### [Attestation.tsx](web/src/pages/Attestation.tsx) — enrollment attestation viewer · `PramaanaClient`

| Call | Served by | Status |
|---|---|---|
| `pramaana.registryLookup(phi)` [:55](web/src/pages/Attestation.tsx#L55) | `GET /api/registry/lookup` | **REAL** |
| `pramaana.enrollmentLog(50)` [:56](web/src/pages/Attestation.tsx#L56) | `GET /api/enrollment-log` | **REAL** |

### [Agent.tsx](web/src/pages/Agent.tsx) · [Authenticate.tsx](web/src/pages/Authenticate.tsx) · [WalletConnect.tsx](web/src/pages/WalletConnect.tsx) · [Migrate.tsx](web/src/pages/Migrate.tsx)

| Page | Call | Status |
|---|---|---|
| Agent | `invoke("pramaana-agent", …)` | **NO-CRYPTO-BASIS** (Claude agent) |
| Authenticate | `invoke("authenticate", …)` | **NO-CRYPTO-BASIS** (ASC U2SSO Schnorr login) |
| WalletConnect | `invokeFn("analyze-transaction"/"analyze-contract"/"analyze-wallet"/"sybil-check")` | **NO-CRYPTO-BASIS** (wallet/tx scanner) |
| Migrate | *(none — client-side simulation)* | **NO-CRYPTO-BASIS** (BIP-360 migrate) |

[About.tsx](web/src/pages/About.tsx) · [NotFound.tsx](web/src/pages/NotFound.tsx) — static, no backend calls.

---

## Resolved (C4–C6) — the old "Concrete bugs" are fixed

| Old defect | Resolution |
|---|---|
| `supabase.from()` undefined → 7 pages crash | The shim now provides `from()` (empty-but-valid), **and** the 7 crypto pages no longer call it — they read the new `registry/*` + `enrollment-log` endpoints via `PramaanaClient`. **No page calls `from()` or `channel()`.** |
| ~12 functions dumped on GET-only `/api/state` (404) | Real endpoints exist (`prove`, `verify`, `registry/*`, `enrollment-log`); the shim delegates to `PramaanaClient` and no longer misroutes. |
| Three disagreeing client layers | Consolidated onto **`PramaanaClient`** as the single source of truth; the shim is a thin wrapper; WalletConnect (raw fetch) is the lone NO-CRYPTO-BASIS exception. |
| `register-on-chain` had no endpoint / wrong shape | **REAL** — `Registry.register` runs inside `/api/enroll`; the step replays the real `tx_hash`/`block_number`/`set_id`/`set_index`. |
| `asc-prove`/`zk-membership-proof` → `/api/claim` (wrong); `verify-zk-proof` → 404 | **REAL** via `/api/prove` + `/api/verify`; the misrouted shim invokers are now dead (no page calls them). |
| `/api/enroll` returns no `timing` | **REAL** — returns server-measured `timing.total_ms` (Decision 1). |

### By-design notes (not bugs)

- **Enroll uses a synthetic sim fixture**, not user-supplied QR/liveness — `pii_input` is intentionally discarded at the web layer. The crypto is real; the *input* is the sim fixture (the SIM boundary). Feeding real scanned QR from the browser is a future unit.
- **Realtime is replaced by one-shot fetch.** The old `supabase.channel()` live feeds are gone; pages fetch counts/feeds on mount/action instead of subscribing. Counters reflect load-time truth, not a live stream.
- **World ID gate runs in stub mode** unless real creds are present (`WORLDID_APP_ID` + `RP_SIGNING_KEY`). Stub mode still *enforces the gate shape* — `/api/claim` 403s without a well-formed `proof_of_human` token, and stub tokens are never honored in live mode (anti-bypass). See [app/src/worldid.ts](app/src/worldid.ts).

## One real gap

- **`/api/services` service-provider directory** (RegisterService). The SP list
  is a client-side constant today. This is metadata only (no crypto), so it is
  the lone remaining NEEDS-ENDPOINT.

## Summary by status

| Status | Where |
|---|---|
| **REAL** | enroll (+on-chain register), register-on-chain (replayed), prove, verify, registry stats/feed/lookup, enrollment-log — across Index, Enroll, Verify, Dashboard, OnChain, Benchmarks, RegisterService, Attestation |
| **NEEDS-ENDPOINT** | `/api/services` SP directory (1) |
| **NO-CRYPTO-BASIS** | wallet/tx/contract scanner + sybil-check (WalletConnect), multichain (Dashboard), Claude agent (Agent/Dashboard), ASC U2SSO auth (Authenticate, Verify ASC demo), BIP-360 migrate (Migrate) |

**Bottom line:** every crypto-bearing page is wired to a real V3 endpoint serving
real crate/contract data, consolidated on `PramaanaClient`. The only crypto-
adjacent gap is the SP directory; the rest of the unwired surface is V2-only
NO-CRYPTO-BASIS carryover, stubbed by design.

## Verification

Reconciled against [app/src/server.ts](app/src/server.ts) and live `curl` on the
`:8080` backend: `registry/stats` (`{total:1,onChainConfirmed:1}`), a fresh
`enroll` (real `txHash`/`blockNumber`/`setIndex`), `registry/feed`/`lookup`,
`enrollment-log`, `prove`→`verify` (`{verified:true}`), a dedup re-enroll
(`alreadyEnrolled:true`, registry stays `total:1`), and `claim` without a World
ID proof (HTTP 403). Web data-layer unit tests green (11/11).
