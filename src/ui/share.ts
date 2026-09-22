import type { Order } from '../data/types';
import { orderTitle } from '../engine/order';
import type { Harmony } from '../engine/scoring';
import { buildSandwich } from '../render/sandwich';

/** Copy text with a fallback for browsers/contexts without the async clipboard. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function svgToImage(svg: SVGSVGElement, w: number, h: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

const TONE_COLOR: Record<string, string> = {
  kiss: '#008C15',
  good: '#2E9B3E',
  ok: '#7A8B2A',
  meh: '#C98A12',
  cursed: '#D4561C',
  crime: '#C2251B',
};

/** Render a 1200×630 share card (2× by default for crispness) and return it as a PNG blob. */
export async function shareCard(
  o: Order,
  seed: string,
  h: Harmony,
  rankText: string,
  scale = 2,
): Promise<Blob> {
  const W = 1200;
  const H = 630;
  const S = scale;
  const art = buildSandwich(o, { seed, finished: true, prefix: `share${Date.now()}` });
  const vb = art.viewBox;
  const artW = 1080;
  const artH = Math.round((artW * vb.h) / vb.w);
  const img = await svgToImage(art.svg, artW * S, artH * S);

  const c = document.createElement('canvas');
  c.width = W * S;
  c.height = H * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(1, '#EEF4EF');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#008C15';
  g.fillRect(0, 0, W, 10);
  g.fillStyle = '#FFC600';
  g.fillRect(0, 10, W, 4);

  const display = '"Bricolage Grotesque Variable", "Inter Variable", system-ui, sans-serif';
  g.fillStyle = '#0E1B12';
  g.font = `800 26px ${display}`;
  g.fillText('SANDWICH ROULETTE', 60, 66);
  g.font = `600 17px "Inter Variable", system-ui, sans-serif`;
  g.fillStyle = '#40554A';
  g.fillText(rankText, 60, 94);

  const maxH = 360;
  const drawH = Math.min(maxH, artH);
  const drawW = (artW * drawH) / artH;
  g.drawImage(img, (W - drawW) / 2, 112 + (maxH - drawH), drawW, drawH);

  // Title: shrink to fit before resorting to an ellipsis.
  g.fillStyle = '#0E1B12';
  let title = orderTitle(o);
  let size = 44;
  const maxW = W - 120;
  g.font = `800 ${size}px ${display}`;
  while (g.measureText(title).width > maxW && size > 28) {
    size -= 2;
    g.font = `800 ${size}px ${display}`;
  }
  while (g.measureText(title).width > maxW && title.length > 4) title = `${title.slice(0, -2).trimEnd()}…`;
  g.fillText(title, 60, 540);

  const pill = `${h.score}/100 · ${h.verdict.label}`;
  g.font = `700 20px "Inter Variable", system-ui, sans-serif`;
  const pw = g.measureText(pill).width + 36;
  g.fillStyle = TONE_COLOR[h.verdict.tone] ?? '#008C15';
  g.beginPath();
  g.roundRect(60, 562, pw, 40, 20);
  g.fill();
  g.fillStyle = '#FFFFFF';
  g.fillText(pill, 78, 589);

  g.fillStyle = '#6B7C72';
  g.font = `500 15px "Inter Variable", system-ui, sans-serif`;
  g.textAlign = 'right';
  g.fillText(`seed ${seed} · not affiliated with Subway`, W - 60, 589);

  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
