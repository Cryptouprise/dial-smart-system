# How does a lead actually move through a pipeline?

lane: pipeline-engine-truth  mode: council  reconciled by: manager:z-ai/glm-5.3-prime over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.1828 (reviewers $0.0335 + manager $0.1493)
tokens: 20432 in / 10638 out
files: supabase/functions/pipeline-management/index.ts, supabase/functions/disposition-router/index.ts

---

## (1) Reconciled answer

**Data model.** `pipeline_boards` + `lead_pipeline_positions` (created `20251103034801…sql:72`, RLS on :86, four policies :90–102, indexes :120–122). A unique constraint (`lead_pipeline_positions_lead_user_unique`, `20260105225115…sql:36–43`, matching the `onConflict: 'lead_id,user_id'` upserts in disposition-router :489/:629) means one stage per lead per user — a single-funnel position, not multi-pipeline membership. `organization_id` was added and backfilled later (`20261029142121_phase1_org_scope.sql:11,15,44`), i.e. the org-binding precondition the disable-gates cite is partially in place — yet the gates still hard-return `false`.

**Management API.** `pipeline-management` would provide boards/positions/dispositions CRUD, default-disposition seeding, and `move_lead_to_pipeline` (:81–151) — but `isPipelineManagementTenantCertified()` returns `false` (:10–12) and every request gets 503 `PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED` before any DB work (:19–24).

**Automation.** `disposition-router` would auto-move leads to stages from dispositions (step 5 :434–500, `ensurePipelineBoardLocal` :795–870, `move_to_stage` :619–636) and is the only writer of `leads.status`/`leads.next_callback_at` in evidence (`status='dnc'` :328; `status=normalizedDisposition` :367–373; `schedule_callback` sets `next_callback_at = now + delay_hours` (default 24h) and `status='callback'` :710–717). Also hard-disabled: 503 `DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED` (:76–78, 89–99).

**UI.** `EnhancedPipelineKanban.tsx` is the board (props `pipelineBoards`/`leadPositions` :30, campaign filtering :61–63, metrics :337–376); `AIPipelineManager.tsx` reads `pipeline_boards` and `lead_pipeline_positions` **directly from Supabase** (:102, :128) with a hard-coded demo fallback (:110–114); sidebar nav exists (`DashboardSidebar.tsx:119`). No drag/write handler appears in evidence — only payload construction (`EnhancedPipelineKanban.tsx:124–136`). GHL sync is a separate path (`GHLFieldMappingTab.tsx:369,447–449`).

**The DELETE migration.** `20260407220336…sql:1` is exactly `DELETE FROM lead_pipeline_positions;` — no WHERE, no tenant scope. The broad grep matches only line 1 in that file, so it is the *only* statement in the migration touching the table; no compensating re-seed exists anywhere in evidence. Replaying it against a live database deletes every row for every tenant, and nothing restores them. The live_coach delete+insert (:316–320, service-role RPC :345) is a scoped per-lead move — a different pattern, not a re-seed of this wipe.

**Verdict: No** — on verified evidence a customer cannot run a sales pipeline without GHL. **First stop: the hardcoded 503 gate in `pipeline-management`** (`isPipelineManagementTenantCertified()` → false), which kills the entire management API; disposition-router's 503 is the second gate, killing automated movement and all `leads.status`/`next_callback_at` writes. Nuance: the UI shown reads the DB directly, so boards can render — what's actually missing is any verified write path.

## (2) Disagreements

- **First blocker.** R1/R2 name the pipeline-management 503 specifically; R3 lumps both 503s. Evidence favours pipeline-management as the first gate *on the API path*. Unresolved at the UI level: no evidence any component calls that function (AIPipelineManager queries Supabase directly), so the first thing a user actually hits may be "nothing populates or moves the board."
- **Compensating statements in the DELETE migration.** R1 hedged (only line 1 visible); R2/R3 state destruction flatly. Evidence favours R2/R3 — the broad grep matches only line 1 of that file, so no other statement in it touches the table. R1's caution was reasonable but is resolved by evidence none of them cited explicitly.
- **R2 listed "whether the UIs call the edge functions or query Supabase directly" as not checked** — the grep answers it for AIPipelineManager (:102). Not a claim conflict, but R2 under-read available evidence; the Kanban's props-parent data source does remain unknown.
- **Confidence.** R2 medium, R3 high, R1 high-on-gates/medium-on-verdict. The unresolved write paths below justify withholding "high" on the end-to-end verdict.

## (3) Rejected claims

- **R1:** disposition-router's 503 "is the only code path that moves a lead to a stage from a call outcome." Rejected as stated: `CallLifecycleReference.tsx:148–151` documents a Retell webhook that "also directly updates pipeline position" (outcome → stage → upsert), and live_coach :316–345 defines a coach-decide service-role move RPC. Neither is verified live, but "only" is unsupported.
- **R3:** "any automated disposition routing, backend stage management, and lifecycle movement is halted behind these two 503 circuit-breakers." The "any" is rejected for the same reason — two documented write paths sit outside those gates. (Minor: R3 says "truncate"; it's a DELETE, same all-rows effect.)

## (4) What none of them checked

- The **Retell webhook handler itself** — does it upsert `lead_pipeline_positions`? In-repo docs conflict: `CallLifecycleReference.tsx:148–151` says yes; the disposition-router comment (:85–88) says the webhook persists call/lead outcome and DNC "without this legacy automation layer" and omits pipeline.
- Whether the **coach-decide / live_coach RPC** is invoked by any live code path.
- Any **frontend write path**: drag-and-drop in the Kanban, the insert call behind board-creation payloads, whether any component invokes `pipeline-management` at all, and what feeds the Kanban's props.
- **RLS policy bodies** after phase1_org_scope (:65–114) — whether direct client writes would even succeed.
- `leads` schema for status/next_callback_at (only code references seen); what the `20251214221955` UPDATE (:84) does; whether migration replay is possible in the deployed environment.

## (5) Confidence

**Medium** — high on the gates, the table, and the destructive DELETE (all directly evidenced); medium on the "cannot run a pipeline" verdict because two ungated write paths (Retell webhook, coach-decide) are documented but unverified. **Single most valuable next check:** grep all non-gated code (Retell webhook handler, coach-decide callers, frontend) for writes to `lead_pipeline_positions` — if any exists, automated movement survives the 503s and the verdict softens; if none, it's confirmed.
