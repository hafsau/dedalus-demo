// The simulated DCS control plane.
//
// Design rules:
// 1. Only behaviour the public spec or docs describe is simulated. Anything
//    invented (like create timings) is called out in comments.
// 2. Time is an explicit input. Every method takes `now`, and state advances by
//    replaying scheduled transitions up to `now`. That makes it deterministic
//    in tests, and it means autosleep "happens" even while the tab is closed.
// 3. The machine has a desired state (what was asked for) and an observed phase
//    (where it actually is). A tiny reconciler closes the gap. The public API is
//    strict, exactly like the spec's INVALID_STATE examples: wake only from
//    sleeping, sleep and reboot only from running. Internally, an execution
//    can still queue a wake behind an in-flight sleep.

import type {
  CreateExecutionRequest,
  CreateMachineRequest,
  DesiredState,
  Execution,
  ExecutionEvent,
  ExecutionStatus,
  LifecycleResponse,
  MachineDetail,
  MachineListItem,
  Phase,
  UpdateMachineRequest,
} from "../api/types";
import { DurationParseError, parseAutosleep } from "./duration";
import { createRng, logNormal, shortId, uuid, type Rng } from "./random";
import { freshDisk, freshMemory, runExecution, type Disk, type Memory } from "./shell";

// ───────────────────────── tuning ─────────────────────────

/** Hobby-tier limits from dedaluslabs.ai/pricing. */
export const LIMITS = { machines: 5, vcpu: 4, memoryMib: 16_384, storageGib: 10 } as const;

/**
 * Wake latency. Centred on the published "<50ms" figure: median 28ms, p95
 * 46ms, with an honest long tail. These are simulated, not measured.
 */
export const WAKE_LATENCY = { median: 28, p95: 46 } as const;

/** Invented timings for phases the docs don't put numbers on. */
const TIMING = {
  accept: { median: 18, p95: 40 },
  placement: { median: 70, p95: 140 },
  boot: { median: 210, p95: 360 },
  snapshot: { median: 85, p95: 150 }, // running → sleeping
  destroy: { median: 160, p95: 280 },
} as const;

/** Destroyed machines stay visible briefly so the UI can animate them out. */
const DESTROYED_TTL_MS = 8_000;

const DEFAULT_AUTOSLEEP = "300s";

// ───────────────────────── state ─────────────────────────

interface ScheduledTransition {
  phase: Phase;
  at: number;
  reason: string;
}

export interface SimMachine {
  machine_id: string;
  vcpu: number;
  memory_mib: number;
  storage_gib: number;
  autosleep_seconds: number;
  created_at: number;
  desired_state: DesiredState;
  phase: Phase;
  reason: string;
  revision: number;
  last_transition_at: number;
  last_progress_at: number;
  last_error?: string;
  retryable: boolean;
  next: ScheduledTransition | null;
  last_activity_at: number;
  booted_at: number;
  fail_next_wake: boolean;
  disk: Disk;
  memory: Memory;
}

export interface SimExecution {
  execution_id: string;
  machine_id: string;
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeout_ms?: number;
  created_at: number;
  started_at?: number;
  /** Full event schedule. Events with `at > now` haven't "happened" yet. */
  events: Array<ExecutionEvent & { atMs: number }>;
  next_sequence: number;
}

export interface SimSnapshot {
  version: 1;
  seed: number;
  machines: Record<string, SimMachine>;
  executions: Record<string, SimExecution>;
}

/**
 * The spec has two error shapes. 401/403/409/429/503 return
 * `{ error_code, message, retryable, details }` as application/json; everything
 * else (404, 422, ...) is RFC 7807 problem+json. A SimError with a `code` is
 * the former.
 */
export class SimError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string,
    readonly code?: string,
    readonly retryable = false,
    readonly details?: Record<string, string>,
  ) {
    super(detail);
  }
}

function observedState(phase: Phase): string {
  if (phase === "failed") return "error";
  if (phase === "running" || phase === "sleeping" || phase === "destroyed") return phase;
  return "transitioning";
}

function invalidState(m: SimMachine, action: string, message: string): SimError {
  return new SimError(409, "Conflict", message, "INVALID_STATE", false, {
    current_desired_state: m.desired_state,
    current_observed_state: observedState(m.phase),
    current_phase: m.phase,
    requested_action: action,
  });
}

// ───────────────────────── engine ─────────────────────────

