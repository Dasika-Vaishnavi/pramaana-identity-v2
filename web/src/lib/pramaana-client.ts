/**
 * PramaanaClient — the SINGLE client layer for talking to the V3 app server.
 *
 * The V3 backend (tee-server + voprf-vault + anvil, fronted by app/src/server.ts)
 * runs locally on :8080 and exposes a small JSON API. In the browser this client
 * issues RELATIVE `/api/...` requests that Vite proxies to :8080 same-origin (no
 * CORS); see web/vite.config.ts. It is the one and only place that issues HTTP to
 * the backend; the Supabase compatibility shim
 * (web/src/integrations/supabase/client.ts) delegates here and never does its own fetch.
 *
 * The method surface is aligned 1:1 with the routes that ACTUALLY exist in
 * app/src/server.ts:
 *
 *   POST /api/enroll              → enroll()
 *   POST /api/claim               → claim()
 *   GET  /api/worldid/challenge   → worldIdChallenge()
 *   GET  /api/state               → getState()
 *   POST /api/reset               → reset()
 *
 * Reads are GET, writes are POST. (The old shim POSTed to everything, which 404'd
 * the GET-only /api/state route.) There is intentionally NO fixture() method —
 * the server has no /api/fixture endpoint; the demo server pulls its own fixture
 * server-side inside /api/enroll.
 *
 * Crypto-spine safety: this is a pure transport layer. All cryptographic
 * operations (PALC, VOPRF, TEE gates, Semaphore) run server-side in Rust. This
 * client sends user intents and receives results — it never touches secret key
 * material or PII.
 */

/** The public, NON-BIOMETRIC face-match fact (no frame/photo/embedding bytes). */
export interface BiometricFact {
  performed: boolean;
  passed: boolean;
  /** "sim" | "arcface-scrfd". */
  kind: string;
}

/** A single RGB8 image as base64, sent to the backend for an in-enclave match. */
export interface EnrollFrame {
  width: number;
  height: number;
  rgbBase64: string;
}

/** Optional camera payload for POST /api/enroll. Omit entirely (the default) to
 *  enroll the server's sim fixture — no camera, used by the public demo + tests. */
export interface EnrollPayload {
  /** A live webcam still (matched in-enclave, then wiped; never stored). */
  liveFrame?: EnrollFrame;
  /** DEMO reference photo (your own face); NOT a verified credential. */
  demoReference?: EnrollFrame;
  capturedAtMs?: number;
}

/** Response of POST /api/enroll (see app/src/server.ts handleEnroll). */
export interface EnrollResult {
  phi: string;
  phiShort: string;
  alreadyEnrolled: boolean;
  /** Real server-measured enrollment wall-clock; no per-phase breakdown (Decision 1). */
  timing: { total_ms: number };
  /** Real on-chain registration coordinates (Decision 3). set_id is the single
   *  global anonymity set (1); setIndex is the 0-based ordinal in R's Registered
   *  stream (same value on an alreadyEnrolled re-enroll — the prior index, not a
   *  new one). txHash/blockNumber come from the registration receipt (the original
   *  tx on a dedup hit); explorerUrl is null on local anvil. */
  setId: number;
  setIndex: number | null;
  txHash: string | null;
  blockNumber: number | null;
  explorerUrl: string | null;
  /** The attested, non-biometric "match performed and passed" fact. */
  biometricMatch: BiometricFact;
}

/** Thrown by enroll() when the live face did NOT match the reference (HTTP 422):
 *  enrollment was refused, no Φ minted. Carries the {performed:true,
 *  passed:false, kind} fact so the UI renders a clean REJECT, not a raw error. */
export class EnrollRejectedError extends Error {
  constructor(
    readonly biometricMatch: BiometricFact,
    message: string,
  ) {
    super(message);
    this.name = "EnrollRejectedError";
  }
}

/** Response of POST /api/claim (see app/src/server.ts handleClaim). */
export interface ClaimResult {
  status: "claimed" | "blocked";
  nullifier: string;
  scope: string;
  worldIdMode?: "live" | "stub";
}

/** Response of GET /api/state (see app/src/server.ts state). */
export interface AppState {
  services: string[];
  worldId: { mode: string; action: string };
  enrollment: { phi: string; phiShort: string; alreadyEnrolled: boolean } | null;
  claims: Record<string, ClaimResult>;
}

/** A World ID proof-of-human payload, as forwarded to /api/claim. */
export type WorldIdProof = Record<string, unknown>;

/** Response of POST /api/prove — the honest §3 Semaphore proof shape (Decision 2).
 *  public_inputs are the three real Groth16 public signals; merkle_path is empty
 *  and binding_commitment null by construction (see zk_note). This whole object
 *  is what POST /api/verify consumes. */
export interface ProveResult {
  proof_type: "groth16";
  zk_note: string;
  public_inputs: { merkle_root: string; nullifier: string; external_nullifier: string };
  proof: { points: string[]; merkle_path: never[]; binding_commitment: null };
}

/** Response of POST /api/verify — the real off-chain Groth16 verdict. */
export interface VerifyResult {
  verified: boolean;
}

/** Response of GET /api/registry/stats — counts straight from the on-chain R. */
export interface RegistryStats {
  /** identityCount() storage var. */
  total: number;
  /** Count of Registered events (== total by construction; derived independently). */
  onChainConfirmed: number;
}

