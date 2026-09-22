import type { ArtSpec } from '../../data/types';
import type { Rng } from '../../engine/rng';
import type { Paint } from '../filters';
import { type LayerCtx, type LayerOut, layerGroup, spread } from '../layer';
import { band, blob, el, noise1d, type Pt, shade, smoothPath } from '../svg';

type Spec<K extends ArtSpec['kind']> = Extract<ArtSpec, { kind: K }>;

/** Folded deli slices (turkey, ham, roast beef): ruffled overlapping folds that drape over the bread lip. */
function foldItems(
  ctx: LayerCtx,
  g: SVGGElement,
  palette: readonly string[],
  marble: string | undefined,
  t: number,
  density = 1,
  yOff = 0,
): void {
  const { rng, p } = ctx;
  const [c0, c1, c2, c3] = palette as [string, string, string, string];
  const span = ctx.x1 - ctx.x0;
  // Back row, a touch darker and higher.
  for (const cx of spread(rng, ctx.x0 + 8, ctx.x1 - 8, (span / 46) * density)) {
    const cy = ctx.y - t * 0.62 + yOff + (rng.next() - 0.5) * 3;
    g.appendChild(
      el('path', {
        d: blob(rng, cx, cy, 28 + rng.next() * 12, 9 + rng.next() * 4, 0.16, 11, (rng.next() - 0.5) * 0.3),
        fill: p.linear([shade(c1, -0.08), shade(c2, -0.12)]),
      }),
    );
  }
  // Front row: each fold with a crease and an edge.
  for (const cx of spread(rng, ctx.x0 + 4, ctx.x1 - 4, (span / 40) * density)) {
    const drape = rng.next() < 0.55 ? 4 + rng.next() * 6 : 0;
    const cy = ctx.y - t * 0.32 + drape * 0.5 + yOff + (rng.next() - 0.5) * 3;
    const rx = 24 + rng.next() * 12;
    const ry = 9 + rng.next() * 4 + drape * 0.4;
    const rot = (rng.next() - 0.5) * 0.36;
    g.appendChild(
      el('path', {
        d: blob(rng, cx, cy, rx, ry, 0.14, 12, rot),
        fill: p.linear([c0, c1, c2]),
        stroke: c3,
        'stroke-width': 1.1,
        'stroke-opacity': 0.45,
      }),
    );
    const crease = smoothPath([
      [cx - rx * 0.75, cy - ry * 0.1],
      [cx - rx * 0.1, cy - ry * 0.45 + (rng.next() - 0.5) * 3],
      [cx + rx * 0.7, cy - ry * 0.05],
    ]);
    g.appendChild(
      el('path', {
        d: crease,
        fill: 'none',
        stroke: shade(c2, -0.18),
        'stroke-width': 1.2,
        opacity: 0.4,
        'stroke-linecap': 'round',
      }),
    );
    g.appendChild(
      el('ellipse', {
        cx: cx - rx * 0.3,
        cy: cy - ry * 0.45,
        rx: rx * 0.35,
        ry: ry * 0.22,
        fill: '#FFFFFF',
        opacity: 0.22,
      }),
    );
    if (marble && rng.chance(0.7)) {
      const m = smoothPath([
        [cx - rx * 0.5, cy + ry * 0.1],
        [cx - rx * 0.1, cy + ry * 0.3],
        [cx + rx * 0.3, cy + ry * 0.05],
        [cx + rx * 0.55, cy + ry * 0.25],
      ]);
      g.appendChild(
        el('path', {
          d: m,
          fill: 'none',
          stroke: marble,
          'stroke-width': 1.4,
          opacity: 0.55,
          'stroke-linecap': 'round',
        }),
      );
    }
  }
}

