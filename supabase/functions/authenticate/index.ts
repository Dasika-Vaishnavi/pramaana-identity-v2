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
      JSON.stringify({ error: "Method not allowed. Use POST with action: 'challenge' or 'verify'" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { action } = body;

    // ═══════════════════════════════════════════════════════════
    // Flow 1 — Challenge Generation
    // ASC Paper §6.3.4, Figure 3: SP sends challenge W to prover
    // ═══════════════════════════════════════════════════════════
    if (action === "challenge") {
      const { sp_identifier, pseudonym } = body;

      if (!sp_identifier || !pseudonym) {
        return new Response(
          JSON.stringify({ error: "Required: sp_identifier, pseudonym" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pseudonym_hash = toHex(sha256(fromHex(pseudonym)));

      // Check if pseudonym is registered for this SP
      const { data: registration } = await supabase
        .from("nullifier_registry")
        .select("id")
        .eq("sp_identifier", sp_identifier)
        .eq("pseudonym_hash", pseudonym_hash)
        .limit(1);

      if (!registration || registration.length === 0) {
        return new Response(
          JSON.stringify({ error: "Pseudonym not registered for this service" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate challenge W = random 32 bytes
      const W = crypto.getRandomValues(new Uint8Array(32));
      const challenge_hex = toHex(W);

      const { error: insertErr } = await supabase
        .from("challenges")
        .insert({ sp_identifier, pseudonym_hash, challenge: challenge_hex });

      if (insertErr) throw new Error(`Failed to store challenge: ${insertErr.message}`);

      return new Response(
        JSON.stringify({ challenge: challenge_hex, expires_in: 60, pseudonym_hash, sp_identifier }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // Flow 2 — Proof Submission
    // σ := G_auth.Prove(csk_l, W), verify G_auth.Verify(ϕ, W, σ)
    // ═══════════════════════════════════════════════════════════
    if (action === "verify") {
      const { sp_identifier, pseudonym, challenge, signature } = body;

      if (!sp_identifier || !pseudonym || !challenge || !signature) {
        return new Response(
          JSON.stringify({ error: "Required: sp_identifier, pseudonym, challenge, signature {r, s}" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const pseudonym_hash = toHex(sha256(fromHex(pseudonym)));

      // Look up unused, unexpired challenge
      const { data: challengeRows } = await supabase
        .from("challenges")
        .select("*")
        .eq("sp_identifier", sp_identifier)
        .eq("pseudonym_hash", pseudonym_hash)
        .eq("challenge", challenge)
        .eq("used", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!challengeRows || challengeRows.length === 0) {
        return new Response(
          JSON.stringify({ authenticated: false, error: "Challenge not found or already used" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const row = challengeRows[0];

      if (new Date(row.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ authenticated: false, error: "Challenge expired" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark challenge as used
      await supabase.from("challenges").update({ used: true }).eq("id", row.id);

      // ═══════════════════════════════════════════════════════
      // Verify Schnorr signature: G_auth.Verify(ϕ, W, σ)
      // σ = { r: hex(compressed point), s: hex(scalar) }
      // e = SHA256(R || PK || H(W)), verify s*G + e*PK == R
      // ═══════════════════════════════════════════════════════
      let authenticated = false;
      try {
        const msg_hash = sha256(fromHex(challenge));
        const pseudonym_bytes = fromHex(pseudonym);
        const R_bytes = fromHex(signature.r);

        // Recompute challenge e = SHA256(R || PK || msg_hash)
        const e_input = new Uint8Array(R_bytes.length + pseudonym_bytes.length + msg_hash.length);
        let off = 0;
        e_input.set(R_bytes, off); off += R_bytes.length;
        e_input.set(pseudonym_bytes, off); off += pseudonym_bytes.length;
        e_input.set(msg_hash, off);
        const e = sha256(e_input);

        const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
        const s_bn = BigInt("0x" + signature.s) % n;
        const e_bn = BigInt("0x" + toHex(e)) % n;

        // R_check = s*G + e*PK
        const sG = secp.ProjectivePoint.BASE.multiply(s_bn === 0n ? 1n : s_bn);
        const PK = secp.ProjectivePoint.fromHex(pseudonym);
        const ePK = PK.multiply(e_bn === 0n ? 1n : e_bn);
        const R_check = sG.add(ePK);

        authenticated = toHex(R_check.toRawBytes(true)) === toHex(R_bytes);
      } catch (e) {
        console.error("Signature verification error:", e.message);
        authenticated = false;
      }

      if (authenticated) {
        return new Response(
          JSON.stringify({
            authenticated: true,
            pseudonym,
            sp_identifier,
            message: "Authentication successful — σ = G_auth.Prove(csk_l, W) verified",
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        return new Response(
          JSON.stringify({ authenticated: false, error: "Schnorr signature verification failed" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use 'challenge' or 'verify'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
