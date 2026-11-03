# security::rls-newest-migrations

- status: completed
- tldr: Newest-era (10/29-11/03) migrations audited: RLS on all new tables, org-scoped permissive policies, DEFINDER-R helpers mostly gated; 3 findings

Audited 11 migration files (20261029010000..20261103023000) for RLS posture. FINDINGS: (1) RLS enabled on every table CREATED this era (voice_credentials, call_live_transcripts, coach_proposals, stripe_events [deny-all], 9 d2d tables). The era does NOT enable RLS on the 8 pre-existing core tables or 4 SMS tables; it only ADDS org-scoped policies (predicate organization_id IS NOT NULL AND user_in_organization(organization_id); delete gated by is_org_admin). All 'Company members...' policies are PERMISSIVE (OR with legacy per-user policies, intended widening to org teammates); the only RESTRICTIVE policy is 'Billing lock'. Cross-tenant DEFINER helpers: all gated (org_has_pack/set_org_packs/coach_recent_corrections/coach_move_stage/d2d_company_members/...) except one. Three findings: (A) org_in_good_standing is SECURITY DEFINER granted to authenticated with NO membership check (billing_lock.sql:94-121) -> any signed-in user can read another tenant's billing standing (low-sev info leak). (B) The RESTRICTIVE 'Billing lock' covers only leads/campaigns/call_logs/phone_numbers (billing_lock.sql:206); SMS, transcripts, coach_proposals and all d2d tables are NOT billing-locked. (C) d2d_api_keys.token_hash and d2d_webhooks.url are readable/writable by ANY org member via the generic member policies (workspace:131-133) with no admin gating. Also confirmed the historical fail-open bug in enforce_organization_scope (DEFINER) was FIXED to SECURITY INVOKER at phase1_scope_guard_fix.sql:4-23.

## Artifact

**Findings**

ERA SCOPE: 11 migration files read in full (2026-10-29..2026-11-03). Uniform, deliberate 'phase 1 org scope' + product-pack pattern. 1. RLS ENABLED (new in-era tables): voice_credentials (browser_phone.sql:47), call_live_transcripts (browser_phone.sql:86), coach_proposals (live_coach.sql:75), stripe_events (billing_lock.sql:164, deny-all: RLS on + ZERO policies, comment :162), d2d_territories/properties/knocks (door_to_door_core.sql:178-180), d2d_settings/positions/messages/appointments/api_keys/webhooks (door_to_door_workspace.sql:116-121). 2. ERA DOES NOT ENABLE RLS ON PRE-EXISTING TABLES: phase1_org_scope.sql has no ENABLE ROW LEVEL SECURITY, it only ADDS columns/policies/triggers to 8 core tables (leads, campaigns, phone_numbers, call_logs, dnc_list, dispositions, pipeline_boards, lead_pipeline_positions) assumed to already have RLS (comment :2-3). Same 4 SMS tables (sms:4). So 'RLS on' for those 12 is INFERRED, not asserted here. 3. POLICIES ORG-SCOPED: predicate `organization_id IS NOT NULL AND user_in_organization(organization_id)` for view/insert/update, `... AND is_org_admin(organization_id)` for delete; identical on 8 core (phase1:82-85), 4 SMS (sms:189-192), 3 d2d core (core:190-193), 6 d2d workspace (workspace:131-134). 4. PERMISSIVE BY DESIGN except billing: every 'Company members...' policy is default PERMISSIVE so ORs with legacy per-user policies and ENLARGES visibility to all org teammates (phase1:2-3; sms:176). Only RESTRICTIVE policy in era is 'Billing lock' (billing_lock.sql:209 FOR ALL, org_in_good_standing OR is_platform_operator). Core/SMS insert isolation is enforced by TRIGGER tenant_scope_guard, not RLS (phase1:89-91). 5. SECURITY DEFINER helpers classified: org_has_pack DEFINER gated by user_in_organization (industry_packs:17,35) safe; set_org_packs DEFINER gated is_org_admin (:53) safe; default_organization_for_user DEFINER no gate but REVOKED from authenticated (fix :23) fixed; set_organization_from_user DEFINER revoked authenticated safe; enforce_organization_scope was DEFINER fail-open (phase1:93), fixed SECURITY INVOKER (fix:5); append_call_live_transcript DEFINER service_role-only (browser_phone:177) safe; coach_recent_corrections DEFINER granted authenticated but requires user_in_organization (live_coach:214-222,259) safe; coach_move_stage DEFINER service_role-only (:332) safe; coach_proposal_decide_guard INVOKER (live_coach:113-121) safe; guard_organization_billing_columns INVOKER revoked (billing_lock:80-82) safe; org_in_good_standing DEFINER granted authenticated NO membership check (billing_lock:121) -> FINDING cross-tenant billing-state info leak; org_access_allowed DEFINER but ANDs membership -> no leak; d2d_scope_knock DEFINER revoked (core:145) safe; d2d_apply_knock/d2d_knock_books_appointment DEFINER revoked safe; d2d_company_members DEFINER reads auth.users but gated by user_in_organization (members:35-40) safe. 6. Trigger order on d2d_knocks: alphabetical d2d_scope_knock then tenant_scope_guard correct. 7. FINDING over-permission: d2d_api_keys.token_hash (workspace:67-78) readable AND writable by ANY org member via generic policies (workspace:131-133); d2d_webhooks url likewise member-writable (SSRF surface). 8. FINDING billing-lock coverage gap: RESTRICTIVE 'Billing lock' ONLY on leads/campaigns/call_logs/phone_numbers (billing_lock:206); 4 SMS tables, call_live_transcripts, coach_proposals and all 9 d2d tables are NOT locked, so a paused tenant still reads/writes them. 9. subscription_status_vocabulary.sql:30-46 only WIDENS the CHECK to Stripe vocabulary; tenant writes still blocked by guard (comment :26-28).

