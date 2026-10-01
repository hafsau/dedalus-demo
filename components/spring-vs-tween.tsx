"use client";

import { motion } from "motion/react";
import { useRef, useState } from "react";
import { RING_SPRING } from "./lifecycle-ring";

const STOPS = ["accepted", "placing", "starting", "running"];
// The real cadence of a create: phase updates land every ~20–150ms,
// faster than a 400ms tween can finish.
const CADENCE_MS = [0, 40, 150, 360];

/**
 * The moving element is a full-width layer translated by a percentage of its
 * own width, so the animation is a pure transform: no layout, no measuring.
 */
function Track({ label, stop, transition }: { label: string; stop: number; transition: object }) {
  return (
    <div className="flex items-center gap-4">
      <span className="w-14 shrink-0 font-mono text-xs text-muted">{label}</span>
      <div className="relative h-8 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
        {STOPS.map((s, i) => (
          <span
            key={s}
            className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-line-strong"
            style={{ left: `${(i / (STOPS.length - 1)) * 100}%` }}
          />
        ))}
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={false}
          animate={{ x: `${(stop / (STOPS.length - 1)) * 100}%` }}
          transition={transition}
        >
          <span className="absolute top-1/2 left-0 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_var(--accent-glow)]" />
        </motion.div>
      </div>
    </div>
  );
}

export function SpringVsTween() {
  const [stop, setStop] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const play = () => {
    timers.current.forEach(clearTimeout);
    setStop(0);
    timers.current = CADENCE_MS.map((ms, i) => setTimeout(() => setStop(i), 300 + ms));
  };

  return (
    <figure className="reticle m-0 flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="text-sm text-muted">
          Four phase updates in ~360ms, the cadence of a real create. Same targets, same timing.
        </figcaption>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={play}
            className="bg-accent px-3 py-1.5 font-mono text-xs text-accent-ink hover:shadow-[0_0_20px_var(--accent-glow)]"
          >
            Play a create
          </button>
          <button
            type="button"
            onClick={() => {
              timers.current.forEach(clearTimeout);
              setStop((s) => (s === 0 ? 3 : 0));
            }}
            className="border border-line-strong px-3 py-1.5 font-mono text-xs text-fg hover:border-accent"
          >
            Retarget
          </button>
        </div>
      </div>
      <Track label="tween" stop={stop} transition={{ duration: 0.4, ease: "easeInOut" }} />
      <Track label="spring" stop={stop} transition={{ type: "spring", ...RING_SPRING }} />
      <div className="flex justify-between pl-[4.5rem] font-mono text-[10px] text-dim">
        {STOPS.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-dim">
        Each new target restarts the tween from zero velocity, so it stutters at every update and arrives late. The spring
        keeps its momentum and simply re-aims. Click Retarget mid-flight to feel it.
      </p>
    </figure>
  );
}
