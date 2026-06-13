/**
 * World ID 4.0 — a COMPLEMENTARY personhood gate for the airdrop demo.
 *
 * Pramaana already enforces "one human → one identity → one claim per service"
 * via the issuer-unknown VOPRF + Semaphore nullifiers (CLAUDE.md §2/§3). World
 * ID adds an orthogonal, independently-rooted "unique living human" check. The
 * two layers are complementary, not redundant: World proves liveness/uniqueness
 * of a human against World's Orb set; Pramaana adds structural unlinkability,
 * recovery-by-rescan, and Aadhaar reach.
 *
 * World's rules require the proof to be validated in a BACKEND or a SMART
 * CONTRACT — purely client-side verification is insufficient. This module is
 * that backend: `verifyProofOfHuman` is the only thing the claim path trusts,
 * and it either calls World's v4 verify API (live mode) or validates a clearly
 * labelled stub token (stub mode, used when no real credentials are present so
 * the offline demo / CI still exercises the GATE SHAPE).
 *
 * Security invariant: a stub token is accepted ONLY in stub mode. In live mode
 * the gate refuses anything that is not a real, server-verified World ID proof,
 * so stub mode can never be used to bypass a deployment that has real creds.
 *
 * This module touches none of the V3 crypto spine; it sits strictly upstream of
 * `pramaana.prove()` in the claim path.
 */

/** Sentinel app_id shipped in .env.example — presence of this (or no APP_ID)
 *  means "no real credentials yet" → stub mode. */
export const PLACEHOLDER_APP_ID = "app_PLACEHOLDER_replace_in_dotenv";

export type WorldIdMode = "live" | "stub";

export interface WorldIdConfig {
  appId: string;
  action: string;
  /** Relying-party id used in the v4 verify URL: /api/v4/verify/{rpId}. */
  rpId: string;
  /** RP Ed25519 signing key (live mode only; used to sign the IDKit request). */
  signingKey?: string;
  mode: WorldIdMode;
}

/** Resolve config from the environment. Live mode requires a real APP_ID and
 *  is opt-in: an explicit WORLDID_MODE wins, otherwise we infer from APP_ID. */
export function loadWorldIdConfig(env: NodeJS.ProcessEnv = process.env): WorldIdConfig {
  const appId = env.WORLDID_APP_ID ?? env.APP_ID ?? "";
  const action = env.WORLDID_ACTION ?? env.ACTION_ID ?? "pramaana-airdrop";
  const rpId = env.WORLDID_RP_ID ?? env.RP_ID ?? appId;
  const signingKey = env.WORLDID_RP_SIGNING_KEY ?? env.RP_SIGNING_KEY;

  const hasRealCreds = appId.length > 0 && appId !== PLACEHOLDER_APP_ID;
  const explicit = env.WORLDID_MODE?.toLowerCase();
  const mode: WorldIdMode =
    explicit === "live" ? "live" : explicit === "stub" ? "stub" : hasRealCreds ? "live" : "stub";

  return { appId, action, rpId, signingKey, mode };
}

/** A clearly-labelled stub proof. Only ever accepted in stub mode. */
export interface StubProof {
  stub: true;
  credential_type: string;
  nullifier_hash: string;
  action?: string;
  signal?: string;
}

/** The relevant subset of World's v4 IDKit completion result (live mode). */
export interface LiveProof {
  stub?: false;
  credential_type?: string;
  nullifier?: string;
  nullifier_hash?: string;
  proof: string[] | string;
  merkle_root?: string;
  identifier?: string;
  [k: string]: unknown;
}

export type WorldIdProof = StubProof | LiveProof;

export interface VerifyResult {
  ok: boolean;
  nullifierHash?: string;
  credentialType?: string;
  reason?: string;
}

const HEX_NULLIFIER = /^0x[0-9a-f]{1,64}$/i;
const REQUIRED_CREDENTIAL = "proof_of_human";

function isStub(p: unknown): p is StubProof {
  return typeof p === "object" && p !== null && (p as { stub?: unknown }).stub === true;
}

/**
 * The single trust boundary for the World ID gate. Returns `ok:false` (never
 * throws) for any malformed / unverified / wrong-credential proof, so the claim
 * path can translate a falsy result into an HTTP 403 "flow breaks" response.
 *
 * @param signal optional bound signal (e.g. the service id) — forwarded to the
 *               live verify call; the proof is invalid if it bound a different
 *               signal.
 */
