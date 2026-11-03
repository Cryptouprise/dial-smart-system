/**
 * Prove the GoHighLevel promises are gone from the vendored app.
 *
 * The port has to run for a canvasser who is not on GoHighLevel at all: no GHL calendar on an
 * appointment, no "no GHL user" warning on a rep, no "GHL user id" field, no "GHL sync" card.
 * Those sites are now gated on CONFIG.ghl, which defaults to false and which the host also sets
 * false. This script reads the DOM of the already-built real-host page and checks that none of
 * that wording reaches the screen.
 *
 * Build _d2d_realhost.html first (node scripts/ship/_d2d_realhost.mjs).
 * Usage:  node scripts/ship/_d2d_ghl_probe.mjs
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(resolve(here, '_d2d_realhost.html')).href;

let pass = 0;
let fail = 0;
const check = (name, ok, detail) => {
  if (ok) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + '  -> ' + detail); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(page_url, { waitUntil: 'load' });
await page.waitForSelector('.d2d-root .tab', { timeout: 20000 });
await page.waitForTimeout(1500);

const clickByText = (label) => page.evaluate((want) => {
  const nodes = Array.from(document.querySelectorAll('.d2d-root button, .d2d-root .chip, .d2d-root .seg, .d2d-root [data-act], .d2d-root a'));
  const hit = nodes.find((n) => (n.textContent || '').trim() === want);
  if (!hit) return false;
  hit.click();
  return true;
}, label);

// --- Team -> Data: the "GHL sync" card must exist but be hidden -------------------------
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.d2d-root .tab'));
  const team = tabs.find((t) => (t.textContent || '').trim().startsWith('Team'));
  if (team) team.click();
});
await page.waitForTimeout(900);
const wentData = await clickByText('Data');
await page.waitForTimeout(900);
check('the Data sub-tab opened', wentData === true, String(wentData));

const card = await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('.d2d-root .card'));
  const ghl = cards.find((c) => (c.textContent || '').includes('GHL sync'));
  if (!ghl) return { found: false };
  const cs = getComputedStyle(ghl);
  return { found: true, display: cs.display, visible: !!(ghl.offsetWidth || ghl.offsetHeight) };
});
check('the "GHL sync" card is in the markup', card.found === true, JSON.stringify(card));
check('the "GHL sync" card is hidden while GHL is off', card.found && card.display === 'none' && card.visible === false, JSON.stringify(card));

const dataText = await page.evaluate(() => {
  const v = document.querySelector('.d2d-root [id="view-data"]') || document.querySelector('.d2d-root');
  return v ? v.innerText || '' : '';
});
check('the Data screen says nothing about syncing to GHL', !/GHL/.test(dataText), dataText.slice(0, 160));

// --- the rep editor: no "GHL user id" field --------------------------------------------
await page.evaluate(() => {
  const tabs = Array.from(document.querySelectorAll('.d2d-root .tab'));
  const me = tabs.find((t) => (t.textContent || '').trim().startsWith('Me'));
  if (me) me.click();
});
await page.waitForTimeout(900);

const opened = await page.evaluate(() => {
  const btn = document.querySelector('.d2d-root [data-edit-user]');
  if (!btn) return false;
  btn.click();
  return true;
});
await page.waitForTimeout(700);
const editor = await page.evaluate(() => ({
  ghl: !!document.querySelector('#eu_ghl'),
  color: !!document.querySelector('#eu_color'),
  name: !!document.querySelector('#eu_name'),
  text: (document.querySelector('.d2d-root') || document.body).innerText || '',
}));
if (opened) {
  check('the rep editor opened', editor.name === true, JSON.stringify(editor));
  check('the rep editor has no "GHL user id" field', editor.ghl === false, JSON.stringify(editor));
  check('the rep editor still edits the pin colour', editor.color === true, JSON.stringify(editor));
  check('the rep editor never mentions GHL', !/GHL/.test(editor.text), editor.text.slice(0, 200));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
} else {
  console.log('  NOTE  no [data-edit-user] button found; skipped the editor checks');
}

// --- nothing anywhere promises a GHL calendar ------------------------------------------
const anywhere = await page.evaluate(() => (document.querySelector('.d2d-root') || document.body).innerText || '');
check('no "GHL calendar" promise anywhere on screen', !/GHL calendar/.test(anywhere), anywhere.slice(0, 200));
check('no "no GHL user" warning anywhere on screen', !/no GHL user/.test(anywhere), anywhere.slice(0, 200));

check('no page errors', errors.length === 0, errors.join(' | '));

console.log('\n' + pass + '/' + (pass + fail) + ' checks passed');
await browser.close();
process.exit(fail === 0 ? 0 : 1);
