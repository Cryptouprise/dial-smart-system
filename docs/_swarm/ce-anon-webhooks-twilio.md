# ce-anon-webhooks-twilio

- status: completed
- tldr: 7 Twilio webhooks audited: none anon-reachable; 1 gated by Twilio signature, 6 quarantined behind 503

Audited all 7 Twilio/call webhooks for anon-reachable privileged side effects. Result: 6 of 7 are launch-quarantined (unconditional 503 before any DB/provider call) and 1 (twilio-sms-webhook) requires a valid x-twilio-signature (fail-closed) before any service-role write. No function is reachable by a browser holding only the public anon key. All 7 have verify_jwt=false in config.toml (not an in-function guard). Only twilio-sms-webhook has a real in-function auth check (Twilio HMAC signature); inbound-transfer-webhook has an optional, currently-unreachable x-webhook-secret check.

## Artifact

**Findings**

twilio-sms-webhook | cors_wildcard=yes@9 | in_func_auth=yes@488-497 | auth_kind=signature | anon_reachable=no | priv_side_effect=service-role-db-write | note=before any DB access it runs verifyTwilioSignature which fails closed when TWILIO_AUTH_TOKEN is unset (L424-426) and rejects a bad/missing x-twilio-signature: `if (!signatureOk) { return new Response('Forbidden: invalid Twilio signature', { status: 403 ...` (L489-497); the live service-role path writes sms_messages/leads with SUPABASE_SERVICE_ROLE_KEY (L460-464, L605, L699).

twilio-inbound-handler | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=none | note=pure stub: L13-15 `never parse or act on an inbound provider request until its Twilio signature, receiving-number ownership, organization, IVR state, and durable event receipt are all proven`, then returns a static `<?xml ...?><Response><Hangup/></Response>` with status 503 (L16-26); no DB/provider side effect exists.

twilio-tts-audio | cors_wildcard=yes@9 | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=paid-provider-call | note=an unconditional `return new Response('TTS audio is not certified for launch', { status: 503 ...` (L42-49) precedes all logic, so the ElevenLabs fetch to api.elevenlabs.io using ELEVENLABS_API_KEY (L72-99) is unreachable dead code and cannot spend.

twilio-dtmf-handler | cors_wildcard=absent | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=none | note=L1-6 header comment `the legacy public handler did not verify Twilio request signatures and could originate a Retell transfer call from query/form data. It is intentionally side-effect free until signature verification ... are implemented`; Deno.serve returns a static TwiML `<Say>...<Hangup/></Response>` (L7-20) with NO corsHeaders object and no side effects.

twilio-amd-webhook | cors_wildcard=yes@5 | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=service-role-db-write | note=an unconditional `return new Response(JSON.stringify({ success:false, disabled:true, error_code:'UNSIGNED_WEBHOOK_NOT_CERTIFIED', ...` with status 503 (L32-40) precedes the try block, so the service-role DB writes (broadcast_queue L86-93, voice_broadcasts L103-108, leads L206-212) at L42+ are unreachable dead code.

call-tracking-webhook | cors_wildcard=yes@5 | in_func_auth=no | auth_kind=none | anon_reachable=no | priv_side_effect=service-role-db-write | note=an unconditional 503 `error_code:'UNSIGNED_WEBHOOK_NOT_CERTIFIED', error:'Legacy call-tracking callbacks are disabled until provider signatures and tenant binding are certified.'` (L134-142) precedes the service-role client (L145-152) and every write (broadcast_queue update L452-455, leads L499-504), so they are unreachable dead code.

inbound-transfer-webhook | cors_wildcard=yes@5 | in_func_auth=yes@146-155 | auth_kind=api-key | anon_reachable=no | priv_side_effect=service-role-db-write | note=contains an OPTIONAL shared-secret guard `if (webhookSecret) { const providedSecret = req.headers.get('x-webhook-secret'); if (providedSecret !== webhookSecret) { ... return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 ...` (L146-155, secret read at L139); it is skipped when INBOUND_TRANSFER_WEBHOOK_SECRET is unset and is itself unreachable behind the unconditional 503 at L126-134, so the service-role DB writes (L256-260 inbound_transfers, leads L376-380) never execute.

**evidence**

- twilio-sms-webhook/index.ts:9 wildcard CORS; :422-439 verifyTwilioSignature; :424-426 fail-closed; :428-432 x-twilio-signature; :488-497 403 guard; :460-464 service-role client; :605 sms_messages insert; :699 leads update
- twilio-inbound-handler/index.ts:4 wildcard CORS; :13-15 containment comment; :16-26 static 503 Hangup
- twilio-tts-audio/index.ts:9 wildcard CORS; :42-49 unconditional 503; :72-99 ElevenLabs fetch (unreachable)
- twilio-dtmf-handler/index.ts:1-6 comment; :7-20 Deno.serve static TwiML; no corsHeaders anywhere
- twilio-amd-webhook/index.ts:5 wildcard CORS; :32-40 unconditional 503; :86-108 and :178-212 service-role writes (unreachable)
- call-tracking-webhook/index.ts:5 wildcard CORS; :134-142 unconditional 503; :145-152 service-role client; :452-455 and :499-504 writes (unreachable)
- inbound-transfer-webhook/index.ts:5 wildcard CORS; :126-134 unconditional 503; :139 secret env; :146-155 x-webhook-secret 401 guard; :256-260 and :376-380 writes (unreachable)
- supabase/config.toml:11,237,240,255,272,336,339 verify_jwt=false for all 7 functions

**validation**

Read each of the 7 full index.ts files and grepped config.toml (all 7 = verify_jwt=false: L11,237,240,255,272,336,339). Confirmed no function imports _shared/utils.ts corsHeaders (each defines or omits its own corsHeaders). Confirmed 6 of 7 (tts-audio, amd, call-tracking, inbound-transfer, inbound-handler, dtmf) return before any privileged call so they have no live side effect; only twilio-sms-webhook has a real in-function signature guard and it rejects before DB access.

**open_questions**

- priv_side_effect for the quarantined functions is reported as the LATENT capability in the file (paid-provider-call / service-role-db-write) while anon_reachable=no captures that it is dead; if the coordinator wants strict observable-at-runtime semantics these five should read priv_side_effect=none.
- inbound-transfer-webhook in_func_auth is reported yes because the x-webhook-secret equality check structurally exists, but it is optional (skipped when the env var is unset) and currently unreachable; a strict live-guard reading would put it at no.
- Whether INBOUND_TRANSFER_WEBHOOK_SECRET and TWILIO_AUTH_TOKEN are set in the deployed environment cannot be determined from the repo.

**edge_cases_considered**

- Optional (not mandatory) auth guard in inbound-transfer-webhook
- Whether a precede-return 503 makes downstream side-effect code count as 'none' or 'latent'

**what_i_did_not_check**

- Deployed secret values (whether TWILIO_AUTH_TOKEN / INBOUND_TRANSFER_WEBHOOK_SECRET are set) - not in repo.
- RLS policies on sms_messages/leads/broadcast_queue (audited only the edge-function layer).
- Any other CORS origin set outside _shared/utils.ts in files not in this node's 7-function scope.
- Git history / whether an earlier non-quarantined version of these handlers is deployed live.

**confidence**: high