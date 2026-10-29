Assumption: where a table's original `CREATE TABLE` is not present in the provided migrations (e.g. `leads`, `campaigns`, `call_logs`, `phone_numbers`, `campaign_leads`, `profiles`), I report only the columns that the provided migrations explicitly add or reference, and list the rest as UNKNOWN.

### A. Tenancy model

**FACT — the model is mixed, and it is mid-migration from per-user to per-organization.**

- Two tenancy mechanisms exist side by side: a per-user `user_id` column on nearly every table, and a per-organization `organization_id` column added later.
- `organizations` is the tenant table: `id`, `name`, `slug` (unique), `settings`, `subscription_tier` (`basic`/`professional`/`enterprise`), `subscription_status` (`active`/`trial`/`suspended`/`cancelled`), `trial_ends_at`, `max_users`, `max_campaigns`, `max_phone_numbers`, `monthly_call_limit`, `owner_email`, `contact_phone`, `timezone`, `metadata`, `created_at`, `updated_at`, `deleted_at`, plus later `billing_enabled`, `stripe_customer_id`, `billing_email` (supabase/migrations/20260108_phase2_organizations.sql:9-41; supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:2-16; supabase/migrations/20260124_white_label_credits.sql:15-17).
- `organization_users` is the membership junction: `id`, `organization_id` (FK → organizations, ON DELETE CASCADE), `user_id` (FK → auth.users, ON DELETE CASCADE), `role` TEXT CHECK IN (`owner`,`admin`,`manager`,`member`), `joined_at`, `created_at`, UNIQUE(`organization_id`,`user_id`) (supabase/migrations/20260108_phase2_organizations.sql:53-65; supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:19-26).
- `user_roles` is a separate, older, global role table: `id`, `user_id` (FK → auth.users), `role app_role` where `app_role` ENUM is (`admin`,`manager`,`user`), `created_at`, `updated_at`, UNIQUE(`user_id`,`role`) (supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:40-49). **This is a different role vocabulary from `organization_users.role`** — `user_roles` has no organization scope.
- Helper SQL functions used in RLS policies:
  - `has_role(_user_id UUID, _role app_role) RETURNS BOOLEAN` — checks `EXISTS (SELECT 1 FROM user_roles WHERE user_id=_user_id AND role=_role)`; `SECURITY DEFINER`, `SET search_path = public` (supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:65-74; re-created supabase/migrations/20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:22-31; supabase/migrations/20251103035810_06a50f99-8093-48a7-bc14-dd73a00b2244.sql:7-16).
  - `get_user_organizations(user_uuid UUID) RETURNS SETOF UUID` — `SELECT organization_id FROM organization_users WHERE user_id = user_uuid` (supabase/migrations/20260108_phase2_organizations.sql:76-84).
  - `user_in_organization(user_uuid UUID, org_uuid UUID) RETURNS BOOLEAN` — `EXISTS (... user_id=user_uuid AND organization_id=org_uuid)` (supabase/migrations/20260108_phase2_organizations.sql:87-98). **Note a later migration redefines a one-argument overload** `user_in_organization(org_id UUID)` that uses `auth.uid()` instead (supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:38-49), and the two-arg version is re-asserted with `SET search_path = ''` later (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:179-195).
  - `get_user_org_role(user_uuid UUID, org_uuid UUID) RETURNS TEXT` — returns the role row (supabase/migrations/20260108_phase2_organizations.sql:101-111); a one-arg overload also exists (supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:52-62).
  - `is_org_admin(user_uuid UUID, org_uuid UUID) RETURNS BOOLEAN` — `EXISTS (... role IN ('owner','admin'))` (supabase/migrations/20260108_phase2_organizations.sql:114-126); one-arg overload (supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:65-78).
  - `external_control_is_org_admin(org_uuid UUID)` — same check, `SET search_path = ''` (supabase/migrations/20260713130000_external_observer_control_plane.sql:467-481).
- **Core tables that carry `organization_id`** (FACT, from the Phase 2 migrations and later re-assertions): `campaigns`, `leads`, `phone_numbers`, `call_logs`, `voice_broadcasts`, `workflows`, `dispositions`, `dnc_list`, `ai_sms_settings`, `autonomous_settings`, `agent_scripts`, `calendar_integrations`, `follow_up_sequences`, `disposition_metrics`, `pipeline_boards` (supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:23-24,74-75,120-121,166-167,212-213,258-259,290-291; supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:20-21,50-51,80-81,105-106,140-141,175-176,210-211,238-239). Also `telnyx_assistants` (supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:10), `retell_agents` (supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:120-134), `api_keys` (supabase/migrations/20260409020305_api_keys.sql:8), `slack_users` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:639-640), `organization_credits`, `credit_transactions`, `usage_summaries` (supabase/migrations/20260124_white_label_credits.sql:29,94,157), `agent_pricing` (supabase/migrations/20260713070000_agent_pricing_schema_contract.sql:20), `campaign_contact_releases` (supabase/migrations/20260713150000_campaign_contact_release_gate.sql:8), `contact_stop_controls` (supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:13).
- **Core tables that only carry `user_id`** (FACT): `campaign_leads` has no `organization_id` column in any provided migration; its RLS is written against `campaigns.user_id` and `leads.user_id` (supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:158-201). `dialing_queues` has no `organization_id` column in any provided migration; its RLS is written against `campaigns.user_id` and `leads.user_id` (supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:140-153; supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:41-58). `sms_messages` and `sms_conversations` carry `user_id` only (supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:4,18). `dispositions` carries both (supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:8; supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:290-291).
- **INFERENCE:** the tenancy model is not uniform. A wholesaler tenant that shares leads across its staff will hit the `user_id = auth.uid()` clauses on `campaign_leads` and `dialing_queues` and on the INSERT/UPDATE/DELETE policies of `campaigns`, `leads`, `phone_numbers`, `call_logs` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:219-228,247-256,278-287,302-311), which means a manager cannot act on a colleague's lead even inside the same organization.
- **FACT — the final tenant contract is stricter than the Phase 2 one.** `campaigns`, `leads`, `phone_numbers`, `call_logs` get `organization_id` FK → `organizations(id) ON DELETE RESTRICT` and `SET NOT NULL`, plus a composite FK `(organization_id, user_id)` → `organization_users(organization_id, user_id) ON DELETE RESTRICT` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:138-177). A later migration re-adds `organization_id` with `ON DELETE SET NULL` on `leads`, `campaigns`, `phone_numbers` (supabase/migrations/20260720235049_7254d373-aa0b-4957-8543-b25a54c7b66f.sql:1-8) — **INFERENCE: this is a conflicting later definition; the `ON DELETE RESTRICT` composite FK from 20260712 is not dropped by 20260720, so the effective delete behavior is UNKNOWN and must be verified against the live DB.**

