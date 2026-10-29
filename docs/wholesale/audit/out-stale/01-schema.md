Assumption: "current shape" means the state after all provided migrations run in filename order; where a table is created more than once with `CREATE TABLE IF NOT EXISTS`, the first creation wins and later ones are no-ops.

### A. Tenancy model

**FACT — the model is mixed: per-user (`user_id`) is the original and dominant key; per-organization (`organization_id`) was bolted on later and covers only a subset of tables.**

- Organizations table created with slug, subscription tier/status, quotas, soft-delete `deleted_at` (`supabase/migrations/20260108_phase2_organizations.sql:9-41`). A second `CREATE TABLE IF NOT EXISTS public.organizations` exists (`supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:2-16`) but is a no-op because the table already exists; note it omits `owner_email`, `contact_phone`, `timezone`, `metadata`, `deleted_at` and the `valid_slug` check.
- `organization_users` junction: `organization_id` FK → organizations ON DELETE CASCADE, `user_id` FK → auth.users ON DELETE CASCADE, `role TEXT DEFAULT 'member' CHECK (role IN ('owner','admin','manager','member'))`, `UNIQUE(organization_id, user_id)` (`supabase/migrations/20260108_phase2_organizations.sql:53-65`). The later duplicate create (`supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:19-26`) is a no-op.
- `user_roles` is a **separate, older, global** role system: `role app_role` enum `('admin','manager','user')`, `UNIQUE(user_id, role)` (`supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:40-49`). It has no organization_id. So there are **two unrelated role systems**: `user_roles.role` (admin/manager/user, global) and `organization_users.role` (owner/admin/manager/member, per-org).
- Helper SQL functions used in RLS:
  - `public.get_user_organizations(user_uuid UUID) RETURNS SETOF UUID` — returns `organization_id` from `organization_users` where `user_id = user_uuid` (`supabase/migrations/20260108_phase2_organizations.sql:76-84`).
  - `public.user_in_organization(user_uuid UUID, org_uuid UUID) RETURNS BOOLEAN` — EXISTS check on `organization_users` (`supabase/migrations/20260108_phase2_organizations.sql:87-98`). **Later redefined with a different signature** `user_in_organization(org_id UUID)` using `auth.uid()` (`supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:38-49`) — both overloads now exist.
  - `public.get_user_org_role(user_uuid UUID, org_uuid UUID) RETURNS TEXT` (`supabase/migrations/20260108_phase2_organizations.sql:101-111`), later overloaded as `get_user_org_role(org_id UUID)` (`supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:52-62`).
  - `public.is_org_admin(user_uuid UUID, org_uuid UUID) RETURNS BOOLEAN` — role IN ('owner','admin') (`supabase/migrations/20260108_phase2_organizations.sql:114-126`), later overloaded as `is_org_admin(org_id UUID)` (`supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:65-78`).
  - `public.has_role(_user_id UUID, _role app_role) RETURNS BOOLEAN` — EXISTS on `user_roles` (`supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:65-74`, re-created `supabase/migrations/20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:22-31` and `supabase/migrations/20251103035810_06a50f99-8093-48a7-bc14-dd73a00b2244.sql:7-16`).
  - `public.get_organization_for_user(p_user_id UUID) RETURNS UUID` — first org by `created_at` (`supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:538-551`).
  - `public.get_organization_for_lead(p_lead_id UUID) RETURNS UUID` (`supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:560-571`).
- **Tables that carry `organization_id`** (all added in Phase 2, all `NOT NULL` after backfill to the `default-org`):
  - Core: `campaigns`, `leads`, `phone_numbers`, `voice_broadcasts`, `workflows`, `call_logs`, `dispositions` (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:23-24, 74-75, 120-121, 166-167, 212-213, 258-259, 290-291`).
  - Additional: `dnc_list`, `ai_sms_settings`, `autonomous_settings`, `agent_scripts`, `calendar_integrations`, `follow_up_sequences`, `disposition_metrics`, `pipeline_boards` (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:20-21, 50-51, 80-81, 105-106, 140-141, 175-176, 210-211, 238-239`).
  - Billing: `organization_credits`, `credit_transactions`, `usage_summaries` (`supabase/migrations/20260124_white_label_credits.sql:29, 94, 157`).
  - `api_keys` has a **nullable** `organization_id` (`supabase/migrations/20260409020305_api_keys.sql:8`).
  - `telnyx_assistants` has a nullable `organization_id` (`supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:10`).
- **Tables that carry only `user_id`** (no organization_id anywhere in the material): `user_roles`, `profiles` (see F), `campaign_leads`, `dialing_queues`, `sms_messages`, `sms_conversations`, `sms_context_history`, `ai_sms_settings` (has org, see above — listed here only for the SMS family), `follow_ups`, `rvm_queue`, `phone_providers`, `provider_numbers`, `carrier_configs`, `call_signatures`, `system_settings`, `predictive_dialing_stats`, `dialing_queue_priorities`, `advanced_dialer_settings`, `timezone_rules`, `caller_id_pool`, `contact_list_filters`, `daily_reports`, `campaign_automation_rules`, `ai_chatbot_settings`, `agent_decisions`, `sequence_steps` (via sequence), `scheduled_follow_ups`, `agent_scripts` (has org), `script_usage_logs`, `script_performance_metrics`, `script_suggestions`, `lead_scoring_settings`, `calendar_availability`, `calendar_appointments`, `campaign_workflows`, `workflow_steps` (via workflow), `lead_workflow_progress`, `disposition_auto_actions`, `lead_reachability_scores`, `reachability_events`, `ai_workflow_generations`, `voice_broadcasts` (has org), `broadcast_queue` (via broadcast), `budget_settings`, `spending_logs`, `spending_summaries`, `budget_alerts`, `sip_trunk_configs`, `ai_feedback`, `ai_learning`, `ai_session_memory`, `ai_daily_insights`, `ml_learning_data`, `script_performance_analytics`, `disposition_accuracy_tracking`, `system_optimization_insights`, `ai_conversations`, `ai_conversation_messages` (via conversation), `inbound_transfers`, `retell_transfer_context`, `active_ai_transfers`, `system_alerts`, `calendar_tool_invocations`, `learning_outcomes`, `autonomous_goals`, `lead_priority_scores`, `ghl_sync_settings`, `smart_lists`, `lead_list_memberships` (via list), `agent_improvement_history`, `lj_memory`, `demo_*` (no user_id at all), `telnyx_settings`, `telnyx_knowledge_bases`, `telnyx_insight_templates`, `telnyx_scheduled_events`, `telnyx_conversation_insights`, `ai_action_queue`, `ai_operational_memory`, `lead_journey_state`, `journey_event_log`, `followup_playbook`, `agent_script_variants`, `call_variant_assignments`, `adaptive_pacing`, `pacing_history`, `optimal_calling_windows`, `lead_score_outcomes`, `lead_scoring_weights`, `disposition_values`, `lead_intent_signals`, `number_health_metrics`, `playbook_performance`, `funnel_snapshots`, `playbook_optimization_log`, `daily_battle_plans`, `strategic_insights`, `insight_generated_rules`, `strategic_briefings`, `ai_campaign_strategies`, `sequence_templates` (nullable user_id), `sms_copy_variants`, `sms_variant_assignments` (via variant), `ml_models`, `lead_predictions`, `segment_roi_metrics`, `churn_risk_events`, `message_effectiveness`, `api_key_audit_log` (user_id only, no org).
- **INFERENCE:** Because `leads`, `campaigns`, `call_logs`, `phone_numbers`, `dispositions` are org-scoped but `dialing_queues`, `campaign_leads`, `sms_messages`, `sms_conversations`, `follow_ups`, `rvm_queue` are user-scoped only, a wholesaler tenant whose org has multiple users will see org-wide leads/calls but **per-user** queues, SMS threads and follow-ups. That is a real gap for the wh_* product.

