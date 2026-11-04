# ce-egress-retell-call-webhook

- status: completed
- tldr: 73 gates mapped; 19 blanket + 53 return-false helpers; 7 live-overlap functions regress if main deploys; 73 is an undercount

Node deploy-gate-census DONE (atomic, high confidence). 73 NOT_CERTIFIED gates mapped by predicate def line, call site, and 503 line; 19 are blanket unconditional 503s, the rest are isXxxCertified() helpers whose bodies are ALL `return false` (53 defs confirmed). 13 of the 73 are throws in 2 _shared helpers, not 503 gates. functions-live = 12 snapshots, 0 gates; README:17 (live updated_at 2026-07-01 18:15 UTC) and README:79-80 confirm gates exist only on main.

KEY RISK: 7 live-ungated functions are gated on main (call-dispatcher, outbound-calling, telnyx-webhook, workflow-executor, retell-call-webhook + disposition-router, pipeline-management) - deploying main regresses live behavior. Also the 73 is an UNDERCOUNT: ~18 more functions gate with non-"NOT_CERTIFIED" error codes (ai-brain, ai-autonomous-engine, disposition-router, pipeline-management, etc.).

CLASSIFICATION (THEORY): REMOVE the 7 live-overlap gates; KEEP provider-admin/control-plane/spend/unsigned-webhook/egress gates with no live snapshot; FLIP draft-only AI + read/report gates after a named test.

TOUCHED: none. Files NOT modified. No live calls. No agents spawned (user rule).

## Artifact

**Findings**

CENSUS SUMMARY. (1) The 73 NOT_CERTIFIED occurrences = 60 in function files (50 slugs) + 13 in 2 shared helpers (_shared/call-exposure-policy.ts:12,18; _shared/retell-provider-contract.ts:93,96,99,102,105,108,111,114,120,128,147,151). (2) Of the 60 function-file occurrences: 52 are 503-return gates, 5 are `throw new Error(...NOT_CERTIFIED...)` (outbound-calling:890,899,903,907,914), 2 are dispatch-result errorCode fields (call-dispatcher:1666 TELNYX_EGRESS_NOT_CERTIFIED, :1777 PROVIDER_NOT_CERTIFIED), 1 is a non-503 return (workflow-executor:1746 WORKFLOW_WEBHOOK_EGRESS_NOT_CERTIFIED). (3) Every isXxxCertified() helper body is `return false` (53 defs, all confirmed), so every gate is permanently ON, i.e. the function is 100% disabled on main. (4) 19 gates have NO predicate at all: a blanket unconditional 503 immediately after the OPTIONS preflight (18 top-of-serve; telnyx-outbound-ai:133 is action-gated). (5) LIVE: functions-live has 12 function snapshots (README:20-33), 0 gates (findstr Certified = 0 hits). 5 of the 73 gated functions have live snapshots that run UNGATED: call-dispatcher, outbound-calling, telnyx-webhook, workflow-executor, retell-call-webhook (plus 2 non-73 gated functions with live snapshots: disposition-router, pipeline-management). Deploying main's versions of these 7 would newly disable what live runs today. (6) The 73 is an UNDERCOUNT: at least 18 more functions have gates whose error_code does not contain the literal 'NOT_CERTIFIED' (e.g. ai-brain, ai-autonomous-engine, analyze-call-transcript, autonomous-prioritization, budget-tracker, campaign-health-monitor, disposition-router, email-sender, enhanced-rotation-manager, ml-learning-engine, predictive-dialing-engine, provider-management, telnyx-insights, telnyx-knowledge-base, validate-phone-numbers, voice-broadcast-queue, yellowstone-integration, retell-force-webhook; also ai-assistant's 2nd gate AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED:2895). True gate count > 73. CLASSIFICATION (THEORY, grounded in FACT): REMOVE = the 7 live-overlapping functions (restore live bytes). KEEP = provider-admin/control-plane/spend/unsigned-webhook/egress gates on functions with no live snapshot (real risk). FLIP = draft-only AI + read/report + internal-service gates. Full per-gate table is in the final response.

**evidence**

