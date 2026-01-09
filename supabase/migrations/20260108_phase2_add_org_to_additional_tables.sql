-- ============================================
-- PHASE 2: ADD ORGANIZATION_ID TO ADDITIONAL TABLES
-- ============================================
-- This migration adds organization_id to supporting tables

-- Get the default organization ID
DO $$
DECLARE
  default_org_id UUID;
BEGIN
  SELECT id INTO default_org_id FROM public.organizations WHERE slug = 'default-org';
  CREATE TEMP TABLE IF NOT EXISTS _default_org (id UUID);
  DELETE FROM _default_org;
  INSERT INTO _default_org VALUES (default_org_id);
END $$;

-- ============================================
-- DNC_LIST TABLE
-- ============================================
ALTER TABLE public.dnc_list 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.dnc_list 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.dnc_list ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dnc_list_organization ON public.dnc_list(organization_id);

DROP POLICY IF EXISTS "Users can view their own DNC list" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can insert to their DNC list" ON public.dnc_list;
DROP POLICY IF EXISTS "Users can delete from their DNC list" ON public.dnc_list;

CREATE POLICY "Users can view DNC list in their organization"
ON public.dnc_list FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can insert to DNC list in their organization"
ON public.dnc_list FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can delete from DNC list in their organization"
ON public.dnc_list FOR DELETE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- ============================================
-- AI_SMS_SETTINGS TABLE
-- ============================================
ALTER TABLE public.ai_sms_settings 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.ai_sms_settings 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.ai_sms_settings ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_sms_settings_organization ON public.ai_sms_settings(organization_id);

DROP POLICY IF EXISTS "Users can view their own AI SMS settings" ON public.ai_sms_settings;
DROP POLICY IF EXISTS "Users can update their own AI SMS settings" ON public.ai_sms_settings;
DROP POLICY IF EXISTS "Users can insert their own AI SMS settings" ON public.ai_sms_settings;

CREATE POLICY "Users can view AI SMS settings in their organization"
ON public.ai_sms_settings FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can update AI SMS settings in their organization"
ON public.ai_sms_settings FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can insert AI SMS settings in their organization"
ON public.ai_sms_settings FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- ============================================
-- AUTONOMOUS_SETTINGS TABLE
-- ============================================
ALTER TABLE public.autonomous_settings 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.autonomous_settings 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.autonomous_settings ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_autonomous_settings_organization ON public.autonomous_settings(organization_id);

DROP POLICY IF EXISTS "Users can view their own autonomous settings" ON public.autonomous_settings;
DROP POLICY IF EXISTS "Users can update their own autonomous settings" ON public.autonomous_settings;

CREATE POLICY "Users can view autonomous settings in their organization"
ON public.autonomous_settings FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can update autonomous settings in their organization"
ON public.autonomous_settings FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- ============================================
-- AGENT_SCRIPTS TABLE
-- ============================================
ALTER TABLE public.agent_scripts 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.agent_scripts 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.agent_scripts ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_scripts_organization ON public.agent_scripts(organization_id);

DROP POLICY IF EXISTS "Users can view their own agent scripts" ON public.agent_scripts;
DROP POLICY IF EXISTS "Users can insert their own agent scripts" ON public.agent_scripts;
DROP POLICY IF EXISTS "Users can update their own agent scripts" ON public.agent_scripts;
DROP POLICY IF EXISTS "Users can delete their own agent scripts" ON public.agent_scripts;

CREATE POLICY "Users can view agent scripts in their organization"
ON public.agent_scripts FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can insert agent scripts in their organization"
ON public.agent_scripts FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can update agent scripts in their organization"
ON public.agent_scripts FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can delete agent scripts in their organization"
ON public.agent_scripts FOR DELETE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- ============================================
-- CALENDAR_INTEGRATIONS TABLE
-- ============================================
ALTER TABLE public.calendar_integrations 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.calendar_integrations 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.calendar_integrations ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_organization ON public.calendar_integrations(organization_id);

DROP POLICY IF EXISTS "Users can view their own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Users can insert their own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Users can update their own calendar integrations" ON public.calendar_integrations;
DROP POLICY IF EXISTS "Users can delete their own calendar integrations" ON public.calendar_integrations;

CREATE POLICY "Users can view calendar integrations in their organization"
ON public.calendar_integrations FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can insert calendar integrations in their organization"
ON public.calendar_integrations FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can update calendar integrations in their organization"
ON public.calendar_integrations FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can delete calendar integrations in their organization"
ON public.calendar_integrations FOR DELETE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- ============================================
-- FOLLOW_UP_SEQUENCES TABLE
-- ============================================
ALTER TABLE public.follow_up_sequences 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.follow_up_sequences 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.follow_up_sequences ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_follow_up_sequences_organization ON public.follow_up_sequences(organization_id);

DROP POLICY IF EXISTS "Users can view their own sequences" ON public.follow_up_sequences;
DROP POLICY IF EXISTS "Users can insert their own sequences" ON public.follow_up_sequences;
DROP POLICY IF EXISTS "Users can update their own sequences" ON public.follow_up_sequences;
DROP POLICY IF EXISTS "Users can delete their own sequences" ON public.follow_up_sequences;

CREATE POLICY "Users can view sequences in their organization"
ON public.follow_up_sequences FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can insert sequences in their organization"
ON public.follow_up_sequences FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can update sequences in their organization"
ON public.follow_up_sequences FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can delete sequences in their organization"
ON public.follow_up_sequences FOR DELETE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- ============================================
-- DISPOSITION_METRICS TABLE
-- ============================================
ALTER TABLE public.disposition_metrics 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.disposition_metrics 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.disposition_metrics ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_disposition_metrics_organization ON public.disposition_metrics(organization_id);

DROP POLICY IF EXISTS "Users can view their own disposition metrics" ON public.disposition_metrics;
DROP POLICY IF EXISTS "System can insert disposition metrics" ON public.disposition_metrics;

CREATE POLICY "Users can view disposition metrics in their organization"
ON public.disposition_metrics FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "System can insert disposition metrics"
ON public.disposition_metrics FOR INSERT
WITH CHECK (
  -- Verify the organization_id matches a valid org
  EXISTS (SELECT 1 FROM public.organizations WHERE id = organization_id)
);

-- ============================================
-- PIPELINE_BOARDS TABLE
-- ============================================
ALTER TABLE public.pipeline_boards 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.pipeline_boards 
SET organization_id = (SELECT id FROM _default_org)
WHERE organization_id IS NULL;

ALTER TABLE public.pipeline_boards ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_boards_organization ON public.pipeline_boards(organization_id);

DROP POLICY IF EXISTS "Users can view their own pipeline boards" ON public.pipeline_boards;
DROP POLICY IF EXISTS "Users can insert their own pipeline boards" ON public.pipeline_boards;
DROP POLICY IF EXISTS "Users can update their own pipeline boards" ON public.pipeline_boards;
DROP POLICY IF EXISTS "Users can delete their own pipeline boards" ON public.pipeline_boards;

CREATE POLICY "Users can view pipeline boards in their organization"
ON public.pipeline_boards FOR SELECT
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can insert pipeline boards in their organization"
ON public.pipeline_boards FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can update pipeline boards in their organization"
ON public.pipeline_boards FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

CREATE POLICY "Users can delete pipeline boards in their organization"
ON public.pipeline_boards FOR DELETE
USING (organization_id IN (SELECT public.get_user_organizations(auth.uid())));

-- Clean up temp table
DROP TABLE IF EXISTS _default_org;
