// Seeded, keyed randomness. Every draw is derived from (seed, stream, ...keys), so the
// order in which the engine asks for numbers never changes the result. UI, retries, polling
// and logging never touch these functions.

export type RngStream = "map" | "placement" | "events" | "nature" | "effects" | "combat" | "alloc" | "mock";

/** cyrb128 string hash → four 32-bit seeds. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
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
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: T[]): T[];
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string, stream: RngStream, ...keys: (string | number)[]): Rng {
  const [a, b, c, d] = cyrb128(`${seed}|${stream}|${keys.join("|")}`);
  const gen = sfc32(a, b, c, d);
  // Warm up to decorrelate similar keys.
  for (let i = 0; i < 12; i++) gen();
  const rng: Rng = {
    next: gen,
    int(min, max) {
      return min + Math.floor(gen() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error("pick from empty list");
      return items[Math.floor(gen() * items.length)] as (typeof items)[number];
    },
    shuffle(items) {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(gen() * (i + 1));
        const tmp = items[i] as (typeof items)[number];
        items[i] = items[j] as (typeof items)[number];
        items[j] = tmp;
      }
      return items;
    },
  };
  return rng;
}

/** A single keyed draw in [0, 1). */
export function draw(seed: string, stream: RngStream, ...keys: (string | number)[]): number {
  return makeRng(seed, stream, ...keys).next();
}

/** Random seed string for new games (server-side only callers should prefer crypto). */
export function normalizeSeed(input: string): string {
  return input.trim().slice(0, 64);
}
