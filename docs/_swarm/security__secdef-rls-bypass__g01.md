# security::secdef-rls-bypass::g01

- status: completed
- tldr: Audited 7 migrations: 2 SECURITY DEFINER fns (has_role RPC-callable w/ no caller check; update_updated_at_column trigger-only); no GRANT EXECUTE anywhere.

SECURITY DEFINER / EXECUTE audit of the 7 assigned migration files (C:/Users/charl/dial-smart-system/supabase/migrations).

NOTE: I closed node g01 with a schema-probe artifact by accident (artifact schema rejected arrays for `findings`). Real findings below; stored artifact body is a placeholder.

FUNCTIONS FOUND: only 2 distinct names across the 7 files (has_role redefined 3x; update_updated_at_column redefined 2x). NO GRANT EXECUTE and NO REVOKE in any of the 7 files, so both rely on Postgres default EXECUTE-to-PUBLIC and are RPC-reachable unless revoked outside scope.

1) has_role(_user_id uuid, _role app_role)
 (a) header: 20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:65; redefined 20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:22; 20251103035810_06a50f99-8093-48a7-bc14-dd73a00b2244.sql:7
 (b) LANGUAGE SQL STABLE SECURITY DEFINER, SET search_path=public (f1:67-68)
 (c) RETURNS boolean -> RPC-callable, NOT a trigger
 (d) GRANT/REVOKE: NONE in any of the 3 files
 (e) body: SELECT 1 FROM user_roles (f1:71, f2:28, f3:13)
 (f) org/tenant check: NONE - no auth.uid(); trusts caller-supplied _user_id
 VERDICT: HIGH-INTEREST. SECURITY DEFINER + RPC-callable + default PUBLIC EXECUTE + no caller binding => any anon/authenticated caller can probe has_role(<any uuid>,'admin'/'manager'/'user'). Also the RLS primitive at f1:89 (USING public.has_role(auth.uid(),'admin')). search_path pinned (good).

2) update_updated_at_column()
 (a) header: 20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:3; 20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:104
 (b) LANGUAGE plpgsql SECURITY DEFINER, SET search_path=public
 (c) RETURNS TRIGGER -> not RPC-callable
 (d) GRANT/REVOKE: NONE
 (e) no table access (only NEW.updated_at = now())
 (f) N/A
 VERDICT: LOW. Trigger-only, no data access, search_path pinned.

Non-function grants: GRANT SELECT ON public.disposition_analytics TO authenticated + service_role (20241218_disposition_metrics.sql:91-92); GRANT SELECT ON public.critical_errors_v TO authenticated (20241218_edge_function_errors.sql:68). These are VIEWs, not functions.

No organization_id / user_in_organization / membership construct appears in any of the 7 files; ownership is by user_id -> auth.users(id).

EVIDENCE: findstr /n exhaustive scan; zero GRANT EXECUTE / REVOKE lines.
CONFIDENCE: high (static source).
DID NOT CHECK: live DB ACL (pg_proc.proacl); the other ~100 migrations that could revoke/redefine these functions; table-level anon grants on user_roles; RLS semantics of the two views; secrets.

## Artifact

**Findings**

Only 2 distinct functions exist across the 7 files: has_role (redefined 3x) and update_updated_at_column (redefined 2x). No GRANT EXECUTE or REVOKE appears in any of the 7 files, so both rely on Postgres default EXECUTE-to-PUBLIC and are RPC-reachable unless revoked elsewhere. has_role(_user_id uuid,_role app_role) at 20251103034349:65 / 20251103035736:22 / 20251103035810:7: SQL, STABLE, SECURITY DEFINER, SET search_path=public; RETURNS boolean (RPC-callable, not a trigger); GRANT/REVOKE NONE; body SELECTs user_roles (:71/:28/:13); org/tenant check NONE - no auth.uid(), trusts caller-supplied _user_id. update_updated_at_column() at 20251103035829:3 / 20251201054755:104: plpgsql SECURITY DEFINER SET search_path=public; RETURNS TRIGGER (not RPC-callable); GRANT/REVOKE NONE; no table access; N/A. Non-function grants: disposition_analytics view (disposition_metrics.sql:91-92), critical_errors_v view (edge_function_errors.sql:68). search_path correctly pinned on every SECURITY DEFINER function here.

**evidence**

- 20251103034349_d8aa891c-617a-4d2f-a0e1-5d250f6a27e1.sql:65 CREATE FUNCTION has_role; :67 SQL STABLE SECURITY DEFINER; :68 SET search_path=public; :71 SELECT 1 FROM user_roles; :89 policy USING public.has_role(auth.uid(),'admin')
- 20251103035736_ea6eef40-afad-486e-8d72-4811de5f289c.sql:22-31 has_role redefinition (SQL STABLE SECURITY DEFINER)
- 20251103035810_06a50f99-8093-48a7-bc14-dd73a00b2244.sql:7-16 has_role redefinition
- 20251103035829_63088070-0d22-4940-99dc-497298aef884.sql:3-13 update_updated_at_column plpgsql RETURNS TRIGGER SECURITY DEFINER SET search_path=public
- 20251201054755_481b278e-907a-4318-a6e7-51ca4102f004.sql:104-110 update_updated_at_column plpgsql SECURITY DEFINER SET search_path=public
- 20241218_disposition_metrics.sql:91-92 GRANT SELECT ON public.disposition_analytics TO authenticated/service_role (VIEW)
- 20241218_edge_function_errors.sql:68 GRANT SELECT ON public.critical_errors_v TO authenticated (VIEW)
- findstr /n scan of all 7 files: ZERO GRANT EXECUTE and ZERO REVOKE ON FUNCTION lines

**validation**

Read all 7 files in full via findstr /n; exhaustive grep of GRANT, REVOKE, EXECUTE, SECURITY DEFINER, CREATE FUNCTION, RETURNS trigger, auth.uid, user_in_organization, organization_id with line numbers; cross-checked redefinitions. Static source only; no live DB.

**open_questions**

- Was EXECUTE later REVOKEd on has_role in a migration outside the 7-file scope?
- Does the anon role hold table-level GRANTs on user_roles independent of RLS?

**what_i_did_not_check**

- Live DB ACL state (pg_proc.prosecdef / proacl)
- Other ~100 migrations that may redefine/revoke these functions or add GRANT EXECUTE
- Table-level (pre-RLS) privileges to anon/authenticated on user_roles
- RLS-enforcement semantics of the two granted views beyond their GRANT lines
- Secrets/env material (not read)

**confidence**: high