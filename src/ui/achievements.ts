import { byCategory, byId, NONE_CHEESE } from '../data/ingredients';
import type { FilterId, Mode, Order, ReelId } from '../data/types';
import { matchesSignature, orderKey } from '../engine/randomizer';
import type { Harmony } from '../engine/scoring';
import { reducedMotion } from '../util/anim';
import { load, save } from '../util/persist';

export interface RollContext {
  order: Order;
  harmony: Harmony;
  mode: Mode;
  chaos: number;
  filters: readonly FilterId[];
  locks: readonly ReelId[];
}

interface Stats {
  rolls: number;
  crimes: number;
  keys: string[];
  signatures: string[];
  unlocked: Record<string, number>;
}

interface Achievement {
  id: string;
  name: string;
  desc: string;
  glyph: string;
  test: (c: RollContext, s: Stats) => boolean;
}

const spicyCount = (o: Order) =>
  [o.bread, o.protein, o.cheese, ...o.veggies, ...o.sauces, ...o.seasonings, ...o.extras].filter((id) =>
    byId.get(id)?.tags.includes('spicy'),
  ).length;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-bite',
    name: 'First Bite',
    desc: 'Pull the lever for the first time.',
    glyph: '1',
    test: (_, s) => s.rolls >= 1,
  },
  { id: 'regular', name: 'Regular', desc: 'Roll 25 sandwiches.', glyph: '25', test: (_, s) => s.rolls >= 25 },
  {
    id: 'centurion',
    name: 'Centurion',
    desc: 'Roll 100 sandwiches.',
    glyph: 'C',
    test: (_, s) => s.rolls >= 100,
  },
  {
    id: 'chefs-kiss',
    name: "Chef's Kiss",
    desc: 'Score 90+ harmony.',
    glyph: '♥',
    test: (c) => c.harmony.score >= 90,
  },
  {
    id: 'perfect-storm',
    name: 'Perfect Storm',
    desc: 'Score 97+ harmony.',
    glyph: '★',
    test: (c) => c.harmony.score >= 97,
  },
  {
    id: 'abomination',
    name: 'Abomination',
    desc: 'Score under 10 harmony.',
    glyph: '☠',
    test: (c) => c.harmony.score < 10,
  },
  {
    id: 'repeat-offender',
    name: 'Repeat Offender',
    desc: 'Commit 5 crimes against bread.',
    glyph: '5',
    test: (_, s) => s.crimes >= 5,
  },
  { id: 'purist', name: 'Purist', desc: 'Roll in Monk mode.', glyph: '○', test: (c) => c.mode === 'monk' },
  {
    id: 'nightmare-fuel',
    name: 'Nightmare Fuel',
    desc: 'Survive a Nightmare roll.',
    glyph: '!',
    test: (c) => c.mode === 'nightmare',
  },
  {
    id: 'daily-driver',
    name: 'Daily Driver',
    desc: "Roll today's Daily Sub.",
    glyph: 'D',
    test: (c) => c.mode === 'daily',
  },
  {
    id: 'everything',
    name: 'Everything, Please',
    desc: 'Get every single veggie.',
    glyph: '∀',
    test: (c) => c.order.veggies.length === byCategory.veggie.length,
  },
  {
    id: 'sauce-boss',
    name: 'Sauce Boss',
    desc: 'Six or more sauces on one sub.',
    glyph: '~',
    test: (c) => c.order.sauces.length >= 6,
  },
  {
    id: 'dry-spell',
    name: 'Dry Spell',
    desc: 'No sauce, no cheese, no veggies.',
    glyph: '·',
    test: (c) => !c.order.sauces.length && !c.order.veggies.length && c.order.cheese === NONE_CHEESE,
  },
  {
    id: 'heat-seeker',
    name: 'Heat Seeker',
    desc: 'Four or more spicy things at once.',
    glyph: '▲',
    test: (c) => spicyCount(c.order) >= 4,
  },
  {
    id: 'deja-vu',
    name: 'Déjà Vu',
    desc: 'Roll the exact same sandwich twice.',
    glyph: '∞',
    test: (c, s) => s.keys.filter((k) => k === orderKey(c.order)).length >= 2,
  },
  {
    id: 'exact-match',
    name: 'Exact Match',
    desc: 'Randomly land on a signature recipe in Custom mode.',
    glyph: '◎',
    test: (c) => c.mode === 'custom' && !!matchesSignature(c.order),
  },
  {
    id: 'collector',
    name: 'Collector',
    desc: 'Roll 8 different signature subs.',
    glyph: '8',
    test: (_, s) => s.signatures.length >= 8,
  },
  {
    id: 'plant-powered',
    name: 'Plant Powered',
    desc: 'Roll with the Vegan filter on.',
    glyph: 'V',
    test: (c) => c.filters.includes('vegan'),
  },
  {
    id: 'hold-steady',
    name: 'Hold Steady',
    desc: 'Roll with 3+ reels locked.',
    glyph: 'H',
    test: (c) => c.locks.length >= 3,
  },
  {
    id: 'full-send',
    name: 'Full Send',
    desc: 'Roll Custom at maximum chaos.',
    glyph: '∿',
    test: (c) => c.mode === 'custom' && c.chaos >= 100,
  },
];

