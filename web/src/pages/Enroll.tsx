import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  CalendarIcon, Copy, Check, ShieldAlert, ShieldCheck, Loader2,
  Download, ArrowRight, ExternalLink, Fingerprint, Cpu, Globe,
  KeyRound, Lock, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ──────────────────────────────────────────────────────────────────

interface EnrollmentResult {
  phi_hash: string;
  commitment_size_bytes: number;
  pk_size_bytes: number;
  ct_size_bytes: number;
  kyber_variant: string;
  kdf: string;
  hash: string;
  timing: { hash_ms: number; hkdf_ms: number; keygen_ms: number; encrypt_ms: number; total_ms: number };
  sybil_resistant: boolean;
  pii_retained: boolean;
  master_secret_key_local_only: string;
  WARNING: string;
  set_id?: number;
  set_index?: number;
  palc_properties: {
    hiding: string;
    binding: string;
    uniqueness: string;
    one_wayness: string;
  };
}

interface OnChainResult {
  tx_hash: string;
  block_number: number;
  set_id: number;
  set_index: number;
  explorer_url: string;
}

type Stage = 1 | 2 | 3 | 4; // PII → PALC → On-Chain → Complete

// ── Helpers ────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const PALC_STEPS = [
  "Hashing PII via SHA3-512...",
  "Deriving HKDF seed...",
  "Kyber-1024 KeyGen...",
  "Building commitment...",
  "Checking Sybil resistance...",
];

const ONCHAIN_STEPS = [
  "Connecting to Sepolia...",
  "Submitting register() transaction...",
  "Waiting for block confirmation...",
  "Updating registry records...",
];

const STAGE_LABELS = ["Collect PII", "PALC Enrollment", "On-Chain Registration"];

// ── Component ──────────────────────────────────────────────────────────────

