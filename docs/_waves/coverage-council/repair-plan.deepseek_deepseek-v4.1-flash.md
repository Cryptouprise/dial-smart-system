# The ordered repair plan - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0038

---

## Step zero — deploy-gate decision (do this before any code change)

**FACT:** `supabase/functions-live/README.md:9-10` — live does not have the 503 certification gates; `:80` — "the 503 `*_NOT_CERTIFIED` gates exist only on GitHub `main`, never on live." The counts (73 gates, 40+ functions) come from the question, not from supplied evidence.

- **Option A — hold the deploy (recommended).** Live keeps the working dialer (`outbound-calling` v600, `call-dispatcher` v610) and `generate-daily-report`. Cost: `main` stays divergent from live; every fix must ship per-function, and the 73 gates stay unreviewed.
- **Option B — deploy `main`.** Every gated function returns 503 `*_NOT_CERTIFIED`. Blast radius: no calls placed, no daily report — a revenue-path outage, not a degraded mode. Only choose this if the gates are first reconciled (item 5).

The gates are fail-closed *by design*; the same posture appears in `src/lib/launchSafety.ts:128-159` (all browser egress returns `false`). Do not "fix" the outage by flipping those to `true`.

## Ordered plan (risk removed ÷ effort)

**1. Migration `20260407220336_3e4797af` — bare `DELETE FROM lead_pipeline_positions`**
- Files: `supabase/migrations/20260407220336_3e4797af_*.sql` (exact filename not in evidence).
- Change: first determine whether it is already applied. If **unapplied**, add the intended `WHERE` or delete the file. If **applied**, editing the file is a no-op — the rows are already gone; write a compensating restore instead.
- Test: replay migrations against a restored staging DB; assert `lead_pipeline_positions` row count is unchanged.
- Blast radius: a wrong `WHERE` deletes the wrong subset; assuming "unapplied" when it ran wastes the only recovery window.

**2. Revoke `get_user_organizations` (split out of defect e)**
- Files: the function definition + its grants (not in evidence).
- Change: `REVOKE EXECUTE ON FUNCTION get_user_organizations() FROM anon, authenticated;` — one statement, closes cross-tenant org enumeration.
- Test: as an unauthenticated/tenant-A client, call it; assert permission denied.
- Blast radius: if any client uses it for org switching, that UI breaks. Grep callers before revoking.

**3. Stripe credit metadata key mismatch (defect d)**
- Files: `supabase/functions/stripe-webhook/index.ts:368` reads `session.metadata?.amount_cents`; the checkout-session creator is **not in the supplied evidence**.
- Change: make the webhook tolerant — read `credit_amount_cents ?? amount_cents` — so in-flight sessions still grant. (Alternative: fix the checkout side; I cannot cite that file.)
- Test: unit test with a session whose metadata has only `credit_amount_cents`; assert `p_amount_cents > 0` and credits granted.
- Blast radius: defaulting to a nonzero amount grants free credits; the current state grants zero. **Also flag:** `:384` passes `totalCredits` while `:419` passes `amountCents` — two call sites, possibly a second defect (THEORY).
- Note: `functions-live` shows live `stripe-webhook` at v123 / 599 lines, so the fix must be re-snapshotted after deploy.

**4. Fresh-org provisioning chain (defect b) — four sub-fixes, in this order**
- **b2 (campaign wizard):** `src/components/CampaignWizard.tsx`. **FACT:** grep for `organization_id` in that file returns no hits. Change: include `organization_id` from the authenticated tenant context in the insert payload. Test: create a campaign as a fresh org; assert the row lands with the correct `organization_id`. Blast radius: a wrong org id writes into another tenant.
- **b4 (Retell webhook 503):** `supabase/functions/retell-call-webhook/index.ts` (live v453, 2485 lines). Change: **set the signing-key secret in the live project** — do not relax signature verification. Test: valid signature → 200; missing key → explicit error, not a silent 503. Blast radius: accepting unsigned calls lets anyone forge call outcomes.
- **b3 (dispatcher cron):** `supabase/functions/call-dispatcher/index.ts` (live v610) or its pg_cron definition — not in evidence. Change: enumerate tenants/active campaigns rather than only tenants with due queue rows. Test: fresh org with zero queue rows → cron run produces work. Blast radius: waking every tenant each tick (cost/rate limits).
- **b1 (no phone number on fresh org):** file not in evidence. THEORY.

**5. Reconcile the 73 `*_NOT_CERTIFIED` gates (defect a)**
- Files: the gated edge functions under `supabase/functions/<slug>/index.ts`; `supabase/functions-live/**` is the byte-exact live reference.
- Change: per gate, either remove it from `main` or supply the certification evidence it demands. The gate source itself is not in the supplied evidence, so I cannot name lines.
- Test: deploy to a staging project ref; assert each function's happy path returns non-503. Cheaper proxy: diff `main`'s bodies against the `functions-live` snapshots for the 7 never-redeployed functions (`README.md:79-80`).
- Blast radius: this is the item that makes Option B safe. Until it is done, Option A holds.

**6. 85 org-blind tables (rest of defect e)**
- Files: `supabase/migrations/*.sql` RLS policies (not in evidence).
- Change: add `organization_id` + RLS per table, backfilling before any `NOT NULL`.
- Test: as tenant A, query each table; assert zero tenant-B rows.
- Blast radius: largest effort, longest tail; a bad backfill or a missing policy silently re-opens the leak.

## Must NOT be touched
- `supabase/functions-live/**` — read-only snapshots (`README.md:10-11`).
- Retell signature verification — fix the secret, not the check.
- `src/lib/launchSafety.ts` browser locks — flipping them to `true` is the wrong fix for the 503s.
- The 7 never-redeployed functions' live bytes (`README.md:79-80`).
- An already-applied migration file, expecting it to take effect.

## Not checked
I did not see: the gate source, the checkout-session creator, the cron definition, the migration file, the RLS policies, the `get_user_organizations` definition, or any test files. All four evidence artifacts are quoted above; everything else is marked THEORY.

**Confidence: medium** — citations are solid, but several defect details rest on the question's assertions rather than supplied files, and the ordering is judgment.
