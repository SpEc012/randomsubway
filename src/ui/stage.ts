import { sfx } from '../audio/synth';
import type { Order, ReelId } from '../data/types';
import { buildSandwich, PARTS, type Part, type SandwichArt } from '../render/sandwich';
import { reducedMotion, sleep, tween } from '../util/anim';

const REEL_PART: Record<ReelId, Part[]> = {
  bread: ['plate', 'bread', 'front'],
  protein: ['protein'],
  cheese: ['cheese'],
  veggies: ['veggies'],
  sauces: ['sauces'],
  seasonings: ['seasonings'],
  extras: ['extras'],
};

const DROP: Keyframe[] = [
  { transform: 'translateY(-150px) scale(1, 1)', opacity: 0 },
  { opacity: 1, offset: 0.3 },
  { transform: 'translateY(5px) scale(1.015, 0.9)', offset: 0.72 },
  { transform: 'translateY(-1px) scale(0.995, 1.02)', offset: 0.86 },
  { transform: 'translateY(0) scale(1, 1)', opacity: 1 },
];

export class Stage {
  readonly el: HTMLElement;
  private canvas: HTMLElement;
  private art: SandwichArt | null = null;
  private fx: HTMLElement;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'stage-canvas';
    this.canvas = document.createElement('div');
    this.canvas.className = 'stage-art';
    this.fx = document.createElement('div');
    this.fx.className = 'stage-fx';
    this.fx.setAttribute('aria-hidden', 'true');
    this.el.append(this.canvas, this.fx);
  }

  get current(): SandwichArt | null {
    return this.art;
  }

  /** Build the sandwich with every layer hidden, ready to reveal. */
  prepare(o: Order, seed: string, label: string): void {
    const art = buildSandwich(o, { seed });
    art.svg.setAttribute('aria-label', label);
    for (const p of PARTS) art.parts[p].style.opacity = '0';
    this.swap(art, false);
  }

  /** Show a finished sandwich instantly (history, reduced motion, first paint). */
  showFinal(o: Order, seed: string, label: string, fade = true): void {
    const art = buildSandwich(o, { seed, finished: true });
    art.svg.setAttribute('aria-label', label);
    this.swap(art, fade && !reducedMotion());
  }

  private swap(art: SandwichArt, fade: boolean): void {
    this.art = art;
    this.canvas.replaceChildren(art.svg);
    if (fade)
      art.svg.animate(
        [
          { opacity: 0, transform: 'scale(.985)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 260, easing: 'ease-out' },
      );
  }

  /** Reveal the layers that belong to a reel. */
  async reveal(reel: ReelId): Promise<void> {
    const art = this.art;
    if (!art) return;
    const quick = reducedMotion();
    const jobs: Promise<unknown>[] = [];
    for (const part of REEL_PART[reel]) {
      const g = art.parts[part];
      g.style.opacity = '1';
      if (quick) {
        jobs.push(g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120 }).finished);
        continue;
      }
      art.items[part].forEach((item, i) => {
        if (part === 'sauces') jobs.push(this.pour(item, i * 140));
        else if (part === 'seasonings')
          jobs.push(
            item.animate(
              [
                { transform: 'translateY(-40px)', opacity: 0 },
                { transform: 'none', opacity: 1 },
              ],
              { duration: 480, delay: i * 90, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' },
            ).finished,
          );
        else if (part === 'plate')
          jobs.push(item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }).finished);
        else if (part === 'front')
          jobs.push(item.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }).finished);
        else
          jobs.push(
            item.animate(DROP, {
              duration: 560,
              delay: i * 70,
              easing: 'cubic-bezier(.33,.8,.4,1)',
              fill: 'backwards',
            }).finished,
          );
      });
    }
    if (reel === 'sauces' && art.items.sauces.length) sfx.pour();
    await Promise.allSettled(jobs);
  }

  private pour(g: SVGGElement, delay: number): Promise<unknown> {
    const lines = [...g.querySelectorAll<SVGPathElement>('.pour')];
    const extras = [...g.querySelectorAll<SVGElement>('.drip, .pour-hi')];
    for (const l of lines) l.style.strokeDasharray = '1 1';
    const a = lines.map(
      (l) =>
        l.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
          duration: 650,
          delay,
          easing: 'cubic-bezier(.4,0,.2,1)',
          fill: 'both',
        }).finished,
    );
    const b = extras.map(
      (e) =>
        e.animate(
          [
            { opacity: 0, transform: 'translateY(-4px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: 300, delay: delay + 520, fill: 'backwards' },
        ).finished,
    );
    return Promise.all([...a, ...b]);
  }

  async closeLid(): Promise<void> {
    const art = this.art;
    if (!art) return;
    const lid = art.parts.lid;
    lid.style.opacity = '1';
    if (!art.items.lid.length) return;
    if (reducedMotion()) return;
    const a = lid.animate(
      [
        { transform: 'translateY(-240px) rotate(-2deg)', opacity: 0 },
        { opacity: 1, offset: 0.25 },
        { transform: 'translateY(6px) scale(1.01, .94) rotate(0)', offset: 0.7 },
        { transform: 'translateY(-2px) scale(1, 1.01)', offset: 0.85 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 620, easing: 'cubic-bezier(.33,.8,.4,1)', fill: 'backwards' },
    );
    await sleep(430);
    sfx.thump();
    this.el.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(3px)' }, { transform: 'none' }],
      { duration: 180 },
    );
    await a.finished.catch(() => {});
  }

  async toast(o: Order): Promise<void> {
    const art = this.art;
    if (!art || !o.toasted) return;
    if (reducedMotion()) {
      art.setToast(1);
      return;
    }
    this.el.classList.add('is-toasting');
    sfx.sizzle(1100);
    await tween(1100, (t) => {
      art.setToast(t);
      art.setShimmer(Math.sin(Math.PI * t) * 3.2);
    }).done;
    art.setShimmer(0);
    this.el.classList.remove('is-toasting');
  }

  /** Slam: finish every running animation and show the final state. */
  finishAll(o: Order): void {
    const art = this.art;
    if (!art) return;
    for (const a of art.svg.getAnimations({ subtree: true })) a.finish();
    for (const p of PARTS) art.parts[p].style.opacity = '1';
    for (const l of art.svg.querySelectorAll<SVGPathElement>('.pour')) {
      l.style.strokeDasharray = '';
    }
    art.setShimmer(0);
    if (o.toasted) art.setToast(1);
    this.el.classList.remove('is-toasting');
  }

  /** Fly a copy of a reel tile's icons into the stage. */
  ghost(tile: HTMLElement): void {
    if (reducedMotion()) return;
    const icons = tile.querySelector<HTMLElement>('.tile-icons');
    if (!icons?.childElementCount || icons.querySelector('.tile-ico--none')) return;
    const from = icons.getBoundingClientRect();
    const to = this.canvas.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const ghost = icons.cloneNode(true) as HTMLElement;
    ghost.classList.add('ghost');
    Object.assign(ghost.style, {
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    });
    document.body.append(ghost);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height * 0.55 - (from.top + from.height / 2);
    ghost
      .animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 0.95 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.5)`, opacity: 0.9, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(.6)`, opacity: 0 },
        ],
        { duration: 520, easing: 'cubic-bezier(.4,0,.2,1)' },
      )
      .finished.finally(() => ghost.remove());
  }

  shake(): void {
    if (reducedMotion()) return;
    this.el.animate(
      [
        { transform: 'none' },
        { transform: 'translateX(-8px) rotate(-.4deg)' },
        { transform: 'translateX(7px) rotate(.4deg)' },
        { transform: 'translateX(-5px)' },
        { transform: 'translateX(3px)' },
        { transform: 'none' },
      ],
      { duration: 480, easing: 'ease-out' },
    );
    this.flash('bad');
  }

  flash(kind: 'bad' | 'good'): void {
    const f = document.createElement('div');
    f.className = `stage-flash stage-flash--${kind}`;
    this.fx.append(f);
    f.animate([{ opacity: 0.7 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' }).finished.finally(
      () => f.remove(),
    );
  }

  /** Lettuce-shred confetti for a Chef's Kiss. */
  confetti(): void {
    if (reducedMotion()) return;
    const colors = ['#A6D76B', '#CDEB9A', '#77B545', '#EEF8D2', '#FFC600', '#E0412C'];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement('i');
      s.className = 'shred';
      s.style.left = `${Math.random() * 100}%`;
      s.style.background = colors[i % colors.length]!;
      s.style.width = `${4 + Math.random() * 10}px`;
      this.fx.append(s);
      const drift = (Math.random() - 0.5) * 220;
      const rot = (Math.random() - 0.5) * 1080;
      s.animate(
        [
          { transform: 'translate(0, -20px) rotate(0)', opacity: 1 },
          {
            transform: `translate(${drift}px, ${260 + Math.random() * 240}px) rotate(${rot}deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 1300 + Math.random() * 900,
          delay: Math.random() * 250,
          easing: 'cubic-bezier(.2,.6,.4,1)',
          fill: 'backwards',
        },
      ).finished.finally(() => s.remove());
    }
    this.flash('good');
  }
}