### B. Table cards

#### organizations
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| name | TEXT NOT NULL |
| slug | TEXT UNIQUE NOT NULL |
| settings | JSONB DEFAULT '{}' |
| subscription_tier | TEXT DEFAULT 'basic' CHECK IN (basic, professional, enterprise) |
| subscription_status | TEXT DEFAULT 'active' CHECK IN (active, trial, suspended, cancelled) |
| trial_ends_at | TIMESTAMPTZ |
| max_users | INTEGER DEFAULT 5 |
| max_campaigns | INTEGER DEFAULT 10 |
| max_phone_numbers | INTEGER DEFAULT 5 |
| monthly_call_limit | INTEGER DEFAULT 1000 |
| owner_email | TEXT |
| contact_phone | TEXT |
| timezone | TEXT DEFAULT 'America/Chicago' |
| metadata | JSONB DEFAULT '{}' |
| created_at | TIMESTAMPTZ DEFAULT now() |
| updated_at | TIMESTAMPTZ DEFAULT now() |
| deleted_at | TIMESTAMPTZ |
| billing_enabled | BOOLEAN DEFAULT false |
| stripe_customer_id | TEXT |
| billing_email | TEXT |

Keys: PK `id`; UNIQUE `slug`; CHECK `valid_slug` (`slug ~ '^[a-z0-9-]+$'`).
RLS: enabled. SELECT if `id IN (SELECT get_user_organizations(auth.uid()))`; UPDATE if `is_org_admin(auth.uid(), id)`; ALL if `auth.jwt()->>'role' = 'service_role'`. **Later replaced entirely** by: SELECT if `user_in_organization(auth.uid(), id)`; all other verbs revoked from `authenticated` (supabase/migrations/20260713065000_billing_ownership_boundary.sql:128-132,152).
Source: CREATE supabase/migrations/20260108_phase2_organizations.sql:9-41; re-CREATE IF NOT EXISTS supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:2-16; ALTER supabase/migrations/20260124_white_label_credits.sql:15-17; policy replacement supabase/migrations/20260713065000_billing_ownership_boundary.sql:84-155.

#### organization_users
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |
| user_id | UUID NOT NULL FK → auth.users(id) ON DELETE CASCADE |
| role | TEXT NOT NULL DEFAULT 'member' CHECK IN (owner, admin, manager, member) |
| joined_at | TIMESTAMPTZ DEFAULT now() |
| created_at | TIMESTAMPTZ DEFAULT now() |

Keys: PK `id`; UNIQUE(`organization_id`,`user_id`).
RLS: enabled. SELECT if `organization_id IN (SELECT get_user_organizations(auth.uid()))`; ALL if `is_org_admin(auth.uid(), organization_id)`; ALL if service_role. **Later replaced** by: SELECT if `user_in_organization(organization_id)`; INSERT if `is_org_admin(organization_id) OR (auth.uid()=user_id AND role='owner')`; UPDATE/DELETE if `is_org_admin(organization_id)` (supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:97-118).
Source: CREATE supabase/migrations/20260108_phase2_organizations.sql:53-65; re-CREATE supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:19-26.

#### user_roles
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK → auth.users(id) |
| role | app_role NOT NULL (ENUM: admin, manager, user) |
| created_at | TIMESTAMPTZ DEFAULT now() |
| updated_at | TIMESTAMPTZ DEFAULT now() |

Keys: PK `id`; UNIQUE(`user_id`,`role`).
RLS: enabled. SELECT if `auth.uid() = user_id`; ALL if `auth.jwt()->>'role' = 'service_role'`.
Source: CREATE supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:40-62.

#### profiles
UNKNOWN. No `CREATE TABLE profiles` appears in any provided migration. The file that would answer it is the baseline schema migration, which is not in the material.

#### leads
Final columns shown by the provided migrations (additive only; base columns UNKNOWN):
| column | type |
|---|---|
| organization_id | UUID (added, then SET NOT NULL + FK RESTRICT, then re-added with ON DELETE SET NULL) |
| address | TEXT |
| city | TEXT |
| state | TEXT |
| zip_code | TEXT |
| phone_number_normalized | TEXT |
| do_not_call | BOOLEAN (referenced by UPDATE, type not declared in material) |
| status | TEXT (referenced) |
| tags | (referenced by GIN index `idx_leads_tags ON leads USING GIN (tags)`) |
| lead_source | TEXT (referenced) |
| created_at | (referenced) |
| updated_at | (referenced) |
| user_id | UUID (referenced) |
| phone_number | TEXT (referenced) |

Keys: PK UNKNOWN (assumed `id`; referenced everywhere). UNIQUE INDEX `leads_phone_user_unique` on (`phone_number`,`user_id`) — first created as a partial index, then dropped and recreated as a full unique index (supabase/migrations/20260110000820_e90b17ad-eaea-49bd-8388-60215781e70b.sql:3-5; supabase/migrations/20260110004737_47f3c3df-546c-4ca5-af18-509f04afc696.sql:3-6). FK `organization_id` → organizations (RESTRICT per 20260712, SET NULL per 20260720 — conflict, see A).
RLS: enabled. Final policies: SELECT if `user_in_organization(auth.uid(), organization_id)`; INSERT if `user_id = auth.uid() AND user_in_organization(...)`; UPDATE/DELETE if `user_id = auth.uid() AND user_in_organization(...)`.
Source: ALTER supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:74-115; ALTER supabase/migrations/20251230143913_c3ece5f9-6e8c-42a8-907f-00e5e0738402.sql:2-5; ALTER supabase/migrations/20260712040000_sms_delivery_safety.sql:28-29; policy replacement supabase/migrations/20260712070000_multi_organization_routing_contract.sql:230-256; ALTER supabase/migrations/20260720235049_7254d373-aa0b-4957-8543-b25a54c7b66f.sql:1-2.

