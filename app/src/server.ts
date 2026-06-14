/**
 * Demo server: one server-side @pramaana/sdk session behind a tiny JSON API,
 * plus the static UI. The browser is pure presentation — running the SDK in
 * Node keeps the anvil deployer key server-side, avoids CORS to the Rust
 * tee-server, and skips an in-browser Groth16 artifact download.
 */

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Pramaana,
  MERKLE_DEPTH,
  verifyService,
  type ServiceProof,
  type SemaphoreProof,
} from "@pramaana/sdk";
import {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  keccak256,
  solidityPackedKeccak256,
  type BaseContract,
  type InterfaceAbi,
} from "ethers";
import {
  buildChallenge,
  loadWorldIdConfig,
  verifyProofOfHuman,
  type WorldIdConfig,
  type WorldIdProof,
} from "./worldid.js";

/** The demo's two independent "services" — distinct external nullifiers. */
export const SERVICES = ["airdrop-alpha", "airdrop-beta"] as const;
export type ServiceId = (typeof SERVICES)[number];

// app/dist/server.js → repo root is three levels up (app/src too).
const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

// anvil's first dev account — SIM-ONLY demo deployer/signer.
const ANVIL_KEY0 = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

export interface DemoServerConfig {
  teeUrl: string;
  rpcUrl: string;
  deployerKey?: string;
  /** World ID config override (defaults to env via loadWorldIdConfig). */
  worldId?: WorldIdConfig;
}

/** World ID nullifier is scoped per (app_id, action). To keep the two airdrops
 *  cross-service-unlinkable on the World side too, each service gets its own
 *  action namespace; the same human therefore presents a DIFFERENT World
 *  nullifier per airdrop, while a second human reusing one within an airdrop is
 *  caught. */
function serviceAction(cfg: WorldIdConfig, service: ServiceId): WorldIdConfig {
  return { ...cfg, action: `${cfg.action}:${service}` };
}

interface ClaimRecord {
  status: "claimed" | "blocked";
  nullifier: string;
  scope: string;
  /** Which World ID verification path gated this claim. */
  worldIdMode?: "live" | "stub";
}

function nullifierHex(proof: ServiceProof): string {
  return `0x${proof.nullifier.toString(16).padStart(64, "0")}`;
}

/** The demo http.Server, augmented with the on-chain Registry (R) address so
 *  tests can read its state without an HTTP surface change. */
export interface DemoServer extends Server {
  registryAddress: string;
}

/**
 * Φ64 → bytes32 for Registry.sol (docs/DECISIONS.md). The Rust Φ is 64 bytes
 * (SHA3-512 of C_commit); the on-chain Registry keys identities by bytes32.
 * The mapping is keccak256(Φ64) — a hash, not a truncation, so the full Φ binds
 * the on-chain key. `phiHex` is the SDK's 128-hex-char Φ (with or without 0x).
 */
export function phi64ToBytes32(phiHex: string): string {
  return keccak256(phiHex.startsWith("0x") ? phiHex : `0x${phiHex}`);
}

/**
 * The EVM-sim Gate Z proof GateZVerifier.sol accepts for `phi32`:
 * keccak256(abi.encodePacked("pramaana-sim-attestation", phi32)). It must
 * byte-match GateZVerifier.expectedProof or register() reverts InvalidGateZProof.
 * SIM stand-in only; production swaps in a DCAP-in-ZK verifier (docs/DECISIONS.md).
 */
export function simGateZProof(phi32: string): string {
  return solidityPackedKeccak256(["string", "bytes32"], ["pramaana-sim-attestation", phi32]);
}

/** The real on-chain registration coordinates surfaced on enroll (Decision 3).
 *  setIndex is the 0-based ordinal in R's Registered stream; set_id is the
 *  single global anonymity set (1). txHash/blockNumber/explorerUrl are null when
 *  not available (e.g. an unrecoverable event stream, or no configured explorer). */
export interface RegistrationInfo {
  setId: number;
  setIndex: number | null;
  txHash: string | null;
  blockNumber: number | null;
  explorerUrl: string | null;
}

