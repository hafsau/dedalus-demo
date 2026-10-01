// Cost math using the published rates on dedaluslabs.ai/pricing.
//
// The pricing page labels these "per second", but its own FAQ arithmetic
// (1 vCPU + 2 GiB ≈ $0.075/hr) only works if they're hourly. These are
// treated as hourly and converted explicitly.

import type { Phase } from "./api/types";

export const RATES_PER_HOUR = {
  vcpu: 0.04536,
  memoryGib: 0.01458,
  storageGib: 0.0001,
} as const;

export interface Size {
  vcpu: number;
  memory_mib: number;
  storage_gib: number;
}

/** Only pay for active compute: CPU and memory bill while running. */
export function computeRatePerHour(size: Size): number {
  return size.vcpu * RATES_PER_HOUR.vcpu + (size.memory_mib / 1024) * RATES_PER_HOUR.memoryGib;
}

/** Storage bills for as long as the machine exists. */
export function storageRatePerHour(size: Size): number {
  return size.storage_gib * RATES_PER_HOUR.storageGib;
}

export function isBilledForCompute(phase: Phase): boolean {
  return phase === "running" || phase === "starting" || phase === "stopping";
}

export function burnRatePerHour(size: Size, phase: Phase): number {
  if (phase === "destroyed") return 0;
  return storageRatePerHour(size) + (isBilledForCompute(phase) ? computeRatePerHour(size) : 0);
}

export interface Ledger {
  /** Dollars actually spent. */
  spent: number;
  /** Dollars that would have been spent if the machine had stayed on instead of sleeping. */
  saved: number;
  activeMs: number;
  sleepingMs: number;
}

export const emptyLedger = (): Ledger => ({ spent: 0, saved: 0, activeMs: 0, sleepingMs: 0 });

/** Accrue `ms` milliseconds spent in `phase`. Pure: returns a new ledger. */
export function accrue(ledger: Ledger, size: Size, phase: Phase, ms: number): Ledger {
  if (ms <= 0 || phase === "destroyed") return ledger;
  const hours = ms / 3_600_000;
  const compute = computeRatePerHour(size) * hours;
  const storage = storageRatePerHour(size) * hours;
  if (isBilledForCompute(phase)) {
    return { ...ledger, spent: ledger.spent + compute + storage, activeMs: ledger.activeMs + ms };
  }
  if (phase === "sleeping") {
    return {
      ...ledger,
      spent: ledger.spent + storage,
      saved: ledger.saved + compute,
      sleepingMs: ledger.sleepingMs + ms,
    };
  }
  return { ...ledger, spent: ledger.spent + storage };
}

/** Formats tiny dollar amounts so a ticking meter visibly moves. */
export function formatUsd(value: number, digits = 6): string {
  if (value === 0) return "$0.00";
  if (value >= 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(digits)}`;
}
