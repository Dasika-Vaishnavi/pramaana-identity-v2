import ArchitectureDiagram from "@/components/ArchitectureDiagram";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BookOpen,
  Cpu,
  ExternalLink,
  FlaskConical,
  Layers,
  Lock,
  ShieldCheck,
  Fingerprint,
  KeyRound,
  EyeOff,
  Trash2,
  Atom,
  TreeDeciduous,
  Zap,
  Rocket,
  Sparkles,
  Check,
  Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const PAPERS = [
  {
    title: "Pramaana: PII-Anchored Lattice Commitment for Post-Quantum ASC",
    authors: "Vaishnavi Dasika, Columbia University",
    tag: "Core",
  },
  {
    title: "Anonymous Self-Credentials (IACR 2025/618)",
    authors: "Alupotha, Barbaraci, Kaklamanis, Rawat, Cachin, Zhang",
    tag: "Foundation",
  },
  {
    title: "Narrowing the Gap between TEEs Threat Model and Deployment",
    authors: "Rezabek et al., Flashbots / TU Munich",
    tag: "TEE",
  },
  {
    title: "Props for Machine-Learning Security",
    authors: "Juels & Koushanfar, Cornell Tech / UCSD",
    tag: "ML Security",
  },
];

const TECH_STACK = [
  {
    category: "Cryptography",
    items: "ML-KEM-1024 (CRYSTALS-Kyber, NIST FIPS 203), SHA3-512, HKDF",
    icon: Lock,
  },
  {
    category: "Frontend",
    items: "React + TypeScript + Tailwind CSS + shadcn/ui",
    icon: Layers,
  },
  {
    category: "Backend",
    items: "Supabase Edge Functions (Deno)",
    icon: Cpu,
  },
  {
    category: "Identity Registry",
    items: "PostgreSQL (simulating Ethereum smart contract)",
    icon: FlaskConical,
  },
  {
    category: "Framework",
    items: "ASC/U2SSO (Anonymous Self-Credentials / User-issued Unlinkable SSO)",
    icon: ShieldCheck,
  },
];

const SECURITY_PROPERTIES = [
  {
    id: "hiding",
    title: "Hiding",
    icon: EyeOff,
    content:
      "The commitment C = pk ‖ ct reveals nothing about the underlying PII. Given only φ = SHA3-512(C), an adversary cannot distinguish between two different identities. This property relies on the computational hiding of ML-KEM-1024 and the pre-image resistance of SHA3-512.",
  },
  {
    id: "binding",
    title: "Binding",
    icon: Lock,
    content:
      "Once a commitment is published, the enrollee cannot open it to a different identity. The deterministic key derivation from HKDF ensures that each PII input maps to exactly one (pk, sk) pair, and the binding property of the lattice-based KEM prevents finding a different PII that produces the same commitment.",
  },
  {
    id: "uniqueness",
    title: "Uniqueness",
    icon: Fingerprint,
    content:
      "Each identity produces a deterministic public key via HKDF → Kyber KeyGen. The Identity Registry checks pk_hash before registration, ensuring that the same PII always maps to the same commitment. This provides Sybil resistance without storing any PII.",
  },
  {
    id: "pii-one-way",
    title: "PII One-Wayness",
    icon: KeyRound,
    content:
      "Given a commitment (pk, ct) or its hash φ, it is computationally infeasible to recover the original PII. The SHA3-512 hash and HKDF derivation are one-way functions — reversing them requires breaking pre-image resistance of SHA3-512, which is 256-bit secure.",
  },
  {
    id: "post-quantum",
    title: "Post-Quantum Security",
    icon: Atom,
    content:
      "ML-KEM-1024 (CRYSTALS-Kyber) is a NIST-standardized post-quantum KEM based on the Module Learning With Errors (MLWE) problem. It provides IND-CCA2 security against both classical and quantum adversaries, future-proofing identity commitments against Shor's algorithm.",
  },
  {
    id: "erasure",
    title: "Cryptographic Erasure",
    icon: Trash2,
    content:
      "PII is consumed as a cryptographic seed inside the TEE enclave and immediately discarded. The derived seed, secret key, and shared secret are local variables that are garbage-collected after the function returns. No PII is ever written to disk, logged, or transmitted.",
  },
];