/** A round cured slice (pepperoni/salami) seen at a tilt, drawn in circle space. */
export function roundSlice(
  p: Paint,
  rng: Rng,
  cx: number,
  cy: number,
  r: number,
  palette: readonly string[],
  fleck: string,
  tilt: number,
  rot: number,
): SVGGElement {
  const [c0, c1, c2] = palette as [string, string, string];
  const g = el('g', {
    transform: `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(1 ${tilt.toFixed(3)})`,
  });
  g.appendChild(el('circle', { r: r + 1.4, fill: shade(c2, -0.25) }));
  g.appendChild(el('circle', { r, fill: p.radial([c0, c1, c2], 0.4, 0.35, 0.7) }));
  g.appendChild(
    el('circle', { r: r * 0.86, fill: 'none', stroke: shade(c2, -0.2), 'stroke-width': 1.2, opacity: 0.35 }),
  );
  const flecks = 7 + Math.floor(rng.next() * 8);
  for (let i = 0; i < flecks; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = Math.sqrt(rng.next()) * r * 0.78;
    g.appendChild(
      el('ellipse', {
        cx: Math.cos(a) * d,
        cy: Math.sin(a) * d,
        rx: 1 + rng.next() * 1.8,
        ry: 0.8 + rng.next() * 1.4,
        fill: fleck,
        opacity: 0.75,
      }),
    );
  }
  return g;
}

function roundItems(
  ctx: LayerCtx,
  g: SVGGElement,
  palette: readonly string[],
  fleck: string,
  t: number,
  density = 1,
  yOff = 0,
): void {
  const { rng, p } = ctx;
  const span = ctx.x1 - ctx.x0;
  const row = (count: number, yc: number, size: number, droop: boolean) => {
    for (const cx of spread(rng, ctx.x0 + 6, ctx.x1 - 6, count * density)) {
      const tilt = droop && rng.chance(0.4) ? 0.55 + rng.next() * 0.25 : 0.3 + rng.next() * 0.2;
      const rot = (rng.next() - 0.5) * (droop ? 40 : 24);
      g.appendChild(
        roundSlice(
          p,
          rng,
          cx,
          yc + (rng.next() - 0.5) * 4 + yOff,
          size * (0.85 + rng.next() * 0.3),
          palette,
          fleck,
          tilt,
          rot,
        ),
      );
    }
  };
  row(span / 34, ctx.y - t * 0.7, 22, false);
  row(span / 30, ctx.y - t * 0.25, 24, true);
}

export function fold(ctx: LayerCtx, spec: Spec<'fold'>): LayerOut {
  const t = ctx.double ? 40 : 28;
  const inner = el('g', {});
  foldItems(ctx, inner, spec.palette, spec.marble, t);
  if (ctx.double) foldItems(ctx, inner, spec.palette, spec.marble, t, 0.8, -12);
  return { g: layerGroup(ctx, inner, ctx.p.fx('lumpy')), height: t };
}

export function rounds(ctx: LayerCtx, spec: Spec<'rounds'>): LayerOut {
  const t = ctx.double ? 30 : 20;
  const inner = el('g', {});
  roundItems(ctx, inner, spec.palette, spec.fleck, t);
  if (ctx.double) roundItems(ctx, inner, spec.palette, spec.fleck, t, 0.7, -9);
  return { g: layerGroup(ctx, inner, ctx.p.fx('sheen')), height: t };
}

export function deliMix(ctx: LayerCtx, spec: Spec<'deliMix'>): LayerOut {
  const t = ctx.double ? 40 : 28;
  const inner = el('g', {});
  const density = 1.25 / spec.slices.length;
  const passes = ctx.double ? 2 : 1;
  for (let pass = 0; pass < passes; pass++) {
    spec.slices.forEach((s, i) => {
      const yOff = -pass * 11 - i * 1.5;
      if (s.kind === 'fold') foldItems(ctx, inner, s.palette, undefined, t, density, yOff);
      else roundItems(ctx, inner, s.palette, s.fleck ?? '#F2C9B8', t, density, yOff);
    });
  }
  return { g: layerGroup(ctx, inner, ctx.p.fx('sheen')), height: t };
}