### B. Table cards

#### organizations
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| name | TEXT NOT NULL |
| slug | TEXT UNIQUE NOT NULL |
| settings | JSONB DEFAULT '{}' |
| subscription_tier | TEXT DEFAULT 'basic' CHECK IN ('basic','professional','enterprise') |
| subscription_status | TEXT DEFAULT 'active' CHECK IN ('active','trial','suspended','cancelled') |
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

Keys: PK id; UNIQUE slug; CHECK valid_slug `^[a-z0-9-]+$`.
RLS: enabled. SELECT if `id IN get_user_organizations(auth.uid())`; UPDATE if `is_org_admin(auth.uid(), id)`; ALL if `auth.jwt()->>'role'='service_role'`; INSERT if `auth.uid() IS NOT NULL` (from the later duplicate create).
Source: CREATE `supabase/migrations/20260108_phase2_organizations.sql:9-41`; duplicate CREATE (no-op) `supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:2-16`; ALTER billing `supabase/migrations/20260124_white_label_credits.sql:15-17`; RLS `supabase/migrations/20260108_phase2_organizations.sql:130-146`, `supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:81-94`.

#### organization_users
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID NOT NULL FK organizations(id) ON DELETE CASCADE |
| user_id | UUID NOT NULL FK auth.users(id) ON DELETE CASCADE |
| role | TEXT NOT NULL DEFAULT 'member' CHECK IN ('owner','admin','manager','member') |
| joined_at | TIMESTAMPTZ DEFAULT now() |
| created_at | TIMESTAMPTZ DEFAULT now() |

Keys: PK id; UNIQUE(organization_id, user_id).
RLS: SELECT if `organization_id IN get_user_organizations(auth.uid())`; ALL if `is_org_admin(auth.uid(), organization_id)`; ALL if service_role; (later duplicate create adds INSERT if `is_org_admin(organization_id) OR (auth.uid()=user_id AND role='owner')`, UPDATE/DELETE if `is_org_admin(organization_id)`).
Source: CREATE `supabase/migrations/20260108_phase2_organizations.sql:53-65`; RLS `supabase/migrations/20260108_phase2_organizations.sql:150-166`; duplicate create + extra policies `supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:19-26, 97-118`.

#### user_roles
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK auth.users(id) |
| role | app_role NOT NULL (enum 'admin','manager','user') |
| created_at | TIMESTAMPTZ DEFAULT now() |
| updated_at | TIMESTAMPTZ DEFAULT now() |

Keys: PK id; UNIQUE(user_id, role).
RLS: SELECT if `auth.uid()=user_id`; ALL if `auth.jwt()->>'role'='service_role'`.
Source: CREATE `supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:40-49`; RLS `:52-62`.

#### profiles
UNKNOWN — no CREATE/ALTER for `profiles` appears in the material. A file that would answer it: the base schema migration that creates `profiles` (not in the provided set).

#### leads
Final columns shown in material (base CREATE not provided; only ALTERs and references):
| column | type |
|---|---|
| id | UUID (referenced as PK by FKs) |
| user_id | UUID |
| organization_id | UUID NOT NULL FK organizations(id) ON DELETE CASCADE |
| phone_number | TEXT |
| status | TEXT |
| lead_source | TEXT |
| tags | (GIN-indexed; type not shown) |
| do_not_call | BOOLEAN |
| created_at | TIMESTAMPTZ |
| updated_at | TIMESTAMPTZ |
| address | TEXT |
| city | TEXT |
| state | TEXT |
| zip_code | TEXT |

Keys: PK id (inferred from FK references); UNIQUE index `leads_phone_user_unique (phone_number, user_id)` (full, not partial).
RLS: SELECT if `organization_id IN get_user_organizations(auth.uid())`; INSERT if same AND `user_id=auth.uid()`; UPDATE if org match; DELETE if org match.
Source: ALTER org `supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:74-115`; address ALTER `supabase/migrations/20251230143913_c3ece5f9-6e8c-42a8-907f-00e5e0738402.sql:2-5`; unique index `supabase/migrations/20260110004737_47f3c3df-546c-4ca5-af18-509f04afc696.sql:3-6`; tags/status/source indexes `supabase/migrations/20260107024232_abad304f-2fc1-4b64-851d-d6304e53801c.sql:65-68`. Base CREATE: UNKNOWN.

#### campaigns
Columns shown: `id`, `user_id`, `organization_id` (NOT NULL), `status`, `updated_at`, `workflow_id` UUID FK campaign_workflows(id) ON DELETE SET NULL, `retry_delay_minutes` INTEGER DEFAULT 15, `max_calls_per_day` INTEGER DEFAULT 2, `sms_on_no_answer` BOOLEAN DEFAULT false, `sms_template` TEXT, `sms_from_number` TEXT, `metadata` JSONB DEFAULT '{}', `provider` TEXT NOT NULL DEFAULT 'retell', `telnyx_assistant_id` UUID FK telnyx_assistants(id) ON DELETE SET NULL.
Keys: PK id (inferred).
RLS: SELECT if org match; INSERT if org match AND `user_id=auth.uid()`; UPDATE if org match AND `user_id=auth.uid()`; DELETE if org match AND `user_id=auth.uid()`.
Source: ALTERs `supabase/migrations/20251208035156_fd3f07ec-6c94-4b0d-b02c-3b1f57e8865a.sql:58-64`, `supabase/migrations/20251213222334_50f1c918-1096-4568-a74e-e495419b35e5.sql:2-3`, `supabase/migrations/20260409023224_0d64819e-dfe6-4dd3-abc8-b7c307dca436.sql:1`, `supabase/migrations/20260307224548_b712bfe3-9f43-4850-aca6-c164ab1a16fb.sql:1-4`, `supabase/migrations/20260409210001_a27c991e-6a74-477e-84d3-fee1536f84c6.sql:2`; org + RLS `supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:23-69`. Base CREATE: UNKNOWN.

#### campaign_leads
Columns shown: `campaign_id`, `lead_id` (both referenced in policies and in a data migration). No CREATE in material.
Keys: UNKNOWN (no PK/unique shown).
RLS: SELECT if campaign owned by `auth.uid()`; INSERT if campaign owned AND lead owned; UPDATE if campaign owned; DELETE if campaign owned.
Source: policies `supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:156-201`; referenced in dedupe `supabase/migrations/20251214221955_8054901e-d2b3-437d-b035-44746ec85427.sql:64-72`. CREATE: UNKNOWN.

#### dialing_queues
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| campaign_id | UUID NOT NULL FK campaigns(id) ON DELETE CASCADE |
| lead_id | UUID NOT NULL FK leads(id) ON DELETE CASCADE |
| phone_number | TEXT NOT NULL |
| priority | INTEGER NOT NULL DEFAULT 1 |
| status | TEXT NOT NULL DEFAULT 'pending' |
| scheduled_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| attempts | INTEGER NOT NULL DEFAULT 0 |
| max_attempts | INTEGER NOT NULL DEFAULT 3 |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| notes | TEXT (written in a data migration) |

