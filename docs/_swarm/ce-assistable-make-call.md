# ce-assistable-make-call

- status: completed
- tldr: assistable-make-call: real Assistable egress at :147 but HARD-OFF (gate false :21, 503 :101-111); JWT-auth in-function, no config entry; zero consent/DNC/hours/credit gates.

ce-assistable-make-call — DONE (confidence: high).

ANSWER
- Triggers outbound call? YES in code, but HARD-DISABLED at rest. Wraps only Assistable (no Retell/Telnyx).
- Egress line: index.ts:147-154 -> fetch(ASSISTABLE_API_URL) where ASSISTABLE_API_URL='https://api.assistable.ai/v2/ghl/make-call' [const :19].
- Guard: index.ts:21-23 isAssistableEgressCertified()==false; index.ts:101-111 returns 503 ASSISTABLE_EGRESS_NOT_CERTIFIED for every non-health action, BEFORE the fetch. Only pre-gate action is health_check (:86-95, no egress).
- Auth: in-function, header required (:52-58 -> 401), dual-mode: exact service-role key + body.user_id (:64-71) OR valid user JWT via getUser (:73-80).
- Browser-reachable? config.toml has NO [functions.assistable-make-call] block (grep 'assistable' in supabase/config.toml = 0). Unlisted => Supabase default verify_jwt=true, and handler re-checks auth. Callable with a valid user JWT (src/lib/testCallUtils.ts:114), not anonymously.
- Bypass gates? Conditional. Zero consent/DNC/calling-hours/credit/launch-lock checks exist in this file between auth and fetch. If the hardcoded false at :22 were flipped, it would dial with NO safety/budget gate. Today that false is the only thing preventing live calls.

VALIDATION: read full index.ts (213 lines) + full config.toml (449 lines); repo-wide grep 'assistable-make-call' (55 hits/20 files) + scoped grep in config.toml (0 hits). Matches 3 prior in-repo artifacts (docs/_swarm/ai-vendors-truth.md, docs/_swarm/arch-c-registry.md, docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:22). No files modified.

BLOCKERS: none.
FOLLOW-UPS (via what_i_did_not_check): deployed-runtime verify_jwt vs config.toml; whether upstream callers (workflow-executor main :34-37 gate, call-dispatcher live :1547) can reach this function via a non-gated path; existence of an un-gated functions-live/assistable-make-call copy; the 'canonical outbound provider boundary' referenced in the 503 text.

## Artifact

**Findings**

FACT — assistable-make-call/index.ts IS a real outbound-call egress wrapper, but egress is HARD-DISABLED by a fail-closed gate, so at rest it triggers NO call.

1) EGRESS EXISTS (Assistable only; no Retell/Telnyx here).
   Provider URL const: index.ts:19  const ASSISTABLE_API_URL = 'https://api.assistable.ai/v2/ghl/make-call';
   The egress line: index.ts:147-154
     const response = await fetch(ASSISTABLE_API_URL, {
       method: 'POST',
       headers: { 'Authorization': `Bearer ${assistableApiKey}`, 'Content-Type': 'application/json' },
       body: JSON.stringify(callBody),  // {assistant_id, location_id, contact_id, [number_pool_id]}
     });
   It calls the Assistable v2 GHL-Safe make-call API only. No Retell or Telnyx path in this file.

2) GUARD = FAIL-CLOSED QUARANTINE (this is why no call fires today).
   Gate constant: index.ts:21-23  function isAssistableEgressCertified(): boolean { return false; }
   Guard/short-circuit: index.ts:101-111
     if (!isAssistableEgressCertified()) {
       return new Response(JSON.stringify({ success:false, disabled:true,
         error_code:'ASSISTABLE_EGRESS_NOT_CERTIFIED',
         error:'Standalone Assistable calling is disabled until it uses the canonical outbound provider boundary.' }),
         { status: 503, headers: {...corsHeaders,'Content-Type':'application/json'} });
     }
   Every non-health action returns 503 BEFORE the fetch. The only pre-gate action is action==='health_check' (:86-95), which returns a static JSON blob and never touches the provider. Net: egress is dead unless the hardcoded `false` at :22 is edited.

3) AUTH = in-function, dual-mode (NOT platform verify_jwt).
   Header required: index.ts:52-58 -> 401 'Missing authorization header' if absent.
   Service-branch: index.ts:64-71  if (token === supabaseServiceKey) { if(!body.user_id) 400; userId = body.user_id; }  (trusts caller-supplied user_id)
   User-branch:    index.ts:73-80  else supabase.auth.getUser(token); 401 'Invalid authentication token' on error/no user; userId = user.id.
   So it accepts EITHER the exact service-role key (with a body.user_id) OR a valid Supabase user JWT.

