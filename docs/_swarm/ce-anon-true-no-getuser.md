# ce-anon-true-no-getuser

- status: completed
- tldr: 23 functions audited: 21 hard-disabled at entry; only demo-call + demo-scrape-website are live & anon-reachable (service-role clients, outbound spend).

Audited all 23 named edge functions for in-function auth posture (research only). Result: 21 of 23 are hard-disabled at handler entry (guard returns 503 before any work); only DEMO-CALL and DEMO-SCRAPE-WEBSITE are live and anon-reachable, both constructing service-role clients at L234 / L119 respectively and placing outbound calls/scrapes with AI spend. 3 functions have dead-code Authorization-header presence checks (retell-cost-backfill L33, ghl-batch-callback L321, test-workflow L108) - presence only, no verification, and unreachable anyway. SUPABASE_SERVICE_ROLE_KEY clients constructed in 12 files (listed).

## Artifact

**Findings**

23-row audit; one concern, executed atomically. Pipe rows (FUNC | cors_wildcard | in_func_auth | auth_kind | anon_reachable | priv_side_effect | note):

1. advanced-spam-detection | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L43/49 reads+writes phone_numbers and quarantines across ALL tenants (unreachable) | note=guard L29 `if (!isAdvancedSpamAnalysisCertified())` -> 503 L34 'Advanced spam analysis is disabled until tenant-scoped authorization is certified.'; SUPABASE_SERVICE_ROLE_KEY client built L43/L49.
2. ai-assistant-config | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Lovable AI spend L228-241; no service-role client | note=guard L202 `if (!isAiConfigurationAssistantCertified())` -> 503 L203 'AI configuration assistance is disabled until authentication, organization context, budgets, and durable draft semantics are certified.'
3. ai-configuration-complete | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Lovable AI spend L366-379; no service-role client | note=guard L340 -> 503 L341 'AI configuration completion is disabled until authentication, organization context, budgets, and durable draft semantics are certified.'
4. ai-workflow-generator | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Lovable AI spend; no service-role client | note=guard L17 -> 503 L18 'AI workflow generation is disabled until tenant context, budgets, bounded inputs, and non-executing draft output are certified.'
5. airtable-sync | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L50/56 invokes call-tracking-webhook on caller-supplied records (unreachable) | note=guard L36 -> 503 L41 'Airtable sync is disabled until signed, tenant-bound ingestion is certified.'
6. check-number-config | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Twilio admin read of every account number (unreachable) | note=UNCONDITIONAL early return L13-21 before try -> 503 L16-17 'Provider phone-number metadata access is disabled until tenant ownership and operator authorization are certified.' No service-role client.
7. clear-voice-webhooks | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Twilio voice-webhook mutation across all numbers (unreachable) | note=UNCONDITIONAL early return L13-21 -> 503 L16-17 'Voice-webhook control-plane changes are disabled until tenant ownership and operator authorization are certified.' No service-role client.
8. demo-call | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=yes | priv_side_effect=LIVE service-role client L234; inserts demo_call_logs L384, updates demo_sessions L392, places outbound Retell demo call, sends follow-up SMS via sms-messaging L410 with service key (Retell+Twilio spend) | note=NO AUTH FOUND; only guards are consent===true L214 and IP/phone daily limits L241-260. SUPABASE_SERVICE_ROLE_KEY client built L229/L234.
9. demo-scrape-website | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=yes | priv_side_effect=LIVE service-role client L119; inserts/updates demo_sessions L254-268; Firecrawl scrape L137 + Lovable AI spend L208 | note=NO AUTH FOUND; only an IP daily limit L126-134. SUPABASE_SERVICE_ROLE_KEY client built L114/L119.
10. demo-sms-reply | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Lovable AI spend L221-233; no service-role client | note=guard L162 -> 503 L163 'Demo SMS AI replies are disabled until authentication, bounded spend, and explicit demo isolation are certified.'
11. elevenlabs-tts | cors_wildcard=yes@10 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=ElevenLabs paid TTS spend; no service-role client | note=guard L25 -> 503 L30 'ElevenLabs TTS is disabled until paid generation is tenant-bound and receipt-backed.'
12. email-sender | cors_wildcard=yes@4 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Resend email egress; no service-role client | note=guard L21 -> 503 L26 'Email sending is disabled until recipient ownership, budgets, confirmation, and delivery receipts are certified.'
13. generate-daily-report | cors_wildcard=yes@12 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L236/253 reads all users' call_logs/leads/sms and writes daily_reports + Lovable AI spend (unreachable) | note=guard L222 -> 503 L227 'Daily report generation is disabled until tenant and scheduler authorization are certified.'
14. ghl-batch-callback | cors_wildcard=yes@5 | in_func_auth=yes@321(header-presence only, NOT validated) | auth_kind=other(header-presence) | anon_reachable=no(disabled) | priv_side_effect=service-role client L312/318 loads every tenant's stored GHL token and mutates external GHL contacts (unreachable) | note=guard L298 -> 503 L303 'GHL batch callbacks are disabled until exact internal authorization and tenant claims are certified.'; dead code below only checks `const authHeader = req.headers.get('Authorization'); if (!authHeader)` L321-327.
15. quick-test-call | cors_wildcard=yes@2 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=none (entire handler inert); no service-role client | note=Deno.serve L13 UNCONDITIONAL return L16-24 -> 503 L19 'Twilio test calls are disabled until they use the canonical provider boundary.'
16. remove-trunk | cors_wildcard=yes@5 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Twilio trunk/number removal (unreachable) | note=UNCONDITIONAL early return L14-22 -> 503 L17 'Trunk control-plane changes are disabled until tenant ownership and operator authorization are certified.' No service-role client.
17. retell-cost-backfill | cors_wildcard=yes@4 | in_func_auth=yes@33(header-presence only, NOT validated) | auth_kind=other(header-presence) | anon_reachable=no(disabled) | priv_side_effect=service-role client L37/46 enumerates cross-tenant call_logs and spends Retell API (unreachable) | note=guard L20 -> 503 L25 'Retell cost backfill is disabled until exact scheduler authorization and bounded claims are certified.'; dead code below `const authHeader = req.headers.get('Authorization'); if (!authHeader) throw new Error('Missing auth');` L33-34.
18. scheduled-spam-check | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L38/44 invokes spam-detection and releases quarantined numbers for all tenants (unreachable) | note=guard L22 -> 503 L27 'Scheduled spam checks are disabled until exact scheduler authorization is certified.'
19. setup-inbound-calls | cors_wildcard=yes@5 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=Twilio voice-webhook mutation across all numbers (unreachable); no service-role client | note=UNCONDITIONAL early return L14-22 -> 503 L17 'Inbound provider control-plane changes are disabled until tenant ownership and operator authorization are certified.'
20. setup-lady-jarvis | cors_wildcard=yes@5 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L115/121 + Retell provisioning of demo LLM/agent (unreachable) | note=UNCONDITIONAL early return L102-110 -> 503 L105 'Demo provider provisioning is disabled until tenant ownership and operator authorization are certified.'
21. spam-detection | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L41/47 reads all phone_numbers and quarantines across tenants (unreachable) | note=guard L27 -> 503 L32 'Spam detection is disabled until tenant-scoped authorization is certified.'
22. system-health-monitor | cors_wildcard=yes@6 | in_func_auth=no | auth_kind=none | anon_reachable=no(disabled) | priv_side_effect=service-role client L138/144 reads/writes system_health_logs + probes Retell/Supabase (unreachable) | note=guard L124 -> 503 L129 'System health monitoring is disabled until control-plane authorization is certified.'
23. test-workflow | cors_wildcard=yes@19 | in_func_auth=yes@108(header-presence only, NOT validated) | auth_kind=other(header-presence) | anon_reachable=no(disabled) | priv_side_effect=service-role client L117/122 (caller Authorization passed through) + real-mode executes calls/SMS (unreachable) | note=guard L95 -> 503 L100 'Workflow testing is disabled until tenant ownership and receipt-backed real execution are certified.'; dead code below `if (!authHeader) return 401` L108-114.