export async function verifyProofOfHuman(
  proof: WorldIdProof | undefined,
  cfg: WorldIdConfig,
  signal?: string,
): Promise<VerifyResult> {
  if (proof == null) return { ok: false, reason: "no World ID proof presented" };

  if (cfg.mode === "stub") {
    // Stub mode: accept ONLY a well-formed stub proof_of_human token.
    if (!isStub(proof)) {
      return { ok: false, reason: "stub mode expects a stub proof token" };
    }
    if (proof.credential_type !== REQUIRED_CREDENTIAL) {
      return { ok: false, reason: `credential_type must be ${REQUIRED_CREDENTIAL}` };
    }
    if (!HEX_NULLIFIER.test(proof.nullifier_hash ?? "")) {
      return { ok: false, reason: "missing/invalid nullifier_hash" };
    }
    return {
      ok: true,
      nullifierHash: proof.nullifier_hash.toLowerCase(),
      credentialType: proof.credential_type,
    };
  }

  // Live mode: a stub token must NEVER be honoured (anti-bypass).
  if (isStub(proof)) {
    return { ok: false, reason: "live mode rejects stub proofs" };
  }
  return verifyLive(proof, cfg, signal);
}

/** POST the IDKit result to World's v4 verify API and require proof_of_human. */
async function verifyLive(
  proof: LiveProof,
  cfg: WorldIdConfig,
  signal?: string,
): Promise<VerifyResult> {
  const url = `https://developer.worldcoin.org/api/v4/verify/${encodeURIComponent(cfg.rpId)}`;
  const body = {
    ...proof,
    action: cfg.action,
    ...(signal !== undefined ? { signal } : {}),
  };
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, reason: `verify request failed: ${(e as Error).message}` };
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    return { ok: false, reason: `World verify rejected (${res.status}): ${JSON.stringify(data)}` };
  }
  const credentialType =
    (data.credential_type as string) ?? proof.credential_type ?? undefined;
  if (credentialType !== undefined && credentialType !== REQUIRED_CREDENTIAL) {
    return { ok: false, reason: `credential_type ${credentialType} is not ${REQUIRED_CREDENTIAL}` };
  }
  const nullifierHash =
    (data.nullifier_hash as string) ?? proof.nullifier_hash ?? proof.nullifier;
  if (typeof nullifierHash !== "string") {
    return { ok: false, reason: "verify response missing nullifier_hash" };
  }
  return { ok: true, nullifierHash: nullifierHash.toLowerCase(), credentialType };
}

/** The challenge the browser needs to launch IDKit. In stub mode this is just
 *  the action + a session nonce; in live mode it additionally carries a signed
 *  RP context (signed with the RP key via @worldcoin/idkit-core/signing). */
export async function buildChallenge(
  cfg: WorldIdConfig,
  nonce: string,
): Promise<Record<string, unknown>> {
  if (cfg.mode === "stub") {
    return { mode: "stub", app_id: cfg.appId || PLACEHOLDER_APP_ID, action: cfg.action, nonce };
  }
  if (!cfg.signingKey) {
    throw new Error("live World ID mode requires RP_SIGNING_KEY in .env");
  }
  // Dynamic import (non-literal specifier so tsc doesn't require the optional
  // package at build time) — stub mode / CI never need it installed. Install
  // with `pnpm --filter @pramaana/app add @worldcoin/idkit-core` for live mode.
  const moduleId = "@worldcoin/idkit-core/signing";
  let signing: { signRequest: (a: unknown) => Promise<string> };
  try {
    signing = (await import(moduleId)) as { signRequest: (a: unknown) => Promise<string> };
  } catch {
    throw new Error(
      "live World ID mode needs @worldcoin/idkit-core installed " +
        "(`pnpm --filter @pramaana/app add @worldcoin/idkit-core`)",
    );
  }
  const created_at = Date.now();
  const expires_at = created_at + 5 * 60_000;
  // signRequest signs the RP context (rp_id, nonce, timestamps) with the RP key.
  const signature = await signing.signRequest({
    rp_id: cfg.rpId,
    nonce,
    created_at,
    expires_at,
    signing_key: cfg.signingKey,
  });
  return {
    mode: "live",
    app_id: cfg.appId,
    action: cfg.action,
    rp_context: { rp_id: cfg.rpId, nonce, created_at, expires_at, signature },
  };
}

/** Construct a stub proof token (browser stub button / tests). */
export function makeStubProof(nullifierHash: string, action?: string): StubProof {
  return { stub: true, credential_type: REQUIRED_CREDENTIAL, nullifier_hash: nullifierHash, action };
}
