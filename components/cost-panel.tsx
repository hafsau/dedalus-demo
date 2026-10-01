"use client";

import { motion } from "motion/react";
import { burnRatePerHour, computeRatePerHour, formatUsd, RATES_PER_HOUR } from "@/lib/cost";
import type { MachineState } from "@/lib/client/fleet-store";

function duration(ms: number) {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function CostPanel({ machine }: { machine: MachineState }) {
  const { item, ledger } = machine;
  const burn = burnRatePerHour(item, item.phase);
  const total = ledger.activeMs + ledger.sleepingMs;
  const activeShare = total ? ledger.activeMs / total : 0;

  return (
    <section className="reticle flex flex-col gap-4 p-5" aria-labelledby="cost-title">
      <div className="flex items-baseline justify-between">
        <h2 id="cost-title" className="eyebrow">
          Cost · this session
        </h2>
        <span className="tabular font-mono text-xs text-muted">{formatUsd(burn, 4)}/hr now</span>
      </div>

      <dl className="tabular grid grid-cols-2 gap-4 font-mono">
        <div>
          <dt className="text-xs text-dim">spent</dt>
          <dd className="mt-1 text-lg text-fg">{formatUsd(ledger.spent)}</dd>
        </div>
        <div>
          <dt className="text-xs text-dim">saved by sleeping</dt>
          <dd className="mt-1 text-lg text-ok">{formatUsd(ledger.saved)}</dd>
        </div>
      </dl>

      <div>
        <div className="flex h-1.5 overflow-hidden bg-sunken" role="img" aria-label={`${Math.round(activeShare * 100)}% of observed time running`}>
          <motion.div
            className="h-full bg-accent"
            initial={false}
            animate={{ width: `${activeShare * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 30 }}
          />
          <div className="h-full flex-1 bg-sleep/40" />
        </div>
        <div className="mt-2 flex justify-between font-mono text-[11px] text-dim">
          <span>running {duration(ledger.activeMs)}</span>
          <span>asleep {duration(ledger.sleepingMs)}</span>
        </div>
      </div>

      <details className="group text-[11px] leading-relaxed text-dim">
        <summary className="cursor-pointer list-none text-muted hover:text-fg">
          <span className="inline-block transition-transform group-open:rotate-90">›</span> How this is calculated
        </summary>
        <p className="mt-2">
          Compute ({formatUsd(computeRatePerHour(item), 4)}/hr for this size) bills only while the machine is running.
          Storage ({formatUsd(item.storage_gib * RATES_PER_HOUR.storageGib, 4)}/hr) bills while it exists. Rates are from
          dedaluslabs.ai/pricing. The page labels them &quot;per second&quot;, but its own FAQ arithmetic only works
          hourly, so they&apos;re treated as hourly here.
        </p>
      </details>
    </section>
  );
}
