# How does a lead actually move through a pipeline? - reviewer qwen/qwen3.8-flash

cost: $0.0061

---

FACT — data layer:
- `lead_pipeline_positions` was created with RLS enabled and SELECT/INSERT/UPDATE/DELETE policies plus indexes on `user_id`, `lead_id`, `pipeline_board_id`: `supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:71-122`.
- A unique constraint on `(lead_id, user_id)` was added: `supabase/migrations/20260105225115_57cc83f0-107a-4bba-89b3-b110cb2c8828.sql:36-43`.
- `organization_id` was later added/backfilled for org scoping: `supabase/migrations/20261029142121_phase1_org_scope.sql:5,11,15,44`.

FACT — intended native pipeline behavior:
- `pipeline-management` was meant to list boards, list positions, create boards/dispositions, and move leads by upserting `lead_pipeline_positions`: `supabase/functions/pipeline-management/index.ts:81-108,124-151`.
- `disposition-router` was meant to auto-move leads into pipeline boards from dispositions, using `ensurePipelineBoardLocal` and upserting `lead_pipeline_positions` on conflict `(lead_id,user_id)`: `supabase/functions/disposition-router/index.ts:434-500,793-870`.
- It also was meant to update `leads.status` for DNC/remove-all dispositions and set `leads.next_callback_at` plus `status='callback'` for scheduled callbacks: `supabase/functions/disposition-router/index.ts:326-329,367-373,710-717`.

FACT — current runtime state:
- `pipeline-management` is hard-disabled: `isPipelineManagementTenantCertified()` returns `false`, causing every request to return 503 `PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED`: `supabase/functions/pipeline-management/index.ts:10-12,19-24`.
- `disposition-router` is hard-disabled: `isDispositionAutomationTenantCertified()` returns `false`, causing every request to return 503 `DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED`: `supabase/functions/disposition-router/index.ts:76-78,85-99`.

FACT — UI:
- A pipeline board UI exists: `EnhancedPipelineKanban` consumes `pipelineBoards` and `leadPositions`, filters boards by campaign, groups positions, and shows pipeline metrics/empty states: `src/components/EnhancedPipelineKanban.tsx:30,61-93,296-376,581-584`.
- `AIPipelineManager` queries `pipeline_boards` and leads with `lead_pipeline_positions`, and falls back to demo pipelines if loading fails: `src/components/AIPipelineManager.tsx:78-143`.
- Product documentation/UI references say Pipeline Manager cards move by disposition and GHL also updates pipeline stages: `src/components/CallLifecycleReference.tsx:130-151,177,227`; `src/components/GHLFieldMappingTab.tsx:369-372,447-449`.

ANSWER — can a customer run a sales pipeline without GoHighLevel?
- THEORY / plain answer: Not reliably as a supported native pipeline today. The native tables and Kanban UI exist, but the authoritative pipeline-management API is disabled, and disposition-driven automatic pipeline movement is also disabled.
- FACT — first thing that stops them: `pipeline-management` returns 503 because `isPipelineManagementTenantCertified()` is hard-coded `false`: `supabase/functions/pipeline-management/index.ts:10-12,19-24`.
- FACT — second blocker: `disposition-router` returns 503 because `isDispositionAutomationTenantCertified()` is hard-coded `false`: `supabase/functions/disposition-router/index.ts:76-78,85-99`.

FACT — dangerous full-table DELETE migration:
- `supabase/migrations/20260407220336_3e4797af-a7ee-4cbf-a792-b93f4b20021a.sql:1` contains exactly: `DELETE FROM lead_pipeline_positions;`.
- It has no `WHERE`, no org/user filter, and no visible transactional guard in the supplied excerpt.
- FACT: Replaying that statement against a live database would delete every row in `lead_pipeline_positions`, destroying all live lead pipeline positions.
- FACT: A later live-coach migration also deletes/inserts `lead_pipeline_positions` as part of an atomic company-scoped move: `supabase/migrations/20261029180000_live_coach.sql:316,320,345`; the dangerous full-table wipe is the separate 2026-04-07 migration above.

NOT CHECKED:
- Full RLS policy predicates for `lead_pipeline_positions`.
- Whether the Kanban/AIPipeline UIs call the disabled edge functions or query Supabase directly.
- Whether direct client reads/writes would succeed under current RLS.
- Full `leads` schema definition for `status` and `next_callback_at`; only code references were checked.
- Whether migration replay is possible in the deployed environment.

Confidence: medium.
