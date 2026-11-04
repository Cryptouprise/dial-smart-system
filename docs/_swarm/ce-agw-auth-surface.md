# ce-agw-auth-surface

- status: completed
- tldr: api-gateway: verify_jwt=false, wildcard CORS (reachable from ANY site), only dsk_ API key unlocks non-health routes; functions-live byte-identical.

api-gateway auth + browser reachability characterized (research only, no changes).

(a) config.toml:441 [functions.api-gateway], verify_jwt = false (line 444). Comment (442-443): "Launch-quarantined before database/provider access. The legacy dsk_live_ control plane can bypass certified queue lifecycle and retry contracts."

(b) index.ts:68 serve(). Public no-auth route = GET /v1/health (index.ts:87-93, returns before auth). OPTIONS preflight handled pre-auth (69-73). Auth gate = authenticateApiKey(req, supabase) at index.ts:98, then rate limit at :102. index.ts:38 imports only authenticateApiKey (no JWT path).

(c) api-auth.ts:50-87: extractBearer reads "Authorization: Bearer" (41-46); token must start with "dsk_" (55-57); SHA-256 hash (18-22) looked up in api_keys.key_hash (59); revoked/expiry checks 67-72; returns ctx 79-86; requireScope 96-110.

(d) utils.ts:8-12 corsHeaders: Access-Control-Allow-Origin: '*' (line 9), no Origin allowlist, no CSRF/Referer check (grep found zero).

CONCLUSION: browser-reachable cross-origin from ANY site (wildcard ACAO). Only credential accepted is a dsk_-prefixed key via Authorization: Bearer; Supabase JWT is NOT accepted. /v1/health is fully unauthenticated.

functions-live byte-identical: index.ts MD5 021A1B4F9B28B2CA8B53E0A836A06C56 (62621 B), api-auth.ts 1EDC68F4C96B3C519CF27D492DA751F3 (5194 B), utils.ts 67CCF8ADEB5DC8C037FA16C22E1EC150 (14151 B) - all identical in both trees.

VALIDATION: direct reads + exact line quotes; MD5+size of all 3 files in both trees; targeted grep for Origin/csrf/SameSite/Referer. No live network calls (research-only).
FOLLOW-UPS: (1) verify deployed project matches config.toml; (2) check whether any frontend bundle ships a dsk_ key (wildcard CORS would expose it); (3) inspect api_keys RLS/touch_api_key RPC grants.

## Artifact

**Findings**

(a) supabase/config.toml:441 declares [functions.api-gateway] with verify_jwt = false (line 444). Quoted comment (lines 442-443): 'Launch-quarantined before database/provider access. The legacy dsk_live_ control plane can bypass certified queue lifecycle and retry contracts.' So the Supabase platform does NOT enforce a JWT at the gateway for this function. (b) index.ts serve() begins at line 68. The public no-auth route is GET /v1/health, handled at index.ts:87-93 (returns before any auth). OPTIONS preflight is handled pre-auth at index.ts:69-73 returning headers: corsHeaders. The auth gate is authenticateApiKey(req, supabase) at index.ts:98, followed immediately by per-key rate limit at index.ts:102. index.ts:38 imports only {authenticateApiKey, logApiRequest, requireScope} from _shared/api-auth.ts; it never imports authenticateUser, so no Supabase-JWT path exists in this function. (c) A dsk_ key is validated in _shared/api-auth.ts:50-87: extractBearer reads 'Authorization: Bearer <token>' (api-auth.ts:41-46); token must start with 'dsk_' or AuthenticationError (api-auth.ts:55-57, 'expected dsk_live_...'); the plaintext is SHA-256 hashed (hashApiKey, api-auth.ts:18-22) and looked up in the api_keys table by .eq('key_hash', hash).maybeSingle() (api-auth.ts:59); failures throw on missing row (64-66), revoked_at (67-69), expiry (70-72); on success it returns ctx {apiKeyId,userId,organizationId,scopes,rateLimitPerMinute,keyName} (79-86) and fire-and-forget touch_api_key + audit log (73-78). requireScope(ctx,needed) enforces scopes (api-auth.ts:96-110). (d) _shared/utils.ts:8-12 exports corsHeaders with 'Access-Control-Allow-Origin': '*' (literal, line 9), Allow-Headers 'authorization, x-client-info, apikey, content-type' (line 10), Allow-Methods 'GET, POST, PUT, DELETE, OPTIONS' (line 11). CONCLUDED: api-gateway is browser-reachable cross-origin from ANY website (wildcard ACAO, no Origin allowlist, no CSRF/referer check anywhere in index.ts, api-auth.ts, or utils.ts - grep for Origin/csrf/SameSite/Referer returned zero matches other than the '*' literal). The ONLY credential that unlocks non-health routes is a dsk_-prefixed API key passed as Authorization: Bearer; a Supabase JWT is NOT accepted (it would fail the dsk_ prefix check at api-auth.ts:55-57). GET /v1/health (index.ts:87) is fully unauthenticated. functions-live/api-gateway is byte-identical to supabase/functions/api-gateway: index.ts MD5 021A1B4F9B28B2CA8B53E0A836A06C56 (62621 bytes, both), _shared/api-auth.ts MD5 1EDC68F4C96B3C519CF27D492DA751F3 (5194 bytes, both), _shared/utils.ts MD5 67CCF8ADEB5DC8C037FA16C22E1EC150 (14151 bytes, both).

