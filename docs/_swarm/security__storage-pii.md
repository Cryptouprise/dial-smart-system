# security::storage-pii

- status: completed
- tldr: 2 public buckets (broadcast-audio, marketing-assets); anon policies already dropped but public=true remains; ringba-enrich-proxy logs full lead PII + emails in URLs; PII logs pervasive.

CONCERN (e) STORAGE + PII complete for security::storage-pii. PUBLIC BUCKETS: exactly 2, both public=true — broadcast-audio (mig 20251210010622:2-3; 20251211220758:2-3) and marketing-assets (20260402225758:1-9). OPEN POLICIES: 4 anonymous policies were historically open (broadcast-audio SELECT no-role 20251210010622:7-9; TO public SELECT 20251211220758:17-21; marketing-assets TO public SELECT 20260402225758:11-14; marketing-assets TO public INSERT/anonymous write 20260402225829:1-4) and were all dropped by 20260720232851:8-10 and 20260720232913:4-5. REMAINING: marketing-assets gated to admin via has_role (20260720232851:26-29); broadcast-audio writes user-foldername-scoped. RESIDUAL RISK: buckets stay public=true so /storage/v1/object/public/... still bypasses RLS by path. PII WORST CASE: ringba-enrich-proxy/index.ts (public, no-auth, CORS '*') logs full req.url (:35), first 2000 chars of body (:37), URL params JSON (:60), and the full outbound URL containing Phone/Name/Address/Email (:161) — full lead PII in logs AND URLs. Also PII in logs across ai-sms-processor:441, call-dispatcher:1056, ai-brain:1691, twilio-sms-webhook:533, telnyx-webhook:594, retell-call-webhook:780/815/2638, ghl-integration:539, outbound-calling:1487, and frontend useAutonomousAgent:491 (email), useRetellAI:91, CallSimulator:830-855, VoiceBroadcastManager:280/292, useNumberSync:120-239. PII in vendor URLs: enhanced-spam-lookup:636, twilio-integration:569, telnyx-ai-assistant:1414, retell-phone-management:117/130, door_to_door scripts.js:5 (token in URL). Scale: 350 PII-keyword console lines across 43 functions. VALIDATION: grep + direct file reads only; no live system touched; no secret/PII value printed. CONFIDENCE: medium. Follow-ups: confirm live bucket contents + log retention (needs read-only live query); decide whether ringba-enrich-proxy is still deployed.

## Artifact

**Findings**

(1) PUBLIC BUCKETS (FACT): only 2 storage buckets exist in the entire migration history, both public=true: 'broadcast-audio' (mig 20251210010622:2-3, re-declared 20251211220758:2-3) and 'marketing-assets' (mig 20260402225758:1-9). (2) RESIDUAL RISK (FACT): the anonymous SELECT/INSERT policies were later dropped (20260720232851:8-10; 20260720232913:4-5) BUT public=true remains, so /storage/v1/object/public/<bucket>/<path> still bypasses RLS for anyone with or guessing the object path; the migration comment 20260720232851:2-6 explicitly accepts this for Twilio playback and marketing image reads. (3) OPEN POLICIES - HISTORICAL, now dropped (FACT): 'Public read access for broadcast audio' FOR SELECT with no role (20251210010622:7-9); 'Broadcast audio is publicly accessible' TO public FOR SELECT (20251211220758:17-21); 'Public read access for marketing assets' TO public FOR SELECT (20260402225758:11-14); 'Public upload for marketing assets' TO public FOR INSERT - anonymous write (20260402225829:1-4). (4) REMAINING POLICIES (FACT): marketing-assets FOR ALL gated by public.has_role(auth.uid(),'admin') (20260720232851:26-29) = admin-scoped OK; broadcast-audio INSERT/UPDATE/DELETE scoped to auth.uid()=(storage.foldername(name))[1] (20251211220758:7-41) = user-scoped, not org-scoped. (5) WORST PII-IN-LOG (FACT): ringba-enrich-proxy/index.ts is a public no-auth endpoint (CORS '*') that logs at :35 the full req.url, :37 the first 2000 chars of the raw body (name/email/phone/qualification answers), :60 JSON of URL params, and :161 the FULL outbound URL built at :155-160 containing Phone/FirstName/LastName/Address/City/State/Zip/Email/qual answers. (6) OTHER FUNCTION PII LOGS (FACT): ai-sms-processor:441 fromNumber; call-dispatcher:1056 normalizedPhone; ai-brain:1691 normalizedFrom; twilio-sms-webhook:533 From+To+50 chars of SMS body; telnyx-webhook:594 from+to+SMS body; retell-call-webhook:780/815 names, :2638 transcript chunk; ghl-integration:539 lead.phone_number; outbound-calling:1487 lead names. (7) FRONTEND PII LOGS (FACT): useAutonomousAgent.ts:491 logs lead.email; useRetellAI.ts:91 logs {phoneNumber,terminationUri}; CallSimulator.tsx:830/850/855 contact.phone; VoiceBroadcastManager.tsx:280/292 phone.number; useNumberSync.ts:120/225/239 phone numbers. (8) PII-IN-URL (FACT): enhanced-spam-lookup:636 and twilio-integration:569 (?PhoneNumber=), telnyx-ai-assistant:1414 (?filter[phone_number]=), retell-phone-management:117,130 (URL path), door_to_door scripts.js:5 (auth token read from URL query into localStorage). (9) SCALE (FACT): >100 edge functions use console; 350 lines match a PII-keyword console pattern across 43 files in supabase/functions; 29 matches across 14 files in src/.

