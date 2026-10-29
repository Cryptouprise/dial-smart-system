Assumption: "status callbacks" means Twilio delivery-status callbacks for outbound SMS; no such handler appears in the 11 files, so it is reported as absent/UNKNOWN.

### A. Outbound SMS flow
1. Entry point is edge function `sms-messaging`; request interface declares actions `send_sms | get_messages | get_available_numbers | check_webhook_status | configure_webhook | health_check` (supabase/functions/sms-messaging/index.ts:28).
2. FACT: `send_sms` is hard-disabled before any send logic: it returns HTTP 503 with `error_code: 'SMS_EGRESS_NOT_CERTIFIED'` and message "Physical SMS egress is disabled in the Retell-only launch profile." (supabase/functions/sms-messaging/index.ts:124-136).
3. FACT: `get_available_numbers`, `check_webhook_status`, `configure_webhook` are also hard-disabled with `PROVIDER_ADMIN_NOT_CERTIFIED` (supabase/functions/sms-messaging/index.ts:138-148).
4. FACT: Auth is required for every action: Bearer token must be present (supabase/functions/sms-messaging/index.ts:85-99); either the service-role token plus `request.user_id` (internal call) or a JWT resolved via `supabaseAdmin.auth.getUser` (supabase/functions/sms-messaging/index.ts:102-119).
5. FACT: Sending number selection (in the disabled-but-present code path): the `from` number is canonicalized (supabase/functions/sms-messaging/index.ts:220), looked up in `phone_numbers` filtered by `user_id` and `status='active'` (supabase/functions/sms-messaging/index.ts:240-248), then `selectOwnedSmsNumber` requires exactly one active match, provider in {twilio, telnyx}, SMS capability not false, and `allowed_uses` containing `sms` if that array is non-empty (supabase/functions/sms-messaging/sms-boundary.ts:74-107).
6. FACT: Tenant resolution requires exactly one `organization_users` membership; multi-org users are rejected (supabase/functions/sms-messaging/sms-boundary.ts:56-72; called at supabase/functions/sms-messaging/index.ts:223-238).
7. FACT: Twilio credentials used are env vars `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`, sent as HTTP Basic auth (supabase/functions/sms-messaging/index.ts:151-158, 573-581).
8. FACT: Telnyx is an alternate provider using `TELNYX_API_KEY` (supabase/functions/sms-messaging/index.ts:161, 562-571).
9. FACT: Pre-send safety checks: RPC `evaluate_contact_stop` (supabase/functions/sms-messaging/index.ts:303-319), lead `do_not_call` flag (supabase/functions/sms-messaging/index.ts:336-338), and `dnc_list` lookup by `organization_id` + `phone_number_normalized` (supabase/functions/sms-messaging/index.ts:340-351).
10. FACT: For Twilio, the from number is verified against Twilio's `IncomingPhoneNumbers.json` and must be SMS-capable (supabase/functions/sms-messaging/index.ts:431-459).
11. FACT: Idempotency: `idempotency_key` is required, 8-512 chars (supabase/functions/sms-messaging/sms-boundary.ts:43-49); a durable claim is made via RPC `claim_sms_delivery_attempt` (supabase/functions/sms-messaging/index.ts:486-500) and finalized via RPC `finalize_sms_delivery_attempt` (supabase/functions/sms-messaging/index.ts:545-552).
12. FACT: Sent message storage: table `sms_messages`, inserted with columns `user_id, to_number, from_number, body, direction='outbound', status='pending', lead_id, conversation_id, provider_type, is_ai_generated, metadata{organization_id, campaign_id, safety_checked_at}` (supabase/functions/sms-messaging/index.ts:391-409); on success updated to `status='sent', provider_message_id, sent_at, error_message=null` (supabase/functions/sms-messaging/index.ts:635-638).
13. FACT: Conversation `sms_conversations.last_message_at` is updated after send (supabase/functions/sms-messaging/index.ts:646-651).
14. FACT: Status callbacks: no delivery-status callback handler exists in the provided files. UNKNOWN — a file not provided would answer it (e.g. a `twilio-status-callback`/`twilio-sms-status` function).

