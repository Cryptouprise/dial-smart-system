# scale-d-db-queue

- status: completed
- tldr: Lane (d): real queue, atomic SKIP LOCKED claim, layered provider idempotency. Gaps: reclaim cron disabled; callback insert can drop on unique violation.

Lane (d) DB / dialing-queue integrity: DONE. Verdict: this IS a real work queue with atomic claiming, not read-then-write. Claiming is UPDATE...RETURNING over `FOR UPDATE SKIP LOCKED` (20260712020000:639-665), the dispatcher uses it (call-dispatcher/index.ts:1440-1445), and unique constraints make same-lead double-dial structurally impossible pre-egress (UNIQUE(campaign_id,lead_id) added 20260105225115:22-34). Provider-call idempotency is layered: provider_dispatch_claims.logical_key UNIQUE + ON CONFLICT DO NOTHING, partial unique (queue_id,dispatch_generation), provider_call_attempts UNIQUE(provider,call_id), provider_callback_receipts lease with claim_token. Gaps: (G1) the SQL 15-min stuck-row backstop cron 'safety-backstops' is DISABLED (20260713061000:19-25), so reclaim relies on the in-dispatcher 2-min reaper firing (liveness risk, not double-dial); (G4) past-due callback insert at call-dispatcher/index.ts:846 has no onConflict and no existence pre-check, so a legit callback can be silently dropped on a unique violation; (G5) no composite partial index for the claim's ORDER BY. Scale at 500/day and 10x is well under any queue contention ceiling; the real limit is Retell concurrency.

## Artifact

**Findings**

REAL WORK QUEUE WITH ROW LOCKING EXISTS; claiming is atomic, not read-then-write.

F1. Atomic claim (FACT). claim_pending_dispatches(p_campaign_ids,p_limit) is UPDATE dialing_queues SET status='calling', dispatch_generation=gen_random_uuid(), last_provider_call_id=NULL WHERE id IN (SELECT id ... status='pending' AND scheduled_at<=now() AND attempts<max_attempts ORDER BY priority DESC, scheduled_at ASC LIMIT p_limit FOR UPDATE SKIP LOCKED) RETURNING * (20260712020000 contact_safety_and_provider_idempotency.sql:639-665). A _now twin drops only the scheduled_at gate (667-692). Two concurrent invocations get disjoint rows; no two workers claim the same row.

F2. The dispatcher uses it (FACT): call-dispatcher/index.ts:1440-1445 calls rpc('claim_pending_dispatches',{p_campaign_ids,p_limit}); batch capped at min(availableSlots,targetBatch,15) (1400-1402). No hand-rolled read-then-write claim.

F3. Claims do not count attempts (FACT, correct). Live claim sets only status/generation/last_provider_call_id/updated_at. An older claim incremented attempts (20260415230836:9-12) and is superseded by CREATE OR REPLACE. Attempts increment exactly once per provider-accepted call in record_physical_call_attempt (20260712020000:533-573).

F4. No duplicate queue rows (FACT): UNIQUE(campaign_id,lead_id) constraint dialing_queues_campaign_lead_unique (20260105225115:22-34); later writers use ON CONFLICT (campaign_id,lead_id) DO UPDATE. The command boundary enqueue_dialing_queue serializes same-(campaign,lead) enqueues with FOR UPDATE on campaigns then leads before select-then-insert (20260713064000:233-321).

F5. Provider-call idempotency is layered (FACT): provider_dispatch_claims.logical_key UNIQUE + ON CONFLICT DO NOTHING (147,384-411); partial unique (queue_id,dispatch_generation) (166-168); provider_call_attempts UNIQUE(provider,provider_call_id) (134); provider_callback_receipts UNIQUE(provider,provider_call_id,lifecycle_stage) with claim_token+locked_until lease (113,259-335). outbound-calling re-validates status='calling' and generation before egress (outbound-calling/index.ts:435-437) and suppresses duplicate initiation (609-625).

F6. Reclaim exists but the SQL backstop cron is OFF (FACT). cleanupStuckCallsAndQueues (call-dispatcher/index.ts:103-244, called at 396 and 627) resets pre-provider 'calling' rows older than 2 min (last_provider_call_id IS NULL) to 'pending'/'failed', skipping quarantined queues (205-227). The provider-safe 15-min SQL sweep (20260712050000:71-100) had cron 'safety-backstops' unscheduled (20260713061000:19-25).

