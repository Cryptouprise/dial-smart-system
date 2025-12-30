-- Ensure Retell call log upserts work reliably
-- Adds a unique constraint so ON CONFLICT (retell_call_id) is valid.
ALTER TABLE public.call_logs
ADD CONSTRAINT call_logs_retell_call_id_key UNIQUE (retell_call_id);
