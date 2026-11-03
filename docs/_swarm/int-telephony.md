# int-telephony

- status: completed
- tldr: Telephony depth: Twilio integrated-deeply (SMS/admin/browser-phone; AI-voice stubbed), Telnyx shallow (browser-phone only, 8 surfaces 503), Retell integrated-deeply (only certified dialer).

int-telephony DONE (research-only, read-only, cited file:line).

Twilio -> integrated-deeply (SMS + full number/SIP admin + browser-phone Voice SDK), but all AI-voice/IVR/AMD/TTS handlers are 503 stubs. Proof: twilio-sms-webhook/index.ts:1-6 (live, no kill-switch) + twilio-integration/index.ts:11 (19 admin actions) vs twilio-amd-webhook/index.ts:32-40, twilio-inbound-handler/index.ts:16-26, twilio-tts-audio/index.ts:42-49.

Telnyx -> shallow: only the rep browser-phone WebRTC leg is un-gated (_shared/telnyx.ts:1-31, voice-call/index.ts). All 8 AI/outbound/callback surfaces are hard-disabled: outbound-calling/index.ts:295-304 (PROVIDER_EGRESS_NOT_CERTIFIED 503), telnyx-webhook:172/185, telnyx-ai-assistant:79-81, telnyx-insights:44-53, telnyx-knowledge-base:33/64, telnyx-scheduled-events:42/51, telnyx-outbound-ai:136-138, telnyx-dynamic-vars:28-30.

Retell -> integrated-deeply: the only certified outbound AI dialer (outbound-calling/index.ts:283-305) plus full post-call stack (retell-call-webhook/index.ts:1-9). Kill-switches only on narrow sub-surfaces: retell-call-webhook:82-84 gating the post-call analysis fan-out (:1402-1405), plus admin-only retell-business-verification:34-35, retell-cost-backfill:8-9, retell-force-webhook:9-10.

Extra findings: Twilio number PURCHASING is NOT implemented (action union twilio-integration/index.ts:11 has no buy; only import/sync/release at :1530). call-dispatcher has 3 return-false kill-switches (:15-25, used :413/:640/:1266). Dead code follows several 503 guards.

Validation: every guard grep-confirmed across supabase/functions; negative checks (grep exit 1) on twilio-sms-webhook, twilio-voice-twiml, voice-call*, retell-inbound-webhook, retell-agent/phone/llm-management. No function run, no live API.

Blockers/uncertainty: could not prove the browser-phone frontend is actually enabled (Telnyx/Twilio leg liveness inferred from lack of a server guard). Follow-ups: read twilio-dtmf-handler, diff .deployed-* snapshots, verify deployed-function set + env vars.

## Artifact

**Findings**

3-row verdict on real telephony integration depth in C:/Users/charl/dial-smart-system (read-only, FACT unless marked THEORY).

| Vendor | Depth | Proving file:line | Why |
|---|---|---|---|
| Twilio | integrated-deeply (SMS/admin/browser-phone) with AI-voice surfaces stubbed | supabase/functions/twilio-sms-webhook/index.ts:1-6 (live, unconditional) + supabase/functions/twilio-integration/index.ts:11 (19 admin actions); disabled counterparts: twilio-amd-webhook/index.ts:32-40 (503), twilio-inbound-handler/index.ts:16-26 (503 Hangup stub), twilio-tts-audio/index.ts:42-49 (503) | Inbound SMS webhook runs with NO kill-switch and documents the live Twilio Console URL; twilio-integration exposes full number/SIP/A2P admin; BrowserPhone.ts:31 uses @twilio/voice-sdk. All AI-voice/IVR/AMD/TTS handlers are hard-stubbed at 503. |
| Telnyx | shallow (browser-phone leg only; all AI/outbound/callback surfaces hard-disabled) | supabase/functions/outbound-calling/index.ts:295-304 (503 PROVIDER_EGRESS_NOT_CERTIFIED) + telnyx-webhook/index.ts:172-174 then 185-195 (return false -> 503); live part: supabase/functions/_shared/telnyx.ts:1-31 | Eight Telnyx surfaces return false / 503; the only un-gated path is the rep browser-phone WebRTC leg (voice-call/voice-call-action/voice-call-events + _shared/telnyx.ts). Huge code+docs footprint, near-zero live surface. |
| Retell | integrated-deeply | supabase/functions/outbound-calling/index.ts:283-305 (Retell is the ONLY certified create_call provider) + retell-call-webhook/index.ts:1-9 (close-the-loop post-call pipeline) | Retell drives the real AI dialer and the full post-call/agent/phone/LLM/reconciler stack; only narrow sub-surfaces are gated. |

KILL-SWITCHES (functions that `return false` / hard 503), each proven:
- call-dispatcher/index.ts:15-25 -> isForceDispatchCertified/isCallbackAutomationCertified/isAutomaticRetellNumberSyncCertified all return false; used at :413, :640, :1266 (force-dispatch, callback-automation, auto Retell number-sync disabled).
- outbound-calling/index.ts:295-304 -> provider!=='retell' on create_call returns 503 PROVIDER_EGRESS_NOT_CERTIFIED: Telnyx AI outbound is DEAD (the Telnyx call-path code at :1049-1400 is unreachable for create_call).
- retell-call-webhook/index.ts:82-84 isRetellAnalysisAutomationCertified=>false, gated at :1402-1405: the post-call analysis/downstream fan-out (GHL/disposition-router/booking) is DISABLED inside an otherwise-live webhook.
- Telnyx disabled 503 surfaces: telnyx-webhook :172/:185, telnyx-ai-assistant :79-81/:228, telnyx-insights :44-46/:53, telnyx-knowledge-base :33/:64, telnyx-scheduled-events :42/:51, telnyx-outbound-ai :136-138, telnyx-dynamic-vars :28-30.
- Twilio disabled 503 surfaces: twilio-amd-webhook :32-40, twilio-inbound-handler :16-26 (returns Hangup XML), twilio-tts-audio :42-49.
- Retell disabled 503 surfaces (admin/maint only): retell-business-verification :34-35, retell-cost-backfill :8-9, retell-force-webhook :9-10.

