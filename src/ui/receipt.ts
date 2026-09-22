import { BOWL, ing, NONE_CHEESE, NONE_PROTEIN } from '../data/ingredients';
import type { Order } from '../data/types';
import { formatBig } from '../engine/combinatorics';
import { orderTitle, sizeLabel, totals } from '../engine/order';
import { hash128 } from '../engine/rng';
import type { Harmony } from '../engine/scoring';
import { reducedMotion } from '../util/anim';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const name = (id: string) => ing(id).name.replace(/®/g, '');

export interface ReceiptData {
  order: Order;
  harmony: Harmony;
  seed: string;
  rank: bigint;
  script: string;
}

function barcode(seed: string): string {
  const words = hash128(`bar:${seed}`);
  let bars = '';
  let x = 0;
  for (const w of words) {
    for (let i = 0; i < 16; i++) {
      const bw = ((w >> (i * 2)) & 3) + 1;
      if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${bw}" height="28"/>`;
      x += bw + 1;
    }
  }
  return `<svg class="barcode" viewBox="0 0 ${x} 28" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
}

export function receiptHTML(d: ReceiptData): string {
  const o = d.order;
  const t = totals(o);
  const ex = new Set(o.extras);
  const rows: [string, string][] = [];
  const line = (label: string, note = '') => rows.push([label, note]);
  if (o.bread === BOWL) line('Protein Bowl');
  else line(`${sizeLabel(o)} ${name(o.bread)}`, o.toasted ? 'TOASTED' : '');
  if (o.protein !== NONE_PROTEIN) line(`  ${name(o.protein)}`, ex.has('double-meat') ? '×2' : '');
  if (o.cheese !== NONE_CHEESE) line(`  ${name(o.cheese)}`, ex.has('extra-cheese') ? '×2' : '');
  for (const e of o.extras)
    if (e !== 'double-meat' && e !== 'extra-cheese') line(`  + ${name(e).replace(/^Add /, '')}`);
  for (const v of o.veggies) line(`  ${name(v)}`);
  for (const s of o.sauces) line(`  ${name(s)}`);
  if (o.seasonings.length) line(`  ${o.seasonings.map(name).join(', ')}`);

  const pair = (p?: { a: string; b: string }) => (p ? `${name(p.a)} × ${name(p.b)}` : '');
  const when = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return `
  <div class="receipt-paper">
    <div class="rc-head">
      <b>SANDWICH ROULETTE</b>
      <span>Order No. ${formatBig(d.rank + 1n)}</span>
    </div>
    <div class="rc-title">${esc(orderTitle(o))}</div>
    <ul class="rc-lines">${rows.map(([l, n]) => `<li><span>${esc(l)}</span>${n ? `<em>${esc(n)}</em>` : ''}</li>`).join('')}</ul>
    <div class="rc-rule"></div>
    <dl class="rc-totals">
      <div><dt>Approx. kcal</dt><dd>${t.kcal.toLocaleString()}</dd></div>
      <div><dt>Approx. total</dt><dd>$${t.price.toFixed(2)}</dd></div>
      <div class="rc-harmony" data-tone="${d.harmony.verdict.tone}"><dt>Harmony</dt><dd>${d.harmony.score}/100 · ${esc(d.harmony.verdict.label)}</dd></div>
    </dl>
    ${d.harmony.best ? `<p class="rc-note rc-note--good"><span>Best duo</span> ${esc(pair(d.harmony.best))}</p>` : ''}
    ${d.harmony.worst ? `<p class="rc-note rc-note--bad"><span>Crime</span> ${esc(pair(d.harmony.worst))}</p>` : ''}
    <div class="rc-rule"></div>
    ${barcode(d.seed)}
    <div class="rc-foot"><span>SEED ${esc(d.seed)}</span><span>${esc(when)}</span></div>
    <p class="rc-fine">Estimates only — not official nutrition or pricing.</p>
  </div>`;
}

export class Receipt {
  readonly el: HTMLElement;
  private paper: HTMLElement;
  private script: HTMLElement;

  constructor(actions: { copy: () => void; share: () => void; image: () => void }) {
    this.el = document.createElement('section');
    this.el.className = 'receipt card';
    this.el.setAttribute('aria-labelledby', 'receipt-h');
    this.el.innerHTML = `
      <h2 id="receipt-h" class="card-h">Your order</h2>
      <div class="say">
        <span class="say-label">Say this at the counter</span>
        <p class="say-text">Pull the lever to get an order.</p>
      </div>
      <div class="rc-actions">
        <button type="button" class="btn btn--primary" data-act="copy"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg><span>Copy order</span></button>
        <button type="button" class="btn" data-act="share"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg><span>Link</span></button>
        <button type="button" class="btn" data-act="image"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20 16-4.5-4.5L7 19"/></svg><span>Image</span></button>
      </div>
      <div class="receipt-slot"></div>`;
    this.paper = this.el.querySelector<HTMLElement>('.receipt-slot')!;
    this.script = this.el.querySelector<HTMLElement>('.say-text')!;
    this.el.querySelector('[data-act="copy"]')!.addEventListener('click', actions.copy);
    this.el.querySelector('[data-act="share"]')!.addEventListener('click', actions.share);
    this.el.querySelector('[data-act="image"]')!.addEventListener('click', actions.image);
  }

  clear(): void {
    this.paper.innerHTML = '';
    this.script.textContent = 'Spinning…';
    this.el.classList.add('is-pending');
  }

  set(d: ReceiptData, animate = true): void {
    this.el.classList.remove('is-pending');
    this.script.textContent = `“${d.script}”`;
    this.paper.innerHTML = receiptHTML(d);
    if (animate && !reducedMotion()) {
      const p = this.paper.firstElementChild as HTMLElement;
      p.animate(
        [
          { clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-14px) rotate(-.6deg)' },
          { clipPath: 'inset(0 0 0 0)', transform: 'translateY(0) rotate(.25deg)', offset: 0.85 },
          { clipPath: 'inset(0 0 0 0)', transform: 'none' },
        ],
        { duration: 900, easing: 'steps(18, end)' },
      );
    }
  }
}
