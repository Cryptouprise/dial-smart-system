# ai-vendors-truth

- status: completed
- tldr: Retell deepest (dialer live, admin 503); Telnyx browser-phone live, 8 AI surfaces 503; Assistable wired but hard-off; Twilio voice stubs 503; ElevenLabs 503; Daily.co absent.

AI VENDOR AUDIT (repo C:/Users/charl/dial-smart-system, branch main). Read-only; every claim file:line; no APIs called; no files written.

1) RETELL — deepest. LIVE: outbound-calling/index.ts:283-305 (retell is the certified create_call provider; only non-retell blocked at :295-305), retell-call-webhook/index.ts:1-9 (close-the-loop webhook). GATED 503: retell-agent-management:44-52, retell-llm-management:22-30, retell-phone-management:28-36 (all PROVIDER_ADMIN_NOT_CERTIFIED) -> no in-app agent/LLM/number CRUD; retell-inbound-webhook:45-49, retell-force-webhook:20-27, retell-business-verification:43-45, retell-cost-backfill:20-27, retell-reconciler:341 (env default off :264); retell-call-webhook:82-84 gate used :1402-1405 disables post-call analysis/disposition fan-out. No Retell batch-call API surface (ghl-batch-callback is GHL, gated :298). Customer gets: AI cold-call dialer + call recording IF an agent/LLM/number is pre-provisioned in Retell's console; no self-serve setup, no post-call AI disposition.

2) TELNYX — shallow for AI, real for the rep browser phone. LIVE: _shared/telnyx.ts:1-31, voice-call/index.ts:1-14, voice-provider.ts:178-186; UI-wired in CallWorkspace.tsx:14,41,295,308. The 8 hard-503 surfaces (verified): outbound-calling:295-305; telnyx-webhook:172-195; telnyx-ai-assistant:228(+:285/:288); telnyx-insights:44-55; telnyx-knowledge-base:33-71; telnyx-scheduled-events:42-53(+:97); telnyx-outbound-ai:133-143; telnyx-dynamic-vars:28-32. Customer gets: a browser softphone for a human rep; zero Telnyx AI.

3) ASSISTABLE — thin, fully wired, fully DISABLED. assistable-make-call/index.ts: gate false (:21-23), POST https://api.assistable.ai/v2/ghl/make-call (:5,:19), non-health -> 503 ASSISTABLE_EGRESS_NOT_CERTIFIED (:101-111), health_check works (:86). Plumbing: provider-router.ts:19/70-71/113-116; call-dispatcher:1164/1614-1622/1776; workflow-executor:1238/1654-1722 + effect-ledger.ts:5; CampaignManager.tsx:149-152,1018-1208; migrations 20251230143304:4,:11 + 20260712030000:28,:94. Customer gets: nothing live (health_check only).

4) OTHER VOICE/AI — Twilio AI-voice stubbed 503 (twilio-amd-webhook:34-38, twilio-inbound-handler:17-19, twilio-tts-audio:43); Twilio SMS/admin/browser-phone live (twilio-sms-webhook:1-6; twilio-integration:11 = 18 admin actions, NO purchase :1530; twilio-voice-twiml live). ElevenLabs TTS gated 503 (elevenlabs-tts:14-16,:25-35; real fetch :58-76 unreachable; preview only AgentEditDialog.tsx:779). Daily.co NOT in the app (only docs/wholesale/doorboss-call/doorboss_ai.py:18, a separate Hermes service).

CRITICAL CAVEAT: repo main carries the 503 cert gates; functions-live/README.md:9-11,79-80 says the live bundles may NOT have them for the 7 non-redeployed functions, so "usable today" depends on main vs live.

| Vendor | Depth | Usable today | First thing to sell |
|---|---|---|---|
| Retell | Deepest (dialer+webhook live; all admin gated) | PARTIAL (dial+record only) | Un-gate/tenant-scope retell-agent/llm/phone-management + turn on post-call analysis |
| Telnyx | Shallow (rep browser phone live; 8 AI surfaces 503) | PARTIAL (human softphone) | Certify canonical Telnyx outbound contract, or drop AI claims |
| Assistable | Thin wrapper, egress hard-off | NO | Move to canonical outbound boundary + set ASSISTABLE_API_KEY/assistant/pool/location |
| Twilio Voice AI | SMS/admin/softphone deep; AI-voice stubs 503 | PARTIAL (no AI voice) | Unstub AMD/inbound/TTS; add number-purchase if selling buy-numbers |
| ElevenLabs | One gated TTS preview stub | NO | Tenant-bound spend + receipt; set ELEVENLABS_API_KEY |
| Daily.co | Not in the app | N/A | Nothing here; separate product |

VALIDATION: each gate line re-confirmed with findstr this session (agentgrep single-file mode gave false 0-matches and was discarded). No function run, no live API, no writes. CONFIDENCE: medium (main-vs-live divergence is the main scope gap).

