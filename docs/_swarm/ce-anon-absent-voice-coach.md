# ce-anon-absent-voice-coach

- status: completed
- tldr: 10/10 functions have real in-function guards; anon_reachable=no for all. Weakest: assistable-make-call (no org check, paid call blocked only by hard-coded false flag).

Audited anon reachability of 10 functions absent from supabase/config.toml (default verify_jwt=true). Result: all 10 have a real in-function auth guard -> anon_reachable=no for every one. Rows (as requested):
coach-decide | cors_wildcard=yes@26 | in_func_auth=yes@90 | auth_kind=getUser | anon_reachable=no | priv_side_effect=service-role fetch disposition-router w/ Bearer serviceKey (L286-295) + coach_move_stage/merge_custom_fields RPC + leads update | note=`if (authError || !user) return json({ error: 'Unauthorized' }, 401);` (L89-90) + membership L114-122
coach-suggest | cors_wildcard=yes@22 | in_func_auth=yes@96 | auth_kind=getUser | anon_reachable=no | priv_side_effect=PAID LLM call L233 + service-role coach_proposals insert L270 | note=`if (authError || !user) return json({ proposals: [], error: 'Unauthorized' }, 401);` (L95-96) + membership L127-135
voice-call | cors_wildcard=yes@_shared/utils.ts:12(import idx:18) | in_func_auth=yes@59 | auth_kind=getUser | anon_reachable=no | priv_side_effect=provider.startOutbound real outbound PSTN call L167 + insert L147 | note=`getUser(token); if (authError || !user) { return ... 401 }` (L58-66) + authorizeOrganizationContext L83
voice-call-action | cors_wildcard=yes@_shared/utils.ts:12(import idx:22) | in_func_auth=yes@61 | auth_kind=getUser | anon_reachable=no | priv_side_effect=provider.action hold/mute/dtmf/transfer L150 + register_provider_call L124-144 | note=`getUser(token); if (authError || !user) { return ... 401 }` (L60-68) + membership L93-100
voice-call-events | cors_wildcard=yes@25 | in_func_auth=yes@222 | auth_kind=ed25519 | anon_reachable=no | priv_side_effect=service-role call_logs writes + append_call_live_transcript RPC | note=`if (!valid) { ... return json({ error: 'Invalid webhook signature' }, 401); }` (L221-224; no-key -> 503 L217-219)
voice-token | cors_wildcard=yes@_shared/utils.ts:12(import idx:11) | in_func_auth=yes@44 | auth_kind=getUser | anon_reachable=no | priv_side_effect=provider.mintToken browser-phone token L76 | note=`getUser(token); if (authError || !user) { return ... 401 }` (L43-51) + authorizeOrganizationContext L70
assistable-make-call | cors_wildcard=yes@15 | in_func_auth=yes@74 | auth_kind=getUser|service-role-bearer | anon_reachable=no | priv_side_effect=PAID Assistable outbound fetch L147-154 but HARD-DISABLED (certified=false L21-23 -> 503 L101-111); insert L180 | note=L64 `if (token === supabaseServiceKey)` bypass; else L73-74 getUser -> 401. NO org check.
twilio-voice-status | cors_wildcard=yes@18 | in_func_auth=yes@35 | auth_kind=other | anon_reachable=no | priv_side_effect=service-role call_logs status/recording updates L96-100 | note=`if (!(await validateTwilioWebhook(req, rawBody))) { return json({ error: 'Invalid Twilio signature' }, 403); }` (L35-37)
twilio-voice-transcription | cors_wildcard=yes@19 | in_func_auth=yes@36 | auth_kind=other | anon_reachable=no | priv_side_effect=RPC append_call_live_transcript L75-82 | note=same signature guard (L36-38)
twilio-voice-twiml | cors_wildcard=yes@29 | in_func_auth=yes@65 | auth_kind=other | anon_reachable=no | priv_side_effect=binds provider_call_id + returns TwiML placing real outbound <Dial> (L149-156) | note=`if (!(await validateTwilioWebhook(req, rawBody))) { return twiml('<Reject/>', 403); }` (L65-67)

Key fact: the public anon key passes verify_jwt (signed JWT) but fails getUser (no sub) -> 401; safety rests entirely on the in-function guard. Weakest is assistable-make-call (no org check; paid call only blocked by a hard-coded false flag).

## Artifact

**Findings**