SUMMARY: 0 of the 23 use service-role-bearer equality, HMAC, shared secret, API-key, or origin allow-list as the gate. Every non-demo function's only protection is (a) the disabled-until-certified guard and, in 3 cases, (b) a header-presence-only check that is dead code. 21/23 anon_reachable=no(disabled); 2/23 (demo-call, demo-scrape-website) anon_reachable=yes.

SUPABASE_SERVICE_ROLE_KEY clients (12 files): advanced-spam-detection L43/49, airtable-sync L50/56, demo-call L229/234, demo-scrape-website L114/119, generate-daily-report L236/253, ghl-batch-callback L312/318, retell-cost-backfill L37/46, scheduled-spam-check L38/44, setup-lady-jarvis L115/121, spam-detection L41/47, system-health-monitor L138/144, test-workflow L117/122. NO service-role client: ai-assistant-config, ai-configuration-complete, ai-workflow-generator, check-number-config, clear-voice-webhooks, demo-sms-reply, elevenlabs-tts, email-sender, quick-test-call, remove-trunk, setup-inbound-calls.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/demo-call/index.ts:199 Deno.serve; :214 consent guard; :234 service-role client; :241-260 IP/phone limits; :410 SMS egress
- C:/Users/charl/dial-smart-system/supabase/functions/demo-scrape-website/index.ts:102 Deno.serve; :119 service-role client; :126-134 IP limit; :137 Firecrawl scrape; :208 Lovable AI spend; :90-95 SSRF block
- C:/Users/charl/dial-smart-system/supabase/functions/advanced-spam-detection/index.ts:29 guard; :34 503 msg; :43/49 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/ai-assistant-config/index.ts:202 guard; :203 503 msg; :228-241 Lovable spend
- C:/Users/charl/dial-smart-system/supabase/functions/ai-configuration-complete/index.ts:340 guard; :341 503 msg
- C:/Users/charl/dial-smart-system/supabase/functions/ai-workflow-generator/index.ts:17 guard; :18 503 msg
- C:/Users/charl/dial-smart-system/supabase/functions/airtable-sync/index.ts:36 guard; :41 503 msg; :50/56 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/check-number-config/index.ts:13-21 unconditional disabled; :17 msg
- C:/Users/charl/dial-smart-system/supabase/functions/clear-voice-webhooks/index.ts:13-21 unconditional disabled; :17 msg
- C:/Users/charl/dial-smart-system/supabase/functions/demo-sms-reply/index.ts:162 guard; :163 503 msg; :221-233 Lovable spend
- C:/Users/charl/dial-smart-system/supabase/functions/elevenlabs-tts/index.ts:25 guard; :30 503 msg
- C:/Users/charl/dial-smart-system/supabase/functions/email-sender/index.ts:21 guard; :26 503 msg
- C:/Users/charl/dial-smart-system/supabase/functions/generate-daily-report/index.ts:222 guard; :227 503 msg; :236/253 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/ghl-batch-callback/index.ts:298 guard; :303 503 msg; :312/318 service-role; :321-327 dead-code header check
- C:/Users/charl/dial-smart-system/supabase/functions/quick-test-call/index.ts:13 Deno.serve; :16-24 unconditional disabled; :19 msg
- C:/Users/charl/dial-smart-system/supabase/functions/remove-trunk/index.ts:14-22 unconditional disabled; :17 msg
- C:/Users/charl/dial-smart-system/supabase/functions/retell-cost-backfill/index.ts:20 guard; :25 503 msg; :33-34 dead-code header check; :37/46 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/scheduled-spam-check/index.ts:22 guard; :27 503 msg; :38/44 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/setup-inbound-calls/index.ts:14-22 unconditional disabled; :17 msg
- C:/Users/charl/dial-smart-system/supabase/functions/setup-lady-jarvis/index.ts:102-110 unconditional disabled; :105 msg; :115/121 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/spam-detection/index.ts:27 guard; :32 503 msg; :41/47 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/system-health-monitor/index.ts:124 guard; :129 503 msg; :138/144 service-role
- C:/Users/charl/dial-smart-system/supabase/functions/test-workflow/index.ts:95 guard; :100 503 msg; :108-114 dead-code header check; :117/122 service-role