**evidence**

- supabase/config.toml:441 [functions.api-gateway]
- supabase/config.toml:442-443 comment 'Launch-quarantined before database/provider access. The legacy dsk_live_ control plane can bypass certified queue lifecycle and retry contracts.'
- supabase/config.toml:444 verify_jwt = false
- supabase/functions/api-gateway/index.ts:68 serve(async (req)=>{
- supabase/functions/api-gateway/index.ts:69-73 OPTIONS -> new Response(null,{headers: corsHeaders}) before auth
- supabase/functions/api-gateway/index.ts:87-93 public GET /v1/health returns successResponse before any auth
- supabase/functions/api-gateway/index.ts:98 ctx = await authenticateApiKey(req, supabase)
- supabase/functions/api-gateway/index.ts:102 checkRateLimit(`apikey:${ctx.apiKeyId}`, ctx.rateLimitPerMinute, 60_000)
- supabase/functions/api-gateway/index.ts:38-39 imports authenticateApiKey (no authenticateUser) + corsHeaders from _shared/utils.ts
- supabase/functions/api-gateway/_shared/api-auth.ts:41-46 extractBearer parses Authorization: Bearer
- supabase/functions/api-gateway/_shared/api-auth.ts:55-57 rejects token not starting with 'dsk_'
- supabase/functions/api-gateway/_shared/api-auth.ts:18-22 hashApiKey SHA-256 hex
- supabase/functions/api-gateway/_shared/api-auth.ts:58-59 hash lookup in api_keys .eq('key_hash',hash).maybeSingle()
- supabase/functions/api-gateway/_shared/api-auth.ts:67-72 revoked_at / expires_at checks
- supabase/functions/api-gateway/_shared/api-auth.ts:96-110 requireScope
- supabase/functions/api-gateway/_shared/utils.ts:8-12 corsHeaders with Access-Control-Allow-Origin '*' (line 9)
- MD5 index.ts 021A1B4F9B28B2CA8B53E0A836A06C56 both trees (62621 bytes)
- MD5 api-auth.ts 1EDC68F4C96B3C519CF27D492DA751F3 both trees (5194 bytes)
- MD5 utils.ts 67CCF8ADEB5DC8C037FA16C22E1EC150 both trees (14151 bytes)
- grep Origin|csrf|CSRF|SameSite|Referer across the 3 api-gateway files: only match is utils.ts:9 ACAO '*'

**validation**

Read files directly and quoted exact lines; confirmed no imports of authenticateUser/JWT path in index.ts; computed MD5+size of all 3 files in both supabase/functions and supabase/functions-live (identical); grepped the 3 files for Origin/csrf/SameSite/Referer to confirm absence of an allowlist or CSRF check. Did NOT execute the live function (research-only, no network calls).

**open_questions**

- Is the Supabase platform-level setting in the DEPLOYED project actually verify_jwt=false for api-gateway (config.toml is the repo source of truth and may drift from the live project)?
- Does any webhook/portal UI embed a dsk_ key in client-side JS, which combined with ACAO '*' would expose the key to any origin?

**what_i_did_not_check**

- The deployed/running api-gateway config vs repo config.toml (no live Supabase project API call made)
- Whether any frontend bundle (src/**) ships a dsk_ key that the wildcard CORS would expose
- The api_keys table RLS/grants and whether touch_api_key RPC is restricted
- Rate-limit enforcement is per-instance in-memory (index.ts:99-101) - not assessed for bypass
- Other edge functions' CORS config (out of scope: only api-gateway requested)

**confidence**: high