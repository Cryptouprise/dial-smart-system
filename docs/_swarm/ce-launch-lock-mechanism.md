# ce-launch-lock-mechanism

- status: completed
- tldr: 503 launch-quarantine: 51 funcs hardcoded-false helper + top-of-serve guard; 4 const-locked; 20 inline hard-503; 22 ungated; live tree has zero gates

DONE: Documented the LAUNCH-QUARANTINE (503) mechanism across supabase/functions (109 index.ts) and supabase/functions-live (12 index.ts).

TOUCHED: none (research only; all helper scripts written to %TEMP%, repo verified clean).

RESULT: The named pattern is real: `function is<X>Certified(): boolean { return false; }` + `if (!is<X>Certified()) return Response({success:false,disabled:true,error_code:'<X>_NOT_CERTIFIED'},{status:503})` at the very top of serve(). 54 helpers / 51 functions, ALL hardcoded `return false` (category i, NOT env- or config-gated), all placed before any env/DB/fetch call, not bypassable. Four more shapes: (2) const `X_LAUNCH_CERTIFIED: boolean = false` (mcp-observer:23/50, slack-webhook:24/51, teams-observer:24/52, zapier-observer:24/50; 503 in handler.ts e.g. zapier-observer/handler.ts:120,133) - also hardcoded, top-of-serve; (3) 20 functions with an unconditional top-of-handler 503 and dead code below (calendar-integration, call-tracking-webhook, check-number-config, clear-voice-webhooks, ghl-webhook-trigger, inbound-transfer-webhook, phone-number-purchasing, quick-test-call, remove-trunk, retell-agent-management, retell-inbound-webhook, retell-llm-management, retell-phone-management, setup-inbound-calls, setup-lady-jarvis, telnyx-dynamic-vars, twilio-amd-webhook, twilio-inbound-handler, twilio-integration, twilio-tts-audio); (4) env-gated: retell-reconciler is the ONE genuinely env-gated gate (RETELL_RECONCILER_ENABLED, :264/:341, after auth+createClient, run-only) and 5 elite-email/ghl-shadow functions whose 503 is only the catch of buildRuntime() (bypassable by provisioning env); (5) partial/per-action gates that leave the function reachable: call-dispatcher:413 (force_dispatch only), outbound-calling:295 (non-Retell only, provider defaults to retell), telnyx-outbound-ai:133 (make_call only, after a DB read), assistable-make-call:101 (non-health only, after auth). 22 functions are FULLY ungated (ai-sms-processor, api-gateway, automation-scheduler, billing-portal, bulk-lead-import, coach-decide, coach-suggest, credit-management, elite-solar-preflight, mcp, ringba-enrich-proxy, sms-messaging, stripe-webhook, twilio-dtmf-handler, twilio-sms-webhook, twilio-voice-status, twilio-voice-transcription, twilio-voice-twiml, update-lead-info, voice-call, voice-call-action, voice-token) and the ENTIRE functions-live/ tree has zero gates. coach-decide:247 'There is NO 503 certification gate live' is VERIFIED correct for functions-live/disposition-router. Dead/unreachable guards enumerated (all 20 inline-503 tails, plus voice-broadcast-engine:690 and telnyx-scheduled-events:90 which the top gate shadows).

VALIDATION: deterministic node scan (brace-matched helper bodies -> 54/54 exactly `return false;`; serve-vs-503-vs-usage line math for all 109; broadened 503 regex to catch `, 503)`/jsonResponse forms, which surfaced retell-reconciler + demo-*/law-firm/voice-call-events; string-grep on the candidate-ungated set). Counts reconcile: 75 hard-gated + 12 config-only + 22 ungated = 109.

COULD_NOT: enumerate main-vs-live divergence for all 12 live slugs (only disposition-router diffed); no live API check (functions-live is a 10/29-11/02 snapshot); no config.toml verify_jwt read; did not inspect src/lib/mcp/index.ts.

CONFIDENCE: high.

## Artifact

**Findings**

LAUNCH-QUARANTINE (503) MECHANISM - C:/Users/charl/dial-smart-system, @2026-11-04. TWO parallel trees: supabase/functions/ (109 dirs with index.ts = GitHub main, CARRIES the gates) and supabase/functions-live/ (12 index.ts = byte-exact LIVE snapshots, ZERO gates). functions-live/README.md:9-10 and :79-80: gates exist only on main, never deployed. Verified: functions/disposition-router has the helper + 1x status:503 (871 lines); functions-live/disposition-router has neither (699 lines).

