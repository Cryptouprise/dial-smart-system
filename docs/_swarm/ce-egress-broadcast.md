# ce-egress-broadcast

- status: completed
- tldr: All 4 (engine, queue, tts, twilio-tts-audio) launch-quarantined with 503 before egress; no bypass; engine/tts/twilio-tts have dead egress code.

ce-egress-broadcast DONE (read-only). All 4 functions launch-quarantined before egress.

| function | egress? | verify_jwt | launch-quarantined(503)? | anon-browser reachable? | bypasses launch lock? |
|---|---|---|---|---|---|
| voice-broadcast-engine | YES in code, unreachable: Retell create-phone-call (index.ts:121), Twilio Calls.json (:396,:575), Telnyx /v2/calls (:449); + calendar-integration fetch (:2277) + SMS insert (:2337-2351) | true (config.toml:229) | YES: isVoiceBroadcastSurfaceTenantCertified()=false (:636-638), 503 (:647-657); 2nd egress gate for process_active/start (:690-700, 503 :697); both precede egress | CORS '*' (:6); gate returns 503 to anon; JWT check (:660/:1028) is dead | NO; only OPTIONS (:641-643, no egress) precedes gate; :704 handler unreachable (690 returns first) |
| voice-broadcast-queue | NO (DB reads/writes + service-role client only, :38-50) | true (config.toml:224) | YES: isVoiceBroadcastQueueTenantCertified()=false (:9-11), 503 (:18-23) | CORS '*' (:5); gate first; JWT (:42) dead | NO; only OPTIONS (:14-16); health_check (:50) after gate |
| voice-broadcast-tts | YES in code, unreachable: ElevenLabs POST /v1/text-to-speech/{voice} (:98-119) | true (config.toml:219) | YES: isVoiceBroadcastTtsSpendCertified()=false (:9-11), 503 (:20-30), precedes :98 | CORS '*' (:5); gate first; JWT (:54) dead | NO; only OPTIONS (:14-16) |
| twilio-tts-audio | YES in code, unreachable: ElevenLabs POST /v1/text-to-speech/{voice}/stream (:79-99) paid synth-on-request | false (config.toml:272) | YES: inline 503 "TTS audio is not certified for launch" (:42-49), no named helper, precedes :79 | CORS '*' (:8-9); gate returns 503 to everyone; NO identity check anywhere | NO; only OPTIONS (:33-35). NOTE: if :42 removed, fully anonymous paid TTS |

Validation: read all four index.ts in full + config.toml:217-272; verified each gate line precedes every egress line. Read-only, no live calls.
Blockers: none. Follow-ups: engine retains dead egress helpers (Retell/Twilio/Telnyx/SIP) pending canonical provider boundary; twilio-tts-audio signed media-token contract not yet present.

## Artifact

**Findings**

All 4 broadcast/tts functions are launch-quarantined: each returns HTTP 503 before any egress. Engine (voice-broadcast-engine): surface gate isVoiceBroadcastSurfaceTenantCertified()=false at 636-638, 503 at 647-657, runs before everything except OPTIONS; a second egress gate hard-disables process_active/start at 690-700 (503 at 697). Egress code present but unreachable: Retell POST api.retellai.com/v2/create-phone-call (121), Twilio Calls.json (396, 575), Telnyx /v2/calls (449); internal calendar-integration fetch (2277) and SMS reminder queued to DB (2337-2351). verify_jwt=true (config 229). CORS '*'. No signature/HMAC; JWT bearer check at 660/1028 is dead (gate precedes). No bypass: only OPTIONS early-return (641-643, null headers, no egress) precedes the gate; the process_active handler at 704 is unreachable because 690 returns first. Queue (voice-broadcast-queue): NO egress (DB reads/writes + service-role client only); gate isVoiceBroadcastQueueTenantCertified()=false 9-11, 503 at 18-23; verify_jwt=true (224); CORS '*'; health_check branch (50) after gate, unreachable; no bypass. TTS (voice-broadcast-tts): egress = ElevenLabs POST /v1/text-to-speech/{voice} 98-119, unreachable; gate isVoiceBroadcastTtsSpendCertified()=false 9-11, 503 at 20-30; verify_jwt=true (219); CORS '*'; no bypass. twilio-tts-audio: egress = ElevenLabs POST /v1/text-to-speech/{voice}/stream 79-99 (paid synth-on-request), unreachable; inline 503 'TTS audio is not certified for launch' at 42-49 (no named helper) before egress at 79; verify_jwt=false (config 272) so gateway does not gate; CORS '*'; NO identity check anywhere (if 503 removed, anonymous ElevenLabs spend).

**evidence**

- voice-broadcast-engine/index.ts:636-638 isVoiceBroadcastSurfaceTenantCertified(){return false}
- voice-broadcast-engine/index.ts:647-657 surface 503 return
- voice-broadcast-engine/index.ts:690-700 egress gate 503 (status:697)
- voice-broadcast-engine/index.ts:121 Retell create-phone-call; :396,:575 Twilio Calls.json; :449 Telnyx /v2/calls
- voice-broadcast-engine/index.ts:660,1028-1032 JWT check (dead, after gate)
- voice-broadcast-engine/index.ts:2277 calendar-integration fetch; :2337-2351 scheduled_follow_ups sms insert
- voice-broadcast-engine/index.ts:641-643 OPTIONS early return (no egress)
- voice-broadcast-queue/index.ts:9-11 gate false; :18-23 503; :38-50 service-role client; :50 health_check after gate
- voice-broadcast-tts/index.ts:9-11 gate false; :20-30 503; :98-119 ElevenLabs POST
- twilio-tts-audio/index.ts:42-49 inline 503; :79-99 ElevenLabs stream POST; :8-9 CORS '*'
- supabase/config.toml:219 voice-broadcast-tts=true; :224 queue=true; :229 engine=true; :272 twilio-tts-audio=false

**validation**

Read all four index.ts in full (engine 2452 lines: top, gate 620-800, egress greps, callback 2260-2370, dtmf 2185-2225) and confirmed config.toml lines 217-272. Verified gate line numbers precede all egress line numbers for each function. No live calls, no writes (read-only).

**open_questions**

- Engine retains full working egress helpers (Retell/Twilio/Telnyx/SIP) as dead code; confirm whether the canonical provider boundary is expected to replace or delete them
- twilio-tts-audio: intended design is a short-lived signed media token (config comment 270-271); confirm whether that token contract is tracked elsewhere

**edge_cases_considered**

- OPTIONS preflight precedes the gate in all four (engine 641, queue 14, tts 14, twilio-tts 33) but returns no egress
- engine process_active cron/service-role path (704) bypasses JWT but is unreachable because 690 returns 503 first
- engine handle_dtmf/callback resume path (2187/2226) is behind the 647 gate and also requires JWT (1028)
- twilio-tts-audio has verify_jwt=false at the gateway AND no in-function auth, so its only protection is the inline 503

**what_i_did_not_check**

- Did not trace whether any other function invokes voice-broadcast-engine/queue/tts as a callee (inbound reachability)
- Did not audit call-tracking-webhook/twilio-dtmf-handler/twilio-amd-webhook which the engine references as status/DTMF callbacks (out of scope of these 4)
- Did not verify runtime deployment state vs repo (config comments vs live Supabase config)

**confidence**: high