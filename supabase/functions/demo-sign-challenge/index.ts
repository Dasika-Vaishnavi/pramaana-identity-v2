import { sha256 } from "https://esm.sh/@noble/hashes@1.7.1/sha2";
import { hkdf } from "https://esm.sh/@noble/hashes@1.7.1/hkdf";
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

// Demo-only edge function: signs a challenge using the child secret key.
// In production, signing happens entirely on the user's device.
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
    const { master_secret_key, random_material_r, sp_identifier, challenge } = await req.json();

    if (!master_secret_key || !random_material_r || !sp_identifier || !challenge) {
      return new Response(
        JSON.stringify({ error: "Required: master_secret_key, random_material_r, sp_identifier, challenge" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const r_bytes = fromHex(random_material_r);
    const sp_bytes = new TextEncoder().encode(sp_identifier);

    // Derive child secret key: csk_l = HKDF(sha256, r, sp_identifier, info, 32)
    const csk_l = hkdf(sha256, r_bytes, sp_bytes, "pramaana-u2sso-child-key", 32);
    const pseudonym = secp.getPublicKey(csk_l, true);

    // Schnorr signature over SHA256(challenge)
    const msg_hash = sha256(fromHex(challenge));

    // Random nonce k
    const k = crypto.getRandomValues(new Uint8Array(32));
    const R = secp.getPublicKey(k, true); // R = k·G (compressed)

    // e = SHA256(R || PK || msg_hash)
    const e_input = new Uint8Array(R.length + pseudonym.length + msg_hash.length);
    let off = 0;
    e_input.set(R, off); off += R.length;
    e_input.set(pseudonym, off); off += pseudonym.length;
    e_input.set(msg_hash, off);
    const e = sha256(e_input);

    // s = k - e * csk_l (mod n)
    const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
    const k_bn = BigInt("0x" + toHex(k));
    const e_bn = BigInt("0x" + toHex(e));
    const csk_bn = BigInt("0x" + toHex(csk_l));

    let s_bn = (k_bn - e_bn * csk_bn) % n;
    if (s_bn < 0n) s_bn += n;

    return new Response(
      JSON.stringify({
        signature: {
          r: toHex(R),
          s: s_bn.toString(16).padStart(64, "0"),
        },
        pseudonym: toHex(pseudonym),
        note: "Demo only — in production, signing happens on user's device",
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
