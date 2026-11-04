# Can a customer pay and a call actually be billed? - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0073

---

# Money-path trace: one paid outbound call

Scope note: I only have the excerpts above. "Reachable" below means *the code path exists in the repo*; it does **not** mean the migration is applied to the live DB (see the explicit caveat at the end).

## Step-by-step

**1. Balance check**
- `check_credit_balance` exists (20260713060000_credit_ledger_schema_contract.sql:281-348) and is exposed via `credit-management` action `check_balance` (credit-management/index.ts:246-292). Reachable as an API.
- No supplied grep shows the dispatch path calling `check_credit_balance`. The only pre-dispatch RPC callers shown are `reserve_credits` (outbound-calling/index.ts:1008, telnyx-outbound-ai/index.ts:270, _shared/credit-helpers.ts:200). So the *pre-call balance check* is not evidenced as wired into dispatch — THEORY, not proven.
- Not a hard break: `reserve_credits` re-checks available balance itself (20260713060000:484-494).

**2. Credit reservation**
- Canonical `reserve_credits(uuid, integer, uuid, text, text, integer, text)` (20260713060000:350-527). Callers exist (outbound-calling/index.ts:1008; telnyx-outbound-ai/index.ts:270; _shared/credit-helpers.ts:200). Reachable in repo.
- Break risk: the migration **drops** the old 4/5-arg signatures (20260713060000:269-273) and creates the 7-arg one. If the migration is not applied, the 7-arg named-param call from credit-management (index.ts:313-321) and the dispatch callers will not resolve. FACT of dependency; live state unknown.
- `reserve_credits` returns success with no reservation when `billing_enabled` is false (20260713060000:414-417). So if the org was never flipped to `billing_enabled = true`, every call is free and no ledger row is written. FACT.

**3. Dispatch**
- `outbound-calling/index.ts:1008` calls `reserve_credits`. The excerpt does not show the amount, `customer_rate_cents`, or `agent_id` passed. Cannot verify the reservation is priced correctly. NOT CHECKED.

**4. Provider call (Retell)**
- Not in the supplied evidence. Cannot verify. NOT CHECKED.

**5. Cost finalisation**
- Canonical `finalize_call_cost(uuid, uuid, text, numeric, integer, text, text)` (20260713060000:529-878). Callers: outbound-calling/index.ts:699, retell-call-webhook/index.ts:2095, _shared/credit-helpers.ts:280,336. Reachable in repo.
- credit-management `finalize_cost` calls it with 6 named params, omitting `p_agent_id` (index.ts:369-376). That is legal (default NULL) but means the agent-identity cross-check (20260713060000:733-744) is skipped on this path. FACT.
- `finalize_cost` requires `retell_call_id` (index.ts:354) even though the DB accepts a call-log-only finalisation (20260713060000:580). Minor, not a break.
- Settlement price is taken **only** from the reservation snapshot (20260713060000:707-732). If the reservation was written by the *old* `reserve_credits` (20260124_white_label_credits_v2_enhanced.sql:176) without `customer_rate_cents`/`provider_rate_cents`/`pricing_policy_version`, finalisation returns `CREDIT_SETTLEMENT_RECONCILIATION_REQUIRED` and **no charge is applied** (20260713060000:710-718). FACT — this is a real break for any pre-migration reservation.

**6. Ledger row**
- Canonical column is `transaction_type` (20260713060000:25-47, 164-169). `get_transactions` filters on `transaction_type` (credit-management/index.ts:470). Consistent with the new schema.
- The old migration writes `type` (20260124_white_label_credits.sql:97-104, 364-385) and defines `deduct_call_credits` (20260124:291) which has **no callers** in the grep. FACT — legacy/dead.
- If the rename migration is not applied, `get_transactions` filtering on `transaction_type` fails. FACT of dependency.

**7. Stripe top-up — checkout session**
- `create_checkout_session` (credit-management/index.ts:584-647) writes metadata keys `organization_id`, `credit_policy_version`, `paid_amount_cents`, `credit_amount_cents`, `user_id` (index.ts:621-627). FACT.

