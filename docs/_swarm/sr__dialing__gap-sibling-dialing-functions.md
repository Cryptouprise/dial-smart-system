# sr::dialing::gap-sibling-dialing-functions

- status: completed
- tldr: 41 sibling dialing funcs audited: 8 reachable, 33 hard-disabled; 11 core nodes excluded.

Sibling dialing-function audit complete. Audited 41 dialing-related edge functions NOT among the 11 completed sr::dialing:: nodes (call-dispatcher, demo-call, outbound-calling, predictive-dialing-engine, voice-broadcast-engine/queue/tts, voice-call, voice-call-action, voice-call-events, voice-token). Same 3 criteria per function: service-role use, hardcoded disable gate, caller verification. Result: 8 are live/reachable (twilio-voice-twiml, twilio-voice-status, twilio-voice-transcription, telnyx-outbound-ai, api-gateway, phone-number-purchasing, retell-call-webhook, retell-reconciler); 33 are hard-disabled at entry (503 or side-effect-free stub). No un-audited dialing entrypoint with reachable egress was found among the siblings.

## Artifact

**Findings**

INVENTORY: C:/Users/charl/dial-smart-system/supabase/functions/ contains 124 function dirs + _shared. The 11 completed sr::dialing:: nodes are: call-dispatcher, demo-call, outbound-calling, predictive-dialing-engine, voice-broadcast-engine, voice-broadcast-queue, voice-broadcast-tts, voice-call, voice-call-action, voice-call-events, voice-token (confirmed from swarm plan_status Completed list). All OTHER dialing-related functions (41) were audited here with the same 3 criteria: (A) uses-service-role, (B) hardcoded-disable gate, (C) caller-verified.

=== GROUP 1: REACHABLE (not hard-disabled), 8 functions, with caller verification ===
1) twilio-voice-twiml | SR=YES env L79 | disable=NONE | verified=YES: Twilio signature validateTwilioWebhook L65 (403 on fail); identity->call_logs row scoped by call_log_id+organization_id L90-91, fallback by user_id L104; membership check organization_users L124-132. 
2) twilio-voice-status | SR=YES L41 | disable=NONE | verified=YES: Twilio signature L35 (403); call_logs lookup by provider_call_id L54-60, acts on call_log.organization_id L56.
3) twilio-voice-transcription | SR=YES L52 | disable=NONE | verified=YES: Twilio signature L36 (403); call_logs lookup L63-68 -> append_call_live_transcript RPC L75.
4) telnyx-outbound-ai | SR=YES L91 | disable=NONE | verified=YES: JWT auth.getUser L115 + every query scoped .eq('user_id')+.eq('organization_id') (L177-178 etc).
5) api-gateway | SR=YES L41/L74 | disable=NONE | verified=YES via API KEY not JWT: authenticateApiKey (index L98) resolves api_keys row to user_id+organization_id (_shared/api-auth.ts L59,81-82), requireScope (_shared/api-auth.ts L96), per-key rate limit (index L102), audit log (L113/L126). NOTE: routes scope by .eq('user_id') only (e.g. L229,313,356) - org dimension exists in ctx but is not enforced on most routes.
6) phone-number-purchasing | SR=YES L48 | disable=NONE | verified=YES: JWT auth.getUser L65, rows scoped user.id L103,226,325,387,458.
7) retell-call-webhook | SR=YES L42 & L495 | disable=PARTIAL: analysis sub-feature isRetellAnalysisAutomationCertified() returns false L82-84 (used L1403) | verified=YES: webhook path requires X-Retell-Signature enforce else rejects L573-591; JWT auth.getUser L532-536 for maintenance; strict user_id+organization_id binding L645-675, L1186-1215.
8) retell-reconciler | SR=YES L260 | disable=ENV-GATED: RETELL_RECONCILER_ENABLED default 'false' L264; gate returns 503 unless certified L341 | verified=YES: service-role bearer OR X-DialSmart-Cron-Token OR pg_cron-source token, constant-time compared L265-279 (401 otherwise).

