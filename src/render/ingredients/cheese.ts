import type { ArtSpec } from '../../data/types';
import { type LayerCtx, type LayerOut, layerGroup, spread } from '../layer';
import { blob, el, type Pt, shade, smoothPath } from '../svg';

type Spec<K extends ArtSpec['kind']> = Extract<ArtSpec, { kind: K }>;

/**
 * Subway-style triangle slices, overlapping, tips draping over the meat.
 * `melt` (0–1) lengthens and rounds the tips and grows drips.
 */
export function cheeseSlice(ctx: LayerCtx, spec: Spec<'cheeseSlice'>): LayerOut {
  const { rng, p, melt } = ctx;
  const [c0, c1, c2] = spec.palette as [string, string, string];
  const span = ctx.x1 - ctx.x0;
  const inner = el('g', {});
  const fill = p.linear([c0, c1, c2]);
  const rows = ctx.double ? [-4, 0] : [0];
  for (const off of rows) {
    for (const cx of spread(rng, ctx.x0 + 10, ctx.x1 - 10, span / 62, 0.45)) {
      const hw = 20 + rng.next() * 9;
      const top = ctx.y - 4 + off + (rng.next() - 0.5) * 3;
      const drop = 6 + rng.next() * 7 + melt * 12;
      const tipX = cx + (rng.next() - 0.5) * 10;
      const sag = melt * 5;
      const pts: Pt[] = [
        [cx - hw, top],
        [cx - hw * 0.1, top - 1.5],
        [cx + hw, top],
        [cx + hw * 0.55 + sag * 0.3, top + drop * 0.5 + sag],
        [tipX + 3 + melt * 3, top + drop - 1],
        [tipX, top + drop + melt * 4],
        [tipX - 3 - melt * 3, top + drop - 1],
        [cx - hw * 0.55 - sag * 0.3, top + drop * 0.5 + sag],
      ];
      const d = smoothPath(pts, true, 0.35 + melt * 0.55);
      inner.appendChild(
        el('path', {
          d,
          fill,
          stroke: shade(c2, -0.1),
          'stroke-width': 0.8,
          'stroke-opacity': 0.5,
          opacity: 0.93,
          transform: `rotate(${((rng.next() - 0.5) * 14).toFixed(1)} ${cx.toFixed(1)} ${top.toFixed(1)})`,
        }),
      );
      if (spec.holes) {
        for (let k = 0; k < 2; k++) {
          const hx = cx + (rng.next() - 0.5) * hw;
          const hy = top + 3 + rng.next() * drop * 0.4;
          inner.appendChild(
            el('ellipse', {
              cx: hx,
              cy: hy,
              rx: 2.8 + rng.next() * 2,
              ry: 1.8 + rng.next() * 1.2,
              fill: shade(c2, -0.14),
              opacity: 0.75,
            }),
          );
          inner.appendChild(
            el('ellipse', { cx: hx + 0.6, cy: hy + 0.7, rx: 2, ry: 1, fill: c0, opacity: 0.6 }),
          );
        }
      }
      if (spec.flecks) {
        for (let k = 0; k < 7; k++) {
          inner.appendChild(
            el('circle', {
              cx: cx + (rng.next() - 0.5) * hw * 1.2,
              cy: top + 1 + rng.next() * drop * 0.55,
              r: 0.7 + rng.next() * 0.8,
              fill: rng.pick(spec.flecks),
            }),
          );
        }
      }
      if (melt > 0.35 && rng.chance(0.6)) {
        const dx = cx + (rng.next() - 0.5) * hw;
        const len = (melt - 0.35) * 22;
        inner.appendChild(
          el('path', { d: blob(rng, dx, top + drop * 0.55 + len / 2, 2.2, len / 2 + 2, 0.1, 8), fill: c1 }),
        );
      }
    }
  }
  return { g: layerGroup(ctx, inner, p.fx('sheen')), height: ctx.double ? 9 : 5 };
}

export function cheeseShred(ctx: LayerCtx, spec: Spec<'cheeseShred'>): LayerOut {
  const { rng, p, melt } = ctx;
  const span = ctx.x1 - ctx.x0;
  const inner = el('g', {});
  const count = Math.round((span / 2.6) * (ctx.double ? 1.6 : 1) * (1 - melt * 0.35));
  const orange = p.linear([spec.palette[0] as string, spec.palette[1] as string]);
  const white = p.linear([spec.palette[2] as string, spec.palette[3] as string]);
  for (let i = 0; i < count; i++) {
    const x = ctx.x0 + 4 + rng.next() * (span - 8);
    const hang = rng.chance(0.25);
    const y = hang ? ctx.y + rng.next() * 6 : ctx.y - rng.next() * (ctx.double ? 12 : 8);
    const rx = (4.5 + rng.next() * 4) * (1 + melt * 0.9);
    const ry = (1.2 + rng.next() * 1) * (1 + melt * 1.3);
    const rot = hang ? 0.9 + rng.next() * 0.8 : (rng.next() - 0.5) * 2.2 * (1 - melt * 0.6);
    inner.appendChild(
      el('path', { d: blob(rng, x, y, rx, ry, 0.12, 8, rot), fill: rng.chance(0.55) ? orange : white }),
    );
  }
  return { g: layerGroup(ctx, inner, p.fx('sheen')), height: ctx.double ? 11 : 7 };
}

export function crumble(ctx: LayerCtx, spec: Spec<'crumble'>): LayerOut {
  const { rng, p } = ctx;
  const span = ctx.x1 - ctx.x0;
  const inner = el('g', {});
  const fill = p.radial(spec.palette, 0.35, 0.3, 0.8);
  for (let i = 0; i < (span / 8) * (ctx.double ? 1.6 : 1); i++) {
    const cx = ctx.x0 + 4 + rng.next() * (span - 8);
    const cy = ctx.y - rng.next() * 9 + (rng.chance(0.2) ? 5 : 0);
    const r = 2.8 + rng.next() * 3;
    const n = 5 + Math.floor(rng.next() * 2);
    const pts: Pt[] = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + rng.next() * 0.5;
      const rr = r * (0.7 + rng.next() * 0.45);
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.85];
    });
    inner.appendChild(
      el('path', {
        d: smoothPath(pts, true, 0.25),
        fill,
        stroke: spec.palette[2] as string,
        'stroke-width': 0.5,
      }),
    );
  }
  return { g: layerGroup(ctx, inner), height: 6 };
}
