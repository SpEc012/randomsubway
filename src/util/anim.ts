/** Animation helpers: reduced-motion awareness, tweens on a shared rAF loop, easing. */

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
export const reducedMotion = (): boolean => !!mq?.matches;

export const ease = {
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  inQuad: (t: number) => t * t,
};

type Frame = (now: number) => boolean; // return false to stop
const frames = new Set<Frame>();
let running = false;

function loop(now: number): void {
  for (const f of [...frames]) if (!f(now)) frames.delete(f);
  if (frames.size) requestAnimationFrame(loop);
  else running = false;
}

/** Register a per-frame callback on the single shared rAF loop. */
export function onFrame(f: Frame): () => void {
  frames.add(f);
  if (!running) {
    running = true;
    requestAnimationFrame(loop);
  }
  return () => frames.delete(f);
}

export interface Tween {
  done: Promise<void>;
  /** Jump to the end immediately. */
  finish(): void;
}

/** Tween 0→1 over `ms`, calling `step(eased)` each frame. */
export function tween(
  ms: number,
  step: (t: number) => void,
  easing: (t: number) => number = ease.outCubic,
): Tween {
  let resolve!: () => void;
  const done = new Promise<void>((r) => (resolve = r));
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    step(1);
    resolve();
  };
  if (ms <= 0) {
    finish();
    return { done, finish };
  }
  const start = performance.now();
  onFrame((now) => {
    if (finished) return false;
    const t = Math.min(1, (now - start) / ms);
    step(easing(t));
    if (t >= 1) {
      finish();
      return false;
    }
    return true;
  });
  return { done, finish };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
