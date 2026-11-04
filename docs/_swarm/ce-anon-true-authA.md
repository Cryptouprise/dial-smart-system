# ce-anon-true-authA

- status: completed
- tldr: anon_reachable=no for all 7; 5 are 503-disabled, calendar-integration 503 unconditional; ai-sms-processor live + 401-safe

Audited 7 edge functions for anon reachability. Result: anon_reachable=no for all 7. FIVE (ai-assistant, ai-brain, ai-error-analyzer, budget-tracker, campaign-health-monitor) are hard-disabled by an always-false tenant-cert gate returning 503 before auth/side effects; calendar-integration returns 503 UNCONDITIONALLY (its getUser is dead code). ai-sms-processor is the only live one and is anon-safe (401 on getUser failure before action dispatch). auth_rejects_on_failure: yes=ai-assistant/ai-brain/ai-error-analyzer/ai-sms-processor; no=budget-tracker (throws -> 400), no=calendar-integration + campaign-health-monitor (getUser error ignored, attacker-supplied user_id used). All 7 use wildcard CORS and a SUPABASE_SERVICE_ROLE_KEY client. Rows: ai-assistant | cors_wildcard=yes@12 | in_func_auth=yes@2943 | auth_kind=getUser (svc-bearer path L2939) | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=LLM tool calls enumerate/mutate account-global Retell/Twilio; svc-role client L2935 | note=503 gate L2891 (cert false L2879); 'if (authError || !user) return 401' L2944-2947. ai-brain | cors_wildcard=yes@6 | in_func_auth=yes@4702 | auth_kind=getUser (svc-bearer L4695) | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=delete leads/launch broadcasts/purchase numbers; svc-role L4688 | note=503 gate L4652 (cert false L11); 401 L4703-4708. ai-error-analyzer | cors_wildcard=yes@5 | in_func_auth=yes@85 | auth_kind=getUser | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=adaptive pacing/alert writes; svc-role L73 | note=503 gate L54 (cert false L46); 401 L87-92. ai-sms-processor | cors_wildcard=yes@5 | in_func_auth=yes@174 | auth_kind=getUser (svc-bearer L167) | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=sends SMS via Twilio + writes sms_conversations/sms_messages; svc-role L159 | note=NO gate; 401 L175-185 before action dispatch L191. budget-tracker | cors_wildcard=yes@5 | in_func_auth=yes@63 | auth_kind=getUser | auth_rejects_on_failure=no | anon_reachable=no | priv_side_effect=provider usage reads + budget/pause writes; svc-role L56 | note=503 gate L33 (cert false L22); throws 'Unauthorized' L67 caught -> status 400 L99. calendar-integration | cors_wildcard=yes@5 | in_func_auth=yes@67 | auth_kind=getUser | auth_rejects_on_failure=no | anon_reachable=no | priv_side_effect=OAuth token storage, booking/cancel, cross-tenant calendar writes; svc-role L61 | note=UNCONDITIONAL 503 L43-51; 'if (!error && user) userId = user.id' L70 ignores error; hardcoded fallback targetUserId L1728. campaign-health-monitor | cors_wildcard=yes@5 | in_func_auth=yes@54 | auth_kind=getUser | auth_rejects_on_failure=no | anon_reachable=no | priv_side_effect=campaign repair actions/alert writes; svc-role L45 | note=503 gate L36 (cert false L28); 'if (!authError && user) userId = user.id' L55 ignores error; body targetUserId scopes query.

## Artifact

**Findings**

All 7 functions carry wildcard CORS. FIVE of seven (ai-assistant, ai-brain, ai-error-analyzer, budget-tracker, campaign-health-monitor) are hard-disabled by an always-false tenant-certification gate that returns 503 before any auth or side effect; calendar-integration returns 503 UNCONDITIONALLY (no gate function) so its in-function auth is dead code. ai-sms-processor is the ONLY one of the 7 that is live AND anon-safe: it rejects (401) on getUser failure before dispatching any action, and it has no 503 gate. auth_rejects_on_failure is yes for ai-assistant/ai-brain/ai-error-analyzer/ai-sms-processor; no for budget-tracker (throws -> outer catch returns 400) and no for calendar-integration/campaign-health-monitor (call getUser but ignore the error, then fall back to attacker-supplied user_id). Anon reachability is therefore no for all 7 today, but for calendar-integration and campaign-health-monitor the ONLY thing preventing anon reach is the 503 gate, not auth: if the cert gate flips to true, anon becomes reachable with attacker-chosen user_id.

