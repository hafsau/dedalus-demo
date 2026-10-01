// Full-stack contract test: typed client → HTTP → MSW handlers → engine.
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createDcsClient } from "@/lib/client/api";
import { streamExecution } from "@/lib/client/stream";
import { SimEngine } from "@/lib/sim/engine";
import { createHandlers } from "@/lib/sim/handlers";
import { SIM_HEADER } from "@/lib/sim/protocol";

let engine = new SimEngine({ seed: 1 });
const server = setupServer(...createHandlers(() => engine, { base: "http://localhost/dcs" }));
const client = createDcsClient("http://localhost/dcs");

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  engine = new SimEngine({ seed: 1 });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 1, 12));
});
afterEach(() => vi.useRealTimers());

const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);

describe("DCS contract over HTTP", () => {
  it("creates, lists and fetches machines", async () => {
    const created = await client.createMachine({ vcpu: 2, memory_mib: 2048, autosleep: "30s" });
    expect(created).toMatchObject({ vcpu: 2, memory_mib: 2048, autosleep_seconds: 30, phase: "accepted" });
    advance(2_000);
    const list = await client.listMachines();
    expect(list.map((m) => [m.machine_id, m.phase])).toEqual([[created.machine_id, "running"]]);
    const detail = await client.getMachine(created.machine_id);
    expect(detail.status.phase).toBe("running");
    expect(detail.status.reason).toBe("ready");
  });

  it("returns problem+json errors as typed ApiErrors", async () => {
    const err = await client.getMachine("00000000-0000-4000-8000-000000000000").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: "Not Found" });
    expect(err.message).toMatch(/not found/);
  });

  it("returns domain errors in the spec's { error_code, message, retryable } shape", async () => {
    const err = await client.createMachine({ memory_mib: 65_536 }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "QUOTA_EXCEEDED", retryable: false });
    expect(err.message).toMatch(/16 GiB/);

    const { machine_id } = await client.createMachine({});
    const conflict = await client.wake(machine_id).catch((e) => e);
    expect(conflict).toMatchObject({ status: 409, code: "INVALID_STATE" });
    expect(conflict.details.requested_action).toBe("wake");
  });

  it("honours Idempotency-Key: replay returns the original, a different body conflicts", async () => {
    const post = (body: object) =>
      fetch("http://localhost/dcs/v1/machines", {
        method: "POST",
        headers: { "Idempotency-Key": "k-1", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const first = await (await post({ vcpu: 1 })).json();
    const replay = await (await post({ vcpu: 1 })).json();
    expect(replay.machine_id).toBe(first.machine_id);
    expect(await client.listMachines()).toHaveLength(1);
    const reused = await post({ vcpu: 2 });
    expect(reused.status).toBe(409);
    expect((await reused.json()).error_code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("generates and returns an Idempotency-Key when the client omits one", async () => {
    const res = await fetch("http://localhost/dcs/v1/machines", { method: "POST", body: "{}" });
    expect(res.headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("answers unsimulated endpoints with an honest 501", async () => {
    const res = await fetch("http://localhost/dcs/v1/machines/x/ssh");
    expect(res.status).toBe(501);
    expect(res.headers.get(SIM_HEADER)).toBe("1");
  });

  it("stamps every response, success or error, so the client can tell it reached the simulator", async () => {
    const ok = await fetch("http://localhost/dcs/v1/machines");
    const notFound = await fetch("http://localhost/dcs/v1/machines/nope");
    const conflict = await fetch("http://localhost/dcs/v1/machines", { method: "POST", body: "not json" });
    for (const res of [ok, notFound, conflict]) expect(res.headers.get(SIM_HEADER)).toBe("1");
  });
});

describe("streamExecution", () => {
  it("replaces the quickstart polling loop with an async iterator", async () => {
    const { machine_id } = await client.createMachine({ autosleep: "never" });
    advance(2_000);
    const ex = await client.createExecution(machine_id, { command: ["/bin/bash", "-c", "seq 1 30"] });

    // Fake "waiting" by moving the clock, so the test is instant and deterministic.
    const wait = vi.fn(async (ms: number) => void advance(ms));
    const events = [];
    for await (const e of streamExecution(client, machine_id, ex.execution_id, { wait })) events.push(e);

    const stdout = events.filter((e) => e.type === "stdout").map((e) => e.chunk).join("");
    expect(stdout).toBe(Array.from({ length: 30 }, (_, i) => `${i + 1}\n`).join(""));
    expect(events.at(-1)).toMatchObject({ type: "lifecycle", status: "succeeded", exit_code: 0 });
    // It honoured retry_after_ms (25ms while running) rather than a fixed 500ms sleep.
    expect(wait.mock.calls.every(([ms]) => ms <= 25)).toBe(true);
    // Sequence numbers arrive strictly increasing with no duplicates across pages.
    const seqs = events.map((e) => e.sequence);
    expect(seqs).toEqual([...new Set(seqs)].sort((a, b) => a - b));
  });

  it("streams through an auto-wake from sleep", async () => {
    const { machine_id } = await client.createMachine({ autosleep: "never" });
    advance(2_000);
    await client.sleep(machine_id);
    advance(1_000);
    const ex = await client.createExecution(machine_id, { command: ["/bin/bash", "-c", "hostname"] });
    expect(ex.status).toBe("wake_in_progress");
    const wait = async (ms: number) => void advance(ms);
    const statuses = [];
    for await (const e of streamExecution(client, machine_id, ex.execution_id, { wait })) {
      if (e.type === "lifecycle") statuses.push(e.status);
    }
    expect(statuses).toEqual(["queued", "wake_in_progress", "running", "succeeded"]);
  });

  it("stops promptly when aborted", async () => {
    const { machine_id } = await client.createMachine({ autosleep: "never" });
    advance(2_000);
    const ex = await client.createExecution(machine_id, { command: ["/bin/bash", "-c", "sleep 20"] });
    const controller = new AbortController();
    const wait = async (ms: number, signal?: AbortSignal) => {
      advance(ms);
      controller.abort(new Error("user navigated away"));
      if (signal?.aborted) throw signal.reason;
    };
    const run = async () => {
      for await (const _ of streamExecution(client, machine_id, ex.execution_id, { wait, signal: controller.signal })) {
        // drain
      }
    };
    await expect(run()).rejects.toThrow("user navigated away");
  });
});
