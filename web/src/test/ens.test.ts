/**
 * Unit test for the ENS read layer. A fake provider is injected through the
 * `__setEnsProviderForTests` seam, so these assertions never touch the network
 * and pin exactly which provider method each exported function calls.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __setEnsProviderForTests,
  getAvatar,
  getTextRecord,
  lookupAddress,
  resolveName,
  type EnsProviderLike,
} from "@/lib/ens";

// A syntactically-valid but arbitrary address, only used to exercise isAddress().
// It encodes no "known" ENS mapping — the resolution result comes from the mock.
const SAMPLE_ADDRESS = "0x1234567890123456789012345678901234567890";

afterEach(() => {
  __setEnsProviderForTests(null); // reset to the real lazy provider
  vi.restoreAllMocks();
});

function mockProvider(overrides: Partial<EnsProviderLike> = {}): EnsProviderLike {
  return {
    resolveName: vi.fn().mockResolvedValue(SAMPLE_ADDRESS),
    lookupAddress: vi.fn().mockResolvedValue("alice.eth"),
    getResolver: vi.fn().mockResolvedValue({
      getText: vi.fn().mockResolvedValue("@pramaana"),
      getAvatar: vi.fn().mockResolvedValue("https://img.example/a.png"),
    }),
    ...overrides,
  };
}

describe("ens read layer (mocked provider)", () => {
  it("resolveName delegates to provider.resolveName", async () => {
    const p = mockProvider();
    __setEnsProviderForTests(p);
    await expect(resolveName("alice.eth")).resolves.toBe(SAMPLE_ADDRESS);
    expect(p.resolveName).toHaveBeenCalledWith("alice.eth");
  });

  it("lookupAddress reverse-resolves a valid address", async () => {
    const p = mockProvider();
    __setEnsProviderForTests(p);
    await expect(lookupAddress(SAMPLE_ADDRESS)).resolves.toBe("alice.eth");
    expect(p.lookupAddress).toHaveBeenCalledWith(SAMPLE_ADDRESS);
  });

  it("lookupAddress rejects a non-address without hitting the provider", async () => {
    const p = mockProvider();
    __setEnsProviderForTests(p);
    await expect(lookupAddress("not-an-address")).resolves.toBeNull();
    expect(p.lookupAddress).not.toHaveBeenCalled();
  });

  it("getTextRecord reads through the resolver", async () => {
    const p = mockProvider();
    __setEnsProviderForTests(p);
    await expect(getTextRecord("alice.eth", "com.twitter")).resolves.toBe("@pramaana");
    expect(p.getResolver).toHaveBeenCalledWith("alice.eth");
  });

  it("getAvatar returns null when the name has no resolver", async () => {
    const p = mockProvider({ getResolver: vi.fn().mockResolvedValue(null) });
    __setEnsProviderForTests(p);
    await expect(getAvatar("nobody.eth")).resolves.toBeNull();
  });

  it("empty / whitespace inputs short-circuit to null", async () => {
    const p = mockProvider();
    __setEnsProviderForTests(p);
    await expect(resolveName("")).resolves.toBeNull();
    await expect(getAvatar("   ")).resolves.toBeNull();
    expect(p.resolveName).not.toHaveBeenCalled();
    expect(p.getResolver).not.toHaveBeenCalled();
  });
});
