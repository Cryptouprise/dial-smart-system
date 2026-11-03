# ai-layer

- status: completed
- tldr: AI autonomy (engine + brain) is hard-disabled at 503; only the human-gated live coach actually runs. No server-side spend cap anywhere in the AI layer.

AI LAYER review complete. Headline: 'AI runs the whole thing' is FALSE today. ai-autonomous-engine and ai-brain both short-circuit to HTTP 503 via cert predicates returning literal false (engine index.ts:5498-5521; brain index.ts:10-12 + 4652-4663), and the engine's pg_cron job is unscheduled by migration 20260713061000. The engine is a real batch control loop (runForUser 5110-5230: execute approved -> cap -> rescore -> decide -> queue with status approved if autonomy_level=full_auto) whose execute switch (543-832) can queue dials / send SMS / quarantine numbers - but it is off. ai-brain is a Lady Jarvis chat + tool console, not autonomy. The one live AI feature is the coach (coach-suggest 6s/900-token single Lithos DeepSeek V4.1 Flash call, 2.5s realtime debounce in CoachPanel) with a human Accept/Change gate in coach-decide. Safety is a kill-switch (cert flag) + frontend-only launchSafety.ts locks; there is NO server-side spend cap or per-call budget gate in the execute path, and no credit check in any AI-layer function.\n\nValidation: read actual handlers/cert fns; confirmed cron disable migration + original schedule; traced coach path; paths_only grep confirms credit helpers absent from all 4 AI functions.\n\nBlockers/follow-ups: live DB migration-application state unverified (repo says disabled, live not checked for emonjusymdripmkvtttc); AI-layer internals partly unread (ai-brain tail 4777-5026, ai-assistant, ml-learning-engine, AutonomousAgentDashboard UI).

## Artifact

**Findings**

HEADLINE: 'AI runs the whole thing' is FALSE today. Both functions that would embody autonomy are HARD-DISABLED at runtime. ai-autonomous-engine's isAutonomousEngineTenantCertified() returns literal false (ai-autonomous-engine/index.ts:5498-5499) and its handler returns 503 AUTONOMOUS_ENGINE_NOT_TENANT_CERTIFIED before doing anything (index.ts:5511-5521). ai-brain's isAiBrainTenantCertified() also returns literal false (ai-brain/index.ts:10-12) and returns 503 AI_BRAIN_NOT_TENANT_CERTIFIED (ai-brain/index.ts:4652-4663). FACT.

(a) ai-autonomous-engine (5645 lines) is a real server-side batch control loop, not a prompt. Docstring: 'Runs every 5 minutes via pg_cron. Replaces all browser-side autonomous hooks' (index.ts:1-15). runForUser() (5110-5230) does, in order: execute already-approved queued actions (5145), expire stale pending actions (5150-5158), enforce a daily action cap (5160-5174), re-score leads, recalculate calling windows, assess goals vs targets, analyse pacing, then makeDecisions() and queue new rows into ai_action_queue (5194-5226). So the real loop is: read call/lead/pacing state -> compute decisions -> write rows with status approved|pending -> a later run executes the approved ones.

(a) ai-brain (5027 lines) is NOT a control loop: it is a chat assistant ('Lady Jarvis') that answers user messages and dispatches tools. Its system prompt advertises an 'AUTONOMOUS AGENT SYSTEM' and a manager hierarchy (ai-brain/index.ts:61-90, 240-256) but the code is a large tool dispatch table (cases 1468-2419+: send_sms_blast 1625, send_test_sms 1757, create_campaign 1548, delete_lead 2314, move_lead_to_stage 2333) driven by the user's chat message. It is an operator console, not an autonomous decision maker.

(b) The engine's model is genuine CONDITIONAL autonomy in code but it is (i) quarantined off and (ii) mostly scheduled/batch, not agentic. Decision points are the insertCanonicalAction() call sites that set status/requires_approval from settings.autonomy_level: full_auto -> status 'approved' (auto-executes next run), approval_required -> 'pending' + requires_approval, suggestions_only -> not queued (index.ts:1171-1184 number health, 5204-5220 makeDecisions, 2202 journey). The 'AI managers' map to sub-routines (assessGoalProgress 100, analyzePacing, predictNumberHealth 1141, extractTranscriptIntents 1210, generateDailyBattlePlan 2244) that compute and queue; LLM appears only in a few spots (intent extraction ~1262, battle plan ~2309, strategic insights). So: scheduled rule/threshold automation with occasional LLM, not autonomous agents that reason and act.

(c) Safety: there IS a hard kill-switch, but it is the cert flag (=false), NOT a spend cap. lib/launchSafety.ts is FRONTEND-only copy: AUTONOMOUS_ACTION_LAUNCH_LOCK_MESSAGE (24-25) and browserAutonomousActionAllowed() (140-142), browserCallDispatchAllowed() (128-132), browserContactEgressAllowed() (149-151) which all return false; browserCampaignStatusMutationAllowed()/ConfigurationMutationAllowed() allow only 'paused'/'draft' (115-126). No server effect, no spend cap. There is NO spend/approval/dry-run gate inside executeApprovedActions: no credit check, no per-run dollar ceiling before it calls sms-messaging or queues dials. Only quantitative guards: max_daily_autonomous_actions (5160-5174) and daily_budget_cents, used ONLY in the planning prompt text (2309, 2366-2375), never enforced against the execute path.

