import { describe, expect, it } from "vitest";
import { LIMITS, SimEngine, SimError } from "@/lib/sim/engine";

const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);
const sh = (script: string) => ["/bin/bash", "-c", script];

/** Create a machine and advance until it's running. */
function boot(engine: SimEngine, autosleep = "never") {
  const { machine_id } = engine.createMachine({ autosleep }, T0);
  return { id: machine_id, at: T0 + 5_000 };
}

function phaseAt(engine: SimEngine, id: string, t: number) {
  return engine.getMachine(id, t).status.phase;
}

/**
 * Run a command and read its output at `readAt`. The engine's clock only moves
 * forward, so reading far in the future also advances the machine (autosleep!).
 */
function run(engine: SimEngine, id: string, script: string, t: number, readAt = t + 60_000) {
  const ex = engine.createExecution(id, { command: sh(script) }, t);
  const done = readAt;
  const out = engine.getOutput(id, ex.execution_id, done);
  const final = engine.getExecution(id, ex.execution_id, done);
  return { ...out, exit: final.exit_code, status: final.status, id: ex.execution_id };
}

describe("machine lifecycle", () => {
  it("walks the create path accepted → placement_pending → starting → running", () => {
    const engine = new SimEngine({ seed: 7 });
    const created = engine.createMachine({}, T0);
    expect(created.phase).toBe("accepted");
    expect(created.desired_state).toBe("running");

    const seen = new Set<string>();
    for (let t = T0; t < T0 + 3_000; t += 2) seen.add(phaseAt(engine, created.machine_id, t));
    expect([...seen]).toEqual(["accepted", "placement_pending", "starting", "running"]);
  });

  it("applies spec defaults (1 vCPU, 4096 MiB, 10 GiB, 300s autosleep)", () => {
    const engine = new SimEngine();
    const m = engine.createMachine({}, T0);
    expect(m).toMatchObject({ vcpu: 1, memory_mib: 4096, storage_gib: 10, autosleep_seconds: 300 });
  });

  it("sleeps and wakes, with wake latency centred under 50ms", () => {
    const engine = new SimEngine({ seed: 3 });
    const { id, at } = boot(engine);
    const latencies: number[] = [];
    let t = at;
    for (let i = 0; i < 200; i++) {
      engine.sleep(id, t);
      t += 1_000;
      expect(phaseAt(engine, id, t)).toBe("sleeping");
      engine.wake(id, t);
      expect(phaseAt(engine, id, t)).toBe("starting");
      const detail = engine.getMachine(id, t + 1_000);
      expect(detail.status.phase).toBe("running");
      latencies.push(Date.parse(detail.status.last_transition_at) - t);
      t += 1_000;
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[100];
    const p95 = latencies[190];
    expect(p50).toBeGreaterThan(15);
    expect(p50).toBeLessThan(40);
    expect(p95).toBeLessThan(70);
  });

  it("rejects sleep mid-wake with INVALID_STATE, like the real API", () => {
    const engine = new SimEngine({ seed: 11 });
    const { id, at } = boot(engine);
    engine.sleep(id, at);
    engine.wake(id, at + 1_000);
    const err = (() => {
      try {
        engine.sleep(id, at + 1_001);
      } catch (e) {
        return e as SimError;
      }
    })();
    expect(err).toBeInstanceOf(SimError);
    expect(err).toMatchObject({ status: 409, code: "INVALID_STATE" });
    expect(err?.details).toMatchObject({ current_phase: "starting", requested_action: "sleep" });
    expect(phaseAt(engine, id, at + 3_000)).toBe("running");
  });

  it("only wakes from sleeping", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine);
    expect(() => engine.wake(id, at)).toThrow(/only be woken from the sleeping state/);
  });

  it("reboots with fresh memory but keeps files", () => {
    const engine = new SimEngine({ seed: 6 });
    const { id, at } = boot(engine);
    run(engine, id, "echo kept > a && nohup sleep 999 &", at, at + 100);
    expect(engine.reboot(id, at + 200).phase).toBe("starting");
    const t = at + 1_000;
    expect(phaseAt(engine, id, t)).toBe("running");
    expect(run(engine, id, "cat a", t, t + 100).stdout).toBe("kept\n");
    expect(run(engine, id, "ps", t + 200, t + 300).stdout).not.toContain("sleep 999");
  });

  it("autosleeps after the idle window, and executions count as activity", () => {
    const engine = new SimEngine({ seed: 5 });
    const { id, at } = boot(engine, "30s");
    expect(phaseAt(engine, id, at + 20_000)).toBe("running");
    run(engine, id, "echo keepalive", at + 20_000, at + 21_000);
    // 30s after the execution, not after boot.
    expect(phaseAt(engine, id, at + 45_000)).toBe("running");
    const detail = engine.getMachine(id, at + 52_000);
    expect(detail.status.phase).toBe("sleeping");
    expect(detail.desired_state).toBe("sleeping");
  });

  it("never autosleeps when autosleep is 'never'", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine, "never");
    expect(phaseAt(engine, id, at + 7 * 86_400_000)).toBe("running");
  });

  it("destroys, then drops the machine from the list after a short grace period", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine);
    engine.destroy(id, at);
    expect(engine.listMachines(at + 1_000).map((m) => m.phase)).toEqual(["destroyed"]);
    expect(engine.listMachines(at + 60_000)).toEqual([]);
    expect(() => engine.wake(id, at + 1_000)).toThrow(SimError);
  });

  it("surfaces a boot failure; the API then only allows destroy", () => {
    const engine = new SimEngine({ seed: 2 });
    const { id, at } = boot(engine);
    engine.sleep(id, at);
    engine.failNextWake(id, at + 1_000);
    engine.wake(id, at + 1_000);
    const failed = engine.getMachine(id, at + 2_000);
    expect(failed.status.phase).toBe("failed");
    expect(failed.status.retryable).toBe(true);
    expect(failed.status.last_error).toMatch(/simulated failure/);
    expect(() => engine.wake(id, at + 2_000)).toThrow(/only be woken from the sleeping state/);
    engine.destroy(id, at + 2_000);
    expect(phaseAt(engine, id, at + 3_000)).toBe("destroyed");
  });

  it("only allows resizing while sleeping", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine);
    expect(() => engine.updateMachine(id, { vcpu: 2 }, at)).toThrow(/must be sleeping/);
    engine.sleep(id, at);
    expect(engine.updateMachine(id, { vcpu: 2 }, at + 1_000).vcpu).toBe(2);
  });
});