/** Honest description of the Semaphore proof shape (Decision 2). Explains WHY
 *  merkle_path is empty and binding_commitment is null, so the UI never implies
 *  fields that don't exist at this layer. */
const ZK_NOTE =
  "Real Groth16/BN254 Semaphore membership proof (@semaphore-protocol/core v4). " +
  "Merkle membership is proven succinctly inside the circuit, so there is no exposed " +
  "merkle_path and no separate PALC binding_commitment at this layer — the public inputs " +
  "(merkle_root, nullifier, external_nullifier) are the full statement. /api/verify runs " +
  "the actual off-chain Groth16 check over these inputs and the proof points.";

/** The honest §3 proof shape /api/prove emits and /api/verify consumes
 *  (Decision 2). public_inputs are exactly the three real Groth16 public signals;
 *  merkle_path is [] and binding_commitment is null by construction. */
export interface ProveResponse {
  proof_type: "groth16";
  zk_note: string;
  public_inputs: { merkle_root: string; nullifier: string; external_nullifier: string };
  proof: { points: string[]; merkle_path: never[]; binding_commitment: null };
}

/** One Registered event from R, with its 0-based ordinal (= setIndex). The
 *  registry-read endpoints (stats/feed/lookup) all derive from this stream. */
export interface RegistrationEvent {
  phi: string;
  dedupTag: string;
  setIndex: number;
  txHash: string;
  blockNumber: number;
}

/** One in-memory enroll-history row (C4). Server-side audit of enroll attempts;
 *  every value is real (setIndex/txHash come from the on-chain registration). */
export interface EnrollLogEntry {
  phiShort: string;
  total_ms: number;
  setIndex: number | null;
  txHash: string | null;
  createdAt: string;
}

/** Build a tx explorer URL ONLY from a configured base (PRAMAANA_EXPLORER_BASE);
 *  on local anvil there is none, so this returns null — never a fabricated URL. */
function explorerTxUrl(txHash: string | null): string | null {
  const base = process.env.PRAMAANA_EXPLORER_BASE;
  return base && txHash ? `${base.replace(/\/$/, "")}/tx/${txHash}` : null;
}

/** A register() revert meaning "this Φ/dedup is already recorded on-chain" —
 *  benign for enroll (the identity simply exists), distinct from a real failure. */
function isBenignDuplicate(e: unknown): boolean {
  const name = (e as { revert?: { name?: string } }).revert?.name ?? "";
  return (
    name === "DuplicatePhi" ||
    name === "AlreadyEnrolled" ||
    /DuplicatePhi|AlreadyEnrolled/.test(String((e as Error).message))
  );
}

/**
 * Deploys a fresh NullifierRegistry to the chain, then returns an http.Server
 * exposing the demo API + UI. One server = one demo "human".
 */
