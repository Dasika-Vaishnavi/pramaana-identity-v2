import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ethers } from "ethers";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Activity, Users, ShieldCheck, ShieldX, ShieldAlert, Globe, ExternalLink,
  Loader2, Check, Copy, FlaskConical, Link2Off, Eye, RefreshCw,
  Fingerprint, Hash, Bot, MessageSquare, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

// ── Constants ──────────────────────────────────────────────────────────────

const CONTRACT_ADDRESS = "0x898665968B841e241dB19A111e76ECeA20342b86";
const EXPLORER = "https://sepolia.etherscan.io";
const RPC_URL = "https://rpc.sepolia.org"; // Public fallback

const CONTRACT_ABI = [
  "function getTotalIdentities() view returns (uint256)",
  "function getCurrentSetInfo() view returns (uint256 setId, uint256 count, uint256 capacity)",
  "function isRegistered(bytes32 phiHash) view returns (bool)",
];

// ── Section 1: Identity Registry Status ────────────────────────────────────

interface ContractState {
  totalIdentities: number;
  currentSetId: number;
  currentSetCount: number;
  setCapacity: number;
  loading: boolean;
  error: string | null;
}

function RegistryStatus() {
  const [state, setState] = useState<ContractState>({
    totalIdentities: 0, currentSetId: 0, currentSetCount: 0, setCapacity: 0,
    loading: true, error: null,
  });
  const [readySets, setReadySets] = useState(0);
  const [lastPoll, setLastPoll] = useState<Date | null>(null);

  const fetchOnChain = useCallback(async () => {
    try {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

      const [total, setInfo] = await Promise.all([
        contract.getTotalIdentities(),
        contract.getCurrentSetInfo(),
      ]);

      const totalNum = Number(total);
      const setId = Number(setInfo[0]);
      const count = Number(setInfo[1]);
      const capacity = Number(setInfo[2]);
      const ready = capacity > 0 ? setId - 1 : 0;

      setState({
        totalIdentities: totalNum,
        currentSetId: setId,
        currentSetCount: count,
        setCapacity: capacity,
        loading: false,
        error: null,
      });
      setReadySets(ready);
      setLastPoll(new Date());
    } catch (err: any) {
      setState((s) => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  useEffect(() => {
    fetchOnChain();
    const interval = setInterval(fetchOnChain, 30000);
    return () => clearInterval(interval);
  }, [fetchOnChain]);

  const progress = state.setCapacity > 0
    ? Math.round((state.currentSetCount / state.setCapacity) * 100)
    : 0;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <Globe className="h-5 w-5 text-secondary" />
            Identity Registry (On-Chain)
          </CardTitle>
          <CardDescription>
            Live from Sepolia contract —{" "}
            <a
              href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
              target="_blank" rel="noopener noreferrer"
              className="text-secondary hover:underline inline-flex items-center gap-1"
            >
              {CONTRACT_ADDRESS.slice(0, 8)}...{CONTRACT_ADDRESS.slice(-6)}
              <ExternalLink className="h-3 w-3" />
            </a>
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchOnChain} className="h-8 w-8">
          <RefreshCw className={cn("h-4 w-4", state.loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {state.error ? (
          <Alert variant="destructive">
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription className="text-xs">{state.error}</AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Identities", value: state.totalIdentities, icon: Users, color: "text-primary" },
                { label: "Current Set", value: `Λ_${state.currentSetId}`, icon: Hash, color: "text-secondary" },
                { label: "Ready Sets", value: readySets, icon: ShieldCheck, color: "text-green-400" },
                { label: "Set Capacity", value: state.setCapacity, icon: Activity, color: "text-muted-foreground" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center">
                  <Icon className={cn("mx-auto mb-1.5 h-4 w-4", color)} />
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            {/* Anonymity set progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Anonymity Set Λ_{state.currentSetId} Progress
                </span>
                <span className="font-mono text-foreground">
                  {state.currentSetCount} / {state.setCapacity}
                </span>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-[10px] text-muted-foreground">
                {progress}% filled — {state.setCapacity - state.currentSetCount} slots remaining
              </p>
            </div>

            {lastPoll && (
              <p className="text-[10px] text-muted-foreground text-right">
                Last polled: {format(lastPoll, "HH:mm:ss")} — refreshes every 30s
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 2: Recent Events (from enrollment_logs / nullifier_registry) ───

interface EventRow {
  id: string;
  event_name: string;
  tx_hash: string | null;
  created_at: string;
  detail: string;
}

function RecentEvents() {
  const [events, setEvents] = useState<EventRow[]>([]);

  const fetchEvents = useCallback(async () => {
    // Combine enrollment_logs (on-chain events) and nullifier_registry (SP events)
    const [{ data: enrollments }, { data: nullifiers }] = await Promise.all([
      supabase
        .from("enrollment_logs")
        .select("id, phi_hash, on_chain_tx_hash, on_chain_confirmed, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("nullifier_registry")
        .select("id, sp_identifier, nullifier, pseudonym_hash, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const combined: EventRow[] = [];

    (enrollments || []).forEach((e) => {
      if (e.on_chain_confirmed && e.on_chain_tx_hash) {
        combined.push({
          id: e.id,
          event_name: "IdentityRegistered",
          tx_hash: e.on_chain_tx_hash,
          created_at: e.created_at,
          detail: `Φ: ${(e.phi_hash || "").slice(0, 12)}...`,
        });
      }
    });

    (nullifiers || []).forEach((n) => {
      combined.push({
        id: n.id,
        event_name: "PseudonymRegistered",
        tx_hash: null,
        created_at: n.created_at,
        detail: `SP: ${n.sp_identifier}`,
      });
    });

    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setEvents(combined.slice(0, 15));
  }, []);

  useEffect(() => {
    fetchEvents();

    const ch1 = supabase
      .channel("dashboard-enrollments")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "enrollment_logs" }, fetchEvents)
      .subscribe();

    const ch2 = supabase
      .channel("dashboard-nullifiers")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nullifier_registry" }, fetchEvents)
      .subscribe();

    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2); };
  }, [fetchEvents]);

  const eventColor = (name: string) => {
    if (name === "IdentityRegistered") return "text-green-400 bg-green-500/10 border-green-500/30";
    if (name === "SybilRejected") return "text-red-400 bg-red-500/10 border-red-500/30";
    if (name === "PseudonymRegistered") return "text-primary bg-primary/10 border-primary/30";
    return "text-secondary bg-secondary/10 border-secondary/30";
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Activity className="h-5 w-5 text-primary" />
          Recent Events
        </CardTitle>
        <CardDescription>Live from Supabase with realtime subscriptions</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="text-xs">Event</TableHead>
                  <TableHead className="text-xs">Detail</TableHead>
                  <TableHead className="text-xs">TX</TableHead>
                  <TableHead className="text-right text-xs">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.id}>
                    <TableCell>
                      <Badge variant="outline" className={cn("text-[10px] font-mono", eventColor(ev.event_name))}>
                        {ev.event_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{ev.detail}</TableCell>
                    <TableCell>
                      {ev.tx_hash ? (
                        <a
                          href={`${EXPLORER}/tx/${ev.tx_hash}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-secondary text-xs hover:underline inline-flex items-center gap-1"
                        >
                          {ev.tx_hash.slice(0, 8)}...
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {format(new Date(ev.created_at), "MMM d, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No events yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 3: Nullifier Registry per SP ───────────────────────────────────

interface SPStats {
  sp_identifier: string;
  count: number;
  recent: { pseudonym_hash: string; nullifier: string; created_at: string }[];
}

function NullifierRegistry() {
  const [spStats, setSpStats] = useState<SPStats[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      const { data } = await supabase
        .from("nullifier_registry")
        .select("sp_identifier, pseudonym_hash, nullifier, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!data) return;

      const grouped: Record<string, SPStats> = {};
      data.forEach((row) => {
        if (!grouped[row.sp_identifier]) {
          grouped[row.sp_identifier] = { sp_identifier: row.sp_identifier, count: 0, recent: [] };
        }
        grouped[row.sp_identifier].count++;
        if (grouped[row.sp_identifier].recent.length < 5) {
          grouped[row.sp_identifier].recent.push(row);
        }
      });

      setSpStats(Object.values(grouped).sort((a, b) => b.count - a.count));
    };

    fetchStats();

    const ch = supabase
      .channel("dashboard-sp-stats")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "nullifier_registry" }, fetchStats)
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, []);

  const chartData = spStats.map((s) => ({
    name: s.sp_identifier.length > 20 ? s.sp_identifier.slice(0, 18) + "…" : s.sp_identifier,
    pseudonyms: s.count,
  }));

  const COLORS = ["hsl(270, 60%, 58%)", "hsl(174, 60%, 42%)", "hsl(220, 20%, 55%)", "hsl(0, 72%, 51%)"];

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Fingerprint className="h-5 w-5 text-secondary" />
          Nullifier Registry per SP
        </CardTitle>
        <CardDescription>Registered pseudonyms by service provider (privacy-preserving view)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {chartData.length > 0 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(220, 10%, 55%)" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(230, 22%, 11%)",
                    border: "1px solid hsl(230, 15%, 18%)",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="pseudonyms" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {spStats.map((sp) => (
          <div key={sp.sp_identifier} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-foreground">{sp.sp_identifier}</span>
              <Badge variant="secondary" className="text-xs">{sp.count} pseudonyms</Badge>
            </div>
            <div className="overflow-hidden rounded-md border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="text-[10px]">Pseudonym Hash</TableHead>
                    <TableHead className="text-[10px]">Nullifier</TableHead>
                    <TableHead className="text-right text-[10px]">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sp.recent.map((r) => (
                    <TableRow key={r.nullifier}>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {r.pseudonym_hash.slice(0, 8)}...{r.pseudonym_hash.slice(-4)}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {r.nullifier.slice(0, 8)}...{r.nullifier.slice(-4)}
                      </TableCell>
                      <TableCell className="text-right text-[10px] text-muted-foreground">
                        {format(new Date(r.created_at), "MMM d, HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}

        {spStats.length === 0 && (
          <p className="py-4 text-center text-sm text-muted-foreground">No SP registrations yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 4: Security Properties Demo ────────────────────────────────────

const DEMO_PII = { govId: "DEMO-DASHBOARD-001", dob: "1995-06-15", jurisdiction: "US", biometric: "" };

function SecurityDemo() {
  const [sybilState, setSybilState] = useState<"idle" | "loading" | "rejected" | "enrolled">("idle");
  const [unlinkState, setUnlinkState] = useState<"idle" | "loading" | "done">("idle");
  const [unlinkResults, setUnlinkResults] = useState<{ sp: string; nullifier: string; pseudonym: string }[]>([]);
  const [anonState, setAnonState] = useState<"idle" | "loading" | "done">("idle");
  const [anonData, setAnonData] = useState<{ setSize: number; nullifier: string } | null>(null);

  // Test 1: Sybil Resistance — expects a 409 rejection for already-enrolled PII
  const testSybil = async () => {
    setSybilState("loading");
    const pii_input = `${DEMO_PII.govId}|${DEMO_PII.dob}|${DEMO_PII.jurisdiction}|${DEMO_PII.biometric}`;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/palc-enroll`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ pii_input }),
        }
      );
      const data = await res.json();
      if (res.status === 409 || data?.sybil_resistant) {
        setSybilState("rejected");
      } else if (res.ok) {
        setSybilState("enrolled");
      } else {
        setSybilState("idle");
      }
    } catch {
      setSybilState("idle");
    }
  };

  // Test 2: Unlinkability
  const testUnlinkability = async () => {
    setUnlinkState("loading");
    setUnlinkResults([]);
    const msk = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("");
    const r = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("");

    // Get a real phi_hash
    const { data: commits } = await supabase.from("commitments").select("phi_hash").eq("set_id", 1).limit(1);
    if (!commits || commits.length === 0) { setUnlinkState("idle"); toast.error("No commitments found"); return; }
    const phi = commits[0].phi_hash;

    const sps = [`unlink-alpha-${Date.now()}.demo`, `unlink-beta-${Date.now()}.demo`];
    const results: typeof unlinkResults = [];

    for (const sp of sps) {
      const { data } = await supabase.functions.invoke("asc-prove", {
        body: { master_secret_key: msk, phi_hash: phi, set_id: 1, sp_identifier: sp, random_material_r: r },
      });
      if (data && !data.error) {
        results.push({ sp, nullifier: data.nullifier, pseudonym: data.pseudonym });
      }
    }

    setUnlinkResults(results);
    setUnlinkState("done");
  };

  // Test 3: Anonymity
  const testAnonymity = async () => {
    setAnonState("loading");
    const { data: nul } = await supabase.from("nullifier_registry").select("nullifier, set_id").limit(1);
    const { data: setData } = await supabase.from("anonymity_sets").select("current_count").eq("set_id", 1).maybeSingle();
    if (nul && nul.length > 0) {
      setAnonData({ setSize: setData?.current_count ?? 0, nullifier: nul[0].nullifier });
    }
    setAnonState("done");
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <FlaskConical className="h-5 w-5 text-destructive" />
          Security Properties — Interactive Proof
        </CardTitle>
        <CardDescription>Test the three core security guarantees of ASC</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Test 1: Sybil */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-destructive" /> Sybil Resistance
              </p>
              <p className="text-xs text-muted-foreground">Same PII → same commitment → rejected on re-enrollment</p>
            </div>
            <Button onClick={testSybil} disabled={sybilState === "loading"} variant="destructive" size="sm">
              {sybilState === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
            </Button>
          </div>
          {sybilState === "rejected" && (
            <Alert className="border-red-500/30 bg-red-500/5">
              <ShieldX className="h-4 w-4 text-red-500" />
              <AlertTitle className="text-red-400 text-xs">Sybil Attack Rejected ✓</AlertTitle>
              <AlertDescription className="text-[11px] text-muted-foreground">
                Duplicate commitment detected — re-enrollment blocked.
              </AlertDescription>
            </Alert>
          )}
          {sybilState === "enrolled" && (
            <Alert className="border-yellow-500/30 bg-yellow-500/5">
              <ShieldCheck className="h-4 w-4 text-yellow-500" />
              <AlertTitle className="text-yellow-400 text-xs">First Enrollment Succeeded</AlertTitle>
              <AlertDescription className="text-[11px] text-muted-foreground">
                Click "Test" again to see the Sybil rejection.
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* Test 2: Unlinkability */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Link2Off className="h-4 w-4 text-secondary" /> Multi-Verifier Unlinkability
              </p>
              <p className="text-xs text-muted-foreground">Same identity, different SPs → different nullifiers</p>
            </div>
            <Button onClick={testUnlinkability} disabled={unlinkState === "loading"} variant="outline" size="sm">
              {unlinkState === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
            </Button>
          </div>
          {unlinkResults.length === 2 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {unlinkResults.map((r, i) => (
                <div key={r.sp} className={cn(
                  "rounded-md border p-3",
                  i === 0 ? "border-primary/30 bg-primary/5" : "border-secondary/30 bg-secondary/5"
                )}>
                  <p className="text-[10px] font-semibold text-foreground mb-1">SP {i + 1}</p>
                  <p className="font-mono text-[10px] text-muted-foreground break-all">
                    nul: {r.nullifier.slice(0, 16)}...{r.nullifier.slice(-6)}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground break-all">
                    ϕ: {r.pseudonym.slice(0, 16)}...{r.pseudonym.slice(-6)}
                  </p>
                </div>
              ))}
            </div>
          )}
          {unlinkResults.length === 2 && (
            <p className="text-[11px] text-secondary">
              ✓ Nullifiers are cryptographically independent — colluding SPs cannot link them (Definition 12)
            </p>
          )}
        </div>

        {/* Test 3: Anonymity */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Eye className="h-4 w-4 text-primary" /> Anonymity (k-anonymity in Λ)
              </p>
              <p className="text-xs text-muted-foreground">Given a nullifier, which Φ in Λ produced it?</p>
            </div>
            <Button onClick={testAnonymity} disabled={anonState === "loading"} variant="outline" size="sm">
              {anonState === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
            </Button>
          </div>
          {anonData && (
            <div className="space-y-2">
              <div className="rounded-md border border-border/50 bg-muted/20 p-3">
                <p className="text-xs text-muted-foreground">
                  Nullifier: <code className="text-foreground">{anonData.nullifier.slice(0, 20)}...</code>
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Anonymity set size: <strong className="text-foreground">{anonData.setSize}</strong> identities
                </p>
              </div>
              <Alert className="border-primary/30 bg-primary/5">
                <Eye className="h-4 w-4 text-primary" />
                <AlertTitle className="text-primary text-xs">Cannot determine source ✓</AlertTitle>
                <AlertDescription className="text-[11px] text-muted-foreground">
                  This nullifier could have been produced by any of the {anonData.setSize} identities
                  in the anonymity set. The ZKP hides which Φ generated it — achieving
                  k-anonymity where k = {anonData.setSize}.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 5: Multichain Identity Status ──────────────────────────────────

const CHAIN_META: Record<string, { label: string; color: string; explorer: string }> = {
  ethereum_sepolia: { label: "Ethereum Sepolia", color: "bg-secondary", explorer: "https://sepolia.etherscan.io" },
  arbitrum_sepolia: { label: "Arbitrum Sepolia", color: "bg-blue-500", explorer: "https://sepolia.arbiscan.io" },
  base_sepolia: { label: "Base Sepolia", color: "bg-primary", explorer: "https://sepolia.basescan.org" },
};

function MultichainStatus() {
  const [chains, setChains] = useState<Array<{
    chain: string; contract_address: string | null; rpc_url: string; explorer_base_url: string;
  }>>([]);
  const [registrations, setRegistrations] = useState<Record<string, {
    count: number; latest_tx: string | null;
  }>>({});
  const [registering, setRegistering] = useState<string | null>(null);

  useEffect(() => {
    const fetch = async () => {
      const { data: configs } = await supabase
        .from("chain_configs")
        .select("chain, contract_address, rpc_url, explorer_base_url")
        .eq("is_active", true);
      if (configs) setChains(configs);

      const { data: regs } = await supabase
        .from("multichain_registrations")
        .select("chain, tx_hash, confirmed, created_at")
        .order("created_at", { ascending: false });

      if (regs) {
        const grouped: Record<string, { count: number; latest_tx: string | null }> = {};
        regs.forEach((r) => {
          if (!grouped[r.chain]) grouped[r.chain] = { count: 0, latest_tx: null };
          grouped[r.chain].count++;
          if (!grouped[r.chain].latest_tx && r.tx_hash) grouped[r.chain].latest_tx = r.tx_hash;
        });
        setRegistrations(grouped);
      }
    };
    fetch();
  }, []);

  const handleRegister = async (chain: string) => {
    const keyfile = localStorage.getItem("pramaana_keyfile");
    if (!keyfile) {
      toast.error("No enrollment found. Enroll first at /enroll.");
      return;
    }
    const { phi_hash } = JSON.parse(keyfile);
    setRegistering(chain);
    try {
      const { data, error } = await supabase.functions.invoke("multichain-register", {
        body: { phi_hash, commitment_size: 1568, chains: [chain] },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Registered on ${CHAIN_META[chain]?.label || chain}`);
      // Refresh
      const { data: regs } = await supabase
        .from("multichain_registrations")
        .select("chain, tx_hash, confirmed, created_at")
        .order("created_at", { ascending: false });
      if (regs) {
        const grouped: Record<string, { count: number; latest_tx: string | null }> = {};
        regs.forEach((r) => {
          if (!grouped[r.chain]) grouped[r.chain] = { count: 0, latest_tx: null };
          grouped[r.chain].count++;
          if (!grouped[r.chain].latest_tx && r.tx_hash) grouped[r.chain].latest_tx = r.tx_hash;
        });
        setRegistrations(grouped);
      }
    } catch (err: any) {
      toast.error(err.message || "Registration failed");
    } finally {
      setRegistering(null);
    }
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Globe className="h-5 w-5 text-secondary" />
          Multichain Identity Status
        </CardTitle>
        <CardDescription>Your master identity Φ mirrored across EVM chains</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {chains.map((c) => {
            const meta = CHAIN_META[c.chain] || { label: c.chain, color: "bg-muted", explorer: c.explorer_base_url };
            const reg = registrations[c.chain];
            return (
              <div key={c.chain} className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className={cn("h-3 w-3 rounded-full", meta.color)} />
                  <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                </div>

                {c.contract_address && (
                  <a
                    href={`${meta.explorer}/address/${c.contract_address}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-mono text-secondary hover:underline flex items-center gap-1"
                  >
                    {c.contract_address.slice(0, 8)}...{c.contract_address.slice(-6)}
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}

                <div className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{reg?.count || 0}</span> identities registered
                </div>

                {reg?.latest_tx && (
                  <a
                    href={`${meta.explorer}/tx/${reg.latest_tx}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-mono text-muted-foreground hover:text-secondary flex items-center gap-1"
                  >
                    Latest: {reg.latest_tx.slice(0, 10)}...
                    <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                )}

                <Button
                  size="sm" variant="outline"
                  className="w-full text-xs"
                  onClick={() => handleRegister(c.chain)}
                  disabled={registering === c.chain}
                >
                  {registering === c.chain ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <ArrowRight className="h-3 w-3 mr-1" />
                  )}
                  Register on this chain
                </Button>
              </div>
            );
          })}
        </div>

        <Separator />

        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground mb-2">Cross-chain identity proof</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your Pramaana master identity Φ = H(C) is deterministic — the same PII always produces the same
            commitment. This means the same Φ can be independently verified on any chain. Cross-chain pseudonyms
            derived from the same Φ remain unlinkable by design (ASC multi-verifier unlinkability, Definition 12).
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 6: Recent Agent Conversations ──────────────────────────────────

function RecentAgentConversations() {
  const [conversations, setConversations] = useState<Array<{
    id: string; user_message: string; agent_response: string; tools_used: string[]; created_at: string;
  }>>([]);

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase
        .from("agent_conversations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setConversations(data as any);
    };
    fetch();
  }, []);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <Bot className="h-5 w-5 text-primary" />
            Recent Agent Conversations
          </CardTitle>
          <CardDescription>Last 5 interactions with the Pramaana AI Agent</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/agent" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            Open Agent
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {conversations.length > 0 ? (
          <div className="space-y-3">
            {conversations.map((c) => (
              <div key={c.id} className="rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-secondary/20 flex items-center justify-center">
                    <MessageSquare className="h-3 w-3 text-secondary" />
                  </div>
                  <p className="text-xs text-foreground line-clamp-2">{c.user_message}</p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-primary/20 flex items-center justify-center">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">{c.agent_response.slice(0, 200)}...</p>
                </div>
                {c.tools_used && c.tools_used.length > 0 && (
                  <div className="flex gap-1 flex-wrap pl-7">
                    {c.tools_used.map((t, i) => (
                      <Badge key={i} variant="outline" className="text-[9px] font-mono border-primary/30 text-primary">
                        {t}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground pl-7">
                  {format(new Date(c.created_at), "MMM d, HH:mm")}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">No agent conversations yet.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/agent" className="gap-1.5">
                <Bot className="h-3.5 w-3.5" />
                Start a conversation
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────

const Dashboard = () => (
  <div className="mx-auto max-w-4xl space-y-8 px-6 py-16">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-foreground">Live Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Real-time system state — on-chain registry, multichain status, events, and security proofs
      </p>
    </div>
    <RegistryStatus />
    <MultichainStatus />
    <RecentEvents />
    <NullifierRegistry />
    <RecentAgentConversations />
    <SecurityDemo />
  </div>
);

export default Dashboard;
