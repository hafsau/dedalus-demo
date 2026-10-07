// Network failure handling: what the user is told, and that retries are safe.
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDcsClient, describeError, NetworkError } from "@/lib/client/api";
import { SimEngine } from "@/lib/sim/engine";
import { createHandlers } from "@/lib/sim/handlers";
import { conditionsFor, type Fault, type NetworkConditions } from "@/lib/sim/network";

let engine = new SimEngine({ seed: 1 });
let conditions: NetworkConditions = conditionsFor("normal");
const server = setupServer(
  ...createHandlers(() => engine, { base: "http://localhost/dcs", network: () => conditions }),
);
const client = createDcsClient("http://localhost/dcs");

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  engine = new SimEngine({ seed: 1 });
  conditions = conditionsFor("normal");
});

/** Faults in a fixed order, so tests are deterministic. */
function scripted(faults: Fault[]): NetworkConditions {
  return { delayMs: () => 0, fault: () => faults.shift() ?? "none" };
}

describe("network modes", () => {
  it("offline drops every request; normal drops none", () => {
    expect(conditionsFor("offline").fault("GET")).toBe("drop-request");
    expect(conditionsFor("normal").fault("POST")).toBe("none");
  });

  it("flaky can lose replies only for mutations", () => {
    const flaky = conditionsFor("flaky", () => 0.25); // between the drop-request and drop-response thresholds
    expect(flaky.fault("POST")).toBe("drop-response");
    expect(flaky.fault("GET")).toBe("none");
  });

  it("slow mode adds roughly a second of delay", () => {
    const slow = conditionsFor("slow", () => 0.5);
    expect(slow.delayMs()).toBeGreaterThanOrEqual(700);
    expect(slow.delayMs()).toBeLessThanOrEqual(1300);
  });
});

describe("lost replies and idempotency", () => {
  it("a reply lost after the work was done is retried with the same key, creating exactly one machine", async () => {
    conditions = scripted(["drop-response"]);
    const created = await client.createMachine({});
    expect(created.machine_id).toBeTruthy();
    // The first attempt really created a machine; the retry replayed it instead of making a second.
    expect(engine.listMachines(Date.now())).toHaveLength(1);
  });

  it("a request dropped before arrival is retried once, then succeeds", async () => {
    conditions = scripted(["drop-request"]);
    await client.createMachine({});
    expect(engine.listMachines(Date.now())).toHaveLength(1);
  });

  it("reports the control plane as unreachable when it stays down", async () => {
    conditions = conditionsFor("offline");
    const err = await client.listMachines().catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.reason).toBe("unreachable");
  });
});

describe("timeouts", () => {
  it("gives up on a request that never answers, and doesn't retry it", async () => {
    let calls = 0;
    const hanging = (req: Request) =>
      new Promise<Response>((_, reject) => {
        calls++;
        req.signal.addEventListener("abort", () => reject(req.signal.reason), { once: true });
      });
    const slowClient = createDcsClient("http://localhost/dcs", hanging, { timeoutMs: 50 });
    const err = await slowClient.sleep("m-1").catch((e) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect(err.reason).toBe("timeout");
    expect(calls).toBe(1);
  });
});

describe("describeError", () => {
  it("never claims nothing changed after a failed mutation", () => {
    const msg = describeError(new NetworkError("unreachable", "x"), "sleep");
    expect(msg).toMatch(/Couldn't reach the control plane to sleep/);
    expect(msg).toMatch(/Checking the machine's real state/);
  });

  it("says the screen shows the last known state after a timeout", () => {
    expect(describeError(new NetworkError("timeout", "x"))).toMatch(/last known state/);
  });
});
