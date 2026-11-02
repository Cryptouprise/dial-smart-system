# P4a Browser Phone: final review (v3 -> staged final)

Staged under `docs/wholesale/phases/staging/p4a/<repo-relative path>`. Nothing was deployed, applied, installed, or touched live.

## 1. Files written

| Lines | File |
|---:|---|
| 176 | `supabase/functions/_shared/voice-provider.ts` |
| 326 | `supabase/functions/_shared/telnyx.ts` |
| 308 | `supabase/functions/_shared/twilio.ts` |
| 64 | `supabase/functions/_shared/twilio-signature.ts` |
| 94 | `supabase/functions/voice-token/index.ts` |
| 212 | `supabase/functions/voice-call/index.ts` |
| 181 | `supabase/functions/voice-call-action/index.ts` |
| 252 | `supabase/functions/voice-call-events/index.ts` |
| 163 | `supabase/functions/twilio-voice-twiml/index.ts` |
| 112 | `supabase/functions/twilio-voice-status/index.ts` |
| 95 | `supabase/functions/twilio-voice-transcription/index.ts` |
| 181 | `supabase/migrations/20261029160000_browser_phone.sql` (renamed from `20261029020000_…`, see below) |
| 423 | `src/lib/voice/BrowserPhone.ts` |
| 4 | `package.json.dependencies-to-add.txt` (the two dependency lines) |

`deno check`: `deno` is not on PATH (only an empty `%LOCALAPPDATA%\deno` cache dir exists), so it was skipped. As a substitute the repo's `tsc` 5.6.3 was run in `--strict --noResolve` mode over all eleven edge-function files; the only diagnostics were the expected unresolved URL imports (`serve`, `createClient`, `Deno` global) and the `req` parameter they leave untyped. `BrowserPhone.ts` type-checks except for the two not-yet-installed packages. Please run `deno check supabase/functions/*/index.ts` once staged into the repo.

## 2. Changes versus v3 (one line each, grouped by file)