#### campaigns
Final columns shown (additive only; base columns UNKNOWN):
| column | type |
|---|---|
| organization_id | UUID (added, SET NOT NULL, FK RESTRICT; re-added SET NULL later) |
| workflow_id | UUID FK → campaign_workflows(id) ON DELETE SET NULL |
| retry_delay_minutes | INTEGER DEFAULT 300 → later DEFAULT 15 |
| max_calls_per_day | INTEGER DEFAULT 2 |
| sms_on_no_answer | BOOLEAN DEFAULT false |
| sms_template | TEXT |
| sms_from_number | TEXT |
| metadata | JSONB DEFAULT '{}' |
| provider | TEXT NOT NULL DEFAULT 'retell' |
| telnyx_assistant_id | UUID FK → telnyx_assistants(id) ON DELETE SET NULL |
| user_id | UUID (referenced) |
| status | TEXT (referenced) |
| agent_id | TEXT (referenced) |
| max_attempts | INTEGER (referenced) |
| updated_at | (referenced) |

Keys: PK UNKNOWN (assumed `id`). FK `organization_id` → organizations; composite FK `(organization_id, user_id)` → organization_users ON DELETE RESTRICT.
RLS: enabled. Final: SELECT if `user_in_organization(auth.uid(), organization_id)`; INSERT/UPDATE/DELETE if `user_id = auth.uid() AND user_in_organization(...)`.
Source: ALTER supabase/migrations/20251208035156_fd3f07ec-6c94-4b0d-b02c-3b1f57e8865a.sql:58-64; ALTER supabase/migrations/20251213222334_50f1c918-1096-4568-a74e-e495419b35e5.sql:2-3; ALTER supabase/migrations/20260409023224_0d64819e-dfe6-4dd3-abc8-b7c307dca436.sql:1; ALTER supabase/migrations/20260307224548_b712bfe3-9f43-4850-aca6-c164ab1a16fb.sql:1-4; ALTER supabase/migrations/20260409210001_a27c991e-6a74-477e-84d3-fee1536f84c6.sql:2-3; ALTER supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:23-69; policy replacement supabase/migrations/20260712070000_multi_organization_routing_contract.sql:202-228.

#### campaign_leads
Final columns shown: `campaign_id` UUID, `lead_id` UUID (both referenced; no CREATE in material). No `organization_id`, no `user_id` column of its own.
Keys: UNKNOWN (PK assumed `id`; composite unique not shown).
RLS: enabled. Final policies (from 20251103): SELECT if campaign owned by `auth.uid()`; INSERT if campaign owned AND lead owned; UPDATE/DELETE if campaign owned. A later BEFORE INSERT/UPDATE trigger `campaign_leads_same_tenant` enforces campaign and lead share identical `organization_id` and `user_id` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:462-497).
Source: policies supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:156-201; trigger supabase/migrations/20260712070000_multi_organization_routing_contract.sql:494-497.

#### dialing_queues
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| campaign_id | UUID NOT NULL FK → campaigns(id) ON DELETE CASCADE |
| lead_id | UUID NOT NULL FK → leads(id) ON DELETE CASCADE |
| phone_number | TEXT NOT NULL |
| priority | INTEGER NOT NULL DEFAULT 1 |
| status | TEXT NOT NULL DEFAULT 'pending' |
| scheduled_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| attempts | INTEGER NOT NULL DEFAULT 0 |
| max_attempts | INTEGER NOT NULL DEFAULT 3 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| notes | TEXT |
| last_provider | TEXT |
| last_provider_call_id | TEXT |
| last_attempted_at | TIMESTAMPTZ |
| dispatch_generation | UUID |

Keys: PK `id`; UNIQUE(`campaign_id`,`lead_id`) (supabase/migrations/20260105225115_57cc83f0-107a-4bba-89b3-b110cb2c8828.sql:22-34).
RLS: enabled. **Final state: all policies dropped, table and column privileges revoked from `PUBLIC, anon, authenticated`; only `GRANT SELECT` to `authenticated` with policy `Members view tenant dialing queues` (EXISTS campaign JOIN lead JOIN organization_users).** Mutations are service-role only via `enqueue_dialing_queue` / `cancel_dialing_queues`.
Source: CREATE supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:41-53; FK supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:118-124; policy supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:140-153; ALTER supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:139-143; ALTER supabase/migrations/20260703224351_unattended_safety_backstops.sql:19; final lockdown supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:7-61.

#### call_logs
Final columns shown (additive only; base columns UNKNOWN):
| column | type |
|---|---|
| organization_id | UUID (added, SET NOT NULL, FK RESTRICT) |
| amd_result | TEXT (CHECK human/machine/unknown added, then re-added without CHECK) |
| amd_confidence | DECIMAL(5,2) |
| amd_type | TEXT |
| transcript | TEXT |
| ai_analysis | JSONB |
| auto_disposition | TEXT |
| confidence_score | DECIMAL(3,2) |
| agent_id | TEXT |
| agent_name | TEXT |
| recording_url | TEXT |
| sentiment | TEXT |
| call_summary | TEXT |
| time_wasted_score | INTEGER DEFAULT 0 |
| time_wasted_reason | TEXT |
| opener_extracted | TEXT |
| opener_score | INTEGER |
| retell_cost_cents | INTEGER |
| billed_cost_cents | INTEGER |
| cost_breakdown | JSONB |
| token_usage | JSONB |
| credit_deducted | BOOLEAN NOT NULL DEFAULT false |
| provider | TEXT DEFAULT 'retell' |
| telnyx_call_control_id | TEXT |
| telnyx_call_session_id | TEXT |
| telnyx_conversation_id | TEXT |
| telnyx_assistant_id | TEXT |
| started_at | TIMESTAMPTZ |
| provider_reconciliation_required | BOOLEAN NOT NULL DEFAULT false |
| provider_reconciliation_reason | TEXT |
| provider_reconciliation_marked_at | TIMESTAMPTZ |
| provider_reconciled_at | TIMESTAMPTZ |
| provider_reconciliation_queue_id | UUID FK → dialing_queues(id) ON DELETE SET NULL |
| retell_call_id | TEXT (UNIQUE) |
| user_id | UUID (referenced) |
| campaign_id | UUID (referenced) |
| lead_id | UUID (referenced) |
| phone_number | TEXT (referenced) |
| caller_id | TEXT (referenced) |
| status | TEXT (referenced) |
| outcome | TEXT (CHECK list) |
| duration_seconds | INTEGER (referenced) |
| created_at | TIMESTAMPTZ (referenced) |

