import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-700.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

import { isMuted, setMuted, sfx, unlockAudio } from './audio/synth';
import { signatureById } from './data/signatures';
import { type FilterId, type Mode, type Order, REELS, type ReelId } from './data/types';
import { countForFilters, formatBig, orderRank, percentOf } from './engine/combinatorics';
import { emptyRequiredPools, FILTERS } from './engine/filters';
import {
  counterScript,
  decodeShare,
  encodeShare,
  orderTitle,
  type ShareState,
  sizeLabel,
} from './engine/order';
import { roll } from './engine/randomizer';
import { dailySeed, freshSeed } from './engine/rng';
import { type Harmony, scoreOrder } from './engine/scoring';
import { Achievements } from './ui/achievements';
import { chaosLabel, MODE_INFO, machineControls, modeTabs, syncModeTabs } from './ui/controls';
import { Gauge } from './ui/gauge';
import { History } from './ui/history';
import { Odometer } from './ui/odometer';
import { Receipt } from './ui/receipt';
import { Reels } from './ui/reels';
import { copyText, download, shareCard } from './ui/share';
import { Stage } from './ui/stage';
import { reducedMotion } from './util/anim';
import { load, save } from './util/persist';
import { createStore } from './util/store';

// ── State ────────────────────────────────────────────────────────────────
type Theme = 'system' | 'light' | 'dark';
interface Prefs {
  mode: Mode;
  chaos: number;
  filters: FilterId[];
  locks: ReelId[];
  muted: boolean;
  theme: Theme;
}
const saved = load<Partial<Prefs>>('prefs', {});
const store = createStore<Prefs & { spinning: boolean }>({
  mode: saved.mode && saved.mode in MODE_INFO ? saved.mode : 'custom',
  chaos: typeof saved.chaos === 'number' ? Math.max(0, Math.min(100, saved.chaos)) : 25,
  filters: Array.isArray(saved.filters) ? saved.filters.filter((f) => FILTERS.some((x) => x.id === f)) : [],
  locks: Array.isArray(saved.locks) ? saved.locks.filter((r) => REELS.includes(r)) : [],
  muted: !!saved.muted,
  theme: saved.theme ?? 'system',
  spinning: false,
});

interface Roll {
  order: Order;
  seed: string;
  harmony: Harmony;
  rank: bigint;
  mode: Mode;
  chaos: number;
  filters: FilterId[];
  locks: ReelId[];
}
let current: Roll | null = null;
let pending: Roll | null = null;
let runId = 0;
const TOTAL = countForFilters([]);

