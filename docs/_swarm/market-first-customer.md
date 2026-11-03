# market-first-customer

- status: completed
- tldr: D2D pack is the wedge as a standalone canvassing app; the locked dialer half is a distraction. Ideal first customer: door-to-door solar canvassers targeting bankrupt-installer homes.

Node market-first-customer done (evidence-based). VERDICT: the Door to Door pack IS the wedge, but only as a standalone field-canvassing app; as 'the app that becomes your dialer' the rest of Dial Smart is a distraction because every contact path is hard-locked. Key evidence: launchSafety.ts:128-159 (dispatch/egress/autonomous/provider all return false), call-dispatcher/index.ts:15-25 + :636-652 (callback automation launch-disabled, gate false at :19-21), Dashboard.tsx:515-516 vs :511-514 (D2D is the only pack with a real screen; other two are PackComingSoon stubs), host.ts:1568-2050 (full CRUD backend that touches no provider), enroll.ts:160-265 (door->lead->callback bridge with consent gate), pilot-portfolio/manifest.json:4-16 (four pilots, production_launch_allowed=false). IDEAL FIRST CUSTOMER: a residential door-to-door solar canvassing team selling service/'solar exit' to owners whose installer went bankrupt - the pack is a DoorBoss port and its ask/practice/area copy is already written in that exact language. NOT YET list includes: auto-dial of door callbacks, geocoded maps/routes/near-me, skip-tracing, video/intake, push, pack billing, and the entire dialer half for anyone. Corrected one carried assumption: coach-suggest confidence is implemented (coach-suggest:390-457), not missing.

## Artifact

**Findings**

VERDICT: The Door to Door pack IS the wedge - but only if positioned as a standalone field-canvassing app for a door-knocking team. Framed as 'the app that becomes your dialer', the rest of Dial Smart is a DISTRACTION because every contact path is hard-locked off in code. || FACT: The whole contact platform is launch-locked by hardcoded gates. src/lib/launchSafety.ts:128-133 browserCallDispatchAllowed() returns false; :140-142 browserAutonomousActionAllowed() false; :149-151 browserContactEgressAllowed() false; :157-159 browserProviderAdministrationAllowed() false. call-dispatcher/index.ts:15-25 hardcodes isForceDispatchCertified/isCallbackAutomationCertified/isAutomaticRetellNumberSyncCertified to return false. So no campaign can start, no callback can auto-fire, no browser-originated call/text/broadcast can leave. || FACT: The doorstep-callback loop is cut at the dispatcher. host.ts:738-783 syncDoorFollowUps queues a scheduled_follow_ups row when a rep books at the door; the automatic consumer call-dispatcher/index.ts:636 logs 'Callback automation is launch-disabled' and :640 gates the query behind isCallbackAutomationCertified() which is false (:19-21). The lead + callback DO persist and ARE visible in the UI (useCallbacks.ts:113, FollowUpScheduler.tsx:99), so a human can act - but the advertised door-to-dialer automation is dead. || FACT: D2D is the ONLY pack with a real screen. Dashboard.tsx:77 lazily loads DoorToDoorApp; :515-516 renders it for 'd2d-app'. The other two registered packs render stubs instead: Dashboard.tsx:511-512 wh-properties -> PackComingSoon, :513-514 se-workspace -> PackComingSoon. src/lib/packs.ts:14-81 registers solar_exit (workspace only), wholesale_re (Properties only), door_to_door (full app). || FACT: The D2D pack needs no telephony egress and works end-to-end in the browser. It is a byte-faithful DoorBoss port (DoorToDoorApp.tsx:1-22) whose entire REST surface is served from this org's Supabase (host.ts route switch :1568-2050): properties :1652, knocks :1668 (offline/idempotent via unique client_id, :792-843), territories :1683, appointments :1741, messages :1771, positions :1804, heartbeat :1841, perf/leaderboard/competitions/feed/risk/pace :1966-1978, area :1980, ask :2003. None touch a provider. || FACT: Content is pre-tuned to ONE exact customer: door-to-door solar sales to homes whose installer went bankrupt. host.ts:1514-1528 ('bankrupt installer' answers), :1403 area plan filters installer_status='bankrupt', :426-451 practice/reply copy says 'cancel your solar' / 'that installer went under', :1530-1542 scripted opener for orphaned-installer homes. || FACT: Half-built surfaces a canvassing customer would notice. Geocoding is unimplemented (only geocode_status columns exist: types.ts:2521, d2dApi.ts:52; the vendored app says 'Rows without lat/lng are skipped (geocode them first)' at app/scripts.js:1583) so map/'near me'/route/area cannot self-populate. Skip-tracing is explicitly not wired: host.ts:1984 area/trace returns 400, host.ts:1406-1418 says so. Video call/intake/recording not wired: host.ts:2011-2018; config.g false at :2060-2066. Push not wired: host.ts:2022-2025. D2D billing meters nothing: host.ts:1364-1379. || FACT: The pilot portfolio names four intended customers and labels the whole product offline_planning, production_launch_allowed=false, real_contact_authorized=false, crm_writes_authorized=false (campaigns/pilot-portfolio/manifest.json:4-16): Elite Solar Recovery (contact_scope 'consented_database_reactivation_only', launch_path shadow_25 -> owned_phone_20 -> canary_5..50, :18-28), plus Omega Accounting, Noble Gold, Infinite AI at 'intake_definition_required' (:29-61). The intended first contact customer is the solar-exit DIALER pilot - exactly the path the code hard-locks off. || FACT (not a gap): coach-suggest confidence IS implemented - coach-suggest/index.ts:390-457 clamps and returns disposition/stage confidence (fields :57-58, :312-325). Section 6's 'confidence handling open' is about trust, not absence. || FACT: Enabling the pack is config, not a blocker: packs live in organizations.settings.packs (packs.ts:10-11; useEnabledPacks.ts:71-74 defaults empty via normalizePacks) and the router shows PackLocked when unset (Dashboard.tsx:223-232). || IDEAL FIRST CUSTOMER: a residential door-to-door solar canvassing operation (a field-sales org knocking homes to sell 'solar exit' / service to owners whose original installer went bankrupt) - NOT a call-center. Why the code fits them now: (a) the pack is a literal DoorBoss canvassing app, so their whole day (territories, doors, knocks, offline queue, leaderboard, competitions, door-booked appointments) is implemented and touches no telephony; (b) the ask/practice/area content is already written in their exact language (bankrupt installer, orphaned solar); (c) the door->lead->scheduled-callback bridge (enroll.ts) gives them a CRM trail without needing the locked dispatcher. || NOT YET (do not promise): auto-DIAL of door-booked callbacks (call-dispatcher:640 false); geocoded maps, routes, 'near me', area card (no geocoding); skip-tracing of no-phone homes (host.ts:1984); the video-call/recording/intake flow (host.ts:2011-2018); push reminders (host.ts:2022-2025); any metered billing for the pack (host.ts:1364-1379); and the entire dialer/campaigns/broadcast/autonomous half of the product for any customer (launchSafety + call-dispatcher gates).

