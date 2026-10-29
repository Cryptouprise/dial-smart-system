# LIVE schema facts, pulled from the production DB 2026-10-28 (information_schema + pg_policies). This is TRUTH; repo migrations may differ.

## Columns (name type [NOT NULL] [default])
leads: id uuid NN, user_id uuid NN, organization_id uuid, phone_number text NN, first_name, last_name, email, company, address, city, state, zip_code, status text NN default 'new', lead_source, priority int default 1, tags ARRAY, timezone text default 'America/New_York', preferred_contact_time, do_not_call bool default false, ghl_contact_id, last_contacted_at tstz, next_callback_at tstz, notes, custom_fields jsonb default '{}', created_at, updated_at
campaigns: id, user_id NN, organization_id uuid, name NN, description, status NN default 'draft', provider NN default 'retell', agent_id text, telnyx_assistant_id uuid, workflow_id uuid, script, calls_per_minute int default 5, max_attempts int default 3, max_calls_per_day int default 2, retry_delay_minutes int default 15, calling_hours_start time default 09:00, calling_hours_end time default 17:00, timezone default 'America/New_York', sms_on_no_answer bool, sms_from_number, sms_template, metadata jsonb, created_at, updated_at
call_logs: id, user_id NN, organization_id uuid, lead_id uuid, campaign_id uuid, phone_number text NN (dialed), caller_id text NN (our from-number), status NN, outcome, provider text default 'retell', retell_call_id, telnyx_call_control_id, telnyx_call_session_id, telnyx_conversation_id, telnyx_assistant_id, agent_id, agent_name, amd_result, amd_type, started_at, answered_at, ended_at, duration_seconds int default 0, recording_url, transcript text, call_summary, ai_analysis jsonb, auto_disposition, confidence_score numeric, sentiment, notes, retell_cost_cents int, cost_breakdown jsonb, token_usage jsonb, opener_extracted, opener_score, time_wasted_score, time_wasted_reason, created_at
phone_numbers: id, user_id NN, organization_id uuid, number text NN, area_code NN, provider text default 'twilio' (values seen: retell|telnyx|twilio), status NN default 'active', rotation_enabled bool default true, is_spam bool NN, daily_calls int NN, max_daily_calls int default 100, last_daily_reset date, quarantine_until date, retell_phone_id, twilio_sid, twilio_verified, twilio_verified_at, sip_trunk_provider, sip_trunk_config jsonb, sip_trunk_config_id uuid, purpose default 'general_rotation', call_direction NN default 'outbound', allowed_uses text[], capabilities jsonb, tags text[], friendly_name, caller_name, carrier_name, line_type, is_voip, is_stationary, external_spam_score, stir_shaken_attestation, last_used, last_call_at, last_lookup_at, created_at, updated_at
dnc_list: id, user_id NN, phone_number text NN, reason, added_at, created_at   (NO phone_number_normalized column live; NO organization_id)
dispositions: id, user_id NN, name NN, pipeline_stage text NN, color NN, description, auto_actions jsonb default '[]', created_at, updated_at   (NO organization_id)
pipeline_boards: id, user_id NN, name NN, description, position int NN, campaign_id uuid, disposition_id uuid, settings jsonb, created_at, updated_at   (boards act as stages; NO separate pipeline_stages table live)
lead_pipeline_positions: id, user_id NN, lead_id NN, pipeline_board_id NN, position int NN, moved_by_user bool default true, moved_at, notes, created_at
agent_scripts: NOT FOUND live under that name (UNKNOWN - scripts may live in campaigns.script or a differently named table)
sms_conversations: id, user_id NN, contact_phone text NN, contact_name, last_from_number text, last_message_at NN, unread_count, context_summary, metadata jsonb, created_at, updated_at   (NO lead_id, NO organization_id)
sms_messages: id, user_id NN, conversation_id uuid, lead_id uuid, direction NN, from_number NN, to_number NN, body NN, status NN default 'pending', provider_type default 'twilio', provider_message_id, is_ai_generated, has_image, image_url, image_analysis jsonb, is_reaction, reaction_type, error_message, sent_at, delivered_at, read_at, metadata jsonb, created_at   (NO organization_id)
sms_context_history: id, user_id NN, conversation_id uuid, context_window text NN, summary, token_count, created_at
ai_sms_settings: id, user_id NN, enabled bool default true, auto_response_enabled bool default false, ai_provider default 'lovable', ai_personality, custom_instructions, knowledge_base, business_hours_only, prevent_double_texting, double_text_delay_seconds, context_window_size, max_context_tokens, max_history_items, include_lead_context/call_history/sms_history, enable_calendar_integration, calendar_booking_link, enable_image_analysis, enable_reaction_detection, dynamic_variables_enabled, use_number_rotation, retell_agent_id, retell_llm_id, retell_voice_id, created_at, updated_at
organizations: id, name NN, slug NN, billing_email, billing_enabled bool default false, subscription_tier NN default 'basic', subscription_status NN default 'active', stripe_customer_id, trial_ends_at, plan_id text, unlimited_access bool NN default false, unlimited_reason, phone_mode, max_users/max_campaigns/max_phone_numbers/monthly_call_limit ints, settings jsonb default '{}', created_at, updated_at
organization_users: id, organization_id NN, user_id NN, role text NN default 'member', joined_at
user_roles: id, user_id NN, role app_role (enum) NN, created_at, updated_at

