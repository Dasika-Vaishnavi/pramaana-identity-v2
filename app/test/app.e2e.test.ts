/**
 * DoD click-through, driven over the demo's HTTP API (the same calls the
 * browser makes): enroll → claim Alpha (claimed) → claim Alpha again
 * (blocked) → claim Beta (claimed) → Alpha vs Beta nullifiers are
 * uncorrelatable. Spawns anvil + tee-server + the app server.
 */

import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer } from "../src/server.js";
import { orchestrate, type Backends } from "../src/orchestrate.js";

let backends: Backends;
let server: Server;
let base: string;

async function api(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? res.statusText);
  return data;
}

/** Like api() but returns the raw status without throwing (for 403 gate cases). */
async function rawApi(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json() };
}

/** A labelled stub World ID proof-of-human (server runs in stub mode in CI). */
function stubHuman(nullifierHash: string) {
  return { stub: true, credential_type: "proof_of_human", nullifier_hash: nullifierHash };
}

/** Claim carrying a valid stub proof-of-human. */
function claim(service: string, nullifierHash: string) {
  return api("POST", "/api/claim", { service, worldIdProof: stubHuman(nullifierHash) });
}

beforeAll(async () => {
  backends = await orchestrate({ anvilPort: 8551, teePort: 9971 });
  server = await createDemoServer({ teeUrl: backends.teeUrl, rpcUrl: backends.rpcUrl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  backends?.stop();
});

describe("Sybil-resistant airdrop demo", () => {
  it("serves the UI", async () => {
    const res = await fetch(`${base}/`);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("One human");
  });

  it("DoD: World ID gates claim → enroll → claim → second blocked → unlinkable", async () => {
    await api("POST", "/api/reset");
    const HUMAN = "0x" + "b2".repeat(32);
    const enroll = await api("POST", "/api/enroll");
    expect(enroll.phi).toMatch(/^[0-9a-f]{128}$/); // Φ = SHA3-512
    expect(enroll.alreadyEnrolled).toBe(false);

    // GATE BREAKS without proof-of-human: a claim with no World ID proof is
    // rejected (403) and spends NOTHING (the valid claim below still succeeds).
    const noProof = await rawApi("POST", "/api/claim", { service: "airdrop-alpha" });
    expect(noProof.status).toBe(403);
    expect(noProof.data.error).toMatch(/proof-of-human required/i);

    // Wrong credential type is also rejected by the backend verifier.
    const badType = await rawApi("POST", "/api/claim", {
      service: "airdrop-alpha",
      worldIdProof: { stub: true, credential_type: "selfie", nullifier_hash: HUMAN },
    });
    expect(badType.status).toBe(403);

    // Airdrop Alpha: first claim succeeds once a valid proof-of-human is given.
    const alpha1 = await claim("airdrop-alpha", HUMAN);
    expect(alpha1.status).toBe("claimed");
    expect(alpha1.worldIdMode).toBe("stub"); // CI runs the backend in stub mode

    // Same human, same airdrop, again → Sybil block (nullifier already spent).
    const alpha2 = await claim("airdrop-alpha", HUMAN);
    expect(alpha2.status).toBe("blocked");
    expect(alpha2.nullifier).toBe(alpha1.nullifier); // same deterministic nullifier

    // Airdrop Beta: independent service → claim succeeds for the same human.
    const beta1 = await claim("airdrop-beta", HUMAN);
    expect(beta1.status).toBe("claimed");

    // Unlinkability: the two services see different nullifiers and scopes,
    // sharing no value — they cannot correlate the same human.
    expect(beta1.nullifier).not.toBe(alpha1.nullifier);
    expect(beta1.scope).not.toBe(alpha1.scope);
    const seenByAlpha = [alpha1.nullifier, alpha1.scope];
    const seenByBeta = [beta1.nullifier, beta1.scope];
    expect(seenByAlpha.filter((v) => seenByBeta.includes(v))).toHaveLength(0);
  });

  it("reset clears the session", async () => {
    await api("POST", "/api/reset");
    const state = await api("GET", "/api/state");
    expect(state.enrollment).toBeNull();
    expect(Object.keys(state.claims)).toHaveLength(0);
  });
});
