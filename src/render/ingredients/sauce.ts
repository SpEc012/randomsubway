import type { ArtSpec } from '../../data/types';
import type { LayerCtx, LayerOut } from '../layer';
import { el, type Pt, smoothPath } from '../svg';

type Spec<K extends ArtSpec['kind']> = Extract<ArtSpec, { kind: K }>;

/**
 * A drizzle along the top of the fillings with drips down the front.
 * Main strokes carry class "pour" + pathLength=1 so the UI can draw them on.
 */
export function drizzle(ctx: LayerCtx, spec: Spec<'drizzle'>): LayerOut {
  const { rng, p } = ctx;
  const [c0, c1] = spec.palette as [string, string];
  const w = spec.width;
  const ph = ctx.index * 1.9 + rng.next() * 2;
  const pts: Pt[] = [];
  const step = 22 + rng.next() * 8;
  for (let x = ctx.x0 + 14; x <= ctx.x1 - 14; x += step) {
    pts.push([
      x + (rng.next() - 0.5) * 6,
      ctx.y - 2 - ctx.index * 1.5 + Math.sin(x * 0.045 + ph) * 4 + (rng.next() - 0.5) * 3,
    ]);
  }
  const line = smoothPath(pts);
  const drips: string[] = [];
  const drops: Pt[] = [];
  for (const [x, y] of pts) {
    if (!rng.chance(0.28)) continue;
    const len = 5 + rng.next() * 12;
    drips.push(
      `M${x.toFixed(1)} ${y.toFixed(1)}Q${(x + (rng.next() - 0.5) * 3).toFixed(1)} ${(y + len * 0.6).toFixed(1)} ${x.toFixed(1)} ${(y + len).toFixed(1)}`,
    );
    drops.push([x, y + len]);
  }
  const alpha = spec.clear ? 0.72 : 1;
  const g = el('g', { class: 'sauce', filter: p.fx('sheen'), opacity: alpha });
  const stroke = (d: string, color: string, width: number, extra: Record<string, string | number> = {}) =>
    el('path', {
      d,
      fill: 'none',
      stroke: color,
      'stroke-width': width,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      ...extra,
    });
  g.appendChild(stroke(line, c1, w + 1.8, { transform: 'translate(0 1.4)', class: 'pour', pathLength: 1 }));
  g.appendChild(stroke(line, c0, w, { class: 'pour', pathLength: 1 }));
  for (const d of drips) {
    g.appendChild(stroke(d, c1, w * 0.75 + 1, { class: 'drip' }));
    g.appendChild(stroke(d, c0, w * 0.75, { class: 'drip' }));
  }
  for (const [x, y] of drops)
    g.appendChild(el('circle', { class: 'drip', cx: x, cy: y, r: w * 0.55, fill: c0 }));
  g.appendChild(
    stroke(line, '#FFFFFF', Math.max(1, w * 0.28), {
      transform: `translate(0 ${(-w * 0.22).toFixed(1)})`,
      opacity: spec.clear ? 0.75 : 0.5,
      'stroke-dasharray': '18 26',
      class: 'pour-hi',
    }),
  );
  if (spec.flecks) {
    for (let i = 0; i < pts.length * 3; i++) {
      const [x, y] = pts[Math.floor(rng.next() * pts.length)] as Pt;
      g.appendChild(
        el('circle', {
          cx: x + (rng.next() - 0.5) * step,
          cy: y + (rng.next() - 0.5) * w * 0.5,
          r: 0.6 + rng.next() * 0.6,
          fill: spec.flecks,
          class: 'drip',
        }),
      );
    }
  }
  return { g, height: 1.5 };
}

/** Seasoning dust: salt, pepper, oregano flakes, parmesan, chili flakes. */
export function dust(ctx: LayerCtx, spec: Spec<'dust'>): LayerOut {
  const { rng } = ctx;
  const g = el('g', { class: 'dust' });
  const span = ctx.x1 - ctx.x0;
  const count = span / (spec.flake ? 4.5 : 2.6);
  for (let i = 0; i < count; i++) {
    const x = ctx.x0 + 6 + rng.next() * (span - 12);
    const y = ctx.y - rng.next() * 9 + 3;
    const s = spec.size * (0.55 + rng.next() * 0.7);
    const fill = rng.pick(spec.palette);
    if (spec.flake) {
      const pts: Pt[] = Array.from({ length: 4 }, (_, k) => {
        const a = (k / 4) * Math.PI * 2 + rng.next();
        return [
          x + Math.cos(a) * s * (0.6 + rng.next() * 0.8),
          y + Math.sin(a) * s * (0.4 + rng.next() * 0.6),
        ];
      });
      g.appendChild(
        el('path', {
          d: `M${pts.map(([a, b]) => `${a.toFixed(1)} ${b.toFixed(1)}`).join('L')}Z`,
          fill,
          opacity: 0.92,
        }),
      );
    } else {
      g.appendChild(el('circle', { cx: x, cy: y, r: s * 0.6, fill, opacity: 0.9 }));
    }
  }
  return { g, height: 0 };
}
