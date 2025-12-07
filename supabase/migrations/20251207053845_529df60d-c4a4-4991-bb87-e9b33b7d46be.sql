-- Add unique constraint on user_id for upsert to work
ALTER TABLE public.lead_scoring_settings 
ADD CONSTRAINT lead_scoring_settings_user_id_unique UNIQUE (user_id);