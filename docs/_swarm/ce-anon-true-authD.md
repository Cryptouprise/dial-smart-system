# ce-anon-true-authD

- status: completed
- tldr: ce-anon-true-authD: 6 rows done. All 6 do in-func getUser auth; only 2 return 401, other 4 return 500. All 6 inert behind 503 cert gates (anon_reachable=no).

ce-anon-true-authD DONE. Read ~50 lines around each getUser line (plus handler head for CORS/cert-gate and tail for outer catch) in the 6 functions. ROWS:

validate-phone-numbers | cors_wildcard=yes@5 | in_func_auth=yes@104 | auth_kind=getUser | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=Twilio inventory import/mutate/delete across sibling company accounts; reads provider_credentials, writes phone_numbers | note=L105 "if (authError || !user) { return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 ...}) }"; also top gate L67-69 isProviderPhoneInventoryTenantCertified()=>false -> 503 @78

voice-broadcast-engine | cors_wildcard=yes@6 | in_func_auth=yes@1030 | auth_kind=getUser | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=originates Twilio/Telnyx/Retell outbound broadcast calls; mutates voice_broadcasts + broadcast_queue | note=L1031 "if (authError || !user) { throw new Error('Unauthorized'); }" -> outer catch L2442-2447 status: 500 (NOT 401/403); whole surface disabled L647-656 503; start/process_active 503 @690-699

voice-broadcast-queue | cors_wildcard=yes@5 | in_func_auth=yes@42 | auth_kind=getUser | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=mutates broadcast_queue (add/clear/reset/retry items), reads voice_broadcasts | note=L43 "if (authError || !user) { throw new Error('Unauthorized'); }" -> outer catch L451-458 status: 500 (NOT 401/403); top gate L9-10 false -> 503 @18

voice-broadcast-tts | cors_wildcard=yes@5 | in_func_auth=yes@54 | auth_kind=getUser | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=ElevenLabs TTS spend + writes audio_url to voice_broadcasts | note=L55 "if (authError || !user) { throw new Error('Unauthorized'); }" -> outer catch L199-206 status: 500 (NOT 401/403); top gate L9-10 false -> 503 @20

yellowstone-integration | cors_wildcard=yes@6 | in_func_auth=yes@127 | auth_kind=getUser | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=writes/updates yellowstone_settings (encrypted API key), sync actions | note=L128 "if (!user) { return new Response('Unauthorized', { status: 401, headers: corsHeaders }); }" (checks only !user, ignores error object); top gate L92-93 false -> 503 @101

backfill-call-agent-data | cors_wildcard=yes@5 | in_func_auth=yes@59 | auth_kind=getUser (plus service-role-bearer alt @50) | auth_rejects_on_failure=yes | anon_reachable=no | priv_side_effect=updates call_logs.agent_id via Retell API for a user_id | note=L60 "if (error || !user) { throw new Error('Invalid authentication token'); }" -> outer catch L189-195 status: 500 (NOT 401/403); L50 "if (token === supabaseServiceKey)" trusts body.user_id (anon cannot forge service key); top gate L9-10 false -> 503 @18

VALIDATION: confirmed exact status codes + gate ordering before/after getUser in all 6. BLOCKERS: none. FOLLOW-UP: 4 of 6 return 500 (not 401/403) on auth failure; all 6 are currently inert behind cert gates returning false, so check deployed config.toml verify_jwt and whether any cert gate flips to true on deploy.

## Artifact

**Findings**

All 6 functions declare corsHeaders with 'Access-Control-Allow-Origin': '*' (wildcard CORS) and use an in-function auth check (none rely solely on verify_jwt=true). Only validate-phone-numbers (L105-109) and yellowstone-integration (L128-130) RETURN HTTP 401 on getUser failure; voice-broadcast-engine, voice-broadcast-queue, voice-broadcast-tts and backfill-call-agent-data THROW new Error('Unauthorized') and their outer catch returns status 500, NOT 401/403. backfill-call-agent-data also has a service-role bearer bypass (token === SUPABASE_SERVICE_ROLE_KEY, L50) then trusts body.user_id, which an anon browser cannot forge. Crucially, every one of the 6 functions has a top-of-handler isXCertified() gate hardcoded to 'return false' that short-circuits with HTTP 503 disabled BEFORE any auth or privileged work, so no privileged side effect is anon-reachable in this source. GoTrue getUser() rejects a token lacking a sub claim, so the public anon key fails the auth check in all 6.

**evidence**

- validate-phone-numbers/index.ts:5 cors wildcard; :67-69 isProviderPhoneInventoryTenantCertified()=>false; :78 gate 503; :104 getUser; :105-108 'if (authError || !user) { return ... status: 401'
- voice-broadcast-engine/index.ts:6 cors wildcard; :636-638 cert gate false; :647-656 503; :690-699 503 for process_active/start; :1030 getUser; :1031-1032 if (authError || !user) throw new Error('Unauthorized'); :2442-2447 outer catch status: 500
- voice-broadcast-queue/index.ts:5 cors wildcard; :9-10 cert gate false; :18-23 503; :42 getUser; :43-44 throw Unauthorized; :451-458 outer catch status: 500
- voice-broadcast-tts/index.ts:5 cors wildcard; :9-10 cert gate false; :20-29 503; :54 getUser; :55-56 throw Unauthorized; :199-206 outer catch status: 500
- yellowstone-integration/index.ts:6 cors wildcard; :92-93 cert gate false; :101-105 503; :127 getUser; :128-129 if (!user) return new Response('Unauthorized',{status:401})
- backfill-call-agent-data/index.ts:5 cors wildcard; :9-10 cert gate false; :18-22 503; :50 if (token === supabaseServiceKey) service-role bypass; :59 getUser; :60-61 throw Invalid authentication token; :189-195 outer catch status: 500

**validation**

Read ~50 lines around each getUser line plus head (CORS + cert gate) and tail (outer catch) for all 6 files; confirmed exact status codes and gate ordering before/after getUser.

**open_questions**

- Do the isXCertified() gates remain 'return false' in the DEPLOYED versions, or are any flipped to true on deploy (which would re-expose the auth-only paths whose failure returns 500 rather than 401/403)?

**what_i_did_not_check**

- The deployed Supabase config.toml verify_jwt flags per function (source index.ts was the scope).
- Any shared auth helper under supabase/functions/_shared used indirectly.
- Whether returning 500 instead of 401 on auth failure is exploitable as an oracle beyond status-code disclosure.
- The other ~105 functions in the functions directory (out of scope for this node).

**confidence**: high