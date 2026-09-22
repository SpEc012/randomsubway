// End-to-end smoke test: load the app, spin, capture frames, assert no page errors.
// Usage: node scripts/smoke.mjs <baseUrl> <outDir> [width] [height]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const [base = 'http://localhost:5173/', out = '/tmp/smoke', w = '1440', h = '900'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  colorScheme: process.env.SCHEME === 'dark' ? 'dark' : 'light',
  reducedMotion: process.env.REDUCED ? 'reduce' : 'no-preference',
});
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on(
  'console',
  (m) => m.type() === 'error' && !m.text().includes('404') && errors.push(`console: ${m.text()}`),
);
await page.goto(base, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${out}/0-idle.png`, fullPage: !!process.env.FULL });
if (process.env.MODE) await page.click(`.modes [data-mode="${process.env.MODE}"]`);

await page.click('.spin');
const frames = [250, 900, 1700, 2600, 3600];
let last = 0;
for (const [i, t] of frames.entries()) {
  await page.waitForTimeout(t - last);
  last = t;
  await page.screenshot({ path: `${out}/${i + 1}-t${t}.png` });
}
await page.waitForFunction(() => !document.getElementById('app').classList.contains('is-spinning'), null, {
  timeout: 15000,
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/9-final.png`, fullPage: !!process.env.FULL });
const title = await page.textContent('.stage-title');
const url = page.url();
console.log(JSON.stringify({ title, url, errors }, null, 2));
await browser.close();
if (errors.length) process.exit(1);