export class SimEngine {
  private rng: Rng;
  private state: SimSnapshot;

  constructor(opts: { seed?: number; snapshot?: SimSnapshot } = {}) {
    const seed = opts.snapshot?.seed ?? opts.seed ?? 1;
    this.state = opts.snapshot ?? { version: 1, seed, machines: {}, executions: {} };
    // A restored snapshot gets fresh randomness. Determinism only matters for
    // engines built from a seed (tests, recordings).
    this.rng = createRng(opts.snapshot ? seed ^ Date.now() : seed);
  }

  snapshot(): SimSnapshot {
    return structuredClone(this.state);
  }

  // ── machines ──

  listMachines(now: number): MachineListItem[] {
    this.settleAll(now);
    return Object.values(this.state.machines)
      .filter((m) => m.phase !== "destroyed" || now - m.last_transition_at < DESTROYED_TTL_MS)
      .sort((a, b) => a.created_at - b.created_at)
      .map((m) => ({
        machine_id: m.machine_id,
        vcpu: m.vcpu,
        memory_mib: m.memory_mib,
        storage_gib: m.storage_gib,
        autosleep_seconds: m.autosleep_seconds,
        created_at: iso(m.created_at),
        desired_state: m.desired_state,
        phase: m.phase,
      }));
  }

  createMachine(req: CreateMachineRequest, now: number): LifecycleResponse {
    this.settleAll(now);
    const vcpu = req.vcpu ?? 1;
    const memory_mib = req.memory_mib ?? 4096;
    const storage_gib = req.storage_gib ?? 10;
    const autosleep_seconds = this.parseAutosleepOrThrow(req.autosleep ?? DEFAULT_AUTOSLEEP);

    if (!(vcpu > 0) || !(memory_mib > 0) || !(storage_gib > 0)) {
      throw new SimError(422, "Unprocessable Entity", "vcpu, memory_mib and storage_gib must be greater than 0");
    }
    const live = Object.values(this.state.machines).filter((m) => m.desired_state !== "destroyed");
    if (live.length >= LIMITS.machines) {
      throw new SimError(403, "Forbidden", `Hobby plan allows up to ${LIMITS.machines} machines. Destroy one or upgrade to Pro.`, "QUOTA_EXCEEDED", false, { limit: "machines", max: String(LIMITS.machines) });
    }
    const quota = (limit: string, message: string) => new SimError(403, "Forbidden", message, "QUOTA_EXCEEDED", false, { limit });
    if (vcpu > LIMITS.vcpu) throw quota("vcpu", `Hobby plan allows up to ${LIMITS.vcpu} vCPU per machine`);
    if (memory_mib > LIMITS.memoryMib) throw quota("memory_mib", `Hobby plan allows up to ${LIMITS.memoryMib / 1024} GiB memory per machine`);
    if (storage_gib > LIMITS.storageGib) throw quota("storage_gib", `Hobby plan storage is fixed at ${LIMITS.storageGib} GiB`);

    const machine_id = uuid(this.rng);
    const m: SimMachine = {
      machine_id,
      vcpu,
      memory_mib,
      storage_gib,
      autosleep_seconds,
      created_at: now,
      desired_state: "running",
      phase: "accepted",
      reason: "create_requested",
      revision: 1,
      last_transition_at: now,
      last_progress_at: now,
      retryable: false,
      next: null,
      last_activity_at: now,
      booted_at: now,
      fail_next_wake: false,
      disk: freshDisk(machine_id),
      memory: freshMemory(),
    };
    this.state.machines[machine_id] = m;
    this.plan(m, now);
    return this.lifecycle(m);
  }

  getMachine(id: string, now: number): MachineDetail {
    const m = this.machineOrThrow(id, now);
    return {
      machine_id: m.machine_id,
      vcpu: m.vcpu,
      memory_mib: m.memory_mib,
      storage_gib: m.storage_gib,
      autosleep_seconds: m.autosleep_seconds,
      desired_state: m.desired_state,
      status: {
        phase: m.phase,
        reason: m.reason,
        retryable: m.retryable,
        revision: String(m.revision),
        last_transition_at: iso(m.last_transition_at),
        last_progress_at: iso(m.last_progress_at),
        ...(m.last_error ? { last_error: m.last_error } : {}),
      },
    };
  }

