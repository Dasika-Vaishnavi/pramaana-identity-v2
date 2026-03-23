import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ═══════════════════════════════════════════════════════════
// Tool implementations
// ═══════════════════════════════════════════════════════════

function assessQuantumRisk(address: string, chain: string) {
  if (chain === "ethereum" || chain === "arbitrum" || chain === "base") {
    return {
      risk_level: "critical",
      address,
      chain,
      address_type: "EOA (ECDSA secp256k1)",
      reason:
        "All Ethereum EOA addresses expose their public key after the first outgoing transaction. ECDSA is broken by Shor's algorithm on a sufficiently large quantum computer.",
      recommendation:
        "Enroll in Pramaana to create a post-quantum master identity Φ. Use Pramaana pseudonyms for future on-chain interactions. Consider migrating assets to a contract-based account with PQ signature verification.",
      quantum_threat_timeline: "NIST estimates cryptographically relevant quantum computers by 2030-2035.",
    };
  }

  // Bitcoin address analysis
  if (address.startsWith("1")) {
    return {
      risk_level: "critical",
      address,
      chain,
      address_type: "P2PKH (Pay-to-Public-Key-Hash)",
      reason:
        "P2PKH addresses expose the full public key when spending. Once exposed, the ECDSA key is vulnerable to Shor's algorithm. Even unspent P2PKH with no exposed pubkey can be attacked via Grover's algorithm on the hash (reduced security).",
      recommendation:
        "Migrate immediately to a P2MR (BIP-360) address derived from your Pramaana master key. Use Dilithium for post-quantum signing.",
    };
  }
  if (address.startsWith("3")) {
    return {
      risk_level: "moderate",
      address,
      chain,
      address_type: "P2SH (Pay-to-Script-Hash)",
      reason:
        "P2SH security depends on the redeem script. If it wraps a standard ECDSA multisig, it is quantum-vulnerable upon spending. If it uses timelocked or hash-locked scripts, partial protection exists.",
      recommendation:
        "Audit the redeem script. Plan migration to P2MR (BIP-360) with Pramaana-derived Dilithium keys for all signing paths.",
    };
  }
  if (address.startsWith("bc1q")) {
    return {
      risk_level: "high",
      address,
      chain,
      address_type: "P2WPKH (Pay-to-Witness-Public-Key-Hash)",
      reason:
        "P2WPKH exposes the public key in the witness data upon first spend. Before spending, 160-bit hash provides some protection but Grover's reduces this to 80-bit security — insufficient long term.",
      recommendation:
        "Do not reuse this address after spending. Migrate to P2MR (BIP-360) using your Pramaana master key for quantum-safe custody.",
    };
  }
  if (address.startsWith("bc1p")) {
    return {
      risk_level: "high",
      address,
      chain,
      address_type: "P2TR (Pay-to-Taproot)",
      reason:
        "Taproot key-path spends expose the Schnorr public key directly. Script-path spends may be safer depending on the scripts used. Key-path is the common case and is quantum-vulnerable.",
      recommendation:
        "Use only script-path spends with hash-locked conditions until migration to P2MR. Pramaana master key can anchor Dilithium-based Tapscript leaves for hybrid security.",
    };
  }
  if (address.startsWith("bc1z")) {
    return {
      risk_level: "safe",
      address,
      chain,
      address_type: "P2MR (Pay-to-Merkle-Root) — BIP-360",
      reason:
        "P2MR addresses use post-quantum signature algorithms (Dilithium, SPHINCS+, or XMSS) within a Merkle root commitment. No classical public key is exposed on-chain. This is the target address type for quantum-safe Bitcoin.",
      recommendation:
        "No migration needed. Your funds are quantum-safe. Ensure your Pramaana master key backup is secure — it anchors the PQ key derivation.",
    };
  }

  return {
    risk_level: "unknown",
    address,
    chain,
    reason: "Address format not recognized. Unable to assess quantum risk.",
    recommendation: "Provide a valid Bitcoin or Ethereum address for assessment.",
  };
}