/** Chicken, steak, teriyaki: an irregular pile of pieces, back-to-front. */
export function chunks(ctx: LayerCtx, spec: Spec<'chunks'>): LayerOut {
  const { rng, p } = ctx;
  const t = ctx.double ? 36 : 24;
  const span = ctx.x1 - ctx.x0;
  const [c0, c1, c2, c3] = spec.palette as [string, string, string, string];
  const per = spec.shred ? 5 : spec.grill ? 11 : 8;
  const count = Math.round((span / per) * (ctx.double ? 1.5 : 1));
  const pieces: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const y = ctx.y - t * (0.12 + rng.next() * 0.78) + (rng.chance(0.2) ? 6 : 0);
    pieces.push({ x: ctx.x0 + 6 + rng.next() * (span - 12), y });
  }
  pieces.sort((a, b) => a.y - b.y);
  const inner = el('g', {});
  const fills = [
    p.radial([c0, c1, c2], 0.35, 0.3, 0.8),
    p.radial([c1, c2, c3], 0.35, 0.3, 0.8),
    p.linear([c0, c1, c2], 'd'),
  ];
  for (const { x, y } of pieces) {
    let rx: number;
    let ry: number;
    let rot: number;
    if (spec.shred) {
      rx = 8 + rng.next() * 9;
      ry = 2.4 + rng.next() * 2.4;
      rot = (rng.next() - 0.5) * 1.3;
    } else if (spec.grill) {
      rx = 15 + rng.next() * 10;
      ry = 6 + rng.next() * 3;
      rot = (rng.next() - 0.5) * 0.7;
    } else {
      rx = 11 + rng.next() * 9;
      ry = 4.5 + rng.next() * 3.5;
      rot = (rng.next() - 0.5) * 1;
    }
    const d = blob(rng, x, y, rx, ry, 0.22, 9, rot);
    inner.appendChild(
      el('path', {
        d,
        fill: rng.pick(fills),
        stroke: shade(c3, -0.15),
        'stroke-width': 0.8,
        'stroke-opacity': 0.5,
      }),
    );
    if (spec.grill) {
      const cid = p.uid('clip');
      p.defs.appendChild(el('clipPath', { id: cid }, el('path', { d })));
      const marks = el('g', { 'clip-path': `url(#${cid})` });
      for (let k = -1; k <= 1; k++) {
        const ox = x + k * rx * 0.55;
        marks.appendChild(
          el('line', {
            x1: ox - 5,
            y1: y - ry,
            x2: ox + 5,
            y2: y + ry,
            stroke: '#3A200C',
            'stroke-width': 2.6,
            opacity: 0.6,
            'stroke-linecap': 'round',
          }),
        );
      }
      inner.appendChild(marks);
    }
  }
  if (spec.glaze) {
    const glaze = el('g', { filter: p.fx('gloss'), opacity: 0.85 });
    for (const cx of spread(rng, ctx.x0 + 10, ctx.x1 - 10, span / 26)) {
      glaze.appendChild(
        el('path', {
          d: blob(
            rng,
            cx,
            ctx.y - t * (0.3 + rng.next() * 0.5),
            8 + rng.next() * 8,
            3 + rng.next() * 2.5,
            0.35,
            8,
          ),
          fill: spec.glaze,
          opacity: 0.8,
        }),
      );
    }
    inner.appendChild(glaze);
  }
  const surface = spec.glaze ? p.fx('sheen') : p.fx('lumpy');
  return { g: layerGroup(ctx, inner, surface), height: t };
}

