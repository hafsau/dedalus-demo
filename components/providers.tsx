"use client";

import { MotionConfig } from "motion/react";
import { createContext, use, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { dcs } from "@/lib/client/api";
import { FleetStore, type FleetSnapshot, type MachineState } from "@/lib/client/fleet-store";
import { BootScreen } from "./boot-screen";
import { CommandPalette } from "./command-palette";
import { NewMachineDialog } from "./new-machine-dialog";
import { Toasts } from "./toasts";

const FleetContext = createContext<FleetStore | null>(null);

export function useFleetStore(): FleetStore {
  const store = use(FleetContext);
  if (!store) throw new Error("useFleetStore used before the simulator is ready");
  return store;
}

/** What every page sees until the simulator is up (and what the server renders). */
const BOOTING: FleetSnapshot = { loaded: false, machines: {}, order: [] };
const noSubscribe = () => () => {};
const booting = () => BOOTING;

export function useFleet(): FleetSnapshot {
  const store = use(FleetContext);
  return useSyncExternalStore(store?.subscribe ?? noSubscribe, store?.getSnapshot ?? booting, booting);
}

export function useMachine(id: string): MachineState | undefined {
  return useFleet().machines[id];
}

type Boot = { state: "booting" } | { state: "ready"; store: FleetStore } | { state: "error"; message: string };

/**
 * Pages render immediately (server-rendered, with a known-good fallback for
 * the fleet) while the simulator boots after hydration. The largest paint
 * never waits on the Service Worker, and booting never competes with
 * hydration for the main thread.
 */
export function Providers({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: "booting" });

  useEffect(() => {
    let store: FleetStore | null = null;
    let cancelled = false;
    performance.mark("workshop:hydrated");
    // MSW is browser-only (its package blocks the node condition), so it's
    // loaded here, after hydration, instead of in the initial bundle. (Waiting
    // for idle time instead was measured: it delayed boot to ~5s for little
    // TBT gain.) A click on "New machine" before boot completes is queued.
    import("@/lib/sim/browser")
      .then(({ startSimulator }) => {
        performance.mark("workshop:sim-loaded");
        return startSimulator();
      })
      .then(() => {
        performance.mark("workshop:worker-ready");
        if (cancelled) return;
        store = new FleetStore(dcs());
        store.start();
        // From here on the real fleet decides what renders, not the pre-paint guess.
        document.documentElement.dataset.fleet = "live";
        setBoot({ state: "ready", store });
      })
      .catch((e: unknown) => {
        setBoot({ state: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
      store?.stop();
    };
  }, []);

  if (boot.state === "error") {
    return <BootScreen error={boot.message} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <FleetContext value={boot.state === "ready" ? boot.store : null}>
        {children}
        {boot.state === "ready" && (
          <>
            <NewMachineDialog />
            <CommandPalette />
            <Toasts />
          </>
        )}
      </FleetContext>
    </MotionConfig>
  );
}
