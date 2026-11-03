# risks-d-support

- status: completed
- tldr: 'It did not call' diagnostics: app records reason in dialing_queues.notes (+providers/alerts), but notes is overwritten, unsurfaced in UI, and pre-acceptance failures aren't durably logged.

SUPPORT/DIAGNOSABILITY lane done ('it did not call'). Delivered a file:line-grounded operator runbook plus observability gaps. Key result: the app DOES leave a durable trace — in exactly one place operators can read: dialing_queues.notes (free-text skip reason) plus status/attempts/max_attempts/scheduled_at. call-dispatcher/index.ts writes a specific breadcrumb per skip class (dedup 1690, DNC 1716, contact-stop 1746, no-agent 1835, no-numbers 1863/1922, Telnyx/Assistable uncertified 1652/1763, ambiguous quarantine 1980, retry 2043-2044). Deeper forensics: provider_call_attempts + provider_dispatch_claims (pre-acceptance) and immutable call_logs (post-acceptance, 20260713071000). Alerts (system_alerts) + edge_function_errors cover config/provider failures; api-gateway findStuckCalls covers stuck calls. TOP GAPS (HIGH): (1) dialing_queues.notes is replaced on every write and is NOT surfaced in any UI (DispatcherActivityFeed/LiveProgressDashboard read .status only) — operators must run SQL/MCP; (2) no campaign_events / append-only per-dispatch event log (grep=0); (3) per-item failures return HTTP 200 in results[] and are never persisted, and diagnostics is computed only when zero eligible calls and is not stored; (4) provider_dispatch_claims.last_error is service-only (REVOKE authenticated), hiding the richest failure text. Praiseworthy: the evidence boundary (immutable call_logs, provider-evidence delete guard, acceptance-ambiguity quarantine) is genuinely strong.

## Artifact

**Findings**

RUNBOOK for 'it did not call'. (1) campaigns.status + budget_settings: dispatcher only dials active campaigns (enqueue requires status='active', 20260713064000:251); the 10-min backstop flips campaigns to 'paused' with budget_settings.pause_reason (20260703224351:154-164). (2) dialing_queues row for (campaign_id,lead_id): status pending/calling/completed/failed/removed, attempts, max_attempts, scheduled_at, updated_at, last_provider, last_attempted_at, dispatch_generation (schema 20250619152448:41-53; provider cols 20260712020000:139-143). No row=never enqueued; pending+future scheduled_at=waiting; failed=read notes; calling+old updated_at=stuck. (3) dialing_queues.notes is the ONLY durable operator breadcrumb carrying the exact skip reason: dedup(index.ts:1690), DNC(1716), contact-stop+5min reschedule(1746), no-agent(1835), no pool numbers(1863), no valid numbers(1922), Telnyx not certified(1652), Assistable not certified(1763), ambiguous quarantine(1980), retry note(2043-2044). Each write REPLACES notes so only the LAST reason survives (cancel/enqueue prepend, 20260713064000:293,391). (4) Retry history = attempts vs max_attempts; exhaustion sets failed 'Max attempts reached'. (5) Did the provider receive it: provider_call_attempts (append-only, unique provider+provider_call_id) and provider_dispatch_claims (claimed/accepted/definite_failure/acceptance_unknown + last_error) = pre-acceptance forensic pair (20260712020000:122-135,145-164); call_logs is immutable evidence that exists only once a call is real (20260713071000:40-107). (6) Alerts: system_alerts via raiseAlert (campaign_no_agent index.ts:1817; provider_call_failed 2075; stuck_calls_recovered/engine_heartbeat_stale/budget_auto_pause 20260703224351); edge_function_errors campaign_config_error (1801). (7) Dispatcher diagnostics object computed ONLY when zero eligible calls (index.ts:1570-1603), surfaced in CampaignManager.tsx:1756-1780 / useCallDispatcher.ts:157. Ops: api-gateway findStuckCalls (functions-live/api-gateway/index.ts:1119-1145); UI DispatcherActivityFeed, DialingSystemMonitor, LiveProgressDashboard, PredictiveDialingDashboard. GOOD: evidence boundary is strong (call_logs and provider-linked queue rows immutable, 20260713071000 + 20260713064000:167-193; ambiguous provider acceptance quarantined index.ts:1975-1995). Gaps: None.

**evidence**

