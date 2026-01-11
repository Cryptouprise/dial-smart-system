-- Add RLS policies for guardian_alerts table
-- Users can only see and manage their own alerts

CREATE POLICY "Users can view own guardian alerts"
ON guardian_alerts FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert own guardian alerts"
ON guardian_alerts FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own guardian alerts"
ON guardian_alerts FOR UPDATE TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own guardian alerts"
ON guardian_alerts FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Create cleanup function for old resolved alerts (older than 30 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_guardian_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM guardian_alerts 
  WHERE status = 'resolved' 
    AND detected_at < NOW() - INTERVAL '30 days';
END;
$$;