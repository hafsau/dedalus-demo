// Client-side fleet state: one polling loop, adaptive cadence, optimistic
// intent, wake timing and a per-machine cost ledger. Exposed to React through
// useSyncExternalStore, with immutable snapshots.

import { TRANSITIONAL_PHASES, type LifecycleStatus, type MachineListItem, type Phase } from "../api/types";
import { accrue, emptyLedger, type Ledger } from "../cost";
import { describeError, type DcsClient } from "./api";
import { hostname } from "./rules";

export interface WakeSample {
  /**
   * Wake request sent → phase became running, per the server's transition
   * timestamp. Includes the API round trip, which is what an SDK caller feels.
   */
  requestToRunningMs: number;
  /** What the user saw: click → UI rendered running. */
  observedMs: number;
  at: number;
}

export interface MachineState {
  item: MachineListItem;
  status?: LifecycleStatus;
  ledger: Ledger;
  wakes: WakeSample[];
  /** An action the user asked for that hasn't landed yet. */
  pending?: { action: string; since: number };
  /** Wake measurement in flight. `observedAt` is set when the UI first sees running. */
  waking?: { clickedAt: number; requestedAt: number; observedAt?: number };
  /** Equivalent SDK call for the last action, so the UI teaches the API. */
  lastCode?: string;
}

export interface FleetSnapshot {
  loaded: boolean;
  machines: Record<string, MachineState>;
  order: string[];
  /** Set while the control plane can't be reached; statuses are then "last known". */
  error?: string;
  /** When the fleet was last confirmed by the control plane (ms epoch). */
  lastOkAt?: number;
  toast?: { id: number; tone: "error" | "info"; message: string };
}

type Listener = () => void;

const FAST_MS = 16;
const SLOW_MS = 1_000;
const MAX_WAKE_SAMPLES = 40;

export class FleetStore {
  private snap: FleetSnapshot = { loaded: false, machines: {}, order: [] };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastSampleAt = 0;
  private toastSeq = 0;
  private running = false;

  constructor(private client: DcsClient) {}

  // ── useSyncExternalStore plumbing ──
  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = () => this.snap;

  private set(next: Partial<FleetSnapshot>) {
    this.snap = { ...this.snap, ...next };
    for (const l of this.listeners) l();
  }

  private patch(id: string, fn: (m: MachineState) => MachineState) {
    const m = this.snap.machines[id];
    if (!m) return;
    this.set({ machines: { ...this.snap.machines, [id]: fn(m) } });
  }

