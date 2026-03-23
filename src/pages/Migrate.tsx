import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Shield,
  Search,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Fingerprint,
  KeyRound,
  Send,
  Radio,
  ShieldCheck,
  Clock,
  Loader2,
} from "lucide-react";

// ── Address classification ─────────────────────────────────

type RiskLevel = "critical" | "high" | "moderate" | "safe";

interface RiskResult {
  addressType: string;
  prefix: string;
  riskLevel: RiskLevel;
  pubkeyExposed: boolean;
  reason: string;
  recommendation: string;
}

function assessAddress(address: string): RiskResult | null {
  const a = address.trim();
  if (a.startsWith("1")) {
    return {
      addressType: "P2PKH (Legacy)",
      prefix: "1...",
      riskLevel: "critical",
      pubkeyExposed: true,
      reason: "Public key is exposed on-chain after the first spend. A sufficiently powerful quantum computer can derive the private key from the public key using Shor's algorithm.",
      recommendation: "Migrate immediately to a P2MR (BIP-360) address backed by a Pramaana post-quantum identity.",
    };
  }
  if (a.startsWith("3")) {
    return {
      addressType: "P2SH (SegWit wrapped)",
      prefix: "3...",
      riskLevel: "high",
      pubkeyExposed: true,
      reason: "Public key is revealed when spending. The SegWit wrapper does not add quantum resistance — the underlying ECDSA key is still vulnerable.",
      recommendation: "Migrate to P2MR. Create a Pramaana identity first to anchor your post-quantum key hierarchy.",
    };
  }
  if (a.startsWith("bc1q")) {
    return {
      addressType: "P2WPKH (Native SegWit)",
      prefix: "bc1q...",
      riskLevel: "high",
      pubkeyExposed: true,
      reason: "Public key is exposed on-chain after spending. Native SegWit improves efficiency but uses the same ECDSA scheme vulnerable to quantum attacks.",
      recommendation: "Migrate to P2MR before making any further transactions from this address.",
    };
  }
  if (a.startsWith("bc1p")) {
    return {
      addressType: "P2TR (Taproot)",
      prefix: "bc1p...",
      riskLevel: "high",
      pubkeyExposed: true,
      reason: "Taproot key-path spends expose a Schnorr public key that is quantum-vulnerable. Script-path spends using hash locks offer partial protection.",
      recommendation: "Migrate to P2MR. If using script-path only with hash locks, risk is moderate.",
    };
  }
  if (a.startsWith("bc1z")) {
    return {
      addressType: "P2MR (BIP-360)",
      prefix: "bc1z...",
      riskLevel: "safe",
      pubkeyExposed: false,
      reason: "P2MR removes the quantum-vulnerable key-path spend entirely. Uses Dilithium post-quantum signatures within a Merkle root structure.",
      recommendation: "Your address is quantum-safe. Consider anchoring it with a Pramaana enrollment for full PQ identity protection.",
    };
  }
  if (a.startsWith("0x") && a.length === 42) {
    return {
      addressType: "Ethereum (ECDSA)",
      prefix: "0x...",
      riskLevel: "critical",
      pubkeyExposed: true,
      reason: "ALL Ethereum addresses expose their ECDSA public key after the first transaction. The entire EVM ecosystem is quantum-vulnerable with no native migration path.",
      recommendation: "Use Pramaana to create a post-quantum identity layer. Anchor your Ethereum identity to a Kyber-1024 commitment.",
    };
  }
  return null;
}

const riskColor: Record<RiskLevel, string> = {
  critical: "text-red-400",
  high: "text-orange-400",
  moderate: "text-yellow-400",
  safe: "text-emerald-400",
};

const riskBg: Record<RiskLevel, string> = {
  critical: "bg-red-500/20 border-red-500/40 text-red-300",
  high: "bg-orange-500/20 border-orange-500/40 text-orange-300",
  moderate: "bg-yellow-500/20 border-yellow-500/40 text-yellow-300",
  safe: "bg-emerald-500/20 border-emerald-500/40 text-emerald-300",
};

const riskPercent: Record<RiskLevel, number> = { critical: 95, high: 70, moderate: 40, safe: 8 };

// ── Fade-up helper ─────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

// ── Migration steps ────────────────────────────────────────