GAPS/RACES:
G1 availability - the only live reclaim depends on the dispatcher being invoked for that tenant; if dispatch stops, 'calling' rows stick forever (liveness bug, not double-dial).
G2 low-severity - the reaper is a SELECT-then-per-row-UPDATE loop, not atomic; concurrent runs can both reset one row. Harmless (idempotent to 'pending', same guards).
G3 theoretical - the 2-min reclaim can fire during a slow provider-create; double physical dial is mitigated but not eliminated (outbound-calling re-checks generation/status, but the original invocation may already have issued the provider call). THEORY, not observed.
G4 lost callback - direct .insert() into dialing_queues at call-dispatcher/index.ts:521 (guarded by a prior existence check 493-499) and :846 (past-due callback) have no onConflict; the :846 path does not pre-check for an existing (campaign_id,lead_id) row, so with the unique constraint a legit callback can hit a unique violation and be silently dropped (error only logged, 866-868).
G5 perf at 10x - claim orders by priority DESC, scheduled_at ASC but only single-column indexes exist (20250619152448:132-134); no composite partial index, so an extra sort at tens of thousands of pending rows. Correctness unaffected.

SCALE READ: at 500/day (~0.35/min) and 10x (~3.5/min) the queue is far below contention thresholds; SKIP LOCKED + unique constraints make same-lead double-dial structurally impossible pre-egress. Real ceilings are the operator-set Retell concurrency (maxDialsInFlight) and the 15/batch cap, not the queue.

**evidence**

- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:639-665 (claim_pending_dispatches: UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:667-692 (claim_pending_dispatches_now variant)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:147,166-168,384-411 (provider_dispatch_claims logical_key UNIQUE + ON CONFLICT DO NOTHING + (queue_id,dispatch_generation) partial unique)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:113,259-335 (provider_callback_receipts unique + claim_token/locked_until lease)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:122-134,465-578 (provider_call_attempts UNIQUE(provider,provider_call_id); record_physical_call_attempt single increment)
- supabase/migrations/20260105225115_57cc83f0-107a-4bba-89b3-b110cb2c8828.sql:22-34 (UNIQUE(campaign_id,lead_id) dialing_queues_campaign_lead_unique)
- supabase/migrations/20260415230836_605b13a6-9584-4a9d-8008-8724b54b2505.sql:2-23 (superseded claim that incremented attempts)
- supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:199-325 (enqueue_dialing_queue FOR UPDATE serialization)
- supabase/migrations/20260712050000_provider_safe_unattended_backstops.sql:71-100 (15-min provider-safe stuck sweep)
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:19-25 (unschedules 'safety-backstops')
- supabase/functions/call-dispatcher/index.ts:103-244 (cleanupStuckCallsAndQueues; 2-min reclaim, quarantine guards)
- supabase/functions/call-dispatcher/index.ts:396,627 (cleanup call sites)
- supabase/functions/call-dispatcher/index.ts:1440-1445 (rpc claim_pending_dispatches)
- supabase/functions/call-dispatcher/index.ts:521,846,866-868 (plain inserts, callback unique-violation path)
- supabase/functions/outbound-calling/index.ts:435-437,609-625 (generation/status guard + duplicate suppression)
- supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:41-53,132-134 (base dialing_queues + single-column indexes)

**validation**

Static read of exact DDL and edge-function call sites; every claim is a file:line cite. Cross-checked the live claim against the superseded one to confirm CREATE OR REPLACE semantics. Confirmed the unique constraint via three independent migrations. Confirmed quarantine-guard coverage by reading the SELECT feeding quarantinedQueueIds. No DB connected and no code executed.

**open_questions**

- Does any live pg_cron job still reclaim stuck 'calling' rows now that 'safety-backstops' is unscheduled, or is there a replacement job name?
- Does the duplicate functions-live/call-dispatcher copy match the reviewed supabase/functions copy (functions-live .../index.ts:1279 hints at a claim that increments attempts)?

**edge_cases_considered**

- Concurrent enqueue of the same (campaign,lead) when no dialing_queues row yet exists (FOR UPDATE on campaigns serializes it)
- Dispatcher invocation overlapping a slow provider-create (2-min reclaim vs in-flight call)
- Two concurrent dispatcher invocations claiming the same pending rows
- Provider create times out after acceptance (quarantine, not redial)

**what_i_did_not_check**

- Live DB state, pg_cron contents, and whether 20260712020000 / 20260713061000 are actually applied in project emonjusymdripmkvtttc.
- Did not run tests/retell_reconciliation_contract.sql or any function *.test.ts, and no load test.
- Did not review the retell-provider-reconciler cron body (20260713043000) end to end, nor the terminal provider webhook that owns the 'calling'->terminal move.
- Did not diff supabase/functions against the duplicate functions-live/ tree for drift.
- Did not audit RLS/policy enforcement of dispatcher direct inserts vs the service boundary, nor credit-ledger release beyond the invoke-error path.

**confidence**: high