Keys: PK id; UNIQUE(campaign_id, lead_id) (`dialing_queues_campaign_lead_unique`).
RLS: ALL if EXISTS campaign owned by `auth.uid()` AND EXISTS lead owned by `auth.uid()`.
Source: CREATE `supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:41-53`; FKs `:118-124`; RLS `supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:140-153`; unique `supabase/migrations/20260105024224_787a516a-eba1-417e-9b93-605a3e5450d7.sql:22-34`; `notes` written `supabase/migrations/20260420233753_26c4618e-1b14-4a1d-ab01-bf71f37b9048.sql:2` (column not created in material — UNKNOWN whether it exists).

#### call_logs
Columns shown across ALTERs: `id`, `user_id`, `organization_id` (NOT NULL), `lead_id`, `campaign_id`, `caller_id`, `phone_number`, `from_number`, `outcome` (CHECK list of 15 values), `duration_seconds`, `status`, `created_at`, `retell_call_id` (UNIQUE), `amd_result` TEXT, `amd_confidence` DECIMAL(5,2), `transcript` TEXT, `ai_analysis` JSONB, `auto_disposition` TEXT, `confidence_score` DECIMAL(3,2), `agent_id` TEXT, `agent_name` TEXT, `recording_url` TEXT, `sentiment` TEXT, `call_summary` TEXT, `time_wasted_score` INTEGER DEFAULT 0, `time_wasted_reason` TEXT, `opener_extracted` TEXT, `opener_score` INTEGER, `retell_cost_cents` INTEGER, `billed_cost_cents` INTEGER, `cost_breakdown` JSONB, `token_usage` JSONB, `credit_deducted` BOOLEAN DEFAULT false, `provider` TEXT DEFAULT 'retell', `telnyx_call_control_id` TEXT, `telnyx_call_session_id` TEXT, `telnyx_conversation_id` TEXT, `telnyx_assistant_id` TEXT, `amd_type` TEXT, `started_at` TIMESTAMPTZ.
Keys: PK id (inferred); UNIQUE(retell_call_id) `call_logs_retell_call_id_key`; CHECK `call_logs_outcome_check`.
RLS: SELECT if org match; INSERT if `EXISTS (SELECT 1 FROM organizations WHERE id = organization_id)`.
Source: ALTERs `supabase/migrations/20251109172000_advanced_dialer_features.sql:88-89`, `supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:56-57`, `supabase/migrations/20260109041709_a48a830e-bbc8-42b2-a107-bbe0879199fe.sql:2-10`, `supabase/migrations/20260118_script_analytics_enhancement.sql:64-68`, `supabase/migrations/20260124_white_label_credits.sql:213-217`, `supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:151-159`, `supabase/migrations/20260416045704_86f46151-2e96-44e1-9708-8129cfabe7bb.sql:3-6`; outcome CHECK `supabase/migrations/20260105024224_787a516a-eba1-417e-9b93-605a3e5450d7.sql:2-20`; unique `supabase/migrations/20251230004642_dfffa837-80d8-47b3-8528-848b47c9c080.sql:3-4`; org + RLS `supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:258-285`. Base CREATE: UNKNOWN.

#### phone_numbers
Columns shown: `id`, `user_id` UUID NOT NULL FK auth.users(id), `organization_id` UUID NOT NULL FK organizations(id) ON DELETE CASCADE, `number` TEXT, `status` TEXT, `retell_phone_id` TEXT, `stir_shaken_attestation` TEXT CHECK IN ('A','B','C','not_verified'), `line_type` TEXT, `carrier_name` TEXT, `caller_name` TEXT, `is_voip` BOOLEAN DEFAULT false, `external_spam_score` INTEGER DEFAULT 0, `last_lookup_at` TIMESTAMPTZ, `friendly_name` TEXT, `provider` TEXT DEFAULT 'twilio' CHECK IN ('twilio','telnyx','retell_native','other'), `purpose` TEXT DEFAULT 'general_rotation' CHECK IN ('broadcast','retell_agent','follow_up_dedicated','general_rotation','sms_only'), `sip_trunk_provider` TEXT, `sip_trunk_config` JSONB DEFAULT '{}', `is_stationary` BOOLEAN DEFAULT false, `rotation_enabled` BOOLEAN DEFAULT true, `max_daily_calls` INTEGER DEFAULT 100, `twilio_verified` BOOLEAN DEFAULT false, `twilio_verified_at` TIMESTAMPTZ, `twilio_sid` TEXT, `capabilities` JSONB DEFAULT '{}', `daily_calls` INTEGER, `last_call_at` TIMESTAMPTZ, `quarantine_until` (written in data migration), `call_direction` TEXT NOT NULL DEFAULT 'outbound' CHECK IN ('inbound','outbound','both').
Keys: PK id (inferred).
RLS: SELECT if org match; INSERT if org match AND `user_id=auth.uid()`; UPDATE if org match; DELETE if org match.
Source: user_id `supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:7-13`; retell_phone_id `supabase/migrations/20251106205513_0a9a0146-7076-4f51-92d3-7fc1da2eed93.sql:2-3`; STIR/SHAKEN `supabase/migrations/20251107211945_4d0fb7ea-9fe7-4117-a1fa-4df03d6c62c0.sql:2-9`; friendly_name `supabase/migrations/20251208023834_29d62ad4-cb26-46ad-8173-075da85d4652.sql:2`; provider/purpose `supabase/migrations/20251211041547_a77f9fed-e2d1-4a9b-a8a5-ae14988c3723.sql:4-18`; rotation `supabase/migrations/20260107014918_fc9552e5-d96d-4747-bff5-3c7965c5a346.sql:2-6`; twilio verify `supabase/migrations/20260110214558_29ba45d1-9d7e-4c69-9191-3413b53a5579.sql:2-6`; daily_calls/last_call_at `supabase/migrations/20260115000000_add_daily_calls_reset_functions.sql:62-64`; call_direction `supabase/migrations/20260304151620_2d55f970-00ee-4065-b697-3f2b539add74.sql:1`; org + RLS `supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:120-161`. Base CREATE: UNKNOWN.

#### sms_messages
Two CREATEs; the first wins (`supabase/migrations/20251201000000_multi_carrier_integration.sql:171-189`), the second (`supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:16-40`) is a no-op. Final columns:
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK auth.users(id) |
| lead_id | UUID FK leads(id) ON DELETE SET NULL |
| provider_id | UUID FK phone_providers(id) ON DELETE SET NULL |
| provider_type | TEXT |
| to_number | TEXT NOT NULL |
| from_number | TEXT NOT NULL |
| body | TEXT NOT NULL |
| template_id | TEXT |
| direction | TEXT NOT NULL DEFAULT 'outbound' CHECK IN ('inbound','outbound') |
| status | TEXT NOT NULL DEFAULT 'pending' CHECK IN ('pending','queued','sent','delivered','failed','received') |
| provider_message_id | TEXT |
| error_message | TEXT |
| metadata | JSONB DEFAULT '{}' |
| sent_at | TIMESTAMPTZ |
| delivered_at | TIMESTAMPTZ |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() |

Keys: PK id.
RLS: ALL if `auth.uid()=user_id`; INSERT if service_role.
Source: CREATE `supabase/migrations/20251201000000_multi_carrier_integration.sql:171-189`; RLS `:191-200`. **Note:** the second CREATE's columns (`conversation_id`, `is_ai_generated`, `has_image`, `image_url`, `image_analysis`, `is_reaction`, `reaction_type`, `read_at`) are **not** added because the table already exists — INFERENCE from `CREATE TABLE IF NOT EXISTS` semantics.

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