describe("plan limits and validation", () => {
  it("enforces the Hobby machine count", () => {
    const engine = new SimEngine();
    for (let i = 0; i < LIMITS.machines; i++) engine.createMachine({}, T0);
    expect(() => engine.createMachine({}, T0)).toThrow(/up to 5 machines/);
  });

  it("rejects oversized machines with a 403", () => {
    const engine = new SimEngine();
    try {
      engine.createMachine({ vcpu: 16 }, T0);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SimError);
      expect((e as SimError).status).toBe(403);
    }
  });

  it("rejects malformed autosleep durations with a 422", () => {
    const engine = new SimEngine();
    expect(() => engine.createMachine({ autosleep: "soon" }, T0)).toThrow(/Invalid duration/);
  });
});

describe("persistence semantics (the docs, not the marketing)", () => {
  it("keeps files across sleep but loses /tmp and background processes", () => {
    const engine = new SimEngine({ seed: 9 });
    const { id, at } = boot(engine);
    run(engine, id, "echo kept > notes.txt && echo gone > /tmp/scratch && nohup sleep 1000 &", at);
    expect(run(engine, id, "ps", at + 100).stdout).toContain("sleep 1000");

    engine.sleep(id, at + 1_000);
    engine.wake(id, at + 2_000);
    const t = at + 3_000;
    expect(run(engine, id, "cat notes.txt", t).stdout).toBe("kept\n");
    const tmp = run(engine, id, "cat /tmp/scratch", t + 100);
    expect(tmp.exit).toBe(1);
    expect(tmp.stderr).toContain("No such file");
    expect(run(engine, id, "ps", t + 200).stdout).not.toContain("sleep 1000");
  });
});

