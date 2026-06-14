import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { pramaana, type RegistryFeedEntry } from "@/lib/pramaana-client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Search, SendHorizonal, FileCode2, Activity, Info, ShieldCheck, ShieldAlert,
  Hash, ExternalLink, Loader2, XCircle, Link as LinkIcon,
} from "lucide-react";

const CONTRACT_ADDRESS = "0x898665968B841e241dB19A111e76ECeA20342b86";
const CHAIN_ID = 11155111;
const EXPLORER = "https://sepolia.etherscan.io";

const SOLIDITY_CODE = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract PramaanaIdR {
    struct Identity {
        bytes32 phiHash;
        uint256 commitSize;
        bool active;
        uint256 registeredAt;
    }

    Identity[] public identities;
    mapping(bytes32 => bool) public registered;
    mapping(bytes32 => uint256) public idIndex;

    uint256 public currentSetId;
    uint256 public setCapacity;
    uint256 public currentSetCount;

    event IdentityRegistered(bytes32 indexed phiHash, uint256 setId, uint256 setIndex, uint256 timestamp);
    event SybilRejected(bytes32 indexed phiHash, uint256 timestamp);
    event AnonymitySetReady(uint256 setId, uint256 size);

    constructor(uint256 _setCapacity) {
        setCapacity = _setCapacity;
        currentSetId = 1;
        currentSetCount = 0;
    }

    function register(bytes32 _phiHash, uint256 _commitSize) external returns (uint256) {
        if (registered[_phiHash]) {
            emit SybilRejected(_phiHash, block.timestamp);
            revert("Sybil: identity already registered");
        }
        identities.push(Identity(_phiHash, _commitSize, true, block.timestamp));
        registered[_phiHash] = true;
        idIndex[_phiHash] = identities.length - 1;

        uint256 setIndex = currentSetCount;
        currentSetCount++;
        emit IdentityRegistered(_phiHash, currentSetId, setIndex, block.timestamp);

        if (currentSetCount >= setCapacity) {
            emit AnonymitySetReady(currentSetId, currentSetCount);
            currentSetId++;
            currentSetCount = 0;
        }
        return identities.length - 1;
    }

    function isRegistered(bytes32 _phiHash) external view returns (bool) {
        return registered[_phiHash];
    }

    function getIdentity(uint256 _index) external view returns (bytes32, uint256, bool, uint256) {
        Identity storage id = identities[_index];
        return (id.phiHash, id.commitSize, id.active, id.registeredAt);
    }

    function getTotalIdentities() external view returns (uint256) {
        return identities.length;
    }

    function getCurrentSetInfo() external view returns (uint256, uint256, uint256) {
        return (currentSetId, currentSetCount, setCapacity);
    }
}`;

// Per-Φ lookup result for the isRegistered() panel.
interface CheckResult {
  found: boolean;
  hash: string;
  setIndex: number | null;
  txHash: string | null;
  blockNumber: number | null;
}

// Minimal Solidity syntax highlighter
const SolidityHighlighted = ({ code }: { code: string }) => {
  const highlightLine = (line: string) => {
    const parts: { text: string; cls: string }[] = [];
    let lastIndex = 0;
    const combined = new RegExp(
      `(\/\/.*$)|(".*?")|\\b(pragma|solidity|contract|struct|mapping|uint256|uint|bytes32|bool|public|external|view|returns|require|revert|true|false|event|function|indexed|emit|if|constructor|return|storage)\\b`,
      "g"
    );
    let match: RegExpExecArray | null;
    while ((match = combined.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ text: line.slice(lastIndex, match.index), cls: "text-foreground/70" });
      }
      const text = match[0];
      let cls = "text-foreground/70";
      if (/^\/\//.test(text)) cls = "text-muted-foreground/60 italic";
      else if (/^"/.test(text)) cls = "text-amber-400";
      else if (/^(uint256|uint|bytes32|bool|true|false|storage)$/.test(text)) cls = "text-teal-400";
      else cls = "text-primary";
      parts.push({ text, cls });
      lastIndex = match.index + text.length;
    }
    if (lastIndex < line.length) {
      parts.push({ text: line.slice(lastIndex), cls: "text-foreground/70" });
    }
    return parts.length ? parts : [{ text: line, cls: "text-foreground/70" }];
  };

  return (
    <pre className="overflow-x-auto rounded-lg border border-border/50 bg-muted/20 p-5 font-mono text-[13px] leading-relaxed">
      <code>
        {code.split("\n").map((line, i) => (
          <div key={i} className="flex">
            <span className="mr-5 inline-block w-6 select-none text-right text-muted-foreground/30 tabular-nums">
              {i + 1}
            </span>
            <span>
              {highlightLine(line).map((part, j) => (
                <span key={j} className={part.cls}>{part.text}</span>
              ))}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
};

const OnChain = () => {
  const [checkHash, setCheckHash] = useState("");
  const [totalIdentities, setTotalIdentities] = useState(0);
  const [events, setEvents] = useState<RegistryFeedEntry[]>([]);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Real on-chain registry: total from stats, recent Registered events from the
  // feed (C4). Polled every few seconds since realtime is gone.
  const fetchData = useCallback(async () => {
    try {
      const [stats, feed] = await Promise.all([
        pramaana.registryStats(),
        pramaana.registryFeed(20),
      ]);
      setTotalIdentities(stats.total);
      setEvents(feed);
      setFeedError(null);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : "Backend not reachable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 4000);
    return () => clearInterval(id);
  }, [fetchData]);

  // isRegistered(bytes32) — per-Φ on-chain lookup (C4). The input is the 64-byte
  // Φ hex from enrollment; the backend hashes it to the on-chain key.
  const handleCheck = async () => {
    const hash = checkHash.trim();
    if (!hash) return;
    setChecking(true);
    try {
      const r = await pramaana.registryLookup(hash);
      setCheckResult({
        found: r.registered,
        hash,
        setIndex: r.setIndex,
        txHash: r.txHash,
        blockNumber: r.blockNumber,
      });
    } catch (e) {
      toast.error("Lookup failed", { description: e instanceof Error ? e.message : "Backend not reachable" });
    }
    setChecking(false);
  };

  const shortHash = (h: string) => h.slice(0, 10) + "…" + h.slice(-6);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16 space-y-10">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            On-Chain Identity Registry (IdR)
          </h1>
          <Badge variant="outline" className="text-xs font-mono border-amber-500/40 text-amber-400">
            Sepolia
          </Badge>
        </div>
        <p className="text-muted-foreground">
          Ethereum Sepolia Smart Contract — Real on-chain identity registration
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <a
            href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-foreground transition-colors"
          >
            <LinkIcon className="h-3 w-3" />
            <span className="font-mono">{CONTRACT_ADDRESS.slice(0, 6)}…{CONTRACT_ADDRESS.slice(-4)}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
          <span>Chain ID: {CHAIN_ID}</span>
        </div>
      </div>

      {/* Contract Code */}
      <Card className="border-border/50 bg-card/80 backdrop-blur overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">PramaanaIdR.sol</CardTitle>
            <Badge variant="secondary" className="ml-auto text-[10px] font-mono">Solidity ^0.8.24</Badge>
          </div>
          <CardDescription className="text-xs">
            On-chain novelty-check identity registry with anonymity set management
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <SolidityHighlighted code={SOLIDITY_CODE} />
        </CardContent>
      </Card>

      {/* Interactive Panel */}
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <Activity className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Contract Interaction</CardTitle>
          </div>
          <CardDescription>
            Register identities on Sepolia and query registration status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Total counter */}
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Registered Identities</span>
            </div>
            <span className="font-mono text-2xl font-bold text-foreground tabular-nums">
              {totalIdentities}
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Register Identity — registration is NOT a standalone action: Φ is
                derived inside the enrollment TEE and registered there. Disabled,
                with a pointer to /enroll (no fabricated register endpoint). */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">register(bytes32, uint256)</Label>
              <p className="text-xs text-muted-foreground">
                Registration happens automatically inside enrollment — Φ is derived
                in the TEE, so there's no standalone register for an external hash.
              </p>
              <div className="flex gap-2">
                <Input
                  value=""
                  disabled
                  placeholder="Registered during enrollment"
                  className="bg-muted/30 font-mono text-xs"
                />
                <Button disabled size="icon" className="shrink-0">
                  <SendHorizonal className="h-4 w-4" />
                </Button>
              </div>
              <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
                <Link to="/enroll">
                  Enroll to register <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </div>

            {/* Check Registration */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">isRegistered(bytes32)</Label>
              <p className="text-xs text-muted-foreground">
                Check if an identity is registered on-chain.
              </p>
              <div className="flex gap-2">
                <Input
                  value={checkHash}
                  onChange={(e) => setCheckHash(e.target.value)}
                  placeholder="Enter φ hash..."
                  className="bg-muted/30 font-mono text-xs"
                />
                <Button
                  onClick={handleCheck}
                  disabled={!checkHash.trim() || checking}
                  variant="secondary"
                  size="icon"
                  className="shrink-0"
                >
                  {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {checkResult && (
                <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                  {checkResult.found ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-green-400">
                        Registered{checkResult.setIndex != null ? ` · Λ_1 #${checkResult.setIndex}` : ""}
                      </span>
                      {checkResult.txHash && (
                        <span className="ml-auto font-mono text-xs text-muted-foreground">
                          {shortHash(checkResult.txHash)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Not registered</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          <Separator className="bg-border/30" />

          {/* Event Log */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Transaction Log</Label>
            <ScrollArea className="h-64 rounded-lg border border-border/50 bg-muted/10">
              {loading ? (
                <div className="flex h-full items-center justify-center p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
                </div>
              ) : feedError ? (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <p className="text-xs text-destructive/80">
                    Couldn't load the registry feed: {feedError}. Start the backend (make demo).
                  </p>
                </div>
              ) : events.length === 0 ? (
                <div className="flex h-full items-center justify-center p-8">
                  <p className="text-xs text-muted-foreground/50">
                    No identities registered yet — enroll one to populate the feed.
                  </p>
                </div>
              ) : (
                <div className="p-3 space-y-1.5">
                  {events.map((evt) => (
                    <div
                      key={evt.phi}
                      className="flex items-center gap-3 rounded-md px-3 py-2.5 font-mono text-xs"
                    >
                      <Badge variant="default" className="shrink-0 text-[10px] px-2 py-0.5">
                        ✓ mined
                      </Badge>
                      <span className="text-green-400/80">IdentityRegistered</span>
                      <span className="text-muted-foreground/60 hidden sm:inline">
                        {shortHash(evt.phi)}
                      </span>
                      <span className="text-muted-foreground/50 hidden md:inline">
                        Λ_1 #{evt.setIndex}
                      </span>
                      <span className="ml-auto flex items-center gap-1 text-muted-foreground/50">
                        <span className="hidden sm:inline">{shortHash(evt.txHash)}</span>
                      </span>
                      <span className="text-muted-foreground/40 shrink-0">
                        blk #{evt.blockNumber}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Info Note */}
      <Alert className="border-amber-500/20 bg-amber-500/5">
        <Info className="h-4 w-4 text-amber-400" />
        <AlertDescription className="text-xs text-muted-foreground leading-relaxed">
          This page interacts with the real <strong>PramaanaIdR</strong> contract on Ethereum Sepolia
          (Chain ID {CHAIN_ID}). Transactions are confirmed on-chain and visible on{" "}
          <a
            href={`${EXPLORER}/address/${CONTRACT_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:underline"
          >
            Etherscan
          </a>
          . The contract mirrors the PostgreSQL IdR for redundancy.
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default OnChain;
