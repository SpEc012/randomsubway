import type { BreadStyle } from '../../data/types';
import type { Rng } from '../../engine/rng';
import type { Paint } from '../filters';
import { band, blob, el, noise1d, shade, smoothPath } from '../svg';

export interface BreadGeom {
  x0: number;
  x1: number;
  /** Height of the bottom half. */
  hb: number;
  /** Height of the top dome. */
  ht: number;
  /** End roundness exponent: smaller = blunter ends. */
  endPow: number;
}

export function breadGeom(style: BreadStyle, x0: number, x1: number): BreadGeom {
  switch (style) {
    case 'flatbread':
      return { x0, x1, hb: 24, ht: 30, endPow: 0.35 };
    case 'wrap':
      return { x0, x1, hb: 16, ht: 46, endPow: 0.6 };
    case 'sourdough':
      return { x0, x1, hb: 48, ht: 84, endPow: 0.5 };
    case 'multigrain':
      return { x0, x1, hb: 46, ht: 78, endPow: 0.5 };
    default:
      return { x0, x1, hb: 46, ht: 80, endPow: 0.5 };
  }
}

/**
 * Superellipse loaf profile: ~1 across the middle, curving down to 0 at the
 * ends. Higher `n` = blunter ends; `pow` < 1 makes the end walls steeper.
 */
const profile = (g: BreadGeom, x: number, pow: number, n = 4) => {
  const u = Math.min(1, Math.max(0, (x - g.x0) / (g.x1 - g.x0)));
  const t = Math.abs(2 * u - 1);
  return Math.max(0, 1 - t ** n) ** pow;
};

/** Bottom half of the roll, cut face up. `y` is the cut line. */
export function breadBottom(
  p: Paint,
  rng: Rng,
  style: BreadStyle,
  pal: readonly string[],
  g: BreadGeom,
  y: number,
): SVGGElement {
  const wob = noise1d(rng, 0.02, 2);
  const depth = (x: number) => g.hb * profile(g, x, g.endPow, 6) * (1 + wob(x) * 0.04);
  const [crumb, light, crust, dark] = pal as [string, string, string, string];
  const curl = (x: number) => (1 - profile(g, x, 0.5, 8)) * g.hb * 0.3;
  const shape = band(
    g.x0,
    g.x1,
    (x) => y + wob(x + 99) * 1.2 + curl(x),
    (x) => y + depth(x),
    60,
  );

  const crumbBand = band(
    g.x0 + 6,
    g.x1 - 6,
    (x) => y + wob(x + 99) * 1.2 - 0.5,
    (x) => y + Math.min(8, depth(x) * 0.5),
    50,
  );

  return el(
    'g',
    { class: 'bread-bottom' },
    el(
      'g',
      { filter: p.fx('crust') },
      el('path', { d: shape, fill: p.linear([light, crust, dark, shade(dark, -0.25)]) }),
      el('path', { d: shape, fill: p.linear([dark, dark, dark, dark], 'h', [0.45, 0, 0, 0.45]) }),
    ),
    el('path', { d: crumbBand, fill: p.linear([crumb, shade(crumb, -0.06)]), filter: p.fx('crumb') }),
    style === 'multigrain'
      ? speckle(
          p,
          rng,
          g,
          () => y + 10,
          (x) => y + depth(x) - 4,
          0.35,
          ['#EFDDB0', '#3B2A1A'],
        )
      : null,
  );
}

/**
 * Top dome of the roll. `y` is its cut line (bottom edge). For a wrap,
 * `closeDepth` is the filling height: the tortilla folds down over the ends.
 */
