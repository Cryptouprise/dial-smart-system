# ce-live-api-gateway

- status: completed
- tldr: api-gateway live: verify_jwt=false (config.toml:444), NO gate in live bytes, only GET /v1/health public => health-200 CONFIRMED

ce-live-api-gateway DONE (research only, no writes/network).

VERDICT: health-200 claim CONFIRMED.

(a) config.toml:444 `verify_jwt = false` under [functions.api-gateway] (config.toml:441), launch-quarantine comment :442-443.
(b) REFUTED for this tree: LIVE functions-live/api-gateway/index.ts (1393 lines) has ZERO gate strings; grep EXTERNAL_API_NOT_CERTIFIED / API_SMS_TENANT_SCHEMA_NOT_CERTIFIED / NOT_CERTIFIED => none in either functions-live or functions/api-gateway copy. fc /b: byte-identical. The @149/@76 gates exist only in C:\Users\charl\Documents\Codex\...\work\*\ copies, NOT this repo (matches docs/_swarm/dw-status-activate.md:14).
(c) Exactly ONE public route: GET /v1/health (index.ts:87-93, before authenticateApiKey :98 and dispatch :110) => 200 {ok:true,version:"0.2.0"}. All other 20+ routes require a valid dsk_live_ key; auth at :98 via api-auth.ts (Bearer dsk_ -> SHA-256 key_hash lookup in api_keys -> scopes -> rate limit). dsk_live_ key grants scopes on the row; a `write`/`admin` key unlocks sms egress (POST /v1/sms :560), real dialing (POST /v1/calls :485; POST /campaigns/:id/force-dispatch :970), campaigns, and leads CRUD. Full per-route line table + scopes + side effects in artifact.

VALIDATION: full read of index.ts + api-auth.ts; fc /b compare; findstr gate grep; every router branch cited by line.
BLOCKERS: none. FOLLOW-UPS: (1) runtime probe not re-run; (2) confirm deployed live == functions-live bytes (v35 caveat); (3) which worktree carries the @149 gate; (4) api_keys default scopes / blast radius; (5) sibling `mcp` fn (verify_jwt=false) and utils.ts wire shape.

## Artifact

**Findings**

FINDINGS (live api-gateway).

(a) CONFIRMED. supabase/config.toml:441 is [functions.api-gateway]; config.toml:444 is `verify_jwt = false` (preceded by a launch-quarantine comment at :442-443). The Supabase platform JWT gate is OFF, so requests reach the function unauthenticated.

(b) REFUTED (for this working tree). The LIVE snapshot supabase/functions-live/api-gateway/index.ts (1393 lines) contains ZERO certification-gate strings. grep for EXTERNAL_API_NOT_CERTIFIED / API_SMS_TENANT_SCHEMA_NOT_CERTIFIED / NOT_CERTIFIED / 'certif' returns NO hits in either supabase/functions-live/api-gateway/index.ts or supabase/functions/api-gateway/index.ts. `fc /b` reports the two copies are BYTE-IDENTICAL. The gates cited by LIVE-VS-MAIN-GATES.md:21,53 (EXTERNAL_API_NOT_CERTIFIED@149, API_SMS_TENANT_SCHEMA_NOT_CERTIFIED@76) exist ONLY in other worktrees on disk (C:\Users\charl\Documents\Codex\...\work\{dial-smart-system,observer-control-plane,operator-command-center,...}\supabase\functions\api-gateway\index.ts @149/@76), NOT in this repo. Material divergence already flagged in docs/_swarm/dw-status-activate.md:14.

(c) Exactly ONE route is reachable with NO auth: GET /v1/health, handled at index.ts:87-93 BEFORE authenticateApiKey (:98) and before dispatch (:110). Returns successResponse({ok:true,version:'0.2.0',ts}); side-effect-free (only OPTIONS/CORS preflight at :69-73 is also auth-free). Every other route is auth-required: authenticateApiKey runs at :98 for all non-health requests and throws AuthenticationError before dispatch.

Auth mechanism (api-auth.ts): extractBearer (:41-46) reads `Authorization: Bearer <token>`; token must startWith('dsk_') (:55); SHA-256 hash (hashApiKey :18-22) looked up in api_keys by key_hash (:59); rejects missing/invalid/revoked (:67)/expired (:70); returns ctx {apiKeyId,userId,organizationId,scopes,rateLimitPerMinute} (:79-86); then per-key in-memory rate limit (:102). requireScope (api-auth.ts:96-110) enforces admin>write>read and <domain>:write => <domain>:read.

What a dsk_live_ key grants: whatever is in api_keys.scopes. A key with scope `write` (or `admin`) satisfies every write AND read check, so it grants: leads write, campaigns write (launch/pause/retry-failed/force-dispatch => causes REAL dialing via call-dispatcher :970), calls write (POST /v1/calls => REAL outbound call via outbound-calling :485), and sms write (POST /v1/sms => REAL SMS egress via sms-messaging :560). So YES - a broad-scope key grants sms egress, campaigns control, leads CRUD and calls (dial). A read-only/domain-scoped key grants only its domain.

