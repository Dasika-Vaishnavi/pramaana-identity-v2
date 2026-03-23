import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ethers } from "https://esm.sh/ethers@6.13.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// PramaanaIdR ABI — only the functions we call
const CONTRACT_ABI = [
  "function register(bytes32 _phiHash, uint256 _commitSize) external returns (uint256)",
  "function isRegistered(bytes32 _phiHash) external view returns (bool)",
  "function getIdentity(uint256 _index) external view returns (bytes32, uint256, bool, uint256)",
  "function getTotalIdentities() external view returns (uint256)",
  "function getCurrentSetInfo() external view returns (uint256, uint256, uint256)",
  "event IdentityRegistered(bytes32 indexed phiHash, uint256 setId, uint256 setIndex, uint256 timestamp)",
  "event SybilRejected(bytes32 indexed phiHash, uint256 timestamp)",
  "event AnonymitySetReady(uint256 setId, uint256 size)",
];

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

    const { phi_hash } = await req.json();
    if (!phi_hash || typeof phi_hash !== "string" || phi_hash.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "phi_hash is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // Read secrets
    // ═══════════════════════════════════════════════════════════
    const rpcUrl = Deno.env.get("SEPOLIA_RPC_URL");
    const deployerKey = Deno.env.get("DEPLOYER_PRIVATE_KEY");
    const contractAddress = Deno.env.get("CONTRACT_ADDRESS");

    if (!rpcUrl || !deployerKey || !contractAddress) {
      return new Response(
        JSON.stringify({
          error: "Missing Ethereum configuration. Required secrets: SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, CONTRACT_ADDRESS",
          missing: {
            SEPOLIA_RPC_URL: !rpcUrl,
            DEPLOYER_PRIVATE_KEY: !deployerKey,
            CONTRACT_ADDRESS: !contractAddress,
          },
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate all secrets before using them
    const errors: string[] = [];
    if (!/^https?:\/\//.test(rpcUrl)) {
      errors.push(`SEPOLIA_RPC_URL is not a valid URL (starts with: "${rpcUrl.slice(0, 30)}...")`);
    }
    if (!/^(0x)?[0-9a-fA-F]{64}$/.test(deployerKey)) {
      errors.push(`DEPLOYER_PRIVATE_KEY is not a valid 32-byte hex key (starts with: "${deployerKey.slice(0, 10)}...")`);
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
      errors.push(`CONTRACT_ADDRESS is not a valid Ethereum address (starts with: "${contractAddress.slice(0, 20)}...")`);
    }
    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ error: "Invalid Ethereum secrets configuration", details: errors }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ═══════════════════════════════════════════════════════════
    // Look up commitment in Supabase to get commitment_size
    // ═══════════════════════════════════════════════════════════
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: commitment, error: fetchError } = await supabase
      .from("commitments")
      .select("phi_hash, commitment_c, set_id, set_index, tx_hash")
      .eq("phi_hash", phi_hash)
      .maybeSingle();

    if (fetchError || !commitment) {
      return new Response(
        JSON.stringify({ error: "Commitment not found. Enroll first via palc-enroll." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (commitment.tx_hash) {
      return new Response(
        JSON.stringify({
          error: "Already registered on-chain",
          tx_hash: commitment.tx_hash,
          explorer_url: `https://sepolia.etherscan.io/tx/${commitment.tx_hash}`,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Commitment size in bytes (hex string / 2)
    const commitSize = Math.floor(commitment.commitment_c.length / 2);

    // ═══════════════════════════════════════════════════════════
    // Connect to Sepolia and call contract.register()
    // ═══════════════════════════════════════════════════════════
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(deployerKey, provider);
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

    // Convert phi_hash (128-char hex of SHA3-512) to bytes32
    // bytes32 = first 32 bytes = first 64 hex chars
    const phiBytes32 = "0x" + phi_hash.slice(0, 64);

    // Check if already registered on-chain
    const alreadyRegistered = await contract.isRegistered(phiBytes32);
    if (alreadyRegistered) {
      return new Response(
        JSON.stringify({
          error: "Sybil: identity already registered on-chain",
          sybil_resistant: true,
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send transaction
    const tx = await contract.register(phiBytes32, commitSize);
    const receipt = await tx.wait(1); // Wait 1 block confirmation

    // Parse events from receipt
    let setId: number | null = null;
    let setIndex: number | null = null;

    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({ topics: log.topics as string[], data: log.data });
        if (parsed && parsed.name === "IdentityRegistered") {
          setId = Number(parsed.args[1]); // setId
          setIndex = Number(parsed.args[2]); // setIndex
        }
      } catch {
        // Skip logs from other contracts
      }
    }

    const txHash = receipt.hash;
    const blockNumber = receipt.blockNumber;
    const chainMs = performance.now() - startTime;

    // ═══════════════════════════════════════════════════════════
    // Update Supabase: commitments.tx_hash + enrollment_logs
    // ═══════════════════════════════════════════════════════════

    // Update commitment with tx_hash
    await supabase
      .from("commitments")
      .update({ tx_hash: txHash })
      .eq("phi_hash", phi_hash);

    // Update enrollment log
    await supabase
      .from("enrollment_logs")
      .update({
        on_chain_tx_hash: txHash,
        on_chain_confirmed: true,
      })
      .eq("phi_hash", phi_hash);

    // ═══════════════════════════════════════════════════════════
    // Return result
    // ═══════════════════════════════════════════════════════════
    return new Response(
      JSON.stringify({
        tx_hash: txHash,
        block_number: blockNumber,
        set_id: setId,
        set_index: setIndex,
        chain_id: 11155111,
        network: "Sepolia",
        contract_address: contractAddress,
        explorer_url: `https://sepolia.etherscan.io/tx/${txHash}`,
        phi_hash_bytes32: phiBytes32,
        commitment_size_bytes: commitSize,
        timing: {
          total_ms: Math.round(chainMs * 100) / 100,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const message = error.message || "Internal server error";

    // Surface common Ethereum errors clearly
    if (message.includes("insufficient funds")) {
      return new Response(
        JSON.stringify({ error: "Deployer wallet has insufficient Sepolia ETH for gas" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message.includes("Sybil")) {
      return new Response(
        JSON.stringify({ error: message, sybil_resistant: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
