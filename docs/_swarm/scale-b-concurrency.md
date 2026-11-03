# scale-b-concurrency

- status: completed
- tldr: Concurrency ceiling is non-atomic (count-then-claim), per-user, and differs live (100, 10x overshoot) vs main (10); browser manager gates nothing; 500 reps overshoot.

LANE (b) CONCURRENCY done (research only, nothing written to repo). Headline: the dialing concurrency ceiling is enforced in exactly one place (call-dispatcher) as a NON-ATOMIC count-then-claim, so it can be exceeded when dispatcher runs overlap; and DEPLOYED=LIVE differs from main. LIVE ceiling = floor(retell_max_concurrent/0.10) = 100 by default (10x overshoot, ignores max_concurrent_calls) [functions-live/.../call-dispatcher/index.ts:1232-1233]; MAIN ceiling = min(retell_max_concurrent, max_concurrent_calls) = 10 [supabase/functions/call-dispatcher/index.ts:1392]. Limits are PER-USER (system_settings UNIQUE(user_id)); no per-org or global cap. The browser 'concurrency manager' (useConcurrencyManager.ts) gates NOTHING - canMakeCall/canTransferToPlatform appear only in the hook + tests; client dispatch is launch-locked anyway (launchSafety.ts:128-133). Enforcement: count call_logs (user/org, status in initiated/ringing/in_progress/queued) then rpc claim_pending_dispatches p_limit=batchSize; the RPC uses FOR UPDATE SKIP LOCKED which only stops double-claiming the SAME row, never enforces a ceiling. Counting call_logs (created only after provider ACCEPT) while marking dialing_queues 'calling' opens a multi-second stale-count window -> N concurrent invocations each take a full batch (same class as the documented 14% multi-dial bug). Ceiling hit = HTTP 200 status 'at_capacity', dispatched 0, rows stay 'pending' (QUEUE, not drop/throw); over-max_attempts rows -> 'failed'. Scheduler runs 1x/min and awaits each tenant SERIALLY (automation-scheduler/index.ts:99-142) - at 500 reps the 60s tick will overlap. No DB trigger/constraint caps concurrency (grep-verified). Concrete fixes in the artifact: push the in-flight count into claim_pending_dispatches under an advisory lock; count dialing_queues not call_logs; add a per-org/global cap and key settings by org; bound-parallelize the scheduler; unify the 3 disagreeing default sets.

## Artifact

**Findings**

CONCURRENCY LANE (b). The dialing system's concurrency ceiling is enforced in ONE place only — the call-dispatcher Edge Function — and enforcement is a non-atomic count-then-claim, so the ceiling can be exceeded when dispatcher invocations overlap. Critically, DEPLOYED LIVE and GitHub main have DIFFERENT limits.

F1 (FACT) Two dispatcher ceilings exist. DEPLOYED-LIVE (supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1232-1233, v610 2026-07-01, from README) computes `pickupRate=0.10; maxDialsInFlight = Math.floor(retellConcurrency/0.10)` -> default retell_max_concurrent=10 yields a ceiling of 100 dials in flight (10x overshoot, comment '10/0.1=100'). MAIN (supabase/functions/call-dispatcher/index.ts:1392) computes `maxDialsInFlight = Math.max(1, Math.min(retellConcurrency, maxConcurrent))` -> default min(10,10)=10, NO overshoot. So the deployed ceiling is 10x the configured value and IGNORES max_concurrent_calls entirely (uses retell_max_concurrent only); main uses the min of both.

F2 (FACT) Limits are PER-USER, not per-org/global. system_settings has UNIQUE(user_id) (migrations/20251109171900_concurrency_management.sql:2-17); dispatcher reads settings by .eq('user_id', user.id) (main index.ts:325-329; live :~250). Live active-call count is scoped user_id only (:1217-1222); main scopes user_id AND organization_id (:1377-1382). No global/tenant cap anywhere.

F3 (FACT) The browser 'concurrency manager' does NOT gate anything. src/hooks/useConcurrencyManager.ts exports canMakeCall (:350-357), canTransferToPlatform (:358-361), calculateDialingRate, getAllPlatformCapacities — grep shows all four are referenced ONLY in the hook's own return and in __tests__; no production consumer. The two real consumers (components/ConcurrencyMonitor.tsx:23-33, components/DialingPerformanceDashboard.tsx:23) only display/count. The client dispatch path is additionally hard-locked: lib/launchSafety.ts:128-133 browserCallDispatchAllowed() returns false, so useCallDispatcher never fires in the current build.

F4 (FACT) Enforcement = non-atomic count-then-claim. main index.ts:1377-1382 counts dialing-relevant call_logs (status in initiated/ringing/in_progress/queued) then :1392-1394 computes availableSlots, then :1440-1444 calls rpc claim_pending_dispatches with p_limit=batchSize. The two steps are separate queries with no lock/transaction between them. The RPC (migrations/20260713043000_retell_automatic_reconciliation.sql:1425-1488) uses `... FOR UPDATE SKIP LOCKED LIMIT p_limit` and only caps the number of rows ONE invocation takes — it does NOT read or enforce any in-flight ceiling. FOR UPDATE SKIP LOCKED fixes double-claiming the SAME queue row; it does not stop N concurrent invocations from each claiming up to 15 rows.

