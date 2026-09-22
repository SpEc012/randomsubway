// End-to-end behavioral checks against a running server.
// Usage: node scripts/e2e.mjs [baseUrl]
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173/';
const origin = new URL(base).origin;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
});
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/404|favicon/.test(m.text()) && errors.push(m.text()));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(origin) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  return { ctx, page, errors, external };
}
const idle = (page) =>
  page.waitForFunction(() => !document.getElementById('app').classList.contains('is-spinning'), null, {
    timeout: 20000,
  });
const title = (page) => page.textContent('.stage-title');

// 1. Loads clean, first paint shows a finished Daily Sub.
{
  const { page, errors, external, ctx } = await newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  const t = await title(page);
  check('first paint shows a sandwich', !!t && t.length > 5 && !/Rolling/.test(t), t);
  check(
    'stage has an SVG sandwich',
    (await page.locator('.stage-art svg [data-part="lid"], .stage-art svg [data-part="front"]').count()) > 0,
  );

  // 2. Space spins; Space again slams to the result.
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  const spinning = await page.evaluate(() =>
    document.getElementById('app').classList.contains('is-spinning'),
  );
  check('Space starts a spin', spinning);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => document.getElementById('app').classList.contains('is-spinning'));
  const t2 = await title(page);
  check('Space mid-spin slams to the result', !after && !/Rolling/.test(t2), t2);
  const url = page.url();
  check('URL carries a share code', /\?s=1\./.test(url), url);

  // 3. Lock bread (key 1) → re-roll keeps bread.
  const breadBefore = await page.textContent('[data-reel="bread"] .tile--final b');
  await page.keyboard.press('1');
  let kept = true;
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
    await page.keyboard.press('Space');
    await idle(page);
    const b = await page.textContent('[data-reel="bread"] .tile--final b');
    if (b !== breadBefore) kept = false;
  }
  check('locked reel survives re-rolls', kept, breadBefore ?? '');
  await page.keyboard.press('1');

  // 4. Full, un-slammed spin completes on its own, with history + receipt.
  await page.click('.spin');
  await idle(page);
  const hist = await page.locator('.hist-item').count();
  check('history records rolls', hist >= 5, `${hist} items`);
  const rc = await page.textContent('.receipt-paper');
  check('receipt printed with totals', /Approx\. kcal/.test(rc ?? ''));

  // 5. Image export triggers a PNG download.
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 8000 }).catch(() => null),
    page.click('[data-act="image"]'),
  ]);
  check(
    'share image downloads a PNG',
    !!dl && /\.png$/.test(dl.suggestedFilename()),
    dl?.suggestedFilename() ?? 'no download',
  );

  // 6. Every mode rolls without errors.
  for (const m of ['signature', 'nightmare', 'monk', 'daily', 'custom']) {
    await page.click(`.modes [data-mode="${m}"]`);
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    await page.keyboard.press('Space');
    await idle(page);
  }
  check('all five modes roll', errors.length === 0, errors.join(' | '));

  // 7. Filters: vegan rolls contain no animal ingredients (via the share code).
  await page.click('.filters summary');
  await page.click('[data-filter="vegan"]');
  // Focus stays on the chip (Space would toggle it, per button semantics) — move focus away.
  await page.evaluate(() => document.activeElement?.blur?.());
  let veganOk = true;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(80);
    await page.keyboard.press('Space');
    await idle(page);
    const txt = (await page.textContent('.receipt-paper')) ?? '';
    if (
      !/Vegan|vegan/.test(
        await page
          .getAttribute('[data-filter="vegan"]', 'aria-pressed')
          .then((v) => (v === 'true' ? 'vegan' : '')),
      )
    )
      veganOk = false;
    if (
      /\b(Turkey|Ham|Beef|Chicken|Steak|Tuna|Bacon|Salami|Pepperoni|Meatballs?|Egg|Mayo|Mayonnaise|Ranch|Provolone|American|Swiss|Cheddar|Mozzarella|Feta|Parmesan)\b/i.test(
        txt.replace(/Estimates only.*/, ''),
      )
    )
      veganOk = false;
  }
  check('vegan filter holds in the live app', veganOk);
  await page.click('[data-filter="vegan"]');

  check('zero external network requests', external.length === 0, external.slice(0, 3).join(', '));
  check('no page errors during session', errors.length === 0, errors.join(' | '));

  // 8. Share link replays the exact same sandwich in a fresh page.
  const shareUrl = page.url();
  const shareTitle = await title(page);
  const second = await newPage();
  await second.page.goto(shareUrl, { waitUntil: 'networkidle' });
  await idle(second.page);
  check('share link replays the same sandwich', (await title(second.page)) === shareTitle, shareTitle ?? '');
  await second.ctx.close();
  await ctx.close();
}

// 9. Clipboard copy produces the counter script.
{
  const { page, ctx } = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.click('[data-act="copy"]');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('copy puts the counter script on the clipboard', /^Hi! Can I get a/.test(clip), clip.slice(0, 60));
  await ctx.close();
}

// 10. Reduced motion: spin resolves fast, still fully functional.
{
  const { page, ctx, errors } = await newPage({ reducedMotion: 'reduce' });
  await page.goto(base, { waitUntil: 'networkidle' });
  const t0 = Date.now();
  await page.click('.spin');
  await idle(page);
  const ms = Date.now() - t0;
  check('reduced motion: spin completes quickly', ms < 1500, `${ms}ms`);
  check('reduced motion: no errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// 11. Phone width: no horizontal scroll, tap targets usable.
{
  const { page, ctx } = await newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('390px: no horizontal overflow', overflow <= 0, `${overflow}px`);
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, [role="tab"], a, input')]
      .filter((e) => e.offsetParent !== null && !e.closest('.sr-only'))
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 32 || r.width < 32))
      .map(({ e, r }) => `${e.className || e.tagName}:${Math.round(r.width)}x${Math.round(r.height)}`),
  );
  check('390px: tap targets ≥ 32px', small.length === 0, small.slice(0, 5).join(', '));
  await page.tap('.spin');
  await idle(page);
  check('390px: spin works by tap', !/Rolling/.test((await title(page)) ?? ''));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
