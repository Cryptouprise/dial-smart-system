# security::rls-org-gating-sample

- status: completed
- tldr: Repo vs live diverge: live core tables are per-user OR same-company; SMS/dialing_queues have no org gate live; stricter org-only contracts are main-only.

RLS org-gating sample complete (security::rls-org-gating-sample). Headline: repo migrations and the live DB diverge, so I reported both. LIVE (emonjusymdripmkvtttc, LIVE-SCHEMA.md TRUTH 10/28 + 10/29 update): core tables leads/campaigns/call_logs/phone_numbers still carry PER-USER policies (auth.uid()=user_id) with org-membership company policies ADDED beside them (OR, permissive), so effective access = own rows OR same-company teammates. Same for dnc_list/dispositions/pipeline_boards/lead_pipeline_positions. SMS tables (sms_conversations/messages/context_history/ai_sms_settings) are PER-USER ONLY live (no organization_id live). dialing_queues live has no org gate (per-user-via-campaign). organizations/organization_users are org-gated. organization_credits/credit_transactions/usage_summaries/user_credentials/api_keys are ABSENT from the live capture. MAIN-ONLY stricter contracts exist (July routing contract drops per-user policies on the core four for strict org+owner gating; Oct billing lock adds RESTRICTIVE org-standing policy) but were NOT applied live. api_keys in main is per-user-only in RLS (org binding via FK+trigger). No policy anywhere grants cross-user read; residual exposure = multi-org user's own rows visible regardless of org, plus dialing_queues/SMS with no org predicate live. Evidence: 17 file:line refs in the node artifact.

## Artifact

**Findings**

TWO-DATABASE REALITY: repo migrations and the live DB disagree. There is an authoritative live capture (docs/wholesale/audit/phase1/LIVE-SCHEMA.md line 1: 'pulled from the production DB 2026-10-28 ... This is TRUTH') plus a 2026-10-29 update section that OVERRIDES it. The answer to 'org membership vs user identity' depends entirely on which DB; both are reported.

LIVE (project emonjusymdripmkvtttc, 10/28-10/29):
- leads, campaigns, call_logs, phone_numbers still carry PER-USER policies (auth.uid()=user_id) at the base layer (LIVE-SCHEMA.md:21-25). The 10/29 phase-1 migration ADDED company-membership policies beside them, OR-ed (permissive) (LIVE-SCHEMA.md:55; 20261029142121_phase1_org_scope.sql:82-85). So the effective LIVE gate is: (a) ORG-MEMBERSHIP via helper for teammates, OR (b) user identity for the creator's own rows.
- Company policies gate on ORG MEMBERSHIP through the helper: 'organization_id IS NOT NULL AND public.user_in_organization(organization_id)' for view/insert/update, 'is_org_admin(organization_id)' for delete. user_in_organization(uuid) is the ONE-arg form that reads auth.uid() (20260109034232...:38-49; LIVE-SCHEMA.md:43,57).
- dnc_list, dispositions, pipeline_boards, lead_pipeline_positions: per-user base policies (LIVE-SCHEMA.md:26-29) + organization_id and company policies added 10/29 (LIVE-SCHEMA.md:51,55). Same effective OR.
- sms_conversations, sms_messages, sms_context_history, ai_sms_settings: PER-USER ONLY (auth.uid()=user_id); organization_id does NOT exist live (LIVE-SCHEMA.md:13-14,30-33). The org-gated SMS migration (20261029190000_sms_per_organization.sql) is MAIN-ONLY, not applied live.
- dialing_queues: NOT in the live policy capture. Its only repo policy (20250619152448...:98-103) is per-user-via-campaign: 'auth.uid() IN (SELECT user_id FROM campaigns WHERE id = dialing_queues.campaign_id)'. No org predicate live.
- organizations / organization_users: genuinely org-gated (user_in_organization(id) / is_org_admin(id), LIVE-SCHEMA.md:34-40).
- organization_credits, credit_transactions, usage_summaries, user_credentials, api_keys: NOT present in the captured live schema; billing_ownership_boundary states the white-label credit migration 'was not present in the captured live schema' (20260713065000:6-9). Presence live is UNVERIFIED.

