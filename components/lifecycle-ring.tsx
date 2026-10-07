"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import type { DesiredState, Phase } from "@/lib/api/types";
import { phaseLabel, phaseTone } from "@/lib/client/rules";

// Geometry. Position along the lifecycle is a single number `s`:
//   s ∈ [-2, 0)  the create lead-in tail (accepted → placement_pending)
//   s ∈ [0, 4)   the ring: starting(0) → running(1) → stopping(2) → sleeping(3) → starting(4≡0)
// A spring animates `s`, never x/y, so the dot always travels *along the path*.
const CX = 228;
const CY = 112;
const R = 78;
const TAIL = 68;

const BASE: Partial<Record<Phase, number>> = {
  accepted: -2,
  placement_pending: -1,
  starting: 0,
  running: 1,
  stopping: 2,
  sleeping: 3,
};

function point(s: number): [number, number] {
  if (s < 0) return [CX - R + s * TAIL, CY];
  const theta = Math.PI + (Math.PI / 2) * s;
  return [CX + R * Math.cos(theta), CY + R * Math.sin(theta)];
}

/** Smallest s ≥ current (mod 4 on the ring) that lands on the target phase, so motion is always clockwise. */
function unwrap(current: number, target: number): number {
  if (target < 0 || current < 0) return target;
  let t = target + 4 * Math.floor(current / 4);
  while (t < current - 1e-6) t += 4;
  return t;
}

const NODES: Array<{ phase: Phase; s: number; label: string; dx: number; dy: number; anchor: "start" | "middle" | "end" }> = [
  { phase: "accepted", s: -2, label: "accepted", dx: 0, dy: 22, anchor: "middle" },
  { phase: "placement_pending", s: -1, label: "placing", dx: 0, dy: 22, anchor: "middle" },
  { phase: "starting", s: 0, label: "starting", dx: -8, dy: -10, anchor: "end" },
  { phase: "running", s: 1, label: "running", dx: 0, dy: -14, anchor: "middle" },
  { phase: "stopping", s: 2, label: "stopping", dx: 14, dy: 4, anchor: "start" },
  { phase: "sleeping", s: 3, label: "sleeping", dx: 0, dy: 26, anchor: "middle" },
];

const TONE: Record<string, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  sleep: "var(--sleep)",
  danger: "var(--danger)",
  dim: "var(--fg-dim)",
};

/** Tuned to settle in ~350ms without overshooting past a node. */
export const RING_SPRING = { stiffness: 210, damping: 26, mass: 0.9 } as const;

export function LifecycleRing({ phase, desired, stale = false }: { phase: Phase; desired: DesiredState; stale?: boolean }) {
  const reduced = useReducedMotion();
  const raw = useMotionValue(BASE[phase] ?? 0);
  const s = useSpring(raw, RING_SPRING);

  useEffect(() => {
    const base = BASE[phase];
    if (base === undefined) return; // destroying / destroyed / failed: stay where we are
    const next = unwrap(raw.get(), base);
    if (reduced) s.jump(next);
    raw.set(next);
  }, [phase, raw, s, reduced]);

  const x = useTransform(s, (v) => point(v)[0]);
  const y = useTransform(s, (v) => point(v)[1]);

  const tone = stale ? "var(--fg-dim)" : TONE[phaseTone(phase)];
  const failed = phase === "failed";
  const gone = phase === "destroyed" || phase === "destroying";
  const desiredS = desired === "running" ? 1 : desired === "sleeping" ? 3 : null;
  const [gx, gy] = desiredS !== null ? point(desiredS) : [0, 0];
  const settled = (desired === "running" && phase === "running") || (desired === "sleeping" && phase === "sleeping");

  return (
    <figure className="m-0">
      <svg viewBox="-14 0 392 222" className="w-full" role="img"
        aria-label={`Lifecycle: ${phaseLabel(phase)}${failed ? "" : `, desired ${desired}`}${stale ? " (last known)" : ""}`}>
        {/* tail + ring */}
        <line x1={point(-2)[0]} y1={CY} x2={CX - R} y2={CY} stroke="var(--line-strong)" strokeDasharray="2 4" />
        <circle cx={CX} cy={CY} r={R} fill="none" stroke="var(--line-strong)" />
        {/* direction ticks */}
        {[0.5, 1.5, 2.5, 3.5].map((t) => {
          const [ax, ay] = point(t);
          const [bx, by] = point(t + 0.06);
          return <line key={t} x1={ax} y1={ay} x2={bx} y2={by} stroke="var(--fg-dim)" strokeWidth="2" />;
        })}

        {NODES.map((n) => {
          const [nx, ny] = point(n.s);
          const active = n.phase === phase;
          return (
            <g key={n.phase}>
              <circle cx={nx} cy={ny} r={3.5} fill={active ? tone : "var(--bg)"} stroke={active ? tone : "var(--line-strong)"} />
              <text
                x={nx + n.dx}
                y={ny + n.dy}
                textAnchor={n.anchor}
                fontFamily="var(--font-geist-mono)"
                fontSize="10"
                letterSpacing="1"
                fill={active ? "var(--fg)" : "var(--fg-dim)"}
              >
                {n.label}
              </text>
            </g>
          );
        })}

        {/* desired state: a hollow target the dot reconciles toward */}
        {desiredS !== null && !gone && !failed && (
          <motion.circle
            cx={gx}
            cy={gy}
            r={11}
            fill="none"
            stroke="var(--accent)"
            strokeDasharray={settled ? "0" : "3 3"}
            initial={false}
            animate={{ opacity: settled ? 0.35 : 0.9, r: settled ? 9 : 12 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          />
        )}

        {/* the machine */}
        <motion.circle
          cx={x}
          cy={y}
          r={6}
          initial={false}
          animate={{ fill: tone, opacity: phase === "destroyed" ? 0.2 : 1, scale: gone ? 0.6 : 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          style={{ filter: stale ? undefined : `drop-shadow(0 0 6px ${tone})` }}
        />

        <text x={CX} y={CY - 4} textAnchor="middle" fontFamily="var(--font-geist-mono)" fontSize="9" letterSpacing="2" fill="var(--fg-dim)">
          {stale ? "LAST KNOWN" : failed ? "STATUS" : "DESIRED"}
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          fontFamily="var(--font-geist-mono)"
          fontSize="12"
          fill={failed ? "var(--danger)" : stale ? "var(--fg-dim)" : "var(--accent)"}
        >
          {failed ? "boot failed" : desired}
        </text>
      </svg>
      <figcaption className="sr-only">
        The dot is the machine&apos;s observed phase. The dashed ring marks the desired state it is moving toward.
      </figcaption>
    </figure>
  );
}
