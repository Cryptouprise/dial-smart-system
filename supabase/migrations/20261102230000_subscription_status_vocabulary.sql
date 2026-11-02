-- Widen organizations.subscription_status to the vocabulary the billing code writes.
--
-- FOUND 2026-11-02 (jcode) while running the P6 test plan against live.
--
-- The pre-existing live constraint allowed only: active | trial | suspended | cancelled.
-- The P6 billing code writes Stripe's vocabulary instead:
--   * stripe-webhook  -> subscription_status = 'past_due'   (invoice.payment_failed)
--   * stripe-webhook  -> subscription_status = 'canceled'   (customer.subscription.deleted)
--   * stripe-webhook  -> subscription_status = 'trialing'   (mapSubscriptionStatus)
--   * org_in_good_standing() reads subscription_status = 'past_due'
--
-- Consequence before this fix: every dunning write raised
--   23514 new row for relation "organizations" violates check constraint
--   "organizations_subscription_status_check"
-- so the org was never marked past_due, the grace window never engaged and the
-- workspace never paused (fail-open). customer.subscription.deleted and a
-- trialing subscription failed the same way.
--
-- Verified 2026-11-02 in a rolled-back transaction with this constraint in place:
--   baseline_ok=true, paused_ok=false, is_operator=false,
--   leads=call_logs=campaigns=phone_numbers=0 while paused,
--   grace_ok=true, restored_ok=true, leads_after=3303,
--   and a paused-org INSERT -> 42501 'new row violates row-level security policy
--   "Billing lock" for table "leads"'.
--
-- This only widens the allowed set. Tenant writes are still blocked by
-- guard_organization_billing_columns() (verified: 42501 'Billing and plan fields
-- on organizations are managed by the platform').

alter table public.organizations
  drop constraint if exists organizations_subscription_status_check;

alter table public.organizations
  add constraint organizations_subscription_status_check
  check (subscription_status = any (array[
    'active',
    'trial',
    'trialing',
    'suspended',
    'cancelled',
    'canceled',
    'past_due',
    'unpaid',
    'incomplete',
    'incomplete_expired'
  ]));
