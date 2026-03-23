import { ethers } from "https://esm.sh/ethers@6.13.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const dangerousMethodIds: Record<string, string> = {
  "0x095ea7b3": "approve — grants unlimited token spending rights",
  "0xa9059cbb": "transfer — moves tokens",
  "0x23b872dd": "transferFrom — moves tokens on behalf of another",
  "0x39509351": "increaseAllowance — increases spending approval",
  "0x42842e0e": "safeTransferFrom — NFT transfer",
  "0x2eb2c2d6": "safeBatchTransferFrom — batch NFT transfer",
  "0x3593564c": "execute — Uniswap Universal Router",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { tx_hash, chain_id = 11155111 } = await req.json();
    if (!tx_hash || typeof tx_hash !== "string" || !tx_hash.startsWith("0x") || tx_hash.length !== 66) {
      return new Response(JSON.stringify({ error: "Valid transaction hash (0x + 64 hex chars) is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rpcUrl = Deno.env.get("SEPOLIA_RPC_URL") || "https://rpc.sepolia.org";
    const etherscanKey = Deno.env.get("ETHERSCAN_API_KEY") || "";
    const apiBase = chain_id === 11155111
      ? "https://api-sepolia.etherscan.io/api"
      : "https://api.etherscan.io/api";

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Step 1: Fetch tx + receipt
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(tx_hash),
      provider.getTransactionReceipt(tx_hash),
    ]);

    if (!tx) {
      return new Response(JSON.stringify({
        found: false,
        error: "Transaction not found on this chain",
        tx_hash,
        chain_id,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Tx type
    const txType = tx.to === null ? "contract_deployment"
      : tx.data === "0x" ? "eth_transfer"
      : "contract_interaction";

    // Step 3: Signature analysis
    const sig = tx.signature;
    const sigInfo = {
      v: sig.v,
      r: sig.r,
      s: sig.s,
      pubkey_recoverable: true,
      quantum_warning: "The (v, r, s) signature in this transaction allows full recovery of the sender's secp256k1 public key via ecrecover. This public key is permanently exposed on-chain. A quantum computer running Shor's algorithm could derive the private key.",
    };

    // Step 4: Contract analysis
    let contractAnalysis: any = null;
    if (txType === "contract_interaction" && tx.to) {
      const contractCode = await provider.getCode(tx.to);
      const codeSize = (contractCode.length - 2) / 2;

      let verified = false;
      let contractName = "Unknown";
      if (etherscanKey) {
        try {
          const srcResp = await fetch(
            `${apiBase}?module=contract&action=getsourcecode&address=${tx.to}&apikey=${etherscanKey}`
          );
          const srcData = await srcResp.json();
          if (srcData.result?.[0]?.ContractName) {
            verified = srcData.result[0].ABI !== "Contract source code not verified";
            contractName = srcData.result[0].ContractName || "Unknown";
          }
        } catch { /* continue */ }
      }

      const methodId = tx.data.slice(0, 10);
      const methodName = dangerousMethodIds[methodId] || `Unknown method (${methodId})`;
      const isDangerousMethod = !!dangerousMethodIds[methodId];

      const threatIndicators: { level: string; indicator: string; detail: string }[] = [];

      if (!verified) {
        threatIndicators.push({
          level: "high",
          indicator: "UNVERIFIED CONTRACT",
          detail: "Source code is not verified on Etherscan. Unverified contracts may contain hidden backdoors or drain mechanisms.",
        });
      }

      if (methodId === "0x095ea7b3" && tx.data.length >= 138) {
        const spender = "0x" + tx.data.slice(34, 74);
        const amount = BigInt("0x" + tx.data.slice(74, 138));
        const unlimited = amount >= BigInt("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
        if (unlimited) {
          threatIndicators.push({
            level: "critical",
            indicator: "UNLIMITED TOKEN APPROVAL",
            detail: `Grants UNLIMITED spending approval to ${spender}. If that address is compromised, it can drain all tokens of this type from your wallet at any time.`,
          });
        }
      }

      if (codeSize < 100 && codeSize > 0) {
        threatIndicators.push({
          level: "medium",
          indicator: "MINIMAL CONTRACT CODE",
          detail: `Bytecode is only ${codeSize} bytes. May be a proxy or purpose-built drain contract.`,
        });
      }

      contractAnalysis = {
        address: tx.to,
        name: contractName,
        verified,
        code_size_bytes: codeSize,
        method_id: methodId,
        method_name: methodName,
        is_dangerous_method: isDangerousMethod,
        threat_indicators: threatIndicators,
        threat_level: threatIndicators.length === 0 ? "low"
          : threatIndicators.some(t => t.level === "critical") ? "critical"
          : threatIndicators.some(t => t.level === "high") ? "high"
          : "medium",
      };
    }

    // Step 5: Event logs
    const logs = (receipt?.logs || []).map(log => {
      let decoded: string | null = null;
      const t0 = log.topics[0];
      if (t0 === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
        decoded = "Transfer(address from, address to, uint256 value)";
      } else if (t0 === "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925") {
        decoded = "Approval(address owner, address spender, uint256 value)";
      }
      return { address: log.address, topics: log.topics, data: log.data, decoded };
    });

    // Step 6: Overall risk + recommendations
    const risks: string[] = [];
    risks.push("high"); // signature always exposes pubkey
    if (contractAnalysis) risks.push(contractAnalysis.threat_level);

    const overallRisk = risks.includes("critical") ? "critical"
      : risks.includes("high") ? "high"
      : risks.includes("medium") ? "medium" : "low";

    const recommendations: string[] = [
      "This transaction permanently exposed the sender's ECDSA public key — consider Pramaana enrollment for post-quantum protection.",
    ];
    if (contractAnalysis?.threat_indicators?.some((t: any) => t.indicator === "UNLIMITED TOKEN APPROVAL")) {
      recommendations.unshift("Revoke the unlimited approval immediately using revoke.cash");
    }
    if (contractAnalysis && !contractAnalysis.verified) {
      recommendations.push("This contract is unverified — do not interact with it again.");
    }

    // Get block for timestamp
    let timestamp: string | null = null;
    if (tx.blockNumber) {
      try {
        const block = await provider.getBlock(tx.blockNumber);
        if (block) timestamp = new Date(block.timestamp * 1000).toISOString();
      } catch { /* skip */ }
    }

    return new Response(JSON.stringify({
      tx_hash,
      status: receipt ? (receipt.status === 1 ? "success" : "failed") : "pending",
      block_number: tx.blockNumber,
      timestamp,
      from: tx.from,
      to: tx.to || "Contract deployment",
      value_eth: ethers.formatEther(tx.value),
      gas_used: receipt?.gasUsed?.toString() || null,
      gas_price_gwei: tx.gasPrice ? ethers.formatUnits(tx.gasPrice, "gwei") : null,
      tx_type: txType,
      signature_analysis: sigInfo,
      contract_analysis: contractAnalysis,
      event_logs: logs,
      overall_risk: overallRisk,
      recommendations,
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
