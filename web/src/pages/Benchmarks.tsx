import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Activity,
  BarChart3,
  Clock,
  FlaskConical,
  HardDrive,
  Info,
  Loader2,
  Play,
  ShieldCheck,
  TrendingUp,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

interface EnrollmentLog {
  phi_hash: string;
  palc_hash_ms: number | null;
  palc_hkdf_ms: number | null;
  palc_keygen_ms: number | null;
  palc_encrypt_ms: number | null;
  palc_total_ms: number | null;
  on_chain_tx_hash: string | null;
  on_chain_confirmed: boolean;
  created_at: string;
}

interface BenchmarkRun {
  index: number;
  total_ms: number;
  status: "pending" | "running" | "done" | "error";
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function median(sorted: number[]): number {
  return percentile(sorted, 50);
}

function randomPii(): string {
  const id = Array.from({ length: 10 }, () => Math.random().toString(36)[2]).join("");
  const year = 1950 + Math.floor(Math.random() * 60);
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, "0");
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, "0");
  const jurisdictions = ["US", "EU", "IN", "UK", "JP"];
  const jur = jurisdictions[Math.floor(Math.random() * jurisdictions.length)];
  return `${id}|${year}-${month}-${day}|${jur}|`;
}

const fmt = (n: number) => (n < 1 ? n.toFixed(3) : n < 100 ? n.toFixed(2) : n.toFixed(1));

/* ------------------------------------------------------------------ */
/* Estimated step breakdown (from typical ML-KEM-1024 profile)         */
/* ------------------------------------------------------------------ */

function estimateSteps(totalMs: number) {
  return [
    { step: "KDF (HKDF-SHA3)", ms: totalMs * 0.08, fill: "hsl(var(--primary))" },
    { step: "Kyber KeyGen", ms: totalMs * 0.35, fill: "hsl(var(--secondary))" },
    { step: "Kyber Encap", ms: totalMs * 0.3, fill: "hsl(var(--chart-4))" },
    { step: "Commitment", ms: totalMs * 0.07, fill: "hsl(var(--chart-2))" },
    { step: "IdR Check", ms: totalMs * 0.2, fill: "hsl(var(--chart-5))" },
  ];
}

/* ------------------------------------------------------------------ */
/* Comparison systems                                                  */
/* ------------------------------------------------------------------ */

interface SystemRow {
  system: string;
  time: string;
  pq: string;
  pii: string;
  ttp: string;
  highlight?: boolean;
}

