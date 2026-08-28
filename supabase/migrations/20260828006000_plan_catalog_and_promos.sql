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

-- ---------------------------------------------------------------------------
-- 4. CRITICAL: extend the billing column guard to the new columns
--
-- Without this, a tenant admin could UPDATE their own organizations row and set
-- unlimited_access = true or jump their own plan_id. phone_mode is deliberately
-- NOT guarded — choosing bring-your-own vs managed is a legitimate tenant
-- setting with no billing consequence on its own.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_organization_billing_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF public.is_platform_operator() THEN
    RETURN NEW;
  END IF;

  IF NEW.billing_enabled     IS DISTINCT FROM OLD.billing_enabled
  OR NEW.subscription_tier   IS DISTINCT FROM OLD.subscription_tier
  OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
  OR NEW.stripe_customer_id  IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.trial_ends_at       IS DISTINCT FROM OLD.trial_ends_at
  OR NEW.max_users           IS DISTINCT FROM OLD.max_users
  OR NEW.max_campaigns       IS DISTINCT FROM OLD.max_campaigns
  OR NEW.max_phone_numbers   IS DISTINCT FROM OLD.max_phone_numbers
  OR NEW.monthly_call_limit  IS DISTINCT FROM OLD.monthly_call_limit
  -- added with the plan catalog:
  OR NEW.plan_id             IS DISTINCT FROM OLD.plan_id
  OR NEW.unlimited_access    IS DISTINCT FROM OLD.unlimited_access
  OR NEW.unlimited_reason    IS DISTINCT FROM OLD.unlimited_reason
  THEN
    RAISE EXCEPTION
      'Billing and plan fields on organizations are managed by the platform'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM anon;
