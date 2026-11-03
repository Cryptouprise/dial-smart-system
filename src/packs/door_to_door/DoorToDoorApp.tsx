/**
 * Door to Door - the DoorBoss canvassing app, mounted natively inside Dial Smart.
 *
 * This is a port, not a re-implementation. `app/markup.html` and `app/scripts.js` are the
 * DoorBoss blocks extracted byte-for-byte (see `scripts/ship/_extract_app.py`), and
 * `doorboss.css` is DoorBoss's own stylesheet scoped under `.d2d-root`. The only thing Dial Smart
 * supplies is the backend: `window.__D2D_HOST.api()` serves every REST path out of this company's
 * own Supabase, and `window.__D2D_HOST.config` overrides the app's runtime knobs.
 *
 * Three things make the mount non-obvious:
 *
 *   1. The app is 14 classic scripts, not a module. The core block is a top-level script whose
 *      functions are globals, and the add-on blocks are IIFEs that reach the core through
 *      `window`. They therefore have to run as classic scripts, in document order, in one shared
 *      global scope. A module or a function wrapper would break every one of them.
 *   2. `window.L` (Leaflet, from npm) and `window.__D2D_HOST` must both exist before that script
 *      runs, and the markup must already be in the document, because the core's boot path queries
 *      `#app` immediately.
 *   3. The app is booted at most once per page load and then parked out of the way when the tab is
 *      left. Its timers, pollers and Leaflet instance are not teardown-safe, so re-running the
 *      script on every visit would double every interval.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import markup from '@/packs/door_to_door/app/markup.html?raw';
import appSource from '@/packs/door_to_door/app/scripts.js?raw';
import { createDoorBossHost } from '@/packs/door_to_door/host';
import { runClassicScript } from '@/packs/door_to_door/runClassicScript';
// Frame styles first so the vendored stylesheet always wins a tie.
import '@/packs/door_to_door/mount.css';
import '@/packs/door_to_door/doorboss.css';

/** The two globals the vendored app reads on boot. */
interface DoorBossWindow extends Window {
  L?: typeof L;
  __D2D_HOST?: ReturnType<typeof createDoorBossHost>;
}

let bootedApp: HTMLDivElement | null = null;
let parkedHolder: HTMLDivElement | null = null;

/** Boot the vendored app into `viewport`. Runs once per page load. */
function boot(viewport: HTMLElement): HTMLDivElement {
  const win = window as DoorBossWindow;

  const root = document.createElement('div');
  root.className = 'd2d-root';
  root.dataset.d2d = 'root';
  root.innerHTML = markup;

  // Both globals have to be in place before the app's first line runs.
  win.__D2D_HOST = createDoorBossHost();
  win.L = L;

  // The markup has to be in the document before the script runs: the core queries `#app` at once.
  viewport.appendChild(root);

  runClassicScript(appSource);

  return root;
}

/** Move a booted app out of React's way without stopping it. */
function park(root: HTMLDivElement) {
  if (!parkedHolder) {
    parkedHolder = document.createElement('div');
    parkedHolder.dataset.d2d = 'parked';
    parkedHolder.hidden = true;
    document.body.appendChild(parkedHolder);
  }
  parkedHolder.appendChild(root);
}

const DoorToDoorApp = () => {
  const viewport = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = viewport.current;
    if (!el) return;

    bootedApp = bootedApp ?? boot(el);
    if (bootedApp.parentElement !== el) el.appendChild(bootedApp);

    // Leaflet measured the map while the tab was parked; ask the app to re-measure.
    window.dispatchEvent(new Event('resize'));

    return () => {
      if (bootedApp) park(bootedApp);
    };
  }, []);

  return createPortal(<div className="d2d-viewport" ref={viewport} />, document.body);
};

export default DoorToDoorApp;
