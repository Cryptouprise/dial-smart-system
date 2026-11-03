# Door to Door - what I would improve, and in what order

Written by jcode, 2026-11-03. Every claim below is FACT with a file:line, a command, or an ID.
Anything I could not verify is marked THEORY or UNVERIFIED.

The port itself is sound. These are the things I would change if it were mine, ranked by
(severity x cheapness), not by how interesting they are.

---

## 1. The build on disk does not contain the port. This is the top issue.

**FACT.** `python scripts/ship/_check_dist_d2d.py` reports 4 FAILs:

```
FAIL a DoorToDoorApp-*.js chunk is emitted: NONE
FAIL the vendored app is in some chunk: NONE
FAIL a CSS chunk carries .d2d-root: NONE
FAIL deck d2d/deck/en/01.jpg MISSING from dist
PROBLEMS: 4
```

**FACT.** `dist/assets` still holds the chunks of the **deleted** pre-port slice:

```
205092  200.3 KB  DoorToDoorMap-CZFe6MD0.js
 14808   14.5 KB  DoorToDoorMap-CcXJxNtP.css
 12331   12.0 KB  DoorToDoorKnockList-DUE0YkYJ.js
```

**FACT.** No source for those components exists any more. A filename search across `src/`
returns only `packs/door_to_door/*` and `lib/doorToDoor.ts` - no `DoorToDoorMap.tsx`,
no `DoorToDoorKnockList.tsx`, no `KnockDetailSheet.tsx`.

**What it means.** `dist/` predates the port: it was built before `DoorToDoorApp` existed, it
still carries 227 KB of chunks for components that have been deleted, and it is missing the
vendored app, the scoped stylesheet and the deck. So the last production build does **not**
contain Door to Door. The published app cannot be showing it, and anything that deploys this
tree ships a build without it.

**Do.** Re-run the production build once the port is confirmed, then re-run
`_check_dist_d2d.py` and require 0 problems. Until that reads 0, no bundle number for this
pack is meaningful.

---

## 2. Turn the API-key table into a product (biggest upside)

**FACT.** `d2d_api_keys` is already built properly (`supabase/migrations/20261103020000_door_to_door_workspace.sql`):

| line | column | why it matters |
|---|---|---|
| 72 | `prefix text NOT NULL` | the displayable stub, safe to show in a list |
| 73 | `token_hash text NOT NULL` | the secret is **hashed**, not stored in clear |
| 74 | `last_used_at timestamptz` | you can see a key is live, or abandoned |
| 75 | `revoked_at timestamptz` | revocation without deletion |
| 97 | index on `(organization_id, created_at DESC)` | the list view is already indexed |

**FACT.** `d2d_webhooks` is built to match (`:80-88`), with `events jsonb NOT NULL DEFAULT '[]'`,
`active boolean`, and its own index at `:98`.

**FACT.** Nothing in the UI exposes either one yet.

**Why this is the best available improvement.** Everything a customer would need to pull their
canvassing data into their own systems - hashed keys, revocation, a webhook table with an event
list - is already designed and already migrated. The remaining work is a settings screen and a
dispatch path. That is the difference between selling an app and selling a platform, and it is
the cheapest version of that difference I have seen in this codebase.

**Do.** A "Developers" card under pack settings: create a key (show it once), list by prefix with
`last_used_at`, revoke. Then fire `d2d_webhooks` rows on knock and on booking.

---

## 3. The tab bar is the most-used control and is not a tab set

**FACT.** `app/markup.html:50` is `<nav class="tabbar" id="tabbar">`.

**FACT.** Clicks are handled by delegation, not by per-tab markup:
`app/scripts.js:1682` - `$('#tabbar').addEventListener('click', e => { const t=e.target.closest('.tab'); if (t) showView(t.dataset.view); });`

**FACT.** A search for `tablist` or `role="tab"` across the vendored app returns **0 hits**. There
is no `aria-selected` and no `aria-current`.

**FACT.** The markup is four plain buttons and the current tab is expressed only as a CSS class:

