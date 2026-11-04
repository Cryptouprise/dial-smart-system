# ce-telnyx-egress

- status: completed
- tldr: Telnyx egress paths all 503-gated on main; only outbound-ai has (bypassable) DNC + credit; consent/hours/global-stop absent.

ce-telnyx-egress COMPLETE. Telnyx functions = ALTERNATE egress path, all hard-503-gated on branch main. (1) Call placement: telnyx-outbound-ai POST /v2/calls at index.ts:307; telnyx-ai-assistant test_call POST /ai/assistants/{id}/calls :1985-1990 + TeXML :2000-2005; telnyx-scheduled-events schedule_call POST /ai/assistants/{id}/scheduled_events :132-147; telnyx-dynamic-vars places NO call. Every path is UNREACHABLE: telnyx-outbound-ai make_call 503 :133-143 (before switch :153); telnyx-ai-assistant whole-surface 503 :228-238 + test_call 503 :281-291; telnyx-scheduled-events whole-surface 503 :51-56 + schedule 503 :90-100; telnyx-dynamic-vars 503 :26-34. (2) Safety: consent ABSENT in all 4; global-stop ABSENT in all 4; calling-hours ABSENT in all 4; credit ONLY in telnyx-outbound-ai (:247-252 check_credit_balance, :270-276 reserve_credits); DNC ONLY in telnyx-outbound-ai and bypassable (only when leadId passed, :209-222; :216), while telnyx-ai-assistant treats do_not_call as a -1000 ranking weight (:1818) not a block. No launch-lock by name; the 503s ARE the containment. (3) Auth/verify_jwt: telnyx-ai-assistant true (config.toml:395-398), telnyx-scheduled-events true (:418-421), telnyx-outbound-ai false (:400-401, in-function auth only), telnyx-dynamic-vars false (:403-406, NO auth check at all). telnyx-outbound-ai has NO in-repo caller; the test-call UI (TelnyxAIManager.tsx:108-138) has no launch-lock guard and relies on the 503.

## Artifact

**Findings**

Q1 — DO ANY PLACE A CALL (api.telnyx.com call endpoints)? YES in code for 3 of 4; ALL call-placement paths are hard-503-gated and therefore UNREACHABLE on branch main. (1) telnyx-outbound-ai/index.ts: YES — telnyxFetch('/calls', apiKey, 'POST', ...) at :307 -> POST https://api.telnyx.com/v2/calls (base const :29; payload :288-313). UNREACHABLE: action==='make_call' returns 503 {error_code:'TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED'} at :133-143, executed BEFORE the action switch (:153). (2) telnyx-ai-assistant/index.ts: YES (test_call) — direct POST /ai/assistants/{id}/calls at :1985-1990; TeXML fallback POST /texml/ai_calls/{id} at :2000-2005. UNREACHABLE two layers: whole-surface gate :228-238 (isTelnyxAssistantManagementTenantCertified() hard-false, defined :79-81) and action==='test_call' 503 {TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED} at :281-291. (3) telnyx-scheduled-events/index.ts: YES indirectly — schedule_call creates POST /ai/assistants/{id}/scheduled_events at :132-147 (Telnyx dials later); schedule_sms analogous :200-215. UNREACHABLE two layers: whole-surface gate :51-56 (isTelnyxScheduledEventSurfaceCertified() hard-false, :42-44) and schedule_call/schedule_sms 503 {TELNYX_SCHEDULED_EGRESS_NOT_CERTIFIED} at :90-100. (4) telnyx-dynamic-vars/index.ts: NO call placement — zero api.telnyx.com calls (no telnyxFetch); it is a Telnyx->us initialization webhook, disabled :26-34 {INBOUND_DYNAMIC_VARS_NOT_CERTIFIED}; code after the 503 is dead.  ||  Q2 — CONSENT / DNC / GLOBAL STOP / CALLING HOURS / CREDIT / LAUNCH LOCK. consent: ABSENT in all four (no 'consent' token). DNC/do_not_call: only telnyx-outbound-ai make_call, conditional+bypassable — the check at :209-222 runs ONLY if leadId is supplied; :216 blocks do_not_call=true and :219 requires destination==lead; omitting leadId skips DNC. telnyx-ai-assistant reads do_not_call at :1772 but uses it ONLY as a -1000 ranking weight (:1818), does NOT block. scheduled-events and dynamic-vars: absent. global stop / contact stop (global_stop|contact_stop|evaluate_contact_stop): ABSENT in all four (findstr exit 1 on scheduled-events). calling hours (calling_hours): ABSENT in all four (that logic lives in outbound-calling/call-dispatcher, not here). credit: only telnyx-outbound-ai make_call — check_credit_balance RPC :247-252 (fail-closed), reserve_credits RPC :270-276, cost 9c/min :257, overdraft -> call_logs 'failed' :259-268; ABSENT in the other three. launch lock (by name): ABSENT in all four — containment is the in-function constant-false 503 gates themselves; frontend src/lib/launchSafety.ts does not cover these Telnyx surfaces. Net: if any 503 gate were flipped, telnyx-outbound-ai make_call would dial with DNC-only (bypassable) + credit; test_call/scheduled-events would dial with NO consent/DNC/stop/hours/credit gate at all.  ||  Q3 — AUTH + BROWSER REACHABILITY (verify_jwt in supabase/config.toml). telnyx-ai-assistant: verify_jwt=true (config.toml:395-398); in-function auth :246-269 (exact serviceRoleKey+user_id :253, else auth.getUser(token) :258). Browser-reachable from TelnyxAIManager.tsx:119 (test_call), :516/:543/:1350; AgentToolBuilder.tsx:982/1029; TelnyxAssistantEditor.tsx. The test-call UI handler TelnyxAIManager.tsx:108-138 has NO launch-lock guard — it invokes test_call directly; only the 503 stops it. telnyx-outbound-ai: verify_jwt=false (config.toml:400-401) — NO platform gate; in-function auth is the sole edge gate: Authorization required :95-100, exact serviceRoleKey branch :103/106-113, else getUser :115-121. NO in-repo caller (repo-wide grep: only CLAUDE.md/DEPLOYMENT_AUDIT/docs mention it; src/ never invokes it). telnyx-dynamic-vars: verify_jwt=false (config.toml:403-406); function performs NO auth check at all (provider webhook) — which is why it is disabled. telnyx-scheduled-events: verify_jwt=true (config.toml:418-421); in-function auth :63-86; UI reaches it only for list_events (:1115) and cancel_event (:1129); schedule_call not UI-wired.  ||  Cross-check: agrees with prior verified docs/_swarm/ai-vendors-truth.md (8 hard-503 Telnyx surfaces incl. these 4) and adds the specific call-placement lines, the credit/DNC presence in telnyx-outbound-ai, the absence of consent/hours/global-stop, and per-function verify_jwt values the prior pass (heads+gate-lines only) did not capture.

