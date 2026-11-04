# ce-egress-sms-health

- status: completed
- tldr: nudge-scheduler + campaign-health-monitor have 503 launch gates before egress; sms-messaging + ai-sms-processor have none. No fn anon-reachable.

ce-egress-sms-health DONE (read-only). 4 functions characterized with file:line.

| function | egress? | verify_jwt | launch-quarantined(503)? | anon-browser reachable? | bypasses launch lock? | citations |
|---|---|---|---|---|---|---|
| nudge-scheduler | YES - Twilio SMS POST Messages.json (index.ts:239-250) + LLM ai.gateway.lovable.dev (index.ts:193) | true | YES - isNudgeEgressCertified()=false (index.ts:25-27), gate :36-46, 503 :43; runs BEFORE first egress | NO - CORS '*' (:17) but verify_jwt=true; only OPTIONS (:30-32) | NO - gate unconditional after OPTIONS | config.toml:327-328 |
| sms-messaging | YES - Telnyx POST v2/messages (:258-270), Twilio POST Messages.json (:334-341); Twilio config write (:597) | false | NO gate (grep Certified/quarantin/503 = none) | NO - CORS '*' (:11)+verify_jwt=false, but code enforces Authorization->401 (:123-125) + getUser/service-role (:126-140) | N/A (no lock); service-role branch (:127-131) still passes DNC gate (:196-209) | config.toml:106-107 |
| ai-sms-processor | YES - LLM (:533,693,899,1185); SMS Telnyx (:572-584), Twilio (:598-610) | true | NO gate (grep Certified/NOT_CERTIFIED/503 = none) DESPITE config comment claiming quarantine | NO - CORS '*' (:13), verify_jwt=true, in-fn Authorization->401 (:138-148) + getUser (:174) | N/A (no lock); DNC gate only (:484-496) | config.toml:109-112 |
| campaign-health-monitor | NO provider egress - DB-only repair; alerts -> system_alerts table (:247) | true | YES - isCampaignHealthAutomationTenantCertified()=false (:27-29), gate :36-41, 503 :38; before service-role client (:43-45) | NO - CORS '*' (:5), verify_jwt=true, 503 gate for all; authHeader optional (:52-58) but unreachable | NO - gate unconditional after OPTIONS (:32-34) | config.toml:330-333 |

Headline: only nudge-scheduler + campaign-health-monitor have launch-quarantine gates (both run before any egress). sms-messaging and ai-sms-processor have NO launch gate; ai-sms-processor's config comment (config.toml:110-111) claims it is launch-quarantined but no in-function 503 gate exists.

## Artifact

**Findings**

Deep pass of 4 edge functions (read-only). KEY: only nudge-scheduler and campaign-health-monitor have a launch-quarantine gate (a `*Certified()` helper returning false -> 503) and both gates run BEFORE any egress/client construction. sms-messaging and ai-sms-processor have NO launch-quarantine gate at all, despite config.toml comments for ai-sms-processor (line 110-111) claiming it is 'Launch-quarantined before auth, database, or AI access'. EGRESS: nudge-scheduler = Twilio SMS POST + LLM; sms-messaging = Telnyx + Twilio SMS POST (real sends, verify_jwt=false, but auth enforced in-function); ai-sms-processor = LLM (4 sites) + Telnyx/Twilio SMS POST; campaign-health-monitor = NO provider egress (DB-only repair + system_alerts table). No function is anonymous-browser reachable: all require Authorization (nudge/campaign blocked by verify_jwt=true + 503 gate; sms-messaging and ai-sms-processor enforce an in-function 401 + getUser/service-role check). No egress path bypasses a launch lock (the two locks are unconditional after OPTIONS).

**evidence**

- nudge-scheduler/index.ts:25-27 isNudgeEgressCertified() returns false; :36-46 gate; :43 status 503; :17 CORS '*'; :30-32 OPTIONS returns 200; :193 LLM POST ai.gateway.lovable.dev; :239-250 Twilio POST api.twilio.com/.../Messages.json; gate precedes both egress sites
- config.toml:327-328 [functions.nudge-scheduler] verify_jwt = true # ...legacy direct SMS egress is fail-closed
- sms-messaging/index.ts:8-9 imports only serve+createClient (no _shared/sms-boundary import); :11 CORS '*'; :103-107 OPTIONS; :120-140 auth (401 if no Authorization, service-role token+user_id OR auth.getUser); :196-209 DNC gate before send; :258-270 Telnyx POST v2/messages; :313-317 Twilio IncomingPhoneNumbers verify; :334-341 Twilio POST Messages.json; :597-604 Twilio config write. grep Certified|quarantin|NOT_CERTIFIED|503|disabled = NO MATCHES (no launch gate)
- config.toml:106-107 [functions.sms-messaging] verify_jwt = false
- ai-sms-processor/index.ts:12-14 CORS '*'; :131-135 OPTIONS; :137-148 requires Authorization -> 401; :167-187 service-role token+userId OR auth.getUser; :533,693,899,1185 LLM POST ai.gateway.lovable.dev; :572-584 Telnyx POST v2/messages; :598-610 Twilio POST Messages.json; :483-496 lead.do_not_call gate. grep Certified|NOT_CERTIFIED|503|EGRESS = NO MATCHES (no launch gate)
- config.toml:109-112 [functions.ai-sms-processor] comment 'Launch-quarantined before auth, database, or AI access' but verify_jwt = true (comment NOT backed by any in-function 503 gate)
- campaign-health-monitor/index.ts:27-29 isCampaignHealthAutomationTenantCertified() returns false; :36-41 gate; :38 status 503; :43-45 service-role client built AFTER gate; :5 CORS '*'; :32-34 OPTIONS; :52-58 optional authHeader; :247-256 alerts written to system_alerts table; no api.twilio/api.telnyx/slack/alerting fetch anywhere
- config.toml:330-333 [functions.campaign-health-monitor] comment 'Launch-quarantined before service-role construction...' verify_jwt = true

**validation**

Read each index.ts in full or via targeted reads; cross-checked egress with findstr for api.twilio.com, api.telnyx.com, messages.create, ai.gateway, chat/completions, 503, Access-Control-Allow-Origin, Certified, quarantin, getUser(, serviceRoleKey, Authorization, OPTIONS; read config.toml blocks at 104-115 and 320-333. No live SMS/calls placed (read-only).

**open_questions**

- ai-sms-processor config.toml comment claims launch-quarantine but no in-function 503 gate exists - is the quarantine enforced elsewhere (DB trigger, pg_cron removal migration, gateway rule) or is the comment stale?
- sms-messaging verify_jwt=false: is any upstream gateway/RLS layer expected to provide anon protection, or does the in-function 401 fully cover it?
- campaign-health-monitor: with verify_jwt=true and a hard 503, is the function effectively dead code / intentionally disabled?

**what_i_did_not_check**

- ai-sms-processor lines 400-433, 650-960 read only via grep, not full prose (relied on provider-URL grep to enumerate all egress)
- twilio-sms-webhook (the caller of ai-sms-processor process_webhook) not inspected - did not confirm how it authenticates through verify_jwt=true
- did not check DB triggers/RPCs or pg_cron/migration files that might implement launch quarantine outside the function bodies
- sms-boundary.ts only head-read (lines 1-40); confirmed not imported by sms-messaging/index.ts
- did not test Supabase gateway behavior for verify_jwt=true with the anon key (inferred standard behavior)
- no live provider calls made

**confidence**: high