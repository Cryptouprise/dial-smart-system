# security::secdef-rls-bypass::g10

- status: completed
- tldr: 8-migration security audit: 10 SECURITY DEFINER fns, 0 secdef views, 11 authenticated table grants (all RLS-guarded); gap = 2 trigger fns with no explicit REVOKE.

RESEARCH ONLY audit of 8 migrations in C:/Users/charl/dial-smart-system/supabase/migrations (20260713062000, 063000, 064000, 065000, 070000, 071000, 072000, 073000). Result: 10 SECURITY DEFINER functions (all SET search_path=''), 2 non-SD trigger functions, 0 SECURITY DEFINER views, 11 GRANT...ON TABLE/VIEW to authenticated (all RLS-guarded by tenant predicates). No secret printed.

SECURITY DEFINER (name | file:line | lang/vol | trigger? | grants | tables | tenant check):
1. repair_dnc_tenant_scope() 062000:65 (plpgsql Volatile, TABLE not trigger; REVOKE:168-169 PUBLIC/anon/auth, GRANT EXEC:170 service_role, invoked:172; r/w dnc_list+org_users; tenant check NONE - fail-closed guards).
2. dialing_queue_has_provider_evidence(uuid) 064000:63 (sql Stable, boolean; REVOKE:403-404, GRANT:414 service_role; reads dialing_queues/provider_dispatch_claims/provider_call_attempts/call_logs; tenant NONE).
3. dialing_queue_has_unresolved_lifecycle(uuid) 064000:101 (sql Stable, boolean; REVOKE:405-406, GRANT:416 service_role; reads dialing_queues/call_logs/provider_dispatch_claims/provider_callback_receipts/provider_reconciliation_jobs; tenant NONE).
4. protect_dialing_queue_provider_evidence() 064000:167 (plpgsql Volatile, TRIGGER; REVOKE:407-408 no GRANT; tenant NONE).
5. enqueue_dialing_queue(...) 064000:199 (plpgsql Volatile, uuid; REVOKE:409-410, GRANT:418 service_role; r/w campaigns/leads/dialing_queues, reads org_users; tenant check YES :255-270).
6. cancel_dialing_queues(...) 064000:327 (plpgsql Volatile, integer; REVOKE:411-412, GRANT:420 service_role; r/w dialing_queues/campaigns/leads/org_users; tenant check YES :366-378).
7. protect_organization_credit_balance() 065000:171 (plpgsql Volatile, TRIGGER; REVOKE:215-216 no GRANT; no tables, reads GUC; tenant NONE).
8. protect_call_log_evidence() 071000:53 (plpgsql Volatile, TRIGGER; REVOKE:109-110 no GRANT; reads organization_membership_transfers; tenant NONE).
9. protect_provider_resource_identity() 072000:151 (plpgsql Volatile, TRIGGER; REVOKE:270-271 no GRANT; reads organization_membership_transfers; tenant NONE).
10. protect_dnc_suppression_identity() 073000:59 (plpgsql Volatile, TRIGGER; REVOKE:90-91 no GRANT; no tables; tenant NONE).

Non-SD: enforce_dnc_tenant_contract() 062000:180 (INVOKER, trigger, NO revoke -> default PUBLIC EXECUTE, enforces member :190-201); enforce_provider_phone_number_contract() 072000:136 (INVOKER, trigger, REVOKE:272-273).

GRANT ... ON TABLE/VIEW TO authenticated (all RLS-guarded): 064000:60 dialing_queues; 065000:152-155 organizations/organization_credits/credit_transactions/usage_summaries; 065000:168 view organization_credit_status (security_invoker=true :165, NOT secdef); 070000:336-337 pricing_tiers/agent_pricing; 071000:46 call_logs; 072000:265-266 phone_numbers/retell_agents; 073000:55 dnc_list SELECT,INSERT (WITH CHECK :46-53). No authenticated grant on user_credentials.

SECURITY DEFINER VIEWS: none. Biggest gap: enforce_dnc_tenant_contract() + update_updated_at_column() lack explicit REVOKE.

Validation: full read + /definer/ grep (exactly 10 hits, no view definer); every authenticated grant cross-checked against an accompanying CREATE POLICY. Blockers: none. Follow-up: verify user_in_organization/normalize_contact_phone/update_updated_at_column definitions (outside these files) and confirm PUBLIC-EXECUTE default against live DB.

