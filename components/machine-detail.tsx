"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, ViewTransition } from "react";
import { availability, hostname, phaseLabel, type Action } from "@/lib/client/rules";
import { formatSeconds } from "@/lib/sim/duration";
import { CodePanel } from "./code-panel";
import { CostPanel } from "./cost-panel";
import { LifecycleRing } from "./lifecycle-ring";
import { sizeLabel } from "./machine-card";
import { PhaseBadge } from "./phase-badge";
import { useFleet, useFleetStore } from "./providers";
import { Terminal } from "./terminal";
import { WakePanel } from "./wake-panel";

function relative(iso: string | undefined, now: number) {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 1 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
}

function useNow(intervalMs = 1_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function MachineDetail({ id }: { id: string }) {
  const fleet = useFleet();
  const machine = fleet.machines[id];
  const now = useNow();

  if (!fleet.loaded) {
    return <div className="reticle h-64 animate-pulse" aria-busy="true" aria-label="Loading machine" />;
  }
  if (!machine) {
    return (
      <div className="reticle p-8">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-xl text-fg">No machine {hostname(id)}</h1>
        <p className="mt-2 text-sm text-muted">It may have been destroyed. Destroyed machines leave the list after a few seconds.</p>
        <Link href="/" transitionTypes={["nav-back"]} className="mt-6 inline-block font-mono text-sm text-accent hover:underline">
          ← Back to fleet
        </Link>
      </div>
    );
  }

  const { item, status } = machine;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" transitionTypes={["nav-back"]} className="font-mono text-xs text-dim hover:text-fg">
          ← Fleet
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <ViewTransition name={`machine-${id}`} share="morph" default="none">
              <h1 className="w-fit font-mono text-2xl tracking-tight text-fg">{hostname(id)}</h1>
            </ViewTransition>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-dim">
              <PhaseBadge phase={item.phase} />
              <span>{sizeLabel(item)}</span>
              <span>autosleep {formatSeconds(item.autosleep_seconds)}</span>
              <span className="font-mono">{id}</span>
            </p>
          </div>
          <Actions id={id} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="reticle grid gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_200px]" aria-labelledby="lifecycle-title">
            <div className="min-w-0">
              <h2 id="lifecycle-title" className="eyebrow">
                Lifecycle
              </h2>
              <LifecycleRing phase={item.phase} desired={item.desired_state} />
            </div>
            <dl className="flex flex-col justify-center gap-3 font-mono text-xs">
              <div>
                <dt className="text-dim">phase</dt>
                <dd className="text-fg">{phaseLabel(item.phase)}</dd>
              </div>
              <div>
                <dt className="text-dim">reason</dt>
                <dd className="text-fg">{status?.reason ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-dim">last transition</dt>
                <dd className="tabular text-fg">{relative(status?.last_transition_at, now) || "—"}</dd>
              </div>
              <div>
                <dt className="text-dim">revision</dt>
                <dd className="tabular text-fg">{status?.revision ?? "—"}</dd>
              </div>
              {status?.last_error && (
                <div>
                  <dt className="text-danger">last error</dt>
                  <dd className="text-danger/90">{status.last_error}</dd>
                </div>
              )}
            </dl>
          </section>
          <Terminal key={id} machine={machine} />
        </div>

        <aside className="flex flex-col gap-6">
          <WakePanel machine={machine} />
          <CostPanel machine={machine} />
          <CodePanel code={machine.lastCode} />
        </aside>
      </div>
    </div>
  );
}

function Actions({ id }: { id: string }) {
  const store = useFleetStore();
  const router = useRouter();
  const machine = useFleet().machines[id];
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3_000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (!machine) return null;
  const { phase, desired_state } = machine.item;

  const button = (action: Action, label: string, run: () => void, danger = false) => {
    const a = availability(action, phase, desired_state);
    return (
      <button
        type="button"
        onClick={run}
        disabled={!a.allowed || !!machine.pending}
        title={a.reason}
        aria-describedby={a.reason ? `${id}-${action}-why` : undefined}
        className={`border px-3 py-1.5 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
          danger
            ? "border-danger/50 text-danger hover:bg-danger/10"
            : "border-line-strong text-fg hover:border-accent hover:text-accent"
        }`}
      >
        {label}
        {a.reason && (
          <span id={`${id}-${action}-why`} className="sr-only">
            {`. ${a.reason}`}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {button("wake", "Wake", () => store.wake(id))}
      {button("sleep", "Sleep", () => store.sleep(id))}
      {button("reboot", "Reboot", () => store.reboot(id))}
      {button(
        "destroy",
        confirming ? "Confirm destroy" : "Destroy",
        () => {
          if (!confirming) return setConfirming(true);
          setConfirming(false);
          void store.destroy(id).then(() => router.push("/", { transitionTypes: ["nav-back"] }));
        },
        true,
      )}
    </div>
  );
}
