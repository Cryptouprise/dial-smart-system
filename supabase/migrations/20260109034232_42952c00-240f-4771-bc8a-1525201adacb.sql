-- Create organizations table for multi-tenancy
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}',
  subscription_tier TEXT NOT NULL DEFAULT 'basic' CHECK (subscription_tier IN ('basic', 'professional', 'enterprise')),
  subscription_status TEXT NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'trial', 'suspended', 'cancelled')),
  trial_ends_at TIMESTAMPTZ,
  max_users INTEGER DEFAULT 5,
  max_campaigns INTEGER DEFAULT 10,
  max_phone_numbers INTEGER DEFAULT 5,
  monthly_call_limit INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create organization_users junction table
CREATE TABLE IF NOT EXISTS public.organization_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Create indexes
CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_organization_users_user_id ON public.organization_users(user_id);
CREATE INDEX idx_organization_users_org_id ON public.organization_users(organization_id);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user belongs to an organization
CREATE OR REPLACE FUNCTION public.user_in_organization(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;

-- Helper function to get user's role in an organization
CREATE OR REPLACE FUNCTION public.get_user_org_role(org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM organization_users
  WHERE organization_id = org_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper function to check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = org_id 
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;

-- Organizations policies
CREATE POLICY "Users can view organizations they belong to"
  ON public.organizations
  FOR SELECT
  USING (user_in_organization(id));

CREATE POLICY "Org admins can update their organization"
  ON public.organizations
  FOR UPDATE
  USING (is_org_admin(id));

CREATE POLICY "Authenticated users can create organizations"
  ON public.organizations
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Organization users policies
CREATE POLICY "Users can view members of their organizations"
  ON public.organization_users
  FOR SELECT
  USING (user_in_organization(organization_id));

CREATE POLICY "Org admins can add members"
  ON public.organization_users
  FOR INSERT
  WITH CHECK (is_org_admin(organization_id) OR 
    -- Allow self-insert when creating a new org (as owner)
    (auth.uid() = user_id AND role = 'owner')
  );

CREATE POLICY "Org admins can update member roles"
  ON public.organization_users
  FOR UPDATE
  USING (is_org_admin(organization_id));

CREATE POLICY "Org admins can remove members"
  ON public.organization_users
  FOR DELETE
  USING (is_org_admin(organization_id));

-- Add updated_at trigger
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create default organization for existing users
DO $$
DECLARE
  default_org_id UUID;
  existing_user RECORD;
BEGIN
  -- Check if any user exists without an organization
  IF EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    -- Create default organization if it doesn't exist
    INSERT INTO public.organizations (name, slug, subscription_tier, subscription_status)
    VALUES ('Default Organization', 'default-org', 'professional', 'active')
    ON CONFLICT (slug) DO UPDATE SET name = 'Default Organization'
    RETURNING id INTO default_org_id;
    
    -- Add all existing users to the default organization as owners
    FOR existing_user IN SELECT id FROM auth.users LOOP
      INSERT INTO public.organization_users (organization_id, user_id, role)
      VALUES (default_org_id, existing_user.id, 'owner')
      ON CONFLICT (organization_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
END $$;

COMMENT ON TABLE public.organizations IS 'Multi-tenant organizations for data isolation';
COMMENT ON TABLE public.organization_users IS 'Junction table linking users to organizations with roles';