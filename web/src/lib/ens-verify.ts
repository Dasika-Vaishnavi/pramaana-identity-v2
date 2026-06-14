/**
 * ENS → Pramaana verification (S3, the bounty core).
 *
 * Given an ENS name, this reads the name's public `pramaana.phi` text record —
 * the Φ commitment the name's owner published — and cross-checks it against the
 * live on-chain Registry via PramaanaClient.registryLookup. A name counts as
 * "verified" ONLY when the Registry confirms that exact Φ is registered.
 *
 * Privacy invariant: the `verified` result deliberately carries NO Φ and NO
 * on-chain coordinates. A caller learns "this name is a verified unique human"
 * and nothing that correlates the name to an identity. The Φ value is surfaced
 * only on the degraded path (Registry unreachable) — where it is the literal,
 * already-public ENS record and verification could not complete — never on a
 * successful match.
 *
 * Every value is read live: the ENS record from mainnet (src/lib/ens.ts) and the
 * registration from the chain-backed backend (src/lib/pramaana-client.ts). No ENS
 * names, addresses, or Φ values are hard-coded anywhere in this module.
 */
import { getTextRecord } from "@/lib/ens";
import { pramaana } from "@/lib/pramaana-client";

/** The ENS text-record key under which a name publishes its Pramaana Φ. */
export const PRAMAANA_PHI_RECORD = "pramaana.phi";

/**
 * The outcome of verifying an ENS name against the Registry. A discriminated
 * union so the UI renders exactly one state — and so `verified` is structurally
 * incapable of leaking Φ.
 */
export type EnsVerification =
  /** Match: the published Φ is registered on-chain. Carries no identity data. */
  | { status: "verified"; name: string }
  /** The name published a `pramaana.phi` record, but that Φ is NOT registered. */
  | { status: "unregistered"; name: string; phi: string }
  /** The name has no `pramaana.phi` record (no Pramaana identity published). */
  | { status: "no-record"; name: string }
  /** Registry (:8080) unreachable — degrade gracefully, surface the record. */
  | { status: "registry-unavailable"; name: string; phi: string; error: string };

/**
 * Verify an ENS name: read its `pramaana.phi` record, then cross-check against
 * the on-chain Registry. Never throws for a missing record or an unreachable
 * Registry (those are returned as states); only a failed ENS read itself rejects.
 */
export async function verifyEns(name: string): Promise<EnsVerification> {
  const n = name?.trim();
  if (!n) return { status: "no-record", name: "" };

  // 1. Live mainnet ENS read: the Φ commitment this name published (null if none).
  const record = (await getTextRecord(n, PRAMAANA_PHI_RECORD))?.trim();
  if (!record) return { status: "no-record", name: n };

  // 2. Cross-check that exact Φ against the live, chain-backed Registry.
  try {
    const lookup = await pramaana.registryLookup(record);
    return lookup.registered
      ? { status: "verified", name: n } // success carries NO Φ — privacy invariant
      : { status: "unregistered", name: n, phi: record };
  } catch (e) {
    // The Registry could not be reached — do not claim (or deny) verification.
    return {
      status: "registry-unavailable",
      name: n,
      phi: record,
      error: e instanceof Error ? e.message : "registry unreachable",
    };
  }
}
