/**
 * Supabase compatibility shim for the unified Pramaana repo.
 *
 * V2's pages were written against a Supabase client: `supabase.functions.invoke()`,
 * `supabase.from(table).select()…`, and `supabase.channel()` realtime. In the
 * unified repo there is no Supabase — the backend is V3's Rust spine fronted by
 * the demo server (app/src/server.ts).
 *
 * Rather than touch ~11 pages, this shim preserves the `supabase`-shaped surface
 * but is now a THIN WRAPPER over the single client layer (PramaanaClient). It does
 * NO independent HTTP of its own: the only network call any page triggers through
 * here is enrollment, which delegates to `pramaana.enroll()`.
 *
 * Responsibilities (all centralized here so page code stays byte-for-byte the same):
 *   1. `functions.invoke(name)` — dispatch table. Real calls delegate to
 *      PramaanaClient and the response is NORMALIZED into the shape each page reads
 *      (e.g. backend `{ phi }` → `{ phi_hash }`, synthesized `timing`). Calls with
 *      no V3 endpoint yet (NEEDS-ENDPOINT) or no V3 equivalent (NO-CRYPTO-BASIS)
 *      return an empty-but-valid stub — never throwing, never 404ing the UI.
 *   2. `from(table)` — a chainable, thenable query builder that returns empty-but-
 *      valid results so the 8 table reads across 7 pages stop throwing TypeError.
 *   3. `channel()/removeChannel()` — safe no-ops (realtime is gone; calls don't break).
 *
 * See docs/WIRING_MAP.md for the per-call mapping and status.
 *
 * Crypto-spine safety: pure routing/normalization. All crypto runs server-side in
 * Rust via PramaanaClient → V3. This shim never touches key material or PII.
 */

import { pramaana } from "@/lib/pramaana-client";

interface InvokeResult {
  data: any;
  error: null | { message: string };
}

// ML-KEM-1024 sizes are fixed (FIPS 203); see docs/ARCHITECTURE.md §2 PALC.
const ML_KEM_PK_BYTES = 1568;
const ML_KEM_CT_BYTES = 1568;
const COMMITMENT_BYTES = ML_KEM_PK_BYTES + ML_KEM_CT_BYTES; // 3136

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// functions.invoke — dispatch + response-shape normalization
// ---------------------------------------------------------------------------

/**
 * The real on-chain registration coordinates from the most recent enroll
 * (Decision 3). In V3 the on-chain `register()` runs INSIDE enroll, so the
 * separate V2 `register-on-chain` step has no backend call of its own — it
 * replays what enroll already recorded. We cache it here at enroll time.
 */
let lastOnChain: {
  tx_hash: string | null;
  block_number: number | null;
  set_id: number;
  set_index: number | null;
  explorer_url: string | null;
  commitment_size_bytes: number;
  timing: { total_ms: number };
} | null = null;

/**
 * REAL: enrollment. Delegates to PramaanaClient (POST /api/enroll) and normalizes
 * the backend's `{ phi, phiShort, alreadyEnrolled, setId, setIndex, txHash, … }`
 * into the EnrollmentResult shape pages read (`phi_hash`, `timing`, set_index, ML-KEM
 * sizes, …). A re-enroll of the same identity comes back as `alreadyEnrolled` →
 * surfaced as a Sybil error, which is how the SybilDemo pages detect the block.
 */
async function invokePalcEnroll(): Promise<InvokeResult> {
  try {
    const r = await pramaana.enroll();
    // Cache the real on-chain coords so register-on-chain can replay them.
    lastOnChain = {
      tx_hash: r.txHash,
      block_number: r.blockNumber,
      set_id: r.setId,
      set_index: r.setIndex,
      explorer_url: r.explorerUrl,
      commitment_size_bytes: COMMITMENT_BYTES,
      timing: { total_ms: r.timing.total_ms },
    };
    return {
      data: {
        phi_hash: r.phi,
        phiShort: r.phiShort,
        alreadyEnrolled: r.alreadyEnrolled,
        sybil_resistant: r.alreadyEnrolled,
        // Real on-chain registration order (Decision 3): set_id = single global
        // anonymity set; set_index = 0-based ordinal in R's Registered stream.
        set_id: r.setId,
        set_index: r.setIndex,
        commitment_size_bytes: COMMITMENT_BYTES,
        pk_size_bytes: ML_KEM_PK_BYTES,
        ct_size_bytes: ML_KEM_CT_BYTES,
        kyber_variant: "ML-KEM-1024",
        kdf: "HKDF-SHA3-512",
        hash: "SHA3-512",
        // The backend never returns sk material; recomputable by re-scan only.
        master_secret_key_local_only: "",
        pii_retained: false,
        // Real server-measured total only (Decision 1); per-phase fields removed.
        timing: { total_ms: r.timing.total_ms },
        // C3: the public, non-biometric face-match fact ({performed,passed,kind}).
        biometric_match: r.biometricMatch,
        palc_properties: { hiding: "", binding: "", uniqueness: "", one_wayness: "" },
        error: r.alreadyEnrolled ? "Sybil collision: identity already enrolled" : undefined,
      },
      error: null,
    };
  } catch (err: any) {
    // Backend not running / network — graceful error so the UI still loads.
    return { data: null, error: { message: `Backend not running. Start with: make demo (${err?.message})` } };
  }
}

