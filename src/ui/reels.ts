import { sfx } from '../audio/synth';
import { BOWL, byCategory, ing, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import { type Order, REELS, type ReelId } from '../data/types';
import { sizeLabel } from '../engine/order';
import { reducedMotion, type Tween, tween } from '../util/anim';
import { iconMarkup } from './icons';

export const REEL_LABELS: Record<ReelId, string> = {
  bread: 'Bread',
  protein: 'Protein',
  cheese: 'Cheese',
  veggies: 'Veggies',
  sauces: 'Sauces',
  seasonings: 'Seasoning',
  extras: 'Extras',
};

const CATEGORY: Record<ReelId, keyof typeof byCategory> = {
  bread: 'bread',
  protein: 'protein',
  cheese: 'cheese',
  veggies: 'veggie',
  sauces: 'sauce',
  seasonings: 'seasoning',
  extras: 'extra',
};

const LOCK_OPEN =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 9.6-1.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><rect x="4.5" y="11" width="15" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const LOCK_CLOSED =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 11V7a5 5 0 0 1 10 0v4" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4.5" y="11" width="15" height="10" rx="2.5" fill="currentColor"/></svg>';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (id: string) =>
  ing(id)
    .name.replace(/\s*\(.*?\)/g, '')
    .replace(/®/g, '');

interface TileContent {
  icons: string[];
  title: string;
  sub: string;
}

/** What the landed tile says for a given reel. */
export function tileContent(reel: ReelId, o: Order): TileContent {
  const multi = (ids: readonly string[], noun: string, none: string, all: number): TileContent => {
    if (ids.length === 0) return { icons: [], title: none, sub: '' };
    const title =
      ids.length === all && all > 3
        ? `All ${all} ${noun}`
        : ids.length === 1
          ? short(ids[0] as string)
          : `${ids.length} ${noun}`;
    const sub = ids.length === 1 ? '' : ids.map(short).join(', ');
    return { icons: ids.slice(0, 4), title, sub };
  };
  switch (reel) {
    case 'bread': {
      const bits = [sizeLabel(o)];
      if (o.bread !== BOWL) bits.push(o.toasted ? 'Toasted' : 'Not toasted');
      return { icons: [o.bread], title: short(o.bread), sub: bits.join(' · ') };
    }
    case 'protein':
      return {
        icons: [o.protein],
        title: o.protein === NONE_PROTEIN ? 'No protein' : short(o.protein),
        sub: o.extras.includes('double-meat') ? 'Double portion' : '',
      };
    case 'cheese':
      return {
        icons: [o.cheese],
        title: o.cheese === NONE_CHEESE ? 'No cheese' : short(o.cheese),
        sub: o.extras.includes('extra-cheese') ? 'Extra cheese' : '',
      };
    case 'veggies':
      return multi(o.veggies, 'veggies', 'No veggies', byCategory.veggie.length);
    case 'sauces':
      return multi(o.sauces, 'sauces', 'No sauce', byCategory.sauce.length);
    case 'seasonings':
      return multi(o.seasonings, 'seasonings', 'No seasoning', byCategory.seasoning.length);
    case 'extras':
      return multi(o.extras, 'extras', 'No extras', byCategory.extra.length);
  }
}

function tileHTML(c: TileContent, final = false): string {
  const icons = c.icons.length
    ? c.icons.map((id) => `<span class="tile-ico">${iconMarkup(id)}</span>`).join('')
    : '<span class="tile-ico tile-ico--none"></span>';
  return `<div class="tile${final ? ' tile--final' : ''}"><div class="tile-icons" data-count="${c.icons.length}">${icons}</div><div class="tile-text"><b>${esc(c.title)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</div></div>`;
}

function fillerTile(reel: ReelId): string {
  const pool = byCategory[CATEGORY[reel]];
  const item = pool[Math.floor(Math.random() * pool.length)]!;
  return tileHTML({ icons: [item.id], title: short(item.id), sub: '' });
}

export interface LandEvent {
  reel: ReelId;
  index: number;
  locked: boolean;
  tile: HTMLElement;
}

interface ReelView {
  id: ReelId;
  root: HTMLElement;
  window: HTMLElement;
  strip: HTMLElement;
  lock: HTMLButtonElement;
  blur: SVGFEGaussianBlurElement;
}

export class Reels {
  readonly el: HTMLElement;
  private views: ReelView[] = [];
  private tweens: Tween[] = [];
  private spinning = false;

  constructor(onToggleLock: (id: ReelId) => void) {
    this.el = document.createElement('div');
    this.el.className = 'reels';
    this.el.setAttribute('role', 'group');
    this.el.setAttribute('aria-label', 'Slot reels');
    const filters = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    filters.setAttribute('class', 'sr-only');
    filters.setAttribute('aria-hidden', 'true');
    this.el.append(filters);

    REELS.forEach((id, i) => {
      const root = document.createElement('div');
      root.className = 'reel';
      root.dataset.reel = id;
      root.innerHTML = `<div class="reel-label"><kbd>${i + 1}</kbd><span>${REEL_LABELS[id]}</span></div><div class="reel-window" aria-live="off"><div class="reel-strip"></div></div><button type="button" class="reel-lock" aria-pressed="false" aria-label="Lock ${REEL_LABELS[id]} reel" title="Lock (hold) this reel — key ${i + 1}">${LOCK_OPEN}</button>`;
      const lock = root.querySelector<HTMLButtonElement>('.reel-lock')!;
      lock.addEventListener('click', () => onToggleLock(id));
      const fid = `reel-blur-${id}`;
      const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      f.id = fid;
      f.setAttribute('x', '-5%');
      f.setAttribute('width', '110%');
      f.setAttribute('y', '-20%');
      f.setAttribute('height', '140%');
      const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
      blur.setAttribute('stdDeviation', '0 0');
      f.append(blur);
      filters.append(f);
      const strip = root.querySelector<HTMLElement>('.reel-strip')!;
      strip.style.filter = `url(#${fid})`;
      this.views.push({
        id,
        root,
        window: root.querySelector<HTMLElement>('.reel-window')!,
        strip,
        lock,
        blur,
      });
      this.el.append(root);
    });
  }

  setLocks(locks: readonly ReelId[], disabled: boolean): void {
    for (const v of this.views) {
      const on = locks.includes(v.id) && !disabled;
      v.root.classList.toggle('is-locked', on);
      v.lock.setAttribute('aria-pressed', String(on));
      v.lock.disabled = disabled;
      v.lock.innerHTML = on ? LOCK_CLOSED : LOCK_OPEN;
    }
  }

  /** Show an order instantly (no animation). */
  show(o: Order | null): void {
    for (const v of this.views) {
      v.strip.style.transform = '';
      v.blur.setAttribute('stdDeviation', '0 0');
      v.strip.innerHTML = o
        ? tileHTML(tileContent(v.id, o), true)
        : tileHTML({ icons: [], title: '—', sub: '' });
    }
  }

  tileOf(reel: ReelId): HTMLElement | null {
    return this.views.find((v) => v.id === reel)?.window.querySelector<HTMLElement>('.tile--final') ?? null;
  }

  get isSpinning(): boolean {
    return this.spinning;
  }

  /**
   * Spin every unlocked reel; they stop left→right. `onLand` fires per reel in
   * order (locked reels "land" instantly at their slot in the sequence).
   */
  async spin(
    o: Order,
    opts: { locks: readonly ReelId[]; chaos: number; onLand: (e: LandEvent) => void },
  ): Promise<void> {
    this.spinning = true;
    this.tweens = [];
    const quick = reducedMotion();
    const base = 1350 + opts.chaos * 900;
    const stagger = 235 + opts.chaos * 110;

    const jobs = this.views.map(async (v, i) => {
      const locked = opts.locks.includes(v.id);
      const final = tileHTML(tileContent(v.id, o), true);
      const land = () => {
        v.strip.innerHTML = final;
        v.strip.style.transform = '';
        v.blur.setAttribute('stdDeviation', '0 0');
        v.root.classList.remove('is-spinning');
        v.root.classList.add('just-landed');
        setTimeout(() => v.root.classList.remove('just-landed'), 500);
      };
      if (locked || quick) {
        const wait = quick ? i * 40 : base + i * stagger;
        await new Promise<void>((r) => {
          const t = tween(
            wait,
            () => {},
            (x) => x,
          );
          this.tweens.push(t);
          void t.done.then(r);
        });
        if (!locked) land();
        opts.onLand({ reel: v.id, index: i, locked, tile: v.window.querySelector<HTMLElement>('.tile')! });
        return;
      }
      const fillers = 12 + i * 3 + Math.round(opts.chaos * 10);
      v.strip.innerHTML = Array.from({ length: fillers }, () => fillerTile(v.id)).join('') + final;
      v.root.classList.add('is-spinning');
      const tileH = v.window.clientHeight || 64;
      const dist = fillers * tileH;
      let lastY = 0;
      let lastTick = 0;
      let lastT = performance.now();
      const t = tween(
        base + i * stagger,
        (e) => {
          const y = e * dist;
          const now = performance.now();
          const v2 = Math.abs(y - lastY) / Math.max(1, now - lastT); // px/ms
          lastY = y;
          lastT = now;
          v.strip.style.transform = `translate3d(0, ${(-y).toFixed(1)}px, 0)`;
          v.blur.setAttribute('stdDeviation', `0 ${Math.min(7, v2 * 1.6).toFixed(2)}`);
          const idx = Math.floor(y / tileH);
          if (idx !== lastTick) {
            lastTick = idx;
            sfx.tick(Math.min(1, v2 / 3));
          }
        },
        // Wind-up, cruise, then decelerate into a small overshoot.
        (x) => (x < 0.1 ? 0.03 * (x / 0.1) ** 2 : 0.03 + 0.97 * backOut((x - 0.1) / 0.9)),
      );
      this.tweens.push(t);
      await t.done;
      land();
      opts.onLand({
        reel: v.id,
        index: i,
        locked: false,
        tile: v.window.querySelector<HTMLElement>('.tile')!,
      });
    });

    await Promise.all(jobs);
    this.spinning = false;
  }

  /** Slam: land everything now. */
  finish(): void {
    for (const t of this.tweens) t.finish();
  }
}

function backOut(t: number): number {
  const c1 = 0.9;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
}