**evidence**

- supabase/functions/telnyx-outbound-ai/index.ts:29,133-143,153,209-222,216,219,247-252,257,270-276,292,307,409-413
- supabase/functions/telnyx-ai-assistant/index.ts:79-81,228-238,246-269,258,281-291,1772,1818,1985-1990,2000-2005
- supabase/functions/telnyx-scheduled-events/index.ts:42-44,51-56,63-86,90-100,132-147,200-215
- supabase/functions/telnyx-dynamic-vars/index.ts:26-34,43-53
- supabase/config.toml:395-398,400-401,403-406,418-421
- src/components/TelnyxAIManager.tsx:108-138,1115,1129
- src/components/AgentToolBuilder.tsx:97,982,1029
- src/components/TelnyxAssistantEditor.tsx:136,152,172,384,476,842
- src/lib/testCallUtils.ts:133
- docs/_swarm/ai-vendors-truth.md:10,37,62-65
- docs/_swarm/ce-anon-true-authC-gap-config-verify-jwt.md:4,6,12
- docs/_swarm/ce-anon-true-authC-gap-callers-service-role.md:4,13,31

**validation**

Read all four index.ts bodies end-to-end (447/2197/328/358 lines). Read supabase/config.toml Telnyx block directly. Re-confirmed safety-term presence/absence with agentgrep (regex) AND findstr /n (agentgrep single-file mode has known false-negatives, so findstr used as corroboration). Grepped repo-wide for callers of each function. Cross-checked against prior verified docs/_swarm findings. No function executed, no live API called, no file written.

**open_questions**

- Does the DEPLOYED/live bundle actually carry these 503 gates, or is there main-vs-live divergence (prior report flags 7 never-redeployed functions)?
- Are TELNYX_API_KEY and the check_credit_balance/reserve_credits RPCs present in the deployed project?
- Should these legacy Telnyx AI surfaces be deleted rather than merely 503-gated (they duplicate the canonical outbound boundary)?

**edge_cases_considered**

- telnyx-outbound-ai make_call DNC/ownership block (:209-222) runs ONLY when leadId is supplied; omitting leadId skips DNC entirely.
- telnyx-ai-assistant do_not_call (:1772) is a -1000 ranking weight (:1818), NOT a block.
- telnyx-dynamic-vars has no Authorization check and verify_jwt=false, so it would be fully public if its 503 were removed.
- telnyx-outbound-ai make_call 503 (:133) sits AFTER the trusted-userId branch (:103-113), so that branch is reachable while make_call is not.
- All four surface-gate predicates are hard-coded constant-false (no env/config toggle), so only a code edit restores egress.

**what_i_did_not_check**

- Did not verify the deployed functions-live / .deployed-* bundles contain these gates (main-vs-live divergence unverified).
- Did not read telnyx-webhook/index.ts (webhook target at telnyx-outbound-ai:292/312) or telnyx-insights / telnyx-knowledge-base.
- Did not inspect the canonical outbound-calling Telnyx path these are meant to route through.
- Did not confirm env secrets (TELNYX_API_KEY etc.) are set in the deployed Supabase project.
- Did not execute any function or call any live API.

**confidence**: high