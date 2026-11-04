# ce-voice-broadcast

- status: completed
- tldr: All 3 voice-broadcast fns fail-closed, no egress; guard gaps (consent/DNC/stop/credit) and unauth process_active path behind locks.

ce-voice-broadcast DONE (research-only, no files changed). All three voice-broadcast functions are fail-closed and perform NO egress today: tts lock tts:9-11/20-30 (503 VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED), queue lock queue:9-11/18-23 (503 VOICE_BROADCAST_QUEUE_NOT_TENANT_CERTIFIED), engine surface lock engine:636-638/647-657 (503, all actions). The engine's second egress lock engine:690-700 is dead code. Latent egress sites (unreachable): Retell engine:121, Twilio engine:396/575, Telnyx engine:449. config.toml verify_jwt=true for all three (217-229); in-function getUser gates engine:1030/queue:42/tts:53. Guard gaps behind the lock: no consent, no dial-time DNC (dnc_list only in DTMF callback engine:2383-2410), no global stop, no credit; calling hours present but per-broadcast bypassable (engine:752/1090/1121). Latent CRITICAL: engine process_active bypasses user auth (engine:702-704, no getUser).

## Artifact

**Findings**

ALL THREE voice-broadcast edge functions are fail-closed at entry, so NONE of them perform egress today (any scale or on-demand). (1) voice-broadcast-tts: isVoiceBroadcastTtsSpendCertified() returns false (tts:9-11) and returns 503 VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED before any paid TTS (tts:20-30); ElevenLabs egress at tts:98-119 is unreachable. (2) voice-broadcast-queue: isVoiceBroadcastQueueTenantCertified() returns false (queue:9-11) and returns 503 VOICE_BROADCAST_QUEUE_NOT_TENANT_CERTIFIED (queue:18-23) before service-role/auth/DB. (3) voice-broadcast-engine: isVoiceBroadcastSurfaceTenantCertified() returns false (engine:636-638) and returns 503 VOICE_BROADCAST_SURFACE_NOT_TENANT_CERTIFIED for EVERY action (engine:647-657); provider/DB access at 665-683 is unreachable. A second egress-specific lock for process_active/start exists (engine:690-700, VOICE_BROADCAST_EGRESS_NOT_CERTIFIED) but is DEAD CODE because the 647 lock returns first. Egress sites that WOULD fire if the boolean is flipped: Retell POST api.retellai.com/v2/create-phone-call (engine:121, callWithRetell 94-165); Twilio Calls.json (engine:396 callWithTwilio, engine:575 SIP-trunk, plus status/cancel 1877/2048/2142); Telnyx POST api.telnyx.com/v2/calls (engine:449). Designed for scale: batch limit 10 (process_active, engine:783) and MAX_CONCURRENT_CALLS=100 (engine:11) with pacing/error-rate logic. AUTH: config.toml sets verify_jwt=true for all three (tts 217-219, queue 221-224, engine 226-229), so the Supabase gateway rejects no-JWT requests; but the anon key is itself a JWT, so the real user check is in-function supabase.auth.getUser(token) (engine:1030-1033, queue:42-45, tts:53-57). Browser reachability: reachable from a browser that holds a user JWT (CORS is wildcard '*', engine:5-8); anonymous/no-JWT is blocked by verify_jwt. CRITICAL AUTH GAP (latent, behind the lock): the engine 'process_active' branch explicitly bypasses user auth (comment engine:702-703 'without requiring user auth'; no getUser call, engine:704-1026) and would dial all active broadcasts for any gateway-valid JWT (e.g. anon key). 'start' does require user auth + ownership (engine:1030-1050). GUARD COVERAGE BEFORE EGRESS: consent = NONE (no consent table read anywhere); DNC = NONE at dial time (dnc_list/do_not_call appear only in the DTMF callback that ADDS to DNC after a keypress, engine:2383-2410; the enqueue-time filters are in the queue fn, queue:96 eq do_not_call=false and queue:178-190 dnc_list check, which do NOT protect egress); global stop = NONE (engine 'stop' 1809 stops a single broadcast only; no global kill switch); calling hours = PRESENT and pre-egress in both paths (engine:751-774 process_active, engine:1089-1123 start) with default 09:00-21:00, BUT per-broadcast bypassable via broadcast.bypass_calling_hours===true (engine:752, 1090, 1121-1123) with no global override; credit/billing = NONE (zero grep hits for credit/balance; engine:646 comment admits 'billing contract' is absent). The start dial loop fetches pending rows with only status='pending' (engine:1464-1467), marks 'calling' (1553-1559), and dials (1591/1607/1631/1664/1691) with no DNC/consent/credit re-check; engine:291 'opted out' is only a Twilio error-code 21610 decoder, not a guard.

