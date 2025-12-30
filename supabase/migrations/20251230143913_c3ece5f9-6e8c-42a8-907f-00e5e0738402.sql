-- Add address fields to leads table
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS zip_code TEXT;

-- Add a combined full_address computed field for easy access
COMMENT ON COLUMN public.leads.address IS 'Street address for the lead';
COMMENT ON COLUMN public.leads.city IS 'City for the lead';
COMMENT ON COLUMN public.leads.state IS 'State for the lead';
COMMENT ON COLUMN public.leads.zip_code IS 'ZIP/Postal code for the lead';