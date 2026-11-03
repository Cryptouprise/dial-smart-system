# security::secdef-rls-bypass::g12

- status: completed
- tldr: 8 secdef fns audited: 0 anon-callable, 2 authenticated read-only getters (auth.uid-bound), rest service_role-only; search_path pinned

Audited all 7 named migrations for SECURITY DEFINER exposure. 8 secdef functions found; all plpgsql, search_path pinned. No trigger-returning secdef. Only 2 exposed TO authenticated (both STABLE, auth.uid()-bound, non-PII summary getters) and both also REVOKEd from PUBLIC/anon. All 5 write-capable secdef functions + observer getter are service_role-only. No anon-callable secdef. One medium note: register_elite_email_execution_release body lacks an org<->campaign consistency check (relies on FKs only).

## Artifact

**Findings**

8 SECURITY DEFINER functions across 7 migrations. All are plpgsql, all pin SET search_path = public, pg_temp. NONE returns trigger (the 5 trigger functions in these files are non-secdef). Only 2 secdef functions are exposed TO authenticated (both are read-only STABLE summary getters that bind to auth.uid() and return non-PII aggregates): get_campaign_contact_release_status and get_elite_email_execution_release_status. Every write-capable secdef function (evaluate_campaign_contact_release, claim_elite_email_execution_release, record_elite_email_mailgun_event_receipt, register_elite_email_execution_release, prepare_elite_email_execution_release) and the observer getter is REVOKEd from PUBLIC, anon AND authenticated and GRANTed only TO service_role. No secdef function is callable by anon. No function grants to authenticated that can write or that reads caller-supplied tenant identity without an auth.uid()/membership binding. One medium note: register_elite_email_execution_release and prepare... bind org/user/campaign from parameters and rely on the compound FK (organization_id,user_id)->organization_users plus per-column FKs; the body of register does NOT verify p_campaign_id belongs to p_organization_id, so a trusted service_role caller could persist a cross-org release row (FK-level only).

**evidence**

- 20260713150000 line 206 SECURITY DEFINER evaluate_campaign_contact_release; line 321-323 REVOKE ALL FROM PUBLIC, anon, authenticated; line 324-326 GRANT EXECUTE TO service_role; membership join line 259-286
- 20260713160000 line 22 SECURITY DEFINER/STABLE get_campaign_contact_release_status; line 117-118 REVOKE ALL FROM PUBLIC, anon; line 119-120 GRANT EXECUTE TO authenticated, service_role; auth.uid() check line 31 and line 41
- 20260713170000 line 22 SECURITY DEFINER/STABLE get_campaign_contact_release_observer_status; line 119-121 REVOKE ALL FROM PUBLIC, anon, authenticated; line 122-124 GRANT EXECUTE TO service_role; membership EXISTS line 30-44
- 20260720120000 line 354 SECURITY DEFINER claim_elite_email_execution_release; line 489-490 REVOKE ALL FROM PUBLIC, anon, authenticated; line 491-492 GRANT TO service_role; identity binding line 375-383; stop check line 388-401
- 20260720120000 line 436 SECURITY DEFINER/STABLE get_elite_email_execution_release_status; line 493 REVOKE ALL FROM PUBLIC, anon; line 494 GRANT EXECUTE TO authenticated, service_role; auth.uid() line 442 and membership join line 447-449
- 20260720130000 line 40 SECURITY DEFINER record_elite_email_mailgun_event_receipt; line 134-137 REVOKE ALL FROM PUBLIC, anon, authenticated; line 138-141 GRANT TO service_role; binding/event-kind validation line 47-90
- 20260720140000 line 36 SECURITY DEFINER register_elite_email_execution_release; line 156-159 REVOKE ALL FROM PUBLIC, anon, authenticated; line 160-163 GRANT TO service_role; NO org<->campaign consistency check in body (insert line 63-105)
- 20260720150000 line 93 SECURITY DEFINER prepare_elite_email_execution_release; line 219-222 REVOKE ALL FROM PUBLIC, anon, authenticated; line 223-226 GRANT TO service_role; identity binding line 128-133; stop check line 149-162

**validation**

Static read-only review of the 7 named migration files. Extracted every SECURITY DEFINER, its volatility clause, RETURNS clause, every GRANT/REVOKE with role, tables read/written, and presence of an explicit org/tenant check with line cites. Cross-checked that trigger-returning functions (enforce_* ) are NOT secdef, so out of scope. No DB connection, no execution, no secrets printed.

**open_questions**

- Does evaluate_contact_stop (called by claim and prepare) itself enforce tenant/stop scope correctly? Defined in a different migration, not audited here.
- Are these migrations the live-applied versions, or has a later migration CREATE OR REPLACE'd any of these functions (e.g. removed the search_path pin)?
- register_elite_email_execution_release: should the body assert campaigns.organization_id = p_organization_id instead of relying only on FKs?

**what_i_did_not_check**

- RLS policies: tables get ENABLE ROW LEVEL SECURITY but these files define NO CREATE POLICY; default-deny relies solely on REVOKE + service_role. Did not inspect any policies defined elsewhere.
- evaluate_contact_stop implementation and its tenant guarantees.
- Live database state: whether these migrations are applied and whether any later migration overrides the functions/grants.
- Base tables campaigns, leads, organization_users, phone_numbers, campaign_leads RLS and grants.
- The 5 non-secdef trigger functions in these files (enforce_campaign_contact_release_immutable/member, enforce_elite_email_execution_release_immutable, enforce_elite_email_provider_event_receipt, enforce_elite_email_release_preparation_attestation_immutable) beyond confirming they are not SECURITY DEFINER.
- Sibling/g12 overlapping nodes' scope (only the 7 named files audited).

**confidence**: medium