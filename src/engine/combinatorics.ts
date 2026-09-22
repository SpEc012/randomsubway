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