export async function createDemoServer(config: DemoServerConfig): Promise<DemoServer> {
  const wallet = new Wallet(
    config.deployerKey ?? ANVIL_KEY0,
    new JsonRpcProvider(config.rpcUrl, undefined, {
      pollingInterval: 50,
      // The block/unblock claim flow sends near-identical calls back to back;
      // ethers' default result cache would mask the on-chain revert.
      cacheTimeout: -1,
    }),
  );
  const loadArtifact = (name: string): { abi: InterfaceAbi; bytecode: { object: string } } =>
    JSON.parse(
      readFileSync(join(REPO_ROOT, "contracts", "out", `${name}.sol`, `${name}.json`), "utf8"),
    );
  const deploy = async (name: string, args: unknown[] = []): Promise<BaseContract> => {
    const a = loadArtifact(name);
    const c = await new ContractFactory(a.abi, a.bytecode.object, wallet).deploy(...args);
    await c.waitForDeployment();
    return c;
  };

  const registry = await deploy("NullifierRegistry");
  const nullifierRegistryAddress = await registry.getAddress();

  // On-chain Registry R (§2 steps 11–12): the Gate Z verifier first, then the
  // Registry which takes the verifier's address. The SIM GateZVerifier accepts
  // the deterministic mock proof (simGateZProof); production swaps the verifier.
  const gateZ = await deploy("GateZVerifier");
  const registryR = await deploy("Registry", [await gateZ.getAddress()]);
  const registryAddress = await registryR.getAddress();
  console.log(`  Registry (Φ) deployed → ${registryAddress}`);

  const worldId = config.worldId ?? loadWorldIdConfig();

  // World ID ledger: keyed `${service}:${worldNullifier}`. This models a global
  // on-chain ledger, so it deliberately PERSISTS across /api/reset — a second
  // "human" (fresh Pramaana Φ) cannot reuse a World ID nullifier they already
  // spent on an airdrop. Value = phiShort that first used it (for messaging).
  const worldNullifierLedger = new Map<string, string>();

  // Mutable demo session (reset re-enrolls a "fresh human").
  let pramaana = newSession();
  let enrollment: { phi: string; alreadyEnrolled: boolean } | null = null;
  const claims = new Map<ServiceId, ClaimRecord>();
  // In-memory enroll history (C4) — a running audit of every enroll attempt,
  // newest appended last. Like the on-chain Registered stream it backs, this is
  // a ledger, so it deliberately PERSISTS across /api/reset.
  const enrollLog: EnrollLogEntry[] = [];

  function newSession(): Pramaana {
    return new Pramaana({ teeUrl: config.teeUrl, signer: wallet, nullifierRegistryAddress });
  }

  async function handleEnroll(): Promise<unknown> {
    const { qrNumeric, frames } = await pramaana.fixture();
    // Decision 1 (W2): real server-measured total enrollment wall-clock. We can
    // only see the total here — the §2 phases run inside the Rust TEE behind one
    // HTTP round-trip — so there are deliberately no per-phase fields.
    const startedAt = performance.now();
    const handle = await pramaana.enroll(qrNumeric, { frames, capturedAtMs: Date.now() });
    const totalMs = Math.round(performance.now() - startedAt);

    // §2 step 12: record the Φ commitment on-chain (Gate Z–gated), or — for a
    // dedup hit (alreadyEnrolled) — recover the Φ's PRIOR registration without
    // re-registering. Either way we surface the real on-chain coordinates
    // (Decision 3): set_id, the 0-based set_index, and the tx hash/block.
    const onChain = await recordOnChain(handle.phi, handle.dedupTag, handle.alreadyEnrolled);

    enrollment = { phi: handle.phi, alreadyEnrolled: handle.alreadyEnrolled };
    enrollLog.push({
      phiShort: shortHash(handle.phi),
      total_ms: totalMs,
      setIndex: onChain.setIndex,
      txHash: onChain.txHash,
      createdAt: new Date().toISOString(),
    });
    return {
      phi: handle.phi,
      phiShort: shortHash(handle.phi),
      alreadyEnrolled: handle.alreadyEnrolled,
      timing: { total_ms: totalMs },
      setId: onChain.setId,
      setIndex: onChain.setIndex,
      txHash: onChain.txHash,
      blockNumber: onChain.blockNumber,
      explorerUrl: onChain.explorerUrl,
    };
  }

  /**
   * Record Φ on R (new identity) or recover its prior registration (dedup hit),
   * returning the real on-chain coordinates. A new Φ is registered with the SIM
   * Gate Z proof; set_index = identityCount-1 read right after the tx, and the
   * tx hash/block come from the receipt. A dedup hit does NOT re-register: we
   * recover the Φ's original set_index (and original tx hash/block, which the
   * Registered event log carries cheaply) from the on-chain event stream. A
   * benign DuplicatePhi/AlreadyEnrolled revert (Φ already on-chain) also falls
   * back to event-stream recovery; any other revert is a real failure.
   */
  async function recordOnChain(
    phiHex: string,
    dedupHex: string,
    alreadyEnrolled: boolean,
  ): Promise<RegistrationInfo> {
    const phi32 = phi64ToBytes32(phiHex);
    const r = registryR as BaseContract & {
      register: (
        phi: string,
        dedup: string,
        proof: string,
      ) => Promise<{ wait: () => Promise<{ hash: string; blockNumber: number } | null> }>;
      identityCount: () => Promise<bigint>;
    };

    if (!alreadyEnrolled) {
      const dedupTag = dedupHex.startsWith("0x") ? dedupHex : `0x${dedupHex}`;
      try {
        const tx = await r.register(phi32, dedupTag, simGateZProof(phi32));
        const receipt = await tx.wait();
        const count = await r.identityCount();
        const txHash = receipt?.hash ?? null;
        return {
          setId: 1,
          setIndex: Number(count) - 1,
          txHash,
          blockNumber: receipt?.blockNumber ?? null,
          explorerUrl: explorerTxUrl(txHash),
        };
      } catch (e) {
        if (!isBenignDuplicate(e)) throw e;
        // Φ already on-chain (defensive) → recover its prior registration below.
      }
    }
    return recoverRegistration(phi32);
  }

  /** The full Registered event stream from R in emission order, each carrying
   *  its 0-based ordinal (= setIndex). queryFilter returns logs in block/log
   *  order, so the position IS the registration order. The single source of
   *  truth for recoverRegistration and the registry-read endpoints. */
  async function listRegistrations(): Promise<RegistrationEvent[]> {
    const events = await registryR.queryFilter(registryR.filters.Registered());
    const out: RegistrationEvent[] = [];
    events.forEach((e, idx) => {
      if (!("args" in e)) return;
      const args = e.args as unknown as { phi: string; dedupTag: string };
      out.push({
        phi: args.phi,
        dedupTag: args.dedupTag,
        setIndex: idx,
        txHash: e.transactionHash,
        blockNumber: e.blockNumber,
      });
    });
    return out;
  }

  /** Find the Φ's prior registration (setIndex + original tx hash/block) in the
   *  Registered stream. Used by the alreadyEnrolled enroll path (no re-register). */
  async function recoverRegistration(phi32: string): Promise<RegistrationInfo> {
    const hit = (await listRegistrations()).find(
      (r) => r.phi.toLowerCase() === phi32.toLowerCase(),
    );
    if (!hit) {
      return { setId: 1, setIndex: null, txHash: null, blockNumber: null, explorerUrl: null };
    }
    return {
      setId: 1,
      setIndex: hit.setIndex,
      txHash: hit.txHash,
      blockNumber: hit.blockNumber,
      explorerUrl: explorerTxUrl(hit.txHash),
    };
  }

  // ── Registry-read endpoints (C4) — every value is real on-chain/in-memory ──

  /** GET /api/registry/stats — counts straight from R: total from the
   *  identityCount storage var, onChainConfirmed from the Registered event log
   *  (equal by construction, but derived independently — neither fabricated). */
  async function registryStats(): Promise<unknown> {
    const r = registryR as BaseContract & { identityCount: () => Promise<bigint> };
    const total = Number(await r.identityCount());
    const onChainConfirmed = (await listRegistrations()).length;
    return { total, onChainConfirmed };
  }

  /** GET /api/registry/feed?limit=N — recent Registered events, newest first. */
  async function registryFeed(req: IncomingMessage): Promise<unknown> {
    const limit = parseLimit(req, 20);
    return (await listRegistrations()).reverse().slice(0, limit);
  }

  /** GET /api/registry/lookup?phi=<Φ> — is this Φ registered, and where. The
   *  phi param is the 64-byte Φ hex (what enroll returns); we hash it to the
   *  on-chain bytes32 key exactly as registration does. */
  async function registryLookup(req: IncomingMessage): Promise<unknown> {
    const phi = new URL(req.url ?? "", "http://x").searchParams.get("phi");
    if (!phi) throw new HttpError(400, "phi query param required");
    const phi32 = phi64ToBytes32(phi);
    const hit = (await listRegistrations()).find(
      (r) => r.phi.toLowerCase() === phi32.toLowerCase(),
    );
    return hit
      ? { registered: true, setIndex: hit.setIndex, txHash: hit.txHash, blockNumber: hit.blockNumber }
      : { registered: false, setIndex: null, txHash: null, blockNumber: null };
  }

  /** GET /api/enrollment-log?limit=N — the in-memory enroll history, newest first. */
  function enrollmentLog(req: IncomingMessage): unknown {
    const limit = parseLimit(req, 50);
    return enrollLog.slice().reverse().slice(0, limit);
  }

  async function handleClaim(service: ServiceId, worldIdProof?: WorldIdProof): Promise<unknown> {
    if (!enrollment) throw new HttpError(400, "enroll first");

    // GATE: World ID proof-of-human is REQUIRED before any Semaphore work. The
    // claim path BREAKS (403) without a valid, backend-verified proof — proving
    // the personhood layer is load-bearing, not decorative. Verification happens
    // here in the backend (World's requirement), never client-side.
    const cfg = serviceAction(worldId, service);
    const verdict = await verifyProofOfHuman(worldIdProof, cfg, service);
    if (!verdict.ok) {
      throw new HttpError(403, `World ID proof-of-human required: ${verdict.reason}`);
    }
    const ledgerKey = `${service}:${verdict.nullifierHash}`;
    const priorUser = worldNullifierLedger.get(ledgerKey);
    if (priorUser && priorUser !== shortHash(enrollment.phi)) {
      // Same human (same World nullifier) already claimed this airdrop under a
      // DIFFERENT Pramaana identity → blocked by the complementary World layer.
      throw new HttpError(403, "World ID already used for this airdrop by another identity");
    }

    const proof = await pramaana.prove(service);
    const record: ClaimRecord = {
      status: "claimed",
      nullifier: nullifierHex(proof),
      scope: `0x${proof.scope.toString(16)}`,
    };
    // Already spent (this human already claimed this airdrop) → Sybil block.
    if (!(await pramaana.verifyOnChain(proof))) {
      record.status = "blocked";
    } else {
      try {
        await pramaana.claim(proof);
      } catch (e) {
        if (String((e as Error).message).includes("NullifierAlreadySpent")) {
          record.status = "blocked";
        } else {
          throw e;
        }
      }
    }
    // Record first use of this World ID nullifier for this airdrop. Done after
    // a passing proof so the complementary layer can later catch a different
    // identity reusing the same human's World ID.
    if (!priorUser) worldNullifierLedger.set(ledgerKey, shortHash(enrollment.phi));
    record.worldIdMode = worldId.mode;
    claims.set(service, record);
    return record;
  }

  /**
   * POST /api/prove — a standalone §3 Semaphore membership proof. Unlike
   * /api/claim this does NOT require a worldIdProof and does NOT spend the
   * nullifier on-chain — it only produces the proof. The V3 session owns
   * (Φ, sk_IdR) internally, so any client-passed master_secret_key is ignored:
   * there is no per-request client secret in this model.
   */
  async function handleProve(body: unknown): Promise<ProveResponse> {
    if (!enrollment) throw new HttpError(400, "enroll first");
    const service = parseService(body);
    const sp = await pramaana.prove(service);
    const p = sp.proof;
    return {
      proof_type: "groth16",
      zk_note: ZK_NOTE,
      public_inputs: {
        merkle_root: p.merkleTreeRoot,
        nullifier: p.nullifier,
        external_nullifier: p.scope,
      },
      proof: { points: [...p.points], merkle_path: [], binding_commitment: null },
    };
  }

  async function handleChallenge(req: IncomingMessage): Promise<unknown> {
    const service = new URL(req.url ?? "", "http://x").searchParams.get("service");
    if (!SERVICES.includes(service as ServiceId)) {
      throw new HttpError(400, `unknown service ${String(service)}`);
    }
    const cfg = serviceAction(worldId, service as ServiceId);
    return buildChallenge(cfg, randomUUID());
  }

  function state(): unknown {
    return {
      services: SERVICES,
      worldId: { mode: worldId.mode, action: worldId.action },
      enrollment: enrollment ? { ...enrollment, phiShort: shortHash(enrollment.phi) } : null,
      claims: Object.fromEntries(claims),
    };
  }

  const server = createServer((req, res) => {
    route(req, res, {
      "POST /api/enroll": handleEnroll,
      "POST /api/claim": async (body) =>
        handleClaim(parseService(body), (body as { worldIdProof?: WorldIdProof }).worldIdProof),
      "POST /api/prove": handleProve,
      "POST /api/verify": verifyProvePayload,
      "GET /api/worldid/challenge": async () => handleChallenge(req),
      "GET /api/state": async () => state(),
      "GET /api/registry/stats": async () => registryStats(),
      "GET /api/registry/feed": async () => registryFeed(req),
      "GET /api/registry/lookup": async () => registryLookup(req),
      "GET /api/enrollment-log": async () => enrollmentLog(req),
      "POST /api/reset": async () => {
        pramaana = newSession();
        enrollment = null;
        claims.clear();
        return { ok: true };
      },
    });
  }) as DemoServer;
  server.registryAddress = registryAddress;
  return server;
}

