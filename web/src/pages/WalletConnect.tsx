import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldAlert, AlertTriangle, Check, Copy, Loader2, Wallet, Zap,
  Users, Lock, ExternalLink, Search, Globe, ArrowRightLeft, FileCode,
  ChevronRight, X, Info, BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

declare global {
  interface Window {
    ethereum?: any;
  }
}

// ── Types ──
interface WalletState {
  address: string;
  chainId: number;
  networkName: string;
  balance: string;
  txCount: number;
  method: "metamask" | "manual";
}

interface WalletAnalysis {
  address: string;
  chain_id: number;
  is_contract: boolean;
  balance_eth: string;
  tx_count: number;
  quantum_analysis: { risk: string; risk_score: number; pubkey_exposures: number; explanation: string; exposed_in_txs: string[] };
  sybil_analysis: { sybil_score: number; max_score: number; indicators: Record<string, boolean>; explanation: string };
  pramaana_status: { enrolled: boolean; phi_hash: string | null; recommendation: string; bound_at?: string | null };
  recent_transactions: { hash: string; from?: string; to: string; value_eth: string; timestamp: string; pubkey_exposed: boolean; is_outbound?: boolean }[];
}

interface TxAnalysis {
  found?: boolean;
  tx_hash: string;
  status: string;
  block_number: number;
  timestamp: string | null;
  from: string;
  to: string;
  value_eth: string;
  gas_used: string | null;
  gas_price_gwei: string | null;
  tx_type: string;
  signature_analysis: { v: number; r: string; s: string; pubkey_recoverable: boolean; quantum_warning: string };
  contract_analysis: {
    address: string; name: string; verified: boolean; code_size_bytes: number;
    method_id: string; method_name: string; is_dangerous_method: boolean;
    threat_indicators: { level: string; indicator: string; detail: string }[];
    threat_level: string;
  } | null;
  event_logs: { address: string; topics: string[]; data: string; decoded: string | null }[];
  overall_risk: string;
  recommendations: string[];
}

interface ContractAnalysis {
  contract_address: string;
  chain_id: number;
  verification: { is_verified: boolean; contract_name: string; compiler_version: string; license: string; has_proxy: boolean; risk: string; explanation: string };
  bytecode_analysis: { code_size_bytes: number; threats: { opcode: string; severity: string; description: string }[]; dangerous_opcodes_found: string[] };
  interaction_analysis: { total_transactions: number; unique_interactors: number; failed_tx_ratio: number; total_inflow_eth: string; total_outflow_eth: string; value_pattern: string };
  overall_threat_level: string;
  threat_count: number;
  recommendations: string[];
  pramaana_relevance: string;
}

// ── Helpers ──
const truncAddr = (s: string, n = 6) => s ? `${s.slice(0, n + 2)}…${s.slice(-n)}` : "";
const networkNames: Record<number, string> = { 1: "Ethereum Mainnet", 11155111: "Sepolia Testnet", 421614: "Arbitrum Sepolia", 84532: "Base Sepolia" };
const ease = [0.16, 1, 0.3, 1] as [number, number, number, number];
const fade = { initial: { opacity: 0, y: 14, filter: "blur(4px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" }, transition: { duration: 0.5, ease } };

const invokeFn = async (fnName: string, body: Record<string, unknown>) => {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { data, ok: res.ok };
};

const riskBadge = (level: string) => {
  const map: Record<string, string> = {
    critical: "bg-destructive text-destructive-foreground",
    high: "bg-destructive/80 text-destructive-foreground",
    medium: "bg-amber-600/90 text-white",
    moderate: "bg-amber-600/90 text-white",
    low: "bg-secondary text-secondary-foreground",
    safe: "bg-secondary text-secondary-foreground",
    not_applicable: "bg-muted text-muted-foreground",
  };
  return map[level] || map.low;
};

const explorerBase = (chainId: number) => chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://etherscan.io";

const LoadingSkeleton = () => (
  <div className="space-y-4 py-6">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-24 w-full" />
    <Skeleton className="h-40 w-full" />
  </div>
);

const sybilIndicatorLabels: Record<string, string> = {
  low_diversity_recipients: "Low recipient diversity",
  rapid_fire_transactions: "Rapid-fire transactions",
  rapid_fire_txs: "Rapid-fire transactions",
  mostly_contract_calls: "Mostly contract calls",
  pure_contract_interaction: "High contract interaction",
  very_new_wallet: "Very new wallet (< 7 days)",
  single_funding_source: "Single funding source",
};