Keys: PK id.
RLS: SELECT/INSERT/UPDATE/DELETE if `auth.uid()=user_id`.
Source: CREATE `supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:2-13`; RLS `:80-94`; last_from_number `supabase/migrations/20251208023834_29d62ad4-cb26-46ad-8173-075da85d4652.sql:5`.

#### dnc_list
Two CREATEs; first wins (`supabase/migrations/20251109172000_advanced_dialer_features.sql:33-42`). Final columns:
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK auth.users(id) ON DELETE CASCADE |
| phone_number | TEXT NOT NULL |
| reason | TEXT |
| source | TEXT |
| added_at | TIMESTAMPTZ NOT NULL DEFAULT now() |
| expires_at | TIMESTAMPTZ |
| organization_id | UUID NOT NULL FK organizations(id) ON DELETE CASCADE |

Keys: PK id; UNIQUE(user_id, phone_number).
RLS: SELECT/INSERT/DELETE if `organization_id IN get_user_organizations(auth.uid())` (the old `FOR ALL USING auth.uid()=user_id` policy is **not** dropped by name — see E).
Source: CREATE `supabase/migrations/20251109172000_advanced_dialer_features.sql:33-42`; duplicate no-op `supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:45-53`; org + RLS `supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:20-45`.

#### dispositions
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| user_id | UUID NOT NULL FK auth.users(id) |
| name | TEXT NOT NULL |
| description | TEXT |
| color | TEXT NOT NULL DEFAULT '#3B82F6' |
| pipeline_stage | TEXT NOT NULL |
| auto_actions | JSONB DEFAULT '[]' |
| created_at | TIMESTAMPTZ DEFAULT now() |
| updated_at | TIMESTAMPTZ DEFAULT now() |
| organization_id | UUID NOT NULL FK organizations(id) ON DELETE CASCADE |

Keys: PK id.
RLS: SELECT if org match; INSERT if org match AND `user_id=auth.uid()`; UPDATE if org match; DELETE if org match.
Source: CREATE `supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:6-16`; org + RLS `supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:290-331`.

#### pipeline tables (pipeline_boards, lead_pipeline_positions)
`pipeline_boards`: id UUID PK, user_id UUID NOT NULL FK auth.users(id), name TEXT NOT NULL, description TEXT, disposition_id UUID FK dispositions(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0, settings JSONB DEFAULT '{}', created_at, updated_at, organization_id UUID NOT NULL FK organizations(id) ON DELETE CASCADE, campaign_id UUID FK campaigns(id) ON DELETE SET NULL. RLS: org-match SELECT/INSERT/UPDATE/DELETE. Source: `supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:39-49`; org `supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:238-268`; campaign_id `supabase/migrations/20260407215815_84a3bd5a-8f48-4a56-9329-b75ee7c490a1.sql:2-3`.

`lead_pipeline_positions`: id UUID PK, user_id UUID NOT NULL FK auth.users(id), lead_id UUID NOT NULL FK leads(id) ON DELETE CASCADE, pipeline_board_id UUID NOT NULL FK pipeline_boards(id) ON DELETE CASCADE, position INTEGER NOT NULL DEFAULT 0, moved_at TIMESTAMPTZ DEFAULT now(), moved_by_user BOOLEAN DEFAULT true, notes TEXT, created_at TIMESTAMPTZ DEFAULT now(). Keys: UNIQUE(lead_id, pipeline_board_id) and later UNIQUE(lead_id, user_id). RLS: user-match SELECT/INSERT/UPDATE/DELETE. Source: `supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:72-103`; unique `supabase/migrations/20260105024224_787a516a-eba1-417e-9b93-605a3e5450d7.sql:36-48`.

#### api_keys
| column | type |
|---|---|
| id | UUID PK DEFAULT gen_random_uuid() |
| organization_id | UUID FK organizations(id) ON DELETE CASCADE (nullable) |
| user_id | UUID NOT NULL FK auth.users(id) ON DELETE CASCADE |
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

Keys: PK id; UNIQUE key_hash.
RLS: ALL if `auth.uid()=user_id`.
Source: CREATE `supabase/migrations/20260409020305_api_keys.sql:6-22`; RLS `:47-54`; duplicate no-op `supabase/migrations/20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:2-18`.

#### credits / billing tables
`organization_credits`: id UUID PK, organization_id UUID NOT NULL FK organizations(id) ON DELETE CASCADE, balance_cents INTEGER NOT NULL DEFAULT 0, cost_per_minute_cents INTEGER NOT NULL DEFAULT 15, retell_cost_per_minute_cents INTEGER NOT NULL DEFAULT 7, low_balance_threshold_cents INTEGER DEFAULT 1000, cutoff_threshold_cents INTEGER DEFAULT 100, auto_recharge_enabled BOOLEAN DEFAULT false, auto_recharge_amount_cents INTEGER DEFAULT 5000, auto_recharge_trigger_cents INTEGER DEFAULT 500, last_recharge_at, last_deduction_at, last_low_balance_alert_at, created_at, updated_at, reserved_balance_cents INTEGER NOT NULL DEFAULT 0, allow_negative_balance BOOLEAN DEFAULT false, negative_balance_limit_cents INTEGER DEFAULT 0, stripe_payment_method_id TEXT. Keys: UNIQUE(organization_id); CHECK positive_balance, positive_cost, valid_thresholds. RLS: SELECT if org in user's orgs; UPDATE if org in user's orgs AND role IN ('owner','admin'); ALL if `auth.role()='service_role'`. Source: `supabase/migrations/20260124_white_label_credits.sql:27-86`; v2 columns `supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:21-44`.

`credit_transactions`: id UUID PK, organization_id UUID NOT NULL FK organizations(id) ON DELETE CASCADE, type TEXT CHECK IN ('deposit','deduction','refund','adjustment','auto_recharge','stripe_payment','reservation','reservation_release'), amount_cents INTEGER NOT NULL, balance_before_cents INTEGER NOT NULL, balance_after_cents INTEGER NOT NULL, call_log_id UUID FK call_logs(id), stripe_payment_intent_id TEXT, stripe_invoice_id TEXT, description TEXT, minutes_used DECIMAL(10,4), retell_cost_cents INTEGER, margin_cents INTEGER, created_by UUID FK auth.users(id), metadata JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), idempotency_key TEXT (UNIQUE partial index). RLS: SELECT if org in user's orgs; ALL if service_role. Source: `supabase/migrations/20260124_white_label_credits.sql:92-149`; v2 `supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:51-80`.

`usage_summaries`: id UUID PK, organization_id UUID NOT NULL FK organizations(id) ON DELETE CASCADE, period_type TEXT CHECK IN ('daily','weekly','monthly'), period_start DATE NOT NULL, period_end DATE NOT NULL, total_calls, total_minutes, total_billed_cents, total_retell_cost_cents, total_margin_cents, calls_completed, calls_voicemail, calls_no_answer, calls_failed, calls_busy, avg_call_duration_seconds, avg_cost_per_call_cents, created_at, updated_at. Keys: UNIQUE(organization_id, period_type, period_start). RLS: SELECT if org in user's orgs; ALL if service_role. Source: `supabase/migrations/20260124_white_label_credits.sql:155-207`.

`billing_enabled` flag lives on `organizations` (`supabase/migrations/20260124_white_label_credits.sql:15`).

### C. JSON bags and merge RPCs

