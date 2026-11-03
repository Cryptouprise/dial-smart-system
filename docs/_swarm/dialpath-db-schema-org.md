# dialpath-db-schema-org

- status: completed
- tldr: Dispatcher filters phone_numbers by user_id AND organization_id, so a fresh org gets zero numbers; no platform pool, no seed, no signup provisioning.

Node dialpath-db-schema-org DONE. Root cause confirmed: the dispatcher filters phone_numbers by BOTH user_id AND organization_id (call-dispatcher/index.ts:1170-1177, 1199-1205, 1270-1274), so a fresh org scores ZERO dialable numbers and the campaign halts with 'no_numbers_available' (index.ts:1314-1348). There is no platform-level pool to rescue it: phone_numbers.organization_id is NOT NULL (phase1_org_scope.sql:124 etc.), each number is owned by one (org,user) via FK (multi_organization_routing_contract.sql:168-172) and number is globally UNIQUE (provider_resource_ownership_boundary.sql:108-110). No org-provisioning trigger and no seed number exist: only a default-org + membership backfill (phase2_organizations.sql:184-217); grep found zero 'INSERT INTO phone_numbers' and zero auth.users triggers. Provider tables (phone_providers, provider_numbers, number_orders) are user-scoped, never org-scoped. Provider-side Retell fallback only fires if isAutomaticRetellNumberSyncCertified() is true and still syncs under the current user+org.

## Artifact

**Findings**

PHONE-NUMBER/TENANT SCHEMA (ranked):

[CRITICAL] 1. Fresh org sees ZERO dialable numbers because the dispatcher filters phone_numbers by BOTH user_id AND organization_id. supabase/functions/call-dispatcher/index.ts:1170-1177 (Retell: .eq('user_id', user.id).eq('organization_id', organizationId).eq('status','active').eq('rotation_enabled',true).not('retell_phone_id','is',null)); :1199-1205 (Telnyx: same .eq user_id + organization_id, provider='telnyx'); :1270-1274 (Retell-sync fallback: .eq('user_id', user.id).eq('organization_id', organizationId)). When availableNumbers stays empty the dispatcher logs 'no_numbers_available' and returns success:false (index.ts:1314-1348), so campaigns silently stall.

[CRITICAL/HIGH] 2. There is NO platform-level shared phone pool that could save a fresh org. phone_numbers.organization_id is NOT NULL (20260108_phase2_add_org_to_core_tables.sql:120-127; re-asserted 20260712070000_multi_organization_routing_contract.sql:146-153; final 20261029142121_phase1_org_scope.sql:124). Each row is owned by exactly one (organization_id,user_id): FK (organization_id,user_id)->organization_users (multi_organization_routing_contract.sql:168-172) and number is globally UNIQUE (20260713072000_provider_resource_ownership_boundary.sql:108-110). A number cannot be shared across orgs, so a 'pool' is necessarily per-org/per-user.

[HIGH] 3. No org-provisioning that creates numbers on signup, and no seed number. The only seeding is a 'default-org' organization + membership backfill for EXISTING users (20260108_phase2_organizations.sql:184-217; duplicated 20260109034232...sql:126-147). No INSERT INTO phone_numbers / provider_numbers anywhere in migrations (grep: 0 matches). No trigger on auth.users (grep: 0 matches). A brand-new user therefore starts with zero numbers.

[MEDIUM] 4. Org creation is client-side and provisions nothing: organizations has an INSERT policy 'Authenticated users can create organizations' WITH CHECK (auth.uid() IS NOT NULL) and organization_users self-insert as owner (20260109034232...sql:91-94, 102-108). Nothing attaches numbers or pools at creation.

[MEDIUM] 5. Retell fallback can still be empty: the sync fallback fires only when isAutomaticRetellNumberSyncCertified() && availableNumbers.length===0 && hasRetellCampaign (call-dispatcher/index.ts:1265-1269), and it syncs under the current user+org only. If the auto-sync flag is false or the Retell account has no numbers, the fresh org still gets nothing.

[MEDIUM] 6. Provider-side tables are USER-scoped, never org-scoped: phone_providers (20251201000000_multi_carrier_integration.sql:10-22, RLS auth.uid()=user_id :28-42; redefined 20251211041547...sql:57-77), provider_numbers (same file :47-81, no organization_id added by any later migration - grep 0), number_orders (20250619152448...sql:27-38, RLS :92-94). So even 'buy a number' flows are per-user, not per-org.

[LOW/INFO] 7. phone_numbers RLS is tenant-read-only for browser roles (provider_resource_ownership_boundary.sql:253-257) with all INSERT/UPDATE/DELETE revoked from authenticated and granted to service_role (:239-268); full schema at certification/recovery-lineage-v14/migrations/20260712000000_live_public_schema_baseline.sql:4680-4723 (number, area_code, status default 'active', rotation_enabled default true, max_daily_calls default 100 all NOT NULL/defaulted; user_id NOT NULL).

**evidence**

- supabase/functions/call-dispatcher/index.ts:1170-1177
- supabase/functions/call-dispatcher/index.ts:1199-1205
- supabase/functions/call-dispatcher/index.ts:1270-1274
- supabase/functions/call-dispatcher/index.ts:1314-1348
- supabase/migrations/20261029142121_phase1_org_scope.sql:121-124
- supabase/migrations/20260712070000_multi_organization_routing_contract.sql:146-153
- supabase/migrations/20260712070000_multi_organization_routing_contract.sql:168-172
- supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:108-110
- supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:253-268
- supabase/migrations/20260108_phase2_organizations.sql:184-217
- supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:91-108
- supabase/migrations/20251201000000_multi_carrier_integration.sql:10-81
- supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:27-38
- certification/recovery-lineage-v14/migrations/20260712000000_live_public_schema_baseline.sql:4680-4723

**validation**

Static source/migration inspection only (no live DB). Ran findstr/agentgrep across supabase/migrations/*.sql, certification/*/migrations/*.sql and supabase/functions/**/*.ts. Confirmed: (a) dispatcher phone_numbers queries carry .eq('organization_id', organizationId) at 3 call sites; (b) phone_numbers.organization_id SET NOT NULL in 3 migrations; (c) no 'INSERT INTO phone_numbers' and no trigger on auth.users exist in migrations (both greps returned 0 matches); (d) provider_numbers/phone_providers have no organization_id column in any migration.

**open_questions**

- Do any service_role edge functions (retell-phone-management, telnyx/twilio purchase + webhook sync) auto-assign a newly purchased/imported number to a new organization, and what userId/orgId do they stamp?
- What does isAutomaticRetellNumberSyncCertified() actually return in the deployed build (does the fallback path run at all)?
- Is there an operator runbook/console action that manually attaches numbers to a fresh org (outside SQL migrations)?

**what_i_did_not_check**

- Service-role edge functions that INSERT/UPDATE phone_numbers (retell-phone-management, telnyx-management, twilio number purchase, webhooks) - not opened for writes/auto-assignment to new orgs
- supabase/functions-live/** deployed copies (only functions/ inspected for the dispatcher logic)
- certification/recovery-lineage-v10..v13 baselines (only v14 read for the phone_numbers DDL)
- Actual live database state (withheld: no DB credentials used; findings are from migration DDL, not the running schema)
- RLS policies on provider_numbers/phone_providers in migrations later than 20251211041547 (none matched by grep but not exhaustively verified)
- Frontend/src flows that create an org + attach numbers (src/** org creation UI not traced)

**confidence**: high