-- ============================================
-- PHASE 2: MULTI-TENANCY - ORGANIZATIONS TABLE
-- ============================================
-- This migration creates the foundational organizations table
-- for multi-tenant support, enabling multiple independent clients
-- to use the system with complete data isolation.

-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL, -- URL-friendly identifier
  
  -- Settings and configuration
  settings JSONB DEFAULT '{}'::jsonb,
  
  -- Subscription and billing
  subscription_tier TEXT DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'professional', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'trial', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  
  -- Limits and quotas
  max_users INTEGER DEFAULT 5,
  max_campaigns INTEGER DEFAULT 10,
  max_phone_numbers INTEGER DEFAULT 5,
  monthly_call_limit INTEGER DEFAULT 1000,
  
  -- Contact and metadata
  owner_email TEXT,
  contact_phone TEXT,
  timezone TEXT DEFAULT 'America/Chicago',
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ, -- Soft delete support
  
  -- Constraints
  CONSTRAINT valid_slug CHECK (slug ~ '^[a-z0-9-]+$')
);

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON public.organizations(subscription_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_organizations_created ON public.organizations(created_at DESC);

-- Enable RLS on organizations table
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create organization_users junction table
-- This maps users to organizations and defines their role within that org
CREATE TABLE IF NOT EXISTS public.organization_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  
  -- Timestamps
  joined_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure a user can only have one role per organization
  UNIQUE(organization_id, user_id)
);

-- Create indexes for organization_users
CREATE INDEX IF NOT EXISTS idx_organization_users_org ON public.organization_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_user ON public.organization_users(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_users_role ON public.organization_users(role);

-- Enable RLS on organization_users table
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

-- Helper function to get user's organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations(user_uuid UUID)
RETURNS SETOF UUID
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM organization_users 
  WHERE user_id = user_uuid;
$$;

-- Helper function to check if user belongs to an organization
CREATE OR REPLACE FUNCTION public.user_in_organization(user_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM organization_users 
    WHERE user_id = user_uuid 
    AND organization_id = org_uuid
  );
$$;

-- Helper function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_org_role(user_uuid UUID, org_uuid UUID)
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role 
  FROM organization_users 
  WHERE user_id = user_uuid 
  AND organization_id = org_uuid
  LIMIT 1;
$$;

-- Helper function to check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(user_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM organization_users 
    WHERE user_id = user_uuid 
    AND organization_id = org_uuid
    AND role IN ('owner', 'admin')
  );
$$;

-- RLS Policies for organizations table
-- Users can view organizations they belong to
CREATE POLICY "Users can view their organizations"
ON public.organizations FOR SELECT
USING (
  id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- Only org owners/admins can update their organization
CREATE POLICY "Org admins can update their organization"
ON public.organizations FOR UPDATE
USING (
  public.is_org_admin(auth.uid(), id)
);

-- Service role can manage all organizations (for system operations)
CREATE POLICY "Service role can manage organizations"
ON public.organizations FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- RLS Policies for organization_users table
-- Users can view members of their organizations
CREATE POLICY "Users can view their org members"
ON public.organization_users FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_organizations(auth.uid()))
);

-- Only org admins can add/remove members
CREATE POLICY "Org admins can manage members"
ON public.organization_users FOR ALL
USING (
  public.is_org_admin(auth.uid(), organization_id)
);

-- Service role can manage all org users
CREATE POLICY "Service role can manage org users"
ON public.organization_users FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Trigger to update organizations.updated_at
CREATE OR REPLACE FUNCTION public.update_organizations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_timestamp
BEFORE UPDATE ON public.organizations
FOR EACH ROW
EXECUTE FUNCTION public.update_organizations_updated_at();

-- Migration: Create default organization for existing users
-- This ensures backward compatibility - all existing data belongs to a default org
INSERT INTO public.organizations (name, slug, owner_email, subscription_tier, subscription_status)
VALUES ('Default Organization', 'default-org', 'admin@dialsmart.app', 'enterprise', 'active')
ON CONFLICT (slug) DO NOTHING;

-- Map all existing users to the default organization as members
-- The first user becomes the owner
DO $$
DECLARE
  default_org_id UUID;
  first_user_id UUID;
  user_record RECORD;
  is_first BOOLEAN := true;
BEGIN
  -- Get the default organization ID
  SELECT id INTO default_org_id FROM public.organizations WHERE slug = 'default-org';
  
  IF default_org_id IS NOT NULL THEN
    -- Iterate through all existing users
    FOR user_record IN SELECT id FROM auth.users LOOP
      IF is_first THEN
        -- First user becomes the owner
        INSERT INTO public.organization_users (organization_id, user_id, role)
        VALUES (default_org_id, user_record.id, 'owner')
        ON CONFLICT (organization_id, user_id) DO NOTHING;
        is_first := false;
      ELSE
        -- Other users become members
        INSERT INTO public.organization_users (organization_id, user_id, role)
        VALUES (default_org_id, user_record.id, 'member')
        ON CONFLICT (organization_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON TABLE public.organizations IS 'Multi-tenant organizations table - each organization represents an independent client/company';
COMMENT ON TABLE public.organization_users IS 'Junction table mapping users to organizations with their roles';
COMMENT ON FUNCTION public.user_in_organization IS 'Check if a user belongs to a specific organization';
COMMENT ON FUNCTION public.is_org_admin IS 'Check if a user has admin privileges in an organization';
