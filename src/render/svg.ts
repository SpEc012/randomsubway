import type { Rng } from '../engine/rng';

export const NS = 'http://www.w3.org/2000/svg';

type AttrValue = string | number | undefined | null | false;
export type Attrs = Record<string, AttrValue>;
type Child = Node | null | undefined | false;

/** Create an SVG element with attributes and children. Falsy attrs/children are skipped. */
export function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    node.setAttribute(k, typeof v === 'number' ? String(r1(v)) : v);
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

/** Round to 1 decimal — keeps path strings small without visible loss. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

export type Pt = readonly [number, number];

/** Catmull-Rom spline through points → cubic Bézier path data. */
export function smoothPath(pts: readonly Pt[], closed = false, tension = 1): string {
  const n = pts.length;
  if (n < 2) return '';
  const at = (i: number): Pt => {
    if (closed) return pts[((i % n) + n) % n] as Pt;
    return pts[Math.max(0, Math.min(n - 1, i))] as Pt;
  };
  const [sx, sy] = pts[0] as Pt;
  let d = `M${r1(sx)} ${r1(sy)}`;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const t = tension / 6;
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return closed ? `${d}Z` : d;
}

/** An organic, wobbly ellipse — the atom of most food shapes. */
export function blobPts(
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  wobble = 0.12,
  n = 10,
  rot = 0,
): Pt[] {
  const pts: Pt[] = [];
  const phase = rng.next() * Math.PI * 2;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + phase;
    const k = 1 + (rng.next() * 2 - 1) * wobble;
    const x = Math.cos(a) * rx * k;
    const y = Math.sin(a) * ry * k;
    pts.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return pts;
}

export function blob(
  rng: Rng,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  wobble = 0.12,
  n = 10,
  rot = 0,
): string {
  return smoothPath(blobPts(rng, cx, cy, rx, ry, wobble, n, rot), true);
}

/**
 * A horizontal band between two edge functions (top & bottom), sampled and
 * smoothed. The workhorse for bread, lettuce, spreads, tortillas.
 */
export function band(
  x0: number,
  x1: number,
  top: (x: number) => number,
  bottom: (x: number) => number,
  steps = 40,
): string {
  const t: Pt[] = [];
  const b: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    t.push([x, top(x)]);
    b.push([x, bottom(x)]);
  }
  return smoothPath([...t, ...b.reverse()], true, 0.9);
}

/** Smooth 1-D value noise, seeded — for ruffles, lumps and wobbles. */
export function noise1d(rng: Rng, freq: number, octaves = 2): (x: number) => number {
  const tables = Array.from({ length: octaves }, () => Array.from({ length: 64 }, () => rng.next() * 2 - 1));
  return (x: number) => {
    let sum = 0;
    let amp = 1;
    let f = freq;
    let norm = 0;
    for (const tab of tables) {
      const u = x * f;
      const i = Math.floor(u);
      const fr = u - i;
      const s = fr * fr * (3 - 2 * fr);
      const a = tab[((i % 64) + 64) % 64] as number;
      const b = tab[(((i + 1) % 64) + 64) % 64] as number;
      sum += (a + (b - a) * s) * amp;
      norm += amp;
      amp *= 0.5;
      f *= 2.1;
    }
    return sum / norm;
  };
}

/** Shade a hex color: amt < 0 darkens toward black, > 0 lightens toward white. */
export function shade(hex: string, amt: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
