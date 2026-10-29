# JOB P1 - Reconcile 30 unapplied July migrations against the LIVE database (lane: ultra, research contract)

## SITUATION (facts from the foreman, verified 2026-10-28; treat as true)
- The live Supabase DB (one tenant "Default Organization", id 11824e05-24e3-4dc3-b684-5d0bc7c436d6, 3,303 leads, 5,635 call_logs, 40 phone_numbers, 8 campaigns, 511 dialing_queues rows, 28 dnc_list rows) applied every repo migration up to 20260703225037, then SKIPPED all 30 files from 20260712010000 to 20260720150000, then applied the Lovable files (20260720232851..., 20260816235500, 20260817000000) and TEN August files that exist ONLY live (folder `docs/wholesale/audit/phase1/live_only/`, versions 20260828012734 .. 20260828034301).
- Live data: `leads.organization_id` is NULL on 5 rows; `call_logs.organization_id` is NULL on 519 rows; campaigns and phone_numbers have 0 NULLs.
- Live has: `leads.custom_fields jsonb`, `call_logs.lead_id`, `organizations.settings jsonb`, `organizations.plan_id/unlimited_access/unlimited_reason/phone_mode`, tables plans/plan_addons/promo_codes/promo_redemptions, trigger `trg_guard_organization_billing_columns` (SECURITY INVOKER version from 20260828034301), trigger `trg_guard_campaign_has_agent`, trigger `on_auth_user_created_organization`.
- The 30 July files will be applied AFTER the August ones even though their version numbers are lower. Any `CREATE OR REPLACE FUNCTION`, `DROP POLICY`/`CREATE POLICY`, `DROP TRIGGER`, or `ALTER TABLE ... DROP CONSTRAINT` in a July file that touches an object the August set also defines will OVERWRITE the newer live definition. That is the main thing we must catch.
- The production dialer is live and dialing (call-dispatcher cron every minute writes dialing_queues/call_logs; retell-call-webhook writes call_logs; sms functions write sms_*). Anything that adds a NOT NULL, a trigger that RAISEs, or revokes a grant used by service_role or authenticated can stop production.

## TASK
Read all 30 July files and all 10 live_only files. Produce, in this order:

### A. One row per July migration (30 rows), in version order
| # | file | objects it CREATES (tables/functions/triggers/policies, names only) | objects it REPLACES or DROPS that ALSO appear in a live_only file (name + which live_only file) -> REGRESSION | data preconditions (NOT NULL / unique / FK that live rows could violate; cite the line) | depends on an earlier July file? (which) | touches a table the live dialer writes every minute? (dialing_queues, call_logs, leads, campaigns, sms_*, phone_numbers) | verdict: APPLY / APPLY-WITH-PATCH / HOLD |
Verdict rules: HOLD if it would regress a live_only object or would RAISE on live writes without a patch; APPLY-WITH-PATCH if a small, named change (backfill first, wrap in IF NOT EXISTS, re-apply the live_only version afterwards) makes it safe; APPLY otherwise. Cite path:line for every REGRESSION and every precondition.

### B. Regression list
Every object (function signature / policy name+table / trigger name+table / constraint) defined in BOTH a July file and a live_only file. For each: July definition line, live_only definition line, one sentence on how they differ, and which one must win (the live_only August one wins unless the July one is a strict superset; say which and why).

### C. Pre-apply SQL
Write the exact SQL to run BEFORE the batch: backfill `leads.organization_id` and `call_logs.organization_id` for NULL rows (to 11824e05-24e3-4dc3-b684-5d0bc7c436d6 for leads; for call_logs prefer the lead's organization_id via call_logs.lead_id, else the campaign's via call_logs.campaign_id if that column exists in the material, else the default org), plus any other precondition fix you found in A. Each statement with a `-- expect: N rows` comment.

### D. Apply plan
The ordered list of files to run, with the patch for each APPLY-WITH-PATCH item written out as SQL, and the list of live_only files to RE-RUN at the end to restore the August definitions. Then the verification SQL (pg_trigger / pg_policies / information_schema queries) that proves the end state: every August object intact + every July object present.

### E. UNKNOWNs
Anything you could not decide from the material, with the file or query that would answer it.

Rules: no prose outside these sections. Precision over coverage: a wrong APPLY verdict stops a live dialer; a wrong HOLD costs one review cycle.
