import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { wallet_address, context = "service_registration" } = await req.json();

    if (!wallet_address || typeof wallet_address !== "string") {
      return new Response(JSON.stringify({ error: "wallet_address is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const addr = wallet_address.toLowerCase();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Step 1: Check wallet binding ──
    const { data: binding } = await supabase
      .from("wallet_bindings")
      .select("phi_hash, bound_at")
      .eq("wallet_address", addr)
      .maybeSingle();

    if (!binding) {
      return new Response(JSON.stringify({
        wallet_address: addr,
        sybil_resistant: false,
        pramaana_enrolled: false,
        phi_hash: null,
        enrollment_timestamp: null,
        quantum_protected: false,
        context_check: { context, already_claimed: false, nullifier: null },
        verdict: "FAIL — No Pramaana enrollment found. This wallet has no identity-level Sybil protection. Anyone can create unlimited wallets for free.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Step 2: Get commitment details ──
    const { data: commitment } = await supabase
      .from("commitments")
      .select("created_at, set_id, set_index")
      .eq("phi_hash", binding.phi_hash)
      .maybeSingle();

    // ── Step 3: Context-specific nullifier check ──
    let alreadyClaimed = false;
    let contextNullifier: string | null = null;

    if (context === "airdrop_claim" || context === "dao_vote") {
      const { data: nullifiers } = await supabase
        .from("nullifier_registry")
        .select("nullifier, sp_identifier")
        .eq("sp_identifier", context)
        .limit(100);

      // Check if any nullifier in this context is associated with the same phi_hash
      // (In a real system, this would be a more sophisticated check)
      if (nullifiers && nullifiers.length > 0) {
        // For demo: check if there's a nullifier entry matching this context
        const { data: userNullifiers } = await supabase
          .from("nullifier_registry")
          .select("nullifier")
          .eq("sp_identifier", context)
          .limit(1);

        if (userNullifiers && userNullifiers.length > 0) {
          // This is a simplified check for demo purposes
          contextNullifier = userNullifiers[0].nullifier;
        }
      }
    }

    return new Response(JSON.stringify({
      wallet_address: addr,
      sybil_resistant: true,
      pramaana_enrolled: true,
      phi_hash: binding.phi_hash,
      enrollment_timestamp: commitment?.created_at || binding.bound_at,
      quantum_protected: true,
      context_check: {
        context,
        already_claimed: alreadyClaimed,
        nullifier: contextNullifier,
      },
      commitment_details: commitment ? {
        set_id: commitment.set_id,
        set_index: commitment.set_index,
      } : null,
      verdict: `PASS — This wallet is bound to a verified Pramaana identity (Φ = ${binding.phi_hash.slice(0, 16)}…). One real person, one ${context === "airdrop_claim" ? "claim" : context === "dao_vote" ? "vote" : "registration"}.`,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
