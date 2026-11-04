# ce-anon-true-authC-retell-agent-management

- status: completed
- tldr: retell-agent-management is a hard-disabled 503 kill switch: anon_reachable=no, auth 401 path at L64-L68 is unreachable dead code

retell-agent-management: single-row verdict + critical finding.

FUNC | cors_wildcard=yes@L5 | in_func_auth=yes@L55-L69 (dead code, unreachable) | auth_kind=getUser@L63 with service-role-bearer fallback@L66 | auth_rejects_on_failure=yes@L64-L68 (returns 401) but UNREACHABLE | anon_reachable=no | priv_side_effect=none-reachable | note=<kill switch L44-L52 returns 503 PROVIDER_ADMIN_NOT_CERTIFIED unconditionally before auth>

The handler returns status:503 at L44-L52 for EVERY request (only OPTIONS/CORS at L40-42 precedes it). The auth block (L54-L69) and the whole action switch + admin Retell API calls (L73-L87, apiKey=RETELL_AI_API_KEY -> https://api.retellai.com) are DEAD CODE below the unconditional return. So although the 401-on-getUser-failure guard exists at L64-L68, an anon caller never reaches it; they get 503. Clickjacking-style exposure is nil in the deployed source form.

Validation: static read of index.ts L1-160 (RESEARCH ONLY; no commands/APIs). Confirmed ordering: unconditional 503 return precedes auth block.

## Artifact

**Findings**

FUNC=retell-agent-management. Single pipe row: FUNC | cors_wildcard=yes@L5 | in_func_auth=yes@L55-L69(dead code,unreachable) | auth_kind=getUser(L63) with service-role-bearer fallback(L66) | auth_rejects_on_failure=yes@L64-L68(returns 401) BUT UNREACHABLE | anon_reachable=no | priv_side_effect=none-reachable(dead code below would call api.retellai.com as admin with RETELL_AI_API_KEY,L73-L87) | note=<kill switch L44-L52 returns 503 PROVIDER_ADMIN_NOT_CERTIFIED unconditionally before auth and before body parse>. CRITICAL: the handler returns status:503 at L44-52 for EVERY request (after CORS OPTIONS at L40-42). The auth block (L54-69) and the entire action switch/Retell API calls (L71-L87+) are DEAD CODE below that unconditional return. So although a 401-on-getUser-failure path exists at L64-L68, an anon caller never reaches it; they get 503 instead. priv_side_effect is therefore not reachable in the deployed form.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/retell-agent-management/index.ts:5 -> 'Access-Control-Allow-Origin': '*'
- index.ts:40-42 -> OPTIONS preflight returns null with corsHeaders
- index.ts:44-52 -> unconditional Response 503 {disabled:true,error_code:'PROVIDER_ADMIN_NOT_CERTIFIED'}
- index.ts:55-58 -> reads authorization header, 401 'Missing authorization' if absent
- index.ts:63 -> const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
- index.ts:64-68 -> if (authError || !user) { if (token !== supabaseServiceKey) { return ... status:401 } }
- index.ts:73-87 -> apiKey=RETELL_AI_API_KEY; headers Authorization Bearer apiKey; baseUrl='https://api.retellai.com'

**validation**

Static read of index.ts lines 1-160 (full guard + auth + first ~70 lines of switch). Confirmed the unconditional return at L44-52 precedes the auth block, so the 401 path is unreachable. No commands or APIs run (RESEARCH ONLY).

**open_questions**

- Is retell-agent-management deployed at a current revision matching this source, or is this file newer than what is live? (dead code below 503 suggests a deliberately neutered deploy)
- Do sibling retell-* functions (retell-call-webhook, calendar-integration) share the same 503 kill switch or remain live?
- Is get_llm/update_tools/delete_tool or list_voices reachable via another route (e.g. viasocket Retell connector) that bypasses this function?

**what_i_did_not_check**

- Deployed state/live revision of the function (source-only analysis)
- Whether SUPABASE_URL interpolation at L10/L13 leaks anything
- Lines 160-813 of the switch body (actions: update/delete/preview_voice/configure_calendar/test_chat/update_voicemail_settings/get_llm/update_tools/delete_tool/list_voices) - not read since all are unreachable dead code
- Whether other edge functions in dial-smart-system share the wildcard CORS + 503 pattern

**confidence**: high