// Headless-chromium proof that the port-value explainer actually runs.
// Loads the page from disk, lets the whole timeline play, then censuses the DOM.
import { chromium } from 'playwright';
import path from 'node:path';

const file = path.resolve('docs/doorboss-port-value.html');
const url = 'file:///' + file.replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'load' });

// Six beats, roughly 12s of sleeps in total; give it margin.
await page.waitForTimeout(16000);

const state = await page.evaluate(() => {
  const bands = ['b1', 'b2', 'b3', 'b4', 'b5'];
  const counters = [...document.querySelectorAll('.num .nv')].map((e) => ({
    want: Number(e.getAttribute('data-count')),
    got: Number(String(e.textContent).replace(/[^0-9]/g, '')) || 0,
  }));
  return {
    title: document.title,
    counter: document.getElementById('counter').textContent,
    bandsOn: bands.filter((id) => document.getElementById(id).classList.contains('on')).length,
    bandsTotal: bands.length,
    railLit: document.querySelectorAll('#rail button.on').length,
    afterPaneOn: document.getElementById('afterPane').classList.contains('on'),
    afterChips: document.querySelectorAll('#afterChips span').length,
    valueCardsOn: document.querySelectorAll('#valueCards .vcard.on').length,
    valueCardsTotal: document.querySelectorAll('#valueCards .vcard').length,
    areasOn: document.querySelectorAll('#areas .area.on').length,
    areasTotal: document.querySelectorAll('#areas .area').length,
    areaFeatures: document.querySelectorAll('#areas li').length,
    qrowsOn: document.querySelectorAll('#qrows .qrow.on').length,
    qrowsTotal: document.querySelectorAll('#qrows .qrow').length,
    numsOn: document.querySelectorAll('#nums .num.on').length,
    numsTotal: document.querySelectorAll('#nums .num').length,
    countersSettled: counters.every((c) => c.want === c.got),
    countersWrong: counters.filter((c) => c.want !== c.got),
    actionOn: document.getElementById('action').classList.contains('on'),
    visibleTextChars: document.body.innerText.length,
    scrollHeight: document.body.scrollHeight,
  };
});

console.log(JSON.stringify(state, null, 2));
console.log('CONSOLE_ERRORS:', errors.length ? JSON.stringify(errors) : 'none');

// --- the pictures and the diagrams -------------------------------------------------------
// These are the parts that make the page understandable at a glance, so prove they are real:
// every image decoded, every diagram present, and every rail button points at a live section.
const media = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('#shots img')];
  const svgs = [...document.querySelectorAll('#fits svg')];
  const loaded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
  return {
    shots: imgs.length,
    imagesLoaded: loaded.length,
    brokenImages: imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')),
    imageSizes: imgs.map((i) => i.getAttribute('src') + ' ' + i.naturalWidth + 'x' + i.naturalHeight),
    altsMissing: imgs.filter((i) => !i.getAttribute('alt')).length,
    diagrams: document.querySelectorAll('#fits .diag').length,
    svgs: svgs.length,
    svgTextNodes: svgs.map((s) => s.querySelectorAll('text').length),
    switchRows: document.querySelectorAll('#fits .tbl tbody tr').length,
    plateSections: document.querySelectorAll('.plate').length,
    railButtons: document.querySelectorAll('#rail button').length,
    anchorsResolve: [...document.querySelectorAll('#rail button')].every(
      (b) => !!document.getElementById(b.getAttribute('data-go')),
    ),
  };
});
console.log('MEDIA:', JSON.stringify(media, null, 2));

const mediaOk =
  media.shots === 6 &&
  media.imagesLoaded === 6 &&
  media.brokenImages.length === 0 &&
  media.altsMissing === 0 &&
  media.diagrams === 4 &&
  media.svgs === 3 &&
  media.switchRows === 9 &&
  media.plateSections === 2 &&
  media.anchorsResolve === true;
console.log('MEDIA_OK:', mediaOk, mediaOk ? '' : 'SEE THE NUMBERS ABOVE');

// Prove the replay control re-runs the story from the start.
await page.click('#replay');
await page.waitForTimeout(900);
const midReplay = await page.evaluate(() => ({
  counter: document.getElementById('counter').textContent,
  bandsOn: ['b1', 'b2', 'b3', 'b4', 'b5'].filter((id) => document.getElementById(id).classList.contains('on')).length,
  valueCardsOn: document.querySelectorAll('#valueCards .vcard.on').length,
  actionOn: document.getElementById('action').classList.contains('on'),
}));
console.log('AFTER_REPLAY_900MS:', JSON.stringify(midReplay));

// The full-play screenshot, captured before the controls move the page off the end state.
await page.click('#replay');
await page.waitForTimeout(16000);
await page.screenshot({ path: 'docs/doorboss-port-value.png', fullPage: true });
console.log('SCREENSHOT: docs/doorboss-port-value.png');

// Prove a Step press TAKES OVER from an auto-play that is still in flight,
// rather than being swallowed by it.
await page.click('#replay');
await page.waitForTimeout(800);
const beforeStep = await page.evaluate(() => document.getElementById('counter').textContent);
await page.click('#step');
await page.waitForTimeout(1400);
const afterStep = await page.evaluate(() => document.getElementById('counter').textContent);
console.log('STEP_TAKEOVER:', beforeStep, '->', afterStep, afterStep !== beforeStep ? 'OK' : 'BLOCKED');

// Step the rest of the way to the last beat (stepping past the end starts a new
// cycle, so stop as soon as the counter reads the last beat).
let steps = 0;
for (let i = 0; i < 10; i++) {
  const c = await page.evaluate(() => document.getElementById('counter').textContent.trim());
  if (c === '6 / 6') break;
  await page.click('#step');
  steps += 1;
  await page.waitForTimeout(1600);
}
const endState = await page.evaluate(() => ({
  counter: document.getElementById('counter').textContent,
  actionOn: document.getElementById('action').classList.contains('on'),
  bandsOn: ['b1', 'b2', 'b3', 'b4', 'b5'].filter((id) => document.getElementById(id).classList.contains('on')).length,
  countersSettled: [...document.querySelectorAll('.num .nv')].every(
    (e) => Number(e.getAttribute('data-count')) === (Number(String(e.textContent).replace(/[^0-9]/g, '')) || 0),
  ),
}));
console.log('AFTER_STEPPING_TO_END:', JSON.stringify(endState), 'steps=' + steps);
console.log('CONSOLE_ERRORS_AFTER_CONTROLS:', errors.length ? JSON.stringify(errors) : 'none');

if (!mediaOk) {
  console.log('RESULT: FAIL - the pictures or diagrams did not render');
  process.exitCode = 1;
} else {
  console.log('RESULT: PASS - timeline, pictures and diagrams all verified');
}

await browser.close();