const MIGRATION_STEPS = [
  {
    icon: Fingerprint,
    title: "Create Pramaana PQ identity",
    description:
      "Enroll with PALC to get a quantum-safe master identity Φ anchored by Kyber-1024. Your PII is consumed as cryptographic entropy and permanently erased.",
    label: "PALC.Commit — Pramaana §3.2",
  },
  {
    icon: KeyRound,
    title: "Derive P2MR-compatible keys",
    description:
      "From your Pramaana master key, derive a CRYSTALS-Dilithium signing key (the post-quantum signature scheme BIP-360 uses). Pramaana's Kyber-1024 seed deterministically derives Dilithium keys via HKDF, creating a unified PQ key hierarchy.",
    label: "HKDF(Kyber seed) → Dilithium-3",
  },
  {
    icon: Send,
    title: "Construct migration transaction",
    description:
      "Move funds from your legacy address to the new P2MR address. The transaction spends from the legacy UTXO and creates a new bc1z... output protected by Dilithium signatures inside a Merkle tree.",
    label: "Input (legacy) → Output (P2MR bc1z...)",
  },
  {
    icon: Radio,
    title: "Broadcast and confirm",
    description:
      "Submit to the Bitcoin network. Full P2MR transactions require Bitcoin Core with BIP-360 opcodes. Currently testable on Bitcoin Quantum testnet (BTQ). Pramaana prepares the identity and key layer.",
    label: "BTQ testnet compatible",
  },
  {
    icon: ShieldCheck,
    title: "Verify quantum safety",
    description:
      "Re-run the risk assessment on your new P2MR address — it should show GREEN. Your funds are now protected against quantum computers.",
    label: "Risk level: SAFE",
  },
];

// ── Timeline data ──────────────────────────────────────────

const TIMELINE = [
  { year: "2026", text: "BIP-360 draft in Bitcoin repo. BTQ testnet live. U.S. NSM-10 PQ transition deadline." },
  { year: "2028", text: "Proposed migration deadline (Charles Edwards / Capriole). Urgency increases." },
  { year: "2030", text: "EU quantum-resistance mandate for critical infrastructure." },
  { year: "2035", text: "NIST ECDSA sunset — all federal systems must use PQ crypto." },
];

// ── Address reference data ─────────────────────────────────

const ADDRESS_REF = [
  { type: "P2PKH (Legacy)", prefix: "1...", risk: "critical" as RiskLevel, label: "CRITICAL — pubkey exposed after first spend", status: "Must migrate" },
  { type: "P2SH (SegWit wrapped)", prefix: "3...", risk: "high" as RiskLevel, label: "HIGH — pubkey exposed on spend", status: "Must migrate" },
  { type: "P2WPKH (Native SegWit)", prefix: "bc1q...", risk: "high" as RiskLevel, label: "HIGH — pubkey exposed on spend", status: "Must migrate" },
  { type: "P2TR (Taproot key-path)", prefix: "bc1p...", risk: "high" as RiskLevel, label: "HIGH — key-path spend is quantum-vulnerable", status: "Migrate to script-path or P2MR" },
  { type: "P2TR (Taproot script-path)", prefix: "bc1p...", risk: "moderate" as RiskLevel, label: "MODERATE — post-quantum if using hash locks", status: "Partial protection" },
  { type: "P2MR (BIP-360)", prefix: "bc1z...", risk: "safe" as RiskLevel, label: "SAFE — no key-path, Dilithium signatures", status: "Target format" },
  { type: "Pramaana + P2MR", prefix: "bc1z...", risk: "safe" as RiskLevel, label: "SAFE + PQ Identity — Kyber-1024 + Dilithium", status: "Full protection" },
];

// ── Page ───────────────────────────────────────────────────

