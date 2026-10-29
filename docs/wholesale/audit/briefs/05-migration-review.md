# JOB 05 - Red-team review of a new migration (lane: ultra)
## CONTEXT
Postgres 15 on Supabase. Roles: `anon` (logged out), `authenticated` (any logged-in user of ANY customer company),
`service_role` (our server code, bypasses RLS). Supabase grants ALL privileges on new public tables to anon and
authenticated by default; RLS policies then filter rows. Existing helper functions (already live, not in this file):
`public.user_in_organization(org_id uuid)` = EXISTS row in organization_users with that org and user_id = auth.uid();
`public.is_org_admin(org_id uuid)` = same with role in ('owner','admin'); `public.update_updated_at_column()` trigger fn.
Many different wholesaler companies will share this database. A logged-in user of company A must never read or change
anything of company B. When a company's `wh_org_settings.access_locked = true` (they stopped paying), its users must see
NO wh_* rows except their own settings row, and must not be able to unlock themselves.
## TASK
Attack the migration in the material. Find every way it is wrong or unsafe. Check at least:
1. Can an `authenticated` user of company A read/insert/update/delete company B rows in any wh_* table? (Think about
   INSERT with another org's organization_id, UPDATE that moves a row to another org, foreign keys pointing at another
   org's property/contact, SECURITY DEFINER functions.)
2. Can a locked company's user still read or write anything, or unlock itself (access_locked, subscription_status)?
3. Column privileges: do the REVOKE/GRANT statements actually achieve what the comments claim, given Supabase's default
   table-level grants? Is any write path left open or accidentally closed (e.g. INSERT on wh_offers still allowed with a
   chosen respond_token)?
4. Will every statement run on Postgres 15 (ordering, function bodies referencing tables, syntax)?
5. Anything that would break or slow the existing app (it touches no existing table - verify that claim).
## OUTPUT FORMAT
A markdown table: severity (CRITICAL/HIGH/MEDIUM/LOW) | line(s) | problem | concrete attack or failure | exact fix (SQL).
Then one line: "Verdict: SAFE TO APPLY" or "Verdict: FIX FIRST". No other text. Maximum 25 rows.