**evidence**

- ai-assistant/index.ts:12 'Access-Control-Allow-Origin': '*'; :2879 isAiAssistantToolSurfaceTenantCertified()=>false; :2891-2901 503 gate; :2935 createClient(url, supabaseKey=SUPABASE_SERVICE_ROLE_KEY); :2939 service-role bearer path (token===supabaseKey && requestedUserId); :2943 getUser; :2944-2947 return 401 on authError||!user; :2951-2954 second 401 guard
- ai-brain/index.ts:6 cors '*'; :11 isAiBrainTenantCertified()=>false; :4652-4663 503 gate; :4688 createClient(url, supabaseKey); :4695 isInternalCall = internal===true && internalUserId && token===supabaseKey; :4702 getUser; :4703-4708 return 401 on authError||!authUser
- ai-error-analyzer/index.ts:5 cors '*'; :46 isAiErrorAnalyzerCertified()=>false; :54-59 503 gate; :73 createClient(url, supabaseKey); :85 getUser; :87-92 return 401 on authError||!user
- ai-sms-processor/index.ts:5 cors '*'; :130 serve (no cert gate); :159 createClient(url, serviceRoleKey); :167 internal path token===serviceRoleKey && request.userId; :174 getUser; :175-185 return 401 on authError||!user; :191 action dispatch AFTER auth block
- budget-tracker/index.ts:5 cors '*'; :22 isProviderBudgetTrackingTenantCertified()=>false; :33-43 503 gate; :56 createClient(url, supabaseServiceKey); :63 getUser; :66-68 throw new Error('Unauthorized'); :95-100 outer catch returns status 400 (NOT 401/403)
- calendar-integration/index.ts:5 cors '*'; :38-51 returns 503 UNCONDITIONALLY for every non-OPTIONS request (no gate function; options -> 200 at :39-41); :61 createClient(url, supabaseServiceKey); :67 getUser; :70 'if (!error && user) userId = user.id;' (error ignored, no reject); :1728 'const targetUserId = paramUserId || userId || 5969774f-5340-4e4f-8517-bcc89fa6b1eb' hardcoded fallback user id; :159/:432/:1133/:1256/:1493 return 401 only on some branches when userId empty
- campaign-health-monitor/index.ts:5 cors '*'; :28 isCampaignHealthAutomationTenantCertified()=>false; :36-41 503 gate; :45 createClient(url, supabaseKey); :54 getUser; :55-57 'if (!authError && user) { userId = user.id; }' (error ignored, no reject); :60 body-supplied targetUserId used for query scoping

**validation**

Read the exact ~50-line window around each getUser line in all 7 files; confirmed each function's CORS const, gate, service-role client construction, getUser call, and the return/throw on the next lines. Verified action dispatch order vs auth block for ai-sms-processor and ai-assistant/ai-brain. Cross-checked gate function bodies (all return false) and calendar-integration's unconditional 503.

**open_questions**

- Does the deployed Supabase edge config (supabase/config.toml) set verify_jwt for each of these to true, and does any gateway-level route (api-gateway) also proxy them, which could change anon reachability?
- For calendar-integration, is the hardcoded fallback user_id 5969774f-5340-4e4f-8517-bcc89fa6b1eb a real production user id, and what data would leak if the 503 were removed?
- If budget-tracker's cert gate ever flips true, does the 400-not-401 throw still safely block (it does block before user.id is used, but the status code may mask auth failures in logs)?

**what_i_did_not_check**

- supabase/config.toml verify_jwt flags per function (task stated these are verify_jwt=true; not re-verified in repo)
- Any other entrypoints or wrappers (api-gateway, mcp, workflow-executor callers) that invoke these functions with a service-role bearer and could reach the internal-call branches
- The post-auth tool/action bodies of ai-assistant and ai-brain beyond their auth windows (only read the specified windows)
- Whether any of the 'disabled' 503 gates are actually deployed in that state vs. overridden by a different deployed bundle

**confidence**: high