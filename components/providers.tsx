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
  if (!store) throw new Error("useFleetStore must be used inside <Providers>");
  return store;
}

const SERVER_SNAPSHOT: FleetSnapshot = { loaded: false, machines: {}, order: [] };

export function useFleet(): FleetSnapshot {
  const store = useFleetStore();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);
}

export function useMachine(id: string): MachineState | undefined {
  return useFleet().machines[id];
}

type Boot = { state: "booting" } | { state: "ready"; store: FleetStore } | { state: "error"; message: string };

export function Providers({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>({ state: "booting" });

  useEffect(() => {
    let store: FleetStore | null = null;
    // Loaded lazily: MSW is browser-only (its package blocks the node condition),
    // and keeping it out of the initial bundle helps first paint.
    import("@/lib/sim/browser")
      .then(({ startSimulator }) => startSimulator())
      .then(() => {
        store = new FleetStore(dcs());
        store.start();
        setBoot({ state: "ready", store });
      })
      .catch((e: unknown) => {
        setBoot({ state: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => store?.stop();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      {boot.state === "ready" ? (
        <FleetContext value={boot.store}>
          {children}
          <NewMachineDialog />
          <CommandPalette />
          <Toasts />
        </FleetContext>
      ) : (
        <BootScreen error={boot.state === "error" ? boot.message : undefined} />
      )}
    </MotionConfig>
  );
}