const ROADMAP_PHASES = [
  {
    phase: 1,
    label: "Hackathon Demo",
    status: "LIVE",
    statusColor: "bg-green-500 text-white",
    icon: TreeDeciduous,
    iconColor: "text-green-500",
    title: "Merkle membership proof with nullifier binding",
    bullets: [
      "Pramaana PALC enrollment (post-quantum via Kyber-1024)",
      "SHA256 Merkle tree for anonymity set",
      "Nullifier derived from H(sk ‖ service_name)",
      "Merkle path proves membership",
    ],
  },
  {
    phase: 2,
    label: "Post-Hackathon",
    status: "DESIGNED",
    statusColor: "bg-amber-500 text-white",
    icon: Zap,
    iconColor: "text-amber-500",
    title: "Semaphore Groth16 integration",
    bullets: [
      "Same Pramaana enrollment",
      "Replace Merkle proof with Groth16 ZK-SNARK via Semaphore circuit",
      "Full zero-knowledge: verifier learns NOTHING except the nullifier",
      "Proof size: constant 128 bytes",
      "Verification: on-chain via Groth16 Verifier contract",
    ],
    note: "Matches ASC paper SRS-U2SSO implementation",
  },
  {
    phase: 3,
    label: "Future",
    status: "RESEARCH",
    statusColor: "bg-purple-500 text-white",
    icon: Rocket,
    iconColor: "text-purple-500",
    title: "Post-quantum ZK proofs",
    bullets: [
      "Replace Groth16 (BN254) with lattice-based ZK (LaBRADOR or Aurora)",
      "OR use hash-based STARKs for the membership proof",
      "Full end-to-end post-quantum: enrollment (Kyber) + proof (lattice ZK)",
    ],
    note: "Pramaana paper Section 7.2",
  },
  {
    phase: 4,
    label: "Vision",
    status: "CONCEPTUAL",
    statusColor: "bg-muted text-muted-foreground",
    icon: Sparkles,
    iconColor: "text-muted-foreground",
    title: "BIP-360 + PQ-ZK + Pramaana",
    bullets: [
      "Bitcoin P2MR addresses with Dilithium signatures",
      "On-chain ZK verification via PQ-STARKs",
      "Pramaana identity as the universal PQ anchor across all chains",
    ],
  },
];

const COMPARISON_TABLE = [
  {
    property: "What it proves",
    enrollment: '"I\'m a unique real person"',
    proof: '"I\'m in the anonymity set"',
    combined: "Both",
  },
  {
    property: "What it hides",
    enrollment: "PII (consumed & erased)",
    proof: "Which identity is mine",
    combined: "Everything",
  },
  {
    property: "Quantum safety",
    enrollment: "YES (Kyber-1024, FIPS 203)",
    proof: "NO (BN254 classical curves)",
    combined: "Enrollment: YES, Proof: NO (upgrade path exists)",
  },
  {
    property: "Sybil resistance",
    enrollment: "PII determinism",
    proof: "Nullifier determinism",
    combined: "Double-layered",
  },
  {
    property: "On-chain footprint",
    enrollment: "H(C) = 64 bytes",
    proof: "128 bytes (Groth16)",
    combined: "192 bytes total",
  },
  {
    property: "Trust assumption",
    enrollment: "SHA3-512 collision resistance",
    proof: "Trusted setup (Groth16) or none (Bulletproofs)",
    combined: "Combined",
  },
];

