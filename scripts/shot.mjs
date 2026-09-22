// Screenshot a local page: node scripts/shot.mjs <url> <out.png> [width] [height] [fullPage]
import { chromium } from 'playwright-core';

const [url, out, w = '1400', h = '900', full = '1'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({
  viewport: { width: Number(w), height: Number(h) },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(Number(process.env.WAIT ?? 600));
await page.screenshot({ path: out, fullPage: full === '1' });
if (errors.length) console.log('PAGE ERRORS:\n' + errors.join('\n'));
await browser.close();
