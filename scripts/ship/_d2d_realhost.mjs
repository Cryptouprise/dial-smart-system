/**
 * The real-host visual proof for the Door to Door port.
 *
 * `_d2d_visual.mjs` proves the vendored app renders, against a hand-written stub that returns rich
 * canned data. `DoorToDoorHostRoutes.test.ts` proves host.ts does the arithmetic, in node, with no
 * DOM. Neither one proves the two fit together: if host.ts's wire shape drifts from the shape the
 * app reads, both stay green while the screen goes blank.
 *
 * This script closes that gap. It loads the vendored app and, underneath it, the ACTUAL host.ts
 * (bundled by esbuild with only Supabase and resolveOrganizationId substituted - see
 * _d2d_host_entry.js), reading a small hand-countable fixture. Then it reads the numbers off the
 * screen and checks them against the fixture. Every claim below is the host's arithmetic arriving
 * in the app's DOM.
 *
 * Build the host bundle first:
 *   node_modules/.bin/esbuild scripts/ship/_d2d_host_entry.js --bundle --format=iife
 *     --platform=browser --outfile=scripts/ship/_d2d_host_bundle.js
 *     --alias:@/integrations/supabase/client=./scripts/ship/_d2d_fake_db.js
 *     --alias:@/lib/d2dApi=./scripts/ship/_d2d_org_shim.js
 *
 * Usage:  node scripts/ship/_d2d_realhost.mjs
 * Writes: scripts/ship/_d2d_realhost.html, _d2d_realhost.png and one _d2d_rh_tab_<n>.png per tab.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const markup = read('src/packs/door_to_door/app/markup.html');
const app = read('src/packs/door_to_door/app/scripts.js');
const doorbossCss = read('src/packs/door_to_door/doorboss.css');
const mountCss = read('src/packs/door_to_door/mount.css');
const leafletCss = read('node_modules/leaflet/dist/leaflet.css');
const leafletJs = read('node_modules/leaflet/dist/leaflet.js');
const hostBundle = read('scripts/ship/_d2d_host_bundle.js');

const assetsBase = pathToFileURL(resolve(root, 'public', 'd2d')).href;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Door to Door - real host proof</title>
<style>${leafletCss}</style>
<style>${mountCss}</style>
<style>${doorbossCss}</style>
<style>html, body { margin: 0; height: 100%; background: #eef1f4; } .d2d-viewport { top: 0 !important; }</style>
</head>
<body>
<div class="d2d-viewport"><div class="d2d-root">${markup}</div></div>
<script>${leafletJs}</script>
<script>window.__D2D_ASSETS_BASE = ${JSON.stringify(assetsBase)};</script>
<script>${hostBundle}</script>
<script>${app}</script>
</body>
</html>
`;

const htmlPath = resolve(here, '_d2d_realhost.html');
writeFileSync(htmlPath, html, 'utf8');
console.log(`wrote ${htmlPath} (${html.length} bytes)`);

const errors = [];
const logs = [];
const checks = [];
const check = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
});

await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
await page.waitForTimeout(3500);

// --- 0. It booted on the real host at all ------------------------------------------------
const boot = await page.evaluate(() => {
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const map = q('.d2d-root .leaflet-container');
  return {
    realHost: window.__D2D_REAL_HOST === true,
    hostKind: typeof window.__D2D_HOST,
    brand: q('.d2d-root .topbar .brand') ? q('.d2d-root .topbar .brand').textContent.trim() : null,
    tabs: qa('.d2d-root .tab').map((t) => t.textContent.trim()),
    activeView: qa('.d2d-root [id^="view-"]').filter((v) => !v.hidden).map((v) => v.id),
    mapPresent: !!map,
    mapSize: map ? { w: map.clientWidth, h: map.clientHeight } : null,
    me: window.__d2dProbe ? window.__d2dProbe() : null,
  };
});
check('booted with the real host.ts', boot.realHost && boot.hostKind === 'object', boot.hostKind);
check('all 5 tabs present', boot.tabs.length === 5, boot.tabs.join(' | '));
check('map rendered', boot.mapPresent && boot.mapSize.w > 0, JSON.stringify(boot.mapSize));

await page.screenshot({ path: resolve(here, '_d2d_realhost.png') });

// --- Walk every tab ---------------------------------------------------------------------
const tabCount = await page.evaluate(() => document.querySelectorAll('.d2d-root .tab').length);
const walked = [];

for (let i = 0; i < tabCount; i += 1) {
  const label = await page.evaluate((index) => {
    const tab = document.querySelectorAll('.d2d-root .tab')[index];
    if (!tab) return null;
    tab.click();
    return tab.textContent.trim();
  }, i);
  await page.waitForTimeout(1200);

  const shot = await page.evaluate(() => {
    const qa = (s) => Array.from(document.querySelectorAll(s));
    const visible = qa('.d2d-root [id^="view-"]').filter((v) => !v.hidden);
    const root = visible[0] || document.querySelector('.d2d-root');
    const text = root ? root.innerText || '' : '';
    return {
      view: visible.map((v) => v.id).join(','),
      chars: text.length,
      text: text.replace(/\s*\n\s*/g, ' | ').trim().slice(0, 500),
      complaints: (text.match(/could not load[^\n.]*|not enabled in this app[^\n.]*|sign out and back in[^\n.]*|undefined/gi) || []).slice(0, 5),
      cards: ['pfTeam', 'pfBoard', 'pfComps', 'pfRisk', 'pfUsage', 'pfMe', 'pfPace', 'pfProfile', 'pfFeed']
        .map((id) => {
          const el = document.getElementById(id);
          if (!el) return null;
          return `${id}: ${(el.innerText || '').replace(/\s*\n\s*/g, ' | ').trim().slice(0, 400)}`;
        })
        .filter(Boolean),
    };
  });
  await page.screenshot({ path: resolve(here, `_d2d_rh_tab_${i}.png`) });
  walked.push({ index: i, label, ...shot });
}

