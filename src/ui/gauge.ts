import type { Harmony } from '../engine/scoring';
import { reducedMotion, tween } from '../util/anim';

/** Semicircular harmony gauge that sweeps to the score. */
export class Gauge {
  readonly el: HTMLElement;
  private arc: SVGPathElement;
  private needle: SVGGElement;
  private num: HTMLElement;
  private label: HTMLElement;
  private shown = 0;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'gauge';
    this.el.innerHTML = `
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path class="gauge-track" d="M10 62 A50 50 0 0 1 110 62" pathLength="100"/>
        <path class="gauge-arc" d="M10 62 A50 50 0 0 1 110 62" pathLength="100"/>
        <g class="gauge-needle"><line x1="60" y1="62" x2="60" y2="20"/><circle cx="60" cy="62" r="4.5"/></g>
      </svg>
      <div class="gauge-read"><b class="gauge-num">–</b><span class="gauge-label">Harmony</span></div>`;
    this.arc = this.el.querySelector<SVGPathElement>('.gauge-arc')!;
    this.needle = this.el.querySelector<SVGGElement>('.gauge-needle')!;
    this.num = this.el.querySelector<HTMLElement>('.gauge-num')!;
    this.label = this.el.querySelector<HTMLElement>('.gauge-label')!;
    this.draw(0);
  }

  private draw(v: number): void {
    this.arc.style.strokeDasharray = `${v} 100`;
    this.needle.style.transform = `rotate(${-90 + v * 1.8}deg)`;
    this.num.textContent = String(Math.round(v));
  }

  set(h: Harmony | null, animate = true): Promise<void> {
    if (!h) {
      this.shown = 0;
      this.draw(0);
      this.el.dataset.tone = '';
      this.label.textContent = 'Harmony';
      this.num.textContent = '–';
      this.el.removeAttribute('aria-label');
      return Promise.resolve();
    }
    this.el.dataset.tone = h.verdict.tone;
    this.label.textContent = h.verdict.label;
    this.el.setAttribute('aria-label', `Harmony ${h.score} of 100: ${h.verdict.label}`);
    const from = this.shown;
    this.shown = h.score;
    if (!animate || reducedMotion()) {
      this.draw(h.score);
      return Promise.resolve();
    }
    return tween(900, (t) => this.draw(from + (h.score - from) * t)).done;
  }
}
