import { describe, expect, it } from "vitest";
import { accrue, burnRatePerHour, computeRatePerHour, emptyLedger, formatUsd } from "@/lib/cost";

const small = { vcpu: 1, memory_mib: 2048, storage_gib: 10 };
const HOUR = 3_600_000;

describe("cost", () => {
  it("matches the pricing FAQ: 1 vCPU + 2 GiB ≈ $0.075/hr", () => {
    expect(computeRatePerHour(small)).toBeCloseTo(0.07452, 5);
  });

  it("matches the pricing calculator: 2 vCPU / 8 GiB for 150h ≈ $31.10", () => {
    const size = { vcpu: 2, memory_mib: 8192, storage_gib: 10 };
    expect(computeRatePerHour(size) * 150).toBeCloseTo(31.1, 1);
  });

  it("bills storage only while sleeping, and counts the compute as saved", () => {
    const l = accrue(emptyLedger(), small, "sleeping", HOUR);
    expect(l.spent).toBeCloseTo(0.001, 6);
    expect(l.saved).toBeCloseTo(0.07452, 5);
    expect(l.sleepingMs).toBe(HOUR);
  });

  it("bills compute + storage while running", () => {
    const l = accrue(emptyLedger(), small, "running", HOUR);
    expect(l.spent).toBeCloseTo(0.07552, 5);
    expect(l.saved).toBe(0);
  });

  it("charges nothing once destroyed", () => {
    expect(burnRatePerHour(small, "destroyed")).toBe(0);
    expect(accrue(emptyLedger(), small, "destroyed", HOUR)).toEqual(emptyLedger());
  });

  it("formats tiny amounts so a ticking meter visibly moves", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.0000207)).toBe("$0.000021");
    expect(formatUsd(31.1)).toBe("$31.10");
  });
});