FIVE SHAPES:
(1) HELPER SHAPE (the pattern named in the task): `function is<X>Certified(): boolean { return false; }` + `if (!is<X>Certified()) return Response(json {success:false,disabled:true,error_code:'<X>_NOT_CERTIFIED'},{status:503})`. 54 helpers across 51 functions; EVERY body is literally `return false;` -> (i) HARDCODED FALSE (not env-gated, not config-gated). Guard sits at the very top of serve() right after the OPTIONS preflight, before any Deno.env.get/createClient/fetch -> runs BEFORE egress. Not bypassable without a code edit. (Caution: outline 'symbol ranges' for some helpers span 1000+ lines but the real brace-matched body is 2 lines.)
(2) CONST SHAPE: `const <X>_OBSERVER_LAUNCH_CERTIFIED: boolean = false;` + `if (!CONST) return <x>DisabledResponse();` at top of serve. 4 functions (mcp-observer:23/50, slack-webhook:24/51, teams-observer:24/52, zapier-observer:24/50); 503 lives in same-dir handler.ts (e.g. zapier-observer/handler.ts:120,:133 jsonResponse(503,...) Retry-After 3600). Source comments: 'no environment flag can unlock it'. HARDCODED FALSE, before egress, not bypassable.
(3) INLINE HARD-503: no helper; unconditional literal 503 returned right after OPTIONS; rest of handler is DEAD CODE. 20 functions: calendar-integration:43-51, call-tracking-webhook:134-142, check-number-config:13-21, clear-voice-webhooks:13-21, ghl-webhook-trigger:88-96, inbound-transfer-webhook:126-134, phone-number-purchasing:36-42, quick-test-call:16-22, remove-trunk:14-20, retell-agent-management:44-50, retell-inbound-webhook:43-49, retell-llm-management:22-28, retell-phone-management:28-34, setup-inbound-calls:14-20, setup-lady-jarvis:102-108, telnyx-dynamic-vars:26-32, twilio-amd-webhook:32-38, twilio-inbound-handler:16-19, twilio-integration:34-40, twilio-tts-audio:42-49. Unconditional, before egress, not bypassable.
(4) ENV-GATED / CONFIG-CONDITIONAL 503s (not hard launch gates): (a) retell-reconciler is the ONE genuinely env-gated gate: retell-reconciler/index.ts:264 `enabled = (Deno.env.get('RETELL_RECONCILER_ENABLED')||'false')...==='true'`, :341 `if (!enabled) ...503` -> BYPASSABLE by setting the env var; reached only for action==='run' AFTER auth (:275-280), AFTER createClient (:283), and after the health_check/requeue branches. (b) elite-email-mailgun-events :96-106, elite-email-release-preparation :94, elite-email-release-registration :103, elite-email-release-status :89-103, ghl-shadow-ingest :136-146 return 503 from the CATCH of `try { runtime ||= buildRuntime(); ... }`; throws only when required env is absent -> BYPASSABLE by provisioning env, and egress (RPC) happens INSIDE the try. (c) non-certification config/operational 503s: demo-call:231,306,313; demo-funnel-track:79; demo-scrape-website:116; law-firm-beta-submit:50; voice-call-events:219.
(5) PER-ACTION / PARTIAL gates (function still reachable): telnyx-outbound-ai:133 (after auth + resolveExactOrganization DB read; only action==='make_call'); call-dispatcher:413 (only inside force_dispatch branch, after auth+body; main dispatch + cleanup actions NOT gated); outbound-calling:295 (only create_call with provider!=='retell'; provider defaults 'retell' at :283 so the normal path bypasses it; after authorizeOrganizationContext at :290); assistable-make-call:101 (hardcoded-false but only for non-health actions and only AFTER env reads, auth, and body parse; health_check returns 200 at :86-95 first); voice-broadcast-engine:690 and telnyx-scheduled-events:90 are per-action 503s that are DEAD CODE because the top-of-serve hard gates (:647, :51) already 503 everything. retell-call-webhook: helper isRetellAnalysisAutomationCertified (def :82, used :1403 as a sub-feature toggle), NO main-path gate; :574/:580 are config checks (signature enforcement off / signing key unset).

UNREACHABLE / DEAD-CODE after the unconditional top-of-handler 503: calendar-integration:53+, call-tracking-webhook:144+, check-number-config:23+, clear-voice-webhooks:38+, ghl-webhook-trigger:98+, inbound-transfer-webhook:136+, phone-number-purchasing:44+, quick-test-call:24+, remove-trunk:22+, retell-agent-management:52+, retell-inbound-webhook:51+, retell-llm-management:30+, retell-phone-management:36+, setup-inbound-calls:22+, setup-lady-jarvis:110+, telnyx-dynamic-vars:34+, twilio-amd-webhook:40+, twilio-inbound-handler:21+, twilio-integration:42+, twilio-tts-audio:51+. Also dead: voice-broadcast-engine:690, telnyx-scheduled-events:90.

