# security::secdef-rls-bypass::g09

- status: completed
- tldr: 21 SECDEF fns audited across 3 migrations: all EXECUTE service_role-only, no anon exposure; 4 file-A fns rely on prior-migration ACLs, 4 lack in-body org checks.

SECURITY DEFINER + EXECUTE audit, 3 migrations, 21 functions. All are Supabase service-role pattern (EXECUTE to service_role only; none call auth.uid()/org-membership, they rely on REVOKE/GRANT for isolation). No anon/authenticated exposure found. Two nuance findings: (1) 4 SECDEF functions in file A are NOT re-revoked in-file and depend on ACL persistence from 20260712* migrations; (2) all 5 file-C functions were DROP+CREATE so the in-file REVOKE is load-bearing. No secrets printed.

=== FILE A: 20260713043000_retell_automatic_reconciliation.sql ===
# | Function (hdr line) | Lang/Vol | RETURNS trigger | GRANT/REVOKE (line→role) | Tables R/W | Org/tenant check (line) | Verdict
1 | complete_provider_callback (A:178) | plpgsql / VOLATILE | no | REVOKE A:1834→PUBLIC,anon,authenticated; GRANT A:1850→service_role | provider_callback_receipts R/W(UPD 197); provider_dispatch_claims R(229,288); provider_reconciliation_jobs W(251 upsert); call_logs R/W(301,322); dialing_queues R(316); system_alerts R/W(337,343) | YES A:300-310 (call_log org/user/campaign/lead = dispatch) + A:329 UPDATE predicate | OK
2 | claim_retell_reconciliation_jobs (A:366) | plpgsql / VOLATILE | no | REVOKE A:1819; GRANT A:1841→service_role | provider_reconciliation_jobs W/R(400,475,512,550); provider_dispatch_claims R; call_logs R/W(494); provider_call_attempts R; provider_callback_receipts R; system_alerts W(523) | graph-scoped joins cl.organization_id=dispatch.organization_id (A:434,503-506,603-605); no caller org param (cross-tenant worker) | OK (service-only)
3 | bind_retell_reconciliation_call (A:612) | plpgsql / VOLATILE | no | REVOKE A:1821; GRANT A:1842→service_role | provider_reconciliation_jobs R/W; provider_dispatch_claims R/W(772); call_logs R/W(780); organization_users R(683); campaigns R(693); leads R(705); dialing_queues R(759); provider_call_attempts R | YES A:676-682; A:683-690(membership); A:692-701; A:704-713 | OK
4 | finish_retell_reconciliation_job (A:852) | plpgsql / VOLATILE | no | REVOKE A:1823; GRANT A:1843→service_role | provider_reconciliation_jobs R/W; provider_dispatch_claims R; call_logs R/W(979,1019); provider_call_attempts R; provider_callback_receipts R; system_alerts W(999,1040) | YES A:894-900 + raise A:901-903 | OK
5 | requeue_retell_reconciliation_job (A:1066) | plpgsql / VOLATILE | no | REVOKE A:1826; GRANT A:1846→service_role | provider_reconciliation_jobs W(1080); system_alerts W(1095) | NONE (relies on p_job_id + manual_required gate; no org param) | LOW (service-only)
6 | fail_retell_reconciliation_job (A:1107) | plpgsql / VOLATILE | no | REVOKE A:1828; GRANT A:1847→service_role | provider_reconciliation_jobs R(1123) | NONE explicit (claim_token lease + delegates finish) | LOW (service-only)
7 | mark_retell_reconciliation_run (A:1160) | plpgsql / VOLATILE | no | REVOKE A:1830; GRANT A:1848→service_role | retell_reconciliation_runtime W(1175) | N/A (global singleton, no tenant data) | OK
8 | claim_provider_dispatch (A:1218) | plpgsql / VOLATILE | no | NONE in-file → prior 20260712020000:697 REVOKE / :707 GRANT→service_role | call_logs R(1254); organization_users R(1272); campaigns R(1281); leads R(1291); dialing_queues R(1301); provider_dispatch_claims W/R(1316,1330) | YES A:1258-1265; A:1272-1278(membership); A:1280-1288; A:1290-1298; A:1300-1314 | OK (ACL from prior migration)
9 | finalize_provider_dispatch (A:1355) | plpgsql / VOLATILE | no | NONE in-file → prior 20260712020000:698/:708→service_role | provider_dispatch_claims R/W(1383,1401); provider_reconciliation_jobs W(1410) | NONE beyond caller-supplied user_id = p_user_id (A:1386) | MED (service-only; no org check)
10 | claim_pending_dispatches (A:1425) | sql / VOLATILE | no | REVOKE A:1836; GRANT A:1851→service_role | dialing_queues W/R(1434); provider_dispatch_claims R; provider_reconciliation_jobs R; provider_callback_receipts R; call_logs R | NONE (caller-supplied campaign_ids; no org scoping) | MED (service-only; no org check)
11 | claim_pending_dispatches_now (A:1490) | sql / VOLATILE | no | REVOKE A:1838; GRANT A:1852→service_role | same as #10 (A:1499-1546) | NONE | MED (service-only; no org check)
12 | resolve_provider_dispatch_invoke_error (A:1554) | plpgsql / VOLATILE | no | NONE in-file → prior 20260712050000:312/:315→service_role | dialing_queues R/W(1575,1638); provider_dispatch_claims R; provider_call_attempts R; provider_reconciliation_jobs R; provider_callback_receipts R; call_logs R | NONE (queue_id + dispatch_generation only) | MED (service-only; no org check)
13 | record_physical_call_attempt (A:1652) | plpgsql / VOLATILE | no | NONE in-file → prior 20260712020000:699/:709→service_role | provider_dispatch_claims R(1677); call_logs R(1694); provider_call_attempts R/W(1704,1737); dialing_queues R/W(1722,1753) | YES A:1683-1692; A:1693-1702(call_log tenant) | OK (ACL from prior migration)
14 | retell_reconciliation_health_check (A:1770) | sql / VOLATILE | no | REVOKE A:1832; GRANT A:1849→service_role | retell_reconciliation_runtime R(1813); provider_reconciliation_jobs R(1814); cron.job R(1795); vault.decrypted_secrets R(1799 names only) | N/A (global health) | OK
15 | configure_retell_reconciliation_cron (A:1860) | plpgsql / VOLATILE | no | REVOKE A:1917; GRANT A:1919→service_role | cron.job/cron.schedule R/W(1871,1893); vault.decrypted_secrets R(1881 names only) | N/A | OK

