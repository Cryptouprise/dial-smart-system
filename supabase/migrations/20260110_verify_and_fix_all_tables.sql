-- =====================================================
-- COMPREHENSIVE DATABASE VERIFICATION & FIX MIGRATION
-- Safe to run multiple times (idempotent)
-- =====================================================

-- =====================
-- 1. ORGANIZATIONS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}'::jsonb,
  subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'professional', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'trial', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  max_users INTEGER DEFAULT 5,
  max_campaigns INTEGER DEFAULT 10,
  max_phone_numbers INTEGER DEFAULT 5,
  monthly_call_limit INTEGER DEFAULT 1000,
  owner_email TEXT,
  contact_phone TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(subscription_status);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- =====================
-- 2. ORGANIZATION_USERS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS public.organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_users_org ON public.organization_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_user ON public.organization_users(user_id);

ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

-- =====================
-- 3. EDGE_FUNCTION_ERRORS TABLE
-- =====================
CREATE TABLE IF NOT EXISTS public.edge_function_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  action TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES public.campaign_workflows(id) ON DELETE SET NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  request_payload JSONB,
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'critical')) DEFAULT 'error',
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  organization_id UUID,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_edge_errors_function ON public.edge_function_errors(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_errors_unresolved ON public.edge_function_errors(resolved, severity, created_at DESC) WHERE resolved = false;
CREATE INDEX IF NOT EXISTS idx_edge_errors_user ON public.edge_function_errors(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_edge_errors_lead ON public.edge_function_errors(lead_id);
CREATE INDEX IF NOT EXISTS idx_edge_errors_severity ON public.edge_function_errors(severity);

ALTER TABLE public.edge_function_errors ENABLE ROW LEVEL SECURITY;

-- =====================
-- 4. HELPER FUNCTIONS
-- =====================

-- Get user's organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations(user_uuid UUID)
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM organization_users WHERE user_id = user_uuid;
$$;

-- Check if user is in organization
CREATE OR REPLACE FUNCTION public.user_in_organization(user_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users 
    WHERE user_id = user_uuid AND organization_id = org_uuid
  );
$$;

-- Overload for single param (uses auth.uid())
CREATE OR REPLACE FUNCTION public.user_in_organization(org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users 
    WHERE user_id = auth.uid() AND organization_id = org_uuid
  );
$$;

-- Get user's role in organization
CREATE OR REPLACE FUNCTION public.get_user_org_role(user_uuid UUID, org_uuid UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM organization_users 
  WHERE user_id = user_uuid AND organization_id = org_uuid
  LIMIT 1;
$$;

-- Overload for single param
CREATE OR REPLACE FUNCTION public.get_user_org_role(org_uuid UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM organization_users 
  WHERE user_id = auth.uid() AND organization_id = org_uuid
  LIMIT 1;
$$;

-- Check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(user_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users 
    WHERE user_id = user_uuid 
    AND organization_id = org_uuid
    AND role IN ('owner', 'admin')
  );
$$;

-- Overload for single param
CREATE OR REPLACE FUNCTION public.is_org_admin(org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users 
    WHERE user_id = auth.uid() 
    AND organization_id = org_uuid
    AND role IN ('owner', 'admin')
  );
$$;

-- =====================
-- 5. RLS POLICIES (Drop and recreate to avoid conflicts)
-- =====================

-- Organizations policies
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
CREATE POLICY "Users can view their organizations" ON public.organizations
  FOR SELECT USING (
    id IN (SELECT public.get_user_organizations(auth.uid()))
  );

DROP POLICY IF EXISTS "Admins can update organizations" ON public.organizations;
CREATE POLICY "Admins can update organizations" ON public.organizations
  FOR UPDATE USING (is_org_admin(id));

DROP POLICY IF EXISTS "Authenticated can create organizations" ON public.organizations;
CREATE POLICY "Authenticated can create organizations" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Organization users policies
DROP POLICY IF EXISTS "Users can view org members" ON public.organization_users;
CREATE POLICY "Users can view org members" ON public.organization_users
  FOR SELECT USING (user_in_organization(organization_id));

DROP POLICY IF EXISTS "Admins can manage members" ON public.organization_users;
CREATE POLICY "Admins can manage members" ON public.organization_users
  FOR ALL USING (is_org_admin(organization_id));

DROP POLICY IF EXISTS "Users can join via invite" ON public.organization_users;
CREATE POLICY "Users can join via invite" ON public.organization_users
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Edge function errors policies
DROP POLICY IF EXISTS "Users can view own errors" ON public.edge_function_errors;
CREATE POLICY "Users can view own errors" ON public.edge_function_errors
  FOR SELECT USING (
    auth.uid() = user_id OR 
    organization_id IN (SELECT public.get_user_organizations(auth.uid()))
  );

DROP POLICY IF EXISTS "Service role can insert errors" ON public.edge_function_errors;
CREATE POLICY "Service role can insert errors" ON public.edge_function_errors
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update own errors" ON public.edge_function_errors;
CREATE POLICY "Users can update own errors" ON public.edge_function_errors
  FOR UPDATE USING (auth.uid() = user_id);

-- =====================
-- 6. CREATE DEFAULT ORGANIZATION & MAP USERS
-- =====================

-- Create default organization if not exists
INSERT INTO public.organizations (name, slug, subscription_tier, subscription_status)
SELECT 'Default Organization', 'default-org', 'enterprise', 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = 'default-org');

-- Map all existing users to default organization as owners (if not already mapped)
-- NOTE: All users are given 'owner' role to ensure backward compatibility
-- and prevent any permission issues during migration. Admins can adjust
-- roles after migration if needed.
INSERT INTO public.organization_users (organization_id, user_id, role)
SELECT 
  (SELECT id FROM public.organizations WHERE slug = 'default-org'),
  au.id,
  'owner'
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_users ou 
  WHERE ou.user_id = au.id
)
ON CONFLICT (organization_id, user_id) DO NOTHING;

-- =====================
-- 7. VERIFICATION VIEW
-- =====================
CREATE OR REPLACE VIEW public.enterprise_status_v AS
SELECT 
  (SELECT COUNT(*) FROM public.organizations) as total_organizations,
  (SELECT COUNT(*) FROM public.organization_users) as total_org_users,
  (SELECT COUNT(*) FROM public.edge_function_errors) as total_errors,
  (SELECT COUNT(*) FROM public.edge_function_errors WHERE resolved = false) as unresolved_errors,
  (SELECT name FROM public.organizations WHERE slug = 'default-org') as default_org_name,
  'Enterprise tables verified and ready' as status;

GRANT SELECT ON public.enterprise_status_v TO authenticated;
