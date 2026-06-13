import { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  Search, ShieldCheck, ShieldX, ShieldAlert, Users, Clock, Activity,
  Loader2, Copy, Check, FlaskConical, KeyRound, Fingerprint, Send,
  CheckCircle2, XCircle, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";

// ── Hex/Crypto helpers (browser-side, matching edge function logic) ─────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// SHA-256 via Web Crypto (unused for now — signing happens server-side in demo)

// ── Section 1: Check Identity ──────────────────────────────────────────────

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; created_at: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

function CheckIdentity() {
  const [phiInput, setPhiInput] = useState("");
  const [state, setState] = useState<LookupState>({ status: "idle" });

  const handleCheck = async () => {
    if (!phiInput.trim()) return;
    setState({ status: "loading" });
    const { data, error } = await supabase
      .from("commitments")
      .select("created_at")
      .eq("phi_hash", phiInput.trim())
      .maybeSingle();

    if (error) {
      setState({ status: "error", message: error.message });
    } else if (data) {
      setState({ status: "found", created_at: data.created_at });
    } else {
      setState({ status: "not_found" });
    }
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Search className="h-5 w-5 text-primary" />
          Check Identity Registration
        </CardTitle>
        <CardDescription>Look up a phi_hash to verify if an identity is registered.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={phiInput}
            onChange={(e) => setPhiInput(e.target.value)}
            placeholder="Enter phi_hash..."
            className="bg-muted/30 font-mono text-xs"
          />
          <Button onClick={handleCheck} disabled={!phiInput.trim() || state.status === "loading"}>
            {state.status === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
          </Button>
        </div>

        {state.status === "found" && (
          <Alert className="border-green-500/30 bg-green-500/5">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-400">Identity Found</AlertTitle>
            <AlertDescription className="text-sm text-green-200/70">
              Registered at {format(new Date(state.created_at), "PPpp")}
            </AlertDescription>
          </Alert>
        )}
        {state.status === "not_found" && (
          <Alert className="border-red-500/30 bg-red-500/5">
            <ShieldX className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-400">Not Registered</AlertTitle>
            <AlertDescription className="text-sm text-red-200/70">
              No identity found for this hash.
            </AlertDescription>
          </Alert>
        )}
        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 2: Dashboard ───────────────────────────────────────────────────

interface Stats {
  totalIdentities: number;
  avgEnrollmentMs: number;
  latestEnrollment: string | null;
}

interface RecentEnrollment {
  phi_hash: string;
  palc_total_ms: number | null;
  created_at: string;
}

function Dashboard() {
  const [stats, setStats] = useState<Stats>({ totalIdentities: 0, avgEnrollmentMs: 0, latestEnrollment: null });
  const [recent, setRecent] = useState<RecentEnrollment[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const fetchData = async () => {
    const { count } = await supabase
      .from("commitments")
      .select("*", { count: "exact", head: true });

    const { data: logs } = await supabase
      .from("enrollment_logs")
      .select("phi_hash, palc_total_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    const allLogs = logs || [];
    const validTimes = allLogs.filter((l) => l.palc_total_ms != null);
    const avgMs = validTimes.length > 0
      ? validTimes.reduce((s, l) => s + (l.palc_total_ms ?? 0), 0) / validTimes.length
      : 0;

    setStats({
      totalIdentities: count || 0,
      avgEnrollmentMs: Math.round(avgMs * 100) / 100,
      latestEnrollment: allLogs[0]?.created_at || null,
    });
    setRecent(allLogs);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("enrollment-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "commitments" },
        () => { fetchData(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const copyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopied(hash);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <Activity className="h-5 w-5 text-secondary" />
          Identity Registry Dashboard
        </CardTitle>
        <CardDescription>Real-time enrollment statistics and recent registrations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
            <Users className="mx-auto mb-2 h-5 w-5 text-primary" />
            <p className="text-2xl font-bold text-foreground">{stats.totalIdentities}</p>
            <p className="text-xs text-muted-foreground">Registered Identities</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
            <Clock className="mx-auto mb-2 h-5 w-5 text-secondary" />
            <p className="text-2xl font-bold text-foreground">{stats.avgEnrollmentMs} ms</p>
            <p className="text-xs text-muted-foreground">Avg Enrollment Time</p>
          </div>
          <div className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center">
            <Activity className="mx-auto mb-2 h-5 w-5 text-primary" />
            <p className="text-sm font-semibold text-foreground">
              {stats.latestEnrollment
                ? format(new Date(stats.latestEnrollment), "MMM d, HH:mm:ss")
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">Latest Enrollment</p>
          </div>
        </div>

        {recent.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border/50">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20 hover:bg-muted/20">
                  <TableHead className="text-xs">Identity Hash (φ)</TableHead>
                  <TableHead className="text-right text-xs">Time (ms)</TableHead>
                  <TableHead className="text-right text-xs">Registered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((row) => (
                  <TableRow key={row.phi_hash} className="group">
                    <TableCell className="font-mono text-xs">
                      <span className="flex items-center gap-1.5">
                        {row.phi_hash.slice(0, 16)}...{row.phi_hash.slice(-8)}
                        <button
                          onClick={() => copyHash(row.phi_hash)}
                          className="opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          {copied === row.phi_hash
                            ? <Check className="h-3 w-3 text-green-500" />
                            : <Copy className="h-3 w-3 text-muted-foreground" />}
                        </button>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {row.palc_total_ms ?? "—"}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {format(new Date(row.created_at), "MMM d, HH:mm")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted-foreground">No enrollments yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section 3: Sybil Attack Demo ───────────────────────────────────────────

type SybilState = { status: "idle" } | { status: "loading" } | { status: "rejected" } | { status: "unexpected_success" } | { status: "error"; message: string };

const DEMO_PII = {
  govId: "DEMO-SYBIL-001",
  dob: "2000-01-01",
  jurisdiction: "US",
  biometric: "",
};

function SybilDemo() {
  const [state, setState] = useState<SybilState>({ status: "idle" });

  const attemptReenroll = async () => {
    setState({ status: "loading" });
    const pii_input = `${DEMO_PII.govId}|${DEMO_PII.dob}|${DEMO_PII.jurisdiction}|${DEMO_PII.biometric}`;

    try {
      const { data, error } = await supabase.functions.invoke("palc-enroll", {
        body: { pii_input },
      });

      if (error) {
        const message = data?.error || error.message || "";
        if (message.includes("Sybil")) {
          setState({ status: "rejected" });
        } else {
          setState({ status: "unexpected_success" });
        }
        return;
      }

      if (data?.error?.includes("Sybil")) {
        setState({ status: "rejected" });
      } else {
        setState({ status: "unexpected_success" });
      }
    } catch (err: any) {
      setState({ status: "error", message: err.message });
    }
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <FlaskConical className="h-5 w-5 text-destructive" />
          Try Sybil Attack
        </CardTitle>
        <CardDescription>
          Demonstrate that re-enrolling the same PII is impossible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/50 bg-muted/20 p-4 font-mono text-xs">
          <p className="mb-1 text-muted-foreground">Pre-filled PII:</p>
          <p className="text-foreground">
            Gov ID: <span className="text-primary">{DEMO_PII.govId}</span> | DOB:{" "}
            <span className="text-primary">{DEMO_PII.dob}</span> | Jurisdiction:{" "}
            <span className="text-primary">{DEMO_PII.jurisdiction}</span>
          </p>
        </div>

        <Button
          onClick={attemptReenroll}
          variant="destructive"
          disabled={state.status === "loading"}
          className="w-full"
        >
          {state.status === "loading" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ShieldAlert className="mr-2 h-4 w-4" />
          )}
          Attempt Re-enrollment
        </Button>

        {state.status === "rejected" && (
          <Alert className="border-red-500/30 bg-red-500/5">
            <ShieldX className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-400">Sybil Attack Rejected ✓</AlertTitle>
            <AlertDescription className="text-sm text-red-200/70">
              The Identity Registry detected a duplicate commitment and rejected the enrollment.
            </AlertDescription>
          </Alert>
        )}

        {state.status === "unexpected_success" && (
          <Alert className="border-yellow-500/30 bg-yellow-500/5">
            <ShieldCheck className="h-4 w-4 text-yellow-500" />
            <AlertTitle className="text-yellow-400">Demo Identity Enrolled</AlertTitle>
            <AlertDescription className="text-sm text-yellow-200/70">
              This was the first enrollment for this demo PII. Click "Attempt Re-enrollment" again to see the Sybil rejection.
            </AlertDescription>
          </Alert>
        )}

        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        )}

        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">How Sybil resistance works:</p>
          <p>
            Each PII deterministically maps to a unique commitment via HKDF-SHA3-512 → Kyber-1024
            KeyGen (<code className="text-primary">deriveKeyPair</code>). Re-enrolling the same PII
            produces the identical public key, whose hash is already in the Identity Registry.
            The IdR rejects the duplicate — making it impossible to create multiple identities
            from the same credentials.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Section 4: ASC Authentication Demo ─────────────────────────────────────

type AuthStep = "idle" | "registering" | "registered" | "challenging" | "challenged" | "signing" | "verifying" | "authenticated" | "failed" | "error";

interface AuthState {
  step: AuthStep;
  error?: string;
  // Registration data
  pseudonym?: string;
  nullifier?: string;
  sp_identifier?: string;
  set_id?: number;
  // Challenge data
  challenge?: string;
  // Auth result
  authMessage?: string;
  // Internals for signing
  masterKey?: string;
  randomR?: string;
}

function ASCAuthDemo() {
  const [state, setState] = useState<AuthState>({ step: "idle" });
  const [spInput, setSpInput] = useState("verify-demo.pramaana.io");
  const [phiHash, setPhiHash] = useState("");
  const [availablePhiHashes, setAvailablePhiHashes] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Load available phi_hashes on mount
  useEffect(() => {
    supabase
      .from("commitments")
      .select("phi_hash")
      .eq("set_id", 1)
      .limit(5)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setAvailablePhiHashes(data.map((d) => d.phi_hash));
          if (!phiHash) setPhiHash(data[0].phi_hash);
        }
      });
  }, []);

  const copyValue = async (val: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(val);
    setTimeout(() => setCopied(null), 2000);
  };

  // Step 1: Register pseudonym via asc-prove
  const handleRegister = async () => {
    if (!phiHash || !spInput) return;
    setState({ step: "registering" });

    // Generate deterministic demo keys
    const masterKey = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const randomR = toHex(crypto.getRandomValues(new Uint8Array(32)));

    try {
      const { data, error } = await supabase.functions.invoke("asc-prove", {
        body: {
          master_secret_key: masterKey,
          phi_hash: phiHash,
          set_id: 1,
          sp_identifier: spInput,
          random_material_r: randomR,
        },
      });

      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);

      setState({
        step: "registered",
        pseudonym: data.pseudonym,
        nullifier: data.nullifier,
        sp_identifier: spInput,
        set_id: data.set_id,
        masterKey,
        randomR,
      });
    } catch (err: any) {
      setState({ step: "error", error: err.message });
    }
  };

  // Step 2: Request challenge from authenticate
  const handleRequestChallenge = async () => {
    if (!state.pseudonym || !state.sp_identifier) return;
    setState((s) => ({ ...s, step: "challenging" }));

    try {
      const { data, error } = await supabase.functions.invoke("authenticate", {
        body: {
          action: "challenge",
          sp_identifier: state.sp_identifier,
          pseudonym: state.pseudonym,
        },
      });

      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);

      setState((s) => ({ ...s, step: "challenged", challenge: data.challenge }));
    } catch (err: any) {
      setState((s) => ({ ...s, step: "error", error: err.message }));
    }
  };

  // Step 3: Sign challenge and submit
  const handleSignAndVerify = async () => {
    if (!state.challenge || !state.pseudonym || !state.masterKey || !state.randomR || !state.sp_identifier) return;
    setState((s) => ({ ...s, step: "signing" }));

    try {
      // We need to reconstruct csk_l to sign the challenge.
      // Import the same HKDF + secp256k1 logic client-side is complex,
      // so we call a helper approach: have the edge function do the signing for the demo.
      // In production, this would happen entirely on the user's device.

      // For the demo, we'll call asc-prove's signing logic via a dedicated sign endpoint.
      // Since we don't have one, we simulate by computing a Schnorr signature client-side
      // using the Web Crypto API for SHA-256 and BigInt arithmetic.

      // Reconstruct csk_l: HKDF(sha256, r, sp_identifier, "pramaana-u2sso-child-key", 32)
      // We need @noble/hashes for HKDF — but we're in browser. Use edge function approach instead.

      // Call authenticate verify with a server-assisted sign (demo mode)
      const { data: signData, error: signError } = await supabase.functions.invoke("demo-sign-challenge", {
        body: {
          master_secret_key: state.masterKey,
          random_material_r: state.randomR,
          sp_identifier: state.sp_identifier,
          challenge: state.challenge,
        },
      });

      if (signError || signData?.error) {
        // Fallback: If demo-sign-challenge doesn't exist, show that we'd need client-side crypto
        // For demo, submit the proof and let the edge function verify
        throw new Error(signData?.error || signError?.message || "Signing failed");
      }

      setState((s) => ({ ...s, step: "verifying" }));

      // Submit the signature to authenticate verify
      const { data: authData, error: authError } = await supabase.functions.invoke("authenticate", {
        body: {
          action: "verify",
          sp_identifier: state.sp_identifier,
          pseudonym: state.pseudonym,
          challenge: state.challenge,
          signature: signData.signature,
        },
      });

      if (authError) throw new Error(authData?.error || authError.message);

      if (authData?.authenticated) {
        setState((s) => ({
          ...s,
          step: "authenticated",
          authMessage: authData.message,
        }));
      } else {
        setState((s) => ({
          ...s,
          step: "failed",
          error: authData?.error || "Authentication failed",
        }));
      }
    } catch (err: any) {
      setState((s) => ({ ...s, step: "error", error: err.message }));
    }
  };

  const reset = () => {
    setState({ step: "idle" });
    setSpInput("verify-demo.pramaana.io");
  };

  const stepNumber = (step: AuthStep): number => {
    switch (step) {
      case "idle": return 0;
      case "registering": case "registered": return 1;
      case "challenging": case "challenged": return 2;
      case "signing": case "verifying": case "authenticated": case "failed": return 3;
      default: return 0;
    }
  };

  const currentStep = stepNumber(state.step);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <KeyRound className="h-5 w-5 text-secondary" />
          ASC Authentication Flow
        </CardTitle>
        <CardDescription>
          Full U2SSO authentication: register pseudonym → request challenge → sign & verify (Paper §6.3.4, Figure 3)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress steps */}
        <div className="flex items-center gap-2 text-xs">
          {["Register Pseudonym", "Request Challenge", "Sign & Verify"].map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                  currentStep > i
                    ? "bg-green-500/20 text-green-400"
                    : currentStep === i
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/30 text-muted-foreground"
                )}
              >
                {currentStep > i ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span
                className={cn(
                  "hidden sm:inline",
                  currentStep >= i ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
              {i < 2 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
            </div>
          ))}
        </div>

        <Separator className="bg-border/50" />

        {/* Step 1: Register pseudonym */}
        {state.step === "idle" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Service Provider Identifier (v_l)</Label>
              <Input
                value={spInput}
                onChange={(e) => setSpInput(e.target.value)}
                placeholder="e.g. news.example.com"
                className="bg-muted/30 font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Identity Commitment (phi_hash from enrollment)</Label>
              {availablePhiHashes.length > 0 ? (
                <select
                  value={phiHash}
                  onChange={(e) => setPhiHash(e.target.value)}
                  className="w-full rounded-md border border-input bg-muted/30 px-3 py-2 font-mono text-xs text-foreground"
                >
                  {availablePhiHashes.map((h) => (
                    <option key={h} value={h}>
                      {h.slice(0, 24)}...{h.slice(-12)}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={phiHash}
                  onChange={(e) => setPhiHash(e.target.value)}
                  placeholder="Enter phi_hash..."
                  className="bg-muted/30 font-mono text-xs"
                />
              )}
            </div>
            <Button onClick={handleRegister} disabled={!phiHash || !spInput} className="w-full">
              <Fingerprint className="mr-2 h-4 w-4" />
              Register Pseudonym with SP
            </Button>
          </div>
        )}

        {state.step === "registering" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              Generating pseudonym, nullifier & proof via <code className="text-primary">asc-prove</code>...
            </p>
          </div>
        )}

        {/* After registration — show results + challenge button */}
        {(state.step === "registered" || state.step === "challenging" || state.step === "challenged" || state.step === "signing" || state.step === "verifying" || state.step === "authenticated" || state.step === "failed") && (
          <div className="space-y-4">
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-green-400 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Pseudonym Registered
              </p>
              <div className="grid gap-1.5 text-xs font-mono">
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 w-20">Pseudonym:</span>
                  <span className="text-foreground break-all">{state.pseudonym?.slice(0, 32)}...</span>
                  <button onClick={() => state.pseudonym && copyValue(state.pseudonym)} className="shrink-0">
                    {copied === state.pseudonym ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 w-20">Nullifier:</span>
                  <span className="text-foreground break-all">{state.nullifier?.slice(0, 32)}...</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground shrink-0 w-20">SP:</span>
                  <span className="text-secondary">{state.sp_identifier}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Request challenge */}
        {state.step === "registered" && (
          <Button onClick={handleRequestChallenge} className="w-full" variant="outline">
            <Send className="mr-2 h-4 w-4" />
            Request Authentication Challenge (W)
          </Button>
        )}

        {state.step === "challenging" && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-secondary" />
            <p className="text-sm text-muted-foreground">Requesting challenge from SP...</p>
          </div>
        )}

        {/* After challenge — show + sign button */}
        {(state.step === "challenged" || state.step === "signing" || state.step === "verifying" || state.step === "authenticated" || state.step === "failed") && state.challenge && (
          <div className="rounded-lg border border-border/50 bg-muted/10 p-4 space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 text-secondary" /> Challenge W received
            </p>
            <p className="font-mono text-xs text-muted-foreground break-all">{state.challenge}</p>
            <Badge variant="outline" className="text-xs">Expires in 60s</Badge>
          </div>
        )}

        {state.step === "challenged" && (
          <Button onClick={handleSignAndVerify} className="w-full">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Sign Challenge & Authenticate
          </Button>
        )}

        {(state.step === "signing" || state.step === "verifying") && (
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {state.step === "signing" ? "Computing σ = G_auth.Prove(csk_l, W)..." : "Verifying σ with SP..."}
            </p>
          </div>
        )}

        {/* Success */}
        {state.step === "authenticated" && (
          <Alert className="border-green-500/30 bg-green-500/5">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <AlertTitle className="text-green-400">Authentication Successful ✓</AlertTitle>
            <AlertDescription className="text-sm text-green-200/70">
              {state.authMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Failure */}
        {state.step === "failed" && (
          <Alert className="border-red-500/30 bg-red-500/5">
            <XCircle className="h-4 w-4 text-red-500" />
            <AlertTitle className="text-red-400">Authentication Failed</AlertTitle>
            <AlertDescription className="text-sm text-red-200/70">{state.error}</AlertDescription>
          </Alert>
        )}

        {/* Error */}
        {state.step === "error" && (
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-sm">{state.error}</AlertDescription>
          </Alert>
        )}

        {/* Reset */}
        {(state.step === "authenticated" || state.step === "failed" || state.step === "error") && (
          <Button onClick={reset} variant="outline" className="w-full">
            Try Again
          </Button>
        )}

        {/* Protocol explanation */}
        <div className="rounded-lg border border-border/50 bg-muted/10 p-4 text-xs leading-relaxed text-muted-foreground">
          <p className="mb-1 font-semibold text-foreground">U2SSO Authentication Protocol (ASC §6.3.4):</p>
          <ol className="list-inside list-decimal space-y-1">
            <li><strong className="text-foreground">Register:</strong> Generate pseudonym ϕ = csk_l·G from child key csk_l = HKDF(r, v_l)</li>
            <li><strong className="text-foreground">Challenge:</strong> SP sends random W (32 bytes, 60s TTL)</li>
            <li><strong className="text-foreground">Prove:</strong> User computes σ = G_auth.Prove(csk_l, W) — Schnorr signature</li>
            <li><strong className="text-foreground">Verify:</strong> SP checks G_auth.Verify(ϕ, W, σ) — no password, no PII revealed</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

const Verify = () => (
  <div className="mx-auto max-w-3xl space-y-8 px-6 py-16">
    <div className="text-center">
      <h1 className="text-3xl font-bold text-foreground">Verify Identity</h1>
      <p className="mt-2 text-muted-foreground">
        Query the registry, authenticate with pseudonyms, and test Sybil resistance.
      </p>
    </div>
    <ASCAuthDemo />
    <CheckIdentity />
    <Dashboard />
    <SybilDemo />
  </div>
);

export default Verify;
