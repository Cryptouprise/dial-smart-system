## 2026-11-02 17:56 MDT (jcode) - P1731 T4 AFTER: Door to Door core migration applied + verified (SUCCESS)

- `python scripts/ship/run_migration.py supabase/migrations/20261102234500_door_to_door_core.sql --apply`
  returned `APPLY HTTP 201` and `RECORD HTTP 201`.
- Live now (read back with `scripts/ship/_q_d2d_verify.sql`): `d2d_knocks`, `d2d_properties`, `d2d_territories`
  all exist with `rls=true`; 12 policies (4 per table); 7 triggers
  (`d2d_scope_knock` + `d2d_apply_knock` + `tenant_scope_guard` on knocks, `d2d_touch_updated_at` +
  `tenant_scope_guard` on properties and territories); `20261102234500 door_to_door_core` is recorded in
  `supabase_migrations.schema_migrations`; 0 rows in all three tables; `d2d_properties` has 33 columns.
- Behaviour proved by three rolled-back smoke tests (`run_migration.py --dry`, nothing committed):
  - A `_smoke_d2d_a.sql`: logging a knock flips the property to `callback`, sets `last_knock_at`,
    `last_knock_by` and `callback_at`, and the knock's `client_id` is autofilled. (All true.)
  - B `_smoke_d2d_b.sql`: the per-company address index rejects a duplicate with
    `23505 ... d2d_properties_addr_idx`, and a same-address row with a different zip is allowed.
  - C `_smoke_d2d_c.sql`: a knock with a NULL `organization_id` adopts its property's company; a knock
    claiming another company is rejected with `42501 knock organization must match the property company`.
- Residue check after the smoke tests: 0/0/0 rows. Nothing outside the three new tables was touched.
- Also regenerated `src/integrations/supabase/types.ts` from the live schema (248 insertions, 0 deletions -
  only the three d2d tables) and switched `src/lib/d2dApi.ts` to the schema-checked client.
- Result: SUCCESS
