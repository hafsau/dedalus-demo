// Parses the `autosleep` field exactly as the spec describes it:
// "Accepts fixed duration units like 30s, 30m, 2h, 7d3h4s, or 1w3d, raw
//  seconds ("1800"), or never to disable."
// Returns seconds; 0 means disabled (matching `autosleep_seconds`).

const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86_400,
  w: 604_800,
};

export class DurationParseError extends Error {}

export function parseAutosleep(input: string): number {
  const value = input.trim().toLowerCase();
  if (value === "never") return 0;
  if (/^\d+$/.test(value)) return Number(value);

  const re = /(\d+)([smhdw])/g;
  let total = 0;
  let consumed = 0;
  let lastUnit = Infinity;
  for (const match of value.matchAll(re)) {
    if (match.index !== consumed) break;
    const unitSize = UNIT_SECONDS[match[2]];
    // Units must be strictly descending: "3h4m" is fine, "4m3h" is not.
    if (unitSize >= lastUnit) throw new DurationParseError(`Units out of order in "${input}"`);
    lastUnit = unitSize;
    total += Number(match[1]) * unitSize;
    consumed += match[0].length;
  }
  if (consumed === 0 || consumed !== value.length) {
    throw new DurationParseError(`Invalid duration "${input}"`);
  }
  return total;
}

export function formatSeconds(seconds: number): string {
  if (seconds === 0) return "never";
  const parts: string[] = [];
  let rest = seconds;
  for (const [unit, size] of Object.entries(UNIT_SECONDS).reverse()) {
    if (rest >= size) {
      parts.push(`${Math.floor(rest / size)}${unit}`);
      rest %= size;
    }
  }
  return parts.join("");
}
