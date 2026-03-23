import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Send,
  Trash2,
  Loader2,
  Fingerprint,
  ShieldCheck,
  AlertTriangle,
  ArrowRightLeft,
  Globe,
  Zap,
  User,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────

interface ToolExecution {
  name: string;
  status: "running" | "done";
  result?: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: ToolExecution[];
}

interface UserContext {
  phi_hash?: string;
  set_id?: string;
  has_master_key: boolean;
  connected_chains: string[];
  registered_services: string[];
}

// ── Helpers ────────────────────────────────────────────────

const TOOL_META: Record<string, { label: string; icon: typeof Bot }> = {
  palc_enroll: { label: "PALC Enrollment", icon: Fingerprint },
  asc_prove: { label: "ASC Pseudonym Derivation", icon: ShieldCheck },
  assess_quantum_risk: { label: "Quantum Risk Assessment", icon: AlertTriangle },
  plan_bip360_migration: { label: "BIP-360 Migration Plan", icon: ArrowRightLeft },
  register_on_chain: { label: "On-Chain Registration", icon: Globe },
  generate_multichain_pseudonyms: { label: "Multichain Pseudonyms", icon: Zap },
};

function toolSummary(name: string, result: Record<string, unknown>): string {
  if (name === "assess_quantum_risk") {
    const r = result as { risk_level?: string; address?: string };
    return `Risk: ${(r.risk_level ?? "unknown").toUpperCase()} — ${r.address ?? "address"}`;
  }
  if (name === "palc_enroll") {
    const r = result as { phi_hash?: string; error?: string };
    if (r.error) return `Error: ${r.error}`;
    return `Enrolled Φ = ${(r.phi_hash ?? "").slice(0, 16)}…`;
  }
  if (name === "register_on_chain") {
    const r = result as { tx_hash?: string; error?: string };
    if (r.error) return `Error: ${r.error}`;
    return `TX: ${(r.tx_hash ?? "").slice(0, 18)}…`;
  }
  if (name === "plan_bip360_migration") {
    const r = result as { steps?: unknown[] };
    return `${r.steps?.length ?? 0}-step migration plan generated`;
  }
  if (name === "asc_prove") {
    const r = result as { pseudonym?: string; error?: string };
    if (r.error) return `Error: ${r.error}`;
    return `Pseudonym: ${(r.pseudonym ?? "").slice(0, 16)}…`;
  }
  return "Completed";
}

function loadUserContext(): UserContext {
  try {
    const phi = localStorage.getItem("pramaana_phi_hash") || undefined;
    const setId = localStorage.getItem("pramaana_set_id") || undefined;
    const sk = localStorage.getItem("pramaana_master_secret_key");
    return {
      phi_hash: phi,
      set_id: setId,
      has_master_key: !!sk,
      connected_chains: ["ethereum_sepolia"],
      registered_services: JSON.parse(localStorage.getItem("pramaana_registered_services") || "[]"),
    };
  } catch {
    return { has_master_key: false, connected_chains: [], registered_services: [] };
  }
}

const SUGGESTIONS = [
  "Enroll my identity with post-quantum protection",
  "Is my Bitcoin wallet quantum-safe?",
  "Help me migrate to a BIP-360 address",
  "Register me with the demo news service",
  "Show me how multichain identity works",
  "What happens if a quantum computer attacks my wallet?",
];

let msgCounter = 0;
const uid = () => `msg-${++msgCounter}-${Date.now()}`;

// ── Component ──────────────────────────────────────────────