// A map screen is a canvas plus a chip bar, and an empty follow-up queue is correctly near-empty,
// so the honest bar is "the tab switched to the right view, rendered a shell, and complained about
// nothing". The numbers themselves are checked per card below, against the fixture.
const EXPECTED_VIEW = { Doors: 'view-map', 'Follow-ups': 'view-follow', Team: 'view-team', Me: 'view-me', 'Ask AI': 'view-me' };
for (const tab of walked) {
  const key = tab.label.replace(/[0-9]+$/, '').trim();
  const want = EXPECTED_VIEW[key];
  check(`tab "${tab.label}" shows ${want || 'a view'}`, !want || tab.view.split(',').includes(want), tab.view);
  check(`tab "${tab.label}" rendered its shell`, tab.chars > 60, `${tab.chars} chars on ${tab.view}`);
  check(`tab "${tab.label}" has no complaint`, tab.complaints.length === 0, tab.complaints.join(' ; '));
}

// --- 1. Team board: the host's ranking, in the DOM ---------------------------------------
const team = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tab = Array.from(document.querySelectorAll('.d2d-root .tab')).find((t) => /team/i.test(t.textContent));
  if (tab) tab.click();
  await wait(1400);
  const text = (id) => {
    const el = document.getElementById(id);
    return el ? (el.innerText || '').replace(/\s*\n\s*/g, ' | ').trim() : null;
  };
  return { board: text('pfBoard'), teamBody: text('teamBody'), comps: text('pfComps'), risk: text('pfRisk') };
});

// Marcus has five door-sourced knocks today; Dana has four rows but the GHL write-back is not a door.
check('team board names Marcus and Dana', /Marcus/.test(team.board || '') && /Dana/.test(team.board || ''), (team.board || '').slice(0, 200));
check('team board ranks Marcus above Dana', /Marcus[\s\S]*Dana/.test(team.board || ''), (team.board || '').slice(0, 200));
check('team board counts five doors for Marcus', /(^|[^0-9])5([^0-9]|$)/.test(team.board || ''), (team.board || '').slice(0, 200));
check('team screen itself rendered', (team.teamBody || '').length > 100, (team.teamBody || '').slice(0, 160));

