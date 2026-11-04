# ce-anon-absent-other

- status: completed
- tldr: 4 absent fns unauthenticated to service-role writes; ringba partial; billing/credit authed; teams/zapier locked.

Audited the 9 functions absent from supabase/config.toml (default verify_jwt=true; anon key still passes the gateway). Rows delivered in findings artifact.

UNSAFE (no in-function auth, anon-reachable to a service-role effect):
- update-lead-info (CORS *@15): service-role UPDATE leads @136-139 + merge_custom_fields RPC @147. Only guard is phone/leadId presence @80.
- bulk-lead-import (CORS *@15): service-role upsert leads @171-177 + campaign_leads @206-208; userId from request body. Only guard is body.userId @76.
- demo-funnel-track (CORS *@4): service-role INSERT demo_funnel_events @100. Guard = event allowlist @83.
- law-firm-beta-submit (CORS *@4): service-role INSERT law_firm_beta_leads @127-144. Guards = interest allowlist @55 + email/phone @83 + rate limits @112.
- ringba-enrich-proxy (CORS *@17): PARTIAL - service-role leads PII SELECT @84-94 + outbound GET to display.ringba.com/enrich @163; no DB write.

SAFE:
- billing-portal: authenticateUser->getUser @102 (+ membership reject @130); CORS via imported shared wildcard (_shared/utils.ts:12, applied @83). anon_reachable=no.
- credit-management: getUser @116 -> 401 @118-121; anon key != service key @111. anon_reachable=no.
- teams-observer / zapier-observer: compile-time hard lock (const false @24 / @23 -> 503); no CORS; dead path.

Validation: read every index.ts with line numbers; grep-confirmed CORS literals; PowerShell-confirmed all 9 names ABSENT from config.toml; grep-confirmed zero getUser/Authorization guard in the four unauth service-role functions; findstr-confirmed no ACAO literal in teams/zapier dirs.

Blockers/follow-ups: not checked - gateway runtime behavior, RLS/SECURITY DEFINER on leads/demo_funnel_events/law_firm_beta_leads/merge_custom_fields/credit RPCs, client callers, observer-runtime internals, live deployment in emonjusymdripmkvtttc.

## Artifact

**Findings**

PIPE ROWS
billing-portal | cors_wildcard=yes@_shared/utils.ts:12 (imported; applied index.ts:83) | in_func_auth=yes@102 | auth_kind=getUser | anon_reachable=no | priv_side_effect=Stripe Customer Portal session (index.ts:152) + Checkout Session (index.ts:198); service-role membership/org/plan reads | note="const { user, userId } = await authenticateUser(req, anonClient);" (index.ts:102) -> getUser at _shared/utils.ts:159; then "throw new NotFoundError(\"Organization not found\")" (index.ts:130) rejects non owner/admin members
credit-management | cors_wildcard=yes@36 | in_func_auth=yes@116 | auth_kind=getUser | anon_reachable=no | priv_side_effect=credit RPCs reserve_credits/finalize_call_cost/add_credits (L312,368,417) + Stripe checkout (L605); reserve/finalize/add gated service-role via assertServiceControlledCreditAction (L300,347,409) | note="const { data: { user }, error: authError } = await supabase.auth.getUser(token); if (authError || !user) { ... status: 401 }" (L116-121); anon key != supabaseServiceKey (L111) so getUser(anonKey) fails
update-lead-info | cors_wildcard=yes@15 | in_func_auth=no | auth_kind=none | anon_reachable=YES | priv_side_effect=service-role UPDATE of leads identity cols (L136-139) + merge_custom_fields RPC (L147) using SUPABASE_SERVICE_ROLE_KEY (L88) | note=only guard is "if (!phone && !leadId) return ...400" (L80); no Authorization/token check anywhere
bulk-lead-import | cors_wildcard=yes@15 | in_func_auth=no | auth_kind=none | anon_reachable=YES | priv_side_effect=service-role upsert into leads (L171-177) and campaign_leads (L206-208) with SUPABASE_SERVICE_ROLE_KEY (L64); user_id taken from request body | note=only guard is "if (!body.userId) return ...400" (L76); userId is attacker-controlled body field, not a validated token
demo-funnel-track | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=YES | priv_side_effect=service-role INSERT into demo_funnel_events (L100) via SUPABASE_SERVICE_ROLE_KEY (L78) | note=only guard is "if (!ALLOWED_EVENTS.has(eventName)) return ...400" (L83); no auth
law-firm-beta-submit | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=YES | priv_side_effect=service-role INSERT into law_firm_beta_leads lead-capture (L127-144) via SUPABASE_SERVICE_ROLE_KEY (L48) | note=only guards are interest allowlist "if (!ALLOWED_INTERESTS.has(interest))" (L55) and "if (!email && !phone)" (L83); no auth, only IP/email rate limits (L112)
teams-observer | cors_wildcard=absent | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=none (dead path) | note="const TEAMS_OBSERVER_LAUNCH_CERTIFIED: boolean = false;" (L24) then "if (!TEAMS_OBSERVER_LAUNCH_CERTIFIED) return teamsObserverDisabledResponse();" (L52-53) 503; service-role client only built inside observerRuntime() reachable solely from the locked handler
zapier-observer | cors_wildcard=absent | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=none (dead path) | note="const ZAPIER_OBSERVER_LAUNCH_CERTIFIED: boolean = false;" (L23) then "if (!ZAPIER_OBSERVER_LAUNCH_CERTIFIED) return zapierObserverDisabledResponse();" (L50-51); no Access-Control-* anywhere in dir
ringba-enrich-proxy | cors_wildcard=yes@17 | in_func_auth=no | auth_kind=none | anon_reachable=partial | priv_side_effect=service-role SELECT of leads PII (L84-94) + outbound GET to https://display.ringba.com/enrich (L163) carrying lead identity; NO DB write | note=no auth; only guard is OPTIONS check (L24); zero token/secret verification