const Migrate = () => {
  const [address, setAddress] = useState("");
  const [result, setResult] = useState<RiskResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAssess = () => {
    setError("");
    setResult(null);
    if (!address.trim()) {
      setError("Enter a Bitcoin or Ethereum address.");
      return;
    }
    setLoading(true);
    // simulate brief analysis delay
    setTimeout(() => {
      const r = assessAddress(address);
      if (!r) {
        setError("Unrecognised address format. Enter a valid Bitcoin (1..., 3..., bc1q..., bc1p..., bc1z...) or Ethereum (0x...) address.");
      } else {
        setResult(r);
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen">
      {/* ── Section 1: Risk Assessment ─────────────────────── */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-6">
            <motion.h1 variants={fadeUp} custom={0} className="text-4xl font-bold tracking-tight text-foreground md:text-5xl" style={{ lineHeight: 1.1 }}>
              Is your Bitcoin safe?
            </motion.h1>
            <motion.p variants={fadeUp} custom={1} className="max-w-2xl text-muted-foreground text-lg">
              Enter any Bitcoin or Ethereum address to assess its quantum vulnerability. BIP-360 introduces P2MR (Pay-to-Merkle-Root) outputs that remove the quantum-vulnerable key-path spend from Taproot. Pramaana provides the post-quantum identity layer that P2MR addresses derive from.
            </motion.p>

            <motion.div variants={fadeUp} custom={2} className="flex gap-3">
              <Input
                placeholder="Enter address (1..., bc1q..., bc1p..., bc1z..., 0x...)"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAssess()}
                className="font-mono text-sm"
              />
              <Button onClick={handleAssess} disabled={loading} className="shrink-0 gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Assess
              </Button>
            </motion.div>

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-destructive text-sm">
                {error}
              </motion.p>
            )}

            {result && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-5">
                <Card className="border-border/60">
                  <CardContent className="pt-6 space-y-5">
                    {/* Badge + type */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge className={riskBg[result.riskLevel]}>{result.riskLevel.toUpperCase()}</Badge>
                      <span className="text-foreground font-medium">{result.addressType}</span>
                      <span className="text-muted-foreground font-mono text-xs">{result.prefix}</span>
                    </div>

                    {/* Risk meter */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Quantum vulnerability</span>
                        <span className={riskColor[result.riskLevel]}>{riskPercent[result.riskLevel]}%</span>
                      </div>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className={`h-full rounded-full ${
                            result.riskLevel === "safe"
                              ? "bg-emerald-500"
                              : result.riskLevel === "moderate"
                              ? "bg-yellow-500"
                              : result.riskLevel === "high"
                              ? "bg-orange-500"
                              : "bg-red-500"
                          }`}
                          initial={{ width: 0 }}
                          animate={{ width: `${riskPercent[result.riskLevel]}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Public key exposure */}
                    <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
                      {result.pubkeyExposed ? (
                        <XCircle className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 mt-0.5 shrink-0" />
                      )}
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">
                          Public key {result.pubkeyExposed ? "EXPOSED" : "NOT exposed"}
                        </p>
                        <p className="text-sm text-muted-foreground">{result.reason}</p>
                      </div>
                    </div>

                    {/* Recommendation */}
                    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                      <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground">Recommendation</p>
                        <p className="text-sm text-muted-foreground">{result.recommendation}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── Section 2: Migration Plan ──────────────────────── */}
      <section className="py-20 px-6 border-t border-border/30">
        <div className="container mx-auto max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-10">
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-bold text-foreground">
              Migration plan
            </motion.h2>

            <div className="relative space-y-0">
              {/* vertical line */}
              <div className="absolute left-[23px] top-4 bottom-4 w-px bg-border/60" />

              {MIGRATION_STEPS.map((step, i) => (
                <motion.div key={i} variants={fadeUp} custom={i + 1} className="relative flex gap-5 pb-8 last:pb-0">
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                    <step.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="pt-1 space-y-2">
                    <h3 className="font-semibold text-foreground">
                      Step {i + 1}: {step.title}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                    <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                      {step.label}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button asChild>
                <Link to="/enroll" className="gap-2">
                  <Fingerprint className="h-4 w-4" />
                  Start enrollment
                </Link>
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Section 3: Quantum Threat Timeline ─────────────── */}
      <section className="py-20 px-6 border-t border-border/30">
        <div className="container mx-auto max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-10">
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-bold text-foreground">
              Quantum threat timeline
            </motion.h2>

            <div className="relative">
              <div className="absolute left-[23px] top-4 bottom-4 w-px bg-border/60" />
              {TIMELINE.map((item, i) => (
                <motion.div key={i} variants={fadeUp} custom={i + 1} className="relative flex gap-5 pb-8 last:pb-0">
                  <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                    <Clock className="h-5 w-5 text-secondary" />
                  </div>
                  <div className="pt-1 space-y-1">
                    <h3 className="font-semibold text-secondary">{item.year}</h3>
                    <p className="text-sm text-muted-foreground">{item.text}</p>
                  </div>
                </motion.div>
              ))}

              {/* Pramaana callout */}
              <motion.div variants={fadeUp} custom={TIMELINE.length + 1} className="relative flex gap-5 pt-2">
                <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-primary bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div className="pt-1">
                  <p className="font-semibold text-primary">Pramaana gives you quantum safety TODAY, not in 2035.</p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Section 4: Address Type Reference ──────────────── */}
      <section className="py-20 px-6 border-t border-border/30">
        <div className="container mx-auto max-w-4xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }} className="space-y-8">
            <motion.h2 variants={fadeUp} custom={0} className="text-3xl font-bold text-foreground">
              Address type reference
            </motion.h2>

            <motion.div variants={fadeUp} custom={1} className="overflow-hidden rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead>Address type</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Quantum risk</TableHead>
                    <TableHead>BIP-360 status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ADDRESS_REF.map((row, i) => (
                    <TableRow key={i} className="border-border/50">
                      <TableCell className="font-medium text-foreground">{row.type}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.prefix}</TableCell>
                      <TableCell>
                        <Badge className={riskBg[row.risk]}>{row.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </motion.div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Migrate;
