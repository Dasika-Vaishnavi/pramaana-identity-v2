/**
 * C5 — standalone Semaphore prove/verify endpoints (Decision 2).
 * Proves the §3 unlinkability + real Groth16 round-trip: one enrolled identity
 * proving for two services yields two DISTINCT nullifiers (cross-service
 * unlinkable), both verify off-chain, and a tampered nullifier fails to verify.
 * These endpoints must NOT spend the nullifier on-chain (distinct from claim).
 */

import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer, type DemoServer } from "../src/server.js";
import { orchestrate, type Backends } from "../src/orchestrate.js";

let backends: Backends;
let server: DemoServer;
let base: string;

beforeAll(async () => {
  backends = await orchestrate({ anvilPort: 8554, teePort: 9974 });
  server = await createDemoServer({ teeUrl: backends.teeUrl, rpcUrl: backends.rpcUrl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  backends?.stop();
});

const post = async (path: string, body?: unknown) => {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: body !== undefined ? { "content-type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, json: await res.json() };
};

describe("C5 — prove/verify (honest ZK shape, off-chain Groth16)", () => {
  it("/api/prove requires an enrolled session", async () => {
    const r = await post("/api/prove", { service: "airdrop-alpha" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
  });

  it("two services → distinct nullifiers, both verify; tamper fails", async () => {
    const enroll = await post("/api/enroll");
    expect(enroll.json.alreadyEnrolled).toBe(false);

    const alpha = (await post("/api/prove", { service: "airdrop-alpha" })).json;
    const beta = (await post("/api/prove", { service: "airdrop-beta" })).json;

    // Honest shape (Decision 2).
    expect(alpha.proof_type).toBe("groth16");
    expect(alpha.proof.merkle_path).toEqual([]);
    expect(alpha.proof.binding_commitment).toBeNull();
    expect(alpha.zk_note.length).toBeGreaterThan(0);
    expect(alpha.proof.points).toHaveLength(8);
    expect(alpha.public_inputs.merkle_root).toMatch(/^\d+$/);

    // Unlinkability: same identity, different service → different nullifier,
    // but the same anonymity-set Merkle root.
    expect(alpha.public_inputs.nullifier).not.toBe(beta.public_inputs.nullifier);
    expect(alpha.public_inputs.external_nullifier).not.toBe(beta.public_inputs.external_nullifier);
    expect(alpha.public_inputs.merkle_root).toBe(beta.public_inputs.merkle_root);

    // Both real proofs verify off-chain.
    expect((await post("/api/verify", alpha)).json.verified).toBe(true);
    expect((await post("/api/verify", beta)).json.verified).toBe(true);

    // Tampering the nullifier breaks the Groth16 check.
    const tampered = {
      ...alpha,
      public_inputs: { ...alpha.public_inputs, nullifier: (BigInt(alpha.public_inputs.nullifier) + 1n).toString() },
    };
    expect((await post("/api/verify", tampered)).json.verified).toBe(false);
  });
});