export function breadTop(
  p: Paint,
  rng: Rng,
  style: BreadStyle,
  pal: readonly string[],
  g: BreadGeom,
  y: number,
  closeDepth = 0,
): SVGGElement {
  const wob = noise1d(rng, 0.018, 2);
  const hump = style === 'sourdough' ? 0.1 : 0.05;
  const height = (x: number) => {
    const u = (x - g.x0) / (g.x1 - g.x0);
    return g.ht * profile(g, x, g.endPow, 3.2) * (1 + hump * Math.sin(Math.PI * u) + wob(x) * 0.04);
  };
  const top = (x: number) => y - height(x);
  const [crumb, light, crust, dark] = pal as [string, string, string, string];
  const edge =
    style === 'wrap'
      ? (x: number) => (1 - profile(g, x, 0.6, 7)) * closeDepth
      : (x: number) => -(1 - profile(g, x, 0.5, 8)) * g.ht * 0.22;
  const shape = band(g.x0, g.x1, top, (x) => y + wob(x + 50) * 1.4 + 1 + edge(x), 70);
  const crumbBand = band(
    g.x0 + 8,
    g.x1 - 8,
    (x) => y - Math.min(7, height(x) * 0.35),
    (x) => y + wob(x + 50) * 1.4 + 1.5,
    50,
  );

  const decor = el('g', {});
  const span = g.x1 - g.x0;
  const onTop = (depthFrac: number) => {
    const x = g.x0 + span * (0.04 + rng.next() * 0.92);
    return [x, top(x) + 2 + rng.next() * height(x) * depthFrac] as const;
  };

  switch (style) {
    case 'herbs-cheese': {
      const n = Math.round(span / 22);
      for (let i = 0; i < n; i++) {
        const [x, yy] = onTop(0.5);
        decor.appendChild(
          el('path', {
            d: blob(rng, x, yy, 6 + rng.next() * 9, 2.5 + rng.next() * 3.5, 0.3, 9),
            fill: p.radial(['#FFD36B', '#F1A93A', '#C77A1B']),
            opacity: 0.95,
          }),
        );
      }
      decor.appendChild(
        speckle(
          p,
          rng,
          g,
          (x) => top(x) + 2,
          (x) => top(x) + height(x) * 0.6,
          1.6,
          ['#3F5E1E', '#6B7F2A', '#7A4A1E'],
        ),
      );
      break;
    }
    case 'jalapeno-cheese': {
      const n = Math.round(span / 16);
      for (let i = 0; i < n; i++) {
        const [x, yy] = onTop(0.55);
        decor.appendChild(
          el('path', {
            d: blob(rng, x, yy, 8 + rng.next() * 12, 3 + rng.next() * 4, 0.35, 9),
            fill: p.radial(['#FFC35A', '#EE9A2A', '#B8661A']),
            opacity: 0.92,
          }),
        );
      }
      for (let i = 0; i < n * 0.7; i++) {
        const [x, yy] = onTop(0.5);
        decor.appendChild(
          el('path', {
            d: blob(rng, x, yy, 2.5 + rng.next() * 2.5, 1.6 + rng.next() * 1.4, 0.2, 7),
            fill: rng.pick(['#4E8A22', '#6FA532', '#3B6B18']),
          }),
        );
      }
      break;
    }
    case 'multigrain':
      decor.appendChild(
        speckle(
          p,
          rng,
          g,
          (x) => top(x) + 1,
          (x) => top(x) + height(x) * 0.7,
          1.4,
          ['#F2E2B8', '#E6D09A', '#3B2A1A', '#5A3A1E'],
          true,
        ),
      );
      break;
    case 'sourdough': {
      // Scoring slashes with a raised "ear", then a flour dusting.
      const cuts = Math.max(2, Math.round(span / 150));
      for (let i = 0; i < cuts; i++) {
        const cx = g.x0 + span * ((i + 0.5) / cuts) + (rng.next() - 0.5) * 20;
        const len = Math.min(70, span / cuts - 18);
        const yy = top(cx) + 6;
        const d = smoothPath([
          [cx - len / 2, yy + 5],
          [cx, yy - 1],
          [cx + len / 2, yy + 4],
        ]);
        decor.appendChild(
          el('path', {
            d,
            fill: 'none',
            stroke: shade(crumb, -0.05),
            'stroke-width': 5,
            'stroke-linecap': 'round',
            opacity: 0.9,
          }),
        );
        decor.appendChild(
          el('path', {
            d,
            fill: 'none',
            stroke: shade(dark, -0.3),
            'stroke-width': 1.6,
            'stroke-linecap': 'round',
            transform: 'translate(0 -2.4)',
            opacity: 0.8,
          }),
        );
      }
      decor.appendChild(
        speckle(
          p,
          rng,
          g,
          (x) => top(x) + 1,
          (x) => top(x) + height(x) * 0.45,
          2.2,
          ['#FFFFFF', '#F6F1E6'],
          false,
          0.55,
        ),
      );
      break;
    }
    case 'flatbread': {
      const n = Math.round(span / 14);
      for (let i = 0; i < n; i++) {
        const [x, yy] = onTop(0.8);
        decor.appendChild(
          el('path', {
            d: blob(rng, x, yy, 3 + rng.next() * 7, 1.6 + rng.next() * 2.4, 0.3, 8),
            fill: p.radial(['#6E4520', '#8E6234', '#CFA36A'], 0.5, 0.5, 0.6, [0.85, 0.5, 0]),
          }),
        );
      }
      break;
    }
    case 'wrap':
      decor.appendChild(
        tortillaSpots(
          p,
          rng,
          g.x0,
          g.x1,
          (x) => top(x) + 2,
          () => y - 4,
          light,
          dark,
          1.3,
        ),
      );
      break;
    default:
      decor.appendChild(
        speckle(
          p,
          rng,
          g,
          (x) => top(x) + 2,
          (x) => top(x) + height(x) * 0.5,
          0.3,
          [shade(dark, -0.1)],
          false,
          0.35,
        ),
      );
  }

  // Long soft highlight along the crown — the "fresh from the oven" sheen.
  const shine = band(
    g.x0 + span * 0.12,
    g.x1 - span * 0.2,
    (x) => top(x) + 4,
    (x) => top(x) + 4 + height(x) * 0.22,
    30,
  );

  return el(
    'g',
    { class: 'bread-top' },
    el('path', { d: crumbBand, fill: p.linear([shade(crumb, -0.04), crumb]), filter: p.fx('crumb') }),
    el(
      'g',
      { filter: p.fx('crust') },
      el('path', { d: shape, fill: p.linear([light, crust, dark]) }),
      el('path', { d: shape, fill: p.radial([light, crust, dark], 0.4, 0.15, 0.9, [0.9, 0.35, 0]) }),
      el('path', { d: shape, fill: p.linear([dark, dark, dark, dark], 'h', [0.5, 0, 0, 0.5]) }),
      decor,
    ),
    el('path', { d: shine, fill: p.linear(['#FFFFFF', '#FFFFFF'], 'v', [0.32, 0]), opacity: 0.8 }),
  );
}

