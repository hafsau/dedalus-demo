"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import type { MachineState } from "@/lib/client/fleet-store";
import { availability } from "@/lib/client/rules";
import { histogram, percentile } from "@/lib/stats";
import { useFleetStore } from "./providers";

const BIN_MS = 4;
const BINS = 20; // 0–80ms
/** The figure Dedalus cites for a typical sandbox start in its cold-start article. */
const REFERENCE_MS = 2_500;

function useLiveElapsed(since: number | undefined): number | null {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (since === undefined) return;
    let raf = 0;
    const loop = () => {
      setElapsed(performance.now() - since);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [since]);
  return since === undefined ? null : elapsed;
}

export function WakePanel({ machine }: { machine: MachineState }) {
  const store = useFleetStore();
  const { item, wakes, waking } = machine;
  const live = useLiveElapsed(waking?.clickedAt);
  const last = wakes.at(-1);
  const samples = wakes.map((w) => w.requestToRunningMs);
  const p50 = percentile(samples, 50);
  const p95 = percentile(samples, 95);
  const counts = histogram(samples, BIN_MS, BINS);
  const peak = Math.max(1, ...counts);
  const canWake = availability("wake", item.phase, item.desired_state);

  const headline = live !== null ? live : last?.requestToRunningMs;

  return (
    <section className="reticle flex flex-col gap-5 p-5" aria-labelledby="wake-title">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="wake-title" className="eyebrow">
            Wake latency
          </h2>
          <p className="mt-3 flex items-baseline gap-1.5 font-mono text-fg" aria-live="polite">
            <span className="tabular text-4xl tracking-tight">{headline === undefined ? "—" : Math.round(headline)}</span>
            <span className="text-sm text-dim">ms</span>
          </p>
          <p className="mt-1 text-xs text-dim">
            {live !== null
              ? "waking…"
              : last
                ? `wake request → running · on screen at ${Math.round(last.observedMs)}ms`
                : "sleep the machine, then wake it to measure"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => (item.phase === "sleeping" ? store.wake(item.machine_id) : store.sleep(item.machine_id))}
          disabled={item.phase === "sleeping" ? !canWake.allowed : !availability("sleep", item.phase, item.desired_state).allowed}
          className="shrink-0 border border-line-strong px-3 py-1.5 font-mono text-xs text-fg hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {item.phase === "sleeping" ? "Wake" : "Sleep"}
        </button>
      </div>

      <Comparison lastMs={last?.requestToRunningMs} runKey={wakes.length} />

      <div>
        <div className="flex h-14 items-end gap-px" role="img" aria-label={`Histogram of ${samples.length} wakes. p50 ${p50 ?? "n/a"}ms, p95 ${p95 ?? "n/a"}ms`}>
          {counts.map((c, i) => (
            <motion.div
              key={i}
              className="flex-1 bg-accent/70"
              initial={false}
              animate={{ height: `${(c / peak) * 100}%`, opacity: c ? 1 : 0.15 }}
              transition={{ type: "spring", stiffness: 260, damping: 22 }}
              style={{ minHeight: 1 }}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between font-mono text-[10px] text-dim">
          <span>0</span>
          <span>40ms</span>
          <span>80ms+</span>
        </div>
        <dl className="tabular mt-3 grid grid-cols-3 gap-2 font-mono text-xs">
          <div>
            <dt className="text-dim">wakes</dt>
            <dd className="text-fg">{samples.length}</dd>
          </div>
          <div>
            <dt className="text-dim">p50</dt>
            <dd className="text-fg">{p50 === undefined ? "—" : `${Math.round(p50)}ms`}</dd>
          </div>
          <div>
            <dt className="text-dim">p95</dt>
            <dd className="text-fg">{p95 === undefined ? "—" : `${Math.round(p95)}ms`}</dd>
          </div>
        </dl>
      </div>
      <p className="text-[11px] leading-relaxed text-dim">Simulated around Dedalus&apos; published &lt;50ms figure.</p>
    </section>
  );
}

/**
 * This wake vs. a 2.5s sandbox start, on one linear scale. The reference bar
 * fills in real time with a linear tween, because it represents elapsed time.
 * Everything representing *state* in Workshop uses springs.
 */
function Comparison({ lastMs, runKey }: { lastMs: number | undefined; runKey: number }) {
  const reduced = useReducedMotion();
  // Only race on wakes that happen while you're watching, not on revisits.
  const [mountKey] = useState(runKey);
  const animateRef = runKey !== mountKey;

  const pct = lastMs === undefined ? 0 : Math.max(0.6, (lastMs / REFERENCE_MS) * 100);
  return (
    <div className="flex flex-col gap-2 font-mono text-[11px]">
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-muted">this wake</span>
        <div className="relative h-1.5 flex-1 bg-sunken">
          <motion.div
            className="absolute inset-y-0 left-0 bg-accent"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 400, damping: 40 }}
          />
        </div>
        <span className="tabular w-14 text-right text-fg">{lastMs === undefined ? "—" : `${Math.round(lastMs)}ms`}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-dim">sandbox start</span>
        <div className="relative h-1.5 flex-1 bg-sunken">
          <motion.div
            key={runKey}
            className="absolute inset-y-0 left-0 bg-line-strong"
            initial={{ width: animateRef && !reduced ? "0%" : "100%" }}
            animate={{ width: "100%" }}
            transition={{ duration: REFERENCE_MS / 1000, ease: "linear" }}
          />
        </div>
        <span className="tabular w-14 text-right text-dim">2.5s</span>
      </div>
    </div>
  );
}
