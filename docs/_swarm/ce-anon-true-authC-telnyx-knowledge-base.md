# ce-anon-true-authC-telnyx-knowledge-base

- status: completed
- tldr: telnyx-knowledge-base: CORS wildcard yes@27, auth getUser@89 rejects 401@90-93, hard-disabled guard 503 L64-74, anon_reachable=no

telnyx-knowledge-base audit complete. Hard-disabled function: guard (L64-74) returns 503 to all callers before auth; isTelnyxKnowledgeBaseTenantCertified() hardcoded false (L33-35). CORS wildcard '*' (L27). In-function auth present (L81-94), validates via getUser (L89), returns 401 on authError/!user (L90-93). anon_reachable=no; no privileged side effect reachable.

ROW: FUNC | telnyx-knowledge-base | cors_wildcard=yes@27 | in_func_auth=yes@81-94 | auth_kind=getUser@89 | auth_rejects_on_failure=yes@90-93 | anon_reachable=no | priv_side_effect=none_reachable (hard-disabled guard L64-74; if enabled: service-role DB writes L130-396 + Telnyx API calls L98-99,119-344) | note="if (!isTelnyxKnowledgeBaseTenantCertified()) { ...return 503 TELNYX_KNOWLEDGE_BASE_NOT_TENANT_CERTIFIED }"

## Artifact

**Findings**

EXACT PIPE ROW: FUNC | telnyx-knowledge-base | cors_wildcard=yes@27 | in_func_auth=yes@81-94 | auth_kind=getUser@89 | auth_rejects_on_failure=yes@90-93 | anon_reachable=no | priv_side_effect=none_reachable (hard-disabled guard L64-74; if enabled: service-role DB writes L130-396 + Telnyx API calls L98-99,119-344) | note="if (!isTelnyxKnowledgeBaseTenantCertified()) { return new Response(JSON.stringify({ success:false, disabled:true, error_code:'TELNYX_KNOWLEDGE_BASE_NOT_TENANT_CERTIFIED', ... }), { status:503, ... }); }" || Details: (1) CORS wildcard '*' at L27, spread into every response. (2) In-function auth present, L81-94. (3) auth_kind=getUser (L89 supabaseAdmin.auth.getUser(token)). (4) YES returns 401 on failure: L90-93 `if (authError || !user) { return new Response(JSON.stringify({ error: 'Authentication failed' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }`. (5) CRITICAL: hard-disabled BEFORE auth. isTelnyxKnowledgeBaseTenantCertified() hardcoded `return false` (L33-35); guard L64-74 returns 503 to EVERY caller (anon and authed) before any DB or Telnyx call. anon_reachable=no for any privileged capability — anon only ever receives the inert 503 stub. (6) priv_side_effect=none reachable.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:27
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:33-35
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:64-74
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:81-94
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:77-79
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:130-143

**validation**

Read entire 416-line file in one pass; verified every claim against exact line numbers and confirmed execution ordering: OPTIONS L56 > guard L64-74 > try/env L76-79 > auth L81-94 > action switch L103-404. Guard provably precedes auth and all provider/DB calls.

**open_questions**

- Was the 503 disabled guard recently added (is a pre-guard version still deployed)?
- Does supabase/config.toml set verify_jwt for this function?

**edge_cases_considered**

- OPTIONS preflight handled before guard (L56) — returns bare corsHeaders, no auth, no data
- Guard precedes auth (L64-74 vs L81-94) so 503 fires for both anon and authed callers

**what_i_did_not_check**

- supabase/config.toml / platform verify_jwt setting
- whether isTelnyxKnowledgeBaseTenantCertified is patched elsewhere
- whether the function is currently deployed or older versions still serve traffic
- sibling functions sharing the CORS/auth pattern (out of node scope)

**confidence**: high