**evidence**

- phase1_org_scope.sql:93-109 enforce_organization_scope SECURITY DEFINER fail-open
- phase1_scope_guard_fix.sql:4-23 SECURITY INVOKER fix + REVOKE default_organization_for_user from authenticated
- phase1_org_scope.sql:82-85; sms_per_organization.sql:189-192; door_to_door_core.sql:190-193; door_to_door_workspace.sql:131-134 org-scoped permissive policies
- billing_lock.sql:206-214 RESTRICTIVE 'Billing lock' on 4 core tables only
- billing_lock.sql:94-121 org_in_good_standing DEFINER granted authenticated no membership check
- door_to_door_workspace.sql:67-78 d2d_api_keys.token_hash + :131-133 any member view/insert/update
- door_to_door_members.sql:8-40 d2d_company_members gated by user_in_organization
- industry_packs.sql:9-35 org_has_pack DEFINER gated by user_in_organization
- browser_phone.sql:47,86 RLS enabled; :175-178 append_call_live_transcript service_role only
- live_coach.sql:75 RLS; :178-259 coach_recent_corrections membership check; :332 coach_move_stage service_role only
- door_to_door_core.sql:178-180 RLS enabled; :124-149 d2d_scope_knock
- subscription_status_vocabulary.sql:30-46 constraint widened

**open_questions**

- Does live DB actually have RLS enabled on the 8 core + 4 SMS tables (pre-existing, not asserted in-era)? No DB access used.
- Is org_in_good_standing's cross-tenant billing-state disclosure reachable from PostgREST given EXECUTE granted to authenticated (billing_lock:121)? Not tested live.
- Are d2d_api_keys token_hash values high-entropy? Token generation is in app code, not these migrations.
- Should 'Billing lock' RESTRICTIVE policy be extended to SMS/coach/d2d tables? Design intent not stated in-era.

**what_i_did_not_check**

- Live DB state: did not connect to Supabase to verify RLS enabled on leads/campaigns/call_logs/phone_numbers/dnc_list/dispositions/pipeline_boards/lead_pipeline_positions or the 4 SMS tables.
- Definitions of user_in_organization(uuid), is_org_admin(uuid), is_platform_operator() are in earlier migrations not read; internal scoping unverified.
- Pre-existing per-user policies on the 4 SMS tables (cited but not read), so OR-combination is inferred from comments.
- 20261028210000_wholesale_core.sql (10/28, just before era) out of scope, not read.
- Edge functions (twilio-sms-webhook, coach-suggest/coach-decide, stripe-webhook) and whether they run as service_role.
- Realtime row authorization for call_live_transcripts (REPLICA IDENTITY FULL + supabase_realtime publication browser_phone.sql:87,105-117).
- No live pg_policies verification query was run; findings are migration-source only.

**confidence**: medium