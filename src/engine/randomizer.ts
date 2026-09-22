import { BOWL, byCategory, byId, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import { affinity } from '../data/pairings';
import { SIGNATURES, type Signature } from '../data/signatures';
import type { FilterId, Ingredient, Mode, Order, ReelId } from '../data/types';
import { allowed, excludedTags, filteredPools, type Pools } from './filters';
import { clamp, createRng, lerp, type Rng } from './rng';

export interface RollParams {
  seed: string;
  mode: Mode;
  /** 0–100. */
  chaos: number;
  filters: readonly FilterId[];
  locks: readonly ReelId[];
  /** The order on the machine right now — locked reels keep these values. */
  previous?: Order;
}

export interface RollResult {
  order: Order;
  /** Effective chaos after mode overrides (0–1). */
  chaos: number;
  notes: string[];
}

/** Daily Sub always rolls at this chaos so everyone's is comparable. */
export const DAILY_CHAOS = 35;

/**
 * The chaos dial: popularity weight w∈(0,1] raised to an exponent that slides
 * from 3 (crush the rare picks) at chaos 0 to 0 (perfectly uniform) at chaos 1.
 */
export function effectiveWeight(w: number, chaos: number): number {
  return w ** lerp(3, 0, chaos);
}

/** Low chaos gives the machine taste: candidates that pair well with what's already picked get boosted. */
function tasteBoost(candidate: string, chosen: readonly string[], chaos: number): number {
  if (chaos >= 1 || chosen.length === 0) return 1;
  let sum = 0;
  for (const c of chosen) sum += affinity(candidate, c);
  return Math.exp(sum * 0.45 * (1 - chaos));
}

function weightedPick(
  rng: Rng,
  items: readonly Ingredient[],
  chaos: number,
  chosen: readonly string[],
): Ingredient {
  const weights = items.map((i) => effectiveWeight(i.weight, chaos) * tasteBoost(i.id, chosen, chaos));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] as number;
    if (r <= 0) return items[i] as Ingredient;
  }
  return items[items.length - 1] as Ingredient;
}

function weightedSample(
  rng: Rng,
  items: readonly Ingredient[],
  k: number,
  chaos: number,
  chosen: string[],
): string[] {
  const pool = [...items];
  const out: string[] = [];
  for (let n = 0; n < k && pool.length > 0; n++) {
    const picked = weightedPick(rng, pool, chaos, chosen);
    pool.splice(pool.indexOf(picked), 1);
    out.push(picked.id);
    chosen.push(picked.id);
  }
  return out;
}

/** Triangular distribution, rounded to an integer. */
function triangular(rng: Rng, min: number, mode: number, max: number): number {
  if (max <= min) return Math.round(min);
  const u = rng.next();
  const f = (mode - min) / (max - min);
  const x =
    u < f
      ? min + Math.sqrt(u * (max - min) * (mode - min))
      : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  return Math.round(clamp(x, min, max));
}

/** Keep the canonical menu order for multi-select layers (it's how they're built & read out). */
function canonical(ids: readonly string[], pool: readonly Ingredient[]): string[] {
  const idx = new Map(pool.map((p, i) => [p.id, i]));
  return [...new Set(ids)].sort((a, b) => (idx.get(a) ?? 99) - (idx.get(b) ?? 99));
}

interface LayerRoller {
  rng: Rng;
  pools: Pools;
  chaos: number;
  chosen: string[];
  mode: Mode;
}

function rollBread(r: LayerRoller): Pick<Order, 'bread' | 'size' | 'toasted'> {
  const bread = weightedPick(r.rng, r.pools.bread, r.chaos, r.chosen).id;
  const size = r.rng.chance(r.mode === 'nightmare' ? 0.85 : 0.5) ? 'footlong' : '6in';
  const toasted = bread !== BOWL && r.rng.chance(lerp(0.72, 0.5, r.chaos));
  return { bread, size, toasted };
}

function rollProtein(r: LayerRoller): string {
  let pool = r.pools.protein;
  if (r.mode === 'monk' && pool.some((p) => p.id !== NONE_PROTEIN))
    pool = pool.filter((p) => p.id !== NONE_PROTEIN);
  return weightedPick(r.rng, pool, r.chaos, r.chosen).id;
}

function rollCheese(r: LayerRoller): string {
  if (r.mode === 'monk') return NONE_CHEESE;
  let pool = r.pools.cheese;
  if (r.mode === 'nightmare' && pool.some((p) => p.id !== NONE_CHEESE))
    pool = pool.filter((p) => p.id !== NONE_CHEESE);
  return weightedPick(r.rng, pool, r.chaos, r.chosen).id;
}

