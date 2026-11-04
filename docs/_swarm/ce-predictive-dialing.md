# ce-predictive-dialing

- status: completed
- tldr: Both are hard launch-locked (503); predictor enqueues/activates but places no calls, no DNC/hours/credit checks; tracking-webhook has zero egress.

RESEARCH (read-only, no files changed). VERDICT for node ce-predictive-dialing:

predictive-dialing-engine
- Place calls: NO. Zero provider/HTTP egress; no fetch(), no invoke('outbound-calling'). Only egress is invoke('workflow-executor') (predictive-dialing-engine/index.ts:221).
- Activate campaigns: in code YES, independent of call-dispatcher (index.ts:185-196 sets campaigns.status='active' + inserts dialing_queues 'pending'), and it auto-enrolls workflow. BUT the whole function is hard launch-locked: isPredictiveDialingTenantCertified() returns false (index.ts:15-17) and the handler returns 503 PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED before any auth/body work (index.ts:24-29). Net today: does nothing.
- Auth: config.toml:132 verify_jwt=true (block 129-132) + in-function Authorization header (44-50) + supabase.auth.getUser(token) (52-59). Service-role DB client (32-33,42); ownership via .eq('user_id', user.id) (122).
- Consent/DNC/hours/credit: NONE. No dnc_list, no calling hours, no credit, no organization_id scoping; only a lead.status allow/deny list (155-161) that ignores the lead do_not_call flag and dnc_list.

call-tracking-webhook
- Egress: NONE reachable. serve() returns unconditional 503 UNSIGNED_WEBHOOK_NOT_CERTIFIED (index.ts:134-142) BEFORE the try block, so lines 144-222 onward are dead code. No fetch() anywhere; only invoke('calendar-integration') at 1212 (unreachable).
- Auth: config.toml:240 verify_jwt=false -> publicly POST-reachable, no JWT; SERVICE ROLE client (146,152); the 503 gate is unconditional and not signature-verified.

Context: real placement + last-mile safety live in call-dispatcher (invoke('outbound-calling') at call-dispatcher/index.ts:1955; DNC hard stop 1695-1727; evaluate_contact_stop 1731-1750). call-dispatcher's own cert gates (15-25) gate only force_dispatch/callback/sync, not the core dial loop.

VALIDATION: read predictive-dialing-engine fully; read call-tracking-webhook handler + full-file greps; read call-dispatcher gates/DNC/egress; cross-checked config.toml 125-135 and 236-250. No files modified. Static repo read only (no deploy/exec).

BLOCKERS/FOLLOW-UPS (routed as new nodes): (1) who invokes call-dispatcher on a schedule (cron/automation-scheduler); (2) outbound-calling last-mile DNC/credit internals; (3) retell-call-webhook is likely the live webhook replacing the dead call-tracking-webhook -- unaudited; (4) deployed-vs-repo drift not verified.

## Artifact

**Findings**

predictive-dialing-engine CANNOT place calls: no fetch()/HTTP egress and no invoke('outbound-calling'); its only egress is invoke('workflow-executor') at index.ts:221. It CAN activate a campaign and enqueue leads in code (index.ts:193-196 sets campaigns.status='active'; index.ts:185-191 inserts dialing_queues status 'pending') which call-dispatcher later consumes and places (call-dispatcher/index.ts:1955 invokes outbound-calling) -- but the entire function is HARD LAUNCH-LOCKED: isPredictiveDialingTenantCertified() is hardcoded false (index.ts:15-17) and the handler returns 503 PREDICTIVE_DIALING_NOT_TENANT_CERTIFIED before auth/body handling (index.ts:24-29), so today it does nothing. Auth: gateway requires JWT (config.toml:132 verify_jwt=true in block config.toml:129-132) plus in-function user auth via Authorization header (index.ts:44-50) and supabase.auth.getUser(token) (index.ts:52-59); DB client is SERVICE ROLE (index.ts:32-33,42) but ownership enforced by .eq('user_id', user.id) (index.ts:122). Consent/DNC/hours/credit re-checks: NONE -- no dnc_list, no calling hours, no credit, no organization_id scoping; only an in-memory lead.status allow/deny list (index.ts:155-161) that never checks the lead do_not_call flag or dnc_list. call-tracking-webhook has NO reachable egress: serve() returns unconditional 503 UNSIGNED_WEBHOOK_NOT_CERTIFIED at index.ts:134-142 BEFORE the try block, so all Twilio/Retell/legacy handling (index.ts:144-222 onward) is dead code; even the dead code has no fetch() and only invoke('calendar-integration') at index.ts:1212. Its gateway auth is verify_jwt=false (config.toml:239-240) so it is publicly POST-reachable with no JWT, uses a SERVICE ROLE client (index.ts:146,152), and the unconditional in-function 503 is the sole thing preventing processing (not signature-verified). Last-mile safety (DNC hard stop call-dispatcher/index.ts:1695-1727, evaluate_contact_stop 1731-1750) lives in call-dispatcher, not in the enqueue path.