- **FACT:** `leads` has **no** `custom_fields` column in the material. The only free-form JSON bag on a lead-like table is `inbound_transfers.custom_fields JSONB DEFAULT '{}'::jsonb` with a GIN index (`supabase/migrations/20251229000000_inbound_transfers.sql:31, 78`). `leads` has `tags` (GIN-indexed, `supabase/migrations/20260107024232_abad304f-2fc1-4b64-851d-d6304e53801c.sql:65`) but no JSON bag.
- **FACT:** No RPC that merges into a lead JSON bag exists in the material. The nearest merge-style RPCs are:
  - `save_operational_memory(p_user_id UUID, p_memory_type TEXT, p_subject TEXT, p_content JSONB, p_importance INTEGER DEFAULT 5)` — upserts `ai_operational_memory` (`supabase/migrations/20260210143830_635eb8a9-8edb-4906-a202-29a709a53e6a.sql:27-65`).
  - `add_credits(...)` / `reserve_credits(...)` / `finalize_call_cost(...)` — idempotent credit mutations (`supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:176-314, 324-528, 627-723`).
- **INFERENCE:** If wh_* needs a lead JSON bag, it must add its own column/table; nothing to reuse.

### D. Triggers on core tables

**FACT — triggers that fire on INSERT/UPDATE of `leads`, `call_logs`, or SMS tables:**
- `call_logs`: `trigger_update_usage_summary` — `AFTER INSERT OR UPDATE OF status, outcome, duration_seconds, billed_cost_cents` — runs `update_daily_usage_summary()` which upserts `usage_summaries` per org/day (`supabase/migrations/20260124_white_label_credits.sql:480-549`).
- `sms_conversations`: `update_sms_conversations_updated_at` — `BEFORE UPDATE` — sets `updated_at` (`supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:141-144`).
- `ai_sms_settings`: `update_ai_sms_settings_updated_at` — `BEFORE UPDATE` — sets `updated_at` (`supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:146-149`).
- `sms_messages`: **no trigger** in the material.
- `leads`: **no trigger** in the material.
- Related: `script_usage_logs` `AFTER INSERT` → `update_script_performance_metrics()` (`supabase/migrations/20251205200000_script_management.sql:172-175`); `ai_conversation_messages` `AFTER INSERT` → `update_conversation_timestamp()` (`supabase/migrations/20251220162500_add_ai_conversations.sql:69-72`); `dialing_queues` `BEFORE UPDATE` → `update_updated_at_column()` (`supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:144-146`).

### E. Risks for adding wh_* tables

**FACT:**
1. **Cascade deletes from `organizations`:** every Phase-2 org column is `REFERENCES public.organizations(id) ON DELETE CASCADE` (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:24, 75, 121, 167, 213, 259, 291`; `supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:21, 51, 81, 106, 141, 176, 211, 239`; `supabase/migrations/20260124_white_label_credits.sql:29, 94, 157`). Deleting an organization wipes leads, campaigns, call_logs, phone_numbers, dispositions, pipeline_boards, credits, etc. Any wh_* table that FKs `organizations(id)` with CASCADE inherits the same blast radius.
2. **Cascade deletes from `auth.users`:** many tables FK `auth.users(id) ON DELETE CASCADE` (e.g. `user_roles` `supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:44`; `organization_users` `supabase/migrations/20260108_phase2_organizations.sql:56`; `api_keys` `supabase/migrations/20260409020305_api_keys.sql:9`; `organization_credits` indirectly via org). Deleting a user cascades.
3. **`call_logs` INSERT trigger writes `usage_summaries`:** any wh_* code that inserts into `call_logs` will fire `trigger_update_usage_summary` and mutate billing aggregates (`supabase/migrations/20260124_white_label_credits.sql:544-549`). If wh_* writes call_logs with `organization_id` NULL it is skipped (`:486`), but the column is `NOT NULL` (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:265`).
4. **`call_logs` INSERT policy is org-existence-only:** `WITH CHECK (EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id))` — any authenticated user can insert a call_log for **any** org (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:280-285`). Same pattern on `disposition_metrics` (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:228-233`).
5. **Stale per-user policies not dropped:** Phase-2 migrations drop policies by specific names (e.g. `"Users can view their own DNC list"`, `"Users can insert to their DNC list"`, `"Users can delete from their DNC list"` — `supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:31-33`) but the original `dnc_list` policy was named `"Users can manage their own DNC list"` (`supabase/migrations/20251109172000_advanced_dialer_features.sql:48-50`), which is **not** in the drop list. INFERENCE: the old `FOR ALL USING auth.uid()=user_id` policy likely still exists alongside the new org policies, so a user can still see their own rows regardless of org.
6. **Duplicate/overloaded helper functions:** `user_in_organization`, `get_user_org_role`, `is_org_admin` each exist in two signatures (`supabase/migrations/20260108_phase2_organizations.sql:87-126` vs `supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:38-78`). wh_* policies calling them must pick the right overload.
7. **`CREATE TABLE IF NOT EXISTS` collisions:** several tables are created twice with different columns (`sms_messages`, `dnc_list`, `advanced_dialer_settings`, `system_settings`, `predictive_dialing_stats`, `phone_providers`, `ml_learning_data`, `disposition_metrics`, `edge_function_errors`, `workflow_test_logs`, `organizations`, `organization_users`, `api_keys`, `daily_battle_plans`, `strategic_insights`, `insight_generated_rules`, `strategic_briefings`, `agent_script_variants`, `call_variant_assignments`, `adaptive_pacing`, `pacing_history`, `lead_scoring_weights`, `optimal_calling_windows`, `lead_score_outcomes`, `ai_action_queue`, `ai_operational_memory`, `lead_journey_state`, `journey_event_log`, `followup_playbook`, `telnyx_*`). The **first** definition wins; later column sets are silently ignored. wh_* must not assume the second definition's columns exist.
8. **`pg_cron` jobs:** `automation-scheduler-job` every minute (`supabase/migrations/20251204062700_c7d0cc0d-ce0d-4041-992b-b13e6ed23207.sql:10-21`) and `ai-autonomous-engine-job` every 5 min (`supabase/migrations/20260210_autonomous_engine_upgrade.sql:275-294`). These call edge functions that may touch tables wh_* also touches.
9. **Realtime publication:** `call_logs`, `dialing_queues`, `active_ai_transfers` are in `supabase_realtime` (`supabase/migrations/20260416152221_5addd25d-8529-48ea-b9da-dc3ed14de064.sql:1-3`).
10. **No global/event triggers found** in the material (no `CREATE EVENT TRIGGER`, no `FOR EACH STATEMENT` triggers on all tables). INFERENCE: adding wh_* tables will not be caught by any catch-all trigger.

### F. UNKNOWN list