### B. Inbound SMS flow
1. FACT: The Twilio SMS webhook target is `twilio-sms-webhook`; the expected URL is `${SUPABASE_URL}/functions/v1/twilio-sms-webhook` (supabase/functions/sms-messaging/index.ts:726, 834, 876).
2. FACT: `twilio-sms-webhook` currently returns HTTP 503 `UNSIGNED_WEBHOOK_NOT_CERTIFIED` before any parsing or DB work (supabase/functions/twilio-sms-webhook/index.ts:313-321). All logic below is present in the file but unreachable.
3. FACT: Payload parsing supports form-urlencoded, JSON, or raw text (supabase/functions/twilio-sms-webhook/index.ts:337-354); validation checks phone formats, MessageSid shape (warn only), NumMedia, body length ≤10000, MediaUrl0 (supabase/functions/twilio-sms-webhook/index.ts:236-305).
4. FACT: Owner resolution is by the `To` number, in five fallback methods: (1) `phone_numbers.number = To` (supabase/functions/twilio-sms-webhook/index.ts:408-417); (2) number format variants in `phone_numbers` (supabase/functions/twilio-sms-webhook/index.ts:420-433); (3) prior outbound `sms_messages.from_number = To` (supabase/functions/twilio-sms-webhook/index.ts:436-450); (4) existing `sms_conversations.contact_phone = From` (supabase/functions/twilio-sms-webhook/index.ts:453-466); (5) fallback to most recent enabled `ai_sms_settings` user (supabase/functions/twilio-sms-webhook/index.ts:469-483).
5. FACT: Conversation is found by `user_id` + `contact_phone = From`, else created; unread is incremented (`unread_count + 1`, or 1 on create) (supabase/functions/twilio-sms-webhook/index.ts:500-538).
6. FACT: Duplicate webhook suppression by `provider_message_id = MessageSid` (supabase/functions/twilio-sms-webhook/index.ts:541-555).
7. FACT: Message stored in `sms_messages` with `direction='inbound', status='received', provider_type='twilio', provider_message_id=MessageSid, has_image, image_url, metadata{media_content_type, num_media}` (supabase/functions/twilio-sms-webhook/index.ts:558-578).
8. FACT: Lead is looked up by `user_id` + `phone_number = From` (supabase/functions/twilio-sms-webhook/index.ts:611-616). Lead nudge tracking is upserted into `lead_nudge_tracking` (supabase/functions/twilio-sms-webhook/index.ts:721-740).
9. FACT: The webhook returns empty TwiML `<Response></Response>` (supabase/functions/twilio-sms-webhook/index.ts:1872-1877).

### C. AI auto-reply
1. FACT: Two AI reply paths exist. Path 1 is inline in `twilio-sms-webhook` (supabase/functions/twilio-sms-webhook/index.ts:844-1869). Path 2 is the separate function `ai-sms-processor` (supabase/functions/ai-sms-processor/index.ts:1-632).
2. FACT: `ai-sms-processor` is hard-disabled: `isAiSmsProcessorTenantCertified()` returns `false` and the function returns HTTP 503 `AI_SMS_PROCESSOR_NOT_TENANT_CERTIFIED` (supabase/functions/ai-sms-processor/index.ts:30-52).
3. FACT: In `twilio-sms-webhook`, auto-reply fires when either an active workflow's `auto_reply_settings.enabled` is true, or global `ai_sms_settings.enabled` AND `auto_response_enabled` are true (supabase/functions/twilio-sms-webhook/index.ts:742-778).
4. FACT: Double-texting prevention: if `prevent_double_texting` is on, it skips when an AI outbound message exists within `double_text_delay_seconds` (default 60) (supabase/functions/twilio-sms-webhook/index.ts:788-818).
5. FACT: Rapid-message batching: waits 1500 ms and skips if a newer inbound message exists (supabase/functions/twilio-sms-webhook/index.ts:820-842).
6. FACT: Reaction detection skips emoji-only / iMessage reactions when `enable_reaction_detection` is set (supabase/functions/twilio-sms-webhook/index.ts:854-888).
7. FACT: Model/provider: Lovable AI Gateway at `https://ai.gateway.lovable.dev/v1/chat/completions`, model `google/gemini-2.5-flash`, auth via `LOVABLE_API_KEY` (supabase/functions/twilio-sms-webhook/index.ts:992, 1304-1321). Same model in `ai-sms-processor` (supabase/functions/ai-sms-processor/index.ts:464-477, 1073-1086).
8. FACT: `ai-sms-processor` declares `RETELL_AI_API_KEY` but states "Retell SMS provider not supported yet, falling back to Lovable AI" (supabase/functions/ai-sms-processor/index.ts:66, 1064-1068).
9. FACT: Per-number off switch: none found. Per-organization off switch: none found; settings are keyed by `user_id` in `ai_sms_settings` (supabase/functions/twilio-sms-webhook/index.ts:591-595; supabase/functions/ai-sms-processor/index.ts:227-231). Per-workflow override exists via `campaign_workflows.auto_reply_settings` (supabase/functions/twilio-sms-webhook/index.ts:744-771).
10. FACT: `ai-sms-processor` can pause AI per conversation on human reply (`sms_conversations.ai_paused`, `ai_pause_reason`, `ai_paused_at`) when `stop_on_human_reply` is set (supabase/functions/ai-sms-processor/index.ts:261-303).
11. FACT: AI reply is stored in `sms_messages` as outbound `is_ai_generated: true, status: 'pending'` then sent via `sms-messaging` with `skip_db_insert: true` and `idempotency_key: sms-record:<id>` (supabase/functions/twilio-sms-webhook/index.ts:1799-1839). Since `send_sms` is disabled (A.2), this send would fail and the message would be marked `failed` (supabase/functions/twilio-sms-webhook/index.ts:1852-1861).

