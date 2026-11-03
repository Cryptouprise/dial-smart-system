# risks-c2-doublecharge

- status: completed
- tldr: No working double-credit vector (stripe_events PK + add_credits unique idempotency); real gaps: credit purchases credit ZERO (F1) and billing-portal 60s window allows double subscriptions (F2).

LANE risks-c2-doublecharge (MONEY part 2) complete. Question: is the Stripe webhook idempotent, are credit ledger writes idempotent, can a retried webhook / duplicate event / client retry double-credit or double-charge?

ANSWER (high confidence): No working double-CREDIT vector. Subscription/invoice/subscription-checkout paths dedupe on public.stripe_events(event.id) PRIMARY KEY (withEventClaim, stripe-webhook:258-289; table billing_lock.sql:155-159). Credit paths skip that claim but are idempotent on add_credits' idempotency key `stripe_${event.id}` + p_stripe_payment_id, enforced by UNIQUE partial indexes on credit_transactions.idempotency_key (credit_ledger:178-180) and stripe_payment_id (:181-183), with the org_credits row locked FOR UPDATE before the idempotency read (credit_ledger:933-968). Per-call usage settlement (finalize_call_cost) is likewise idempotent (credit_ledger:614-622, :671-699). A webhook cannot double-CHARGE at all (it never creates charges); replay inside the 5-min signature window (stripe-signature.ts:59) is neutralised by the same dedupe.

Ranked money findings:
- F1 [FACT, HIGH but inverse]: real credit purchases credit ZERO. Only checkout creator sets metadata[paid_amount_cents]/[credit_amount_cents] (credit-management:611-627) but the webhook reads metadata.amount_cents/bonus_cents (stripe-webhook:368-369); repo-wide grep finds no setter of amount_cents/bonus_cents. totalCredits=0, add_credits raises on 0 (credit_ledger:913-914), error is swallowed, 200 returned (stripe-webhook:391-396). Customer charged, no credits.
- F2 [FACT+THEORY, MEDIUM-HIGH]: double recurring charge. billing-portal subscription-checkout idempotency key is only a 60s window (billing-portal:197) with no existing-subscription guard (:148-199); two requests >60s apart can yield two subscriptions.
- F3/F4/F5/F6/F7 [FACT, LOW]: credit-path retries safe; subscription paths safely deduped; create_checkout_session has no Stripe Idempotency-Key (benign); usage settlement idempotent; signature window/replay handled.

Validation: full source reads of stripe-webhook, billing-portal, credit-management, credit-purchase-policy, stripe-signature; canonical add_credits/reserve_credits/finalize_call_cost in 20260713060000_credit_ledger_schema_contract.sql; stripe_events + guard in 20261029200000_billing_lock.sql; idempotency migration 20260712020000; uniqueness and metadata-key mismatch confirmed by targeted greps. No live or vendor calls made.

Blockers/follow-ups: (1) confirm no out-of-repo checkout creator sets metadata[amount_cents]/[bonus_cents] (would scope F1). (2) check the Stripe Customer Portal config (could neutralise F2). (3) live DB constraint state not verified (repo has documented live<->repo drift). Full artifact attached to node risks-c2-doublecharge.

## Artifact

**Findings**

