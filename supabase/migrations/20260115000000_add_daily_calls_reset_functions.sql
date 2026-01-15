-- Add daily_calls reset functions for call-dispatcher
-- These functions ensure daily_calls counters reset properly at midnight

-- Function to reset stale daily_calls counters (from previous days)
-- Called before selecting phone numbers for rotation
CREATE OR REPLACE FUNCTION public.reset_stale_daily_calls(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Reset daily_calls to 0 for numbers where last_call_at was not today
  UPDATE phone_numbers
  SET
    daily_calls = 0,
    updated_at = now()
  WHERE user_id = target_user_id
    AND daily_calls > 0
    AND (
      last_call_at IS NULL
      OR last_call_at::date < CURRENT_DATE
    );
END;
$$;

-- Function to increment daily_calls with automatic reset if stale
-- Returns the new daily_calls count
CREATE OR REPLACE FUNCTION public.increment_daily_calls_with_reset(
  target_phone_id UUID
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count integer;
BEGIN
  -- Reset if last call was not today, then increment
  UPDATE phone_numbers
  SET
    daily_calls = CASE
      WHEN last_call_at IS NULL OR last_call_at::date < CURRENT_DATE THEN 1
      ELSE daily_calls + 1
    END,
    last_call_at = now(),
    updated_at = now()
  WHERE id = target_phone_id
  RETURNING daily_calls INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.reset_stale_daily_calls(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reset_stale_daily_calls(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_daily_calls_with_reset(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_daily_calls_with_reset(UUID) TO service_role;

-- Add last_call_at column if it doesn't exist
ALTER TABLE phone_numbers
ADD COLUMN IF NOT EXISTS last_call_at TIMESTAMPTZ;

-- Add index for efficient daily reset queries
CREATE INDEX IF NOT EXISTS idx_phone_numbers_daily_reset
ON phone_numbers(user_id, daily_calls, last_call_at)
WHERE daily_calls > 0;