const KEY = 'stats';

export class Achievements {
  readonly el: HTMLElement;
  private stats: Stats;
  private toasts: HTMLElement;

  constructor() {
    const raw = load<Partial<Stats>>(KEY, {});
    this.stats = {
      rolls: raw.rolls ?? 0,
      crimes: raw.crimes ?? 0,
      keys: Array.isArray(raw.keys) ? raw.keys.slice(-400) : [],
      signatures: Array.isArray(raw.signatures) ? raw.signatures : [],
      unlocked: raw.unlocked && typeof raw.unlocked === 'object' ? raw.unlocked : {},
    };
    this.el = document.createElement('section');
    this.el.className = 'badges card';
    this.el.setAttribute('aria-labelledby', 'badges-h');
    this.toasts = document.createElement('div');
    this.toasts.className = 'toast-stack';
    this.toasts.setAttribute('role', 'status');
    this.toasts.setAttribute('aria-live', 'polite');
    document.body.append(this.toasts);
    this.render();
  }

  get rolls(): number {
    return this.stats.rolls;
  }

  /** Record a roll; returns newly unlocked achievements. */
  record(c: RollContext): Achievement[] {
    const s = this.stats;
    s.rolls += 1;
    if (c.harmony.score < 15) s.crimes += 1;
    s.keys = [...s.keys, orderKey(c.order)].slice(-400);
    if (c.order.signature && !s.signatures.includes(c.order.signature)) s.signatures.push(c.order.signature);
    const fresh = ACHIEVEMENTS.filter((a) => !s.unlocked[a.id] && a.test(c, s));
    for (const a of fresh) s.unlocked[a.id] = Date.now();
    save(KEY, s);
    if (fresh.length) {
      this.render();
      for (const [i, a] of fresh.entries()) setTimeout(() => this.toast(a), 400 + i * 900);
    }
    return fresh;
  }

  /** Transient notification (also used for copy/share confirmations). */
  notify(title: string, body = '', glyph = '✓'): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="toast-glyph" aria-hidden="true"></span><span><b></b><small></small></span>`;
    t.querySelector('.toast-glyph')!.textContent = glyph;
    t.querySelector('b')!.textContent = title;
    t.querySelector('small')!.textContent = body;
    this.toasts.append(t);
    if (!reducedMotion())
      t.animate(
        [
          { transform: 'translateY(16px) scale(.96)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1.2)' },
      );
    setTimeout(() => {
      const out = reducedMotion()
        ? null
        : t.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(8px)' }], { duration: 220 });
      if (out) out.finished.finally(() => t.remove());
      else t.remove();
    }, 2800);
  }

  private toast(a: Achievement): void {
    this.notify(`Unlocked: ${a.name}`, a.desc, a.glyph);
  }

  private render(): void {
    const got = ACHIEVEMENTS.filter((a) => this.stats.unlocked[a.id]).length;
    this.el.innerHTML = `
      <div class="card-row"><h2 id="badges-h" class="card-h">Badges</h2><span class="muted">${got} / ${ACHIEVEMENTS.length}</span></div>
      <ul class="badge-grid">${ACHIEVEMENTS.map((a) => {
        const on = !!this.stats.unlocked[a.id];
        return `<li class="badge${on ? ' is-on' : ''}" title="${a.name} — ${a.desc}${on ? '' : ' (locked)'}"><span class="badge-glyph" aria-hidden="true">${on ? a.glyph : '?'}</span><span class="sr-only">${a.name}: ${a.desc}. ${on ? 'Unlocked' : 'Locked'}.</span></li>`;
      }).join('')}</ul>`;
  }
}
