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
    const { contract_address, chain_id = 11155111 } = await req.json();
    if (!contract_address || !ethers.isAddress(contract_address)) {
      return new Response(JSON.stringify({ error: "Valid contract address required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const addr = ethers.getAddress(contract_address).toLowerCase();
    const rpcUrl = Deno.env.get("SEPOLIA_RPC_URL") || "https://rpc.sepolia.org";
    const etherscanKey = Deno.env.get("ETHERSCAN_API_KEY") || "";
    const apiBase = chain_id === 11155111
      ? "https://api-sepolia.etherscan.io/api"
      : "https://api.etherscan.io/api";
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Step 1: Fetch bytecode
    const bytecode = await provider.getCode(addr);
    if (bytecode === "0x") {
      return new Response(JSON.stringify({ error: "Address is not a contract (no bytecode)" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const codeSize = (bytecode.length - 2) / 2;

    // Fetch verification + source from Etherscan
    let verified = false;
    let contractName = "Unknown";
    let compilerVersion = "unknown";
    let license = "unknown";
    let hasProxy = false;

    if (etherscanKey) {
      try {
        const srcResp = await fetch(
          `${apiBase}?module=contract&action=getsourcecode&address=${addr}&apikey=${etherscanKey}`
        );
        const srcData = await srcResp.json();
        const r = srcData.result?.[0];
        if (r) {
          verified = r.ABI !== "Contract source code not verified";
          contractName = r.ContractName || "Unknown";
          compilerVersion = r.CompilerVersion || "unknown";
          license = r.LicenseType || "unknown";
          hasProxy = !!r.Implementation;
        }
      } catch { /* continue */ }
    }

    // Step 2: Bytecode threat analysis
    const threats: { opcode: string; severity: string; description: string }[] = [];

    // Scan for dangerous opcodes (hex pairs in bytecode)
    // DELEGATECALL = f4, SELFDESTRUCT = ff, CREATE2 = f5
    // We check 2-char hex sequences but need to be careful about false positives
    // since bytecode is a continuous hex string. We scan opcode-by-opcode.
    const rawBytes = bytecode.slice(2);

    let hasDelegatecall = false;
    let hasSelfdestruct = false;
    let hasCreate2 = false;

    // Simple linear scan: skip PUSH data
    for (let i = 0; i < rawBytes.length; i += 2) {
      const op = parseInt(rawBytes.slice(i, i + 2), 16);
      if (op >= 0x60 && op <= 0x7f) {
        // PUSHn: skip n bytes of data
        const n = op - 0x5f;
        i += n * 2;
        continue;
      }
      if (op === 0xf4) hasDelegatecall = true;
      if (op === 0xff) hasSelfdestruct = true;
      if (op === 0xf5) hasCreate2 = true;
    }

    if (hasDelegatecall) {
      threats.push({
        opcode: "DELEGATECALL (0xf4)",
        severity: "high",
        description: "Uses DELEGATECALL — executes external code in its own storage context. If the implementation address can be changed, the logic can be silently swapped (rug pull vector).",
      });
    }
    if (hasSelfdestruct) {
      threats.push({
        opcode: "SELFDESTRUCT (0xff)",
        severity: "high",
        description: "Contains SELFDESTRUCT. Owner could destroy the contract after draining funds, erasing the evidence trail.",
      });
    }
    if (hasCreate2) {
      threats.push({
        opcode: "CREATE2 (0xf5)",
        severity: "medium",
        description: "Uses CREATE2 for predictable deployment. Combined with SELFDESTRUCT, enables metamorphic contracts that redeploy different code at the same address.",
      });
    }
    if (codeSize < 50) {
      threats.push({
        opcode: "MINIMAL_BYTECODE",
        severity: "high",
        description: `Only ${codeSize} bytes — suspiciously small. Could be a minimal proxy, drain contract, or honeypot.`,
      });
    }

    // Step 3: Interaction pattern analysis
    let totalTxs = 0;
    let uniqueInteractors = 0;
    let failedTxRatio = 0;
    let totalInflowEth = "0";
    let totalOutflowEth = "0";
    let valuePattern = "unknown";

    if (etherscanKey) {
      try {
        const txResp = await fetch(
          `${apiBase}?module=account&action=txlist&address=${addr}&page=1&offset=100&sort=desc&apikey=${etherscanKey}`
        );
        const txData = await txResp.json();
        const allTxs = Array.isArray(txData.result) ? txData.result : [];
        totalTxs = allTxs.length;

        const interactors = new Set(allTxs.map((tx: any) => tx.from?.toLowerCase()).filter(Boolean));
        uniqueInteractors = interactors.size;

        const failedTxs = allTxs.filter((tx: any) => tx.isError === "1");
        failedTxRatio = totalTxs > 0 ? failedTxs.length / totalTxs : 0;

        if (failedTxRatio > 0.5 && totalTxs > 10) {
          threats.push({
            opcode: "HIGH_FAILURE_RATE",
            severity: "critical",
            description: `${Math.round(failedTxRatio * 100)}% of transactions FAIL. Strong honeypot indicator — accepts deposits but rejects withdrawals.`,
          });
        }

        let totalInflow = BigInt(0);
        let totalOutflow = BigInt(0);
        const receivers = new Set<string>();

        for (const tx of allTxs) {
          if (tx.to?.toLowerCase() === addr) {
            totalInflow += BigInt(tx.value || "0");
          }
          if (tx.from?.toLowerCase() === addr) {
            totalOutflow += BigInt(tx.value || "0");
            if (tx.to) receivers.add(tx.to.toLowerCase());
          }
        }

        totalInflowEth = ethers.formatEther(totalInflow);
        totalOutflowEth = ethers.formatEther(totalOutflow);

        if (receivers.size === 1 && totalOutflow > BigInt(0)) {
          threats.push({
            opcode: "SINGLE_DRAIN_ADDRESS",
            severity: "critical",
            description: `All outgoing value goes to one address. Inflow: ${totalInflowEth} ETH, outflow to single address: ${totalOutflowEth} ETH. Classic drain pattern.`,
          });
          valuePattern = "suspicious_drain";
        } else {
          valuePattern = "normal";
        }
      } catch { /* continue without interaction data */ }
    }

    // Step 4: Verification assessment
    const verification = {
      is_verified: verified,
      contract_name: contractName,
      compiler_version: compilerVersion,
      license,
      has_proxy: hasProxy,
      risk: verified ? "lower" : "high",
      explanation: verified
        ? "Source code is verified and publicly auditable. While this doesn't guarantee safety, it allows community inspection."
        : "SOURCE CODE IS NOT VERIFIED. You are interacting with opaque bytecode. No way to know what it does without reverse-engineering. Significant red flag.",
    };

    // Step 5: Overall assessment
    const dangerousOpcodes = [
      ...(hasDelegatecall ? ["DELEGATECALL"] : []),
      ...(hasSelfdestruct ? ["SELFDESTRUCT"] : []),
      ...(hasCreate2 ? ["CREATE2"] : []),
    ];

    const overallThreat = threats.some(t => t.severity === "critical") ? "critical"
      : threats.some(t => t.severity === "high") ? "high"
      : threats.length > 0 ? "medium" : "low";

    const recommendations: string[] = [];
    if (!verified) recommendations.push("Do not interact with this unverified contract.");
    if (threats.some(t => t.opcode.includes("APPROVAL") || t.opcode === "SINGLE_DRAIN_ADDRESS")) {
      recommendations.push("If you have approved tokens to this contract, revoke immediately at revoke.cash.");
    }
    if (threats.some(t => t.severity === "critical")) {
      recommendations.push("Contract shows critical threat indicators — likely malicious.");
    }
    if (hasSelfdestruct) recommendations.push("Contract can self-destruct — funds may become irrecoverable.");
    if (hasDelegatecall && !verified) recommendations.push("Unverified proxy contract — logic can be changed without notice.");
    if (recommendations.length === 0) recommendations.push("No major threats detected, but always verify contract source before large interactions.");

    return new Response(JSON.stringify({
      contract_address: ethers.getAddress(contract_address),
      chain_id,
      verification,
      bytecode_analysis: {
        code_size_bytes: codeSize,
        threats,
        dangerous_opcodes_found: dangerousOpcodes,
      },
      interaction_analysis: {
        total_transactions: totalTxs,
        unique_interactors: uniqueInteractors,
        failed_tx_ratio: parseFloat(failedTxRatio.toFixed(3)),
        total_inflow_eth: totalInflowEth,
        total_outflow_eth: totalOutflowEth,
        value_pattern: valuePattern,
      },
      overall_threat_level: overallThreat,
      threat_count: threats.length,
      recommendations,
      pramaana_relevance: "Pramaana's on-chain IdR contract is fully verified and stores only commitment hashes H(C). No PII, no tokens, no approval mechanisms. Compare this with the analyzed contract's threat profile.",
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