// ── DOM ──────────────────────────────────────────────────────────────────
const app = document.getElementById('app')!;
app.innerHTML = `
  <header class="top">
    <a class="brand" href="./" aria-label="Sandwich Roulette home">
      <svg class="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="22" fill="var(--green-600)"/>
        <circle cx="24" cy="24" r="16" fill="none" stroke="var(--yellow)" stroke-width="3" stroke-dasharray="4.2 4.2"/>
        <path d="M11 27c0-4 5.8-6 13-6s13 2 13 6z" fill="#F2C27A"/>
        <path d="M11 27.5h26" stroke="#8FD35A" stroke-width="3" stroke-linecap="round"/>
        <path d="M11.5 30h25c0 2.4-5.6 3.6-12.5 3.6S11.5 32.4 11.5 30z" fill="#D99A4E"/>
        <path d="M24 3.5 27 9h-6z" fill="var(--yellow)"/>
      </svg>
      <span class="brand-text"><b>Sandwich Roulette</b><small>${formatBig(TOTAL)} ways to order lunch</small></span>
    </a>
    <div class="top-modes"></div>
    <div class="top-tools">
      <button type="button" class="icon-btn" data-act="theme" aria-label="Theme"></button>
      <button type="button" class="icon-btn" data-act="mute" aria-label="Sound"></button>
      <button type="button" class="icon-btn" data-act="help" aria-label="Keyboard shortcuts" aria-keyshortcuts="?"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h1M10 10h1M13.5 10h1M17 10h.5M7 14h10"/></svg></button>
    </div>
  </header>
  <main class="layout">
    <section class="machine card" aria-labelledby="machine-h">
      <div class="card-row"><h2 id="machine-h" class="card-h">The Machine</h2><span class="mode-pill"></span></div>
      <p class="mode-desc"></p>
      <div class="reels-slot"></div>
      <div class="controls-slot"></div>
    </section>
    <section class="stage card" aria-labelledby="stage-title">
      <div class="stage-head">
        <div class="stage-heading">
          <p class="eyebrow"></p>
          <h1 id="stage-title" class="stage-title">Sandwich Roulette</h1>
          <ul class="facts" aria-label="Order facts"></ul>
        </div>
        <div class="gauge-slot"></div>
      </div>
      <div class="stage-slot"></div>
      <div class="serial">
        <p class="serial-main"><span class="serial-pre">Order No.</span> <span class="serial-odo"></span></p>
        <p class="serial-sub">of <b>${formatBig(TOTAL)}</b> possible orders<span class="serial-filtered"></span></p>
        <p class="serial-seen"></p>
      </div>
    </section>
    <aside class="side"></aside>
  </main>
  <footer class="foot">
    <p><b>Sandwich Roulette</b> is an independent fan project. Not affiliated with, endorsed by, or sponsored by Subway IP LLC. All artwork is original and procedurally generated; menu names are used descriptively. Nutrition and prices are rough estimates.</p>
  </footer>
  <div id="announce" class="sr-only" aria-live="polite"></div>
  <dialog class="help" aria-labelledby="help-h">
    <form method="dialog">
      <h2 id="help-h">Keyboard shortcuts</h2>
      <dl>
        <div><dt><kbd>Space</kbd></dt><dd>Spin — or skip to the result mid-spin</dd></div>
        <div><dt><kbd>1</kbd>–<kbd>7</kbd></dt><dd>Lock / unlock a reel</dd></div>
        <div><dt><kbd>R</kbd></dt><dd>Re-roll the unlocked reels</dd></div>
        <div><dt><kbd>←</kbd> <kbd>→</kbd></dt><dd>Chaos dial down / up</dd></div>
        <div><dt><kbd>T</kbd></dt><dd>Toggle toasted</dd></div>
        <div><dt><kbd>C</kbd></dt><dd>Copy the counter script</dd></div>
        <div><dt><kbd>S</kbd></dt><dd>Copy a share link</dd></div>
        <div><dt><kbd>M</kbd></dt><dd>Mute / unmute</dd></div>
        <div><dt><kbd>?</kbd></dt><dd>This help</dd></div>
      </dl>
      <button class="btn btn--primary" value="close">Got it</button>
    </form>
  </dialog>`;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => app.querySelector<T>(sel)!;
const announce = document.getElementById('announce')!;

const tabs = modeTabs((m) => setMode(m));
$('.top-modes').append(tabs);

const reels = new Reels((id) => toggleLock(id));
$('.reels-slot').append(reels.el);

const controls = machineControls({
  onChaos: (v) => store.set({ chaos: v }),
  onFilter: (f) => toggleFilter(f),
  onSpin: () => spin(),
});
$('.controls-slot').append(controls.el);

const stage = new Stage();
$('.stage-slot').append(stage.el);
const gauge = new Gauge();
$('.gauge-slot').append(gauge.el);
const odo = new Odometer('odometer');
$('.serial-odo').append(odo.el);

const achievements = new Achievements();
const receipt = new Receipt({
  copy: () => copyOrder(),
  share: () => copyLink(),
  image: () => void saveImage(),
});
const rollHistory = new History((s) => loadShare(s, false));
$('.side').append(receipt.el, rollHistory.el, achievements.el);

// ── Sync UI with state ───────────────────────────────────────────────────
function applyTheme(t: Theme): void {
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  const btn = $('[data-act="theme"]');
  const icons: Record<Theme, string> = {
    system:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg>',
    light:
      '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
  };
  btn.innerHTML = icons[t];
  btn.setAttribute('aria-label', `Theme: ${t}. Click to change.`);
  btn.title = `Theme: ${t}`;
}

function applyMute(m: boolean): void {
  setMuted(m);
  const btn = $('[data-act="mute"]');
  btn.innerHTML = m
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';
  btn.setAttribute('aria-label', m ? 'Sound off. Click to unmute.' : 'Sound on. Click to mute.');
  btn.setAttribute('aria-pressed', String(!m));
  btn.title = m ? 'Unmute (M)' : 'Mute (M)';
}

