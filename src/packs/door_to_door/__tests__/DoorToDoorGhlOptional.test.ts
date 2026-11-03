/**
 * The Door to Door port has to run for a canvasser who is not on GoHighLevel at all.
 *
 * DoorBoss was written against GoHighLevel: it promised a GHL calendar on every appointment,
 * warned that a rep had "no GHL user", asked for a GHL user id, and showed a "GHL sync" card.
 * Every one of those is now gated on `CONFIG.ghl`, which defaults to false and which the host
 * also sets false (src/packs/door_to_door/host.ts).
 *
 * This test is the tripwire for the next DoorBoss re-extraction. `scripts/ship/_extract_app.py`
 * rewrites app/scripts.js from the pristine DoorBoss HTML, so a new upstream release can quietly
 * reintroduce a promise. If it does, this fails instead of shipping wording the product cannot
 * keep.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = readFileSync(resolve(here, 'app', 'scripts.js'), 'utf8');
const host = readFileSync(resolve(here, 'host.ts'), 'utf8');

/** Strip block and line comments, so a mention inside a comment is not a promise. */
function codeOnly(source: string): string {
  let out = '';
  let inBlock = false;
  for (const line of source.split('\n')) {
    let rest = line;
    let kept = '';
    while (rest.length > 0) {
      if (inBlock) {
        const end = rest.indexOf('*/');
        if (end === -1) { rest = ''; break; }
        inBlock = false;
        rest = rest.slice(end + 2);
        continue;
      }
      const open = rest.indexOf('/*');
      const slash = rest.indexOf('//');
      if (slash !== -1 && (open === -1 || slash < open)) {
        kept += rest.slice(0, slash);
        rest = '';
        break;
      }
      if (open !== -1) {
        kept += rest.slice(0, open);
        inBlock = true;
        rest = rest.slice(open + 2);
        continue;
      }
      kept += rest;
      rest = '';
    }
    out += kept + '\n';
  }
  return out;
}

describe('Door to Door runs without GoHighLevel', () => {
  it('turns GHL off by default in the app config', () => {
    expect(app).toMatch(/const CONFIG = \{\s*ghl: false/);
  });

  it('turns GHL off in the host config, so our own deploy is standalone', () => {
    expect(host).toMatch(/^\s*ghl: false,/m);
  });

  it('never turns GHL on by default anywhere', () => {
    expect(app).not.toMatch(/ghl:\s*true/);
  });

  it('gates every GHL mention in the app code on CONFIG.ghl', () => {
    const code = codeOnly(app);
    const offenders = code
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => /GHL/.test(line))
      // the switch itself declares the default; it is the one line that must say GHL
      .filter(({ line }) => !/^const CONFIG = \{/.test(line))
      .filter(({ line }) => !line.includes('CONFIG.ghl'));

    expect(offenders).toEqual([]);
  });

  it('still ships the GHL features behind the switch, for a client who is on GHL', () => {
    const code = codeOnly(app);
    expect(code).toContain('CONFIG.ghl');
    // the card, the field and the two rep-list states all still exist, just gated
    expect(app).toContain('GHL sync');
    expect(app).toContain('id="eu_ghl"');
    expect(app).toContain('no GHL user');
    expect(app).toContain('on the GHL calendar');
  });
});