Keys: PK UNKNOWN (assumed `id`). UNIQUE `call_logs_retell_call_id_key` on `retell_call_id` (supabase/migrations/20251230004642_dfffa837-80d8-47b3-8528-848b47c9c080.sql:3-4). CHECK `call_logs_outcome_check` on `outcome` (supabase/migrations/20260105225115_57cc83f0-107a-4bba-89b3-b110cb2c8828.sql:2-20). FK `organization_id` → organizations RESTRICT; composite FK `(organization_id, user_id)` → organization_users RESTRICT.
RLS: enabled. **Final: all policies dropped; table and column privileges revoked from `PUBLIC, anon, authenticated`; `GRANT SELECT` to `authenticated` with policy `Members view their tenant call logs` (`user_in_organization(auth.uid(), organization_id)`); `REVOKE DELETE FROM service_role`; `GRANT SELECT, INSERT, UPDATE TO service_role`.**
Source: ALTERs supabase/migrations/20251109172000_advanced_dialer_features.sql:88-89; supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:56-57; supabase/migrations/20260109041709_a48a830e-bbc8-42b2-a107-bbe0879199fe.sql:2-10; supabase/migrations/20260118_script_analytics_enhancement.sql:64-68; supabase/migrations/20260124_white_label_credits.sql:213-217; supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:151-159; supabase/migrations/20260223_telnyx_voice_ai_platform.sql:195-201; supabase/migrations/20260416045704_86f46151-2e96-44e1-9708-8129cfabe7bb.sql:3-6; supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:181-186; supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:262-264; final lockdown supabase/migrations/20260713071000_call_log_evidence_boundary.sql:6-48.

#### phone_numbers
Final columns shown (additive only; base columns UNKNOWN):
| column | type |
|---|---|
| user_id | UUID NOT NULL FK → auth.users(id) |
| organization_id | UUID (added, SET NOT NULL, FK RESTRICT; re-added SET NULL later) |
| retell_phone_id | TEXT |
| stir_shaken_attestation | TEXT CHECK IN (A,B,C,not_verified) |
| line_type | TEXT |
| carrier_name | TEXT |
| caller_name | TEXT |
| is_voip | BOOLEAN DEFAULT false |
| external_spam_score | INTEGER DEFAULT 0 |
| last_lookup_at | TIMESTAMPTZ |
| friendly_name | TEXT |
| provider | TEXT DEFAULT 'twilio' CHECK IN (twilio, telnyx, retell_native, other) |
| purpose | TEXT DEFAULT 'general_rotation' CHECK IN (broadcast, retell_agent, follow_up_dedicated, general_rotation, sms_only) |
| sip_trunk_provider | TEXT |
| sip_trunk_config | JSONB DEFAULT '{}' |
| is_stationary | BOOLEAN DEFAULT false |
| rotation_enabled | BOOLEAN DEFAULT true |
| max_daily_calls | INTEGER DEFAULT 100 |
| twilio_verified | BOOLEAN DEFAULT false |
| twilio_verified_at | TIMESTAMPTZ |
| twilio_sid | TEXT |
| capabilities | JSONB DEFAULT '{}' |
| call_direction | TEXT NOT NULL DEFAULT 'outbound' CHECK IN (inbound, outbound, both) |
| daily_calls | INTEGER (referenced) |
| last_call_at | TIMESTAMPTZ |
| status | TEXT (referenced) |
| number | TEXT (referenced) |
| quarantine_until | (referenced by UPDATE) |

Keys: PK UNKNOWN (assumed `id`). UNIQUE `phone_numbers_number_key` on `number`; UNIQUE INDEX `phone_numbers_retell_phone_id_unique` on `retell_phone_id` WHERE NOT NULL; UNIQUE INDEX `phone_numbers_twilio_sid_unique` on `twilio_sid` WHERE NOT NULL (supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:108-118).
RLS: enabled. **Final: all policies dropped; privileges revoked from `PUBLIC, anon, authenticated`; `GRANT SELECT` to `authenticated` with policy `Members view their tenant phone numbers` (`user_in_organization(auth.uid(), organization_id)`); full CRUD to `service_role`.**
Source: ALTER supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:7-36; supabase/migrations/20251106205513_0a9a0146-7076-4f51-92d3-7fc1da2eed93.sql:2-3; supabase/migrations/20251107211945_4d0fb7ea-9fe7-4117-a1fa-4df03d6c62c0.sql:2-9; supabase/migrations/20251208023834_29d62ad4-cb26-46ad-8173-075da85d4652.sql:2; supabase/migrations/20251211041547_a77f9fed-e2d1-4a9b-a8a5-ae14988c3723.sql:4-18; supabase/migrations/20260107014918_fc9552e5-d96d-4747-bff5-3c7965c5a346.sql:2-6; supabase/migrations/20260110214558_29ba45d1-9d7e-4c69-9191-3413b53a5579.sql:2-6; supabase/migrations/20260115000000_add_daily_calls_reset_functions.sql:63-64; supabase/migrations/20260304151620_2d55f970-00ee-4065-b697-3f2b539add74.sql:1; supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:120-161; final lockdown supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:15-16,211-268.