function rollMulti(
  r: LayerRoller,
  pool: readonly Ingredient[],
  shape: { min: [number, number]; mode: [number, number]; max: [number, number] },
): string[] {
  if (r.mode === 'monk' || pool.length === 0) return [];
  const n = pool.length;
  let k: number;
  if (r.mode === 'nightmare') {
    k = r.rng.int(Math.ceil(n * 0.6), n);
  } else {
    const c = r.chaos;
    const max = Math.min(n, lerp(shape.max[0], shape.max[1] === -1 ? n : shape.max[1], c ** 2));
    const min = Math.min(max, lerp(shape.min[0], shape.min[1], c));
    const mode = clamp(lerp(shape.mode[0], shape.mode[1], c), min, max);
    k = triangular(r.rng, min, mode, max);
  }
  return canonical(weightedSample(r.rng, pool, k, r.chaos, r.chosen), pool);
}

function rollExtras(r: LayerRoller, order: Omit<Order, 'extras'>): string[] {
  if (r.mode === 'monk') return [];
  const out: string[] = [];
  for (const e of r.pools.extra) {
    if (!extraAllowed(e.id, order)) continue;
    const p = r.mode === 'nightmare' ? 0.85 : lerp(0.08, 0.45, r.chaos) * lerp(e.weight, 1, r.chaos) * 2;
    if (r.rng.chance(clamp(p, 0, 0.95) * tasteBoost(e.id, r.chosen, r.chaos) ** 0.5)) out.push(e.id);
  }
  return canonical(out, r.pools.extra);
}

export function extraAllowed(extraId: string, o: Pick<Order, 'protein' | 'cheese'>): boolean {
  switch (extraId) {
    case 'double-meat':
      return o.protein !== NONE_PROTEIN;
    case 'extra-cheese':
      return o.cheese !== NONE_CHEESE;
    case 'add-bacon':
      return o.protein !== 'bacon';
    case 'add-pepperoni':
      return o.protein !== 'pepperoni';
    default:
      return true;
  }
}

/** Enforce hard menu rules. Idempotent. */
export function applyConstraints(o: Order): Order {
  const out: Order = {
    ...o,
    veggies: canonical(o.veggies, byCategory.veggie),
    sauces: canonical(o.sauces, byCategory.sauce),
    seasonings: canonical(o.seasonings, byCategory.seasoning),
    extras: canonical(
      o.extras.filter((e) => extraAllowed(e, o)),
      byCategory.extra,
    ),
  };
  if (out.bread === BOWL) {
    out.toasted = false;
    out.size = '6in';
  }
  return out;
}

const VEG_SHAPE = { min: [2, 0], mode: [4, 5], max: [6, -1] } as {
  min: [number, number];
  mode: [number, number];
  max: [number, number];
};
const SAUCE_SHAPE = { min: [1, 0], mode: [1.4, 4], max: [2, -1] } as typeof VEG_SHAPE;
const SEASON_SHAPE = { min: [0, 0], mode: [1.2, 2], max: [3, -1] } as typeof VEG_SHAPE;

function lockedValid(prev: Order, reel: ReelId, pools: Pools): boolean {
  const has = (list: readonly Ingredient[], id: string) => list.some((i) => i.id === id);
  switch (reel) {
    case 'bread':
      return has(pools.bread, prev.bread);
    case 'protein':
      return has(pools.protein, prev.protein);
    case 'cheese':
      return has(pools.cheese, prev.cheese);
    case 'veggies':
      return prev.veggies.every((v) => has(pools.veggie, v));
    case 'sauces':
      return prev.sauces.every((v) => has(pools.sauce, v));
    case 'seasonings':
      return prev.seasonings.every((v) => has(pools.seasoning, v));
    case 'extras':
      return prev.extras.every((v) => has(pools.extra, v));
  }
}

function signatureAllowed(sig: Signature, filters: readonly FilterId[]): boolean {
  const ex = excludedTags(filters);
  const o = sig.order;
  const ids = [o.bread, o.protein, o.cheese, ...o.veggies, ...o.sauces, ...o.seasonings, ...o.extras];
  return ids.every((id) => {
    const item = byId.get(id);
    return item ? allowed(item, ex) : false;
  });
}