REVOKE ALL ON FUNCTION public.guard_organization_billing_columns() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 5. Unlimited access short-circuits the credit check
--
-- Reuses the EXISTING, already-proven "billing disabled" return shape rather
-- than inventing a new one: outbound-calling gates its reservation on
-- `if (check.billing_enabled)`, so returning false makes the call proceed with
-- no balance requirement and no deduction. No edge function change needed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.check_credit_balance(
  p_organization_id uuid,
  p_minutes_needed numeric DEFAULT 1
)
RETURNS TABLE(billing_enabled boolean, has_balance boolean, available_balance_cents integer, cost_per_minute_cents integer, required_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_billing_enabled BOOLEAN;
  v_unlimited BOOLEAN;
  v_balance INTEGER;
  v_cost_per_min INTEGER;
  v_required INTEGER;
BEGIN
  SELECT o.billing_enabled, COALESCE(o.unlimited_access, false)
    INTO v_billing_enabled, v_unlimited
  FROM organizations o
  WHERE o.id = p_organization_id;

  -- Unlimited grant (promo): never block, never deduct.
  IF v_unlimited THEN
    RETURN QUERY SELECT false, true, 0, 0, 0;
    RETURN;
  END IF;

  IF NOT v_billing_enabled OR v_billing_enabled IS NULL THEN
    RETURN QUERY SELECT false, true, 0, 0, 0;
    RETURN;
  END IF;

  SELECT COALESCE(oc.balance_cents, 0), COALESCE(oc.cost_per_minute_cents, 15)
    INTO v_balance, v_cost_per_min
  FROM organization_credits oc
  WHERE oc.organization_id = p_organization_id;

  IF v_balance IS NULL THEN
    INSERT INTO organization_credits (organization_id, balance_cents, cost_per_minute_cents)
    VALUES (p_organization_id, 0, 15)
    ON CONFLICT (organization_id) DO NOTHING;
    v_balance := 0;
    v_cost_per_min := 15;
  END IF;

  v_required := CEIL(p_minutes_needed * v_cost_per_min);

  RETURN QUERY SELECT true, v_balance >= v_required, v_balance, v_cost_per_min, v_required;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Apply a plan to an organization (operator / service-role helper)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_plan_to_organization(
  p_organization_id uuid,
  p_plan_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  IF NOT public.is_platform_operator() THEN
    RAISE EXCEPTION 'Only the platform operator may change an organization plan'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_plan FROM public.plans WHERE id = p_plan_id AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown or inactive plan: %', p_plan_id;
  END IF;

  UPDATE public.organizations
  SET plan_id           = v_plan.id,
      max_campaigns     = COALESCE(v_plan.max_campaigns, max_campaigns),
      max_phone_numbers = COALESCE(v_plan.max_phone_numbers, max_phone_numbers),
      billing_enabled   = (v_plan.price_cents > 0 OR v_plan.overage_per_minute_cents > 0),
      updated_at        = now()
  WHERE id = p_organization_id;

  -- Keep the metered per-minute rate in step with the plan.
  INSERT INTO public.organization_credits (organization_id, balance_cents, cost_per_minute_cents)
  VALUES (p_organization_id, 0, GREATEST(v_plan.overage_per_minute_cents, 1))
  ON CONFLICT (organization_id) DO UPDATE
    SET cost_per_minute_cents = GREATEST(v_plan.overage_per_minute_cents, 1),
        updated_at = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_plan_to_organization(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_plan_to_organization(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.apply_plan_to_organization(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Promo redemption — the ONLY way a tenant touches promo state
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_code   text;
  v_uid    uuid;
  v_org    uuid;
  v_promo  public.promo_codes%ROWTYPE;
  v_plan   text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Must be signed in to redeem a code' USING ERRCODE = '42501';
  END IF;

  -- Case-insensitive, whitespace-tolerant: 'oscar1', 'OSCAR1', ' Oscar1 ' all work.
  v_code := lower(btrim(COALESCE(p_code, '')));
  IF v_code = '' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'empty', 'message', 'Enter a promo code.');
  END IF;

  SELECT organization_id INTO v_org
  FROM public.organization_users
  WHERE user_id = v_uid
  ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END
  LIMIT 1;

  IF v_org IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'no_organization',
                              'message', 'No workspace found for this account.');
  END IF;

  -- Lock the promo row so concurrent redemptions cannot overshoot max_redemptions.
  SELECT * INTO v_promo FROM public.promo_codes WHERE code = v_code FOR UPDATE;

  -- Deliberately identical response for unknown / inactive / expired codes, so
  -- this cannot be used as an oracle to discover which codes exist.
  IF NOT FOUND
     OR NOT v_promo.is_active
     OR (v_promo.starts_at  IS NOT NULL AND now() < v_promo.starts_at)
     OR (v_promo.expires_at IS NOT NULL AND now() > v_promo.expires_at)
  THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid',
                              'message', 'That code is not valid.');
  END IF;

  IF v_promo.max_redemptions IS NOT NULL
     AND v_promo.redemption_count >= v_promo.max_redemptions THEN
    RETURN jsonb_build_object('success', false, 'reason', 'exhausted',
                              'message', 'That code has reached its redemption limit.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.promo_redemptions r
             WHERE r.code = v_code AND r.organization_id = v_org) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'already_redeemed',
                              'message', 'This workspace has already used that code.');
  END IF;

  SELECT plan_id INTO v_plan FROM public.organizations WHERE id = v_org;
  IF v_promo.applies_to_plan_id IS NOT NULL
     AND v_plan IS DISTINCT FROM v_promo.applies_to_plan_id THEN
    RETURN jsonb_build_object('success', false, 'reason', 'wrong_plan',
                              'message', 'That code does not apply to your current plan.');
  END IF;

  -- Apply the grant. Runs as the function owner, so it may write the
  -- operator-only columns that a tenant cannot write directly.
  IF v_promo.grant_type = 'unlimited' THEN
    UPDATE public.organizations
    SET unlimited_access = true,
        unlimited_reason = 'promo:' || v_code,
        plan_id          = COALESCE(v_promo.grants_plan_id, plan_id),
        updated_at       = now()
    WHERE id = v_org;

  ELSIF v_promo.grant_type = 'plan_upgrade' AND v_promo.grants_plan_id IS NOT NULL THEN
    UPDATE public.organizations
    SET plan_id = v_promo.grants_plan_id, updated_at = now()
    WHERE id = v_org;
  END IF;
  -- percent_off / amount_off / free_months are recorded here and applied by the
  -- billing layer at checkout; they intentionally change nothing in the DB yet.

  INSERT INTO public.promo_redemptions (code, organization_id, user_id, grant_snapshot)
  VALUES (v_code, v_org, v_uid,
          jsonb_build_object('grant_type', v_promo.grant_type,
                             'grant_value', v_promo.grant_value,
                             'grants_plan_id', v_promo.grants_plan_id));

  UPDATE public.promo_codes
  SET redemption_count = redemption_count + 1
  WHERE code = v_code;

  RETURN jsonb_build_object(
    'success', true,
    'grant_type', v_promo.grant_type,
    'message', CASE v_promo.grant_type
                 WHEN 'unlimited' THEN 'Unlimited access unlocked.'
                 ELSE 'Code applied.'
               END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.redeem_promo_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_promo_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_addons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions  ENABLE ROW LEVEL SECURITY;

-- Public catalog: anyone may read active/public plans (needed for a pricing page).
DROP POLICY IF EXISTS "Anyone can view public plans" ON public.plans;
CREATE POLICY "Anyone can view public plans"
  ON public.plans FOR SELECT
  USING (is_active AND is_public);

DROP POLICY IF EXISTS "Platform operator manages plans" ON public.plans;
CREATE POLICY "Platform operator manages plans"
  ON public.plans FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

DROP POLICY IF EXISTS "Anyone can view active addons" ON public.plan_addons;
CREATE POLICY "Anyone can view active addons"
  ON public.plan_addons FOR SELECT
  USING (is_active);

DROP POLICY IF EXISTS "Platform operator manages addons" ON public.plan_addons;
CREATE POLICY "Platform operator manages addons"
  ON public.plan_addons FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

-- promo_codes: operator only, for EVERY command including SELECT. Tenants must
-- not be able to enumerate codes; they redeem blind through the function.
DROP POLICY IF EXISTS "Platform operator manages promo codes" ON public.promo_codes;
CREATE POLICY "Platform operator manages promo codes"
  ON public.promo_codes FOR ALL
  USING (public.is_platform_operator())
  WITH CHECK (public.is_platform_operator());

-- Redemptions: a tenant may see their own workspace's history. No client INSERT
-- policy at all — the only write path is redeem_promo_code().
DROP POLICY IF EXISTS "Users view own org redemptions" ON public.promo_redemptions;
CREATE POLICY "Users view own org redemptions"
  ON public.promo_redemptions FOR SELECT
  USING (
    public.is_platform_operator()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_users WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. Seed the catalog  (PLACEHOLDER PRICING — change freely)
-- ---------------------------------------------------------------------------

INSERT INTO public.plans
  (id, name, tagline, price_cents, included_minutes, overage_per_minute_cents,
   max_campaigns, max_phone_numbers, max_leads, max_concurrent_calls,
   phone_mode, features, sort_order)
VALUES
  ('starter', 'Starter', 'For a solo closer getting off the ground',
   2900, 200, 18, 3, 2, 5000, 5, 'byo',
   '{"voice_broadcast":true,"ai_dialing":true,"retell_integration":true,"transcript_analysis":true}'::jsonb, 10),

  ('pro', 'Pro', 'The full autonomous dialer, numbers included',
   59900, 5000, 12, 25, 25, 100000, 50, 'both',
   '{"voice_broadcast":true,"ai_dialing":true,"retell_integration":true,"transcript_analysis":true,"autonomous_mode":true,"predictive_pacing":true,"ai_pipeline_manager":true,"self_learning":true,"script_optimization":true,"multi_carrier":true,"pipeline_sync":true,"disposition_automation":true,"callback_scheduling":true,"workflow_triggers":true}'::jsonb, 20),

  ('ultimate', 'Ultimate', 'Pro plus white-label, API and add-ons',
   59900, 10000, 10, NULL, NULL, NULL, 100, 'both',
   '{"voice_broadcast":true,"ai_dialing":true,"retell_integration":true,"transcript_analysis":true,"autonomous_mode":true,"predictive_pacing":true,"ai_pipeline_manager":true,"self_learning":true,"script_optimization":true,"multi_carrier":true,"pipeline_sync":true,"disposition_automation":true,"callback_scheduling":true,"workflow_triggers":true,"white_label":true,"api_access":true,"custom_dashboard":true}'::jsonb, 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.plan_addons
  (id, name, description, price_cents, billing_period, available_for_plan_ids, grants, sort_order)
VALUES
  ('minutes_1000',   'Extra 1,000 minutes', 'One-time top-up of 1,000 call minutes.',
   9900, 'once',  ARRAY['pro','ultimate'], '{"minutes":1000}'::jsonb, 10),
  ('extra_number',   'Additional phone number', 'One more managed number on your account.',
   500,  'month', ARRAY['pro','ultimate'], '{"phone_numbers":1}'::jsonb, 20),
  ('white_label',    'White label', 'Your branding across the client portal.',
   19900,'month', ARRAY['pro'],            '{"white_label":true}'::jsonb, 30),
  ('priority_support','Priority support', 'Same-day response and launch help.',
   9900, 'month', ARRAY['starter','pro','ultimate'], '{"priority_support":true}'::jsonb, 40)
ON CONFLICT (id) DO NOTHING;

-- The oscar1 promo: lowercase 'o', numeral '1'. Matching is case-insensitive,
-- so OSCAR1 / Oscar1 also redeem. Grants unlimited access on any plan.
--
-- max_redemptions is set to 100 as a DELIBERATE SAFETY CAP, not because you
-- asked for one: an uncapped code that grants unlimited service is a standing
-- revenue risk the moment it leaks. Raise or remove it whenever you like:
--   UPDATE public.promo_codes SET max_redemptions = NULL WHERE code = 'oscar1';
INSERT INTO public.promo_codes
  (code, description, grant_type, applies_to_plan_id, max_redemptions, is_active)
VALUES
  ('oscar1', 'Founder code — unlimited access', 'unlimited', NULL, 100, true)
ON CONFLICT (code) DO NOTHING;

-- Existing organizations start on Starter so nothing is left plan-less.
UPDATE public.organizations SET plan_id = 'starter' WHERE plan_id IS NULL;