const Agent = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, []);

  useEffect(scrollToBottom, [messages, scrollToBottom]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { id: uid(), role: "user", content: text.trim() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setLoading(true);

    // Build conversation_history for the API (role + content only)
    const apiHistory = messages.map((m) => ({ role: m.role, content: m.content }));
    const ctx = loadUserContext();

    try {
      const { data, error } = await supabase.functions.invoke("pramaana-agent", {
        body: {
          message: text.trim(),
          conversation_history: apiHistory,
          user_context: ctx,
        },
      });

      if (error) throw error;

      // Build tool execution cards
      const tools: ToolExecution[] = (data.tool_results || []).map(
        (t: { name: string; result: Record<string, unknown> }) => ({
          name: t.name,
          status: "done" as const,
          result: t.result,
        }),
      );

      // Try to persist enrollment data if palc_enroll ran
      for (const t of data.tool_results || []) {
        if (t.name === "palc_enroll" && t.result && !t.result.error) {
          const r = t.result as {
            phi_hash?: string;
            master_secret_key_local_only?: string;
            set_id?: number;
          };
          if (r.phi_hash) localStorage.setItem("pramaana_phi_hash", r.phi_hash);
          if (r.master_secret_key_local_only)
            localStorage.setItem("pramaana_master_secret_key", r.master_secret_key_local_only);
          if (r.set_id !== undefined) localStorage.setItem("pramaana_set_id", String(r.set_id));
        }
      }

      const assistantMsg: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.response || "I couldn't generate a response.",
        tools: tools.length > 0 ? tools : undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: `⚠️ Error: ${errMsg}` },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">Pramaana Agent</h1>
            <p className="text-xs text-muted-foreground">Post-quantum identity assistant</p>
          </div>
        </div>
        {messages.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1.5 text-xs text-muted-foreground">
            <Trash2 className="h-3.5 w-3.5" />
            Clear
          </Button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
          {isEmpty && (
            <div className="flex flex-col items-center pt-16">
              <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bot className="h-8 w-8" />
              </div>
              <h2 className="mb-2 text-lg font-semibold text-foreground">How can I help?</h2>
              <p className="mb-8 max-w-md text-center text-sm text-muted-foreground">
                I can enroll your identity, assess quantum risks, plan BIP-360 migrations, and register you with
                services — all using real cryptographic operations.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="rounded-full border border-border/60 bg-card px-4 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground active:scale-[0.97]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div className={`max-w-[80%] space-y-3 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                {/* Tool execution cards */}
                {msg.tools?.map((tool, i) => {
                  const meta = TOOL_META[tool.name] || { label: tool.name, icon: Bot };
                  const Icon = meta.icon;
                  return (
                    <Card
                      key={i}
                      className="border-primary/30 bg-primary/5 px-4 py-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-primary" />
                        <span className="text-xs font-medium text-foreground">{meta.label}</span>
                        {tool.status === "running" ? (
                          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-primary" />
                        ) : (
                          <span className="ml-auto text-[10px] font-medium text-emerald-500">✓ Done</span>
                        )}
                      </div>
                      {tool.status === "done" && tool.result && (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {toolSummary(tool.name, tool.result)}
                        </p>
                      )}
                    </Card>
                  );
                })}

                {/* Message bubble */}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-[hsl(168,76%,22%)] text-white rounded-br-md"
                      : "bg-muted/60 text-foreground rounded-bl-md"
                  }`}
                >
                  {msg.content}
                </div>
              </div>

              {msg.role === "user" && (
                <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[hsl(168,76%,22%)]/20 text-[hsl(168,76%,22%)]">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          ))}

          {/* Typing indicator */}
          {loading && (
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-muted/60 px-4 py-3">
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:0ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/40 [animation-delay:300ms]" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border/40 px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Ask about quantum-safe identity, BIP-360, enrollment…"
            disabled={loading}
            className="flex-1 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-50"
          />
          <Button
            size="icon"
            onClick={() => sendMessage(input)}
            disabled={loading || !input.trim()}
            className="h-11 w-11 rounded-xl"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl text-center text-[10px] text-muted-foreground/50">
          Pramaana Agent executes real cryptographic operations. PII is consumed as entropy and permanently erased.
        </p>
      </div>
    </div>
  );
};

export default Agent;
