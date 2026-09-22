import { describe, expect, it } from 'vitest';
import { byCategory, byId } from '../data/ingredients';
import { SIGNATURES } from '../data/signatures';
import type { FilterId, Order } from '../data/types';
import { countForFilters, countOrders, formatBig, percentOf } from './combinatorics';
import { excludedTags, FILTERS, filteredPools } from './filters';
import { counterScript, decodeShare, encodeShare, listJoin, orderTitle } from './order';
import { applyConstraints, effectiveWeight, orderKey, roll } from './randomizer';
import { createRng, dailySeed, freshSeed } from './rng';
import { scoreOrder, verdictFor } from './scoring';

const allIds = (o: Order) => [
  o.bread,
  o.protein,
  o.cheese,
  ...o.veggies,
  ...o.sauces,
  ...o.seasonings,
  ...o.extras,
];

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng('K3F9QZ');
    const b = createRng('K3F9QZ');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('differs across seeds and stays in [0,1)', () => {
    const a = createRng('A');
    const b = createRng('B');
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === b.next()) same++;
    }
    expect(same).toBe(0);
  });
  it('makes friendly seeds and a stable daily seed', () => {
    expect(freshSeed()).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    const d = new Date('2026-09-22T10:00:00Z');
    expect(dailySeed(d)).toBe(dailySeed(new Date('2026-09-22T23:59:00Z')));
    expect(dailySeed(d)).not.toBe(dailySeed(new Date('2026-09-23T00:00:00Z')));
  });
});

describe('combinatorics', () => {
  it('matches a hand-derived count for the full menu', () => {
    const p = filteredPools([]);
    // bread: 7 non-bowl × (2 sizes × 2 toast) + bowl × 1
    const bread = BigInt((p.bread.length - 1) * 4 + 1);
    // protein: none → ×(bacon,pep)=4; bacon → ×(double,pep)=4; pepperoni → ×(double,bacon)=4; rest ×8
    const protein = BigInt(4 + 4 + 4 + (p.protein.length - 3) * 8);
    // cheese: none → 1, others × extra-cheese 2
    const cheese = BigInt(1 + (p.cheese.length - 1) * 2);
    const subsets = 2n ** BigInt(p.veggie.length + p.sauce.length + p.seasoning.length);
    expect(countOrders(p)).toBe(bread * protein * cheese * subsets);
  });
  it('shrinks under filters', () => {
    const all = countForFilters([]);
    const vegan = countForFilters(['vegan']);
    expect(vegan).toBeGreaterThan(0n);
    expect(vegan).toBeLessThan(all);
  });
  it('formats BigInts', () => {
    expect(formatBig(2392537301840576n)).toBe('2,392,537,301,840,576');
    expect(percentOf(1n, 1000n)).toBe('0.1%');
    expect(percentOf(1n, 3n * 10n ** 15n)).toMatch(/^0\.0{12,}\d+%$/);
  });
});

