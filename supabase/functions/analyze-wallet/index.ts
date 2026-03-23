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
    const { address, chain_id = 11155111 } = await req.json();
    if (!address || typeof address !== "string" || !ethers.isAddress(address)) {
      return new Response(JSON.stringify({ error: "Valid Ethereum address is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checksumAddress = ethers.getAddress(address);
    const addr = checksumAddress.toLowerCase();

    // ── Step 1: On-chain data via ethers ──
    const rpcUrl = Deno.env.get("SEPOLIA_RPC_URL") || "https://rpc.sepolia.org";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    const [balance, txCount, code] = await Promise.all([
      provider.getBalance(addr),
      provider.getTransactionCount(addr),
      provider.getCode(addr),
    ]);
    const isContract = code !== "0x";
    const balanceEth = ethers.formatEther(balance);

    // ── Step 2: Fetch transactions via Etherscan ──
    const etherscanKey = Deno.env.get("ETHERSCAN_API_KEY") || "";
    const apiBase = chain_id === 11155111
      ? "https://api-sepolia.etherscan.io/api"
      : "https://api.etherscan.io/api";

    let transactions: any[] = [];
    let etherscanError: string | null = null;
    if (etherscanKey) {
      try {
        const txResp = await fetch(
          `${apiBase}?module=account&action=txlist&address=${addr}&startblock=0&endblock=99999999&page=1&offset=50&sort=desc&apikey=${etherscanKey}`
        );
        const txData = await txResp.json();
        if (txData.status === "1" && Array.isArray(txData.result)) {
          transactions = txData.result;
        }
      } catch (e) {
        etherscanError = e.message;
      }
    }

    // ── Step 3: Quantum vulnerability analysis ──
    const outboundTxs = transactions.filter(
      (tx: any) => tx.from?.toLowerCase() === addr
    );
    const inboundTxs = transactions.filter(
      (tx: any) => tx.to?.toLowerCase() === addr
    );
    const pubKeyExposures = outboundTxs.length || (txCount > 0 ? txCount : 0);

    let quantumRisk: string;
    let riskScore: number;
    let riskExplanation: string;

    if (isContract) {
      quantumRisk = "not_applicable";
      riskScore = 0;
      riskExplanation = "This is a smart contract address, not an EOA. Contract addresses don't have private keys in the ECDSA sense — their security depends on the contract code itself.";
    } else if (pubKeyExposures > 10) {
      quantumRisk = "critical";
      riskScore = 95;
      riskExplanation = `This address has sent ${pubKeyExposures} transactions. Each outbound transaction includes an ECDSA signature (v, r, s) from which the full secp256k1 public key can be mathematically recovered using ecrecover. A quantum computer with ~2,500 logical qubits running Shor's algorithm could derive the private key. Estimated vulnerability window: 5-15 years per NIST IR 8547.`;
    } else if (pubKeyExposures > 0) {
      quantumRisk = "high";
      riskScore = 75;
      riskExplanation = `This address has sent ${pubKeyExposures} transaction(s), exposing the public key. Even a single exposure is sufficient for a quantum attack — Shor's algorithm needs the public key only once.`;
    } else if (Number(balance) > 0) {
      quantumRisk = "moderate";
      riskScore = 40;
      riskExplanation = "This address holds funds but has never sent a transaction — the public key has NOT been exposed on-chain. The address is a hash of the public key (keccak256), providing some quantum protection. However, sending any transaction will permanently expose the full public key.";
    } else {
      quantumRisk = "safe";
      riskScore = 10;
      riskExplanation = "This address is empty and has never transacted. No quantum vulnerability exists because no cryptographic material is exposed.";
    }

    // ── Step 4: Sybil pattern detection ──
    const uniqueRecipients = new Set(outboundTxs.map((tx: any) => tx.to?.toLowerCase()).filter(Boolean));
    const contractInteractions = outboundTxs.filter((tx: any) => tx.input && tx.input !== "0x").length;

    const timestamps = outboundTxs
      .map((tx: any) => parseInt(tx.timeStamp))
      .filter((t: number) => !isNaN(t))
      .sort((a: number, b: number) => a - b);

    let avgTimeBetweenTxs = 0;
    if (timestamps.length > 1) {
      avgTimeBetweenTxs = (timestamps[timestamps.length - 1] - timestamps[0]) / timestamps.length;
    }

    const walletAgeSeconds = timestamps.length > 0 ? Date.now() / 1000 - timestamps[0] : 0;

    const sybilIndicators = {
      low_diversity_recipients: uniqueRecipients.size < 3 && outboundTxs.length > 5,
      rapid_fire_transactions: avgTimeBetweenTxs > 0 && avgTimeBetweenTxs < 120 && outboundTxs.length > 3,
      mostly_contract_calls: outboundTxs.length > 0 && (contractInteractions / outboundTxs.length) > 0.85,
      very_new_wallet: walletAgeSeconds > 0 && walletAgeSeconds < 86400 * 7,
      single_funding_source: inboundTxs.length > 0 && new Set(inboundTxs.map((tx: any) => tx.from?.toLowerCase())).size === 1,
    };
    const sybilScore = Object.values(sybilIndicators).filter(Boolean).length;

    let sybilVerdict: string;
    if (sybilScore >= 3) {
      sybilVerdict = "HIGH RISK — Multiple Sybil farming indicators detected. This wallet pattern is consistent with automated airdrop farming or bot activity. Only identity-level Sybil resistance (Pramaana PALC) can solve this.";
    } else if (sybilScore >= 1) {
      sybilVerdict = "MODERATE — Some Sybil indicators present. Pramaana enrollment would provide definitive proof of unique personhood.";
    } else {
      sybilVerdict = "LOW — No obvious Sybil patterns detected. However, anyone can create unlimited wallets for free — only cryptographic identity binding (Pramaana) provides true Sybil resistance.";
    }

    // ── Step 5: Check Pramaana enrollment ──
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: binding } = await supabase
      .from("wallet_bindings")
      .select("phi_hash, bound_at")
      .eq("wallet_address", addr)
      .maybeSingle();

    const pramaanaEnrolled = !!binding;

    // ── Step 6: Store analysis ──
    await supabase.from("wallet_analyses").insert({
      wallet_address: addr,
      chain_id,
      balance_wei: balance.toString(),
      tx_count: txCount,
      outbound_tx_count: outboundTxs.length,
      pubkey_exposures: pubKeyExposures,
      quantum_risk: quantumRisk,
      risk_score: riskScore,
      sybil_indicators: sybilIndicators,
      sybil_score: sybilScore,
      pramaana_enrolled: pramaanaEnrolled,
      phi_hash: binding?.phi_hash || null,
    });

    // ── Step 7: Format and return ──
    const formattedTxs = transactions.slice(0, 20).map((tx: any) => ({
      hash: tx.hash,
      from: tx.from,
      to: tx.to || "Contract Creation",
      value_eth: ethers.formatEther(tx.value || "0"),
      timestamp: new Date(parseInt(tx.timeStamp) * 1000).toISOString(),
      is_outbound: tx.from?.toLowerCase() === addr,
      pubkey_exposed: tx.from?.toLowerCase() === addr,
      is_error: tx.isError === "1",
      gas_used: tx.gasUsed,
      method_id: tx.input?.slice(0, 10) || "0x",
      block_number: parseInt(tx.blockNumber),
    }));

    return new Response(JSON.stringify({
      address: checksumAddress,
      chain_id,
      is_contract: isContract,
      balance_eth: parseFloat(balanceEth).toFixed(6),
      tx_count: txCount,
      quantum_analysis: {
        risk: quantumRisk,
        risk_score: riskScore,
        pubkey_exposures: pubKeyExposures,
        explanation: riskExplanation,
        exposed_in_txs: outboundTxs.slice(0, 5).map((tx: any) => tx.hash),
      },
      sybil_analysis: {
        sybil_score: sybilScore,
        max_score: 5,
        indicators: sybilIndicators,
        explanation: sybilVerdict,
      },
      pramaana_status: {
        enrolled: pramaanaEnrolled,
        phi_hash: binding?.phi_hash || null,
        bound_at: binding?.bound_at || null,
        recommendation: pramaanaEnrolled
          ? "This wallet is bound to a Pramaana post-quantum identity. Quantum-safe and Sybil-resistant."
          : "This wallet has no post-quantum identity protection. Enroll with Pramaana to anchor a quantum-safe identity commitment on-chain.",
      },
      recent_transactions: formattedTxs,
      etherscan_error: etherscanError,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
