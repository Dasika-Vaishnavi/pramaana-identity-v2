/**
 * PramaanaClient — the SINGLE client layer for talking to the V3 app server.
 *
 * The V3 backend (tee-server + voprf-vault + anvil, fronted by app/src/server.ts)
 * runs locally and exposes a small JSON API at http://127.0.0.1:8080. This client
 * is the one and only place that issues HTTP to it; the Supabase compatibility
 * shim (web/src/integrations/supabase/client.ts) delegates here and never does its
 * own fetch.
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

/** Response of POST /api/enroll (see app/src/server.ts handleEnroll). */
export interface EnrollResult {
  phi: string;
  phiShort: string;
  alreadyEnrolled: boolean;
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

export class PramaanaClient {
  private baseUrl: string;

  constructor(baseUrl: string = "http://127.0.0.1:8080") {
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
  enroll(): Promise<EnrollResult> {
    return this.post<EnrollResult>("/api/enroll");
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

  /** Fetch a World ID challenge for a given service action. */
  worldIdChallenge(service: string): Promise<unknown> {
    return this.get(`/api/worldid/challenge?service=${encodeURIComponent(service)}`);
  }

  /** Reset the session (re-enroll a fresh "human"; for demo purposes). */
  async reset(): Promise<void> {
    await this.post("/api/reset");
  }
}

/** Singleton instance — the one client layer used across the app. */
export const pramaana = new PramaanaClient(
  import.meta.env.VITE_PRAMAANA_API_URL || "http://127.0.0.1:8080",
);