```
markup.html:50  <nav class="tabbar" id="tabbar">
markup.html:51  <button class="tab on" data-view="map">...Doors</button>
markup.html:52  <button class="tab" data-view="follow">...Follow-ups<span class="cnt" id="followCnt" hidden></span></button>
markup.html:53  <button class="tab" data-view="team" id="tabTeam">...Team</button>
markup.html:54  <button class="tab" data-view="me">...Me</button>
markup.html:55  </nav>
```

**What it means.** A screen-reader user is given four buttons with no indication that they are
tabs, and no announcement of which one is current - the only signal is `class="on"`, which
assistive tech cannot see. This is the control every rep touches first and most.

**Credit where it is due.** The rest of the app is better than most, and I verified each of these:

| where | what |
|---|---|
| `markup.html:14` | `<div id="map" aria-label="Territory map">` |
| `markup.html:26-28` | the three FABs, each with a real `aria-label` |
| `markup.html:33` | skip button, `aria-label="Skip this house"` |
| `markup.html:58` | `<div class="sheet" id="sheet" role="dialog" aria-modal="true">` |
| `scripts.js:1341` | period bar, `role="group" aria-label="Dates"` |
| `scripts.js:1553`, `:1557` | both charts, `role="img" aria-label="Funnel"` / `"Knocks by hour"` |
| `scripts.js:2298` | consent toggles, `role="switch" aria-checked="true\|false"` |
| `scripts.js:2917` | Ask panel, `role="dialog"` + `aria-label` |
| `scripts.js:2318`, `:2322`, `:2574`, `:2626`, `:2628` | prev/next/say/deck controls, all labelled |

For the record, `python scripts/ship/_a11y.py` matches **37 lines** across the vendored app
(`markup.html` 6, `scripts.js` 31) containing `role=`, `aria-` or `tabindex`. Not all 37 are
ARIA - a dozen or so are data comparisons such as `u.role==='rep'` - so the honest figure is
**roughly two dozen labelled controls**, which is still well above average for an app this size.
The tab bar is the one conspicuous gap.

**Do.** `role="tablist"` on `#tabbar`, `role="tab"` on each `.tab`, and set `aria-selected` from
`showView`. Contained, and it touches none of the visual layer.

---

## 4. A doorstep booking queues a callback that cannot fire

**FACT.** The bridge works: `host.ts:833 syncDoorFollowUps` -> `host.ts:765 enrollDoorFollowUp`
-> `src/packs/door_to_door/enroll.ts`, which writes a `leads` row with `next_callback_at` and one
pending `scheduled_follow_ups` callback.

**FACT.** The dial is blocked twice over:
- `call-dispatcher/index.ts:19` - `isCallbackAutomationCertified()` returns `false`, which kills
  the callback path further down that file.
- `launchSafety.ts:128-151` - browser egress is blocked platform-wide.

**FACT.** Even with certification on, `call-dispatcher/index.ts:707` requires the lead to be on an
**ACTIVE campaign**, and `enroll.ts` never adds one.

**What it means.** The rep books at the door, the system dutifully records a callback, and the
callback can never run. The record is honest but the outcome is a dead end, and nothing on screen
says so.

**Do.** Two small changes, in this order:
1. Have `enroll.ts` also attach the lead to a designated default campaign, so the lead is
   genuinely ready the moment calling is switched on.
2. Show the rep the truth: "queued - will be called when calling is switched on". Better a
   labelled wait than a silent one.

Certifying the dialer is a separate, larger decision and not mine to make.

---

## 5. Two abandoned Door-to-Door surfaces still sit next to the live one

**FACT.** `src/lib/doorToDoor.ts` is a 95-line status map plus `summarizeKnockList`, `safeRate` and
`formatPercent`. It is imported for **types only**, in one place:
`src/lib/d2dApi.ts:18` - `import type { D2DKnockStatus, D2DStatus } from '@/lib/doorToDoor';`

**FACT.** `src/lib/d2dApi.ts` is a full typed client (`D2DProperty`, `D2DKnock`, `D2DTerritory`,
`NewD2DPropertyInput`, ...), and the live port uses exactly **one** export from it:
`src/packs/door_to_door/host.ts:38` - `import { resolveOrganizationId } from '@/lib/d2dApi';`

**What it means.** There are three Door-to-Door things in this tree - the ported pack, a dead
helper, and a mostly-unused typed client - and nothing marks which is which. The next person will
guess wrong.