  updateMachine(id: string, req: UpdateMachineRequest, now: number): LifecycleResponse {
    const m = this.machineOrThrow(id, now);
    if (m.desired_state === "destroyed") throw invalidState(m, "patch", "machine is being destroyed and cannot be updated");
    const resizing = req.vcpu !== undefined || req.memory_mib !== undefined || req.storage_gib !== undefined;
    if (resizing && m.phase !== "sleeping") {
      throw invalidState(m, "patch", "machine must be sleeping to change vcpu, memory or storage");
    }
    if (req.vcpu !== undefined) m.vcpu = req.vcpu;
    if (req.memory_mib !== undefined) m.memory_mib = req.memory_mib;
    if (req.storage_gib !== undefined) m.storage_gib = req.storage_gib;
    if (req.autosleep !== undefined) {
      m.autosleep_seconds = this.parseAutosleepOrThrow(req.autosleep);
      m.last_activity_at = now; // changing the window restarts the idle clock
    }
    m.revision++;
    return this.lifecycle(m);
  }

  wake(id: string, now: number): LifecycleResponse {
    const m = this.machineOrThrow(id, now);
    if (m.phase !== "sleeping" || m.desired_state !== "sleeping") {
      throw invalidState(m, "wake", "machine can only be woken from the sleeping state");
    }
    this.setDesired(m, "running", now);
    return this.lifecycle(m);
  }

  sleep(id: string, now: number): LifecycleResponse {
    const m = this.machineOrThrow(id, now);
    if (m.phase !== "running" || m.desired_state !== "running") {
      throw invalidState(m, "sleep", "machine can only be put to sleep from the running state");
    }
    this.setDesired(m, "sleeping", now);
    return this.lifecycle(m);
  }

  /**
   * From the spec: "Checkpoints files and replaces the runtime. The machine ID
   * and filesystem are preserved. RAM, processes, and temporary mounts are
   * cleared."
   */
  reboot(id: string, now: number): LifecycleResponse {
    const m = this.machineOrThrow(id, now);
    if (m.phase !== "running" || m.desired_state !== "running") {
      throw invalidState(m, "reboot", "machine must be awake to reboot");
    }
    this.cancelRunningExecutions(m, now);
    this.clearVolatile(m);
    m.revision++;
    m.last_activity_at = now;
    m.next = { phase: "starting", at: now, reason: "reboot_requested" };
    this.settle(m, now);
    return this.lifecycle(m);
  }

  destroy(id: string, now: number): LifecycleResponse {
    const m = this.machineOrThrow(id, now);
    if (m.desired_state !== "destroyed") this.setDesired(m, "destroyed", now);
    return this.lifecycle(m);
  }

  /** Not part of the API. Lets the UI demonstrate the failure state. */
  failNextWake(id: string, now: number): void {
    this.machineOrThrow(id, now).fail_next_wake = true;
  }

  // ── executions ──

  createExecution(machineId: string, req: CreateExecutionRequest, now: number): Execution {
    const m = this.machineOrThrow(machineId, now);
    this.assertNotDestroyed(m);
    if (!req.command || req.command.length === 0) {
      throw new SimError(422, "Unprocessable Entity", "command must be a non-empty array");
    }

    const ex: SimExecution = {
      execution_id: shortId(this.rng, "exec"),
      machine_id: machineId,
      command: req.command,
      cwd: req.cwd,
      env: req.env,
      stdin: req.stdin,
      timeout_ms: req.timeout_ms,
      created_at: now,
      events: [],
      next_sequence: 1,
    };
    this.state.executions[ex.execution_id] = ex;
    this.pushEvent(ex, { type: "lifecycle", status: "queued", at: now });

    if (m.phase === "running" && m.desired_state === "running") {
      this.startExecution(m, ex, now);
    } else {
      // The real API auto-wakes a sleeping machine for an execution; the status
      // enum's `wake_in_progress` exists for exactly this.
      if (m.desired_state !== "running") {
        this.pushEvent(ex, { type: "lifecycle", status: "wake_in_progress", at: now });
        this.setDesired(m, "running", now, "execution_wake");
      }
    }
    return this.execution(ex, now);
  }

  listExecutions(machineId: string, now: number): Execution[] {
    this.machineOrThrow(machineId, now);
    return Object.values(this.state.executions)
      .filter((e) => e.machine_id === machineId)
      .sort((a, b) => b.created_at - a.created_at)
      .map((e) => this.execution(e, now));
  }