4) BROWSER-REACHABILITY.
   config.toml contains NO [functions.assistable-make-call] block (grep 'assistable' in supabase/config.toml = 0 matches; the file has 449 lines covering ~60 other functions). Unlisted functions take the Supabase default verify_jwt = true. So the public anon key alone cannot reach it: platform returns 401 pre-execution, and even past that the handler's own :52-58/:73-80 auth rejects a missing/invalid token. It is browser-CALLABLE in the sense that a page holding a valid user JWT (e.g. src/lib/testCallUtils.ts:114 calls it via supabase.functions.invoke) can invoke it, but not anonymously.

5) GATE-BYPASS ANALYSIS — conditional, not currently exploitable.
   Within this file there are ZERO consent, DNC/do-not-call, calling-hours/timezone, credit-balance, dedup, or launch-lock checks. Route after passing auth is: param validation (assistant_id/location_id/contact_id at :113-132) -> console.log (:134) -> build body (:137-144) -> fetch (:147). Nothing in between consults any safety or budget gate. So IF isAssistableEgressCertified() were flipped to true, this function would place a live provider call with no consent/DNC/calling-hours/credit/launch-lock enforcement whatsoever. The ONLY thing preventing that today is the hardcoded `false` at :22. Post-call it merely inserts a call_logs row (:178-194, non-blocking, silently swallows errors and does not fail the call).

**evidence**

- supabase/functions/assistable-make-call/index.ts:19 (ASSISTABLE_API_URL const)
- supabase/functions/assistable-make-call/index.ts:21-23 (isAssistableEgressCertified -> false)
- supabase/functions/assistable-make-call/index.ts:101-111 (503 ASSISTABLE_EGRESS_NOT_CERTIFIED guard)
- supabase/functions/assistable-make-call/index.ts:147-154 (fetch egress line)
- supabase/functions/assistable-make-call/index.ts:52-58 / 64-71 / 73-80 (auth: header required, service-role branch, user-JWT branch)
- supabase/functions/assistable-make-call/index.ts:86-95 (health_check returns pre-gate, no egress)
- supabase/functions/assistable-make-call/index.ts:178-194 (post-call non-blocking call_logs insert)
- supabase/config.toml:1-449 (no [functions.assistable-make-call] block; grep 'assistable' = 0 matches)
- docs/_swarm/arch-c-registry.md:19 (assistable-make-call listed among 19 function dirs absent from config.toml)
- docs:wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:22 (assistable-make-call: ASSISTABLE_EGRESS_NOT_CERTIFIED@105)
- src/lib/testCallUtils.ts:114 (frontend functions.invoke('assistable-make-call'))
- supabase/functions/workflow-executor/index.ts:1677-1678 and supabase/functions-live/workflow-executor/index.ts:978-979 (workflow-executor fetches this function)
- supabase/functions-live/call-dispatcher/functions/call-dispatcher/index.ts:1526,1547 (call-dispatcher invokes this function)

**validation**

Read the full target file (213 lines) and the full supabase/config.toml (449 lines) directly. Cross-checked with two greps: repo-wide grep 'assistable-make-call' (55 matches/20 files, confirming callers and the config absence) and a scoped grep 'assistable' inside config.toml (0 matches). Findings match three independent prior artifacts in-repo (docs/_swarm/ai-vendors-truth.md, docs/_swarm/arch-c-registry.md, docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md), which corroborate the gate line, egress URL, and config absence. No files modified (research-only).

**open_questions**

- Supabase deploys may use a dashboard-side verify_jwt setting that can diverge from config.toml; runtime verify_jwt for the DEPLOYED function was not confirmed against the live project (emonjusymdripmkvtttc) API.
- Workflow-executor (main, gated by isWorkflowAutomationCertified at index.ts:34-37) and call-dispatcher are upstream callers; whether their own gates independently block reaching this function was not verified in this node.
- Whether the canonical outbound boundary the error text references ('canonical outbound provider boundary') exists and is reachable via a different function was not traced.

**what_i_did_not_check**

- Deployed-runtime verify_jwt for assistable-make-call on the live Supabase project (only config.toml + handler-supplied auth were inspected)
- The upstream callers' own gates (workflow-executor main :34-37 gate, call-dispatcher) and whether they can reach this function through a non-gated path
- Whether any other live copy of this function exists outside supabase/functions/ and supabase/functions-live/ (e.g. an un-gated functions-live/assistable-make-call variant)
- Presence/definition of the 'canonical outbound provider boundary' function referenced in the 503 error text
- The live DB call_logs insert behavior and whether call_logs has org/tenant scoping

**confidence**: high