## Policies (table | name | cmd | USING | CHECK) - note: core tables are still PER-USER (auth.uid() = user_id), not per-organization
leads | Users can manage their own leads | ALL | auth.uid() = user_id
campaigns | Users can manage their own campaigns | ALL | auth.uid() = user_id
call_logs | Users can manage their own call logs | ALL | auth.uid() = user_id
phone_numbers | Users can view/insert/update/delete their own phone numbers | SELECT/INSERT/UPDATE/DELETE (4 policies) | auth.uid() = user_id
dnc_list | Users can manage their own DNC list | ALL | auth.uid() = user_id
dispositions | Users can view/create/update/delete their own dispositions | 4 policies | auth.uid() = user_id
pipeline_boards | Users can view/create/update/delete their own pipeline boards | 4 policies | auth.uid() = user_id
lead_pipeline_positions | Users can view/create/update/delete their own lead positions | 4 policies | auth.uid() = user_id
sms_conversations | Users can view/create/update/delete their own conversations | 4 policies | auth.uid() = user_id
sms_messages | Users can view/create/update their own messages | 3 policies (no DELETE) | auth.uid() = user_id
sms_context_history | Users can view/create their own context | 2 policies | auth.uid() = user_id
ai_sms_settings | Users can view/create/update their own settings | 3 policies | auth.uid() = user_id
organizations | Users can view organizations they belong to | SELECT | user_in_organization(id)
organizations | Org admins can update their organization | UPDATE | is_org_admin(id)
organizations | org_admin_update | UPDATE | id IN (select organization_id from organization_users where user_id=auth.uid() and role in ('owner','admin'))
organizations | Authenticated users can create organizations | INSERT | CHECK auth.uid() IS NOT NULL
organization_users | Users can view members of their organizations | SELECT | user_in_organization(organization_id)
organization_users | Org admins can add members | INSERT | CHECK is_org_admin(organization_id) OR (auth.uid()=user_id AND role='owner' AND org_has_no_members(organization_id))
organization_users | Org admins can update member roles / remove members | UPDATE / DELETE | is_org_admin(organization_id)

## Functions that exist live (signatures)
user_in_organization(uuid) bool; is_org_admin(uuid) bool; get_user_org_role(uuid); has_role(uuid, app_role) bool; is_platform_operator() bool; org_has_no_members(uuid) bool; check_credit_balance(uuid, numeric); reserve_credits(...); finalize_call_cost(...); add_credits(...); apply_plan_to_organization(uuid,text); redeem_promo_code(text); handle_new_user() trigger; guard_organization_billing_columns() trigger (SECURITY INVOKER); guard_campaign_has_agent() trigger; merge_custom_fields (exists per migration 20260414203507, signature UNKNOWN - check before use)

## Live data counts (10/28): organizations 1 (Default Organization 11824e05-24e3-4dc3-b684-5d0bc7c436d6), leads 3,303 (5 NULL org), call_logs 5,635 (519 NULL org), phone_numbers 40, campaigns 8, dialing_queues 511, dnc_list 28.

## Implication for every build job
Teammates in one company cannot see each other's rows today (per-user policies). New tables MUST use organization_id + user_in_organization(). Where you touch an existing per-user table's policy, keep `auth.uid() = user_id` working as an OR so nothing that works today breaks, and add the organization predicate.

## UPDATE 2026-10-29 after migrations phase1_org_scope + industry_packs (this section OVERRIDES anything above it)
- organization_id now EXISTS on dnc_list, dispositions, pipeline_boards, lead_pipeline_positions (nullable, backfilled, FK organizations ON DELETE RESTRICT, indexed).
- organization_id is NOT NULL on leads, campaigns, phone_numbers, call_logs. Zero NULLs anywhere on the 8 tables.
- New functions: default_organization_for_user(uuid) uuid; set_organization_from_user() trigger; enforce_organization_scope() trigger; org_has_pack(uuid,text) bool; set_org_packs(uuid,text[]) jsonb. All SECURITY DEFINER, search_path pinned, revoked from PUBLIC/anon.
- Triggers on all 8 tables: `set_organization_from_user` BEFORE INSERT (fills organization_id from the user's membership when NULL) and `tenant_scope_guard` BEFORE INSERT OR UPDATE (authenticated/anon may only write a company they belong to; organization_id may never change). service_role/postgres exempt.
- Policies on all 8 tables (PERMISSIVE, OR-ed with the old per-user ones which still exist): "Company members can view" SELECT, "Company members can insert" INSERT, "Company members can update" UPDATE, all `organization_id IS NOT NULL AND user_in_organization(organization_id)`; "Company admins can delete" DELETE `is_org_admin(organization_id)`.
- Packs: organizations.settings->'packs' jsonb array of 'solar_exit'|'wholesale_re'|'door_to_door'. Live org currently has no packs set.
- user_in_organization(uuid) has ONE argument (reads auth.uid()). merge_custom_fields(uuid,jsonb) exists.
- EDGE FUNCTIONS: live code = pre-2026-07-13, NO certification gates; GitHub main has 74 gated functions. Build on `supabase/functions-live/<slug>/` snapshots, never on `supabase/functions/<slug>/` for an EXISTING function. New functions are fine.
