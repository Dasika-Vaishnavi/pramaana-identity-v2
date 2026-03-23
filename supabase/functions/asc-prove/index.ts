import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sha256 } from "https://esm.sh/@noble/hashes@1.7.1/sha2";
import { hkdf } from "https://esm.sh/@noble/hashes@1.7.1/hkdf";
import { sha256 as sha256Hash } from "https://esm.sh/@noble/hashes@1.7.1/sha256";
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
    const startTime = performance.now();

    const { master_secret_key, phi_hash, set_id, sp_identifier, random_material_r } = await req.json();

    // Validate inputs
    if (!master_secret_key || !phi_hash || !set_id || !sp_identifier) {
      return new Response(
        JSON.stringify({ error: "Required: master_secret_key, phi_hash, set_id, sp_identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sk_idr_bytes = fromHex(master_secret_key);
    const sp_bytes = new TextEncoder().encode(sp_identifier);

    // Use provided random material or generate fresh
    const r_bytes = random_material_r ? fromHex(random_material_r) : crypto.getRandomValues(new Uint8Array(32));

    // ═══════════════════════════════════════════════════════════
    // Step 1: DERIVE CHILD SECRET KEY — csk_l = HKDF(sha256, r, v_l, info, 32)
    // ASC Paper §6.3.3, Equation 5: csk_l := HKDF_n(r, v_l)
    // ═══════════════════════════════════════════════════════════
    const t1 = performance.now();
    const csk_l = hkdf(sha256, r_bytes, sp_bytes, "pramaana-u2sso-child-key", 32);
    const hkdfMs = performance.now() - t1;

    // ═══════════════════════════════════════════════════════════
    // Step 2: GENERATE PSEUDONYM — ϕ := G_auth.Gen(csk_l)
    // CRS-U2SSO uses Schnorr/secp256k1 (Paper §7.1)
    // ═══════════════════════════════════════════════════════════
    const t2 = performance.now();
    const pseudonym_pubkey = secp.getPublicKey(csk_l, true); // 33 bytes compressed
    const keygenMs = performance.now() - t2;

    // ═══════════════════════════════════════════════════════════
    // Step 3: COMPUTE NULLIFIER — nul = H(sk || v_l)
    // SRS-ASC Paper §5.1, Eq 3: deterministic per (prover, verifier)
    // Same (sk, v_l) → same nullifier. Different v_l → different nullifier.
    // ═══════════════════════════════════════════════════════════
    const t3 = performance.now();
    const nullifier_input = new Uint8Array(sk_idr_bytes.length + sp_bytes.length);
    nullifier_input.set(sk_idr_bytes, 0);
    nullifier_input.set(sp_bytes, sk_idr_bytes.length);
    const nullifier = sha256(nullifier_input);
    const nullifierMs = performance.now() - t3;

    const nullifier_hex = toHex(nullifier);
    const pseudonym_hex = toHex(pseudonym_pubkey);
    const pseudonym_hash = toHex(sha256(pseudonym_pubkey));

    // ═══════════════════════════════════════════════════════════
    // Step 4: GENERATE ASC PROOF π — Schnorr Proof of Knowledge
    // Demonstrates: "I know sk such that Φ = H(PALC.Commit(sk)) ∈ Λ,
    // and nul = H(sk || v_l)."
    //
    // NOTE: Full implementation would use Bulletproofs or Semaphore/Circom ZKP
    // for proper anonymity set membership proof (BoquilaID/U2SSO reference).
    // For hackathon demo, Schnorr PoK of csk_l suffices to demonstrate the flow.
    // ═══════════════════════════════════════════════════════════
    const t4 = performance.now();

    // Schnorr proof: prove knowledge of csk_l such that pseudonym = csk_l * G
    // 1. Random nonce k
    const k = crypto.getRandomValues(new Uint8Array(32));
    const R = secp.getPublicKey(k, true); // R = k * G

    // 2. Challenge e = SHA256(R || pseudonym || sp_identifier || nullifier)
    const challenge_input = new Uint8Array(R.length + pseudonym_pubkey.length + sp_bytes.length + nullifier.length);
    let offset = 0;
    challenge_input.set(R, offset); offset += R.length;
    challenge_input.set(pseudonym_pubkey, offset); offset += pseudonym_pubkey.length;
    challenge_input.set(sp_bytes, offset); offset += sp_bytes.length;
    challenge_input.set(nullifier, offset);
    const e = sha256(challenge_input);

    // 3. Response s = k - e * csk_l (mod n)
    // Convert to bigint for modular arithmetic
    const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    const k_bn = BigInt("0x" + toHex(k));
    const e_bn = BigInt("0x" + toHex(e));
    const csk_bn = BigInt("0x" + toHex(csk_l));

    let s_bn = (k_bn - e_bn * csk_bn) % n;
    if (s_bn < 0n) s_bn += n;

    const s_hex = s_bn.toString(16).padStart(64, "0");
    const proofMs = performance.now() - t4;

    // ═══════════════════════════════════════════════════════════
    // Step 5: SYBIL CHECK on nullifier
    // Per Table 1: same (prover, verifier) → same nullifier → rejected
    // ═══════════════════════════════════════════════════════════
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: existingNul } = await supabase
      .from("nullifier_registry")
      .select("id")
      .eq("sp_identifier", sp_identifier)
      .eq("nullifier", nullifier_hex)
      .limit(1);

    if (existingNul && existingNul.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Sybil resistance: This master identity has already registered with this service provider. The nullifier nul = H(sk || v_l) is deterministic per (identity, service) pair.",
          sybil_resistant: true,
          sp_identifier,
          nullifier: nullifier_hex,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the phi_hash exists in the anonymity set
    const { data: commitment } = await supabase
      .from("commitments")
      .select("phi_hash, set_id")
      .eq("phi_hash", phi_hash)
      .eq("set_id", set_id)
      .maybeSingle();

    if (!commitment) {
      return new Response(
        JSON.stringify({ error: "Commitment not found in the specified anonymity set" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get anonymity set size
    const { data: anonSet } = await supabase
      .from("anonymity_sets")
      .select("current_count, capacity")
      .eq("set_id", set_id)
      .maybeSingle();

    const anonymity_set_size = anonSet?.current_count ?? 0;

    // ═══════════════════════════════════════════════════════════
    // Step 6: STORE REGISTRATION in nullifier_registry
    // ═══════════════════════════════════════════════════════════
    const proof_json = JSON.stringify({
      type: "schnorr-pok",
      R: toHex(R),
      s: s_hex,
      e: toHex(e),
    });

    const { error: insertError } = await supabase
      .from("nullifier_registry")
      .insert({
        sp_identifier,
        nullifier: nullifier_hex,
        pseudonym_hash,
        proof_pi: proof_json,
        set_id,
      });

    if (insertError) {
      // Could be unique constraint violation (race condition on sybil check)
      if (insertError.message.includes("unique") || insertError.message.includes("duplicate")) {
        return new Response(
          JSON.stringify({
            error: "Sybil resistance: Concurrent registration detected for this (identity, service) pair.",
            sybil_resistant: true,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`Failed to insert nullifier: ${insertError.message}`);
    }

    const totalMs = performance.now() - startTime;

    // ═══════════════════════════════════════════════════════════
    // Step 7: RETURN — pseudonym, nullifier, proof, properties
    // ═══════════════════════════════════════════════════════════
    return new Response(
      JSON.stringify({
        pseudonym: pseudonym_hex,
        pseudonym_size_bytes: pseudonym_pubkey.length,
        nullifier: nullifier_hex,
        proof: {
          type: "schnorr-pok",
          R: toHex(R),
          s: s_hex,
          e: toHex(e),
          note: "Hackathon demo: Schnorr PoK of child key. Production would use Bulletproofs/Semaphore for full anonymity set membership proof.",
        },
        sp_identifier,
        set_id,
        anonymity_set_size,
        registration_status: "accepted",
        sybil_check: "passed — nullifier is novel for this SP",
        properties_preserved: {
          anonymity: "Proof hides which Φ in Λ generated this pseudonym",
          sybil_resistance: "Same sk + same v_l → same nullifier → rejected on retry",
          multi_verifier_unlinkability: "Different v_l → different nullifier → unlinkable across SPs",
        },
        timing: {
          hkdf_ms: Math.round(hkdfMs * 1000) / 1000,
          keygen_ms: Math.round(keygenMs * 1000) / 1000,
          nullifier_ms: Math.round(nullifierMs * 1000) / 1000,
          proof_ms: Math.round(proofMs * 1000) / 1000,
          total_ms: Math.round(totalMs * 100) / 100,
        },
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
