-- LIVE-ONLY migration pulled from supabase_migrations.schema_migrations on 2026-10-28 (never committed to repo).
ALTER TABLE public.user_feature_flags
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

UPDATE public.user_feature_flags
SET onboarding_completed_at = COALESCE(onboarding_completed_at, now())
WHERE onboarding_completed_at IS NULL;

COMMENT ON COLUMN public.user_feature_flags.onboarding_completed_at IS
  'Set when the user finishes or skips the setup wizard. NULL means route them into it on first dashboard load.';