// ════════════════════════════════════════════════════════
// CONNECTION PANEL
// ════════════════════════════════════════════════════════
function ConnectionPanel({
  wallet, connecting, connectError, onConnect, onManualAnalyze, manualLoading,
}: {
  wallet: WalletState | null; connecting: boolean; connectError: string | null;
  onConnect: () => void; onManualAnalyze: (addr: string) => void; manualLoading: boolean;
}) {
  const [manualAddr, setManualAddr] = useState("");
  const [addrErr, setAddrErr] = useState("");
  const [copied, setCopied] = useState(false);

  const submit = () => {
    const a = manualAddr.trim();
    if (!a) return;
    if (!ethers.isAddress(a)) { setAddrErr("Invalid Ethereum address"); return; }
    setAddrErr("");
    onManualAnalyze(a);
  };

  const copyAddr = () => {
    if (!wallet) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <motion.div {...fade} className="grid gap-4 md:grid-cols-2">
      {/* MetaMask card */}
      <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-primary" /> Connect MetaMask</CardTitle>
        </CardHeader>
        <CardContent>
          {wallet && wallet.method === "metamask" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-secondary text-secondary-foreground gap-1 px-2.5 py-0.5"><Check className="h-3 w-3" /> Connected</Badge>
                <button onClick={copyAddr} className="flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">
                  {truncAddr(wallet.address)} {copied ? <Check className="h-3 w-3 text-secondary" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{wallet.networkName}</span>
                <span className="font-medium text-foreground">{wallet.balance} ETH</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={onConnect} disabled={connecting} className="gap-2 w-full active:scale-[0.97] transition-transform">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                {connecting ? "Connecting…" : "Connect MetaMask"}
              </Button>
              {connectError && <p className="text-xs text-destructive">{connectError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Manual address card */}
      <Card className="border-border/60 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Globe className="h-4 w-4 text-secondary" /> Analyze Any Address</CardTitle>
        </CardHeader>
        <CardContent>
          {wallet && wallet.method === "manual" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-secondary/20 text-secondary gap-1 px-2.5 py-0.5 border border-secondary/30"><Search className="h-3 w-3" /> Analyzing</Badge>
                <span className="font-mono text-xs text-muted-foreground">{truncAddr(wallet.address)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{wallet.balance} ETH · {wallet.networkName}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input placeholder="0x..." value={manualAddr} onChange={e => { setManualAddr(e.target.value); setAddrErr(""); }}
                  onKeyDown={e => e.key === "Enter" && submit()} className="font-mono text-xs" />
                <Button onClick={submit} disabled={manualLoading} className="shrink-0 gap-1.5 active:scale-[0.97] transition-transform">
                  {manualLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analyze
                </Button>
              </div>
              {addrErr && <p className="text-xs text-destructive">{addrErr}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 1: WALLET ANALYSIS
// ════════════════════════════════════════════════════════
function WalletAnalysisTab({ analysis, loading, chainId }: { analysis: WalletAnalysis | null; loading: boolean; chainId: number }) {
  if (loading) return <LoadingSkeleton />;
  if (!analysis) return <p className="py-8 text-center text-sm text-muted-foreground">Connect a wallet or enter an address to begin analysis.</p>;

  const qa = analysis.quantum_analysis;
  const sa = analysis.sybil_analysis;
  const base = explorerBase(chainId);

  return (
    <motion.div {...fade} className="space-y-6">
      {/* Quantum Risk */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4 text-amber-500" /> Quantum Risk Assessment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <Badge className={`${riskBadge(qa.risk)} text-sm px-3 py-1`}>{qa.risk.toUpperCase()}</Badge>
            <span className="text-sm text-muted-foreground tabular-nums">{qa.risk_score}/100</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] text-muted-foreground"><span>Safe</span><span>Critical</span></div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, hsl(var(--secondary)), hsl(48 96% 53%), hsl(var(--destructive)))" }}
                initial={{ width: 0 }} animate={{ width: `${qa.risk_score}%` }} transition={{ duration: 1, ease }} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{qa.explanation}</p>
          <div className="grid grid-cols-3 gap-3">
            {[["Transactions", analysis.tx_count], ["Pubkey Exposures", qa.pubkey_exposures], ["Risk Score", qa.risk_score]].map(([l, v]) => (
              <div key={String(l)} className="rounded-lg border border-border/40 p-3 text-center">
                <div className="text-xl font-bold tabular-nums">{v}</div>
                <div className="text-[10px] text-muted-foreground">{l}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sybil Score */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-destructive" /> Sybil Exposure</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(sa.indicators).map(([k, flagged]) => (
              <div key={k} className={`rounded-md border px-2.5 py-2 text-[11px] flex items-center gap-1.5 ${flagged ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-border/40 text-muted-foreground"}`}>
                {flagged ? <X className="h-3 w-3 shrink-0" /> : <Check className="h-3 w-3 shrink-0" />}
                {sybilIndicatorLabels[k] || k.replace(/_/g, " ")}
              </div>
            ))}
          </div>
          <div className="text-center">
            <span className="text-2xl font-bold tabular-nums">{sa.sybil_score}</span>
            <span className="text-sm text-muted-foreground">/{sa.max_score} indicators</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{sa.explanation}</p>
        </CardContent>
      </Card>

      {/* Transaction table */}
      {analysis.recent_transactions.length > 0 && (
        <Card className="border-border/60 bg-card/80">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" /> Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow><TableHead className="text-xs">Tx Hash</TableHead><TableHead className="text-xs">To</TableHead><TableHead className="text-xs text-right">Value</TableHead><TableHead className="text-xs">Time</TableHead><TableHead className="text-xs">Key Exposed</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {analysis.recent_transactions.map(tx => (
                    <TableRow key={tx.hash} className={tx.pubkey_exposed ? "bg-destructive/5" : ""}>
                      <TableCell className="font-mono text-[11px]">
                        <a href={`${base}/tx/${tx.hash}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{truncAddr(tx.hash, 4)}</a>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{truncAddr(tx.to, 4)}</TableCell>
                      <TableCell className="text-[11px] text-right tabular-nums">{Number(tx.value_eth).toFixed(4)}</TableCell>
                      <TableCell className="text-[11px] text-muted-foreground">{new Date(tx.timestamp).toLocaleDateString()}</TableCell>
                      <TableCell>{tx.pubkey_exposed ? <Badge variant="destructive" className="text-[9px] px-1.5">Yes</Badge> : <span className="text-[11px] text-muted-foreground">No</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pramaana Status */}
      <Card className={`border-border/60 bg-card/80 ${analysis.pramaana_status.enrolled ? "border-secondary/30" : "border-amber-600/30"}`}>
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <Shield className={`h-5 w-5 ${analysis.pramaana_status.enrolled ? "text-secondary" : "text-amber-500"}`} />
            <div>
              <Badge className={analysis.pramaana_status.enrolled ? "bg-secondary text-secondary-foreground" : "bg-amber-600/90 text-white"}>
                {analysis.pramaana_status.enrolled ? "PROTECTED" : "UNPROTECTED"}
              </Badge>
              {analysis.pramaana_status.phi_hash && <p className="font-mono text-[10px] text-muted-foreground mt-1">Φ = {truncAddr(analysis.pramaana_status.phi_hash, 10)}</p>}
            </div>
          </div>
          {!analysis.pramaana_status.enrolled && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.location.href = "/enroll"}>
              Enroll Now <ChevronRight className="h-3 w-3" />
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 2: TRANSACTION ANALYZER
// ════════════════════════════════════════════════════════
function TransactionAnalyzerTab({ chainId }: { chainId: number }) {
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TxAnalysis | null>(null);
  const [error, setError] = useState("");

  const analyze = async () => {
    const h = hash.trim();
    if (!h || !h.startsWith("0x") || h.length !== 66) { setError("Enter a valid 66-char tx hash"); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-transaction`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ tx_hash: h, chain_id: chainId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
      } else if (data.found === false) {
        setError(data.error || "Transaction not found on this chain");
      } else if (data.error) {
        setError(data.error || `Request failed (${res.status})`);
      } else {
        setResult(data);
      }
    } catch (e: any) { setError(e.message || "Analysis failed"); }
    setLoading(false);
  };

  const base = explorerBase(chainId);

  return (
    <motion.div {...fade} className="space-y-6">
      <div className="flex gap-2">
        <Input placeholder="Enter transaction hash (0x...)" value={hash} onChange={e => { setHash(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && analyze()} className="font-mono text-xs" />
        <Button onClick={analyze} disabled={loading} className="shrink-0 gap-1.5 active:scale-[0.97] transition-transform">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Analyze
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <LoadingSkeleton />}

      {result && (
        <AnimatePresence>
          <motion.div {...fade} className="space-y-4">
            {/* Tx details */}
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3"><CardTitle className="text-base">Transaction Details</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    ["Status", result.status === "success" ? "✅ Success" : "❌ Failed"],
                    ["Block", result.block_number],
                    ["Type", result.tx_type.replace("_", " ")],
                    ["From", <a key="f" href={`${base}/address/${result.from}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">{truncAddr(result.from, 4)}</a>],
                    ["To", <a key="t" href={`${base}/address/${result.to}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-mono">{truncAddr(result.to, 4)}</a>],
                    ["Value", `${Number(result.value_eth).toFixed(6)} ETH`],
                    ["Gas Used", result.gas_used || "—"],
                    ["Gas Price", result.gas_price_gwei ? `${Number(result.gas_price_gwei).toFixed(2)} gwei` : "—"],
                    ["Time", result.timestamp ? new Date(result.timestamp).toLocaleString() : "—"],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="rounded-md border border-border/40 px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">{String(label)}</div>
                      <div className="font-medium mt-0.5">{val}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Signature */}
            <Card className="border-amber-600/30 bg-card/80">
              <CardContent className="py-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">ECDSA Signature Exposed</span>
                  <Badge className="bg-amber-600/90 text-white text-[10px]">Quantum Vulnerable</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{result.signature_analysis.quantum_warning}</p>
              </CardContent>
            </Card>

            {/* Contract analysis */}
            {result.contract_analysis && (
              <Card className="border-border/60 bg-card/80">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileCode className="h-4 w-4" /> Contract Interaction
                    <Badge className={result.contract_analysis.verified ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"}>
                      {result.contract_analysis.verified ? "Verified" : "UNVERIFIED"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-md border border-border/40 px-3 py-2"><div className="text-[10px] text-muted-foreground">Contract</div><div className="font-medium">{result.contract_analysis.name}</div></div>
                    <div className="rounded-md border border-border/40 px-3 py-2">
                      <div className="text-[10px] text-muted-foreground">Method</div>
                      <div className="font-medium flex items-center gap-1">{result.contract_analysis.method_name.split("—")[0]}
                        {result.contract_analysis.is_dangerous_method && <AlertTriangle className="h-3 w-3 text-destructive" />}
                      </div>
                    </div>
                  </div>
                  {result.contract_analysis.threat_indicators.length > 0 && (
                    <div className="space-y-2">
                      {result.contract_analysis.threat_indicators.map((t, i) => (
                        <div key={i} className={`rounded-md border px-3 py-2 text-xs ${t.level === "critical" ? "border-destructive/50 bg-destructive/10" : t.level === "high" ? "border-amber-600/40 bg-amber-600/10" : "border-border/40 bg-muted/20"}`}>
                          <div className="flex items-center gap-1.5 font-medium">
                            <Badge className={`${riskBadge(t.level)} text-[9px] px-1.5`}>{t.level.toUpperCase()}</Badge>
                            {t.indicator}
                          </div>
                          <p className="text-muted-foreground mt-1">{t.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Event logs */}
            {result.event_logs.length > 0 && (
              <Card className="border-border/60 bg-card/80">
                <CardHeader className="pb-3"><CardTitle className="text-base">Event Logs</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {result.event_logs.map((log, i) => (
                    <div key={i} className="rounded-md border border-border/40 px-3 py-2 text-xs font-mono">
                      <span className="text-muted-foreground">{truncAddr(log.address, 4)}</span>
                      {log.decoded && <Badge variant="outline" className="ml-2 text-[9px]">{log.decoded}</Badge>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            <Card className="border-primary/20 bg-card/80">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {result.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <ChevronRight className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                    <span className="text-muted-foreground">{r}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 3: CONTRACT SCANNER
// ════════════════════════════════════════════════════════
function ContractScannerTab({ chainId }: { chainId: number }) {
  const [addr, setAddr] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ContractAnalysis | null>(null);
  const [error, setError] = useState("");

  const scan = async () => {
    const a = addr.trim();
    if (!a || !ethers.isAddress(a)) { setError("Enter a valid contract address"); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const { data, ok } = await invokeFn("analyze-contract", { contract_address: a, chain_id: chainId });
      if (!ok || data?.error) { setError(data?.error || "Scan failed"); } else { setResult(data); }
    } catch (e: any) { setError(e.message || "Scan failed"); }
    setLoading(false);
  };

  const flowData = result ? [
    { name: "Inflow", value: parseFloat(result.interaction_analysis.total_inflow_eth) || 0 },
    { name: "Outflow", value: parseFloat(result.interaction_analysis.total_outflow_eth) || 0 },
  ] : [];

  return (
    <motion.div {...fade} className="space-y-6">
      <div className="flex gap-2">
        <Input placeholder="Enter contract address (0x...)" value={addr} onChange={e => { setAddr(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && scan()} className="font-mono text-xs" />
        <Button onClick={scan} disabled={loading} className="shrink-0 gap-1.5 active:scale-[0.97] transition-transform">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCode className="h-4 w-4" />} Scan
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <LoadingSkeleton />}

      {result && (
        <AnimatePresence>
          <motion.div {...fade} className="space-y-4">
            {/* Verification + overall threat */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="border-border/60 bg-card/80">
                <CardContent className="py-5 text-center space-y-2">
                  <Badge className={`${result.verification.is_verified ? "bg-secondary text-secondary-foreground" : "bg-destructive text-destructive-foreground"} text-lg px-4 py-1.5`}>
                    {result.verification.is_verified ? "VERIFIED" : "UNVERIFIED"}
                  </Badge>
                  <p className="text-xs text-muted-foreground">{result.verification.contract_name}</p>
                  <p className="text-[10px] text-muted-foreground">Compiler: {result.verification.compiler_version}</p>
                </CardContent>
              </Card>
              <Card className="border-border/60 bg-card/80">
                <CardContent className="py-5 text-center space-y-2">
                  <Badge className={`${riskBadge(result.overall_threat_level)} text-lg px-4 py-1.5`}>
                    {result.overall_threat_level.toUpperCase()} THREAT
                  </Badge>
                  <p className="text-xs text-muted-foreground">{result.threat_count} threat{result.threat_count !== 1 ? "s" : ""} detected</p>
                  <p className="text-xs text-muted-foreground">{result.bytecode_analysis.code_size_bytes} bytes of bytecode</p>
                </CardContent>
              </Card>
            </div>

            {/* Threats */}
            {result.bytecode_analysis.threats.length > 0 && (
              <Card className="border-border/60 bg-card/80">
                <CardHeader className="pb-3"><CardTitle className="text-base">Threat Indicators</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {result.bytecode_analysis.threats.map((t, i) => (
                    <div key={i} className={`rounded-md border px-3 py-2.5 text-xs ${t.severity === "critical" ? "border-destructive/50 bg-destructive/10" : t.severity === "high" ? "border-amber-600/40 bg-amber-600/10" : "border-border/40"}`}>
                      <div className="flex items-center gap-2">
                        <Badge className={`${riskBadge(t.severity)} text-[9px] px-1.5`}>{t.severity.toUpperCase()}</Badge>
                        <span className="font-medium font-mono">{t.opcode}</span>
                      </div>
                      <p className="text-muted-foreground mt-1.5">{t.description}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Interaction patterns */}
            <Card className="border-border/60 bg-card/80">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" /> Interaction Patterns</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    ["Transactions", result.interaction_analysis.total_transactions],
                    ["Unique Users", result.interaction_analysis.unique_interactors],
                    ["Failed Ratio", `${(result.interaction_analysis.failed_tx_ratio * 100).toFixed(1)}%`],
                  ].map(([l, v]) => (
                    <div key={String(l)} className="rounded-lg border border-border/40 p-3 text-center">
                      <div className="text-xl font-bold tabular-nums">{v}</div>
                      <div className="text-[10px] text-muted-foreground">{l}</div>
                    </div>
                  ))}
                </div>
                {(flowData[0].value > 0 || flowData[1].value > 0) && (
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={flowData}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(220 10% 55%)" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: "hsl(220 10% 55%)" }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ background: "hsl(230 22% 11%)", border: "1px solid hsl(230 15% 18%)", borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          <Cell fill="hsl(174 60% 42%)" />
                          <Cell fill="hsl(0 72% 51%)" />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recommendations */}
            <Card className="border-primary/20 bg-card/80">
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><Info className="h-4 w-4 text-primary" /> Recommendations</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {result.recommendations.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs"><ChevronRight className="h-3 w-3 text-primary mt-0.5 shrink-0" /><span className="text-muted-foreground">{r}</span></div>
                ))}
                <Separator className="my-3" />
                <p className="text-[11px] text-muted-foreground italic">{result.pramaana_relevance}</p>
              </CardContent>
            </Card>
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// TAB 4: SYBIL RESISTANCE DEMO
// ════════════════════════════════════════════════════════
function SybilDemoTab({ walletAddress }: { walletAddress: string | null }) {
  const [burners, setBurners] = useState<{ address: string; pk: string }[]>([]);
  const [sybilResult, setSybilResult] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const genBurners = () => {
    const t0 = performance.now();
    const w = Array.from({ length: 5 }, () => { const wal = ethers.Wallet.createRandom(); return { address: wal.address, pk: wal.privateKey }; });
    const ms = (performance.now() - t0).toFixed(0);
    setBurners(w);
    toast({ title: `5 wallets generated in ${ms}ms`, description: "Each is a valid, independent Ethereum identity." });
  };

  const checkSybil = async () => {
    if (!walletAddress) { toast({ title: "Connect a wallet first", variant: "destructive" }); return; }
    setChecking(true);
    try {
      const { data } = await invokeFn("sybil-check", { wallet_address: walletAddress, context: "airdrop_claim" });
      setSybilResult(data);
    } catch (e: any) { toast({ title: "Check failed", description: e.message, variant: "destructive" }); }
    setChecking(false);
  };

  return (
    <motion.div {...fade} className="space-y-6">
      {/* Burner wallets demo */}
      <Card className="border-destructive/20 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-destructive" /> Why Wallets Don't Stop Sybil Attacks</CardTitle>
          <CardDescription>Generate free wallets instantly — each is a valid identity.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={genBurners} variant="destructive" className="gap-2 w-full active:scale-[0.97] transition-transform">
            <Zap className="h-4 w-4" /> Generate 5 Burner Wallets
          </Button>
          <AnimatePresence>
            {burners.length > 0 && (
              <motion.div {...fade} className="space-y-2">
                {burners.map((b, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2 font-mono text-[11px]">
                    <span className="text-muted-foreground w-4">#{i + 1}</span>
                    <span className="truncate flex-1">{b.address}</span>
                  </div>
                ))}
                <p className="text-xs text-destructive leading-relaxed">Created 5 identities in under a second. Zero cost. <strong>This is the Sybil problem.</strong></p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Sybil check */}
      <Card className="border-secondary/20 bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Shield className="h-4 w-4 text-secondary" /> Pramaana Sybil Check</CardTitle>
          <CardDescription>Check if {walletAddress ? truncAddr(walletAddress) : "your wallet"} has identity-level Sybil protection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={checkSybil} disabled={checking || !walletAddress} variant="outline" className="gap-2 w-full active:scale-[0.97] transition-transform">
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Run Sybil Resistance Check
          </Button>
          {sybilResult && (
            <motion.div {...fade} className={`rounded-lg border p-4 space-y-2 ${sybilResult.sybil_resistant ? "border-secondary/40 bg-secondary/5" : "border-destructive/40 bg-destructive/5"}`}>
              <div className={`text-sm font-medium ${sybilResult.sybil_resistant ? "text-secondary" : "text-destructive"}`}>{sybilResult.verdict}</div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Sybil resistant: <strong>{sybilResult.sybil_resistant ? "YES" : "NO"}</strong></div>
                <div>Quantum protected: <strong>{sybilResult.quantum_protected ? "YES" : "NO"}</strong></div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Comparison table */}
      <Card className="border-border/60 bg-card/80">
        <CardHeader className="pb-3"><CardTitle className="text-base">Wallet Identity vs Pramaana Identity</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs text-muted-foreground">Property</TableHead>
                  <TableHead className="text-xs text-destructive">MetaMask Wallets</TableHead>
                  <TableHead className="text-xs text-secondary">Pramaana Identity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Cost to create", "Free (instant)", "Requires unique PII"],
                  ["Identities per person", "Unlimited", "Exactly one"],
                  ["Service linkability", "Same address = linked", "Unlinkable pseudonyms"],
                  ["Quantum safety", "None (ECDSA)", "Kyber-1024 (256-bit PQ)"],
                  ["On-chain footprint", "Full tx history", "Only H(C) commitment"],
                ].map(([prop, wallet, pram]) => (
                  <TableRow key={prop}>
                    <TableCell className="text-xs font-medium">{prop}</TableCell>
                    <TableCell className="text-xs text-destructive/80">{wallet}</TableCell>
                    <TableCell className="text-xs text-secondary">{pram}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════
const WalletConnectPage = () => {
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [analysis, setAnalysis] = useState<WalletAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeTab, setActiveTab] = useState("analysis");

  const analyzeAddress = useCallback(async (address: string, chainId: number, method: "metamask" | "manual" = "manual") => {
    setAnalyzing(true);
    try {
      const { data, ok } = await invokeFn("analyze-wallet", { address, chain_id: chainId });
      if (ok && data && !data.error) {
        setAnalysis(data);
        if (!wallet || wallet.method === "manual") {
          setWallet({
            address, chainId, method,
            networkName: networkNames[chainId] || `Chain ${chainId}`,
            balance: data.balance_eth || "0",
            txCount: data.tx_count || 0,
          });
        }
      }
    } catch { /* optional enhancement */ }
    setAnalyzing(false);
  }, [wallet]);

  const connectWallet = useCallback(async () => {
    setConnectError(null);
    if (window !== window.parent) {
      setConnectError("MetaMask cannot connect inside Lovable's preview. Use the deployed URL or enter an address manually.");
      return;
    }
    if (!window.ethereum) {
      setConnectError("MetaMask not detected. Install MetaMask or use manual address input.");
      window.open("https://metamask.io/download/", "_blank");
      return;
    }
    setConnecting(true);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();
      const network = await provider.getNetwork();
      const balance = await provider.getBalance(address);
      const txCount = await provider.getTransactionCount(address);
      const chainId = Number(network.chainId);
      setWallet({
        address, chainId, method: "metamask",
        networkName: networkNames[chainId] || `Chain ${chainId}`,
        balance: Number(ethers.formatEther(balance)).toFixed(4),
        txCount,
      });
      analyzeAddress(address, chainId, "metamask");
    } catch (e: any) {
      setConnectError(e.code === 4001 ? "Connection rejected by user." : `MetaMask error: ${e.message}`);
    }
    setConnecting(false);
  }, [analyzeAddress]);

  const chainId = wallet?.chainId || 11155111;

  return (
    <div className="container mx-auto max-w-4xl px-6 py-12 space-y-8">
      <motion.div {...fade}>
        <h1 className="text-3xl font-bold tracking-tight" style={{ lineHeight: "1.1" }}>Wallet Security Scanner</h1>
        <p className="mt-2 text-muted-foreground text-sm">Quantum vulnerability analysis, Sybil exposure detection, and contract threat scanning.</p>
      </motion.div>

      <ConnectionPanel
        wallet={wallet} connecting={connecting} connectError={connectError}
        onConnect={connectWallet}
        onManualAnalyze={(a) => analyzeAddress(a, 11155111, "manual")}
        manualLoading={analyzing}
      />

      <motion.div {...fade} transition={{ ...fade.transition, delay: 0.15 }}>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="analysis" className="gap-1.5 text-xs"><Shield className="h-3.5 w-3.5" /> Wallet</TabsTrigger>
            <TabsTrigger value="transaction" className="gap-1.5 text-xs"><ArrowRightLeft className="h-3.5 w-3.5" /> Transaction</TabsTrigger>
            <TabsTrigger value="contract" className="gap-1.5 text-xs"><FileCode className="h-3.5 w-3.5" /> Contract</TabsTrigger>
            <TabsTrigger value="sybil" className="gap-1.5 text-xs"><Users className="h-3.5 w-3.5" /> Sybil Demo</TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-6">
            <WalletAnalysisTab analysis={analysis} loading={analyzing} chainId={chainId} />
          </TabsContent>
          <TabsContent value="transaction" className="mt-6">
            <TransactionAnalyzerTab chainId={chainId} />
          </TabsContent>
          <TabsContent value="contract" className="mt-6">
            <ContractScannerTab chainId={chainId} />
          </TabsContent>
          <TabsContent value="sybil" className="mt-6">
            <SybilDemoTab walletAddress={wallet?.address || null} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
};

export default WalletConnectPage;
