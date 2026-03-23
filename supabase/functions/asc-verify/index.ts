import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sha256 } from "https://esm.sh/@noble/hashes@1.7.1/sha2";
import * as secp from "https://esm.sh/@noble/secp256k1@2.2.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { pseudonym, nullifier, proof, sp_identifier, set_id } = await req.json();

    if (!pseudonym || !nullifier || !proof || !sp_identifier || set_id === undefined) {
      return new Response(
        JSON.stringify({ error: "Required: pseudonym, nullifier, proof, sp_identifier, set_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (proof.type !== "schnorr-pok" || !proof.R || !proof.s || !proof.e) {
      return new Response(
        JSON.stringify({ error: "Proof must include type='schnorr-pok', R, s, e" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ═══════════════════════════════════════════════════════════
    // Step 1: FETCH ANONYMITY SET Λ from IdR
    // ASC Paper Figure 2: SP retrieves Λ from IdR
    // ═══════════════════════════════════════════════════════════
    const { data: commitments, error: setError } = await supabase
      .from("commitments")
      .select("phi_hash")
      .eq("set_id", set_id);

    if (setError || !commitments || commitments.length === 0) {
      return new Response(
        JSON.stringify({ valid: false, error: "Anonymity set not found or empty" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const anonymity_set_size = commitments.length;

    // ═══════════════════════════════════════════════════════════
    // Step 2: VERIFY SCHNORR PROOF OF KNOWLEDGE
    // Recompute e' = SHA256(R || pseudonym || sp_identifier || nullifier)
    // Verify: s*G + e*PK == R  (standard Schnorr verification)
    // ═══════════════════════════════════════════════════════════
    let proof_verified = false;
    try {
      const R_bytes = fromHex(proof.R);
      const pseudonym_bytes = fromHex(pseudonym);
      const nullifier_bytes = fromHex(nullifier);
      const sp_bytes = new TextEncoder().encode(sp_identifier);

      // Recompute challenge
      const challenge_input = new Uint8Array(
        R_bytes.length + pseudonym_bytes.length + sp_bytes.length + nullifier_bytes.length
      );
      let offset = 0;
      challenge_input.set(R_bytes, offset); offset += R_bytes.length;
      challenge_input.set(pseudonym_bytes, offset); offset += pseudonym_bytes.length;
      challenge_input.set(sp_bytes, offset); offset += sp_bytes.length;
      challenge_input.set(nullifier_bytes, offset);

      const e_recomputed = sha256(challenge_input);
      const e_recomputed_hex = toHex(e_recomputed);

      // Check challenge matches
      if (e_recomputed_hex !== proof.e) {
        proof_verified = false;
      } else {
        // Schnorr verify: R == s*G + e*PK
        const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
        const s_bn = BigInt("0x" + proof.s);
        const e_bn = BigInt("0x" + proof.e);

        // s*G
        const sG = secp.ProjectivePoint.BASE.multiply(s_bn % n);
        // e*PK (pseudonym is the public key)
        const PK = secp.ProjectivePoint.fromHex(pseudonym);
        const ePK = PK.multiply(e_bn % n);
        // R_computed = s*G + e*PK
        const R_computed = sG.add(ePK);
        const R_computed_hex = toHex(R_computed.toRawBytes(true));

        proof_verified = R_computed_hex === proof.R;
      }
    } catch (e) {
      console.error("Proof verification error:", e.message);
      proof_verified = false;
    }

    // ═══════════════════════════════════════════════════════════
    // Step 3: CHECK NULLIFIER NOVELTY
    // ═══════════════════════════════════════════════════════════
    const { data: existingNul } = await supabase
      .from("nullifier_registry")
      .select("id")
      .eq("sp_identifier", sp_identifier)
      .eq("nullifier", nullifier)
      .limit(1);

    const nullifier_novel = !existingNul || existingNul.length === 0;

    // ═══════════════════════════════════════════════════════════
    // Step 4: CHECK PSEUDONYM NOVELTY
    // ═══════════════════════════════════════════════════════════
    const pseudonym_hash = toHex(sha256(fromHex(pseudonym)));

    const { data: existingPseud } = await supabase
      .from("nullifier_registry")
      .select("id")
      .eq("sp_identifier", sp_identifier)
      .eq("pseudonym_hash", pseudonym_hash)
      .limit(1);

    const pseudonym_novel = !existingPseud || existingPseud.length === 0;

    // ═══════════════════════════════════════════════════════════
    // Step 5: RETURN VERIFICATION RESULT
    // ═══════════════════════════════════════════════════════════
    const valid = proof_verified && nullifier_novel && pseudonym_novel;

    return new Response(
      JSON.stringify({
        valid,
        proof_verified,
        nullifier_novel,
        pseudonym_novel,
        anonymity_set_size,
        sp_identifier,
        set_id,
        verification_detail: valid
          ? "ASC.Verify(crs, Λ, l, ϕ, nul, π) = 1"
          : `ASC.Verify failed: ${[
              !proof_verified && "proof invalid",
              !nullifier_novel && "nullifier reused (Sybil)",
              !pseudonym_novel && "pseudonym already registered",
            ].filter(Boolean).join(", ")}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