const About = () => {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 space-y-14">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          About Pramaana
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-2xl">
          A post-quantum, privacy-preserving identity enrollment system built on
          lattice-based commitments and anonymous self-credentials.
        </p>
      </div>

      {/* Architecture Diagram */}
      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <Layers className="h-5 w-5 text-primary" />
            Enrollment Architecture
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Click any component to see details
          </p>
        </CardHeader>
        <CardContent>
          <ArchitectureDiagram />
          <div className="mt-4 flex flex-wrap gap-3">
            {(
              [
                ["teal", "User / Input"],
                ["purple", "TEE Enclave"],
                ["amber", "Identity Registry"],
              ] as const
            ).map(([color, label]) => (
              <div key={color} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{
                    background:
                      color === "teal"
                        ? "hsl(var(--chart-4))"
                        : color === "purple"
                        ? "hsl(var(--primary))"
                        : "hsl(var(--chart-2))",
                    opacity: 0.7,
                  }}
                />
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ═══ ZK Proof Integration Roadmap ═══ */}
      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <TreeDeciduous className="h-5 w-5 text-primary" />
            ZK Proof Integration Roadmap
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            From Merkle proofs to full post-quantum zero-knowledge
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          {/* Horizontal timeline */}
          <div className="relative">
            {/* Connector line */}
            <div className="absolute top-5 left-5 right-5 h-0.5 bg-border/40 hidden md:block" />

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4">
              {ROADMAP_PHASES.map((p, i) => (
                <div key={p.phase} className="relative flex flex-col items-center text-center">
                  {/* Node */}
                  <div className={cn(
                    "relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all",
                    i === 0
                      ? "border-green-500 bg-green-500/10 shadow-[0_0_16px_rgba(34,197,94,0.2)]"
                      : "border-border/60 bg-card"
                  )}>
                    <p.icon className={cn("h-4 w-4", p.iconColor)} />
                  </div>

                  {/* Phase label */}
                  <div className="mt-3 space-y-1.5">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phase {p.phase}</p>
                    <Badge className={cn("text-[10px] px-2 py-0.5", p.statusColor)}>{p.status}</Badge>
                  </div>

                  {/* Content card */}
                  <div className={cn(
                    "mt-3 w-full rounded-lg border p-3 text-left space-y-2",
                    i === 0 ? "border-green-500/30 bg-green-500/5" : "border-border/40 bg-muted/10"
                  )}>
                    <p className="text-xs font-semibold text-foreground leading-snug">{p.title}</p>
                    <ul className="space-y-1">
                      {p.bullets.map((b, bi) => (
                        <li key={bi} className="flex items-start gap-1.5 text-[10px] text-muted-foreground leading-relaxed">
                          {i === 0 ? (
                            <Check className="h-3 w-3 shrink-0 mt-0.5 text-green-500" />
                          ) : (
                            <Circle className="h-2 w-2 shrink-0 mt-1 text-muted-foreground/40" />
                          )}
                          {b}
                        </li>
                      ))}
                    </ul>
                    {p.note && (
                      <p className="text-[9px] italic text-muted-foreground/70 pt-1 border-t border-border/30">{p.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Separator className="bg-border/20" />

          {/* Comparison table */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Enrollment × Proof Comparison</h3>
            <div className="overflow-x-auto rounded-lg border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[10px] uppercase tracking-wider w-[160px]">Property</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Pramaana (enrollment)</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">ZK-SNARK (proof)</TableHead>
                    <TableHead className="text-[10px] uppercase tracking-wider">Combined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPARISON_TABLE.map((row) => (
                    <TableRow key={row.property}>
                      <TableCell className="text-xs font-medium text-foreground">{row.property}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.enrollment}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.proof}</TableCell>
                      <TableCell className="text-xs text-foreground font-medium">{row.combined}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Properties */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Security Properties
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Six guarantees that Pramaana provides
          </p>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {SECURITY_PROPERTIES.map((prop) => (
              <AccordionItem key={prop.id} value={prop.id}>
                <AccordionTrigger className="text-sm hover:no-underline">
                  <span className="flex items-center gap-2.5">
                    <prop.icon className="h-4 w-4 text-primary/70" />
                    {prop.title}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground pl-7">
                  {prop.content}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Research Papers */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <BookOpen className="h-5 w-5 text-primary" />
            Research Papers
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            IC3 and cryptography research this project builds on
          </p>
        </CardHeader>
        <CardContent className="space-y-1">
          {PAPERS.map((paper, i) => (
            <div key={i}>
              <div className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted/20">
                <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground leading-snug">
                    {paper.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {paper.authors}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className="shrink-0 text-[10px] px-2 py-0.5"
                >
                  {paper.tag}
                </Badge>
              </div>
              {i < PAPERS.length - 1 && <Separator className="bg-border/20" />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tech Stack */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2.5 text-lg">
            <Cpu className="h-5 w-5 text-primary" />
            Tech Stack
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {TECH_STACK.map((item, i) => (
            <div key={i}>
              <div className="flex items-start gap-3 rounded-lg px-3 py-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/60" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {item.category}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    {item.items}
                  </p>
                </div>
              </div>
              {i < TECH_STACK.length - 1 && <Separator className="bg-border/20" />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default About;