RANKED MONEY FINDINGS (answer: no working double-CREDIT vector; webhook cannot double-CHARGE by itself; one real double-CHARGE surface is billing-portal's 60s checkout window; plus a HIGH inverse bug where real credit purchases credit ZERO).

F1 [FACT][HIGH, inverse risk] Real credit purchases credit ZERO and the error is swallowed. The only credit-checkout creator sets metadata[paid_amount_cents]/[credit_amount_cents] (credit-management/index.ts:611-627), but stripe-webhook reads metadata.amount_cents/bonus_cents (stripe-webhook/index.ts:368-369). Repo-wide grep: NO file sets metadata[amount_cents]/[bonus_cents]. So totalCredits=0, canonical add_credits raises 'organization and a non-zero integer credit amount are required' on 0 (20260713060000_credit_ledger_schema_contract.sql:913-914), the webhook swallows the error and returns 200 (stripe-webhook/index.ts:391-396, :594): customer is charged, receives no credits.

F2 [FACT+THEORY][MEDIUM-HIGH, customer money] Double-subscription / double recurring charge. FACT: subscription Checkout Session idempotency key is `checkout_${organizationId}_${Math.floor(Date.now()/60_000)}` (billing-portal/index.ts:197) = only a 60s reuse window. THEORY: two subscription-checkout requests >60s apart create two Stripe Checkout Sessions for the same org plan; if the customer completes both, Stripe holds two active subscriptions and bills recurring twice. billing-portal/index.ts:148-199 has no org-level 'already active' guard.

F3 [FACT][LOW] stripe-webhook credit paths are NOT in the stripe_events claim, yet are idempotent on retried/duplicate deliveries: they pass p_idempotency_key `stripe_${event.id}` and p_stripe_payment_id (stripe-webhook/index.ts:382-389, :417-424); add_credits has UNIQUE partial indexes on credit_transactions.idempotency_key (credit_ledger:178-180) and stripe_payment_id (:181-183) and checks both (credit_ledger:938-968), so a duplicate event.id or a second event with the same payment_intent returns the existing row -> no double-credit.

F4 [FACT][LOW] Subscription/invoice/subscription-checkout paths ARE event-id deduped: withEventClaim INSERTs event.id into public.stripe_events (PRIMARY KEY), 23505 = duplicate -> 200 (stripe-webhook/index.ts:258-289); table at billing_lock.sql:155-159; claim row DELETEd on business failure so Stripe can retry (:276-288).

F5 [FACT][LOW] credit-management create_checkout_session sends NO Stripe Idempotency-Key header (credit-management/index.ts:604-629); repeated clicks create multiple one-off sessions, each needing separate payment, so no per-payment double-charge (and F1 means they credit nothing anyway).

F6 [FACT][LOW] Per-call usage double-charge is guarded: finalize_call_cost is idempotent on `finalize|release:retell:<id>`/`:call_log_id` via the same unique idempotency index, returns the existing settlement on repeat, and refuses to settle an already-released reservation (credit_ledger:614-622, :640-646, :671-699).

F7 [FACT][LOW] Signature check enforces 300s max age / 60s future skew with constant-time compare (stripe-signature.ts:1-2, :19-29, :59-62); a replay inside 5 min is neutralised by event-id dedupe / add_credits idempotency.

NET: a retried webhook, duplicate event, or client retry cannot double-credit (F3/F4/F6) and cannot double-charge from the webhook (webhooks never create charges). The live double-charge surfaces are duplicate checkout-session creation (F2 real gap; F5 benign). The more urgent live money bug is F1 (charged, zero credits).

**evidence**

- supabase/functions/credit-management/index.ts:611-627 sets metadata[paid_amount_cents]/[credit_amount_cents]/[credit_policy_version] (credits: checkout session creator)
- supabase/functions/stripe-webhook/index.ts:368-369 reads session.metadata?.amount_cents/bonus_cents
- supabase/functions/stripe-webhook/index.ts:391-396 swallows add_credits error and does not throw; :594 returns 200
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:913-914 add_credits raises on amount_cents=0
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:178-180 UNIQUE partial index on idempotency_key
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:181-183 UNIQUE partial index on stripe_payment_id
- supabase/migrations/20260713060000_credit_ledger_schema_contract.sql:938-968 add_credits checks by_idempotency + by_payment, payload-match, returns existing
- supabase/functions/billing-portal/index.ts:197 idempotencyKey = checkout_${organizationId}_${Math.floor(Date.now()/60_000)}
- supabase/functions/billing-portal/index.ts:148-199 no active-subscription guard; portal vs checkout branch on stripe_customer_id only
- supabase/functions/stripe-webhook/index.ts:258-289 withEventClaim uses stripe_events PK, 23505=duplicate, delete-on-failure
- supabase/migrations/20261029200000_billing_lock.sql:155-159 CREATE TABLE stripe_events (id text PRIMARY KEY)
- supabase/functions/credit-management/index.ts:604-629 create_checkout_session fetch has no Idempotency-Key header
- supabase/functions/_shared/stripe-signature.ts:1-2,:59-62 300s age / 60s skew; :19-29 constant-time compare
- repo-wide grep for `metadata[amount_cents]` returns 0 setters; grep for `bonus_cents` returns only readers/tests

**validation**

Source reads only, no live/vendor calls. Read in full: stripe-webhook/index.ts, billing-portal/index.ts, credit-management/index.ts, _shared/credit-purchase-policy.ts, _shared/stripe-signature.ts; read the canonical add_credits/reserve_credits/finalize_call_cost bodies in 20260713060000_credit_ledger_schema_contract.sql; read add_credits history in 20260124_white_label_credits*.sql and 20260701133759; read stripe_events + guard in 20261029200000_billing_lock.sql and the idempotency migration 20260712020000. Confirmed uniqueness constraints and the metadata-key mismatch by targeted greps.

**open_questions**

- Does any out-of-repo caller (Zapier/Make/n8n, a Stripe Payment Link, or a manually created Checkout Session) set metadata[amount_cents]/[bonus_cents]? Repo says no; if one exists the F1 zero-credit conclusion would not apply to those sessions.
- Have legacy credit_transactions rows been written with stripe_payment_id but a NULL idempotency_key? The idempotency index is partial (WHERE NOT NULL), so such rows rely only on the stripe_payment_id index for dedupe.

**edge_cases_considered**

- Duplicate delivery of the same event.id -> add_credits idempotency key reuse / stripe_events PK -> safe
- Two distinct event ids for the same payment_intent (e.g. checkout.session.completed + payment_intent.succeeded) -> stripe_payment_id uniqueness -> safe unless transaction_type differs, in which case 23505 is raised (still no double-credit)
- Concurrent duplicate add_credits for one org -> org_credits FOR UPDATE serialises, unique index is the backstop -> safe
- payment_intent.succeeded auto_recharge path is effectively dead (launch-disabled) -> not a live vector
- Released-then-refinalized call -> finalize_call_cost refuses to re-settle a released reservation -> safe

**what_i_did_not_check**

- The live DB's actual constraint/index state (I read the migration contract; this repo has documented live<->repo drift).
- Full byte-equality of supabase/functions-live/stripe-webhook vs supabase/functions/stripe-webhook (both read metadata.bonus_cents at :369 per grep, full equality not diffed).
- Stripe dashboard webhook endpoint config (subscribed events, endpoint count) and the account API version (determines invoice.parent shape).
- The frontend CreditDashboard checkout button flow (whether a user can submit twice or across the 60s window in practice).
- The Stripe Customer Portal configuration: whether the portal itself blocks a second subscription while one is active (would neutralise F2).
- RLS policies on credit_transactions / organization_credits (outside this lane's idempotency scope).

**confidence**: high