/**
 * Dispatch table. Every name a page calls is handled here. Only `palc-enroll`
 * touches the network; the rest are NEEDS-ENDPOINT (real crypto, W2 backend
 * pending — see docs/WIRING_MAP.md) or NO-CRYPTO-BASIS, returned as empty-but-
 * valid stubs shaped exactly like what the page dereferences.
 *
 * Removed vs the old ROUTE_MAP: `asc-verify` and `bind-wallet` (mapped but never
 * called by any page).
 */
const INVOKERS: Record<string, (body: any) => InvokeResult | Promise<InvokeResult>> = {
  // ── REAL ────────────────────────────────────────────────────────────────
  "palc-enroll": () => invokePalcEnroll(),

  // ── REAL (replayed from enroll) ──────────────────────────────────────────
  // Registry Φ-registration happens INSIDE enroll in V3 (Decision 3). This step
  // replays the real coords enroll already recorded: tx_hash/block_number from
  // the receipt, set_index = 0-based on-chain ordinal, set_id = 1. explorer_url
  // is null on local anvil (never a fabricated URL). With no enroll yet this
  // session there's nothing to register → graceful "enroll first" error.
  "register-on-chain": () =>
    lastOnChain
      ? { data: { ...lastOnChain }, error: null }
      : { data: null, error: { message: "Enroll first via /enroll — no on-chain registration in this session yet" } },
  // Per-service Semaphore pseudonym/nullifier — derive endpoint pending.
  "asc-prove": (body) => ({
    data: { pseudonym: "", nullifier: "", set_id: body?.set_id ?? 1 },
    error: null,
  }),
  // Semaphore (Groth16) membership proof — prove endpoint pending.
  "zk-membership-proof": (body) => ({
    data: {
      proof_type: "groth16",
      zk_note: "",
      public_inputs: {
        merkle_root: "",
        nullifier: "",
        external_nullifier: "",
        anonymity_set_size: 0,
        sp_identifier: body?.sp_identifier ?? "",
      },
      proof: { merkle_path: [], merkle_path_length: 0, binding_commitment: "", leaf_hash: "" },
      comparison: {},
      timing: { total_ms: 0 },
    },
    error: null,
  }),
  // Semaphore verify — verify endpoint pending.
  "verify-zk-proof": () => ({
    data: {
      verified: false,
      checks: {
        merkle_root_valid: false,
        merkle_proof_valid: false,
        external_nullifier_valid: false,
        nullifier_novel: false,
      },
      anonymity_set_size: 0,
      proof_type: "groth16",
      security_properties: { sybil_resistance: "", anonymity: "", unlinkability: "" },
      upgrade_path: "",
      timing: { total_ms: 0 },
    },
    error: null,
  }),

  // ── NO-CRYPTO-BASIS (no V3 equivalent) ───────────────────────────────────
  // ASC U2SSO Schnorr login — V3 has no per-SP challenge/response auth.
  "authenticate": (body) =>
    body?.action === "challenge"
      ? { data: { challenge: randomHex(32) }, error: null }
      : {
          data: { authenticated: false, message: "Authentication backend not available in unified build" },
          error: null,
        },
  "demo-sign-challenge": () => ({
    data: null,
    error: { message: "demo signing not available in unified build" },
  }),
  // Multichain registration — V2 feature, no V3 equivalent.
  "multichain-register": (body) => ({
    data: { status: "stub", chains: body?.chains ?? [] },
    error: null,
  }),
  // Claude AI agent — V2 feature, no V3 equivalent.
  "pramaana-agent": () => ({
    data: { tool_results: [], response: "The Pramaana agent isn't wired to the unified backend yet." },
    error: null,
  }),
  // Wallet/tx/contract scanner + heuristic sybil score — V2 features, no V3
  // equivalent. Returning a graceful error keeps the page's nested result state
  // null so its guarded result render is simply skipped.
  "analyze-wallet": () => ({ data: null, error: { message: "wallet analysis not available in unified backend" } }),
  "analyze-transaction": () => ({ data: null, error: { message: "transaction analysis not available in unified backend" } }),
  "analyze-contract": () => ({ data: null, error: { message: "contract analysis not available in unified backend" } }),
  "sybil-check": () => ({ data: null, error: { message: "wallet sybil-check not available in unified backend" } }),
};