## Artifact

**Findings**

Audited 8 migrations. 10 SECURITY DEFINER functions (all trigger-only or service_role-only, all SET search_path=''); 2 non-SD trigger functions; 0 SECURITY DEFINER views (only view organization_credit_status is security_invoker=true). 11 GRANT...ON TABLE/VIEW to authenticated, all RLS-guarded with tenant predicates. No SD function is granted EXECUTE to authenticated/anon except the two tenant-command RPCs enqueue_dialing_queue/cancel_dialing_queues which enforce auth.uid()/membership internally. Full per-item detail below.

**evidence**

- SECURITY DEFINER set (grep confirmed exactly 10): 062000:72 repair_dnc_tenant_scope; 064000:69 dialing_queue_has_provider_evidence; 064000:107 dialing_queue_has_unresolved_lifecycle; 064000:170 protect_dialing_queue_provider_evidence; 064000:207 enqueue_dialing_queue; 064000:335 cancel_dialing_queues; 065000:174 protect_organization_credit_balance; 071000:56 protect_call_log_evidence; 072000:154 protect_provider_resource_identity; 073000:62 protect_dnc_suppression_identity
- F1 public.repair_dnc_tenant_scope() 062000:65-166 | plpgsql VOLATILE | RETURNS TABLE(not trigger) | REVOKE ALL :168-169 role PUBLIC,anon,authenticated; GRANT EXECUTE :170 service_role; invoked :172 | reads/writes dnc_list(LOCK/UPDATE/INSERT/DELETE), organization_users(read) | org/tenant check in body: NONE (no auth.uid(); service_role-only grant is the control; FAIL-CLOSED guards raise DNC_PHONE_REPAIR_REQUIRED :91 / DNC_TENANT_REPAIR_REQUIRED :105)
- F2 public.dialing_queue_has_provider_evidence(uuid) 064000:63-99 | sql STABLE | RETURNS boolean(not trigger) | REVOKE ALL :403-404; GRANT EXECUTE :414 service_role | reads dialing_queues, provider_dispatch_claims, provider_call_attempts, call_logs; writes NONE | tenant check: NONE
- F3 public.dialing_queue_has_unresolved_lifecycle(uuid) 064000:101-165 | sql STABLE | RETURNS boolean(not trigger) | REVOKE ALL :405-406; GRANT EXECUTE :416 service_role | reads dialing_queues, call_logs, provider_dispatch_claims, provider_callback_receipts, provider_reconciliation_jobs; writes NONE | tenant check: NONE
- F4 public.protect_dialing_queue_provider_evidence() 064000:167-187 | plpgsql VOLATILE | RETURNS trigger (RETURN OLD, BEFORE DELETE) | REVOKE ALL :407-408; no GRANT | reads dialing_queues + helpers F2/F3 | tenant check: NONE
- F5 public.enqueue_dialing_queue(uuid,uuid,timestamptz,integer) 064000:199-325 | plpgsql VOLATILE | RETURNS uuid(not trigger) | REVOKE ALL :409-410; GRANT EXECUTE :418 service_role | reads/writes campaigns(SELECT FOR UPDATE), leads(SELECT FOR UPDATE), organization_users(exists), dialing_queues(SELECT FOR UPDATE/UPDATE/INSERT) | tenant check: YES - caller_user_id:=auth.uid() :211, caller_role:=auth.role() :212, explicit ownership: service_role bypass else campaign/lead must match caller AND organization_users membership :255-270
- F6 public.cancel_dialing_queues(uuid,uuid,uuid,text) 064000:327-401 | plpgsql VOLATILE | RETURNS integer(not trigger) | REVOKE ALL :411-412; GRANT EXECUTE :420 service_role | reads/writes dialing_queues, campaigns, leads, organization_users; dialing_queues UPDATE | tenant check: YES :366-378 (service_role bypass else campaign.user_id=caller & lead.user_id=caller & membership exists)
- F7 public.protect_organization_credit_balance() 065000:171-206 | plpgsql VOLATILE | RETURNS trigger | REVOKE ALL :215-216; no GRANT | reads/writes: NO tables (reads GUC app.credit_ledger_writer :178) | tenant check: NONE (session-GUC gate, not tenant)
- F8 public.protect_call_log_evidence() 071000:53-102 | plpgsql VOLATILE | RETURNS trigger | REVOKE ALL :109-110; no GRANT | reads organization_membership_transfers; writes NONE | tenant check: NONE (uses OLD/NEW org/user cols + txid transfer exception :66-81)
- F9 public.protect_provider_resource_identity() 072000:151-194 | plpgsql VOLATILE | RETURNS trigger | REVOKE ALL :270-271; no GRANT | reads organization_membership_transfers; writes NONE | tenant check: NONE
- F10 public.protect_dnc_suppression_identity() 073000:59-83 | plpgsql VOLATILE | RETURNS trigger | REVOKE ALL :90-91; no GRANT | reads/writes: NO tables | tenant check: NONE
- NON-SD F1 public.enforce_dnc_tenant_contract() 062000:180-204 | plpgsql VOLATILE SECURITY INVOKER (no DEFINER, search_path='') | RETURNS trigger | NO REVOKE/GRANT -> inherits PG default EXECUTE to PUBLIC | reads organization_users | tenant check: YES enforces NEW.org/user membership :190-201
- NON-SD F2 public.enforce_provider_phone_number_contract() 072000:136-149 | plpgsql VOLATILE SECURITY INVOKER (search_path='') | RETURNS trigger | REVOKE ALL :272-273 | reads/writes NONE (normalizes NEW.number) | tenant check: NONE
- GRANT ON TABLE/VIEW to authenticated: 064000:60 dialing_queues SELECT (policy 41-58 tenant EXISTS via campaigns/leads/organization_users); 065000:152 organizations,153 organization_credits,154 credit_transactions,155 usage_summaries all SELECT (policies 128-150 use user_in_organization(auth.uid(),org)); 065000:168-169 organization_credit_status VIEW SELECT (security_invoker=true :165); 070000:336 pricing_tiers SELECT,337 agent_pricing SELECT; 071000:46 call_logs SELECT; 072000:265 phone_numbers SELECT,266 retell_agents SELECT; 073000:55 dnc_list SELECT,INSERT (INSERT WITH CHECK :46-53 user_id=auth.uid() AND user_in_organization)
- NO GRANT to authenticated on user_credentials (only REVOKE ALL :33-40 then service_role :51)
- SECURITY DEFINER VIEWS: NONE. Only view created is public.organization_credit_status; it is explicitly SET (security_invoker = true) 065000:165 with REVOKE ALL :166-167 then GRANT SELECT authenticated,service_role :168-169 -> base-table RLS (organizations/organization_credits) enforced for the caller