**evidence**

- supabase/functions/predictive-dialing-engine/index.ts:15-17
- supabase/functions/predictive-dialing-engine/index.ts:24-29
- supabase/functions/predictive-dialing-engine/index.ts:32-33
- supabase/functions/predictive-dialing-engine/index.ts:42
- supabase/functions/predictive-dialing-engine/index.ts:44-59
- supabase/functions/predictive-dialing-engine/index.ts:122
- supabase/functions/predictive-dialing-engine/index.ts:155-161
- supabase/functions/predictive-dialing-engine/index.ts:185-196
- supabase/functions/predictive-dialing-engine/index.ts:221
- supabase/config.toml:129-132
- supabase/functions/call-tracking-webhook/index.ts:129-142
- supabase/functions/call-tracking-webhook/index.ts:144-222
- supabase/functions/call-tracking-webhook/index.ts:146,152
- supabase/functions/call-tracking-webhook/index.ts:1212
- supabase/config.toml:239-240
- supabase/functions/call-dispatcher/index.ts:15-25
- supabase/functions/call-dispatcher/index.ts:413,640,1266
- supabase/functions/call-dispatcher/index.ts:1695-1727
- supabase/functions/call-dispatcher/index.ts:1731-1750
- supabase/functions/call-dispatcher/index.ts:1955

**validation**

Read predictive-dialing-engine/index.ts in full (328 lines). Read call-tracking-webhook main handler (lines 108-237) and grepped the whole file. Ran targeted findstr for egress primitives (fetch(, functions.invoke, api.twilio, outbound-calling, sms-messaging, email-sender, voice-broadcast) in both files and for dnc/calling_hours/credit/organization_id in predictive-dialing-engine (only status-list + workflow-executor hits). Read call-dispatcher cert gates (14-83) and DNC/consent region (1690-1759) plus egress invoke (1955). Cross-checked config.toml lines 125-135 and 236-250. No files modified (research only).

**open_questions**

- If isPredictiveDialingTenantCertified() were flipped true, activation+enqueue would execute but no call would place until call-dispatcher runs; confirm the cron/automation-scheduler that invokes call-dispatcher.
- No internal caller can use predictive-dialing-engine with a service role (its getUser() auth would fail such calls) -- confirm no such integration exists.
- Call-tracking-webhook's 503 implies a vendor webhook URL expectation; confirm which URL the live provider actually targets (retell-call-webhook is the likely live one).

**edge_cases_considered**

- OPTIONS/CORS preflight path in both functions returns before the gate silently? No: predictive-dialing-engine handles OPTIONS first (index.ts:20-22) then gates at 24; call-tracking-webhook handles OPTIONS (index.ts:130-132) then gates at 134.
- Does the service-role client bypass the certification gate? No: the gate is a plain in-process return before any client work in both functions.
- Does verify_jwt=true on predictive-dialing-engine make it non-browser-reachable? Not necessarily: the Supabase anon key is itself a valid JWT, so a browser holding the anon key passes the gateway; it then still needs a real user token for getUser().
- Race window between predictive-dialing-engine enqueue and call-dispatcher dialing: call-dispatcher re-checks DNC and contact-stop at dial time, but predictive-dialing-engine's enqueue path performs neither.

**what_i_did_not_check**

- Did not check automation-scheduler or cron definitions for invokers of call-dispatcher / predictive-dialing-engine.
- Did not read outbound-calling/index.ts DNC/credit re-check internals (the true last-mile provider boundary).
- Did not audit retell-call-webhook/index.ts, which appears to be the live Retell webhook replacing call-tracking-webhook.
- Did not check _shared modules for a shared certified() helper or org-certification state source.
- Did not verify deployed-vs-repo drift (repo-only static read; no runtime execution).
- Did not enumerate every other true egress boundary (voice-broadcast-engine, sms-messaging, assistable-make-call) for independent dialing.
- Did not check RLS policies on dialing_queues/campaigns/dnc_list that might further constrain the service-role writes.

**confidence**: high