  getExecution(machineId: string, executionId: string, now: number): Execution {
    return this.execution(this.executionOrThrow(machineId, executionId, now), now);
  }

  /**
   * Events are paginated by an opaque cursor (here, the last sequence seen).
   * Only events whose time has come are returned. That's what makes the
   * client-side streaming helper meaningful.
   */
  listEvents(
    machineId: string,
    executionId: string,
    now: number,
    opts: { cursor?: string; limit?: number } = {},
  ): { items: ExecutionEvent[]; next_cursor?: string } {
    const ex = this.executionOrThrow(machineId, executionId, now);
    const after = opts.cursor ? Number(opts.cursor) : 0;
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
    const items = ex.events
      .filter((e) => e.sequence > after && e.atMs <= now)
      .slice(0, limit)
      .map(({ atMs: _atMs, ...e }) => e);
    const last = items.at(-1);
    return { items, ...(last ? { next_cursor: String(last.sequence) } : opts.cursor ? { next_cursor: opts.cursor } : {}) };
  }

  getOutput(machineId: string, executionId: string, now: number) {
    const ex = this.executionOrThrow(machineId, executionId, now);
    const visible = ex.events.filter((e) => e.atMs <= now);
    const stdout = visible.filter((e) => e.type === "stdout").map((e) => e.chunk ?? "").join("");
    const stderr = visible.filter((e) => e.type === "stderr").map((e) => e.chunk ?? "").join("");
    return {
      execution_id: ex.execution_id,
      stdout,
      stderr,
      stdout_bytes: byteLength(stdout),
      stderr_bytes: byteLength(stderr),
      stdout_truncated: false,
      stderr_truncated: false,
    };
  }

  deleteExecution(machineId: string, executionId: string, now: number): void {
    this.executionOrThrow(machineId, executionId, now);
    delete this.state.executions[executionId];
  }

  // ───────────────────────── internals ─────────────────────────

  private machineOrThrow(id: string, now: number): SimMachine {
    const m = this.state.machines[id];
    if (!m) throw new SimError(404, "Not Found", `machine ${id} not found`);
    this.settle(m, now);
    return m;
  }

  private executionOrThrow(machineId: string, executionId: string, now: number): SimExecution {
    this.machineOrThrow(machineId, now);
    const ex = this.state.executions[executionId];
    if (!ex || ex.machine_id !== machineId) {
      throw new SimError(404, "Not Found", `execution ${executionId} not found`);
    }
    return ex;
  }

  private assertNotDestroyed(m: SimMachine) {
    if (m.desired_state === "destroyed") throw invalidState(m, "execute", `machine is ${m.phase}`);
    if (m.phase === "failed") throw invalidState(m, "execute", "machine failed to start; destroy it and create a new one");
  }

  private parseAutosleepOrThrow(value: string): number {
    try {
      return parseAutosleep(value);
    } catch (e) {
      if (e instanceof DurationParseError) throw new SimError(422, "Unprocessable Entity", e.message);
      throw e;
    }
  }

  private lifecycle(m: SimMachine): LifecycleResponse {
    return {
      machine_id: m.machine_id,
      vcpu: m.vcpu,
      memory_mib: m.memory_mib,
      storage_gib: m.storage_gib,
      autosleep_seconds: m.autosleep_seconds,
      desired_state: m.desired_state,
      phase: m.phase,
    };
  }

  private sample(t: { median: number; p95: number }): number {
    return Math.max(4, logNormal(this.rng, t.median, t.p95));
  }

  private setDesired(m: SimMachine, desired: DesiredState, now: number, reason?: string) {
    if (m.desired_state === desired) return;
    m.desired_state = desired;
    m.revision++;
    m.last_activity_at = now;
    if (reason) m.reason = reason;
    // Stable phases react immediately; transitional phases finish first and
    // the reconciler picks up the new intent when they land.
    if (!m.next) this.plan(m, now, reason);
  }

