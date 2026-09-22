import { byId, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import { affinity } from '../data/pairings';
import type { Order } from '../data/types';

export interface Verdict {
  min: number;
  label: string;
  tone: 'kiss' | 'good' | 'ok' | 'meh' | 'cursed' | 'crime';
}

export const VERDICTS: readonly Verdict[] = [
  { min: 90, label: "Chef's Kiss", tone: 'kiss' },
  { min: 70, label: 'Solid Order', tone: 'good' },
  { min: 50, label: 'Defensible', tone: 'ok' },
  { min: 30, label: 'Questionable', tone: 'meh' },
  { min: 15, label: 'Cursed', tone: 'cursed' },
  { min: 0, label: 'A Crime Against Bread', tone: 'crime' },
];

export interface PairNote {
  a: string;
  b: string;
  score: number;
}

export interface Harmony {
  score: number;
  verdict: Verdict;
  best?: PairNote;
  worst?: PairNote;
  raw: number;
}

export function verdictFor(score: number): Verdict {
  return VERDICTS.find((v) => score >= v.min) ?? (VERDICTS[VERDICTS.length - 1] as Verdict);
}

export function orderIds(o: Order): string[] {
  const ids = [o.bread];
  if (o.protein !== NONE_PROTEIN) ids.push(o.protein);
  if (o.cheese !== NONE_CHEESE) ids.push(o.cheese);
  return [...ids, ...o.veggies, ...o.sauces, ...o.seasonings, ...o.extras];
}

/**
 * Sum every pairwise affinity in the build, subtract structural sins (sauce
 * floods, bare dry bread, piling on), then squash through tanh into 0–100.
 */
export function scoreOrder(o: Order): Harmony {
  const ids = orderIds(o);
  let pos = 0;
  let neg = 0;
  let best: PairNote | undefined;
  let worst: PairNote | undefined;
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i] as string;
      const b = ids[j] as string;
      const s = affinity(a, b);
      if (s === 0) continue;
      if (s > 0) pos += s;
      else neg += s;
      if (!best || s > best.score) best = { a, b, score: s };
      if (!worst || s < worst.score) worst = { a, b, score: s };
    }
  }

  // Good pairings saturate (you can't out-classic a crime); bad ones compound.
  let raw = 7 * Math.tanh(pos / 9) + neg;
  const sauces = o.sauces.length;
  if (sauces > 3) raw -= (sauces - 3) * 1.6;
  if (o.veggies.length > 8) raw -= (o.veggies.length - 8) * 0.6;
  if (sauces === 0 && o.cheese === NONE_CHEESE && o.protein !== 'meatballs') raw -= 1.5; // dry
  if (o.protein === NONE_PROTEIN && o.veggies.length < 3) raw -= 3; // sad bread
  if (o.veggies.length >= 2 && sauces >= 1 && sauces <= 3) raw += 1.5; // balanced
  if (o.toasted && o.cheese !== NONE_CHEESE) raw += 1; // melt bonus
  const sweet = ids.filter((id) => byId.get(id)?.tags.includes('sweet')).length;
  if (sweet >= 3) raw -= (sweet - 2) * 1.5;
  const spicy = ids.filter((id) => byId.get(id)?.tags.includes('spicy')).length;
  if (spicy >= 5) raw -= (spicy - 4) * 1.2;

  const score = Math.round(Math.min(99, Math.max(1, 46 + 53 * Math.tanh(raw / 6))));
  const out: Harmony = { score, verdict: verdictFor(score), raw };
  if (best && best.score > 0) out.best = best;
  if (worst && worst.score < 0) out.worst = worst;
  return out;
}
