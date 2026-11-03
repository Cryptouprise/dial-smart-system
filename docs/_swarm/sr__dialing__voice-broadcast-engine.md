# sr::dialing::voice-broadcast-engine

- status: completed
- tldr: voice-broadcast-engine: service-role yes (666/680), hard-disabled 503 (637/647), caller VERIFIED via getUser+user.id (1030/1045); process_active is service-only.

Audited C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-engine/index.ts (2452 lines, read-only).

DELIVERABLE ROW:
.../voice-broadcast-engine/index.ts:647 | uses-service-role | disabled | caller-verified: VERIFIED | evidence: index.ts:666 `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` + index.ts:680 `createClient(supabaseUrl, supabaseKey)`; index.ts:636-637 `isVoiceBroadcastSurfaceTenantCertified(){return false}` -> index.ts:647 gate returns 503 (index.ts:654); second 503 gate index.ts:690-700; non-cron actions use `supabase.auth.getUser(token)` index.ts:1030 and scope by server-side `user.id` index.ts:1045. No organization_id/org_id/campaign_id trust anywhere.

(1) Service role: FACT - index.ts:666 + index.ts:680. No anon key in file.
(2) Disable gate: FACT - hardcoded `return false` at index.ts:637; 503 at index.ts:647-656 runs at handler top before any action/auth, so the WHOLE surface is disabled; redundant 503 at index.ts:690-700.
(3) Caller: VERIFIED for user actions; the only unauthenticated branch is `process_active` (index.ts:702-708, comment "without requiring user auth") which is SERVICE-ONLY (service role, no user/org filter). Client-supplied org/campaign ids are not trusted (only action/broadcastId/queueItemId/digit/testBatchSize destructured, index.ts:683).

Validation: findstr + direct line reads 634-710 and 1000-1129.
Did NOT check: config.toml verify_jwt, RLS policies, the "canonical provider boundary" modules, sibling functions.

## Artifact

**Findings**

DELIVERABLE ROW: C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-engine/index.ts:647 | uses-service-role | disabled | caller-verified: VERIFIED | evidence: index.ts:666 'const supabaseKey = Deno.env.get(SUPABASE_SERVICE_ROLE_KEY)' + index.ts:680 'createClient(supabaseUrl, supabaseKey)' (service role); index.ts:636-637 'function isVoiceBroadcastSurfaceTenantCertified(): boolean { return false; }' -> index.ts:647 gate returns HTTP 503 at index.ts:654 (VOICE_BROADCAST_SURFACE_NOT_TENANT_CERTIFIED); second 503 gate index.ts:690-700 for process_active/start (VOICE_BROADCAST_EGRESS_NOT_CERTIFIED); non-cron actions VERIFY caller at index.ts:1029-1033 supabase.auth.getUser(token) then scope server-side at index.ts:1041-1046 '.eq(user_id, user.id)'; no organization_id/org_id/campaign_id trust anywhere. || (1) Service role: FACT - index.ts:666 reads SUPABASE_SERVICE_ROLE_KEY; index.ts:680 builds createClient with it; no SUPABASE_ANON_KEY in file. (2) Disable gate: FACT - index.ts:636-637 hardcoded return false; index.ts:647-656 returns 503 unconditionally at handler top (before any action/auth) so whole surface disabled; second 503 gate index.ts:690-700 blocks egress. (3) Caller verification: FACT - only non-auth path is action==='process_active' (index.ts:702-704, comment 'cron/service-role triggered ... without requiring user auth') which queries ALL active broadcasts (index.ts:708) via service-role client with no user/org filter (SERVICE-ONLY branch); all other actions verify JWT via supabase.auth.getUser(token) (index.ts:1030) and derive ownership from server-side user.id (index.ts:1045). Client body destructured only for action/broadcastId/queueItemId/digit/testBatchSize (index.ts:683); client org/campaign ids not trusted and absent from file.

**evidence**

- index.ts:666
- index.ts:680
- index.ts:636-637
- index.ts:647-656
- index.ts:690-700
- index.ts:683
- index.ts:702-708
- index.ts:1029-1033
- index.ts:1041-1046

**validation**

findstr /N over index.ts for SERVICE_ROLE_KEY, certified, createClient, auth.getUser, Authorization, organization, org_id, campaign_id, user_id; direct line reads 634-710, 1000-1129. Grep hxts cross-checked against line-numbered reads.

**open_questions**

- Is process_active reachable externally or only via private DB cron/schedule invoking with service role? File shows no caller auth on that branch.
- Does supabase/config.toml set verify_jwt=false for this function (platform-level JWT gate)?

**edge_cases_considered**

- OPTIONS preflight short-circuits before the gate (index.ts:641-643) - not caller data, harmless.
- Second egress gate (index.ts:690-700) duplicates the surface gate for process_active/start; both return 503.
- process_active branch reaches Supabase with service role and NO user scope - a service-only trust path if the gate were lifted.

**what_i_did_not_check**

- supabase/config.toml verify_jwt / JWT settings for this function
- RLS policies on voice_broadcasts, broadcast_queue, dnc lists
- the 'canonical provider boundary' / contact-safety / billing modules referenced in comments
- sibling functions in dial-smart-system (only this file audited)
- whether process_active is invoked by an authenticated scheduler

**confidence**: high