"use client";

import { setupWorker } from "msw/browser";
import { createHandlers } from "./handlers";
import { currentConditions } from "./network";
import { getEngine, persist } from "./store";

let starting: Promise<unknown> | null = null;
let reactivating: Promise<void> | null = null;

/** Starts the in-browser control plane. Idempotent. */
export function startSimulator(): Promise<unknown> {
  starting ??= setupWorker(...createHandlers(getEngine, { onChange: persist, network: currentConditions })).start({
    quiet: true,
    onUnhandledFrame: "bypass",
  });
  return starting;
}

/**
 * Re-registers this tab with the Service Worker.
 *
 * The MSW worker keeps its list of mocked tabs in memory. Browsers stop idle
 * workers (e.g. while a tab sits in the background), and the restarted worker
 * has forgotten this tab, so requests fall through to the real network. This
 * sends the same "MOCK_ACTIVATE" message MSW sends on start (see
 * public/mockServiceWorker.js) and waits for the worker to confirm.
 */
export function reactivateSimulator(timeoutMs = 1_500): Promise<void> {
  reactivating ??= new Promise<void>((resolve) => {
    const sw = navigator.serviceWorker;
    const done = () => {
      sw.removeEventListener("message", onMessage);
      clearTimeout(timer);
      reactivating = null;
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "MOCKING_ENABLED") done();
    };
    const timer = setTimeout(done, timeoutMs);
    sw.addEventListener("message", onMessage);
    void sw.ready.then((registration) => (sw.controller ?? registration.active)?.postMessage("MOCK_ACTIVATE"));
  });
  return reactivating;
}
