import { reducedMotion } from '../util/anim';

/**
 * Per-digit rolling counter for BigInt strings. Each digit column holds three
 * 0–9 cycles; a roll resets to cycle one and glides into cycle three so every
 * digit visibly spins, with the rightmost digits spinning longest.
 */
export class Odometer {
  readonly el: HTMLElement;
  private value = '';

  constructor(className = 'odometer') {
    this.el = document.createElement('span');
    this.el.className = className;
  }

  set(text: string, animate = true): void {
    const prev = this.value;
    this.value = text;
    this.el.setAttribute('aria-label', text);
    const quick = !animate || reducedMotion();
    const frag = document.createDocumentFragment();
    const chars = [...text];
    const digitsTotal = chars.filter((c) => /\d/.test(c)).length;
    let digitIndex = 0;
    const prevDigits = [...prev].filter((c) => /\d/.test(c));
    for (const ch of chars) {
      if (!/\d/.test(ch)) {
        const s = document.createElement('span');
        s.className = 'odo-sep';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = ch;
        frag.append(s);
        continue;
      }
      const d = Number(ch);
      const fromRight = digitsTotal - 1 - digitIndex;
      const start = Number(prevDigits[prevDigits.length - 1 - fromRight] ?? Math.floor(Math.random() * 10));
      digitIndex++;
      const cell = document.createElement('span');
      cell.className = 'odo-digit';
      cell.setAttribute('aria-hidden', 'true');
      const col = document.createElement('span');
      col.className = 'odo-col';
      for (let k = 0; k < 30; k++) {
        const n = document.createElement('span');
        n.textContent = String(k % 10);
        col.append(n);
      }
      cell.append(col);
      frag.append(cell);
      const target = 20 + d;
      if (quick) {
        col.style.transform = `translateY(${-target}em)`;
      } else {
        col.style.transform = `translateY(${-start}em)`;
        const dur = 700 + fromRight * 55 + Math.random() * 120;
        requestAnimationFrame(() =>
          col.animate([{ transform: `translateY(${-start}em)` }, { transform: `translateY(${-target}em)` }], {
            duration: dur,
            delay: (digitsTotal - fromRight) * 18,
            easing: 'cubic-bezier(.2,.75,.25,1.02)',
            fill: 'forwards',
          }),
        );
      }
    }
    this.el.replaceChildren(frag);
  }
}
