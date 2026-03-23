import { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Layers, ShieldCheck, KeyRound, EyeOff, Lock, Fingerprint,
  Trash2, Atom, ArrowRight, BookOpen, ExternalLink,
  Cpu, FlaskConical, Wallet, Globe, ChevronRight, Bot, Zap,
  TreeDeciduous, Rocket, Sparkles, Check, Circle, Search,
  Network, Link2, Shield, FileText, Scale, GitBranch,
  CheckCircle2, XCircle, AlertTriangle, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════ */

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.1 });
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ duration: 0.5, delay, ease: "easeOut" }} className={className}>
      {children}
    </motion.div>
  );
}

const SectionLabel = ({ children, color = "text-primary" }: { children: string; color?: string }) => (
  <p className={cn("mb-2 text-xs font-semibold uppercase tracking-[0.25em]", color)}>{children}</p>
);

/* ═══════════════════════════════════════════════════════════════
   Sidebar sections config
   ═══════════════════════════════════════════════════════════════ */

const SECTIONS = [
  { id: "overview", label: "Overview", icon: Layers },
  { id: "architecture", label: "Architecture", icon: Network },
  { id: "enrollment", label: "Enrollment (PALC)", icon: KeyRound },
  { id: "identity-proofs", label: "Identity Proofs (ASC)", icon: Fingerprint },
  { id: "authentication", label: "Authentication (U2SSO)", icon: Shield },
  { id: "wallet-security", label: "Wallet Security", icon: Wallet },
  { id: "zk-integration", label: "ZK Integration", icon: GitBranch },
  { id: "multichain", label: "Multichain", icon: Globe },
  { id: "bip360", label: "BIP-360 Migration", icon: Rocket },
  { id: "security-properties", label: "Security Properties", icon: ShieldCheck },
  { id: "primitives", label: "Cryptographic Primitives", icon: Lock },
  { id: "papers", label: "Research Papers", icon: BookOpen },
  { id: "comparison", label: "Comparison", icon: Scale },
];

/* ═══════════════════════════════════════════════════════════════
   About Page
   ═══════════════════════════════════════════════════════════════ */

