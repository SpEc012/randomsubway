import { BOWL, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import type { FilterId } from '../data/types';
import { filteredPools, type Pools } from './filters';

/**
 * Exact count of distinct valid orders, computed with BigInt straight from the
 * dataset, honoring the same constraints the randomizer enforces:
 *  - a bowl has one size and can't be toasted
 *  - "double protein" needs a protein; "extra cheese" needs a cheese
 *  - "add bacon"/"add pepperoni" can't duplicate the main protein
 */
export function countOrders(pools: Pools): bigint {
  const hasExtra = (id: string) => pools.extra.some((e) => e.id === id);

  let bread = 0n;
  for (const b of pools.bread) bread += b.id === BOWL ? 1n : 4n; // 2 sizes × 2 toast

  let protein = 0n;
  for (const p of pools.protein) {
    let f = 1n;
    if (p.id !== NONE_PROTEIN && hasExtra('double-meat')) f *= 2n;
    if (p.id !== 'bacon' && hasExtra('add-bacon')) f *= 2n;
    if (p.id !== 'pepperoni' && hasExtra('add-pepperoni')) f *= 2n;
    protein += f;
  }

  let cheese = 0n;
  for (const c of pools.cheese) cheese += c.id !== NONE_CHEESE && hasExtra('extra-cheese') ? 2n : 1n;

  const subsets = 2n ** BigInt(pools.veggie.length + pools.sauce.length + pools.seasoning.length);
  return bread * protein * cheese * subsets;
}

export function countForFilters(filters: readonly FilterId[] = []): bigint {
  return countOrders(filteredPools(filters));
}

export function formatBig(n: bigint): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "0.000000000000000067%" — the share of the universe one roll represents. */
export function percentOf(part: bigint, whole: bigint, digits = 3): string {
  if (whole === 0n) return '0%';
  // Scale to keep `digits` significant figures.
  const scale = 10n ** 40n;
  const ratio = (part * 100n * scale) / whole; // percent × 1e40
  if (ratio === 0n) return '0%';
  const s = ratio.toString().padStart(41, '0');
  const intPart = s.slice(0, s.length - 40).replace(/^0+(?=\d)/, '');
  const frac = s.slice(s.length - 40);
  const firstSig = frac.search(/[1-9]/);
  if (intPart !== '0') return `${intPart}.${frac.slice(0, digits)}%`;
  return `0.${frac.slice(0, firstSig + digits).replace(/0+$/, '')}%`;
}

/**
 * Exact 0-based rank of an order within the full (unfiltered) space counted
 * by `countOrders` — a bijection, so every possible sandwich has a unique
 * serial number. Mixed radix: breadConfig · proteinConfig · cheeseConfig · subsets.
 */
export function orderRank(o: import('../data/types').Order): bigint {
  const pools = filteredPools([]);
  const hasExtra = (id: string) => pools.extra.some((e) => e.id === id);
  const ex = new Set(o.extras);

  let breadIdx = 0n;
  let breadN = 0n;
  for (const b of pools.bread) {
    const n = b.id === BOWL ? 1n : 4n;
    if (b.id === o.bread)
      breadIdx =
        breadN + (b.id === BOWL ? 0n : BigInt((o.size === 'footlong' ? 1 : 0) + (o.toasted ? 2 : 0)));
    breadN += n;
  }

  const proteinFlags = (pid: string) => {
    const flags: string[] = [];
    if (pid !== NONE_PROTEIN && hasExtra('double-meat')) flags.push('double-meat');
    if (pid !== 'bacon' && hasExtra('add-bacon')) flags.push('add-bacon');
    if (pid !== 'pepperoni' && hasExtra('add-pepperoni')) flags.push('add-pepperoni');
    return flags;
  };
  let proteinIdx = 0n;
  let proteinN = 0n;
  for (const p of pools.protein) {
    const flags = proteinFlags(p.id);
    if (p.id === o.protein) {
      let sub = 0n;
      flags.forEach((f, i) => {
        if (ex.has(f)) sub |= 1n << BigInt(i);
      });
      proteinIdx = proteinN + sub;
    }
    proteinN += 1n << BigInt(flags.length);
  }

  let cheeseIdx = 0n;
  let cheeseN = 0n;
  for (const c of pools.cheese) {
    const n = c.id !== NONE_CHEESE && hasExtra('extra-cheese') ? 2n : 1n;
    if (c.id === o.cheese) cheeseIdx = cheeseN + (n === 2n && ex.has('extra-cheese') ? 1n : 0n);
    cheeseN += n;
  }

  let subset = 0n;
  let bit = 0n;
  for (const list of [pools.veggie, pools.sauce, pools.seasoning] as const) {
    const chosen = list === pools.veggie ? o.veggies : list === pools.sauce ? o.sauces : o.seasonings;
    for (const item of list) {
      if (chosen.includes(item.id)) subset |= 1n << bit;
      bit += 1n;
    }
  }
  const subsetN = 1n << bit;
  return ((breadIdx * proteinN + proteinIdx) * cheeseN + cheeseIdx) * subsetN + subset;
}