// --- 1b. The leaderboard's numbers, per metric ---------------------------------------------
// boardCard() shows ONE metric at a time: the chips are a selector, not table columns, so each row
// carries a single `.pf-n`. Reading it once proves one number, so read it twice - on the default
// (doors), then on Signed - and require the same fixture knocks to produce different figures. That
// is what proves the metric routes through the host instead of being painted once.
const readBoard = () => page.evaluate(() => {
  const card = document.getElementById('pfBoard');
  if (!card) return null;
  const on = card.querySelector('.pf-chips[data-pf="metric"] button.on');
  return {
    metric: on ? on.getAttribute('data-k') : null,
    rows: Array.from(card.querySelectorAll('#pfRows .pf-row')).map((r) => ({
      name: r.getAttribute('data-name'),
      me: r.classList.contains('me'),
      rank: r.querySelector('.pf-rank') ? r.querySelector('.pf-rank').textContent : null,
      n: r.querySelector('.pf-n') ? r.querySelector('.pf-n').textContent : null,
    })),
  };
});
const pickMetric = (key) => page.evaluate((k) => {
  const btn = document.querySelector('#pfBoard .pf-chips[data-pf="metric"] button[data-k="' + k + '"]');
  if (!btn) return false;
  btn.click();
  return true;
}, key);

const boardDoors = await readBoard();
const switched = await pickMetric('signed');
await page.waitForTimeout(1500);
const boardSigned = await readBoard();

const rowN = (b, who) => {
  const r = b && b.rows.find((x) => (x.name || '').includes(who));
  return r ? r.n : null;
};

check('leaderboard rendered three rows', !!boardDoors && boardDoors.rows.length === 3, boardDoors ? boardDoors.rows.map((r) => r.name).join(', ') : 'no card');
check('leaderboard opens on doors', !!boardDoors && boardDoors.metric === 'doors', boardDoors ? String(boardDoors.metric) : '');
check('Marcus shows 5 doors', rowN(boardDoors, 'Marcus') === '5', String(rowN(boardDoors, 'Marcus')));
check('Dana shows 3 doors (the GHL write-back is not a door)', rowN(boardDoors, 'Dana') === '3', String(rowN(boardDoors, 'Dana')));
check('Marcus outranks Dana on doors', Number(rowN(boardDoors, 'Marcus')) > Number(rowN(boardDoors, 'Dana')), `${rowN(boardDoors, 'Marcus')} vs ${rowN(boardDoors, 'Dana')}`);
check('the signed chip exists and was clicked', switched === true, String(switched));
check('the metric switch reached the host', !!boardSigned && boardSigned.metric === 'signed', boardSigned ? String(boardSigned.metric) : '');
check('Dana shows 1 signed (the GHL write-back)', rowN(boardSigned, 'Dana') === '1', String(rowN(boardSigned, 'Dana')));
// host.ts:936-938 drops reps with nothing for the metric but always pushes you back on, so a rep
// with a zero day still sees their own row. Assert the rule, not a number.
check(
  'the signed board drops reps with no signings',
  rowN(boardSigned, 'Marcus') === null && rowN(boardSigned, 'Priya') === null,
  boardSigned ? boardSigned.rows.map((r) => `${r.name}=${r.n}`).join(', ') : '',
);
check('the signed board still shows you', !!(boardSigned && boardSigned.rows.some((r) => r.me)), '');

// --- 2. Risk: only the rep who went quiet -------------------------------------------------
check('risk card flags the rep who went quiet', /slumping|quiet|at risk/i.test(team.risk || ''), (team.risk || '').slice(0, 200));

// --- 3. Feed: the host's own sentence -----------------------------------------------------
const me = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tab = Array.from(document.querySelectorAll('.d2d-root .tab')).find((t) => /^me$/i.test(t.textContent.trim()));
  if (tab) tab.click();
  await wait(1600);
  const text = (id) => {
    const el = document.getElementById(id);
    return el ? (el.innerText || '').replace(/\s*\n\s*/g, ' | ').trim() : null;
  };
  return { feed: text('pfFeed'), usage: text('pfUsage'), profile: text('pfProfile'), pace: text('pfPace'), meWrap: text('meWrap') };
});
check('feed carries the host\u2019s appointment sentence', /12 Oak St/.test(me.feed || ''), (me.feed || '').slice(0, 220));
check('usage card counts three seats', /3/.test(me.usage || ''), (me.usage || '').slice(0, 200));
check('profile card rendered', (me.profile || '').length > 40, (me.profile || '').slice(0, 200));
check('pace card rendered', (me.pace || '').length > 40, (me.pace || '').slice(0, 200));

