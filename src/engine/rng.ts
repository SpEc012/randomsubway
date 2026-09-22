/** Seeded PRNG (sfc32) + helpers. Same seed → same sandwich, always. */

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  range(min: number, max: number): number;
  int(min: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
  /** Derive an independent stream (for art jitter that must not shift roll outcomes). */
  fork(salt: string | number): Rng;
}

/** cyrb128-style string hash → four 32-bit words. */
export function hash128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const [a, b, c, d] = hash128(seed);
  const next = sfc32(a, b, c, d);
  // Warm up: early outputs of sfc32 are correlated with the seed.
  for (let i = 0; i < 12; i++) next();
  const rng: Rng = {
    next,
    range: (min, max) => min + next() * (max - min),
    int: (min, maxInclusive) => min + Math.floor(next() * (maxInclusive - min + 1)),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    chance: (p) => next() < p,
    fork: (salt) => createRng(`${seed}::${salt}`),
  };
  return rng;
}

const SEED_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A fresh, human-friendly 6-char seed (no 0/O/1/I ambiguity). */
export function freshSeed(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += SEED_ALPHABET[b % SEED_ALPHABET.length];
  return out;
}

/** Deterministic seed for the Daily Sub, keyed on the UTC date. */
export function dailySeed(date = new Date()): string {
  const key = date.toISOString().slice(0, 10);
  const [h] = hash128(`daily:${key}`);
  let out = '';
  let n = h;
  for (let i = 0; i < 6; i++) {
    out += SEED_ALPHABET[n % SEED_ALPHABET.length];
    n = Math.floor(n / SEED_ALPHABET.length) + 7919 * (i + 1);
  }
  return out;
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
