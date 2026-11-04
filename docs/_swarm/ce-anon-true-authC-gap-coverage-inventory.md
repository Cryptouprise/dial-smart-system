# ce-anon-true-authC-gap-coverage-inventory

- status: completed
- tldr: 109 fn dirs; 90 config tables; strict A/B/C = 22/26/61; operational anon-invokable B = 12, 11 outside the parent's 11-fn scope.

DONE: ce-anon-true-authC-gap-coverage-inventory - enumerated every Supabase edge function dir, cross-referenced the parent's 11-function audit, and produced the A/B/C classification plus the explicit scope gap.

NUMBERS: 110 dirs under supabase/functions = 109 function dirs + _shared. config.toml has 90 [functions.*] tables; 19 dirs have no entry (default verify_jwt=true). Parent audited count = 11.

STRICT (task definition): A (has isXTenantCertified kill switch) = 22; B (verify_jwt=false AND no isXTenantCertified kill switch) = 26; C (verify_jwt=true) = 61.

CORRECTION: strict A undercounts - a broader `function is\w*Certified` grep returns 54 kill-switch helpers in 51 files, and many verify_jwt=false functions are hard-disabled by unnamed 503s / static inert responses / hard-locks. OPERATIONAL class-B (verify_jwt=false AND not hard-disabled by ANY mechanism) = 12: sms-messaging, outbound-calling, call-dispatcher, ghl-shadow-ingest, automation-scheduler, twilio-sms-webhook, stripe-webhook, retell-call-webhook, retell-reconciler, telnyx-outbound-ai, api-gateway, mcp. Every one reaches an in-function guard (getUser / authorizeOrganizationContext / signature / bearer / API key / OAuth), NOT unauthenticated service-role logic.

