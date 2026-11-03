# dialpath-dispatcher-gates

- status: completed
- tldr: 12 ranked day-one dispatcher gates; top cause: cron only wakes tenants with pre-existing due queue rows, so an unseeded first launch never dials.

Day-one dispatcher gating analysis complete. Read call-dispatcher/index.ts in full (2168 lines) and traced upstream cron (automation-scheduler), tenant auth, claim/stop RPCs, and DB gates. Ranked day-one zero-dispatch causes: F1 chicken-and-egg (cron only wakes tenants with existing due queue rows; nothing seeds the queue), F2 per-lead timezone filter drops blank-state leads, F3 draft status, F4 workflow_id exclusion, F5 provider!=retell exclusion, F6 no eligible Retell number (auto-sync disabled), F7 calling-hours, F8 concurrency counts queued call_logs, F9 missing organizationId, F10 default-deny campaign_contact_releases at egress, F11 no agent. Certification flags isForceDispatch/isCallbackAutomation/isAutomaticRetellNumberSync all false.

## Artifact

**Findings**

F1 CRITICAL chicken-and-egg: automation-scheduler only wakes call-dispatcher for tenants already having due dialing_queues rows (scheduler/index.ts:63-68,74-83); it never creates queue rows, and the dispatcher is the only creator (call-dispatcher/index.ts:1076-1139). A freshly launched campaign with no queue rows dispatches 0 indefinitely unless the app invokes the dispatcher on launch. || F2 CRITICAL per-lead timezone filter drops every lead with blank state: getLeadTimezone uses state only (64-70), filter fails closed when leadTz/startHour/endHour missing (1529-1534) and reverts each claimed row to pending +15min (1537-1555). || F3 HIGH campaign must be status='active' (879,891-900); default is 'draft'. || F4 HIGH workflow_id campaigns excluded (882). || F5 HIGH provider must be null/retell (885); telnyx/assistable excluded and egress-blocked (1646-1671,1753-1782). || F6 HIGH no eligible Retell number => no_numbers_available dispatched:0 (1170-1177,1314-1358); auto Retell sync disabled (23-25,1265-1269); force_dispatch disabled (15-17,413-423). || F7 MEDIUM calling-hours: default window 09:00-17:00 + hard 19:30 ET cutoff, bypass off (350-353,564-619). || F8 MEDIUM concurrency counts queued call_logs; at_capacity dispatched:0 (1377-1425). || F9 MEDIUM requestBody.organizationId mandatory valid UUID or 500 (319,547; tenant-context.ts:16-22,66-83). || F10 MEDIUM-HIGH egress default-deny campaign_contact_releases in outbound-calling (25; gate 187-313); dispatcher catches, retries, does not count dispatched (1955-2007). || F11 MEDIUM no agent => failed (1786-1838). || F12 LOW leads must be in campaign_leads; tenant trigger rejects cross-tenant (494-496). || EXACT STOP: (a) unseeded queue => automation-scheduler/index.ts:74-83; (b) dispatcher invoked => call-dispatcher/index.ts:1532-1554, else 891-900, else 1346-1358, else egress deny (campaign-contact-release).

**evidence**

- call-dispatcher/index.ts:15-25 certification flags hardcoded false
- call-dispatcher/index.ts:64-70 getLeadTimezone uses state only
- call-dispatcher/index.ts:319 authorizeOrganizationContext throws without explicit org id
- call-dispatcher/index.ts:350-353 bypassCallingHours forced false
- call-dispatcher/index.ts:564-619 calling-hours block returns dispatched:0 at 605-618
- call-dispatcher/index.ts:879-900 active-campaign filters; 'No active campaigns' return
- call-dispatcher/index.ts:1012-1139 lead->queue generation (only source of campaign queue rows)
- call-dispatcher/index.ts:1170-1177 phone_numbers filter (rotation_enabled + retell_phone_id)
- call-dispatcher/index.ts:1265-1269 auto Retell sync gated by isAutomaticRetellNumberSyncCertified()
- call-dispatcher/index.ts:1314-1358 no_numbers_available dispatched:0
- call-dispatcher/index.ts:1377-1425 concurrency counts queued call_logs
- call-dispatcher/index.ts:1441-1445 claim_pending_dispatches RPC
- call-dispatcher/index.ts:1480,1529-1555 per-lead timezone filter; revert pending +15min
- call-dispatcher/index.ts:1646-1671 telnyx blocked; 1753-1782 assistable blocked
- call-dispatcher/index.ts:1786-1838 no-agent marks failed
- call-dispatcher/index.ts:1955-2007 invoke outbound-calling; dispatched++ only on success
- automation-scheduler/index.ts:25-32,63-68,74-83,104-115 queue-driven tenant discovery
- tenant-context.ts:16-22,66-83 explicit-org requirement
- outbound-calling/index.ts:25 imports campaign-contact-release
- migrations/20260713150000_campaign_contact_release_gate.sql:187-313,328-329 default-deny release
- migrations/20260713043000_retell_automatic_reconciliation.sql:1425-1488 claim_pending_dispatches
- migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196-257 evaluate_contact_stop
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:5 campaigns defaults (draft, 09:00-17:00, America/New_York); :4 leads.state nullable
- migrations/20260713064000_dialing_queue_mutation_boundary.sql:61 service_role retains access
- migrations/20260712070000_multi_organization_routing_contract.sql:494-496 campaign_leads trigger is tenant-only

**validation**

Static source+migration review only (research-only; no live calls/writes). Read call-dispatcher/index.ts in full (2168 lines) plus automation-scheduler, tenant-context, outbound-calling release import, claim/evaluate RPCs, and campaign/leads schema. Every stop cited by file:line.

**open_questions**

- Does the app launch/seed RPC invoke call-dispatcher directly (would break F1)?
- Is a campaign_contact_releases row auto-created, or must an operator insert one before any egress (F10)?
- Is the automation-scheduler cron actually scheduled/authenticated in production?

**edge_cases_considered**

- manual vs cron invocation path (manualDispatchRequested)
- internal scheduler call passes organizationId
- campaign-level hours default 19:30 vs per-lead raw campaign values
- service_role bypasses RLS and retains dialing_queues access
- claim RPC excludes rows with unresolved provider claims
- dedup filters: 5min recently-called, terminal dispositions, existing queue any status, active workflow 24h

**what_i_did_not_check**

- Frontend/app launch path and any Refresh-Leads/seeding RPC.
- Whether live production DB matches repo migrations.
- automation-scheduler auth (scheduler-auth.ts) and cron registration.
- Full outbound-calling gate chain beyond the release import and evaluate_contact_stop.
- functions-live/call-dispatcher old snapshot vs current.
- Whether lead.state is populated by GHL/ingestion in practice.

**confidence**: medium