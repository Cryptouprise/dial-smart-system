# sr::dialing::voice-broadcast-tts

- status: completed
- tldr: voice-broadcast-tts: uses-service-role, disabled(503 gate L20), caller-verified VERIFIED (auth.getUser L54, org derived server-side L74)

Audit complete. voice-broadcast-tts/index.ts (209 lines) — ROW: index.ts:50 | uses-service-role | disabled | caller-verified: VERIFIED | evidence: L39 reads SUPABASE_SERVICE_ROLE_KEY, L50 createClient(url, serviceKey) (no anon key); L9-11 isVoiceBroadcastTtsSpendCertified(){return false}, L20 gate, L27 status 503 (VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED); L53-57 auth.getUser(token) rejects if authError||!user; L59 client body has only {broadcastId,messageText,voiceId,ivrPrompt} — no org_id/organization_id/campaign_id; L70-75 ownership derived server-side via .eq('user_id', user.id). Note: entire L32-197 path is dead code after the L20 gate.

## Artifact

**Findings**

ROW: C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:50 | uses-service-role | disabled | caller-verified: VERIFIED | evidence: L39 SUPABASE_SERVICE_ROLE_KEY -> L50 createClient(url, serviceRoleKey) (service-role client, no anon key); L9-11 isVoiceBroadcastTtsSpendCertified(){return false} -> L20 gate -> L27 status 503; L53-57 supabase.auth.getUser(token) rejects if authError||!user; L59 body has only {broadcastId,messageText,voiceId,ivrPrompt} (no org_id); L70-75 ownership enforced server-side .eq('user_id', user.id). NOTE (dead-code-after-gate): the auth/ownership path L32-197 is unreachable because the L20 gate returns 503 first. FACT: uses-service-role, disabled, caller-verified=VERIFIED. THEORY: the disabled gate is a deliberate launch-containment stub (comment L18-19: broadcast TTS spend is user-scoped and pre-receipt; egress engine locked).

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:39 const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:50 const supabase = createClient(supabaseUrl, supabaseKey)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:9-11 function isVoiceBroadcastTtsSpendCertified(): boolean { return false; }
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:20-29 if (!isVoiceBroadcastTtsSpendCertified()) { ... status: 503, error_code: 'VOICE_BROADCAST_TTS_SPEND_NOT_CERTIFIED' }
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:53-57 token = authHeader.replace('Bearer ',''); const { data: { user }, error: authError } = await supabase.auth.getUser(token); if (authError || !user) throw 'Unauthorized'
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:59 const { broadcastId, messageText, voiceId, ivrPrompt } = await req.json()  (no org_id/organization_id/campaign_id in body)
- C:/Users/charl/dial-smart-system/supabase/functions/voice-broadcast-tts/index.ts:70-75 .from('voice_broadcasts').select('id, user_id, voice_speed').eq('id', broadcastId).eq('user_id', user.id)  (ownership derived server-side from verified user)

**validation**

Read all 209 lines of index.ts; each claim cited at file:line. Env var names only referenced, no secret values printed.

**open_questions**

- Does any sibling edge function or the broadcast egress engine reference this function such that the 503 changes prior behavior?
- When the gate is re-enabled, is org-binding (currently user_id only, no organization_id) sufficient, since the service-role client bypasses RLS?

**what_i_did_not_check**

- DB schema/RLS on voice_broadcasts and broadcast-audio bucket
- Sibling edge functions for the same disable pattern
- git history / when the gate was introduced
- Whether ELEVENLABS_API_KEY or SUPABASE_SERVICE_ROLE_KEY are actually set in the deployed environment

**confidence**: high