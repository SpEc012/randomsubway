import { BOWL, byCategory, byId, INGREDIENTS, ing, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import { SIGNATURES, signatureById } from '../data/signatures';
import { type FilterId, MODES, type Mode, type Order } from '../data/types';
import { FILTERS } from './filters';

/** Spoken form: explicit `spoken`, else the name in lowercase ("Lettuce" → "lettuce"). */
const spoken = (id: string) => ing(id).spoken ?? ing(id).name.toLowerCase();

/** "a, b, and c" — Oxford comma, because we're not animals. */
export function listJoin(items: readonly string[], conj = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conj} ${items[items.length - 1]}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function sizeLabel(o: Order): string {
  if (o.bread === BOWL) return 'Bowl';
  return o.size === 'footlong' ? 'Footlong' : '6-inch';
}

/** Short display title, e.g. "Footlong Steak & Provolone on Sourdough". */
export function orderTitle(o: Order): string {
  if (o.signature) {
    const sig = signatureById.get(o.signature);
    if (sig) return o.mutations ? `${sig.name}, But Wrong` : sig.name;
  }
  const p = o.protein === NONE_PROTEIN ? 'Veggie' : shortName(o.protein);
  const c = o.cheese === NONE_CHEESE ? '' : ` & ${shortName(o.cheese)}`;
  if (o.bread === BOWL) return `${p}${c} Bowl`;
  return `${sizeLabel(o)} ${p}${c} on ${shortName(o.bread)}`;
}

function shortName(id: string): string {
  const n = ing(id).name;
  return n
    .replace(/\s*\(.*?\)\s*/g, ' ')
    .replace(/[®]/g, '')
    .replace(/-Style.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The script you read out loud at the counter. Natural clauses, not a comma dump.
 */
export function counterScript(o: Order, harmonyScore?: number): string {
  const parts: string[] = [];
  const extras = new Set(o.extras);

  const fillings: string[] = [];
  if (o.protein !== NONE_PROTEIN)
    fillings.push(`${extras.has('double-meat') ? 'double ' : ''}${spoken(o.protein)}`);
  if (o.cheese !== NONE_CHEESE)
    fillings.push(`${extras.has('extra-cheese') ? 'extra ' : ''}${spoken(o.cheese)}`);
  const withPart = fillings.length ? ` with ${listJoin(fillings)}` : ' with no meat or cheese';

  if (o.bread === BOWL) {
    parts.push(`Hi! Can I get a protein bowl${withPart}?`);
  } else {
    const size = o.size === 'footlong' ? 'footlong' : '6-inch';
    const toast = o.toasted ? ', toasted,' : '';
    parts.push(`Hi! Can I get a ${size} on ${spoken(o.bread)}${toast}${withPart}?`);
  }

  const addOns = o.extras.filter((e) => e === 'add-bacon' || e === 'add-pepperoni').map(spoken);
  if (addOns.length) parts.push(`Could you add ${listJoin(addOns)}?`);

  const vegCount = byCategory.veggie.length;
  if (o.veggies.length === 0) parts.push('No veggies, thanks.');
  else if (o.veggies.length === vegCount) parts.push('Every single veggie you have, please.');
  else parts.push(`${cap(listJoin(o.veggies.map(spoken)))}.`);

  if (o.sauces.length === 0) parts.push('No sauce.');
  else {
    const sauceWords = o.sauces.map((s) =>
      s === 'oil' || s === 'vinegar' ? `a little ${spoken(s)}` : spoken(s),
    );
    const tail = o.sauces.length >= 6 ? ' Yes, all of them.' : '';
    parts.push(`${cap(listJoin(sauceWords))}.${tail}`);
  }

  if (o.seasonings.length) parts.push(`${cap(listJoin(o.seasonings.map(spoken)))} on top.`);

  parts.push(harmonyScore !== undefined && harmonyScore < 15 ? "That's it. Please don't ask." : 'Thanks!');
  return parts.join(' ');
}

export interface Totals {
  kcal: number;
  price: number;
}

const BASE_PRICE = { '6in': 6.49, footlong: 10.99 } as const;

/** Approximate totals. Illustrative only — not official nutrition or pricing. */
export function totals(o: Order): Totals {
  const mult = o.bread !== BOWL && o.size === 'footlong' ? 2 : 1;
  const ids = [o.bread, o.protein, o.cheese, ...o.veggies, ...o.sauces, ...o.seasonings, ...o.extras];
  let kcal = 0;
  let price = o.bread === BOWL ? 9.49 : BASE_PRICE[o.size];
  for (const id of ids) {
    const i = ing(id);
    kcal += i.kcal * mult;
    price += i.price * (mult === 2 && i.category === 'extra' ? 1.6 : 1);
  }
  if (o.extras.includes('double-meat')) kcal += ing(o.protein).kcal * mult;
  if (o.extras.includes('extra-cheese')) kcal += ing(o.cheese).kcal * mult;
  return { kcal: Math.round(kcal / 10) * 10, price: Math.round(price * 100) / 100 };
}

// ── Share codec ────────────────────────────────────────────────────────────
// Compact, URL-safe: "1.SEED.mode.chaos.filters.bread.flags.protein.cheese.veg.sauce.season.extra.sig.mut"
// Indices are into the full (unfiltered) category lists, so links stay stable.

export interface ShareState {
  seed: string;
  mode: Mode;
  chaos: number;
  filters: FilterId[];
  order: Order;
}

const idx = (list: readonly { id: string }[], id: string) => list.findIndex((i) => i.id === id);
const mask = (list: readonly { id: string }[], ids: readonly string[]) =>
  ids.reduce((m, id) => m | (1 << idx(list, id)), 0).toString(36);
const unmask = (list: readonly { id: string }[], s: string) => {
  const m = Number.parseInt(s, 36);
  return list.filter((_, i) => (m >> i) & 1).map((i) => i.id);
};

export function encodeShare(st: ShareState): string {
  const o = st.order;
  const filterMask = FILTERS.reduce((m, f, i) => (st.filters.includes(f.id) ? m | (1 << i) : m), 0);
  const sigIdx = o.signature ? SIGNATURES.findIndex((s) => s.id === o.signature) : -1;
  return [
    '1',
    st.seed,
    MODES.indexOf(st.mode),
    Math.round(st.chaos).toString(36),
    filterMask.toString(36),
    idx(byCategory.bread, o.bread).toString(36),
    (o.size === 'footlong' ? 1 : 0) | (o.toasted ? 2 : 0),
    idx(byCategory.protein, o.protein).toString(36),
    idx(byCategory.cheese, o.cheese).toString(36),
    mask(byCategory.veggie, o.veggies),
    mask(byCategory.sauce, o.sauces),
    mask(byCategory.seasoning, o.seasonings),
    mask(byCategory.extra, o.extras),
    sigIdx >= 0 ? sigIdx.toString(36) : '',
    o.mutations ? o.mutations.toString(36) : '',
  ].join('.');
}

export function decodeShare(s: string): ShareState | null {
  try {
    const f = s.split('.');
    if (f[0] !== '1' || f.length !== 15) return null;
    const [, seed, modeI, chaos, filt, bread, flags, protein, cheese, veg, sauce, season, extra, sig, mut] =
      f as string[];
    if (!seed || !/^[0-9A-Z]{1,16}$/.test(seed)) return null;
    const mode = MODES[Number(modeI)];
    const b = byCategory.bread[Number.parseInt(bread as string, 36)];
    const p = byCategory.protein[Number.parseInt(protein as string, 36)];
    const c = byCategory.cheese[Number.parseInt(cheese as string, 36)];
    if (!mode || !b || !p || !c) return null;
    const fm = Number.parseInt(filt as string, 36);
    const fl = Number(flags);
    const order: Order = {
      bread: b.id,
      size: fl & 1 ? 'footlong' : '6in',
      toasted: !!(fl & 2),
      protein: p.id,
      cheese: c.id,
      veggies: unmask(byCategory.veggie, veg as string),
      sauces: unmask(byCategory.sauce, sauce as string),
      seasonings: unmask(byCategory.seasoning, season as string),
      extras: unmask(byCategory.extra, extra as string),
    };
    if (sig) {
      const sg = SIGNATURES[Number.parseInt(sig, 36)];
      if (sg) order.signature = sg.id;
    }
    if (mut) order.mutations = Number.parseInt(mut, 36);
    return {
      seed,
      mode,
      chaos: Math.max(0, Math.min(100, Number.parseInt(chaos as string, 36) || 0)),
      filters: FILTERS.filter((_, i) => (fm >> i) & 1).map((x) => x.id),
      order,
    };
  } catch {
    return null;
  }
}

/** Sanity check that every id in an order exists (guards hand-edited URLs). */
export function isValidOrder(o: Order): boolean {
  const ids = [o.bread, o.protein, o.cheese, ...o.veggies, ...o.sauces, ...o.seasonings, ...o.extras];
  return ids.every((id) => byId.has(id)) && INGREDIENTS.length > 0;
}
