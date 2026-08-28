-- Plan catalog, add-ons, promo codes, and usage pricing.
--
-- DESIGN GOAL: pricing must be changeable WITHOUT a code deploy. Everything
-- below is data, not constants — change a price with one UPDATE:
--
--   UPDATE public.plans SET price_cents = 4900 WHERE id = 'starter';
--   UPDATE public.plans SET overage_per_minute_cents = 14 WHERE id = 'pro';
--
-- The seeded numbers are PLACEHOLDERS chosen to match the shape discussed
-- ($29 starter / $599 pro / $599 + add-ons ultimate). Everything else — included
-- minutes, per-minute overage, limits — was invented as a sane starting point
-- and is expected to change.
--
-- SECURITY NOTE (the reason this migration is careful):
-- this surface grants access and moves money. Three rules are load-bearing:
--   1. Tenants may READ the plan catalog but never WRITE it.
--   2. Tenants may NEVER read promo_codes — a promo code's value is its secrecy,
--      so a readable table would let any signed-in user enumerate and self-apply
--      every code. Only the SECURITY DEFINER redeem function reads it.
--   3. The new organizations columns (plan_id, unlimited_access, phone_mode) are
--      added to guard_organization_billing_columns. Without that a tenant could
--      simply UPDATE their own row and hand themselves unlimited service — the
--      exact bug class already found four times in this database.

-- ---------------------------------------------------------------------------
-- 1. Plan catalog
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plans (
  id                        text PRIMARY KEY,
  name                      text NOT NULL,
  tagline                   text,
  price_cents               integer NOT NULL CHECK (price_cents >= 0),
  billing_period            text NOT NULL DEFAULT 'month'
                              CHECK (billing_period IN ('month','year')),

  -- Usage pricing. included_minutes are bundled in the subscription; anything
  -- beyond that bills at overage_per_minute_cents through the existing credit
  -- system (organization_credits.cost_per_minute_cents is synced from here).
  included_minutes          integer NOT NULL DEFAULT 0 CHECK (included_minutes >= 0),
  overage_per_minute_cents  integer NOT NULL DEFAULT 0 CHECK (overage_per_minute_cents >= 0),
  unlimited_minutes         boolean NOT NULL DEFAULT false,

  -- Hard limits. NULL means unlimited.
  max_campaigns             integer,
  max_phone_numbers         integer,
  max_leads                 integer,
  max_concurrent_calls      integer,

  -- Capability flags, mirrored onto user_feature_flags when a plan is applied.
  features                  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- How this plan gets phone numbers:
  --   'byo'     tenant supplies their own Twilio / Telnyx credentials
  --   'managed' we provision and resell numbers (Twilio subaccount, Telnyx,
  --             Assistable or Retell) and bill through the credit system
  --   'both'    tenant chooses either
  phone_mode                text NOT NULL DEFAULT 'byo'
                              CHECK (phone_mode IN ('byo','managed','both')),

  stripe_price_id           text,
  sort_order                integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,
  is_public                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS
  'Subscription plan catalog. Change pricing with a plain UPDATE — no deploy needed. Readable by anyone (public pricing); writable only by the platform operator.';

CREATE TABLE IF NOT EXISTS public.plan_addons (
  id                        text PRIMARY KEY,
  name                      text NOT NULL,
  description               text,
  price_cents               integer NOT NULL CHECK (price_cents >= 0),
  billing_period            text NOT NULL DEFAULT 'month'
                              CHECK (billing_period IN ('month','year','once')),
  -- Which plans may buy this add-on. Empty array = all plans.
  available_for_plan_ids    text[] NOT NULL DEFAULT ARRAY[]::text[],
  grants                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  stripe_price_id           text,
  sort_order                integer NOT NULL DEFAULT 0,
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_addons IS
  'A-la-carte add-ons (the "+ add-ons" half of the Ultimate tier). Same rules as plans: public read, operator-only write.';

-- ---------------------------------------------------------------------------
-- 2. Promo codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code                text PRIMARY KEY,   -- stored lowercase; matching is case-insensitive
  description         text,
  grant_type          text NOT NULL
                        CHECK (grant_type IN ('unlimited','percent_off','amount_off','free_months','plan_upgrade')),
  grant_value         numeric,            -- percent / cents / months; NULL for 'unlimited'
  grants_plan_id      text REFERENCES public.plans(id),
  applies_to_plan_id  text REFERENCES public.plans(id),  -- NULL = valid on any plan
  max_redemptions     integer,            -- NULL = uncapped
  redemption_count    integer NOT NULL DEFAULT 0,
  starts_at           timestamptz,
  expires_at          timestamptz,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.promo_codes IS
  'Promo codes. DELIBERATELY unreadable by tenants — a readable table would let any signed-in user enumerate every code and self-apply it. Redemption goes only through redeem_promo_code().';

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL REFERENCES public.promo_codes(code) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          uuid,
  grant_snapshot   jsonb NOT NULL DEFAULT '{}'::jsonb,
  redeemed_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, organization_id)          -- one redemption per organization
);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_org ON public.promo_redemptions(organization_id);

-- ---------------------------------------------------------------------------
-- 3. Organization plan state
-- ---------------------------------------------------------------------------

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_id           text REFERENCES public.plans(id),
  ADD COLUMN IF NOT EXISTS unlimited_access  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlimited_reason  text,
  ADD COLUMN IF NOT EXISTS phone_mode        text
                             CHECK (phone_mode IS NULL OR phone_mode IN ('byo','managed'));

COMMENT ON COLUMN public.organizations.unlimited_access IS
  'Granted by an unlimited promo code. Makes check_credit_balance report billing-disabled, so calls proceed with no balance requirement and no deduction. Platform-operator writable only.';
COMMENT ON COLUMN public.organizations.phone_mode IS
  'How this tenant sources numbers: byo = their own Twilio/Telnyx credentials; managed = we provision and resell. NULL = not yet chosen.';
