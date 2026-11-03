# arch-d-newvertical

- status: completed
- tldr: Adding a vertical = 3 mandatory files (packs.ts, industry_packs.sql allow-list, Dashboard.tsx switch) + a 4th icon/map entry; seams mostly clean, allow-list is duplicated/leaky.

arch-d-newvertical DONE. Traced the pack/vertical integration path in C:/Users/charl/dial-smart-system and produced the mandatory file list.

MANDATORY SEAMS (3 files, or 4 if the sidebar icon is brand-new):
1. src/lib/packs.ts -- PACK_IDS (line 14) + PACKS entry (line 40 block; door_to_door = 69-81).
2. supabase/migrations/20261029010000_industry_packs.sql -- the SQL allow-list v_allowed (line 49). Miss it -> set_org_packs RAISEs 22023 and the toggle silently fails.
3. src/components/Dashboard.tsx -- lazy import (lines 75-77) + case '<tab-id>' in the switch (door_to_door = case 'd2d-app' line 515).
4. src/components/DashboardSidebar.tsx -- PACK_ICONS map (~line 689) ONLY if the icon name is new.

OPTIONAL: src/packs/<vertical>/ (the screen; door_to_door = 9 files), src/lib/coach/packContent.ts (coach words), pack migrations (door_to_door = 3), src/lib/<vertical>Api.ts (data layer), tests.

NOT seams: src/App.tsx (zero pack refs), useEnabledPacks.ts, PackSettings.tsx, PackLocked/PackComingSoon (all generic, no edit).

Counts: 3 mandatory for a placeholder; 4 if new icon; ~8-10 for a pack with real screens+data; ~24 to match door_to_door's full footprint.

Edge functions: OPTIONAL. door_to_door uses none. Cold email already has 4 elite-email-* edge functions + 4 elite_email migrations but is NOT wired as a pack yet.

Verdict: mostly CLEAN (sidebar, gating, toggles, hook all iterate ALL_PACKS generically). Two LEAKS: (1) pack-id allow-list duplicated TS packs.ts:14 + SQL industry_packs.sql:49, hand-synced, drift fails at runtime not compile time; (2) rendering is a hardcoded Dashboard switch case + a second hardcoded PACK_ICONS map.

Prior art: docs/wholesale/phases/briefs/p2-packs.md + out/p2-packs.md (add-a-pack spec) and docs/ELITE_EMAIL_NATIVE_EXECUTION_BLUEPRINT.md (cold-email design).

Validation: read every seam file end-to-end; confirmed line numbers with findstr on real files; repo grep confirmed App.tsx has no pack wiring and door_to_door has no edge function. Read-only analysis; no writes, no DB queries.

## Artifact

**Findings**

Project = C:/Users/charl/dial-smart-system (React+Vite 'Smart Dialer'). A 'vertical' is an Industry Pack. Answer: 3 files are MANDATORY to make a new pack (e.g. cold_email) appear and render; 4 if the sidebar icon is a brand-new lucide name; 8-10 for a pack with real screens/data, and ~24 to match door_to_door's full footprint.

MANDATORY SEAMS (the pack registry is registry-driven in 3 of 4 places, hardcoded in 1):
1. src/lib/packs.ts -- add id to PACK_IDS (line 14) AND a PACKS[] entry (line 40 block, door_to_door is lines 69-81). This is the single frontend source of truth; PACK_IDS/PackId type/ALL_PACKS/packForTab/packForPath all derive from it.
2. supabase/migrations/20261029010000_industry_packs.sql -- add the id to the hardcoded allow-list `v_allowed constant text[] := ARRAY['solar_exit','wholesale_re','door_to_door']` (line 49). If omitted, set_org_packs RAISEs 22023 and the admin toggle silently fails. (Editing a shipped migration is unsafe in live; realistically a NEW migration redefining set_org_packs. Either way it is a SQL file you MUST touch.) packs.ts lines 10-11 explicitly warn 'Keep this list in sync with ... set_org_packs'.
3. src/components/Dashboard.tsx -- add a lazy import (join lines 75-77, `const DoorToDoorApp = lazy(() => import('@/packs/door_to_door/DoorToDoorApp'))`) AND a `case '<tab-id>'` in the render switch (door_to_door is `case 'd2d-app'` at line 515). Without the case, ?tab=<new> falls to the default 'Select a section' div. Pack gating itself is generic (packForTab at line 222 + hasPack), so NO gating code is per-pack.
4. src/components/DashboardSidebar.tsx -- ONLY if the icon string is new: add it to the PACK_ICONS map (line ~689; currently Target, RotateCw, Shield, MessageSquare, Building2, DoorOpen; unknown names fall back to Package). getPackNavigation (line 210) is fully generic over ALL_PACKS.