/** Scatter seeds, herbs, flour or char specks over a band of the loaf. */
function speckle(
  p: Paint,
  rng: Rng,
  g: BreadGeom,
  topFn: (x: number) => number,
  botFn: (x: number) => number,
  density: number,
  colors: readonly string[],
  oats = false,
  opacity = 0.9,
): SVGGElement {
  const out = el('g', { opacity });
  const span = g.x1 - g.x0;
  const n = Math.round(span * density * 0.3);
  for (let i = 0; i < n; i++) {
    const x = g.x0 + span * (0.05 + rng.next() * 0.9);
    const y0 = topFn(x);
    const y1 = botFn(x);
    if (y1 <= y0) continue;
    const y = y0 + rng.next() * (y1 - y0);
    const c = rng.pick(colors);
    const big = oats && (c === '#F2E2B8' || c === '#E6D09A');
    const rx = big ? 2.6 + rng.next() * 2 : 0.7 + rng.next() * 1.1;
    const ry = big ? 1.2 + rng.next() * 0.9 : 0.5 + rng.next() * 0.7;
    out.appendChild(
      el('ellipse', {
        cx: x,
        cy: y,
        rx,
        ry,
        fill: c,
        transform: `rotate(${(rng.next() * 60 - 30).toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})`,
      }),
    );
  }
  void p;
  return out;
}

