import { BOWL, byCategory, ing, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import type { BreadStyle, Ingredient, Order } from '../data/types';
import { orderKey } from '../engine/randomizer';
import { createRng, type Rng } from '../engine/rng';
import { Paint } from './filters';
import { bowlBack, bowlFront, breadBottom, breadGeom, breadTop } from './ingredients/bread';
import { cheeseShred, cheeseSlice, crumble } from './ingredients/cheese';
import { bacon, chunks, deliMix, fold, meatballs, omelet, patty, rounds, tuna } from './ingredients/meat';
import { drizzle, dust } from './ingredients/sauce';
import { disc, leaf, lettuce, ring, spreadLayer, strip } from './ingredients/veg';
import type { LayerCtx, LayerOut } from './layer';
import { PHOTOS } from './photos';
import { el, NS } from './svg';

export type Part =
  | 'plate'
  | 'bread'
  | 'protein'
  | 'cheese'
  | 'veggies'
  | 'sauces'
  | 'seasonings'
  | 'extras'
  | 'lid'
  | 'front';
export const PARTS: readonly Part[] = [
  'plate',
  'bread',
  'protein',
  'cheese',
  'veggies',
  'sauces',
  'seasonings',
  'extras',
  'lid',
  'front',
];

export interface SandwichArt {
  svg: SVGSVGElement;
  paint: Paint;
  parts: Record<Part, SVGGElement>;
  /** Individual layer groups per part, bottom-up, for staggered reveals. */
  items: Record<Part, SVGGElement[]>;
  /** Group wrapping everything (heat shimmer target). */
  root: SVGGElement;
  setToast(t: number): void;
  setShimmer(amount: number): void;
  viewBox: { x: number; y: number; w: number; h: number };
}

export interface BuildOpts {
  seed: string;
  prefix?: string;
  lite?: boolean;
  /** Render already toasted & melted (static snapshots). */
  finished?: boolean;
}

let instance = 0;

export const GROUND = 440;
const VIEW_W = 1000;

/** Dispatch an ingredient to its procedural renderer. */
export function renderLayer(ctx: LayerCtx, item: Ingredient): LayerOut | null {
  const photo = PHOTOS.get(item.id);
  if (photo) return photoLayer(ctx, photo, item);
  const a = item.art;
  switch (a.kind) {
    case 'fold':
      return fold(ctx, a);
    case 'rounds':
      return rounds(ctx, a);
    case 'deliMix':
      return deliMix(ctx, a);
    case 'chunks':
      return chunks(ctx, a);
    case 'meatballs':
      return meatballs(ctx, a);
    case 'tuna':
      return tuna(ctx, a);
    case 'bacon':
      return bacon(ctx, a);
    case 'omelet':
      return omelet(ctx, a);
    case 'patty':
      return patty(ctx, a);
    case 'cheeseSlice':
      return cheeseSlice(ctx, a);
    case 'cheeseShred':
      return cheeseShred(ctx, a);
    case 'crumble':
      return crumble(ctx, a);
    case 'lettuce':
      return lettuce(ctx, a);
    case 'leaf':
      return leaf(ctx, a);
    case 'disc':
      return disc(ctx, a);
    case 'strip':
      return strip(ctx, a);
    case 'ring':
      return ring(ctx, a, item.id);
    case 'spread':
      return spreadLayer(ctx, a);
    case 'drizzle':
      return drizzle(ctx, a);
    case 'dust':
      return dust(ctx, a);
    default:
      return null;
  }
}

const PHOTO_H: Record<string, number> = { protein: 26, cheese: 8, veggie: 14, extra: 12 };

function photoLayer(ctx: LayerCtx, url: string, item: Ingredient): LayerOut {
  const h = PHOTO_H[item.category] ?? 12;
  const mask = ctx.p.uid('mask');
  ctx.p.defs.appendChild(
    el(
      'mask',
      { id: mask },
      el('rect', {
        x: ctx.x0,
        y: ctx.y - h - 4,
        width: ctx.x1 - ctx.x0,
        height: h + 12,
        fill: ctx.p.linear(['#000', '#fff', '#fff', '#000'], 'h'),
      }),
    ),
  );
  const img = el('image', {
    href: url,
    x: ctx.x0,
    y: ctx.y - h - 4,
    width: ctx.x1 - ctx.x0,
    height: h + 12,
    preserveAspectRatio: 'xMidYMid slice',
    mask: `url(#${mask})`,
  });
  return { g: el('g', { filter: ctx.p.fx('shadow') }, img), height: h };
}

/** Spreads go down first, then the canonical build order. */
function veggieOrder(ids: readonly string[]): string[] {
  const spreads = ids.filter((id) => ing(id).art.kind === 'spread');
  const rest = ids.filter((id) => ing(id).art.kind !== 'spread');
  return [...spreads, ...rest];
}

export function buildSandwich(order: Order, opts: BuildOpts): SandwichArt {
  const prefix = opts.prefix ?? `sw${instance++}`;
  const paint = new Paint(prefix, opts.lite);
  const art: Rng = createRng(`${opts.seed}~${orderKey(order)}`);
  const bread = ing(order.bread);
  if (bread.art.kind !== 'bread') throw new Error('bread art expected');
  const style: BreadStyle = bread.art.style;
  const pal = bread.art.palette;
  const isBowl = order.bread === BOWL;
  const isWrap = style === 'wrap';
  const footlong = order.size === 'footlong';

  const parts = Object.fromEntries(PARTS.map((p) => [p, el('g', { 'data-part': p })])) as Record<
    Part,
    SVGGElement
  >;
  const items = Object.fromEntries(PARTS.map((p) => [p, [] as SVGGElement[]])) as Record<Part, SVGGElement[]>;
  const add = (part: Part, g: SVGGElement) => {
    parts[part].appendChild(g);
    items[part].push(g);
  };

  const cx = VIEW_W / 2;
  const span = isBowl ? 560 : isWrap ? (footlong ? 720 : 430) : footlong ? 760 : 450;
  const x0 = cx - span / 2;
  const x1 = cx + span / 2;

  // Base + filling span.
  let y: number;
  let yCut = GROUND;
  let fx0: number;
  let fx1: number;
  const geom = breadGeom(style, x0, x1);
  const bowlRim = GROUND - 116;
  if (isBowl) {
    y = bowlRim + 34;
    fx0 = cx - 236;
    fx1 = cx + 236;
    add('bread', bowlBack(paint, cx, span, bowlRim));
  } else {
    yCut = GROUND - geom.hb;
    add('bread', breadBottom(paint, art.fork('bread-bottom'), style, pal, geom, yCut));
    y = yCut + 3;
    const inset = style === 'flatbread' ? 14 : isWrap ? 34 : 24;
    fx0 = x0 + inset;
    fx1 = x1 - inset;
  }

  const extras = new Set(order.extras);
  const ctxFor = (key: string, index = 0, extra: Partial<LayerCtx> = {}): LayerCtx => ({
    p: paint,
    rng: art.fork(key),
    x0: fx0,
    x1: fx1,
    y,
    melt: 0,
    double: false,
    index,
    ...extra,
  });
  const stack = (part: Part, out: LayerOut | null, rise = 0.88) => {
    if (!out) return;
    add(part, out.g);
    y -= out.height * rise;
    if (isBowl) {
      // Heap into a mound: each layer a little narrower than the last.
      const shrink = (fx1 - fx0) * 0.06;
      fx0 += shrink / 2;
      fx1 -= shrink / 2;
    }
  };

  if (order.protein !== NONE_PROTEIN)
    stack(
      'protein',
      renderLayer(ctxFor('protein', 0, { double: extras.has('double-meat') }), ing(order.protein)),
    );

  // Cheese: re-renderable for the melt animation.
  let setMelt: (m: number) => void = () => {};
  if (order.cheese !== NONE_CHEESE) {
    const cheeseY = y;
    const holder = el('g', {});
    const draw = (m: number) => {
      const out = renderLayer(
        { ...ctxFor('cheese', 0, { double: extras.has('extra-cheese'), melt: m }), y: cheeseY },
        ing(order.cheese),
      );
      holder.replaceChildren(...(out ? [out.g] : []));
      return out;
    };
    const first = draw(0);
    add('cheese', holder);
    y -= (first?.height ?? 0) * 0.9;
    setMelt = (m) => {
      draw(m);
    };
  }

  veggieOrder(order.veggies).forEach((id, i) =>
    stack('veggies', renderLayer(ctxFor(`veg:${id}`, i), ing(id)), 0.8),
  );
  order.sauces.forEach((id, i) => stack('sauces', renderLayer(ctxFor(`sauce:${id}`, i), ing(id)), 1));
  order.seasonings.forEach((id, i) =>
    stack('seasonings', renderLayer(ctxFor(`season:${id}`, i), ing(id)), 1),
  );
  for (const id of order.extras) {
    const item = ing(id);
    if (item.art.kind === 'none') continue;
    stack('extras', renderLayer(ctxFor(`extra:${id}`), item), 0.85);
  }

  // Lid / enclosure.
  let top: number;
  if (isBowl) {
    add('front', bowlFront(paint, cx, span, bowlRim, 112));
    top = Math.min(y - 20, bowlRim - 30);
  } else {
    const lidY = y + 7;
    add('lid', breadTop(paint, art.fork('bread-top'), style, pal, geom, lidY, isWrap ? yCut - lidY + 4 : 0));
    top = lidY - geom.ht * 1.1;
  }

  // Soft contact shadow on the surface.
  add(
    'plate',
    el('ellipse', {
      cx,
      cy: GROUND + 3,
      rx: span / 2 + 26,
      ry: 15,
      fill: paint.radial(['#1d1208', '#1d1208'], 0.5, 0.5, 0.5, [0.34, 0]),
    }),
  );

  const toastTargets: Part[] = ['bread', 'lid', 'front'];
  if (order.toasted && !isBowl && !opts.lite)
    for (const t of toastTargets) parts[t].setAttribute('filter', paint.fx('toast') as string);

  const root = el('g', { class: 'sandwich-root' }, ...PARTS.map((p) => parts[p]));
  const vbY = Math.min(GROUND - 250, top - 30);
  const viewBox = { x: 0, y: vbY, w: VIEW_W, h: GROUND + 44 - vbY };
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y.toFixed(1)} ${viewBox.w} ${viewBox.h.toFixed(1)}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.setAttribute('role', 'img');
  svg.append(paint.defs, root);

  const result: SandwichArt = {
    svg,
    paint,
    parts,
    items,
    root,
    viewBox,
    setToast(t: number) {
      if (!order.toasted || isBowl) return;
      paint.setToast(t);
      setMelt(Math.min(1, t * 1.15));
    },
    setShimmer(amount: number) {
      if (amount > 0.01) root.setAttribute('filter', paint.fx('shimmer') ?? '');
      else root.removeAttribute('filter');
      paint.setShimmer(amount);
    },
  };
  if (opts.finished) result.setToast(1);
  return result;
}

/** All ingredient ids that have art, for icon pre-rendering. */
export const DRAWABLE = [...byCategory.protein, ...byCategory.cheese, ...byCategory.veggie].filter(
  (i) => i.art.kind !== 'none',
);