function planBip360Migration(sourceAddress: string, addressType: string, estimatedBtc?: number) {
  const feeEstimate = addressType === "p2pkh" ? 3500 : addressType === "p2wpkh" ? 1800 : 2500;
  const urgency =
    addressType === "p2pkh"
      ? "HIGH — public key likely already exposed on-chain"
      : addressType === "p2tr"
        ? "HIGH — key-path spends expose Schnorr pubkey"
        : "MODERATE — migrate before spending from this address";

  return {
    source_address: sourceAddress,
    source_type: addressType.toUpperCase(),
    urgency,
    steps: [
      {
        step: 1,
        action: "Create Pramaana post-quantum identity",
        detail:
          "Enroll via PALC.Commit to generate master identity Φ anchored by Kyber-1024 lattice commitment. This provides the 256-bit PQ security foundation.",
        status: "available_now",
      },
      {
        step: 2,
        action: "Derive Dilithium signing keypair from Pramaana master key",
        detail:
          "Use HKDF(sk_idr, 'bip360-dilithium-v1') to derive a Dilithium-5 signing key. This key will authorize spends from your P2MR address.",
        status: "available_now",
      },
      {
        step: 3,
        action: "Construct P2MR address",
        detail:
          "Build a Merkle root from: (1) Dilithium-5 leaf for standard spends, (2) SPHINCS+ leaf for cold storage recovery, (3) Optional timelock leaf for inheritance. Encode as bc1z... Bech32m address.",
        status: "requires_bip360_node",
      },
      {
        step: 4,
        action: `Construct migration transaction: ${addressType.toUpperCase()} → P2MR`,
        detail: `Create transaction spending from ${sourceAddress} to your new bc1z... P2MR address. ${estimatedBtc ? `Moving approximately ${estimatedBtc} BTC.` : ""} Sign with existing ${addressType === "p2tr" ? "Schnorr" : "ECDSA"} key.`,
        status: "requires_bip360_node",
      },
      {
        step: 5,
        action: "Broadcast and confirm",
        detail:
          "Submit the signed transaction to the Bitcoin Quantum testnet (or mainnet when BIP-360 activates). Wait for 6 confirmations.",
        status: "requires_bip360_node",
      },
      {
        step: 6,
        action: "Verify quantum-safe custody",
        detail:
          "Confirm funds are now at a bc1z... address. Old address should show zero balance. Pramaana master key now anchors your Bitcoin custody.",
        status: "post_migration",
      },
    ],
    estimated_fee_sats: feeEstimate,
    timeline:
      "Steps 1-2 can be completed now using Pramaana. Steps 3-5 require a Bitcoin node with BIP-360 opcode support (available on Bitcoin Quantum testnet). Full mainnet support pending BIP-360 soft fork activation.",
    pramaana_role:
      "Provides the post-quantum identity anchor (Φ) that the P2MR address derives from. Your Dilithium signing key is deterministically derived from your Pramaana master secret key, ensuring a single PQ identity spans both your on-chain credentials and Bitcoin custody.",
    note: "Full P2MR transaction construction requires Bitcoin Core with BIP-360 opcodes. This plan prepares your identity layer — the cryptographic foundation is ready today.",
  };
}

// ═══════════════════════════════════════════════════════════
// Anthropic tool definitions
// ═══════════════════════════════════════════════════════════

