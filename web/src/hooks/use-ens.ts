/**
 * useEns — react-query wrapper over the live ENS read layer (src/lib/ens.ts).
 *
 * Accepts either an ENS name or a 0x address and resolves a unified profile
 * (name ⇄ address, avatar, and any requested text records) — all live from
 * chain, nothing hard-coded. An empty input keeps the query disabled.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { isAddress } from "ethers";
import { getAvatar, getTextRecord, lookupAddress, resolveName } from "@/lib/ens";

export interface EnsProfile {
  /** The raw input that was looked up. */
  query: string;
  /** ENS name: the input itself (name) or the reverse-resolved primary (address). */
  name: string | null;
  /** Address: the input itself (address) or the forward-resolved target (name). */
  address: string | null;
  /** Avatar URL declared by `name`, if any. */
  avatar: string | null;
  /** Requested text records, keyed by record key (null when absent). */
  records: Record<string, string | null>;
}

/**
 * Resolve an ENS name or address to a full on-chain profile.
 *
 * @param nameOrAddress ENS name (`foo.eth`) or 0x address. Empty disables the query.
 * @param textKeys      Optional ENS text-record keys to fetch (e.g. `["com.twitter"]`).
 */
export function useEns(
  nameOrAddress?: string,
  textKeys: string[] = [],
): UseQueryResult<EnsProfile> {
  const input = (nameOrAddress ?? "").trim();

  return useQuery<EnsProfile>({
    queryKey: ["ens", input, textKeys],
    enabled: input.length > 0,
    staleTime: 5 * 60_000, // ENS records change rarely; cache for 5 min.
    retry: 1,
    queryFn: async () => {
      const asAddress = isAddress(input);
      const name = asAddress ? await lookupAddress(input) : input;
      const address = asAddress ? input : await resolveName(input);
      const avatar = name ? await getAvatar(name) : null;

      const records: Record<string, string | null> = {};
      for (const key of textKeys) {
        records[key] = name ? await getTextRecord(name, key) : null;
      }

      return { query: input, name, address, avatar, records };
    },
  });
}