// --- 4. Ask AI: a real host answer, in the panel ------------------------------------------
const ask = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tab = document.getElementById('tabAsk')
    || Array.from(document.querySelectorAll('.d2d-root .tab')).find((t) => /ask/i.test(t.textContent));
  if (!tab) return { error: 'no ask tab' };
  tab.click();
  await wait(900);
  const input = document.getElementById('askIn');
  const go = document.getElementById('askGo');
  if (!input || !go) return { error: 'no askIn/askGo' };
  input.value = 'which installers went bankrupt?';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  go.click();
  await wait(2200);
  const log = document.getElementById('askLog');
  return { answer: log ? (log.innerText || '').replace(/\s*\n\s*/g, ' | ').trim() : null };
});
check('Ask AI answered from the host', /SunRun/.test(ask.answer || ''), (ask.answer || ask.error || '').slice(0, 260));

// --- 5. Rep detail from the team list -----------------------------------------------------
const rep = await page.evaluate(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const tab = Array.from(document.querySelectorAll('.d2d-root .tab')).find((t) => /team/i.test(t.textContent));
  if (tab) tab.click();
  await wait(1200);
  const els = Array.from(document.querySelectorAll('.d2d-root [data-rep]'));
  const view = document.getElementById('view-rep');
  let opened = null;
  for (const el of els) {
    const c = el.closest('[id]');
    if (!c || typeof c.onclick !== 'function') continue;
    el.click();
    await wait(800);
    if (view && !view.hidden) { opened = el.getAttribute('data-rep'); break; }
  }
  const wrap = document.getElementById('repWrap');
  return {
    opened,
    wrapChars: wrap ? (wrap.innerText || '').trim().length : 0,
    wrapText: wrap ? (wrap.innerText || '').replace(/\s*\n\s*/g, ' | ').trim().slice(0, 300) : null,
  };
});
check('rep detail opened from the team list', !!rep.opened, String(rep.opened));
check('rep detail rendered a scorecard', rep.wrapChars > 200, (rep.wrapText || '').slice(0, 200));

await page.screenshot({ path: resolve(here, '_d2d_realhost_rep.png') });
await browser.close();

// --- Report ------------------------------------------------------------------------------
console.log('\n=== BOOT ===');
console.log(JSON.stringify(boot, null, 2));

console.log('\n=== TABS ===');
for (const tab of walked) {
  console.log(`\n[${tab.index}] ${tab.label}  ->  ${tab.view}  (${tab.chars} chars)`);
  console.log(`    ${tab.text}`);
  for (const card of tab.cards) console.log(`    ${card}`);
  if (tab.complaints.length) console.log(`    !! ${tab.complaints.join(' ; ')}`);
}

console.log('\n=== LEADERBOARD (doors) ===');
if (boardDoors) boardDoors.rows.forEach((r) => console.log(`  ${r.rank}  ${r.name}${r.me ? ' (you)' : ''}  ->  ${r.n}`));
console.log('=== LEADERBOARD (signed) ===');
if (boardSigned) boardSigned.rows.forEach((r) => console.log(`  ${r.rank}  ${r.name}${r.me ? ' (you)' : ''}  ->  ${r.n}`));

console.log('\n=== CARDS (Team) ===');
console.log(`board: ${(team.board || '').slice(0, 500)}`);
console.log(`risk:  ${(team.risk || '').slice(0, 300)}`);
console.log(`comps: ${(team.comps || '').slice(0, 300)}`);

console.log('\n=== CARDS (Me) ===');
console.log(`feed:  ${(me.feed || '').slice(0, 400)}`);
console.log(`usage: ${(me.usage || '').slice(0, 300)}`);

console.log('\n=== ASK ===');
console.log(ask.answer || ask.error);

console.log('\n=== REP DETAIL ===');
console.log(rep.wrapText || '(none)');

console.log('\n=== CHECKS ===');
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `   <- ${c.detail}`}`);
}
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
console.log(`page errors: ${errors.length}`);
errors.slice(0, 12).forEach((e) => console.log(`  ! ${e}`));
console.log(`console error/warn: ${logs.length}`);
logs.slice(0, 12).forEach((e) => console.log(`  ? ${e}`));
process.exitCode = failed === 0 && errors.length === 0 ? 0 : 1;
