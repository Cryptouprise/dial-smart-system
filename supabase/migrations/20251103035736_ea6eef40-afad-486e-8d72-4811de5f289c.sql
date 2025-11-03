-- ============================================
-- FIX REMAINING CODE-BASED SECURITY ISSUES
-- ============================================

-- 1. Fix rotation_history INSERT policy
-- Current policy allows ANY authenticated user to insert
-- This should only allow service role (for system-generated logs)
DROP POLICY IF EXISTS "System can insert rotation history" ON rotation_history;

CREATE POLICY "Service role can insert rotation history"
ON rotation_history FOR INSERT
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Also allow users to insert their own rotation history through edge functions
-- that properly set the user_id
CREATE POLICY "Users can insert their own rotation history"
ON rotation_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 2. Update the has_role function to ensure search_path is set
-- Use CREATE OR REPLACE to avoid dependency issues
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