**8. Stripe top-up — webhook**
- **Break (hard):** the webhook reads `session.metadata?.amount_cents` and `session.metadata?.bonus_cents` (stripe-webhook/index.ts:368-369), but the checkout session never writes those keys — it writes `paid_amount_cents` / `credit_amount_cents`. So `amountCents = 0`, `bonusCents = 0`, `totalCredits = 0` (stripe-webhook/index.ts:380). The customer pays and **zero credits are added**. FACT.
- **Break (silent):** on `add_credits` failure the webhook logs and returns 200 without throwing (stripe-webhook/index.ts:391-396), so Stripe never retries and the credit is lost. FACT.
- **Break (signature drift):** the webhook calls `add_credits` with `p_transaction_type` and `p_stripe_payment_id` (stripe-webhook/index.ts:382-389). Those names exist only in the new function (20260713060000:880-887). The old function uses `p_type` and `p_stripe_payment_intent_id` (20260124:404-410). If the new migration is not applied, the RPC call fails outright. FACT.
- The checkout path does **not** use `withEventClaim` (stripe-webhook/index.ts:341-401); it relies on the `stripe_${event.id}` idempotency key (line 388). Acceptable, but inconsistent with the subscription paths.
- `payment_intent.succeeded` auto-recharge path (stripe-webhook/index.ts:404-434) is unreachable in practice: `check_auto_recharge` is launch-disabled and never returns a payment method (credit-management/index.ts:568-579). FACT.

## Smallest set of changes to make "customer pays → call billed" true

1. **Fix the metadata key mismatch** — either write `amount_cents`/`bonus_cents` in `create_checkout_session` (index.ts:621-627) or read `paid_amount_cents`/`credit_amount_cents` in the webhook (stripe-webhook/index.ts:368-369). Without this, top-up credits are always 0.
2. **Make the webhook fail loudly** on `add_credits` error (stripe-webhook/index.ts:391-396) — throw so Stripe retries, or wrap in `withEventClaim`.
3. **Apply migration 20260713060000 to the live DB** so `reserve_credits`/`finalize_call_cost`/`add_credits` have the signatures the callers use, and `credit_transactions.transaction_type` exists.
4. **Ensure `organizations.billing_enabled = true`** for the paying org (set by the subscription webhook at stripe-webhook/index.ts:556-562, or manually). Otherwise reserve/finalize no-op (20260713060000:414-417, 319-322).
5. **Ensure an `organization_credits` row exists** — `add_credits` creates it (20260713060000:929-931), but `reserve_credits` errors if absent (20260713060000:423-426).

## Retail price vs provider cost

- Default retail: **15 cents/min** (`cost_per_minute_cents` default, 20260124_white_label_credits.sql:35).
- Default provider cost: **7 cents/min** (`retell_cost_per_minute_cents` default, 20260124:36).
- Implied margin: **8 cents/min** (~53%).
- Per-agent override: `agent_pricing.customer_price_per_min_cents` vs `base_cost_per_min_cents` (20260713070000:18-35).
- **Where margin is enforced:**
  - Schema: `agent_pricing_nonnegative_margin_check` — `customer_price_per_min_cents >= base_cost_per_min_cents` (20260713070000:266-270). This is the only hard margin guard.
  - Runtime: `finalize_call_cost` computes `margin := deduction - provider_cost` (20260713060000:751) and snapshots `customer_rate_cents`/`provider_rate_cents` at reservation time (20260713060000:478-479, 511-518).
  - **Gap:** `reserve_credits` only checks `customer_rate > 0` and `provider_rate >= 0` (20260713060000:480-482). It does **not** enforce `customer_rate >= provider_rate`. The fallback path (`credits.cost_per_minute_cents` vs `credits.retell_cost_per_minute_cents`) has no non-negative-margin constraint — `organization_credits` only has `positive_cost CHECK (cost_per_minute_cents > 0)` (20260124:56). An org could be configured at a loss. FACT.

## Migration caveat (explicit)

**Migration text being present in the repo does NOT prove the migration is applied to the live database.** Every "reachable" claim above is about the repo. The live DB may still carry the old `type` column, the old 4/5-arg `reserve_credits`, the old `add_credits` signature, and no `reserved_balance_cents` — in which case the webhook and dispatch calls fail at the RPC boundary. I cannot verify live schema state from these excerpts.

## What I did NOT check

- `outbound-calling/index.ts`, `telnyx-outbound-ai/index.ts`, `_shared/credit-helpers.ts`, `retell-call-webhook/index.ts` bodies (only grep hits).
- `_shared/credit-purchase-policy.ts` (checkout amount/bonus semantics).
- `_shared/stripe-signature.ts`.
- The live DB schema, applied migrations, or deployed function versions.
- Retell provider integration and actual call dispatch.

Confidence: **medium** — the checkout/webhook metadata mismatch and the silent-failure path are directly citable and conclusive; the live-application status and dispatch wiring are unverifiable from the supplied evidence.
