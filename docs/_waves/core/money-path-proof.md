# Can a customer pay and a call actually be billed?

lane: money-path-proof  model: deepseek/deepseek-v4.1-flash  cost: $0.0173
tokens: 42274 in / 4000 out
files: supabase/migrations/20260124_white_label_credits.sql, supabase/migrations/20260713060000_credit_ledger_schema_contract.sql, supabase/migrations/20260713070000_agent_pricing_schema_contract.sql, supabase/functions/credit-management/index.ts, supabase/functions/stripe-webhook/index.ts

---

## Money path trace

### 1. Balance check — reachable
`check_credit_balance` exists in both migrations. The canonical one is `20260713060000_credit_ledger_schema_contract.sql:281-348` (returns `has_balance, current_balance_cents, reserved_balance_cents, available_balance_cents, cost_per_minute_cents, required_cents, billing_enabled, allow_negative, negative_limit_cents`). The edge function `check_balance` calls it and reads exactly those fields (`credit-management/index.ts:260-286`). Reachable **only if the 20260713 migration is applied** — the older `20260124_white_label_credits.sql:235-288` returns a different shape (no `reserved_balance_cents`/`available_balance_cents`/`allow_negative`), so the edge function would silently default those to 0. FACT.

### 2. Credit reservation — reachable, but amount is unverified
`reserve_credits` canonical at `20260713060000...:350-527`. Callers: `outbound-calling/index.ts:1008`, `telnyx-outbound-ai/index.ts:270`, `_shared/credit-helpers.ts:200`, `credit-management/index.ts:313`. The function freezes `customer_rate_cents`, `provider_rate_cents`, `max_exposure_cents`, `pricing_policy_version`, `agent_id` into `metadata` (lines 511-518). It validates `customer_rate > 0` and `provider_rate >= 0` (line 480-482) but **does not enforce `customer_rate >= provider_rate`** at reservation time. FACT.

### 3. Dispatch — reachable, not shown
`outbound-calling/index.ts:1008` calls `reserve_credits`. The full dispatch body is not in the supplied evidence, so I cannot verify the `p_amount_cents` sizing. THEORY: if the reservation is smaller than the eventual `ceil(actual_minutes * customer_rate)`, `finalize_call_cost` returns `CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED` (line 773-782) and the call is never billed.

### 4. Provider call — not shown
Retell call initiation is not in the supplied excerpts. Not checked.

### 5. Cost finalisation — reachable
`finalize_call_cost` canonical at `20260713060000...:529-878`. Callers: `outbound-calling/index.ts:699`, `retell-call-webhook/index.ts:2095`, `_shared/credit-helpers.ts:280,336`, `credit-management/index.ts:369`. It uses only the immutable reservation snapshot (lines 710-744), computes `deduction = ceil(actual_minutes * customer_rate)` and `margin = deduction - provider_cost` (lines 746-751). Reachable if migration applied.

### 6. Ledger row — reachable, but legacy function is broken
Canonical ledger writes `transaction_type` (`20260713060000...:501-519, 811-861, 986-995`). The old `deduct_call_credits` (`20260124_white_label_credits.sql:291-401`) still writes the old `type` column (line 365) and is **not dropped** by the 20260713 migration. Grep shows no callers, so it is dead code — but if anything still calls it after the rename, it fails. FACT (grep: `deduct_call_credits` appears only at its definition).

### 7. Stripe top-up — **broken**

**Checkout session** (`credit-management/index.ts:584-647`) sets metadata keys:
- `metadata[organization_id]`, `metadata[credit_policy_version]`, `metadata[paid_amount_cents]`, `metadata[credit_amount_cents]`, `metadata[user_id]` (lines 621-625).

**Webhook** (`stripe-webhook/index.ts:341-402`) reads:
- `session.metadata?.amount_cents` and `session.metadata?.bonus_cents` (lines 368-369).

These keys are **never set by the checkout function**. So `amountCents = parseInt("0") = 0`, `bonusCents = 0`, `totalCredits = 0`. FACT (credit-management/index.ts:621-625 vs stripe-webhook/index.ts:368-369).

Then `add_credits` is called with `p_amount_cents: 0` (line 