=== GROUP 2: HARD-DISABLED at entry (33 functions) ===
Toplevel 503 'disabled:true' stub before any client (dead/contained): twilio-amd-webhook (L32-40, SR at L44 unreachable); twilio-inbound-handler (L16-26); twilio-dtmf-handler (side-effect-free 200 stub, L7-20); quick-test-call (L16-24); clear-voice-webhooks (L15-19); setup-inbound-calls (L16-20); setup-lady-jarvis (L104-108); call-tracking-webhook (L134-142, legacy); inbound-transfer-webhook (L128-132); retell-inbound-webhook (L43-51); twilio-integration (L36-40).
isXCertified() returns false hardcoded + 503 gate: assistable-make-call (L21-23 gate L101-111); backfill-call-agent-data (L9-11 gate L18-23); analyze-call-transcript (L144-146 gate L156-166); campaign-health-monitor (L27-29 gate L36-41); disposition-router (L76-78 gate L89-99); validate-phone-numbers (L67 gate L81-85); telnyx-webhook (L172-174 gate L185-195, signature verify L217 unreachable); retell-force-webhook (L9-11 gate L20-30); retell-agent-management (L46-50); retell-phone-management (L30-34); retell-llm-management (L24-28); retell-business-verification (L43-45); telnyx-ai-assistant (L231-235 + L284-288); telnyx-scheduled-events (L42-53); telnyx-dynamic-vars (L28-32); telnyx-insights (L53-55); telnyx-knowledge-base (L64-71); provider-management (L58-60); enhanced-rotation-manager (L28-30); reachability-scoring (L21-28); nudge-scheduler (L36-43).
All Group-2 functions still reference SUPABASE_SERVICE_ROLE_KEY + auth.getUser but AFTER the gate, so unreachable.

=== OUT OF SCOPE (not dialing) ===
Non-dialing verticals left out: ai-assistant, ai-assistant-config, ai-autonomous-engine, ai-brain, ai-configuration-complete, ai-error-analyzer, ai-sms-processor, ai-workflow-generator, airtable-sync, automation-scheduler, autonomous-prioritization, billing-portal, budget-tracker, bulk-lead-import, calendar-integration, check-number-config, credit-management, demo-funnel-track, demo-scrape-website, demo-sms-reply, elevenlabs-tts, elite-email-*, elite-solar-preflight, email-sender, generate-daily-report, ghl-* , law-firm-beta-submit, mcp, mcp-observer, ml-learning-engine, pipeline-management, reachability-scoring(non-dial part), ringba-enrich-proxy(discontinued), scheduled-spam-check, slack-webhook, sms-messaging, spam-detection, advanced-spam-detection, enhanced-spam-lookup, stripe-webhook, system-health-monitor, teams-observer, test-workflow, update-lead-info, workflow-executor, yellowstone-integration, zapier-observer, _shared.
Dialing-ADJACENT but owned by OTHER DAG nodes (not duplicated here): coach-decide/coach-suggest (sr::coach-pipeline); phone-number-purchasing & retell-cost-backfill (sr::billing-credit - audited anyway for completeness); retell-agent/phone/llm-management & telnyx-* config (sr::agent-config / sr::telephony-webhooks - listed above but the deep config semantics belong to those nodes); dialpath-* entrypoints (dialpath-webhooks, dialpath-other-entrypoints, dialpath-outbound-calling-contract).

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/ (124 dirs, from `dir /b`)
- twilio-voice-twiml/index.ts:79 (SR), :65 (sig), :104/:124-132 (org membership)
- twilio-voice-status/index.ts:41 (SR), :35 (sig)
- twilio-voice-transcription/index.ts:52 (SR), :36 (sig)
- telnyx-outbound-ai/index.ts:91 (SR), :115 (getUser), :177-178 (org scope)
- api-gateway/index.ts:41,74 (SR), :98 (authenticateApiKey), :102 (rate limit); api-gateway/_shared/api-auth.ts:59,81-82 (user+org from api_keys), :96 (requireScope)
- phone-number-purchasing/index.ts:48 (SR), :65 (getUser)
- retell-call-webhook/index.ts:42,495 (SR), :82-84 (analysis gate false), :573-591 (X-Retell-Signature enforce), :532-536 (getUser), :1403 (gate use)
- retell-reconciler/index.ts:260 (SR), :264 (ENABLED flag), :275-279 (service/cron auth), :341 (503 gate)
- twilio-amd-webhook/index.ts:32-40 (disabled), :44 (SR unreachable)
- twilio-inbound-handler/index.ts:16-26 (503 stub)
- twilio-dtmf-handler/index.ts:7-20 (side-effect-free 200 stub)
- quick-test-call/index.ts:16-24 (disabled)
- clear-voice-webhooks/index.ts:15-19 (disabled)
- setup-inbound-calls/index.ts:16-20 (disabled)
- setup-lady-jarvis/index.ts:104-108 (disabled)
- call-tracking-webhook/index.ts:134-142 (disabled legacy), :146 (SR unreachable)
- inbound-transfer-webhook/index.ts:128-132 (disabled)
- retell-inbound-webhook/index.ts:43-51 (disabled)
- retell-force-webhook/index.ts:9-11,20-30 (gate)
- telnyx-webhook/index.ts:172-174,185-195 (gate), :217 (sig unreachable)
- assistable-make-call/index.ts:21-23,101-111 (gate)
- backfill-call-agent-data/index.ts:9-11,18-23 (gate)
- analyze-call-transcript/index.ts:144-146,156-166 (gate)
- campaign-health-monitor/index.ts:27-29,36-41 (gate)
- disposition-router/index.ts:76-78,89-99 (gate)
- validate-phone-numbers/index.ts:67,81-85 (gate)
- twilio-integration/index.ts:36-40 (disabled)
- retell-agent-management/index.ts:46-50; retell-phone-management/index.ts:30-34; retell-llm-management/index.ts:24-28; retell-business-verification/index.ts:43-45 (disabled)
- telnyx-ai-assistant/index.ts:231-235,284-288; telnyx-scheduled-events/index.ts:42-53; telnyx-dynamic-vars/index.ts:28-32; telnyx-insights/index.ts:53-55; telnyx-knowledge-base/index.ts:64-71 (disabled)
- provider-management/index.ts:58-60; enhanced-rotation-manager/index.ts:28-30; reachability-scoring/index.ts:21-28; nudge-scheduler/index.ts:36-43 (disabled)
- swarm plan_status Completed nodes sr::dialing::{call-dispatcher,demo-call,outbound-calling,predictive-dialing-engine,voice-broadcast-engine,voice-broadcast-queue,voice-broadcast-tts,voice-call,voice-call-action,voice-call-events,voice-token} = the 11 excluded

