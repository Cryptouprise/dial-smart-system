// Headless-chromium proof that the follow-up bridge animation actually runs.
// Loads the page from disk, lets the whole timeline play, then censuses the DOM.
import { chromium } from 'playwright';
import path from 'node:path';

const file = path.resolve('docs/doorboss-followup-bridge.html');
const url = 'file:///' + file.replace(/\\/g, '/');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'load' });

// The five beats total roughly 7.8s of sleeps; give it margin.
await page.waitForTimeout(12000);

const state = await page.evaluate(() => {
  const flow = document.getElementById('flow');
  const cards = [...document.querySelectorAll('.card')];
  return {
    title: document.title,
    counter: document.getElementById('counter').textContent,
    cardsOn: document.querySelectorAll('.card.on').length,
    cardsTotal: cards.length,
    nodesOn: document.querySelectorAll('.node.on').length,
    gatesPass: document.querySelectorAll('#s2 .gate.pass').length,
    gatesTotal: document.querySelectorAll('#s2 .gate').length,
    locksShut: document.querySelectorAll('#s4 .lock.shut').length,
    locksTotal: document.querySelectorAll('#s4 .lock').length,
    toastOn: document.getElementById('toast').classList.contains('on'),
    verdictOn: document.getElementById('verdict').classList.contains('on'),
    packetHit: document.getElementById('packet').classList.contains('hit'),
    packetLeft: getComputedStyle(document.getElementById('packet')).left,
    flowWidth: Math.round(flow.getBoundingClientRect().width),
    cardWidths: cards.map((c) => Math.round(c.getBoundingClientRect().width)),
    visibleTextChars: document.body.innerText.length,
    refsRendered: document.querySelectorAll('.ref').length,
    evidenceRows: document.querySelectorAll('.ev-col li').length,
  };
});

console.log(JSON.stringify(state, null, 2));
console.log('CONSOLE_ERRORS:', errors.length ? JSON.stringify(errors) : 'none');

// Also prove the replay control re-runs the story from the start.
await page.click('#replay');
await page.waitForTimeout(900);
const midReplay = await page.evaluate(() => ({
  counter: document.getElementById('counter').textContent,
  cardsOn: document.querySelectorAll('.card.on').length,
  verdictOn: document.getElementById('verdict').classList.contains('on'),
}));
console.log('AFTER_REPLAY_900MS:', JSON.stringify(midReplay));

await page.screenshot({ path: 'docs/doorboss-followup-bridge.png', fullPage: true });
console.log('SCREENSHOT: docs/doorboss-followup-bridge.png');

await browser.close();
