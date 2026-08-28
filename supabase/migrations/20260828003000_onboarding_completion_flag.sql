-- Track whether a user has been through the setup wizard.
--
-- OnboardingWizard already exists and is already wired as the Dashboard's
-- 'onboarding' tab, but nothing ever routes a new signup into it -- you have to
-- know the tab is there and click it. A new customer lands on a dashboard built
-- for an account with 3,302 leads, 40 phone numbers and 8 campaigns, holding
-- none of those things.
--
-- The flag lives on user_feature_flags because create_user_feature_flags()
-- already guarantees every signup has exactly one row there.

ALTER TABLE public.user_feature_flags
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Existing users have already configured the app by hand. Don't drop them into
-- a setup wizard on their next login.
UPDATE public.user_feature_flags
SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE onboarding_completed_at IS NULL;

COMMENT ON COLUMN public.user_feature_flags.onboarding_completed_at IS
  'Set when the user finishes or skips the setup wizard. NULL means route them into it on first dashboard load.';
