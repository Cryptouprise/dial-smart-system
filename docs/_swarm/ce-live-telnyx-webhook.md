# ce-live-telnyx-webhook

- status: completed
- tldr: verify_jwt=false (:250); no cert gate in LIVE (main-only :172-174/:189); LIVE auth is single Ed25519 check that fails open when WEBHOOK_SECRET_TELNYX unset; anon POST drives service-role DB writes.

ce-live-telnyx-webhook: DONE. (a) verify_jwt=false confirmed at supabase/config.toml:250 (block [functions.telnyx-webhook] :247). (b) NO certification gate in LIVE bytes - grep for CERTIFIED/NOT_CERTIFIED = 0 matches; main-only gate is isTelnyxWebhookLifecycleCertified():false at supabase/functions/telnyx-webhook/index.ts:172-174 with 503 + error_code TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED at :189 (per LIVE-VS-MAIN-GATES.md:34). (c) LIVE authorisation = ONE optional Ed25519 check that FAILS OPEN: rejection at LIVE:134 only fires when WEBHOOK_SECRET_TELNYX is set; if unset, webhookSecret is null, rejection is skipped and replay guard (:146) is inert. No apikey/JWT check anywhere (those strings are CORS allow-headers only, :13). Unauthenticated POST can drive a service-role client (:178) into: broadcast_queue status/call_sid updates (call.initiated :213/:220, call.answered :248, call.hangup :330 incl retry requeue :322-324, AMD :395, ringing :412), voice_broadcasts counters (:339-346), leads status->contacted/next_callback_at=null (:355-365), sms_messages insert/status (:433/:449/:492/:512/:533), and returns attacker-influenced TeXML audio playback (:262-275). No direct outbound provider call in-file; indirect re-dial via retry requeue and sms_messages consumers.

## Artifact

**Findings**

(a) CONFIRMED verify_jwt=false. supabase/config.toml:247 declares [functions.telnyx-webhook]; config.toml:250 is verify_jwt = false (comment 248-249 says 'Launch-quarantined before body, environment, database, or provider access').
(b) NO certification gate in LIVE bytes. Directory+glob grep of supabase/functions-live/telnyx-webhook/index.ts for CERTIFIED and NOT_CERTIFIED returns 0 matches; there is no isTelnyxWebhookLifecycleCertified() and no 503 early return. LIVE goes from CORS preflight (LIVE:118-122) into the try (LIVE:123) and parses the body (LIVE:166). Main (supabase/functions/telnyx-webhook/index.ts) instead has isTelnyxWebhookLifecycleCertified(): boolean { return false; } at :172-174 and a 503 return with error_code 'TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED' at :189, matching docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:34 which lists the gate as MAIN-only. So LIVE is NOT lifecycle-quarantined.
(c) Authorisation in LIVE is a SINGLE optional Ed25519 signature check that FAILS OPEN. verifyTelnyxSignature (LIVE:82-115) returns false (non-rejecting) when the signature/timestamp header is missing (LIVE:83-86) or when WEBHOOK_SECRET_TELNYX is unset (LIVE:87-90). The only rejection is LIVE:134 'if (webhookSecret && !signatureValid)' -> 401 (LIVE:136-144). Therefore when WEBHOOK_SECRET_TELNYX is unset, webhookSecret is null, the rejection at :134 is skipped entirely and an anonymous POST is processed; the replay guard (LIVE:146-165) is nested in 'if (signatureValid)' and is likewise inert. There is NO apikey/Authorization/JWT check anywhere; those strings appear only as allowed CORS headers at LIVE:13. With verify_jwt=false (config.toml:250) removing the platform gate, the handler is effectively open when the secret env var is absent.
(c-side-effects) An unauthenticated POST can drive a service-role Supabase client (LIVE:178, SUPABASE_SERVICE_ROLE_KEY) to write the database and mutate call state via event_type (LIVE:167, switch at LIVE:180): broadcast_queue status/call_sid updates (call.initiated :213/:220, call.answered :248, call.hangup :330 with retry requeue :322-324, AMD :395, ringing :412-415); voice_broadcasts counters (:339-346); leads last_contacted_at + status->contacted + next_callback_at=null when answered (:355-365); sms_messages insert/status (:433/:449/:492/:512/:533). No direct outbound provider call is made in-file, but two indirect amplification paths exist: the hangup retry branch resets broadcast_queue rows to status='pending' with future scheduled_at (:322-324), which a downstream dispatcher may re-dial, and message.received inserts into sms_messages (:449-462), which downstream AI/automation consumes. call.answered also returns attacker-influenced TeXML that plays a caller-supplied custom_headers.audio_url (:262-275, XML-escaped :268/:578).