// ---------------------------------------------------------------------------
// Tiny routing/static helpers (Node http only — no framework).
// ---------------------------------------------------------------------------

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (body: unknown) => Promise<unknown>;

function route(req: IncomingMessage, res: ServerResponse, handlers: Record<string, Handler>): void {
  const key = `${req.method} ${req.url?.split("?")[0]}`;
  const handler = handlers[key];

  if (!handler) {
    serveStatic(req, res);
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c as Buffer));
  req.on("end", () => {
    void (async () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = raw ? JSON.parse(raw) : {};
        const result = await handler(body);
        sendJson(res, 200, result);
      } catch (e) {
        const status = e instanceof HttpError ? e.status : 500;
        sendJson(res, status, { error: (e as Error).message });
      }
    })();
  });
}

function serveStatic(req: IncomingMessage, res: ServerResponse): void {
  const path = req.url?.split("?")[0] ?? "/";
  const file = path === "/" ? "index.html" : path.replace(/^\/+/, "");
  // Confine to PUBLIC_DIR (no traversal).
  if (file.includes("..")) {
    sendJson(res, 400, { error: "bad path" });
    return;
  }
  try {
    const body = readFileSync(join(PUBLIC_DIR, file));
    res.writeHead(200, { "content-type": contentType(file) });
    res.end(body);
  } catch {
    sendJson(res, 404, { error: "not found" });
  }
}