function tortillaSpots(
  p: Paint,
  rng: Rng,
  x0: number,
  x1: number,
  top: (x: number) => number,
  bot: (x: number) => number,
  light: string,
  dark: string,
  density: number,
): SVGGElement {
  const g = el('g', {});
  const n = Math.round(((x1 - x0) / 7) * density);
  for (let i = 0; i < n; i++) {
    const x = x0 + 10 + rng.next() * (x1 - x0 - 20);
    const y0 = top(x);
    const y1 = bot(x);
    if (y1 - y0 < 6) continue;
    const y = y0 + 3 + rng.next() * (y1 - y0 - 6);
    const kind = rng.next();
    if (kind < 0.35)
      g.appendChild(
        el('path', {
          d: blob(rng, x, y, 4 + rng.next() * 8, 2 + rng.next() * 3, 0.3, 8),
          fill: light,
          opacity: 0.45,
        }),
      );
    else if (kind < 0.6)
      g.appendChild(
        el('path', {
          d: blob(rng, x, y, 2 + rng.next() * 4, 1.5 + rng.next() * 2, 0.3, 7),
          fill: shade(dark, -0.2),
          opacity: 0.35,
        }),
      );
    else
      g.appendChild(
        el('ellipse', {
          cx: x,
          cy: y,
          rx: 0.9 + rng.next(),
          ry: 0.6 + rng.next() * 0.6,
          fill: rng.pick(['#2F5A1A', '#3E6B22']),
          opacity: 0.85,
        }),
      );
  }
  void p;
  return g;
}

/** Protein bowl — back rim (behind fillings). */
export function bowlBack(p: Paint, cx: number, w: number, yRim: number): SVGGElement {
  return el(
    'g',
    { class: 'bowl-back' },
    el('ellipse', { cx, cy: yRim, rx: w / 2, ry: 20, fill: p.linear(['#C7D2CB', '#E8EEEA']) }),
    el('ellipse', { cx, cy: yRim + 2, rx: w / 2 - 8, ry: 15, fill: p.linear(['#B5C2BA', '#DDE5E0']) }),
  );
}

/** Protein bowl — front wall (in front of fillings). */
export function bowlFront(p: Paint, cx: number, w: number, yRim: number, depth: number): SVGGElement {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const yb = yRim + depth;
  const d = `M${l} ${yRim} C${l + 8} ${yRim + depth * 0.75} ${cx - w * 0.3} ${yb} ${cx - w * 0.24} ${yb} L${cx + w * 0.24} ${yb} C${cx + w * 0.3} ${yb} ${r - 8} ${yRim + depth * 0.75} ${r} ${yRim} A${w / 2} 20 0 0 1 ${l} ${yRim} Z`;
  return el(
    'g',
    { class: 'bowl-front' },
    el('path', { d, fill: p.linear(['#FFFFFF', '#F1F5F2', '#D6DFD9']) }),
    el('path', { d, fill: p.linear(['#8FA398', '#8FA398', '#8FA398', '#8FA398'], 'h', [0.28, 0, 0, 0.3]) }),
    el('path', {
      d: `M${l + 4} ${yRim + 2} A${w / 2 - 4} 18 0 0 0 ${r - 4} ${yRim + 2}`,
      fill: 'none',
      stroke: '#FFFFFF',
      'stroke-width': 3,
      opacity: 0.9,
    }),
    el('path', {
      d: `M${cx - w * 0.36} ${yRim + depth * 0.35} Q${cx - w * 0.1} ${yRim + depth * 0.6} ${cx + w * 0.18} ${yRim + depth * 0.4}`,
      fill: 'none',
      stroke: '#FFFFFF',
      'stroke-width': 6,
      'stroke-linecap': 'round',
      opacity: 0.55,
    }),
  );
}
