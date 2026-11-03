/**
 * The REAL host, bundled for the browser.
 *
 * `_d2d_visual.mjs` answers "does the vendored app render", using a hand-written stub host. This
 * entry answers the other half: does the app render when the host underneath it is the actual
 * `host.ts`, reading actual rows? It imports the same `createDoorBossHost()` the app ships with -
 * nothing here is a re-implementation - and swaps only the two things a page cannot provide:
 *
 *   @/integrations/supabase/client   an in-memory fake (see _d2d_fake_db.js)
 *   @/lib/d2dApi                     resolveOrganizationId -> a constant
 *
 * Both substitutions are the same ones DoorToDoorHostRoutes.test.ts makes, for the same reason.
 *
 * Built by scripts/ship/_d2d_realhost.mjs:
 *   esbuild _d2d_host_entry.js --bundle --format=iife
 *     --alias:@/integrations/supabase/client=./scripts/ship/_d2d_fake_db.js
 *     --alias:@/lib/d2dApi=./scripts/ship/_d2d_org_shim.js
 */

import { createDoorBossHost } from '../../src/packs/door_to_door/host';

const host = createDoorBossHost();

// The app's deck loader reads host.assets.base. The page passes the vendored folder in, so the
// slides load off disk exactly as the built site serves them.
if (window.__D2D_ASSETS_BASE) host.assets = { base: window.__D2D_ASSETS_BASE };

window.__D2D_HOST = host;
window.__D2D_REAL_HOST = true;
