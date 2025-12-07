-- Add unique constraint for user_id + provider combination
ALTER TABLE public.calendar_integrations 
ADD CONSTRAINT calendar_integrations_user_provider_unique 
UNIQUE (user_id, provider);