**evidence**

- C:/Users/charl/dial-smart-system/supabase/config.toml: all 9 function names ABSENT (verified via PowerShell -match) -> default verify_jwt=true applies
- billing-portal/index.ts:102 'const { user, userId } = await authenticateUser(req, anonClient);' ; index.ts:130 'throw new NotFoundError("Organization not found")'
- _shared/utils.ts:12 "'Access-Control-Allow-Origin': '*'," ; utils.ts:159 'const { data: { user }, error } = await supabase.auth.getUser(token);'
- credit-management/index.ts:36 ACAO '*'; index.ts:111 'const isServiceRole = token === supabaseServiceKey;'; index.ts:116-121 getUser + 401
- update-lead-info/index.ts:15 ACAO '*'; :88 serviceKey; :136-139 supabase.from('leads').update(...); :80 only 'if (!phone && !leadId)'
- bulk-lead-import/index.ts:15 ACAO '*'; :64 service role key; :76 'if (!body.userId)'; :171-177 upsert leads; :206-208 upsert campaign_leads
- demo-funnel-track/index.ts:4 ACAO '*'; :78 service role key; :83 ALLOWED_EVENTS guard; :100 insert demo_funnel_events
- law-firm-beta-submit/index.ts:4 ACAO '*'; :48 service role key; :127-144 insert law_firm_beta_leads
- teams-observer/index.ts:24 lock const false; :52-53 disabled response; handler.ts:65 teamsObserverDisabledResponse
- zapier-observer/index.ts:23 lock const false; :50-51 disabled response; auth.ts:8 ZAPIER_API_KEY_PATTERN /^dsk_live_/
- ringba-enrich-proxy/index.ts:17 ACAO '*'; :84 service role key; :89-94 service-role leads select; :163 fetch to display.ringba.com/enrich

**validation**

Read each index.ts end-to-end with line numbers; confirmed CORS literals by grep; confirmed absence from config.toml by PowerShell regex over the file; confirmed no getUser/Authorization guard in the four unauthenticated service-role functions (grep for getUser returned only Access-Control-Allow-Headers lines); confirmed no Access-Control-Allow-Origin literal in teams-observer/zapier-observer dirs (findstr exit non-zero).

**open_questions**

- Does @supabase/supabase-js functions.invoke send the anon key as a valid JWT that passes the gateway verify_jwt gate for these absent functions, or does the gateway 401 an anon-only bearer? (premise of rule c assumed true per task)
- Even where the function is anon-reachable, do leads/demo_funnel_events/law_firm_beta_leads RLS policies or the merge_custom_fields RPC SECURITY DEFINER block anything the service-role client does? (service role bypasses RLS by design)
- Is demo-funnel-track's analytics INSERT in scope as a 'privileged side effect' vs low-impact telemetry? (rule c lists service-role DB write, so counted YES)

**what_i_did_not_check**

- Deployed/runtime behavior of the gateway (only static source + config.toml inspected)
- RLS policies and SECURITY DEFINER definitions for leads, demo_funnel_events, law_firm_beta_leads, merge_custom_fields, credit RPCs
- Other callers/references to these functions (client code) that might already gate them
- _shared/control-plane/observer-runtime.ts internals behind the locked teams/zapier observers
- Whether the four unauthenticated functions are actually deployed in the live Supabase project emonjusymdripmkvtttc
- Input-validation depth (e.g. SQLi/mass-assignment) beyond the auth/reachability scope of this node

**confidence**: high