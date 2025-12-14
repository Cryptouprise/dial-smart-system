-- ============================================
-- CRITICAL SECURITY FIXES - MIGRATION
-- ============================================

-- 1. ADD USER OWNERSHIP TO PHONE NUMBERS TABLE
-- ============================================
ALTER TABLE phone_numbers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Set existing phone numbers to first user (temporary - you should update these manually)
UPDATE phone_numbers SET user_id = (SELECT id FROM auth.users LIMIT 1) WHERE user_id IS NULL;

-- Make user_id required going forward
ALTER TABLE phone_numbers ALTER COLUMN user_id SET NOT NULL;

-- Drop the insecure public access policies
DROP POLICY IF EXISTS "Authenticated users can view all phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Authenticated users can update phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Authenticated users can insert phone numbers" ON phone_numbers;
DROP POLICY IF EXISTS "Authenticated users can delete phone numbers" ON phone_numbers;

-- Create secure policies that check ownership
CREATE POLICY "Users can view their own phone numbers"
ON phone_numbers FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own phone numbers"
ON phone_numbers FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own phone numbers"
ON phone_numbers FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own phone numbers"
ON phone_numbers FOR DELETE
USING (auth.uid() = user_id);

-- 2. CREATE ROLE-BASED ACCESS CONTROL SYSTEM
-- ============================================
CREATE TYPE app_role AS ENUM ('admin', 'manager', 'user');

CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can view their own roles
CREATE POLICY "Users can view their own roles"
ON user_roles FOR SELECT
USING (auth.uid() = user_id);

-- Only admins can manage roles (we'll enforce this in edge functions)
CREATE POLICY "Service role can manage roles"
ON user_roles FOR ALL
USING (auth.jwt()->>'role' = 'service_role');

-- Create helper function to check user roles
CREATE OR REPLACE FUNCTION has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Make the first user an admin (you can change this later)
INSERT INTO user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM auth.users LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;

-- 3. SECURE SYSTEM HEALTH LOGS
-- ============================================
DROP POLICY IF EXISTS "Anyone can view system health logs" ON system_health_logs;
DROP POLICY IF EXISTS "System can insert health logs" ON system_health_logs;

-- Only admins can view system health logs
CREATE POLICY "Admins can view system health logs"
ON system_health_logs FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Service role can insert (for automated monitoring)
CREATE POLICY "Service role can insert health logs"
ON system_health_logs FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- 4. CREATE SECURE CREDENTIALS STORAGE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  service_name TEXT NOT NULL,
  credential_key TEXT NOT NULL,
  credential_value_encrypted TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, service_name, credential_key)
);

-- Enable RLS
ALTER TABLE user_credentials ENABLE ROW LEVEL SECURITY;

-- Users can only access their own credentials
CREATE POLICY "Users can view their own credentials"
ON user_credentials FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credentials"
ON user_credentials FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own credentials"
ON user_credentials FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own credentials"
ON user_credentials FOR DELETE
USING (auth.uid() = user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_credentials_updated_at
BEFORE UPDATE ON user_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 5. TIGHTEN CAMPAIGN/LEAD ACCESS CONTROLS
-- ============================================
-- Drop and recreate dialing_queues policy with stricter checks
DROP POLICY IF EXISTS "Users can manage dialing queues for their campaigns" ON dialing_queues;

CREATE POLICY "Users can manage their campaign queues"
ON dialing_queues FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM campaigns 
    WHERE campaigns.id = dialing_queues.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM leads
    WHERE leads.id = dialing_queues.lead_id
    AND leads.user_id = auth.uid()
  )
);

-- Ensure campaign_leads can only be added by campaign owners for their own leads
DROP POLICY IF EXISTS "Users can manage campaign leads" ON campaign_leads;

CREATE POLICY "Users can view their campaign leads"
ON campaign_leads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM campaigns 
    WHERE campaigns.id = campaign_leads.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Users can add their own leads to their campaigns"
ON campaign_leads FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM campaigns 
    WHERE campaigns.id = campaign_leads.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1 FROM leads
    WHERE leads.id = campaign_leads.lead_id
    AND leads.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update their campaign leads"
ON campaign_leads FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM campaigns 
    WHERE campaigns.id = campaign_leads.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

CREATE POLICY "Users can remove their campaign leads"
ON campaign_leads FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM campaigns 
    WHERE campaigns.id = campaign_leads.campaign_id 
    AND campaigns.user_id = auth.uid()
  )
);

-- 6. ADD VERIFICATION CONSTRAINT TO ROTATION_HISTORY
-- ============================================
-- Ensure user_id is always set (it already has NOT NULL, but add check constraint)
ALTER TABLE rotation_history DROP CONSTRAINT IF EXISTS rotation_history_user_id_check;
ALTER TABLE rotation_history ADD CONSTRAINT rotation_history_user_id_check 
CHECK (user_id IS NOT NULL);