let lastTheme: Theme | null = null;
let lastMuted: boolean | null = null;
function sync(): void {
  const s = store.get();
  syncModeTabs(tabs, s.mode);
  controls.sync(s);
  reels.setLocks(s.locks, s.mode === 'daily');
  $('.mode-pill').textContent = MODE_INFO[s.mode].label;
  $('.mode-desc').textContent = MODE_INFO[s.mode].desc;
  if (s.theme !== lastTheme) applyTheme((lastTheme = s.theme));
  if (s.muted !== lastMuted) applyMute((lastMuted = s.muted));
  const filtered = s.filters.length ? countForFilters(s.filters) : null;
  $('.serial-filtered').innerHTML =
    filtered !== null ? ` · <b>${formatBig(filtered)}</b> match your filters` : '';
  app.classList.toggle('is-spinning', s.spinning);
}

store.subscribe((s, prev) => {
  sync();
  if (
    s.mode !== prev.mode ||
    s.chaos !== prev.chaos ||
    s.filters !== prev.filters ||
    s.locks !== prev.locks ||
    s.muted !== prev.muted ||
    s.theme !== prev.theme
  ) {
    const { spinning: _, ...prefs } = s;
    save('prefs', prefs);
  }
});

// ── Actions ──────────────────────────────────────────────────────────────
function setMode(m: Mode): void {
  if (store.get().spinning) slam();
  sfx.click();
  store.set({ mode: m });
}

function toggleLock(id: ReelId): void {
  const s = store.get();
  if (s.mode === 'daily') return;
  sfx.click();
  store.set({ locks: s.locks.includes(id) ? s.locks.filter((l) => l !== id) : [...s.locks, id] });
}

function toggleFilter(f: FilterId): void {
  const s = store.get();
  const next = s.filters.includes(f) ? s.filters.filter((x) => x !== f) : [...s.filters, f];
  const empty = emptyRequiredPools(next);
  if (empty.length) {
    achievements.notify(
      'That filter combo leaves nothing',
      `No ${empty.join(', ')} options would remain.`,
      '!',
    );
    return;
  }
  sfx.click();
  store.set({ filters: next });
}

function facts(o: Order): string {
  const li: string[] = [];
  li.push(sizeLabel(o));
  if (o.bread !== 'bowl') li.push(o.toasted ? 'Toasted' : 'Cold');
  if (o.signature) {
    const sig = signatureById.get(o.signature);
    if (sig)
      li.push(o.mutations ? `${o.mutations} layer${o.mutations > 1 ? 's' : ''} mutated` : 'By the book');
  }
  li.push(
    `${[o.protein, o.cheese, ...o.veggies, ...o.sauces, ...o.seasonings, ...o.extras].filter((id) => !id.startsWith('no-')).length} ingredients`,
  );
  return li.map((x) => `<li>${x}</li>`).join('');
}

function eyebrowFor(r: Roll): string {
  if (r.mode === 'daily')
    return `Daily Sub · ${new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}`;
  if (r.order.signature) return signatureById.get(r.order.signature)?.tagline ?? MODE_INFO[r.mode].label;
  if (r.mode === 'custom') return `${MODE_INFO.custom.label} · ${chaosLabel(r.chaos)}`;
  return MODE_INFO[r.mode].label;
}

function newRoll(): Roll {
  const s = store.get();
  const seed = s.mode === 'daily' ? dailySeed() : freshSeed();
  const res = roll({
    seed,
    mode: s.mode,
    chaos: s.chaos,
    filters: s.filters,
    locks: s.locks,
    previous: current?.order,
  });
  for (const n of res.notes) achievements.notify(n, '', 'i');
  const order = res.order;
  return {
    order,
    seed,
    harmony: scoreOrder(order),
    rank: orderRank(order),
    mode: s.mode,
    chaos: Math.round(res.chaos * 100),
    filters: [...s.filters],
    locks: [...s.locks],
  };
}

function fromShare(st: ShareState): Roll {
  return {
    order: st.order,
    seed: st.seed,
    harmony: scoreOrder(st.order),
    rank: orderRank(st.order),
    mode: st.mode,
    chaos: st.chaos,
    filters: st.filters,
    locks: [],
  };
}

