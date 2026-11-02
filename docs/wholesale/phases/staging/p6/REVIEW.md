# P6 Billing lock: final review (staged, not applied)

Staged under `docs/wholesale/phases/staging/p6/<repo-relative path>`. Nothing deployed, no migration applied, no DB touched, no `npm install`. `deno` is not on PATH, so `deno check` was skipped; the two edge functions were syntax-checked with the repo's TypeScript 5.6.3 (`transpileModule`, 0 diagnostics) and the three frontend files were type-checked with `tsc --strict` against the real project (`src/contexts/*`, `ui/button`, generated Supabase types): 0 errors.

## 1. Files written

| Staged path (copy to the same repo-relative path) | Lines | Note |
|---|---|---|
| `supabase/migrations/20261029160000_billing_lock.sql` | 215 | Renumbered from the brief's `20261029050000`; see change M1. Grace window is a guarded column, see M0 |
| `supabase/functions/stripe-webhook/index.ts` | 599 | Built on `supabase/functions-live/stripe-webhook/index.ts` (the byte-exact 205-line deployed source: the bundler's untyped JS output, header line and trailing copyright truncated, same four handlers as the earlier 240-line transcription). Deploying it REPLACES main's gated copy at this path; see change W1 |
| `supabase/functions/billing-portal/index.ts` | 202 | New function |
| `src/hooks/useOrgStanding.ts` | 144 | New |
| `src/components/BillingPaused.tsx` | 94 | New |
| `src/components/ProtectedRoute.tsx` | 62 | Replaces the 29-line live file; auth gate unchanged |
| `REVIEW.md` | this file | |

Not staged on purpose: `src/integrations/supabase/types.ts`. The v2 draft replaced the 8,391-line generated file with a 50-line stub containing `[key: string]: unknown`, which would have broken every typed query in the app. The hook calls the two new RPCs through an untyped signature instead; regenerate the file after the migration (`supabase gen types typescript --project-id emonjusymdripmkvtttc > src/integrations/supabase/types.ts`) and the cast can go.

## 2. Changes versus p6-billing-v2.md

Review-round blockers referenced as rt2-#n (rt2-#2 about nullable `organization_id` is moot since phase 1 made the four columns NOT NULL).

### Migration `20261029160000_billing_lock.sql`
- **M0 Grace window moved out of `organizations.settings` into a new guarded column `billing_grace_until timestamptz`** (lead's security finding on the first staged version). Org admins can UPDATE `organizations` (live policies `"Org admins can update their organization"` and `org_admin_update`) and `settings` is not in the guard trigger's list, so a locked tenant could have set `settings.grace_until` years ahead and unlocked itself. Now: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS billing_grace_until timestamptz` with a COMMENT; `org_in_good_standing` reads `billing_grace_until IS NOT NULL AND billing_grace_until > now()`; `guard_organization_billing_columns()` is re-created from the live SECURITY INVOKER version (`live_only/20260828034301_fix_billing_guard_definer_context.sql`) with exactly one added line, `OR NEW.billing_grace_until IS DISTINCT FROM OLD.billing_grace_until`, its live REVOKEs re-applied, and the trigger re-asserted. The `settings.grace_until` key, its `COMMENT ON COLUMN organizations.settings`, and every webhook read/write of `settings` are gone. v2's and the brief's `settings->>'grace_until'` design is therefore not implemented; this is the recorded deviation.
- **M1 Version renumbered** `050000 -> 160000`. `050000` sorts before the applied phase-1 files (`142121`, `150000`); `supabase db push` refuses out-of-order migrations without `--include-all`. Contents are what the brief asked for.
- **M2 Operator bypass in the policy** (rt2-#1). `USING (public.org_in_good_standing(organization_id) OR public.is_platform_operator())`. `is_platform_operator()` (live, `20260828013123`) returns true for service_role, for sessions without JWT claims (postgres) and for `user_roles.role='admin'`.
- **M3 Policy is `AS RESTRICTIVE FOR ALL` with `USING` and `WITH CHECK`** (v2 was `FOR SELECT`). A paused company's browser sessions can neither read nor write its rows; a restrictive SELECT-only policy does not reliably block INSERT/UPDATE/DELETE. `WITH CHECK` is evaluated on the final row, after the `set_organization_from_user` BEFORE INSERT trigger fills `organization_id`. No existing policy is dropped or rewritten; the per-user `"Users can manage their own ..."` and phase-1 `"Company members can ..."` policies all stay (this is the recorded deviation from the brief's "drop and re-create", rt2 gap #1: re-creating only the per-user policies would have left the company policies un-locked).
- **M4 `stripe_events` grants made explicit** (rt2-#11): `REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT SELECT, INSERT, DELETE TO service_role`. RLS stays on with no policies.
- **M5 New partial index** `idx_organizations_stripe_customer_id` for the webhook's customer -> org lookup.
- **M6 No `COMMENT ON COLUMN organizations.settings`** any more (v2 overwrote it with grace-only text); the grace rule is documented on `billing_grace_until` instead. `settings` is untouched by P6.
- **M7 Header comments** cite the live policy inventory and explain why restrictive-beside-permissive is the right tool. `org_in_good_standing` / `org_access_allowed` bodies are unchanged from v2 (they already matched the brief and the house rules; `user_in_organization(uuid)` has one argument).

### `supabase/functions/stripe-webhook/index.ts`
- **W1 Base file changed to the LIVE deployment** (re-checked against the byte-exact 205-line source the lead supplied after the first pass; it is the bundler's output of the same code, so no handler changed). v2 extended main's copy (imports `credit-purchase-policy.ts`, throws on `add_credits` failure, derives credits from `amount_total`). The live function has none of that. Per the task, every live behaviour is kept with identical semantics: `checkout.session.completed` (payment mode) credits from `metadata.amount_cents`/`bonus_cents` and logs-but-does-not-throw on `add_credits` error; `payment_intent.succeeded` auto-recharge path; `customer.subscription.deleted` disables auto-recharge. Consequence to record: main's hardened checkout verification (`resolvePaidCheckoutSession`) is NOT in this file. Follow-up item, not P6 scope.
- **W2 Signature helper** switched from the live inline HMAC (plain `===` compare, no replay window) to `_shared/stripe-signature.ts` `verifyStripeSignature(body, header, secret)` (constant-time, 300 s max age, 60 s future skew). Export name and signature verified in the file.
- **W3 Idempotency is claim-FIRST** (rt2-#4, #5). `withEventClaim()` inserts `event.id` into `stripe_events` inside a try; `23505` -> `"duplicate"` -> HTTP 200 `{received:true, duplicate:true}`; any other claim error -> 500. If the business update throws, the claim row is DELETEd, then rethrown -> 500 so Stripe retries. v2's `isEventClaimed` + claim-after-write (which let two concurrent deliveries both write) is gone.
- **W4 `invoice.paid` restores `active` only when the invoice has a subscription AND the org is `past_due`/`unpaid`** (rt2-#3, house rule). Subscription id is read from both `invoice.subscription` (pre-basil API) and `invoice.parent.subscription_details.subscription` (2025-03-31.basil+). `billing_grace_until` is set to NULL whenever present, even if status is already active. Non-subscription invoices are ignored with a log.
- **W5 `invoice.payment_failed` hardened.** Only subscription invoices; only when current status is `active`/`trialing`/`past_due` (a `canceled`/`unpaid` org is never loosened back to past_due, which would re-open a grace window); `billing_grace_until` is written ONCE per dunning cycle (kept if already set). All grace reads/writes go to the guarded column, never to `settings` (M0). v2 re-stamped `now()+3d` on every failure, and Stripe emits `payment_failed` on every retry for weeks, so grace would have extended indefinitely.
- **W6 `customer.subscription.*`**: `deleted` always writes `canceled`; `incomplete_expired -> canceled`; `paused -> unpaid` (trial ended with no payment method; not paying); unknown statuses are logged and skipped (claim kept). `billing_enabled = true` on `active` OR `trialing` (v2: active only). Reason: a trialing org with billing still off would never lock when the trial's first invoice fails; the brief's "first active subscription" is read as "first paying-or-trialing subscription", recorded here as a decision. When the subscription is healthy again (`active`/`trialing`) `billing_grace_until` is set to NULL. `stripe_customer_id` written only when it differs. The auto-recharge disable on `deleted` now throws on error (inside the claim, so the retry re-applies).
- **W7 `plan_id` resolution** uses all `items.data[].price.id` values (also `item.plan.id` fallback) and picks the first item whose price matches `plans.stripe_price_id`; add-on prices that are not plans are skipped. v2 took `items.data[0]` blindly.
- **W8 `checkout.session.completed` with `mode === "subscription"`** is a new branch: stores `stripe_customer_id` on the org and returns. Without it the live credit path would have run for billing-portal's subscription checkout and called `add_credits` with 0 cents.
- **W9 Org resolution**: metadata (`subscription.metadata.organization_id`; for invoices `subscription_details.metadata` / `parent.subscription_details.metadata` / `invoice.metadata`, matching what the live function read) then lookup by `stripe_customer_id`. `client_reference_id` is only consulted on checkout sessions (it does not exist on subscriptions). Expanded `{id}` objects are accepted everywhere a string id is expected.
- **W10 Malformed body** -> 400 (not 500, so Stripe does not retry forever); DB client is created only after the signature verifies (as in v2).
- **W11 `updated_at`** is set on every organizations write.

### `supabase/functions/billing-portal/index.ts`
- **P1 Imports verified** against `_shared/utils.ts` (`corsHeaders, authenticateUser -> {user,userId}, errorResponse(err, status?), successResponse, parseJSON, ValidationError, NotFoundError, requireEnvVars`) and `_shared/tenant-context.ts` (`requireExplicitOrganizationId(unknown): string`, throws plain `Error`). rt2-#7 closed: the plain Error is converted to `ValidationError` -> HTTP 400 instead of a 500.
- **P2 405 path** uses a plain `Error` so `errorResponse(err, 405)` really returns 405 (`ValidationError` would force 400).
- **P3 Anon client no longer forwards the Authorization header** (unnecessary: `authenticateUser` passes the bearer token to `auth.getUser(token)` itself).
- **P4 Return URLs** built with `appUrl(APP_URL, "dashboard")`, which keeps any path in `APP_URL` (rt2 risk #4). `/dashboard` is a real protected route in `App.tsx`.
- **P5 `customer_email`** prefers `organizations.billing_email`, falls back to the caller's email (rt2 risk #5).
- **P6 Stripe `Idempotency-Key`** on checkout creation (`checkout_<org>_<minute>`) so a double-click reuses one session. Stripe errors are surfaced as `Stripe error: <message>` (no secrets), and a response without `url` is an error.
- **P7 Membership check** returns 404 for non-members without revealing existence (same as v2); org/plan lookups via service role.
- Header documents the Customer Portal configuration requirement (Dashboard -> Settings -> Billing -> Customer portal -> Save), which v2 omitted and which makes `/billing_portal/sessions` fail until done.

### `src/hooks/useOrgStanding.ts`
- **H1 Fails OPEN** (house rule; v2 failed closed, rt2-#9): RPC error -> `{ok:true, status:'unknown'}`, not cached, warned to console. RLS remains the enforcement.
- **H2 No org -> skipped** (`{ok:true, status:'skipped'}`), per house rule; rt2-#10's "select a workspace" screen is out of scope ("no other UI changes").
- **H3 Platform-operator bypass implemented** via `supabase.rpc('is_platform_operator')` (live function, granted to `authenticated`, the exact predicate the SQL bypass uses) rather than left UNKNOWN. `OrganizationContext` exposes only the org role, so the hook asks the DB directly; the codebase already reads `user_roles` client-side in `SystemTestingHub.tsx:63`. Operator -> `{ok:true, status:'operator'}`; an error on this call just means "not an operator".
- **H4 Cache keyed by `${userId}:${organizationId}`** (v2: org only, which would have leaked one user's cached result to the next user in the same tab for 60 s). TTL 60 s, lazily evicted. Exports `invalidateOrgStanding()`.
- **H5 `refresh()`** exposed (drops cache, refetches) so the paused screen can re-check after payment.
- **H6 Untyped RPC call** instead of editing the generated types file (see section 1).

### `src/components/BillingPaused.tsx`
- Reads the `successResponse` envelope correctly (`data.data.url`), surfaces the function's `error` string when present, falls back to same-tab navigation when the popup is blocked.
- Takes `onRecheck`: re-checks standing on window focus (user returns from the Stripe tab) and via an "I've updated my payment, check again" link. Sign-out link kept. Copy names the organization when known.

### `src/components/ProtectedRoute.tsx`
- Auth gate unchanged. Waits for `orgLoading`; no org -> children; operator or RPC error -> children (via the hook); standing loading -> existing loader (one RPC round-trip on first visit per org, then cached); `!ok` -> `<BillingPaused onRecheck={standing.refresh} />`. The hook receives `null` until `user` is present so no RPC fires for signed-out visitors.

## 3. Remaining VERIFY items

1. **Stripe API version shape of `invoice`.** Both `invoice.subscription` and `invoice.parent.subscription_details.subscription` are handled; confirm in the first real `invoice.paid` log that `subscriptionId` resolved (look for "has no subscription; ignoring" when it should not).
2. **Trigger-fixture names in `stripe trigger --add` commands** below (`subscription:`, `invoice:`); if the CLI rejects them run the Dashboard flow in test 6 instead.
3. **Is the single live user a `user_roles` admin?** If yes, the SQL lock test shows rows through the operator bypass by design (test 3 has both branches). Check first: `select role from public.user_roles where user_id = '<MEMBER_UUID>';`
4. **`stripe-webhook` deploy flag.** `supabase/config.toml` already has `[functions.stripe-webhook] verify_jwt = false`; confirm the Dashboard shows "Verify JWT: off" after deploy, or the Stripe calls get 401 before reaching the code.
5. **Edge functions were not `deno check`ed.** Run `deno check supabase/functions/stripe-webhook/index.ts supabase/functions/billing-portal/index.ts` on a machine with Deno, or rely on the deploy bundler's error output.
6. **Dialer keeps dialing for a paused org.** `call-dispatcher` / `outbound-calling` run as service_role and bypass RLS, so a paused company's active campaigns would still place (and cost) calls. Not in the P6 brief; recommended follow-up: dispatcher skips campaigns whose org fails `org_in_good_standing`.
7. **`organizations.subscription_tier`** (NOT NULL default 'basic') is not updated by the webhook; nothing reads it for access. Decide whether to mirror `plan_id` into it later.
8. **`stripe_events` retention** grows unbounded (one row per event); add a periodic `DELETE ... WHERE received_at < now() - interval '90 days'` when volume matters.
9. **Dropped from main's copy** (W1): `resolvePaidCheckoutSession` amount verification. Decide whether to port it into this file in a later phase.

## 4. Secrets to set (names only)

Edge function secrets (`supabase secrets set ...` or Dashboard -> Edge Functions -> Secrets):
- `STRIPE_SECRET_KEY` (billing-portal; `sk_test_...` first, `sk_live_...` at go-live)
- `STRIPE_WEBHOOK_SECRET` (stripe-webhook; the endpoint's signing secret `whsec_...` from the Dashboard endpoint created in step 5.4)
- `APP_URL` (billing-portal; public app origin, no trailing slash needed, e.g. the production Lovable/Vercel URL)

Provided automatically by Supabase (do not set): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## 5. Stripe Dashboard setup (Charles)

Do all of this in **test mode** first, repeat in live mode at go-live.

1. **Products and prices.** Products -> Add product, one per plan row in `public.plans` (`starter` $29/mo, `pro` $599/mo, `ultimate` $599/mo per the live seed; adjust to current pricing). Recurring, monthly. Copy each `price_...` id.
2. **Link prices to plans** (T4, log in ACTIVE.md; service_role/SQL editor only, the guard trigger blocks tenants):
   ```sql
   update public.plans set stripe_price_id = 'price_XXX', updated_at = now() where id = 'starter';
   update public.plans set stripe_price_id = 'price_YYY', updated_at = now() where id = 'pro';
   update public.plans set stripe_price_id = 'price_ZZZ', updated_at = now() where id = 'ultimate';
   ```
3. **Customer portal.** Settings -> Billing -> Customer portal: enable "Update payment method", "Cancel subscription" (and "Switch plans" if wanted, listing the three prices), set the default return URL to `APP_URL/dashboard`, **Save**. Without a saved configuration `/billing_portal/sessions` errors.
4. **Webhook endpoint.** Developers -> Webhooks -> Add endpoint: URL `https://emonjusymdripmkvtttc.supabase.co/functions/v1/stripe-webhook`. Events to send: `checkout.session.completed`, `payment_intent.succeeded`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Reveal the signing secret and set it as `STRIPE_WEBHOOK_SECRET`.
5. **API keys.** Developers -> API keys -> secret key -> `STRIPE_SECRET_KEY`.
6. Optional: Settings -> Billing -> Subscriptions and emails -> Smart Retries on, "Cancel subscription" after the retry window (that produces the `unpaid`/`canceled` transition that hard-locks after grace).

## 6. Deploy order

Each step is T4: append `Result: pending` to `jarvis-ops/session-ledger/ACTIVE.md` before, `success|failed` after.

1. Stripe Dashboard steps 5.1 to 5.4; `UPDATE plans` (5.2).
2. Copy `supabase/migrations/20261029160000_billing_lock.sql` into the repo and apply: `supabase db push` (or MCP `apply_migration` with the same name). Verify with test 2. At this point nothing is locked: the live org has `billing_enabled = false`.
3. Set secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_URL`.
4. Copy `supabase/functions/stripe-webhook/index.ts` over the repo file (keep the old file in git) and deploy: `supabase functions deploy stripe-webhook --no-verify-jwt`. Watch logs for the first Stripe ping (the Dashboard "Send test webhook" button is fine: expect 200 and "Unhandled event type" or a no-op log).
5. Copy and deploy `billing-portal`: `supabase functions deploy billing-portal` (JWT verification on). Run test 7.
6. Copy the three `src/` files into the repo, `npm run build`, deploy the frontend. Optionally regenerate `types.ts`.
7. Run tests 3 (rolled back), 5, 6, 8.

Rollback: `DROP POLICY "Billing lock" ON public.leads; ... campaigns; ... call_logs; ... phone_numbers;` (functions, the `billing_grace_until` column, the extended guard and `stripe_events` can stay, they are inert), redeploy `supabase/functions-live/stripe-webhook/index.ts`, revert the three frontend files. The frontend alone can also be neutralised by setting the org's `billing_enabled = false` via service role.

## 7. Test plan (adapted to the final code)

**1. Migration applies.** `supabase db push` -> `Applying migration 20261029160000_billing_lock.sql...` with no error.

**2. Policies and grants exist.**
```sql
select tablename, policyname, permissive, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('leads','campaigns','call_logs','phone_numbers')
order by tablename, policyname;
```
Expected: for each table, the pre-existing permissive policies are all still listed, plus one `Billing lock | RESTRICTIVE | ALL`.
```sql
select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='stripe_events' order by 1,2;
```
Expected: `service_role` with DELETE, INSERT, SELECT; no `anon`/`authenticated` rows.
```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='organizations' and column_name='billing_grace_until';
select pg_get_functiondef('public.guard_organization_billing_columns()'::regprocedure) like '%billing_grace_until%' as guard_covers_grace;
```
Expected: one row `billing_grace_until | timestamp with time zone`; `guard_covers_grace = true`.

**2b. Tenant cannot write the grace window (rolled back).** `<ADMIN_UUID>` = an `organization_users` row with role owner/admin for the live org who is NOT a `user_roles` admin (if the only user is a platform admin, the guard lets them through by design; note it and skip).
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"<ADMIN_UUID>","role":"authenticated"}';
update public.organizations set billing_grace_until = now() + interval '10 years'
 where id = '11824e05-24e3-4dc3-b684-5d0bc7c436d6';
rollback;
```
Expected: `ERROR: Billing and plan fields on organizations are managed by the platform` (SQLSTATE 42501). A `settings` write by the same user still succeeds (unchanged behaviour), which is exactly why grace no longer lives there.

**3. Rolled-back lock test.** Replace `<MEMBER_UUID>` with a real `organization_users.user_id` of the live org `11824e05-24e3-4dc3-b684-5d0bc7c436d6`. First check whether that user is a platform admin: `select role from public.user_roles where user_id = '<MEMBER_UUID>';`
```sql
begin;
select public.org_in_good_standing('11824e05-24e3-4dc3-b684-5d0bc7c436d6') as baseline_ok;   -- true

update public.organizations
   set billing_enabled = true,
       subscription_status = 'past_due',
       billing_grace_until = '1970-01-01 00:00:00+00'
 where id = '11824e05-24e3-4dc3-b684-5d0bc7c436d6';

select public.org_in_good_standing('11824e05-24e3-4dc3-b684-5d0bc7c436d6') as paused_ok;     -- false

set local role authenticated;
set local request.jwt.claims = '{"sub":"<MEMBER_UUID>","role":"authenticated"}';
select public.is_platform_operator() as is_operator;
select count(*) as leads from public.leads;
select count(*) as call_logs from public.call_logs;
select count(*) as campaigns from public.campaigns;
select count(*) as phone_numbers from public.phone_numbers;
-- write attempt while paused:
insert into public.leads (user_id, organization_id, phone_number)
values ('<MEMBER_UUID>', '11824e05-24e3-4dc3-b684-5d0bc7c436d6', '+15555550100');
reset role;

-- grace window in the future -> good standing again
update public.organizations
   set billing_grace_until = now() + interval '1 day'
 where id = '11824e05-24e3-4dc3-b684-5d0bc7c436d6';
select public.org_in_good_standing('11824e05-24e3-4dc3-b684-5d0bc7c436d6') as grace_ok;      -- true

-- back to active, grace removed
update public.organizations
   set subscription_status = 'active', billing_grace_until = null
 where id = '11824e05-24e3-4dc3-b684-5d0bc7c436d6';
select public.org_in_good_standing('11824e05-24e3-4dc3-b684-5d0bc7c436d6') as restored_ok;   -- true

set local role authenticated;
set local request.jwt.claims = '{"sub":"<MEMBER_UUID>","role":"authenticated"}';
select count(*) as leads_after from public.leads;                                             -- > 0
reset role;
rollback;
```
Expected when `is_operator = false`: the four counts are 0 and the INSERT fails with `new row violates row-level security policy`. Expected when `is_operator = true` (the member is a `user_roles` admin): counts > 0 and the INSERT succeeds, which is the operator bypass working; to see the lock itself, repeat with a non-admin member's uuid or temporarily `delete from public.user_roles where user_id='<MEMBER_UUID>' and role='admin'` inside the same transaction (it is rolled back). `paused_ok = false`, `grace_ok = true`, `restored_ok = true` in both branches. `ROLLBACK` leaves no change: re-run `select billing_enabled, subscription_status, billing_grace_until from organizations where id='11824e05-...'` and compare to before.

**4. `stripe_events` is invisible to tenants.**
```sql
set local role authenticated;
set local request.jwt.claims = '{"sub":"<MEMBER_UUID>","role":"authenticated"}';
select count(*) from public.stripe_events;   -- expected: 0 rows visible (or permission denied)
reset role;
```

**5. Subscription state via Stripe CLI** (test mode; `stripe trigger` creates real test objects, so the Dashboard endpoint receives the events with its own signing secret, no `stripe listen` needed).
```
stripe trigger customer.subscription.updated \
  --add subscription:metadata.organization_id=11824e05-24e3-4dc3-b684-5d0bc7c436d6
```
VERIFY the `subscription:` fixture name (see section 3.2). Expected function logs: `Received event: customer.subscription.updated`, then `Org 11824e05-... -> status=active plan=unchanged billing_enabled=true` (plan stays unchanged because the trigger's price is not in `plans`). DB: `select subscription_status, billing_enabled, stripe_customer_id from organizations where id='11824e05-...'` -> `active | true | cus_...`. Also expect a `customer.subscription.created` event from the same trigger with the same outcome, and a row per event in `stripe_events`. **Note this turns billing on for the live org**; restore afterwards with service role: `update organizations set billing_enabled=false, stripe_customer_id=null where id='11824e05-...'` (T4, log it), or run the test against a scratch org instead.
Idempotency: `stripe events resend <evt_id>` (id from the logs) -> HTTP 200, log `Event <evt_id> already processed`, no second write (`updated_at` unchanged).
Deleted: `stripe trigger customer.subscription.deleted --add subscription:metadata.organization_id=<org>` -> `status=canceled`, `organization_credits.auto_recharge_enabled = false`.

**6. `invoice.payment_failed` then `invoice.paid` round-trip.** Most faithful path (no fixture guessing): in test mode, call billing-portal (test 7) for a scratch org whose plan has a `stripe_price_id`, complete Checkout with card `4242 4242 4242 4242` -> expect `checkout.session.completed` (log `stripe_customer_id=cus_...`), `customer.subscription.created` (`status=active billing_enabled=true`), `invoice.paid` (log `nothing to restore`). Then in the Dashboard open the customer, add card `4000 0000 0000 0341` as default, and either advance a test clock past the period end or create and finalize a subscription invoice and pay it with that card -> `invoice.payment_failed`: expect `subscription_status = 'past_due'` and `billing_grace_until` about 3 days ahead; a second failure logs `billing_grace_until=... (kept)` and does not move the timestamp. Pay the invoice with a good card -> `invoice.paid`: expect `active` and `billing_grace_until IS NULL`. Quick smoke alternative: `stripe trigger invoice.payment_failed --add invoice:metadata.organization_id=<org>`; the trigger's invoice has a subscription so the handler runs (VERIFY the `invoice:` fixture name).

**7. `billing-portal`.**
```
curl -sS -X POST "https://emonjusymdripmkvtttc.supabase.co/functions/v1/billing-portal" \
  -H "Authorization: Bearer $MEMBER_JWT" -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"organization_id":"11824e05-24e3-4dc3-b684-5d0bc7c436d6"}'
```
Expected: `{"success":true,"data":{"url":"https://checkout.stripe.com/...","mode":"checkout"},...}` while the org has no `stripe_customer_id` and its plan has a price (`starter` after 5.2); `mode:"portal"` with a `billing.stripe.com` URL once `stripe_customer_id` is set. Negative cases: a JWT of a user not in `organization_users` for that org -> 404 `Organization not found`; `{"organization_id":"nope"}` -> 400; no Authorization -> 401; GET -> 405; plan without price -> 400 `Plan "starter" has no Stripe price configured`.

**8. Frontend.** With the deployed app: (a) as a member of an org in good standing, `/dashboard` renders normally (one `org_in_good_standing` + one `is_platform_operator` request in the network tab, then none for 60 s). (b) Via service role set the org `billing_enabled=true, subscription_status='past_due', billing_grace_until='1970-01-01'` (T4, log, revert after) -> reload -> "Your workspace is paused"; "Resume" opens the Stripe page in a new tab; after fixing payment, switching back to the app tab re-checks (focus) and the dashboard appears once the webhook has written `active`. (c) Sign in as a `user_roles` admin -> never sees the paused screen. (d) Block the RPC (DevTools -> network request blocking on `/rest/v1/rpc/org_in_good_standing`) -> the app still renders and the console shows `[useOrgStanding] ... allowing access` (fail open). (e) Revert the org row.

## 9. Live verification, 2026-11-02 (jcode) - what actually passed

All phase migrations were already applied on live when this ran (`select version, name from
supabase_migrations.schema_migrations` returned `20261102214238 browser_phone`, `20261029200000
billing_lock`, `20261029190000 sms_per_organization`, `20261029180000 live_coach`, `20261029142710
industry_packs`).

Tests were run read-only / rolled back via `scripts/ship/sbquery.py` (Management API). Nothing persisted.

| Test | Result | Evidence |
|---|---|---|
| 2. Policies, grants, column, guard | PASS | 4 RESTRICTIVE `Billing lock` policies (ALL) on leads, campaigns, call_logs, phone_numbers; `stripe_events` granted to service_role only (DELETE/INSERT/SELECT, no anon/authenticated); `organizations.billing_grace_until` = `timestamp with time zone`; `guard_covers_grace = true` |
| 2b. Tenant cannot write the grace window | PASS | `42501 Billing and plan fields on organizations are managed by the platform` (guard_organization_billing_columns, line 25) |
| 3. Rolled-back lock test | PASS after the constraint fix in 9.1 | `baseline_ok=true, paused_ok=false, is_operator=false, leads=call_logs=campaigns=phone_numbers=0, grace_ok=true, restored_ok=true, leads_after=3303`; paused INSERT -> `42501 new row violates row-level security policy "Billing lock" for table "leads"` |
| 4. `stripe_events` invisible to tenants | PASS | `42501 permission denied for table stripe_events` |

Note for tests 3 / 2b: the live org `11824e05-...` has exactly one member,
`5969774f-5340-4e4f-8517-bcc89fa6b1eb`, and that user IS a `user_roles` admin, so the operator bypass
would hide the lock. Both were therefore run with `delete from public.user_roles ... role='admin'` inside
the same rolled-back transaction, exactly as section 3 prescribes.

### 9.1 BUG FOUND: the live `subscription_status` CHECK rejects every value the billing code writes

```
select pg_get_constraintdef(oid) from pg_constraint where conname='organizations_subscription_status_check';
-> CHECK ((subscription_status = ANY (ARRAY['active','trial','suspended','cancelled'])))
```

The billing code writes `past_due` (invoice.payment_failed), `canceled` (customer.subscription.deleted)
and `trialing`; `org_in_good_standing()` reads `past_due`. Before the fix every dunning write raised
`23514 ... violates check constraint "organizations_subscription_status_check"`, so the org was never
marked past_due, the grace window never engaged and the workspace never paused (fail-open).

Fix: `supabase/migrations/20261102230000_subscription_status_vocabulary.sql` - widens the allowed set to
the Stripe vocabulary plus the legacy values; tenant writes stay blocked by the guard (2b still passes).
Verified in a rolled-back transaction: with it in place, test 3 passes end to end.

**To apply (T4, Charles/Claude approval):** `python scripts/ship/run_migration.py supabase/migrations/20261102230000_subscription_status_vocabulary.sql --apply` (one file, recorded in
`supabase_migrations.schema_migrations`), or paste the file into the SQL editor. **Do NOT use `supabase db push`**
- see 9.4. Rollback: re-add the original constraint (see the file's header).

### 9.2 Proof from the deployed bundle (jcode, 11/02)

`stripe-webhook` is **v123, ACTIVE, `verify_jwt=false`** (Management API). Scanning `supabase/functions/**` and `src/**`, the only
writer of `organizations.subscription_status` in the shipped code is `stripe-webhook`; the frontend only reads it. Its
`mapSubscriptionStatus()` persists:

```
customer.subscription.deleted             -> "canceled"
"active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete"  -> itself
"incomplete_expired"                      -> "canceled"
"paused"                                  -> "unpaid"
invoice.payment_failed                    -> "past_due" (+ billing_grace_until = now() + 3 days)
invoice.paid                              -> "active" (restore only)
```

Against the live CHECK (`active, trial, suspended, cancelled`) five of those six values are rejected: `trialing`, `past_due`, `canceled`,
`unpaid`, `incomplete`. So `customer.subscription.updated` for a trial that has not converted, and every dunning event, raise `23514`; the
org is never marked `past_due`, `billing_grace_until` is never set, and `org_in_good_standing()` keeps returning true. The fix migration's
widened set covers every value above plus the legacy `trial` / `cancelled`.

### 9.3 Deployed-function census (jcode, 11/02)

Management API `GET /v1/projects/{ref}/functions`: 107 functions, all `ACTIVE`. The 14 shipped functions are at the versions in the
runbook's step 3, the new ones at v1, and `api-gateway` at **v40** (not v39 - v39 was the first deploy and 500'd owned-number requests;
v40 is the fix). Nine live functions have no source in the repo (`retell-credentials-check`, `twilio-outbound-call`,
`twilio-termination-proxy`, `twilio-trust-hub`, `debug-twilio-call`, `configure-sip-trunk`, `test-sip-call`, `gemini-video`,
`patch-grace-once`); none belong to this ship, but they are live and unversioned in git.

### 9.4 How to apply the fix, and why not `supabase db push` (jcode, 11/02)

Checked the live history before writing an apply instruction: `select version, name from
supabase_migrations.schema_migrations` returns **167 rows**, and the local `supabase/migrations/` directory holds **187**
`.sql` files with a numeric prefix. **178 of them have no matching version in the live history** (most are the same
migration recorded under a version a few seconds apart, because they were applied through the dashboard/MCP rather
than `db push`; 158 live rows have no local file). The last applied version is `20261102214238_browser_phone`.

Consequences:

* The target file `20261102230000_subscription_status_vocabulary.sql` is genuinely unapplied - that is the expected
  state, not a second bug.
* **177 local files sort before the last applied remote version**, and `supabase db push` refuses out-of-order
  migrations without `--include-all`. So a bare `supabase db push` errors out, and `--include-all` would try to
  apply all 178 unrecorded files - do not do that.
* Apply the single file instead:

```
python scripts/ship/run_migration.py supabase/migrations/20261102230000_subscription_status_vocabulary.sql --apply
```

That posts exactly this file to the Management API and then records it in `supabase_migrations.schema_migrations`
(version `20261102230000`, name `subscription_status_vocabulary`). Dry-run it first with `--dry`, which wraps the file
in `BEGIN ... ROLLBACK`.

Rollback: `alter table public.organizations drop constraint organizations_subscription_status_check;` then re-add the
original `check (subscription_status = any (array['active','trial','suspended','cancelled']))`.

