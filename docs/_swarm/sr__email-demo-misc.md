# sr::email-demo-misc

- status: completed
- tldr: 16 edge functions audited: 13 use service role, 8 have hardcoded 503 gates, 4 elite-email + api-gateway VERIFIED; 3 live anon endpoints UNVERIFIED-CLIENT-ORG.

Node sr::email-demo-misc COMPLETE. Audited all 16 listed edge functions for (1) service-role client usage, (2) hardcoded disable gate + 503, (3) caller verification / org derivation. Delivered per-file: path:line | uses-SR | disabled | caller-verified(VERIFIED/SERVICE-ONLY-TRUST/UNVERIFIED-CLIENT-ORG) | evidence line, plus FACT/THEORY and a gap list.

Key results:
- SR client: YES for 13 (elite-email x4, demo-scrape, demo-funnel, law-firm-beta, setup-lady-jarvis, system-health, campaign-health, nudge-scheduler, backfill, api-gateway); NO for email-sender and elevenlabs-tts (Resend/ElevenLabs keys only).
- Hardcoded fail-closed 503 gate: 8 (email-sender:9, elevenlabs-tts:15, setup-lady-jarvis:102-110, system-health:11, campaign-health:28, nudge-scheduler:26, backfill:10, test-workflow:24). elite-email x4 are env-gated default-OFF (503 when unprovisioned).
- Caller-verified: VERIFIED for the 4 elite-email funcs (JWT getUser bound to owner + signed/HMAC attestation, org from env) and api-gateway (API-key -> server-derived userId/organizationId, api-auth.ts:81-82). UNVERIFIED-CLIENT-ORG for the 3 live anon public endpoints demo-scrape-website, demo-funnel-track, law-firm-beta-submit (service role, no auth, trust client body). Dead paths: campaign-health/test-workflow/nudge-scheduler UNVERIFIED, backfill SERVICE-ONLY-TRUST on service-key branch.

Cross-cutting FACT: demo-funnel-track and law-firm-beta-submit are ABSENT from supabase/config.toml (no [functions.*] verify_jwt entry), so gateway JWT behavior depends on deploy flags while their code has no auth.

Validation: full-file reads of every target + config.toml verify_jwt cross-check + per-file SUPABASE_SERVICE_ROLE_KEY grep. No secrets printed. Every claim file:line.
Blockers/follow-ups: confirm live deploy flags (--no-verify-jwt) for the two unlisted public functions, and whether elite-email ENABLED env flags are set true in prod. Did not audit the other ~90 functions or run the DB RPCs.

## Artifact

**Findings**

16 functions audited (14 live/12 dead paths). Legend: uses-SR = reads SUPABASE_SERVICE_ROLE_KEY + createClient; disabled = has hardcoded fail-closed gate returning 503; caller-verified = VERIFIED | SERVICE-ONLY-TRUST | UNVERIFIED-CLIENT-ORG.

1) elite-email-release-preparation/index.ts | uses-SR YES (index.ts:20,24) | disabled: env-gated default-OFF (ELITE_EMAIL_RELEASE_PREPARATION_ENABLED!=true -> 503; handler.ts:400, index.ts:91-94) | caller-verified: VERIFIED (handler.ts:438-439 bearer JWT auth.getUser===settings.owner; + signed attestation verify() handler.ts:294-374 with org cross-check :344; org from env config, not body) | evidence line: handler.ts:439.

2) elite-email-release-registration/index.ts | uses-SR YES (index.ts:19,23) | disabled: env-gated default-OFF (index.ts:100-103) | caller-verified: VERIFIED (handler.ts:543,547 JWT user===configuration.ownerUserId; + HMAC verifyRelease handler.ts:370-447) | evidence: handler.ts:547.

3) elite-email-release-status/index.ts | uses-SR YES (index.ts:20,24) | disabled: env-gated default-OFF (index.ts:92-95, handler.ts:153) | caller-verified: VERIFIED (handler.ts:189 authenticate===settings.owner; requires exact-empty body :179; org derived from env settings.organization :199) | evidence: handler.ts:189.

4) elite-email-mailgun-events/index.ts | uses-SR YES (index.ts:35,46) | disabled: env-gated default-OFF (ELITE_EMAIL_MAILGUN_EVENTS_ENABLED!=true throws -> 503; handler.ts:449, index.ts:16-31) | caller-verified: VERIFIED (Mailgun HMAC webhook signature handler.ts:223-273,365-375; verify_jwt=false is correct for webhook) | evidence: handler.ts:365-375.