F5 (FACT) Race window is widened by counting the wrong table. The ceiling check counts call_logs (created only after the provider ACCEPTS a call), while the claim marks dialing_queues.status='calling' immediately. A claimed-but-not-yet-accepted row is invisible to the count for the duration of provider acceptance (seconds). So concurrent invocations all read a stale-low activeCount and each take a full batch. This is the same class of bug the 2026-04-15 doc LOVABLE_DISPATCHER_RACE_FIX.md:19-35 describes (14% of leads multi-dialed).

F6 (FACT) When the ceiling is hit the action is QUEUE, not drop/throw. main index.ts:1408-1425 returns HTTP 200 {status:'at_capacity', dispatched:0} and leaves the rows 'pending' for the next tick. Rows over max_attempts are marked 'failed' (:1451-1462). No numbers -> 200 {status:'no_numbers_available'}, campaign stalls (live :1190-1202). It is silent to the operator except this response body.

F7 (FACT) Trigger cadence = once/minute, one serial awaited call per tenant. migrations/20260713050000_automation_scheduler_cron_auth.sql:42 schedules 'automation-scheduler-job' at '* * * * *'. automation-scheduler/index.ts:99-142 loops EVERY tenant and `await`s the dispatcher SEQUENTIALLY (one fetch per user/org). The old 6x/min/8s-stagger behavior cited in the race doc is gone. NOTE migration :74-79 UNSCHEDULES the job and leaves automation disabled unless an operator explicitly calls configure_automation_scheduler_cron(true) — so the repo alone cannot prove the cron is live.

F8 (FACT) Defaults disagree across layers. DB migration 20251109171900:5-7 = max_concurrent_calls 10 / calls_per_minute 30 / max_calls_per_agent 3; retell_max_concurrent 10 (20251230143304:3); assistable 200 (:4). Hook getConcurrencySettings fallback when NO row = maxConcurrentCalls 50 / callsPerMinute 60 / maxCallsPerAgent 5 / retell 25 / assistable 200 (useConcurrencyManager.ts:272-280,288-296) — but because it uses `data?.x || n`, an existing row with the DB value 10 returns 10, so the 50 only applies with no row. ConcurrencyMonitor local state inits 10/30/3/10/200 (:35-43). Server defaults 10(retell)/30/10 (main :336-338). Three different 'defaults' for the same knobs.

F9 (FACT) No DB-level guard. Grep of migrations for concurrency/in_flight/active_calls triggers or constraints finds only the settings columns; there is no trigger or constraint that caps concurrent calls. Enforcement is 100% in edge-function code.

SCALE ASSESSMENT. 50 reps: 50 users, 50 independent ceilings (per-user), scheduler does 50 sequential awaited dispatcher calls/tick within a 60s window — workable. 500 reps: (a) 500 sequential awaited HTTP invocations per 60s tick will exceed 60s (each dispatcher run does several DB round-trips), so pg_cron ticks overlap and multiple dispatcher runs per tenant coincide -> the F4/F5 overshoot race re-opens; (b) each tenant has its OWN ceiling so the AGGREGATE concurrency is unbounded by any single knob (500 users x per-user ceiling of 10 on main, or x100 on live if retell_max_concurrent is left at 10) — on LIVE that is up to 50,000 simultaneous dials, far beyond any plausible Retell plan (THEORY: the real vendor cap is external and not represented in code). The ceiling does NOT scale; it multiplies with headcount. No global governor exists.

CONCRETE FIXES (per problem).
- Race F4/F5: move the ceiling check INTO claim_pending_dispatches — compute in-flight = count(dialing_queues where status='calling') (+ recent call_logs) inside the function and LIMIT by least(p_limit, ceiling - in_flight), guarded by pg_advisory_xact_lock(hashtext(tenant)). Alternatively count dialing_queues.status='calling' instead of call_logs so the acceptance-latency window disappears. One statement, atomic, no new races.
- Live-vs-main F1: ship main's `min(retell,max_concurrent)` formula; the live 1/pickupRate multiplier makes configured concurrency meaningless and 10x over-delivers.
- Headcount F2/scale: add a per-organization (or platform-global) concurrent-dial cap, not just per-user; key system_settings by organization_id.
- Scheduler F7: bound-parallelize tenant dispatch (worker pool) or make the dispatcher pull work for the tenant rather than the scheduler awaiting 500 sequential calls; add tick-overlap protection (advisory lock or skip-if-running).
- Consistency F8: one source of defaults; today DB/server/monitor/hook disagree (10 vs 30 vs 60 etc.).
- Dead/advisory client F3: either wire canMakeCall/canTransferToPlatform into a real gate or delete the claimed 'manager' semantics; today it is a dashboard.

