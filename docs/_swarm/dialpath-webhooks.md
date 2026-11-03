# dialpath-webhooks

- status: completed
- tldr: Retell call webhook 503s without signing key (top day-one cause); Telnyx 503 confirmed; all webhook setters 503-disabled; URLs account-global not per-org.

dialpath-webhooks DONE. Traced the inbound callback path for the 4 named functions + outbound dial path. KEY: retell-call-webhook 503s UNLESS RETELL_WEBHOOK_SIGNING_KEY is set AND VERIFY_MODE=enforce (index.ts:521-583) - an outbound campaign call places but every call_started/ended/analyzed is rejected 503, call_logs stuck in_progress; the reconciler cron is disabled by default (migration 20260713043000 unschedules it), so no auto-recovery. Retell outbound is fail-closed at dial (assertRetellLaunchAgentConfiguration, outbound-calling:917-921). voice-call-events 503 on unset WEBHOOK_SECRET_TELNYX CONFIRMED (voice-call-events:212-220). All provider-admin setters are 503-disabled (retell-phone-management:28-36, retell-agent-management:44-52, retell-inbound-webhook:43-51, clear-voice-webhooks:13-21) and call-tracking-webhook is an unconditional 503 (134-142). Twilio voice+SMS verifiers fail closed 403 on missing token/signature (_shared/twilio.ts:286-307, twilio-sms-webhook:421-439). URLs are account-global, not per-org. Registration inventory and 10 ranked findings are in the node artifact.

## Artifact

**Findings**

RANKED, SEVERITY HIGH -> LOW. [1][HIGH] retell-call-webhook returns 503 for EVERY delivery unless BOTH RETELL_WEBHOOK_VERIFY_MODE=enforce AND RETELL_WEBHOOK_SIGNING_KEY are set; default mode is enforce so an unset signing key = 503 (fail-closed). An outbound Retell campaign call places, but call_started/call_ended/call_analyzed all get 503: call_logs never leaves in_progress, no transcript/disposition/queue/billing write. Most likely DAY-ONE cause. FILE retell-call-webhook/index.ts:521-522, 572-577, 578-583. RETELL_WEBHOOK_SIGNING_KEY is not in the ship runbook secret list -> presumed unset (VERIFY live). [2][HIGH] Reconciliation safety net is OFF by default: retell-reconciler migration unschedules the cron at the end; enabling needs 3 named Vault secrets + explicit call. If [1] fires there is no automatic recovery. FILE migrations/20260713043000_retell_automatic_reconciliation.sql:1893, 1922-1930. [3][HIGH] voice-call-events (Telnyx browser-phone leg) returns 503 whenever WEBHOOK_SECRET_TELNYX is unset - CONFIRMED. Telephony events rejected; call_logs sticks at initiated/ringing; transcripts never append. FILE voice-call-events/index.ts:212-220. [4][HIGH] Every provider-admin function that could REGISTER these webhooks from the app is 503-disabled, so a new customer's webhooks can only be set by hand in provider dashboards. FILES retell-phone-management/index.ts:28-36, retell-agent-management/index.ts:44-52, clear-voice-webhooks/index.ts:13-21, retell-inbound-webhook/index.ts:43-51, call-tracking-webhook/index.ts:134-142. [5][MEDIUM] call-tracking-webhook is a hard 503 for ALL non-OPTIONS requests before any parsing (index.ts:134-142). If any provider URL still points at legacy /call-tracking-webhook, every completion is dropped with 503 forever, silently. [6][MEDIUM] Retell inbound number webhook: per-number inbound_webhook_url -> .../retell-inbound-webhook (_pn_app.json). (a) only setter retell-phone-management update index.ts:104-122 is 503-disabled (must set in Retell dashboard); (b) the target retell-inbound-webhook itself 503s (INBOUND_DYNAMIC_VARS_NOT_CERTIFIED, index.ts:43-51), so no dynamic-variable injection. Inbound call events still flow via the AGENT webhook_url (retell-call-webhook). [7][MEDIUM] Twilio browser-phone + SMS webhooks fail CLOSED (403) when TWILIO_AUTH_TOKEN unset or signature missing/invalid - never process, never alert. FILES _shared/twilio.ts:286-307, twilio-voice-status/index.ts:34-37, twilio-voice-twiml/index.ts:65, twilio-voice-transcription/index.ts:36, twilio-sms-webhook/index.ts:421-439. With the token missing no status/recording/transcription and no inbound SMS is stored. [8][MEDIUM] Registration inventory for a first campaign to report back (campaign dial = Retell outbound: call-dispatcher -> outbound-calling -> Retell create-phone-call). Required: (A) Retell AGENT webhook_url = https://<proj>.supabase.co/functions/v1/retell-call-webhook AND webhook_events=[call_started,call_ended,call_analyzed] (enforced at dial time); (B) RETELL_WEBHOOK_SIGNING_KEY + RETELL_WEBHOOK_VERIFY_MODE=enforce in edge secrets else [1]; (C) Retell per-number inbound_webhook_url -> .../retell-inbound-webhook; (D) Telnyx connection webhook_event_url -> .../voice-call-events + WEBHOOK_SECRET_TELNYX; (E) Twilio TwiML App Voice Request URL -> .../twilio-voice-twiml and Status Callback -> .../twilio-voice-status, plus per-number Messaging webhook -> .../twilio-sms-webhook. URLs are ACCOUNT-GLOBAL (one Supabase project), NOT per-org; tenancy is by number ownership in the DB. Per-NUMBER registration is only Retell inbound_webhook_url and the Twilio number messaging URL. [9][HIGH] Retell outbound is FAIL-CLOSED at dial time, not silently dropped: outbound-calling reads the live agent config and calls assertRetellLaunchAgentConfiguration, which THROWS (RETELL_AGENT_NOT_CERTIFIED) if live agent webhook_url != canonical URL or webhook_events missing. FILES outbound-calling/index.ts:917-921; _shared/retell-provider-contract.ts:86-153 (116-130), 199-241 (line 224). [10][LOW] verify_jwt=false for the webhook entries in supabase/config.toml:236-240, 274-275, 288-289; voice-call-events not listed (runbook step 3 line 115 says deploy verify_jwt=false).

