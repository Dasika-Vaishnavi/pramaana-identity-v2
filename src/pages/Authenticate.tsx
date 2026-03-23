import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { sha256 } from "@noble/hashes/sha256";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 as sha256Hash } from "@noble/hashes/sha2";
import * as secp from "@noble/secp256k1";
import {
  KeyRound, ShieldCheck, ShieldX, Loader2, Copy, Check,
  Upload, FileJson, ArrowRight, Fingerprint, Lock, LogIn,
  ChevronRight, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types & helpers ────────────────────────────────────────────────────────

interface Keyfile {
  phi_hash: string;
  set_id: number;
  master_secret_key: string;
  random_material_r: string;
}

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

type Step = "load" | "challenge" | "signing" | "verifying" | "success" | "failed" | "error";

const PROTOCOL_TRACE = [
  { num: 1, text: "SP generated random challenge W (32 bytes, 60 s TTL)" },
  { num: 2, text: "You derived child key csk_l = HKDF(r, v_l)" },
  { num: 3, text: "You signed W with csk_l using Schnorr (client-side — secret never left your browser)" },
  { num: 4, text: "SP verified σ against your registered pseudonym ϕ" },
  { num: 5, text: "No interaction with the IdR was needed — ASC eliminates timing attacks" },
];

// ── Component ──────────────────────────────────────────────────────────────

const Authenticate = () => {
  const [keyfile, setKeyfile] = useState<Keyfile | null>(null);
  const [spIdentifier, setSpIdentifier] = useState("");
  const [step, setStep] = useState<Step>("load");
  const [challenge, setChallenge] = useState("");
  const [pseudonymHex, setPseudonymHex] = useState("");
  const [signatureInfo, setSignatureInfo] = useState<{ r: string; s: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("pramaana-keyfile");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.phi_hash && parsed.master_secret_key && parsed.random_material_r) {
          setKeyfile(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const copyValue = async (val: string) => {
    await navigator.clipboard.writeText(val);
    setCopied(val);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        if (!parsed.phi_hash || !parsed.master_secret_key || !parsed.random_material_r) {
          toast.error("Invalid keyfile"); return;
        }
        setKeyfile(parsed);
        localStorage.setItem("pramaana-keyfile", JSON.stringify(parsed));
        toast.success("Keyfile loaded");
      } catch { toast.error("Failed to parse JSON"); }
    };
    reader.readAsText(file);
  };

  // ── Derive pseudonym client-side ──────────────────────────────────────

  const derivePseudonym = (kf: Keyfile, sp: string): { csk_l: Uint8Array; pseudonym: Uint8Array } => {
    const r_bytes = fromHex(kf.random_material_r);
    const sp_bytes = new TextEncoder().encode(sp);
    const csk_l = hkdf(sha256Hash, r_bytes, sp_bytes, "pramaana-u2sso-child-key", 32);
    const pseudonym = secp.getPublicKey(csk_l, true);
    return { csk_l, pseudonym };
  };

  // ── Step 2: Request Challenge ─────────────────────────────────────────

  const handleRequestChallenge = async () => {
    if (!keyfile || !spIdentifier) return;
    setStep("challenge");
    setError(null);

    try {
      // Derive pseudonym locally
      const { pseudonym } = derivePseudonym(keyfile, spIdentifier);
      const pHex = toHex(pseudonym);
      setPseudonymHex(pHex);

      const { data, error: invokeErr } = await supabase.functions.invoke("authenticate", {
        body: { action: "challenge", sp_identifier: spIdentifier, pseudonym: pHex },
      });

      if (invokeErr) throw new Error(data?.error || invokeErr.message);
      if (data?.error) throw new Error(data.error);

      setChallenge(data.challenge);
      // Auto-proceed to signing
      await signAndSubmit(data.challenge, pHex);
    } catch (err: any) {
      setStep("error");
      setError(err.message);
    }
  };

  // ── Step 3 + 4: Sign & Submit ─────────────────────────────────────────

  const signAndSubmit = async (challengeHex: string, pHex: string) => {
    if (!keyfile) return;
    setStep("signing");

    try {
      // Derive csk_l client-side
      const { csk_l } = derivePseudonym(keyfile, spIdentifier);
      const pseudonym_bytes = fromHex(pHex);

      // Schnorr sign the challenge
      const msg_hash = sha256(fromHex(challengeHex));

      // Random nonce k
      const k = crypto.getRandomValues(new Uint8Array(32));
      const R = secp.getPublicKey(k, true); // R = k·G

      // e = SHA256(R || PK || msg_hash)
      const e_input = new Uint8Array(R.length + pseudonym_bytes.length + msg_hash.length);
      let off = 0;
      e_input.set(R, off); off += R.length;
      e_input.set(pseudonym_bytes, off); off += pseudonym_bytes.length;
      e_input.set(msg_hash, off);
      const e = sha256(e_input);

      // s = k - e * csk_l (mod n)
      const n = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
      const k_bn = BigInt("0x" + toHex(k));
      const e_bn = BigInt("0x" + toHex(e));
      const csk_bn = BigInt("0x" + toHex(csk_l));

      let s_bn = (k_bn - e_bn * csk_bn) % n;
      if (s_bn < 0n) s_bn += n;

      const sig = {
        r: toHex(R),
        s: s_bn.toString(16).padStart(64, "0"),
      };
      setSignatureInfo(sig);

      // Brief pause to show "signing" state
      await new Promise((resolve) => setTimeout(resolve, 600));
      setStep("verifying");

      // Submit to authenticate verify
      const { data, error: invokeErr } = await supabase.functions.invoke("authenticate", {
        body: {
          action: "verify",
          sp_identifier: spIdentifier,
          pseudonym: pHex,
          challenge: challengeHex,
          signature: sig,
        },
      });

      if (invokeErr) throw new Error(data?.error || invokeErr.message);

      if (data?.authenticated) {
        setStep("success");
        toast.success("Authentication successful");
      } else {
        setStep("failed");
        setError(data?.error || "Signature verification failed");
      }
    } catch (err: any) {
      setStep("error");
      setError(err.message);
    }
  };

  const reset = () => {
    setStep("load");
    setChallenge("");
    setPseudonymHex("");
    setSignatureInfo(null);
    setError(null);
  };

  // ── Render ────────────────────────────────────────────────────────────

  const stepIndex = { load: 0, challenge: 1, signing: 2, verifying: 3, success: 4, failed: 4, error: -1 };
  const currentIdx = stepIndex[step];
  const STEP_LABELS = ["Load & Select SP", "Request Challenge", "Sign σ", "Verify", "Result"];

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Authenticate</h1>
        <p className="mt-2 text-muted-foreground">
          Schnorr challenge-response login using your pseudonym (ASC Paper §6.3.4, Figure 3)
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-1 flex-wrap">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-500",
                currentIdx > i
                  ? "bg-green-500/20 text-green-400"
                  : currentIdx === i
                  ? "bg-primary/20 text-primary"
                  : "bg-muted/30 text-muted-foreground"
              )}
            >
              {currentIdx > i ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "hidden text-[10px] font-medium sm:inline",
                currentIdx >= i ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {label}
            </span>
            {i < 4 && <ChevronRight className="h-3 w-3 text-muted-foreground/30 mx-0.5" />}
          </div>
        ))}
      </div>

      {/* ═══ Step 1: Load credentials & select SP ═══ */}
      {step === "load" && (
        <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <KeyRound className="h-5 w-5 text-primary" />
              Login with Pseudonym
            </CardTitle>
            <CardDescription>
              Select the service you registered with and authenticate using your child key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Keyfile */}
            {!keyfile ? (
              <div className="space-y-3">
                <input ref={fileRef} type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
                <Button onClick={() => fileRef.current?.click()} variant="outline" className="w-full">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Keyfile (JSON)
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-green-400 border-green-500/30 text-xs">
                    <Check className="mr-1 h-3 w-3" /> Credentials loaded
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => setKeyfile(null)} className="ml-auto text-xs text-muted-foreground h-6">
                    Clear
                  </Button>
                </div>
                <p className="font-mono text-xs text-muted-foreground">
                  Φ: {keyfile.phi_hash.slice(0, 20)}...{keyfile.phi_hash.slice(-6)}
                </p>
              </div>
            )}

            {/* SP selection */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Service Provider Identifier (v_l)</Label>
              <Input
                value={spIdentifier}
                onChange={(e) => setSpIdentifier(e.target.value)}
                placeholder="e.g. news.demo.pramaana.io"
                className="bg-muted/30 font-mono text-xs"
              />
            </div>

            {/* Security note */}
            <Alert className="border-secondary/20 bg-secondary/5">
              <Lock className="h-4 w-4 text-secondary" />
              <AlertTitle className="text-xs text-secondary">Client-Side Signing</AlertTitle>
              <AlertDescription className="text-[11px] text-muted-foreground">
                Your secret key never leaves this browser. The challenge is signed locally
                using <code className="text-primary">@noble/secp256k1</code>, then only the
                signature is sent to the service provider.
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleRequestChallenge}
              disabled={!keyfile || !spIdentifier}
              className="w-full"
              size="lg"
            >
              <LogIn className="mr-2 h-4 w-4" />
              Authenticate
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ Steps 2-3: Challenge + Signing animation ═══ */}
      {(step === "challenge" || step === "signing" || step === "verifying") && (
        <Card className="border-primary/20 bg-card/80 animate-fade-in">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="relative">
              {step === "verifying" ? (
                <ShieldCheck className="h-10 w-10 text-secondary animate-pulse" />
              ) : (
                <Fingerprint className="h-10 w-10 text-primary animate-pulse" />
              )}
              <div className="absolute -inset-3 rounded-full border border-primary/20 animate-ping" />
            </div>

            <p className="text-sm font-medium text-foreground">
              {step === "challenge" && "Requesting challenge from SP..."}
              {step === "signing" && "Computing σ := G_auth.Prove(csk_l, W)..."}
              {step === "verifying" && "SP verifying signature σ against pseudonym ϕ..."}
            </p>

            {/* Show challenge if received */}
            {challenge && (
              <div className="w-full max-w-sm space-y-2">
                <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                  <p className="text-[10px] text-muted-foreground mb-1">Challenge W</p>
                  <p className="font-mono text-xs text-foreground break-all">{challenge}</p>
                </div>
                {pseudonymHex && (
                  <div className="rounded-lg border border-border/50 bg-muted/10 p-3">
                    <p className="text-[10px] text-muted-foreground mb-1">Your Pseudonym ϕ</p>
                    <p className="font-mono text-xs text-foreground break-all">
                      {pseudonymHex.slice(0, 24)}...{pseudonymHex.slice(-8)}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="w-full max-w-sm space-y-2">
              {["Request challenge W", "Derive csk_l = HKDF(r, v_l)", "Sign: σ = Schnorr(csk_l, W)", "Verify: G_auth.Verify(ϕ, W, σ)"].map((s, i) => {
                const done = i < (step === "challenge" ? 0 : step === "signing" ? 2 : 3);
                const active = i === (step === "challenge" ? 0 : step === "signing" ? 2 : 3);
                return (
                  <div
                    key={s}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-4 py-2 font-mono text-xs transition-all duration-500",
                      done && "text-green-400/80",
                      active && "bg-primary/10 text-primary",
                      !done && !active && "text-muted-foreground/30"
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5 shrink-0" /> : active ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <span className="h-3.5 w-3.5 shrink-0" />}
                    {s}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══ Success ═══ */}
      {step === "success" && (
        <div className="space-y-6 animate-fade-in">
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 shadow-[0_0_24px_rgba(34,197,94,0.1)]">
                <ShieldCheck className="h-7 w-7 text-green-500" />
              </div>
              <CardTitle className="text-xl text-foreground">Authentication Successful</CardTitle>
              <CardDescription>
                Welcome! You are now logged in to <strong className="text-foreground">{spIdentifier}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              {/* Session info */}
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">Pseudonym ϕ</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-foreground">{pseudonymHex.slice(0, 12)}...{pseudonymHex.slice(-6)}</span>
                    <button onClick={() => copyValue(pseudonymHex)} className="shrink-0">
                      {copied === pseudonymHex ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">Service</span>
                  <span className="font-mono text-xs text-secondary">{spIdentifier}</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">Auth Method</span>
                  <Badge variant="outline" className="text-xs font-mono">Schnorr Challenge-Response</Badge>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                  <span className="text-xs text-muted-foreground">PII Revealed</span>
                  <Badge variant="outline" className="text-xs text-green-400 border-green-500/30">None</Badge>
                </div>
              </div>

              <Separator className="bg-border/30" />

              {/* Protocol trace */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-secondary" /> Protocol Trace
                </p>
                <div className="space-y-1.5">
                  {PROTOCOL_TRACE.map(({ num, text }) => (
                    <div key={num} className="flex items-start gap-2.5 rounded-md bg-muted/10 px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-[10px] font-bold text-green-400">
                        {num}
                      </span>
                      <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Signature details */}
              {signatureInfo && (
                <details className="group">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
                    View signature details →
                  </summary>
                  <div className="mt-2 rounded-lg border border-border/50 bg-muted/10 p-3 space-y-2 font-mono text-[10px]">
                    <div>
                      <span className="text-muted-foreground">R: </span>
                      <span className="text-foreground break-all">{signatureInfo.r}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">s: </span>
                      <span className="text-foreground break-all">{signatureInfo.s}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Challenge: </span>
                      <span className="text-foreground break-all">{challenge}</span>
                    </div>
                  </div>
                </details>
              )}

              <Button onClick={reset} variant="outline" className="w-full">
                Authenticate Again
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ═══ Failed ═══ */}
      {step === "failed" && (
        <div className="space-y-4 animate-fade-in">
          <Alert className="border-red-500/30 bg-red-500/10">
            <ShieldX className="h-5 w-5 text-red-500" />
            <AlertTitle className="text-red-400">Authentication Failed</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              {error || "Schnorr signature verification failed"}
            </AlertDescription>
          </Alert>
          <Button onClick={reset} variant="outline" className="w-full">Try Again</Button>
        </div>
      )}

      {/* ═══ Error ═══ */}
      {step === "error" && (
        <div className="space-y-4 animate-fade-in">
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <Button onClick={reset} variant="outline" className="w-full">Try Again</Button>
        </div>
      )}
    </div>
  );
};

export default Authenticate;
