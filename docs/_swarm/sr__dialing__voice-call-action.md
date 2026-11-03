# sr::dialing::voice-call-action

- status: completed
- tldr: voice-call-action: uses-service-role YES (L55/58); disable gate ABSENT; caller VERIFIED (L51/60/86/93-98).

Audited C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts (181 lines, full read). Deliverable row:
C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:55 | uses-service-role | disabled:ABSENT | caller-verified: VERIFIED | evidence L55 env SUPABASE_SERVICE_ROLE_KEY + L58 createClient(url,serviceRoleKey); L51-52 Authorization header->401; L60 auth.getUser(token)->401; L86+93-98 org derived server-side from call_logs.organization_id + organization_users membership, 404 if none (L100); client body never supplies org_id/organization_id/campaign_id. No isXCertified()/503 gate exists in this file.
Validation: full-file read + line-by-line cross-check. Blockers: none. Follow-ups: locate the function that actually has the isXCertified+503 gate; check _shared/voice-provider.ts for provider.action org-trust.

## Artifact

**Findings**

(1) uses-service-role = YES: line 55 reads Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); line 58 createClient(supabaseUrl, serviceRoleKey) instantiates the admin client used for all reads/writes. (2) disable gate = ABSENT: no isXCertified() function and no 503 anywhere in the 181 lines; grep-in-read confirms no 'isXCertified', 'certified', or 503. The hardcoded disable gate described in the task does NOT exist in this file (THEORY: it lives in another function or was removed). (3) caller-verified = VERIFIED: line 51 reads Authorization header, 401 if missing (line 52); line 60 supabaseAdmin.auth.getUser(token) validates the JWT, 401 on failure (61-68). Organization is derived SERVER-SIDE from the call_logs row (line 86 selects organization_id; lines 93-98 membership check on organization_users with user_id=user.id AND organization_id=callLog.organization_id; 404 if no membership line 100). Client body supplies only call_log_id, action, digits, to, provider_call_id (77-81, 111, 161-162) - never org_id/organization_id/campaign_id. All writes additionally filter by organization_id from the row (128, 172).

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:55 - const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:58 - const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:51-52 - const authHeader = req.headers.get('Authorization'); if (!authHeader) return fail('UNAUTHENTICATED',...,401)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:60 - const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:86-97 - select organization_id from call_logs row, then membership check .eq('user_id', user.id).eq('organization_id', callLog.organization_id)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call-action/index.ts:100 - if (!membership) return fail('CALL_NOT_FOUND',...,404)
- no 'isXCertified' / 'certified' / 503 anywhere in the 181 lines

**validation**

Read all 181 lines directly; cross-checked each claim against exact line/snippet. Confirmed absence of isXCertified/503 by reading full file.

**open_questions**

- Which other supabase function (if any) carries the isXCertified(){return false} + 503 gate the task assumed was here?

**edge_cases_considered**

- client-supplied org fields (none consumed)
- missing Authorization header (401 at line 52)
- call_log not found (404 line 90)
- no org membership (404 line 100)

**what_i_did_not_check**

- _shared/voice-provider.ts internals (getProvider/isVoiceAction/providerCallIdColumn; whether provider.action does any client-org trust)
- _shared/utils.ts corsHeaders and whether anon client body org fields are consumed elsewhere in the call path
- Whether organization_users membership is the only authorization layer (no role/scope check e.g. admin-only vs teammate)

**confidence**: high