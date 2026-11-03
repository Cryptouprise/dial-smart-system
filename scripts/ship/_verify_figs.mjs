// Two things the eye would catch but a DOM census would not:
//   1. does any label in the new diagrams spill outside the box it belongs to, or off the canvas?
//   2. capture the two new sections as standalone images so they can be looked at directly.
import { chromium } from 'playwright';
import path from 'node:path';

const file = path.resolve('docs/doorboss-port-value.html');
const url = 'file:///' + file.replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);

// A label is a problem if it leaves the viewBox, or if it partially overlaps a rect
// (partially = it started inside a box and ran out the side).
const problems = await page.evaluate(() => {
  const out = [];
  document.querySelectorAll('#fits svg').forEach((svg, si) => {
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const [vx, vy, vw, vh] = vb;
    const rects = [...svg.querySelectorAll('rect')].map((r) => {
      const b = r.getBBox();
      return { x: b.x, y: b.y, w: b.width, h: b.height };
    });
    svg.querySelectorAll('text').forEach((t) => {
      const b = t.getBBox();
      const label = (t.textContent || '').trim().slice(0, 48);
      const outside =
        b.x < vx - 1 || b.y < vy - 1 || b.x + b.width > vx + vw + 1 || b.y + b.height > vy + vh + 1;
      let spill = false;
      for (const r of rects) {
        const ix = Math.max(0, Math.min(b.x + b.width, r.x + r.w) - Math.max(b.x, r.x));
        const iy = Math.max(0, Math.min(b.y + b.height, r.y + r.h) - Math.max(b.y, r.y));
        const inter = ix * iy;
        const area = b.width * b.height;
        if (inter > 0 && inter < area * 0.92) spill = true;
      }
      if (outside || spill) out.push({ svg: si, label, outside, spill });
    });
  });
  return out;
});
console.log('SVG_LABEL_PROBLEMS:', problems.length ? JSON.stringify(problems, null, 2) : 'none');

// How wide did the labels actually render? Useful to confirm nothing is near the edge.
const widest = await page.evaluate(() => {
  const rows = [];
  document.querySelectorAll('#fits svg').forEach((svg, si) => {
    svg.querySelectorAll('text').forEach((t) => {
      const b = t.getBBox();
      rows.push({ svg: si, right: Math.round(b.x + b.width), text: (t.textContent || '').trim().slice(0, 40) });
    });
  });
  return rows.sort((a, b) => b.right - a.right).slice(0, 6);
});
console.log('WIDEST_LABELS:', JSON.stringify(widest, null, 2));

for (const [sel, out] of [
  ['#shots', 'docs/doorboss-pics.png'],
  ['#fits', 'docs/doorboss-fits.png'],
]) {
  const el = await page.$(sel);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await el.screenshot({ path: out });
  console.log('SECTION_SHOT:', out);
}

const ok = problems.length === 0 && errors.length === 0;
console.log('PAGE_ERRORS:', errors.length ? JSON.stringify(errors) : 'none');
console.log('RESULT:', ok ? 'PASS' : 'FAIL');
process.exitCode = ok ? 0 : 1;

await browser.close();
