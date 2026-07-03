-- Slack operator bridge: maps Slack identities to app users so the
-- slack-webhook edge function can execute commands scoped to the right
-- account. One row per (team, slack user).
--
-- Applied to production via MCP on 2026-07-03 (version 20260703225037).
CREATE TABLE IF NOT EXISTS public.slack_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_team_id text NOT NULL,
  slack_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slack_team_id, slack_user_id)
);

ALTER TABLE public.slack_users ENABLE ROW LEVEL SECURITY;

-- Users manage only their own mapping. The slack-webhook function reads via
-- service role (bypasses RLS) after verifying the Slack signature.
DROP POLICY IF EXISTS "Users view their own slack mapping" ON public.slack_users;
DROP POLICY IF EXISTS "Users create their own slack mapping" ON public.slack_users;
DROP POLICY IF EXISTS "Users delete their own slack mapping" ON public.slack_users;
CREATE POLICY "Users view their own slack mapping"
  ON public.slack_users FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Users create their own slack mapping"
  ON public.slack_users FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users delete their own slack mapping"
  ON public.slack_users FOR DELETE TO authenticated
  USING (user_id = auth.uid());