### D. Opt-out and webhook security
1. FACT: Opt-out keywords include `stop`, `unsubscribe`, `remove me`, `take me off`, `do not contact`, `stop texting`, `stop messaging`, `stop calling`, `leave me alone`, `remove my number`, `quit texting`, `opt out`, `dnc`, `cancel` (supabase/functions/twilio-sms-webhook/index.ts:22-27).
2. FACT: Matching is substring or exact on the lowercased body (supabase/functions/twilio-sms-webhook/index.ts:110-111).
3. FACT: On opt-out, disposition `Do Not Call` is returned with `shouldAddToDnc: true` and `shouldStopAutoReply: true` (supabase/functions/twilio-sms-webhook/index.ts:112-122).
4. FACT: DNC write: it sets `leads.do_not_call = true` (supabase/functions/twilio-sms-webhook/index.ts:676-678) and calls `disposition-router` with `action: 'process_disposition'` (supabase/functions/twilio-sms-webhook/index.ts:627-648). It does NOT insert into `dnc_list` in this file. UNKNOWN whether `disposition-router` writes `dnc_list` — that file was not provided.
5. FACT: START / resubscribe: no handling found in any provided file. UNKNOWN — would be in `twilio-sms-webhook` (absent) or a not-provided file.
6. FACT: Inbound webhook signature: NOT checked. `twilio-sms-webhook` has no signature verification and is disabled precisely because "request signatures and exact tenant binding" are not certified (supabase/functions/twilio-sms-webhook/index.ts:313-321). `twilio-inbound-handler` likewise disabled pending Twilio signature proof (supabase/functions/twilio-inbound-handler/index.ts:13-26). `twilio-amd-webhook` disabled pending provider signatures (supabase/functions/twilio-amd-webhook/index.ts:32-40). `retell-inbound-webhook` disabled pending signed requests (supabase/functions/retell-inbound-webhook/index.ts:43-51).
7. FACT: `ai-sms-processor` checks `dnc_list` by `user_id` + `phone_number` before auto-responding (supabase/functions/ai-sms-processor/index.ts:111-123).

### E. Inbound calls
1. FACT: `twilio-inbound-handler` is the configured voice webhook target (`VoiceUrl`), defaulting to `${SUPABASE_URL}/functions/v1/twilio-inbound-handler` (supabase/functions/twilio-integration/index.ts:984-986, 1035). It is hard-disabled: returns HTTP 503 with TwiML `<Response><Hangup/></Response>` (supabase/functions/twilio-inbound-handler/index.ts:16-26).
2. FACT: `retell-inbound-webhook` handles Retell's `call_inbound` event before connect, resolving the owner by `phone_numbers.number` matching `to_number`, falling back to a lead lookup by caller number, auto-creating a lead for unknown callers, and returning `dynamic_variables` + `metadata{user_id, lead_id}` (supabase/functions/retell-inbound-webhook/index.ts:69-131, 202-227, 420-430). It is hard-disabled (supabase/functions/retell-inbound-webhook/index.ts:43-51).
3. FACT: Forwarding to a human's cell: no forward-to-cell logic found in the provided files. UNKNOWN — would be in `twilio-inbound-handler` (absent) or a not-provided IVR/transfer function.
4. FACT: Per-number behavior: voice webhook can be set per number or for all numbers via `configure_voice_webhook` with optional `phoneNumbers` filter (supabase/functions/twilio-integration/index.ts:1013-1016), but `twilio-integration` is hard-disabled (supabase/functions/twilio-integration/index.ts:34-42).
5. FACT: `retell_transfer_context` table is read for transfer handling (supabase/functions/retell-inbound-webhook/index.ts:143-151).

