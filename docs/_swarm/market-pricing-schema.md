# market-pricing-schema

- status: completed
- tldr: Unit = the cent ('credit'); 1 credit = $0.01 (implicit, /100). Retail voice $0.15/min, provider $0.07/min, no retail SMS price; SKUs $25-$1000.

PRICING SCHEMA -> NATURAL PRICE POINT (node market-pricing-schema) = DONE.

ANSWER: Unit metered = the CENT (internally a 'credit'), no separate token. Credit->dollar = 1 credit = 1 cent = $0.01, 1:1 and IMPLICIT (schema stores no dollar/credit-rate column; the 1:1 comes from the server purchase catalog and every /100 display).
- Retail voice = $0.15/min default (org_credits.cost_per_minute_cents DEFAULT 15), per-agent override via agent_pricing.customer_price_per_min_cents.
- Provider voice = $0.07/min default (retell_cost_per_minute_cents DEFAULT 7); composed base 13.5 c/min (LLM5+voice7+telephony1.5).
- SMS: NO retail price in the billing schema; only an internal ~1 cent/message estimate plus provider pass-through. reserve/finalize are minutes-only.
- Retail SKUs (the real dollar price points): $25/$50/$100/$250/$500/$1000 with bonus credits (5000,250)(10000,750)(25000,2500)(50000,7500)(100000,20000).
- NATURAL price point: voice $0.15/min, SMS ~$0.01, min SKU $25; default gross margin $0.08/min = 53%; mixed call+SMS ~= $0.385 (THEORY, no duration seed).

EVIDENCE (file:line): 20260124_white_label_credits.sql:31,35-36; 20260713070000_agent_pricing_schema_contract.sql:7-32; 20260713060000_credit_ledger_schema_contract.sql; credit-management/index.ts:194,200-206,590-624; _shared/credit-purchase-policy.ts:13-21,238-251; stripe-webhook/index.ts:365-398; budget-tracker/index.ts:241; ai-autonomous-engine/index.ts:1077,1806; ClientPortal.tsx:107-114; CreditDashboard.tsx:366; live baseline calculate_agent_base_cost:190-219.

VALIDATION: full reads of the 3 migrations + purchase policy; targeted greps across credit-management, stripe-webhook, budget-tracker, CreditDashboard, ClientPortal, ai-autonomous-engine; dollar mapping cross-confirmed in 3 independent places.

BLOCKERS / FOLLOW-UPS: no live DB access, so all figures are schema/default/code-level not live rows. Not checked: production pricing_tiers values, live org credit rate, whether SMS is ever billed, plans/subscription monthly prices, door_to_door pack pricing. Recommend a follow-up node that reads the live Supabase rows (pricing_tiers, agent_pricing, organization_credits for org 11824e05-...) to pin actual production numbers.

## Artifact

**Findings**

1) METERED UNIT = the cent (internally a 'credit'). Balances/prices/deductions are all cents; columns balance_cents, *_per_min_cents. 2) CREDIT->DOLLAR = 1 credit = 1 cent = $0.01, 1:1, IMPLICIT (derived via /100); schema has NO stored dollar/credit-per-dollar column. 3) RETAIL VOICE PRICE = DEFAULT 15 c/min = $0.15/min. 4) PROVIDER VOICE COST = DEFAULT 7 c/min = $0.07/min. 5) COMPOSED PROVIDER BASE COST default 13.5 c/min = LLM 5 + voice 7 + telephony 1.5 + KB 0. 6) PRICING ROWS: pricing_tiers (platform-global provider-cost catalog: tier_type, tier_name, base_cost_per_min_cents) and agent_pricing (per-tenant dispatch-time customer price: customer_price_per_min_cents, markup_cents/percentage, base_cost_per_min_cents); both read-only to authenticated, service_role writes; margin cannot be negative and active rows need a price. 7) NO RETAIL SMS PRICE: SMS is only an internal ~1c/message ESTIMATE plus provider passthrough; reserve/finalize are minutes-only. 8) RETAIL CATALOG = 6 SKUs $25/$50/$100/$250/$500/$1000 with server-controlled bonus credits (2500,0)(5000,250)(10000,750)(25000,2500)(50000,7500)(100000,20000). 9) BILLING is opt-in (organizations.billing_enabled default false) and short-circuits all charges. 10) TWO-PHASE reserve->finalize: reserve holds max_exposure and snapshots customer_rate/provider_rate/pricing_policy_version='credit-reservation-v1' immutably; finalize charges ceil(actual_minutes*customer_rate), margin = deduction - provider_cost, and refuses mutable rates.

**evidence**

- supabase/migrations/20260124_white_label_credits.sql:31,35,36
- supabase/migrations/20260713070000_agent_pricing_schema_contract.sql:7-32 (+ constraints agent_pricing_nonnegative_margin_check, agent_pricing_active_price_check)
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql (reserve_credits/finalize_call_cost/check_credit_balance; agent_pricing lookup ~465-472)
- supabase/functions/credit-management/index.ts:194,200-206,590-624
- supabase/functions/_shared/credit-purchase-policy.ts:13-21,238-251,260-270
- supabase/functions/stripe-webhook/index.ts:365-398
- supabase/functions/budget-tracker/index.ts:195,238-246
- supabase/functions/ai-autonomous-engine/index.ts:1077,1806,1825-1827
- src/components/ClientPortal.tsx:107-114
- src/components/CreditDashboard.tsx:366
- certification/recovery-lineage-v24/migrations/20260712000000_live_public_schema_baseline.sql:190-219
- supabase/tests/agent_pricing_schema_contract.sql:88-101

**validation**

Read both schema-contract migrations and the white_label_credits migration in full; read credit-purchase-policy.ts in full; grepped credit-management, stripe-webhook, budget-tracker, CreditDashboard, ai-autonomous-engine, ClientPortal for cost/price/dollar fields; read the live baseline calculate_agent_base_cost; cross-checked the per-agent price seed in the contract test. Dollar mapping confirmed independently in 3 places (SQL add_credits /100.0, TS balance_dollars=/100, purchase catalog 1:1).

**open_questions**

- Do pricing_tiers have real production rows on live project emonjusymdripmkvtttc, and what are the values? No migration seeds production tiers; only test row base_cost_per_min_cents 1.25 exists.
- What is the live organization_credits.cost_per_minute_cents for the live org (11824e05-...)? Default 15 is schema-level only.
- Is SMS ever billed to a customer? No deduction path exists for SMS (reserve/finalize are minutes-only).
- Do agent_pricing rows exist live, or does every call fall back to the org-level 15 c/min?
- What do the plans/subscriptions charge per month? stripe-webhook maps plan_id from stripe_price_id but plan prices were not read.

**what_i_did_not_check**

- Live DB values (no connection to emonjusymdripmkvtttc); all figures are schema/default/code-level.
- plans / subscription monthly pricing (stripe_price_id -> plan).
- legacy_runtime_function_schema_repair.sql (20260713140000) and the legacy calculate_agent_base_cost wrapper - not read in full.
- Actual Twilio/Telnyx invoices (budget-tracker reads Twilio usage but was not executed).
- certification/ lineages only spot-checked as a live-schema baseline, not diffed across all folders.
- door_to_door pack pricing (src/packs/door_to_door).

**confidence**: high