**evidence**

- src/lib/launchSafety.ts:128-133,140-142,149-151,157-159
- supabase/functions/call-dispatcher/index.ts:15-25,636-652
- src/packs/door_to_door/host.ts:738-783,792-843,1364-1379,1403-1418,1568-2050,1983-1984,2011-2018,2022-2025
- src/packs/door_to_door/enroll.ts:160-265 (consent gate :173, dnc :167, phone :170)
- src/packs/door_to_door/DoorToDoorApp.tsx:1-22,76-95
- src/lib/packs.ts:14-81,103-110
- src/components/Dashboard.tsx:77,223-232,511-516
- src/hooks/useCallbacks.ts:113; src/components/FollowUpScheduler.tsx:99
- src/packs/door_to_door/app/scripts.js:1583
- src/integrations/supabase/types.ts:2521; src/lib/d2dApi.ts:52
- supabase/functions/coach-suggest/index.ts:57-58,312-325,390-457
- campaigns/pilot-portfolio/manifest.json:4-16,18-28,29-61

**validation**

Read-only static analysis; no live systems, no vendor APIs, no secrets touched. Every cited file was opened and its line refs verified by reading. Repo git origin/main 71f70c5e per app-map doc.

**open_questions**

- Can set_org_packs and the d2d_* migrations be applied to a fresh tenant without the local Supabase stack the port flagged?
- Is the 'Telnyx key leaked' / 'Stripe secrets missing' claim true in the live env? Unverifiable from the repo.
- Does any paying external DoorBoss/solar canvassing customer exist today, or is this internal only?
- Would a canvassing customer accept booked door callbacks that never auto-dial, only surface in the FollowUpScheduler UI?

**what_i_did_not_check**

- The live deployed environment's effective flags (I read repo source only).
- The 199 migrations / 36 RLS policies on d2d_* tables for runtime tenant safety.
- Whether the four pilot orgs exist live and which packs they have enabled.
- Whether the Telnyx leak / missing Stripe secrets are true (secrets outside the repo).
- The full 160k-line src/ surface for other off-pack capabilities that may also ship without egress.

**confidence**: medium