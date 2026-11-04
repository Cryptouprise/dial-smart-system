# ce-anon-true-authC-telnyx-ai-assistant

- status: completed
- tldr: telnyx-ai-assistant: CORS '*', auth=service-role-bearer+getUser, 401 on failure, but anon blocked by 503 quarantine gate before auth.

telnyx-ai-assistant anon/authC audit complete (read-only, no writes/commands/APIs).

RESULT ROW:
telnyx-ai-assistant | cors_wildcard=yes@index.ts:27 | in_func_auth=yes@index.ts:246-269 | auth_kind=getUser+service_role_bearer@index.ts:253-256,258-264 | auth_rejects_on_failure=yes@index.ts:259-263 | anon_reachable=no@gated (503 quarantine index.ts:228-238; helper false index.ts:79-81; plus config.toml:398 verify_jwt=true) | priv_side_effect=none-live-fail-closed | note=`if (!isTelnyxAssistantManagementTenantCertified()) { return new Response(JSON.stringify({success:false,disabled:true,error_code:'TELNYX_ASSISTANT_MANAGEMENT_NOT_TENANT_CERTIFIED',...}), { status: 503, headers: { ...corsHeaders, 'Content-Type':'application/json','Cache-Control':'no-store' } }); }` @index.ts:228-238

Key points vs the brief's hint (getUser @L258):
- L258 getUser IS real, and it hard-returns 401 at L260-262 on authError/!user.
- But the FIRST auth branch (L253-256) is a service-role-bearer bypass that trusts bodyJson.user_id. So auth_kind is getUser + service-role-bearer, not getUser alone.
- anon_reachable=no is decided by the 503 quarantine gate (L228-238, helper constant false L79-81) which runs BEFORE auth and BEFORE service-role client construction (L242-243). config.toml:395-398 adds verify_jwt=true as an independent second layer.
- CORS wildcard '*' (L27) is spread into every response, including preflight (L219) and the 503 (L236).

Validation: direct file reads of index.ts (1-80, 200-340) and config.toml (full). No execution. agentgrep returned 0 matches on this path form (tool quirk) so grep was not used as evidence.

Follow-ups: (a) which layer fails first live (gateway 401 vs handler 503) is cosmetic only; (b) _shared/tenant-context.ts not read (only matters if the gate is lifted); (c) full action bodies not read.

## Artifact

**Findings**

