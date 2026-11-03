# ai-managers-truth

- status: completed
- tldr: AI managers (ai-brain 79 tools; ai-autonomous-engine paid-action brain) both hard-503; no dollar spend cap; only pg_cron caller unscheduled.

AI MANAGERS truth established (research-only). Two surfaces, both hard-503. ai-brain ('Lady Jarvis'): 79 tools (index.ts:293-1454), gate false :10-12, 503 :4652-4664; unsatisfied = 79-tool service-role surface not bound to one org + non-transactional write plan. ai-autonomous-engine (server brain): gate false :5498-5500, 503 :5511-5521; executes paid calls/SMS/CRM (switch :605-809); unsatisfied = autonomy tables keyed by user_id and ai_action_queue has NO organization_id (20260210:16-32), so a multi-org user could spend in the wrong account, and the typed policy/executor path is uncertified. The only caller (pg_cron 'ai-autonomous-engine-job', 20260210:275-289) was unscheduled (20260713061000:16-26); zero frontend callers. SPEND: no server-side dollar cap - daily_budget_cents (:58) is advisory-only; only COUNT caps exist (max_daily_autonomous_actions :5171-5174; journey_max_daily_touches :5235). Minimum slice already sketched: autonomousSettingsPresets.ts:15-31 (suggestions_only, cap 5) + the engine's existing one-org quarantine :5581-5599, after org-binding+receipt on ai_action_queue. Customer today sees settings save + dashboards populate but nothing fires (browser lock launchSafety.ts:140-142; activation lock AutonomousAgentDashboard.tsx:690-694).

## Artifact

**Findings**

TWO AI-manager surfaces, both hard-503-gated; the autonomous agent has NO server-side dollar cap; the only caller (pg_cron) was unscheduled.

1) ai-brain = 'Lady Jarvis' assistant, supabase/functions/ai-brain/index.ts (5026 lines). Gate isAiBrainTenantCertified() returns false (:10-12); serve() returns 503 AI_BRAIN_NOT_TENANT_CERTIFIED at :4652-4664. Unsatisfied condition is stated in-code (:4653-4656): service-role client across a ~79-tool surface 'not yet bound to one explicit organization,' and the write plan is 'not transactional.'

2) ai-brain tool surface: exactly 79 tools declared in the TOOLS array :293-1454 (create_workflow, list_workflows, delete_workflow, create_campaign, list_campaigns, update_campaign, send_sms_blast, send_test_sms, list_leads, add_leads_to_campaign, create_automation_rule, get_system_status, diagnose_issue, undo_last_action, record_session_action, create_voice_broadcast, check_calendar_availability, book_appointment, list_appointments, list_phone_numbers, pause_campaign, resume_campaign, stop_broadcast, run_health_check, update_lead, delete_lead, move_lead_to_stage, list_alerts, acknowledge_alert, acknowledge_all_alerts, update_phone_number, quarantine_phone_number, cancel_appointment, reschedule_appointment, list_today_appointments, list_broadcasts, launch_broadcast, get_autonomous_status, list_autonomous_decisions, get_autonomous_goals, set_autonomous_goal, get_learning_insights, toggle_autonomous_mode, set_autonomy_level, get_lead_priorities, force_reprioritize_leads, get_campaign_optimization_status, search_available_numbers, purchase_retell_numbers, list_retell_agents, assign_numbers_to_agent, sync_retell_numbers, toggle_number_rotation, get_campaign_stats, delete_phone_numbers, get_followup_stats, get_number_health, get_agent_script, update_agent_script, list_available_variables, analyze_call_patterns, compare_daily_performance, suggest_script_improvements, get_agent_history, add_agent_note, remember_user_preference, recall_memories, search_leads_advanced, tag_leads, get_lead_stats, get_prompt_snippets, check_agent_snippets, add_snippet_to_agent, get_guardian_status, get_agent_phone_numbers, configure_autonomous_features, setup_full_campaign). Destructive/spend tools included: delete_lead (:698), delete_phone_numbers (:1087), send_sms_blast (:391), purchase_retell_numbers (:1005), launch_broadcast (:858). Its persona ('Lady Jarvis') calls itself the coordinator of internal managers: Number Pool / Lead / Campaign / Agent / Calendar Manager (:61-90). Callers: src/hooks/useAIBrain.ts:148,239; useAIBrainBridge.ts:92; useAutonomousAgent.ts:621.

