# ce-quick-test-call

- status: completed
- tldr: quick-test-call is inert: always 503 (index.ts:22), edge-only auth (config.toml:6), 2 UI callers, no possible egress.

ce-quick-test-call DONE (atomic). ANSWER: No - it cannot place a call. quick-test-call/index.ts is import-free, has zero I/O, and returns one unconditional response. 503 launch-quarantine path = index.ts:22 (status: 503), body index.ts:16-21, error_code 'TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED' at index.ts:19; only early return is the OPTIONS preflight at index.ts:14. Auth requirement = platform edge only: supabase/config.toml:3 [functions.quick-test-call], config.toml:6 verify_jwt = true; there is NO in-function auth (no getUser, no api-auth import, no service-role compare, no Authorization read). Callers = exactly two, both browser UI: src/components/CallSimulator.tsx:832 (gated by LIVE_CALL_CERTIFICATION_ENABLED = false at :68, enforced :808-811, button disabled :1293) and src/components/QuickTestBroadcast.tsx:102 (no cert flag; form validation only :89-97, disabled button :335; rendered unconditionally at VoiceBroadcastManager.tsx:690). No server/cron/webhook/dashboard caller exists. Egress without consent/DNC/hours/credit: NO - the handler does no I/O, so those checks are moot rather than skipped.

## Artifact

**Findings**

NO - it does not place a call on demand. The handler is a 25-line, import-free file with zero side effects (no Twilio/Telnyx/Retell client, no fetch, no DB/service-role access). Deno.serve (index.ts:13) returns one unconditional Response (index.ts:16-24); the only branch is the OPTIONS preflight (index.ts:14), so every other method/body receives the same 503. LAUNCH-QUARANTINE (503) code path = index.ts:22 `status: 503`, with body index.ts:16-21 (`success:false, disabled:true`, error_code 'TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED' at index.ts:19, message at index.ts:20); the comment index.ts:6-12 explains the legacy Twilio path egressed outside the canonical contact-safety/billing/reconciliation boundary. No code path reaches a provider. AUTH REQUIREMENT = platform-edge only: supabase/config.toml:3 `[functions.quick-test-call]` with config.toml:6 `verify_jwt = true` (comment config.toml:4-5). The function body has NO in-function auth: no supabase.auth.getUser, no _shared/api-auth import, no service-role compare, no Authorization header read (whole file 1-25). CALLERS = exactly two, both browser UI: (1) src/components/CallSimulator.tsx:832 inside runCallTests, gated by `const LIVE_CALL_CERTIFICATION_ENABLED = false` (CallSimulator.tsx:68) enforced at :808-811 with the button disabled at :1293; its other 7 invoke sites target other functions (outbound-calling :309/:350, retell-agent-management :114/:703, system-health-monitor :778, predictive-dialing-engine :1068, call-dispatcher :1107). (2) src/components/QuickTestBroadcast.tsx:102 inside handleTestCall, with NO certification gate (only form-field validation :89-97 and disabled button when no fromNumber :335), rendered unconditionally at VoiceBroadcastManager.tsx:690 and CallSimulator at Settings.tsx:576. No server-side, cron, webhook, migration or dashboard caller exists (repo-wide literal grep yields only the two components, two audit scripts and config.toml). EGRESS WITHOUT CONSENT/DNC/HOURS/CREDIT = NO: because the handler performs no I/O, there is no path that bypasses consent, DNC, calling-hours or credit; those checks are moot, not skipped. This is a contained dead endpoint. Repo guards assert the containment: scripts/lib/contact-egress-surface-audit.mjs:70-78 registers id legacy_twilio_test_call as 'hard_disabled' requiring markers TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED and the disable message; scripts/contact-egress-surface-audit.test.mjs:32-59 asserts the audit fails if the marker is stripped; launchSafety.test.ts:257-264 pins the CallSimulator flag. Two independent prior swarm reports agree (docs/_swarm/ce-anon-true-no-getuser.md row 15: 'entire handler inert', in_func_auth=no, priv_side_effect=none; docs/_swarm/sr__dialing__gap-sibling-dialing-functions.md: 'quick-test-call/index.ts:16-24 (disabled)').