### Cross-cutting
- Twilio CallSid now lives in `call_logs.provider_call_id` (house rule); Telnyx keeps `telnyx_call_control_id`. v3 stuffed the CallSid into `telnyx_call_control_id`. `providerCallIdColumn(provider)` is the single source of truth.
- `from_number` column dropped entirely; `caller_id` (live, NOT NULL) is the from-number column. v3 still added `from_number`.
- Rate limit is one generous 120/min/user in `voice-call` AND `voice-token`, surfaced as HTTP 429 via caught `RateLimitError` (v3: 30/min, voice-call only, 500 on hit).
- Error shape unified to outbound-calling style `{success:false, error_code, error}` with real HTTP codes (400/401/403/404/409/429/500); `BrowserPhone` reads `error_code`.
- Transcript inserts go through a new SECURITY DEFINER RPC `append_call_live_transcript` (advisory-locked per call) instead of the v3 select-max-then-insert retry loop, closing the seq race flagged in rt2 risks #1/#2/#14.
- `parseWebhookBody(raw)` added to the provider interface so webhooks never rebuild a `Request` with the non-standard `duplex` cast (rt2 risk #3).
- All webhook handlers wrap per-event work in try/catch so one bad event cannot drop the rest, and return 200 once the signature is valid.
- `PUBLIC_FUNCTIONS_BASE_URL` optional override added for the signed/callback URL (custom functions domain); defaults to `SUPABASE_URL/functions/v1`.

### `_shared/voice-provider.ts`
- Added `providerCallIdColumn`, `publicFunctionsBaseUrl`, `normalizePhoneVariants`, `isE164`, `isVoiceAction`, `VOICE_ACTIONS`, `parent_provider_call_id` on `NormalizedEvent`, `'unknown'` speaker, optional `onProviderCallRegistered` hook.
- `normalizePhoneVariants` fixed: v3 treated any number starting with 1 as already-national and mangled 10-digit numbers beginning with 1.

### `_shared/telnyx.ts`
- `onProviderCallRegistered` added: after the browser reports the call_control_id the server issues `record_start` (mp3, dual) and `transcription_start` with the verified Google engine body; failures return as warnings, not errors.
- Credential lookup verifies `organization_id` matches and handles the unique-constraint race on first create.
- Token endpoint response parsed as JSON or plain text (both shapes seen in the wild).
- Hold/unhold/mute/unmute/dtmf are server no-ops (client-side SDK primitives) so nothing is sent twice; v3 double-sent DTMF and mapped hold to a per-call Call Control command that likely does not exist.
- Hangup treats a 4xx from Telnyx (already hung up by the browser leg) as success.
- `call.transcription` speaker mapping uses `transcription_track` inbound→rep / outbound→contact / else unknown.

### `_shared/twilio.ts`
- Token payload matches the verified shape exactly (`outgoing:{application_sid}` only, `incoming:{allow:false}`, `iat` added); v3 put custom params in the grant.
- `device.connect` params renamed to `call_log_id`, `organization_id` only; v3 sent `To`/`From`, which collide with Twilio's reserved POST params on the TwiML request.
- `parseWebhookBody` now parses the verified real-time transcription fields: `TranscriptionEvent=transcription-content`, `TranscriptionData` JSON `transcript`, `Track`, `Final`; v3 read a non-existent `TranscriptionText`.
- Recording callbacks detected via `RecordingSid`; status callbacks carry `ParentCallSid` so the parent CallSid stored in `provider_call_id` can be matched from child-leg events.
- Speaker mapping flipped to `inbound_track`→rep, `outbound_track`→contact (parent/client leg semantics; VERIFY).
- DTMF via REST removed (Twilio's call-update resource does not accept `SendDigits`); DTMF is client-side only. Hangup tolerates 404.
- `validateTwilioWebhook` preserves the query string and uses `publicFunctionsBaseUrl()`.
- Added `twilioIdentityForUser` / `userIdFromTwilioIdentity` helpers.

### `_shared/twilio-signature.ts`
- Reuses `constantTimeEqualBytes` from `stripe-signature.ts` (length-independent compare) instead of a local early-return version; added `formParams`.

### `voice-token/index.ts`
- 120/min limit + 429; 403 `ORG_FORBIDDEN` when not a member (v3 returned 500); 405 on non-POST; invalid JSON → 400; returns `organization_id` too.

### `voice-call/index.ts`
- Lead id validated as UUID; `to`/`from` validated before any DB call; all lookups (`phone_numbers`, `leads`, `dnc_list`) scoped by `organization_id` only (no `user_id`), per house rule.
- Provider id (if ever returned synchronously) written to `providerCallIdColumn(provider)`.
- Response includes canonical `to`/`from` so the client dials exactly what was validated.

### `voice-call-action/index.ts`
- `register_provider_call` works for both providers, writes the correct column, is idempotent (same id OK, different id → 409 `PROVIDER_CALL_ID_CONFLICT`), refuses on ended calls, and triggers `onProviderCallRegistered` (Telnyx record/transcribe); v3 only allowed it while `status='initiated'`, which broke the Twilio belt-and-braces bind.
- `provider_call_id` input validated by pattern; update guarded with `.is(column, null)`.
- Server `hangup` also closes the row (`completed`, `ended_at`) if no webhook ever arrives.

### `voice-call-events/index.ts` (Telnyx)
- Missing public key → 503, bad signature or stale timestamp → 401 (matches `telnyx-webhook`); v3 returned 200 on a bad signature.
- Three-stage row resolution: `telnyx_call_control_id` → `client_state.call_log_id` → most recent unbound Telnyx row for `payload.to` within 5 min; binds the id on fallback match.
- Status transitions are monotonic (no `ringing` after `in_progress`, no reopen after `completed`); hangup stores `outcome=hangup_cause` and computes duration from `start_time/end_time` or `answered_at`.
- Recording URL also accepts `public_recording_urls.mp3` / `recording_urls.wav`.

### `twilio-voice-twiml/index.ts`
- Dial target and callerId are read from the `call_logs` row, never from request params, so `voice-call`'s caller-ID/DNC checks cannot be bypassed; v3 dialled `To` straight from the POST.
- Identity check: `From=client:user_<uuid>` must be the row's user or a member of the row's company.
- Fallback when connect params are not forwarded: most recent unbound `initiated` Twilio row for that identity within 60 s (v3 matched on `caller_id`, which any teammate shares).
- Writes `provider_call_id` (+ `status='ringing'`), refuses re-bind to a different CallSid, returns `<Reject/>` 403 on bad signature and a spoken failure + `<Hangup/>` otherwise.
- TwiML: `partialResults="true"`, `answerOnBridge="true"`; callbacks built from `publicFunctionsBaseUrl()`.

### `twilio-voice-status/index.ts`
- Matches `provider_call_id IN (CallSid, ParentCallSid)`; v3 matched child CallSid against the parent id and would never update.
- `failed` → `status='failed'`; busy/no-answer/canceled → `completed` with `outcome`; `CallDuration` rounded; recording URL normalised to `.mp3`.

### `twilio-voice-transcription/index.ts`
- Acknowledges `transcription-started/stopped/error` without DB work (logs errors); only `transcription-content` is appended, via the RPC.

### `migrations/20261029160000_browser_phone.sql`
- Renamed from `20261029020000`: that timestamp sorts BEFORE the already-applied `20261029142121_phase1_org_scope.sql`, which `supabase db push` would skip without `--include-all`.
- Adds `call_logs.provider_call_id text` (IF NOT EXISTS) with partial indexes on `provider_call_id` and `telnyx_call_control_id`; drops `from_number`.
- `voice_credentials` SELECT policy is `user_in_organization(organization_id) AND user_id = auth.uid()` (brief asked for the org predicate; tightened to own row because the value names a provider object).
- `call_live_transcripts` SELECT policy via `user_in_organization(organization_id)` (one argument); INSERT/UPDATE/DELETE revoked from PUBLIC/anon/authenticated; service_role granted; REPLICA IDENTITY FULL; publication added inside the `pg_publication_tables` guard.
- New `append_call_live_transcript(uuid,uuid,text,text,boolean,timestamptz)`: SECURITY DEFINER, `search_path` pinned, verifies the call belongs to the org, advisory-locks per call, revoked from PUBLIC/anon/authenticated, granted to service_role.
- `DROP POLICY IF EXISTS` before each `CREATE POLICY` so the file is re-runnable; no BEGIN/COMMIT.

### `src/lib/voice/BrowserPhone.ts`
- Telnyx registers `call.telnyxIDs.telnyxCallControlId` (verified SDK accessor), not the client-side `call.id` v3 sent, and re-checks on every `callUpdate` notification.
- Twilio registers `call.parameters.CallSid` on `accept` as a redundant bind; handles `ringing`/`cancel`/`unregistered`; rejects any `incoming` call.
- Mute uses `muteAudio()` / `unmuteAudio()` (v3 called `muteAudio(bool)`); hold/unhold/mute/dtmf are local only; hangup is local + server; `transfer()` exposed.
- Added `disconnect()`, `getState()`, `getCallLogId()`, `isMuted()`, a `disconnected` state, `realtime.setAuth(jwt)`, typed `VoiceCallError` with `error_code`, in-progress-call guard, and server hangup if the browser leg fails to start.

## 3. Remaining VERIFY items

1. Telnyx `call.transcription` payload field names (`transcription_data.transcript / is_final / transcription_track`) and whether `inbound` on the browser (A) leg is the rep. Doc: Telnyx API reference "Transcription start" and "Call Control webhooks". Parsing is defensive; the speaker constant is one line in `telnyx.ts`.
2. Telnyx `record_start` body `{format:'mp3', channels:'dual'}` and `call.recording.saved` payload (`recording_urls.mp3`). Doc: "Recording start".
3. Telnyx Call Control commands are accepted on a leg that originated from a WebRTC credential connection, and the credential connection's `webhook_event_url` must point at `voice-call-events`. Doc: "Credential connections" / "WebRTC with Call Control".
4. TelnyxRTC `newCall` option name `clientState` and that it surfaces as `client_state` in webhooks (only a fallback; `register_provider_call` is the primary bind).
5. TelnyxRTC notification shape `{type:'callUpdate', call:{state, telnyxIDs}}` and the `call.hangup()` method (seen in SDK examples, not in the method index).
6. Telnyx `/telephony_credentials/{id}/token` response shape (plain-text JWT vs `{data:{token}}`); both are handled.
7. Twilio `<Transcription track>` semantics on the parent/client leg: `inbound_track` = rep assumed. Doc: "TwiML Voice: <Transcription>".
8. Twilio Voice SDK forwards `device.connect({params})` as POST params to the TwiML App voice URL. Doc: "Twilio Voice JS SDK: Device.connect". A 60 s identity-based fallback exists if not.
9. Telnyx `transfer` on the A-leg re-bridges the rep, not the contact; Twilio transfer unsupported. Neither is exposed by the UI yet.
10. `@telnyx/webrtc ^2.25.0` and `@twilio/voice-sdk ^2.12.0` versions.
11. `dnc_list.phone_number` storage format (matched against `+1XXXXXXXXXX`, `1XXXXXXXXXX`, `XXXXXXXXXX`).
12. Twilio `RecordingUrl` requires account auth to fetch; the playback UI needs a signed proxy (separate job).

## 4. Secrets to set (names only; Supabase Edge Function secrets)

- `TELNYX_API_KEY` (exists)
- `TELNYX_SIP_CONNECTION_ID` (new: credential connection id used for browser logins)
- `WEBHOOK_SECRET_TELNYX` (exists for `telnyx-webhook`: Telnyx Ed25519 PUBLIC key, base64)
- `TWILIO_ACCOUNT_SID` (exists)
- `TWILIO_AUTH_TOKEN` (exists; signs/validates webhooks)
- `TWILIO_API_KEY_SID` (new)
- `TWILIO_API_KEY_SECRET` (new)
- `TWILIO_TWIML_APP_SID` (new)
- `PUBLIC_FUNCTIONS_BASE_URL` (optional; only if functions are served from a custom domain)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (platform-provided)

## 5. Deploy order

1. Copy staged files into the repo (`supabase/functions/_shared/*`, the seven function dirs, the migration, `src/lib/voice/BrowserPhone.ts`); add the two dependency lines to `package.json`; run `deno check` on each `index.ts`.
2. Apply `20261029160000_browser_phone.sql` (adds `provider_call_id`, both tables, RPC, publication). Verify with the RLS SQL below.
3. Set the secrets in section 4.
4. Deploy shared-only consumers first: `voice-call-events`, `twilio-voice-status`, `twilio-voice-transcription` (they only read/write by provider id and are harmless with no traffic).
5. Deploy `twilio-voice-twiml`, then `voice-token`, `voice-call`, `voice-call-action`.
6. Twilio console: create API Key (SID/secret) and a TwiML App whose Voice Request URL = `<base>/twilio-voice-twiml` (POST) and Status Callback URL = `<base>/twilio-voice-status`; put its SID in `TWILIO_TWIML_APP_SID`. Enable Voice Insights/real-time transcription on the account if gated.
7. Telnyx portal: credential (WebRTC) connection with webhook URL = `<base>/voice-call-events`, outbound voice profile attached, Ed25519 public key matching `WEBHOOK_SECRET_TELNYX`; put the connection id in `TELNYX_SIP_CONNECTION_ID`. Ensure the company's Telnyx numbers in `phone_numbers` have `provider='telnyx'`, `status='active'`.
8. `npm install` (foreman), build, then run the test plan.

## 6. Test plan (adapted from the brief to the final code)

**T1. voice-token auth.**
```bash
# 401 (no JWT) -> {"success":false,"error_code":"UNAUTHENTICATED",...}
curl -i -X POST "$BASE/voice-token" -H "Content-Type: application/json" \
  -d '{"organization_id":"11824e05-24e3-4dc3-b684-5d0bc7c436d6","provider":"twilio"}'
# 200 -> {"success":true,"token":"eyJ...","identity":"user_<uuid>","provider":"twilio","expires_at":...}
curl -i -X POST "$BASE/voice-token" -H "Authorization: Bearer $USER_JWT" -H "Content-Type: application/json" \
  -d '{"organization_id":"11824e05-24e3-4dc3-b684-5d0bc7c436d6","provider":"twilio"}'
# 403 ORG_FORBIDDEN with a random organization_id; 400 INVALID_PROVIDER with provider "retell".
# Decode the Twilio token at jwt.io: header cty "twilio-fpa;v=1", payload grants.voice.outgoing.application_sid = TWILIO_TWIML_APP_SID.
# Repeat the 200 call 121 times in a minute from one isolate -> 429 RATE_LIMITED.
```

**T2. voice-call guards.**
```bash
# from not owned by the company for that provider -> 400 CALLER_ID_NOT_OWNED
# to on dnc_list (same organization_id) -> 400 DNC_BLOCKED
# lead_id from another org -> 400 LEAD_NOT_OWNED
# happy path -> 200 {call_log_id, provider_call_id:null, extra.params.call_log_id} (twilio)
#            -> 200 {..., extra.client_state, extra.caller_number, extra.destination_number} (telnyx)
# Then: SELECT status, provider, caller_id, phone_number, organization_id FROM call_logs WHERE id='<call_log_id>';  -- initiated / correct org
# Teammate test: a second user in the same org with the same from -> 200 (not CALLER_ID_NOT_OWNED).
```

**T3. RLS proof (run in SQL editor as postgres).**
```sql
-- seed as service role
INSERT INTO public.call_live_transcripts (call_log_id, organization_id, seq, speaker, text, is_final)
VALUES ('<call_log_id_in_org_A>', '<org_A>', 1, 'rep', 'hello', true);

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"<user_in_org_A>","role":"authenticated"}';
SELECT count(*) FROM public.call_live_transcripts;              -- 1
SET LOCAL request.jwt.claims = '{"sub":"<user_in_org_B>","role":"authenticated"}';
SELECT count(*) FROM public.call_live_transcripts;              -- 0
INSERT INTO public.call_live_transcripts (call_log_id, organization_id, seq, speaker, text, is_final)
VALUES ('<call_log_id_in_org_A>', '<org_A>', 2, 'rep', 'x', true);  -- ERROR: permission denied
SELECT public.append_call_live_transcript('<call_log_id_in_org_A>','<org_A>','rep','x',true,now()); -- ERROR: permission denied for function
RESET role;
-- RPC org check (as postgres/service role): wrong org must raise 42501
SELECT public.append_call_live_transcript('<call_log_id_in_org_A>','<org_B>','rep','x',true,now());
-- voice_credentials: teammate cannot read another member's row
SET LOCAL role authenticated; SET LOCAL request.jwt.claims = '{"sub":"<teammate_in_org_A>","role":"authenticated"}';
SELECT count(*) FROM public.voice_credentials WHERE user_id='<user_in_org_A>';  -- 0
```

**T4. Telnyx `call.answered` replay.**
```bash
# The foreman needs a private key whose public key is WEBHOOK_SECRET_TELNYX (a test keypair is fine on a staging project).
PAYLOAD='{"data":{"event_type":"call.answered","id":"evt_1","occurred_at":"2026-10-29T02:00:00Z","payload":{"call_control_id":"v3:test-abc","call_session_id":"sess_1","client_state":"'"$(printf '{"call_log_id":"%s"}' "$CALL_LOG_ID" | base64 -w0)"'","from":"+15550001111","to":"+15550002222"}},"meta":{"attempt":1}}'
TS=$(date +%s)
SIG=$(printf '%s|%s' "$TS" "$PAYLOAD" | openssl pkeyutl -sign -inkey telnyx_test_private.pem -rawin | base64 -w0)
curl -i -X POST "$BASE/voice-call-events" -H "Content-Type: application/json" \
  -H "telnyx-timestamp: $TS" -H "telnyx-signature-ed25519: $SIG" --data-raw "$PAYLOAD"
# 200 {"received":true,"events":1}; DB: status='in_progress', answered_at set, telnyx_call_control_id='v3:test-abc' (bound via client_state fallback)
# No signature -> 401; unset WEBHOOK_SECRET_TELNYX -> 503.
# Replay a call.transcription with payload.transcription_data={"transcript":"hi there","is_final":true,"transcription_track":"inbound"} -> row in call_live_transcripts seq=1 speaker='rep'.
```

**T5. Twilio status callback replay (child leg).**
```bash
URL="$BASE/twilio-voice-status"
BODY='CallSid=CA00000000000000000000000000000002&ParentCallSid=CA00000000000000000000000000000001&CallStatus=in-progress&Timestamp=Wed%2C+29+Oct+2026+02%3A00%3A00+%2B0000'
# Signature = base64(HMAC-SHA1(auth_token, URL + concat(sorted name+value))). Decode form values before concatenating.
SIG=$(python3 - "$URL" "$BODY" "$TWILIO_AUTH_TOKEN" <<'PY'
import sys,hmac,hashlib,base64,urllib.parse
url,body,tok=sys.argv[1:4]; p=sorted(urllib.parse.parse_qsl(body,keep_blank_values=True))
print(base64.b64encode(hmac.new(tok.encode(),(url+''.join(k+v for k,v in p)).encode(),hashlib.sha1).digest()).decode())
PY
)
# First bind the parent sid: UPDATE call_logs SET provider_call_id='CA00000000000000000000000000000001' WHERE id='<call_log_id>';
curl -i -X POST "$URL" -H "Content-Type: application/x-www-form-urlencoded" -H "X-Twilio-Signature: $SIG" --data-raw "$BODY"
# 200 {"received":true,"events":1}; DB: status='in_progress', answered_at set. Wrong signature -> 403.
# Then CallStatus=completed&CallDuration=42 -> status='completed', duration_seconds=42, outcome='completed'.
```

**T6. Twilio transcription replay.**
```bash
URL="$BASE/twilio-voice-transcription"
BODY='CallSid=CA00000000000000000000000000000001&TranscriptionEvent=transcription-content&TranscriptionSid=GT123&SequenceId=1&Track=inbound_track&Final=true&TranscriptionData=%7B%22transcript%22%3A%22hello+there%22%2C%22confidence%22%3A0.9%7D'
# sign as in T5, POST -> 200 {"received":true,"appended":1}; row seq=1 speaker='rep' text='hello there' is_final=true.
# TranscriptionEvent=transcription-started -> 200 {"received":true,"event":"transcription-started"}, no row.
```

**T7. TwiML App URL.**
```bash
URL="$BASE/twilio-voice-twiml"
BODY="CallSid=CA00000000000000000000000000000001&From=client%3Auser_$USER_ID&call_log_id=$CALL_LOG_ID&organization_id=$ORG_ID"
# sign as in T5 -> 200 text/xml containing <Start><Transcription ... track="both_tracks"/></Start><Dial callerId="+1<caller_id>" record="record-from-answer-dual" ...><Number ...>+1<phone_number></Number></Dial>
# DB: provider_call_id='CA…01', status='ringing'. Repeat with a different CallSid -> <Say>…</Say><Hangup/> and no change.
# From of a user outside the org -> rejected TwiML; bad signature -> 403 <Reject/>.
```

**T8. End-to-end in the browser (after `npm install`).** Connect with a Twilio token, `call({lead_id, to, from})`, confirm `onState` goes connecting→ringing→answered→ended, `onTranscript` receives lines within a few seconds of speech, and after hangup `call_logs` has `status='completed'`, `duration_seconds>0`, `recording_url` set. Repeat with Telnyx; additionally confirm `register_provider_call` fired (network tab) and `telnyx_call_control_id` is populated, and `voice-call-action` response `warnings` is empty (record_start/transcription_start accepted).

## 7. Live verification, 2026-11-02 (jcode)

Migration status: applied. `supabase_migrations.schema_migrations` contains `20261102214238 browser_phone`
(the staged file is `20261029160000_browser_phone.sql`, applied under a later stamp). Both tables, the RPC
and the publication are live.

Ran T3 (the RLS proof) read-only / rolled back via `scripts/ship/sbquery.py`. Nothing persisted. T3 needs no
user JWT, so it is reproducible from SQL alone. Live org `11824e05-...`; its only member `5969774f-...` is
both owner and platform admin, and admin does not bypass these policies.

| Check | Expected | Actual |
|---|---|---|
| member of the owning org reads the transcript | 1 | `same_org_visible=1`, `same_org_filtered=1` |
| unrelated user reads the transcript | 0 | `outsider_transcripts=0` |
| unrelated user reads another member's `voice_credentials` | 0 | `other_members_voice_creds=0` |
| `authenticated` INSERT into `call_live_transcripts` | permission denied | `42501 permission denied for table call_live_transcripts` |
| `authenticated` executes `append_call_live_transcript` | permission denied | `42501 permission denied for function append_call_live_transcript` |
| RPC with a wrong organization, as postgres/service role | 42501 | `42501 call_log 262d8cd7-... does not belong to organization 00000000-...-0000000000ff` |

Grant census: `authenticated` holds only `SELECT` on both tables (plus the blanket REFERENCES / TRIGGER /
TRUNCATE that Supabase grants broadly), and `append_call_live_transcript` is EXECUTE for `postgres` and
`service_role` only. Policies are `Company members can view live transcripts` (SELECT) on
`call_live_transcripts` and `Members view their own voice credentials` (SELECT) on `voice_credentials`.
Neither table has a tenant write policy, which is the intent: transcripts arrive through the webhook
functions, not the browser.

Not run here because they need deployed functions, the Twilio/Telnyx secrets and a real login: T1
(`voice-token` auth + rate limit), T2 (`voice-call` guards), T4 / T5 / T6 (signed Telnyx and Twilio webhook
replays), T7 (TwiML URL), T8 (in-browser end to end). T3 is the only part provable from SQL alone, and it
passes.
