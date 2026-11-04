# ce-anon-engine-internal

- status: completed
- tldr: All 7 functions: CORS wildcard '*', anon_reachable=no. Each fail-closed by a cert stub (503); only nudge-scheduler lacks any real in-function auth.

Analyzed all 7 Dial Smart edge functions (supabase/functions/<name>/index.ts) for CORS wildcard, in-function auth, auth kind, anon reachability, and privileged side effects. Emitted one pipe-format row per function into the node artifact.

Rows:
- workflow-executor | cors=yes@30 | in_func_auth=yes@268 | getUser | anon=no | disabled 503 (cert stub L34-36, gate L220); getUser reject L269
- disposition-router | cors=yes@6 | in_func_auth=yes@124 | getUser | anon=no | disabled 503 (gate L89); getUser reject L126, service-role bypass L121
- analyze-call-transcript | cors=yes@6 | in_func_auth=yes@197 | service-role-bearer | anon=no | disabled 503 (gate L156); service-role gate L197 else getUser reject L210
- sms-messaging | cors=yes@11 | in_func_auth=yes@127 | service-role-bearer | anon=no | outbound Twilio SMS; missing-auth 401 L123, service-role L127 else getUser 401 L136
- api-gateway | cors=yes@_shared/utils.ts:9 (imported, no literal in index.ts) | in_func_auth=yes@98 | api-key | anon=no | full CRUD; only /v1/health public (L87), authenticateApiKey L98 + dsk_ format reject api-auth.ts:55
- autonomous-prioritization | cors=yes@5 | in_func_auth=yes@51 | getUser | anon=no | disabled 503 (gate L29); getUser reject L53
- nudge-scheduler | cors=yes@17 | in_func_auth=no | none | anon=no | disabled 503 (gate L36, only gate); NO auth read; verify_jwt=true is not a gate

Key finding: every function is fail-closed by an in-function cert stub returning false (503) before privileged work. Six also have a real in-function rejection behind it; nudge-scheduler has none, so its sole barrier is the cert stub.

## Artifact

**Findings**

Seven edge functions, one row each (pipe format):

workflow-executor | cors_wildcard=yes@30 | in_func_auth=yes@268 | auth_kind=getUser | anon_reachable=no | priv_side_effect=disabled(503) before any DB/provider effect; if enabled: outbound call/SMS dispatch + workflow DB mutations via service-role client | note="@220 `if (!isWorkflowAutomationCertified())` -> returns false (L34-36) => 503; then @269 `if (authResult.error || !authResult.data.user)` => 401 'Authentication failed'"

disposition-router | cors_wildcard=yes@6 | in_func_auth=yes@124 | auth_kind=getUser | anon_reachable=no | priv_side_effect=disabled(503); if enabled: DNC/workflow/pipeline mutations via supabaseAdmin service-role | note="@89 `if (!isDispositionAutomationTenantCertified())` returns false (L76-78) => 503; @121 `const isServiceRoleCall = token === supabaseServiceKey;` then @126 `if (authError || !user)` => 401 'Unauthorized'"

analyze-call-transcript | cors_wildcard=yes@6 | in_func_auth=yes@197 | auth_kind=service-role-bearer | anon_reachable=no | priv_side_effect=disabled(503); if enabled: service-role transcript DB writes + Lovable AI spend | note="@156 `if (!isFallbackTranscriptAnalysisTenantCertified())` returns false (L144-146) => 503; @197 `if (token === serviceRoleKey)` gate else @210 `if (!user)` => 401; missing header @183 => 401"

sms-messaging | cors_wildcard=yes@11 | in_func_auth=yes@127 | auth_kind=service-role-bearer | anon_reachable=no | priv_side_effect=outbound SMS via Twilio (org-scoped, DNC-gated) | note="@123 `if (!authHeader)` => 401 HttpError UNAUTHORIZED; @127 `if (token === serviceRoleKey && request.user_id)` internal; else @136 `if (authError || !user)` => 401 'Authentication failed'"

api-gateway | cors_wildcard=yes@_shared/utils.ts:9 | in_func_auth=yes@98 | auth_kind=api-key | anon_reachable=no | priv_side_effect=full CRUD leads/campaigns/calls/SMS via service-role client, scope-gated | note="@87 `if (path === \"/v1/health\" && req.method === \"GET\")` returns only ok/version (no auth); @98 `ctx = await authenticateApiKey(req, supabase)`; _shared/api-auth.ts:55 `if (!token.startsWith(\"dsk_\"))` => AuthenticationError 401"

