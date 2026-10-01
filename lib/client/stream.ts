// The Dedalus quickstart asks every developer to hand-write this:
//
//   while execution.status not in done:
//       time.sleep((execution.retry_after_ms or 500) / 1000)
//       execution = client.machines.executions.retrieve(...)
//
// This is the helper I'd ship in the SDK instead: an async iterator over
// execution events. It pages by cursor, honours the server's retry hint,
// backs off when idle, and stops on a terminal lifecycle event.
//
//   for await (const event of streamExecution(client, machineId, execId)) { ... }

import { TERMINAL_EXECUTION_STATUSES, type ExecutionEvent } from "../api/types";
import type { DcsClient } from "./api";

export interface StreamOptions {
  signal?: AbortSignal;
  /** Poll interval while events are arriving. */
  minIntervalMs?: number;
  /** Ceiling for the backoff while nothing is happening. */
  maxIntervalMs?: number;
  /** Injectable for tests. */
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const abortableWait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export function isTerminal(event: ExecutionEvent): boolean {
  return event.type === "lifecycle" && !!event.status && TERMINAL_EXECUTION_STATUSES.has(event.status);
}

export async function* streamExecution(
  client: Pick<DcsClient, "listEvents" | "getExecution">,
  machineId: string,
  executionId: string,
  opts: StreamOptions = {},
): AsyncGenerator<ExecutionEvent, void, void> {
  const min = opts.minIntervalMs ?? 16;
  const max = opts.maxIntervalMs ?? 1_000;
  const wait = opts.wait ?? abortableWait;
  let cursor: string | undefined;
  let interval = min;

  while (true) {
    const page = await client.listEvents(machineId, executionId, { cursor, limit: 200 }, opts.signal);
    const items = page.items ?? [];
    for (const event of items) {
      yield event;
      if (isTerminal(event)) return;
    }
    cursor = page.next_cursor ?? cursor;

    if (items.length > 0) {
      interval = min;
      continue; // there may be more right now
    }
    // Nothing new: ask the server how long to wait, else back off exponentially.
    const { retry_after_ms } = await client.getExecution(machineId, executionId);
    interval = retry_after_ms ? Math.max(min, retry_after_ms) : Math.min(max, interval * 2);
    await wait(interval, opts.signal);
  }
}