async function spin(replay?: Roll): Promise<void> {
  unlockAudio();
  if (store.get().spinning) {
    slam();
    return;
  }
  const r = replay ?? newRoll();
  pending = r;
  const id = ++runId;
  store.set({ spinning: true });
  sfx.lever();
  receipt.clear();
  void gauge.set(null, false);
  $('.eyebrow').textContent = 'Spinning…';
  $('.stage-title').textContent = 'Rolling the dice on lunch';
  $('.facts').innerHTML = '';
  const title = orderTitle(r.order);
  stage.prepare(r.order, r.seed, title);

  await reels.spin(r.order, {
    locks: replay ? [] : r.locks,
    chaos: r.chaos / 100,
    onLand: (e) => {
      if (id !== runId) return;
      if (!e.locked) {
        sfx.lock(e.index);
        stage.ghost(e.tile);
      }
      void stage.reveal(e.reel);
    },
  });
  if (id !== runId) return;
  await stage.closeLid();
  if (id !== runId) return;
  await stage.toast(r.order);
  if (id !== runId) return;
  finalize(r, { animate: true, record: true });
}

/** Skip to the end of the current spin. */
function slam(): void {
  const r = pending;
  if (!r) return;
  runId++;
  reels.finish();
  reels.show(r.order);
  stage.finishAll(r.order);
  finalize(r, { animate: false, record: true });
}

function finalize(r: Roll, opts: { animate: boolean; record: boolean }): void {
  pending = null;
  current = r;
  store.set({ spinning: false });
  const title = orderTitle(r.order);
  $('.eyebrow').textContent = eyebrowFor(r);
  $('.stage-title').textContent = title;
  $('.facts').innerHTML = facts(r.order);
  const script = counterScript(r.order, r.harmony.score);
  void gauge.set(r.harmony, opts.animate);
  odo.set(formatBig(r.rank + 1n), !reducedMotion());
  receipt.set({ order: r.order, harmony: r.harmony, seed: r.seed, rank: r.rank, script }, opts.animate);
  const share = encodeShare({
    seed: r.seed,
    mode: r.mode,
    chaos: r.chaos,
    filters: r.filters,
    order: r.order,
  });
  try {
    window.history.replaceState(null, '', `?s=${share}`);
  } catch {
    /* sandboxed iframes may refuse */
  }
  announce.textContent = `${title}. Harmony ${r.harmony.score} out of 100: ${r.harmony.verdict.label}. ${script}`;

  if (opts.record) {
    const tone = r.harmony.verdict.tone;
    if (tone === 'kiss') {
      stage.confetti();
      sfx.jackpot();
    } else if (tone === 'good') sfx.ding();
    else if (tone === 'cursed' || tone === 'crime') {
      stage.shake();
      sfx.cursed();
    }
    rollHistory.add({ s: share, title, score: r.harmony.score, tone, t: Date.now() });
    achievements.record({
      order: r.order,
      harmony: r.harmony,
      mode: r.mode,
      chaos: r.chaos,
      filters: r.filters,
      locks: r.locks,
    });
  }
  updateSeen();
}

function updateSeen(): void {
  const unique = new Set(rollHistory.all.map((e) => e.s.split('.').slice(5).join('.'))).size;
  const n = Math.max(achievements.rolls, unique);
  $('.serial-seen').textContent = n
    ? `You've personally seen ${percentOf(BigInt(Math.max(1, unique)), TOTAL)} of all possible sandwiches.`
    : '';
}

function loadShare(s: string, animate: boolean): void {
  const st = decodeShare(s);
  if (!st) {
    achievements.notify("That link didn't decode", 'Rolling a fresh one instead.', '!');
    return;
  }
  if (store.get().spinning) slam();
  store.set({
    mode: st.mode,
    chaos: st.mode === 'custom' || st.mode === 'signature' ? st.chaos : store.get().chaos,
    filters: st.filters,
  });
  const r = fromShare(st);
  if (animate) {
    void spin(r);
  } else {
    reels.show(r.order);
    stage.showFinal(r.order, r.seed, orderTitle(r.order));
    finalize(r, { animate: false, record: false });
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }
}

async function copyOrder(): Promise<void> {
  if (!current) return;
  const ok = await copyText(counterScript(current.order, current.harmony.score));
  achievements.notify(
    ok ? 'Order copied' : "Couldn't copy",
    ok ? 'Read it out at the counter.' : 'Select the text and copy it manually.',
    ok ? '✓' : '!',
  );
}

