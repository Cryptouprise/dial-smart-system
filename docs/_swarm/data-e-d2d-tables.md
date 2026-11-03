# data-e-d2d-tables

- status: completed
- tldr: 9 d2d_ tables, 36 RLS policies confirmed; matches newest contract with 6 deviations (CASCADE vs RESTRICT, dead updated_at, missing sync/zip indexes).

Lane (e) d2d_* table conventions review complete. 9 d2d_ tables confirmed (3 core + 6 workspace; members migration is function-only). 36 RLS policies confirmed. d2d follows the NEWEST contract (20261029 phase1_org_scope) closely; deviations are ON DELETE CASCADE vs RESTRICT, no set_organization_from_user default-fill trigger, dead updated_at on messages/api_keys/webhooks, missing index on (organization_id, updated_at) for the primary property-sync query, no zip index, d2d_knocks.user_id CASCADE, and an ON CONFLICT DO NOTHING with no conflict target.

## Artifact

**Findings**

FACT: exactly 9 d2d_ tables (not ~9): d2d_territories, d2d_properties, d2d_knocks (20261102234500_door_to_door_core.sql:15,29,76) + d2d_settings, d2d_positions, d2d_messages, d2d_appointments, d2d_api_keys, d2d_webhooks (20261103020000_door_to_door_workspace.sql:19,30,44,55,67,80). 20261103023000_door_to_door_members.sql adds NO table, only d2d_company_members().
FACT: app-map claim of 36 RLS policies on d2d tables (docs/dial-smart-app-map.md:131) is CORRECT: core 3x4 (core.sql:190-193 loop) = 12, workspace 6x4 (workspace.sql:131-134 loop) = 24.
FACT: every d2d table has organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE and created_at/updated_at timestamptz NOT NULL DEFAULT now(), except d2d_knocks (append-only: occurred_at/received_at, no updated_at) (core.sql:76-97).
FACT: every table enables RLS and creates the four org policies using the NEW single-arg helpers user_in_organization(organization_id)/is_org_admin(organization_id), identical to phase1_org_scope.sql:82-85 - the NEWEST contract, not 20260108 get_user_organizations(auth.uid()) nor 20260713* style.
FACT: every table also gets tenant_scope_guard BEFORE INSERT OR UPDATE -> enforce_organization_scope() (core.sql:194-195; workspace.sql:135-136), same as phase1.
DEVIATION 1 (FACT): organizations FK uses ON DELETE CASCADE; newest core/SMS tables chose ON DELETE RESTRICT (phase1_org_scope.sql:8-11; sms_per_organization.sql). Deleting an org silently wipes canvassing history.
DEVIATION 2 (FACT): no set_organization_from_user() default-fill trigger (phase1_org_scope.sql:47-69; sms). d2d relies on the client passing organization_id every insert (host.ts:719,1796,1856,1908); an insert missing it fails RLS instead of being auto-scoped.
DEVIATION 3 (FACT): d2d_messages, d2d_api_keys, d2d_webhooks declare updated_at (workspace.sql:52,77,87) but get NO d2d_touch_updated_at trigger (only settings/positions/appointments, workspace.sql:102-112) - those three updated_at columns are dead.
DEVIATION 4 (FACT, hot query): primary property sync orders by updated_at (host.ts:1655-1663) but d2d_properties has no (organization_id, updated_at) index (indexes at core.sql:67-73).
DEVIATION 5 (FACT, hot query): vendor/installer lookup filters (organization_id, zip) (host.ts:1394-1399) with no zip index.
NOTE (FACT): d2d_settings uses organization_id as PK (workspace.sql:20) - the one uuid-PK exception, intentional one-row-per-company.
NOTE (FACT): d2d_positions UNIQUE(organization_id,user_id) (workspace.sql:41) matched by the heartbeat upsert (host.ts:1856) - hot path covered.
NOTE (FACT): d2d_knocks.user_id NOT NULL ON DELETE CASCADE (core.sql:81) while messages/api_keys user refs use SET NULL (workspace.sql:48,49,59,70) - inconsistent retention.
THEORY (medium): d2d_knock_books_appointment uses 'ON CONFLICT DO NOTHING' with no conflict target and d2d_appointments has only a uuid PK (workspace.sql:56-57,151-154), so no conflict can occur: every status='appointment' knock inserts a NEW appointment row (possible duplicates on re-knock).

**evidence**

- core.sql:15,29,76 (tables); core.sql:17,31,78 (org FK CASCADE); core.sql:63 (deleted_at only on properties); core.sql:67-73 (property indexes); core.sql:98-100 (knock indexes); core.sql:105-121 (updated_at triggers); core.sql:124-175 (scope/apply triggers); core.sql:178-197 (RLS + tenant guard)
- workspace.sql:19,30,44,55,67,80 (tables); workspace.sql:20,32,46,57,69,82 (org FK CASCADE); workspace.sql:41 (positions unique); workspace.sql:52,77,87 (updated_at); workspace.sql:92-98 (indexes); workspace.sql:102-112 (touch triggers for 3 tables only); workspace.sql:116-138 (RLS + guard); workspace.sql:144-163 (appointment trigger)
- members.sql:8-40 (function only, no table)
- phase1_org_scope.sql:8-11 (RESTRICT), 47-69 (default-fill), 82-85 (canonical policies), 114-118 (guard)
- phase1_scope_guard_fix.sql:4 (enforce_organization_scope SECURITY INVOKER)
- sms_per_organization.sql sec.3 (RESTRICT + set_organization_from_user)
- 20260108_phase2_add_org_to_core_tables.sql:44-69 (legacy get_user_organizations policy style)
- 20260713043000_retell_automatic_reconciliation.sql:144-150 (July 'Users can view owned ...' policy style)
- host.ts:635,681,711,756,814,934,941,1245,1394,1468,1656,1672,1689,1746,1776,1795,1813,1836,1856,1870,1891,1906,1929,1957,2036
- packs.ts:15 (PACK_IDS includes door_to_door); docs/dial-smart-app-map.md:131 (36 RLS claim)

**validation**

Read all three d2d migrations in full plus the reference migrations (20260108 phase2, 20261029 phase1 + fix + sms) and a 20260713 sample. Counted 9 CREATE TABLE IF NOT EXISTS public.d2d_ occurrences and 8 textual CREATE POLICY lines (looped to 36 effective). Traced each host.ts query to a matching or absent DDL index. Verified app-map.md:131.

**open_questions**

- Was ON DELETE CASCADE vs RESTRICT a deliberate choice for d2d?
- Is the missing (organization_id, updated_at) index felt at current scale or only latent?
- Is the duplicate-appointment behaviour intended?
- Should d2d tables appear in the live-schema/certification gate?

**edge_cases_considered**

- append-only d2d_knocks has no updated_at (by design)
- d2d_settings uses org PK (by design)
- ON DELETE semantics differ per user reference
- offline replay idempotency via client_id

**what_i_did_not_check**

- No live DB introspection (information_schema/LIVE-SCHEMA.md); facts are from migration text assuming they were applied verbatim (core.sql:11-12 only asserts the core one was applied).
- Did not open src/integrations/supabase/types.ts to confirm the 6 workspace tables + d2d_company_members are absent from generated types (host.ts:47-54 asserts so).
- Did not read the vendored src/packs/door_to_door/app/scripts.js or markup.html.
- Did not locate the external API-pull edge function that would consume d2d_api_keys.prefix/token_hash (no index on those).
- Did not confirm whether these migrations are tracked in LIVE-SCHEMA.md or the certification gate.

**confidence**: high