ROUTE INVENTORY (dispatch() index.ts:151-218; ALL require a valid dsk_live_ key unless marked PUBLIC):
- PUBLIC  GET /v1/health (:87) - no auth, no gate.
- GET /v1/me (:153) - auth required, NO scope check.
- Leads: GET /v1/leads (:165, leads:read); POST /v1/leads (:166, leads:write; INSERT leads :282); GET /v1/leads/:id (:173, leads:read); PATCH /v1/leads/:id (:174, leads:write; UPDATE :313); POST /v1/leads/:id/dnc (:172, leads:write; UPDATE leads :320 + INSERT dnc_list :327); POST /v1/leads/search (:177, leads:read).
- Campaigns: GET /v1/campaigns (:180, campaigns:read); POST /v1/campaigns (:181, campaigns:write; INSERT :404); GET /v1/campaigns/:id (:187, campaigns:read); POST /launch (:188) & /pause (:189) (campaigns:write; UPDATE status :363); GET /validate (:190, campaigns:read); GET /live-stats (:191, campaigns:read); GET /disposition-breakdown (:192, campaigns:read); POST /retry-failed (:193, campaigns:write; UPDATE dialing_queues=>pending :938); POST /force-dispatch (:194, campaigns:write; UPDATE scheduled_at :962 + fetch call-dispatcher :970 = REAL dispatch); POST /dry-run (:195, campaigns:read; NO dispatch); GET /pre-launch-audit (:196, campaigns:read).
- Calls: GET /v1/calls (:200, calls:read); POST /v1/calls (:201, calls:write; REAL dial via outbound-calling :485); GET /v1/calls/stuck (:203, calls:read); GET /v1/calls/:id (:205, calls:read).
- SMS: GET /v1/sms (:208, sms:read); POST /v1/sms (:209, sms:write; REAL SMS egress via sms-messaging :560).
- Phone numbers: GET /v1/phone-numbers (:212, system:read); GET /v1/phone-numbers/health (:213, system:read).
- System: GET /v1/system/stats (:215, system:read); GET /v1/system/health-check (:216, system:read; INSERT api_key_audit_log :1249); GET /v1/credits/balance (:217, system:read).
- Unmatched path => NotFoundError (:218).

Side effects on every authenticated request: RPC touch_api_key (api-auth.ts:75) + INSERT api_key_audit_log (api-auth.ts:116); deepHealthCheck adds another audit row (:1249).

VERDICT: health-200 claim CONFIRMED - GET /v1/health on the LIVE snapshot returns HTTP 200 {ok:true,version:'0.2.0'} with no auth and no gate (verify_jwt=false config.toml:444; handler precedes authenticateApiKey index.ts:87 vs :98). Sub-claim 'main 503s before routing' is REFUTED for this repo's on-disk main copy (byte-identical to live, ungated).

**evidence**

- supabase/config.toml:441 [functions.api-gateway]
- supabase/config.toml:444 verify_jwt = false
- supabase/functions-live/api-gateway/index.ts:87-93 public health branch (before auth)
- supabase/functions-live/api-gateway/index.ts:98 authenticateApiKey(req, supabase)
- supabase/functions-live/api-gateway/index.ts:110 dispatch(path,...)
- supabase/functions-live/api-gateway/index.ts:151-218 dispatch router; :218 NotFoundError
- supabase/functions-live/api-gateway/index.ts:69-73 OPTIONS/CORS (no auth)
- supabase/functions-live/api-gateway/index.ts:42 VERSION = 0.2.0
- supabase/functions-live/api-gateway/_shared/api-auth.ts:41-46 extractBearer; :55 startsWith('dsk_'); :59 api_keys lookup; :96-110 requireScope
- fc /b of live vs main index.ts => 'no differences encountered'
- findstr NOT_CERTIFIED/EXTERNAL_API/certif over both copies => no output (exit 1)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:21,53 (claim source)
- docs/_swarm/dw-status-activate.md:14 (prior agent already found gate absent from both disk copies)

**validation**

Read the full 1393-line live index.ts and the 130-line api-auth.ts. Byte-compared live vs main api-gateway copies with `fc /b` (identical). Grepped both copies for all certification-gate strings (none). Enumerated every router branch by exact line via findstr on the dispatch/health conditions and cross-checked each handler's requireScope call. No runtime HTTP probe was re-run (research-only, no network).

**open_questions**

- Is the DEPLOYED live api-gateway really these functions-live bytes (v35)? Snapshot timestamps match the 2026-07-01 deploy, but no get_edge_function source fetch succeeded in the prior audit (LIVE-VS-MAIN-GATES.md:53 caveat).
- Which worktree/commit actually carries the EXTERNAL_API_NOT_CERTIFIED@149 gate, and is any of it reachable as repo 'main' (GitHub d370432f)? On this tree main==live==ungated.

**what_i_did_not_check**

- No live HTTP probe (curl GET /v1/health, or anon-key POST to an authed route) to confirm deployed runtime behaviour.
- Did not inspect the sibling `mcp` function (also verify_jwt=false) or whether it proxies api-gateway.
- Did not verify which git branch/commit the functions-live snapshot came from, nor whether sms-messaging/outbound-calling/call-dispatcher also lack their gates in the same snapshot.
- Did not enumerate api_keys default scopes or whether any seed key carries admin/write (decides real blast radius of the anon surface).
- Did not read _shared/utils.ts errorResponse/corsHeaders to confirm the exact 401/403 wire shape or whether CORS allows cross-origin browser calls.

**confidence**: high