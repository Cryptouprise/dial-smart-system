# security::secdef-rls-bypass::g03

- status: completed
- tldr: 10 SECDEF funcs, 0 GRANT/REVOKE, no in-body tenant checks => cross-tenant RLS bypass; add_credits critical.

RESEARCH-ONLY audit of C:/Users/charl/dial-smart-system/supabase/migrations/20260124_white_label_credits.sql (582 ln) and 20260124_white_label_credits_v2_enhanced.sql (788 ln). Result: 10 SECURITY DEFINER functions, ZERO GRANT/REVOKE in either file. All SECDEF funcs take the tenant key (p_organization_id/p_user_id/p_lead_id) as a parameter with NO auth.uid()/tenant check in body. No REVOKE => Postgres default EXECUTE to PUBLIC + definer-rights execution => cross-tenant RLS bypass via PostgREST RPC. Most severe: add_credits (WC2:627, overrides WC:404) can mint credits for any org. update_daily_usage_summary (WC:480) is a trigger, not SECDEF. See node artifact for full per-function table (lang/volatility, table r/w with line refs, org-check=NONE).

## Artifact

**Findings**

Both files contain ZERO GRANT/REVOKE (grep GRANT|REVOKE=0 matches). 10 SECURITY DEFINER functions: 20260124_white_label_credits.sql -> check_credit_balance (235), deduct_call_credits (291), add_credits (404); 20260124_white_label_credits_v2_enhanced.sql -> check_credit_balance (86), reserve_credits (176), finalize_call_cost (324), get_organization_for_user (538), get_organization_for_lead (560), check_auto_recharge (580), add_credits (627). update_daily_usage_summary (WC:480) is RETURNS TRIGGER and NOT SECURITY DEFINER. Every SECDEF function takes the tenant key as a parameter with NO auth.uid() check in body; auth.uid() appears only in table RLS policies (WC:70-86,141-149,199-207). No REVOKE => Postgres default GRANT EXECUTE TO PUBLIC applies; with definer-rights execution these bypass RLS on organization_credits/credit_transactions/usage_summaries via PostgREST RPC for any caller. add_credits (WC2:627) most severe: arbitrary p_organization_id+p_amount_cents lets any caller mint credits for any org; WC2 CREATE OR REPLACE overrides WC:404 add_credits and WC:235 check_credit_balance. Read-only SECDEF oracles: check_credit_balance (balance/billing), get_organization_for_user/lead (user/lead->org mapping), check_auto_recharge (balance + stripe_payment_method_id at WC2:609).

**evidence**

- 20260124_white_label_credits.sql:288
- 20260124_white_label_credits.sql:401
- 20260124_white_label_credits.sql:474
- 20260124_white_label_credits.sql:541
- 20260124_white_label_credits_v2_enhanced.sql:167
- 20260124_white_label_credits_v2_enhanced.sql:314
- 20260124_white_label_credits_v2_enhanced.sql:528
- 20260124_white_label_credits_v2_enhanced.sql:551
- 20260124_white_label_credits_v2_enhanced.sql:571
- 20260124_white_label_credits_v2_enhanced.sql:618
- 20260124_white_label_credits_v2_enhanced.sql:723
- findstr /i SECURITY DEFINER GRANT REVOKE returned 0 GRANT/REVOKE lines

**validation**

Full read of both files (582 + 788 lines); findstr /n /i confirmed exact SECURITY DEFINER line numbers and zero GRANT/REVOKE. Static source analysis only, no DB execution.

**open_questions**

- Does any later migration or the live DB REVOKE EXECUTE from PUBLIC/anon/authenticated on these functions?
- What is the real function owner, is search_path pinned, and is public schema exposed via PostgREST here?
- Are these RPCs intended to be service-role-only and do callers assume that?

**what_i_did_not_check**

- Other migrations outside the two named files that may REVOKE EXECUTE on the same signatures.
- Live Postgres catalog (pg_proc.proacl), owner, search_path pinning, PostgREST schema exposure.
- Supabase anon/authenticated default EXECUTE grants in the actual project.
- Correctness of auth.role()=service_role RLS policies and RLS of organizations/organization_users/leads/call_logs.
- Callers (edge functions) invoking these RPCs.

**confidence**: high