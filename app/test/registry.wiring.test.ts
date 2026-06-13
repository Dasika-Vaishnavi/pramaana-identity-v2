/**
 * Commit 2 (W2 Decision 3, part 1): enroll routes through the on-chain Registry.
 * Proves the chain side is real — a fresh Φ registers and increments
 * identityCount, a dedup re-enroll does NOT double-count, and the contract
 * itself rejects a duplicate Φ. Spawns its own anvil + tee-server (a fresh
 * tee-server = a fresh dedup set, so the fixture Φ is genuinely new here).
 */

import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDemoServer,
  phi64ToBytes32,
  simGateZProof,
  type DemoServer,
} from "../src/server.js";
import { orchestrate, type Backends } from "../src/orchestrate.js";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
// anvil's SECOND dev account — deliberately NOT the server's deployer (account0),
// so the test's direct register() calls don't share/desync account0's nonce.
const ANVIL_KEY1 = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const registryAbi = JSON.parse(
  readFileSync(join(REPO_ROOT, "contracts", "out", "Registry.sol", "Registry.json"), "utf8"),
).abi;

let backends: Backends;
let server: DemoServer;
let base: string;
let provider: JsonRpcProvider;
let registry: Contract;

beforeAll(async () => {
  backends = await orchestrate({ anvilPort: 8552, teePort: 9972 });
  server = await createDemoServer({ teeUrl: backends.teeUrl, rpcUrl: backends.rpcUrl });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  provider = new JsonRpcProvider(backends.rpcUrl);
  registry = new Contract(server.registryAddress, registryAbi, new Wallet(ANVIL_KEY1, provider));
});

afterAll(() => {
  provider?.destroy();
  server?.close();
  backends?.stop();
});

async function enroll(): Promise<{ phi: string; alreadyEnrolled: boolean }> {
  const res = await fetch(`${base}/api/enroll`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ phi: string; alreadyEnrolled: boolean }>;
}

describe("Decision 3 pt1 — enroll registers Φ on-chain", () => {
  it("a fresh Φ registers; a dedup re-enroll does not double-count", async () => {
    expect(await registry.identityCount()).toBe(0n);

    const first = await enroll();
    expect(first.alreadyEnrolled).toBe(false);
    expect(await registry.identityCount()).toBe(1n);

    // Same synthetic fixture → same Φ → TEE dedup hit. No second on-chain mint.
    const second = await enroll();
    expect(second.alreadyEnrolled).toBe(true);
    expect(await registry.identityCount()).toBe(1n);
  });

  it("the contract rejects a duplicate Φ (register reverts)", async () => {
    const phi32 = phi64ToBytes32("ab".repeat(64)); // arbitrary 64-byte Φ
    const dedup = `0x${"cd".repeat(32)}`;

    const tx = await registry.register(phi32, dedup, simGateZProof(phi32));
    await tx.wait();
    expect(await registry.identityCount()).toBe(2n);

    // A repeat of the same Φ reverts. staticCall does an eth_call against current
    // state (no tx/nonce) and surfaces the decoded custom error.
    await expect(registry.register.staticCall(phi32, dedup, simGateZProof(phi32))).rejects.toThrow(
      /DuplicatePhi/,
    );
    expect(await registry.identityCount()).toBe(2n);
  });
});
