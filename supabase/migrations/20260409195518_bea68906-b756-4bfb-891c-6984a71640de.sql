-- Fix 1: retell_transfer_context - restrict service role policy
DROP POLICY IF EXISTS "Service role full access" ON retell_transfer_context;
CREATE POLICY "Service role full access" ON retell_transfer_context
  FOR ALL TO public
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- Fix 2: demo_sessions - restrict service role policy
DROP POLICY IF EXISTS "Service role full access" ON demo_sessions;
CREATE POLICY "Service role full access" ON demo_sessions
  FOR ALL TO public
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- Fix 3: ghl_pending_updates - restrict service role policy
DROP POLICY IF EXISTS "Service role full access to ghl_pending_updates" ON ghl_pending_updates;
CREATE POLICY "Service role full access to ghl_pending_updates" ON ghl_pending_updates
  FOR ALL TO public
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');