class SupabaseCompatFunctions {
  async invoke(functionName: string, options?: { body?: any }): Promise<InvokeResult> {
    const invoker = INVOKERS[functionName];
    if (!invoker) {
      // Unknown function: graceful stub, never throw.
      return { data: { status: "stub", message: `${functionName} is handled by the V3 crypto spine` }, error: null };
    }
    return invoker(options?.body);
  }
}

// ---------------------------------------------------------------------------
// from(table) — chainable, thenable query builder (empty-but-valid results)
// ---------------------------------------------------------------------------

/**
 * W2 wiring seam: each V2 table maps to its intended V3 GET endpoint. The
 * endpoints don't exist yet, so the builder returns empty-but-valid shapes
 * WITHOUT fetching (guaranteeing no 404s). When W2 lands these routes, wire the
 * fetch here — the page-facing contract below already matches supabase-js.
 */
const TABLE_ENDPOINTS: Record<string, string | null> = {
  commitments: "/api/onchain",
  nullifier_registry: "/api/onchain",
  anonymity_sets: "/api/onchain",
  enrollment_logs: "/api/enrollment-logs",
  service_providers: "/api/services",
  // No crypto basis — stay empty:
  chain_configs: null,
  multichain_registrations: null,
  agent_conversations: null,
};

interface QueryResult {
  data: any;
  count: number | null;
  error: null | { message: string };
}

/**
 * Minimal stand-in for the supabase-js query builder. Filter/modifier methods are
 * chainable no-ops; the builder is awaitable (PromiseLike) and resolves to an
 * empty-but-valid result. `maybeSingle()`/`single()` resolve to a single null row.
 */
class QueryBuilder implements PromiseLike<QueryResult> {
  private head = false;
  // table is retained for the W2 seam (which endpoint this would hit).
  constructor(private readonly table: string) {}

  select(_columns?: string, opts?: { head?: boolean; count?: string }): this {
    if (opts?.head) this.head = true;
    return this;
  }

  // Chainable no-op filters/modifiers (return `this`).
  eq(): this { return this; }
  neq(): this { return this; }
  gt(): this { return this; }
  gte(): this { return this; }
  lt(): this { return this; }
  lte(): this { return this; }
  is(): this { return this; }
  in(): this { return this; }
  not(): this { return this; }
  or(): this { return this; }
  like(): this { return this; }
  ilike(): this { return this; }
  contains(): this { return this; }
  match(): this { return this; }
  filter(): this { return this; }
  order(): this { return this; }
  limit(): this { return this; }
  range(): this { return this; }

  private result(): QueryResult {
    void this.table; // documents the W2 seam without making a request yet
    return { data: this.head ? null : [], count: 0, error: null };
  }

  async maybeSingle(): Promise<{ data: null; error: null }> {
    return { data: null, error: null };
  }

  async single(): Promise<{ data: null; error: null }> {
    return { data: null, error: null };
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result()).then(onfulfilled, onrejected);
  }
}

// ---------------------------------------------------------------------------
// channel/removeChannel — safe no-ops (realtime is gone)
// ---------------------------------------------------------------------------

class SupabaseCompatChannel {
  on(_event: string, _filter: any, _callback: any) { return this; }
  subscribe() { return this; }
}

/**
 * Drop-in replacement for the Supabase client. V2 pages import
 * { supabase } from "@/integrations/supabase/client" and use
 * supabase.functions.invoke(), supabase.from(), and supabase.channel().
 */
export const supabase = {
  functions: new SupabaseCompatFunctions(),
  from: (table: string) => new QueryBuilder(table),
  channel: (_name: string) => new SupabaseCompatChannel(),
  removeChannel: (_channel: any) => {},
};
