import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CONTRACT_ABI = [
  "function register(bytes32 _phiHash, uint256 _commitSize) external returns (uint256)",
  "function isRegistered(bytes32 _phiHash) external view returns (bool)",
];

const EXPLORER_MAP: Record<string, string> = {
  ethereum_sepolia: "https://sepolia.etherscan.io/tx/",
  arbitrum_sepolia: "https://sepolia.arbiscan.io/tx/",
  base_sepolia: "https://sepolia.basescan.org/tx/",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { phi_hash, commitment_size, chains } = await req.json();

    if (!phi_hash || !Array.isArray(chains) || chains.length === 0) {
      return new Response(
        JSON.stringify({ error: "phi_hash and chains[] are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const deployerKey = Deno.env.get("DEPLOYER_PRIVATE_KEY");
    if (!deployerKey) {
      return new Response(
        JSON.stringify({ error: "DEPLOYER_PRIVATE_KEY not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch chain configs
    const { data: configs, error: cfgErr } = await supabase
      .from("chain_configs")
      .select("*")
      .in("chain", chains)
      .eq("is_active", true);

    if (cfgErr || !configs || configs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No active chain configs found for requested chains" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Look up commitment size from DB if not provided
    let commitSize = commitment_size;
    if (!commitSize) {
      const { data: commitment } = await supabase
        .from("commitments")
        .select("commitment_c")
        .eq("phi_hash", phi_hash)
        .maybeSingle();
      commitSize = commitment ? Math.floor(commitment.commitment_c.length / 2) : 3136;
    }

    const phiBytes32 = "0x" + phi_hash.slice(0, 64);
    const registrations: Array<Record<string, unknown>> = [];
    const errors: Array<Record<string, string>> = [];

    // Register on each chain in parallel
    const tasks = configs.map(async (cfg) => {
      try {
        // Resolve RPC URL — "ENV:SECRET_NAME" means read from env
        let rpcUrl = cfg.rpc_url;
        if (rpcUrl.startsWith("ENV:")) {
          const envKey = rpcUrl.slice(4);
          rpcUrl = Deno.env.get(envKey);
          if (!rpcUrl) {
            errors.push({ chain: cfg.chain, error: `Missing env var ${envKey}` });
            return;
          }
        }

        const contractAddr = cfg.contract_address || Deno.env.get("CONTRACT_ADDRESS");
        if (!contractAddr) {
          errors.push({ chain: cfg.chain, error: "No contract address configured" });
          return;
        }

        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(deployerKey, provider);
        const contract = new ethers.Contract(contractAddr, CONTRACT_ABI, wallet);

        // Check if already registered
        const alreadyRegistered = await contract.isRegistered(phiBytes32);
        if (alreadyRegistered) {
          registrations.push({
            chain: cfg.chain,
            chain_id: cfg.chain_id,
            status: "already_registered",
            contract_address: contractAddr,
            explorer: EXPLORER_MAP[cfg.chain] || "",
          });
          return;
        }

        const tx = await contract.register(phiBytes32, commitSize);
        const receipt = await tx.wait(1);

        const reg = {
          chain: cfg.chain,
          chain_id: cfg.chain_id,
          tx_hash: receipt.hash,
          block_number: receipt.blockNumber,
          contract_address: contractAddr,
          confirmed: true,
          explorer: `${EXPLORER_MAP[cfg.chain] || ""}${receipt.hash}`,
        };
        registrations.push(reg);

        // Persist to multichain_registrations
        await supabase.from("multichain_registrations").upsert({
          phi_hash,
          chain: cfg.chain,
          tx_hash: receipt.hash,
          block_number: receipt.blockNumber,
          contract_address: contractAddr,
          confirmed: true,
        }, { onConflict: "phi_hash,chain" });

      } catch (err) {
        const msg = err.message || "Unknown error";
        if (msg.includes("insufficient funds")) {
          errors.push({ chain: cfg.chain, error: "Insufficient testnet ETH for gas" });
        } else {
          errors.push({ chain: cfg.chain, error: msg });
        }
      }
    });

    await Promise.all(tasks);

    return new Response(
      JSON.stringify({
        phi_hash,
        registrations,
        errors: errors.length > 0 ? errors : undefined,
        multichain_note:
          `Same identity Φ registered across ${registrations.length} chain(s). Each chain's IdR independently validates the commitment. Cross-chain pseudonyms remain unlinkable.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