- supabase/functions/call-dispatcher/index.ts:1570-1603 diagnostics computed only when eligibleCalls.length===0
- supabase/functions/call-dispatcher/index.ts:2126-2159 HTTP 200 success body with diagnostics + results[] even on per-item failure
- supabase/functions/call-dispatcher/index.ts:1690,1716,1746,1835,1863,1922,1652,1763,1980,2043-2044 dialing_queues.notes breadcrumb values
- supabase/functions/call-dispatcher/index.ts:1801 edge_function_errors; :1817 raiseAlert campaign_no_agent; :2075 raiseAlert provider_call_failed
- supabase/functions/call-dispatcher/index.ts:2018-2097 per-item failure only to results[], never persisted, never HTTP error
- supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:41-53 dialing_queues columns
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:122-135 provider_call_attempts; :139-143 queue provider cols; :145-164 provider_dispatch_claims incl last_error; :667-692 claim_pending_dispatches_now
- supabase/migrations/20260712020000:175 REVOKE ALL provider_dispatch_claims FROM authenticated (service-only)
- supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:41-60 browser SELECT-only; :167-193 delete guard; :199-325 notes prepend
- supabase/migrations/20260703224351_unattended_safety_backstops.sql:88-117 stuck>15min->failed+alert; :154-164 budget auto-pause
- supabase/migrations/20260713071000_call_log_evidence_boundary.sql:40-107 call_logs immutable
- src/components/CampaignManager.tsx:1756-1780 diagnostics UI
- src/hooks/useCallDispatcher.ts:150 toasts only when dispatched>0
- src/components/DispatcherActivityFeed.tsx:119-143 realtime dialing_queues UPDATE reads .status only, never .notes
- src/components/LiveProgressDashboard.tsx:71-96 counts dialing_queues.status only
- supabase/functions-live/api-gateway/index.ts:1119-1145 findStuckCalls
- grep campaign_events repo-wide = 0 matches (no per-dispatch event table)
- docs/_swarm/err-call-dispatcher.md prior lane: inconsistent success shapes, ~40 swallowed failures, per-item failures never escalate

**validation**

Read dial-smart-app-map.md in full. Opened call-dispatcher/index.ts (sampled head + 1550-2168), useCallDispatcher.ts in full, migrations 20250619152448, 20260712020000, 20260713064000, 20260713071000, 20260703224351, CampaignManager.tsx:1756-1780, DispatcherActivityFeed.tsx, LiveProgressDashboard.tsx, DialingSystemMonitor.tsx, api-gateway findStuckCalls. Verified dispatcher copy line counts (2168 vs 1944) with find /c. grep: campaign_events=0, provider_call_attempts across 92 files, edge_function_errors in 3 src files. No execution (research only).

**open_questions**

- Do the RPC bodies claim_provider_dispatch / finalize_provider_dispatch / resolve_provider_dispatch_invoke_error write last_error and a durable record on every failure path?
- Does alerting.ts raiseAlert persist to system_alerts and is it surfaced by useLiveCampaignStats for every alert_type named?
- Which dispatcher copy (supabase/functions vs supabase/functions-live) is actually deployed, and do their diagnostics/notes paths diverge?
- Does any admin/SQL view expose dialing_queues.notes to an operator without MCP, or is the breadcrumb effectively DB-only?

**edge_cases_considered**

- Lead enqueued but campaign later paused by budget backstop -> queue goes stale silently (no per-lead alert)
- notes overwritten by a later retry/quarantine loses the earlier reason; only cancel/enqueue prepend
- provider_dispatch_claims has last_error but is service-only, so the richest failure text is hidden from the operator UI
- dispatched>0 toasts success even when some items in results[] failed in the same batch
- dialing_queues has no user_id column, so any operator tooling must join through campaigns (api-gateway:1123 comment)

**what_i_did_not_check**

- RPC bodies: claim_pending_dispatches(_now), claim_provider_dispatch, finalize_provider_dispatch, resolve_provider_dispatch_invoke_error, evaluate_contact_stop, record_physical_call_attempt internals
- _shared/alerting.ts raiseAlert/resolveAlerts behavior (persistence + whether it throws)
- Whether useLiveCampaignStats / any UI actually renders each alert_type (campaign_no_agent, provider_call_failed, stuck_calls_recovered)
- retell-call-webhook and outbound-calling failure/retry recording paths (which write call_logs / provider_call_attempts)
- Deno edge-function log retention (how long console.log/console.error persist for post-mortem)
- system_health_logs / system_alerts full schema and RLS
- Whether a dedicated 'why did this lead not call' operator screen exists anywhere in src

**confidence**: medium