PIPE ROW → telnyx-ai-assistant | cors_wildcard=yes@index.ts:27 | in_func_auth=yes@index.ts:246-269 | auth_kind=getUser+service_role_bearer@index.ts:253-256,258-264 | auth_rejects_on_failure=yes@index.ts:259-263 | anon_reachable=no@gated (503 quarantine index.ts:228-238 via helper returning false at index.ts:79-81; plus platform verify_jwt=true config.toml:398) | priv_side_effect=none-live-fail-closed (if re-enabled: service-role admin client index.ts:242-243, account-wide Telnyx assistant CRUD + number purchase/assign, comments index.ts:222-227) | note=`if (!isTelnyxAssistantManagementTenantCertified()) { return new Response(JSON.stringify({success:false,disabled:true,error_code:'TELNYX_ASSISTANT_MANAGEMENT_NOT_TENANT_CERTIFIED',error:'Telnyx assistant management is disabled until provider ownership, paid mutations, and tool authentication are certified.'}), { status: 503, headers: { ...corsHeaders, 'Content-Type':'application/json','Cache-Control':'no-store' } }); }` @index.ts:228-238, helper `function isTelnyxAssistantManagementTenantCertified(): boolean { return false; }` @index.ts:79-81. DETAIL: (1) CORS wildcard YES at index.ts:27 (corsHeaders block 26-29, spread into 219/236/261/267). (2) In-function auth YES at index.ts:246-269. (3) auth_kind = BOTH: service-role-bearer fast path index.ts:253-256 (`if (bodyJson.user_id && token === serviceRoleKey)`) AND getUser path index.ts:258-264 (supabaseAdmin.auth.getUser(token)). (4) Rejects on failure YES, exact return index.ts:259-263: `if (authError || !user) { return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }`; missing header → 401 at index.ts:265-268. (5) anon_reachable NO: index.ts:228-238 returns 503 for every non-OPTIONS request before auth/env/service-role construction because the helper is constant false (index.ts:79-81); independent second layer is config.toml:395-398 verify_jwt=true. (6) priv_side_effect none-live: gate precedes Deno.env service-role (index.ts:242) and createClient (index.ts:243); if lifted, account-global blast radius (assistant CRUD, number purchase, historical service-role credential embedding per index.ts:222-227), and TELNYX_API_KEY account-global secret read at index.ts:300-304; test_call separately disabled at index.ts:281-291.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:26-29 — corsHeaders with 'Access-Control-Allow-Origin': '*'
- index.ts:218-220 — OPTIONS returns null with corsHeaders (wildcard CORS answered pre-auth)
- index.ts:228-238 — 503 TELNYX_ASSISTANT_MANAGEMENT_NOT_TENANT_CERTIFIED quarantine return
- index.ts:79-81 — isTelnyxAssistantManagementTenantCertified() { return false; }
- index.ts:242-243 — service-role Supabase admin client construction (after the gate)
- index.ts:246-269 — auth block; 252 token extraction; 253-256 service-role bearer path; 258-264 getUser; 259-263 401 'Authentication failed'; 265-268 401 'Missing authorization'
- index.ts:274-278 — authorizeOrganizationContext(supabaseAdmin, userId, params.organizationId ?? params.organization_id)
- index.ts:281-291 — test_call disabled 503 TELNYX_TEST_CALL_EGRESS_NOT_CERTIFIED
- index.ts:300-304 — account-global TELNYX_API_KEY required (500 if missing) for non-read actions
- index.ts:222-227 — containment comment (account-wide assistant inventory, number purchase before durable ownership, previously embedded service-role credential in provider webhook config)
- C:/Users/charl/dial-smart-system/supabase/config.toml:395-398 — [functions.telnyx-ai-assistant] verify_jwt = true with launch-quarantine comment

**validation**

Read-only static inspection of the exact handler file and deployment config; no execution, no network calls. Read index.ts:1-80 (imports, corsHeaders, guard helper), index.ts:200-340 (serve handler, quarantine gate, auth block, dispatch header), and supabase/config.toml:1-449 (all entries incl. L395-398). Every line number verified against read output. Caveat: agentgrep returned 0 matches for this path form (tool quirk), so all claims come from direct read output, which is authoritative.

**open_questions**

- Which layer fails first for an anon caller in the live deployment (gateway 401 vs handler 503)? Both fail closed, so anon_reachable=no is unchanged, but the observed status code differs.
- tenant-context.ts authorizeOrganizationContext (imported index.ts:24, called index.ts:274) was not read; it only matters if the 503 gate is lifted.

**edge_cases_considered**

- OPTIONS preflight is not gated by the quarantine check (returns before it), so a wildcard-CORS preflight is answered on a disabled function; harmless, but confirms wildcard CORS is live at the edge.
- A request presenting the service-role key as bearer bypasses getUser entirely (index.ts:253-256) and trusts bodyJson.user_id; unreachable today because of the 503 gate, but it is the branch to watch if the gate is re-enabled.
- verify_jwt=true (config.toml:398) means the platform gateway gate applies to this function; the in-function 503 makes anon_reachable the same either way, and the two layers are independent.
- Method is not branched on other than OPTIONS; anon GET/POST/PUT all hit the 503 gate identically.

**what_i_did_not_check**

- Did not read ../_shared/tenant-context.ts (authorizeOrganizationContext semantics); relevant only if the quarantine gate is removed.
- Did not read the remaining ~1858 lines of index.ts action bodies (per-action Telnyx mutations and the number purchase/assign path); characterized from the header and containment comments only.
- Did not inspect live/deployed Supabase function state; analysis is against repo source + config.toml on disk, which is the requested artifact.
- Did not check whether other copies of this function exist in other working trees; a single path was specified.

**confidence**: high