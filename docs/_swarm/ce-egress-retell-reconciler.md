# ce-egress-retell-reconciler

- status: completed
- tldr: Both pipeline edge fns hard-503 (dead); board empty; only live mover is coach-decide->coach_move_stage; migration 20260407220336:1 does an unconditional DELETE. No pipeline without GHL.

PIPELINE TRUTH (research only, no changes). Repo: C:\Users\charl\dial-smart-system. Digest read first, then verified in-repo.

WHAT A PIPELINE IS TODAY: per-user Kanban over 3 tables. lead_pipeline_positions (CREATE 20251103034801:72-83, UNIQUE(lead_id,pipeline_board_id):82, RLS:86) links a lead to a pipeline_board (a stage); pipeline_boards CREATE :39-49; 20260105225115:36-48 adds UNIQUE(lead_id,user_id) (one position per lead per user); 20260407215815:2-3 adds pipeline_boards.campaign_id; 20261029142121:11,15,44,65,77,114 adds organization_id + backfill + company policies + tenant_scope_guard to both tables.

DANGEROUS DELETE (CONFIRMED): 20260407220336_3e4797af:1 is exactly `DELETE FROM lead_pipeline_positions;` - unconditional, no WHERE/tenant scope/guard. Replaying it (db reset/new env) wipes all pipeline data for every tenant. The other DELETE (20261029180000:316-318, coach_move_stage) IS scoped by lead+org - safe.

STUBBED/BROKEN: both pipeline edge functions are hard 503-disabled. pipeline-management/index.ts:10-12 return false, :19-24 503 PIPELINE_MANAGEMENT_NOT_TENANT_CERTIFIED -> all 8 actions dead (move_lead_to_pipeline :138-151, create_pipeline_board :124-136, reads :73-108). disposition-router/index.ts:76-78 return false, :89-99 503 DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED -> pipeline step 5 (:434-500), move_to_stage (:619-636), board auto-create (:795-869), schedule_callback (:710-718) all dead. Board UI (Dashboard.tsx:440, :467) reads/writes ONLY via usePipelineManagement->invoke('pipeline-management') (:58) so it renders empty and drag/add-stage fail (:146-153, :116-144). A browser writer exists (useDispositionAutomation.ts:207-217 upsert) but processDisposition has 0 invocations (dead code). ONLY LIVE WRITER: coach-decide/index.ts (:247 'There is NO 503 certification gate live') routeStage :344-360 -> rpc coach_move_stage (service_role, scoped delete+insert 20261029180000:316-326), wired in CallWorkspace/CoachPanel.

leads.status exists (types.ts:4661); next_callback_at exists in DB (types.ts:4748) but has ZERO matches in supabase/migrations (live/baseline-only column).

ANSWER: NO - a customer cannot run a sales pipeline without GHL today. The manual board is fully non-functional (read+write through the 503 fn; the disposition automation that fed it is 503'd); the only surviving write is a single AI-coach 'accept stage' move, not an operator-run pipeline. Config: pipeline-management verify_jwt=true (config.toml:163), disposition-router verify_jwt=false (:215), both launch-quarantined (:161-162,:213-214).

Validation: read both functions in full + 7 migrations + hook + board UI + coach-decide; grepped src for writers/mounts/processDisposition; confirmed columns in types.ts and config.toml. Confidence: high (core), medium (coach-flow reachability, GHL sync). Blockers/follow-ups: no live DB access (application state unverified); GHL stage-sync and CallWorkspace mount not traced.