**evidence**

- supabase/functions/quick-test-call/index.ts:13 Deno.serve((req) => {
- supabase/functions/quick-test-call/index.ts:14 OPTIONS preflight return
- supabase/functions/quick-test-call/index.ts:16-21 unconditional disabled JSON body
- supabase/functions/quick-test-call/index.ts:19 error_code: 'TWILIO_TEST_CALL_EGRESS_NOT_CERTIFIED'
- supabase/functions/quick-test-call/index.ts:22 status: 503
- supabase/functions/quick-test-call/index.ts:1-25 whole file, no imports and no provider SDK usage
- supabase/config.toml:3 [functions.quick-test-call]
- supabase/config.toml:6 verify_jwt = true
- src/components/CallSimulator.tsx:832 supabase.functions.invoke('quick-test-call', {
- src/components/CallSimulator.tsx:68 const LIVE_CALL_CERTIFICATION_ENABLED = false;
- src/components/CallSimulator.tsx:808-811 early return 'Batch live-call tests are locked...'
- src/components/CallSimulator.tsx:1293 disabled={!LIVE_CALL_CERTIFICATION_ENABLED || isRunningCalls || !callerNumber}
- src/components/QuickTestBroadcast.tsx:102 supabase.functions.invoke('quick-test-call', {
- src/components/QuickTestBroadcast.tsx:89-97 form-field validation only, no cert gate
- src/components/QuickTestBroadcast.tsx:335 disabled={isCalling || !formData.fromNumber}
- src/components/VoiceBroadcastManager.tsx:690 <QuickTestBroadcast />
- src/pages/Settings.tsx:576 <CallSimulator />
- scripts/lib/contact-egress-surface-audit.mjs:70-78 legacy_twilio_test_call state 'hard_disabled'
- scripts/contact-egress-surface-audit.test.mjs:41 and :57-59 marker-removal regression
- src/lib/__tests__/launchSafety.test.ts:261 asserts LIVE_CALL_CERTIFICATION_ENABLED = false

**validation**

Read the full target file (25 lines; all lines cited). Read the exact config.toml block (lines 1-20). Enumerated every repo reference to the literal 'quick-test-call' via two independent methods (agentgrep with a code-file glob; per-file reads of both hit components), confirming only two code callers plus the config entry and two audit scripts, and no dynamically built function name. Read both caller regions end-to-end (CallSimulator.tsx:807-889, QuickTestBroadcast.tsx:88-119) plus gates/render sites, and enumerated all eight supabase.functions.invoke sites in CallSimulator to prove the others hit different functions. Cross-checked two prior swarm reports reaching the same conclusion. Did not execute the function or run tests (research-only).

**open_questions**

- Does the DEPLOYED live function on Supabase project emonjusymdripmkvtttc match this inert source? Live-vs-main drift is a documented risk class (docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md lists the gate on main) and was not verified.
- Is there a pre-quarantine git revision (or another branch/repo) where quick-test-call still contained a real Twilio placement, and is that revision deployed anywhere?

**edge_cases_considered**

- OPTIONS preflight (index.ts:14) is the only early return; all other methods/verbs fall through to the same 503
- Caller reachable in UI but egress impossible since handler does no I/O

**what_i_did_not_check**

- The live/deployed function body on Supabase (no API or CLI call; conclusion is repo source only).
- Git history and other branches: no diff of the old Twilio implementation, no check for a non-main branch deploying a real caller.
- Callers outside this repo (n8n, GHL workflow, Zapier, scripts in other folders) that might invoke the function by URL.
- Whether QuickTestBroadcast's button is visually exposed in the shipped build (reachability confirmed by source, not by running the app).
- Supabase gateway behavior for verify_jwt=true with an anon key (asserted from config semantics, not tested).

**confidence**: high