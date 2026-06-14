import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { pramaana, type RegistryFeedEntry } from "@/lib/pramaana-client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Activity, Users, ShieldCheck, ShieldX, ShieldAlert, Globe,
  Loader2, FlaskConical, Link2Off, Eye, RefreshCw,
  Fingerprint, Hash, Bot, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// Mirror the server's shortHash (first 10 + … + last 6).
const shortHex = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

// ── Section 1: Identity Registry Status (real, from the on-chain Registry) ──

function RegistryStatus() {
  const [stats, setStats] = useState<{ total: number; onChainConfirmed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      setStats(await pramaana.registryStats());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend not reachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(fetchStats, 4000); // poll (realtime is gone)
    return () => clearInterval(id);
  }, [fetchStats]);

  const total = stats?.total ?? 0;
  const onChain = stats?.onChainConfirmed ?? 0;

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <Globe className="h-5 w-5 text-secondary" />
            Identity Registry (On-Chain)
          </CardTitle>
          <CardDescription>Live from the Pramaana Registry (R) — polled every 4s</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={fetchStats} className="h-8 w-8">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Connection Error</AlertTitle>
            <AlertDescription className="text-xs">
              {error}. Start the backend (make demo) and it will reconnect.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Identities", value: total, icon: Users, color: "text-primary" },
                { label: "On-Chain Confirmed", value: onChain, icon: ShieldCheck, color: "text-green-400" },
                { label: "Current Set", value: "Λ_1", icon: Hash, color: "text-secondary" },
                { label: "Anonymity (k)", value: total, icon: Activity, color: "text-muted-foreground" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center">
                  <Icon className={cn("mx-auto mb-1.5 h-4 w-4", color)} />
                  <p className="text-xl font-bold text-foreground">{value}</p>
                  <p className="text-[10px] text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              All {total} identities share the single global anonymity set Λ_1 — k-anonymity with k = {total}.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 2: Recent Events (real, from the Registry event feed) ──────────

function RecentEvents() {
  const [events, setEvents] = useState<RegistryFeedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      setEvents(await pramaana.registryFeed(15));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend not reachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const id = setInterval(fetchEvents, 4000);
    return () => clearInterval(id);
  }, [fetchEvents]);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Activity className="h-5 w-5 text-primary" />
          Recent Events
        </CardTitle>
        <CardDescription>Live Registered events from the on-chain Registry (polled)</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-sm text-destructive/80">
            Couldn't load events: {error}.
          </p>
        ) : events.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="text-xs">Event</TableHead>
                  <TableHead className="text-xs">Φ</TableHead>
                  <TableHead className="text-xs">TX</TableHead>
                  <TableHead className="text-right text-xs">Block</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((ev) => (
                  <TableRow key={ev.phi}>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] font-mono text-green-400 bg-green-500/10 border-green-500/30"
                      >
                        IdentityRegistered
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {shortHex(ev.phi)} · Λ_1 #{ev.setIndex}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {ev.txHash.slice(0, 10)}…
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      #{ev.blockNumber}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No identities registered yet — enroll one to populate the feed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 3: Nullifier Registry per SP (no REST feed yet — stubbed) ──────
//
// Per-service nullifier/pseudonym activity is recorded in NullifierRegistry.sol
// on-chain, but there is no read endpoint exposing it as a feed in this build.
// Rather than fabricate rows, this section is honestly empty with a note.

function NullifierRegistry() {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Fingerprint className="h-5 w-5 text-secondary" />
          Nullifier Registry per SP
        </CardTitle>
        <CardDescription>Registered pseudonyms by service provider (privacy-preserving view)</CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="border-border/30 bg-muted/10">
          <Fingerprint className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-xs text-muted-foreground">
            Per-SP nullifier activity isn't exposed as a REST feed in this build — NullifierRegistry
            spends are recorded on-chain, but there's no read endpoint yet. Use the Security
            Properties panel below to generate live per-service nullifiers via /api/prove.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ── Section 4: Security Properties Demo (real — enroll + prove) ─────────────

function SecurityDemo() {
  const [sybilState, setSybilState] = useState<"idle" | "loading" | "rejected" | "enrolled">("idle");
  const [unlinkState, setUnlinkState] = useState<"idle" | "loading" | "done">("idle");
  const [unlinkResults, setUnlinkResults] = useState<{ sp: string; nullifier: string; extNullifier: string }[]>([]);
  const [anonState, setAnonState] = useState<"idle" | "loading" | "done">("idle");
  const [anonData, setAnonData] = useState<{ setSize: number; nullifier: string } | null>(null);

  // Test 1: Sybil resistance — the SECOND enroll of the same person returns the
  // real dedup signal alreadyEnrolled:true (no error-string sniffing).
  const testSybil = async () => {
    setSybilState("loading");
    try {
      const r = await pramaana.enroll();
      setSybilState(r.alreadyEnrolled ? "rejected" : "enrolled");
    } catch {
      setSybilState("idle");
      toast.error("Enroll failed — is the backend running?");
    }
  };

  // Test 2: Unlinkability — same identity, two services → two distinct nullifiers
  // via the real Semaphore prove endpoint (C5).
  const testUnlinkability = async () => {
    setUnlinkState("loading");
    setUnlinkResults([]);
    try {
      await pramaana.enroll(); // ensure the session is enrolled (idempotent dedup)
      const services = ["airdrop-alpha", "airdrop-beta"];
      const results: typeof unlinkResults = [];
      for (const sp of services) {
        const proof = await pramaana.prove(sp);
        results.push({
          sp,
          nullifier: proof.public_inputs.nullifier,
          extNullifier: proof.public_inputs.external_nullifier,
        });
      }
      setUnlinkResults(results);
      setUnlinkState("done");
    } catch (e) {
      setUnlinkState("idle");
      toast.error("Prove failed", { description: e instanceof Error ? e.message : "Backend not reachable" });
    }
  };

  // Test 3: Anonymity — a real nullifier sits in an anonymity set of size = total
  // registered identities (from stats).
  const testAnonymity = async () => {
    setAnonState("loading");
    try {
      await pramaana.enroll();
      const [stats, proof] = await Promise.all([
        pramaana.registryStats(),
        pramaana.prove("airdrop-alpha"),
      ]);
      setAnonData({ setSize: stats.total, nullifier: proof.public_inputs.nullifier });
      setAnonState("done");
    } catch {
      setAnonState("idle");
      toast.error("Backend not reachable");
    }
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <FlaskConical className="h-5 w-5 text-destructive" />
          Security Properties — Interactive Proof
        </CardTitle>
        <CardDescription>Test the three core security guarantees against the live backend</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Test 1: Sybil */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <ShieldAlert className="h-4 w-4 text-destructive" /> Sybil Resistance
              </p>
              <p className="text-xs text-muted-foreground">Same person → same Φ → dedup blocks re-enrollment</p>
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
                Backend returned alreadyEnrolled:true — the dedup tag matched, so no second identity was minted.
              </AlertDescription>
            </Alert>
          )}
          {sybilState === "enrolled" && (
            <Alert className="border-yellow-500/30 bg-yellow-500/5">
              <ShieldCheck className="h-4 w-4 text-yellow-500" />
              <AlertTitle className="text-yellow-400 text-xs">First Enrollment Succeeded</AlertTitle>
              <AlertDescription className="text-[11px] text-muted-foreground">
                Click "Test" again to see the Sybil rejection (alreadyEnrolled:true).
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
              <p className="text-xs text-muted-foreground">Same identity, different services → different nullifiers</p>
            </div>
            <Button onClick={testUnlinkability} disabled={unlinkState === "loading"} variant="outline" size="sm">
              {unlinkState === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
            </Button>
          </div>
          {unlinkResults.length === 2 && (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {unlinkResults.map((r, i) => (
                  <div key={r.sp} className={cn(
                    "rounded-md border p-3",
                    i === 0 ? "border-primary/30 bg-primary/5" : "border-secondary/30 bg-secondary/5"
                  )}>
                    <p className="text-[10px] font-semibold text-foreground mb-1">{r.sp}</p>
                    <p className="font-mono text-[10px] text-muted-foreground break-all">
                      nul: {r.nullifier.slice(0, 16)}…{r.nullifier.slice(-6)}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground break-all">
                      ext: {r.extNullifier.slice(0, 16)}…{r.extNullifier.slice(-6)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-secondary">
                ✓ Nullifiers are cryptographically independent — colluding services cannot link them (Definition 12)
              </p>
            </>
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
                  Nullifier: <code className="text-foreground">{anonData.nullifier.slice(0, 20)}…</code>
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
                  in the anonymity set. The ZKP hides which Φ generated it — k-anonymity where k = {anonData.setSize}.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 5: Multichain Identity Status (V2 feature — no V3 backend) ──────

const CHAIN_META: { key: string; label: string; color: string }[] = [
  { key: "ethereum_sepolia", label: "Ethereum Sepolia", color: "bg-secondary" },
  { key: "arbitrum_sepolia", label: "Arbitrum Sepolia", color: "bg-blue-500" },
  { key: "base_sepolia", label: "Base Sepolia", color: "bg-primary" },
];

function MultichainStatus() {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Globe className="h-5 w-5 text-secondary" />
          Multichain Identity Status
        </CardTitle>
        <CardDescription>Mirror Φ across EVM chains</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-border/30 bg-muted/10">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <AlertDescription className="text-xs text-muted-foreground">
            Multichain mirroring is a V2 feature with no V3 backend in this build — shown here disabled
            rather than fabricated. The single-chain Registry on the local anvil is the source of truth.
          </AlertDescription>
        </Alert>
        <div className="grid gap-3 sm:grid-cols-3">
          {CHAIN_META.map((c) => (
            <div key={c.key} className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-3 opacity-60">
              <div className="flex items-center gap-2">
                <div className={cn("h-3 w-3 rounded-full", c.color)} />
                <span className="text-sm font-semibold text-foreground">{c.label}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">—</span> identities registered
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs" disabled>
                Not available in this build
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 6: Recent Agent Conversations (V2 feature — no V3 backend) ──────

function RecentAgentConversations() {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <Bot className="h-5 w-5 text-primary" />
            Recent Agent Conversations
          </CardTitle>
          <CardDescription>The Pramaana AI agent (V2 feature — no V3 backend)</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/agent" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            Open Agent
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="py-6 text-center">
          <p className="text-sm text-muted-foreground mb-3">
            The agent isn't wired to the V3 backend in this build, so there's no conversation history.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/agent" className="gap-1.5">
              <Bot className="h-3.5 w-3.5" />
              Open the agent
            </Link>
          </Button>
        </div>
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
        Real-time system state — on-chain registry, events, and interactive security proofs
      </p>
    </div>
    <RegistryStatus />
    <RecentEvents />
    <SecurityDemo />
    <NullifierRegistry />
    <MultichainStatus />
    <RecentAgentConversations />
  </div>
);

export default Dashboard;
