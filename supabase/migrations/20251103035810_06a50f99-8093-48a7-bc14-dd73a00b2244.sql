-- ============================================
-- FIX FUNCTION SEARCH PATH
-- ============================================

-- Update the has_role function to ensure search_path is properly set
-- This fixes the "Function Search Path Mutable" security warning
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