#### sms_messages
Final columns (the 20251201051159 CREATE wins because the earlier 20251201000000 CREATE is `IF NOT EXISTS` and the later one re-declares the same name; the later file's column set is what the material shows as final):
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL |
| conversation_id | UUID FK → sms_conversations(id) ON DELETE CASCADE |
| to_number | TEXT NOT NULL |
| from_number | TEXT NOT NULL |
| body | TEXT NOT NULL |
| direction | TEXT NOT NULL CHECK IN (inbound, outbound) |
| status | TEXT NOT NULL DEFAULT 'pending' CHECK IN (pending, queued, sending, sent, delivered, failed, received, acceptance_unknown, duplicate_suppressed) |
| provider_type | TEXT DEFAULT 'twilio' |
| provider_message_id | TEXT |
| lead_id | UUID FK → leads(id) ON DELETE SET NULL |
| is_ai_generated | BOOLEAN DEFAULT false |
| has_image | BOOLEAN DEFAULT false |
| image_url | TEXT |
| image_analysis | JSONB |
| is_reaction | BOOLEAN DEFAULT false |
| reaction_type | TEXT |
| error_message | TEXT |
| sent_at | TIMESTAMPTZ |
| delivered_at | TIMESTAMPTZ |
| read_at | TIMESTAMPTZ |
| metadata | JSONB DEFAULT '{}' |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Keys: PK `id`; FK `conversation_id`, `lead_id`.
RLS: enabled. SELECT/INSERT/UPDATE if `auth.uid() = user_id`. (No DELETE policy.)
Source: CREATE supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:16-40; status CHECK replaced supabase/migrations/20260712040000_sms_delivery_safety.sql:35-50.

#### sms_conversations
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL |
| contact_phone | TEXT NOT NULL |
| contact_name | TEXT |
| last_message_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| unread_count | INTEGER DEFAULT 0 |
| context_summary | TEXT |
| metadata | JSONB DEFAULT '{}' |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| last_from_number | TEXT |

Keys: PK `id`.
RLS: enabled. SELECT/INSERT/UPDATE/DELETE if `auth.uid() = user_id`.
Source: CREATE supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:2-13; ALTER supabase/migrations/20251208023834_29d62ad4-cb26-46ad-8173-075da85d4652.sql:5.

#### dnc_list
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK → auth.users(id) ON DELETE CASCADE |
| phone_number | TEXT NOT NULL |
| reason | TEXT |
| source | TEXT |
| added_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| expires_at | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ DEFAULT now() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |
| phone_number_normalized | TEXT NOT NULL |

Keys: PK `id`; UNIQUE `dnc_list_organization_phone_normalized_key` on (`organization_id`,`phone_number_normalized`). **All earlier uniqueness definitions on (`phone_number`,`user_id`) and (`phone_number_normalized`,`user_id`) are dropped.**
RLS: enabled. **Final: all policies dropped; privileges revoked from `PUBLIC, anon, authenticated`; `GRANT SELECT, INSERT` to `authenticated` with policies `Members view tenant DNC suppressions` and `Members add tenant DNC suppressions`; `REVOKE DELETE FROM service_role`; `GRANT SELECT, INSERT, UPDATE TO service_role`.** A BEFORE UPDATE OR DELETE trigger `dnc_suppression_identity_guard` raises on any delete and on any change to `organization_id`, `user_id`, `phone_number`, `phone_number_normalized`.
Source: CREATE supabase/migrations/20251109172000_advanced_dialer_features.sql:33-50; re-CREATE supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:45-52; ALTER supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:20-45; ALTER supabase/migrations/20260712040000_sms_delivery_safety.sql:31-33,105-132; uniqueness contract supabase/migrations/20260713062000_dnc_tenant_uniqueness_contract.sql:3-6,174-178; final lockdown supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:6-57.

#### dispositions
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK → auth.users(id) |
| name | TEXT NOT NULL |
| description | TEXT |
| color | TEXT NOT NULL DEFAULT '#3B82F6' |
| pipeline_stage | TEXT NOT NULL |
| auto_actions | JSONB DEFAULT '[]' |
| created_at | TIMESTAMPTZ DEFAULT now() |
| updated_at | TIMESTAMPTZ DEFAULT now() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |

Keys: PK `id`; FK `organization_id`.
RLS: enabled. Final: SELECT if `user_in_organization(auth.uid(), organization_id)`; INSERT if `user_id = auth.uid() AND user_in_organization(...)`; UPDATE/DELETE if `user_in_organization(...)`.
Source: CREATE supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:6-36; ALTER supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:290-331.

#### pipeline_boards
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK → auth.users(id) |
| name | TEXT NOT NULL |
| description | TEXT |
| disposition_id | UUID FK → dispositions(id) ON DELETE CASCADE |
| position | INTEGER NOT NULL DEFAULT 0 |
| settings | JSONB DEFAULT '{}' |
| created_at | TIMESTAMPTZ DEFAULT now() |
| updated_at | TIMESTAMPTZ DEFAULT now() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |
| campaign_id | UUID FK → campaigns(id) ON DELETE SET NULL |

Keys: PK `id`; FKs as listed.
RLS: enabled. Final: SELECT if `user_in_organization(auth.uid(), organization_id)`; INSERT if `user_id = auth.uid() AND user_in_organization(...)`; UPDATE/DELETE if `user_in_organization(...)`.
Source: CREATE supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:39-69; ALTER supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:238-268; ALTER supabase/migrations/20260407215815_84a3bd5a-8f48-4a56-9329-b75ee7c490a1.sql:2-3.

#### lead_pipeline_positions
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK → auth.users(id) |
| lead_id | UUID NOT NULL FK → leads(id) ON DELETE CASCADE |
| pipeline_board_id | UUID NOT NULL FK → pipeline_boards(id) ON DELETE CASCADE |
| position | INTEGER NOT NULL DEFAULT 0 |
| moved_at | TIMESTAMPTZ DEFAULT now() |
| moved_by_user | BOOLEAN DEFAULT true |
| notes | TEXT |
| created_at | TIMESTAMPTZ DEFAULT now() |

Keys: PK `id`; UNIQUE(`lead_id`,`pipeline_board_id`); later UNIQUE(`lead_id`,`user_id`) added (supabase/migrations/20260105225115_57cc83f0-107a-4bba-89b3-b110cb2c8828.sql:36-48).
RLS: enabled. SELECT/INSERT/UPDATE/DELETE if `auth.uid() = user_id`.
Source: CREATE supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:72-103.

#### api_keys
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID FK → organizations(id) ON DELETE CASCADE |
| user_id | UUID NOT NULL FK → auth.users(id) ON DELETE CASCADE |
| name | TEXT NOT NULL |
| key_prefix | TEXT NOT NULL |
| key_hash | TEXT NOT NULL UNIQUE |
| scopes | TEXT[] NOT NULL DEFAULT ARRAY['read'] |
| rate_limit_per_minute | INTEGER NOT NULL DEFAULT 120 |
| last_used_at | TIMESTAMPTZ |
| last_used_ip | TEXT |
| expires_at | TIMESTAMPTZ |
| revoked_at | TIMESTAMPTZ |
| revoked_reason | TEXT |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() |

Keys: PK `id`; UNIQUE `key_hash`; composite FK `(organization_id, user_id)` → organization_users ON DELETE CASCADE (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:682-686).
RLS: enabled. **Final: all policies dropped; privileges revoked from `PUBLIC, anon, authenticated, service_role`; `GRANT SELECT (id, organization_id, user_id, name, key_prefix, scopes, rate_limit_per_minute, last_used_at, expires_at, revoked_at, created_at, updated_at)` to `authenticated` with policy `Users read their tenant-bound API key metadata` (`auth.uid() = user_id AND organization_id IS NOT NULL AND user_in_organization(...)`); ALL to `service_role`.** Note `key_hash` is **not** in the authenticated column grant.
Source: CREATE supabase/migrations/20260409020305_api_keys.sql:6-22; re-CREATE supabase/migrations/20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:2-18; final lockdown supabase/migrations/20260713130000_external_observer_control_plane.sql:75-144.

#### organization_credits
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE, UNIQUE |
| balance_cents | INTEGER NOT NULL DEFAULT 0 |
| cost_per_minute_cents | INTEGER NOT NULL DEFAULT 15 |
| retell_cost_per_minute_cents | INTEGER NOT NULL DEFAULT 7 |
| low_balance_threshold_cents | INTEGER DEFAULT 1000 |
| cutoff_threshold_cents | INTEGER DEFAULT 100 |
| auto_recharge_enabled | BOOLEAN DEFAULT false |
| auto_recharge_amount_cents | INTEGER DEFAULT 5000 |
| auto_recharge_trigger_cents | INTEGER DEFAULT 500 |
| last_recharge_at | TIMESTAMPTZ |
| last_deduction_at | TIMESTAMPTZ |
| last_low_balance_alert_at | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ DEFAULT NOW() |
| updated_at | TIMESTAMPTZ DEFAULT NOW() |
| reserved_balance_cents | INTEGER NOT NULL DEFAULT 0 |
| allow_negative_balance | BOOLEAN NOT NULL DEFAULT false |
| negative_balance_limit_cents | INTEGER NOT NULL DEFAULT 0 |
| stripe_payment_method_id | TEXT |

Keys: PK `id`; UNIQUE `unique_org_credits` on `organization_id`; CHECK `organization_credits_balance_contract`, `organization_credits_reserved_balance_check`, `organization_credits_negative_limit_check`.
RLS: enabled. **Final: all policies dropped; privileges revoked from `PUBLIC, anon, authenticated`; `GRANT SELECT` to `authenticated` with policy `Members view their organization credits` (`user_in_organization(auth.uid(), organization_id)`); full CRUD to `service_role`.** A BEFORE INSERT OR UPDATE OF `balance_cents, reserved_balance_cents` trigger `organization_credit_balance_owner` raises unless `current_setting('app.credit_ledger_writer', true) = 'credit-ledger-v1'`.
Source: CREATE supabase/migrations/20260124_white_label_credits.sql:27-58; ALTER supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:21-44; ALTER supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:238-258; final lockdown supabase/migrations/20260713065000_billing_ownership_boundary.sql:79-160,171-213.

#### credit_transactions
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |
| transaction_type | TEXT NOT NULL (renamed from `type`; CHECK length 1..64) |
| amount_cents | INTEGER NOT NULL |
| balance_before_cents | INTEGER NOT NULL |
| balance_after_cents | INTEGER NOT NULL |
| call_log_id | UUID FK → call_logs(id) ON DELETE RESTRICT |
| stripe_payment_id | TEXT (renamed from `stripe_payment_intent_id`) |
| stripe_invoice_id | TEXT |
| description | TEXT |
| minutes_used | NUMERIC(10,4) |
| retell_cost_cents | INTEGER |
| margin_cents | INTEGER |
| created_by | UUID FK → auth.users(id) ON DELETE SET NULL |
| metadata | JSONB DEFAULT '{}' |
| created_at | TIMESTAMPTZ DEFAULT NOW() |
| idempotency_key | TEXT |
| retell_call_id | TEXT |

Keys: PK `id`; UNIQUE INDEX `idx_credit_tx_idempotency` on `idempotency_key` WHERE NOT NULL; UNIQUE INDEX `idx_credit_tx_stripe_payment_id` on `stripe_payment_id` WHERE NOT NULL.
RLS: enabled. **Final: all policies dropped; privileges revoked from `PUBLIC, anon, authenticated`; `GRANT SELECT` to `authenticated` with policy `Members view their organization credit ledger`; full CRUD to `service_role`.** BEFORE INSERT OR UPDATE OF `organization_id, call_log_id` trigger `credit_transaction_call_same_tenant` enforces the call log is in the same organization.
Source: CREATE supabase/migrations/20260124_white_label_credits.sql:92-128; ALTER supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:51-57; schema contract supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:6-49,51-58,127-183; final lockdown supabase/migrations/20260713065000_billing_ownership_boundary.sql:140-144.

#### usage_summaries
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |
| period_type | TEXT NOT NULL CHECK IN (daily, weekly, monthly) |
| period_start | DATE NOT NULL |
| period_end | DATE NOT NULL |
| total_calls | INTEGER NOT NULL DEFAULT 0 |
| total_minutes | NUMERIC(10,2) NOT NULL DEFAULT 0 |
| total_billed_cents | INTEGER NOT NULL DEFAULT 0 |
| total_retell_cost_cents | INTEGER NOT NULL DEFAULT 0 |
| total_margin_cents | INTEGER NOT NULL DEFAULT 0 |
| calls_completed | INTEGER NOT NULL DEFAULT 0 |
| calls_voicemail | INTEGER NOT NULL DEFAULT 0 |
| calls_no_answer | INTEGER NOT NULL DEFAULT 0 |
| calls_failed | INTEGER NOT NULL DEFAULT 0 |
| calls_busy | INTEGER NOT NULL DEFAULT 0 |
| avg_call_duration_seconds | NUMERIC(10,2) |
| avg_cost_per_call_cents | NUMERIC(10,2) |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Keys: PK `id`; UNIQUE `usage_summaries_period_unique` on (`organization_id`,`period_type`,`period_start`).
RLS: enabled. SELECT if `user_in_organization(auth.uid(), organization_id)`; full CRUD to `service_role`.
Source: CREATE supabase/migrations/20260124_white_label_credits.sql:155-189; re-CREATE supabase/migrations/20260713065000_billing_ownership_boundary.sql:10-31,146-150.

#### agent_pricing
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID NOT NULL FK → organizations(id) ON DELETE CASCADE |
| retell_agent_id | TEXT NOT NULL |
| agent_name | TEXT |
| llm_model | TEXT |
| voice_provider | TEXT |
| has_knowledge_base | BOOLEAN |
| base_cost_per_min_cents | NUMERIC(12,4) |
| markup_cents | NUMERIC(12,4) |
| markup_percentage | NUMERIC(12,4) |
| markup_type | TEXT |
| customer_price_per_min_cents | NUMERIC(12,4) |
| is_active | BOOLEAN NOT NULL DEFAULT true |
| last_synced_at | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Keys: PK `id`; UNIQUE `agent_pricing_organization_retell_agent_key` on (`organization_id`,`retell_agent_id`); CHECKs `agent_pricing_identity_check`, `agent_pricing_cost_check`, `agent_pricing_active_price_check`, `agent_pricing_nonnegative_margin_check`.
RLS: enabled. SELECT if `user_in_organization(auth.uid(), organization_id)`; full CRUD to `service_role`.
Source: CREATE supabase/migrations/20260713070000_agent_pricing_schema_contract.sql:18-35,235-270,330-339.

### C. JSON bags and merge RPCs

**FACT — the free-form JSON bag on leads is not a column named `custom_fields` on `leads`.** No migration in the material adds a `custom_fields` column to `leads`. The JSON bags that exist are:

- `inbound_transfers.custom_fields JSONB DEFAULT '{}'::jsonb` with a GIN index `idx_inbound_transfers_custom_fields` (supabase/migrations/20251229000000_inbound_transfers.sql:31,78).
- `leads` has no JSON bag column in the material; the closest is `leads.tags` (GIN-indexed, type not declared) (supabase/migrations/20260107024232_abad304f-2fc1-4b64-851d-d6304e53801c.sql:65).
- `lead_journey_state.metadata JSONB DEFAULT '{}'` (supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:73).
- `lead_workflow_progress.metadata JSONB DEFAULT '{}'` (supabase/migrations/20260329_autonomous_workflow_intelligence.sql:36).
- `campaigns.metadata JSONB DEFAULT '{}'` (supabase/migrations/20260409023224_0d64819e-dfe6-4dd3-abc8-b7c307dca436.sql:1).
- `call_logs.ai_analysis JSONB`, `call_logs.cost_breakdown JSONB`, `call_logs.token_usage JSONB` (supabase/migrations/20260109041709_a48a830e-bbc8-42b2-a107-bbe0879199fe.sql:3; supabase/migrations/20260124_white_label_credits.sql:215-216).

**FACT — a merge RPC named `merge_custom_fields` is referenced but never defined in the material.** It appears only in a REVOKE/GRANT list: `'public.merge_custom_fields(uuid, jsonb)'` (supabase/migrations/20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:44). Its body, target table, and merge semantics are UNKNOWN. The file that would answer it is the migration that created `merge_custom_fields`, which is not in the material.

### D. Triggers on core tables

**FACT — triggers that fire on INSERT/UPDATE of `leads`:**
- `sync_lead_normalized_phone` — BEFORE INSERT OR UPDATE OF `phone_number, phone_number_normalized`; sets `NEW.phone_number_normalized := normalize_contact_phone(NEW.phone_number)` (supabase/migrations/20260712040000_sms_delivery_safety.sql:83-86).
- `leads_require_authoritative_tenant` — BEFORE INSERT OR UPDATE OF `user_id, organization_id`; calls `enforce_tenant_owned_core_resource()` which raises if `organization_id` changes, if `user_id` changes outside a certified transfer, if `organization_id` is NULL, or if the user is not a member of the organization (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:351-406).

**FACT — triggers that fire on INSERT/UPDATE of `call_logs`:**
- `trigger_update_usage_summary` — AFTER INSERT OR UPDATE OF `status, outcome, duration_seconds, billed_cost_cents`; upserts `usage_summaries` daily row (supabase/migrations/20260124_white_label_credits.sql:480-549).
- `call_logs_require_authoritative_tenant` — BEFORE INSERT OR UPDATE OF `user_id, organization_id`; same `enforce_tenant_owned_core_resource()` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:413-416).
- `call_logs_same_tenant_graph` — BEFORE INSERT OR UPDATE OF `user_id, organization_id, campaign_id, lead_id`; raises unless the referenced campaign and lead have identical `organization_id` and `user_id` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:418-460).
- `call_log_evidence_guard` — BEFORE UPDATE OR DELETE; raises on any DELETE, on tenant rebinding outside a certified transfer, and on overwriting an established `retell_call_id`, `telnyx_call_control_id`, `telnyx_call_session_id`, `telnyx_conversation_id`, `billed_cost_cents`, or `credit_deducted = true` (supabase/migrations/20260713071000_call_log_evidence_boundary.sql:53-107).

