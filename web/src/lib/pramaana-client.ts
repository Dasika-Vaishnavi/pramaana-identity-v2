/**
 * PramaanaClient — thin HTTP client that talks to the V3 app server's JSON API.
 *
 * This replaces all Supabase Edge Function calls from V2. The V3 backend
 * (tee-server + voprf-vault + anvil) runs locally and exposes a REST API
 * via the app/ server at http://127.0.0.1:8080.
 *
 * Crypto-spine safety: this client is a pure transport layer. All cryptographic
 * operations (PALC, VOPRF, TEE gates, Semaphore) run server-side in Rust.
 * This client sends user intents and receives results — it never touches
 * secret key material or PII.
 */

export interface EnrollResult {
  phi: string;
  dedupTag: string;
  enrolled: boolean;
  alreadyEnrolled: boolean;
}

export interface ClaimResult {
  nullifier: string;
  txHash: string;
  spent: boolean;
  blocked: boolean;
  blockReason?: string;
}

export interface ProveResult {
  nullifier: string;
  proof: {
    merkleTreeDepth: number;
    merkleTreeRoot: string;
    nullifier: string;
    message: string;
    scope: string;
    points: string[];
  };
  verified: boolean;
}

export interface AppState {
  enrolled: boolean;
  phi: string | null;
  claims: Record<string, { nullifier: string; txHash: string }>;
}

export interface FixtureData {
  qrNumeric: string;
  frames: Array<{ r: number; g: number; b: number }>;
}

export class PramaanaClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://127.0.0.1:8080') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Get a sim-mode fixture (synthetic Aadhaar QR + matching face frames).
   * Only available when the backend runs with --features sim-fixture.
   */
  async fixture(): Promise<FixtureData> {
    const res = await fetch(`${this.baseUrl}/api/fixture`);
    if (!res.ok) throw new Error(`fixture failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Enroll a new identity via the V3 TEE backend.
   * Drives the full §2 enrollment sequence: Gate 0 → UIDAI verify → face match →
   * VOPRF → PALC → dedup → Gate Z → erase.
   */
  async enroll(): Promise<EnrollResult> {
    const res = await fetch(`${this.baseUrl}/api/enroll`, { method: 'POST' });
    if (!res.ok) throw new Error(`enroll failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Prove membership for a service and claim (spend the nullifier on-chain).
   * Drives §3: Semaphore proof generation + NullifierRegistry.spend().
   */
  async claim(serviceId: string): Promise<ClaimResult> {
    const res = await fetch(`${this.baseUrl}/api/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceId }),
    });
    if (!res.ok) throw new Error(`claim failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Get the current application state (enrollment status, past claims).
   */
  async getState(): Promise<AppState> {
    const res = await fetch(`${this.baseUrl}/api/state`);
    if (!res.ok) throw new Error(`getState failed: ${res.status} ${await res.text()}`);
    return res.json();
  }

  /**
   * Reset the session (for demo purposes).
   */
  async reset(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/reset`, { method: 'POST' });
    if (!res.ok) throw new Error(`reset failed: ${res.status} ${await res.text()}`);
  }
}

/** Singleton instance for use across the app */
export const pramaana = new PramaanaClient(
  import.meta.env.VITE_PRAMAANA_API_URL || 'http://127.0.0.1:8080'
);