All 10 functions carry a REAL in-function auth guard (in_func_auth=yes), so anon_reachable=no for every one, despite default verify_jwt=true accepting the public anon key at the platform gate. Two guard families: (1) getUser on the caller bearer token (coach-decide, coach-suggest, voice-call, voice-call-action, voice-token, assistable-make-call); (2) provider webhook signature (voice-call-events = Telnyx Ed25519; twilio-voice-status/transcription/twiml = Twilio HMAC-SHA1). The anon key fails getUser: the anon key is a signed JWT with role=anon and no sub claim, so supabase.auth.getUser() errors and the guard returns 401 - a browser holding ONLY the anon key reaches no privileged side effect in these 10. All 10 set Access-Control-Allow-Origin '*' (7 literal in-file; voice-call, voice-call-action, voice-token inherit from _shared/utils.ts:12); wildcard CORS is not the exploitable vector because the guard is server-side. assistable-make-call is the weakest: NO organization/membership check (unlike the voice-* set which calls authorizeOrganizationContext), accepts getUser OR token===service-role (L64), then calls the PAID Assistable outbound endpoint; it is currently safe only because isAssistableEgressCertified() is hard-coded false (L21-23) -> 503 at L101-111 before the fetch. If that flag flips, any authenticated user in any org can trigger paid outbound calls with arbitrary assistant_id/location_id/contact_id. voice-call/-action/-token use a service-role supabaseAdmin client to call auth.getUser(token) but still pass the caller token, so the service-role client is not a bypass. coach-decide forwards to disposition-router with Bearer serviceKey (L286-295); that downstream router has a service-role bypass, but it is not reachable by an anon caller here.

**evidence**

- coach-decide/index.ts:26 cors '*'; :89-90 getUser(401); :114-122 membership; :286-295 serviceKey fetch; :350/:370/:387 privileged RPC/write
- coach-suggest/index.ts:22 cors '*'; :95-96 getUser(401); :127-135 membership; :233 PAID chatJSON; :270 insert
- voice-call/index.ts:18 imports corsHeaders; _shared/utils.ts:12 '*'; :58-66 getUser(401); :83 authorizeOrganizationContext; :147 insert; :167 startOutbound
- voice-call-action/index.ts:22 import; :60-68 getUser(401); :93-100 membership; :124-144 register; :150 provider.action
- voice-call-events/index.ts:25 cors '*'; :221-225 Ed25519 verify(401); :217-219 503 no-key; :185 RPC; :199-203 write
- voice-token/index.ts:11 import; :43-51 getUser(401); :70 authorizeOrganizationContext; :76 mintToken
- assistable-make-call/index.ts:15 cors '*'; :21-23 certified=false; :64 service-role bypass; :73-74 getUser(401); :101-111 503; :147-154 PAID fetch; :180 insert
- twilio-voice-status/index.ts:18 cors '*'; :35-37 signature(403); _shared/twilio.ts:286-307 validateTwilioWebhook
- twilio-voice-transcription/index.ts:19 cors '*'; :36-38 signature(403); :75-82 RPC
- twilio-voice-twiml/index.ts:29 cors '*'; :65-67 signature(403); :149-156 Dial TwiML
- supabase/config.toml: none of the 10 names appear in any [functions.*] block (grep of config.toml lines 3-448), so default verify_jwt=true is in force

**validation**

Read all 10 index.ts files in full plus _shared/utils.ts (corsHeaders), _shared/tenant-context.ts (authorizeOrganizationContext), _shared/twilio.ts:286-307 (validateTwilioWebhook). Confirmed each guard returns a rejection (401/403) before any privileged call, and grep-confirmed all 10 are absent from supabase/config.toml so default verify_jwt=true is in force.

**open_questions**

- Is the project on legacy JWT anon keys or new sb_publishable_ keys? Either way getUser(anonKey) yields no user, but confirm the anon key cannot be crafted as a user JWT in this deployment.
- Does Supabase platform verify_jwt=true actually accept the anon key (expected yes, as a signed JWT) - if it rejects it these functions are doubly gated; untested live (no live calls permitted).
- For twilio-* webhooks: with verify_jwt=true and no config override, will Twilio/Telnyx requests (no JWT) be blocked at the platform gate before reaching the in-function signature check? Out of scope but operationally important.

**what_i_did_not_check**

- No live HTTP requests were made; anon-key rejection is derived from source logic, not an executed request.
- Downstream functions referenced by coach-decide (disposition-router, coach_move_stage RPC, merge_custom_fields RPC) were NOT read - only their call sites in coach-decide.
- The 3 functions importing corsHeaders (voice-call, voice-call-action, voice-token) were reasoned via the single shared definition; did not verify no per-function CORS override exists elsewhere.
- assistable-make-call's body.user_id (service-role path) has no org scoping - did not trace downstream to confirm blast radius if the egress flag is ever enabled.
- Did not review rate-limit correctness (in-memory checkRateLimit resets per isolate).

**confidence**: high