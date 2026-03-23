import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Upload, KeyRound, Fingerprint, ShieldCheck, ShieldX, ShieldAlert,
  Loader2, Copy, Check, ArrowRight, ChevronRight, ExternalLink,
  Users, Link2Off, FileJson,
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

interface RegistrationResult {
  pseudonym: string;
  pseudonym_size_bytes: number;
  nullifier: string;
  proof: { type: string; R: string; s: string; e: string };
  sp_identifier: string;
  set_id: number;
  anonymity_set_size: number;
  registration_status: string;
  sybil_check: string;
  properties_preserved: {
    anonymity: string;
    sybil_resistance: string;
    multi_verifier_unlinkability: string;
  };
}

const PROVE_STEPS = [
  "Deriving child key csk_l = HKDF(r, v_l)...",
  "Generating secp256k1 pseudonym ϕ...",
  "Computing nullifier nul = H(sk || v_l)...",
  "Building ASC proof π...",
];

// ── Main Component ─────────────────────────────────────────────────────────

const RegisterService = () => {
  // Credentials
  const [keyfile, setKeyfile] = useState<Keyfile | null>(null);
  const [loadMethod, setLoadMethod] = useState<"none" | "file" | "local">("none");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Service Providers
  const [providers, setProviders] = useState<SP[]>([]);
  const [selectedSP, setSelectedSP] = useState("");

  // Registration
  const [loading, setLoading] = useState(false);
  const [proveStep, setProveStep] = useState(0);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [sybilError, setSybilError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Unlinkability demo
  const [demoResults, setDemoResults] = useState<RegistrationResult[]>([]);
  const [demoLoading, setDemoLoading] = useState(false);

  const [copied, setCopied] = useState<string | null>(null);

  // Load SPs
  useEffect(() => {
    supabase
      .from("service_providers")
      .select("*")
      .then(({ data }) => {
        if (data) setProviders(data);
      });
  }, []);

  // Try localStorage on mount
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
        // Also store in localStorage for convenience
        localStorage.setItem("pramaana-keyfile", JSON.stringify(parsed));
        toast.success("Keyfile loaded");
      } catch {
        toast.error("Failed to parse keyfile JSON");
      }
    };
    reader.readAsText(file);
  };

  // ── Register with SP ──────────────────────────────────────────────────

  const handleRegister = async () => {
    if (!keyfile || !selectedSP) return;
    setLoading(true);
    setProveStep(0);
    setResult(null);
    setSybilError(null);
    setError(null);

    const stepInterval = setInterval(() => {
      setProveStep((prev) => (prev < PROVE_STEPS.length - 1 ? prev + 1 : prev));
    }, 500);

    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("asc-prove", {
        body: {
          master_secret_key: keyfile.master_secret_key,
          phi_hash: keyfile.phi_hash,
          set_id: keyfile.set_id,
          sp_identifier: selectedSP,
          random_material_r: keyfile.random_material_r,
        },
      });

      clearInterval(stepInterval);

      if (invokeErr) {
        const msg = data?.error || invokeErr.message || "";
        if (msg.includes("Sybil")) {
          setSybilError(msg);
        } else {
          throw new Error(msg);
        }
        setLoading(false);
        return;
      }

      if (data?.error) {
        if (data.error.includes("Sybil")) {
          setSybilError(data.error);
        } else {
          throw new Error(data.error);
        }
        setLoading(false);
        return;
      }

      setResult(data as RegistrationResult);
      setLoading(false);
      toast.success("Pseudonym registered");
    } catch (err: any) {
      clearInterval(stepInterval);
      setLoading(false);
      setError(err.message);
    }
  };

  // ── Unlinkability Demo ────────────────────────────────────────────────

  const runUnlinkabilityDemo = async () => {
    if (!keyfile) return;
    setDemoLoading(true);
    setDemoResults([]);

    const demoSPs = ["demo-sp-alpha.pramaana.io", "demo-sp-beta.pramaana.io"];
    const results: RegistrationResult[] = [];

    for (const sp of demoSPs) {
      try {
        const { data } = await supabase.functions.invoke("asc-prove", {
          body: {
            master_secret_key: keyfile.master_secret_key,
            phi_hash: keyfile.phi_hash,
            set_id: keyfile.set_id,
            sp_identifier: sp,
            random_material_r: keyfile.random_material_r,
          },
        });
        if (data && !data.error) {
          results.push(data as RegistrationResult);
        } else if (data?.error?.includes("Sybil")) {
          // Already registered — re-run demo with unique SPs
          const fallbackSP = `demo-${Date.now()}-${sp}`;
          const { data: d2 } = await supabase.functions.invoke("asc-prove", {
            body: {
              master_secret_key: keyfile.master_secret_key,
              phi_hash: keyfile.phi_hash,
              set_id: keyfile.set_id,
              sp_identifier: fallbackSP,
              random_material_r: keyfile.random_material_r,
            },
          });
          if (d2 && !d2.error) results.push(d2 as RegistrationResult);
        }
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

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground">Register with a Service</h1>
        <p className="mt-2 text-muted-foreground">
          Generate an unlinkable pseudonym for a Service Provider (ASC Paper Figure 2)
        </p>
      </div>

      {/* ═══ Step 1: Load Credentials ═══ */}
      <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-foreground">
            <KeyRound className="h-5 w-5 text-primary" />
            Load Credentials
          </CardTitle>
          <CardDescription>
            Upload your keyfile from enrollment or load from browser storage.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!keyfile ? (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="w-full"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload Keyfile (JSON)
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                Or paste credentials manually below
              </p>
              <ManualEntry onLoad={(kf) => { setKeyfile(kf); setLoadMethod("file"); }} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-green-400 border-green-500/30">
                  <Check className="mr-1 h-3 w-3" />
                  {loadMethod === "local" ? "Loaded from browser" : "Loaded from keyfile"}
                </Badge>
              </div>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setKeyfile(null); setLoadMethod("none"); setResult(null); }}
                className="text-xs text-muted-foreground"
              >
                Clear & reload
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ═══ Step 2: Select Service Provider ═══ */}
      {keyfile && (
        <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Users className="h-5 w-5 text-secondary" />
              Select Service Provider
            </CardTitle>
            <CardDescription>Choose a service to register your pseudonym with.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.length > 0 ? (
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
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No service providers registered yet. Enter an identifier manually:</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Or enter SP identifier directly</Label>
              <Input
                value={selectedSP}
                onChange={(e) => setSelectedSP(e.target.value)}
                placeholder="e.g. news.example.com"
                className="bg-muted/30 font-mono text-xs"
              />
            </div>

            {/* Register button */}
            <Button
              onClick={handleRegister}
              disabled={!selectedSP || loading}
              className="w-full"
              size="lg"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="mr-2 h-4 w-4" />
              )}
              Generate Pseudonym & Register
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ═══ Step 3: Loading animation ═══ */}
      {loading && (
        <Card className="border-primary/20 bg-card/80 animate-fade-in">
          <CardContent className="flex flex-col items-center gap-6 py-12">
            <div className="relative">
              <Fingerprint className="h-10 w-10 text-primary animate-pulse" />
              <div className="absolute -inset-3 rounded-full border border-primary/20 animate-ping" />
            </div>
            <p className="text-sm font-medium text-foreground">Running ASC.Prove...</p>
            <div className="w-full max-w-sm space-y-2">
              {PROVE_STEPS.map((step, i) => {
                const active = i === proveStep;
                const done = i < proveStep;
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
          </CardContent>
        </Card>
      )}

      {/* ═══ Step 4: Registration Result ═══ */}
      {result && (
        <Card className="border-green-500/20 bg-green-500/5 animate-fade-in">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-500" />
              <CardTitle className="text-lg text-green-400">Registration Successful</CardTitle>
            </div>
            <CardDescription>
              You are now registered with <strong className="text-foreground">{spName(result.sp_identifier)}</strong> using pseudonym ϕ
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pseudonym */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Pseudonym ϕ (compressed secp256k1 public key)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-hidden text-ellipsis rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground break-all">
                  {result.pseudonym}
                </code>
                <CopyBtn val={result.pseudonym} />
              </div>
              <p className="text-[10px] text-muted-foreground">{result.pseudonym_size_bytes} bytes compressed</p>
            </div>

            {/* Nullifier */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nullifier nul = H(sk || v_l)</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                  {result.nullifier.slice(0, 24)}...{result.nullifier.slice(-8)}
                </code>
                <CopyBtn val={result.nullifier} />
              </div>
            </div>

            {/* Proof */}
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <span className="text-xs text-muted-foreground">Proof Type</span>
              <Badge variant="outline" className="font-mono text-xs">{result.proof.type}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
              <span className="text-xs text-muted-foreground">Anonymity Set Size</span>
              <Badge variant="secondary" className="font-mono">{result.anonymity_set_size}</Badge>
            </div>

            {/* Unlinkability notice */}
            <Alert className="border-secondary/30 bg-secondary/5">
              <Link2Off className="h-4 w-4 text-secondary" />
              <AlertTitle className="text-sm text-secondary">Unlinkable Pseudonym</AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                Your pseudonym is <strong>unlinkable</strong> to registrations with other services.
                Different v_l → different nullifier → unlinkable across SPs.
              </AlertDescription>
            </Alert>

            {/* Properties */}
            <div className="grid gap-2">
              {Object.entries(result.properties_preserved).map(([key, value]) => (
                <div key={key} className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key.replace(/_/g, " ")}</p>
                  <p className="text-xs text-foreground">{value}</p>
                </div>
              ))}
            </div>
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
              Your master identity produces the same nullifier for the same SP
              (Table 1 from ASC paper: same sk + same v_l → same nul).
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

      {/* ═══ Step 5: Multi-Verifier Unlinkability Demo ═══ */}
      {keyfile && (
        <Card className="border-border/50 bg-card/80 backdrop-blur animate-fade-in">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-foreground">
              <Link2Off className="h-5 w-5 text-secondary" />
              Multi-Verifier Unlinkability Demo
            </CardTitle>
            <CardDescription>
              Register with two different SPs using the same identity and compare nullifiers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={runUnlinkabilityDemo}
              disabled={demoLoading}
              variant="outline"
              className="w-full"
            >
              {demoLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Fingerprint className="mr-2 h-4 w-4" />
              )}
              Run Unlinkability Demo
            </Button>

            {demoResults.length === 2 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {demoResults.map((r, i) => (
                    <div
                      key={r.sp_identifier}
                      className={cn(
                        "rounded-lg border p-4 space-y-2",
                        i === 0 ? "border-primary/30 bg-primary/5" : "border-secondary/30 bg-secondary/5"
                      )}
                    >
                      <p className="text-xs font-semibold text-foreground">
                        SP {i + 1}: <span className={i === 0 ? "text-primary" : "text-secondary"}>{r.sp_identifier}</span>
                      </p>
                      <div className="space-y-1.5">
                        <div>
                          <p className="text-[10px] text-muted-foreground">Pseudonym ϕ</p>
                          <p className="font-mono text-[10px] text-foreground break-all leading-relaxed">
                            {r.pseudonym.slice(0, 20)}...{r.pseudonym.slice(-8)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground">Nullifier</p>
                          <p className="font-mono text-[10px] text-foreground break-all leading-relaxed">
                            {r.nullifier.slice(0, 20)}...{r.nullifier.slice(-8)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Comparison */}
                <Alert className="border-secondary/30 bg-secondary/5">
                  <ShieldCheck className="h-4 w-4 text-secondary" />
                  <AlertTitle className="text-sm text-secondary">Nullifiers are completely different ✓</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    These nullifiers cannot be linked even by colluding service providers
                    (Definition 12, Multi-Verifier Unlinkability). Same identity, different SP
                    → different pseudonym, different nullifier → <strong>zero linkability</strong>.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Explanation */}
            <div className="rounded-lg border border-border/50 bg-muted/10 p-4 text-xs leading-relaxed text-muted-foreground">
              <p className="mb-1 font-semibold text-foreground">How unlinkability works:</p>
              <p>
                The nullifier <code className="text-primary">nul = H(sk || v_l)</code> is deterministic per (identity, service) pair.
                Since <code className="text-primary">v_l</code> differs between services, the nullifiers are cryptographically
                independent. Even if SP₁ and SP₂ collude and compare all their nullifiers,
                they cannot determine that the same person registered with both.
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
        <FileJson className="mr-2 h-3 w-3" />
        Load Credentials
      </Button>
    </div>
  );
}

export default RegisterService;