(d) Live coach latency path (the one AI feature that appears live - coach-suggest/coach-decide carry no cert gate): audio -> telephony provider does server-side recording+transcription (CallWorkspace.tsx:26-32) -> rows land in call_live_transcripts (is_final) -> browser subscribes via Supabase Realtime INSERT filtered by call_log_id (CoachPanel.tsx:4-6,158-170) -> 2.5s debounce after the latest FINAL 'contact' line (CoachPanel.tsx:58 DEBOUNCE_MS=2500, 168-171) -> supabase.functions.invoke('coach-suggest') with the highest final seq (137-139) -> coach-suggest loads last 40 final lines + dispositions + boards + last 12 corrections/kind (coach-suggest/index.ts:176-221) and makes ONE LLM call (223-246) -> proposals stored 'pending' -> rep Accept/Change -> coach-decide applies the side effect FIRST then records the decision (coach-decide/index.ts:141-211). End-to-end latency is dominated by provider transcription finalising + 2.5s debounce + the LLM call (hard 6s deadline, 900 max tokens). So 'live coach' is a ~2.5s+ debounced one-shot JSON proposal, not a streaming whisper.

(e) Models: engine uses _shared/openrouter.ts tiers fast=google/gemini-2.5-flash, balanced/premium=anthropic/claude-sonnet-4-20250514, free-first policy (meta-llama/llama-3.3-70b:free) with paid fallback on 429/503 then Lovable gateway (openrouter.ts:15-28,111-173). ai-brain calls the Lovable gateway (ai-brain/index.ts:4732). ai-assistant uses google/gemini-2.5-flash (ai-assistant/index.ts:2974,3058). coach-suggest uses Lithos DeepSeek V4.1 Flash-fast at https://api.lithosai.cloud/v1 (lithos.ts:14-15), 6s deadline, one retry without response_format on 400 (94-119). Cost control per call: essentially NONE in the AI layer - credit helpers (consumeCredit/checkCredits/credit_balance) appear only in api-gateway, credit-management, outbound-calling, retell-call-webhook, telnyx-outbound-ai, NOT in ai-brain/ai-autonomous-engine/coach-suggest/ai-assistant. Only caps are token/deadline (coach 900 tokens/6s; openrouter default 2000) and the engine's daily ACTION count cap.

**evidence**

- ai-autonomous-engine/index.ts:5498-5521 (isAutonomousEngineTenantCertified=false -> 503)
- ai-brain/index.ts:10-12 and 4652-4663 (isAiBrainTenantCertified=false -> 503 AI_BRAIN_NOT_TENANT_CERTIFIED)
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:19-26 (unschedules ai-autonomous-engine-job)
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:262-269 (original 5-min pg_cron schedule)
- ai-autonomous-engine/index.ts:1-15 (docstring: runs every 5 min via pg_cron, replaces browser hooks)
- ai-autonomous-engine/index.ts:5110-5230 (runForUser loop) and 543-832 (executeApprovedActions switch)
- ai-autonomous-engine/index.ts:1171-1184, 5204-5220, 2202 (autonomy_level -> approved/pending decision points)
- ai-autonomous-engine/index.ts:2309,2366-2375 (daily_budget_cents used only in planning prompt)
- ai-brain/index.ts:59, 61-90, 240-256, tool cases 1468-2419
- lib/launchSafety.ts:24-25,115-126,128-132,140-142,149-151 (frontend-only locks, no spend cap)
- coach-suggest/index.ts:176-246 (transcript+corrections then ONE LLM call)
- CoachPanel.tsx:4-6,58,137-171 (Realtime + 2.5s debounce + invoke coach-suggest)
- coach-decide/index.ts:42,141-211 (no transcript to router; side effect first)
- _shared/lithos.ts:14-15,94-119 (DeepSeek V4.1 Flash, 6s deadline)
- _shared/openrouter.ts:15-28,111-173 (model tiers + free-first)
- CallWorkspace.tsx:1-36 (consent gate; recording starts server-side, the one open behavioural gap)

**validation**

Read the actual serve handlers and cert functions (not just names). Confirmed both autonomy functions short-circuit to 503 via a literal-returning cert predicate. Confirmed the cron disable migration targets ai-autonomous-engine-job by jobname. Traced the coach path through CoachPanel.tsx debounce/realtime and the single chatJSON call. Confirmed via paths_only grep that credit helpers are absent from all four AI-layer functions.

**open_questions**

- Are the certification migrations (20260713*) applied to the live Supabase project emonjusymdripmkvtttc? If not, the engine cron may still run and still 503 at call time. Repo says disabled; live unverified.
- Are LITHOS_API_KEY / OPENROUTER_API_KEY / LOVABLE_API_KEY provisioned in the live environment?
- Does anything (a webhook or AutonomousAgentDashboard UI) still call ai-brain/ai-autonomous-engine expecting them to work and now get a 503?

**edge_cases_considered**

- The 503 cert gate is a code-level fact; whether the live DB applied the disable migration is not verified.
- 'Full auto' is decided per-action at queue time, so a mid-day mode flip leaves mixed approved/pending rows.
- executeApprovedActions re-validates lead/campaign ownership and DNC server-side, so a poisoned ai_action_queue row cannot reach another tenant's customer (good) - but it can still spend the owning tenant's money with no budget gate.
- coach-suggest degrades to empty proposals on LLM failure rather than erroring the rep's screen.

**what_i_did_not_check**

- The tail of ai-brain's serve handler and final tool-execution loop (index.ts:4777-5026) - read only the header and case list.
- ai-assistant/index.ts internals beyond the two model lines.
- AutonomousAgentDashboard.tsx / useAutonomousAgent.ts / MissionBriefingWizard.tsx UI wiring and whether the UI surfaces the 503.
- autonomous-prioritization and ml-learning-engine functions.
- The live database state (whether disable migrations are applied).
- Whether coach-suggest/coach-decide are enabled in the shipped UI for real reps vs still a port.

**confidence**: medium