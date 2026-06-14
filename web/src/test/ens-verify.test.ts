/**
 * Unit test for the ENS → Pramaana verification logic (S3). Both dependencies —
 * the ENS text-record read and the on-chain Registry lookup — are mocked, so
 * these assertions never touch the network and pin the exact branch behaviour,
 * including the privacy invariant that a `verified` result leaks no Φ.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyEns, PRAMAANA_PHI_RECORD } from "@/lib/ens-verify";
import { getTextRecord } from "@/lib/ens";
import { pramaana } from "@/lib/pramaana-client";

vi.mock("@/lib/ens", () => ({ getTextRecord: vi.fn() }));
vi.mock("@/lib/pramaana-client", () => ({ pramaana: { registryLookup: vi.fn() } }));

const getText = vi.mocked(getTextRecord);
const lookup = vi.mocked(pramaana.registryLookup);

// An arbitrary 64-hex-char Φ. It encodes no real identity — every result below
// comes from the mock, not from this value.
const PHI = "0x" + "ab".repeat(32);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("verifyEns (mocked ENS + registry)", () => {
  it("verified: published Φ is registered — and the result leaks no Φ", async () => {
    getText.mockResolvedValue(PHI);
    lookup.mockResolvedValue({
      registered: true,
      setIndex: 3,
      txHash: "0xdead",
      blockNumber: 7,
      biometricMatch: null,
    });

    const r = await verifyEns("alice.eth");

    expect(r).toEqual({ status: "verified", name: "alice.eth" });
    expect(r).not.toHaveProperty("phi"); // privacy: success reveals no identity
    expect(getText).toHaveBeenCalledWith("alice.eth", PRAMAANA_PHI_RECORD);
    expect(lookup).toHaveBeenCalledWith(PHI);
  });

  it("unregistered: record present but that Φ is not on-chain", async () => {
    getText.mockResolvedValue(PHI);
    lookup.mockResolvedValue({
      registered: false,
      setIndex: null,
      txHash: null,
      blockNumber: null,
      biometricMatch: null,
    });

    const r = await verifyEns("bob.eth");
    expect(r).toEqual({ status: "unregistered", name: "bob.eth", phi: PHI });
  });

  it("no-record: no pramaana.phi → the registry is never queried", async () => {
    getText.mockResolvedValue(null);

    const r = await verifyEns("nobody.eth");
    expect(r).toEqual({ status: "no-record", name: "nobody.eth" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("registry-unavailable: backend down → degrade and surface the record", async () => {
    getText.mockResolvedValue(PHI);
    lookup.mockRejectedValue(new Error("/api/registry/lookup failed: fetch 8080"));

    const r = await verifyEns("carol.eth");
    expect(r.status).toBe("registry-unavailable");
    if (r.status === "registry-unavailable") {
      expect(r.phi).toBe(PHI);
      expect(r.error).toContain("8080");
    }
  });

  it("trims the name and treats a blank record as no-record", async () => {
    getText.mockResolvedValue("   ");
    const r = await verifyEns("  spacey.eth  ");
    expect(r).toEqual({ status: "no-record", name: "spacey.eth" });
    expect(getText).toHaveBeenCalledWith("spacey.eth", PRAMAANA_PHI_RECORD);
    expect(lookup).not.toHaveBeenCalled();
  });
});