**evidence**

- supabase/functions/voice-broadcast-tts/index.ts:9-11 (lock returns false)
- supabase/functions/voice-broadcast-tts/index.ts:20-30 (503 503 VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED)
- supabase/functions/voice-broadcast-tts/index.ts:98-119 (ElevenLabs egress, unreachable)
- supabase/functions/voice-broadcast-queue/index.ts:9-11 (lock returns false)
- supabase/functions/voice-broadcast-queue/index.ts:18-23 (503 VOICE_BROADCAST_QUEUE_NOT_TENANT_CERTIFIED)
- supabase/functions/voice-broadcast-queue/index.ts:96,178-190 (enqueue-time DNC filters only)
- supabase/functions/voice-broadcast-engine/index.ts:636-638 (lock returns false)
- supabase/functions/voice-broadcast-engine/index.ts:647-657 (503 VOICE_BROADCAST_SURFACE_NOT_TENANT_CERTIFIED, all actions)
- supabase/functions/voice-broadcast-engine/index.ts:690-700 (VOICE_BROADCAST_EGRESS_NOT_CERTIFIED, dead code)
- supabase/functions/voice-broadcast-engine/index.ts:121 (Retell create-phone-call)
- supabase/functions/voice-broadcast-engine/index.ts:396,575,449 (Twilio/Telnyx egress)
- supabase/functions/voice-broadcast-engine/index.ts:702-704,1030-1033 (process_active no auth; other actions getUser)
- supabase/functions/voice-broadcast-engine/index.ts:751-774,1089-1123 (calling hours; bypass 752/1090/1121)
- supabase/functions/voice-broadcast-engine/index.ts:2383-2410 (dnc_list only in DTMF callback)
- supabase/functions/voice-broadcast-engine/index.ts:1464-1467,1553-1559,1591-1691 (dial loop, no DNC/consent/credit check)
- supabase/config.toml:217-229 (verify_jwt=true x3)

**validation**

Static read of all three functions (tts+queue fully; engine head/lock/auth/start/process_active/callback regions plus full-file greps). Greps for consent/global_stop/credit/balance/opt/DNC/suppress in engine returned no pre-egress guard. Findings are from source, not runtime: could not execute Deno functions or query deployed Supabase. No files changed (research-only).

**open_questions**

- Does a scheduled cron actually invoke engine action=process_active (which is the unauthenticated, no-ownership, dial-all broadcasts path)? If yes, lifting the 636 lock alone would open an unauthenticated mass-dial surface.
- Are the fail-closed locks and verify_jwt values actually deployed, or does config.toml/file state diverge from the live Supabase project?
- Do voice_broadcasts/broadcast_queue RLS policies prevent anon-key reads (tenant binding), given the engine lock text cites organization-binding as the missing piece?

**what_i_did_not_check**

- Did not read the entire 106KB engine line-by-line; covered head, locks, auth, start/process_active, and the DTMF callback plus exhaustive greps, but not every middle region.
- Did not inspect SQL migrations/RLS for voice_broadcasts/broadcast_queue/phone_numbers.
- Did not verify deployed Supabase function config vs config.toml, nor whether a cron calls process_active.
- Did not inspect referenced callback/helper functions (twilio-dtmf-handler, twilio-amd-webhook, call-tracking-webhook, _shared/manager-notify.ts).

**confidence**: high