describe("executions", () => {
  it("emits ordered, sequenced events: queued → running → output → succeeded", () => {
    const engine = new SimEngine({ seed: 4 });
    const { id, at } = boot(engine);
    const ex = engine.createExecution(id, { command: sh("echo a && echo b") }, at);
    const { items } = engine.listEvents(id, ex.execution_id, at + 10_000);
    expect(items.map((e) => e.sequence)).toEqual(items.map((_, i) => i + 1));
    expect(items.map((e) => e.status ?? e.chunk)).toEqual(["queued", "running", "a\n", "b\n", "succeeded"]);
    expect(items.at(-1)?.exit_code).toBe(0);
  });

  it("only reveals events whose time has come, and pages by cursor", () => {
    const engine = new SimEngine({ seed: 4 });
    const { id, at } = boot(engine);
    const ex = engine.createExecution(id, { command: sh("seq 1 50") }, at);
    const early = engine.listEvents(id, ex.execution_id, at + 30);
    expect(early.items.length).toBeGreaterThan(0);
    expect(early.items.length).toBeLessThan(53);
    const rest = engine.listEvents(id, ex.execution_id, at + 10_000, { cursor: early.next_cursor });
    const all = [...early.items, ...rest.items];
    expect(all.filter((e) => e.type === "stdout")).toHaveLength(50);
    expect(new Set(all.map((e) => e.sequence)).size).toBe(all.length);
  });

  it("auto-wakes a sleeping machine for an execution (wake_in_progress)", () => {
    const engine = new SimEngine({ seed: 8 });
    const { id, at } = boot(engine);
    engine.sleep(id, at);
    const t = at + 1_000;
    const ex = engine.createExecution(id, { command: sh("whoami") }, t);
    expect(ex.status).toBe("wake_in_progress");
    expect(engine.getMachine(id, t).desired_state).toBe("running");
    const done = engine.getExecution(id, ex.execution_id, t + 1_000);
    expect(done.status).toBe("succeeded");
    expect(engine.getOutput(id, ex.execution_id, t + 1_000).stdout).toBe("root\n");
  });

  it("cancels a running execution when the machine is put to sleep", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine);
    const ex = engine.createExecution(id, { command: sh("echo start; sleep 10; echo never") }, at);
    engine.sleep(id, at + 500);
    const final = engine.getExecution(id, ex.execution_id, at + 20_000);
    expect(final.status).toBe("cancelled");
    expect(engine.getOutput(id, ex.execution_id, at + 20_000).stdout).toBe("start\n");
  });

  it("enforces timeout_ms", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine);
    const ex = engine.createExecution(id, { command: sh("sleep 5"), timeout_ms: 1_000 }, at);
    const final = engine.getExecution(id, ex.execution_id, at + 10_000);
    expect(final).toMatchObject({ status: "failed", error_code: "timeout", signal: 9 });
  });

  it("gives clients a retry hint only while work is in flight", () => {
    const engine = new SimEngine();
    const { id, at } = boot(engine);
    const ex = engine.createExecution(id, { command: sh("sleep 1") }, at);
    expect(engine.getExecution(id, ex.execution_id, at + 10).retry_after_ms).toBeGreaterThan(0);
    expect(engine.getExecution(id, ex.execution_id, at + 5_000).retry_after_ms).toBeUndefined();
  });

  it("is deterministic for a given seed", () => {
    const a = new SimEngine({ seed: 42 });
    const b = new SimEngine({ seed: 42 });
    expect(a.createMachine({}, T0)).toEqual(b.createMachine({}, T0));
    expect(a.listMachines(T0 + 300)).toEqual(b.listMachines(T0 + 300));
  });

  it("survives a snapshot round-trip", () => {
    const engine = new SimEngine({ seed: 1 });
    const { id, at } = boot(engine);
    run(engine, id, "echo persisted > a.txt", at);
    const restored = new SimEngine({ snapshot: JSON.parse(JSON.stringify(engine.snapshot())) });
    expect(run(restored, id, "cat a.txt", at + 1_000).stdout).toBe("persisted\n");
  });
});
