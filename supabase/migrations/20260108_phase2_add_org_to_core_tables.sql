-- ============================================
-- PHASE 2: ADD ORGANIZATION_ID TO CORE TABLES
-- ============================================
-- This migration adds organization_id foreign keys to core tables
-- and updates RLS policies for multi-tenant data isolation.

-- Get the default organization ID for the migration
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id INTO default_org_id FROM public.organizations WHERE slug = 'default-org';
  
  -- Store it in a temporary table for easy access
  CREATE TEMP TABLE IF NOT EXISTS _default_org (id UUID);
  DELETE FROM _default_org;
  INSERT INTO _default_org VALUES (default_org_id);
END $$;

-- ============================================
-- 1. CAMPAIGNS TABLE
-- ============================================
ALTER TABLE public.campaigns 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Set default org for existing campaigns
UPDATE public.campaigns 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

-- Make organization_id required
ALTER TABLE public.campaigns ALTER COLUMN organization_id SET NOT NULL;

-- Create index
CREATE INDEX IF NOT EXISTS idx_campaigns_organization ON public.campaigns(organization_id);

-- Drop old user-only policies
DROP POLICY IF EXISTS "Users can view their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can insert their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can update their own campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Users can delete their own campaigns" ON public.campaigns;

-- Create new organization-aware policies
CREATE POLICY "Users can view campaigns in their organization"
ON public.campaigns FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can insert campaigns in their organization"
ON public.campaigns FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update campaigns in their organization"
ON public.campaigns FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can delete campaigns in their organization"
ON public.campaigns FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

-- ============================================
-- 2. LEADS TABLE
-- ============================================
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.leads 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.leads ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_organization ON public.leads(organization_id);

-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can insert their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update their own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete their own leads" ON public.leads;

-- Create new organization-aware policies
CREATE POLICY "Users can view leads in their organization"
ON public.leads FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can insert leads in their organization"
ON public.leads FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update leads in their organization"
ON public.leads FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can delete leads in their organization"
ON public.leads FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- ============================================
-- 3. PHONE_NUMBERS TABLE
-- ============================================
ALTER TABLE public.phone_numbers 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.phone_numbers 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.phone_numbers ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_phone_numbers_organization ON public.phone_numbers(organization_id);

-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can insert their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can update their own phone numbers" ON public.phone_numbers;
DROP POLICY IF EXISTS "Users can delete their own phone numbers" ON public.phone_numbers;

-- Create new organization-aware policies
CREATE POLICY "Users can view phone numbers in their organization"
ON public.phone_numbers FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can insert phone numbers in their organization"
ON public.phone_numbers FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update phone numbers in their organization"
ON public.phone_numbers FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can delete phone numbers in their organization"
ON public.phone_numbers FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- ============================================
-- 4. VOICE_BROADCASTS TABLE
-- ============================================
ALTER TABLE public.voice_broadcasts 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.voice_broadcasts 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.voice_broadcasts ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_voice_broadcasts_organization ON public.voice_broadcasts(organization_id);

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view their own broadcasts" ON public.voice_broadcasts;
DROP POLICY IF EXISTS "Users can insert their own broadcasts" ON public.voice_broadcasts;
DROP POLICY IF EXISTS "Users can update their own broadcasts" ON public.voice_broadcasts;
DROP POLICY IF EXISTS "Users can delete their own broadcasts" ON public.voice_broadcasts;

-- Create new organization-aware policies
CREATE POLICY "Users can view broadcasts in their organization"
ON public.voice_broadcasts FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can insert broadcasts in their organization"
ON public.voice_broadcasts FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update broadcasts in their organization"
ON public.voice_broadcasts FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can delete broadcasts in their organization"
ON public.voice_broadcasts FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- ============================================
-- 5. WORKFLOWS TABLE
-- ============================================
ALTER TABLE public.workflows 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.workflows 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.workflows ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_organization ON public.workflows(organization_id);

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can insert their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can update their own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can delete their own workflows" ON public.workflows;

-- Create new organization-aware policies
CREATE POLICY "Users can view workflows in their organization"
ON public.workflows FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can insert workflows in their organization"
ON public.workflows FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update workflows in their organization"
ON public.workflows FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can delete workflows in their organization"
ON public.workflows FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- ============================================
-- 6. CALL_LOGS TABLE
-- ============================================
ALTER TABLE public.call_logs 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.call_logs 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.call_logs ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_organization ON public.call_logs(organization_id);

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view their own call logs" ON public.call_logs;
DROP POLICY IF EXISTS "Users can insert call logs" ON public.call_logs;

-- Create new organization-aware policies
CREATE POLICY "Users can view call logs in their organization"
ON public.call_logs FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "System can insert call logs"
ON public.call_logs FOR INSERT
WITH CHECK (true); -- System/edge functions will set the correct org_id

-- ============================================
-- 7. DISPOSITIONS TABLE
-- ============================================
ALTER TABLE public.dispositions 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.dispositions 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.dispositions ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispositions_organization ON public.dispositions(organization_id);

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Users can view their own dispositions" ON public.dispositions;
DROP POLICY IF EXISTS "Users can insert their own dispositions" ON public.dispositions;
DROP POLICY IF EXISTS "Users can update their own dispositions" ON public.dispositions;
DROP POLICY IF EXISTS "Users can delete their own dispositions" ON public.dispositions;

-- Create new organization-aware policies
CREATE POLICY "Users can view dispositions in their organization"
ON public.dispositions FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can insert dispositions in their organization"
ON public.dispositions FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  AND user_id = auth.uid()
);

CREATE POLICY "Users can update dispositions in their organization"
ON public.dispositions FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

CREATE POLICY "Users can delete dispositions in their organization"
ON public.dispositions FOR DELETE
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- Clean up temp table
DROP TABLE IF EXISTS _default_org;

-- Add comments for documentation
COMMENT ON COLUMN public.campaigns.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
COMMENT ON COLUMN public.leads.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
COMMENT ON COLUMN public.phone_numbers.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
COMMENT ON COLUMN public.voice_broadcasts.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
COMMENT ON COLUMN public.workflows.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
COMMENT ON COLUMN public.call_logs.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
COMMENT ON COLUMN public.dispositions.organization_id IS 'Foreign key to organizations table for multi-tenant data isolation';
