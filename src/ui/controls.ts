import { type FilterId, MODES, type Mode } from '../data/types';
import { FILTERS } from '../engine/filters';

export const MODE_INFO: Record<Mode, { label: string; desc: string }> = {
  custom: { label: 'Custom', desc: 'Every layer rolled independently. The Chaos Dial decides how brave.' },
  signature: {
    label: 'Signature',
    desc: 'Starts from a menu classic — then chaos mutates layers. “The B.M.T., but wrong.”',
  },
  nightmare: { label: 'Nightmare', desc: 'Maximum chaos. Maximum sauces. Double everything. No refunds.' },
  monk: { label: 'Monk', desc: 'Bread. One protein. Nothing else. Serene.' },
  daily: { label: 'Daily', desc: 'Everyone on Earth gets the same sub today. Resets at midnight UTC.' },
};

export function chaosLabel(c: number): string {
  if (c <= 15) return 'Safe Bet';
  if (c <= 40) return 'Curious';
  if (c <= 65) return 'Adventurous';
  if (c <= 88) return 'Unhinged';
  return 'Absolute Chaos';
}

export function modeTabs(onChange: (m: Mode) => void): HTMLElement {
  const nav = document.createElement('div');
  nav.className = 'modes';
  nav.setAttribute('role', 'radiogroup');
  nav.setAttribute('aria-label', 'Mode');
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.mode = m;
    b.textContent = MODE_INFO[m].label;
    b.title = MODE_INFO[m].desc;
    b.addEventListener('click', () => onChange(m));
    nav.append(b);
  }
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...nav.querySelectorAll<HTMLButtonElement>('button')];
    const i = btns.findIndex((b) => b.getAttribute('aria-checked') === 'true');
    const next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length]!;
    next.focus();
    onChange(next.dataset.mode as Mode);
    e.preventDefault();
    e.stopPropagation();
  });
  return nav;
}

export function syncModeTabs(nav: HTMLElement, mode: Mode): void {
  for (const b of nav.querySelectorAll<HTMLButtonElement>('button')) {
    const on = b.dataset.mode === mode;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

export interface MachineControls {
  el: HTMLElement;
  sync(s: { chaos: number; filters: readonly FilterId[]; mode: Mode; spinning: boolean }): void;
}

export function machineControls(h: {
  onChaos: (v: number) => void;
  onFilter: (f: FilterId) => void;
  onSpin: () => void;
}): MachineControls {
  const el = document.createElement('div');
  el.className = 'controls';
  el.innerHTML = `
    <div class="dial">
      <div class="dial-row">
        <label for="chaos" class="dial-label">Chaos Dial</label>
        <output for="chaos" class="dial-out"><b class="dial-name">Safe Bet</b> <span class="dial-num">0</span></output>
      </div>
      <input id="chaos" type="range" min="0" max="100" step="1" value="25" aria-describedby="chaos-hint" />
      <div class="dial-ticks" aria-hidden="true"><span>Safe</span><span>Adventurous</span><span>Chaos</span></div>
      <p id="chaos-hint" class="sr-only">Low chaos favors popular pairings; high chaos makes every ingredient equally likely.</p>
    </div>
    <details class="filters">
      <summary><span>Dietary filters</span><span class="filter-count" hidden></span></summary>
      <div class="chips" role="group" aria-label="Dietary filters">
        ${FILTERS.map((f) => `<button type="button" class="chip" data-filter="${f.id}" aria-pressed="false">${f.label}</button>`).join('')}
      </div>
    </details>
    <button type="button" class="spin" aria-keyshortcuts="Space">
      <span class="spin-lever" aria-hidden="true"><i></i></span>
      <span class="spin-text"><b>Spin</b><small>or press Space</small></span>
    </button>`;
  const range = el.querySelector<HTMLInputElement>('#chaos')!;
  const name = el.querySelector<HTMLElement>('.dial-name')!;
  const num = el.querySelector<HTMLElement>('.dial-num')!;
  const count = el.querySelector<HTMLElement>('.filter-count')!;
  const spin = el.querySelector<HTMLButtonElement>('.spin')!;
  range.addEventListener('input', () => h.onChaos(Number(range.value)));
  for (const b of el.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
    b.addEventListener('click', () => h.onFilter(b.dataset.filter as FilterId));
  }
  spin.addEventListener('click', h.onSpin);

  return {
    el,
    sync(s) {
      const locked = s.mode === 'nightmare' || s.mode === 'daily';
      const shown =
        s.mode === 'nightmare'
          ? 100
          : s.mode === 'daily'
            ? 35
            : s.mode === 'monk'
              ? Math.min(s.chaos, 30)
              : s.chaos;
      range.value = String(shown);
      range.disabled = locked;
      range.setAttribute('aria-valuetext', `${shown} — ${chaosLabel(shown)}`);
      name.textContent = chaosLabel(shown);
      num.textContent = String(shown);
      document.documentElement.style.setProperty('--chaos', String(shown / 100));
      for (const b of el.querySelectorAll<HTMLButtonElement>('[data-filter]')) {
        b.setAttribute('aria-pressed', String(s.filters.includes(b.dataset.filter as FilterId)));
      }
      count.hidden = s.filters.length === 0;
      count.textContent = String(s.filters.length);
      spin.classList.toggle('is-spinning', s.spinning);
      spin.querySelector('b')!.textContent = s.spinning ? 'Skip' : 'Spin';
      spin.querySelector('small')!.textContent = s.spinning ? 'jump to the result' : 'or press Space';
    },
  };
}