describe('randomizer', () => {
  it('is deterministic for the same params', () => {
    const p = { seed: 'ABC234', mode: 'custom' as const, chaos: 40, filters: [], locks: [] };
    expect(roll(p).order).toEqual(roll(p).order);
  });

  it('every roll references real ingredients and obeys constraints (2k seeds × modes)', () => {
    for (const mode of ['custom', 'signature', 'nightmare', 'monk', 'daily'] as const) {
      for (let i = 0; i < 400; i++) {
        const { order } = roll({ seed: `S${i}`, mode, chaos: (i * 37) % 101, filters: [], locks: [] });
        for (const id of allIds(order)) expect(byId.has(id)).toBe(true);
        expect(applyConstraints(order)).toEqual(order);
        expect(new Set(order.veggies).size).toBe(order.veggies.length);
        if (mode === 'monk') {
          expect(order.veggies).toEqual([]);
          expect(order.sauces).toEqual([]);
          expect(order.protein).not.toBe('no-protein');
        }
      }
    }
  });

  it('never violates dietary filters (property test, 10k seeds)', () => {
    const filterSets: FilterId[][] = [
      ['vegan'],
      ['vegetarian'],
      ['pescatarian', 'dairy-free'],
      ['no-pork', 'no-heat'],
      ['gluten-free'],
    ];
    for (let i = 0; i < 10_000; i++) {
      const filters = filterSets[i % filterSets.length] as FilterId[];
      const ex = excludedTags(filters);
      const mode = (['custom', 'signature', 'nightmare'] as const)[i % 3] as 'custom';
      const { order } = roll({ seed: `F${i}`, mode, chaos: i % 101, filters, locks: [] });
      for (const id of allIds(order)) {
        for (const t of byId.get(id)!.tags) expect(ex.has(t), `${id} has ${t} under ${filters}`).toBe(false);
      }
    }
  });

  it('respects locks', () => {
    const first = roll({ seed: 'LOCK1', mode: 'custom', chaos: 80, filters: [], locks: [] }).order;
    for (let i = 0; i < 50; i++) {
      const next = roll({
        seed: `L${i}`,
        mode: 'custom',
        chaos: 80,
        filters: [],
        locks: ['bread', 'protein'],
        previous: first,
      }).order;
      expect(next.bread).toBe(first.bread);
      expect(next.protein).toBe(first.protein);
    }
  });

  it('chaos reshapes the distribution', () => {
    expect(effectiveWeight(0.2, 0)).toBeCloseTo(0.008);
    expect(effectiveWeight(0.2, 1)).toBe(1);
    const avgSauces = (chaos: number) => {
      let n = 0;
      for (let i = 0; i < 500; i++)
        n += roll({ seed: `C${i}`, mode: 'custom', chaos, filters: [], locks: [] }).order.sauces.length;
      return n / 500;
    };
    expect(avgSauces(0)).toBeLessThan(2.2);
    expect(avgSauces(100)).toBeGreaterThan(avgSauces(0) + 2);
  });

  it('safe rolls score better than chaos rolls on average', () => {
    const avg = (chaos: number) => {
      let s = 0;
      for (let i = 0; i < 500; i++)
        s += scoreOrder(roll({ seed: `H${i}`, mode: 'custom', chaos, filters: [], locks: [] }).order).score;
      return s / 500;
    };
    expect(avg(0)).toBeGreaterThan(avg(100) + 15);
  });
});

describe('scoring', () => {
  it('maps band boundaries', () => {
    expect(verdictFor(90).label).toBe("Chef's Kiss");
    expect(verdictFor(89).label).toBe('Solid Order');
    expect(verdictFor(15).label).toBe('Cursed');
    expect(verdictFor(14).label).toBe('A Crime Against Bread');
  });
  it('rates classics above abominations', () => {
    const bmt = SIGNATURES.find((s) => s.id === 'bmt')!.order;
    const crime: Order = {
      bread: 'wrap',
      size: 'footlong',
      toasted: true,
      protein: 'tuna',
      cheese: 'feta',
      veggies: ['pickles', 'olives', 'guacamole'],
      sauces: ['bbq', 'sweet-onion', 'caesar', 'honey-mustard', 'buffalo'],
      seasonings: ['parmesan'],
      extras: ['add-pepperoni'],
    };
    const good = scoreOrder(bmt);
    const bad = scoreOrder(crime);
    expect(good.score).toBeGreaterThanOrEqual(70);
    expect(bad.score).toBeLessThan(15);
    expect(bad.worst?.score).toBe(-3);
  });
});

