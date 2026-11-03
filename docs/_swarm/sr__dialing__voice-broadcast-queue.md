# sr::dialing::voice-broadcast-queue

- status: completed
- tldr: voice-broadcast-queue: uses service-role, hard-disabled (503), caller auth VERIFIED server-side (user_id from bearer token).

Audited C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-queue/index.ts (461 lines), read-only.

ROW: voice-broadcast-queue/index.ts:9 | uses-service-role: YES | disabled: YES | caller-verified: VERIFIED | evidence: index.ts:32 `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` + index.ts:38 `createClient(supabaseUrl, supabaseKey)`; index.ts:9-11 `isVoiceBroadcastQueueTenantCertified(){return false}` gate at index.ts:18 returns 503 (index.ts:19-23); index.ts:41-45 `supabase.auth.getUser(token)` after Bearer header check index.ts:26-29; ownership derived server-side `.eq('user_id', user.id)` at index.ts:73-78; client body (index.ts:47) carries no org_id/organization_id/campaign_id.

## Artifact

**Findings**

uses-service-role: TRUE (index.ts:32 reads SUPABASE_SERVICE_ROLE_KEY; index.ts:38 createClient(supabaseUrl, supabaseKey); no anon path). disabled: TRUE (hardcoded gate isVoiceBroadcastQueueTenantCertified(){return false} at index.ts:9-11, invoked index.ts:18, returns 503 VOICE_BROADCAST_QUEUE_NOT_TENANT_CERTIFIED index.ts:19-23, short-circuits before auth). caller-verified: VERIFIED (requires Authorization header index.ts:26-29; token via replace index.ts:41; supabase.auth.getUser(token) index.ts:42, rejects on error/no user index.ts:43-45; ownership derived server-side user_id=user.id at index.ts:73-78 and index.ts:91-96; client body index.ts:47 = action/broadcastId/leadIds/phoneNumbers/itemIds, no org_id/organization_id/campaign_id trusted).

**evidence**

- index.ts:32 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
- index.ts:38 const supabase = createClient(supabaseUrl, supabaseKey);
- index.ts:9-11 function isVoiceBroadcastQueueTenantCertified(): boolean { return false; }
- index.ts:18-23 gate -> status 503, disabled:true, error_code VOICE_BROADCAST_QUEUE_NOT_TENANT_CERTIFIED
- index.ts:41-45 token=authHeader.replace('Bearer ',''); supabase.auth.getUser(token); if (authError||!user) throw Unauthorized
- index.ts:73-78 from('voice_broadcasts').select('*').eq('id',broadcastId).eq('user_id',user.id).maybeSingle()
- index.ts:91-96 from('leads')...eq('user_id',user.id)
- index.ts:47 body fields = action, broadcastId, leadIds, phoneNumbers, itemIds

**validation**

Read full 461-line file in one pass; every claim cites a line. RESEARCH ONLY: no execution, no live calls, no secrets printed.

**open_questions**

- health_check block index.ts:50-62 is unreachable while disabled gate index.ts:18 precedes it; confirm intended.
- DB-level RLS on broadcast_queue/voice_broadcasts not inspected; server-side user_id filters are application-level only.

**what_i_did_not_check**

- Did not sweep sibling edge functions for the same disabled-gate pattern.
- Did not verify Supabase RLS policies on voice_broadcasts/broadcast_queue/leads/dnc_list.
- Did not check for stale callers still invoking this 503 endpoint.

**confidence**: high