  /** Decide the next transition from (phase, desired_state). */
  private plan(m: SimMachine, at: number, reason?: string) {
    const go = (phase: Phase, delay: number, why: string) => {
      m.next = { phase, at: at + delay, reason: why };
    };
    m.next = null;
    switch (m.phase) {
      case "accepted":
        return go("placement_pending", this.sample(TIMING.accept), "accepted");
      case "placement_pending":
        return go("starting", this.sample(TIMING.placement), "placed");
      case "starting": {
        if (m.fail_next_wake) {
          m.fail_next_wake = false;
          return go("failed", this.sample(WAKE_LATENCY), "boot_failed");
        }
        const fromSleep = m.reason === "wake_requested" || m.reason === "execution_wake" || m.reason === "reboot_requested";
        return go("running", this.sample(fromSleep ? WAKE_LATENCY : TIMING.boot), "ready");
      }
      case "stopping":
        return go("sleeping", this.sample(TIMING.snapshot), "snapshot_complete");
      case "destroying":
        return go("destroyed", this.sample(TIMING.destroy), "destroyed");
      case "running":
        if (m.desired_state === "sleeping") return go("stopping", 0, reason ?? "sleep_requested");
        if (m.desired_state === "destroyed") return go("destroying", 0, "destroy_requested");
        return;
      case "sleeping":
        if (m.desired_state === "running") return go("starting", 0, reason ?? "wake_requested");
        if (m.desired_state === "destroyed") return go("destroying", 0, "destroy_requested");
        return;
      case "failed":
        if (m.desired_state === "destroyed") return go("destroying", 0, "destroy_requested");
        return;
      case "destroyed":
        return;
    }
  }

  private settleAll(now: number) {
    for (const m of Object.values(this.state.machines)) this.settle(m, now);
  }

  /** Replay everything that should have happened to `m` up to `now`, in order. */
  private settle(m: SimMachine, now: number) {
    for (let guard = 0; guard < 1000; guard++) {
      const autosleepAt =
        m.phase === "running" && m.desired_state === "running" && m.autosleep_seconds > 0 && !m.next
          ? Math.max(m.last_activity_at, this.lastExecutionEnd(m)) + m.autosleep_seconds * 1000
          : Infinity;

      if (autosleepAt <= now && (!m.next || autosleepAt <= m.next.at)) {
        m.desired_state = "sleeping";
        m.revision++;
        this.plan(m, autosleepAt, "autosleep_idle");
        continue;
      }
      if (m.next && m.next.at <= now) {
        this.apply(m, m.next);
        continue;
      }
      return;
    }
  }

  private apply(m: SimMachine, t: ScheduledTransition) {
    const prev = m.phase;
    m.phase = t.phase;
    m.reason = t.reason;
    m.last_transition_at = t.at;
    m.last_progress_at = t.at;
    m.revision++;
    m.next = null;

    if (t.phase === "failed") {
      m.last_error = "boot: guest kernel did not report ready (simulated failure)";
      m.retryable = true;
      m.desired_state = "sleeping";
      this.failPendingExecutions(m, t.at, "boot_failed");
    } else if (t.phase === "running") {
      m.last_error = undefined;
      m.retryable = false;
      if (prev === "starting") m.booted_at = t.at;
      m.last_activity_at = t.at;
      for (const ex of this.pendingExecutions(m)) this.startExecution(m, ex, t.at);
    } else if (t.phase === "stopping" || t.phase === "destroying") {
      this.cancelRunningExecutions(m, t.at);
    } else if (t.phase === "sleeping") {
      this.clearVolatile(m);
    }

    this.plan(m, t.at);
  }

  /** Documented semantics: disk persists; RAM, processes and /tmp do not. */
  private clearVolatile(m: SimMachine) {
    m.memory = freshMemory();
    for (const path of Object.keys(m.disk.files)) if (path.startsWith("/tmp/")) delete m.disk.files[path];
    m.disk.dirs = m.disk.dirs.filter((d) => !d.startsWith("/tmp/"));
  }

  // ── execution internals ──

  private pushEvent(ex: SimExecution, e: Omit<ExecutionEvent, "sequence" | "at"> & { at: number }) {
    ex.events.push({ ...e, sequence: ex.next_sequence++, at: iso(e.at), atMs: e.at });
  }

  private pendingExecutions(m: SimMachine): SimExecution[] {
    return Object.values(this.state.executions).filter(
      (e) => e.machine_id === m.machine_id && e.started_at === undefined && !this.isFinished(e, Infinity),
    );
  }

