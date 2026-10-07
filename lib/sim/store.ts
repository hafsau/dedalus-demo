// Holds the browser's single SimEngine and persists it to localStorage, so a
// reload keeps your fleet. Persistence is a convenience: if storage is
// unavailable (private mode, blocked), the sim still works, just in memory.

import { SimEngine, type SimSnapshot } from "./engine";

const KEY = "workshop.sim.v1";

let engine: SimEngine | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function load(): SimSnapshot | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const snap = JSON.parse(raw) as SimSnapshot;
    return snap.version === 1 ? snap : undefined;
  } catch {
    return undefined;
  }
}

function seedFromUrl(): number | undefined {
  try {
    const s = new URL(location.href).searchParams.get("seed");
    return s ? Number(s) : undefined;
  } catch {
    return undefined;
  }
}

export function getEngine(): SimEngine {
  if (!engine) {
    const seed = seedFromUrl();
    // An explicit ?seed= always starts clean, so tests and recordings are reproducible.
    const snapshot = seed === undefined ? load() : undefined;
    engine = new SimEngine(snapshot ? { snapshot } : { seed: seed ?? Date.now() % 2 ** 31 });
  }
  return engine;
}

function write(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(getEngine().snapshot()));
  } catch {
    // Storage full or blocked: the sim keeps running in memory.
  }
}

/** Debounced so a burst of polling requests costs one write. */
export function persist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    write();
  }, 250);
}

/**
 * Write now, skipping the debounce. Called when the page is hidden or
 * closed: without it, reloading within 250ms of creating a machine lost it.
 */
export function flush(): void {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  write();
}

export function resetSimulator(): void {
  engine = new SimEngine({ seed: Date.now() % 2 ** 31 });
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
