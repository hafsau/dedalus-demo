"use client";

import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";
import { getEngine, persist } from "./store";

let starting: Promise<unknown> | null = null;

/** Starts the in-browser control plane. Idempotent. */
export function startSimulator(): Promise<unknown> {
  starting ??= setupWorker(...createHandlers(getEngine, { onChange: persist })).start({
    quiet: true,
    onUnhandledFrame: "bypass",
  });
  return starting;
}
