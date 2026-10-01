"use client";

import { motion } from "motion/react";
import type { Phase } from "@/lib/api/types";
import { isTransitional } from "@/lib/client/fleet-store";
import { phaseLabel, phaseTone, type Tone } from "@/lib/client/rules";

const TONE_COLOR: Record<Tone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  sleep: "var(--sleep)",
  danger: "var(--danger)",
  dim: "var(--fg-dim)",
};

/** Status LED. The color springs between states, so fast phase changes read as one motion. */
export function PhaseLed({ phase, size = 8 }: { phase: Phase; size?: number }) {
  const color = TONE_COLOR[phaseTone(phase)];
  const moving = isTransitional(phase);
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }} aria-hidden>
      {moving && <span className="pulse-ring absolute inset-0 rounded-full" style={{ background: color }} />}
      <motion.span
        className="relative rounded-full"
        style={{ width: size, height: size }}
        animate={{ backgroundColor: color, boxShadow: `0 0 ${phase === "running" ? 10 : 0}px ${color}` }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-xs text-muted">
      <PhaseLed phase={phase} />
      <span className="tabular">{phaseLabel(phase)}</span>
    </span>
  );
}
