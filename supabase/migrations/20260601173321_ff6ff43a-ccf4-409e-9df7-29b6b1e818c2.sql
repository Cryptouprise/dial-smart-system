
-- 1. guardian_alerts: remove public-readable policy and anonymous insert
DROP POLICY IF EXISTS "Service role can read all alerts" ON public.guardian_alerts;
DROP POLICY IF EXISTS "Allow anonymous guardian alerts" ON public.guardian_alerts;

-- 2. demo_sessions: add restrictive policy blocking authenticated user reads
CREATE POLICY "Block authenticated user reads of demo_sessions"
  ON public.demo_sessions
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING ((auth.jwt() ->> 'role') = 'service_role');

-- 3. marketing-assets bucket: remove anonymous upload
DROP POLICY IF EXISTS "Public upload for marketing assets" ON storage.objects;

-- 4. user_feature_flags: prevent privilege escalation; only service_role manages tier/flags
DROP POLICY IF EXISTS "Users can update own feature flags" ON public.user_feature_flags;
DROP POLICY IF EXISTS "Users can insert own feature flags" ON public.user_feature_flags;

-- 5. system_alerts: restrict INSERT to service_role
DROP POLICY IF EXISTS "System can insert alerts" ON public.system_alerts;
CREATE POLICY "Service role can insert alerts"
  ON public.system_alerts
  FOR INSERT
  TO public
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');

-- 6. calendar_tool_invocations: restrict INSERT to service_role or self
DROP POLICY IF EXISTS "System can insert calendar invocations" ON public.calendar_tool_invocations;
CREATE POLICY "Service role or self can insert calendar invocations"
  ON public.calendar_tool_invocations
  FOR INSERT
  TO public
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'service_role'
    OR auth.uid() = user_id
  );

-- 7. daily_reports: restrict INSERT/UPDATE to service_role
DROP POLICY IF EXISTS "Service role can insert reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Service role can update reports" ON public.daily_reports;
CREATE POLICY "Service role can insert reports"
  ON public.daily_reports
  FOR INSERT
  TO public
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
CREATE POLICY "Service role can update reports"
  ON public.daily_reports
  FOR UPDATE
  TO public
  USING ((auth.jwt() ->> 'role') = 'service_role')
  WITH CHECK ((auth.jwt() ->> 'role') = 'service_role');