SCOPE GAP (operational class-B not in the parent's 11) = 11: sms-messaging, outbound-calling, call-dispatcher, ghl-shadow-ingest, automation-scheduler, twilio-sms-webhook, stripe-webhook, retell-call-webhook, retell-reconciler, api-gateway, mcp. STRICT gap = 25. => Parent enumeration is INCOMPLETE; siblings do NOT share one pattern.

BLOCKERS: none. FOLLOW-UPS: confirm canonical parent 11; confirm deployed verify_jwt == config.toml.

## Artifact

**Findings**

COVERAGE INVENTORY. Total: 110 dirs under supabase/functions = 109 function dirs + _shared. config.toml has 90 [functions.*] tables (19 dirs have no entry -> default verify_jwt=true). Parent audited set = 11 (authC provider-admin group): retell-agent-management, retell-llm-management, retell-phone-management, retell-business-verification, telnyx-ai-assistant, telnyx-knowledge-base, telnyx-insights, telnyx-scheduled-events, telnyx-outbound-ai, twilio-integration (+ telnyx-dynamic-vars per sr::agent-config artifact). Audited count = 11.

STRICT CLASSES (per task definition):
(A) has isXTenantCertified-named kill switch -> 22: ai-assistant, ai-autonomous-engine, ai-brain, analyze-call-transcript, autonomous-prioritization, budget-tracker, campaign-health-monitor, disposition-router, email-sender, enhanced-rotation-manager, ml-learning-engine, pipeline-management, predictive-dialing-engine, provider-management, retell-force-webhook, telnyx-ai-assistant, telnyx-insights, telnyx-knowledge-base, validate-phone-numbers, voice-broadcast-engine, voice-broadcast-queue, yellowstone-integration.
(B) verify_jwt=false AND no isXTenantCertified kill switch -> 26: twilio-dtmf-handler, elite-email-mailgun-events, sms-messaging, outbound-calling, call-dispatcher, ghl-shadow-ingest, automation-scheduler, workflow-executor, twilio-sms-webhook, call-tracking-webhook, stripe-webhook, telnyx-webhook, twilio-inbound-handler, twilio-tts-audio, retell-call-webhook, retell-reconciler, retell-inbound-webhook, inbound-transfer-webhook, twilio-amd-webhook, telnyx-outbound-ai, telnyx-dynamic-vars, slack-webhook, mcp-observer, api-gateway, mcp, ghl-webhook-trigger.
(C) verify_jwt=true -> 61 (remainder; incl. all 19 no-config-entry dirs).

IMPORTANT CORRECTION: the strict A definition (name contains 'isXTenantCertified') UNDERCOUNTS hard-disables. A broader grep for `function is\w*Certified` found 54 kill-switch helpers in 51 files, and several verify_jwt=false functions are ALSO hard-disabled by unnamed 503s / static inert responses / hard-locks (name does not match). OPERATIONAL hard-disable set among verify_jwt=false: twilio-dtmf-handler (static XML only), elite-email-mailgun-events (503), workflow-executor (isWorkflowAutomationCertified=false), call-tracking-webhook (503), telnyx-webhook (Ed25519 + 503), twilio-inbound-handler (503), twilio-tts-audio (503), retell-inbound-webhook (503), inbound-transfer-webhook (503), twilio-amd-webhook (503), telnyx-dynamic-vars (503), slack-webhook (hard-lock), mcp-observer (hard-lock), ghl-webhook-trigger (503). Also telnyx-scheduled-events/voice-broadcast-* etc. are hard-disabled but land in strict-C.

OPERATIONAL CLASS-B (verify_jwt=false AND not hard-disabled -> anon reachable at edge, auth entirely in-function) = 12: sms-messaging, outbound-calling, call-dispatcher, ghl-shadow-ingest, automation-scheduler, twilio-sms-webhook, stripe-webhook, retell-call-webhook, retell-reconciler, telnyx-outbound-ai, api-gateway, mcp.

PER-FUNCTION anon-path verdict (each reaches an IN-FUNCTION GUARD, none reaches unauthenticated service-role logic today): sms-messaging -> getUser(:134), 401/403 on failure; outbound-calling -> authorizeOrganizationContext (service-role/JWT); call-dispatcher -> authorizeOrganizationContext; ghl-shadow-ingest -> Ed25519 sign or 503 if unconfigured; automation-scheduler -> 401 unless exact service-role bearer or cron token; twilio-sms-webhook -> Twilio HMAC signature; stripe-webhook -> Stripe-Signature; retell-call-webhook -> Retell signature; retell-reconciler -> service-role bearer/cron; telnyx-outbound-ai -> resolveExactOrganization (service path trusts body userId - weak); api-gateway -> dsk_live_ API key; mcp -> Supabase OAuth bearer.

SCOPE GAP vs parent: parent's 11 covers only 1 operational-B function (telnyx-outbound-ai; + telnyx-dynamic-vars if using sr set, which is hard-disabled 503). Explicit OPERATIONAL class-B anon-invokable functions NOT in the parent's 11 (11): sms-messaging, outbound-calling, call-dispatcher, ghl-shadow-ingest, automation-scheduler, twilio-sms-webhook, stripe-webhook, retell-call-webhook, retell-reconciler, api-gateway, mcp. STRICT class-B not audited = 25 (all strict-B except telnyx-outbound-ai). CONCLUSION: the parent's enumeration is INCOMPLETE by ~11-25 functions; sibling functions do NOT all share one pattern (3 distinct patterns: hard-disable 503/flag, in-function signature/bearer guard, and verify_jwt=true default).

**evidence**

- supabase/functions dir listing: 109 function dirs + _shared (dir /b /ad counts 110)
- supabase/config.toml: 90 [functions.*] tables; 28 verify_jwt=false (seed list matches)
- grep 'function is\w*Certified' = 54 matches in 51 files (supabase/functions/**/index.ts)
- twilio-dtmf-handler/index.ts:7-19 Deno.serve returns static XML 'temporarily unavailable' (inert)
- telnyx-dynamic-vars/index.ts:26-34 503 INBOUND_DYNAMIC_VARS_NOT_CERTIFIED before logic; :36+ unreachable
- twilio-inbound-handler/index.ts:16-26 503 <Hangup/> before logic
- twilio-tts-audio/index.ts:42-49 503 before logic; :51+ unreachable
- ghl-webhook-trigger/index.ts:88-96 503 GHL_BROADCAST_WEBHOOK_NOT_CERTIFIED before logic; :98+ unreachable
- elite-email-mailgun-events/index.ts:16-31 unavailable() 503 ELITE_EMAIL_MAILGUN_EVENTS_DISABLED
- ghl-shadow-ingest/index.ts:136-146 serve -> 503 if runtime unconfigured else Ed25519 handler
- mcp-observer/index.ts:23,49-52 MCP_OBSERVER_LAUNCH_CERTIFIED=false -> disabled response
- slack-webhook/index.ts:24,50-53 SLACK_OBSERVER_LAUNCH_CERTIFIED=false -> disabled response
- automation-scheduler/index.ts:48-59 authorizeAutomationScheduler -> 401
- sms-messaging/index.ts:134 auth.getUser(token); :632 auth failures 401/403; no 503/kill switch
- workflow-executor/index.ts:34-37 isWorkflowAutomationCertified():false
- call-dispatcher/index.ts:15-25 sub-feature flags only (isForceDispatchCertified etc.); uses _shared/tenant-context
- outbound-calling/index.ts:64-69 sub-feature flags only; uses _shared/tenant-context
- stripe-webhook/index.ts:48 verifyStripeSignature from _shared/stripe-signature.ts
- docs/_swarm/sr__agent-config.md:6,9-19 audited 11 agent/LLM/phone functions
- docs/_swarm/sr__telephony-webhooks.md:39-45 503-disabled telephony handlers

**validation**

Enumerated dirs via dir /b /ad; counted config tables; grepped kill-switch helper names and 503 tokens across the tree; read serve/entry regions of every verify_jwt=false function lacking a prior-swarm audit, plus heads of 12 operational-B candidates. Cross-checked against docs/_swarm/sr__agent-config.md and sr__telephony-webhooks.md. Read-only; no secrets printed; no live system touched.

**open_questions**

- Are the deployed verify_jwt values on project emonjusymdripmkvtttc identical to config.toml (dashboard/CLI drift)?
- Which 11 is the canonical parent scope - the ce-* node names or the sr::agent-config artifact?
- Do the operational-B guard functions (sms-messaging, outbound-calling, call-dispatcher) accept a service-role bearer that an external caller could not obtain, or any valid project JWT incl. the public anon key?

**edge_cases_considered**

- TWO plausible parent sets: sr::agent-config artifact lists 11 incl. telnyx-dynamic-vars/excl. twilio-integration; the ce-anon-true-authC child-node names list 11 incl. twilio-integration/excl. telnyx-dynamic-vars. Either way class-B overlap is telnyx-outbound-ai (+telnyx-dynamic-vars).
- mcp/index.ts is AUTO-GENERATED (@lovable.dev/mcp-js) - its auth lives in a bundled handler, not readable here.
- api-gateway has its own nested _shared/api-auth.ts and is a dir-with-subdir.
- 19 dirs have no config.toml entry -> Supabase default verify_jwt=true (e.g. coach-decide, voice-call family, twilio-voice-*).
- Docstrings claim hard-disable but the actual gate name varies; strict name-based classing mislabels some.

**what_i_did_not_check**

- Deployed (live) verify_jwt flags vs config.toml - not probed against the platform.
- Full bodies of all 12 operational-B functions - read heads/entry only, relying on sr:: reports for telephony.
- The 61 class-C functions' in-function behavior (not read; only their config value).
- mcp auto-generated entry internals and api-gateway nested _shared semantics beyond imports.
- Whether any no-config-entry function is deployed with a non-default verify_jwt=false.
- The exact 11-function canonical parent set (two candidate sets exist).

**confidence**: medium