**Honest caveat.** Rollup tree-shakes unused exports, so this is a **source-clarity** problem, not
a bundle-weight problem. I am not claiming it costs bytes; I am claiming it costs comprehension.

**Do.** Keep `resolveOrganizationId`; move it somewhere honest (for example `lib/org.ts`) and
delete the rest.

---

## 6. Nobody has measured the tab-open cost

**FACT.** `DoorToDoorApp.tsx:27-28` pulls the app in as raw source:
`import markup from '.../app/markup.html?raw'` and `import appSource from '.../app/scripts.js?raw'`.
`app/scripts.js` is **410,233 bytes / 3,515 lines**, `doorboss.css` is 35,326 bytes, and
`DoorToDoorApp.tsx:26` imports `leaflet` on top of that.

**FACT - and this part is right.** It is genuinely code-split. `components/Dashboard.tsx:77` is
`const DoorToDoorApp = lazy(() => import('@/packs/door_to_door/DoorToDoorApp'));` and it renders
inside `<Suspense fallback={<TabLoader />}>` at `:516`. So no user pays for any of it until they
open the Door to Door tab. Whoever set that up did it correctly.

**FACT.** There is no chunk in `dist/` to measure, because of issue 1. So the real number is
currently unknown, and I am not going to guess at it.

**Do.** After issue 1, run `python scripts/ship/_chunks.py DoorToDoor` and write the number down.
If the first open is heavy, the lever is to stop shipping `scripts.js` as an inlined raw string
and serve it as a separate asset fetched on first open - which also lets the browser cache it
across visits.

---

## 7. The hero image is 1.08 MB for no reason

**FACT.** `docs/img/d2d-doors.png` is **1,082,599 bytes**. The other five together are 297,790
bytes. The page's total image payload is 1.32 MB, and 82% of it is one screenshot.

**FACT.** It is displayed at a maximum of about 1,320 CSS pixels wide, from a 1,440 px source.

**Do.** Downscale to 1,320 px and encode as WebP. Expect roughly 1.08 MB -> about 150-250 KB with
no visible difference at the size it is actually shown. Cheap, and it is the difference between a
page that opens instantly and one that does not.

---

## What I would NOT change

- **The seam.** `host.ts` as the only file that knows both sides is the right shape. It is 2,079
  lines and that is the cost of the app never being touched. Keep it.
- **Byte-for-byte vendoring.** The 4-step pipeline is fragile to run out of order, but the payoff -
  an exact visual match and no rewrite drift - is worth the ceremony.
- **The nine tables and 36 policies.** Company-scoped by row security, matching the rest of Dial
  Smart. `d2d_company_members` is a `SECURITY DEFINER` function
  (`20261103023000_door_to_door_members.sql:8`) that refuses unless the caller is already in that
  company (`:35`). That is the right call, and the alternative - a public profiles table - would
  have been worse.
- **No model in the Ask path.** It counts rows. It cannot invent a number.

---

## The order I would actually do these in

| # | item | cost | why now |
|---|---|---|---|
| 1 | Rebuild so `dist/` contains the port | minutes | Nothing else can be trusted or measured until this is true |
| 2 | Downscale the hero image (item 7) | minutes | Same commit as 1, removes 82% of the page payload |
| 3 | Tab bar as a tab set (item 3) | an hour | Most-used control, smallest fix, no visual risk |
| 4 | Queue the callback honestly (item 4) | an hour | Turns a silent dead end into a labelled wait |
| 5 | Delete the dead legacy surfaces (item 5) | an hour | Stops the next person guessing |
| 6 | API keys + webhooks as a feature (item 2) | days | The only item here that grows revenue |
| 7 | Measure and, if needed, split the tab-open (item 6) | after 1 | Needs a real build first |

Items 1 and 2 are one sitting. Item 3 is the one I would not ship without.

---

## UNVERIFIED / not checked

- The actual runtime cost of the first Door to Door tab open. No chunk exists to measure (item 1).
- Whether the deployed `aicallboss.app` build is the same stale `dist/`, or was built elsewhere.
  I checked the local `dist/` only.
- Whether any customer currently depends on `lib/doorToDoor.ts` behaviour. I found no live
  importer, but I did not audit git history for a revert.
