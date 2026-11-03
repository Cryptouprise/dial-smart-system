# dialpath-outbound-config

- status: completed
- tldr: First outbound call is Retell-only; dies on missing callerId (400 :332) or agentId (500 :343), plus retell_phone_id/owned-rows and Retell-account checks.

DONE: Day-one outbound call provider-config trace (repo C:/Users/charl/dial-smart-system).

PROVIDER: Retell only. outbound-calling:283 defaults provider='retell'; :295-305 hard-blocks any non-retell create_call (503 PROVIDER_EGRESS_NOT_CERTIFIED). call-dispatcher:1612-1671/1753-1782 blocks telnyx+assistable; resolveRouting() only consulted for 'both' mode.

REQUIRED-but-possibly-missing, ranked:
S1 callerId (outbound-calling:332-341 400 MISSING_CALLER_ID; must be active+E.164+rotation_enabled+not spam+retell_phone_id set at 460-492) and agentId (:343-345; must be owned active retell_agents row :510-521).
S2 Retell account must actually hold the number (:1422-1451; 404 throw at 1445); RETELL_AI_API_KEY env (:308-312).
S3 campaign active + provider/agent match (:379-384).
S4 org context (:356), live agent/LLM certification (:885-916), credits (~:950-1022).

EXACT DEATH LINES: missing callerId/phone -> :332-341 (400, clear); missing agent -> :343-345 (500); caller not owned/active -> :469-471; caller not retell-registered -> :490-492; caller absent in Retell -> :1445; agent not owned -> :519-521.

CLEAR vs SILENT: thrown errors -> terminal catch :2237-2243 (HTTP 500 {error}). Dispatcher extracts real message (call-dispatcher:1966); UI path (usePredictiveDialing:704-712) does NOT read error.context -> 500 text may surface generically (THEORY). Genuinely silent to the rep: dispatcher missing-agent (1786-1839) and no-numbers (1914-1926) only log+alert+mark queue failed, no UI.

VALIDATION: read exact cited lines; verified dispatcher callerId shape at 1928-1929 is valid (row.number), not a bug. Did not execute tests or run the function.

BLOCKERS/FOLLOW-UPS: none blocking. Confidence medium (honest): live DB state and supabase-js error semantics unverified. what_i_did_not_check lists 7 items (retell-phone-management import path, supabase-js version, dispatcher retry tail, org onboarding, UI callerId source, twilio/telnyx internals) — critique gate can convert these to nodes.

## Artifact

**Findings**

FIRST-CALL PROVIDER SELECTION: (1) outbound-calling/index.ts:283 provider = requestedProvider || 'retell' — default is Retell. (2) outbound-calling/index.ts:295-305: ANY create_call with provider!=='retell' is hard-blocked → HTTP 503, error_code PROVIDER_EGRESS_NOT_CERTIFIED, 'Only Retell outbound calling is enabled in the certified launch profile.' So Telnyx/Assistable are dead-on-arrival at the edge function. (3) call-dispatcher/index.ts:1612 campaign.provider||'retell'; resolveRouting() is consulted ONLY in 'both' mode (1630-1642); telnyx blocked 1646-1671; assistable blocked 1753-1782. Net: Retell is the only live outbound provider everywhere.

REQUIRED-BUT-MISSING CONFIG FOR A NEW CUSTOMER (ranked):
S1 callerId — outbound-calling:332-341 returns HTTP 400 MISSING_CALLER_ID (only explicit 400 + hint). It must be an ACTIVE owned phone_numbers row (460-471), canonical E.164 (473-475), rotation_enabled===true (476-478), not is_spam/quarantined (479-484), AND retell_phone_id non-null (490-492 'Caller ID is not registered for Retell'). UI test path resolves it last: testCallUtils.ts:32-41 keeps only rows with retell_phone_id; null → clear 'No active ... numbers found' at 151-156 BEFORE the invoke.
S1 agentId — outbound-calling:343-345 throw 'Agent ID is required for Retell calls' → 500; must be a retell_agents row owned+active (510-521 'Retell agent is not active or is not owned by the authenticated tenant'). usePredictiveDialing.ts:686-688 pre-checks campaign.agent_id → 'Campaign must have an agent assigned'.
S2 provider-side — number must actually exist in the Retell ACCOUNT: outbound-calling:1422-1451 GET /get-phone-number/{callerId}; 404 → call log failed + throw at 1445 'Phone number ... is not registered in Retell AI ...'. RETELL_AI_API_KEY env missing → outbound-calling:308-312 throw (platform config).
S3 campaign config — campaign must be active (outbound-calling:379 'Campaign is not active'); provider must match (381); Retell agent must equal campaign agent (383-384).
S4 governance/billing — organization context required (356); Retell live-agent/LLM certification (885-916 RETELL_AGENT_NOT_CERTIFIED); credit balance/insufficient credits (~950-1022, clear message).