5) email-sender/index.ts | uses-SR NO (uses RESEND_API_KEY :34; no service-role client) | disabled: YES hardcoded (isEmailEgressTenantCertified(){return false} :8-10; 503 :21-31) | caller-verified: n/a inert; dead path has NO caller check, trusts body to/subject/html (:46) = UNVERIFIED-CLIENT | evidence: index.ts:9.

6) elevenlabs-tts/index.ts | uses-SR NO | disabled: YES hardcoded (isElevenLabsTtsSpendCertified(){return false} :14-16; 503 :25-35) | caller-verified: n/a inert; dead path trusts body text/voiceId (:38) = UNVERIFIED-CLIENT | evidence: index.ts:15.

7) demo-scrape-website/index.ts | uses-SR YES (:114,119) | disabled: NO hardcoded gate (only config-missing 503 :116) -> LIVE | caller-verified: UNVERIFIED-CLIENT-ORG (no auth.getUser; trusts client url/sessionId :107; no org binding; guarded only by IP rate limit :132) | evidence: index.ts:107.

8) demo-funnel-track/index.ts | uses-SR YES (:78,92) | disabled: NO hardcoded gate (503 only if env missing :79) -> LIVE | caller-verified: UNVERIFIED-CLIENT-ORG (no auth; trusts client eventName/sessionId :82,85; session id existence-checked :96 but caller not authenticated) | evidence: index.ts:82.

9) law-firm-beta-submit/index.ts | uses-SR YES (:48,66) | disabled: NO hardcoded gate (503 only if env missing :50) -> LIVE | caller-verified: UNVERIFIED-CLIENT-ORG (no auth; trusts client body email/phone/interest :81-84; only verifies demo_session existence :70-77) | evidence: index.ts:53.

10) setup-lady-jarvis/index.ts | uses-SR YES (:115,121, but unreachable) | disabled: YES unconditional early-return 503 (disabled:true, :102-110, before try) | caller-verified: n/a inert; dead code no auth | evidence: index.ts:108.

11) system-health-monitor/index.ts | uses-SR YES (:29,35 and :138,144) | disabled: YES hardcoded (isSystemHealthMonitorCertified(){return false} :10-12; 503 :124-134) | caller-verified: n/a inert; dead GET returned all system_health_logs unauthenticated (comment :121-123 concedes arbitrary-JWT problem) | evidence: index.ts:11.

12) campaign-health-monitor/index.ts | uses-SR YES (:44,45) | disabled: YES hardcoded (isCampaignHealthAutomationTenantCertified(){return false} :27-29; 503 :36-41) | caller-verified: dead path UNVERIFIED-CLIENT-ORG (optional getUser :54 but trusts body userId/targetUserId :60,:84,:231) | evidence: index.ts:28.

13) nudge-scheduler/index.ts | uses-SR YES (:50,57) | disabled: YES hardcoded (isNudgeEgressCertified(){return false} :25-27; 503 :36-46) | caller-verified: dead path NO caller check (no getUser, no cron secret) = UNVERIFIED | evidence: index.ts:26.

14) backfill-call-agent-data/index.ts | uses-SR YES (:27,38) | disabled: YES hardcoded (:9-11; 503 :18-23) | caller-verified: dead path mixed - if token===serviceKey trusts body user_id (:50-56) = SERVICE-ONLY-TRUST; else JWT getUser (:59) = VERIFIED | evidence: index.ts:50.

15) test-workflow/index.ts | uses-SR YES (:117,122) | disabled: YES hardcoded (isWorkflowTestingCertified(){return false} :23-25; 503 :95-105) | caller-verified: dead path UNVERIFIED (only checks Authorization header PRESENT :108-114; no getUser; uses service key for DB writes :217) | evidence: index.ts:24.

16) api-gateway/index.ts (+_shared/api-auth.ts) | uses-SR YES (:41,74) | disabled: NO hardcoded gate | caller-verified: VERIFIED (API-key auth: hash+lookup api_keys api-auth.ts:58-59; derives userId/organizationId server-side :81-82; scope enforced requireScope :96-110) | evidence: api-auth.ts:81-82. verify_jwt=false (config.toml:444) appropriate.

