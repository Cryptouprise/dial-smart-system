# The ordered repair plan - reviewer google/gemini-3.8-flash

cost: $0.0108

---

### Step 0: Deploy-Gate Decision

**Decision:** Do NOT run a standard `supabase functions deploy --all` from `main`.

* **Option A: Revert / Strip the 73 `*_NOT_CERTIFIED` gates on `main` before any deploy.**
  * *Consequence:* Brings `main` into sync with live edge runtime semantics. Safe to perform bulk CI/CD deployment without disabling the 40+ operational functions (`supabase/functions-live/README.md:9-10, 79-80`).
* **Option B: Deploy individual function slugs explicitly using live-reconciled code only (or deploy from dedicated hotfix branches based on `supabase/functions-live/`).**
  * *Consequence:* Prevents accidental mass outage of dialer, dispatcher, and report jobs while individual defects are repaired. Standard whole-repo automated deployments remain blocked until all gates are formally certified or removed.

---

### Ordered Repair Plan (Ranked by Risk Removed ÷ Effort)

#### 1. [Defect d] Stripe Webhook Credit Metadata Key Mismatch
* **Risk / Effort:** Very High / Minimal (single variable key fix).
* **Exact files:** `supabase/functions/stripe-webhook/index.ts` (or the checkout session generator file creating the metadata).
* **Precise change:** In `supabase/functions/stripe-webhook/index.ts:368`, change:
  ```typescript
  const amountCents = parseInt(session.metadata?.credit_amount_cents || session.metadata?.amount_cents || "0");
  ```
  (Accept `credit_amount_cents` matching the checkout session payload).
* **Test that proves it:** Post a mock Stripe `checkout.session.completed` event where `session.metadata = { credit_amount_cents: "5000" }` and assert `p_amount_cents` passed to `record_wallet_transaction` equals `5000` instead of `0`.
* **Blast radius if wrong:** Webhook errors out or credits 0/incorrect balance to purchasing tenants.

---

#### 2. [Defect c] Migration `20260407220336_3e4797af` Unbounded Table Truncation
* **Risk / Effort:** Critical Data Loss / Minimal (SQL fix before applying to any database).
* **Exact files:** `supabase/migrations/20260407220336_3e4797af*.sql` (migration file).
* **Precise change:** Add the intended `WHERE` clause scoping deletion to specific tenant/campaign/invalid states, or remove the bare `DELETE FROM lead_pipeline_positions;` statement entirely.
* **Test that proves it:** Run migration against a seeded database containing existing `lead_pipeline_positions` rows; assert non-target rows survive migration.
* **Blast radius if wrong:** If applied to production or staging with live data, wipes every lead position across the entire platform.

---

#### 3. [Defect b] First-Run Tenant & Campaign Onboarding Pipeline
* **Risk / Effort:** High (blocks platform adoption) / Medium (touches 4 interconnected components).
* **Exact files & Precise changes:**
  1. *Phone Provisioning:* Org creation flow / hook; trigger number purchase or allocate a default pool caller ID upon org insert.
  2. *Campaign Wizard:* `src/components/CampaignWizard.tsx`; inject active tenant `organization_id` into the campaign insert payload (`grep 'organization_id' in src/components/CampaignWizard.tsx` returned 0 hits).
  3. *Call Dispatcher Cron:* `supabase/functions/call-dispatcher/index.ts`; adjust tenant query from filtering strictly on existing due queue items to inspecting active campaigns requiring dispatch generation.
  4. *Retell Call Webhook:* `supabase/functions/retell-call-webhook/index.ts`; add fallback/graceful verification handling or ensure `RETELL_SIGNING_KEY` / webhook secret environment variable is present in Supabase secrets so it does not throw 503.
* **Test that proves it:** Provision a new tenant; create a campaign via the wizard (verifying `organization_id` exists in the DB row); confirm dispatcher picks up tenant without manual queue injection; simulate a Retell webhook payload and assert `200 OK`.
* **Blast radius if wrong:** New tenant onboarding breaks, duplicate outbound calls triggered, or incoming Retell post-call updates dropped.

---

#### 4. [Defect a] Reconcile 73 `NOT_CERTIFIED` Gates on `main`
* **Risk / Effort:** High / High (73 gates across 40+ edge functions).
* **Exact files:** Edge function files across `supabase/functions/*/index.ts` containing `*_NOT_CERTIFIED` checks, plus browser guards in `src/lib/launchSafety.ts:115-160`.
* **Precise change:** Either remove the gate early-returns that emit 503s on `main` to mirror `supabase/functions-live/` bytes (`supabase/functions-live/README.md:9-10, 79-80`), or implement the audited server-side check requirements specified in `src/lib/launchSafety.ts:77-113`.
* **Test that proves it:** Automated invocation of `generate-daily-report`, `outbound-calling`, and `call-dispatcher` returns expected business responses rather than 503 error responses.
* **Blast radius if wrong:** Disables operational production features across all edge functions if deployed prematurely, or exposes un-audited contact egress if removed without adequate server-side authorization.

---

#### 5. [Defect e] Tenant Boundary Isolation (85 Org-Blind Tables & `get_user_organizations`)
* **Risk / Effort:** Critical Cross-Tenant Leak / Very High (requires schema-wide RLS policies & migration audits).
* **Exact files:** Database migrations / SQL definitions for the ~85 org-blind tables, plus database function permissions for `public.get_user_organizations`.
* **Precise change:**
  1. Add `organization_id` foreign keys and enable Row Level Security (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`) with tenant isolation policies on all 85 tables.
  2. Execute `REVOKE EXECUTE ON FUNCTION public.get_user_organizations(...) FROM public, anon, authenticated;` (or restrict execution strictly to trusted server roles).
* **Test that proves it:** With a JWT from Tenant A, attempt `SELECT`, `UPDATE`, and `DELETE` on all 85 tables for rows belonging to Tenant B; assert zero rows returned/mutated. Assert direct client RPC call to `get_user_organizations` fails with permission denied.
* **Blast radius if wrong:** High risk of breaking joins, front-end dashboard queries, background workers, and locking legitimate users out of their data.

---

### What Must NOT Be Touched

1. **`supabase/functions-live/` directory:** These are read-only byte-exact reference snapshots from live edge deployments (`supabase/functions-live/README.md:10-12, 66-68`).
2. **Cosmetic trailing comments:** The stray line `// Copyright 2018-2022 the D` in `twilio-sms-webhook` and `ai-sms-processor` (`supabase/functions-live/README.md:72-77`).
3. **Emergency pause & status downgrade logic:** `browserCampaignStatusMutationAllowed` where `status === 'paused'` in `src/lib/launchSafety.ts:115-119` (operators must retain ability to pause running jobs).

---

### What Was Not Checked
* The exact contents and SQL syntax of migration `20260407220336_3e4797af`.
* Full implementation details of `src/components/CampaignWizard.tsx`, `call-dispatcher/index.ts`, and `retell-call-webhook/index.ts`.
* The exact list and schemas of the 85 tables reported as org-blind, and the exact signature/grants of `get_user_organizations`.

Confidence: High
