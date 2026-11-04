# How does a lead actually move through a pipeline? - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0031

---

## What the pipeline machinery is

**Table.** `lead_pipeline_positions` is created in `supabase/migrations/20251103034801_...sql:72`, with RLS enabled (:86), four policies (:90–102), and indexes on user_id/lead_id/pipeline_board_id (:120–122). A later migration adds a unique constraint `lead_pipeline_positions_lead_user_unique` (:36–43) — one row per lead per user, which matches the `onConflict: 'lead_id,user_id'` upserts in disposition-router (`disposition-router/index.ts:489,629`). Consequence: a lead occupies exactly one board at a time; this is a single-funnel stage field, not multi-pipeline membership.

**Reads/writes split across two gated functions.**
- `pipeline-management` does the CRUD surface (`get_pipeline_boards` :81–97, `get_lead_positions` :99–108, `create_pipeline_board` :124–136, `move_lead_to_pipeline` :138–151) — but it is hard-disabled: `isPipelineManagementTenantCertified()` returns `false` (:10–12) and the handler returns HTTP 503 `PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED` before any DB work (:19–24). Every action above is unreachable.
- `disposition-router` is the automatic mover: step 5 maps a disposition to a stage, auto-creates the board via `ensurePipelineBoardLocal`, and upserts the position (:434–500, helper :795–870). It is also hard-disabled: `isDispositionAutomationTenantCertified()` returns `false` (:76–78) and the handler returns 503 `DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED` (:89–99), with the comment that pipeline effects are "still keyed by user rather than an explicit organization" (:86–88). So are `move_to_stage` (:619–636), `schedule_callback` (:710–718) and the remove/status writes (:336–376).

**`leads.status` / `leads.next_callback_at`.** The only writers in the supplied evidence are inside that gated function: `schedule_callback` sets `next_callback_at = now + delay_hours` (default 24) and `status='callback'` (:710–718); the remove-all branch sets `status = normalizedDisposition` (:367–373); DNC sets `status='dnc'` (:326–329). All unreachable today.

**UI.** `EnhancedPipelineKanban.tsx` is the board (props `pipelineBoards, leadPositions` :30; column grouping :85; empty state :581). `AIPipelineManager.tsx` loads `pipeline_boards` (:102) and `leads` with `lead_pipeline_positions(pipeline_board_id)` (:128,142–143), and falls back to hard-coded demo boards if the table is missing (:110–114). Navigation exists (`DashboardSidebar.tsx:119`, `Dashboard.tsx:438–439`). These components query Supabase directly, not the disabled edge function — but nothing in the supplied excerpts shows a working drag/write handler, so whether manual card movement writes rows is **not verified here**. `GHLFieldMappingTab.tsx:369,447–449` shows a separate GoHighLevel pipeline-mapping path, and `CallLifecycleReference.tsx:177` describes GHL as the thing that "updates tags, pipeline stages, contact fields."

## The full-table DELETE

`supabase/migrations/20260407220336_3e4797af-a7ee-4cbf-a792-b93f4b20021a.sql:1` is exactly `DELETE FROM lead_pipeline_positions;` — no `WHERE`, no tenant scope, no guard. On a replay (fresh environment, or `supabase db reset` walking the chain) it re-executes and deletes **every row for every tenant**. Nothing in the supplied evidence re-seeds those rows. So: replaying it destroys live pipeline state. (I can only see line 1, so I cannot say whether the file contains compensating statements after it — the grep matched only that line.) The later `20261029180000_live_coach.sql:316–320` does a scoped delete+insert described as "Atomic company-scoped move of a lead to a pipeline board" (:345), which is the *fixed* pattern — but it moves one lead, and restores nothing this migration erased.

## Verdict

**No — a customer cannot run a sales pipeline without GoHighLevel.** The first thing that stops them is the certification gate in `pipeline-management`: a blanket `503 PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED` at `supabase/functions/pipeline-management/index.ts:19–24`. Even if that were opened, the second stop is `disposition-router`'s `503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED` (:89–99), which is the only code path that moves a lead to a stage from a call outcome — so boards would render but stay static. Note `20261029142121_phase1_org_scope.sql` adds `organization_id` to the table (:11), indexes it (:15) and backfills it (:44), i.e. the org-binding work these gates demand is partially in place; the gates themselves still return `false` in the supplied code.

## Not checked

Board-creation inserts from the UI (only payload construction is visible), any RLS policy bodies in the org-scope migration (:65–114 arrays), the `live_coach` move RPC's body, the full contents of migration `20260407220336` beyond line 1, and any non-supplied frontend drag handler.

**Confidence: high** on the 503 gates and the destructive DELETE; **medium** on the end-to-end product verdict, since UI-level writes are inferred rather than shown.
