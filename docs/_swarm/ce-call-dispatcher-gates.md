# ce-call-dispatcher-gates

- status: completed
- tldr: Live call-dispatcher gates: active-status/calling-hours/timezone ENFORCED; release/global-stop/credit/dnc_list ABSENT; internal is the stricter path.

RESEARCH ONLY, nothing changed. Analyzed the api-gateway force-dispatch -> call-dispatcher internal path (action=dispatch, internal=true, service key).

Key: the DEPLOYED code is supabase/functions-live/... (README:8-11), call-dispatcher v610/2026-07-01, never redeployed. GitHub main's 503 cert gates are NOT live.

LIVE call-dispatcher internal-path gates:
1. campaign status 'active' -- ENFORCED (index.ts:426, 736, 740-749; :751 feeds the claim RPC :1287).
2. campaign_contact_releases -- ABSENT (grep 0 in LIVE dispatcher + LIVE outbound-calling).
3. global-stop -- ABSENT (grep global_stop/contact_stop/evaluate_contact_stop = 0).
4. calling-hours/timezone -- ENFORCED for internal (:469 uses !manualDispatchRequested; per-lead :1372/1389/1391-1405; egress backstop outbound-calling:320-358).
5. DNC per lead -- PARTIAL: leads.do_not_call (:507,883) enforced; hard dnc_list lookup ABSENT (grep 0; outbound-calling skipDncCheck params are vestigial).
6. credit/balance -- ABSENT in dispatcher; ENFORCED at egress outbound-calling:360-452 (skipped if isTestCall/skipCreditCheck).
7. pacing/max_calls -- PARTIAL: concurrency+pacing+per-number max_daily_calls enforced (:267-281,1233,1235-1243,1249-1266,1020-1170); campaign-level max_calls_per_day ABSENT.

Does internal skip anything the user path applies? NO -- it is the STRICTER path. The USER path (manualDispatchRequested=true) bypasses campaign call-hours (:469), per-lead timezone (:1372/1415-1416) and scheduled_at (:1332-1359); the internal path applies all three. Only JWT auth is replaced by token===serviceKey (:246).

Validation: keyword greps + line-cited reads across live/main dispatcher and live/main outbound-calling; cross-checked vs functions-live/README.md.
Blockers/follow-ups: DB RPC bodies (claim_pending_dispatches, check_credit_balance, reserve_credits) and RLS unverified; on GitHub main the api-gateway sends no organizationId but main dispatcher requires it (likely 500) -- theory, not executed. No live execution performed.

## Artifact

**Findings**

AUTHORITATIVE TARGET: the DEPLOYED path is supabase/functions-live/... (README:8-11 = byte-exact LIVE snapshots; call-dispatcher live=v610, updated 2026-07-01, never redeployed; 503 NOT_CERTIFIED gates exist only on GitHub main, README:9-11,79-80). LIVE internal path: api-gateway forceDispatch (LIVE-GW:951-992) POSTs call-dispatcher {action:'dispatch', internal:true, userId, campaignId} under Bearer SERVICE_KEY. isInternalCall=requestBody.internal===true && userId && token===supabaseKey (LIVE:246); identity from requestBody.userId without JWT (LIVE:250-252); manualDispatchRequested=false (LIVE:283-287); manualDispatchNow=false (LIVE:1271). Internal runs the default loop with scheduled_at respected. PER-GATE (LIVE): (1) status 'active' ENFORCED (LIVE:426,736,740-749; campaignIds :751 feeds claim :1287). (2) campaign_contact_releases ABSENT (grep 0 in LIVE dispatcher + LIVE outbound-calling; LIVE _shared has no such module). (3) global-stop ABSENT (grep global_stop/contact_stop/evaluate_contact_stop = 0 in LIVE dispatcher and LIVE outbound-calling). (4) calling-hours/timezone ENFORCED for internal: campaign block LIVE:469 uses !manualDispatchRequested (internal blocked), per-lead timezone LIVE:1372/1389/1391-1405 applied, egress backstop LIVE-EG:320-358. (5) DNC PARTIAL: leads.do_not_call ENFORCED (LIVE:507,883); hard dnc_list lookup ABSENT (grep 0; LIVE-EG skipDncCheck params vestigial, no query). (6) credit/balance ABSENT in dispatcher (grep 0), ENFORCED at egress LIVE-EG:360-452 (throws :405-416; skipped if isTestCall/skipCreditCheck :360; dispatcher invokes without skipCreditCheck LIVE:1739). (7) pacing PARTIAL: concurrency+pacing+calls_per_minute ENFORCED (LIVE:267-281,1233,1235-1243,1249-1266) and per-number max_daily_calls ENFORCED (LIVE:1020-1170); campaign-level max_calls_per_day ABSENT. DOES INTERNAL SKIP ANYTHING? NO - it is the STRICTER path: USER path (manualDispatchRequested=true) bypasses campaign call-hours (LIVE:469), per-lead timezone (LIVE:1372/1415-1416) and scheduled_at (SELECT claim LIVE:1332-1359); INTERNAL applies all three. Internal only 'skips' JWT auth, replaced by token===serviceKey (LIVE:246). MAIN contrast: manualDispatchNow hardcoded false (:1429), bypass off (:350) so both paths identical; adds evaluate_contact_stop, dnc_list, org scoping; disables force_dispatch (503, :413-423).

