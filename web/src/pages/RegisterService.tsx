import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Upload, KeyRound, Fingerprint, ShieldCheck, ShieldX, ShieldAlert,
  Loader2, Copy, Check, ArrowRight, ChevronRight, ExternalLink,
  Users, Link2Off, FileJson, TreeDeciduous, Layers, Lock, Cpu,
  CircuitBoard, Shield, Zap, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────

interface Keyfile {
  phi_hash: string;
  set_id: number;
  master_secret_key: string;
  random_material_r: string;
}

interface SP {
  sp_id: string;
  name: string;
  identifier: string;
  origin: string;
  credential_type: string;
}

interface ZkProofResult {
  proof_type: string;
  zk_note: string;
  public_inputs: {
    merkle_root: string;
    nullifier: string;
    external_nullifier: string;
    anonymity_set_size: number;
    sp_identifier: string;
  };
  proof: {
    merkle_path: { sibling: string; direction: "left" | "right" }[];
    merkle_path_length: number;
    binding_commitment: string;
    leaf_hash: string;
  };
  comparison: Record<string, unknown>;
  timing: { total_ms: number };
}

interface VerifyResult {
  verified: boolean;
  checks: {
    merkle_root_valid: boolean;
    merkle_proof_valid: boolean;
    external_nullifier_valid: boolean;
    nullifier_novel: boolean;
  };
  anonymity_set_size: number;
  proof_type: string;
  security_properties: {
    sybil_resistance: string;
    anonymity: string;
    unlinkability: string;
  };
  upgrade_path: string;
  timing: { total_ms: number };
  error?: string;
}

type Stage = "idle" | "proving" | "proved" | "verifying" | "verified" | "error";

const PROVE_STEPS = [
  "Fetching anonymity set members...",
  "Building SHA256 Merkle tree...",
  "Computing Merkle membership proof...",
  "Deriving nullifier nul = H(sk ‖ v_l)...",
  "Building binding commitment...",
];

const VERIFY_STEPS = [
  "Recomputing Merkle root from DB...",
  "Walking Merkle path to root...",
  "Verifying external nullifier...",
  "Checking nullifier novelty (Sybil)...",
  "Registering nullifier...",
];

// ── Main Component ─────────────────────────────────────────────────────────

