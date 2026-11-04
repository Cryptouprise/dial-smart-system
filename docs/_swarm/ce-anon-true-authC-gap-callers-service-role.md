# ce-anon-true-authC-gap-callers-service-role

- status: completed
- tldr: No committed caller reaches a trusted-userId branch: 5 of 6 audited fns 503 before auth; telnyx-outbound-ai is reachable but has no in-repo caller.

DONE: Audited every caller (in-repo and committed) of the six service-role-trusting functions and all pg_cron/pg_net invocations, and judged whether any committed caller exercises a trusted-userId branch.

RESULT (CALLER | function | file:line | credential | body_userid):
1) ai-brain | retell-phone-management | supabase/functions/ai-brain/index.ts:2892,2936,2963,3267,3315 | Bearer SUPABASE_SERVICE_ROLE_KEY | body_userid=YES (user_id: userId)
2) ai-brain | retell-agent-management | supabase/functions/ai-brain/index.ts:3035,3130,3220 | Bearer SUPABASE_SERVICE_ROLE_KEY | body_userid=YES (user_id: userId)
3) call-dispatcher | retell-phone-management | supabase/functions/call-dispatcher/index.ts:1285 | Bearer SUPABASE_SERVICE_ROLE_KEY | body_userid=YES (userId: user.id)

VERDICT: No committed caller exercises the trusted-userId branch of the audited functions. retell-phone-management, retell-agent-management, retell-llm-management, telnyx-ai-assistant and telnyx-scheduled-events all return an unconditional 503 BEFORE their auth/trusted-userId branch (retell-phone-management:28-36 vs branch:58-60; retell-agent-management:44-52 vs :66; retell-llm-management:22-30 vs :44; telnyx-ai-assistant gate:228/helper-false:79 vs :253; telnyx-scheduled-events gate:51/helper-false:43 vs :70). So the three service-role callers above hit a 503 and never reach the branch; their userIds are also server-derived (ai-brain auth.getUser:4702; call-dispatcher user.id), i.e. same-principal. telnyx-outbound-ai is the one REACHABLE trusted-userId branch (no gate before auth, verify_jwt=false, make_call 503 is at :133 AFTER the branch :103-113) but NO committed in-repo caller invokes it at all (0 matches in src/ and supabase/functions/), so exposure is a direct external request, not a committed caller.

CRON: 5 net.http_post jobs; none targets the six functions. One DOES pass a service-role bearer: supabase/migrations/20260210_autonomous_engine_upgrade.sql:281-288 -> ai-autonomous-engine with Bearer app.service_role_key. Its target ai-autonomous-engine is itself 503-gated (:5498-5499, gate :5511) and only calls sms-messaging/outbound-calling/ai-sms-processor. The other 4 use anon JWT (role:anon) or Vault cron tokens.