**evidence**

- supabase/functions-live/README.md:8-11 (functions-live = LIVE deployed snapshots; main carries unreleased 503 gates)
- supabase/functions-live/README.md:28 (call-dispatcher live v610, 1944 lines, updated 2026-07-01)
- supabase/functions-live/api-gateway/index.ts:951-992 (forceDispatch -> call-dispatcher action=dispatch, internal=true, userId, campaignId, Bearer SERVICE_KEY; requireScope campaigns:write; ownership check 954-956)
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:246 isInternalCall; :250-252 internal identity; :283-287 manualDispatchRequested=false for internal; :1271 manualDispatchNow=manualDispatchRequested
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:426,736,740-749 campaign status='active'
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:469 calling-hours block (internal enforced); :1372,1389,1391-1405 per-lead timezone (internal enforced)
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:507,883 do_not_call filter
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1233,1235-1243,1249-1266 pacing/concurrency; :1020,1030,1052,1062,1170 max_daily_calls per-number cap; :1284-1290 atomic claim
- supabase/functions-live/outbound-calling/index.ts:320-358 OUTSIDE_CALLING_HOURS; :360-452 credit check_credit_balance/reserve_credits
- supabase/functions/outbound-calling/index.ts:653 evaluate_contact_stop, :685 dnc_list (main only)
- supabase/functions/call-dispatcher/index.ts:1731-1750 evaluate_contact_stop, :1695-1727 dnc_list (main only); :350,1429 (main bypass forced off)

**validation**

grep sweeps on live+main dispatcher and live+main outbound-calling for campaign_contact_release, global_stop, contact_stop, evaluate_contact_stop, dnc_list, do_not_call, credit, balance, max_daily_calls, max_calls_per_day, organization_id. Line-cited reads: LIVE dispatcher 228-347,405-524,728-915,1226-1266,1255-1419,1480-1640; LIVE outbound-calling 295-480; LIVE api-gateway 951-1005; MAIN dispatcher full 1-2168. Cross-checked against functions-live/README.md.

**open_questions**

- Do DB-side RPCs enforce gates not visible in TS (claim_pending_dispatches, check_credit_balance, reserve_credits, increment_daily_calls_with_reset)?
- On GitHub main api-gateway sends no organizationId (main api-gateway:976-981) but main dispatcher requires it via tenant-context.ts:16-21 -> likely 500 (THEORY, not executed).
- Is LIVE outbound-calling reachable directly (verify_jwt=false) letting a caller pass skipCreditCheck/skipDncCheck/isTestCall?

**what_i_did_not_check**

- Full line-by-line read of the 1944-line LIVE dispatcher (callback/workflow/number-rotation tail not exhaustively read).
- Bodies of SQL RPCs and RLS policies that could act as gates.
- Callback-automation and workflow-enrollment sub-paths as independent dispatch routes.
- Full MAIN vs LIVE diff of outbound-calling (keyword comparison only).
- Whether webhooks write dnc_list/contact-stop state the path relies on.
- No execution against the live Supabase project: static reading only.

**confidence**: high