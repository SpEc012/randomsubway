import { decodeShare, orderTitle } from '../engine/order';
import { buildSandwich } from '../render/sandwich';
import { load, save } from '../util/persist';

export interface HistoryEntry {
  /** Share code — everything needed to restore the roll. */
  s: string;
  title: string;
  score: number;
  tone: string;
  t: number;
}

const KEY = 'history';
const MAX = 50;
type Tab = 'recent' | 'fame' | 'shame';

export class History {
  readonly el: HTMLElement;
  private list: HTMLElement;
  private entries: HistoryEntry[];
  private tab: Tab = 'recent';
  private limit = 8;
  private thumbs = new Map<string, string>();

  constructor(private onSelect: (share: string) => void) {
    this.entries = load<HistoryEntry[]>(KEY, []).filter((e) => typeof e?.s === 'string');
    this.el = document.createElement('section');
    this.el.className = 'history card';
    this.el.setAttribute('aria-labelledby', 'history-h');
    this.el.innerHTML = `
      <div class="card-row">
        <h2 id="history-h" class="card-h">History</h2>
        <div class="tabs" role="tablist" aria-label="History view">
          <button role="tab" type="button" data-tab="recent" aria-selected="true">Recent</button>
          <button role="tab" type="button" data-tab="fame" aria-selected="false">Hall of Fame</button>
          <button role="tab" type="button" data-tab="shame" aria-selected="false">Hall of Shame</button>
        </div>
      </div>
      <ol class="hist-list"></ol>
      <div class="hist-foot"><button type="button" class="link" data-act="more">Show more</button><button type="button" class="link link--danger" data-act="clear">Clear history</button></div>`;
    this.list = this.el.querySelector<HTMLElement>('.hist-list')!;
    for (const b of this.el.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        for (const x of this.el.querySelectorAll('[data-tab]'))
          x.setAttribute('aria-selected', String(x === b));
        this.render();
      });
    }
    this.el.querySelector('[data-act="more"]')!.addEventListener('click', () => {
      this.limit += 12;
      this.render();
    });
    this.el.querySelector('[data-act="clear"]')!.addEventListener('click', () => {
      if (!this.entries.length || !confirm('Clear your roll history?')) return;
      this.entries = [];
      save(KEY, this.entries);
      this.render();
    });
    this.list.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-s]');
      if (li?.dataset.s) this.onSelect(li.dataset.s);
    });
    this.render();
  }

  get all(): readonly HistoryEntry[] {
    return this.entries;
  }

  add(e: HistoryEntry): void {
    this.entries = [e, ...this.entries.filter((x) => x.s !== e.s)].slice(0, MAX);
    save(KEY, this.entries);
    this.render();
  }

  private thumb(s: string): string {
    const hit = this.thumbs.get(s);
    if (hit) return hit;
    const st = decodeShare(s);
    if (!st) return '';
    const art = buildSandwich(st.order, { seed: st.seed, lite: true, finished: true });
    const markup = art.svg.outerHTML;
    this.thumbs.set(s, markup);
    return markup;
  }

  private render(): void {
    let rows = [...this.entries];
    if (this.tab === 'fame') rows = rows.sort((a, b) => b.score - a.score).slice(0, 5);
    if (this.tab === 'shame') rows = rows.sort((a, b) => a.score - b.score).slice(0, 5);
    const shown = this.tab === 'recent' ? rows.slice(0, this.limit) : rows;
    (this.el.querySelector('[data-act="more"]') as HTMLElement).hidden =
      this.tab !== 'recent' || rows.length <= this.limit;
    if (!shown.length) {
      this.list.innerHTML = '<li class="hist-empty">Your rolls will show up here.</li>';
      return;
    }
    const esc = (x: string) => x.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    this.list.innerHTML = shown
      .map((e) => {
        const ago = relTime(e.t);
        return `<li><button type="button" class="hist-item" data-s="${esc(e.s)}" title="Load this roll"><span class="hist-thumb">${this.thumb(e.s)}</span><span class="hist-text"><b>${esc(e.title)}</b><small>${esc(ago)}</small></span><span class="hist-score" data-tone="${esc(e.tone)}">${e.score}</span></button></li>`;
      })
      .join('');
  }
}

export function entryTitle(share: string): string {
  const st = decodeShare(share);
  return st ? orderTitle(st.order) : 'Unknown roll';
}

function relTime(t: number): string {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