=== FILE B: 20260713050000_automation_scheduler_cron_auth.sql ===
16 | configure_automation_scheduler_cron (B:9) | plpgsql / VOLATILE | no | REVOKE B:66→PUBLIC,anon,authenticated; GRANT B:68→service_role | cron.job/cron.schedule R/W(20,42); vault.decrypted_secrets R(30 names only) | N/A (global cron) | OK. Note B:42-61 schedules command embedding secret NAMES (values fetched at run time from vault), not literals.

=== FILE C: 20260713060000_credit_ledger_schema_contract.sql === (all DROP+CREATE at C:268-279, so in-file REVOKE is load-bearing)
17 | enforce_credit_transaction_call_tenant (C:132) | plpgsql / VOLATILE | YES (C:133) | REVOKE C:1009→PUBLIC,anon,authenticated; no GRANT (trigger) | call_logs R(144) | YES C:144-152 (call_log.organization_id = NEW.organization_id) | OK
18 | check_credit_balance (C:281) | plpgsql / STABLE | no | REVOKE C:1001; GRANT C:1012→service_role | organizations R(311); organization_credits R(324) | tenant = p_organization_id used as key (C:313,326); no caller-membership check | OK (service-only)
19 | reserve_credits (C:350) | plpgsql / VOLATILE | no | REVOKE C:1003; GRANT C:1013→service_role | call_logs R(398); organizations R(407); organization_credits R/W(420,496); credit_transactions R/W(436,501) | YES C:397-404 (call_log.organization_id=p_organization_id); C:407-412 | OK
20 | finalize_call_cost (C:529) | plpgsql / VOLATILE | no | REVOKE C:1005; GRANT C:1014→service_role | call_logs R/W(587,864); organizations R(602); organization_credits R/W(625,803); credit_transactions R/W(630,811,840) | YES C:587-592; C:602-606 | OK
21 | add_credits (C:880) | plpgsql / VOLATILE | no | REVOKE C:1007; GRANT C:1015→service_role | organizations R(924); organization_credits W/R(929,934,980); credit_transactions R/W(939,986) | existence-only (C:924-926); no caller-org binding | LOW (service-only)

RLS note (file A): provider_reconciliation_jobs ENABLE RLS (A:144), GRANT SELECT→authenticated (A:146) WITH policy user_id=auth.uid() AND user_in_organization (A:150-155). retell_reconciliation_runtime ENABLE RLS (A:171), no authenticated grants (A:172) → service-only. No org table is granted to anon/authenticated by these files.