NOTES / UNWIRED PATHS:
- Twilio number PURCHASING is NOT implemented: twilio-integration action union (:11) has no buy/purchase; only 'import_number', 'sync_all', 'release_phone_number' (:1530). The task's 'phone-number purchasing' premise is THEORY/absent.
- Unreachable dead code after the guard exists in twilio-amd-webhook (:42+), twilio-tts-audio (:51+), twilio-inbound-handler (whole body removed).
- Provider abstraction is real: supabase/functions/_shared/voice-provider.ts:178-186 registers only {telnyx, twilio} for the browser phone; src/services/providers/index.ts:26-35 factory lists Retell/Telnyx/Twilio adapters (Retell is NOT a browser-phone provider).
- .deployed-call-dispatcher-v609.ts / .deployed-retell-call-webhook-v449.ts are snapshots; current supabase/functions copies are the source of truth I read.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/twilio-sms-webhook/index.ts:1-6
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:11
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:1530
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-amd-webhook/index.ts:32-40
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-inbound-handler/index.ts:16-26
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-tts-audio/index.ts:42-49
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/twilio.ts:1-43
- C:/Users/charl/dial-smart-system/lib/voice/BrowserPhone.ts:31
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:283-305
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:1049-1051
- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:1408-1410
- C:/Users/charl/dial-smart-system/supabase/functions/call-dispatcher/index.ts:15-25
- C:/Users/charl/dial-smart-system/supabase/functions/call-dispatcher/index.ts:413
- C:/Users/charl/dial-smart-system/supabase/functions/call-dispatcher/index.ts:1266
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-webhook/index.ts:172-195
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:79-81
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:44-53
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:33-64
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:42-51
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:136-138
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-dynamic-vars/index.ts:28-30
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/telnyx.ts:1-31
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call/index.ts:1-27
- C:/Users/charl/dial-smart-system/supabase/functions/retell-call-webhook/index.ts:1-9
- C:/Users/charl/dial-smart-system/supabase/functions/retell-call-webhook/index.ts:82-84
- C:/Users/charl/dial-smart-system/supabase/functions/retell-call-webhook/index.ts:1402-1405
- C:/Users/charl/dial-smart-system/supabase/functions/retell-business-verification/index.ts:34-44
- C:/Users/charl/dial-smart-system/supabase/functions/retell-cost-backfill/index.ts:8-9
- C:/Users/charl/dial-smart-system/supabase/functions/retell-force-webhook/index.ts:9-10
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/voice-provider.ts:178-186
- C:/Users/charl/dial-smart-system/src/services/providers/index.ts:26-35

**validation**

Read each cited file directly (read tool) and grep-confirmed every guard with findstr across the supabase/functions tree. Cross-checked: (a) no 'Certified/return false/disabled' guard in twilio-sms-webhook, twilio-voice-twiml, twilio-voice-status, voice-call, voice-call-action, voice-call-events, retell-inbound-webhook, retell-agent-management, retell-phone-management, retell-llm-management, retell-reconciler (grep exit 1 = none); (b) guards present in the 8 Telnyx AI surfaces + 3 Twilio AI surfaces + 3 Retell admin surfaces; (c) provider router registers exactly {telnyx,twilio} and adapter factory lists all three. No function executed, no live API hit (research-only lane).

**open_questions**

- Is the browser-phone frontend actually exposed/enabled for Telnyx and Twilio in the shipped UI, or is lib/voice/BrowserPhone.ts dormant? (Liveness of the one non-gated Telnyx path depends on this.)
- Does outbound-calling telnyx path (:1049-1400) or telnyx-webhook get re-enabled via env (e.g. a future cert flag) or is return-false permanent?
- What is in twilio-dtmf-handler (empty outline) - same 503-stub pattern?
- Do .deployed-* snapshots differ materially from the current supabase/functions copies for these guards?

**what_i_did_not_check**

- Did not trace lib/voice/BrowserPhone.ts into the React UI to prove the browser-phone feature is actually rendered/enabled (so Telnyx/Twilio browser leg liveness is inferred from absence of a server guard only).
- Did not read twilio-dtmf-handler/index.ts contents (empty outline; assumed stub).
- Did not diff the .deployed-call-dispatcher-v609.ts / .deployed-retell-call-webhook-v449.ts snapshots against the live function copies.
- Did not inspect supabase/functions-live/* or docs/wholesale/phases/staging/* mirrored copies for divergence.
- Did not verify env vars (TELNYX_API_KEY, TWILIO_*, RETELL_AI_API_KEY) are actually set in the deployed project.
- Did not check the hermes/deployed edge functions dashboard for which functions are actually deployed vs merely present in the repo.

**confidence**: medium