async function copyLink(): Promise<void> {
  if (!current) return;
  const url = new URL(location.href);
  url.search = `?s=${encodeShare({ seed: current.seed, mode: current.mode, chaos: current.chaos, filters: current.filters, order: current.order })}`;
  const ok = await copyText(url.toString());
  achievements.notify(
    ok ? 'Link copied' : "Couldn't copy",
    ok ? 'Opening it replays this exact spin.' : url.toString(),
    ok ? '⤴' : '!',
  );
}

async function saveImage(): Promise<void> {
  if (!current) return;
  try {
    const blob = await shareCard(
      current.order,
      current.seed,
      current.harmony,
      `Order No. ${formatBig(current.rank + 1n)} of ${formatBig(TOTAL)}`,
    );
    const file = new File([blob], `sandwich-${current.seed}.png`, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator
        .share({ files: [file], title: orderTitle(current.order) })
        .catch(() => download(blob, file.name));
    } else {
      download(blob, file.name);
    }
  } catch {
    achievements.notify("Couldn't make the image", 'Your browser blocked canvas export.', '!');
  }
}

function toggleToast(): void {
  if (!current || store.get().spinning || current.order.bread === 'bowl') return;
  const order: Order = { ...current.order, toasted: !current.order.toasted };
  const r: Roll = { ...current, order, harmony: scoreOrder(order), rank: orderRank(order) };
  if (order.toasted && !reducedMotion()) {
    stage.showFinal({ ...order, toasted: false }, r.seed, orderTitle(order), false);
    // Rebuild toasted-but-raw, then animate the toast in.
    stage.prepare(order, r.seed, orderTitle(order));
    stage.finishAll({ ...order, toasted: false });
    void stage.toast(order).then(() => finalize(r, { animate: true, record: false }));
  } else {
    stage.showFinal(order, r.seed, orderTitle(order));
    finalize(r, { animate: true, record: false });
  }
  reels.show(order);
}

// ── Header tools, keyboard ──────────────────────────────────────────────
$('[data-act="theme"]').addEventListener('click', () => {
  const order: Theme[] = ['system', 'light', 'dark'];
  store.set({ theme: order[(order.indexOf(store.get().theme) + 1) % 3] as Theme });
});
$('[data-act="mute"]').addEventListener('click', () => {
  unlockAudio();
  store.set({ muted: !isMuted() });
});
const help = $('.help') as HTMLDialogElement;
$('[data-act="help"]').addEventListener('click', () => help.showModal());

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (help.open) return;
  const tag = t.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable) {
    if (e.key !== ' ' || (t as HTMLInputElement).type !== 'range') return;
  }
  if ((tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') && (e.key === ' ' || e.key === 'Enter')) return;
  const k = e.key.toLowerCase();
  if (k === ' ' || k === 'r') {
    e.preventDefault();
    void spin();
  } else if (/^[1-7]$/.test(k)) {
    toggleLock(REELS[Number(k) - 1] as ReelId);
  } else if (k === 'arrowleft' || k === 'arrowright') {
    if (tag === 'INPUT') return;
    store.set({ chaos: Math.max(0, Math.min(100, store.get().chaos + (k === 'arrowright' ? 5 : -5))) });
  } else if (k === 'c') void copyOrder();
  else if (k === 's') void copyLink();
  else if (k === 't') toggleToast();
  else if (k === 'm') {
    unlockAudio();
    store.set({ muted: !isMuted() });
  } else if (k === '?') help.showModal();
});

// Any first interaction unlocks audio.
window.addEventListener('pointerdown', unlockAudio, { once: true });

// ── Boot ─────────────────────────────────────────────────────────────────
sync();
const params = new URLSearchParams(location.search);
const shared = params.get('s');
if (shared && decodeShare(shared)) {
  loadShare(shared, true);
} else {
  // First paint: today's Daily Sub, fully built — the page is never empty.
  const seed = dailySeed();
  const { order } = roll({ seed, mode: 'daily', chaos: 35, filters: [], locks: [] });
  const r: Roll = {
    order,
    seed,
    harmony: scoreOrder(order),
    rank: orderRank(order),
    mode: 'daily',
    chaos: 35,
    filters: [],
    locks: [],
  };
  reels.show(order);
  stage.showFinal(order, seed, orderTitle(order), false);
  finalize(r, { animate: false, record: false });
  $('.eyebrow').textContent = `Today's Daily Sub · pull the lever for yours`;
  try {
    window.history.replaceState(null, '', location.pathname);
  } catch {
    /* ignore */
  }
}