**FACT — triggers that fire on INSERT/UPDATE of SMS tables:**
- None found on `sms_messages` or `sms_conversations` in the material. `sms_conversations` has only `update_sms_conversations_updated_at` (BEFORE UPDATE, sets `updated_at`) (supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:141-144).
- `sms_delivery_attempts` has no triggers; its safety is enforced by the `claim_sms_delivery_attempt` / `finalize_sms_delivery_attempt` / `reconcile_sms_delivery_attempt` RPCs (supabase/migrations/20260712040000_sms_delivery_safety.sql:170-351).

**FACT — triggers on `dnc_list`:**
- `enforce_dnc_tenant_contract` — BEFORE INSERT OR UPDATE OF `phone_number, phone_number_normalized, organization_id, user_id`; normalizes the phone, raises if unnormalizable, raises if `organization_id` or `user_id` is NULL, raises if the user is not a member of the organization (supabase/migrations/20260713062000_dnc_tenant_uniqueness_contract.sql:180-210).
- `dnc_suppression_identity_guard` — BEFORE UPDATE OR DELETE; raises on any DELETE and on any change to `organization_id`, `user_id`, `phone_number`, `phone_number_normalized` (supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:59-88).

**FACT — triggers on `dialing_queues`:**
- `update_dialing_queues_updated_at` — BEFORE UPDATE, sets `updated_at` (supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:144-146).
- `dialing_queues_same_tenant` — BEFORE INSERT OR UPDATE OF `campaign_id, lead_id`; raises unless campaign and lead share one tenant (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:537-567).
- `dialing_queue_provider_evidence_delete_guard` — BEFORE DELETE; raises if the queue has any provider evidence or unresolved lifecycle (supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:167-193).

