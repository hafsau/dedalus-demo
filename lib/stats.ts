/** Nearest-rank percentile. Returns undefined for an empty sample. */
export function percentile(values: readonly number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Fixed-width histogram; values beyond the last bin are clamped into it. */
export function histogram(values: readonly number[], binWidth: number, bins: number): number[] {
  const counts = new Array<number>(bins).fill(0);
  for (const v of values) counts[Math.min(bins - 1, Math.max(0, Math.floor(v / binWidth)))]++;
  return counts;
}
