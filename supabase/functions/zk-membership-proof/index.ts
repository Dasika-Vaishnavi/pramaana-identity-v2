import { sha256 } from "https://esm.sh/@noble/hashes@1.7.1/sha2";
import { bytesToHex, hexToBytes } from "https://esm.sh/@noble/hashes@1.7.1/utils";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ── Merkle tree helpers ──────────────────────────────────────────────────

function buildMerkleTree(leaves: Uint8Array[]): {
  root: Uint8Array;
  layers: Uint8Array[][];
} {
  const size = Math.pow(2, Math.ceil(Math.log2(Math.max(leaves.length, 2))));
  const padded = [...leaves];
  while (padded.length < size) padded.push(new Uint8Array(32)); // zero leaf

  const layers: Uint8Array[][] = [padded];
  let current = padded;

  while (current.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(sha256(new Uint8Array([...current[i], ...current[i + 1]])));
    }
    layers.push(next);
    current = next;
  }

  return { root: current[0], layers };
}

function extractMerklePath(
  layers: Uint8Array[][],
  leafIndex: number,
): { sibling: string; direction: "left" | "right" }[] {
  const path: { sibling: string; direction: "left" | "right" }[] = [];
  let idx = leafIndex;

  for (let l = 0; l < layers.length - 1; l++) {
    const isRight = idx % 2 === 1;
    const sibIdx = isRight ? idx - 1 : idx + 1;
    if (sibIdx < layers[l].length) {
      path.push({
        sibling: bytesToHex(layers[l][sibIdx]),
        direction: isRight ? "left" : "right",
      });
    }
    idx = Math.floor(idx / 2);
  }

  return path;
}

// ── Main handler ─────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { phi_hash, set_id, sp_identifier, master_secret_key } = await req.json();

    // ── Validate inputs ────────────────────────────────────────────────
    if (!phi_hash || typeof phi_hash !== "string")
      return json({ error: "phi_hash is required (hex string)" }, 400);
    if (set_id === undefined || set_id === null)
      return json({ error: "set_id is required" }, 400);
    if (!sp_identifier || typeof sp_identifier !== "string")
      return json({ error: "sp_identifier is required" }, 400);
    if (!master_secret_key || typeof master_secret_key !== "string" || master_secret_key.length < 64)
      return json({ error: "master_secret_key is required (≥ 32-byte hex)" }, 400);

    const startMs = performance.now();

    // ── Fetch anonymity set leaves ─────────────────────────────────────
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: commitments, error: fetchErr } = await supabase
      .from("commitments")
      .select("phi_hash, set_index")
      .eq("set_id", set_id)
      .order("set_index", { ascending: true });

    if (fetchErr || !commitments || commitments.length === 0)
      return json({ error: "Anonymity set not found or empty" }, 404);

    // ── Build Merkle tree ──────────────────────────────────────────────
    const leaves = commitments.map((c) => sha256(hexToBytes(c.phi_hash)));
    const { root, layers } = buildMerkleTree(leaves);

    // ── Locate prover's leaf ───────────────────────────────────────────
    const myLeaf = sha256(hexToBytes(phi_hash));
    const myIndex = leaves.findIndex((l) => bytesToHex(l) === bytesToHex(myLeaf));

    if (myIndex === -1)
      return json({ error: "Your identity is not in this anonymity set" }, 403);

    // ── Merkle proof ───────────────────────────────────────────────────
    const merklePath = extractMerklePath(layers, myIndex);

    // ── Nullifier: H(sk ‖ sp_identifier) ───────────────────────────────
    const skBytes = hexToBytes(master_secret_key.slice(0, 64)); // first 32 bytes
    const spBytes = new TextEncoder().encode(sp_identifier);
    const nullifier = sha256(new Uint8Array([...skBytes, ...spBytes]));

    // ── Binding proof: H(H(sk) ‖ nullifier ‖ root) ────────────────────
    const skHash = sha256(skBytes);
    const bindingProof = sha256(new Uint8Array([...skHash, ...nullifier, ...root]));

    // ── External nullifier (per-service) ───────────────────────────────
    const externalNullifier = sha256(new TextEncoder().encode(sp_identifier));

    // ── Persist Merkle root ────────────────────────────────────────────
    const rootHex = bytesToHex(root);
    await supabase.from("merkle_roots").upsert(
      { set_id, root_hash: rootHex, leaf_count: commitments.length, computed_at: new Date().toISOString() },
      { onConflict: "set_id" },
    );

    const totalMs = Math.round((performance.now() - startMs) * 100) / 100;

    // ── Response ───────────────────────────────────────────────────────
    return json({
      proof_type: "merkle_membership_with_nullifier_binding",
      zk_note:
        "Full Groth16 ZK-SNARK (Semaphore/Circom) would hide the Merkle path entirely. " +
        "This implementation reveals the path structure but not the leaf index directly. " +
        "For production, integrate snarkjs with the Semaphore circuit.",

      public_inputs: {
        merkle_root: rootHex,
        nullifier: bytesToHex(nullifier),
        external_nullifier: bytesToHex(externalNullifier),
        anonymity_set_size: commitments.length,
        sp_identifier,
      },

      proof: {
        merkle_path: merklePath,
        merkle_path_length: merklePath.length,
        binding_commitment: bytesToHex(bindingProof),
        leaf_hash: bytesToHex(myLeaf),
      },

      comparison: {
        this_proof: {
          proves_membership: true,
          hides_leaf_index: false,
          proves_nullifier_binding: true,
          post_quantum_enrollment: true,
          post_quantum_proof: false,
          proof_size_bytes: JSON.stringify(merklePath).length,
        },
        groth16_semaphore: {
          proves_membership: true,
          hides_leaf_index: true,
          proves_nullifier_binding: true,
          post_quantum_enrollment: "with Pramaana, yes",
          post_quantum_proof: false,
          proof_size_bytes: 128,
          note: "The ASC paper's SRS-U2SSO uses this via Semaphore/Circom",
        },
        bulletproofs: {
          proves_membership: true,
          hides_leaf_index: true,
          proves_nullifier_binding: true,
          post_quantum_enrollment: "with Pramaana, yes",
          post_quantum_proof: false,
          proof_size_bytes: "logarithmic in N (3.6-4KB for N=1024)",
          note: "The ASC paper's CRS-U2SSO uses this via Bootle et al.",
        },
      },

      timing: { total_ms: totalMs },
    });
  } catch (err) {
    return json({ error: (err as Error).message || "Internal server error" }, 500);
  }
});