  private startExecution(m: SimMachine, ex: SimExecution, at: number) {
    ex.started_at = at;
    this.pushEvent(ex, { type: "lifecycle", status: "running", at });
    const result = runExecution(ex.command, {
      disk: m.disk,
      memory: m.memory,
      facts: {
        machineId: m.machine_id,
        vcpu: m.vcpu,
        memoryMib: m.memory_mib,
        storageGib: m.storage_gib,
        bootedAt: m.booted_at,
      },
      rng: this.rng,
      now: at,
      cwd: ex.cwd,
      env: ex.env,
      stdin: ex.stdin,
    });

    const deadline = ex.timeout_ms ? at + ex.timeout_ms : Infinity;
    for (const c of result.chunks) {
      if (at + c.atMs > deadline) break;
      this.pushEvent(ex, { type: c.stream, chunk: c.text, at: at + c.atMs });
    }
    if (at + result.durationMs > deadline) {
      this.pushEvent(ex, {
        type: "lifecycle",
        status: "failed",
        at: deadline,
        signal: 9,
        error_code: "timeout",
        error_message: `execution exceeded timeout_ms=${ex.timeout_ms}`,
      });
    } else {
      this.pushEvent(ex, {
        type: "lifecycle",
        status: result.exitCode === 0 ? "succeeded" : "failed",
        at: at + result.durationMs,
        exit_code: result.exitCode,
      });
    }
  }

  private lastExecutionEnd(m: SimMachine): number {
    let end = 0;
    for (const ex of Object.values(this.state.executions)) {
      if (ex.machine_id === m.machine_id && ex.started_at !== undefined) {
        end = Math.max(end, ex.events.at(-1)?.atMs ?? 0);
      }
    }
    return end;
  }

  private cancelRunningExecutions(m: SimMachine, at: number) {
    for (const ex of Object.values(this.state.executions)) {
      if (ex.machine_id !== m.machine_id || this.isFinished(ex, at)) continue;
      // Running or still queued behind a wake: everything after `at` never happened.
      ex.events = ex.events.filter((e) => e.atMs <= at);
      this.pushEvent(ex, { type: "lifecycle", status: "cancelled", at, signal: 15, error_code: "machine_stopping" });
    }
  }

  private failPendingExecutions(m: SimMachine, at: number, code: string) {
    for (const ex of this.pendingExecutions(m)) {
      this.pushEvent(ex, { type: "lifecycle", status: "failed", at, error_code: code, error_message: "machine failed to start" });
    }
  }

  private isFinished(ex: SimExecution, now: number): boolean {
    return ex.events.some(
      (e) => e.type === "lifecycle" && e.atMs <= now && isTerminal(e.status),
    );
  }

  private execution(ex: SimExecution, now: number): Execution {
    const visible = ex.events.filter((e) => e.atMs <= now);
    const lifecycle = visible.filter((e) => e.type === "lifecycle");
    const latest = lifecycle.at(-1);
    const status: ExecutionStatus = latest?.status ?? "queued";
    const terminal = isTerminal(status) ? latest : undefined;
    const out = visible.filter((e) => e.type === "stdout").reduce((n, e) => n + byteLength(e.chunk ?? ""), 0);
    const err = visible.filter((e) => e.type === "stderr").reduce((n, e) => n + byteLength(e.chunk ?? ""), 0);
    return {
      execution_id: ex.execution_id,
      machine_id: ex.machine_id,
      command: ex.command,
      ...(ex.cwd ? { cwd: ex.cwd } : {}),
      env_keys: Object.keys(ex.env ?? {}),
      status,
      created_at: iso(ex.created_at),
      ...(ex.started_at !== undefined && ex.started_at <= now ? { started_at: iso(ex.started_at) } : {}),
      ...(terminal ? { completed_at: terminal.at } : {}),
      ...(terminal?.exit_code !== undefined ? { exit_code: terminal.exit_code } : {}),
      ...(terminal?.signal !== undefined ? { signal: terminal.signal } : {}),
      ...(terminal?.error_code ? { error_code: terminal.error_code } : {}),
      ...(terminal?.error_message ? { error_message: terminal.error_message } : {}),
      // While work is in flight, tell clients how soon it's worth asking again.
      ...(!terminal ? { retry_after_ms: status === "running" ? 25 : 15 } : {}),
      stdout_bytes: out,
      stderr_bytes: err,
      stdout_truncated: false,
      stderr_truncated: false,
      log_capture: { state: terminal ? "unavailable" : "pending" },
    };
  }
}

function isTerminal(status: ExecutionStatus | undefined): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled" || status === "expired";
}

function iso(ms: number): string {
  return new Date(Math.round(ms)).toISOString();
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
