import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { wallet_address, phi_hash, chain_id = 11155111, signature, message } = await req.json();

    if (!wallet_address || !phi_hash || !signature || !message) {
      return new Response(JSON.stringify({ error: "wallet_address, phi_hash, signature, and message are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const addr = wallet_address.toLowerCase();

    // ── Step 1: Verify wallet ownership ──
    let recoveredAddress: string;
    try {
      recoveredAddress = ethers.verifyMessage(message, signature).toLowerCase();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid signature" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (recoveredAddress !== addr) {
      return new Response(JSON.stringify({ error: "Wallet ownership verification failed — signature does not match address" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Step 2: Verify phi_hash exists ──
    const { data: commitment } = await supabase
      .from("commitments")
      .select("phi_hash")
      .eq("phi_hash", phi_hash)
      .maybeSingle();

    if (!commitment) {
      return new Response(JSON.stringify({ error: "Phi hash not found — enroll first" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 3: Check wallet not already bound to different phi ──
    const { data: existingByWallet } = await supabase
      .from("wallet_bindings")
      .select("phi_hash")
      .eq("wallet_address", addr)
      .maybeSingle();

    if (existingByWallet) {
      if (existingByWallet.phi_hash === phi_hash) {
        return new Response(JSON.stringify({
          bound: true,
          wallet_address: addr,
          phi_hash,
          message: "Wallet is already bound to this Pramaana identity.",
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "This wallet is already bound to a different Pramaana identity" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Step 4: Check phi not already bound to different wallet ──
    const { data: existingByPhi } = await supabase
      .from("wallet_bindings")
      .select("wallet_address")
      .eq("phi_hash", phi_hash)
      .maybeSingle();

    if (existingByPhi) {
      return new Response(JSON.stringify({
        error: "This Pramaana identity is already bound to a different wallet. One identity = one wallet.",
      }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Step 5: Insert binding ──
    const { error: insertErr } = await supabase.from("wallet_bindings").insert({
      wallet_address: addr,
      phi_hash,
      chain_id,
      signature,
    });

    if (insertErr) throw new Error(`Failed to bind wallet: ${insertErr.message}`);

    return new Response(JSON.stringify({
      bound: true,
      wallet_address: addr,
      phi_hash,
      message: "Wallet successfully bound to Pramaana identity. This wallet is now anchored to a post-quantum commitment. One wallet per identity, one identity per person.",
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
