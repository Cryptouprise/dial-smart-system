# ce-live-call-dispatcher

- status: completed
- tldr: LIVE call-dispatcher: verify_jwt=false (config:127), 0 gates in LIVE, anon blocked by in-fn getUser, but ANY authenticated user can run all 4 actions + real dialing.

ce-live-call-dispatcher DONE (research-only, read-only).\n\n(a) config.toml:126 [functions.call-dispatcher]; :127 verify_jwt = false. CONFIRMED.\n(b) LIVE has ZERO certification gates. findstr NOT_CERTIFIED + /i certified on the LIVE index.ts both exit 1. The three main gates exist ONLY in source: supabase/functions/call-dispatcher/index.ts:417 FORCE_DISPATCH_NOT_CERTIFIED, :1666 TELNYX_EGRESS_NOT_CERTIFIED, :1777 PROVIDER_NOT_CERTIFIED.\n(c) LIVE auth = single block index.ts:222-264: header required (222-228 -> 401 'No authorization header'); isInternalCall needs token===SUPABASE_SERVICE_ROLE_KEY (246, key @211); else getUser(token) @254 -> 401 'Unauthorized' @256-261. No role/owner gate anywhere. Actions all sit after auth (unreachable otherwise): health_check|status_check @290-309 (read-only), cleanup_stuck_calls @312-323 (mutates call_logs+dialing_queues, self-scoped), force_dispatch @326-411 (cross-tenant: arbitrary leadId/campaignId @327, queues a real call @390-399), plus default dispatch @414-1935 (REAL dials via outbound-calling @1739-1745 and assistable-make-call @1547-1550, workflow-executor, manager SMS via alerting.ts:119-127).\n\nVERDICT: anon/anon-key CANNOT invoke (blocked by getUser; THEORY, not live-probed). ANY authenticated user JWT CAN invoke ALL FOUR + default dispatch with no role check.

## Artifact

**Findings**