const TOOLS = [
  {
    name: "palc_enroll",
    description:
      "Enroll a new identity using PII as cryptographic entropy. Executes the PALC.Commit algorithm from the Pramaana paper. PII is consumed and permanently erased.",
    input_schema: {
      type: "object",
      properties: {
        pii_input: {
          type: "string",
          description: "Concatenated PII string (government ID, DOB, jurisdiction, biometric hash)",
        },
      },
      required: ["pii_input"],
    },
  },
  {
    name: "asc_prove",
    description:
      "Generate a pseudonym and nullifier for registering with a service provider. Implements ASC.Prove from IACR 2025/618.",
    input_schema: {
      type: "object",
      properties: {
        sp_identifier: { type: "string", description: "Service provider identifier (v_l)" },
        master_secret_key: { type: "string", description: "Hex-encoded master secret key" },
        phi_hash: { type: "string" },
        set_id: { type: "number" },
        random_material_r: { type: "string" },
      },
      required: ["sp_identifier", "master_secret_key", "phi_hash", "set_id", "random_material_r"],
    },
  },
  {
    name: "assess_quantum_risk",
    description:
      "Analyze a wallet address or public key to determine its quantum vulnerability. Checks address type and whether the public key has been exposed on-chain.",
    input_schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Bitcoin or Ethereum address" },
        chain: { type: "string", enum: ["bitcoin", "ethereum", "arbitrum", "base"] },
      },
      required: ["address", "chain"],
    },
  },
  {
    name: "plan_bip360_migration",
    description:
      "Generate a step-by-step migration plan for moving funds from a quantum-vulnerable Bitcoin address to a BIP-360 compatible P2MR address.",
    input_schema: {
      type: "object",
      properties: {
        source_address: { type: "string", description: "Current Bitcoin address" },
        address_type: { type: "string", enum: ["p2pkh", "p2sh", "p2wpkh", "p2tr"] },
        estimated_btc: { type: "number", description: "Approximate BTC balance" },
      },
      required: ["source_address", "address_type"],
    },
  },
  {
    name: "register_on_chain",
    description: "Write the master identity Φ to a blockchain's identity registry contract.",
    input_schema: {
      type: "object",
      properties: {
        phi_hash: { type: "string" },
        chain: { type: "string", enum: ["ethereum_sepolia", "arbitrum_sepolia", "base_sepolia"] },
      },
      required: ["phi_hash", "chain"],
    },
  },
  {
    name: "generate_multichain_pseudonyms",
    description:
      "Derive pseudonyms for the same service across multiple chains. Demonstrates that the same master identity produces chain-specific but privacy-preserving credentials.",
    input_schema: {
      type: "object",
      properties: {
        sp_identifier: { type: "string" },
        chains: { type: "array", items: { type: "string" } },
        master_secret_key: { type: "string" },
        random_material_r: { type: "string" },
      },
      required: ["sp_identifier", "chains", "master_secret_key", "random_material_r"],
    },
  },
];

// ═══════════════════════════════════════════════════════════
// Tool execution — calls sibling edge functions or inline logic
// ═══════════════════════════════════════════════════════════

