// Seeded randomness so the simulator is reproducible in tests and recordings.

export type Rng = () => number;

/** mulberry32: tiny, fast, good-enough PRNG. Returns floats in [0, 1). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal via Box–Muller. */
export function normal(rng: Rng): number {
  const u = Math.max(rng(), Number.EPSILON);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Log-normal sample parameterised by its median and p95, which is how latency
 * is usually reported. Latency is right-skewed, so a normal distribution
 * would understate the tail.
 */
export function logNormal(rng: Rng, median: number, p95: number): number {
  const mu = Math.log(median);
  const sigma = (Math.log(p95) - mu) / 1.6449; // z(0.95)
  return Math.exp(mu + sigma * normal(rng));
}

export function uuid(rng: Rng): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(rng() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

export function shortId(rng: Rng, prefix: string): string {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 16; i++) out += alphabet[Math.floor(rng() * alphabet.length)];
  return `${prefix}_${out}`;
}