**edge_cases_considered**

- api-gateway authenticates by API key (dsk_live_) not JWT auth.getUser - counted as verified because key maps to user_id+organization_id + scope + rate limit + audit log, but flagged that most routes enforce user_id only, not organization_id.
- retell-call-webhook is partially live: signature-enforced webhook path runs, but its analysis automation sub-feature is hard-disabled (isRetellAnalysisAutomationCertified=false).
- retell-reconciler is env-gated (default false) rather than hardcoded false, and accepts a cron token in addition to service role - classified separately from the hardcoded-false group.
- Several functions (twilio-amd-webhook, call-tracking-webhook, telnyx-webhook) still contain full service-role bodies and signature-verify code that is now unreachable behind the gate - dead code, not a live exposure.
- twilio-dtmf-handler returns HTTP 200 (not 503) with a Hangup TwiML - disabled by side-effect-free stub rather than status code.
- twilio-voice-twiml/status/transcription verify the PROVIDER (Twilio signature), not an end-user JWT - correct for webhooks; the human identity binding is enforced in twiml (membership) but status/transcription bind only via the call_logs row.
- _shared/* are libraries, not entrypoints; excluded from the dialing-entrypoint audit.

**what_i_did_not_check**

- LIVE/deployed state: I audited the repo working tree only. I did not diff deployed Supabase revisions or read deployed secrets, so I cannot confirm what is actually running (e.g. whether RETELL_RECONCILER_ENABLED or RETELL_WEBHOOK_VERIFY_MODE are set live, or whether the 8 reachable funcs are deployed at these commits).
- config.toml verify_jwt flags per function (whether the Supabase gateway itself requires a JWT) - not read.
- Full body review of every hard-disabled function beyond its gate line (I confirmed the gate + SR line but did not exhaustively read all downstream code of e.g. disposition-router, retell-call-webhook 3000+ lines).
- RPC-level authorization of the DB functions these call (append_call_live_transcript, claim_retell_reconciliation_jobs, touch_api_key, etc.) - out of scope, belongs to the RLS/secdef nodes.
- Non-dialing dialing-adjacent provider config semantics for retell-agent/phone/llm-management and telnyx-* config (assigned to sr::agent-config / sr::telephony-webhooks).
- Whether any of the 33 hard-disabled functions is reachable through an alternate invocation path (e.g. schedule, pg_cron, or another function invoking it internally) that bypasses the HTTP gate.
- Frontend/first-party callers of the 8 reachable siblings across the whole repo (I audited the functions, not their callers).
- The 'dialsmart pack functions' mentioned in the task: no separate pack directory exists under supabase/functions; pack/multi-tenant surfaces appear to be the api-gateway + api_keys model, not distinct edge functions - did not search the wider monorepo for a packs package.

**confidence**: high