/**
 * POST /api/verify — verify a proof emitted by /api/prove with the real
 * off-chain Groth16 check. Reconstructs a ServiceProof from the honest payload
 * (pinned MERKLE_DEPTH, default message 0 — the constants prove uses) and runs
 * verifyService over the exact points + public inputs the prove call produced.
 * It verifies that artifact; it never re-proves.
 */
async function verifyProvePayload(body: unknown): Promise<{ verified: boolean }> {
  const b = body as Partial<ProveResponse>;
  const pi = b?.public_inputs;
  const points = b?.proof?.points;
  if (!pi?.merkle_root || !pi?.nullifier || !pi?.external_nullifier || !Array.isArray(points)) {
    throw new HttpError(
      400,
      "malformed proof: need public_inputs.{merkle_root,nullifier,external_nullifier} + proof.points",
    );
  }
  const proof: SemaphoreProof = {
    merkleTreeDepth: MERKLE_DEPTH,
    merkleTreeRoot: pi.merkle_root,
    message: "0",
    nullifier: pi.nullifier,
    scope: pi.external_nullifier,
    points: points as SemaphoreProof["points"],
  };
  const serviceProof: ServiceProof = {
    proof,
    scope: BigInt(pi.external_nullifier),
    nullifier: BigInt(pi.nullifier),
  };
  return { verified: await verifyService(serviceProof) };
}

/** Parse a positive integer `limit` query param, falling back when absent/bad. */
function parseLimit(req: IncomingMessage, fallback: number): number {
  const v = new URL(req.url ?? "", "http://x").searchParams.get("limit");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseService(body: unknown): ServiceId {
  const service = (body as { service?: string }).service;
  if (!SERVICES.includes(service as ServiceId)) {
    throw new HttpError(400, `unknown service ${String(service)}`);
  }
  return service as ServiceId;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
}

function contentType(file: string): string {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function shortHash(hex: string): string {
  return `${hex.slice(0, 10)}…${hex.slice(-6)}`;
}
