# security::secdef-rls-bypass::g07

- status: completed
- tldr: Audited 4 migrations, 14 SECURITY DEFINER fns: all service_role-only except one authenticated read-only check; 4 medium-risk no-tenant-check items flagged.

RESEARCH ONLY audit complete for node security::secdef-rls-bypass::g07. Audited 4 migrations, 14 SECURITY DEFINER functions. All plpgsql/sql VOLATILE, none RETURNS trigger, all search_path-pinned, all service_role-only EXCEPT provider_safety_health_check (also granted to authenticated; read-only introspection). Tenant-check status: strong on claim_workflow_external_effect + resolve_workflow_external_effect; partial (supplied-param identity, no auth.uid()) on claim_provider_dispatch, finalize_provider_dispatch, record_physical_call_attempt; NONE on add_credits, run_safety_backstops, evaluate_contact_stop, claim/complete_provider_callback, claim_pending_dispatches(_now), transition_workflow_external_effect. Medium-risk items: add_credits (no org check), run_safety_backstops (cross-tenant writer), claim_pending_dispatches/_now (no campaign ownership guard; _now ignores scheduled_at), transition_workflow_external_effect (effect-id only). Static only; no DB execution; no secrets printed. Deliverable: compact table + per-function risk verdicts in assistant response.

## Artifact

**Findings**

Audited 4 migrations (f1=20260701133759_canonicalize_add_credits_signature.sql, f2=20260703224351_unattended_safety_backstops.sql, f3=20260712020000_contact_safety_and_provider_idempotency.sql, f4=20260712030000_workflow_external_effect_ledger.sql). 14 SECURITY DEFINER functions, all plpgsql/sql VOLATILE, none RETURNS trigger, all with pinned search_path. All 14 are REVOKE'd from PUBLIC/anon/authenticated and GRANTed to service_role EXCEPT provider_safety_health_check f3:583 which is GRANTed to authenticated+service_role (read-only introspection only). Explicit tenant/org check in body: YES for claim_workflow_external_effect (f4:114,128) and resolve_workflow_external_effect (f4:270-279,287-289); PARTIAL (identity/consistency vs supplied params, no auth.uid()) for claim_provider_dispatch, finalize_provider_dispatch, record_physical_call_attempt; NONE for add_credits (f1:14), run_safety_backstops (f2:21), evaluate_contact_stop (f3:196), claim_provider_callback (f3:259), complete_provider_callback (f3:300), claim_pending_dispatches (f3:639), claim_pending_dispatches_now (f3:667), transition_workflow_external_effect (f4:163). Risk verdicts: add_credits MEDIUM (money-mutating SECDEF, no internal org check); run_safety_backstops MEDIUM (cross-tenant writer no auth); claim_pending_dispatches/_now MEDIUM (mutates caller-supplied campaign rows, no ownership guard; _now ignores scheduled_at); transition_workflow_external_effect MEDIUM (effect-id only, no binding); evaluate_contact_stop LOW-MEDIUM (cross-tenant read via supplied ids); others LOW. Static analysis only: whether these are live-applied, whether default PUBLIC EXECUTE exists on functions NOT in these files, and actual RLS enforcement were not verified.

**evidence**

- f1:14 CREATE add_credits; f1:23 SECDEF; f1:109 REVOKE FROM PUBLIC,anon,authenticated; f1:110 GRANT service_role; f1:48 SELECT org_credits FOR UPDATE; f1:55 INSERT org_credits; f1:63 UPDATE org_credits; f1:92 dynamic INSERT credit_transactions; no auth.uid() in body
- f2:21 run_safety_backstops; f2:24 SECDEF; f2:193 REVOKE; f2:194 GRANT service_role; f2:89 UPDATE dialing_queues; f2:160 UPDATE campaigns; f2:154 UPDATE budget_settings; f2:216 embedded anon-role JWT literal in cron definition
- f3:196 evaluate_contact_stop SECDEF f3:210, REVOKE f3:694 GRANT f3:704; f3:259 claim_provider_callback SECDEF f3:267 REVOKE f3:695 GRANT f3:705; f3:300 complete_provider_callback SECDEF f3:309 REVOKE f3:696 GRANT f3:706; f3:338 claim_provider_dispatch SECDEF f3:351 REVOKE f3:697 GRANT f3:707; f3:417 finalize_provider_dispatch SECDEF f3:426 REVOKE f3:698 GRANT f3:708; f3:465 record_physical_call_attempt SECDEF f3:477 REVOKE f3:699 GRANT f3:709; f3:583 provider_safety_health_check SECDEF f3:594 REVOKE f3:702 GRANT f3:712 to authenticated+service_role; f3:639 claim_pending_dispatches SECDEF f3:645 REVOKE f3:700 GRANT f3:710; f3:667 claim_pending_dispatches_now SECDEF f3:673 REVOKE f3:701 GRANT f3:711; f3:175 REVOKE ALL ON TABLE provider_dispatch_claims
- f4:75 claim_workflow_external_effect SECDEF f4:88 REVOKE f4:438-440 GRANT f4:447-449 (tenant check f4:114/f4:128); f4:163 transition_workflow_external_effect SECDEF f4:172 REVOKE f4:441-443 GRANT f4:450-452 (no tenant check); f4:221 resolve_workflow_external_effect SECDEF f4:237 REVOKE f4:444-446 GRANT f4:453-455 (tenant check f4:270-279)

**validation**

Static read of all 4 files in full with line numbers. Cross-checked every CREATE OR REPLACE FUNCTION against its matching GRANT/REVOKE by exact argument signature; confirmed no function is declared RETURNS trigger and none exposes an unpinned search_path. No DB connection, no execution, no secrets printed.

**open_questions**

- Are these migrations actually applied to the live Supabase DB (project emonjusymdripmkvtttc), and do live grants match these files?
- Do any OTHER migrations create SECURITY DEFINER functions that were NOT REVOKE'd (default PUBLIC EXECUTE retained)? This audit scope was 4 files only.
- Is the anon JWT at f2:216 still valid, and is anon EXECUTE on campaign-health-monitor's underlying helpers appropriately scoped?
- Are RLS policies on provider_callback_receipts, provider_call_attempts, contact_stop_controls (read-only check only here) actually enabled+sufficient, or do the SECDEF functions bypass RLS as the only access path?

**what_i_did_not_check**

- Other migrations in supabase/migrations (default PUBLIC EXECUTE on functions outside this set).
- Live DB grant state / whether the 4 migrations are applied.
- RLS enforcement effectiveness on the tables these SECDEF fns touch.
- Edges/functions referenced by the cron jobs (campaign-health-monitor).
- Whether service_role membership is restricted to trusted server code.
- Non-function grants beyond the one noted table REVOKE.

**confidence**: high