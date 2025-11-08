-- Add additional fields to leads table for better tracking and personalization
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS lead_source text,
ADD COLUMN IF NOT EXISTS tags text[],
ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'America/New_York',
ADD COLUMN IF NOT EXISTS preferred_contact_time text,
ADD COLUMN IF NOT EXISTS do_not_call boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS ghl_contact_id text;

-- Add index for lead_source for faster filtering
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON public.leads(lead_source);

-- Add index for tags using GIN for array searches
CREATE INDEX IF NOT EXISTS idx_leads_tags ON public.leads USING GIN(tags);

-- Add index for custom_fields using GIN for JSONB searches
CREATE INDEX IF NOT EXISTS idx_leads_custom_fields ON public.leads USING GIN(custom_fields);

-- Add index for ghl_contact_id for GoHighLevel integration lookups
CREATE INDEX IF NOT EXISTS idx_leads_ghl_contact_id ON public.leads(ghl_contact_id);

COMMENT ON COLUMN public.leads.lead_source IS 'Source of the lead (e.g., website, referral, paid ad, cold outreach)';
COMMENT ON COLUMN public.leads.tags IS 'Array of tags for categorizing leads';
COMMENT ON COLUMN public.leads.custom_fields IS 'JSONB object for storing any custom data specific to the lead';
COMMENT ON COLUMN public.leads.timezone IS 'Timezone of the lead for optimal calling times';
COMMENT ON COLUMN public.leads.preferred_contact_time IS 'Preferred time to contact the lead';
COMMENT ON COLUMN public.leads.do_not_call IS 'Flag to prevent calling this lead';
COMMENT ON COLUMN public.leads.ghl_contact_id IS 'GoHighLevel contact ID for integration';