export function meatballs(ctx: LayerCtx, spec: Spec<'meatballs'>): LayerOut {
  const { rng, p } = ctx;
  const r = 22;
  const span = ctx.x1 - ctx.x0;
  const noise = noise1d(rng, 0.05, 2);
  const sauce = spec.sauce;
  const inner = el('g', {});
  // Marinara pool the balls sit in, dripping over the bread lip.
  const pool = band(
    ctx.x0 - 2,
    ctx.x1 + 2,
    (x) => ctx.y - 13 + noise(x) * 4,
    (x) => ctx.y + 4 + Math.max(0, noise(x + 40)) * 9,
    50,
  );
  inner.appendChild(
    el('path', {
      d: pool,
      fill: p.linear([shade(sauce, 0.1), sauce, shade(sauce, -0.3)]),
      filter: p.fx('gloss'),
    }),
  );
  const balls = el('g', { filter: p.fx('lumpy') });
  const rows = ctx.double ? [ctx.y - r - 16, ctx.y - r * 0.9] : [ctx.y - r * 0.95];
  const fill = p.radial(spec.palette, 0.33, 0.28, 0.72);
  for (const yc of rows) {
    for (const cx of spread(rng, ctx.x0 + r, ctx.x1 - r, span / (r * 1.9), 0.15)) {
      balls.appendChild(
        el('circle', { cx, cy: yc + (rng.next() - 0.5) * 3, r: r * (0.9 + rng.next() * 0.18), fill }),
      );
    }
  }
  inner.appendChild(balls);
  const topSauce = el('g', { filter: p.fx('gloss') });
  for (const cx of spread(rng, ctx.x0 + r, ctx.x1 - r, span / (r * 1.9), 0.2)) {
    const yc = (rows[0] as number) - r * 0.55;
    topSauce.appendChild(
      el('path', { d: blob(rng, cx, yc, r * 0.75, r * 0.38, 0.3, 9), fill: sauce, opacity: 0.92 }),
    );
    if (rng.chance(0.5))
      topSauce.appendChild(
        el('ellipse', { cx: cx + (rng.next() - 0.5) * 8, cy: yc + r * 0.5, rx: 2.6, ry: 5, fill: sauce }),
      );
  }
  for (let i = 0; i < span / 12; i++) {
    topSauce.appendChild(
      el('circle', {
        cx: ctx.x0 + rng.next() * span,
        cy: ctx.y - rng.next() * r * 2,
        r: 0.7 + rng.next() * 0.8,
        fill: '#2E4A12',
        opacity: 0.7,
      }),
    );
  }
  inner.appendChild(topSauce);
  return { g: layerGroup(ctx, inner), height: ctx.double ? r * 2 + 18 : r * 2 + 2 };
}

export function tuna(ctx: LayerCtx, spec: Spec<'tuna'>): LayerOut {
  const { rng, p } = ctx;
  const t = ctx.double ? 30 : 20;
  const [c0, c1, c2, c3] = spec.palette as [string, string, string, string];
  const n1 = noise1d(rng, 0.06, 3);
  const n2 = noise1d(rng, 0.04, 2);
  const inner = el('g', {});
  const d = band(
    ctx.x0,
    ctx.x1,
    (x) => ctx.y - t + n1(x) * 5 - Math.abs(Math.sin(x * 0.09)) * 3,
    (x) => ctx.y + 4 + Math.max(0, n2(x)) * 7,
    70,
  );
  inner.appendChild(el('path', { d, fill: p.linear([c0, c1, c2]) }));
  const span = ctx.x1 - ctx.x0;
  for (let i = 0; i < span / 3.5; i++) {
    const x = ctx.x0 + 6 + rng.next() * (span - 12);
    const y = ctx.y - rng.next() * t + 2;
    inner.appendChild(
      el('path', {
        d: blob(rng, x, y, 1.8 + rng.next() * 3.5, 1.2 + rng.next() * 2, 0.35, 7),
        fill: rng.pick([c0, c2, c3, '#FFFFFF']),
        opacity: 0.55,
      }),
    );
  }
  return { g: layerGroup(ctx, inner, p.fx('lumpy')), height: t };
}

