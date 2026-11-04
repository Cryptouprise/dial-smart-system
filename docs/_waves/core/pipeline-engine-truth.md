# How does a lead actually move through a pipeline?

lane: pipeline-engine-truth  model: deepseek/deepseek-v4.1-flash  cost: $0.0073
tokens: 16921 in / 4000 out
files: supabase/functions/pipeline-management/index.ts, supabase/functions/disposition-router/index.ts

---

## What a pipeline is today

**Data model.** `lead_pipeline_positions` was created in `20251103034801_...sql:72`, with RLS enabled (`:86`), four policies (`:90–102`) and three indexes (`:120–122`). Migration `20260105225115_...sql:36–43` then added the unique constraint `lead_pipeline_positions_lead_user_unique` — **one position per (lead, user)**, so a lead can sit in exactly one board at a time. `20261029142121_phase1_org_scope.sql:5` records that `pipeline_boards`/`lead_pipeline_positions` had *no* `organization_id`; the migration adds it (`:11`), indexes it (`:15`) and backfills it (`:44`).

**Writers — both disabled.** Two functions ever write positions, and both are gated off by hard-coded flags returning `false`:

- `pipeline-management/index.ts:10–12` `isPipelineManagementTenantCertified()` → `false`; `:19–24` returns **503 `PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED`**. All eight actions (`get_dispositions`, `get_pipeline_boards`, `get_lead_positions`, `create_disposition`, `create_pipeline_board`, `move_lead_to_pipeline`, `check_dispositions_exist`, `insert_default_dispositions` — `:73–176`) are unreachable. Note the pre-existing design flaws behind the gate: it uses the service-role key (`:34`), and unauthenticated callers get `{success: true, data: []}` (`:54–65`) rather than an error.
- `disposition-router/index.ts:76–78` `isDispositionAutomationTenantCertified()` → `false`; `:89–99` returns **503 `DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED`**. The comment at `:85–88` says the signed Retell webhook now persists call/lead outcome and DNC *without* this legacy automation layer — i.e. pipeline effects are not in the fallback.

**What that disables inside disposition-router.** Step 5, "BULLETPROOF: Update lead pipeline position based on disposition" (`:434–500`): resolves `dispositions.pipeline_stage` → name → normalization table (`:454–468`) → `ensurePipelineBoardLocal` (`:478`, which auto-creates boards at `:844–869`) → `upsert` into `lead_pipeline_positions` with `onConflict: 'lead_id,user_id'` (`:481–489`). The `move_to_stage` auto-action does the same (`:619–636`). Both are behind the 503.

**`leads.status` and `next_callback_at`.** `status` is read for before/after metrics (`:238–242`, `:512–516`) and written to `'dnc'` (`:328`), to the normalized disposition (`:369–373`), and to `'callback'` together with `next_callback_at` in the `schedule_callback` action (`:713–716`). Every one of those writes is downstream of the 503 guard. I saw no schema/migration excerpt defining `next_callback_at` — I did not verify its column definition.

**UI.** The board is `EnhancedPipelineKanban.tsx`: columns are built by filtering positions per `pipeline_board_id` (`:85`), with a board picker, metrics (conversion rate, velocity, active boards — `:66–93`, `:337–376`) and a create-stage form (`:124`, `:132`). `AIPipelineManager.tsx:102` loads `pipeline_boards` and `:128` selects `*, lead_pipeline_positions(pipeline_board_id)`, falling back to hard-coded demo pipelines if the table is missing (`:110–114`). `EnhancedPipelineAnalytics.tsx:284`, `CallSimulator.tsx:512–533` and `DashboardSidebar.tsx:119` read/render the same data. `CallLifecycleReference.tsx:137,148–151` documents the intended flow ("Maps disposition → pipeline stage name", "Upserts lead_pipeline_positions").

## The full-table DELETE

`supabase/migrations/20260407220336_3e4797af-a7ee-4cbf-a792-b93f4b20021a.sql:1` is exactly:

```
DELETE FROM lead_pipeline_positions;
```

Unconditional. No `WHERE`, no tenant scope, no restore/backup step, no guard. **Yes — replaying it destroys live pipeline data for every tenant**, and it is non-idempotent in the destructive direction: any fresh `supabase db reset`, new-environment bootstrap, or manual re-application deletes all positions while leaving `pipeline_boards` intact. RLS does not mitigate this; migrations run as an elevated role. The unique constraint added earlier does not mitigate it either. It appears to have been a one-time "clear stale positions" statement that was never removed from the migration set.

Separately, `20261029180000_live_coach.sql:316` also does `DELETE FROM public.lead_pipeline_positions AS p` in a delete+insert move RPC (`:320–345`, comment at `:345` says "Atomic company-scoped move ... service_role only"). **I did not check its `WHERE`/`organization_id` predicate** — the alias form suggests it is scoped, but I cannot confirm.

## Could a customer run a pipeline without GoHighLevel?

**No.** Both writers into `lead_pipeline_positions` return 503 before touching the database, so nothing moves a lead between stages and the board can only ever show what was written before the gates were flipped.

The **first thing that stops them** is the certification gate: `isPipelineManagementTenantCertified()` returning a literal `false` (`pipeline-management/index.ts:10–12`), which 503s `move_lead_to_pipeline` and `create_pipeline_board` (`:19–24`). The equivalent gate in `disposition-router/index.ts:76–78` blocks the disposition→stage automation that would have fed the board in normal operation.

Caveats on that answer: (a) `CallLifecycleReference.tsx:148` claims the Retell webhook "also directly updates pipeline position" — that is a UI doc string, not code, and I have no webhook source, so a surviving write path is possible; (b) the supplied grep shows the UI reading these tables directly, and no supplied hit shows a client invoking `pipeline-management`, so the edge function may be dead for the product regardless of the gate; (c) `GHLFieldMappingTab.tsx:369–449` and `CallLifecycleReference.tsx:177` imply GHL is where pipeline stages are actually synced today — consistent with the premise, but I have not read that integration.

## Not checked

No webhook/call-outcome handler code; no `leads` schema defining `status`/`next_callback_at`; no RLS policy bodies (`20251103034801:90–102` shown only as declaration lines); no client invocation sites for `pipeline-management`; no `WHERE` clause for the `live_coach` DELETE; no `GHLFieldMappingTab.tsx` or calendar/GHL sync implementation.

**Confidence: medium-high** — the gate flags, the writers, and the