BLOCKERS: none. FOLLOW-UPS: (a) 4 file-A SECDEF fns (#8,9,12,13) rely on prior-migration ACLs (20260712*); verify live ACLs have not drifted; (b) functions #9,10,11,12 lack an explicit org/tenant predicate, acceptable only while EXECUTE stays service_role-only.

## Artifact

**Findings**

21 SECURITY DEFINER functions across the 3 migrations (15 file A, 1 file B, 5 file C). ALL are executable only by service_role; none granted to anon/authenticated; no PUBLIC exposure found. No function calls auth.uid() or an org-membership check on the caller; isolation relies entirely on EXECUTE grants (standard Supabase service-role pattern), safe only because no anon/authenticated grant exists. 4 file-A SECDEF fns are CREATE OR REPLACE'd but NOT re-revoked in file A (claim_provider_dispatch A:1218, finalize_provider_dispatch A:1355, resolve_provider_dispatch_invoke_error A:1554, record_physical_call_attempt A:1652); their service_role-only ACL survives via prior migrations (20260712020000:697-709, 20260712050000:312-315, verified) - risk only if a live DB drifted. 4 fns lack an in-body org/tenant predicate and trust caller identifiers (finalize_provider_dispatch A:1386; claim_pending_dispatches A:1425; claim_pending_dispatches_now A:1490; resolve_provider_dispatch_invoke_error A:1554) - acceptable only while service_role-only. Explicit tenant checks present in: complete_provider_callback (A:300-310), bind_retell_reconciliation_call (A:676-713), finish_retell_reconciliation_job (A:894-900), claim_provider_dispatch (A:1258-1314), record_physical_call_attempt (A:1683-1702), reserve_credits (C:397-412), finalize_call_cost (C:587-606), enforce_credit_transaction_call_tenant (C:144-152). File C DROP+CREATEs all 5 fns (C:268-279) so its in-file REVOKE (C:1001-1010) is load-bearing; the SECDEF trigger fn has an explicit tenant check (C:144-152). No secrets hardcoded: cron fns (A:1860, B:9) store only vault secret NAMES, values read at runtime; A:1799/B:30 read only secret.name. RLS surface: provider_reconciliation_jobs RLS on (A:144) with SELECT to authenticated + policy user_id=auth.uid() AND user_in_organization (A:150-155); retell_reconciliation_runtime RLS on, no authenticated grant (A:171-172).

**evidence**

- 20260713043000:178,366,612,852,1066,1107,1160,1218,1355,1425,1490,1554,1652,1770,1860 = 15 SECDEF headers
- 20260713043000:1819-1852 and 1917-1920 = REVOKE/GRANT service_role covering 10 of 15; A:1218/1355/1554/1652 absent
- 20260712020000:697-699 REVOKE + :707-709 GRANT service_role for claim_provider_dispatch/finalize_provider_dispatch/record_physical_call_attempt
- 20260712050000:312-315 REVOKE/GRANT service_role for resolve_provider_dispatch_invoke_error
- 20260713050000:9,14,66-68 configure_automation_scheduler_cron SECDEF + service_role
- 20260713060000:132-135,281-299,350-367,529-549,880-896 = 5 SECDEF; C:1001-1010 REVOKE, C:1012-1015 GRANT service_role
- 20260713043000:144-155,171-172 RLS enable + authenticated grant/policy
- org-check cites: A:300-310, A:676-713, A:894-900, A:1258-1314, A:1683-1702, C:144-152, C:397-412, C:587-606

**validation**

Enumerated every SECURITY DEFINER/GRANT/REVOKE/RETURNS/LANGUAGE/search_path token and every public.<table> reference in the 3 files via findstr + targeted reads; cross-referenced the 4 un-re-granted file-A functions against prior migrations to prove service_role-only ACLs. File-only audit; no live DB connection.

**open_questions**

- Does live Supabase ACL (pg_proc.proacl) match migration history for the 4 file-A fns?
- Any migrations after 20260713060000 that further alter grants on these functions?

**edge_cases_considered**

- DROP+CREATE (file C) vs CREATE OR REPLACE (file A) ACL semantics: replaces preserve ACLs, drops reset them
- search_path hardening: 'public, pg_temp' in A/B, empty '' in C
- SECURITY DEFINER trigger function needs no EXECUTE grant to fire
- cross-tenant service worker fns vs caller-scoped fns

**what_i_did_not_check**

- Live DB ACL/ownership state (migration-file only; no pg_proc.proacl read)
- migrations later than 20260713060000
- RLS policies on tables touched by SECDEF fns other than the 2 in-file policies (provider_callback_receipts, provider_call_attempts, system_alerts, call_logs, credit_transactions)
- definition of public.user_in_organization() used in A:154 policy
- caller side (Edge Functions / service-role key handling) invoking these RPCs
- potential secret leakage via error/log paths in the vault-reading fns
- functions in other migration files (scope limited to the 3 named files)

**confidence**: medium