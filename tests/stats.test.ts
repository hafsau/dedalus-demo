import { describe, expect, it } from "vitest";
import { histogram, percentile } from "@/lib/stats";

describe("percentile", () => {
  it("uses nearest rank", () => {
    const v = [5, 1, 4, 2, 3];
    expect(percentile(v, 50)).toBe(3);
    expect(percentile(v, 95)).toBe(5);
    expect(percentile(v, 0)).toBe(1);
  });
  it("handles empty and single samples", () => {
    expect(percentile([], 50)).toBeUndefined();
    expect(percentile([42], 95)).toBe(42);
  });
});

describe("histogram", () => {
  it("bins values and clamps overflow into the last bin", () => {
    expect(histogram([0, 3.9, 4, 9, 400], 4, 3)).toEqual([2, 1, 2]);
  });
});
