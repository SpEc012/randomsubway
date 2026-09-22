import type { ArtSpec } from '../../data/types';
import type { Rng } from '../../engine/rng';
import type { Paint } from '../filters';
import { type LayerCtx, type LayerOut, layerGroup, spread } from '../layer';
import { band, blob, el, noise1d, type Pt, shade, smoothPath } from '../svg';

type Spec<K extends ArtSpec['kind']> = Extract<ArtSpec, { kind: K }>;

/** Shredded iceberg: three ruffled bands plus loose shreds poking out everywhere. */
export function lettuce(ctx: LayerCtx, spec: Spec<'lettuce'>): LayerOut {
  const { rng, p } = ctx;
  const [pale, light, mid, deep] = spec.palette as [string, string, string, string];
  const t = 20;
  const bands = el('g', { filter: p.fx('organic') });
  const layers = [
    { top: 1.0, fill: p.linear([shade(deep, -0.12), shade(mid, -0.08), light]) },
    { top: 0.8, fill: p.linear([deep, mid, light, pale]) },
    { top: 0.55, fill: p.linear([mid, light, pale, pale]) },
  ];
  for (const L of layers) {
    const n1 = noise1d(rng, 0.03, 2);
    const n2 = noise1d(rng, 0.11, 2);
    const drape = noise1d(rng, 0.05, 2);
    const ph = rng.next() * 6;
    const top = (x: number) => ctx.y - t * L.top + n1(x) * 5 + Math.sin(x * 0.42 + ph) * 2.2 * (1 + n2(x));
    const bot = (x: number) => ctx.y + 1 + Math.max(0, drape(x)) * 11;
    bands.appendChild(el('path', { d: band(ctx.x0 - 4, ctx.x1 + 4, top, bot, 90), fill: L.fill }));
  }
  const shreds = el('g', { 'stroke-linecap': 'round', fill: 'none' });
  const span = ctx.x1 - ctx.x0;
  for (let i = 0; i < span / 7; i++) {
    const hang = rng.chance(0.3);
    const x = ctx.x0 + rng.next() * span;
    const y = hang ? ctx.y + rng.next() * 6 : ctx.y - rng.next() * t * 1.1;
    const a = hang
      ? Math.PI / 2 + (rng.next() - 0.5) * 1.2
      : (rng.next() - 0.5) * 1.6 + (rng.chance(0.5) ? Math.PI : 0);
    const len = 8 + rng.next() * 14;
    const ex = x + Math.cos(a) * len;
    const ey = y + Math.sin(a) * len;
    const bend = (rng.next() - 0.5) * 12;
    const d = `M${x.toFixed(1)} ${y.toFixed(1)}Q${((x + ex) / 2 + bend).toFixed(1)} ${((y + ey) / 2 - bend).toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
    const col = rng.pick([pale, light, light, mid]);
    shreds.appendChild(el('path', { d, stroke: shade(col, -0.12), 'stroke-width': 3.4 }));
    shreds.appendChild(el('path', { d, stroke: col, 'stroke-width': 2.2 }));
  }
  return { g: layerGroup(ctx, el('g', {}, bands, shreds)), height: t };
}

/** Baby spinach leaves with a pale midrib, some hanging over the edge. */
export function leaf(ctx: LayerCtx, spec: Spec<'leaf'>): LayerOut {
  const { rng, p } = ctx;
  const inner = el('g', {});
  const fill = p.linear(spec.palette as string[], 'd');
  for (const x of spread(rng, ctx.x0, ctx.x1, (ctx.x1 - ctx.x0) / 17)) {
    const hang = rng.chance(0.3);
    const y = hang ? ctx.y - 2 : ctx.y - 3 - rng.next() * 10;
    const len = 22 + rng.next() * 16;
    const wid = 9 + rng.next() * 7;
    const rot = hang ? 70 + rng.next() * 40 : (rng.next() - 0.5) * 60 + (rng.chance(0.5) ? 180 : 0);
    const d = `M0 0 C${len * 0.3} ${-wid} ${len * 0.8} ${-wid * 0.8} ${len} 0 C${len * 0.8} ${wid * 0.8} ${len * 0.3} ${wid} 0 0Z`;
    inner.appendChild(
      el(
        'g',
        { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(0)})` },
        el('path', { d, fill, stroke: shade(spec.palette[3] as string, -0.2), 'stroke-width': 0.7 }),
        el('path', {
          d: `M1 0 Q${len * 0.5} ${(rng.next() - 0.5) * 3} ${len * 0.92} 0`,
          stroke: '#9CCB78',
          'stroke-width': 1,
          fill: 'none',
          opacity: 0.7,
        }),
      ),
    );
  }
  return { g: layerGroup(ctx, inner, p.fx('gloss')), height: 12 };
}

