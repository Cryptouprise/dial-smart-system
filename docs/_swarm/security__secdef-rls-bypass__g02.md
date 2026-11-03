# security::secdef-rls-bypass::g02

- status: completed
- tldr: 4 migrations audited; 11 fns. HIGH risk: file-A org helpers take caller user_uuid with no auth.uid() check and were never revoked. Later lockdowns harden the daily_calls/guardian fns.

DONE: Audited the 4 specified migrations for every SECURITY DEFINER function and every EXECUTE grant (name+file:line, language/volatility, RETURNS trigger?, all GRANT/REVOKE, tables read/written, explicit tenant check). 11 functions found (10 DEFINER + 1 non-definer trigger fn).

TOUCHED: none (research only; no files or live systems modified).

EVIDENCE: read all 4 files; findstr /n confirmed only 20260115000000 contains GRANTs (D:57-60: authenticated + service_role for reset_stale_daily_calls and increment_daily_calls_with_reset). Cross-referenced later migrations 20260701132102 (Group A revokes cleanup_old_guardian_alerts/increment_daily_calls_with_reset/reset_stale_daily_calls; Group B revokes anon on the 1-arg org helpers) and 20260712070000:194-195 (revokes 2-arg user_in_organization).

RESULT: Key risk = file A defines org helpers taking caller-supplied user_uuid with NO auth.uid() check: get_user_organizations A:76, get_user_org_role(uuid,uuid) A:101, is_org_admin(uuid,uuid) A:114 (and user_in_organization(uuid,uuid) A:87). Because file B uses 1-arg signatures, these coexist as overloads; the vulnerable variants appear never revoked -> cross-tenant info disclosure. cleanup_old_guardian_alerts C:21 and the two daily_calls fns D:6/D:29 also lack tenant checks (D1/D2 were explicitly GRANTed to authenticated) but are hardened to service_role-only by 20260701132102. B1-B3 correctly use auth.uid(). Full compact table + per-function risk verdicts delivered in the artifact.

COULD_NOT / did not check: live-DB privilege state; whether the later lockdown migrations were actually applied to prod; exhaustive per-signature REVOKE search across all migrations (grep-based); RLS on phone_numbers/guardian_alerts.
CONFIDENCE: medium (file contents high; live-DB grant reality unverified).

## Artifact

**Findings**

Audited 4 migrations (supabase/migrations). 11 functions total: 10 SECURITY DEFINER + 1 non-definer trigger fn. Table: A1 get_user_organizations(user_uuid) A:76 SQL STABLE DEFINER, reads organization_users A:82, tenant check NONE, no in-file grant -> default PUBLIC EXECUTE, never revoked in later lockdowns. A2 user_in_organization(user_uuid,org_uuid) A:87 SQL STABLE DEFINER reads organization_users A:94, tenant check NONE, no in-file grant, revoked later at 20260712070000:194-195. A3 get_user_org_role(user_uuid,org_uuid) A:101 DEFINER reads organization_users A:106-109, NONE, default PUBLIC, not in any lockdown found. A4 is_org_admin(user_uuid,org_uuid) A:114 DEFINER reads organization_users A:120-124, NONE, default PUBLIC, not in lockdowns. A5 update_organizations_updated_at() A:169 plpgsql VOLATILE NOT definer RETURNS TRIGGER (trigger A:177), no table write. B1 user_in_organization(org_id) B:38 DEFINER reads organization_users B:46, tenant check YES auth.uid() B:47; B2 get_user_org_role(org_id) B:52 YES B:60; B3 is_org_admin(org_id) B:65 YES B:75; all three revoked-anon in 20260701132102:81-84. C1 cleanup_old_guardian_alerts() C:21 DEFINER deletes guardian_alerts C:28, tenant check NONE, service_role-only after 20260701132102:33. D1 reset_stale_daily_calls(target_user_id) D:6 DEFINER writes phone_numbers D:14, NONE, GRANT authenticated D:57 + service_role D:58, revoked in 20260701132102:53. D2 increment_daily_calls_with_reset(target_phone_id) D:29 DEFINER writes phone_numbers D:41, NONE, GRANT authenticated D:59 + service_role D:60, revoked 20260701132102:43. KEY FINDING: file A redefines the org helpers with caller-supplied user_uuid and no auth.uid() check; because B uses 1-arg signatures these coexist as overloads, and the 2-arg/1-arg vulnerable variants (get_user_organizations, get_user_org_role(uuid,uuid), is_org_admin(uuid,uuid)) appear never revoked -> cross-tenant info disclosure. No secrets printed.

