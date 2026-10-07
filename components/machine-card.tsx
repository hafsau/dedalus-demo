"use client";

import Link from "next/link";
import { ViewTransition } from "react";
import { burnRatePerHour, formatUsd } from "@/lib/cost";
import type { MachineState } from "@/lib/client/fleet-store";
import { availability, hostname } from "@/lib/client/rules";
import { formatSeconds } from "@/lib/sim/duration";
import { PhaseBadge } from "./phase-badge";
import { useFleet, useFleetStore } from "./providers";

export function sizeLabel(m: { vcpu: number; memory_mib: number; storage_gib: number }) {
  return `${m.vcpu} vCPU · ${m.memory_mib / 1024} GiB · ${m.storage_gib} GiB disk`;
}

export function MachineCard({ machine }: { machine: MachineState }) {
  const store = useFleetStore();
  const stale = !!useFleet().error;
  const { item, pending } = machine;
  const id = item.machine_id;
  const wake = availability("wake", item.phase, item.desired_state);
  const sleep = availability("sleep", item.phase, item.desired_state);
  const toggle = item.phase === "sleeping" ? { label: "Wake", run: () => store.wake(id), ok: wake } : { label: "Sleep", run: () => store.sleep(id), ok: sleep };
  const gone = item.phase === "destroyed";

  return (
    <article
      className={`reticle group flex flex-col gap-5 p-5 transition-opacity ${gone ? "opacity-40" : ""}`}
      aria-label={`Machine ${hostname(id)}, ${item.phase}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ViewTransition name={`machine-${id}`} share="morph" default="none">
            <h2 className="w-fit font-mono text-[15px] text-fg">
              <Link
                href={`/machines/${id}`}
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
              >
                {hostname(id)}
              </Link>
            </h2>
          </ViewTransition>
          <p className="mt-1 text-xs text-dim">{sizeLabel(item)}</p>
        </div>
        <PhaseBadge phase={item.phase} stale={stale} />
      </div>

      <dl className="grid grid-cols-2 gap-3 font-mono text-xs">
        <div>
          <dt className="eyebrow">Burn</dt>
          <dd className="tabular mt-1 text-muted">{formatUsd(burnRatePerHour(item, item.phase), 4)}/hr</dd>
        </div>
        <div>
          <dt className="eyebrow">Autosleep</dt>
          <dd className="mt-1 text-muted">{formatSeconds(item.autosleep_seconds)}</dd>
        </div>
      </dl>

      {!gone && (
        <div className="relative z-10 flex items-center justify-between">
          <button
            type="button"
            onClick={toggle.run}
            disabled={!toggle.ok.allowed || !!pending}
            title={toggle.ok.reason}
            className="border border-line-strong px-3 py-1.5 font-mono text-xs text-fg transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line-strong disabled:hover:text-fg"
          >
            {pending ? `${pending.action}…` : toggle.label}
          </button>
          <span className="font-mono text-xs text-dim transition-colors group-hover:text-accent" aria-hidden>
            Open →
          </span>
        </div>
      )}
    </article>
  );
}