function discSlice(
  p: Paint,
  rng: Rng,
  spec: Spec<'disc'>,
  cx: number,
  cy: number,
  r: number,
  tilt: number,
  rot: number,
): SVGGElement {
  const g = el('g', {
    transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(1 ${tilt.toFixed(3)})`,
  });
  if (spec.pattern === 'pickle') {
    const n = 22;
    const pts: Pt[] = Array.from({ length: n * 2 }, (_, i) => {
      const a = (i / (n * 2)) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.93 : 1);
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    g.appendChild(el('path', { d: smoothPath(pts, true, 0.5), fill: spec.rim }));
  } else {
    g.appendChild(el('circle', { r, fill: spec.rim }));
  }
  g.appendChild(
    el('circle', {
      r: r * (spec.pattern === 'cucumber' ? 0.9 : 0.86),
      fill: p.radial([spec.core, spec.flesh, shade(spec.flesh, -0.08)], 0.5, 0.5, 0.7),
    }),
  );
  if (spec.pattern === 'tomato') {
    const locules = 3 + Math.floor(rng.next() * 2);
    const a0 = rng.next() * Math.PI;
    for (let i = 0; i < locules; i++) {
      const a = a0 + (i / locules) * Math.PI * 2;
      const lx = Math.cos(a) * r * 0.5;
      const ly = Math.sin(a) * r * 0.5;
      g.appendChild(
        el('ellipse', {
          cx: lx,
          cy: ly,
          rx: r * 0.26,
          ry: r * 0.17,
          transform: `rotate(${((a * 180) / Math.PI).toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})`,
          fill: '#F6B26B',
          opacity: 0.9,
        }),
      );
      for (let s = 0; s < 3; s++) {
        g.appendChild(
          el('ellipse', {
            cx: lx + (rng.next() - 0.5) * r * 0.25,
            cy: ly + (rng.next() - 0.5) * r * 0.15,
            rx: 1.4,
            ry: 0.9,
            fill: '#F9E5A6',
          }),
        );
      }
    }
    g.appendChild(el('circle', { r: r * 0.16, fill: shade(spec.flesh, 0.25), opacity: 0.8 }));
  } else {
    const seeds = spec.pattern === 'cucumber' ? 10 : 7;
    for (let i = 0; i < seeds; i++) {
      const a = (i / seeds) * Math.PI * 2 + rng.next() * 0.3;
      g.appendChild(
        el('ellipse', {
          cx: Math.cos(a) * r * 0.36,
          cy: Math.sin(a) * r * 0.36,
          rx: 1.6,
          ry: 0.9,
          transform: `rotate(${((a * 180) / Math.PI).toFixed(0)} ${(Math.cos(a) * r * 0.36).toFixed(1)} ${(Math.sin(a) * r * 0.36).toFixed(1)})`,
          fill: spec.pattern === 'cucumber' ? '#F2F8E2' : '#E9EBB5',
          opacity: 0.9,
        }),
      );
    }
  }
  return g;
}

/** Tomato / cucumber / pickle slices tilted toward the camera. */
export function disc(ctx: LayerCtx, spec: Spec<'disc'>): LayerOut {
  const { rng, p } = ctx;
  const inner = el('g', {});
  const span = ctx.x1 - ctx.x0;
  const r = spec.size;
  const t = r * 0.55 + 2;
  // Back row peeks out behind, front row overlaps, some slices droop over the edge.
  for (const x of spread(rng, ctx.x0 + r * 0.6, ctx.x1 - r * 0.6, span / (r * 2.9), 0.6)) {
    inner.appendChild(
      discSlice(
        p,
        rng,
        spec,
        x,
        ctx.y - t * (0.55 + rng.next() * 0.3),
        r * (0.8 + rng.next() * 0.25),
        0.3 + rng.next() * 0.14,
        (rng.next() - 0.5) * 22,
      ),
    );
  }
  for (const x of spread(rng, ctx.x0 + r * 0.4, ctx.x1 - r * 0.4, span / (r * 2.4), 0.6)) {
    const droop = rng.chance(0.4);
    const y = ctx.y - t * (0.1 + rng.next() * 0.35) + (droop ? 5 + rng.next() * 3 : 0);
    inner.appendChild(
      discSlice(
        p,
        rng,
        spec,
        x,
        y,
        r * (0.85 + rng.next() * 0.25),
        droop ? 0.62 + rng.next() * 0.22 : 0.36 + rng.next() * 0.16,
        (rng.next() - 0.5) * (droop ? 44 : 24),
      ),
    );
  }
  return { g: layerGroup(ctx, inner, p.fx('gloss')), height: t };
}

/** Bell pepper slivers: glossy crescents with a pale cut face. */
export function strip(ctx: LayerCtx, spec: Spec<'strip'>): LayerOut {
  const { rng, p } = ctx;
  const [c0, c1, c2, c3] = spec.palette as [string, string, string, string];
  const inner = el('g', {});
  const fill = p.linear([c0, c1, c2]);
  for (const x of spread(rng, ctx.x0, ctx.x1, (ctx.x1 - ctx.x0) / 17)) {
    const R = 16 + rng.next() * 10;
    const w = 4.5 + rng.next() * 2;
    const a0 = -Math.PI * (0.15 + rng.next() * 0.2);
    const a1 = -Math.PI * (0.65 + rng.next() * 0.25);
    const arc = (rad: number, from: number, to: number): Pt[] =>
      Array.from({ length: 8 }, (_, i) => {
        const a = from + ((to - from) * i) / 7;
        return [Math.cos(a) * rad, Math.sin(a) * rad];
      });
    const pts = [...arc(R, a0, a1), ...arc(R - w, a1, a0)];
    const y = ctx.y - 2 - rng.next() * 10;
    const rot = (rng.next() - 0.5) * 70 + (rng.chance(0.5) ? 180 : 0);
    inner.appendChild(
      el(
        'g',
        { transform: `translate(${x.toFixed(1)} ${(y + R * 0.6).toFixed(1)}) rotate(${rot.toFixed(0)})` },
        el('path', { d: smoothPath(pts, true, 0.6), fill, stroke: c3, 'stroke-width': 0.7 }),
        el('path', {
          d: smoothPath(arc(R - w + 0.8, a1, a0)),
          fill: 'none',
          stroke: '#D6F0B4',
          'stroke-width': 1.3,
          opacity: 0.8,
        }),
      ),
    );
  }
  return { g: layerGroup(ctx, inner, p.fx('gloss')), height: 10 };
}

function ringItem(
  p: Paint,
  rng: Rng,
  spec: Spec<'ring'>,
  isOnion: boolean,
  cx: number,
  cy: number,
  r: number,
  tilt: number,
  rot: number,
): SVGGElement {
  const [c0, c1, c2, c3] = spec.palette as [string, string, string, string];
  const g = el('g', {
    transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(1 ${tilt.toFixed(3)})`,
  });
  if (isOnion) {
    const rings = 2 + Math.floor(rng.next() * 2);
    for (let k = 0; k < rings; k++) {
      const rr = r * (1 - k * 0.24);
      const circ = 2 * Math.PI * rr;
      const gap = rng.chance(0.5)
        ? `${(circ * (0.55 + rng.next() * 0.4)).toFixed(1)} ${circ.toFixed(1)}`
        : undefined;
      g.appendChild(
        el('circle', {
          r: rr,
          fill: 'none',
          stroke: c2,
          'stroke-width': 4.2,
          'stroke-dasharray': gap,
          'stroke-linecap': 'round',
        }),
      );
      g.appendChild(
        el('circle', {
          r: rr - 0.9,
          fill: 'none',
          stroke: rng.pick([c0, c1]),
          'stroke-width': 2.4,
          'stroke-dasharray': gap,
          'stroke-linecap': 'round',
          opacity: 0.95,
        }),
      );
    }
    return g;
  }
  const hole = spec.seeds && spec.size < 14 ? 0 : r * (spec.seeds ? 0.7 : 0.42);
  const d = `M${r} 0A${r} ${r} 0 1 0 ${-r} 0A${r} ${r} 0 1 0 ${r} 0Z${hole ? `M${hole} 0A${hole} ${hole} 0 1 1 ${-hole} 0A${hole} ${hole} 0 1 1 ${hole} 0Z` : ''}`;
  g.appendChild(el('path', { d, 'fill-rule': 'evenodd', fill: p.radial([c1, c2, c3], 0.4, 0.3, 0.75) }));
  if (spec.seeds) {
    if (!hole) g.appendChild(el('circle', { r: r * 0.72, fill: p.radial([c0, shade(c0, -0.1)], 0.5, 0.5) }));
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * Math.PI * 2;
      const d2 = (hole ? r * 0.78 : r * 0.35) * (0.6 + rng.next() * 0.4);
      g.appendChild(
        el('ellipse', { cx: Math.cos(a) * d2, cy: Math.sin(a) * d2, rx: 1.5, ry: 1, fill: spec.seeds }),
      );
    }
  }
  return g;
}