**evidence**

- 20260108_phase2_organizations.sql:76-84 get_user_organizations DEFINER, reads organization_users:82, no auth.uid()
- 20260108_phase2_organizations.sql:87-98 user_in_organization(uuid,uuid) DEFINER, reads :94, no tenant check
- 20260108_phase2_organizations.sql:101-111 get_user_org_role(uuid,uuid) DEFINER, reads :106-109
- 20260108_phase2_organizations.sql:114-126 is_org_admin(uuid,uuid) DEFINER, reads :120-124
- 20260108_phase2_organizations.sql:169-180 update_organizations_updated_at RETURNS TRIGGER, not DEFINER
- 20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:38-49 user_in_organization(org_id) with auth.uid() at :47
- 20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:52-62 get_user_org_role(org_id) auth.uid() :60
- 20260109034232_42952c00-240f-4771-bc8a-1525201adacb.sql:65-78 is_org_admin(org_id) auth.uid() :75
- 20260111152528_3d9ff18b-5134-4487-a65f-3d240ee84b80.sql:21-32 cleanup_old_guardian_alerts DEFINER DELETE guardian_alerts:28
- 20260115000000_add_daily_calls_reset_functions.sql:6-25 reset_stale_daily_calls DEFINER UPDATE phone_numbers:14
- 20260115000000_add_daily_calls_reset_functions.sql:29-54 increment_daily_calls_with_reset DEFINER UPDATE phone_numbers:41
- 20260115000000_add_daily_calls_reset_functions.sql:57-60 GRANT EXECUTE authenticated/service_role to both daily-calls fns
- 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:33,43,53 revoke cleanup_old_guardian_alerts/increment_daily_calls_with_reset/reset_stale_daily_calls
- 20260701132102_lock_down_privileged_rpcs_and_definer_views.sql:81-84 revoke anon on get_user_org_role(uuid),is_org_admin(uuid),user_in_organization(uuid)
- 20260712070000_multi_organization_routing_contract.sql:194-195 REVOKE ALL ... FROM PUBLIC, anon on user_in_organization(uuid,uuid)

**validation**

Read all 4 target files in full (read tool, exact line numbers). Cross-checked GRANT/REVOKE/SECURITY DEFINER/RETURNS TRIGGER via findstr /n over the 4 files (confirmed only file D contains GRANTs, lines 57-60). Grepped all migrations for the function names to find redefinitions and later lockdowns; read 20260701132102 in full. PostgreSQL default EXECUTE-to-PUBLIC on new functions inferred from language semantics, flagged as inference not live-DB verification.

**open_questions**

- Are 20260701132102 and 20260712070000 actually applied to the production DB (grants could still be open if not)?
- Do get_user_organizations(uuid), get_user_org_role(uuid,uuid), is_org_admin(uuid,uuid) retain default PUBLIC EXECUTE in prod (never seen revoked in repo history)?
- Is there an ALTER DEFAULT PRIVILEGES or schema-level REVOKE that covers these signatures outside the migrations seen?

**what_i_did_not_check**

- Live production database grant/privilege state (only repo migration text read)
- Whether the later lockdown migrations were applied to prod
- Exhaustive search of all ~hundreds of migrations for every other REVOKE/REDEFINE of these exact signatures (grep-based sample only)
- RLS policies on phone_numbers and guardian_alerts tables
- anon role default at schema/ALTER DEFAULT PRIVILEGES level
- The 1-arg vs 2-arg overload resolution behavior in the live DB

**confidence**: medium