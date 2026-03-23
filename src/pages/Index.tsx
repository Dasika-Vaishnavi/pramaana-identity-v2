import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useInView } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Eye, ShieldAlert, Link as LinkIcon, Fingerprint, UserCheck, LogIn,
  Vote, Wallet, Globe, Bot, Gift, Heart, CheckCircle2, ArrowRight,
  Shield, Users, Database, Zap, ChevronRight, ExternalLink,
} from "lucide-react";

// ── Scroll-reveal wrapper ────────────────────────────────────────────────

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.2 });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 18, filter: "blur(4px)" }}
      animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
      transition={{
        duration: 0.6,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Animated counter ─────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 1200;
    const start = performance.now();
    const from = display;
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * ease));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}

// ── Main page ────────────────────────────────────────────────────────────

const Index = () => {
  const [identities, setIdentities] = useState(0);
  const [onChain, setOnChain] = useState(0);
  const [anonSets, setAnonSets] = useState(0);
  const [sybilBlocked, setSybilBlocked] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [c1, c2, c3] = await Promise.all([
        supabase.from("commitments").select("*", { count: "exact", head: true }),
        supabase.from("commitments").select("*", { count: "exact", head: true }).not("tx_hash", "is", null),
        supabase.from("anonymity_sets").select("*", { count: "exact", head: true }),
      ]);
      setIdentities(c1.count ?? 0);
      setOnChain(c2.count ?? 0);
      setAnonSets(c3.count ?? 0);
      setSybilBlocked(3); // mock for now
    };
    load();

    const channel = supabase
      .channel("landing-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commitments" }, () =>
        setIdentities((n) => n + 1)
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "anonymity_sets" }, () =>
        setAnonSets((n) => n + 1)
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="relative overflow-x-hidden">
      {/* ══ Animated gradient bg ══ */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 animate-[heroShift_18s_ease-in-out_infinite_alternate]"
          style={{
            background:
              "radial-gradient(ellipse 90% 70% at 40% 30%, hsla(255, 48%, 23%, 0.55), transparent 65%), radial-gradient(ellipse 70% 60% at 70% 75%, hsla(165, 78%, 17%, 0.45), transparent 60%)",
          }}
        />
      </div>
      <style>{`
        @keyframes heroShift {
          0%   { opacity:.85; transform:scale(1) }
          50%  { opacity:1;   transform:scale(1.04) translateY(-8px) }
          100% { opacity:.85; transform:scale(1) }
        }
      `}</style>

      {/* ════════════════════════════════════════════════════════════════════
          HERO
      ════════════════════════════════════════════════════════════════════ */}
      <section className="relative px-6 pt-28 pb-20 lg:pt-44 lg:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-5 text-xs font-semibold uppercase tracking-[0.25em] text-secondary"
          >
            Post-Quantum Identity
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl font-bold leading-[1.06] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]"
            style={{ textWrap: "balance" }}
          >
            Prove you're real.{" "}
            <span className="text-secondary">Stay invisible.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg"
            style={{ textWrap: "pretty" }}
          >
            Pramaana is a post-quantum identity enrollment system. Your personal
            data is consumed once as cryptographic entropy — then permanently
            erased. No database stores your identity. No service can track you.
            No quantum computer can reverse it.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <Button asChild size="lg" className="rounded-full bg-primary px-8 text-primary-foreground hover:bg-primary/85 active:scale-[0.97] transition-transform">
              <Link to="/enroll">
                Start Enrollment <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full border-border/60 px-8 active:scale-[0.97] transition-transform"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              See How It Works
            </Button>
          </motion.div>
        </div>

        {/* Live stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4"
        >
          {[
            { label: "Identities Enrolled", value: identities, icon: Users },
            { label: "On-Chain Confirmations", value: onChain, icon: Shield },
            { label: "Anonymity Sets", value: anonSets, icon: Database },
            { label: "Sybil Attacks Blocked", value: sybilBlocked, icon: Zap },
          ].map(({ label, value, icon: Icon }) => (
            <Card key={label} className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardContent className="flex flex-col items-center gap-1.5 px-3 py-5 text-center">
                <Icon className="h-4 w-4 text-secondary/70" />
                <p className="font-mono text-2xl font-bold text-foreground">
                  <AnimatedNumber value={value} />
                </p>
                <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
                <span className="inline-flex items-center gap-1 text-[9px] font-medium text-green-400">
                  <span className="inline-block h-1 w-1 animate-pulse rounded-full bg-green-400" />
                  Live
                </span>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          THE PROBLEM
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl" style={{ textWrap: "balance" }}>
              Your identity is broken
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {[
              {
                icon: Eye,
                title: "Google / OAuth SSO",
                desc: "Google sees every service you log into. One breach exposes your activity across all platforms. A single point of failure controls billions of identities.",
              },
              {
                icon: ShieldAlert,
                title: "KYC & Government ID",
                desc: "Aadhaar, SSN, passport scans sit in centralized databases. Coinbase's 2025 breach exposed millions of users' personal documents. The data exists, so it can be stolen.",
              },
              {
                icon: LinkIcon,
                title: "Web3 Wallets & DIDs",
                desc: "Every transaction on Ethereum is publicly traceable. Using the same wallet across DeFi protocols creates a complete activity graph. There's no quantum protection either.",
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <Reveal key={title} delay={i * 0.1}>
                <Card className="group h-full border-border/40 bg-card/50 backdrop-blur-sm transition-shadow duration-300 hover:shadow-lg hover:shadow-destructive/5">
                  <CardContent className="flex flex-col gap-4 p-7">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive transition-transform duration-200 group-hover:scale-105">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">{title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.3}>
            <p className="mt-10 text-center text-base font-medium text-secondary">
              Pramaana eliminates all three problems.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          HOW IT WORKS
      ════════════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl" style={{ textWrap: "balance" }}>
              One enrollment. Unlimited services. Zero tracking.
            </h2>
          </Reveal>

          <div className="relative mt-16 grid gap-8 md:grid-cols-3">
            {/* Connecting line (desktop) */}
            <div className="pointer-events-none absolute top-[3.5rem] left-[16.5%] right-[16.5%] hidden h-px bg-gradient-to-r from-primary/40 via-secondary/40 to-primary/40 md:block" />

            {[
              {
                icon: Fingerprint,
                step: 1,
                title: "Enroll once",
                desc: "Your government ID or biometric is used as cryptographic entropy. HKDF-SHA3-512 derives a seed. Kyber-1024 generates a quantum-safe commitment. Your PII is consumed and permanently erased — it never touches a database.",
                label: "PALC.Commit (Pramaana Paper §3.2)",
              },
              {
                icon: UserCheck,
                step: 2,
                title: "Register privately",
                desc: "For each service, a unique pseudonym and nullifier are derived from your master key. The nullifier ensures one account per service (Sybil resistance). Different services get completely different nullifiers — unlinkable even if they collude.",
                label: "ASC.Prove (IACR 2025/618 §4.2)",
              },
              {
                icon: LogIn,
                step: 3,
                title: "Authenticate freely",
                desc: "Log in using Schnorr signature challenge-response with your service-specific child key. No interaction with the Identity Registry needed — this eliminates the timing attacks that plague traditional SSO systems.",
                label: "U2SSO Authentication (2025/618 §6.3.4)",
              },
            ].map(({ icon: Icon, step, title, desc, label }, i) => (
              <Reveal key={title} delay={i * 0.12}>
                <Card className="group relative h-full border-border/40 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-1">
                  <CardContent className="flex flex-col gap-4 p-7">
                    <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
                      <Icon className="h-6 w-6" />
                    </div>
                    <Badge variant="outline" className="w-fit border-border/60 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Step {step}
                    </Badge>
                    <h3 className="text-xl font-semibold text-foreground">{title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{desc}</p>
                    <p className="mt-auto pt-2 font-mono text-[11px] text-primary/70">{label}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          USE CASES
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl" style={{ textWrap: "balance" }}>
              Where Pramaana changes everything
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Vote, title: "DAO Voting", problem: "Whales create 50 wallets and vote 50 times", solution: "One enrollment = one vote. Nullifier enforces single-use per proposal. Zero-knowledge proof hides which member voted." },
              { icon: Wallet, title: "DeFi Without KYC Leaks", problem: "Exchanges store passport scans that get breached", solution: "Prove you're a unique person without revealing your ID. If the exchange is hacked, attackers find only commitment hashes — meaningless without the erased PII." },
              { icon: Globe, title: "EU Digital Identity (EUDI Wallet)", problem: "EU needs post-quantum credential solutions by 2027", solution: "Pramaana slots directly into EUDI as the enrollment layer. Citizen derives separate pseudonyms for bank, healthcare, tax — none linkable to each other." },
              { icon: Bot, title: "Anti-Bot Social Media", problem: "Bulk SIM cards and paid verification don't stop bots", solution: "Each real person gets one enrollment. Nullifier per platform means one account per human. Platform never learns your real name." },
              { icon: Gift, title: "Fair Airdrop Distribution", problem: "30-50% of crypto airdrops go to Sybil farmers", solution: "One PII = one commitment = one claim. The math enforces fairness. No centralized Sybil checker needed." },
              { icon: Heart, title: "Anonymous Healthcare", problem: "Hospital, pharmacy, and insurer can cross-reference your records", solution: "Separate pseudonyms for each medical service. Within each, you're Sybil-resistant. Across them, you're completely unlinkable." },
            ].map(({ icon: Icon, title, problem, solution }, i) => (
              <Reveal key={title} delay={i * 0.08}>
                <Card className="group h-full border-l-2 border-l-primary/30 border-t-0 border-r-border/40 border-b-border/40 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-l-secondary/50 hover:shadow-md">
                  <CardContent className="flex flex-col gap-3 p-6">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-200 group-hover:scale-105">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">{title}</h3>
                    <p className="text-sm leading-relaxed text-destructive/80">
                      <span className="font-medium">Problem:</span> {problem}
                    </p>
                    <p className="text-sm leading-relaxed text-secondary/90">
                      <span className="font-medium">Solution:</span> {solution}
                    </p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          SECURITY PROPERTIES
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl" style={{ textWrap: "balance" }}>
              Mathematically proven guarantees
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { name: "Hiding (MLWE)", desc: "Commitment reveals nothing about your PII to any observer" },
              { name: "Binding (SHA3-512)", desc: "No two different PIIs can produce the same commitment" },
              { name: "Sybil resistance", desc: "Same identity + same service = same nullifier = rejected on retry" },
              { name: "Anonymity", desc: "Proofs hide which identity in the anonymity set generated them" },
              { name: "Multi-verifier unlinkability", desc: "Different services cannot determine you're the same person" },
              { name: "Post-quantum (Kyber-1024)", desc: "256-bit security against quantum computers via NIST FIPS 203" },
            ].map(({ name, desc }, i) => (
              <Reveal key={name} delay={i * 0.07}>
                <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/40 p-5 backdrop-blur-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{desc}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          COMPARISON TABLE
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-5xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl" style={{ textWrap: "balance" }}>
              How Pramaana compares
            </h2>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-14 overflow-x-auto rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/40">
                    <TableHead className="text-muted-foreground">Feature</TableHead>
                    <TableHead className="text-muted-foreground">Google OAuth</TableHead>
                    <TableHead className="text-muted-foreground">KYC / Aadhaar</TableHead>
                    <TableHead className="text-muted-foreground">Web3 DID</TableHead>
                    <TableHead className="text-secondary font-semibold">Pramaana</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { feature: "PII stored by provider", vals: ["Yes", "Yes", "On-chain", "Never"], colors: ["r", "r", "y", "g"] },
                    { feature: "Tracks across services", vals: ["Yes", "Yes", "Publicly", "Impossible"], colors: ["r", "r", "r", "g"] },
                    { feature: "Sybil resistant", vals: ["Weak (email)", "Strong", "Weak (wallets)", "Cryptographic"], colors: ["r", "g", "r", "g"] },
                    { feature: "Quantum safe", vals: ["No", "No", "No", "Yes (Kyber-1024)"], colors: ["r", "r", "r", "g"] },
                    { feature: "Single point of failure", vals: ["Google", "Government DB", "Ledger", "None"], colors: ["r", "r", "y", "g"] },
                    { feature: "Post-breach exposure", vals: ["Full activity log", "ID documents", "Wallet graph", "Nothing (PII erased)"], colors: ["r", "r", "r", "g"] },
                  ].map(({ feature, vals, colors }) => (
                    <TableRow key={feature} className="border-border/30">
                      <TableCell className="font-medium text-foreground">{feature}</TableCell>
                      {vals.map((v, i) => (
                        <TableCell
                          key={i}
                          className={
                            colors[i] === "g"
                              ? "bg-green-500/8 text-green-400 font-medium"
                              : colors[i] === "r"
                              ? "text-destructive/80"
                              : "text-yellow-400/80"
                          }
                        >
                          {v}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          RESEARCH FOUNDATION
      ════════════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-24 lg:py-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <h2 className="text-center text-3xl font-bold text-foreground sm:text-4xl" style={{ textWrap: "balance" }}>
              Built on peer-reviewed cryptography
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-6 md:grid-cols-2">
            <Reveal delay={0}>
              <Card className="h-full border-border/40 bg-card/50 backdrop-blur-sm">
                <CardContent className="flex flex-col gap-3 p-7">
                  <Badge variant="outline" className="w-fit border-primary/30 text-primary text-[10px]">Paper I</Badge>
                  <h3 className="text-lg font-semibold text-foreground">Pramaana — PII-Anchored Lattice Commitment</h3>
                  <p className="text-sm text-secondary">Vaishnavi Dasika, Columbia University (SEAS)</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Closes the enrollment gap in ASC/U2SSO with post-quantum Kyber-1024
                    lattice commitments. Formally proven under MLWE.
                  </p>
                </CardContent>
              </Card>
            </Reveal>
            <Reveal delay={0.1}>
              <Card className="h-full border-border/40 bg-card/50 backdrop-blur-sm">
                <CardContent className="flex flex-col gap-3 p-7">
                  <Badge variant="outline" className="w-fit border-primary/30 text-primary text-[10px]">Paper II</Badge>
                  <h3 className="text-lg font-semibold text-foreground">Anonymous Self-Credentials (IACR 2025/618)</h3>
                  <p className="text-sm text-secondary">Alupotha, Barbaraci, Kaklamanis, Rawat, Cachin, Zhang</p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Introduces ASC — user-centric credentials with Sybil resistance and
                    multi-verifier unlinkability. No trusted identity provider needed.
                  </p>
                </CardContent>
              </Card>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <p className="mt-8 text-center text-sm text-muted-foreground">
              Built for the Shape Rotator Virtual Hackathon — IC3 + FlashbotsX + Encode Club
            </p>
          </Reveal>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          FOOTER
      ════════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-border/40 px-6 py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/enroll" className="transition-colors hover:text-foreground">Enrollment</Link>
            <Link to="/verify" className="transition-colors hover:text-foreground">Verification</Link>
            <Link to="/dashboard" className="transition-colors hover:text-foreground">Dashboard</Link>
            <Link to="/about" className="transition-colors hover:text-foreground">About</Link>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Quantum-safe identity for the post-quantum world.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
