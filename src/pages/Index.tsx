import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Eye, DatabaseZap, Link2, ShieldCheck, EyeOff, Fingerprint, Unlink,
  ArrowRight, ChevronRight, ChevronLeft, Wallet, Bot, Vote,
  Globe, Gift, Heart, MessageSquare, User,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Scroll-reveal ────────────────────────────────────────────────────────

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.15 });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Animated counter ─────────────────────────────────────────────────────

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const dur = 1200;
    const start = performance.now();
    const from = ref.current;
    const step = (now: number) => {
      const t = Math.min((now - start) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      const v = Math.round(from + (value - from) * ease);
      setDisplay(v);
      ref.current = v;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span className="tabular-nums">{display.toLocaleString()}</span>;
}

// ── Section label ────────────────────────────────────────────────────────

const SectionLabel = ({ children }: { children: string }) => (
  <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-primary">{children}</p>
);

// ── Use case data ────────────────────────────────────────────────────────

const USE_CASES = [
  {
    icon: Vote,
    title: "Fair voting",
    short: "One person, one vote, even in DAOs where wallets are free.",
    detail: "In DAOs like MakerDAO, a whale can create 50 wallets and dominate votes. With Pramaana, each DAO member enrolls once. The nullifier per proposal ensures one vote per human. The ZK proof hides which member voted, preserving ballot secrecy.",
  },
  {
    icon: Wallet,
    title: "Private DeFi",
    short: "Access financial services without handing over your passport.",
    detail: "Centralized exchanges require KYC: passport scans that sit in hackable databases. Pramaana lets you prove you're a unique person using your ID as cryptographic entropy, but the exchange never stores your ID. If breached, attackers find only commitment hashes.",
  },
  {
    icon: Bot,
    title: "Bot-free social",
    short: "Prove you're human. Keep your name to yourself.",
    detail: "Twitter's bot problem persists despite $8/month verification. Pramaana gives each person one enrollment. The nullifier per platform means one account per human. The platform never learns your real name.",
  },
  {
    icon: Globe,
    title: "EU Digital Identity",
    short: "Quantum-safe credentials for the EUDI Wallet.",
    detail: "The EU mandates digital identity wallets by 2027, with post-quantum requirements. Pramaana's Kyber-1024 enrollment meets this mandate today. Citizens derive separate pseudonyms for bank, healthcare, and tax, unlinkable by design.",
  },
  {
    icon: Gift,
    title: "Fair airdrops",
    short: "Stop Sybil farmers from taking what's meant for real users.",
    detail: "LayerZero and Starknet lost 30-50% of airdrops to Sybil farmers. With Pramaana, one PII = one commitment = one claim. No centralized Sybil checker needed: the cryptography enforces fairness.",
  },
  {
    icon: Heart,
    title: "Healthcare privacy",
    short: "Your hospital can't see your pharmacy. By design.",
    detail: "With Pramaana, you derive separate pseudonyms for hospital, pharmacy, and insurer. None can cross-reference your records. Within each service, Sybil resistance prevents duplicate patient records.",
  },
];

// ── Comparison data ──────────────────────────────────────────────────────

const COMPARISON_ROWS = [
  { feature: "Stores your PII", vals: ["red", "red", "amber", "green"], labels: ["", "", "", "Never"] },
  { feature: "Tracks across services", vals: ["red", "red", "red", "green"], labels: ["", "", "", "Impossible"] },
  { feature: "Quantum resistant", vals: ["red", "red", "red", "green"], labels: ["", "", "", "Kyber-1024"] },
  { feature: "Sybil resistant", vals: ["amber", "green", "red", "green"], labels: ["", "", "", "Cryptographic"] },
  { feature: "Survives a breach", vals: ["red", "red", "amber", "green"], labels: ["", "", "", "Nothing to leak"] },
];

const DOT_COLORS: Record<string, string> = {
  red: "bg-destructive",
  amber: "bg-amber-500",
  green: "bg-green-500",
};

// ── Main page ────────────────────────────────────────────────────────────

const Index = () => {
  // Stats
  const [identities, setIdentities] = useState(0);
  const [onChain, setOnChain] = useState(0);
  const [sybilBlocked, setSybilBlocked] = useState(0);

  // Use case modal
  const [activeCase, setActiveCase] = useState<number | null>(null);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const carouselTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stepper
  const [expandedStep, setExpandedStep] = useState<string | undefined>(undefined);

  useEffect(() => {
    const load = async () => {
      const [c1, c2] = await Promise.all([
        supabase.from("commitments").select("*", { count: "exact", head: true }),
        supabase.from("commitments").select("*", { count: "exact", head: true }).not("tx_hash", "is", null),
      ]);
      setIdentities(c1.count ?? 0);
      setOnChain(c2.count ?? 0);
      setSybilBlocked(3);
    };
    load();

    const channel = supabase
      .channel("landing-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "commitments" }, () => setIdentities((n) => n + 1))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Carousel auto-advance
  const maxVisible = typeof window !== "undefined" && window.innerWidth < 768 ? 1 : 3;
  const maxIdx = Math.max(0, USE_CASES.length - maxVisible);

  useEffect(() => {
    carouselTimer.current = setInterval(() => {
      setCarouselIdx((i) => (i >= maxIdx ? 0 : i + 1));
    }, 5000);
    return () => { if (carouselTimer.current) clearInterval(carouselTimer.current); };
  }, [maxIdx]);

  const nudgeCarousel = useCallback((dir: -1 | 1) => {
    if (carouselTimer.current) clearInterval(carouselTimer.current);
    setCarouselIdx((i) => Math.max(0, Math.min(maxIdx, i + dir)));
  }, [maxIdx]);

  return (
    <div className="relative overflow-x-hidden">
      {/* Subtle gradient bg */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 40% 20%, hsla(270, 60%, 20%, 0.35), transparent 60%), radial-gradient(ellipse 60% 50% at 75% 80%, hsla(174, 60%, 14%, 0.3), transparent 55%)",
          }}
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 1: HERO
      ═══════════════════════════════════════════════════════════════ */}
      <section className="relative px-6 pt-32 pb-20 lg:pt-48 lg:pb-28">
        <div className="mx-auto max-w-2xl text-center">
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Your identity. Quantum-safe.{" "}
            <span className="text-primary">Invisible.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
            className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground sm:text-xl"
            style={{ textWrap: "pretty" } as React.CSSProperties}
          >
            Prove you're a unique real person to any service, without anyone knowing who you are.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <Button asChild size="lg" className="rounded-full px-8 active:scale-[0.97] transition-transform">
              <Link to="/wallet-connect">
                Scan My Wallet <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="rounded-full border-border/60 px-8 active:scale-[0.97] transition-transform"
              onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            >
              How it works
            </Button>
          </motion.div>
        </div>

        {/* Live stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="mx-auto mt-20 flex max-w-md justify-center gap-10 text-center"
        >
          {[
            { label: "identities enrolled", value: identities },
            { label: "on-chain confirmations", value: onChain },
            { label: "Sybil attacks blocked", value: sybilBlocked },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="font-mono text-3xl font-bold text-foreground">
                <AnimatedNumber value={value} />
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </motion.div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 2: THE PROBLEM
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-4xl">
          <Reveal className="text-center">
            <SectionLabel>THE PROBLEM</SectionLabel>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl" style={{ textWrap: "balance" } as React.CSSProperties}>
              Every time you log in, you leave a trail
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {[
              { icon: Eye, text: "Google sees every service you visit through OAuth" },
              { icon: DatabaseZap, text: "KYC databases get breached. Coinbase 2025 exposed millions." },
              { icon: Link2, text: "Your blockchain wallet links all your activity publicly" },
            ].map(({ icon: Icon, text }, i) => (
              <Reveal key={text} delay={i * 0.1}>
                <Card className="border-[1px] border-white/[0.06] bg-card/50 backdrop-blur-sm">
                  <CardContent className="flex flex-col items-center gap-4 p-7 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10">
                      <Icon className="h-5 w-5 text-destructive" />
                    </div>
                    <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{text}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.3}>
            <p className="mt-10 text-center text-base text-muted-foreground">
              What if you could prove you're real without revealing anything about yourself?
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 3: HOW IT WORKS
      ═══════════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-2xl">
          <Reveal className="text-center">
            <SectionLabel>HOW IT WORKS</SectionLabel>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl" style={{ textWrap: "balance" } as React.CSSProperties}>
              Three steps. One identity. Zero traces.
            </h2>
          </Reveal>

          <Accordion
            type="single"
            collapsible
            value={expandedStep}
            onValueChange={setExpandedStep}
            className="mt-14 space-y-4"
          >
            {[
              {
                value: "step-1",
                num: "01",
                title: "Enroll once",
                collapsed: "Your government ID is used as cryptographic fuel, then permanently destroyed.",
                expanded: "Pramaana takes your PII (government ID + biometric), hashes it with SHA3-512, derives a 64-byte seed through HKDF, and generates a CRYSTALS-Kyber-1024 quantum-safe keypair. The commitment Φ = H(pk ‖ ciphertext) goes on-chain. Your PII is mathematically consumed and cannot be recovered from the commitment by anyone, including quantum computers. This is the PALC.Commit algorithm from the Pramaana paper.",
                badge: "ML-KEM-1024 · SHA3-512 · HKDF · NIST FIPS 203",
              },
              {
                value: "step-2",
                num: "02",
                title: "Register privately",
                collapsed: "Each service gets a unique pseudonym. None of them can be linked.",
                expanded: "When you register with a service, Pramaana derives a child key specific to that service using HKDF(your_random_key, service_name). This becomes a secp256k1 pseudonym for that service. A deterministic nullifier H(master_key ‖ service_name) ensures you can only register once per service (Sybil resistance). But different services get completely different nullifiers, so even if every service in the world colludes, they cannot connect your accounts. This is the ASC.Prove protocol from IACR 2025/618.",
                badge: "Schnorr · secp256k1 · HKDF · Nullifier",
              },
              {
                value: "step-3",
                num: "03",
                title: "Authenticate freely",
                collapsed: "Log in with a signature. No passwords. No tracking.",
                expanded: "Authentication uses standard Schnorr challenge-response. The service sends a random challenge, you sign it with your child key, they verify against your pseudonym. The Identity Registry is never contacted, so there's no timing side-channel for anyone to exploit. This is the U2SSO authentication protocol from Figure 3 of the ASC paper.",
                badge: "Schnorr signatures · Zero IdR interaction · No timing attacks",
              },
            ].map(({ value, num, title, collapsed, expanded, badge }, i) => (
              <Reveal key={value} delay={i * 0.1}>
                <AccordionItem value={value} className="border-[1px] border-white/[0.06] rounded-xl bg-card/50 backdrop-blur-sm px-6 overflow-hidden">
                  <AccordionTrigger className="hover:no-underline py-5 gap-4">
                    <div className="flex items-center gap-4 text-left">
                      <span className="font-mono text-2xl font-bold text-primary/40">{num}</span>
                      <div>
                        <p className="text-base font-semibold text-foreground">{title}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{collapsed}</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 pl-14">
                    <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{expanded}</p>
                    <Badge variant="outline" className="mt-3 border-primary/20 text-[10px] font-mono text-primary/70">
                      {badge}
                    </Badge>
                  </AccordionContent>
                </AccordionItem>
              </Reveal>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 4: WHY PRAMAANA
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-3xl">
          <Reveal className="text-center">
            <SectionLabel>WHY PRAMAANA</SectionLabel>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl" style={{ textWrap: "balance" } as React.CSSProperties}>
              Not just another identity solution
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, name: "Quantum-safe", desc: "Protected by lattice cryptography that quantum computers can't break." },
              { icon: EyeOff, name: "Truly private", desc: "Your personal data is consumed during enrollment and permanently erased." },
              { icon: Fingerprint, name: "Sybil-resistant", desc: "One real person = one identity. The math prevents duplicates." },
              { icon: Unlink, name: "Unlinkable", desc: "Services cannot determine if two accounts belong to the same person." },
            ].map(({ icon: Icon, name, desc }, i) => (
              <Reveal key={name} delay={i * 0.08}>
                <Card className="border-[1px] border-white/[0.06] bg-card/50 backdrop-blur-sm h-full">
                  <CardContent className="flex items-start gap-4 p-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground sm:text-base">{name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.35}>
            <p className="mt-8 text-center">
              <button
                onClick={() => document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth" })}
                className="text-sm text-primary hover:underline underline-offset-4 transition-colors"
              >
                See how we compare →
              </button>
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 5: USE CASES (carousel)
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-5xl">
          <Reveal className="text-center">
            <SectionLabel>USE CASES</SectionLabel>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl">Built for real problems</h2>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="relative mt-14">
              {/* Navigation arrows */}
              <button
                onClick={() => nudgeCarousel(-1)}
                disabled={carouselIdx === 0}
                className="absolute -left-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/40 bg-card/80 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 hidden md:block"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => nudgeCarousel(1)}
                disabled={carouselIdx >= maxIdx}
                className="absolute -right-4 top-1/2 z-10 -translate-y-1/2 rounded-full border border-border/40 bg-card/80 p-2 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30 hidden md:block"
              >
                <ChevronRight className="h-4 w-4" />
              </button>

              <div className="overflow-hidden">
                <motion.div
                  className="flex gap-5"
                  animate={{ x: `-${carouselIdx * (100 / maxVisible + 5 / maxVisible)}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                >
                  {USE_CASES.map(({ icon: Icon, title, short }, i) => (
                    <button
                      key={title}
                      onClick={() => setActiveCase(i)}
                      className={cn(
                        "shrink-0 text-left rounded-xl border border-white/[0.06] bg-card/50 backdrop-blur-sm p-6 transition-all hover:border-primary/20 hover:shadow-lg hover:shadow-primary/5",
                        maxVisible === 1 ? "w-full" : "w-[calc(33.333%-14px)]"
                      )}
                    >
                      <Icon className="h-5 w-5 text-secondary mb-3" />
                      <p className="text-sm font-semibold text-foreground sm:text-base">{title}</p>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{short}</p>
                    </button>
                  ))}
                </motion.div>
              </div>

              {/* Dots */}
              <div className="mt-6 flex justify-center gap-1.5">
                {Array.from({ length: maxIdx + 1 }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => { if (carouselTimer.current) clearInterval(carouselTimer.current); setCarouselIdx(i); }}
                    className={cn("h-1.5 rounded-full transition-all", i === carouselIdx ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30")}
                  />
                ))}
              </div>
            </div>
          </Reveal>

          {/* Use case modal */}
          <Dialog open={activeCase !== null} onOpenChange={() => setActiveCase(null)}>
            {activeCase !== null && (
              <DialogContent className="border-white/[0.06] bg-card/95 backdrop-blur-xl max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-foreground">
                    {(() => { const Icon = USE_CASES[activeCase].icon; return <Icon className="h-5 w-5 text-secondary" />; })()}
                    {USE_CASES[activeCase].title}
                  </DialogTitle>
                  <DialogDescription className="text-sm leading-relaxed text-muted-foreground pt-2 sm:text-base">
                    {USE_CASES[activeCase].detail}
                  </DialogDescription>
                </DialogHeader>
              </DialogContent>
            )}
          </Dialog>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 6: WALLET SCANNER TEASER
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <Reveal className="mx-auto max-w-3xl">
          <Card className="border-[1px] border-primary/20 bg-card/50 backdrop-blur-sm overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
            <CardContent className="relative flex flex-col items-center gap-5 p-10 text-center">
              <Wallet className="h-8 w-8 text-primary" />
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl">Is your wallet quantum-safe?</h2>
              <p className="max-w-lg text-base text-muted-foreground">
                Connect MetaMask or paste any address. We'll analyze your quantum exposure, Sybil vulnerability,
                and transaction threat patterns in seconds.
              </p>
              <Button asChild size="lg" className="rounded-full px-8 mt-2 active:scale-[0.97] transition-transform">
                <Link to="/wallet-connect">
                  Scan My Wallet <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <p className="text-xs text-muted-foreground/60">Works with any Ethereum address. No connection required.</p>
            </CardContent>
          </Card>
        </Reveal>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 7: AI AGENT TEASER
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl">
          <Card className="border-[1px] border-white/[0.06] bg-card/50 backdrop-blur-sm overflow-hidden">
            <CardContent className="p-8 space-y-5">
              <div className="flex items-center gap-2 text-base font-semibold text-foreground">
                <MessageSquare className="h-4 w-4 text-secondary" />
                Pramaana Agent
              </div>

              {/* Mock chat */}
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="rounded-xl rounded-tl-none border border-border/40 bg-muted/30 px-4 py-2.5 text-sm text-foreground">
                    Is my Bitcoin wallet safe from quantum computers?
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div className="rounded-xl rounded-tl-none border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm text-muted-foreground leading-relaxed">
                    Your address bc1q... has sent 23 transactions, exposing your ECDSA public key each time. Current risk: <span className="font-semibold text-destructive">HIGH</span>. I can help you create a quantum-safe Pramaana identity and plan a migration to BIP-360 compatible addresses.
                  </div>
                </div>
              </div>

              <Button asChild variant="outline" className="w-full rounded-full active:scale-[0.97] transition-transform">
                <Link to="/agent">
                  Talk to the Pramaana Agent <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <p className="text-xs text-center text-muted-foreground/60">AI-powered identity management.</p>
            </CardContent>
          </Card>
        </Reveal>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 8: COMPARISON TABLE
      ═══════════════════════════════════════════════════════════════ */}
      <section id="comparison" className="px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-4xl">
          <Reveal className="text-center">
            <SectionLabel>COMPARISON</SectionLabel>
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl lg:text-5xl">How Pramaana compares</h2>
          </Reveal>

          <Reveal delay={0.15}>
            <div className="mt-14 overflow-x-auto rounded-xl border border-white/[0.06] bg-card/50 backdrop-blur-sm">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-muted-foreground text-sm" />
                    <TableHead className="text-muted-foreground text-sm text-center">Google OAuth</TableHead>
                    <TableHead className="text-muted-foreground text-sm text-center">KYC / Aadhaar</TableHead>
                    <TableHead className="text-muted-foreground text-sm text-center">Web3 DID</TableHead>
                    <TableHead className="text-primary text-sm font-semibold text-center">Pramaana</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {COMPARISON_ROWS.map(({ feature, vals, labels }) => (
                    <TableRow key={feature} className="border-border/20">
                      <TableCell className="text-sm font-medium text-foreground">{feature}</TableCell>
                      {vals.map((color, i) => (
                        <TableCell key={i} className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT_COLORS[color])} />
                            {labels[i] && <span className="text-xs text-green-400">{labels[i]}</span>}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground/60">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1 align-middle" /> Safe
              <span className="inline-block h-2 w-2 rounded-full bg-destructive ml-3 mr-1 align-middle" /> Vulnerable
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 ml-3 mr-1 align-middle" /> Partial
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 9: TECH STACK (collapsed)
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <Reveal className="mx-auto max-w-3xl">
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="tech" className="border-[1px] border-white/[0.06] rounded-xl bg-card/50 backdrop-blur-sm px-6 overflow-hidden">
              <AccordionTrigger className="text-base font-semibold text-foreground hover:no-underline py-5">
                Built with peer-reviewed cryptography
              </AccordionTrigger>
              <AccordionContent className="pb-6 space-y-5">
                <div>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Cryptographic Stack</p>
                  <div className="flex flex-wrap gap-2">
                    {["ML-KEM-1024", "SHA3-512", "HKDF (RFC 5869)", "Schnorr / secp256k1", "Merkle proofs", "Ethereum Sepolia"].map((t) => (
                      <Badge key={t} variant="outline" className="border-primary/20 text-xs font-mono text-muted-foreground">{t}</Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-3">
                  <p className="text-xs uppercase tracking-widest text-muted-foreground">Research Foundation</p>
                  <div className="space-y-2">
                    <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                      <p className="text-sm font-medium text-foreground">Pramaana (Dasika, Columbia/SEAS)</p>
                      <p className="text-sm text-muted-foreground">Post-quantum enrollment using Kyber-1024 lattice commitments</p>
                    </div>
                    <div className="rounded-lg border border-border/30 bg-muted/10 p-3">
                      <p className="text-sm font-medium text-foreground">Anonymous Self-Credentials (Alupotha et al., IACR 2025/618)</p>
                      <p className="text-sm text-muted-foreground">Sybil-resistant anonymous credentials without trusted identity providers</p>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Reveal>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          SECTION 10: FOOTER CTA
      ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20 lg:py-28">
        <Reveal className="mx-auto max-w-2xl">
          <Card className="border-[1px] border-white/[0.06] bg-card/60 backdrop-blur-sm">
            <CardContent className="flex flex-col items-center gap-6 p-10 text-center">
              <h2 className="text-2xl font-bold text-foreground sm:text-3xl lg:text-4xl" style={{ textWrap: "balance" } as React.CSSProperties}>
                One enrollment. Every service. Zero tracking.
              </h2>
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="rounded-full px-8 active:scale-[0.97] transition-transform">
                  <Link to="/enroll">
                    Start Enrollment <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg" className="rounded-full px-8 border-border/60 active:scale-[0.97] transition-transform">
                  <Link to="/about">Read the Paper</Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground/50">
                Built for Shape Rotator Hackathon 2026 · IC3 + FlashbotsX + Encode Club
              </p>
            </CardContent>
          </Card>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/30 px-6 py-12">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link to="/enroll" className="transition-colors hover:text-foreground">Enrollment</Link>
            <Link to="/register-service" className="transition-colors hover:text-foreground">Register</Link>
            <Link to="/verify" className="transition-colors hover:text-foreground">Verify</Link>
            <Link to="/dashboard" className="transition-colors hover:text-foreground">Dashboard</Link>
            <Link to="/about" className="transition-colors hover:text-foreground">About</Link>
          </div>
          <p className="text-sm text-muted-foreground/50">Quantum-safe identity for the post-quantum world.</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
