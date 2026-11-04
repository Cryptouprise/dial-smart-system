# ce-demo-call

- status: completed
- tldr: demo-call: verify_jwt=true but public anon JWT passes it, so unauth browser can place a real call; consent-only, no DNC/hours/credit/launch-lock checks.

ce-demo-call DONE. Q: Can an unauthenticated browser invoke demo-call and place a real call? A: YES. verify_jwt=true (config.toml:371-372), but the frontend ships a public legacy anon JWT (src/integrations/supabase/client.ts:6, role=anon) that supabase.functions.invoke attaches (DemoPhoneInput.tsx:95-105), so the gateway gate is satisfied by anyone. No in-function caller verification (grep getUser|Authorization|apikey|bearer|Origin = 0). It builds a service-role client (index.ts:229-234). Checks: consent YES (index.ts:214-216); DNC NO; calling hours NO; credit NO. Launch lock: NO in-function reference; it dials Retell directly (index.ts:350-371) so it BYPASSES the call-dispatcher gates that enforce do_not_call (call-dispatcher:507,:883), calling hours (:424-475,:1339-1384) and Telnyx/Assistable certification (:1647,:1758). CORS is '*' (index.ts:4), no origin allowlist. Only gates: session exists + call_initiated one-shot + IP limit 5/phone limit 3 (spoofable x-forwarded-for) + a demo-agent config sanity check that rejects solar prompts.

## Artifact

**Findings**

verify_jwt for demo-call is TRUE (config.toml:371-372). BUT it is not a real auth barrier for the public demo: the frontend ships a hardcoded legacy anon JWT (role=anon) at src/integrations/supabase/client.ts:6 and supabase.functions.invoke('demo-call') at DemoPhoneInput.tsx:95-105 attaches it, so an UNAUTHENTICATED browser visitor with the public anon key passes verify_jwt=true and reaches the function. (config.toml:277-281 notes NEW opaque publishable keys cannot pass the legacy JWT gate, but this project still uses the legacy anon JWT.) No in-function caller verification exists: grep for getUser|Authorization|apikey|auth.|bearer|Origin in demo-call/index.ts = 0 matches. It builds a full SERVICE-ROLE client (index.ts:229-234) and trusts client-supplied sessionId (index.ts:262-266) and campaignType (index.ts:209, allowlist-validated :276-280); no org/tenant binding. Consent IS checked: consent !== true -> 400 (index.ts:214-216). DNC: NOT checked (0 matches). Calling hours: NOT checked (0 matches). Credit/balance: NOT checked (0 matches). Launch lock: NO in-function reference (0 matches); demo-call dials Retell directly (index.ts:350-371) instead of routing through the certified call-dispatcher, so it BYPASSES the dispatch gates that enforce do_not_call (call-dispatcher:507,:883), calling hours (call-dispatcher:424-475,:1339-1384) and Telnyx/Assistable launch-certification errors (call-dispatcher:1647,:1758). CORS/origin: Access-Control-Allow-Origin '*' (index.ts:4), no Origin allowlist or Origin validation. Gating that DOES exist: session must exist (index.ts:262-270); one-shot per session via call_initiated (:272-274); business name required (:284-286); configLooksLikeDedicatedDemo validation (:149-161 enforced :296-307) requiring retell agent/llm ids + demo_phone_number + Lady Jarvis prompt with {{business_name}} and rejecting solar prompts; IP daily limit 5 and phone daily limit 3 (:9-10,:241-260) with IP from spoofable x-forwarded-for/cf-connecting-ip (:235-237). ALLOWED_CAMPAIGNS (:12-19,:276-280) constrains campaignType only (content control, not auth). Net: an unauthenticated browser CAN place a real outbound Retell call + follow-up SMS (index.ts:410-421) with only a valid client-supplied sessionId and consent:true, with no DNC, calling-hours, credit, or dispatch-launch-lock checks.

**evidence**