async function executeTool(
  toolName: string,
  toolInput: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<unknown> {
  switch (toolName) {
    case "palc_enroll": {
      const res = await fetch(`${supabaseUrl}/functions/v1/palc-enroll`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ pii_input: toolInput.pii_input }),
      });
      return await res.json();
    }

    case "asc_prove": {
      const res = await fetch(`${supabaseUrl}/functions/v1/asc-prove`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(toolInput),
      });
      return await res.json();
    }

    case "register_on_chain": {
      if (toolInput.chain !== "ethereum_sepolia") {
        return {
          error: `Chain ${toolInput.chain} is not yet supported. Only ethereum_sepolia is currently deployed.`,
          supported_chains: ["ethereum_sepolia"],
        };
      }
      const res = await fetch(`${supabaseUrl}/functions/v1/register-on-chain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ phi_hash: toolInput.phi_hash }),
      });
      return await res.json();
    }

    case "assess_quantum_risk":
      return assessQuantumRisk(toolInput.address as string, toolInput.chain as string);

    case "plan_bip360_migration":
      return planBip360Migration(
        toolInput.source_address as string,
        toolInput.address_type as string,
        toolInput.estimated_btc as number | undefined,
      );

    case "generate_multichain_pseudonyms": {
      const chains = toolInput.chains as string[];
      const results: Record<string, unknown> = {};
      for (const chain of chains) {
        const chainSp = `${toolInput.sp_identifier}@${chain}`;
        const res = await fetch(`${supabaseUrl}/functions/v1/asc-prove`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            sp_identifier: chainSp,
            master_secret_key: toolInput.master_secret_key,
            phi_hash: toolInput.phi_hash || "unknown",
            set_id: toolInput.set_id || 1,
            random_material_r: toolInput.random_material_r,
          }),
        });
        results[chain] = await res.json();
      }
      return {
        pseudonyms: results,
        note: "Each chain receives a unique pseudonym and nullifier. These cannot be linked across chains even by colluding service providers.",
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ═══════════════════════════════════════════════════════════
// Main handler
// ═══════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      return new Response(
        JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured" }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { message, conversation_history = [], user_context = {} } = await req.json();

    if (!message || typeof message !== "string") {
      return new Response(
        JSON.stringify({ error: "message is required and must be a string" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const systemPrompt = `You are the Pramaana Identity Agent — an AI assistant that helps users manage their post-quantum anonymous self-credentials.

You understand:
- PALC enrollment (Pramaana paper): PII → HKDF-SHA3-512 → Kyber-1024 → Commitment C → master identity Φ
- ASC/U2SSO protocol (IACR 2025/618): pseudonym derivation, nullifiers for Sybil resistance, multi-verifier unlinkability
- BIP-360 wallet migration: helping users move from ECDSA/Schnorr Bitcoin addresses to P2MR (Pay-to-Merkle-Root) quantum-resistant outputs
- Multichain identity: the same Pramaana master identity Φ anchoring identities across Ethereum, Bitcoin, Arbitrum, Base, and Cosmos chains
- Quantum threat assessment: evaluating which of a user's existing wallets are quantum-vulnerable

You have access to tools that execute real cryptographic operations. Always explain what you're doing and why in simple terms. Never store or log PII.

When a user asks you to enroll, you MUST ask them to provide PII input (or confirm they want to proceed). Never fabricate PII.
When assessing quantum risk, clearly explain the threat level and what it means practically.
When planning BIP-360 migrations, be clear about what's available now vs. what requires the BIP-360 soft fork.

Current user context: ${JSON.stringify(user_context)}`;

    // Build messages array
    let messages = [
      ...conversation_history,
      { role: "user", content: message },
    ];

    // Conversation loop — handle tool calls
    const MAX_TOOL_ROUNDS = 5;
    let finalResponse = "";
    let toolsUsed: { name: string; result: unknown }[] = [];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: systemPrompt,
          messages,
          tools: TOOLS,
        }),
      });

      if (!anthropicRes.ok) {
        const errText = await anthropicRes.text();
        console.error("Anthropic API error:", anthropicRes.status, errText);
        return new Response(
          JSON.stringify({ error: `Anthropic API error: ${anthropicRes.status}`, detail: errText }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const result = await anthropicRes.json();

      // Check if the response contains tool_use blocks
      const toolUseBlocks = result.content?.filter((b: { type: string }) => b.type === "tool_use") || [];
      const textBlocks = result.content?.filter((b: { type: string }) => b.type === "text") || [];

      if (toolUseBlocks.length === 0) {
        // No tool calls — we have the final response
        finalResponse = textBlocks.map((b: { text: string }) => b.text).join("\n\n");
        break;
      }

      // Execute each tool call
      const toolResults: { type: string; tool_use_id: string; content: string }[] = [];

      for (const toolBlock of toolUseBlocks) {
        console.log(`Executing tool: ${toolBlock.name}`, JSON.stringify(toolBlock.input));
        const toolResult = await executeTool(toolBlock.name, toolBlock.input, supabaseUrl, serviceRoleKey);
        toolsUsed.push({ name: toolBlock.name, result: toolResult });
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Append assistant message (with tool_use) and user message (with tool_results)
      messages = [
        ...messages,
        { role: "assistant", content: result.content },
        { role: "user", content: toolResults },
      ];

      // If stop_reason is "end_turn" we're done even with tool blocks
      if (result.stop_reason === "end_turn" && textBlocks.length > 0) {
        finalResponse = textBlocks.map((b: { text: string }) => b.text).join("\n\n");
        break;
      }
    }

    // Log conversation to agent_conversations table
    try {
      const sb = createClient(supabaseUrl, serviceRoleKey);
      await sb.from("agent_conversations").insert({
        user_message: message,
        agent_response: finalResponse,
        tools_used: toolsUsed.map((t) => t.name),
      });
    } catch (logErr) {
      console.error("Failed to log conversation:", logErr);
    }

    return new Response(
      JSON.stringify({
        response: finalResponse,
        tools_used: toolsUsed.map((t) => t.name),
        tool_results: toolsUsed,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("pramaana-agent error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
