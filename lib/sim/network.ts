// Simulated network conditions, so loading, retry, timeout and offline states
// can be seen and tested instead of only imagined.
//
// The mode is held in memory on purpose, not in localStorage. A visitor who
// tries "offline" and then reloads gets a working app back.

export type NetworkMode = "normal" | "slow" | "flaky" | "offline";

/**
 * What happens to one request:
 * - drop-request: it never reaches the control plane (nothing changes).
 * - drop-response: the work is done, but the reply is lost. The case
 *   Idempotency-Key exists for: a retry must not do the work twice.
 */
export type Fault = "none" | "drop-request" | "drop-response";

export interface NetworkConditions {
  delayMs(): number;
  fault(method: string): Fault;
}

export const NETWORK_MODES: ReadonlyArray<{ mode: NetworkMode; label: string; detail: string }> = [
  { mode: "normal", label: "Normal", detail: "Instant responses" },
  { mode: "slow", label: "Slow", detail: "~1s per request" },
  { mode: "flaky", label: "Flaky", detail: "Some requests and replies get lost" },
  { mode: "offline", label: "Offline", detail: "Control plane unreachable" },
];

export function conditionsFor(mode: NetworkMode, random: () => number = Math.random): NetworkConditions {
  switch (mode) {
    case "normal":
      return { delayMs: () => 0, fault: () => "none" };
    case "slow":
      return { delayMs: () => 700 + random() * 600, fault: () => "none" };
    case "flaky":
      return {
        delayMs: () => 100 + random() * 500,
        fault: (method) => {
          const r = random();
          if (r < 0.15) return "drop-request";
          // Lost replies only matter for mutations, where a naive retry would repeat the work.
          if (method !== "GET" && r < 0.35) return "drop-response";
          return "none";
        },
      };
    case "offline":
      return { delayMs: () => 0, fault: () => "drop-request" };
  }
}

let mode: NetworkMode = "normal";
const listeners = new Set<() => void>();

export function getNetworkMode(): NetworkMode {
  return mode;
}

export function setNetworkMode(next: NetworkMode): void {
  mode = next;
  for (const l of listeners) l();
}

export function subscribeNetworkMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The conditions for the current mode, read fresh on every request. */
export function currentConditions(): NetworkConditions {
  return conditionsFor(mode);
}