COACH-DECIDE COMMENT VERIFIED: coach-decide/index.ts:247 'There is NO 503 certification gate live' refers to functions-live/disposition-router and is CORRECT (functions-live/disposition-router/index.ts has neither helper nor 503, while functions/disposition-router/index.ts does). coach-decide itself has no gate (its only '503' string is that comment).

FULL LISTS: (A) 51 helper-gated functions: advanced-spam-detection, ai-assistant, ai-assistant-config, ai-autonomous-engine, ai-brain, ai-configuration-complete, ai-error-analyzer, ai-workflow-generator, airtable-sync, analyze-call-transcript, assistable-make-call, autonomous-prioritization, backfill-call-agent-data, budget-tracker, call-dispatcher, campaign-health-monitor, demo-sms-reply, disposition-router, elevenlabs-tts, email-sender, enhanced-rotation-manager, enhanced-spam-lookup, generate-daily-report, ghl-batch-callback, ghl-integration, ml-learning-engine, nudge-scheduler, outbound-calling, pipeline-management, predictive-dialing-engine, provider-management, reachability-scoring, retell-business-verification, retell-call-webhook, retell-cost-backfill, retell-force-webhook, scheduled-spam-check, spam-detection, system-health-monitor, telnyx-ai-assistant, telnyx-insights, telnyx-knowledge-base, telnyx-scheduled-events, telnyx-webhook, test-workflow, validate-phone-numbers, voice-broadcast-engine, voice-broadcast-queue, voice-broadcast-tts, workflow-executor, yellowstone-integration. (B) 4 const-gated: mcp-observer, slack-webhook, teams-observer, zapier-observer. (C) 20 inline hard-503: listed in shape 3. (D) 22 FULLY UNGATED (no 503 gate at all): ai-sms-processor, api-gateway, automation-scheduler, billing-portal, bulk-lead-import, coach-decide, coach-suggest, credit-management, elite-solar-preflight, mcp, ringba-enrich-proxy, sms-messaging, stripe-webhook, twilio-dtmf-handler, twilio-sms-webhook, twilio-voice-status, twilio-voice-transcription, twilio-voice-twiml, update-lead-info, voice-call, voice-call-action, voice-token. (E) 12 with only config/conditional 503s (not hard gates): demo-call, demo-funnel-track, demo-scrape-website, elite-email-mailgun-events, elite-email-release-preparation, elite-email-release-registration, elite-email-release-status, ghl-shadow-ingest, law-firm-beta-submit, retell-reconciler, telnyx-outbound-ai, voice-call-events. Counts: 51+4+20=75 hard-gated; 12 config-only; 22 ungated; 109 total. PLUS the whole functions-live/ tree (12 index.ts incl. disposition-router, outbound-calling, call-dispatcher, telnyx-webhook, workflow-executor, retell-call-webhook, pipeline-management, api-gateway, sms-messaging, twilio-sms-webhook, ai-sms-processor, stripe-webhook) has ZERO gates.

**evidence**

