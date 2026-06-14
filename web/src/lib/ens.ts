/**
 * ENS read layer — live, on-chain resolution via ethers v6.
 *
 * No ENS names or addresses are hard-coded anywhere: every value is resolved
 * live from mainnet through a JsonRpcProvider pointed at VITE_ENS_RPC_URL. The
 * provider is lazily constructed and memoized; unit tests inject a mock through
 * `__setEnsProviderForTests`, so no test ever touches the network.
 */
import { JsonRpcProvider, Network, isAddress } from "ethers";

/** Public mainnet node used when VITE_ENS_RPC_URL is unset (no API key). */
const DEFAULT_ENS_RPC_URL = "https://ethereum-rpc.publicnode.com";

/** The configured mainnet RPC endpoint (env override + safe public default). */
export function ensRpcUrl(): string {
  return (import.meta.env.VITE_ENS_RPC_URL as string | undefined) ?? DEFAULT_ENS_RPC_URL;
}

/** The minimal ENS resolver surface this module reads. */
export interface EnsResolverLike {
  getText(key: string): Promise<string | null>;
  getAvatar(): Promise<string | null>;
}

/** The minimal provider surface this module needs — keeps the mock seam tiny. */
export interface EnsProviderLike {
  resolveName(name: string): Promise<string | null>;
  lookupAddress(address: string): Promise<string | null>;
  getResolver(name: string): Promise<EnsResolverLike | null>;
}

let provider: EnsProviderLike | null = null;

/** Lazily build (and memoize) a mainnet provider for ENS reads. */
export function getEnsProvider(): EnsProviderLike {
  if (!provider) {
    // Pin mainnet + staticNetwork so we never auto-detect onto the wrong chain
    // and skip an extra eth_chainId round-trip on every call.
    provider = new JsonRpcProvider(ensRpcUrl(), Network.from("mainnet"), {
      staticNetwork: true,
    });
  }
  return provider;
}

/** Test seam: swap in a mock provider (pass `null` to reset to the real one). */
export function __setEnsProviderForTests(mock: EnsProviderLike | null): void {
  provider = mock;
}

/** Forward resolution: ENS name → address (null if unregistered/empty). */
export async function resolveName(name: string): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  return getEnsProvider().resolveName(n);
}

/** Reverse resolution: address → primary ENS name (null if none / not an address). */
export async function lookupAddress(address: string): Promise<string | null> {
  const a = address?.trim();
  if (!a || !isAddress(a)) return null;
  return getEnsProvider().lookupAddress(a);
}

/** A single ENS text record (e.g. "com.twitter", "url", "description"). */
export async function getTextRecord(name: string, key: string): Promise<string | null> {
  const n = name?.trim();
  if (!n || !key) return null;
  const resolver = await getEnsProvider().getResolver(n);
  return resolver ? resolver.getText(key) : null;
}

/** The avatar URL declared by an ENS name (null if none / no resolver). */
export async function getAvatar(name: string): Promise<string | null> {
  const n = name?.trim();
  if (!n) return null;
  const resolver = await getEnsProvider().getResolver(n);
  return resolver ? resolver.getAvatar() : null;
}