**validation**

Read every target file's guard and handler regions directly (file reads, not just grep) with line-accurate references for CORS, guard returns, service-role client construction, and dead-code header checks. Cross-checked each file's disabled-return line and quoted the exact guard text. Confirmed 23/23 functions accounted for. Verified by targeted search that ai-assistant-config, ai-configuration-complete, ai-workflow-generator, elevenlabs-tts, email-sender and the 4 Twilio control-plane files construct no SUPABASE_SERVICE_ROLE_KEY client.

**open_questions**

- Are demo-call and demo-scrape-website intended to be fully public (their lack of guard looks intentional - they are the public demo funnel), or should they carry an origin/CAPTCHA check before spending Retell/Firecrawl/Twilio money?
- The 3 dead-code header-presence checks are not verification; if any of those functions is re-enabled by flipping isCertified() to true, the only auth would be header presence. Is real verification intended in the same change?

**what_i_did_not_check**

- Did not open supabase/config.toml to confirm verify_jwt values per function (took the caller's premise as given).
- Did not examine non-target sibling functions (ai-brain, ai-assistant, api-gateway, stripe-webhook, etc.) - out of scope for this node.
- Did not test any endpoint live (research only; no requests made).
- Did not trace whether demo-call/demo-scrape-website have a separate upstream gate (Caddy/WAF/Cloudflare) outside the function code.
- Did not verify whether the disabled 503s are reachable via an alternate code path (e.g. a second export or wrapper); only the single serve/Deno.serve entry per file was inspected.

**confidence**: high