**evidence**

- retell-call-webhook/index.ts:521-522,572-583
- voice-call-events/index.ts:212-220,246-250
- call-tracking-webhook/index.ts:134-142
- retell-inbound-webhook/index.ts:43-51
- retell-phone-management/index.ts:28-36,104-122
- retell-agent-management/index.ts:9-10,44-52
- clear-voice-webhooks/index.ts:13-21
- outbound-calling/index.ts:917-921,1814-1834
- _shared/retell-provider-contract.ts:86-153,199-241
- twilio-voice-status/index.ts:34-37
- twilio-voice-twiml/index.ts:65
- twilio-voice-transcription/index.ts:36
- twilio-sms-webhook/index.ts:5,421-439
- _shared/twilio.ts:286-307
- migrations/20260713043000_retell_automatic_reconciliation.sql:1893-1930
- config.toml:236-240,274-275,288-289
- docs/wholesale/SHIP-RUNBOOK.md:31,90-104
- _pn_app.json and _pn_direct.json (inbound_webhook_url)

**validation**

Source-only trace of the four named functions plus their shared providers, the outbound/certified dial path, the provider-admin setters, config.toml JWT flags, the reconciler migration, and the ship runbook. Every claim carries a file:line. The known-open item was CONFIRMED by reading the exact guard (voice-call-events/index.ts:217-220). No live systems, no provider APIs, no secrets read; research only.

**open_questions**

- Is RETELL_WEBHOOK_SIGNING_KEY set live and RETELL_WEBHOOK_VERIFY_MODE=enforce? Runbook does not list the key.
- Is the live Retell agent's webhook_url the canonical retell-call-webhook URL with the 3 webhook_events?
- Is WEBHOOK_SECRET_TELNYX still unset live (handoff says yes as of 11/02)?
- Does the live Telnyx connection have webhook_event_url -> voice-call-events?
- Are the Twilio number-level Messaging webhooks and TwiML App voice/status URLs configured live?
- Which live functions match these 503-disabled repo copies vs the functions-live snapshots?

**edge_cases_considered**

- No per-org URL registration exists - URLs are project-global; tenancy is by DB number ownership.
- Retell outbound sets webhook per call via agent_override AND asserts the live agent webhook equals the canonical URL, so both must be right.
- Retell inbound agent webhook_url (call events) vs per-number inbound_webhook_url (dynamic vars) are separate; unset inbound URL loses personalization only.
- retell-call-webhook uses claim_provider_callback receipts (614-620), so re-delivery after the key is later set is processed exactly once.
- call-tracking-webhook's 503 precedes body parse, so it can never be a fallback.
- Twilio recording/transcription callbacks are emitted by our own TwiML (code-set), so only TwiML App voice URL + status callback + number messaging URL are console-registered.

**what_i_did_not_check**

- Live secret/portal state for RETELL_WEBHOOK_SIGNING_KEY, RETELL_WEBHOOK_VERIFY_MODE, RETELL_AI_API_KEY, WEBHOOK_SECRET_TELNYX, TWILIO_AUTH_TOKEN and the Telnyx/Twilio webhook registrations.
- Deployed live bundles vs this repo for retell-call-webhook, retell-inbound-webhook, voice-call-events, twilio-sms-webhook.
- call-dispatcher's own webhook/egress usage and whether it is the live campaign dialer rather than outbound-calling.
- Voice-broadcast webhooks and twilio-amd-webhook, twilio-inbound-handler, inbound-transfer-webhook, ghl-webhook-trigger, twilio-dtmf-handler.
- retell-agent-management update path beyond create (whether it sets webhook_events).
- Provider-side retry schedules and failure alerting (the silent question answered only from our side).

**confidence**: medium