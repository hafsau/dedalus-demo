"use client";

import { AnimatePresence, motion } from "motion/react";
import { LIMITS } from "@/lib/sim/engine";
import { MachineCard } from "./machine-card";
import { OPEN_CREATE_EVENT } from "./new-machine-dialog";
import { useFleet } from "./providers";
import { StackIllustration } from "./stack-illustration";

export const openCreate = () => window.dispatchEvent(new Event(OPEN_CREATE_EVENT));

export function FleetView() {
  const fleet = useFleet();
  const machines = fleet.order.map((id) => fleet.machines[id]).filter(Boolean);
  const live = machines.filter((m) => m.item.desired_state !== "destroyed");
  const running = live.filter((m) => m.item.phase === "running").length;
  const atLimit = live.length >= LIMITS.machines;

  return (
    <section aria-labelledby="fleet-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow tabular">
            Fleet · {live.length}/{LIMITS.machines} machines · {running} running
          </p>
          <h1 id="fleet-title" className="mt-2 text-2xl tracking-tight text-fg">
            Machines
          </h1>
        </div>
        {machines.length > 0 && (
          <button
            type="button"
            onClick={openCreate}
            disabled={atLimit}
            title={atLimit ? `Hobby plan allows ${LIMITS.machines} machines` : undefined}
            className="bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none"
          >
            New machine
          </button>
        )}
      </div>

      {fleet.error && (
        <p role="alert" className="mt-6 border border-danger/40 px-4 py-3 font-mono text-xs text-danger">
          Control plane unreachable: {fleet.error}. Retrying.
        </p>
      )}

      {!fleet.loaded ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading machines">
          {[0, 1, 2].map((i) => (
            <div key={i} className="reticle h-[184px] animate-pulse" />
          ))}
        </div>
      ) : machines.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false}>
            {machines.map((m) => (
              <motion.li
                key={m.item.machine_id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
              >
                <MachineCard machine={m} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="reticle mt-8 grid items-center gap-8 p-8 md:grid-cols-[1fr_280px] md:p-12">
      <div>
        <p className="eyebrow">No machines yet</p>
        <h2 className="mt-3 max-w-md text-xl text-fg">A full Linux computer for your agent, awake in under 50ms.</h2>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
          Machines keep their filesystem when they sleep and bill only while they&apos;re running. Boot one, run a
          command, put it to sleep, and wake it again. Your files will still be there.
        </p>
        <button
          type="button"
          onClick={openCreate}
          className="mt-6 bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-shadow hover:shadow-[0_0_24px_var(--accent-glow)]"
        >
          Boot your first machine
        </button>
      </div>
      <StackIllustration />
    </div>
  );
}