**FACT — triggers on `campaign_leads` and `campaign_phone_pools`:**
- `campaign_leads_same_tenant` — BEFORE INSERT OR UPDATE OF `campaign_id, lead_id` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:494-497).
- `campaign_phone_pools_same_tenant` — BEFORE INSERT OR UPDATE OF `campaign_id, phone_number_id, user_id` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:532-535).

### E. Risks for adding wh_* tables

**FACT — no global/event triggers exist in the material.** No `CREATE EVENT TRIGGER` and no `CREATE TRIGGER ... ON ALL TABLES` appears in any provided migration. **INFERENCE:** adding `wh_*` tables will not fire any existing trigger automatically.

**FACT — cascade deletes from `organizations` and `auth.users` are widespread and inconsistent:**
- `organization_users` cascades from both `organizations` and `auth.users` (supabase/migrations/20260108_phase2_organizations.sql:55-56).
- `campaigns`, `leads`, `phone_numbers`, `call_logs` were given `organization_id ... ON DELETE CASCADE` in Phase 2 (supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:24,75,121,259), then **replaced with `ON DELETE RESTRICT`** plus a composite `(organization_id, user_id)` → `organization_users` `ON DELETE RESTRICT` (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:138-177). **INFERENCE:** deleting an organization is now blocked while any campaign/lead/phone number/call log exists, but the 20260720 migration re-adds `organization_id ... ON DELETE SET NULL` on `leads`, `campaigns`, `phone_numbers` (supabase/migrations/20260720235049_7254d373-aa0b-4957-8543-b25a54c7b66f.sql:1-8) — the effective delete behavior is UNKNOWN and must be checked against the live DB before relying on it.
- `organization_credits`, `credit_transactions`, `usage_summaries`, `agent_pricing`, `dnc_list`, `dispositions`, `pipeline_boards`, `ai_sms_settings`, `autonomous_settings`, `agent_scripts`, `calendar_integrations`, `follow_up_sequences`, `disposition_metrics` all cascade from `organizations` (supabase/migrations/20260124_white_label_credits.sql:29,94,157; supabase/migrations/20260713070000_agent_pricing_schema_contract.sql:251; supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:21,51,81,106,141,176,211,239).
- `campaign_contact_releases`, `contact_stop_controls`, `elite_email_execution_releases`, `external_control_installations` use `ON DELETE RESTRICT` from `organizations` (supabase/migrations/20260713150000_campaign_contact_release_gate.sql:8; supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:13; supabase/migrations/20260720120000_elite_email_execution_ledger.sql:21; supabase/migrations/20260713130000_external_observer_control_plane.sql:238-239).
- `auth.users` deletes cascade into `organization_users`, `user_roles`, `user_credentials`, `workflow_test_logs`, `disposition_metrics`, `edge_function_errors`, `rotation_settings` (via `user_id`), `number_orders`, `yellowstone_settings`, `system_settings`, `predictive_dialing_stats`, `dialing_queue_priorities`, `advanced_dialer_settings`, `dnc_list`, `timezone_rules`, `caller_id_pool`, `contact_list_filters`, `phone_providers`, `provider_numbers`, `carrier_configs`, `call_signatures`, `rvm_queue`, `sms_messages`, `follow_ups`, `sms_delivery_attempts`, `ml_learning_data`, `script_performance_analytics`, `disposition_accuracy_tracking`, `system_optimization_insights`, `learning_outcomes`, `autonomous_goals`, `lead_priority_scores`, `agent_improvement_history`, `lj_memory`, `api_keys`, `slack_users`, `external_control_principals`, `campaign_contact_releases`, `elite_email_execution_releases`, `elite_email_provider_event_receipts`, `elite_email_release_preparation_attestations`, `workflow_external_effects`, `provider_dispatch_claims`, `provider_call_attempts`, `sms_delivery_attempts` (supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:44,100; supabase/migrations/20240115_workflow_test_logs.sql:4; supabase/migrations/20241218_disposition_metrics.sql:6; supabase/migrations/20241218_edge_function_errors.sql:8; supabase/migrations/20251109171900_concurrency_management.sql:4,38,73; supabase/migrations/20251109172000_advanced_dialer_features.sql:35,60,97,130; supabase/migrations/20251201000000_multi_carrier_integration.sql:12,49,89,110,143,173,207; supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:4,18,46,56; supabase/migrations/20251220063500_ml_learning_system.sql:4,44,81,113; supabase/migrations/20260105024224_787a516a-eba1-417e-9b93-605a3e5450d7.sql:14,27,47; supabase/migrations/20260107031814_dbb6ea1e-6bbb-46b3-9355-73cded46d621.sql:4,17; supabase/migrations/20260409020305_api_keys.sql:9; supabase/migrations/20260703225037_slack_users_mapping.sql:10; supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:14,129,152; supabase/migrations/20260712030000_workflow_external_effect_ledger.sql:19; supabase/migrations/20260712040000_sms_delivery_safety.sql:137; supabase/migrations/20260713150000_campaign_contact_release_gate.sql:9; supabase/migrations/20260720120000_elite_email_execution_ledger.sql:22,77; supabase/migrations/20260720150000_elite_email_release_preparation.sql:12).