- supabase/functions/advanced-spam-detection/index.ts:10-12 helper `return false;`; :29 guard `if (!isAdvancedSpamAnalysisCertified())`; :36 `status: 503`; :42 `Deno.env.get` after guard
- supabase/functions/ai-brain/index.ts:10-12 helper return false; :4652 guard; :4662 status:503; :4666 try after guard
- supabase/functions/workflow-executor/index.ts:34-37 helper return false; :220 guard; :227 status:503; :233 env after guard
- supabase/functions/ai-autonomous-engine/index.ts:5498-5500 helper; :5511 guard; :5518 status:503; :5524 env after guard
- supabase/functions/telnyx-webhook/index.ts:172-174 helper; :185 guard; :192 status:503; :198 env after guard
- supabase/functions/ai-assistant/index.ts:2878-2880 helper; :2891 guard; :2898 status:503; :2903 try after guard
- supabase/functions/call-dispatcher/index.ts:15-25 three helpers all `return false;`; :409 `if (action==='force_dispatch')`; :413 guard; :420 status:503; :640 `if (isCallbackAutomationCertified())` feature toggle
- supabase/functions/outbound-calling/index.ts:283 provider default 'retell'; :290 authorizeOrganizationContext; :295 `if (action==='create_call' && provider!=='retell')`; :302 status:503
- supabase/functions/assistable-make-call/index.ts:21-23 helper return false; :49 createClient; :62 await req.json(); :86-95 health_check 200; :101 guard; :108 status:503
- supabase/functions/telnyx-outbound-ai/index.ts:107 body parse; :127 resolveExactOrganization DB read; :133 `if (action==='make_call')`; :140 status:503
- supabase/functions/retell-reconciler/index.ts:264 `const enabled = (Deno.env.get('RETELL_RECONCILER_ENABLED') || 'false')...==='true'`; :275-280 auth; :283 createClient; :341 `if (!enabled) ...503`
- supabase/functions/mcp-observer/index.ts:23 `const MCP_OBSERVER_LAUNCH_CERTIFIED: boolean = false;`; :50 guard; handler.ts:32 mcpObserverDisabledResponse
- supabase/functions/slack-webhook/index.ts:24 const false; :51 guard; handler.ts:77 slackObserverDisabledResponse
- supabase/functions/zapier-observer/handler.ts:120 and :133 `jsonResponse(503, {...}, {"Retry-After":"3600"})`
- supabase/functions/calendar-integration/index.ts:38 serve; :43-51 unconditional 503; :53 try = dead code
- supabase/functions/twilio-tts-audio/index.ts:42-49 unconditional 503; :76 second 503 dead
- supabase/functions/elite-email-mailgun-events/index.ts:16-31 unavailable(); :96-106 try/catch to 503 only when buildRuntime throws
- supabase/functions/ghl-shadow-ingest/index.ts:23-42 unavailable(); :136-146 try/catch to 503 only when buildRuntime throws
- supabase/functions/voice-broadcast-engine/index.ts:647 top gate status:503 at :654; :690 inner per-action 503 dead
- supabase/functions/telnyx-scheduled-events/index.ts:51 top gate status:503 at :53; :90 inner per-action 503 dead
- supabase/functions/retell-call-webhook/index.ts:82 helper used at :1403 sub-feature; :574/:580 config 503s; no main-path gate
- supabase/functions/coach-decide/index.ts:247 comment-only 'There is NO 503 certification gate live' - verified true for functions-live/disposition-router
- supabase/functions-live/README.md:9-10 gates are main-only; :79-80 gates never on live
- scan compare: functions/disposition-router/index.ts helper=true status503=1 lines=871; functions-live/disposition-router/index.ts helper=false status503=0 lines=699
- supabase/functions/mcp/index.ts:8 thin Deno.serve(createSupabaseHandler(...)) - no gate

**validation**

Scripted, reproducible scan over supabase/functions (109 index.ts) and supabase/functions-live (12 index.ts): (a) regex-extracted every `function *Certified*(...): boolean {` def and brace-matched its body -> 54/54 bodies normalize to exactly `return false;`, then spot-read ~20 files to confirm. (b) computed serve() line vs first status:503 line vs helper-usage line for all 109 to separate top-of-handler gates from buried/conditional ones. (c) broadened the 503 regex to `, 503)` / jsonResponse(...503) which surfaced retell-reconciler, demo-*, law-firm-beta-submit, voice-call-events that a `status: 503`-only scan misses. (d) string-grepped the candidate-ungated set for 503/NOT_CERTIFIED/quarantine/disabled to confirm absence. Counts reconcile exactly (75+12+22=109).

**open_questions**

- Is any function other than the 5 re-snapshotted on 2026-11-02 actually redeployed since the 2026-07-01 bulk deploy, which would change what is live today?
- Does supabase/config.toml set verify_jwt=false for any of the 22 ungated functions (raising live exposure)?
- What is the plan/ticket to reconcile main (75 gated functions) with live (0 gates) - is the quarantine meant to ship, or be reverted?
- Does src/lib/mcp/index.ts add auth that compensates for mcp/index.ts having no 503 gate?

**what_i_did_not_check**

- Did not open all 109 files line-by-line; helper bodies and gate placement were classified by script (brace-matched bodies + serve/503/usage line math) and spot-verified by reading ~20 files.
- Did not read each function's supabase/config.toml verify_jwt setting, which changes who can reach an ungated handler.
- Did not verify what is ACTUALLY deployed today via the Supabase API; functions-live/ is a snapshot dated 2026-10-29/11-02, so anything deployed since is unknown.
- Did not inspect src/lib/mcp/index.ts (the mcp function delegates to it) for a gate.
- Did not diff functions/ vs functions-live/ for the other 8 live slugs to enumerate every main-vs-live divergence.
- Did not check whether supabase/functions/_shared/*.ts (e.g. retell-provider-contract.assertRetellLaunchAgentConfiguration) throws before egress inside the ungated live paths.
- Did not test any endpoint; this is purely static reading.

**confidence**: high