OPTIONAL / SCREEN SEAMS:
5. src/packs/<vertical>/<VerticalApp>.tsx -- the pack's own component tree (door_to_door = 9 files: DoorToDoorApp.tsx, host.ts, enroll.ts, coachRules.ts, runClassicScript.ts, mount.css, doorboss.css, app/markup.html, app/scripts.js).
6. src/lib/coach/packContent.ts -- add to COACH_CONTENT (line 13) only if the pack ships live-coach words; door_to_door is the only entry.
7. supabase/migrations/<vertical>_*.sql -- pack tables (door_to_door used 3: 20261102234500_door_to_door_core, 20261103020000_door_to_door_workspace, 20261103023000_door_to_door_members). wholesale used 1 (20261028210000_wholesale_core).
8. src/lib/<vertical>Api.ts -- pack data layer (door_to_door = src/lib/d2dApi.ts; types in src/lib/doorToDoor.ts). Pure supabase-js + RLS, no edge function.
9. tests -- src/packs/<vertical>/__tests__/* + src/lib/__tests__/coachRules.test.ts.

NOT a seam: src/App.tsx has ZERO pack references (lines 132-152 are top-level routes only; packs live inside /dashboard?tab=). You only touch App.tsx if the vertical needs its own top-level route (none of the 3 packs do). src/hooks/useEnabledPacks.ts, src/components/PackSettings.tsx, PackLocked.tsx, PackComingSoon.tsx are all fully generic and need NO edit per pack.

EDGE FUNCTIONS: optional, NOT a mandatory seam. door_to_door has ZERO edge functions (d2dApi is supabase-js only). wholesale references api-gateway and coach-suggest. The email/cold-email vertical ALREADY has 4 edge functions (elite-email-mailgun-events, elite-email-release-preparation, elite-email-release-registration, elite-email-release-status) and 4 migrations (20260720120000-150000_elite_email_*) but is NOT wired as a pack (no cold_email id, no Dashboard case, no sidebar item) -- it is edge/migration-only today.

CLEAN vs LEAKY: Mostly clean, two real leaks. Registry-driven: sidebar (getPackNavigation), gating (packForTab), settings toggles, and the hook all iterate ALL_PACKS generically -- adding a pack changes them for free. LEAK 1 (the main one): the pack-id allow-list is duplicated -- TypeScript PACK_IDS (packs.ts:14) AND the SQL v_allowed (industry_packs.sql:49) must be hand-synced; drift = toggle fails at runtime with 22023, no compile error. LEAK 2: rendering is a hardcoded switch case in Dashboard.tsx (not registry-driven), so a pack with a screen MUST edit the switch; and the sidebar icon is a second hardcoded map (PACK_ICONS). Prior art: docs/wholesale/phases/briefs/p2-packs.md + out/p2-packs.md is the exact 'add a pack' spec, and docs/ELITE_EMAIL_NATIVE_EXECUTION_BLUEPRINT.md is the design for the cold-email vertical (provider adapters, release state machine) that has not yet been given a pack surface.

**evidence**

- src/lib/packs.ts:14 PACK_IDS = ['solar_exit','wholesale_re','door_to_door']
- src/lib/packs.ts:10-11 comment: 'Keep this list in sync with supabase/migrations/20261029010000_industry_packs.sql (set_org_packs).'
- src/lib/packs.ts:69-81 door_to_door PACKS entry (sidebar item id 'd2d-app')
- src/lib/packs.ts:85 ALL_PACKS derived from PACK_IDS; :103 packForTab; :113 packForPath
- supabase/migrations/20261029010000_industry_packs.sql:49 v_allowed constant text[] := ARRAY['solar_exit','wholesale_re','door_to_door']::text[]
- src/components/Dashboard.tsx:77 const DoorToDoorApp = lazy(() => import('@/packs/door_to_door/DoorToDoorApp'))
- src/components/Dashboard.tsx:515 case 'd2d-app': -> DoorToDoorApp; :509 case 'packs'; :511 wh-properties PackComingSoon
- src/components/Dashboard.tsx:222-224 owningPack=packForTab(activeTab); if (owningPack && !packsLoading && !hasPack(owningPack)) render PackLocked
- src/components/DashboardSidebar.tsx:207/689 PACK_ICONS map {Target,RotateCw,Shield,MessageSquare,Building2,DoorOpen}; :210 getPackNavigation(enabledPacks) iterates ALL_PACKS generically
- src/lib/coach/packContent.ts:13-15 COACH_CONTENT = { door_to_door: DOOR_TO_DOOR_COACH }
- src/lib/d2dApi.ts:1-20 pack data layer, supabase-js only, no functions.invoke anywhere in file
- src/App.tsx:132-152 routes -- no 'pack' token anywhere in App.tsx (findstr returned empty)
- supabase/migrations: 20261102234500_door_to_door_core.sql, 20261103020000_door_to_door_workspace.sql, 20261103023000_door_to_door_members.sql, 20261028210000_wholesale_core.sql, 20260720120000-150000_elite_email_*.sql
- supabase/functions: no d2d function; grep 'door_to_door' across edge index.ts returned none; 'wh_/wholesale' hits api-gateway/index.ts + coach-suggest/index.ts; elite-email-* (4 fns) exist
- docs/wholesale/phases/briefs/p2-packs.md:14-20 the pack-frontend build spec; docs/wholesale/phases/out/p2-packs.md DESIGN NOTE + TESTS
- docs/ELITE_EMAIL_NATIVE_EXECUTION_BLUEPRINT.md:1-24 decision: DialSmart operator layer + Instantly/Mailgun adapters

**validation**

Read every seam file end-to-end (packs.ts, Dashboard.tsx switch+gate, DashboardSidebar.tsx, packContent.ts, App.tsx, d2dApi.ts). Confirmed line numbers with findstr /n on the real files (not just the pasted prior-art doc): packs.ts:14/85, industry_packs.sql:49, Dashboard.tsx:77/509/511/515. Confirmed App.tsx has no pack wiring and door_to_door has no edge function by repo-wide grep. Enumerated migrations and edge-function dirs by read-only listing.

**open_questions**

- Does the LIVE database's set_org_packs actually match migration 20261029010000's v_allowed, or has it drifted (the doc warns but the live state was not queried)?
- For cold email, would it reuse the existing 4 elite-email edge functions + 4 migrations and just add a pack surface, or need new ones?
- Should the pack-id allow-list be de-duplicated (read allowed ids from a single source) to remove LEAK 1?

**what_i_did_not_check**

- The live DB state of set_org_packs / v_allowed (no DB query run -- read-only analysis only).
- Whether any OTHER file imports PACK_IDS/PACKS beyond the ones found by grep (did not exhaustively open every file that mentions 'pack').
- The 4 elite-email edge function bodies and their 4 migrations in detail (only confirmed they exist and that elite email is not wired as a pack).
- The wholesale staging copy under docs/wholesale/phases/staging/p2/ vs the live src tree (staging is prior art, not verified identical to main).
- Whether PackSettings.tsx needs any per-pack edit (read as generic but did not execute a render test).

**confidence**: high