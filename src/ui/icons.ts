import { ing } from '../data/ingredients';
import { createRng } from '../engine/rng';
import { Paint } from '../render/filters';
import { bowlBack, bowlFront, breadBottom, breadTop } from '../render/ingredients/bread';
import type { LayerCtx } from '../render/layer';
import { renderLayer } from '../render/sandwich';
import { blob, el, NS, shade } from '../render/svg';

const cache = new Map<string, string>();
let n = 0;

/** A small, filter-free ingredient icon drawn by the same engine as the stage. Cached as markup. */
export function iconMarkup(id: string): string {
  const hit = cache.get(id);
  if (hit) return hit;
  const markup = build(id).outerHTML;
  cache.set(id, markup);
  return markup;
}

function frame(viewBox: string, ...children: SVGElement[]): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'ico');
  svg.append(...children);
  return svg;
}

function build(id: string): SVGSVGElement {
  const item = ing(id);
  const p = new Paint(`ic${n++}`, true);
  const rng = createRng(`icon:${id}`);
  const a = item.art;

  if (a.kind === 'bread') {
    if (a.style === 'bowl')
      return frame('0 4 120 56', p.defs, bowlBack(p, 60, 104, 30), bowlFront(p, 60, 104, 30, 26));
    const g = {
      x0: 6,
      x1: 114,
      hb: a.style === 'flatbread' ? 9 : 15,
      ht: a.style === 'flatbread' ? 11 : 24,
      endPow: 0.5,
    };
    return frame(
      '0 6 120 50',
      p.defs,
      breadBottom(p, rng, a.style, a.palette, g, 38),
      breadTop(p, rng.fork('t'), a.style, a.palette, g, 36, a.style === 'wrap' ? 4 : 0),
    );
  }
  if (a.kind === 'none') {
    if (id === 'double-meat' || id === 'extra-cheese') {
      const fill = id === 'double-meat' ? '#B8594A' : '#F2B33D';
      return frame(
        '0 0 120 56',
        el('circle', { cx: 60, cy: 28, r: 20, fill, opacity: 0.18 }),
        el(
          'text',
          {
            x: 60,
            y: 37,
            'text-anchor': 'middle',
            'font-size': 26,
            'font-weight': 800,
            fill,
            'font-family': 'system-ui, sans-serif',
          },
          document.createTextNode(id === 'double-meat' ? '2×' : '+'),
        ),
      );
    }
    return frame(
      '0 0 120 56',
      el('circle', {
        cx: 60,
        cy: 28,
        r: 17,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 3,
        'stroke-dasharray': '5 5',
        opacity: 0.45,
      }),
      el('line', {
        x1: 48,
        y1: 40,
        x2: 72,
        y2: 16,
        stroke: 'currentColor',
        'stroke-width': 3,
        opacity: 0.45,
        'stroke-linecap': 'round',
      }),
    );
  }
  if (a.kind === 'drizzle') {
    const [c0, c1] = a.palette as [string, string];
    return frame(
      '0 0 120 56',
      p.defs,
      el('path', { d: blob(rng, 60, 36, 30, 12, 0.1, 12), fill: c1, opacity: a.clear ? 0.75 : 1 }),
      el('path', { d: blob(rng, 60, 30, 24, 13, 0.14, 12), fill: c0, opacity: a.clear ? 0.8 : 1 }),
      el('path', { d: 'M60 8 Q70 18 62 26 Q54 18 60 8Z', fill: c0, opacity: a.clear ? 0.8 : 1 }),
      el('ellipse', { cx: 52, cy: 25, rx: 8, ry: 3, fill: '#fff', opacity: 0.55 }),
    );
  }
  if (a.kind === 'dust') {
    const g = el('g', {});
    for (let i = 0; i < 70; i++) {
      const r = Math.sqrt(rng.next());
      const ang = rng.next() * Math.PI;
      g.appendChild(
        el('circle', {
          cx: 60 + Math.cos(ang) * r * 34,
          cy: 44 - Math.sin(ang) * r * 20,
          r: a.size * (0.5 + rng.next() * 0.6),
          fill: rng.pick(a.palette),
        }),
      );
    }
    const base = shade(a.palette[0] as string, 0.6);
    return frame(
      '0 0 120 56',
      el('ellipse', { cx: 60, cy: 46, rx: 38, ry: 5, fill: base, opacity: 0.25 }),
      g,
    );
  }
  const ctx: LayerCtx = { p, rng, x0: 10, x1: 110, y: 42, melt: 0, double: false, index: 0 };
  const out = renderLayer(ctx, item);
  return frame('0 4 120 52', p.defs, ...(out ? [out.g] : []));
}