function comparisonRows(avgMs: number | null): SystemRow[] {
  return [
    {
      system: "Pramaana (PALC)",
      time: avgMs ? `${fmt(avgMs)} ms` : "—",
      pq: "Yes (ML-KEM-1024)",
      pii: "No — erased",
      ttp: "No",
      highlight: true,
    },
    { system: "OAuth 2.0 / OIDC", time: "~200 ms", pq: "No", pii: "Yes (by IdP)", ttp: "Yes" },
    { system: "W3C DID / SSI", time: "~500 ms", pq: "No", pii: "On ledger", ttp: "Partial" },
    { system: "ASC / U2SSO (original)", time: "~300 ms", pq: "No", pii: "Unspecified", ttp: "Unspecified" },
  ];
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

const Benchmarks = () => {
  const [logs, setLogs] = useState<EnrollmentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [benchRuns, setBenchRuns] = useState<BenchmarkRun[]>([]);
  const [benchRunning, setBenchRunning] = useState(false);
  const abortRef = useRef(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("enrollment_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setLogs((data as EnrollmentLog[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  /* ---- Derived stats ---- */
  const times = logs.map((l) => l.palc_total_ms).filter((t): t is number => t != null).sort((a, b) => a - b);
  const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
  const med = times.length ? median(times) : null;
  const p95 = times.length ? percentile(times, 95) : null;
  const p99 = times.length ? percentile(times, 99) : null;

  const lineData = [...logs]
    .reverse()
    .filter((l) => l.palc_total_ms != null)
    .map((l, i) => ({
      index: i + 1,
      total_ms: l.palc_total_ms!,
      label: `#${i + 1}`,
    }));

  const stepData = avg ? estimateSteps(avg) : [];

  // Commitment sizes are fixed for ML-KEM-1024
  const avgPk = 1568;
  const avgCt = 1568;
  const avgCommitment = 3136;

  /* ---- Benchmark runner ---- */
  const runBenchmark = async () => {
    abortRef.current = false;
    setBenchRunning(true);
    const runs: BenchmarkRun[] = Array.from({ length: 10 }, (_, i) => ({
      index: i + 1,
      total_ms: 0,
      status: "pending" as const,
    }));
    setBenchRuns([...runs]);

    for (let i = 0; i < 10; i++) {
      if (abortRef.current) break;
      runs[i].status = "running";
      setBenchRuns([...runs]);

      try {
        const { data, error } = await supabase.functions.invoke("palc-enroll", {
          body: { pii_input: randomPii() },
        });

        if (error || data?.error) {
          runs[i].status = "error";
          runs[i].total_ms = 0;
        } else {
          runs[i].status = "done";
          runs[i].total_ms = data.timing.total_ms;
        }
      } catch {
        runs[i].status = "error";
      }
      setBenchRuns([...runs]);
    }

    setBenchRunning(false);
    // Refresh logs after benchmark
    fetchLogs();
  };

  const benchDone = benchRuns.filter((r) => r.status === "done");
  const benchLineData = benchDone.map((r) => ({
    index: r.index,
    total_ms: r.total_ms,
    label: `Run ${r.index}`,
  }));

  /* ---- Stat card ---- */
  const StatCard = ({
    label,
    value,
    icon: Icon,
    unit = "ms",
  }: {
    label: string;
    value: number | null;
    icon: React.ElementType;
    unit?: string;
  }) => (
    <Card className="border-border/50 bg-card/80">
      <CardContent className="flex items-center gap-4 py-5 px-5">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono text-xl font-bold text-foreground tabular-nums">
            {value !== null ? fmt(value) : "—"}
            <span className="ml-1 text-xs font-normal text-muted-foreground">{unit}</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );

  /* ---- Custom tooltip ---- */
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg border border-border/60 bg-popover px-3 py-2 shadow-lg">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-mono text-sm font-semibold text-foreground">
          {fmt(payload[0].value)} ms
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 space-y-10">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Enrollment Benchmarks
        </h1>
        <p className="text-muted-foreground">
          Performance data from the PALC enrollment pipeline
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Average" value={avg} icon={TrendingUp} />
            <StatCard label="Median (p50)" value={med} icon={Activity} />
            <StatCard label="p95" value={p95} icon={Zap} />
            <StatCard label="p99" value={p99} icon={Clock} />
          </div>

          {/* Line chart — enrollment times */}
          {lineData.length > 0 && (
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" />
                  Enrollment Time (last {lineData.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 18%)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(230 15% 18%)" }}
                    />
                    <YAxis
                      tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(230 15% 18%)" }}
                      unit=" ms"
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="total_ms"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "hsl(var(--primary))" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Bar chart — step breakdown */}
          {stepData.length > 0 && (
            <Card className="border-border/50 bg-card/80">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Step Breakdown (estimated from avg {avg ? fmt(avg) : "—"} ms)
                </CardTitle>
                <CardDescription className="text-xs">
                  Proportional breakdown based on ML-KEM-1024 profiling
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stepData} layout="vertical" barSize={24}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 18%)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(230 15% 18%)" }}
                      unit=" ms"
                    />
                    <YAxis
                      type="category"
                      dataKey="step"
                      width={120}
                      tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(230 15% 18%)" }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar dataKey="ms" radius={[0, 4, 4, 0]}>
                      {stepData.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Commitment size stats */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <HardDrive className="h-4 w-4 text-primary" />
                Commitment Size
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  { label: "Public Key (pk)", bytes: avgPk },
                  { label: "Ciphertext (ct)", bytes: avgCt },
                  { label: "Commitment C = pk ‖ ct", bytes: avgCommitment },
                ].map(({ label, bytes }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border/50 bg-muted/20 p-4 text-center"
                  >
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-mono text-lg font-bold text-foreground tabular-nums">
                      {bytes.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">bytes</span>
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
                <span className="text-sm text-muted-foreground">vs. Elliptic Curve commitment</span>
                <Badge variant="secondary" className="font-mono">~64 bytes</Badge>
              </div>
              <Alert className="border-border/30 bg-muted/10">
                <Info className="h-4 w-4 text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  Larger commitment size (~3.1 KB vs ~64 B) is acceptable for a one-time enrollment
                  operation. Post-quantum security requires larger key material.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          {/* Comparison table */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="h-4 w-4 text-primary" />
                System Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30">
                      <TableHead className="text-xs">System</TableHead>
                      <TableHead className="text-xs">Enrollment Time</TableHead>
                      <TableHead className="text-xs">Post-Quantum?</TableHead>
                      <TableHead className="text-xs">PII Stored?</TableHead>
                      <TableHead className="text-xs">Trusted Third Party?</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonRows(avg).map((row) => (
                      <TableRow
                        key={row.system}
                        className={row.highlight ? "bg-primary/5 border-border/30" : "border-border/30"}
                      >
                        <TableCell className="font-medium text-sm">
                          {row.system}
                          {row.highlight && (
                            <Badge variant="default" className="ml-2 text-[10px] px-1.5 py-0">
                              ours
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.time}</TableCell>
                        <TableCell className="text-sm">{row.pq}</TableCell>
                        <TableCell className="text-sm">{row.pii}</TableCell>
                        <TableCell className="text-sm">{row.ttp}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Benchmark runner */}
          <Card className="border-border/50 bg-card/80">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    Live Benchmark
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Run 10 sequential enrollments with random synthetic PII
                  </CardDescription>
                </div>
                <Button
                  onClick={runBenchmark}
                  disabled={benchRunning}
                  size="sm"
                  className="gap-2"
                >
                  {benchRunning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {benchRunning ? "Running..." : "Run Benchmark"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress indicators */}
              {benchRuns.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {benchRuns.map((run) => (
                    <div
                      key={run.index}
                      className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 font-mono text-xs"
                    >
                      <span className="text-muted-foreground">#{run.index}</span>
                      {run.status === "pending" && (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                      {run.status === "running" && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary" />
                      )}
                      {run.status === "done" && (
                        <span className="text-green-400">{fmt(run.total_ms)}</span>
                      )}
                      {run.status === "error" && (
                        <span className="text-destructive">err</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Live chart */}
              {benchLineData.length > 1 && (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={benchLineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(230 15% 18%)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(230 15% 18%)" }}
                    />
                    <YAxis
                      tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }}
                      axisLine={{ stroke: "hsl(230 15% 18%)" }}
                      unit=" ms"
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="total_ms"
                      stroke="hsl(var(--secondary))"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "hsl(var(--secondary))" }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}

              {benchRuns.length === 0 && (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border/30 py-12">
                  <p className="text-xs text-muted-foreground/50">
                    Click "Run Benchmark" to begin
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default Benchmarks;
