/**
 * C4 — registry-read endpoints serve real on-chain/in-memory data.
 * A single enroll must show up everywhere: stats.total === 1, the feed's newest
 * row at setIndex 0 with a real txHash, lookup(Φ) registered, and one
 * enrollment-log row. Spawns its own anvil + tee-server (a fresh chain, so the
 * fixture Φ is genuinely new and lands at ordinal 0).
 */

import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDemoServer, type DemoServer } from "../src/server.js";
import { orchestrate, type Backends } from "../src/orchestrate.js";

let backends: Backends;
let server: DemoServer;
let base: string;

beforeAll(async () => {
  backends = await orchestrate({ anvilPort: 8553, teePort: 9973 });
  server = await createDemoServer({ teeUrl: backends.teeUrl, rpcUrl: backends.rpcUrl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  backends?.stop();
});

const getJson = async (path: string) => {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res.json();
};

describe("C4 — registry-read endpoints reflect a real enroll", () => {
  it("one enroll surfaces real data across stats/feed/lookup/enrollment-log", async () => {
    const enroll = await (await fetch(`${base}/api/enroll`, { method: "POST" })).json();
    expect(enroll.alreadyEnrolled).toBe(false);

    const stats = await getJson("/api/registry/stats");
    expect(stats.total).toBe(1);
    expect(stats.onChainConfirmed).toBe(1);

    const feed = await getJson("/api/registry/feed?limit=10");
    expect(feed).toHaveLength(1);
    expect(feed[0].setIndex).toBe(0);
    expect(feed[0].txHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(typeof feed[0].blockNumber).toBe("number");

    const lookup = await getJson(`/api/registry/lookup?phi=${enroll.phi}`);
    expect(lookup.registered).toBe(true);
    expect(lookup.setIndex).toBe(0);
    expect(lookup.txHash).toBe(feed[0].txHash);

    // A never-registered Φ is honestly reported as not registered.
    const miss = await getJson(`/api/registry/lookup?phi=${"00".repeat(64)}`);
    expect(miss.registered).toBe(false);
    expect(miss.setIndex).toBeNull();

    const log = await getJson("/api/enrollment-log");
    expect(log).toHaveLength(1);
    expect(log[0].setIndex).toBe(0);
    expect(log[0].txHash).toBe(feed[0].txHash);
  });
});