autonomous-prioritization | cors_wildcard=yes@5 | in_func_auth=yes@51 | auth_kind=getUser | anon_reachable=no | priv_side_effect=disabled(503); if enabled: lead scoring + mutations via service-role client | note="@29 `if (!isAutonomousPrioritizationTenantCertified())` returns false (L19-21) => 503; @53 `if (authError || !user)` => 401 'Invalid token'"

nudge-scheduler | cors_wildcard=yes@17 | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=disabled(503); if enabled: AI-generated follow-up SMS egress | note="@36 `if (!isNudgeEgressCertified())` returns false (L25-27) => 503 is the ONLY gate; no authorization header is ever read (grep 'auth' matches only the CORS header @18); verify_jwt=true (config L328) is NOT a gate since the public anon JWT passes"

CROSS-CUTTING: all seven are fail-closed by an in-function cert stub returning false (503) BEFORE their privileged work. Six still carry a real in-function rejection behind that stub; nudge-scheduler carries none. api-gateway is the only one whose CORS '*' lives in an imported shared module, not a literal in index.ts.

**evidence**

- workflow-executor/index.ts:30 cors '"*"'; :220 cert gate 503; :269 getUser reject 401; config.toml:210 verify_jwt=false
- disposition-router/index.ts:6 cors '"*"'; :89 cert gate 503; :121 service-role compar; :126 getUser reject 401; config.toml:215 verify_jwt=false
- analyze-call-transcript/index.ts:6 cors '"*"'; :156 cert gate 503; :183 missing-auth 401; :197 service-role gate; :210 getUser reject 401; config.toml:173 verify_jwt=false
- sms-messaging/index.ts:11 cors '"*"'; :123 missing-auth 401; :127 service-role gate; :136 getUser reject 401; :118-119 publicActions removed; config.toml:107 verify_jwt=false
- api-gateway/index.ts:87 public health; :98 authenticateApiKey; _shared/api-auth.ts:55 dsk_ format reject; _shared/utils.ts:9 cors '"*"'; config.toml:444 verify_jwt=false
- autonomous-prioritization/index.ts:5 cors '"*"'; :29 cert gate 503; :51 getUser; :53 reject 401; config.toml:349 verify_jwt=true
- nudge-scheduler/index.ts:17 cors '"*"'; :18 only auth mention; :36 cert gate 503 (false L25-27); no auth read; config.toml:328 verify_jwt=true

**validation**

Static read of checked-in source; cited exact file:line for every CORS literal, auth guard, and cert gate. Confirmed CORS '*' literals: workflow-executor:30, disposition-router:6, analyze-call-transcript:6, sms-messaging:11, autonomous-prioritization:5, nudge-scheduler:17. api-gateway has NO literal in index.ts; effective CORS is imported _shared/utils.ts corsHeaders L8-12 ('*' at L9). Confirmed in-function rejections: workflow-executor:269, disposition-router:126, analyze-call-transcript:183/197/210, sms-messaging:123/136, api-gateway:98 + api-auth.ts:55, autonomous-prioritization:53. Confirmed nudge-scheduler reads no auth header. Cross-checked verify_jwt for all seven in config.toml.

**open_questions**

- Are the false cert stubs (isWorkflowAutomationCertified / isDispositionAutomationTenantCertified / isFallbackTranscriptAnalysisTenantCertified / isNudgeEgressCertified / isAutonomousPrioritizationTenantCertified) ever flipped to true by a build/deploy transform? Only checked-in source read - all literal `return false`.
- api-gateway: can a dsk_live_ key row exist with null user_id/organization_id, letting an external caller act tenant-less? Requires reading the key issuance path (not checked).

**what_i_did_not_check**

- Only the gate+auth front of workflow-executor (to ~L320) was traced; per-action privileged branches beyond resolve_external_effect not enumerated (priv_side_effect list is representative, not exhaustive).
- Did not inspect api_keys issuance/empty-tenant path in api-gateway.
- Did not execute any function or hit the live Supabase project; verdicts are static source reads only.
- Did not verify whether _shared/utils.ts corsHeaders is overridden per-response anywhere else in api-gateway.

**confidence**: high