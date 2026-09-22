import type { Rng } from '../engine/rng';
import type { Paint } from './filters';
import { el } from './svg';

/** Everything a filling renderer needs to draw one layer of the stack. */
export interface LayerCtx {
  p: Paint;
  rng: Rng;
  /** Horizontal extent of the filling. */
  x0: number;
  x1: number;
  /** Baseline: the layer sits on this y and grows upward (toward smaller y). */
  y: number;
  /** Cheese melt 0–1 (toasting). */
  melt: number;
  /** Double portion (double meat / extra cheese). */
  double: boolean;
  /** Index among layers of the same category (varies sauce phase, etc.). */
  index: number;
}

export interface LayerOut {
  g: SVGGElement;
  /** How far this layer raises the stack. */
  height: number;
}

/** Wrap content in the standard layer group: contact shadow outside, surface filter inside. */
export function layerGroup(ctx: LayerCtx, inner: SVGGElement, surface?: string): SVGGElement {
  if (surface) inner.setAttribute('filter', surface);
  return el('g', { filter: ctx.p.fx('shadow') }, inner);
}

/** Evenly spread positions across a span with jitter, ordered left→right. */
export function spread(rng: Rng, x0: number, x1: number, count: number, jitter = 0.45): number[] {
  const n = Math.max(1, Math.round(count));
  const step = (x1 - x0) / n;
  return Array.from({ length: n }, (_, i) => x0 + step * (i + 0.5) + (rng.next() * 2 - 1) * step * jitter);
}
