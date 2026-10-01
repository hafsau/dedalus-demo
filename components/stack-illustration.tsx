// Isometric stack: hardware → kernel → VM → agent. Pure SVG, no JS.

const LAYERS = [
  { label: "agent", y: 0, accent: true },
  { label: "vm", y: 34, accent: false },
  { label: "kernel", y: 68, accent: false },
  { label: "hardware", y: 102, accent: false },
];

function Plate({ y, accent, label }: { y: number; accent: boolean; label: string }) {
  // A rhombus with a little thickness.
  const top = `M140 ${y + 10} L240 ${y + 52} L140 ${y + 94} L40 ${y + 52} Z`;
  const side = `M40 ${y + 52} L40 ${y + 60} L140 ${y + 102} L240 ${y + 60} L240 ${y + 52} L140 ${y + 94} Z`;
  return (
    <g className={accent ? "stack-float" : undefined}>
      <path d={side} fill={accent ? "color-mix(in oklab, var(--accent) 30%, var(--bg))" : "var(--bg-sunken)"} stroke="var(--line-strong)" />
      <path
        d={top}
        fill={accent ? "color-mix(in oklab, var(--accent) 18%, var(--bg-raised))" : "var(--bg-raised)"}
        stroke={accent ? "var(--accent)" : "var(--line-strong)"}
      />
      <text
        x="246"
        y={y + 56}
        fill={accent ? "var(--accent)" : "var(--fg-dim)"}
        fontFamily="var(--font-geist-mono)"
        fontSize="9"
        letterSpacing="2"
      >
        {label.toUpperCase()}
      </text>
    </g>
  );
}

export function StackIllustration() {
  return (
    <svg viewBox="0 0 330 210" className="w-full max-w-[300px] justify-self-center" role="img" aria-label="An agent running on a VM, on a kernel, on hardware">
      <style>{`
        .stack-float { animation: stack-float 3.2s cubic-bezier(.45,0,.55,1) infinite; }
        @keyframes stack-float { 50% { transform: translateY(-6px); } }
        @media (prefers-reduced-motion: reduce) { .stack-float { animation: none; } }
      `}</style>
      {[...LAYERS].reverse().map((l) => (
        <Plate key={l.label} {...l} />
      ))}
    </svg>
  );
}