(a) FACT: config.toml line 126 = [functions.call-dispatcher], line 127 = verify_jwt = false (# Internal service function - called by automation-scheduler). Expected value confirmed.

(b) FACT: LIVE bytes (function index.ts) contain ZERO certification gates. findstr /n /c:"NOT_CERTIFIED" and findstr /i /n /c:"certified" on supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts both exit 1 (no match). No FORCE_DISPATCH_NOT_CERTIFIED, TELNYX_EGRESS_NOT_CERTIFIED, or PROVIDER_NOT_CERTIFIED. The three gates cited in LIVE-VS-MAIN-GATES.md:23,56 exist ONLY in the SOURCE/main file, grep-confirmed at exactly supabase/functions/call-dispatcher/index.ts:417 (FORCE_DISPATCH_NOT_CERTIFIED), :1666 (TELNYX_EGRESS_NOT_CERTIFIED), :1777 (PROVIDER_NOT_CERTIFIED).

(c) FACT: LIVE handler auth flow is a single gate at index.ts:222-264. Line 222 reads the Authorization header; 223-228 return 401 'No authorization header' if absent; line 230 token = authHeader.replace('Bearer ',''); line 246 isInternalCall = requestBody.internal === true AND internalUserId AND token === supabaseKey (supabaseKey = SUPABASE_SERVICE_ROLE_KEY, line 211); else branch line 254 supabase.auth.getUser(token); lines 256-261 return 401 'Unauthorized' on authError/!authUser. Grep confirms a SINGLE rejection site (line 258) and a SINGLE role-related string (line 211 SERVICE_ROLE_KEY). There is NO role/owner/admin gate: passing getUser alone authorizes every action.

(c) FACT: four handled actions, all AFTER the auth block (unreachable without passing 222-264): health_check|status_check @290-309; cleanup_stuck_calls @312-323; force_dispatch @326-411; plus the default no-action dispatch path @414-1935. OPTIONS @205-207 returns early with no auth (CORS preflight only, no side effect).

(c) THEORY (not live-probed): an anon/anon-key caller CANNOT invoke any action. An anon key is a valid project JWT but role=anon with no user sub, so GoTrue /auth/v1/user (called by supabase.auth.getUser) rejects it, yielding authError and the 401 at 256-261. config verify_jwt=false only removes the platform pre-check; the in-function getUser is what actually blocks anon. A live anon-key probe would upgrade this to FACT.

(c) FACT + RISK: ANY authenticated user JWT (any end-user/customer in the shared project's auth.users, incl. a trialist or a different tenant's user) can invoke ALL FOUR actions plus the default dispatch path, because there is no operator/owner/role check beyond getUser. This is the real exposure of verify_jwt=false here, not anon access.

(c) FACT + RISK: force_dispatch is CROSS-TENANT. Line 327 reads arbitrary leadId/campaignId from the body and never verifies they belong to user.id: call_logs updated by lead_id @340-349; dialing_queues read/updated by lead_id+campaign_id @354-371; new high-priority (priority:100) queue row inserted with the supplied campaign_id @390-399, which the next dispatch run DIALS. An authenticated user who knows another tenant's lead/campaign UUIDs can force a real call to that lead.

(c) SIDE EFFECTS: health_check/status_check @290-309 are read-only (fetch system_settings @267-271, return 200; return at 292 precedes any cleanup/dispatch). cleanup_stuck_calls @312-323 -> cleanupStuckCallsAndQueues @87-202 mutates call_logs (initiated/ringing->no_answer @96-106; in_progress->no_answer @113-123; queued->failed @133-144) and dialing_queues (calling->pending or ->failed @169-193), scoped by user.id/user campaigns. force_dispatch writes call_logs @340-349 and dialing_queues @363-371/390-399 (queues a real call, cross-tenant). Default dispatch path @414-1935: auto-cleanup @493; callback handling writes leads/dialing_queues/lead_workflow_progress @503-728; invokes workflow-executor @638-640,994-996; invokes retell-phone-management sync @1130-1136; invokes outbound-calling create_call @1739-1745 (REAL DIALS); invokes assistable-make-call @1547-1550 (REAL DIALS); marks queue rows calling/completed/failed @1362-1366,1564-1566,1783-1787; rpc reset_stale_daily_calls @1003 and increment_daily_calls_with_reset @1791; raiseAlert @1177-1188,1604-1615,1828-1839 -> sendManagerNotification (manager SMS) via alerting.ts:119-127 and manager-notify.ts:95-102. Manual dispatch (any non-internal call whose action is not health_check/status_check/cleanup_stuck_calls, @283-287) BYPASSES calling hours @469-485 and scheduled_at/timezone @1271-1275,1415-1417.

Import wiring FACT: LIVE index.ts imports only std serve (@1), supabase-js (@2), and ../_shared/alerting.ts (@3); alerting.ts imports ./manager-notify.ts (@19). LIVE does NOT import main's _shared/provider-router.ts or tenant-context.ts - consistent with the doc's 'live has features main dropped' note and the absence of the tenant/receipt layer.

**evidence**

- supabase/config.toml:126-127
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:23
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:56
- supabase/functions/call-dispatcher/index.ts:417
- supabase/functions/call-dispatcher/index.ts:1666
- supabase/functions/call-dispatcher/index.ts:1777
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1-3
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:205-207
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:211
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:222-230
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:246
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:254-264
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:283-287
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:290-309
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:312-323
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:326-411
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:469-485
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:87-202
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1547-1550
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1739-1745
- supabase/functions-live/call-dispatcher/functions/_shared/alerting.ts:119-127
- supabase/functions-live/call-dispatcher/functions/_shared/manager-notify.ts:95-102

**validation**

Read LIVE index.ts in full (1944 lines) plus alerting.ts (163 lines) and manager-notify.ts (109 lines) via native read. Ran findstr (case-sensitive and /i) for NOT_CERTIFIED/certified on all three LIVE files -> exit 1 (no matches). Ran findstr for the three main gate constants in supabase/functions/call-dispatcher/index.ts -> exact hits at 417/1666/1777. Ran findstr for getUser/Authorization/internal/Unauthorized/role/SERVICE_ROLE on LIVE index.ts to enumerate the entire auth surface. Verified config.toml:126-127 directly and via findstr line numbers. Read-only: no live commands, no network calls, no writes.

**open_questions**

- Does a live anon-key POST actually return 401 (upgrade the THEORY to FACT)? Requires a live probe, out of scope for research-only.
- Can a provisioned customer/trialist user JWT be obtained to empirically confirm all four actions are invokable with no role gate? (Same probe surface.)
- Is the project single-tenant-per-project or does auth.users span customers? Determines whether 'any authenticated user' means 'any customer of any tenant' (cross-tenant risk) vs 'any user of that one tenant'.

**what_i_did_not_check**

- Did not perform any live HTTP probe (anon-key or user-JWT) against project emonjusymdripmkvtttc, so the anon-key and authenticated-user reachability verdicts are code-derived (FACT on the handler's own calls; THEORY on GoTrue rejecting the anon key).
- Did not read supabase/functions/call-dispatcher/index.ts in full (only grep-confirmed the three gate lines); no full behavioural diff of source vs live.
- Did not inspect RLS policies or table grants on call_logs/dialing_queues/system_alerts (service-role client bypasses RLS, so cross-tenant force_dispatch exposure is function-level; RLS not audited).
- Did not evaluate the two helpers' downstream functions (sms-messaging, outbound-calling, assistable-make-call, retell-phone-management, workflow-executor) for their own auth/gates.
- Did not re-verify the LIVE snapshot deploy timestamp/version (doc says call-dispatcher v610, updated_at 2026-07-01); taken from the doc.

**confidence**: medium