  // ── polling ──
  start() {
    if (this.running) return;
    this.running = true;
    void this.tick();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Poll now instead of waiting for the next tick (after a mutation). */
  kick() {
    if (this.timer) clearTimeout(this.timer);
    void this.tick();
  }

  private busy(): boolean {
    if (this.snap.error) return false; // back off to the slow cadence while unreachable
    return Object.values(this.snap.machines).some(
      (m) => TRANSITIONAL_PHASES.has(m.item.phase) || m.pending || m.waking,
    );
  }

  private async tick() {
    if (!this.running) return;
    try {
      const items = await this.client.listMachines();
      this.ingest(items);
    } catch (e) {
      // Keep the last known fleet on screen, but say plainly that it may be out of date.
      this.set({ error: describeError(e), loaded: true });
    }
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), this.busy() ? FAST_MS : SLOW_MS);
  }

  private ingest(items: MachineListItem[]) {
    const now = Date.now();
    const elapsed = this.lastSampleAt ? now - this.lastSampleAt : 0;
    this.lastSampleAt = now;

    const machines: Record<string, MachineState> = {};
    const toFetchStatus: string[] = [];
    for (const item of items) {
      const prev = this.snap.machines[item.machine_id];
      let m: MachineState = prev
        ? { ...prev, item, ledger: accrue(prev.ledger, prev.item, prev.item.phase, elapsed) }
        : { item, ledger: emptyLedger(), wakes: [] };

      if (prev && prev.item.phase !== item.phase) {
        toFetchStatus.push(item.machine_id);
        if (m.pending && !TRANSITIONAL_PHASES.has(item.phase)) m = { ...m, pending: undefined };
        if (m.waking && item.phase === "running") {
          // Seen by the UI now; the control-plane timestamp arrives with the status fetch.
          m = { ...m, waking: { ...m.waking, observedAt: performance.now() } };
        }
        if (m.waking && (item.phase === "failed" || item.phase === "destroyed")) m = { ...m, waking: undefined };
      }
      if (!prev) toFetchStatus.push(item.machine_id);
      machines[item.machine_id] = m;
    }
    if (!this.snap.loaded) performance.mark("workshop:fleet-loaded");
    this.set({ loaded: true, machines, order: items.map((i) => i.machine_id), error: undefined, lastOkAt: now });
    for (const id of toFetchStatus) void this.refreshStatus(id);
  }

  private async refreshStatus(id: string) {
    try {
      const detail = await this.client.getMachine(id);
      this.patch(id, (m) => {
        let next: MachineState = { ...m, status: detail.status };
        if (m.waking && detail.status.phase === "running") {
          const sample: WakeSample = {
            requestToRunningMs: Math.max(0, Date.parse(detail.status.last_transition_at) - m.waking.requestedAt),
            observedMs: (m.waking.observedAt ?? performance.now()) - m.waking.clickedAt,
            at: Date.now(),
          };
          next = { ...next, waking: undefined, wakes: [...m.wakes, sample].slice(-MAX_WAKE_SAMPLES) };
        }
        return next;
      });
    } catch {
      // A machine that vanished between list and get is fine; the next list drops it.
    }
  }

  // ── actions ──
  private toast(message: string, tone: "error" | "info" = "error") {
    this.set({ toast: { id: ++this.toastSeq, tone, message } });
  }

  dismissToast() {
    this.set({ toast: undefined });
  }

  private async act(id: string, action: string, code: string, call: () => Promise<unknown>, extra?: Partial<MachineState>) {
    this.patch(id, (m) => ({ ...m, pending: { action, since: Date.now() }, lastCode: code, ...extra }));
    try {
      await call();
    } catch (e) {
      this.patch(id, (m) => ({ ...m, pending: undefined, waking: undefined }));
      this.toast(describeError(e, action));
    }
    // Always re-read the real state: after a lost reply, the action may or may not have happened.
    this.kick();
  }

  wake(id: string) {
    const clickedAt = performance.now();
    return this.act(
      id,
      "wake",
      `await client.machines.wake({ machine_id: "${id}" });`,
      () => this.client.wake(id),
      { waking: { clickedAt, requestedAt: Date.now() } },
    );
  }

  sleep(id: string) {
    return this.act(id, "sleep", `await client.machines.sleep({ machine_id: "${id}" });`, () => this.client.sleep(id));
  }

  reboot(id: string) {
    return this.act(id, "reboot", `await client.machines.reboot({ machine_id: "${id}" });`, () => this.client.reboot(id));
  }

  destroy(id: string) {
    return this.act(id, "destroy", `await client.machines.delete({ machine_id: "${id}" });`, () => this.client.destroy(id));
  }

  async create(body: { vcpu: number; memory_mib: number; storage_gib: number; autosleep: string }): Promise<string | null> {
    try {
      const m = await this.client.createMachine(body);
      this.toast(`Creating ${hostname(m.machine_id)}`, "info");
      this.kick();
      return m.machine_id;
    } catch (e) {
      this.toast(describeError(e, "create the machine"));
      this.kick();
      return null;
    }
  }

  setLastCode(id: string, code: string) {
    this.patch(id, (m) => ({ ...m, lastCode: code }));
  }
}

export function isTransitional(phase: Phase) {
  return TRANSITIONAL_PHASES.has(phase);
}