export function roll(params: RollParams): RollResult {
  const notes: string[] = [];
  const mode = params.mode;
  let chaos = clamp(params.chaos, 0, 100) / 100;
  if (mode === 'nightmare') chaos = 1;
  if (mode === 'daily') chaos = DAILY_CHAOS / 100;
  if (mode === 'monk') chaos = Math.min(chaos, 0.3);

  const rng = createRng(`${params.seed}|${mode}`);
  const pools = filteredPools(params.filters);
  const locks = new Set<ReelId>(mode === 'daily' ? [] : params.locks);
  const prev = params.previous;
  const isLocked = (reel: ReelId) => !!prev && locks.has(reel) && lockedValid(prev, reel, pools);
  for (const reel of locks)
    if (prev && !lockedValid(prev, reel, pools))
      notes.push(`Unlocked ${reel}: it no longer fits your filters.`);

  const r: LayerRoller = { rng, pools, chaos, chosen: [], mode };

  // Signature mode: start from a real recipe, then let chaos mutate layers.
  let base: Order | undefined;
  let mutateReels = new Set<ReelId>();
  if (mode === 'signature') {
    const candidates = SIGNATURES.filter((s) => signatureAllowed(s, params.filters));
    if (candidates.length === 0) {
      notes.push('No signature sub fits your filters — rolling a custom build instead.');
    } else {
      const sig = rng.pick(candidates);
      const mutations = Math.round(lerp(0, 3.4, chaos ** 1.1));
      const layerOrder: ReelId[] = ['bread', 'protein', 'cheese', 'veggies', 'sauces'];
      const shuffled = [...layerOrder].sort(() => rng.next() - 0.5);
      mutateReels = new Set(shuffled.slice(0, mutations));
      base = { ...sig.order, signature: sig.id, mutations };
    }
  }

  const fromBase = (reel: ReelId) => !!base && !mutateReels.has(reel);

  const breadPart = isLocked('bread')
    ? { bread: prev!.bread, size: prev!.size, toasted: prev!.toasted }
    : fromBase('bread')
      ? { bread: base!.bread, size: base!.size, toasted: base!.toasted }
      : rollBread(r);
  r.chosen.push(breadPart.bread);

  const protein = isLocked('protein') ? prev!.protein : fromBase('protein') ? base!.protein : rollProtein(r);
  r.chosen.push(protein);

  const cheese = isLocked('cheese') ? prev!.cheese : fromBase('cheese') ? base!.cheese : rollCheese(r);
  if (cheese !== NONE_CHEESE) r.chosen.push(cheese);

  const multi = (
    reel: ReelId,
    key: 'veggies' | 'sauces' | 'seasonings',
    pool: readonly Ingredient[],
    shape: typeof VEG_SHAPE,
  ) => {
    if (isLocked(reel)) {
      r.chosen.push(...prev![key]);
      return prev![key];
    }
    if (fromBase(reel) && reel !== 'seasonings') {
      r.chosen.push(...base![key]);
      return base![key];
    }
    if (base && reel === 'seasonings') {
      r.chosen.push(...base.seasonings);
      return base.seasonings;
    }
    return rollMulti(r, pool, shape);
  };

  const veggies = multi('veggies', 'veggies', pools.veggie, VEG_SHAPE);
  const sauces = multi('sauces', 'sauces', pools.sauce, SAUCE_SHAPE);
  const seasonings = multi('seasonings', 'seasonings', pools.seasoning, SEASON_SHAPE);

  const partial = { ...breadPart, protein, cheese, veggies, sauces, seasonings };
  const extras = isLocked('extras') ? prev!.extras : base ? base.extras : rollExtras(r, partial);

  let order: Order = { ...partial, extras };
  if (base) {
    order.signature = base.signature;
    if (mutateReels.size > 0) order.mutations = mutateReels.size;
  }
  order = applyConstraints(order);
  return { order, chaos, notes };
}

/** Stable identity for an order, for de-duping and "Déjà Vu". */
export function orderKey(o: Order): string {
  return [
    o.bread,
    o.size,
    o.toasted ? 'T' : 'C',
    o.protein,
    o.cheese,
    o.veggies.join('+'),
    o.sauces.join('+'),
    o.seasonings.join('+'),
    o.extras.join('+'),
  ].join('|');
}

/** Does a custom roll land exactly on a signature recipe's fillings? */
export function matchesSignature(o: Order): Signature | undefined {
  const same = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return SIGNATURES.find(
    (s) =>
      s.order.protein === o.protein &&
      s.order.cheese === o.cheese &&
      same(s.order.veggies, o.veggies) &&
      same(s.order.sauces, o.sauces),
  );
}