**evidence**

- supabase/migrations/20251210010622_7901ac13-fe4a-4b52-8a45-1d3ed0a8a21c.sql:2-3
- supabase/migrations/20251211220758_74c0ca0f-3774-4fee-b5ef-12c9d4fd9176.sql:2-3,7-41
- supabase/migrations/20260402225758_ec719bb8-259f-4c41-9832-475862927a11.sql:1-19
- supabase/migrations/20260402225829_e17df753-8165-4d17-a790-ab5da6a1656e.sql:1-4
- supabase/migrations/20260720232851_c4b83f62-0649-4a9d-9774-83f4c3f63155.sql:2-6,8-10,26-29
- supabase/migrations/20260720232913_b2eee188-931e-4436-bdbe-5891f09dbfbe.sql:2-5
- supabase/functions/ringba-enrich-proxy/index.ts:35,37,60,155-161,165
- supabase/functions/ai-sms-processor/index.ts:441
- supabase/functions/call-dispatcher/index.ts:1056
- supabase/functions/ai-brain/index.ts:1691
- supabase/functions/twilio-sms-webhook/index.ts:533
- supabase/functions/telnyx-webhook/index.ts:594
- supabase/functions/retell-call-webhook/index.ts:780,815,2638
- supabase/functions/ghl-integration/index.ts:539
- supabase/functions/outbound-calling/index.ts:1487
- supabase/functions/enhanced-spam-lookup/index.ts:636
- supabase/functions/twilio-integration/index.ts:569
- supabase/functions/telnyx-ai-assistant/index.ts:1414
- supabase/functions/retell-phone-management/index.ts:117,130
- src/hooks/useAutonomousAgent.ts:491
- src/hooks/useRetellAI.ts:91
- src/components/CallSimulator.tsx:830,850,855
- src/components/VoiceBroadcastManager.tsx:280,292
- src/hooks/useNumberSync.ts:120,225,239
- src/packs/door_to_door/app/scripts.js:5

**validation**

agentgrep (ripgrep) across supabase/migrations, certification/, supabase/functions/, src/ for 'storage.buckets', 'storage.objects', CREATE POLICY storage, public=true inserts, console.(log|error|warn|info) co-occurring with phone/email/ssn/lead, JSON.stringify(body/payload) logging, URLSearchParams / ?key= query building, and 'ssn|social_security'. Cited lines were returned by grep with file:line or read directly via the read tool (ringba-enrich-proxy full file; useAutonomousAgent:425-497; ai-sms-processor:435-448; call-dispatcher:1050-1057; enhanced-spam-lookup:630-636; useRetellAI:87-98). No secret or PII VALUE printed; only file:line and code shape. No live system or vendor API touched.

**open_questions**

- Do the public buckets actually hold PII today, or only Twilio audio + marketing images as the comment claims? Needs a live read-only object listing.
- Are edge-function logs retained, who can read them, and do they ship to any SIEM?
- Is ringba-enrich-proxy still deployed given Ringba is discontinued?
- Is the door_to_door token-from-URL (scripts.js:5) the real auth token, and is it short-lived?
- Do any of the unsampled 346 PII-keyword matches carry SSN or card data?

**what_i_did_not_check**

- Did not query the live Supabase project (emonjusymdripmkvtttc) for actual bucket objects, real policy state, or log retention - repo-only.
- Did not enumerate all 350 PII-keyword console matches; sampled the highest-signal ones.
- Did not audit src/packs/door_to_door (~7.7k LOC) for logging beyond the scripts.js token-in-URL hit.
- Did not verify whether console.* is stripped in production Vite builds (src logs may be dev-only).
- Did not review certification/recovery-lineage baseline SQL for buckets (grep returned none; only spot-checked).
- Did not assess ringba-enrich-proxy open CORS '*' as an auth concern (other lane).
- Did not check email-sender / stripe-webhook / calendar-integration for their own PII log lines or stored third-party payloads.

**confidence**: medium