export function bacon(ctx: LayerCtx, spec: Spec<'bacon'>): LayerOut {
  const { rng, p } = ctx;
  const [meat, dark, fat, fat2] = spec.palette as [string, string, string, string];
  const span = ctx.x1 - ctx.x0;
  const inner = el('g', {});
  const strips = Math.max(2, Math.round(span / 170)) * (ctx.double ? 2 : 1);
  for (let i = 0; i < strips; i++) {
    const len = 150 + rng.next() * 90;
    const xs = ctx.x0 + rng.next() * Math.max(1, span - len);
    const xe = Math.min(ctx.x1, xs + len);
    const base = ctx.y - 6 - rng.next() * 8;
    const amp = 3 + rng.next() * 3;
    const lambda = 34 + rng.next() * 16;
    const ph = rng.next() * 6;
    const w = 9 + rng.next() * 2;
    const c = (x: number) => base + Math.sin((x / lambda) * Math.PI * 2 + ph) * amp;
    inner.appendChild(
      el('path', {
        d: band(
          xs,
          xe,
          (x) => c(x) - w / 2,
          (x) => c(x) + w / 2,
          40,
        ),
        fill: p.linear([dark, meat, dark]),
        stroke: '#4A140A',
        'stroke-width': 0.8,
        'stroke-opacity': 0.6,
      }),
    );
    inner.appendChild(
      el('path', {
        d: band(
          xs + 3,
          xe - 3,
          (x) => c(x) + 0.2,
          (x) => c(x) + 3.2,
          40,
        ),
        fill: fat,
        opacity: 0.85,
      }),
    );
    inner.appendChild(
      el('path', {
        d: band(
          xs + 6,
          xe - 6,
          (x) => c(x) - 3.4,
          (x) => c(x) - 2.2,
          40,
        ),
        fill: fat2,
        opacity: 0.6,
      }),
    );
  }
  return { g: layerGroup(ctx, inner, p.fx('sheen')), height: ctx.double ? 18 : 12 };
}

export function omelet(ctx: LayerCtx, spec: Spec<'omelet'>): LayerOut {
  const { rng, p } = ctx;
  const t = ctx.double ? 26 : 16;
  const [c0, c1, c2, c3] = spec.palette as [string, string, string, string];
  const n = noise1d(rng, 0.03, 2);
  const inner = el('g', {});
  inner.appendChild(
    el('path', {
      d: band(
        ctx.x0 + 4,
        ctx.x1 - 4,
        (x) => ctx.y - t + n(x) * 3,
        (x) => ctx.y + 3 + Math.max(0, n(x + 30)) * 5,
        50,
      ),
      fill: p.linear([c0, c1, c2]),
    }),
  );
  const span = ctx.x1 - ctx.x0;
  for (let i = 0; i < span / 18; i++) {
    inner.appendChild(
      el('path', {
        d: blob(
          rng,
          ctx.x0 + rng.next() * span,
          ctx.y - rng.next() * t,
          3 + rng.next() * 6,
          1.5 + rng.next() * 2.5,
          0.3,
          8,
        ),
        fill: c3,
        opacity: 0.3,
      }),
    );
  }
  inner.appendChild(
    el('path', {
      d: smoothPath(
        Array.from(
          { length: 30 },
          (_, i): Pt => [ctx.x0 + 8 + ((span - 16) * i) / 29, ctx.y - t * 0.45 + n(i * 20) * 2],
        ),
      ),
      fill: 'none',
      stroke: c2,
      'stroke-width': 1.2,
      opacity: 0.6,
    }),
  );
  return { g: layerGroup(ctx, inner, p.fx('lumpy')), height: t };
}

export function patty(ctx: LayerCtx, spec: Spec<'patty'>): LayerOut {
  const { rng, p } = ctx;
  const t = 20;
  const span = ctx.x1 - ctx.x0;
  const count = Math.max(1, Math.round(span / 190));
  const w = span / count;
  const inner = el('g', {});
  const fill = p.radial(spec.palette, 0.35, 0.25, 0.9);
  const rows = ctx.double ? [ctx.y - t * 1.45, ctx.y - t * 0.5] : [ctx.y - t * 0.5];
  for (const cy of rows) {
    for (let i = 0; i < count; i++) {
      const cx = ctx.x0 + w * (i + 0.5);
      inner.appendChild(el('path', { d: blob(rng, cx, cy, w / 2 + 2, t / 2 + 1, 0.05, 16), fill }));
      for (let k = 0; k < w / 6; k++) {
        inner.appendChild(
          el('ellipse', {
            cx: cx + (rng.next() - 0.5) * w * 0.9,
            cy: cy + (rng.next() - 0.6) * t * 0.7,
            rx: 1.3 + rng.next() * 1.4,
            ry: 1 + rng.next(),
            fill: rng.pick(spec.flecks),
            opacity: 0.85,
          }),
        );
      }
    }
  }
  return { g: layerGroup(ctx, inner, p.fx('lumpy')), height: ctx.double ? t * 2 : t };
}
