/**
 * VerificationBadge (S3 — the bounty core).
 *
 * Type any ENS name; this reads its public `pramaana.phi` record and cross-checks
 * it against the live on-chain Registry (see src/lib/ens-verify.ts). It renders
 * "Verified human · Sybil-resistant ✓" ONLY on a confirmed match, and never
 * reveals the underlying identity (the verified state carries no Φ).
 *
 * Graceful degradation: if the Registry backend (:8080) is unreachable, it shows
 * the resolved record and labels the check "registry check unavailable" rather
 * than failing. All reads are live (mainnet ENS + chain-backed Registry); no
 * names, addresses, or Φ values are hard-coded.
 */
import { useState } from "react";
import { verifyEns, type EnsVerification } from "@/lib/ens-verify";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { BadgeCheck, Loader2, Search, ShieldQuestion, ShieldX, WifiOff } from "lucide-react";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: EnsVerification }
  | { status: "error"; message: string };

/** First-10 … last-6 — matches the app's hash display convention. */
const shortHex = (h: string) => (h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h);

/** Render exactly one verification state. The `verified` branch shows no Φ. */
function ResultView({ result }: { result: EnsVerification }) {
  switch (result.status) {
    case "verified":
      return (
        <Alert className="border-green-500/30 bg-green-500/5">
          <BadgeCheck className="h-4 w-4 text-green-500" />
          <AlertTitle className="text-green-400">Verified human · Sybil-resistant ✓</AlertTitle>
          <AlertDescription className="text-sm text-green-200/70">
            <span className="font-mono text-foreground">{result.name}</span> is bound to a unique
            on-chain Pramaana identity. No identity details are revealed — only that this name
            belongs to one verified, non-duplicable human.
          </AlertDescription>
        </Alert>
      );
    case "unregistered":
      return (
        <Alert className="border-red-500/30 bg-red-500/5">
          <ShieldX className="h-4 w-4 text-red-500" />
          <AlertTitle className="text-red-400">Not verified</AlertTitle>
          <AlertDescription className="text-sm text-red-200/70">
            <span className="font-mono text-foreground">{result.name}</span> published a{" "}
            <code className="text-foreground">pramaana.phi</code> record, but that Φ is not
            registered on-chain — it does not correspond to an enrolled human.
          </AlertDescription>
        </Alert>
      );
    case "no-record":
      return (
        <Alert className="border-border/50 bg-muted/20">
          <ShieldQuestion className="h-4 w-4 text-muted-foreground" />
          <AlertTitle className="text-foreground">No Pramaana identity</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            <span className="font-mono">{result.name}</span> has no{" "}
            <code>pramaana.phi</code> text record, so there is nothing to verify against the
            Registry.
          </AlertDescription>
        </Alert>
      );
    case "registry-unavailable":
      return (
        <Alert className="border-amber-500/30 bg-amber-500/5">
          <WifiOff className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-amber-300">Registry check unavailable</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Resolved <code className="text-foreground">pramaana.phi</code> for{" "}
            <span className="font-mono text-foreground">{result.name}</span>:{" "}
            <span className="font-mono text-foreground">{shortHex(result.phi)}</span>. The on-chain
            Registry could not be reached, so this Φ could not be confirmed.
          </AlertDescription>
        </Alert>
      );
  }
}

export function VerificationBadge() {
  const [name, setName] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const onVerify = async () => {
    const n = name.trim();
    if (!n) return;
    setState({ status: "loading" });
    try {
      // verifyEns returns Registry-down as a state, so this catch only fires when
      // the ENS read itself fails (e.g. the mainnet RPC is unreachable).
      setState({ status: "done", result: await verifyEns(n) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : "ENS lookup failed" });
    }
  };

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg text-foreground">
          <BadgeCheck className="h-5 w-5 text-primary" />
          Verify a Human by ENS Name
        </CardTitle>
        <CardDescription>
          Resolve any ENS name's <code>pramaana.phi</code> record and confirm it against the live
          on-chain Registry — proof of unique personhood, with zero identity disclosure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onVerify();
            }}
            placeholder="alice.eth"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="bg-muted/30 font-mono text-sm"
          />
          <Button onClick={onVerify} disabled={!name.trim() || state.status === "loading"}>
            {state.status === "loading" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span className="ml-1.5">Verify</span>
          </Button>
        </div>

        {state.status === "done" && <ResultView result={state.result} />}
        {state.status === "error" && (
          <Alert variant="destructive">
            <AlertTitle>ENS lookup failed</AlertTitle>
            <AlertDescription className="text-sm">{state.message}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
