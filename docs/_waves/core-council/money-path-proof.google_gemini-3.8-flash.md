# Can a customer pay and a call actually be billed? - reviewer google/gemini-3.8-flash

cost: $0.0617

---

### Warning on Migration Status
*FACT:* Migration files existing in `supabase/migrations/` (such as `20260713060000_credit_ledger_schema_contract.sql`) does **NOT** prove these migrations have been applied to the live database. If they are unapplied, the live database will still have the legacy schema from `20260124_white_label_credits.sql` or fail on missing RPCs.

---

### Step-by-Step Trace & Breakages

#### 1. Stripe Top-Up Path (Checkout Session + Webhook)
* **Checkout Session Creation:**
  * **Reachable today:** Yes, via `credit-management` with action `create_checkout_session` (`supabase/functions/credit-management/index.ts:584-647`).
  * **What is missing/wrong:** *Broken metadata contract.* `create_checkout_session` sets metadata keys `metadata[paid_amount_cents]` and `metadata[credit_amount_cents]` (`index.ts:623-624`). It never sends `amount_cents` or `bonus_cents`.
* **Webhook Handling:**
  * **Reachable today:** Yes, via POST to `stripe-webhook` for `checkout.session.completed` (`supabase/functions/stripe-webhook/index.ts:342-402`).
  * **What is missing/wrong:** *Zero-credit failure.* The webhook handler attempts to read `session.metadata?.amount_cents` and `session.metadata?.bonus_cents` (`stripe-webhook/index.ts:368-369`). Because those keys do not exist in the session metadata, both parse to `0`, producing `totalCredits = 0`. When calling RPC `add_credits`, `add_credits` rejects zero amounts (`20260713060000_credit_ledger_schema_contract.sql:914`: `IF ... p_amount_cents = 0 THEN RAISE EXCEPTION ...`). The webhook logs the error and exits without adding funds. Furthermore, the webhook passes named arguments `p_transaction_type` and `p_stripe_payment_id` (`stripe-webhook/index.ts:385-387`) which fail if migration `20260713060000` is unapplied (the `20260124` signature took `p_type` and `p_stripe_payment_intent_id`, `20260124_white_label_credits.sql:404-410`).

#### 2. Balance Check
* **Reachable today:** Yes, via `credit-management` action `check_balance` (`index.ts:246-291`) calling RPC `check_credit_balance`.
* **What is missing/wrong:** If migration `20260713060000` is applied, this functions correctly against `organization_credits` (`balance_cents - reserved_balance_cents >= required_cents`, lines 333–346). If unapplied, `20260124` returns a completely different column schema (`has_balance`, `current_balance_cents`, `cost_per_minute_cents`, `required_cents`, `billing_enabled`), omitting `reserved_balance_cents` and `available_balance_cents` (`20260124_white_label_credits.sql:238-243`).

#### 3. Credit Reservation
* **Reachable today:** Yes, via `credit-management` action `reserve_credits` (service-role only, `index.ts:297-339`) or directly from dispatch functions via RPC `reserve_credits`.
* **What is missing/wrong:** Completely missing if migration `20260713060000` is not applied (the baseline `20260124_white_label_credits.sql` defines no `reserve_credits` function). When applied, permissions are correctly restricted to `service_role` (`20260713060000:1013`).

#### 4. Dispatch
* **Reachable today:** Referenced in `outbound-calling` and `telnyx-outbound-ai` (grep hits `supabase/functions/outbound-calling/index.ts:1008`, `supabase/functions/telnyx-outbound-ai/index.ts:270`).
* **What is missing/wrong:** Dispatch depends on a successful reservation ID before dialing; if reservation fails or aborts due to zero balance, dispatch halts.

#### 5. Provider Call
* **Reachable today:** External execution via Retell/Telnyx.
* **What is missing/wrong:** Outside local database control.

#### 6. Cost Finalisation
* **Reachable today:** Yes, via `credit-management` action `finalize_cost` (`index.ts:344-400`) or Retell webhook (`supabase/functions/retell-call-webhook/index.ts:2095`).
* **What is missing/wrong:** Missing if migration `20260713060000` is unapplied (baseline migration `20260124` only provided `deduct_call_credits`, which lacked reservation settlement). Under `20260713060000`, `finalize_call_cost` successfully reconciles against the reservation hold (`20260713060000:746-832`), releases the hold, updates `call_logs.credit_deducted = true`, and charges actual minutes.

#### 7. Ledger Row
* **Reachable today:** Yes, generated inside RPC `finalize_call_cost` (`20260713060000:811-862`).
* **What is missing/wrong:** If migration `20260713060000` is unapplied, the table expects `type` (`20260124:97`) rather than `transaction_type` (`20260713060000:165`), and lacks columns like `retell_call_id`.

---

### Smallest Set of Changes to Make End-to-End Billing Work

1. **Align Stripe Metadata Keys:** In `supabase/functions/stripe-webhook/index.ts` (lines 368–369), parse `session.metadata?.paid_amount_cents` and `session.metadata?.credit_amount_cents` (fallback to `amount_cents` / `bonus_cents`) so `totalCredits` is > 0 and matches what `create_checkout_session` sends.
2. **Apply Database Migration:** Ensure `20260713060000_credit_ledger_schema_contract.sql` (and `20260713070000_agent_pricing_schema_contract.sql` if using per-agent pricing) is applied to the live database so that `reserve_credits`, `finalize_call_cost`, and the modern `add_credits` RPC exist with the expected parameter signatures.

---

### Pricing and Margin Enforcement

* **Retail Price per Minute (Schema Default):** 15¢ / minute (`cost_per_minute_cents DEFAULT 15`, `20260124_white_label_credits.sql:35`).
* **Provider Cost per Minute (Schema Default):** 7¢ / minute (`retell_cost_per_minute_cents DEFAULT 7`, `20260124_white_label_credits.sql:36`).
* **Where Margin is Enforced:**
  1. **Schema Check:** In `agent_pricing` via constraint `agent_pricing_nonnegative_margin_check` (`20260713070000_agent_pricing_schema_contract.sql:266-270`), guaranteeing `customer_price_per_min_cents >= base_cost_per_min_cents`.
  2. **Ledger Finalisation:** In RPC `finalize_call_cost` (`20260713060000_credit_ledger_schema_contract.sql:746-751`), where `margin := deduction - provider_cost` is calculated and written directly into `credit_transactions.margin_cents` (line 850).

---

### What Was NOT Checked
* Full file contents of `supabase/functions/outbound-calling/index.ts` and `supabase/functions/retell-call-webhook/index.ts` (only grep occurrences were supplied).
* Live database state, applied migrations table (`supabase_migrations.schema_migrations`), or live environment secrets (`STRIPE_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`).

Confidence: high
