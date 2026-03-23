import { useState, useRef, useEffect } from "react";

interface PipelineNode {
  id: string;
  label: string;
  color: "teal" | "purple" | "amber";
  detail: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const NODES: PipelineNode[] = [
  {
    id: "user",
    label: "User",
    color: "teal",
    detail:
      "The enrolling individual. Submits government ID, date of birth, jurisdiction, and an optional biometric hash. PII never leaves the secure enclave.",
    x: 0,
    y: 0,
    width: 120,
    height: 56,
  },
  {
    id: "pii",
    label: "PII Input",
    color: "teal",
    detail:
      "Raw personally-identifiable information concatenated into a canonical string: govId | dob | jurisdiction | biometricHash.",
    x: 170,
    y: 0,
    width: 120,
    height: 56,
  },
  {
    id: "tee",
    label: "TEE Enclave",
    color: "purple",
    detail:
      "Trusted Execution Environment. All cryptographic operations run inside a hardware-isolated enclave so that PII is never exposed to the host OS or network.",
    x: 340,
    y: 0,
    width: 140,
    height: 56,
  },
  {
    id: "hkdf",
    label: "HKDF-SHA3-512",
    color: "purple",
    detail:
      "HMAC-based Key Derivation Function using SHA3-512. Derives a deterministic 64-byte seed from the PII hash, binding the identity to the commitment.",
    x: 310,
    y: 100,
    width: 150,
    height: 56,
  },
  {
    id: "kyber",
    label: "Kyber-1024 KeyGen",
    color: "purple",
    detail:
      "ML-KEM-1024 (CRYSTALS-Kyber, NIST FIPS 203). Generates a post-quantum keypair deterministically from the HKDF seed. The public key is 1568 bytes.",
    x: 510,
    y: 100,
    width: 170,
    height: 56,
  },
  {
    id: "commitment",
    label: "Commitment C",
    color: "purple",
    detail:
      "C = pk ‖ ct, φ = SHA3-512(C). The commitment binds identity to the lattice ciphertext. It is hiding (cannot recover PII) and binding (cannot forge).",
    x: 730,
    y: 100,
    width: 150,
    height: 56,
  },
  {
    id: "idr",
    label: "IdR Smart Contract",
    color: "amber",
    detail:
      "On-chain Identity Registry. Stores φ hashes with Sybil-resistance: each deterministic public key maps to exactly one identity, preventing duplicate enrollment.",
    x: 710,
    y: 0,
    width: 180,
    height: 56,
  },
];

const EDGES: [string, string][] = [
  ["user", "pii"],
  ["pii", "tee"],
  ["tee", "hkdf"],
  ["hkdf", "kyber"],
  ["kyber", "commitment"],
  ["commitment", "idr"],
];

const colorMap = {
  teal: {
    bg: "hsl(var(--chart-4))",
    border: "hsl(var(--chart-4))",
    text: "hsl(var(--card-foreground))",
    bgFill: "hsla(172, 66%, 50%, 0.12)",
  },
  purple: {
    bg: "hsl(var(--primary))",
    border: "hsl(var(--primary))",
    text: "hsl(var(--card-foreground))",
    bgFill: "hsla(270, 70%, 60%, 0.12)",
  },
  amber: {
    bg: "hsl(var(--chart-2))",
    border: "hsl(var(--chart-2))",
    text: "hsl(var(--card-foreground))",
    bgFill: "hsla(38, 92%, 50%, 0.12)",
  },
};

const ArchitectureDiagram = () => {
  const [active, setActive] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    node: PipelineNode;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const padding = 30;
  const viewWidth = 920;
  const viewHeight = 190;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setActive(null);
        setTooltip(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getCenter = (node: PipelineNode) => ({
    cx: padding + node.x + node.width / 2,
    cy: padding + node.y + node.height / 2,
  });

  const handleNodeClick = (node: PipelineNode) => {
    if (active === node.id) {
      setActive(null);
      setTooltip(null);
      return;
    }
    setActive(node.id);
    const { cx, cy } = getCenter(node);
    setTooltip({ x: cx, y: cy + node.height / 2 + 12, node });
  };

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${viewWidth + padding * 2} ${viewHeight + padding * 2}`}
        className="w-full min-w-[680px]"
        style={{ maxHeight: 340 }}
      >
        {/* Edges */}
        {EDGES.map(([fromId, toId]) => {
          const from = NODES.find((n) => n.id === fromId)!;
          const to = NODES.find((n) => n.id === toId)!;
          const { cx: x1, cy: y1 } = getCenter(from);
          const { cx: x2, cy: y2 } = getCenter(to);

          // Determine edge attachment points
          let sx = x1, sy = y1, ex = x2, ey = y2;

          if (Math.abs(y2 - y1) < 20) {
            // Horizontal
            sx = padding + from.x + from.width;
            sy = y1;
            ex = padding + to.x;
            ey = y2;
          } else if (y2 > y1) {
            // Going down
            sx = x1;
            sy = padding + from.y + from.height;
            ex = x2;
            ey = padding + to.y;
          } else {
            // Going up
            sx = x1;
            sy = padding + from.y;
            ex = x2;
            ey = padding + to.y + to.height;
          }

          return (
            <g key={`${fromId}-${toId}`}>
              <defs>
                <marker
                  id={`arrow-${fromId}-${toId}`}
                  viewBox="0 0 10 7"
                  refX="9"
                  refY="3.5"
                  markerWidth="8"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path
                    d="M 0 0 L 10 3.5 L 0 7 z"
                    fill="hsl(var(--muted-foreground))"
                    opacity={0.5}
                  />
                </marker>
              </defs>
              <line
                x1={sx}
                y1={sy}
                x2={ex}
                y2={ey}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1.5}
                opacity={0.35}
                markerEnd={`url(#arrow-${fromId}-${toId})`}
              />
            </g>
          );
        })}

        {/* Nodes */}
        {NODES.map((node) => {
          const c = colorMap[node.color];
          const isActive = active === node.id;
          const nx = padding + node.x;
          const ny = padding + node.y;

          return (
            <g
              key={node.id}
              onClick={() => handleNodeClick(node)}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleNodeClick(node);
              }}
            >
              <rect
                x={nx}
                y={ny}
                width={node.width}
                height={node.height}
                rx={10}
                fill={c.bgFill}
                stroke={c.border}
                strokeWidth={isActive ? 2.5 : 1.5}
                opacity={isActive ? 1 : 0.85}
                style={{
                  transition: "stroke-width 0.2s ease-out, opacity 0.2s ease-out",
                }}
              />
              <text
                x={nx + node.width / 2}
                y={ny + node.height / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fill={c.text}
                fontSize={12}
                fontWeight={600}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                opacity={0.9}
              >
                {node.label}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <foreignObject
            x={Math.max(10, Math.min(tooltip.x - 150, viewWidth + padding * 2 - 310))}
            y={tooltip.y + 4}
            width={300}
            height={120}
          >
            <div className="rounded-lg border border-border/60 bg-popover p-3 shadow-lg">
              <p className="mb-1 font-mono text-xs font-semibold text-foreground">
                {tooltip.node.label}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {tooltip.node.detail}
              </p>
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
};

export default ArchitectureDiagram;