describe('order text + share codec', () => {
  it('joins lists with an Oxford comma', () => {
    expect(listJoin(['a'])).toBe('a');
    expect(listJoin(['a', 'b'])).toBe('a and b');
    expect(listJoin(['a', 'b', 'c'])).toBe('a, b, and c');
  });

  it('writes a natural counter script', () => {
    const o: Order = {
      bread: 'herbs-cheese',
      size: 'footlong',
      toasted: true,
      protein: 'ham',
      cheese: 'provolone',
      veggies: ['lettuce', 'tomato', 'red-onion', 'banana-peppers'],
      sauces: ['chipotle-sw', 'oil'],
      seasonings: ['salt', 'pepper', 'oregano'],
      extras: [],
    };
    expect(counterScript(o)).toBe(
      'Hi! Can I get a footlong on Italian Herbs and Cheese, toasted, with Black Forest ham and provolone? ' +
        'Lettuce, tomatoes, red onions, and banana peppers. Chipotle southwest and a little oil. ' +
        'Salt, pepper, and oregano on top. Thanks!',
    );
  });

  it('handles edge cases: bowl, no veggies, no sauce, single veg, everything', () => {
    const bowl: Order = {
      bread: 'bowl',
      size: '6in',
      toasted: false,
      protein: 'no-protein',
      cheese: 'no-cheese',
      veggies: ['spinach'],
      sauces: [],
      seasonings: [],
      extras: [],
    };
    expect(counterScript(bowl)).toBe(
      'Hi! Can I get a protein bowl with no meat or cheese? Spinach. No sauce. Thanks!',
    );
    const all: Order = {
      ...bowl,
      bread: 'italian',
      size: '6in',
      protein: 'steak',
      veggies: byCategory.veggie.map((v) => v.id),
      extras: ['double-meat', 'add-bacon'],
    };
    const s = counterScript(all);
    expect(s).toContain('with double steak?');
    expect(s).toContain('Could you add bacon?');
    expect(s).toContain('Every single veggie');
    expect(orderTitle(all)).toBe('6-inch Shaved Steak on Italian');
  });

  it('round-trips share state', () => {
    for (let i = 0; i < 300; i++) {
      const filters = FILTERS.filter((_, j) => (i >> j) & 1 && j < 2).map((f) => f.id);
      const mode = (['custom', 'signature', 'nightmare', 'monk', 'daily'] as const)[i % 5] as 'custom';
      const { order } = roll({ seed: `R${i}X`.toUpperCase(), mode, chaos: i % 101, filters, locks: [] });
      const st = { seed: `R${i}X`.toUpperCase(), mode, chaos: i % 101, filters, order };
      const back = decodeShare(encodeShare(st));
      expect(back).not.toBeNull();
      expect(orderKey(back!.order)).toBe(orderKey(order));
      expect(back!.order.signature).toBe(order.signature);
      expect(back!.mode).toBe(mode);
      expect(back!.filters).toEqual(filters);
    }
  });

  it('rejects garbage share strings', () => {
    expect(decodeShare('')).toBeNull();
    expect(decodeShare('2.ABC.0.0.0.0.0.0.0.0.0.0.0..')).toBeNull();
    expect(decodeShare('1.abc<script>.0.0.0.0.0.0.0.0.0.0.0..')).toBeNull();
    expect(decodeShare('1.ABC.0.0.0.zz.0.0.0.0.0.0.0..')).toBeNull();
  });
});

describe('orderRank', () => {
  it('is unique and within [0, total) across many rolls', async () => {
    const { orderRank } = await import('./combinatorics');
    const total = countForFilters([]);
    const seen = new Map<bigint, string>();
    for (let i = 0; i < 3000; i++) {
      const { order } = roll({
        seed: `RK${i}`,
        mode: (['custom', 'nightmare', 'signature'] as const)[i % 3] as 'custom',
        chaos: i % 101,
        filters: [],
        locks: [],
      });
      const r = orderRank(order);
      expect(r >= 0n && r < total).toBe(true);
      const k = orderKey(order);
      const prev = seen.get(r);
      if (prev !== undefined) expect(prev).toBe(k);
      seen.set(r, k);
    }
  });
});
