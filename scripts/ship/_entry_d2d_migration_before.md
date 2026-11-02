## 2026-11-02 17:50 MDT (jcode) - P1731 T4 BEFORE: apply Door to Door core migration (pending)

- What: apply `supabase/migrations/20261102234500_door_to_door_core.sql` to the live Dial Smart project
  `emonjusymdripmkvtttc` with `python scripts/ship/run_migration.py <file> --apply`.
- What it does: creates three NEW, EMPTY tables - `d2d_territories`, `d2d_properties`, `d2d_knocks` - with
  org-scoped RLS (same helpers as `20261029142121_phase1_org_scope.sql`) plus triggers
  `d2d_touch_updated_at`, `d2d_scope_knock`, `d2d_apply_knock` and the `tenant_scope_guard` policy.
- Blast radius: additive DDL only. No existing table, row, policy or function is altered, dropped or
  rewritten. Nothing reads these tables until the new `d2d-knock-list` tab asks for them; every reader
  handles "table missing" with a friendly card.
- Pre-state: live DB confirmed to have NO d2d/knock/property tables (pack-tables query returned only
  `call_live_transcripts` and `coach_proposals`).
- Dry run: `run_migration.py --dry` (BEGIN ... ROLLBACK) returned HTTP 201 with no error, so the SQL
  parses and every referenced helper/policy exists live.
- Rollback: `DROP TABLE IF EXISTS d2d_knocks, d2d_properties, d2d_territories CASCADE;` (empty tables,
  so nothing is lost).
- Result: pending
