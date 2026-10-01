import { describe, expect, it } from "vitest";
import { formatSeconds, parseAutosleep } from "@/lib/sim/duration";

describe("parseAutosleep (examples straight from the spec)", () => {
  it.each([
    ["30s", 30],
    ["30m", 1800],
    ["2h", 7200],
    ["7d3h4s", 7 * 86_400 + 3 * 3600 + 4],
    ["1w3d", 604_800 + 3 * 86_400],
    ["1800", 1800],
    ["never", 0],
    [" 5M ", 300],
  ])("%s → %d", (input, seconds) => {
    expect(parseAutosleep(input)).toBe(seconds);
  });

  it.each(["", "soon", "5x", "3m4h", "30s junk", "-5s"])("rejects %j", (input) => {
    expect(() => parseAutosleep(input)).toThrow();
  });

  it("formats back", () => {
    expect(formatSeconds(0)).toBe("never");
    expect(formatSeconds(300)).toBe("5m");
    expect(formatSeconds(3_661)).toBe("1h1m1s");
  });
});