/** Onion rings, olive rings, jalapeño and banana-pepper rings. */
export function ring(ctx: LayerCtx, spec: Spec<'ring'>, id: string): LayerOut {
  const { rng, p } = ctx;
  const inner = el('g', {});
  const r = spec.size;
  const isOnion = id === 'red-onion';
  const span = ctx.x1 - ctx.x0;
  const density = isOnion ? span / (r * 2.2) : span / (r * 2.6);
  for (const x of spread(rng, ctx.x0 + r, ctx.x1 - r, density)) {
    const droop = rng.chance(0.3);
    const y = ctx.y - r * 0.35 - rng.next() * 5 + (droop ? 3 : 0);
    inner.appendChild(
      ringItem(
        p,
        rng,
        spec,
        isOnion,
        x,
        y,
        r * (0.85 + rng.next() * 0.25),
        droop ? 0.55 + rng.next() * 0.25 : 0.3 + rng.next() * 0.15,
        (rng.next() - 0.5) * (droop ? 40 : 20),
      ),
    );
  }
  const surface = isOnion ? p.fx('sheen') : p.fx('gloss');
  return { g: layerGroup(ctx, inner, surface), height: Math.max(6, r * 0.5) };
}

/** Smashed avocado / guacamole: a mottled, chunky spread. */
export function spreadLayer(ctx: LayerCtx, spec: Spec<'spread'>): LayerOut {
  const { rng, p } = ctx;
  const [c0, c1, c2, c3] = spec.palette as [string, string, string, string];
  const t = 11;
  const n1 = noise1d(rng, 0.05, 3);
  const n2 = noise1d(rng, 0.04, 2);
  const d = band(
    ctx.x0,
    ctx.x1,
    (x) => ctx.y - t + n1(x) * 3.5,
    (x) => ctx.y + 2 + Math.max(0, n2(x)) * 6,
    60,
  );
  const clip = p.uid('clip');
  p.defs.appendChild(el('clipPath', { id: clip }, el('path', { d })));
  const inner = el('g', {}, el('path', { d, fill: p.linear([c0, c1, c2]) }));
  const mottle = el('g', { 'clip-path': `url(#${clip})` });
  const span = ctx.x1 - ctx.x0;
  for (let i = 0; i < span / 9; i++) {
    const x = ctx.x0 + rng.next() * span;
    const y = ctx.y - rng.next() * t;
    mottle.appendChild(
      el('path', {
        d: blob(rng, x, y, 3 + rng.next() * 6, 2 + rng.next() * 3, 0.35, 8),
        fill: rng.chance(0.5) ? c0 : c3,
        opacity: 0.35 + rng.next() * 0.3,
      }),
    );
  }
  if (spec.bits) {
    for (let i = 0; i < span / 10; i++) {
      mottle.appendChild(
        el('path', {
          d: blob(
            rng,
            ctx.x0 + rng.next() * span,
            ctx.y - rng.next() * t,
            1.4 + rng.next() * 1.6,
            1 + rng.next(),
            0.3,
            6,
          ),
          fill: rng.pick(spec.bits),
        }),
      );
    }
  }
  inner.appendChild(mottle);
  return { g: layerGroup(ctx, inner, p.fx('sheen')), height: t };
}