**evidence**

- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1232-1233 (live ceiling = floor(retellConcurrency/0.10))
- supabase/functions/call-dispatcher/index.ts:1292 (main ceiling = max(1,min(retellConcurrency,maxConcurrent)))
- supabase/functions/call-dispatcher/index.ts:1377-1382 (active-call count, user_id+organization_id, status IN initiated/ringing/in_progress/queued)
- supabase/functions/call-dispatcher/index.ts:1408-1425 (at_capacity -> HTTP 200, dispatched 0, rows left pending)
- supabase/functions/call-dispatcher/index.ts:1440-1444 (rpc claim_pending_dispatches, p_limit=batchSize)
- supabase/migrations/20260713043000_retell_automatic_reconciliation.sql:1425-1488 (claim RPC: UPDATE ... FOR UPDATE SKIP LOCKED LIMIT p_limit; no in-flight ceiling read)
- supabase/migrations/20251109171900_concurrency_management.sql:2-17 (system_settings UNIQUE(user_id); defaults 10/30/3)
- supabase/migrations/20251230143304_3c1db463-2115-432a-9ca9-be3aa468d4c9.sql:3-4 (retell_max_concurrent DEFAULT 10, assistable 200)
- supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql:42 (cron '* * * * *'), :74-79 (job unscheduled by default/unless enabled)
- supabase/functions/automation-scheduler/index.ts:99-142 (serial awaited dispatcher fetch per tenant)
- src/hooks/useConcurrencyManager.ts:46,272-296,350-363 (settings defaults + canMakeCall/canTransferToPlatform)
- src/lib/launchSafety.ts:128-133 (browserCallDispatchAllowed() = false)
- src/components/ConcurrencyMonitor.tsx:23-43 (display-only consumer)
- src/components/DialingPerformanceDashboard.tsx:23 (display-only consumer)
- LOVABLE_DISPATCHER_RACE_FIX.md:19-35 (documented 14% multi-dial race; old 6x/min stagger)
- supabase/functions-live/README.md:8-11,79-80 (functions-live = read-only live snapshot; cert gates exist only on main, not live)

**validation**

Read all named files in full or in the cited regions: useConcurrencyManager.ts (all 458 lines), call-dispatcher main (gates 1-70, settings 300-420, batch/claim 1229-1478), live snapshot (1180-1300), automation-scheduler (all 168 lines), predictive-dialing-engine (all 329 lines), concurrencyUtils.ts (all 77), claim RPC (all 64), both settings migrations, cron-auth migration, README. Greps: consumers of useConcurrencyManager (4 files), canMakeCall/canTransferToPlatform/calculateDialingRate/getAllPlatformCapacities (only hook+tests = no prod use), max_concurrent/maxConcurrent across src+functions, claim_pending_dispatches (6 files/22 matches), system_settings creation, cron.schedule, call_logs indexes, DB concurrency guards (none). Cross-checked the race doc against current scheduler (stale: now 1x/min serial, not 6x/min).

**open_questions**

- Is automation-scheduler-job actually scheduled/enabled in the live Supabase project? Migration 20260713050000:74-79 leaves it unscheduled unless configure_automation_scheduler_cron(true) was run; repo cannot prove live state.
- What are the ACTUAL live system_settings values for the production org/user (max_concurrent_calls, retell_max_concurrent)? Not readable from repo; determines whether the live ceiling is 100 or other.
- What is Retell's real account concurrency limit (and Assistable's), and is it per-account or per-subaccount? External; the code models it only via a user-entered column.
- Does api-gateway or any other caller invoke call-dispatcher concurrently with the scheduler (the ORCHESTRATION/dialsmart docs imply a gateway path)? Not traced here.
- Is main's call-dispatcher (with cert gates) actually deployed, or does live differ beyond what README documents?

**what_i_did_not_check**

- Live production DB state (actual system_settings rows, whether the cron job is enabled, real call_logs volume) — repo-only review, no live access.
- Retell/Assistable/Twilio vendor-side concurrency caps and whether the code's proxy column matches them.
- api-gateway and any other non-scheduler callers of call-dispatcher (concurrent invocation sources beyond automation-scheduler + dead browser hook).
- voice-broadcast-engine / outbound-calling concurrency (separate lanes; not read here) — they may carry their own independent limits.
- The 199-migration history for a LATER claim_pending_dispatches redefinition than 20260713043000 (I read the latest match but did not exhaustively diff every migration timestamp).
- Exact runtime behavior of the serial tenant loop at hundreds of tenants (no load test run; scale numbers are reasoned/THEORY).
- Whether call_logs(organization_id, created_at) index (20260124_white_label_credits.sql:227) is actually used by the dispatcher count (which lacks a created_at filter on main).

**confidence**: medium