/** One row of GET /api/registry/feed — a Registered event with its ordinal. */
export interface RegistryFeedEntry {
  phi: string;
  dedupTag: string;
  /** 0-based ordinal in R's Registered stream. */
  setIndex: number;
  txHash: string;
  blockNumber: number;
  /** Off-chain match fact joined by Φ (null if unknown to this server). */
  biometricMatch: BiometricFact | null;
}

/** Response of GET /api/registry/lookup?phi=<Φ> — whether a Φ is registered. */
export interface RegistryLookup {
  registered: boolean;
  setIndex: number | null;
  txHash: string | null;
  blockNumber: number | null;
  /** Off-chain match fact for this Φ (null if unknown / not registered). */
  biometricMatch: BiometricFact | null;
}

/** One row of GET /api/enrollment-log — the server's in-memory enroll history. */
export interface EnrollmentLogEntry {
  phiShort: string;
  total_ms: number;
  setIndex: number | null;
  txHash: string | null;
  /** ISO-8601 timestamp the enroll was recorded. */
  createdAt: string;
  /** The non-biometric match fact for this enrollment. */
  biometricMatch: BiometricFact;
}

export class PramaanaClient {
  private baseUrl: string;

  // Default is a RELATIVE base ("") so `/api/...` is same-origin and goes through
  // the Vite dev proxy (web/vite.config.ts) to the :8080 backend — no CORS needed
  // (the backend sets no CORS header). Override with VITE_PRAMAANA_API_URL for a
  // cross-origin deployment that does send CORS.
  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  /**
   * Enroll a new identity via the V3 TEE backend. Drives the full §2 enrollment
   * sequence: Gate 0 → UIDAI verify → face match → VOPRF → PALC → dedup → Gate Z
   * → erase. The server uses its own sim fixture (QR + face frames); there is no
   * body to send.
   */
  async enroll(payload?: EnrollPayload): Promise<EnrollResult> {
    const res = await fetch(`${this.baseUrl}/api/enroll`, {
      method: "POST",
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const body = (await res.json().catch(() => ({}))) as Partial<EnrollResult> & {
      error?: string;
      biometricMatch?: BiometricFact;
    };
    // REJECT (failed live-face match): structured 422, no Φ. Render, don't error.
    if (res.status === 422 && body.biometricMatch) {
      throw new EnrollRejectedError(
        body.biometricMatch,
        body.error ?? "live face did not match the reference",
      );
    }
    if (!res.ok) {
      throw new Error(`/api/enroll failed: ${res.status} ${body.error ?? JSON.stringify(body)}`);
    }
    return body as EnrollResult;
  }

  /**
   * Prove membership for a service and claim (spend the nullifier on-chain).
   * Drives §3: World ID gate → Semaphore proof → NullifierRegistry.spend().
   */
  claim(serviceId: string, worldIdProof?: WorldIdProof): Promise<ClaimResult> {
    return this.post<ClaimResult>("/api/claim", { service: serviceId, worldIdProof });
  }

  /** Get the current application state (enrollment status, past claims). */
  getState(): Promise<AppState> {
    return this.get<AppState>("/api/state");
  }

  /**
   * Produce a standalone §3 Semaphore membership proof for a service. Unlike
   * claim() this does NOT require a World ID proof and does NOT spend the
   * nullifier on-chain — it only generates the proof. The server session owns
   * (Φ, sk_IdR); there is no client secret to pass.
   */
  prove(serviceId: string): Promise<ProveResult> {
    return this.post<ProveResult>("/api/prove", { service: serviceId });
  }

  /** Verify a proof object (as returned by prove()) with real off-chain Groth16. */
  verify(proof: ProveResult): Promise<VerifyResult> {
    return this.post<VerifyResult>("/api/verify", proof);
  }

  /** Fetch a World ID challenge for a given service action. */
  worldIdChallenge(service: string): Promise<unknown> {
    return this.get(`/api/worldid/challenge?service=${encodeURIComponent(service)}`);
  }

  /** Registry totals straight from the on-chain R (no fabricated zeros). */
  registryStats(): Promise<RegistryStats> {
    return this.get<RegistryStats>("/api/registry/stats");
  }

  /** Recent on-chain Registered events, newest first (default 20). */
  registryFeed(limit = 20): Promise<RegistryFeedEntry[]> {
    return this.get<RegistryFeedEntry[]>(`/api/registry/feed?limit=${limit}`);
  }

  /** Whether a Φ (64-byte hex, as enroll returns) is registered on-chain. */
  registryLookup(phi: string): Promise<RegistryLookup> {
    return this.get<RegistryLookup>(`/api/registry/lookup?phi=${encodeURIComponent(phi)}`);
  }

  /** The server's in-memory enroll history, newest first (default 50). */
  enrollmentLog(limit = 50): Promise<EnrollmentLogEntry[]> {
    return this.get<EnrollmentLogEntry[]>(`/api/enrollment-log?limit=${limit}`);
  }

  /** Reset the session (re-enroll a fresh "human"; for demo purposes). */
  async reset(): Promise<void> {
    await this.post("/api/reset");
  }
}

/** Singleton instance — the one client layer used across the app. Relative base
 *  by default (proxied to :8080 by Vite); set VITE_PRAMAANA_API_URL to point at a
 *  CORS-enabled backend on another origin. */
export const pramaana = new PramaanaClient(
  import.meta.env.VITE_PRAMAANA_API_URL ?? "",
);