Cross-cutting FACT: config.toml sets gateway verify_jwt for these; demo-funnel-track and law-firm-beta-submit are ABSENT from config.toml (no [functions.*] entry), so their gateway JWT behavior depends on deploy flags; their in-function code has zero auth. 8 of 16 have hardcoded fail-closed 503 gates (email-sender, elevenlabs-tts, setup-lady-jarvis, system-health-monitor, campaign-health-monitor, nudge-scheduler, backfill-call-agent-data, test-workflow); the 4 elite-email functions are env-gated (default off); all 7 real egress/monitor ones are inert today. The 3 live anonymous public endpoints (demo-scrape-website, demo-funnel-track, law-firm-beta-submit) use service role with no caller verification.

**evidence**

- supabase/functions/email-sender/index.ts:9 isEmailEgressTenantCertified returns false; :21-31 503 gate
- supabase/functions/elevenlabs-tts/index.ts:15 return false; :25-35 503
- supabase/functions/system-health-monitor/index.ts:11 return false; :124-134 503; :29/:138 service key
- supabase/functions/campaign-health-monitor/index.ts:28 return false; :36-41 503; :44-45 service key; :54 getUser; :84 trusts body userId
- supabase/functions/nudge-scheduler/index.ts:26 return false; :36-46 503; :50/:57 service key
- supabase/functions/backfill-call-agent-data/index.ts:10 return false; :18-23 503; :50-56 service-key trusts body user_id; :59 JWT path
- supabase/functions/test-workflow/index.ts:24 return false; :95-105 503; :108-114 header-presence-only; :117/:122 service key
- supabase/functions/setup-lady-jarvis/index.ts:102-110 unconditional 503; :115/:121 service key
- supabase/functions/demo-scrape-website/index.ts:114/:119 service key; :107 trusts body; :116 config 503
- supabase/functions/demo-funnel-track/index.ts:78/:92 service key; :82/:85 trusts body; :79 config 503
- supabase/functions/law-firm-beta-submit/index.ts:48/:66 service key; :50 config 503; :70-77 session existence only
- supabase/functions/elite-email-release-preparation/index.ts:20/:24 service key; handler.ts:439 JWT===owner; handler.ts:344 org check
- supabase/functions/elite-email-release-registration/index.ts:19/:23; handler.ts:547 JWT===ownerUserId; handler.ts:443-447 HMAC
- supabase/functions/elite-email-release-status/index.ts:20/:24; handler.ts:189 JWT===owner; :199 org from env
- supabase/functions/elite-email-mailgun-events/index.ts:35/:46; handler.ts:365-375 HMAC webhook verify; :449 env gate
- supabase/functions/api-gateway/index.ts:41/:74 service key; _shared/api-auth.ts:58-59 key lookup; :81-82 server-derived user/org
- supabase/config.toml:64,70,75 (elite-email verify_jwt=true); :82 mailgun verify_jwt=false; :51 system-health true; :187 elevenlabs-tts true; :354 email-sender true; :328 nudge true; :333 campaign-health true; :304 test-workflow true; :364 demo-scrape true; :375 setup-lady-jarvis true; :439 backfill true; :444 api-gateway false; demo-funnel-track & law-firm-beta-submit ABSENT

**validation**

Read each handler/index.ts in full (or the relevant request-handling region); cross-checked config.toml verify_jwt entries via Select-String; confirmed service-role usage by grepping SUPABASE_SERVICE_ROLE_KEY per file. No secrets printed. Every claim cites file:line.

**open_questions**

- Whether demo-funnel-track and law-firm-beta-submit are deployed with --no-verify-jwt (no config.toml entry), which determines if their zero-auth code is actually reachable by anon clients.
- Whether elite-email env flags (ELITE_EMAIL_RELEASE_*_ENABLED) are set true in the live project (default off in code).

**edge_cases_considered**

- env-gated disable (elite-email) treated as default-off, distinct from hardcoded return false
- functions whose dead code trusts body user_id/org (backfill service-key path, campaign-health body userId)
- webhook verify_jwt=false is correct for mailgun (HMAC signature instead)
- public anon demo endpoints using service role without auth
- config.toml absence for demo-funnel-track and law-firm-beta-submit

**what_i_did_not_check**

- I did not run the DB RPCs (prepare_elite_email_execution_release, register_elite_email_execution_release, record_elite_email_mailgun_event_receipt) to confirm server-side org enforcement.
- I did not inspect api-gateway's full 1200-line route table for per-route org scoping beyond the shared authenticateApiKey/requireScope boundary.
- I did not verify the 8 hardcoded 'return false' gates are always-false at runtime (assumed static).
- I did not audit the remaining ~90 edge functions outside this node's list.
- I did not check deployment secrets/env values (only code + config.toml).

**confidence**: high