BLOCKERS/FOLLOW-UPS: confirm whether "today" = main or live; confirm browser-phone fns + 20261029160000 migration deployed; confirm provider secrets set.

## Artifact

**Findings**

RETELL = deepest. LIVE (repo, no gate): outbound-calling/index.ts:283-305 (provider defaults retell; only non-retell create_call blocked at :295-305 PROVIDER_EGRESS_NOT_CERTIFIED), retell-call-webhook/index.ts:1-9 (close-the-loop webhook), _shared/retell-provider-contract.ts (RETELL_API_ROOT, agent/LLM url builders). Endpoints used: create-agent, create-retell-llm, update-agent, update-phone-number, import-phone-number, create-phone-number (phone-number-purchasing:353), list/get-agent, get/update-retell-llm, v2/v3 list-calls, v2 get-call, v2 create-phone-call, v2 update-call. GATED 503 on main: retell-agent-management:44-52, retell-llm-management:22-30, retell-phone-management:28-36 (all PROVIDER_ADMIN_NOT_CERTIFIED), retell-inbound-webhook:45-49, retell-force-webhook:20-27, retell-business-verification:43-45, retell-cost-backfill:20-27, retell-reconciler:341 (env RETELL_RECONCILER_ENABLED default false :264), and retell-call-webhook:82-84 gate used at :1402-1405 disables the post-call analysis/disposition fan-out. NO Retell batch-call API surface: ghl-batch-callback is GHL and gated (:298); mass dial = call-dispatcher campaigns + voice-broadcast-engine:121.

TELNYX = shallow for AI, real for the rep browser phone. LIVE: _shared/telnyx.ts:1-31 (mintToken/startOutbound/action/parseWebhook + Call Control transcription_start), voice-call/index.ts:1-14, voice-provider.ts:178-186 registers {telnyx,twilio}. The 8 hard-disabled 503 surfaces, verified: (1) outbound-calling/index.ts:295-305, (2) telnyx-webhook/index.ts:172-195 (TELNYX_WEBHOOK_LIFECYCLE_NOT_CERTIFIED), (3) telnyx-ai-assistant/index.ts:228 + :285/:288, (4) telnyx-insights/index.ts:44-55, (5) telnyx-knowledge-base/index.ts:33-71, (6) telnyx-scheduled-events/index.ts:42-53(+:97), (7) telnyx-outbound-ai/index.ts:133-143, (8) telnyx-dynamic-vars/index.ts:28-32. Browser phone IS UI-wired: CallWorkspace.tsx:14,41,295,308 (voice-token mint :295).

ASSISTABLE = thin wrapper, fully wired but egress hard-off; nothing live. assistable-make-call/index.ts wraps POST https://api.assistable.ai/v2/ghl/make-call (:5,:19); gate =>false (:21-23); non-health actions -> 503 ASSISTABLE_EGRESS_NOT_CERTIFIED (:101-111); health_check works (:86); reads ASSISTABLE_API_KEY (:33). Plumbing: provider-router.ts:19,:30,:70-71,:113-116; call-dispatcher/index.ts:1164,:1614-1622,:1776; workflow-executor/index.ts:1238,:1654-1722; workflow-executor/effect-ledger.ts:5; CampaignManager.tsx:149-152,367-383,643-645,1018-1208 (default location_id boXe5LQTgfuXIRfrFTja); migrations 20251230143304:4,:11 and 20260712030000:28,:94.

OTHER VOICE/AI: (a) Twilio AI-voice stubbed/disabled: twilio-amd-webhook:34-38, twilio-inbound-handler:17-19 (503 Hangup XML), twilio-tts-audio:43; but Twilio non-AI deep & live: twilio-sms-webhook:1-6, twilio-integration:11 (18 admin actions incl SIP trunk CRUD; NO purchase action, import/sync/release only :1530), twilio-voice-twiml live (no gate), BrowserPhone.ts:31 uses @twilio/voice-sdk. (b) ElevenLabs TTS: elevenlabs-tts/index.ts:14-16 gate false -> :25-35 503 ELEVENLABS_TTS_SPEND_NOT_CERTIFIED, real fetch :58-76 unreachable, used only for in-app voice preview (AgentEditDialog.tsx:779). (c) Daily.co is NOT a Dial Smart surface: only occurrence docs/wholesale/doorboss-call/doorboss_ai.py:18 (separate Hermes Python service); zero refs in src/ or supabase/functions.

CRITICAL CAVEAT: repo main carries the 503 gates; functions-live/README.md:9-11,:79-80 states the live bundles may NOT have these gates (gates exist only on GitHub main for the 7 never-redeployed functions), so 'usable today' depends on whether the target is main (audited) or the live bundle.

**evidence**

