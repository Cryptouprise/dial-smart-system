# ce-anon-true-authC-telnyx-scheduled-events

- status: completed
- tldr: telnyx-scheduled-events: CORS wildcard@18, auth yes@63, getUser+service-role@79/71, 401 on failure@80-84, anon=partial, disabled 503 gate@51.

telnyx-scheduled-events/index.ts analyzed (research-only, static read of all 328 lines). Row: FUNC=telnyx-scheduled-events | cors_wildcard=yes@18 | in_func_auth=yes@63 | auth_kind=other(getUser@79 + service-role-bearer@71) | auth_rejects_on_failure=yes@80-84 | anon_reachable=partial | priv_side_effect=none-while-disabled@51 (latent impersonation via body-supplied userId@75-77) | note=always-false cert gate L51 -> 503, plus 401 guard L80.

## Artifact

**Findings**

FUNC=telnyx-scheduled-events | cors_wildcard=yes@18 | in_func_auth=yes@63 | auth_kind=other(getUser@79 plus service-role-bearer@71) | auth_rejects_on_failure=yes@80-84 | anon_reachable=partial (invokable anonymously but 503@51-56 always short-circuits and missing header -> 401@64-68) | priv_side_effect=none-while-disabled@51 (latent: service-role bearer path L71-77 trusts body-supplied userId with no ownership check -> cross-tenant read/write on telnyx_scheduled_events L249-308 and Telnyx API egress L132/200/280) | note=guard L51 'if (!isTelnyxScheduledEventSurfaceCertified()) { return new Response(JSON.stringify({ success: false, disabled: true, error_code: "TELNYX_SCHEDULED_EVENT_SURFACE_NOT_CERTIFIED" ... }), { status: 503 ... }) }' and auth guard L80 'if (authError || !user) { return new Response(JSON.stringify({ error: "Authentication failed" }), { status: 401 ... }) }'

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:18 -> 'Access-Control-Allow-Origin': '*
- index.ts:17-20 corsHeaders object; :47-49 OPTIONS preflight returns corsHeaders
- index.ts:42-44 isTelnyxScheduledEventSurfaceCertified() returns false (constant)
- index.ts:51-56 503 TELNYX_SCHEDULED_EVENT_SURFACE_NOT_CERTIFIED gate short-circuits before any auth
- index.ts:63-68 missing Authorization -> 401 'Missing authorization'
- index.ts:70-77 token === serviceRoleKey -> isServiceRoleCall; userId = body.userId with no ownership validation
- index.ts:79-84 supabaseAdmin.auth.getUser(token); if (authError || !user) return 401 'Authentication failed'
- index.ts:88-100 schedule_call/schedule_sms additionally 503 TELNYX_SCHEDULED_EGRESS_NOT_CERTIFIED
- index.ts:132,200,280 Telnyx egress calls; :249-308 user_id-scoped DB reads/writes

**validation**

Static read of the full 328-line handler; every claim cites a line. No execution, no network, no writes (research-only).

**open_questions**

- Is isTelnyxScheduledEventSurfaceCertified() overridden or patched in any deploy variant (grep of repo needed)?
- Are there sibling copies of this function under other paths that differ?

**edge_cases_considered**

- OPTIONS preflight bypasses auth (L47-49) - returns 204 with wildcard CORS
- disabled 503 gate also carries CORS wildcard, so browsers can read disabled responses cross-origin
- service-role bearer path uses req.clone() for body (L75) then req.json() at L88 - clone prevents body double-read failure
- auth_kind is mixed: user-JWT path uses getUser; service-role path is a shared-secret bearer, so a leaked SUPABASE_SERVICE_ROLE_KEY yields full userId impersonation

**what_i_did_not_check**

- grep for other index.ts copies of telnyx-scheduled-events in the repo
- supabase/config.toml verify_jwt setting for this function (platform-level auth gate)
- whether SUPABASE_SERVICE_ROLE_KEY is rotated/exposed anywhere

**confidence**: high