- supabase/config.toml:371-372 -> [functions.demo-call] verify_jwt = true
- supabase/config.toml:277-281 -> comment: 'New opaque Supabase publishable keys cannot pass the legacy JWT gate.'
- src/integrations/supabase/client.ts:6 -> hardcoded SUPABASE_PUBLISHABLE_KEY = legacy anon JWT (role:anon, iss supabase)
- src/components/demo/DemoPhoneInput.tsx:95-105 -> supabase.functions.invoke('demo-call', { body: { sessionId, phoneNumber, campaignType, prospectName, prospectCompany, prospectEmail, consent: true } })
- supabase/functions/demo-call/index.ts:4 -> 'Access-Control-Allow-Origin': '*'
- supabase/functions/demo-call/index.ts:214-216 -> if (consent !== true) return 400
- supabase/functions/demo-call/index.ts:229-234 -> SUPABASE_SERVICE_ROLE_KEY + createClient(url, serviceKey)
- supabase/functions/demo-call/index.ts:235-237 -> clientIp from x-forwarded-for / cf-connecting-ip (spoofable)
- supabase/functions/demo-call/index.ts:241-260 -> IP_DAILY_LIMIT(5)/PHONE_DAILY_LIMIT(3) counts from demo_call_logs
- supabase/functions/demo-call/index.ts:262-274 -> .from('demo_sessions').select('*').eq('id', sessionId).single(); call_initiated one-shot
- supabase/functions/demo-call/index.ts:149-161 -> configLooksLikeDedicatedDemo (rejects solar prompts)
- supabase/functions/demo-call/index.ts:296-307 -> 503 DEMO_AGENT_CONFIG_INVALID if config unsafe
- supabase/functions/demo-call/index.ts:350-371 -> POST https://api.retellai.com/v2/create-phone-call (direct dial, override_agent_id)
- supabase/functions/demo-call/index.ts:410-421 -> follow-up SMS via service key
- grep demo-call/index.ts getUser|Authorization|apikey|auth.|bearer|Origin = 0 matches
- grep demo-call/index.ts launch|quarantine|launchSafety = 0 matches
- grep demo-call/index.ts do_not_call|dnc|calling_hours|quiet_hours|credit|balance = 0 matches
- supabase/functions/call-dispatcher/index.ts:507 and :883 -> .eq('do_not_call', false) / if (lead.do_not_call) return false
- supabase/functions/call-dispatcher/index.ts:424-475, :1339-1384 -> calling_hours_start/end gates
- supabase/functions/call-dispatcher/index.ts:1647, :1758 -> 'Telnyx outbound calling is not certified for launch' / Assistable unattended-dispatch certification errors

**validation**

Read the entire 438-line demo-call/index.ts and supabase/config.toml; read frontend caller DemoPhoneInput.tsx:60-149 and src/integrations/supabase/client.ts (key is a decodable legacy anon JWT, role:anon). Ran targeted greps: (a) launch/quarantine/launchSafety in demo-call = 0; (b) do_not_call/dnc/calling_hours/quiet_hours/credit/balance in demo-call = 0; (c) getUser/Authorization/apikey/auth./bearer/Origin in demo-call = 0. Compared against call-dispatcher which enforces do_not_call/calling-hours/Telnyx+Assistable certification. No live calls made.

**open_questions**

- Whether the DEPLOYED edge function actually runs with verify_jwt=true (config.toml is source of truth; deployment state not verified live).
- Whether demo_sessions rows are created unguessably / bound to the requester so a third party cannot reuse another session's sessionId before it is consumed.
- Whether an upstream WAF/edge/anti-bot layer sits in front of Supabase functions (not visible in repo).

**what_i_did_not_check**

- Live/deployed gateway behavior (whether verify_jwt is actually active on the deployed function) - no API calls made.
- RLS policies on demo_sessions and demo_call_logs (service role bypasses RLS regardless).
- Any WAF/CDN/bot-management layer in front of emonjusymdripmkvtttc.supabase.co.
- The demo_sessions creation path (demo-scrape-website) that issues the sessionId the caller must supply.
- sms-messaging function internals (called at index.ts:410) beyond noting its verify_jwt=false in config.toml:106-107.

**confidence**: high