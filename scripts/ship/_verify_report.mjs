// Verify the review report renders and animates, then screenshot it.
// Usage: node scripts/ship/_verify_report.mjs
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = 'C:/Users/charl/dial-smart-system';
const PAGE = path.join(ROOT, 'docs', 'dial-smart-review-report.html');
const PNG = path.join(ROOT, 'docs', 'dial-smart-review-report.png');

const fail = [];
const log = (s) => console.log('JCODE_PROGRESS ' + JSON.stringify({ message: s }));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto('file:///' + PAGE.replace(/\\/g, '/'), { waitUntil: 'load' });
await page.waitForTimeout(2600);

const r = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const all = (s) => Array.from(document.querySelectorAll(s));
  const kpis = all('.kpi').map((e) => e.textContent.trim());
  const bars = all('.bar i').map((e) => getComputedStyle(e).width);
  const chips = all('.chip').reduce((a, e) => {
    const k = e.className.split(' ').find((c) => c.startsWith('c-'));
    a[k] = (a[k] || 0) + 1; return a;
  }, {});
  const ring = q('#ring');
  return {
    title: document.title,
    h2: all('h2').length,
    tables: all('table').length,
    steps: all('.steps li').length,
    cards: all('.card').length,
    kpis, bars, chips,
    ringOffset: ring ? ring.style.strokeDashoffset : null,
    scrollH: document.body.scrollHeight,
    hasTrapHeading: !!all('h3').find((h) => /Deploying the current repo/i.test(h.textContent)),
    badColor: getComputedStyle(document.body).color,
  };
});

if (errors.length) fail.push('console errors: ' + JSON.stringify(errors));
if (!/Gold ore/i.test(r.title) && r.title.length < 5) fail.push('no title');
if (r.h2 < 9) fail.push('expected >=9 sections, got ' + r.h2);
if (r.tables < 4) fail.push('expected >=4 tables, got ' + r.tables);
if (r.steps !== 15) fail.push('expected 15 step cards, got ' + r.steps);
if (!r.hasTrapHeading) fail.push('deploy-trap section missing');
if (r.kpis.some((k) => k === '0')) fail.push('a KPI counter did not animate: ' + JSON.stringify(r.kpis));
if (r.bars.some((w) => parseFloat(w) < 30)) fail.push('a bar did not animate: ' + JSON.stringify(r.bars));
if (r.chips['c-built'] !== 5) fail.push('built chips = ' + r.chips['c-built']);
if (r.chips['c-gated'] !== 4) fail.push('gated chips = ' + r.chips['c-gated']);
if (r.chips['c-stub'] !== 3) fail.push('stub chips = ' + r.chips['c-stub']);
if (r.chips['c-miss'] !== 1) fail.push('missing chips = ' + r.chips['c-miss']);

await page.screenshot({ path: PNG, fullPage: true });
await browser.close();

console.log(JSON.stringify(r, null, 1));
console.log('PNG: ' + PNG);
if (fail.length) {
  console.log('RESULT: FAIL');
  fail.forEach((f) => console.log('  - ' + f));
  process.exit(1);
}
log('report rendered, all checks passed');
console.log('RESULT: PASS');