- findstr /s /n /c:"NOT_CERTIFIED" supabase\functions\*.ts -> exactly 73 hits (60 in function files across 50 slugs, 13 in 2 _shared helpers)
- findstr /s /n /c:"NOT_CERTIFIED" supabase\functions-live\*.* -> 0 hits (only README.md:80 which documents the fact)
- findstr /s /n /c:"status: 503" supabase\functions\*.ts -> 90 hits (52 are *_NOT_CERTIFIED gates; the rest are other gates/errors)
- findstr /s /n /r /c:"function is[A-Za-z]*Certified" supabase\functions\*.ts -> 53 helper defs, every body is 'return false' (confirmed by findstr /c:"return false")
- advanced-spam-detection/index.ts:10-12 def, :29 call, :36 503
- call-dispatcher/index.ts:15-25 three defs, :413 call/:420 503 (FORCE_DISPATCH), :640/:1266 positive guards, :1666/:1777 errorCode fields
- outbound-calling/index.ts:64-70 defs, :295 call/:302 503 (PROVIDER_EGRESS), :890-914 throws
- workflow-executor/index.ts:34 def, :220 call/:227 503, :1740-1748 webhook egress return
- telnyx-webhook/index.ts:172 def, :185 call/:192 503
- disposition-router/index.ts:76 def, :89 call/:96 503 (DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED)
- pipeline-management/index.ts:10 def, :19 call/:21 503
- retell-call-webhook/index.ts:82 def (return false), :1403 positive guard, no 503
- 19 files use a blanket unconditional 503 right after OPTIONS (no predicate): calendar-integration:43-51, call-tracking-webhook:134-142, check-number-config:13-21, clear-voice-webhooks:13-21, ghl-webhook-trigger:88-96, inbound-transfer-webhook:126-134, phone-number-purchasing:36-44, quick-test-call:16-24, remove-trunk:14-22, retell-agent-management:44-52, retell-inbound-webhook:43-51, retell-llm-management:22-30, retell-phone-management:28-36, setup-inbound-calls:14-22, setup-lady-jarvis:102-110, telnyx-dynamic-vars:26-34, twilio-amd-webhook:32-40, twilio-integration:34-42
- functions-live/README.md:3 pulled 2026-10-29; :17 all successful functions updated_at=1782929711947 (2026-07-01 18:15:11 UTC); :79-80 'The 7 functions never redeployed keep the pre-07-01 bulk-deploy bytes ... (the 503 *_NOT_CERTIFIED gates exist only on GitHub main, never on live).'
- functions-live has 12 function snapshots: twilio-sms-webhook, sms-messaging, ai-sms-processor, disposition-router, outbound-calling, telnyx-webhook, call-dispatcher, retell-call-webhook, workflow-executor, pipeline-management, api-gateway, stripe-webhook (README:20-33)
- findstr /c:"Certified" supabase\functions-live\*.ts -> 0 hits (all 12 snapshots ungated)
- config.toml: verify_jwt=false for sms-messaging, outbound-calling, call-dispatcher, workflow-executor, disposition-router, twilio-sms-webhook, call-tracking-webhook, stripe-webhook, telnyx-webhook, twilio-inbound-handler, twilio-tts-audio, retell-call-webhook, retell-reconciler, retell-inbound-webhook, inbound-transfer-webhook, twilio-amd-webhook, ghl-webhook-trigger, telnyx-outbound-ai, telnyx-dynamic-vars, slack-webhook, api-gateway, mcp, ghl-shadow-ingest, automation-scheduler, demo-scrape-website, mcp-observer, twilio-dtmf-handler (no verify_jwt=true line)

**validation**

Counted 73 NOT_CERTIFIED hits (matches the stated number exactly). Mapped every predicate def, call site, and 503 line by findstr. Confirmed all 53 isXxxCertified bodies return false. Confirmed 0 gates in functions-live and read README:17/79-80 for the deploy-date fact. Read 20+ gate blocks verbatim to classify blanket vs predicate vs action-gated. Read config.toml verify_jwt=true list. No files modified; no live calls; no agents spawned.

**open_questions**

- Which of the ~38 non-snapshot gated functions are actually deployed on live (unknown without a live API call; the 2026-07-01 bulk deploy is the only recorded live state).
- Whether any of these functions were deployed after 2026-07-01 outside the recorded snapshots (unverifiable read-only).
- Whether the ~18 gates with non-NOT_CERTIFIED error codes are in scope for the same reversal (they are the same defect class but were not in the 73).

**what_i_did_not_check**

- Live deploy state of the ~38 gated functions that have no snapshot (no live API call permitted).
- The 18 non-NOT_CERTIFIED gates' full classification (only their existence and 503 lines confirmed).
- Whether removing each gate is safe at runtime (would need per-function auth/tenant review).
- The ~1 other shared helpers' runtime usage of the two throwing validators beyond call sites seen.
- Front-end (Lovable) coupling: which UI callers depend on the disabled functions.

**confidence**: high