VALIDATION: research-only, no writes/live calls/secrets. Whole-repo greps (six function names, functions/v1/<name>, .functions.invoke(, SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE, Bearer ${serviceRole|supabaseService|SUPABASE_SERVICE_ROLE, net.http_post under migrations, /functions/v1/ under migrations) plus direct region reads of all six audited functions, both service-role callers, ai-autonomous-engine and all five cron migrations. Every claim is file:line.

BLOCKERS/FOLLOW-UPS: (a) Live (supabase/functions-live) gate state not verified, so a deployed-but-ungated copy remains possible; (b) dynamic callEdgeFunction(name)/invoke(varName) indirections could hide an unenumerated caller; (c) whether the legacy 20251204062700 cron and the newer Vault cron are both still scheduled live was not checked. Confidence: high for the committed-code verdict.

## Artifact

**Findings**

CALLER|function|file:line|credential|body_userid (service-role-bearer callers of the audited functions, committed code): (1) ai-brain|retell-phone-management|supabase/functions/ai-brain/index.ts:2892,2936,2963,3267,3315|Bearer SUPABASE_SERVICE_ROLE_KEY|body_userid=YES (user_id: userId). (2) ai-brain|retell-agent-management|supabase/functions/ai-brain/index.ts:3035,3130,3220|Bearer SUPABASE_SERVICE_ROLE_KEY|body_userid=YES (user_id: userId). (3) call-dispatcher|retell-phone-management|supabase/functions/call-dispatcher/index.ts:1285|Bearer SUPABASE_SERVICE_ROLE_KEY (supabaseKey, read :261)|body_userid=YES (userId: user.id, organizationId).

VERDICT: No committed caller exercises the trusted-userId branch of the audited functions. All three service-role callers target a function HARD-503-DISABLED before its trusted-userId branch: retell-phone-management 503 at :28-36 BEFORE branch :58-60; retell-agent-management 503 at :44-52 BEFORE branch :66-68. Both userIds are server-derived/same-principal (ai-brain auth.getUser:4702 or its own internal branch :4694-4700; call-dispatcher user.id), not attacker-controlled. Not cross-tenant.

retell-llm-management, telnyx-ai-assistant, telnyx-scheduled-events: no committed service-role caller at all AND each is hard-503-gated before auth (retell-llm-management :22-30 branch :44-46; telnyx-ai-assistant gate :228, helper false :79-81, branch :253-256; telnyx-scheduled-events gate :51, helper false :43, branch :70-77).

telnyx-outbound-ai is the ONE reachable trusted-userId branch: no gate precedes auth (make_call 503 is at :133-143, AFTER branch :103-113), verify_jwt=false (config.toml:400-401), so an external POST with the service-role bearer + body.userId sets userId=body.userId (:106-113). BUT no committed in-repo caller invokes telnyx-outbound-ai (0 in src/, 0 in supabase/functions/; only docs/config.toml/audit scripts). Exposure is a direct external request, not a committed caller.

pg_cron/pg_net (supabase/migrations, net.http_post): 5 jobs, NONE targets any of the six audited functions. (a) 20251204062700:15-19 -> automation-scheduler, Bearer anon JWT (legacy). (b) 20260210_autonomous_engine_upgrade:281-288 -> ai-autonomous-engine, Bearer app.service_role_key (SERVICE-ROLE-BEARER CRON, target not an audited function). (c) 20260703224351:214-218 -> campaign-health-monitor, Bearer anon JWT. (d) 20260713043000:1893-1912 -> retell-reconciler, apikey + X-DialSmart-Cron-Token (Vault). (e) 20260713050000:42-61 -> automation-scheduler, apikey + X-DialSmart-Automation-Cron-Token (Vault). recovery-lineage-v*/migrations duplicate (d)/(e). Cron (b) cannot reach an audited branch either: ai-autonomous-engine is 503-gated (helper false :5498-5499, gate :5511) and its service-role fetchFunctionJson calls only target sms-messaging :673, outbound-calling :752, ai-sms-processor :779.

FRONTEND user-JWT callers (none use service role): retell-agent-management <- AgentEditDialog.tsx:237,317,342,600,714; AgentToolBuilder.tsx:921,968,1016; AiSmsAgentGenerator.tsx:117; CallHistoryTable.tsx:212; CallSimulator.tsx:114,703; CampaignManager.tsx:271; CampaignSetupWizard.tsx:109; CampaignWizard.tsx:350; ReadinessFixDialogs.tsx:627; RetellCalendarSetup.tsx:423,456; ScriptManager.tsx:142; SystemHealthCheck.tsx:173,200; TranscriptAnalyzer.tsx:231. retell-phone-management <- AgentEditDialog.tsx:268; CampaignManager.tsx:272; CampaignSetupWizard.tsx:115; ReadinessFixDialogs.tsx:758,772; SystemHealthCheck.tsx:212. retell-llm-management <- AgentEditDialog.tsx:398; SystemHealthCheck.tsx:188; TranscriptAnalyzer.tsx:250,295. telnyx-ai-assistant <- TelnyxAIManager.tsx (10 sites incl 516,543,1350), TelnyxAssistantEditor.tsx (6 incl 136,152,172,476), AgentToolBuilder.tsx:982,1029, testCallUtils.ts:133. telnyx-scheduled-events <- TelnyxAIManager.tsx:1115,1129.

ADJACENT: ai-brain also has its OWN service-role-trusts-body-userId internal branch (index.ts:4690-4700) and is itself 503-gated (helper false :10-12, gate :4652). telnyx-ai-assistant:131 builds a Bearer<serviceRoleKey> header but that is a calendar TOOL definition, not a function invocation.

**evidence**

- supabase/functions/ai-brain/index.ts:2889,2892,2896,2898-2903 (fetch with Bearer serviceRoleKey -> retell-phone-management, body user_id: userId)
- supabase/functions/ai-brain/index.ts:3035-3044 and :3130-3136 and :3220-3226 (Bearer serviceRoleKey -> retell-agent-management, body user_id: userId)
- supabase/functions/ai-brain/index.ts:3267-3280 and :3315-3324 (Bearer serviceRoleKey -> retell-phone-management, body user_id: userId)
- supabase/functions/ai-brain/index.ts:4690-4709 internal branch (requestPayload.internal===true && userId && token===supabaseKey -> user={id:internalUserId}); :4702 supabase.auth.getUser(token)
- supabase/functions/call-dispatcher/index.ts:261 supabaseKey=SUPABASE_SERVICE_ROLE_KEY; :1285-1291 supabase.functions.invoke('retell-phone-management', headers Authorization Bearer supabaseKey, body {action:'sync', userId:user.id, organizationId})
- supabase/functions/retell-phone-management/index.ts:28-36 unconditional 503; :56-66 token===supabaseKey -> userId=requestedUserId
- supabase/functions/retell-agent-management/index.ts:44-52 unconditional 503; :63-69 service-role allowance
- supabase/functions/retell-llm-management/index.ts:22-30 unconditional 503; :42-46 service-role allowance
- supabase/functions/telnyx-ai-assistant/index.ts:79-81 helper returns false; :228-238 503 gate; :253-256 bodyJson.user_id && token===serviceRoleKey
- supabase/functions/telnyx-scheduled-events/index.ts:42-44 helper returns false; :51-56 503 gate; :74-77 isServiceRoleCall -> userId=body.userId
- supabase/functions/telnyx-outbound-ai/index.ts:103-113 isServiceRoleCall -> userId=body.userId; :133-143 make_call 503 AFTER the branch
- supabase/config.toml:400-401 telnyx-outbound-ai verify_jwt=false; :395-398 telnyx-ai-assistant verify_jwt=true; :418-421 telnyx-scheduled-events verify_jwt=true
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:281-288 net.http_post -> ai-autonomous-engine, Authorization Bearer app.service_role_key
- supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:15-19 automation-scheduler, Bearer anon JWT (role:anon)
- supabase/migrations/20260703224351_unattended_safety_backstops.sql:214-218 campaign-health-monitor, Bearer anon JWT
- supabase/migrations/20260713043000_retell_automatic_reconciliation.sql:1893-1912 retell-reconciler, apikey + X-DialSmart-Cron-Token (Vault)
- supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql:42-61 automation-scheduler, apikey + X-DialSmart-Automation-Cron-Token (Vault)
- supabase/functions/ai-autonomous-engine/index.ts:5498-5499 helper returns false; :5511 503 gate; :673/:752/:779 service-role fetchFunctionJson targets sms-messaging/outbound-calling/ai-sms-processor
- grep telnyx-outbound-ai in src/ -> 0 matches; whole repo -> only docs, supabase/config.toml, scripts/lib/*-audit.mjs
- grep functions/v1/retell-phone-management whole repo -> only supabase/functions/ai-brain/index.ts (6 sites); grep functions/v1/retell-llm-management -> 0 matches

**validation**

Research-only: no writes, no live calls, no secrets printed. Grepped the whole repo for the six function names, for functions/v1/<name>, for .functions.invoke(, for SUPABASE_SERVICE_ROLE_KEY/SERVICE_ROLE, for the regex Bearer ${serviceRole|supabaseService|SUPABASE_SERVICE_ROLE, for net.http_post under supabase/migrations, and for /functions/v1/ under migrations. Read the auth/gate regions of all six audited functions, both service-role callers (ai-brain, call-dispatcher), ai-autonomous-engine gate and fetchFunctionJson targets, and all five net.http_post migrations. Cross-checked ai-brain internal branch and userId derivation at :4690-4709. The conclusion rests on reading each 503 gate that precedes each trusted-userId branch.

**open_questions**

- Does the LIVE deployment (supabase/functions-live) carry the same 503 gates, or could a deployed-but-ungated copy of retell-phone-management/agent-management/llm-management be reachable? Not verified against the deployed runtime.
- Is telnyx-outbound-ai actually deployed with verify_jwt=false and no gate today (config.toml says so)?
- Are there dynamic indirections (runtime-selected function name) in src/scripts that call one of the six with a service-role bearer that a literal-name grep would miss?

**what_i_did_not_check**

- supabase/functions-live bodies for the six audited names (only main-tree bodies read; deployed gate state unverified).
- Exhaustive enumeration of every functions.invoke caller repo-wide (dynamic callEdgeFunction(name)/invoke(varName) indirections could hide callers).
- Non-src dirs beyond scripts/ audit files (.github/, mcp-server/, campaigns/) for service-role callers.
- Whether the legacy 20251204062700 cron and the newer 20260713050000 Vault cron are both still scheduled live.
- Decoding every embedded JWT in migrations (two confirmed role:anon; others assumed anon by identical token literal).
- The real value behind app.service_role_key in migration 20260210 (only the SQL reference was read).

**confidence**: high