**validation**

Read all 8 files end-to-end (not grep-only). Grep of /definer/ across the 8 files returns exactly the 10 cited SECURITY DEFINER lines and no view definer. Table-level GRANTs to authenticated cross-checked against an accompanying CREATE POLICY in every case. Confirmed 065000:165 sets security_invoker=true (so the view is NOT a SECURITY DEFINER view) and confirmed 062000:180 / 072000:136 lack SECURITY DEFINER.

**open_questions**

- enforce_dnc_tenant_contract() and update_updated_at_column() have no explicit REVOKE; by PostgreSQL default they retain EXECUTE to PUBLIC. Trigger functions cannot be invoked directly (they error outside trigger context), but the PUBLIC grant is a hygiene gap worth a REVOKE for defense-in-depth.

**what_i_did_not_check**

- Bodies/definitions of helper functions used by policies and function bodies but defined in other migrations: public.user_in_organization(uuid,uuid), public.normalize_contact_phone(text), public.update_updated_at_column() - not verified SECURITY DEFINER/INVOKER, volatility, or tenant logic.
- Live database state: default PUBLIC EXECUTE on functions without explicit REVOKE and any pre-existing column-level grants were read from migration text only, not CONFIRMED against the running DB.
- RLS policies/grants on referenced base tables (campaigns, leads, organization_users, organizations, organization_credits, credit_transactions, provider_dispatch_claims, provider_call_attempts, provider_callback_receipts, provider_reconciliation_jobs, organization_membership_transfers, dnc_list, dialing_queues, call_logs, phone_numbers, retell_agents) beyond this set - the tables read by the SECURITY DEFINER functions may themselves have weaker RLS.
- Whether security_invoker view support matches the deployed Postgres major version (PG15+).
- Procedures elsewhere that also GRANT EXECUTE to authenticated but live outside these 8 files.

**confidence**: high