MAIN-ONLY (repo, not live):
- Credits (organization_credits / credit_transactions / usage_summaries): org-gated on the ledger org id via subquery 'organization_id IN (SELECT organization_id FROM organization_users WHERE user_id = auth.uid())' (20260124_white_label_credits.sql:70-74,141-145,199-203); later replaced by SELECT-only 'public.user_in_organization(auth.uid(), organization_id)' + service_role (20260713065000:128-150).
- api_keys: PER-USER ONLY, no org predicate in RLS: USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id) (20260409020305:50-59; dup 20260410135538:45-52). Org ownership enforced only by FK + trigger enforce_integration_tenant (20260712070000:682-715), not by the policy.
- user_credentials: originally per-user (20251103034349:113-128), now fully QUARANTINED to service_role-only with browser grants revoked (20260713063000:8,44-51).
- d2d_* (territories, properties, knocks, settings, positions, messages, appointments, api_keys, webhooks): org-membership policies 'organization_id IS NOT NULL AND public.user_in_organization(organization_id)' + is_org_admin delete + tenant_scope_guard trigger (20261102234500:190-195; 20261103020000:131-136). MAIN-ONLY (created 11/02-11/03).
- MAIN has a STRICTER July contract NOT reflected live: 20260712070000 DROPs the per-user policies on campaigns/leads/phone_numbers/call_logs and installs 'user_in_organization(auth.uid(), organization_id)' reads + '(user_id = auth.uid() AND user_in_organization(...))' writes (lines 202-311), with NOT NULL + composite FK to organization_users (138-177) and immutable-owner triggers. Live still shows per-user policies, so this was NOT applied live.
- 20261029200000_billing_lock.sql adds a RESTRICTIVE 'Billing lock' ANDed onto the four core tables: org_in_good_standing(organization_id) OR is_platform_operator() (203-214); it also documents that live core tables are 'per-user: auth.uid() = user_id' AND 'company: user_in_organization(organization_id)' (184-188).

NET SECURITY READING (LIVE): no policy grants cross-user read (per-user requires user_id = auth.uid()), so user A cannot read user B's rows; the org gate exists only as an ADDITIONAL permissive path for same-company teammates. Residual exposure: (a) a multi-org user's own rows are all visible regardless of which org they belong to, because the per-user path has no org predicate; (b) dialing_queues and the four SMS tables have no org predicate live at all. FACT throughout; helper overload detail: both user_in_organization(uuid,uuid) [explicit user; 20260108_phase2_organizations.sql:87, redefined 20260712070000:179] and user_in_organization(uuid) [reads auth.uid(); 20260109034232:38] exist across history; live uses the one-arg form.

**evidence**

- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:1 (TRUTH capture 10/28)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:21-33 (core+SMS per-user only)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:34-40 (org tables org-gated)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:43,57 (1-arg user_in_organization live)
- docs/wholesale/audit/phase1/LIVE-SCHEMA.md:50-55 (10/29 company policies added, OR-ed, org-gated)
- supabase/migrations/20261029142121_phase1_org_scope.sql:82-85
- supabase/migrations/20261029190000_sms_per_organization.sql:17-20,189-192
- supabase/migrations/20260712070000_multi_organization_routing_contract.sql:179-195,202-311,682-715
- supabase/migrations/20260124_white_label_credits.sql:70-74,141-145,199-203
- supabase/migrations/20260713065000_billing_ownership_boundary.sql:6-9,128-150
- supabase/migrations/20260409020305_api_keys.sql:50-59
- supabase/migrations/20260410135538_260acbba-269c-4326-a263-033f8c9c2ce6.sql:45-52
- supabase/migrations/20260713063000_quarantine_browser_readable_credentials.sql:8,44-51
- supabase/migrations/20250619152448-97fb6549-a522-4654-a60c-9cd1f5ea5e81.sql:97-103
- supabase/migrations/20261029200000_billing_lock.sql:184-214
- supabase/migrations/20261102234500_door_to_door_core.sql:190-195
- supabase/migrations/20261103020000_door_to_door_workspace.sql:131-136

**validation**

riprgrep of CREATE POLICY / ENABLE ROW LEVEL SECURITY across all ~150 migration files, then full reads of 11 governing migrations + LIVE-SCHEMA.md + LIVE-VS-MAIN-GATES.md + 2 live-only patches. No DB connection; read-only. Cross-checked live vs main using the repo's own TRUTH capture.

**open_questions**

- Is the live DB still at the 10/28-10/29 state, or have 20261029190000 / 2026071306x been applied since? (schema_migrations not queried)
- Do api_keys, organization_credits, credit_transactions, usage_summaries, user_credentials actually exist live (docs omit them)?
- What is the live policy on dialing_queues (not captured)?
- Do service_role edge functions bypass tenant gating in practice?

**edge_cases_considered**

- two-database divergence (repo vs live capture)
- helper-function overloads (1-arg vs 2-arg user_in_organization)
- tables absent from live capture
- migration ordering / unapplied migrations

**what_i_did_not_check**

- Live DB directly; migration-applied order (supabase_migrations.schema_migrations).
- Tables outside the sampled list: dnc_suppressions, slack_users, coach_proposals, call_live_transcripts, campaign_leads / campaign_phone_pools live policies, provider_dispatch_claims, voice_credentials, calendar_*, sequence_templates, ai_* learning tables.
- The other ~8 live_only patch files (only harden_definer_helpers + close_cross_tenant_write_leaks read).
- Edge-function layer authorization (can bypass RLS entirely via service_role).
- Whether the strict July routing contract or Oct billing-lock migrations are intended for the next deploy.

**confidence**: high