const Enroll = () => {
  // Stage management
  const [stage, setStage] = useState<Stage>(1);

  // Stage 1: PII
  const [govId, setGovId] = useState("");
  const [dob, setDob] = useState<Date>();
  const [jurisdiction, setJurisdiction] = useState("");
  const [biometricHash, setBiometricHash] = useState("");
  const [randomR] = useState(() => toHex(crypto.getRandomValues(new Uint8Array(32))));

  // Stage 2: PALC
  const [palcStep, setPalcStep] = useState(0);
  const [palcLoading, setPalcLoading] = useState(false);
  const [enrollResult, setEnrollResult] = useState<EnrollmentResult | null>(null);

  // Stage 3: On-Chain
  const [onchainStep, setOnchainStep] = useState(0);
  const [onchainLoading, setOnchainLoading] = useState(false);
  const [onchainResult, setOnchainResult] = useState<OnChainResult | null>(null);

  // General
  const [error, setError] = useState<string | null>(null);
  const [sybil, setSybil] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const isFormValid = govId.trim() && dob && jurisdiction;

  const copyValue = async (val: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(val);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Stage 2: PALC Enrollment ───────────────────────────────────────────

  const handlePalcEnroll = async () => {
    if (!isFormValid) return;
    setPalcLoading(true);
    setError(null);
    setSybil(false);
    setPalcStep(0);

    const pii_input = `${govId.trim()}|${format(dob!, "yyyy-MM-dd")}|${jurisdiction}|${biometricHash.trim()}`;

    const stepInterval = setInterval(() => {
      setPalcStep((prev) => (prev < PALC_STEPS.length - 1 ? prev + 1 : prev));
    }, 600);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("palc-enroll", {
        body: { pii_input },
      });

      clearInterval(stepInterval);

      if (invokeErr) {
        // supabase.functions.invoke may put the JSON body in data or in the error context
        let message = "";
        if (data?.error) {
          message = data.error;
        } else if (typeof invokeErr === "object" && invokeErr.context) {
          try {
            const ctx = typeof invokeErr.context === "string" ? JSON.parse(invokeErr.context) : invokeErr.context;
            message = ctx?.error || invokeErr.message || "Unknown error";
          } catch {
            message = invokeErr.message || "Unknown error";
          }
        } else {
          message = invokeErr.message || "Unknown error";
        }
        if (message.includes("Sybil") || message.includes("collision")) {
          setSybil(true);
          setPalcLoading(false);
          return;
        }
        throw new Error(message);
      }

      if (data?.error) {
        if (data.error.includes("Sybil")) {
          setSybil(true);
          setPalcLoading(false);
          return;
        }
        throw new Error(data.error);
      }

      setEnrollResult(data as EnrollmentResult);
      setPalcLoading(false);
      setStage(3);
      toast.success("PALC enrollment complete");
    } catch (err: any) {
      clearInterval(stepInterval);
      setPalcLoading(false);
      setError(err.message);
    }
  };

  // ── Stage 3: On-Chain Registration ─────────────────────────────────────

  const handleOnChain = async () => {
    if (!enrollResult) return;
    setOnchainLoading(true);
    setOnchainStep(0);
    setError(null);

    const stepInterval = setInterval(() => {
      setOnchainStep((prev) => (prev < ONCHAIN_STEPS.length - 1 ? prev + 1 : prev));
    }, 1200);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("register-on-chain", {
        body: { phi_hash: enrollResult.phi_hash, private_key_env: true },
      });

      clearInterval(stepInterval);

      if (invokeErr) throw new Error(data?.error || invokeErr.message);
      if (data?.error) throw new Error(data.error);

      setOnchainResult(data as OnChainResult);
      setOnchainLoading(false);
      setStage(4);
      toast.success("On-chain registration confirmed");
    } catch (err: any) {
      clearInterval(stepInterval);
      setOnchainLoading(false);
      setError(err.message);
    }
  };

  // ── Download Keyfile ───────────────────────────────────────────────────

  const downloadKeyfile = () => {
    if (!enrollResult) return;
    const keyfile = {
      phi_hash: enrollResult.phi_hash,
      set_id: onchainResult?.set_id ?? enrollResult.set_id ?? 1,
      master_secret_key: enrollResult.master_secret_key_local_only,
      random_material_r: randomR,
      kyber_variant: enrollResult.kyber_variant,
      created_at: new Date().toISOString(),
      warning: "KEEP SECRET — this keyfile contains your master identity credentials",
    };
    const blob = new Blob([JSON.stringify(keyfile, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pramaana-keyfile-${enrollResult.phi_hash.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Keyfile downloaded");
  };

  // ── Stepper ────────────────────────────────────────────────────────────

  const Stepper = () => (
    <div className="flex items-center justify-center gap-1 mb-8">
      {STAGE_LABELS.map((label, i) => {
        const stageNum = (i + 1) as Stage;
        const isActive = stage === stageNum;
        const isDone = stage > stageNum;
        return (
          <div key={label} className="flex items-center gap-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all duration-500",
                  isDone && "bg-green-500/20 text-green-400 shadow-[0_0_12px_rgba(34,197,94,0.15)]",
                  isActive && "bg-primary/20 text-primary shadow-[0_0_12px_hsl(var(--primary)/0.2)]",
                  !isDone && !isActive && "bg-muted/30 text-muted-foreground"
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : stageNum}
              </div>
              <span
                className={cn(
                  "hidden text-xs font-medium sm:inline transition-colors duration-300",
                  isActive ? "text-foreground" : isDone ? "text-green-400/70" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </div>
            {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground/30 mx-1" />}
          </div>
        );
      })}
    </div>
  );

  // ── Animated Step List ─────────────────────────────────────────────────

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
            {done ? (
              <Check className="h-3.5 w-3.5 shrink-0" />
            ) : active ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
            {step}
          </div>
        );
      })}
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <Stepper />

      {/* ═══ STAGE 1: PII Collection ═══ */}
      {stage === 1 && (
        <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl text-foreground">
              <Fingerprint className="h-6 w-6 text-primary" />
              Identity Enrollment
            </CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Your PII is consumed once as cryptographic entropy, then permanently erased.
              It is never stored or transmitted.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Government ID */}
            <div className="space-y-2">
              <Label htmlFor="govId">Government ID Number *</Label>
              <Input
                id="govId"
                value={govId}
                onChange={(e) => setGovId(e.target.value)}
                placeholder="e.g. AB123456789"
                required
                className="bg-muted/30"
              />
            </div>

            {/* Date of Birth */}
            <div className="space-y-2">
              <Label>Date of Birth *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start bg-muted/30 text-left font-normal",
                      !dob && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dob ? format(dob, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dob}
                    onSelect={setDob}
                    disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
                    initialFocus
                    className="pointer-events-auto p-3"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Jurisdiction */}
            <div className="space-y-2">
              <Label>Jurisdiction Code *</Label>
              <Select value={jurisdiction} onValueChange={setJurisdiction}>
                <SelectTrigger className="bg-muted/30">
                  <SelectValue placeholder="Select jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  {["US", "EU", "IN", "UK", "JP", "AU", "CA", "BR", "Other"].map((code) => (
                    <SelectItem key={code} value={code}>{code}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Biometric Hash */}
            <div className="space-y-2">
              <Label htmlFor="biometric">Biometric Hash (optional)</Label>
              <Input
                id="biometric"
                value={biometricHash}
                onChange={(e) => setBiometricHash(e.target.value)}
                placeholder="SHA3-512 of biometric template"
                className="bg-muted/30 font-mono text-xs"
              />
            </div>

            {/* Random material r */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Random Material r (for pseudonym derivation)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden text-ellipsis rounded-md border border-border/50 bg-muted/20 px-3 py-2 font-mono text-xs text-muted-foreground">
                  {randomR.slice(0, 24)}...{randomR.slice(-8)}
                </code>
                <Button variant="ghost" size="icon" onClick={() => copyValue(randomR)} className="shrink-0 h-8 w-8">
                  {copied === randomR ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Auto-generated. Store this securely — it&apos;s used for pseudonym derivation.
              </p>
            </div>

            {/* PII Warning */}
            <Alert className="border-yellow-500/30 bg-yellow-500/5">
              <ShieldAlert className="h-4 w-4 text-yellow-500" />
              <AlertTitle className="text-sm text-yellow-400">PII Security</AlertTitle>
              <AlertDescription className="text-xs text-yellow-200/70">
                Your data is processed in a secure environment. After enrollment, your PII
                cannot be recovered from the commitment — this is by design.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => { setStage(2); handlePalcEnroll(); }}
              disabled={!isFormValid}
              className="w-full"
              size="lg"
            >
              Begin Enrollment
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ STAGE 2: PALC Enrollment ═══ */}
      {stage === 2 && (
        <div className="space-y-6 animate-fade-in">
          {palcLoading && (
            <Card className="border-primary/20 bg-card/80">
              <CardContent className="flex flex-col items-center gap-6 py-16">
                <div className="relative">
                  <Cpu className="h-10 w-10 text-primary animate-pulse" />
                  <div className="absolute -inset-3 rounded-full border border-primary/20 animate-ping" />
                </div>
                <p className="text-sm font-medium text-foreground">Running PALC.Commit...</p>
                <StepList steps={PALC_STEPS} currentStep={palcStep} />
              </CardContent>
            </Card>
          )}

          {sybil && (
            <div className="space-y-4">
              <Alert variant="destructive" className="border-red-500/40 bg-red-500/10">
                <ShieldAlert className="h-5 w-5" />
                <AlertTitle className="text-lg">Sybil Attempt Detected</AlertTitle>
                <AlertDescription>
                  This identity has already been registered. Each person may only enroll once.
                  The deterministic key derivation ensures duplicate PII maps to the same commitment.
                </AlertDescription>
              </Alert>
              <Button variant="outline" onClick={() => { setStage(1); setSybil(false); }} className="w-full">
                Try Different Credentials
              </Button>
            </div>
          )}

          {error && !sybil && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <ShieldAlert className="h-5 w-5" />
                <AlertTitle>Enrollment Failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <Button variant="outline" onClick={() => { setStage(1); setError(null); }} className="w-full">
                Retry
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ═══ STAGE 3: On-Chain Registration ═══ */}
      {stage === 3 && enrollResult && (
        <div className="space-y-6 animate-fade-in">
          {/* PALC success summary */}
          <Card className="border-green-500/20 bg-green-500/5">
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-green-500" />
                <span className="text-sm font-semibold text-green-400">PALC Enrollment Complete</span>
                <Badge variant="outline" className="ml-auto text-xs font-mono">{enrollResult.timing.total_ms} ms</Badge>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Identity Hash (Φ)</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-hidden text-ellipsis rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                    {enrollResult.phi_hash.slice(0, 32)}...{enrollResult.phi_hash.slice(-12)}
                  </code>
                  <Button variant="ghost" size="icon" onClick={() => copyValue(enrollResult.phi_hash)} className="shrink-0 h-8 w-8">
                    {copied === enrollResult.phi_hash ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Commitment", value: `${enrollResult.commitment_size_bytes} B` },
                  { label: "PK", value: `${enrollResult.pk_size_bytes} B` },
                  { label: "CT", value: `${enrollResult.ct_size_bytes} B` },
                  { label: "Total", value: `${enrollResult.timing.total_ms} ms` },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-md border border-border/50 bg-muted/20 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className="font-mono text-xs font-semibold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* On-Chain action */}
          {!onchainLoading && !onchainResult && (
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg text-foreground">
                  <Globe className="h-5 w-5 text-secondary" />
                  Register on Ethereum Sepolia
                </CardTitle>
                <CardDescription>
                  Write your master identity Φ to the on-chain Identity Registry smart contract.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleOnChain} className="w-full" size="lg">
                  <Globe className="mr-2 h-4 w-4" />
                  Register on Ethereum Sepolia
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {onchainLoading && (
            <Card className="border-secondary/20 bg-card/80">
              <CardContent className="flex flex-col items-center gap-6 py-16">
                <div className="relative">
                  <Globe className="h-10 w-10 text-secondary animate-pulse" />
                  <div className="absolute -inset-3 rounded-full border border-secondary/20 animate-ping" />
                </div>
                <p className="text-sm font-medium text-foreground">Registering on-chain...</p>
                <StepList steps={ONCHAIN_STEPS} currentStep={onchainStep} />
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert variant="destructive">
              <ShieldAlert className="h-5 w-5" />
              <AlertTitle>On-Chain Registration Failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* ═══ STAGE 4: Complete ═══ */}
      {stage === 4 && enrollResult && onchainResult && (
        <div className="space-y-6 animate-fade-in">
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 shadow-[0_0_24px_rgba(34,197,94,0.1)]">
                <ShieldCheck className="h-7 w-7 text-green-500" />
              </div>
              <CardTitle className="text-xl text-foreground">Enrollment Complete</CardTitle>
              <CardDescription>
                Your quantum-safe identity is registered both locally and on-chain.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5 pt-2">
              {/* Summary rows */}
              <div className="space-y-3">
                <SummaryRow
                  label="Master Identity Φ"
                  value={enrollResult.phi_hash}
                  truncate
                  onCopy={() => copyValue(enrollResult.phi_hash)}
                  isCopied={copied === enrollResult.phi_hash}
                />
                <SummaryRow
                  label="Anonymity Set"
                  value={`Λ_${onchainResult.set_id} (position ${onchainResult.set_index})`}
                />
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">On-Chain TX</span>
                  <a
                    href={onchainResult.explorer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 font-mono text-xs text-secondary hover:underline"
                  >
                    {onchainResult.tx_hash.slice(0, 10)}...{onchainResult.tx_hash.slice(-6)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <SummaryRow label="Block" value={`#${onchainResult.block_number.toLocaleString()}`} />
                <SummaryRow label="Kyber Variant" value={enrollResult.kyber_variant || "ML-KEM-1024"} />
                <SummaryRow label="Quantum Security" value="256-bit post-quantum" />
                <SummaryRow label="PII Retained" value="No — erased" highlight="green" />
              </div>

              <Separator className="bg-border/30" />

              {/* Master secret key warning */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-destructive flex items-center gap-1">
                  <Lock className="h-3 w-3" /> Master Secret Key (store locally — never share)
                </Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-hidden text-ellipsis rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 font-mono text-xs text-foreground">
                    {enrollResult.master_secret_key_local_only.slice(0, 32)}...{enrollResult.master_secret_key_local_only.slice(-12)}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyValue(enrollResult.master_secret_key_local_only)}
                    className="shrink-0 h-8 w-8"
                  >
                    {copied === enrollResult.master_secret_key_local_only ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                  </Button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button onClick={downloadKeyfile} variant="outline" className="w-full">
                  <Download className="mr-2 h-4 w-4" />
                  Download Keyfile
                </Button>
                <Button asChild className="w-full">
                  <Link to="/verify">
                    <KeyRound className="mr-2 h-4 w-4" />
                    Register with a Service
                  </Link>
                </Button>
              </div>

              <Button asChild variant="ghost" className="w-full text-muted-foreground">
                <Link to={`/attestation?phi=${enrollResult.phi_hash}`}>
                  View Attestation Certificate →
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// ── Summary Row Component ──────────────────────────────────────────────────

function SummaryRow({
  label,
  value,
  truncate,
  onCopy,
  isCopied,
  highlight,
}: {
  label: string;
  value: string;
  truncate?: boolean;
  onCopy?: () => void;
  isCopied?: boolean;
  highlight?: "green";
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn(
            "font-mono text-xs truncate max-w-[200px]",
            highlight === "green" ? "text-green-400" : "text-foreground"
          )}
        >
          {truncate ? `${value.slice(0, 16)}...${value.slice(-8)}` : value}
        </span>
        {onCopy && (
          <button onClick={onCopy} className="shrink-0">
            {isCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
          </button>
        )}
      </div>
    </div>
  );
}

export default Enroll;
