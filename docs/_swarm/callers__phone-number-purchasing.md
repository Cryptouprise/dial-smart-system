# callers::phone-number-purchasing

- status: completed
- tldr: 8 callers of phone-number-purchasing inventoried; gate is an unconditional pre-try 503 (index.ts:36-44); no bypass exists, all parallel purchase routes also hard-503.

callers::phone-number-purchasing COMPLETE (repo: C:/Users/charl/dial-smart-system).

8 runtime callers: usePhoneNumberPurchasing.ts:30 (POST, breaks on 503) and :90 (GET, tolerates); PhoneNumberPurchasing.tsx:124 (via hook); MissionBriefingWizard.tsx:1091 (breaks on 503); TelnyxAIManager.tsx:498 (sync_telnyx, breaks on 503); ai-assistant/index.ts:2625 (raw fetch w/ service-role, tolerates); config.toml:134 (verify_jwt=true, config); launchSafety.test.ts:203-210 (invariant test). ZERO callers in supabase/migrations/**.sql, automation-scheduler, any *.html, or functions-live.

GATE: phone-number-purchasing/index.ts:36-44 = UNCONDITIONAL 503 PROVIDER_ADMIN_NOT_CERTIFIED placed before the try at :46; lines 46-489 are dead. No if/env/flag; verify_jwt does not bypass it.

BYPASS: none. All parallel purchase paths are also hard-disabled: telnyx-ai-assistant case 'purchase_number':1556 (direct Telnyx /number_orders:1574) gated at :228-238 by a function returning false (:79-81); retell-phone-management:28-36 unconditional 503 (used by ai-brain:2963); provider-management:48-63 false gate. No admin override, env var, cron worker, or alternate enabled purchase endpoint; only a code edit enables purchasing.

## Artifact

**Findings**

WORKER REPORT
DONE: Inventoried every live caller of edge function 'phone-number-purchasing' in C:/Users/charl/dial-smart-system (frontend, edge functions, dashboards, scripts, SQL/cron) and answered the number-order-worker / bypass question.
TOUCHED: none (read-only).
EVIDENCE: greps + file:line reads cited in evidence[].
RESULT: CALLERS + GATE + BYPASS below.
COULD_NOT: query the deployed LIVE function to confirm repo main == live (no project access in this node).
CONFIDENCE: high (repo source); medium on live-deployment parity.

=== A. RUNTIME CALLERS OF phone-number-purchasing (8) ===
1. src/hooks/usePhoneNumberPurchasing.ts:30 - supabase.functions.invoke('phone-number-purchasing',{method:'POST',body:{areaCode,quantity,provider,purpose,callDirection}}) in purchaseNumbers. Guarded first by browserProviderAdministrationAllowed() :21 (returns false) which throws. If reached: 'if (error) throw error' :41 -> BREAKS on hard 503 (FunctionsHttpError). Consumed by src/components/PhoneNumberPurchasing.tsx:124 (handlePurchase, itself guarded :99).
2. src/hooks/usePhoneNumberPurchasing.ts:90 - supabase.functions.invoke('phone-number-purchasing',{method:'GET'}) in getOrderHistory. 'if (error) throw error' :94, catch returns [] :103 -> TOLERATES non-200 (empty list + toast).
3. src/components/MissionBriefingWizard.tsx:1091 - inline onClick 'Buy' button (:1083-1106) supabase.functions.invoke('phone-number-purchasing',{body:{provider,areaCode,quantity}}). 'if (error) throw error' :1094 -> BREAKS on hard 503 (catch -> toast.error :1099). No launchSafety guard on this path.
4. src/components/TelnyxAIManager.tsx:498 - callEdgeFunction('phone-number-purchasing',{action:'sync_telnyx'}) in handleSyncNumbers (:495-509). Local callEdgeFunction :76-95 does 'if(!res.ok) throw new Error(data.error)' :93 -> BREAKS on hard 503.
5. supabase/functions/ai-assistant/index.ts:2625 - raw fetch(`${supabaseUrl}/functions/v1/phone-number-purchasing`,{method:'POST',Authorization:'Bearer '+SERVICE_ROLE_KEY,body:{areaCode,quantity,provider:'retell',userId,organizationId}}) in case 'buy_phone_numbers' (:2605). Checks '!response.ok || result.error' :2642 -> TOLERATES non-200 (returns failure message, no throw).
6. supabase/config.toml:134-135 - [functions.phone-number-purchasing] verify_jwt = true (config, not a runtime caller; comment: 'Launch-quarantined in-function').
7. src/lib/__tests__/launchSafety.test.ts:203-210 - invariant test asserting purchaseNumbers' invoke is preceded by browserProviderAdministrationAllowed(). Not a runtime caller.
8. Non-runtime path-string refs (audits only): scripts/lib/contact-egress-surface-audit.mjs:135, scripts/lib/provider-administration-surface-audit.mjs:36, scripts/contact-egress-surface-audit.test.mjs:45, scripts/provider-administration-surface-audit.test.mjs:14.
ZERO callers in: supabase/migrations/**.sql (grep 0), supabase/functions/automation-scheduler/ (grep 0), any **/*.html, supabase/functions-live/**; there is no scripts/automation-scheduler dir. No cron.schedule/net.http_post targets this function.

=== B. DISABLE GATE MECHANICS (supabase/functions/phone-number-purchasing/index.ts) ===
- :31 serve(async (req)=>{ ; :32-34 OPTIONS preflight returns null body (passes).
- :36-44 UNCONDITIONAL return Response(JSON.stringify({success:false,disabled:true,error_code:'PROVIDER_ADMIN_NOT_CERTIFIED',error:'Phone-number search and purchasing are disabled until provider spend and tenant ownership are certified.'}),{status:503}) - placed BEFORE the try at :46. No 'if', no env read, no flag: every non-OPTIONS request 503s.
- :46-489 unreachable dead code: env read :47-48, service-role client :57, JWT getUser :65, POST handler :70, number_orders writes :101/147/168/185/242/267/284/341/401/422/434/456, Twilio AvailablePhoneNumbers :158 + IncomingPhoneNumbers purchase :200, Telnyx /v2/number_orders :300. No method/auth/body/provider reaches it.
- Bypass inside the function: NONE. Config bypass: verify_jwt=true (config.toml:134) is not an authz gate and does not affect the 503.

=== C. NUMBER-ORDER-WORKER / BYPASS ANSWER ===
No route, worker, flag, env var, cron, or admin override can re-enable/re-invoke/bypass the 503. Every parallel purchase path is also hard-disabled by an unconditional pre-try 503:
- supabase/functions/telnyx-ai-assistant/index.ts case 'purchase_number' :1556 -> direct Telnyx POST /number_orders :1574 (+poll :1589, phone_numbers insert :1599-1614) but GATED at serve :228-238 by isTelnyxAssistantManagementTenantCertified() which literally returns false (:79-81) -> 503 TELNYX_ASSISTANT_MANAGEMENT_NOT_TENANT_CERTIFIED. UI caller: src/components/TelnyxAssistantEditor.tsx:172-176 (action 'purchase_number'; local callEdgeFunction :53-70 throws on !res.ok -> breaks on 503).
- supabase/functions/retell-phone-management/index.ts:28-36 unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED before try :38 (no named gate); exposes action 'purchase'. Caller: supabase/functions/ai-brain/index.ts:2963 fetch /functions/v1/retell-phone-management {action:'purchase'} -> dead behind the 503.
- supabase/functions/provider-management/index.ts:48-63 isProviderConfigurationTenantCertified()==false -> 503 PROVIDER_CONFIGURATION_NOT_TENANT_CERTIFIED.
- Same hard 503 provider/control-plane gates: retell-agent-management:47, retell-llm-management:25, twilio-integration:37, check-number-config:16, remove-trunk:17, setup-inbound-calls:17, setup-lady-jarvis:105, clear-voice-webhooks:16.
CONCLUSION: the only way to enable purchasing is a code edit (flip/remove the literal false / the 503 return). No admin override flag, no env var, no separate enabled purchase endpoint, no cron worker.

**evidence**

- src/hooks/usePhoneNumberPurchasing.ts:21,30,41,90,94,103
- src/components/PhoneNumberPurchasing.tsx:99,124
- src/components/MissionBriefingWizard.tsx:1083,1091,1094,1099
- src/components/TelnyxAIManager.tsx:76,93,498
- src/components/TelnyxAssistantEditor.tsx:53,68,172,173
- supabase/functions/phone-number-purchasing/index.ts:31,32-34,36-44,46,57,65,70,158,200,300,477
- supabase/config.toml:134-135
- supabase/functions/ai-assistant/index.ts:2605,2625,2642
- supabase/functions/telnyx-ai-assistant/index.ts:79-81,228-238,1556,1574,1589,1599
- supabase/functions/retell-phone-management/index.ts:28-36
- supabase/functions/ai-brain/index.ts:2963,3004
- supabase/functions/provider-management/index.ts:48-63
- src/lib/launchSafety.ts:157-159
- src/lib/__tests__/launchSafety.test.ts:203-210
- grep 'phone-number-purchasing' = 105 matches / 25 files (all source hits accounted); grep 'functions/v1/phone-number-purchasing' = 3 files (ai-assistant + 2 doc reports); grep in supabase/migrations = 0

**validation**

Read-only audit. Verified by: (1) exhaustive literal greps across the live repo for 'phone-number-purchasing', 'functions/v1/phone-number-purchasing', 'functions.invoke', '/functions/v1/', 'net.http_post', 'cron.schedule', 'purchase_number', 'sync_telnyx'; (2) direct file:line reads of every caller and of the gate body top-to-bottom; (3) cross-checked the gate is an unconditional pre-try return with no condition/env/flag and that all sibling purchase endpoints carry the same unconditional 503. No commands executed, no files written.

**open_questions**

- Does the DEPLOYED live function (project emonjusymdripmkvtttc) match repo main? docs/_swarm/LIVE-VS-MAIN-GATES.md:9-11 says gates landed 2026-07-13 and live may lag; if live lags, the 503 may not be deployed. Needs a live-project check, not a repo read.
- Is the MissionBriefingWizard 'Buy' button actually rendered/reachable in the current UI (conditional block above :1083)? Not verified.
- Does any external system (n8n, GHL workflow, Make) hold a stored URL to /functions/v1/phone-number-purchasing outside this repo?

**edge_cases_considered**

- Dynamically-constructed function names (callEdgeFunction(functionName,...)): the literal 'phone-number-purchasing' string is present at each such site, so no dynamic-only caller is missed.
- GET path (getOrderHistory) and sync_telnyx action: both dead behind the same pre-try 503.
- OPTIONS preflight returns before the gate, so CORS preflight succeeds while actual requests 503.
- functions-live/ mirror and certification/recovery-lineage-*/ copies: 0 callers of this function.
- HTML dashboards (ship/*.html): 0 references to phone-number-purchasing.

**what_i_did_not_check**

- Did not query the live Supabase project (emonjusymdripmkvtttc) to confirm the deployed function body, verify_jwt, or the actual 503 response - repo-only.
- Did not verify UI reachability/conditional rendering of MissionBriefingWizard's Buy button or whether it is behind a feature flag.
- Did not audit external orchestrators (n8n / GHL workflows / Make) that could hold an out-of-repo URL to the function.
- Did not read every '... N more non-code matches omitted' truncated multi-match file (docs/_swarm/*.md, audit scripts) line-by-line - they are documentation/audit refs, not callers.

**confidence**: high