**FACT — policies that reference "all tables" do not exist, but several policies are written against `auth.uid()` only and will silently not see `wh_*` rows.** No policy in the material uses a wildcard table reference. **INFERENCE:** a `wh_*` table added without its own RLS policies will be readable/writable by `service_role` only (RLS default-deny for `anon`/`authenticated`), which is the safe default but means the browser will see nothing until policies are added.

**FACT — `dialing_queues`, `call_logs`, `phone_numbers`, `dnc_list`, `api_keys`, `user_credentials`, `calendar_integrations` have had **all** table and column privileges revoked from `PUBLIC, anon, authenticated`** (supabase/migrations/20260713064000_dialing_queue_mutation_boundary.sql:30-37; supabase/migrations/20260713071000_call_log_evidence_boundary.sql:29-36; supabase/migrations/20260713072000_provider_resource_ownership_boundary.sql:238-248; supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:29-36; supabase/migrations/20260713130000_external_observer_control_plane.sql:101-109,192-200; supabase/migrations/20260713063000_quarantine_browser_readable_credentials.sql:33-40). **INFERENCE:** any `wh-` edge function that writes these tables must use the `service_role` key, not the user's JWT.

**FACT — `call_logs` and `dnc_list` are append-only / delete-forbidden at the trigger level** (supabase/migrations/20260713071000_call_log_evidence_boundary.sql:60-64; supabase/migrations/20260713073000_irreversible_dnc_browser_boundary.sql:66-70). **INFERENCE:** a wholesaler "delete this lead" feature cannot hard-delete the associated call logs or DNC rows; it must soft-delete on `leads` only.

**FACT — `campaigns`, `leads`, `phone_numbers`, `call_logs` have a BEFORE INSERT/UPDATE trigger that raises if `organization_id` is NULL or if the user is not a member of the organization** (supabase/migrations/20260712070000_multi_organization_routing_contract.sql:379-393). **INFERENCE:** any `wh_*` insert path that creates a lead or campaign must set `organization_id` explicitly and the acting user must already be in `organization_users`, or the insert fails with `42501`.