const RegisterService = () => {
  const [keyfile, setKeyfile] = useState<Keyfile | null>(null);
  const [loadMethod, setLoadMethod] = useState<"none" | "file" | "local">("none");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [providers, setProviders] = useState<SP[]>([]);
  const [selectedSP, setSelectedSP] = useState("");

  const [stage, setStage] = useState<Stage>("idle");
  const [proveStep, setProveStep] = useState(0);
  const [verifyStep, setVerifyStep] = useState(0);
  const [zkProof, setZkProof] = useState<ZkProofResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [sybilError, setSybilError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proofExpanded, setProofExpanded] = useState(false);

  // Unlinkability demo
  const [demoResults, setDemoResults] = useState<ZkProofResult[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("service_providers").select("*").then(({ data }) => {
      if (data) setProviders(data);
    });
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("pramaana-keyfile");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.phi_hash && parsed.master_secret_key && parsed.random_material_r) {
          setKeyfile(parsed);
          setLoadMethod("local");
        }
      }
    } catch { /* ignore */ }
  }, []);

  const copyValue = async (val: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(val);
    setTimeout(() => setCopied(null), 2000);
  };

  const truncHex = (s: string, n = 12) => s ? `${s.slice(0, n)}…${s.slice(-6)}` : "";

  // ── Load Keyfile ───────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.phi_hash || !parsed.master_secret_key || !parsed.random_material_r) {
          toast.error("Invalid keyfile — missing required fields");
          return;
        }
        setKeyfile(parsed);
        setLoadMethod("file");
        localStorage.setItem("pramaana-keyfile", JSON.stringify(parsed));
        toast.success("Keyfile loaded");
      } catch {
        toast.error("Failed to parse keyfile JSON");
      }
    };
    reader.readAsText(file);
  };

  // ── Register with ZK Proof ────────────────────────────────────────────

  const handleRegister = async () => {
    if (!keyfile || !selectedSP) return;
    setStage("proving");
    setProveStep(0);
    setVerifyStep(0);
    setZkProof(null);
    setVerifyResult(null);
    setSybilError(null);
    setError(null);

    // Step 1: Generate ZK membership proof
    const proveInterval = setInterval(() => {
      setProveStep((prev) => (prev < PROVE_STEPS.length - 1 ? prev + 1 : prev));
    }, 400);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("zk-membership-proof", {
        body: {
          phi_hash: keyfile.phi_hash,
          set_id: keyfile.set_id,
          sp_identifier: selectedSP,
          master_secret_key: keyfile.master_secret_key,
        },
      });

      clearInterval(proveInterval);

      if (invokeErr) {
        const msg = data?.error || invokeErr.message || "Proof generation failed";
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      setZkProof(data as ZkProofResult);
      setStage("proved");
      toast.success("ZK membership proof generated");

      // Step 2: Verify the proof
      await verifyProof(data as ZkProofResult);
    } catch (err: any) {
      clearInterval(proveInterval);
      setStage("error");
      if (err.message.includes("not in this anonymity set")) {
        setError("Your identity is not in the specified anonymity set. Check your set_id.");
      } else {
        setError(err.message);
      }
    }
  };

  const verifyProof = async (proof: ZkProofResult) => {
    setStage("verifying");
    setVerifyStep(0);

    const verifyInterval = setInterval(() => {
      setVerifyStep((prev) => (prev < VERIFY_STEPS.length - 1 ? prev + 1 : prev));
    }, 400);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("verify-zk-proof", {
        body: {
          merkle_root: proof.public_inputs.merkle_root,
          nullifier: proof.public_inputs.nullifier,
          external_nullifier: proof.public_inputs.external_nullifier,
          sp_identifier: proof.public_inputs.sp_identifier,
          set_id: keyfile!.set_id,
          proof: {
            merkle_path: proof.proof.merkle_path,
            binding_commitment: proof.proof.binding_commitment,
            leaf_hash: proof.proof.leaf_hash,
          },
        },
      });

      clearInterval(verifyInterval);

      if (invokeErr) {
        const msg = data?.error || invokeErr.message || "Verification failed";
        if (msg.includes("Sybil")) {
          setSybilError(msg);
          setStage("error");
          return;
        }
        throw new Error(msg);
      }

      if (data?.error) {
        if (data.error.includes("Sybil")) {
          setSybilError(data.error);
          setStage("error");
          return;
        }
        throw new Error(data.error);
      }

      setVerifyResult(data as VerifyResult);
      setStage("verified");
      toast.success("Proof verified — registration complete");
    } catch (err: any) {
      clearInterval(verifyInterval);
      setStage("error");
      setError(err.message);
    }
  };

  // ── Unlinkability Demo ────────────────────────────────────────────────

  const runUnlinkabilityDemo = async () => {
    if (!keyfile) return;
    setDemoLoading(true);
    setDemoResults([]);

    const demoSPs = [`demo-alpha-${Date.now()}.pramaana.io`, `demo-beta-${Date.now()}.pramaana.io`];
    const results: ZkProofResult[] = [];

    for (const sp of demoSPs) {
      try {
        const { data } = await supabase.functions.invoke("zk-membership-proof", {
          body: {
            phi_hash: keyfile.phi_hash,
            set_id: keyfile.set_id,
            sp_identifier: sp,
            master_secret_key: keyfile.master_secret_key,
          },
        });
        if (data && !data.error) results.push(data as ZkProofResult);
      } catch { /* skip */ }
    }

    setDemoResults(results);
    setDemoLoading(false);
  };

  // ── Helpers ───────────────────────────────────────────────────────────

  const spName = (identifier: string) =>
    providers.find((p) => p.identifier === identifier)?.name || identifier;

  const CopyBtn = ({ val }: { val: string }) => (
    <button onClick={() => copyValue(val)} className="shrink-0">
      {copied === val ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );

  const CheckIcon = ({ ok }: { ok: boolean }) =>
    ok ? <Check className="h-3.5 w-3.5 text-green-500" /> : <ShieldX className="h-3.5 w-3.5 text-destructive" />;

  const StepList = ({ steps, currentStep }: { steps: string[]; currentStep: number }) => (
    <div className="w-full max-w-sm mx-auto space-y-2">
      {steps.map((step, i) => {
        const active = i === currentStep;
        const done = i < currentStep;
        return (
          <div
            key={step}
            className={cn(
              "flex items-center gap-3 rounded-lg px-4 py-2.5 font-mono text-xs transition-all duration-500",
              done && "text-green-400/80",
              active && "bg-primary/10 text-primary",
              !done && !active && "text-muted-foreground/30"
            )}
          >
            {done ? <Check className="h-3.5 w-3.5 shrink-0" /> : active ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <span className="h-3.5 w-3.5 shrink-0" />}
            {step}
          </div>
        );
      })}
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Register with a Service</h1>
        <p className="mt-2 text-muted-foreground">
          Generate a ZK membership proof & unlinkable pseudonym (ASC Paper §7)
        </p>
      </div>

      {/* ═══ Step 1: Load Credentials ═══ */}
      <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <KeyRound className="h-5 w-5 text-primary" />
            Load Credentials
          </CardTitle>
          <CardDescription>Upload your keyfile from enrollment or load from browser storage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!keyfile ? (
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" className="w-full">
                <Upload className="mr-2 h-4 w-4" /> Upload Keyfile (JSON)
              </Button>
              <p className="text-center text-xs text-muted-foreground">Or paste credentials manually below</p>
              <ManualEntry onLoad={(kf) => { setKeyfile(kf); setLoadMethod("file"); }} />
            </div>
          ) : (
            <div className="space-y-3">
              <Badge variant="outline" className="text-green-400 border-green-500/30">
                <Check className="mr-1 h-3 w-3" />
                {loadMethod === "local" ? "Loaded from browser" : "Loaded from keyfile"}
              </Badge>
              <div className="grid gap-2 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 shrink-0">Φ:</span>
                  <span className="text-foreground truncate">{keyfile.phi_hash.slice(0, 24)}...{keyfile.phi_hash.slice(-8)}</span>
                  <CopyBtn val={keyfile.phi_hash} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 shrink-0">Set ID:</span>
                  <span className="text-foreground">{keyfile.set_id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-14 shrink-0">sk:</span>
                  <span className="text-foreground truncate">{keyfile.master_secret_key.slice(0, 16)}...••••</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => { setKeyfile(null); setLoadMethod("none"); setZkProof(null); setVerifyResult(null); setStage("idle"); }} className="text-xs text-muted-foreground">
                Clear & reload
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Step 2: Select SP & Register ═══ */}
      {keyfile && (
        <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Users className="h-5 w-5 text-secondary" />
              Select Service Provider
            </CardTitle>
            <CardDescription>Choose a service to register your ZK pseudonym with.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.length > 0 && (
              <Select value={selectedSP} onValueChange={setSelectedSP}>
                <SelectTrigger className="bg-muted/30">
                  <SelectValue placeholder="Select a service provider" />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((sp) => (
                    <SelectItem key={sp.sp_id} value={sp.identifier}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{sp.name}</span>
                        <span className="text-xs text-muted-foreground">({sp.identifier})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Or enter SP identifier directly</Label>
              <Input value={selectedSP} onChange={(e) => setSelectedSP(e.target.value)} placeholder="e.g. news.example.com" className="bg-muted/30 font-mono text-xs" />
            </div>
            <Button onClick={handleRegister} disabled={!selectedSP || stage === "proving" || stage === "verifying"} className="w-full" size="lg">
              {stage === "proving" || stage === "verifying" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TreeDeciduous className="mr-2 h-4 w-4" />}
              Register with ZK Membership Proof
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ Proving Animation ═══ */}
      {stage === "proving" && (
        <Card className="border-primary/20 bg-card/80 animate-fade-in">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="relative">
              <TreeDeciduous className="h-10 w-10 text-primary animate-pulse" />
              <div className="absolute -inset-3 rounded-full border border-primary/20 animate-ping" />
            </div>
            <p className="text-sm font-medium text-foreground">Generating ZK Membership Proof...</p>
            <StepList steps={PROVE_STEPS} currentStep={proveStep} />
          </CardContent>
        </Card>
      )}

      {/* ═══ Proof Details (expandable) ═══ */}
      {zkProof && (stage === "proved" || stage === "verifying" || stage === "verified") && (
        <Card className="border-primary/20 bg-card/80 animate-fade-in">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <TreeDeciduous className="h-4 w-4 text-primary" />
                Merkle Membership Proof
              </CardTitle>
              <Badge variant="outline" className="text-primary border-primary/30 font-mono text-[10px]">
                {zkProof.proof_type}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Summary row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Merkle Root</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono text-foreground">{truncHex(zkProof.public_inputs.merkle_root)}</code>
                  <CopyBtn val={zkProof.public_inputs.merkle_root} />
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Proof Depth</p>
                <code className="text-xs font-mono text-foreground">
                  {zkProof.proof.merkle_path_length} levels (log₂ of {zkProof.public_inputs.anonymity_set_size} members)
                </code>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Nullifier</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono text-foreground">{truncHex(zkProof.public_inputs.nullifier)}</code>
                  <CopyBtn val={zkProof.public_inputs.nullifier} />
                </div>
              </div>
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Binding Commitment</p>
                <div className="flex items-center gap-1.5">
                  <code className="text-xs font-mono text-foreground">{truncHex(zkProof.proof.binding_commitment)}</code>
                  <CopyBtn val={zkProof.proof.binding_commitment} />
                </div>
              </div>
            </div>

            {/* Expandable path details */}
            <button
              onClick={() => setProofExpanded(!proofExpanded)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", proofExpanded && "rotate-180")} />
              {proofExpanded ? "Hide" : "Show"} full Merkle path ({zkProof.proof.merkle_path_length} siblings)
            </button>
            {proofExpanded && (
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 space-y-1.5 max-h-48 overflow-y-auto">
                {zkProof.proof.merkle_path.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                    <Badge variant="outline" className="text-[9px] px-1.5 shrink-0">{step.direction}</Badge>
                    <span className="text-muted-foreground truncate">{step.sibling}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground italic leading-relaxed">{zkProof.zk_note}</p>
          </CardContent>
        </Card>
      )}

      {/* ═══ Verifying Animation ═══ */}
      {stage === "verifying" && (
        <Card className="border-secondary/20 bg-card/80 animate-fade-in">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="relative">
              <ShieldCheck className="h-10 w-10 text-secondary animate-pulse" />
              <div className="absolute -inset-3 rounded-full border border-secondary/20 animate-ping" />
            </div>
            <p className="text-sm font-medium text-foreground">Verifying proof with Service Provider...</p>
            <StepList steps={VERIFY_STEPS} currentStep={verifyStep} />
          </CardContent>
        </Card>
      )}

      {/* ═══ Verification Result ═══ */}
      {verifyResult && stage === "verified" && (
        <Card className="border-green-500/20 bg-green-500/5 animate-fade-in">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              <CardTitle className="text-lg text-green-400">Registration Verified ✓</CardTitle>
            </div>
            <CardDescription>
              Registered with <strong className="text-foreground">{spName(selectedSP)}</strong> — all 4 checks passed
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Verification checks */}
            <div className="grid grid-cols-2 gap-2">
              {[
                ["Merkle Root Valid", verifyResult.checks.merkle_root_valid],
                ["Merkle Proof Valid", verifyResult.checks.merkle_proof_valid],
                ["External Nullifier Valid", verifyResult.checks.external_nullifier_valid],
                ["Nullifier Novel (no Sybil)", verifyResult.checks.nullifier_novel],
              ].map(([label, ok]) => (
                <div key={String(label)} className={cn("flex items-center gap-2 rounded-md border px-3 py-2.5 text-xs", ok ? "border-green-500/30 bg-green-500/5 text-green-400" : "border-destructive/30 bg-destructive/5 text-destructive")}>
                  <CheckIcon ok={ok as boolean} />
                  {label as string}
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <span className="text-xs text-muted-foreground">Anonymity Set Size</span>
              <Badge variant="secondary" className="font-mono">{verifyResult.anonymity_set_size}</Badge>
            </div>

            {/* Security properties */}
            <div className="space-y-2">
              {Object.entries(verifyResult.security_properties).map(([key, value]) => (
                <div key={key} className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key.replace(/_/g, " ")}</p>
                  <p className="text-xs text-foreground">{value}</p>
                </div>
              ))}
            </div>

            {/* Timing */}
            {zkProof && (
              <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <span>Proof gen: {zkProof.timing.total_ms}ms</span>
                <span>Verification: {verifyResult.timing.total_ms}ms</span>
              </div>
            )}

            <Alert className="border-secondary/30 bg-secondary/5">
              <Link2Off className="h-4 w-4 text-secondary" />
              <AlertTitle className="text-sm text-secondary">Unlinkable Registration</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Your nullifier is deterministic per (identity, service) pair. Different services produce
                completely different nullifiers — zero cross-service linkability.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Sybil Rejection */}
      {sybilError && (
        <Alert variant="destructive" className="border-red-500/40 bg-red-500/10 animate-fade-in">
          <ShieldX className="h-5 w-5" />
          <AlertTitle className="text-lg">Sybil Rejection — Already Registered</AlertTitle>
          <AlertDescription className="space-y-2 text-sm">
            <p>{sybilError}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Per ASC Definition 10, each master identity produces exactly one nullifier per service provider.
              Re-registration is cryptographically impossible.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {/* General Error */}
      {error && (
        <Alert variant="destructive" className="animate-fade-in">
          <ShieldAlert className="h-5 w-5" />
          <AlertTitle>Registration Failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* ═══ Proof System Comparison ═══ */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-foreground text-center">Proof System Comparison</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {/* Card 1: Current */}
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <Badge className="bg-primary text-primary-foreground w-fit mb-2">ACTIVE</Badge>
              <CardTitle className="text-sm">Merkle Membership Proof</CardTitle>
              <CardDescription className="text-xs">Current implementation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div><span className="text-muted-foreground">Proves:</span> <span className="text-foreground">You own a leaf in the Merkle tree of Φ values</span></div>
              <div><span className="text-muted-foreground">Hides:</span> <span className="text-foreground">Nothing about which leaf (partial — path structure visible)</span></div>
              <div><span className="text-muted-foreground">Proof size:</span> <span className="text-foreground">~500 bytes (logarithmic in N)</span></div>
              <div><span className="text-muted-foreground">Quantum safety:</span> <span className="text-foreground">Enrollment is PQ (Pramaana). Proof is classical (SHA256 Merkle).</span></div>
              <Badge variant="outline" className="text-green-400 border-green-500/30 text-[10px]">ACTIVE — implemented in this demo</Badge>
            </CardContent>
          </Card>

          {/* Card 2: Groth16 */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-3">
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 w-fit mb-2">PLANNED</Badge>
              <CardTitle className="text-sm">Groth16 ZK-SNARK (Semaphore)</CardTitle>
              <CardDescription className="text-xs">SRS-U2SSO — ASC Paper §7.1</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div><span className="text-muted-foreground">Proves:</span> <span className="text-foreground">Membership + nullifier was correctly derived</span></div>
              <div><span className="text-muted-foreground">Hides:</span> <span className="text-foreground">Everything — verifier learns NOTHING except nullifier and root</span></div>
              <div><span className="text-muted-foreground">Proof size:</span> <span className="text-foreground">128 bytes constant regardless of N</span></div>
              <div><span className="text-muted-foreground">Quantum safety:</span> <span className="text-foreground">Classical (BN254 pairing). Would need lattice-based ZK for full PQ.</span></div>
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">Requires Circom circuit + trusted setup</Badge>
            </CardContent>
          </Card>

          {/* Card 3: Bulletproofs */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader className="pb-3">
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 w-fit mb-2">PLANNED</Badge>
              <CardTitle className="text-sm">Bulletproofs (CRS-ASC)</CardTitle>
              <CardDescription className="text-xs">CRS-U2SSO — ASC Paper §7.1</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div><span className="text-muted-foreground">Proves:</span> <span className="text-foreground">Knowledge of committed nullifier within Pedersen commitment</span></div>
              <div><span className="text-muted-foreground">Hides:</span> <span className="text-foreground">Which commitment in Λ is the prover's</span></div>
              <div><span className="text-muted-foreground">Proof size:</span> <span className="text-foreground">~4KB for N=1024 (logarithmic)</span></div>
              <div><span className="text-muted-foreground">Quantum safety:</span> <span className="text-foreground">Classical (secp256k1 Pedersen). Same PQ upgrade path needed.</span></div>
              <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px]">CRS-U2SSO from the ASC paper</Badge>
            </CardContent>
          </Card>
        </div>

        {/* PQ ZK Accordion */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="pq-zk" className="border-border/50 bg-card/80 rounded-lg px-4">
            <AccordionTrigger className="text-sm font-medium text-foreground hover:no-underline">
              <span className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-amber-500" />
                Why not fully post-quantum ZK proofs?
              </span>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-muted-foreground leading-relaxed pb-4">
              Current ZK-SNARK systems (Groth16, PLONK) use elliptic curve pairings on BN254 or BLS12-381,
              which are vulnerable to quantum computers. Fully post-quantum ZK proofs exist (lattice-based ZK
              from LaBRADOR, hash-based STARKs) but have much larger proof sizes (100KB+) and are not yet
              practical for on-chain verification.
              <br /><br />
              Pramaana's approach is pragmatic: make the <strong className="text-foreground">enrollment layer quantum-safe NOW</strong> with
              Kyber-1024, and upgrade the proof layer when PQ-ZK matures. This is stated in the Pramaana paper
              Section 7.2 as a future direction.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* ═══ Multi-Verifier Unlinkability Demo ═══ */}
      {keyfile && (
        <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Link2Off className="h-5 w-5 text-secondary" />
              Multi-Verifier Unlinkability Demo
            </CardTitle>
            <CardDescription>Generate ZK proofs for two different SPs and compare nullifiers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runUnlinkabilityDemo} disabled={demoLoading} variant="outline" className="w-full">
              {demoLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TreeDeciduous className="mr-2 h-4 w-4" />}
              Run Unlinkability Demo
            </Button>

            {demoResults.length === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {demoResults.map((r, i) => (
                    <div key={r.public_inputs.sp_identifier} className={cn("rounded-lg border p-4 space-y-2", i === 0 ? "border-primary/30 bg-primary/5" : "border-secondary/30 bg-secondary/5")}>
                      <p className="text-xs font-semibold text-foreground">
                        SP {i + 1}: <span className={i === 0 ? "text-primary" : "text-secondary"}>{r.public_inputs.sp_identifier.split(".")[0]}</span>
                      </p>
                      <div className="space-y-1.5">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Nullifier</p>
                          <p className="font-mono text-[10px] text-foreground break-all">{r.public_inputs.nullifier.slice(0, 20)}…{r.public_inputs.nullifier.slice(-8)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Merkle Root</p>
                          <p className="font-mono text-[10px] text-foreground break-all">{r.public_inputs.merkle_root.slice(0, 20)}…{r.public_inputs.merkle_root.slice(-8)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <Alert className="border-secondary/30 bg-secondary/5">
                  <ShieldCheck className="h-4 w-4 text-secondary" />
                  <AlertTitle className="text-sm text-secondary">Nullifiers are completely different ✓</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    Same Merkle root (same anonymity set), but completely different nullifiers.
                    Even colluding service providers cannot link these registrations (Definition 12).
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <div className="rounded-lg border border-border/50 bg-muted/10 p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">How unlinkability works:</p>
              <p>
                The nullifier <code className="text-primary">nul = SHA256(sk ‖ v_l)</code> is deterministic per (identity, service) pair.
                Since <code className="text-primary">v_l</code> differs between services, the nullifiers are cryptographically
                independent — zero cross-service linkability.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ── Manual Entry Sub-Component ─────────────────────────────────────────────

function ManualEntry({ onLoad }: { onLoad: (kf: Keyfile) => void }) {
  const [phiHash, setPhiHash] = useState("");
  const [setId, setSetId] = useState("1");
  const [msk, setMsk] = useState("");
  const [randomR, setRandomR] = useState("");

  const handleLoad = () => {
    if (!phiHash || !msk || !randomR) {
      toast.error("All fields required");
      return;
    }
    const kf: Keyfile = {
      phi_hash: phiHash.trim(),
      set_id: parseInt(setId) || 1,
      master_secret_key: msk.trim(),
      random_material_r: randomR.trim(),
    };
    localStorage.setItem("pramaana-keyfile", JSON.stringify(kf));
    onLoad(kf);
    toast.success("Credentials loaded");
  };

  return (
    <div className="space-y-3 rounded-lg border border-border/50 bg-muted/10 p-4">
      <p className="text-xs font-semibold text-foreground">Manual Entry</p>
      <div className="space-y-2">
        <Input value={phiHash} onChange={(e) => setPhiHash(e.target.value)} placeholder="phi_hash" className="bg-muted/30 font-mono text-xs" />
        <Input value={setId} onChange={(e) => setSetId(e.target.value)} placeholder="set_id (default: 1)" className="bg-muted/30 font-mono text-xs" />
        <Input value={msk} onChange={(e) => setMsk(e.target.value)} placeholder="master_secret_key" className="bg-muted/30 font-mono text-xs" type="password" />
        <Input value={randomR} onChange={(e) => setRandomR(e.target.value)} placeholder="random_material_r" className="bg-muted/30 font-mono text-xs" />
      </div>
      <Button onClick={handleLoad} variant="secondary" size="sm" className="w-full">
        <FileJson className="mr-2 h-3 w-3" /> Load Credentials
      </Button>
    </div>
  );
}

export default RegisterService;
