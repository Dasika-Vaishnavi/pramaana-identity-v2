/**
 * Unit coverage for the World ID backend gate (app/src/worldid.ts). These
 * assert the trust-boundary rules that the e2e flow can't reach with a single
 * fixture identity: credential-type enforcement, malformed-input rejection, and
 * the anti-bypass invariant that a stub token is NEVER honoured in live mode.
 */

import { describe, expect, it } from "vitest";
import {
  loadWorldIdConfig,
  makeStubProof,
  PLACEHOLDER_APP_ID,
  verifyProofOfHuman,
  type WorldIdConfig,
} from "../src/worldid.js";

const STUB_CFG: WorldIdConfig = {
  appId: PLACEHOLDER_APP_ID,
  action: "pramaana-airdrop",
  rpId: PLACEHOLDER_APP_ID,
  mode: "stub",
};
const HUMAN = "0x" + "ab".repeat(32);

describe("loadWorldIdConfig", () => {
  it("defaults to stub mode with no / placeholder APP_ID", () => {
    expect(loadWorldIdConfig({}).mode).toBe("stub");
    expect(loadWorldIdConfig({ APP_ID: PLACEHOLDER_APP_ID }).mode).toBe("stub");
  });

  it("infers live mode from a real APP_ID, and an explicit override wins", () => {
    expect(loadWorldIdConfig({ APP_ID: "app_realid" }).mode).toBe("live");
    expect(loadWorldIdConfig({ APP_ID: "app_realid", WORLDID_MODE: "stub" }).mode).toBe("stub");
    expect(loadWorldIdConfig({ WORLDID_MODE: "live" }).mode).toBe("live");
  });
});

describe("verifyProofOfHuman — stub mode", () => {
  it("accepts a well-formed stub proof_of_human", async () => {
    const r = await verifyProofOfHuman(makeStubProof(HUMAN), STUB_CFG);
    expect(r.ok).toBe(true);
    expect(r.nullifierHash).toBe(HUMAN);
    expect(r.credentialType).toBe("proof_of_human");
  });

  it("rejects a missing proof (the gate breaks)", async () => {
    const r = await verifyProofOfHuman(undefined, STUB_CFG);
    expect(r.ok).toBe(false);
  });

  it("rejects the wrong credential type", async () => {
    const r = await verifyProofOfHuman(
      { stub: true, credential_type: "selfie", nullifier_hash: HUMAN },
      STUB_CFG,
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed nullifier_hash", async () => {
    const r = await verifyProofOfHuman(
      { stub: true, credential_type: "proof_of_human", nullifier_hash: "not-hex" },
      STUB_CFG,
    );
    expect(r.ok).toBe(false);
  });
});

describe("verifyProofOfHuman — live mode anti-bypass", () => {
  it("NEVER honours a stub token when mode is live", async () => {
    const liveCfg: WorldIdConfig = { ...STUB_CFG, appId: "app_realid", mode: "live" };
    const r = await verifyProofOfHuman(makeStubProof(HUMAN), liveCfg);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/live mode rejects stub/i);
  });
});