- C:/Users/charl/dial-smart-system/supabase/functions/outbound-calling/index.ts:283-305
- C:/Users/charl/dial-smart-system/supabase/functions/retell-call-webhook/index.ts:1-9,82-84,1402-1405
- C:/Users/charl/dial-smart-system/supabase/functions/retell-agent-management/index.ts:44-52
- C:/Users/charl/dial-smart-system/supabase/functions/retell-llm-management/index.ts:22-30
- C:/Users/charl/dial-smart-system/supabase/functions/retell-phone-management/index.ts:28-36
- C:/Users/charl/dial-smart-system/supabase/functions/retell-inbound-webhook/index.ts:45-49
- C:/Users/charl/dial-smart-system/supabase/functions/retell-force-webhook/index.ts:20-27
- C:/Users/charl/dial-smart-system/supabase/functions/retell-business-verification/index.ts:43-45
- C:/Users/charl/dial-smart-system/supabase/functions/retell-cost-backfill/index.ts:20-27
- C:/Users/charl/dial-smart-system/supabase/functions/retell-reconciler/index.ts:264,341
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/retell-provider-contract.ts:1-198
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-webhook/index.ts:172-195
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-ai-assistant/index.ts:79,228,285,288
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-insights/index.ts:44-55
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-knowledge-base/index.ts:33-71
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-scheduled-events/index.ts:42-53
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-outbound-ai/index.ts:133-143
- C:/Users/charl/dial-smart-system/supabase/functions/telnyx-dynamic-vars/index.ts:28-32
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/telnyx.ts:1-31
- C:/Users/charl/dial-smart-system/supabase/functions/voice-call/index.ts:1-14
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/voice-provider.ts:178-186
- C:/Users/charl/dial-smart-system/src/lib/voice/BrowserPhone.ts:29-31,78
- C:/Users/charl/dial-smart-system/src/components/call/CallWorkspace.tsx:14,41,295,308
- C:/Users/charl/dial-smart-system/supabase/functions/assistable-make-call/index.ts:5,19,21-23,33,86,101-111
- C:/Users/charl/dial-smart-system/supabase/functions/_shared/provider-router.ts:19,30,70-71,113-116
- C:/Users/charl/dial-smart-system/supabase/functions/call-dispatcher/index.ts:1164,1614-1622,1776
- C:/Users/charl/dial-smart-system/supabase/functions/workflow-executor/index.ts:1238,1654-1722
- C:/Users/charl/dial-smart-system/supabase/functions/workflow-executor/effect-ledger.ts:5
- C:/Users/charl/dial-smart-system/src/components/CampaignManager.tsx:149-152,367-383,643-645,1018-1208
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-amd-webhook/index.ts:34-38
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-inbound-handler/index.ts:17-19
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-tts-audio/index.ts:43
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-sms-webhook/index.ts:1-6
- C:/Users/charl/dial-smart-system/supabase/functions/twilio-integration/index.ts:11,1530
- C:/Users/charl/dial-smart-system/supabase/functions/elevenlabs-tts/index.ts:14-16,25-35,58-76
- C:/Users/charl/dial-smart-system/docs/wholesale/doorboss-call/doorboss_ai.py:18
- C:/Users/charl/dial-smart-system/supabase/functions-live/README.md:9-11,79-80
- C:/Users/charl/dial-smart-system/DEPLOYMENT_AUDIT.md:20-27

**validation**

Every gate line re-confirmed this session with `findstr /n` over supabase/functions (agentgrep single-file mode returned false 0-matches and was discarded). Confirmed the exact 8 Telnyx 503 surfaces, the 3 Retell admin 503 gates, the assistable egress gate, the elevenlabs gate, twilio AI-voice stubs. Verified BrowserPhone is imported by CallWorkspace.tsx (UI-wired). Verified Daily.co appears only in the separate Hermes Python script. No function executed, no live API called, no repo file written.

**open_questions**

- Is 'usable today' measured against repo main (gated) or the live bundle?
- Are the browser-phone functions actually deployed live and is migration 20261029160000_browser_phone.sql applied?
- Are provider secrets (RETELL_AI_API_KEY, TELNYX_API_KEY, ASSISTABLE_API_KEY, ELEVENLABS_API_KEY, RETELL_RECONCILER_ENABLED) set in the deployed project?

**what_i_did_not_check**

- Did not call any live API or query the live Supabase project; liveness inferred from repo + docs.
- Did not byte-diff .deployed-*/functions-live snapshots vs supabase/functions per slug.
- Did not read twilio-dtmf-handler, twilio-voice-status, twilio-voice-transcription, voice-call-action, voice-call-events bodies.
- Did not verify env secrets are set in the deployed project.
- Did not read the full bodies of telnyx-ai-assistant / telnyx-webhook (heads + gate lines only).
- Did not inspect voice-broadcast-engine/queue/tts internals beyond the Retell create-phone-call call site.
- Did not read every config.toml function block (verify_jwt lines only).

**confidence**: medium