3) ai-autonomous-engine = server-side 'brain', supabase/functions/ai-autonomous-engine/index.ts (5644 lines). Gate isAutonomousEngineTenantCertified() returns false (:5498-5500); 503 AUTONOMOUS_ENGINE_NOT_TENANT_CERTIFIED at :5511-5521. Unsatisfied condition stated in-code (:5507-5510): it 'can approve and execute paid calls, messages, and CRM actions from user-scoped autonomy tables'; service auth 'does not prove organization-safe action ownership'; restore 'only after the typed policy/executor path is certified.'

4) engine action surface (executeApprovedActions :543-833): switch on action_type :605-809 = queue_leads_for_calling, send_followup_sms, adjust_pacing, quarantine_number, update_lead_status, journey_call, journey_ai_sms. Decisions also emit action types 'sms' (:3565), 'call' (:4169), 'ai_sms' (:4177,4185), and 'adjust_pacing'/'queue_leads_for_calling'/'send_followup_sms'/'quarantine_number' (:857,888,917,943,1174). Paid egress: journey_call -> outbound-calling (:752), send_followup_sms -> sms-messaging (:673), journey_ai_sms -> ai-sms-processor (:779).

5) WHY exactly 503 (specific unsatisfied conditions): (a) the engine enumerates EVERY user with autonomous mode from autonomous_settings and most legacy autonomy tables are keyed by user_id, not organization_id (comment :5576-5580); ai_action_queue has NO organization_id column (:20260210_autonomous_engine_upgrade.sql:16-32) - only user_id. autonomous_settings DID later get organization_id NOT NULL (20260108_phase2_add_org_to_additional_tables.sql:87), but the executed-action table did not, so a multi-org user would blend companies and could fire a paid action in the wrong account. (b) ai-brain: its 79-tool surface is not bound to one org and the write plan is not transactional (:4653-4656).

6) Some in-engine hardening ALREADY exists under the gate (so the 503 is not just 'nothing built'): per-user 'exactly one canonical org or quarantine' check (:5581-5599); compare-and-set claim to prevent overlapping runs (:583-595); lead/campaign ownership + DNC validation before queuing (:626-647); never auto-retry stale executions (:550-562); canonical action params via ../_shared/action-contracts.ts (:19-27).

7) The ONLY caller of ai-autonomous-engine is the pg_cron job 'ai-autonomous-engine-job' every 5 min (20260210_autonomous_engine_upgrade.sql:275-289), and it was UNSCHEDULED by 20260713061000_disable_uncertified_autonomous_engine_cron.sql:16-26 (also removes safety-backstops and campaign-health-autofix). No frontend code invokes the engine (grep across src = 0 hits).

8) SPEND RISK - no server-side dollar cap. daily_budget_cents exists (:58) but is advisory-only, fed to the LLM battle plan (:2308-2309, :2415, :2462). Cost numbers (:1075-1078, :1804-1826) are ESTIMATES for ROI reporting, not gates. The only caps are COUNT-based: max_daily_autonomous_actions (:5171-5174, :5199-5202) and journey_max_daily_touches (:5235). At their own ~7c/call and ~1c/SMS estimate (:1076-1077), a 50-action/day cap is still unbounded in dollars. ai-brain's purchase_retell_numbers tool can also spend with no cap in its gated surface.

9) Minimum certifiable slice for ONE org already sketched in repo: src/lib/autonomousSettingsPresets.ts:15-31 getSolarExitPilotSettingsPreset (enabled:false, autonomy_level:'suggestions_only', max_daily_autonomous_actions:5, daily_goal_calls:5, SOLAR_EXIT_PILOT_COHORT_TARGET=5 at :8). Combined with the engine's existing one-org quarantine (:5581-5599), the smallest safe turn-on = suggestions_only or approval_required bound to exactly one org, after adding organization_id + receipt to ai_action_queue and routing through the typed executor (_shared/action-contracts.ts) instead of the legacy switch.

10) What a customer sees today: tab is 'Elite Pilot Copilot' in Simple Mode (DashboardSidebar.tsx:130), else FullAutonomousAgentDashboard (AutonomousAgentDashboard.tsx:1265-1270; wired at Dashboard.tsx:495-496). They can toggle settings (useAutonomousAgent.updateSettings writes autonomous_settings, :137-164) and get an 'Autonomous mode: Enabled' toast, plus decision history/goals/insights/priorities/battle plan from existing data. But nothing autonomous fires: browser execution is hard-locked (browserAutonomousActionAllowed()=false, launchSafety.ts:140-142; executeRecommendation blocked at useAutonomousAgent.ts:278-285), campaign activation is launch-locked (AutonomousAgentDashboard.tsx:690-694) with only Pause allowed (:674), and the server engine is 503 with its cron removed. If forced on suggestions_only for one org: queued recommendations appear, nothing executes. If full_auto for one org: engine would auto-approve + execute real calls/SMS/quarantine/pacing - real money, no dollar ceiling.

