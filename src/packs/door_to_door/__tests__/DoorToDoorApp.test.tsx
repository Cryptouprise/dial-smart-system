import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The vendored DoorBoss bundle is a classic top-level script plus IIFE add-ons: all 14 blocks must
 * run in order in ONE shared global scope. If the mount regresses (script run as a module, blocks
 * split across scopes, an IIFE aborted early) these assertions fail.
 *
 * The DOM shims used by the test runner do not evaluate inline scripts, so the mount's single DOM
 * step is substituted with a global-scope evaluation. In this environment `window === globalThis`,
 * so that is byte-for-byte how a browser treats a classic script: top-level function declarations
 * become properties of `window`. The real 400 KB vendored source is what runs here.
 */
vi.mock('@/packs/door_to_door/runClassicScript', () => ({
  runClassicScript: (source: string) => {
    (0, eval)(source);
    return null;
  },
}));

/**
 * A never-settling `api` parks the app's async boot at its first data call, so the test stays
 * hermetic: no Supabase, no map work, no unhandled rejections. The blocks themselves execute
 * synchronously while the script is evaluated, which is what the assertions below cover.
 */
vi.mock('@/packs/door_to_door/host', () => ({
  createDoorBossHost: () => ({
    api: () => new Promise(() => {}),
    config: {},
  }),
}));

import DoorToDoorApp from '../DoorToDoorApp';

const w = window as unknown as Record<string, unknown>;

describe('DoorToDoorApp', () => {
  beforeAll(() => {
    vi.stubGlobal('fetch', () => new Promise(() => {}));
  });

  it('injects the vendored shell and runs every block in one shared scope', () => {
    render(<DoorToDoorApp />);

    // 1. The frame and the vendored markup landed in the document.
    expect(document.querySelector('.d2d-viewport')).toBeTruthy();
    expect(document.querySelector('.d2d-root')).toBeTruthy();

    // 2. Both globals the app reads on boot were installed before its first line ran.
    expect(typeof w.__D2D_HOST).toBe('object');
    expect(typeof w.L).toBe('object');

    // 3. The vendored chrome is present, not a re-implementation.
    expect(document.querySelector('.d2d-root .topbar .brand')?.textContent?.trim()).toBe('DoorBoss');
    expect(document.querySelectorAll('.d2d-root .tab').length).toBeGreaterThanOrEqual(4);

    // 4. The core block ran: its top-level function declarations are globals.
    expect(typeof w.showView).toBe('function');
    expect(typeof w.initMap).toBe('function');
    expect(typeof w.toast).toBe('function');

    // 5. Every add-on IIFE reached its last line. Each one assigns its global at the end of a
    //    try/catch, so its presence proves that block completed rather than throwing early.
    expect(w.CW).toBeTruthy();
    expect(w.DBAsk).toBeTruthy();
    expect(w.DBLoader).toBeTruthy();
    expect(w.DBPerf).toBeTruthy();

    // 6. Load order is real: each add-on sets its guard flag at the top of its IIFE, so all four
    //    flags being set means the blocks ran in document order.
    expect(w.__cwLoaded).toBe(true);
    expect(w.__dbAskLoaded).toBe(true);
    expect(w.__dbLoaderLoaded).toBe(true);
    expect(w.__dbPerfLoaded).toBe(true);
  });
});