SILENT VS CLEAR: thrown errors surface via the terminal catch outbound-calling:2237-2243 as HTTP 500 {error: message}. Dispatcher parses the real body (call-dispatcher:1966 error.context.json()); the UI path (usePredictiveDialing.ts:704-712) does NOT read error.context, so precise 500 strings may degrade to a generic non-2xx message (THEORY pending supabase-js behavior). GENUINELY SILENT to the rep: dispatcher missing-agent path (call-dispatcher:1786-1839) and no-valid-numbers path (1914-1926) only log to edge_function_errors / raiseAlert and mark the queue row failed — no UI/toast; campaigns simply stop dialing.

**evidence**

- outbound-calling/index.ts:283
- outbound-calling/index.ts:295-305
- outbound-calling/index.ts:308-316
- outbound-calling/index.ts:332-345
- outbound-calling/index.ts:356
- outbound-calling/index.ts:379-384
- outbound-calling/index.ts:460-492
- outbound-calling/index.ts:510-527
- outbound-calling/index.ts:558-582
- outbound-calling/index.ts:885-916
- outbound-calling/index.ts:950-1022
- outbound-calling/index.ts:1422-1451
- outbound-calling/index.ts:2237-2243
- call-dispatcher/index.ts:1612-1671
- call-dispatcher/index.ts:1753-1782
- call-dispatcher/index.ts:1786-1839
- call-dispatcher/index.ts:1887-1929
- call-dispatcher/index.ts:1914-1926
- call-dispatcher/index.ts:1955-1973
- provider-router.ts:64-89,102-145
- provider-router.test.ts:51-55
- usePredictiveDialing.ts:686-712
- testCallUtils.ts:28-64,147-179
- voice-provider.ts (twilio/telnyx only for browser phone, not outbound)

**validation**

Read exact source at the cited lines for every claim (no guessing). Cross-checked the dispatcher callerId shape: scoredNumbers elements are {number:<row>,...} (call-dispatcher:1887-1899), so callerId=selectedNumber.number at 1929 is a valid string — confirmed NOT a bug. Did NOT execute deno tests or run the edge function.

**open_questions**

- Can a phone_numbers row carry retell_phone_id without the number actually existing in the Retell account (i.e. does retell-phone-management verify on import)? If yes, a new customer can pass the DB gate at 490 but still die at 1445.
- Does the deployed supabase-js version surface the 500 body text in error.message for the UI path, or only a generic non-2xx string?
- For a truly empty new org, which UI entry fires first (test call vs predictive dialing) and does it hard-stop with a message or silently no-op?

**what_i_did_not_check**

- Live DB state: whether a fresh org actually has phone_numbers/retell_agents/active campaign rows.
- Full retell-phone-management import/sync flow (whether retell_phone_id can be set without Retell-side existence).
- supabase-js version semantics for error.message on non-2xx (UI-surfacing claim is THEORY).
- call-dispatcher retry/catch tail (2018-2160) and how failed queue rows are surfaced on the rep dashboard.
- authorizeOrganizationContext / tenant-context.ts internals and org onboarding.
- Which component supplies callerId to usePredictiveDialing.makeCall, and AgentEditDialog.startTestCall / CallSimulator specifics.
- twilio.ts / telnyx.ts credential paths beyond the hard-disable gate (browser-phone only).

**confidence**: medium