### F. Voice features present / absent
Present in code (all behind disabled guards unless noted):
- FACT: TwiML generation: empty `<Response>` in SMS webhook (supabase/functions/twilio-sms-webhook/index.ts:1872-1877); `<Hangup/>` in inbound handler (supabase/functions/twilio-inbound-handler/index.ts:17); `<Say>`+`<Hangup/>` in DTMF handler (supabase/functions/twilio-dtmf-handler/index.ts:8-12); `<Play>`+`<Hangup/>` in AMD webhook (supabase/functions/twilio-amd-webhook/index.ts:135-139, 151-154).
- FACT: AMD: `twilio-amd-webhook` parses `AnsweredBy`, `MachineDetectionDuration`, updates `broadcast_queue`/`voice_broadcasts`/`leads` (supabase/functions/twilio-amd-webhook/index.ts:47-223). Disabled (supabase/functions/twilio-amd-webhook/index.ts:32-40).
- FACT: DTMF: `twilio-dtmf-handler` exists but is side-effect free and returns "This interaction is temporarily unavailable." (supabase/functions/twilio-dtmf-handler/index.ts:1-20).
- FACT: TTS audio: `twilio-tts-audio` generates ElevenLabs MP3 (`eleven_turbo_v2_5`) for Twilio `<Play>` (supabase/functions/twilio-tts-audio/index.ts:79-116). Disabled (supabase/functions/twilio-tts-audio/index.ts:42-49).
- FACT: SIP trunk management: create/update/list/delete trunks, IP ACLs, add/remove phone numbers (supabase/functions/twilio-integration/index.ts:1063-1527). Disabled (supabase/functions/twilio-integration/index.ts:34-42).
- FACT: Recording: only as a SIP trunk setting (`Recording: do-not-record | record-from-ringing | record-from-answer | record-from-ringing-dual | record-from-answer-dual`) (supabase/functions/twilio-integration/index.ts:22, 1078, 1245).
- FACT: Voice webhook configuration (`VoiceUrl`/`VoiceMethod`) (supabase/functions/twilio-integration/index.ts:1027-1036).
Absent:
- FACT: No conference (`<Conference>`) TwiML anywhere in the provided files.
- FACT: No AccessToken / VoiceGrant creation anywhere in the provided files.
- FACT: No TwiML App SID usage anywhere in the provided files.
- FACT: No browser-calling support of any kind exists in the provided files. INFERENCE: a browser softphone (AccessToken + VoiceGrant + TwiML App) would be entirely new code.

### G. Env var names by function
- `sms-messaging`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TELNYX_API_KEY` (supabase/functions/sms-messaging/index.ts:71-72, 151-152, 161).
- `twilio-sms-webhook`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY` (supabase/functions/twilio-sms-webhook/index.ts:327-328, 992).
- `ai-sms-processor`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `RETELL_AI_API_KEY` (supabase/functions/ai-sms-processor/index.ts:63-66).
- `twilio-inbound-handler`: none referenced (supabase/functions/twilio-inbound-handler/index.ts:1-27).
- `twilio-integration`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `RETELL_AI_API_KEY` (supabase/functions/twilio-integration/index.ts:45-46, 72-74).
- `retell-inbound-webhook`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (supabase/functions/retell-inbound-webhook/index.ts:54-55).
- `twilio-amd-webhook`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (supabase/functions/twilio-amd-webhook/index.ts:43-44).
- `twilio-dtmf-handler`: none referenced (supabase/functions/twilio-dtmf-handler/index.ts:1-20).
- `twilio-tts-audio`: `ELEVENLABS_API_KEY` (supabase/functions/twilio-tts-audio/index.ts:72).

### H. UNKNOWN list
1. Outbound SMS delivery-status callback handler (Twilio `StatusCallback`): no handler in provided files. File that would answer: a `twilio-status-callback`/`twilio-sms-status` edge function (not provided).
2. Whether `disposition-router` writes a `dnc_list` row on opt-out: `disposition-router` source not provided. File that would answer: `supabase/functions/disposition-router/index.ts`.
3. START / resubscribe handling: not found. File that would answer: `supabase/functions/twilio-sms-webhook/index.ts` (absent) or a not-provided opt-out function.
4. Forward-to-human-cell on inbound calls: not found. File that would answer: `supabase/functions/twilio-inbound-handler/index.ts` (absent) or a not-provided IVR/transfer function.
5. Any AccessToken/VoiceGrant/TwiML App SID code: not found in provided files. File that would answer: a not-provided `twilio-voice-token`/`twilio-access-token` function or frontend voice module.
6. Schema of `sms_messages`, `sms_conversations`, `dnc_list`, `phone_numbers`, `ai_sms_settings`: only columns referenced in code are known; full schema not provided. File that would answer: migration SQL files.
7. Whether `evaluate_contact_stop` and `claim_sms_delivery_attempt`/`finalize_sms_delivery_attempt` RPCs exist and their behavior: only call sites seen. File that would answer: migration SQL defining those RPCs.