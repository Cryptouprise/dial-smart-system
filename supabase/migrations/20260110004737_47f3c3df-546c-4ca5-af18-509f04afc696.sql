-- Fix GHL upsert conflict target: ON CONFLICT(phone_number,user_id) cannot use a partial unique index
-- Replace the previous partial index with a full unique index on (phone_number, user_id)
DROP INDEX IF EXISTS public.leads_phone_user_unique;

CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_user_unique
ON public.leads (phone_number, user_id);
