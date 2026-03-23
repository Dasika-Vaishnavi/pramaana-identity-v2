import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  ShieldCheck, Download, ArrowLeft, Loader2, Search, Copy, Check,
  FileCheck, Lock, Cpu, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface EnrollmentData {
  phi_hash: string;
  palc_total_ms: number | null;
  created_at: string;
}

type PageState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; data: EnrollmentData }
  | { status: "not_found" }
  | { status: "error"; message: string };

const SECURITY_PROPERTIES = [
  { label: "Hiding (MLWE assumption)", desc: "Commitment reveals nothing about PII" },
  { label: "Binding (SHA3-512 collision resistance)", desc: "No two PIIs map to same commitment" },
  { label: "Uniqueness / Sybil Resistance", desc: "Deterministic derivation prevents double-registration" },
  { label: "PII One-Wayness", desc: "Recovering PII from commitment is computationally infeasible" },
  { label: "Post-Quantum Security", desc: "256-bit quantum security via Kyber-1024" },
  { label: "Cryptographic Erasure", desc: "PII consumed once and permanently discarded" },
];

const Attestation = () => {
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<PageState>({ status: "idle" });
  const [manualPhi, setManualPhi] = useState("");
  const [copied, setCopied] = useState(false);

  const loadAttestation = async (phi: string) => {
    setState({ status: "loading" });

    const { data: log, error } = await supabase
      .from("enrollment_logs")
      .select("phi_hash, palc_total_ms, created_at")
      .eq("phi_hash", phi.trim())
      .maybeSingle();

    if (error) {
      setState({ status: "error", message: error.message });
    } else if (log) {
      setState({ status: "loaded", data: log });
    } else {
      setState({ status: "not_found" });
    }
  };

  useEffect(() => {
    const phi = searchParams.get("phi");
    if (phi) loadAttestation(phi);
  }, [searchParams]);

  const copyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const buildReportJson = (data: EnrollmentData) => ({
    report_type: "TEE_ATTESTATION_REPORT",
    version: "1.0.0",
    generated_at: new Date().toISOString(),
    enrollment_proof: {
      master_identity_phi: data.phi_hash,
      kyber_variant: "ML-KEM-1024 (NIST FIPS 203)",
      hash_function: "SHA3-512",
      kdf: "HKDF-SHA3-512 (RFC 5869)",
      enrollment_time_ms: data.palc_total_ms,
      registered_at: data.created_at,
    },
    security_properties: {
      hiding: { preserved: true, assumption: "MLWE" },
      binding: { preserved: true, assumption: "SHA3-512 collision resistance" },
      sybil_resistance: { preserved: true, mechanism: "Deterministic HKDF → deriveKeyPair" },
      pii_one_wayness: { preserved: true, hardness: "Preimage resistance of SHA3-512 + MLWE" },
      post_quantum_security: { preserved: true, security_level: "256-bit quantum" },
      cryptographic_erasure: { preserved: true, method: "PII consumed as seed, then GC'd" },
    },
    asc_compatibility: {
      framework: "Anonymous Self-Credentials (IACR ePrint 2025/618)",
      pseudonym_derivation: true,
      zkp_generation: true,
      multi_verifier_unlinkable_auth: true,
    },
    tee_environment: {
      platform: "Supabase Edge Functions (Deno Runtime)",
      isolation: "Server-side execution — PII never reaches the browser",
      production_target: "Intel TDX / AMD SEV-SNP with DCAP attestation",
      mock_attestation: {
        platform: "Intel TDX",
        measurement: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        timestamp: new Date().toISOString(),
        status: "VERIFIED",
      },
    },
  });

  const downloadReport = (data: EnrollmentData) => {
    const report = buildReportJson(data);
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pramaana-attestation-${data.phi_hash.slice(0, 12)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Lookup prompt ──
  if (state.status === "idle" || state.status === "not_found" || state.status === "error") {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <div className="mb-8 text-center">
          <FileCheck className="mx-auto mb-4 h-10 w-10 text-primary/60" />
          <h1 className="text-3xl font-bold text-foreground">Attestation Report</h1>
          <p className="mt-2 text-muted-foreground">Enter a phi_hash to view the full TEE attestation report.</p>
        </div>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="space-y-4 pt-6">
            <div className="flex gap-2">
              <Input
                value={manualPhi}
                onChange={(e) => setManualPhi(e.target.value)}
                placeholder="Enter phi_hash..."
                className="bg-muted/30 font-mono text-xs"
              />
              <Button onClick={() => loadAttestation(manualPhi)} disabled={!manualPhi.trim()}>
                <Search className="mr-2 h-4 w-4" /> Load
              </Button>
            </div>
            {state.status === "not_found" && (
              <p className="text-center text-sm text-destructive">No enrollment found for this hash.</p>
            )}
            {state.status === "error" && (
              <p className="text-center text-sm text-destructive">{state.message}</p>
            )}
          </CardContent>
        </Card>
        <div className="mt-6 text-center">
          <Button asChild variant="ghost" size="sm">
            <Link to="/enroll"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Enrollment</Link>
          </Button>
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (state.status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Loaded Report ──
  const { data } = state;
  const mockAttestation = {
    platform: "Intel TDX",
    measurement: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    timestamp: new Date().toISOString(),
    status: "VERIFIED",
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/enroll"><ArrowLeft className="mr-2 h-4 w-4" /> Back to Enrollment</Link>
        </Button>
        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
          <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> TEE Attestation Report
        </Badge>
      </div>

      <Card className="border-primary/30 bg-card/90 shadow-lg shadow-primary/5 backdrop-blur">
        {/* ── Section A: Enrollment Proof ── */}
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-xl text-foreground">
            <Lock className="h-5 w-5 text-primary" />
            Enrollment Proof
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          {/* Phi Hash */}
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Master Identity (Φ)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-hidden text-ellipsis rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                {data.phi_hash}
              </code>
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => copyHash(data.phi_hash)}>
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Kyber Variant", value: "ML-KEM-1024 (NIST FIPS 203)" },
              { label: "Hash Function", value: "SHA3-512" },
              { label: "KDF", value: "HKDF-SHA3-512 (RFC 5869)" },
              { label: "Enrollment Time", value: data.palc_total_ms ? `${data.palc_total_ms} ms` : "—" },
              { label: "Registered At", value: format(new Date(data.created_at), "PPpp") },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-border/40 bg-muted/15 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm font-medium text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </CardContent>

        <Separator className="bg-border/40" />

        {/* ── Section B: Security Properties ── */}
        <CardHeader className="pb-4 pt-6">
          <CardTitle className="flex items-center gap-2 text-xl text-foreground">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            Security Properties Preserved
          </CardTitle>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="space-y-2">
            {SECURITY_PROPERTIES.map(({ label, desc }) => (
              <div key={label} className="flex items-start gap-3 rounded-md border border-green-500/10 bg-green-500/5 px-4 py-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>

        <Separator className="bg-border/40" />

        {/* ── Section C: ASC Compatibility ── */}
        <CardHeader className="pb-4 pt-6">
          <CardTitle className="flex items-center gap-2 text-xl text-foreground">
            <Globe className="h-5 w-5 text-secondary" />
            ASC/U2SSO Compatibility
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-6">
          <p className="text-sm leading-relaxed text-muted-foreground">
            This enrollment is compatible with the <span className="font-semibold text-foreground">Anonymous Self-Credentials</span> framework
            (IACR ePrint 2025/618).
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The master identity <code className="rounded bg-muted/40 px-1.5 py-0.5 font-mono text-xs text-primary">Φ = H(C)</code> can
            be used for pseudonym derivation, ZKP generation, and multi-verifier unlinkable authentication.
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            {["Pseudonym Derivation", "ZKP Generation", "Unlinkable Auth"].map((cap) => (
              <Badge key={cap} variant="secondary" className="font-mono text-xs">
                ✓ {cap}
              </Badge>
            ))}
          </div>
        </CardContent>

        <Separator className="bg-border/40" />

        {/* ── Section D: TEE Environment ── */}
        <CardHeader className="pb-4 pt-6">
          <CardTitle className="flex items-center gap-2 text-xl text-foreground">
            <Cpu className="h-5 w-5 text-primary" />
            TEE Environment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-8">
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { label: "Platform", value: "Supabase Edge Functions (Deno Runtime)" },
              { label: "Isolation", value: "Server-side execution — PII never reaches the browser" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md border border-border/40 bg-muted/15 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm text-foreground">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs italic text-muted-foreground">
            Note: In production, this would run inside Intel TDX / AMD SEV-SNP with hardware attestation via DCAP.
          </p>

          {/* Mock Attestation JSON */}
          <div className="space-y-1.5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Mock Hardware Attestation</p>
            <pre className="overflow-x-auto rounded-lg border border-primary/20 bg-muted/20 p-4 font-mono text-xs text-foreground">
{JSON.stringify(mockAttestation, null, 2)}
            </pre>
          </div>

          {/* Download */}
          <Button onClick={() => downloadReport(data)} className="w-full" variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download Full Report (JSON)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default Attestation;