**evidence**

- supabase/config.toml:247 - [functions.telnyx-webhook]
- supabase/config.toml:250 - verify_jwt = false
- supabase/functions-live/telnyx-webhook/index.ts:116 - serve(async (req)=>{
- supabase/functions-live/telnyx-webhook/index.ts:118-122 - CORS preflight bypass (200 for OPTIONS)
- supabase/functions-live/telnyx-webhook/index.ts:124 - const webhookSecret = Deno.env.get('WEBHOOK_SECRET_TELNYX');
- supabase/functions-live/telnyx-webhook/index.ts:133 - const signatureValid = await verifyTelnyxSignature(rawBody, signature, timestamp, webhookSecret ?? null);
- supabase/functions-live/telnyx-webhook/index.ts:134 - if (webhookSecret && !signatureValid) { 401 only when secret IS set (:136-144)
- supabase/functions-live/telnyx-webhook/index.ts:146 - if (signatureValid) { replay window :148-163, inert when secret unset
- supabase/functions-live/telnyx-webhook/index.ts:82-115 - verifyTelnyxSignature; fails open at :83-86 (no sig/timestamp) and :87-90 (no secret)
- supabase/functions-live/telnyx-webhook/index.ts:178 - createClient(supabaseUrl, serviceRoleKey) service-role
- supabase/functions-live/telnyx-webhook/index.ts:13 - 'authorization'/'apikey' only as allowed CORS headers, not checks
- grep LIVE (glob **/functions-live/telnyx-webhook/index.ts) for CERTIFIED and NOT_CERTIFIED: 0 matches
- supabase/functions/telnyx-webhook/index.ts:172-174 - function isTelnyxWebhookLifecycleCertified(): boolean { return false; } (main only)
- supabase/functions/telnyx-webhook/index.ts:185-195 - 503 early return; :189 error_code TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED (main only)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:34 - gate inventory lists telnyx-webhook: TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED@189

**validation**

Read config.toml (450 lines) and functions-live/telnyx-webhook/index.ts (581 lines) in full via native read. Cross-checked with directory+glob-scoped agentgrep (single-file path greps returned false 0s; re-ran with path=repo-root + glob=**/functions-live/telnyx-webhook/index.ts, which correctly returned 24 matches incl LIVE:124/133/134). Read main gate body at supabase/functions/telnyx-webhook/index.ts:160-239. Confirmed LIVE line count 581 as stated.

**open_questions**

- Is WEBHOOK_SECRET_TELNYX actually configured in the deployed project (emonjusymdripmkvtttc) environment? Static repo bytes cannot answer this; it decides whether LIVE is fully open or signature-enforced. Note main only rejects when the secret is set (main:209-214 returns 503 if unset), i.e. main flips the same check from fail-open to fail-closed at config level, whereas LIVE does not.
- Does any downstream consumer of broadcast_queue status='pending' (retry branch LIVE:322-324) actually place outbound calls, i.e. is the retry path a live amplification vector? This handler does not call a provider API directly.

**edge_cases_considered**

- OPTIONS preflight returns 200 with no auth (LIVE:118-122) - not a data path but confirms the route is internet-facing.
- body JSON.parse at LIVE:166 happens before any DB work, so a malformed body just 500s (LIVE:564-575) - no gate bypass.
- message.received has a duplicate guard on provider_message_id (LIVE:432-438); repeat deliveries suppressed, but distinct ids force repeated inserts.
- call.initiated phone-fallback (LIVE:201-218) can attach an attacker-supplied call_control_id to a real pending broadcast_queue row and set call_sid, hijacking later event correlation.
- signature verification, IF the secret is set, is sound Ed25519 (crypto.subtle.verify at LIVE:109); the weakness is the fail-open configuration default, not the crypto.

**what_i_did_not_check**

- Runtime environment values (WEBHOOK_SECRET_TELNYX, SUPABASE_SERVICE_ROLE_KEY presence) for the deployed project - not in repo.
- Whether the deployed LIVE function actually matches this functions-live/ snapshot (no deploy-time or git-HEAD verification of served bytes).
- Downstream dispatcher/worker code that consumes broadcast_queue 'pending' rows and sms_messages inserts (the indirect outbound/amplification path).
- RLS/table constraints on broadcast_queue, voice_broadcasts, leads, sms_messages, phone_numbers that might limit the service-role writes.
- Whether a Telnyx portal or Supabase gateway (WAF, IP allowlist) restricts who can reach the function URL.

**confidence**: high