const About = () => {
  const [activeSection, setActiveSection] = useState("overview");

  // Intersection observer for sidebar highlighting
  useEffect(() => {
    const els = SECTIONS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative flex">
      {/* ── Desktop Sidebar ── */}
      <aside className="hidden lg:block sticky top-16 h-[calc(100vh-4rem)] w-[260px] shrink-0 border-r border-border/30">
        <ScrollArea className="h-full py-8 px-4">
          <p className="px-3 mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Documentation</p>
          <nav className="space-y-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => scrollTo(id)}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-sm transition-colors text-left",
                  activeSection === id
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>
        </ScrollArea>
      </aside>

      {/* ── Mobile Jump-to-section ── */}
      <div className="lg:hidden fixed top-16 left-0 right-0 z-30 bg-background/90 backdrop-blur-sm border-b border-border/30 px-4 py-2">
        <Select value={activeSection} onValueChange={(v) => scrollTo(v)}>
          <SelectTrigger className="h-9 text-sm bg-card/60 border-border/40">
            <Menu className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SECTIONS.map(({ id, label }) => (
              <SelectItem key={id} value={id}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── Main Content ── */}
      <main className="flex-1 min-w-0 px-6 lg:px-12 pt-20 lg:pt-10 pb-32 space-y-24 max-w-4xl mx-auto">

        {/* ═══ SECTION 1: OVERVIEW ═══ */}
        <section id="overview" className="scroll-mt-24">
          <Reveal>
            <SectionLabel>Overview</SectionLabel>
            <h1 className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl leading-tight tracking-tight mb-6">About Pramaana</h1>
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
              Pramaana is a post-quantum identity enrollment system that lets you prove you're a unique real person to any number of services — without any service knowing who you are, without any two services being able to link your accounts, and without any database storing your personal information.
            </p>
          </Reveal>

          {/* Flow diagram */}
          <Reveal delay={0.1}>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {[
                { label: "Your PII", color: "bg-secondary/20 border-secondary/40 text-secondary" },
                { label: "PALC Enrollment", color: "bg-primary/20 border-primary/40 text-primary" },
                { label: "Master Identity Φ", color: "bg-amber-500/20 border-amber-500/40 text-amber-400" },
                { label: "Service Registration", color: "bg-primary/20 border-primary/40 text-primary" },
                { label: "Private Auth", color: "bg-secondary/20 border-secondary/40 text-secondary" },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className={cn("rounded-lg border px-4 py-2.5 text-sm font-medium", step.color)}>
                    {step.label}
                  </div>
                  {i < arr.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              ))}
            </div>
            <p className="mt-4 text-center text-sm text-muted-foreground">
              Your PII enters the system exactly once and is cryptographically destroyed. Everything after that point is quantum-safe and privacy-preserving.
            </p>
          </Reveal>

          {/* Who built this */}
          <Reveal delay={0.2}>
            <Accordion type="single" collapsible className="mt-8">
              <AccordionItem value="who" className="border-border/30">
                <AccordionTrigger className="text-sm hover:no-underline text-muted-foreground">Who built this and why</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  Pramaana was developed by Vaishnavi Dasika at Columbia University (SEAS), extending the Anonymous Self-Credentials framework by Alupotha, Barbaraci, Kaklamanis, Rawat, Cachin, and Zhang (IACR ePrint 2025/618). It was built for the Shape Rotator Virtual Hackathon 2026, organized by IC3, FlashbotsX, BB Fund, Encode Club, and The Convent. The word "Pramaana" comes from Sanskrit, meaning "proof" or "means of valid knowledge."
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Reveal>
        </section>

        {/* ═══ SECTION 2: ARCHITECTURE ═══ */}
        <section id="architecture" className="scroll-mt-24">
          <Reveal>
            <SectionLabel>Architecture</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">System Architecture</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-10">
              The system has four layers: enrollment (post-quantum), identity proofs (zero-knowledge), authentication (Schnorr signatures), and on-chain registry (Ethereum). Each layer is independent and upgradeable.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="space-y-4">
              {/* Layer 1 */}
              <ArchLayer color="secondary" label="User Layer" items={[
                { name: "PII Input", detail: "Raw personally-identifiable information: gov ID, DOB, jurisdiction, biometric hash. Consumed as cryptographic seed and immediately erased." },
                { name: "Key File Storage", detail: "Encrypted key file containing master secret key, commitment, and metadata. Downloaded by user after enrollment. Never stored server-side." },
                { name: "Wallet (MetaMask)", detail: "Ethereum wallet for signing on-chain transactions. Connects via WalletConnect or injected provider. Signs the commitment registration tx." },
              ]} />

              {/* Layer 2 */}
              <ArchLayer color="primary" label="Cryptographic Layer" badge="PII ERASED" items={[
                { name: "HKDF-SHA3-512", detail: "Hash-based Key Derivation Function (RFC 5869) using SHA3-512. Takes H(PII) as input key material, salt = 64 zero bytes, info = 'pramaana-v1'. Outputs a deterministic 64-byte seed. Same PII always produces the same seed — foundation of Sybil resistance." },
                { name: "Kyber-1024 KeyGen", detail: "CRYSTALS-Kyber ML-KEM-1024 per NIST FIPS 203. Takes 64-byte seed, deterministically produces 1568-byte encapsulation key (public) and 3168-byte decapsulation key (secret). NIST Level 5, equivalent to AES-256. Based on Module-LWE hardness." },
                { name: "Commitment C", detail: "C = pk ‖ ct (3136 bytes). Φ = SHA3-512(C) = 64-byte master identity hash. Binding under SHA3 collision resistance, hiding under MLWE." },
                { name: "Merkle Tree", detail: "Binary hash tree of all Φ values in anonymity set. Root stored on-chain. Membership proofs are O(log N). Compatible with Semaphore Groth16 circuit for future ZK upgrade." },
                { name: "Nullifier H(sk‖v)", detail: "Deterministic per (identity, service). nul = SHA256(sk_idr ‖ service_id). Prevents double-registration. Different services yield different nullifiers — unlinkability preserved." },
              ]} />

              {/* Layer 3 */}
              <ArchLayer color="amber" label="Proof Layer" items={[
                { name: "Merkle Membership", detail: "Proves your Φ is a leaf in the anonymity set Merkle tree. Proof size O(log N). Currently reveals path structure." },
                { name: "Nullifier Binding", detail: "Proves the nullifier was derived from the same secret key as the Merkle leaf. Binding commitment = SHA256(H(sk) ‖ nul ‖ root)." },
                { name: "Schnorr Auth", detail: "Challenge-response authentication using secp256k1. No IdR interaction needed after registration." },
                { name: "Groth16 ZK-SNARK", detail: "Planned upgrade via Semaphore circuit. Would hide the Merkle path entirely. Constant 128-byte proofs.", planned: true },
              ]} />

              {/* Layer 4 */}
              <ArchLayer color="destructive" label="Chain Layer" items={[
                { name: "Ethereum Sepolia", detail: "Primary testnet deployment. Stores Φ hashes and anonymity set Merkle roots." },
                { name: "Arbitrum", detail: "L2 deployment for lower gas costs. Same commitment format." },
                { name: "Base", detail: "L2 deployment. Independent verification of same Φ." },
                { name: "Bitcoin P2MR", detail: "Planned via BIP-360. Pay-to-Merkle-Root addresses with Dilithium signatures.", planned: true },
              ]} />
              <p className="text-xs text-muted-foreground text-center italic">Same Φ, independently verifiable on each chain</p>
            </div>
          </Reveal>
        </section>

        {/* ═══ SECTION 3: ENROLLMENT (PALC) ═══ */}
        <section id="enrollment" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-primary">Enrollment</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">PALC: PII-Anchored Lattice Commitment</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              PALC turns your personal information into a quantum-safe identity commitment. Your PII is consumed as cryptographic entropy and permanently erased — it never reaches a database.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <Tabs defaultValue="visual" className="w-full">
              <TabsList className="mb-6 bg-muted/30">
                <TabsTrigger value="visual">Visual Flow</TabsTrigger>
                <TabsTrigger value="formal">Formal Specification</TabsTrigger>
                <TabsTrigger value="proofs">Security Proofs</TabsTrigger>
              </TabsList>

              {/* Visual Flow */}
              <TabsContent value="visual" className="space-y-4">
                {[
                  { num: 1, title: "Hash PII", input: "PII string (gov ID + DOB + jurisdiction + biometric)", op: "SHA3-512", output: "64-byte hash", detail: "SHA3-512 (NIST FIPS 202) produces a 512-bit digest. Even with Grover's quantum algorithm, preimage resistance remains at 256 bits. The hash is one-way: you cannot recover the PII from this output." },
                  { num: 2, title: "Derive seed", input: "H(PII) from step 1", op: "HKDF-SHA3-512(salt=0, info=\"pramaana-v1\", length=64)", output: "64-byte deterministic seed", detail: "HKDF (RFC 5869) is a two-stage extract-then-expand KDF. It extracts entropy from the PII hash into a pseudorandom key, then expands it to the required length. The salt is fixed at 64 zero bytes. The info string 'pramaana-v1' acts as domain separation. Crucially, HKDF is DETERMINISTIC — the same PII always produces the same seed. This is what makes Sybil resistance possible." },
                  { num: 3, title: "Kyber-1024 KeyGen", input: "64-byte seed (d=seed[0:32], z=seed[32:64] per FIPS 203)", op: "ML-KEM-1024.KeyGen(d, z)", output: "pk (1568 bytes), sk (3168 bytes)", detail: "ML-KEM-1024 is the NIST-standardized post-quantum KEM (FIPS 203, August 2024). Parameters: k=4, n=256, q=3329. The keygen is deterministic from the (d, z) seed pair. Security level: NIST Level 5, equivalent to AES-256." },
                  { num: 4, title: "Encapsulate", input: "pk from step 3, r = H(seed ‖ 'commitment-randomness')", op: "ML-KEM-1024.Encaps(pk, r)", output: "ciphertext ct (1568 bytes), shared secret (32 bytes)", detail: "Encapsulation encrypts a random value under the public key. The ciphertext ct can only be decrypted by the holder of sk. Under the MLWE assumption, ct is computationally indistinguishable from random — this is the HIDING property (Theorem 1). The randomness r is also derived deterministically from the seed." },
                  { num: 5, title: "Build commitment", input: "pk (1568B), ct (1568B)", op: "C = pk ‖ ct, then Φ = SHA3-512(C)", output: "Commitment C (3136 bytes), Master identity Φ (64 bytes)", detail: "The commitment C is the concatenation of the public key and ciphertext — 3.1 KB total. Φ is the SHA3-512 hash of C, giving a compact 64-byte identifier stored on the Identity Registry. Φ is what the blockchain sees. No PII, no keys, just a quantum-safe hash. This maps directly to the master identity in the ASC/U2SSO framework (Section 3.3)." },
                  { num: 6, title: "Cryptographic erasure", input: "PII, H(PII), seed, r (all intermediates)", op: "Overwrite with zeros, garbage collect", output: "Nothing — these values cease to exist", detail: "After C and Φ are computed, all intermediate values are destroyed. In the Deno Edge Function, these are local variables garbage-collected after the function returns. In a production TEE (Intel TDX), secure memory wipe ensures even physical memory inspection cannot recover PII. Only (C, Φ, sk) survive — and none are invertible to PII (Theorem 4)." },
                ].map((step) => (
                  <Accordion key={step.num} type="single" collapsible>
                    <AccordionItem value={`step-${step.num}`} className="border border-border/30 rounded-xl bg-card/30 px-5 overflow-hidden">
                      <AccordionTrigger className="hover:no-underline py-4 gap-3">
                        <div className="flex items-center gap-4 text-left">
                          <span className="font-mono text-xl font-bold text-primary/40">{String(step.num).padStart(2, "0")}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold text-foreground">{step.title}</p>
                            <div className="mt-1 flex flex-wrap gap-4 text-xs text-muted-foreground">
                              <span><span className="text-muted-foreground/60">In:</span> {step.input}</span>
                            </div>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-5 pl-14 space-y-3">
                        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span><span className="text-muted-foreground/60">Op:</span> <code className="font-mono text-foreground/80">{step.op}</code></span>
                        </div>
                        <div className="text-xs text-muted-foreground"><span className="text-muted-foreground/60">Out:</span> {step.output}</div>
                        <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                ))}
              </TabsContent>

              {/* Formal Specification */}
              <TabsContent value="formal">
                <Card className="border-border/30 bg-card/30">
                  <CardContent className="p-6">
                    <pre className="text-sm font-mono text-muted-foreground leading-relaxed whitespace-pre-wrap overflow-x-auto">
{`PALC.Setup(1^λ):
  pp = (KDF: HKDF-SHA3-512, H: SHA3-512, KEM: ML-KEM-1024)
  return pp

PALC.Commit(PII, pp):
  seed := HKDF(salt = 0^512, IKM = H(PII),
               info = "pramaana-v1", L = 64)
  (pk, sk) := KEM.KeyGen(seed[:32], seed[32:])
  r := H(seed ‖ "commitment-randomness")
  ct := KEM.Encaps(pk, r[:32])
  C := pk ‖ ct
  Φ := H(C)
  ERASE(PII, H(PII), seed, r)
  return (C, Φ, sk)

PALC.Verify(C_new, Registry):
  Φ_new := H(C_new)
  if Φ_new ∈ Registry:
    return REJECT  // Sybil detected
  Registry := Registry ∪ {Φ_new}
  return ACCEPT`}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Security Proofs */}
              <TabsContent value="proofs">
                <Accordion type="single" collapsible className="space-y-2">
                  {[
                    { id: "t1", title: "Theorem 1 — Hiding (MLWE)", content: "The commitment C is computationally indistinguishable from random under the Module Learning With Errors assumption. Proof sketch: C contains a Kyber-1024 ciphertext which is IND-CPA secure. The public key pk is unlinkable to PII without sk by MLWE hardness." },
                    { id: "t2", title: "Theorem 2 — Binding (SHA3-512)", content: "No PPT adversary can find two distinct PII inputs that produce the same commitment. Proof sketch: A collision in Φ requires a collision in SHA3-512 (contradicting its 256-bit collision resistance) or identical C from different seeds (contradicting HKDF's PRF property)." },
                    { id: "t3", title: "Theorem 3 — Uniqueness / Sybil Resistance", content: "Each PII deterministically maps to exactly one Φ. The IdR rejects duplicate Φ values. Re-enrollment with the same PII produces the identical commitment — always. A second identity requires genuinely different PII, i.e., a different real person." },
                    { id: "t4", title: "Theorem 4 — PII One-Wayness", content: "Recovering PII from C requires inverting HKDF (HMAC-SHA3 PRF inversion) AND Kyber-1024 decapsulation (MLWE). Both are infeasible for any adversary, including quantum computers." },
                  ].map((t) => (
                    <AccordionItem key={t.id} value={t.id} className="border border-border/30 rounded-xl bg-card/30 px-5 overflow-hidden">
                      <AccordionTrigger className="text-sm font-medium hover:no-underline">{t.title}</AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground pb-4">{t.content}</AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </TabsContent>
            </Tabs>
          </Reveal>
        </section>

        {/* ═══ SECTION 4: IDENTITY PROOFS (ASC) ═══ */}
        <section id="identity-proofs" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-secondary">Identity Proofs</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Anonymous Self-Credentials (ASC)</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              Anonymous Self-Credentials let you prove you belong to a group of enrolled users — without revealing which user you are. A nullifier prevents you from registering twice with the same service.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <Tabs defaultValue="protocol" className="w-full">
              <TabsList className="mb-6 bg-muted/30">
                <TabsTrigger value="protocol">Protocol Flow</TabsTrigger>
                <TabsTrigger value="nullifier">Nullifier System</TabsTrigger>
                <TabsTrigger value="merkle">Merkle Proof</TabsTrigger>
                <TabsTrigger value="zk-upgrade">ZK Upgrade</TabsTrigger>
              </TabsList>

              <TabsContent value="protocol">
                <div className="space-y-2">
                  {[
                    { from: "User", to: "Service", msg: "\"I want to register\"", color: "text-secondary" },
                    { from: "User", to: "User", msg: "Derive child key csk = HKDF(r, service_name)", color: "text-primary" },
                    { from: "User", to: "User", msg: "Generate pseudonym ϕ = secp256k1.pubkey(csk)", color: "text-primary" },
                    { from: "User", to: "User", msg: "Compute nullifier nul = H(sk ‖ service_name)", color: "text-primary" },
                    { from: "User", to: "User", msg: "Generate membership proof π over anonymity set Λ", color: "text-primary" },
                    { from: "User", to: "Service", msg: "Send (ϕ, nul, π, set_id)", color: "text-secondary" },
                    { from: "Service", to: "IdR", msg: "Fetch anonymity set Λ for set_id", color: "text-amber-400" },
                    { from: "Service", to: "Service", msg: "Verify π against Λ", color: "text-amber-400" },
                    { from: "Service", to: "Service", msg: "Check nul is novel (Sybil check)", color: "text-amber-400" },
                    { from: "Service", to: "User", msg: "Registration accepted ✓", color: "text-green-400" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/20 px-4 py-2.5">
                      <div className="flex items-center gap-1.5 shrink-0 w-32 sm:w-40">
                        <Badge variant="outline" className="text-[10px] font-mono border-border/30">{step.from}</Badge>
                        <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                        <Badge variant="outline" className="text-[10px] font-mono border-border/30">{step.to}</Badge>
                      </div>
                      <p className={cn("text-sm", step.color)}>{step.msg}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="nullifier">
                <div className="space-y-6">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    The nullifier is the core of Sybil resistance. It's a deterministic function of your identity and the service — same person + same service always produces the same nullifier.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-border/30">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="text-xs">Scenario</TableHead>
                          <TableHead className="text-xs text-center">Same person?</TableHead>
                          <TableHead className="text-xs text-center">Same service?</TableHead>
                          <TableHead className="text-xs text-center">Nullifiers</TableHead>
                          <TableHead className="text-xs text-center">Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell className="text-sm">Alice registers with Twitter, then tries again</TableCell>
                          <TableCell className="text-sm text-center">Yes</TableCell>
                          <TableCell className="text-sm text-center">Yes</TableCell>
                          <TableCell className="text-sm text-center font-mono text-amber-400">nul = nul'</TableCell>
                          <TableCell className="text-sm text-center"><Badge variant="destructive" className="text-[10px]">REJECTED</Badge></TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-sm">Alice registers with Twitter, then Reddit</TableCell>
                          <TableCell className="text-sm text-center">Yes</TableCell>
                          <TableCell className="text-sm text-center">No</TableCell>
                          <TableCell className="text-sm text-center font-mono text-green-400">nul ≠ nul'</TableCell>
                          <TableCell className="text-sm text-center"><Badge className="text-[10px] bg-green-600">ACCEPTED</Badge></TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell className="text-sm">Alice registers with Twitter, Bob registers with Twitter</TableCell>
                          <TableCell className="text-sm text-center">No</TableCell>
                          <TableCell className="text-sm text-center">Yes</TableCell>
                          <TableCell className="text-sm text-center font-mono text-green-400">nul ≠ nul'</TableCell>
                          <TableCell className="text-sm text-center"><Badge className="text-[10px] bg-green-600">ACCEPTED</Badge></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="nul-detail" className="border-border/30">
                      <AccordionTrigger className="text-sm hover:no-underline text-muted-foreground">How nullifier determinism works</AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                        The nullifier nul = SHA256(sk_idr ‖ service_identifier) is deterministic. Since sk_idr is unique per person (derived from unique PII via PALC), and service_identifier is unique per service, the pair (sk, service) maps to exactly one nullifier. Same pair = same nullifier = rejected. Different pair = different nullifier = accepted. This is ASC Definition 10 (Sybil Resistance).
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </TabsContent>

              <TabsContent value="merkle">
                <div className="space-y-6">
                  {/* Simple Merkle tree visual */}
                  <div className="flex flex-col items-center gap-2 py-6">
                    <div className="rounded-lg border border-primary/40 bg-primary/10 px-6 py-2 text-sm font-mono text-primary font-semibold">Root</div>
                    <div className="flex gap-12">
                      <div className="w-px h-6 bg-muted-foreground/30" />
                      <div className="w-px h-6 bg-muted-foreground/30" />
                    </div>
                    <div className="flex gap-8">
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-mono text-primary/70">H01</div>
                      <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-1.5 text-xs font-mono text-primary/70">H23</div>
                    </div>
                    <div className="flex gap-4">
                      {["Φ₁", "Φ₂", "Φ₃", "Φ₄"].map((leaf, i) => (
                        <div key={leaf} className="flex flex-col items-center gap-1">
                          <div className="w-px h-4 bg-muted-foreground/30" />
                          <div className={cn("rounded border px-3 py-1 text-xs font-mono", i === 1 ? "border-secondary/60 bg-secondary/20 text-secondary" : "border-border/40 bg-muted/20 text-muted-foreground")}>{leaf}</div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">← anonymity set leaves (your Φ is highlighted)</p>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your identity Φ is one leaf in a Merkle tree. To prove membership, you reveal the sibling hashes along the path from your leaf to the root. The verifier recomputes the root and checks it matches the on-chain root. Proof size is O(log N) — for 1024 identities, the proof is only 10 hashes (320 bytes).
                  </p>
                  <Accordion type="single" collapsible>
                    <AccordionItem value="merkle-zk" className="border-border/30">
                      <AccordionTrigger className="text-sm hover:no-underline text-muted-foreground">Why a full ZK-SNARK upgrade matters</AccordionTrigger>
                      <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                        In the current implementation, the Merkle path is visible (the verifier can infer structural information about which leaf is yours). A full Groth16 ZK-SNARK upgrade (using the Semaphore circuit) would hide the path entirely — the verifier learns NOTHING except that some leaf in the tree matches.
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              </TabsContent>

              <TabsContent value="zk-upgrade">
                <div className="space-y-6">
                  {[
                    { phase: "Phase 1 (now)", title: "Merkle membership + nullifier binding", status: "LIVE", statusColor: "bg-green-600", items: ["Proves membership: Yes", "Hides which member: Partially (path structure visible)", "Proof size: ~320 bytes (log N)"] },
                    { phase: "Phase 2 (next)", title: "Groth16 ZK-SNARK via Semaphore", status: "DESIGNED", statusColor: "bg-amber-600", items: ["Proves membership: Yes", "Hides which member: Completely (zero-knowledge)", "Proof size: 128 bytes (constant)", "This is what the ASC paper's SRS-U2SSO uses"] },
                    { phase: "Phase 3 (future)", title: "Post-quantum ZK (lattice-based)", status: "RESEARCH", statusColor: "bg-primary", items: ["Proves membership: Yes", "Hides which member: Completely", "Proof size: ~100KB (STARK) or TBD (LaBRADOR)", "End-to-end post-quantum system"] },
                  ].map((p) => (
                    <Card key={p.phase} className="border-border/30 bg-card/30">
                      <CardContent className="p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <Badge className={cn("text-[10px]", p.statusColor)}>{p.status}</Badge>
                          <span className="text-xs text-muted-foreground">{p.phase}</span>
                        </div>
                        <p className="text-base font-semibold text-foreground mb-2">{p.title}</p>
                        <ul className="space-y-1">
                          {p.items.map((item, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/40" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </Reveal>
        </section>

        {/* ═══ SECTION 5: AUTHENTICATION ═══ */}
        <section id="authentication" className="scroll-mt-24">
          <Reveal>
            <SectionLabel>Authentication</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">U2SSO: User-issued Unlinkable SSO</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              After registration, you log in using Schnorr signatures. No interaction with the Identity Registry. No timing attacks. No passwords.
            </p>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="space-y-2 mb-6">
              {[
                { from: "Service", to: "User", msg: "Random challenge W", color: "text-amber-400" },
                { from: "User", to: "User", msg: "σ = Schnorr.Sign(child_key, W)", color: "text-primary" },
                { from: "User", to: "Service", msg: "Send σ", color: "text-secondary" },
                { from: "Service", to: "Service", msg: "Schnorr.Verify(pseudonym, W, σ)", color: "text-amber-400" },
                { from: "Service", to: "User", msg: "Authenticated ✓", color: "text-green-400" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-border/20 bg-card/20 px-4 py-2.5">
                  <div className="flex items-center gap-1.5 shrink-0 w-32 sm:w-40">
                    <Badge variant="outline" className="text-[10px] font-mono border-border/30">{step.from}</Badge>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                    <Badge variant="outline" className="text-[10px] font-mono border-border/30">{step.to}</Badge>
                  </div>
                  <p className={cn("text-sm", step.color)}>{step.msg}</p>
                </div>
              ))}
            </div>
            <Accordion type="single" collapsible>
              <AccordionItem value="no-idr" className="border-border/30">
                <AccordionTrigger className="text-sm hover:no-underline text-muted-foreground">Why no IdR interaction matters</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  In traditional SSO (Google, Facebook), every login touches the identity provider — giving them a timestamp of exactly when you accessed each service. If the IdP colludes with services, they can deanonymize you through timing correlation alone. U2SSO eliminates this: after the one-time registration, ALL authentication happens directly between you and the service. The IdR is never contacted again.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Reveal>
        </section>

        {/* ═══ SECTION 6: WALLET SECURITY ═══ */}
        <section id="wallet-security" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-destructive">Wallet Security</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Quantum Threat to Wallets</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              Every Ethereum address that has sent a transaction has its public key permanently exposed on-chain. A quantum computer could derive the private key.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
              {[
                { label: "Your Wallet", color: "bg-secondary/20 border-secondary/40 text-secondary" },
                { label: "ECDSA Sig (v,r,s)", color: "bg-amber-500/20 border-amber-500/40 text-amber-400" },
                { label: "Public Key exposed", color: "bg-destructive/20 border-destructive/40 text-destructive" },
                { label: "Shor's Algorithm", color: "bg-destructive/20 border-destructive/40 text-destructive" },
                { label: "Private Key ☠", color: "bg-destructive/30 border-destructive/60 text-destructive font-bold" },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center gap-3">
                  <div className={cn("rounded-lg border px-4 py-2 text-sm font-medium", step.color)}>{step.label}</div>
                  {i < arr.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground/40" />}
                </div>
              ))}
            </div>
            <div className="flex justify-center">
              <Button asChild variant="outline" className="rounded-full">
                <Link to="/wallet-connect">Scan your wallet <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </Reveal>
        </section>

        {/* ═══ SECTION 7: ZK INTEGRATION ═══ */}
        <section id="zk-integration" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-primary">ZK Integration</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Complementary Layers</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              Pramaana handles quantum-safe enrollment. ZK-SNARKs handle anonymous membership proofs. They're complementary layers, not alternatives.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="overflow-x-auto rounded-xl border border-border/30">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Layer</TableHead>
                    <TableHead className="text-xs">Technology</TableHead>
                    <TableHead className="text-xs">What it does</TableHead>
                    <TableHead className="text-xs text-center">Quantum-safe?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { layer: "Enrollment", tech: "Pramaana PALC (Kyber-1024)", what: "Creates identity commitment", safe: true },
                    { layer: "Membership proof", tech: "Merkle / Groth16 / Bulletproofs", what: "Proves \"I'm in the set\" anonymously", safe: false },
                    { layer: "Authentication", tech: "Schnorr (secp256k1)", what: "Challenge-response login", safe: false },
                    { layer: "On-chain registry", tech: "Ethereum (ECDSA)", what: "Stores commitments", safe: false },
                  ].map((row) => (
                    <TableRow key={row.layer}>
                      <TableCell className="text-sm font-medium">{row.layer}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{row.tech}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.what}</TableCell>
                      <TableCell className="text-center">{row.safe ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" /> : <XCircle className="h-4 w-4 text-destructive/60 mx-auto" />}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-4 text-sm text-muted-foreground text-center">
              Pramaana makes the <span className="text-green-400 font-medium">first layer</span> quantum-safe. The remaining layers have a clear upgrade path (lattice ZK, Dilithium signatures, BIP-360).
            </p>
          </Reveal>
        </section>

        {/* ═══ SECTION 8: MULTICHAIN ═══ */}
        <section id="multichain" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-amber-400">Multichain</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Cross-Chain Identity</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              The same Pramaana identity Φ works across multiple blockchains. Each chain independently verifies the commitment.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { chain: "Ethereum Sepolia", status: "Deployed", active: true },
                { chain: "Arbitrum", status: "Deployed", active: true },
                { chain: "Base", status: "Deployed", active: true },
                { chain: "Cosmos", status: "Planned", active: false },
                { chain: "Bitcoin (BIP-360)", status: "Planned", active: false },
              ].map((c) => (
                <Card key={c.chain} className={cn("border-border/30", c.active ? "bg-card/40" : "bg-card/20 opacity-60")}>
                  <CardContent className="p-5 flex items-center gap-3">
                    <Globe className={cn("h-5 w-5", c.active ? "text-secondary" : "text-muted-foreground")} />
                    <div>
                      <p className="text-sm font-medium text-foreground">{c.chain}</p>
                      <p className="text-xs text-muted-foreground">{c.status}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ═══ SECTION 9: BIP-360 ═══ */}
        <section id="bip360" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-amber-400">BIP-360 Migration</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Post-Quantum Bitcoin</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              BIP-360 introduces P2MR (Pay-to-Merkle-Root) addresses for Bitcoin, removing the quantum-vulnerable key-path spend. Pramaana provides the post-quantum identity layer that P2MR can derive from.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {[
                { year: "2026", event: "BIP-360 Draft", active: true },
                { year: "2028", event: "Migration Deadline", active: false },
                { year: "2030", event: "EU PQ Mandate", active: false },
                { year: "2035", event: "NIST ECDSA Sunset", active: false },
              ].map((m, i, arr) => (
                <div key={m.year} className="flex items-center gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <span className={cn("text-lg font-bold font-mono", m.active ? "text-secondary" : "text-muted-foreground")}>{m.year}</span>
                    <span className="text-xs text-muted-foreground text-center">{m.event}</span>
                  </div>
                  {i < arr.length - 1 && <div className="w-8 h-px bg-border/40" />}
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ═══ SECTION 10: SECURITY PROPERTIES ═══ */}
        <section id="security-properties" className="scroll-mt-24">
          <Reveal>
            <SectionLabel>Security Properties</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Formal Security Guarantees</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              Pramaana preserves all six security properties proven in the ASC paper (IACR 2025/618, Theorem 1), and strengthens Sybil resistance from a trust assumption to a cryptographic guarantee.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Accordion type="single" collapsible className="space-y-2">
              {[
                { id: "correct", title: "Correctness", status: "Preserved", icon: Check, detail: "PALC produces valid master credentials identical to random sampling. The deterministic keygen ensures consistency." },
                { id: "robust", title: "Robustness", status: "Preserved", icon: Shield, detail: "Malicious provers can't prevent honest enrollment. The IdR accepts any valid commitment." },
                { id: "sybil", title: "Sybil Resistance", status: "STRENGTHENED", icon: Fingerprint, statusColor: "text-green-400", detail: "Now cryptographic (PALC binding) instead of trust-based. PII deterministically maps to exactly one Φ." },
                { id: "unforge", title: "Unforgeability", status: "Preserved", icon: Lock, detail: "Secret key is computationally random by MLWE. Cannot be forged without the original PII." },
                { id: "anon", title: "Anonymity", status: "Preserved", icon: EyeOff, detail: "Commitment is hiding under MLWE. The Φ hash reveals nothing about the underlying identity." },
                { id: "unlink", title: "Multi-verifier Unlinkability", status: "Preserved", icon: Link2, detail: "Independent of enrollment mechanism. Different services receive different pseudonyms and nullifiers." },
              ].map((prop) => (
                <AccordionItem key={prop.id} value={prop.id} className="border border-border/30 rounded-xl bg-card/30 px-5 overflow-hidden">
                  <AccordionTrigger className="hover:no-underline py-3 gap-3">
                    <div className="flex items-center gap-3">
                      <prop.icon className="h-4 w-4 text-primary/70 shrink-0" />
                      <span className="text-sm font-medium text-foreground">{prop.title}</span>
                      <Badge variant="outline" className={cn("text-[10px] ml-auto", prop.statusColor || "text-muted-foreground")}>{prop.status}</Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground pb-4 pl-7">{prop.detail}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </section>

        {/* ═══ SECTION 11: CRYPTOGRAPHIC PRIMITIVES ═══ */}
        <section id="primitives" className="scroll-mt-24">
          <Reveal>
            <SectionLabel>Cryptographic Primitives</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Standards-Based Cryptography</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              Every primitive used in Pramaana is a NIST-standardized or peer-reviewed algorithm. No custom cryptography.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <Tabs defaultValue="mlkem" className="w-full">
              <TabsList className="mb-6 bg-muted/30 flex-wrap h-auto gap-1">
                <TabsTrigger value="mlkem">ML-KEM-1024</TabsTrigger>
                <TabsTrigger value="sha3">SHA3-512</TabsTrigger>
                <TabsTrigger value="hkdf">HKDF</TabsTrigger>
                <TabsTrigger value="schnorr">Schnorr</TabsTrigger>
                <TabsTrigger value="merkle">Merkle Trees</TabsTrigger>
              </TabsList>
              {[
                { val: "mlkem", rows: [["Standard", "NIST FIPS 203 (August 2024)"], ["Security", "Level 5 (equivalent to AES-256)"], ["Hardness", "Module-LWE with k=4, n=256, q=3329"], ["Key sizes", "pk=1568B, sk=3168B, ct=1568B"], ["Quantum security", "256-bit against all known quantum algorithms"], ["Used for", "Deterministic keypair generation and commitment encryption"]] },
                { val: "sha3", rows: [["Standard", "NIST FIPS 202"], ["Output", "512 bits (64 bytes)"], ["Collision resistance", "256-bit"], ["Preimage resistance", "512-bit (256-bit post-quantum via Grover)"], ["Used for", "PII hashing, commitment hashing (Φ = H(C)), nullifier derivation"]] },
                { val: "hkdf", rows: [["Standard", "RFC 5869"], ["Inner hash", "SHA-512 (SHA3-512 in production)"], ["Mode", "Extract-then-Expand"], ["Used for", "Seed derivation from PII hash, child key derivation for pseudonyms"]] },
                { val: "schnorr", rows: [["Standard", "BIP-340"], ["Curve", "secp256k1 (256-bit)"], ["Used for", "Pseudonym generation, authentication signatures"], ["Quantum status", "NOT quantum-safe (vulnerable to Shor's on ECDLP)"], ["Upgrade path", "Replace with CRYSTALS-Dilithium (FIPS 204)"]] },
                { val: "merkle", rows: [["Type", "Binary SHA-256 hash tree"], ["Proof size", "O(log N) hashes"], ["Used for", "Anonymity set membership proofs"], ["Compatible with", "Semaphore Groth16 circuit for ZK upgrade"]] },
              ].map((tab) => (
                <TabsContent key={tab.val} value={tab.val}>
                  <Card className="border-border/30 bg-card/30">
                    <CardContent className="p-0">
                      <Table>
                        <TableBody>
                          {tab.rows.map(([k, v]) => (
                            <TableRow key={k} className="border-border/20">
                              <TableCell className="text-sm font-medium text-foreground w-40">{k}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{v}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              ))}
            </Tabs>
          </Reveal>
        </section>

        {/* ═══ SECTION 12: RESEARCH PAPERS ═══ */}
        <section id="papers" className="scroll-mt-24">
          <Reveal>
            <SectionLabel>Research Papers</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">Research Foundation</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              Pramaana builds on and extends published research from IC3 and the broader cryptography community.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: "Pramaana: PII-Anchored Lattice Commitment for Post-Quantum ASC", authors: "Vaishnavi Dasika — Columbia University (SEAS), GILM Lab", summary: "Closes the IdR enrollment gap with post-quantum Kyber-1024 commitments.", detail: "Key contributions: (1) PII-Anchored Commitment scheme, (2) Kyber-1024 lattice encryption layer, (3) Formal proof of hiding/binding/uniqueness/one-wayness under MLWE, (4) Proof that integration preserves all 6 ASC security properties, (5) Sub-millisecond enrollment PoC.", tag: "Core" },
                { title: "Anonymous Self-Credentials and their Application to SSO", authors: "Alupotha, Barbaraci, Kaklamanis, Rawat, Cachin, Zhang — IACR 2025/618", summary: "Introduces ASC — Sybil-resistant anonymous credentials without trusted IdPs.", detail: "Defines the ASC primitive with 5 security properties. Two constructions: SRS-ASC (Semaphore/Groth16, constant 328-byte proofs) and CRS-ASC (Bulletproofs/secp256k1, logarithmic proofs). U2SSO system with Ethereum IdR smart contract.", tag: "Foundation" },
                { title: "Narrowing the Gap between TEEs Threat Model and Deployment", authors: "Rezabek et al. — Flashbots / TU Munich", summary: "Identifies attestation gaps in Confidential VMs for blockchain applications.", detail: "Relevant to Pramaana's production deployment path: running PALC enrollment inside Intel TDX with PPID-based provider binding for hardware-attested secure execution.", tag: "TEE" },
                { title: "Props for Machine-Learning Security", authors: "Juels & Koushanfar — Cornell Tech / UCSD (IC3)", summary: "Protected pipelines for authenticated data sourcing using TEEs and privacy-preserving oracles.", detail: "Conceptual precursor to Pramaana's authenticated enrollment flow. Props demonstrate how TEEs and oracles can provide data integrity and privacy simultaneously.", tag: "ML Security" },
              ].map((paper) => (
                <Card key={paper.title} className="border-border/30 bg-card/30">
                  <CardContent className="p-5 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground leading-snug">{paper.title}</p>
                      <Badge variant="secondary" className="text-[10px] shrink-0">{paper.tag}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{paper.authors}</p>
                    <p className="text-sm text-muted-foreground">{paper.summary}</p>
                    <Accordion type="single" collapsible>
                      <AccordionItem value="detail" className="border-0">
                        <AccordionTrigger className="text-xs hover:no-underline text-primary py-1">Key contributions</AccordionTrigger>
                        <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{paper.detail}</AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </CardContent>
                </Card>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ═══ SECTION 13: COMPARISON ═══ */}
        <section id="comparison" className="scroll-mt-24">
          <Reveal>
            <SectionLabel color="text-destructive">Comparison</SectionLabel>
            <h2 className="text-2xl font-bold text-foreground sm:text-3xl mb-3">How Pramaana Compares</h2>
            <p className="text-base text-muted-foreground leading-relaxed max-w-3xl mb-8">
              How Pramaana compares with existing identity solutions across security, privacy, and quantum readiness.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="overflow-x-auto rounded-xl border border-border/30">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs">Feature</TableHead>
                    <TableHead className="text-xs text-center">Google OAuth</TableHead>
                    <TableHead className="text-xs text-center">KYC/Aadhaar</TableHead>
                    <TableHead className="text-xs text-center">Web3 DID</TableHead>
                    <TableHead className="text-xs text-center">Worldcoin</TableHead>
                    <TableHead className="text-xs text-center text-primary font-semibold">Pramaana</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { feature: "PII stored", vals: ["By Google", "By government", "On blockchain", "Iris scans centralized", "NEVER (erased)"], colors: [false, false, false, false, true] },
                    { feature: "Cross-service tracking", vals: ["Full visibility", "Via ID number", "Public tx graph", "Orb scan linkable", "Impossible"], colors: [false, false, false, false, true] },
                    { feature: "Sybil resistance", vals: ["Weak (email)", "Strong (biometric)", "None (free wallets)", "Strong (iris)", "Cryptographic"], colors: [false, true, false, true, true] },
                    { feature: "Quantum resistant", vals: ["No", "No", "No", "No", "YES (Kyber-1024)"], colors: [false, false, false, false, true] },
                    { feature: "Survives breach", vals: ["Activity leaked", "ID docs leaked", "Wallet exposed", "Iris templates leaked", "Nothing to leak"], colors: [false, false, false, false, true] },
                    { feature: "Trusted third party", vals: ["Google", "Government", "Validators", "Worldcoin Foundation", "None required"], colors: [false, false, false, false, true] },
                    { feature: "Open source", vals: ["No", "No", "Partially", "Partially", "Fully"], colors: [false, false, false, false, true] },
                  ].map((row) => (
                    <TableRow key={row.feature}>
                      <TableCell className="text-sm font-medium">{row.feature}</TableCell>
                      {row.vals.map((v, i) => (
                        <TableCell key={i} className={cn("text-sm text-center", row.colors[i] ? "text-green-400 font-medium" : "text-muted-foreground")}>{v}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Accordion type="single" collapsible className="mt-6">
              <AccordionItem value="worldcoin" className="border-border/30">
                <AccordionTrigger className="text-sm hover:no-underline text-muted-foreground">Why Worldcoin comparison matters</AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  Worldcoin uses iris biometrics for Sybil resistance — similar goal to Pramaana. The critical difference: Worldcoin stores biometric templates in centralized infrastructure, creating a global surveillance database. Pramaana consumes PII and erases it — the commitment on the IdR reveals nothing about the person. Additionally, Worldcoin's cryptography is not post-quantum, while Pramaana's enrollment layer uses NIST-standardized Kyber-1024.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </Reveal>
        </section>

      </main>

      {/* ── Sticky bottom bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/30 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-2.5">
          <span className="text-sm text-muted-foreground hidden sm:block">Ready to try it?</span>
          <div className="flex items-center gap-2 mx-auto sm:mx-0">
            <Button asChild size="sm" variant="outline" className="rounded-full text-xs">
              <Link to="/wallet-connect">Scan Wallet</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full text-xs">
              <Link to="/enroll">Enroll Now</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="rounded-full text-xs">
              <Link to="/agent">Talk to Agent</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;

/* ═══════════════════════════════════════════════════════════════
   Architecture Layer Component
   ═══════════════════════════════════════════════════════════════ */

function ArchLayer({ color, label, badge, items }: {
  color: string;
  label: string;
  badge?: string;
  items: { name: string; detail: string; planned?: boolean }[];
}) {
  const borderColor = color === "secondary" ? "border-secondary/30" : color === "primary" ? "border-primary/30" : color === "amber" ? "border-amber-500/30" : "border-destructive/30";
  const labelColor = color === "secondary" ? "text-secondary" : color === "primary" ? "text-primary" : color === "amber" ? "text-amber-400" : "text-destructive";

  return (
    <div className={cn("rounded-xl border-2 border-dashed p-4", borderColor)}>
      <div className="flex items-center gap-2 mb-3">
        <span className={cn("text-xs font-semibold uppercase tracking-wider", labelColor)}>{label}</span>
        {badge && <Badge variant="destructive" className="text-[10px]">{badge}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Popover key={item.name}>
            <PopoverTrigger asChild>
              <button className={cn(
                "rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted/30 cursor-pointer",
                item.planned ? "border-dashed border-muted-foreground/30 text-muted-foreground/60" : "border-border/40 text-foreground"
              )}>
                {item.name} {item.planned && <span className="text-[9px] text-muted-foreground/40 ml-1">(planned)</span>}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 text-sm leading-relaxed text-muted-foreground">
              <p className="font-semibold text-foreground text-xs mb-1">{item.name}</p>
              {item.detail}
            </PopoverContent>
          </Popover>
        ))}
      </div>
    </div>
  );
}