**evidence**

- supabase/functions/ai-brain/index.ts:10-12 (gate false)
- supabase/functions/ai-brain/index.ts:4652-4664 (503 AI_BRAIN_NOT_TENANT_CERTIFIED)
- supabase/functions/ai-brain/index.ts:293-1454 (TOOLS array, 79 tools)
- supabase/functions/ai-brain/index.ts:61-90 (internal manager hierarchy)
- supabase/functions/ai-brain/index.ts:1005 (purchase_retell_numbers), :698 delete_lead, :1087 delete_phone_numbers, :391 send_sms_blast
- supabase/functions/ai-autonomous-engine/index.ts:5498-5521 (gate false + 503 + rationale)
- supabase/functions/ai-autonomous-engine/index.ts:543-833 (executeApprovedActions; switch :605-809)
- supabase/functions/ai-autonomous-engine/index.ts:752 outbound-calling, :673 sms-messaging, :779 ai-sms-processor
- supabase/functions/ai-autonomous-engine/index.ts:5576-5599 (multi-org quarantine check)
- supabase/functions/ai-autonomous-engine/index.ts:58 daily_budget_cents; :2308-2309,:2415 adv.-only; :5171-5174,:5235 count caps
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:16-32 (ai_action_queue, user_id only, no org)
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:275-289 (5-min cron schedule)
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:16-26 (cron unscheduled)
- supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:87 (autonomous_settings org NOT NULL)
- src/lib/autonomousSettingsPresets.ts:8,15-31 (pilot preset, suggestions_only, cap 5)
- src/lib/launchSafety.ts:140-142 (browserAutonomousActionAllowed false)
- src/hooks/useAutonomousAgent.ts:137-164 (settings write), :278-285 (browser lock), :621 (ai-brain invoke)
- src/components/AutonomousAgentDashboard.tsx:1265-1270 (simple vs full), :674 pause :690-694 activation lock
- src/components/DashboardSidebar.tsx:130 ('Elite Pilot Copilot')
- src/components/Dashboard.tsx:495-496 (tab wiring)

**validation**

Static source inspection only (read-only). Enumerated tool surface by grep of TOOLS array line range; enumerated action types by grep of action_type literals + switch; confirmed zero frontend invocations of ai-autonomous-engine via repo-wide grep; confirmed cron schedule + unschedule by reading both migrations; confirmed no dollar-cap enforcement by grepping budget/cost/spend/credit across the engine (all hits are advisory/estimate/count-based). No code executed, no API called, no files written.

**open_questions**

- Are the 79 ai-brain tools each implemented, or a mix of real + stub handlers? (dispatch loop unread.)
- Is there any later migration adding organization_id to ai_action_queue, or org-bound RLS on it in the live DB?
- In the live project, does any autonomous_settings row exist and is the cron truly removed?
- Does the suggest-phase or a workflow edge fn reintroduce a caller of ai-autonomous-engine after the cron removal?

**what_i_did_not_check**

- Did not read the tail of ai-brain's serve handler / tool-execution dispatch loop (index.ts:4749-5026), so whether each of the 79 tools is fully implemented vs a stub is unverified.
- Did not read the full bodies of AutonomousAgentDashboard.tsx (1273 lines) or AIPipelineManager.tsx (856 lines) - only heads, call sites, and the pause/activation region.
- Did not query the live Supabase project (emonjusymdripmkvtttc): whether migrations are applied live, whether autonomous_settings rows exist, whether the cron is truly gone, and deployed (main vs functions-live) bodies are unverified.
- Did not read 20260329_autonomous_workflow_intelligence.sql or the full 20260210_autonomous_engine_upgrade.sql (heads/regions only).
- Did not inspect useAutonomousGoals, useAutonomousPrioritization, useAutonomousCampaignOptimizer, ActionQueuePanel, AIDecisionEngine, or ScriptAnalyticsDashboard internals.
- Did not verify whether ai_action_queue received any later organization_id migration (searched only CREATE/ALTER patterns) or its live RLS.
- Did not check the ai-brain executeToolCall dispatch mechanism (no 'case' labels found in that file) to confirm how tool names map to handlers.

**confidence**: high