- `profiles` table: no CREATE/ALTER in material. File that would answer: base schema migration (not provided).
- Base CREATE for `leads`, `campaigns`, `campaign_leads`, `call_logs`, `phone_numbers`, `workflows`: only ALTERs/policies shown. File that would answer: the original schema migration(s) (not provided).
- `campaign_leads` PK/unique constraints: not shown.
- Whether `dialing_queues.notes` column exists (written in `supabase/migrations/20260420233753_26c4618e-1b14-4a1d-ab01-bf71f37b9048.sql:2` but no ALTER creates it).
- Whether `phone_numbers.quarantine_until` column exists (written in `supabase/migrations/20251206055249_1ac5bd88-ce62-458f-bf2e-7c12b5383351.sql:8` but no ALTER creates it).
- Whether `phone_numbers.daily_calls` column exists (used in `supabase/migrations/20260115000000_add_daily_calls_reset_functions.sql:16, 43` but no ALTER creates it).
- Whether `leads.do_not_call` column exists (written in `supabase/migrations/20260416042233_a6d1777d-3e66-429c-a070-b5643b01d603.sql:2` but no ALTER creates it).
- Whether `leads.updated_at` column exists (written in same file).
- Whether `call_logs.from_number` exists (used in `supabase/migrations/20260210_ai_intelligence_upgrade.sql:237`; `call_logs.caller_id` is used elsewhere).
- Whether `lead_journey_state.current_stage` vs `journey_stage` is the live column (two CREATEs disagree: `supabase/migrations/20260210_lead_journey_intelligence.sql:18` uses `journey_stage`; `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:60` uses `current_stage`; the first wins).
- Whether `lead_intent_signals.timeline` vs `intent_timeline` is the live column (two CREATEs disagree: `supabase/migrations/20260210144944_24834a45-2213-4650-96b1-4590eb7337ba.sql:86` uses `timeline`; `supabase/migrations/20260210_ai_intelligence_upgrade.sql:123` uses `intent_timeline`; the first wins).
- Whether `followup_playbook` has `name`/`trigger_stage`/`conditions`/`actions` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:109-120`) or `rule_name`/`journey_stage`/`min_touches`/`action_type` (second CREATE `supabase/migrations/20260210_lead_journey_intelligence.sql:91-117`) — first wins, so the second's columns are absent.
- Whether `agent_script_variants` has `weight`/`prompt_patch` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:128-146`) or `traffic_weight`/`general_prompt` (second CREATE `supabase/migrations/20260210_phases_5_8_learning.sql:15-35`) — first wins.
- Whether `lead_scoring_weights` has `factor_name`/`weight` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:249-259`) or `engagement_weight`/`recency_weight`/... (second CREATE `supabase/migrations/20260210_phases_5_8_learning.sql:120-131`) — first wins.
- Whether `optimal_calling_windows` has `converted_calls`/`conversion_rate` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:211-224`) or `appointments_set`/`appointment_rate` (second CREATE `supabase/migrations/20260210_autonomous_engine_upgrade.sql:80-93`) — first wins.
- Whether `adaptive_pacing` has `current_cpm`/`target_answer_rate` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:172-185`) or `optimal_pace`/`min_pace`/`max_pace` (second CREATE `supabase/migrations/20260210_phases_5_8_learning.sql:96-108`) — first wins.
- Whether `pacing_history` has `pacing_id`/`old_cpm`/`new_cpm` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:193-203`) or `broadcast_id`/`previous_pace`/`new_pace` (second CREATE `supabase/migrations/20260210_phases_5_8_learning.sql:73-85`) — first wins.
- Whether `ai_action_queue` has `action_type`/`priority TEXT`/`title`/`description`/`target_entity_type`/`target_entity_id`/`action_payload` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:7-25`) or `action_params`/`priority INTEGER`/`requires_approval`/`reasoning`/`source` (second CREATE `supabase/migrations/20260210_autonomous_engine_upgrade.sql:16-32`) — first wins.
- Whether `ai_operational_memory` has `memory_key`/`memory_value`/`confidence` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:36-48`) or `subject`/`content`/`importance` (second CREATE `supabase/migrations/20260210_autonomous_engine_upgrade.sql:50-65`) — first wins.
- Whether `lead_journey_state` has `total_calls`/`total_sms`/`total_emails`/`sentiment_score`/`engagement_score`/`journey_health`/`next_recommended_action`/`next_action_scheduled_at`/`stale_since`/`metadata` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:56-77`) or `call_attempts`/`calls_answered`/`sms_received`/`last_touch_at`/`interest_level`/`next_action_type`/`next_action_at`/... (second CREATE `supabase/migrations/20260210_lead_journey_intelligence.sql:12-75`) — first wins.
- Whether `journey_event_log` has `journey_state_id`/`event_source`/`from_stage`/`to_stage`/`event_data` (first CREATE `supabase/migrations/20260210050711_14b8a74a-b6c2-4486-9829-2daadec3d8d8.sql:88-99`) or `from_stage`/`to_stage`/`rule_name`/`details` (second CREATE `supabase/migrations/20260210_lead_journey_intelligence.sql:130-140`) — first wins.
- Whether `daily_battle_plans` has the full column set from `supabase/migrations/20260210_campaign_strategist.sql:14-61` or the reduced set from `supabase/migrations/20260213055304_e5ff59d4-3fa6-4078-98eb-e5f1d1616d66.sql:14-31` — first wins.
- Whether `strategic_insights` has `insight_type`/`title`/`description`/`confidence`/... (first CREATE `supabase/migrations/20260210_campaign_strategist.sql:72-112`) or `pattern_description`/`statistical_backing` (second CREATE `supabase/migrations/20260213055304_e5ff59d4-3fa6-4078-98eb-e5f1d1616d66.sql:36-49`) — first wins.
- Whether `strategic_briefings` has `briefing_date`/`metrics_comparison`/`new_insights_count`/`top_insight_id`/`model_used` (first CREATE `supabase/migrations/20260210_campaign_strategist.sql:162-188`) or `period_start`/`period_end`/`metrics_current`/`metrics_previous` (second CREATE `supabase/migrations/20260213055304_e5ff59d4-3fa6-4078-98eb-e5f1d1616d66.sql:70-85`) — first wins.
- Whether `insight_generated_rules` has `rule_type`/`rule_config`/`playbook_rule_id`/`times_applied`/`success_rate`/`status` (first CREATE `supabase/migrations/20260210_campaign_strategist.sql:126-151`) or `performance_score`/`times_fired`/`is_active` (second CREATE `supabase/migrations/20260213055304_e5ff59d4-3fa6-4078-98eb-e5f1d1616d66.sql:54-65`) — first wins.
- Whether `telnyx_assistants` has the full column set from `supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:7-31` or the richer set from `supabase/migrations/20260223_telnyx_voice_ai_platform.sql:12-70` — first wins.
- Whether `telnyx_settings` has `default_assistant_id`/`default_voice`/`default_model`/`default_transcription`/`memory_enabled`/`insights_enabled` (second CREATE `supabase/migrations/20260223_telnyx_voice_ai_platform.sql:246-275`) — first CREATE `supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:48-58` wins, so those columns are absent.
- Whether `telnyx_knowledge_bases` has `document_count` (second CREATE `supabase/migrations/20260223_telnyx_voice_ai_platform.sql:136`) — first CREATE `supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:70-84` wins, so absent.
- Whether `telnyx_insight_templates` has `telnyx_insight_id`/`webhook_url`/`is_active` (second CREATE `supabase/migrations/20260223_telnyx_voice_ai_platform.sql:88-107`) — first CREATE `supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:98-107` wins, so absent.
- Whether `telnyx_scheduled_events` has `channel`/`from_number`/`to_number`/`scheduled_at` NOT NULL (second CREATE `supabase/migrations/20260223_telnyx_voice_ai_platform.sql:156-179`) — first CREATE `supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:121-137` wins, so those are nullable.
- Whether `telnyx_conversation_insights` has `insights JSONB NOT NULL DEFAULT '[]'` (second CREATE `supabase/migrations/20260223_telnyx_voice_ai_platform.sql:211-231`) — first CREATE `supabase/migrations/20260223160016_03a27061-0e47-427c-af74-073e12d8aa57.sql:3-14` wins, so `insights` is nullable.
- Whether `phone_providers` has `is_active`/`capabilities` (second CREATE `supabase/migrations/20251211041547_a77f9fed-e2d1-4a9b-a8a5-ae14988c3723.sql:57-68`) — first CREATE `supabase/migrations/20251201000000_multi_carrier_integration.sql:10-22` wins, so absent.
- Whether `advanced_dialer_settings` has `amd_sensitivity`/`local_presence_strategy` CHECK constraints (second CREATE `supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:2-14`) — first CREATE `supabase/migrations/20251109172000_advanced_dialer_features.sql:2-14` wins, so no CHECKs.
- Whether `system_settings` has `abandonment_rate_threshold`/`answer_rate_threshold`/`enable_local_presence`/`enable_amd`/`time_zone_aware` (first CREATE `supabase/migrations/20251109171900_concurrency_management.sql:2-17`) — first wins; second CREATE `supabase/migrations/20251201052229_3e1dc2ae-c0f8-4c77-9f92-87bdd90eaf24.sql:17-27` is a no-op.
- Whether `predictive_dialing_stats` has `metadata`/`average_wait_time`/`agent_utilization` (first CREATE `supabase/migrations/20251109171900_concurrency_management.sql:36-50`) — first wins.
- Whether `ml_learning_data` has `agent_id UUID FK retell_agents(id)` (first CREATE `supabase/migrations/20251220063500_ml_learning_system.sql:11`) — first wins; second CREATE `supabase/migrations/20260109041709_a48a830e-bbc8-42b2-a107-bbe0879199fe.sql:13-31` is a no-op. Note `retell_agents` table is not created in the material — UNKNOWN.
- Whether `disposition_metrics` has `set_by CHECK IN ('ai','manual','automation')` and `ai_confidence_score numeric(5,2)` (first CREATE `supabase/migrations/20241218_disposition_metrics.sql:13, 17`) — first wins; second CREATE `supabase/migrations/20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:2-24` is a no-op.
- Whether `edge_function_errors` has `action`/`lead_id`/`campaign_id`/`workflow_id`/`error_stack`/`request_payload`/`resolved`/`resolved_at`/`resolved_by`/`resolution_notes` (first CREATE `supabase/migrations/20241218_edge_function_errors.sql:4-21`) — first wins; second CREATE `supabase/migrations/20260109034147_1315019c-8bcf-46ac-b28d-3e03a868b01a.sql:2-12` is a no-op.
- Whether `workflow_test_logs` has `mode`/`speed` CHECK constraints (first CREATE `supabase/migrations/20240115_workflow_test_logs.sql:7-8`) — first wins; second CREATE `supabase/migrations/20251212013726_27ea1b67-d56e-4d80-95b6-d4eec5b12b79.sql:2-15` is a no-op.
- Whether `api_keys` has the `mint_api_key` signature from `supabase/migrations/20260409030000_mint_api_key_helper.sql:21-97` or the later one from `supabase/migrations/20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:69-117` — the later `CREATE OR REPLACE` wins (different arg list: `p_expires_in INTERVAL` vs `p_expires_at TIMESTAMPTZ`).
- Whether `retell_agents` table exists (referenced by `ml_learning_data` FK `supabase/migrations/20251220063500_ml_learning_system.sql:11` but no CREATE in material).
- Whether `workflows` table exists (ALTERed in `supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:212-253` but no CREATE in material).
- Whether `guardian_alerts` table exists (policies added in `supabase/migrations/20260111152528_3d9ff18b-5134-4487-a65f-3d240ee84b80.sql:4-18` but no CREATE in material).
- Whether `campaign_workflows` has `auto_reply_settings` (ALTER `supabase/migrations/20251214165246_e0020afe-6166-4b85-91a5-71bd1f9167e6.sql:2-3`).
- Whether `campaigns.retry_delay_minutes` default is 15 (set in `supabase/migrations/20260409210001_a27c991e-6a74-477e-84d3-fee1536f84c6.sql:2`) — yes, FACT.
- Whether `organizations` has `owner_email`/`contact_phone`/`timezone`/`metadata`/`deleted_at` — yes, from first CREATE (`supabase/migrations/20260108_phase2_organizations.sql:29-37`); the second CREATE's omission is a no-op.
- Whether `organization_users` has `created_at` — yes, from first CREATE (`supabase/migrations/20260108_phase2_organizations.sql:61`); second CREATE omits it but is a no-op.
- Whether `dnc_list` has `source`/`expires_at` — yes, from first CREATE (`supabase/migrations/20251109172000_advanced_dialer_features.sql:38, 40`); second CREATE omits them but is a no-op.
- Whether `sms_messages` has `conversation_id`/`is_ai_generated`/`has_image`/`image_url`/`image_analysis`/`is_reaction`/`reaction_type`/`read_at` — **no**, because first CREATE wins (`supabase/migrations/20251201000000_multi_carrier_integration.sql:171-189`). INFERENCE from `IF NOT EXISTS` semantics.
- Whether `sms_context_history` and `ai_sms_settings` exist — yes, created in `supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:43-71`; `ai_sms_settings` later ALTERed (`supabase/migrations/20251201052846_e84cacb2-637d-4b88-a439-eb685686b0ab.sql:2-7`, `supabase/migrations/20251204052716_59655690-2b22-4b3d-950b-6025f1a1d416.sql:2-9`, `supabase/migrations/20251214164307_2598064a-f75d-4151-8050-43034b0e80b9.sql:2-4`, `supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:50-75`).
- Whether `sms_context_history` has RLS policies for UPDATE/DELETE — only SELECT and INSERT shown (`supabase/migrations/20251201051159_81f3b9b8-a855-40ad-b8ac-25f295546a9c.sql:110-116`).
- Whether `sms_messages` has a DELETE policy — none shown (`supabase/migrations/20251201000000_multi_carrier_integration.sql:193-200`).
- Whether `dnc_list` old policy `"Users can manage their own DNC list"` was dropped — not in the drop list (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:31-33`). INFERENCE: still active.
- Whether `ai_sms_settings` old policies `"Users can view their own settings"`/`"Users can create their own settings"`/`"Users can update their own settings"` were dropped — the drop list uses different names (`"Users can view their own AI SMS settings"` etc., `supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:61-63`). INFERENCE: old policies still active.
- Whether `autonomous_settings` old policy `"Users can manage their own autonomous settings"` was dropped — drop list uses `"Users can view their own autonomous settings"`/`"Users can update their own autonomous settings"` (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:91-92`). INFERENCE: old `FOR ALL` policy still active.
- Whether `agent_scripts` old policy `"Users can manage their own scripts"` was dropped — drop list uses `"Users can view their own agent scripts"` etc. (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:116-119`). INFERENCE: old policy still active.
- Whether `calendar_integrations` old policy `"Users can manage their own calendar integrations"` was dropped — drop list uses `"Users can view their own calendar integrations"` etc. (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:151-154`). INFERENCE: old policy still active.
- Whether `follow_up_sequences` old policy `"Users can manage their own sequences"` was dropped — drop list uses `"Users can view their own sequences"` etc. (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:186-189`). INFERENCE: old policy still active.
- Whether `disposition_metrics` old policy `"Users can manage their own disposition metrics"` (from `supabase/migrations/20260107140730_63375bb5-d565-4a9a-8c3e-81f9aa99215f.sql:37-41`) was dropped — drop list uses `"Users can view their own disposition metrics"`/`"System can insert disposition metrics"` (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:221-222`). INFERENCE: old `FOR ALL` policy still active.
- Whether `pipeline_boards` old policies were dropped — drop list uses `"Users can view their own pipeline boards"` etc. (`supabase/migrations/20260108_phase2_add_org_to_additional_tables.sql:249-252`), matching the originals (`supabase/migrations/20251103034801_c2405dd3-ed2b-4c4a-a3a3-a8bff2898817.sql:55-69`). FACT: dropped correctly.
- Whether `campaigns`/`leads`/`phone_numbers`/`voice_broadcasts`/`workflows`/`call_logs`/`dispositions` old policies were dropped — drop lists match the original names (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:38-41, 86-89, 132-135, 178-181, 224-227, 270-271, 302-305`). FACT: dropped correctly.
- Whether `call_logs` has an UPDATE or DELETE policy — none shown after Phase 2 (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:274-285`). INFERENCE: only SELECT and INSERT.
- Whether `leads` has a DELETE policy — yes, org-match (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:111-115`).
- Whether `phone_numbers` has a DELETE policy — yes, org-match (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:157-161`).
- Whether `campaigns` has a DELETE policy — yes, org-match AND `user_id=auth.uid()` (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:64-69`).
- Whether `dispositions` has a DELETE policy — yes, org-match (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:327-331`).
- Whether `voice_broadcasts` has a DELETE policy — yes, org-match (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:203-207`).
- Whether `workflows` has a DELETE policy — yes, org-match (`supabase/migrations/20260108_phase2_add_org_to_core_tables.sql:249-253`).
- Whether `organizations` has a DELETE policy — none shown. INFERENCE: no user can delete an org via RLS; only service_role.
- Whether `organization_users` has a DELETE policy — yes, `is_org_admin(organization_id)` (`supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:115-118`).
- Whether `user_roles` has an INSERT/UPDATE/DELETE policy for non-service-role — only SELECT (own) and ALL (service_role) shown (`supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:55-62`). INFERENCE: users cannot self-grant roles.
- Whether `api_key_audit_log` has an INSERT policy — none shown (`supabase/migrations/20260409020305_api_keys.sql:56-59`). INFERENCE: only service_role can insert.
- Whether `credit_transactions` has an INSERT policy for users — none shown (`supabase/migrations/20260124_white_label_credits.sql:141-149`). INFERENCE: only service_role.
- Whether `usage_summaries` has an INSERT/UPDATE policy for users — none shown (`supabase/migrations/20260124_white_label_credits.sql:199-207`). INFERENCE: only service_role.
- Whether `organization_credits` has an INSERT policy for users — none shown (`supabase/migrations/20260124_white_label_credits.sql:70-86`). INFERENCE: only service_role.
- Whether `check_credit_balance`/`deduct_call_credits`/`add_credits`/`reserve_credits`/`finalize_call_cost`/`check_auto_recharge` are `SECURITY DEFINER` — yes, all shown as such (`supabase/migrations/20260124_white_label_credits.sql:288, 401, 474`; `supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:167, 314, 528, 618, 723`).
- Whether `get_organization_for_user`/`get_organization_for_lead` are `SECURITY DEFINER` — yes (`supabase/migrations/20260124_white_label_credits_v2_enhanced.sql:551, 571`).
- Whether `claim_pending_dispatches` is `SECURITY DEFINER` — no, plain `LANGUAGE SQL` (`supabase/migrations/20260415230836_605b13a6-9584-4a9d-8008-8724b54b2505.sql:7`), granted to service_role only (`:25`).
- Whether `reset_stale_daily_calls`/`increment_daily_calls_with_reset` are `SECURITY DEFINER` — yes (`supabase/migrations/20260115000000_add_daily_calls_reset_functions.sql:9, 34`).
- Whether `mint_api_key` is `SECURITY DEFINER` — yes (`supabase/migrations/20260409030000_mint_api_key_helper.sql:97`; `supabase/migrations/20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:84`).
- Whether `touch_api_key` is `SECURITY DEFINER` — yes (`supabase/migrations/20260409020305_api_keys.sql:88`).
- Whether `prune_api_key_audit_log` is `SECURITY DEFINER` — yes (`supabase/migrations/20260409030000_mint_api_key_helper.sql:127`; `supabase/migrations/20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:128`).
- Whether `has_role` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:67`).
- Whether `get_user_organizations`/`user_in_organization`/`get_user_org_role`/`is_org_admin` are `SECURITY DEFINER` — yes (`supabase/migrations/20260108_phase2_organizations.sql:78, 89, 103, 116`; `supabase/migrations/20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:42, 56, 69`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260108_phase2_organizations.sql:169-175`).
- Whether `update_daily_usage_summary` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260124_white_label_credits.sql:480-541`).
- Whether `update_script_performance_metrics` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20251205200000_script_management.sql:107-169`).
- Whether `update_conversation_timestamp` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20251220162500_add_ai_conversations.sql:59-67`).
- Whether `update_inbound_transfers_updated_at` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20251229000000_inbound_transfers.sql:101-107`).
- Whether `update_smart_lists_updated_at` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260107024232_abad304f-2fc1-4b64-851d-d6304e53801c.sql:71-77`).
- Whether `update_lj_memory_updated_at` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260107031814_dbb6ea1e-6bbb-46b3-9355-73cded46d621.sql:76-82`).
- Whether `cleanup_old_guardian_alerts` is `SECURITY DEFINER` — yes (`supabase/migrations/20260111152528_3d9ff18b-5134-4487-a65f-3d240ee84b80.sql:24`).
- Whether `expire_old_actions`/`save_operational_memory`/`recalculate_calling_windows`/`seed_default_playbook`/`select_script_variant`/`update_variant_stats`/`calibrate_lead_scoring_weights`/`rebalance_variant_weights` are `SECURITY DEFINER` — yes (`supabase/migrations/20260210143830_635eb8a9-8edb-4906-a202-29a709a53e6a.sql:11, 36, 71, 123, 229, 274, 294, 370`).
- Whether `seed_disposition_values`/`recalculate_number_health`/`get_funnel_trend` are `SECURITY DEFINER` — yes (`supabase/migrations/20260210144944_24834a45-2213-4650-96b1-4590eb7337ba.sql:32, 148`; `supabase/migrations/20260210_campaign_strategist.sql:284`).
- Whether `select_sms_variant`/`update_sms_variant_stats` are `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260329_autonomous_workflow_intelligence.sql:217, 280`).
- Whether `chi_square_2x2`/`sigmoid`/`predict_lead_conversion` are `SECURITY DEFINER` — no, plain (`supabase/migrations/20260329_predictive_intelligence.sql:238, 266, 275`).
- Whether `get_telnyx_assistant_for_call` is `SECURITY DEFINER` — yes (`supabase/migrations/20260223190717_19da5c05-da52-451e-be00-c97400078e06.sql:195`); the later version is not (`supabase/migrations/20260223_telnyx_voice_ai_platform.sql:298`).
- Whether `calculate_time_wasted_score`/`extract_opener_from_transcript`/`normalize_opener_text`/`update_opener_analytics`/`update_voicemail_analytics` are `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260118_script_analytics_enhancement.sql:224, 265, 281, 352, 419`).
- Whether `generate_webhook_key` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260204202911_98c96957-94eb-4cef-b196-9b780ec42619.sql:92`).
- Whether `api_keys_touch_updated_at` is `SECURITY DEFINER` — no, plain plpgsql (`supabase/migrations/20260409020305_api_keys.sql:68`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`; re-created `supabase/migrations/20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:104-110`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_updated_at_column` is `SECURITY DEFINER` — yes (`supabase/migrations/20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:6`).
- Whether `update_organizations_updated_at` is `SECURITY DEFINER` — no (`supabase/migrations/20260108_phase2_organizations.sql:175`).
- Whether `update_