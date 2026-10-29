-- ============================================================================
-- Browser phone (P4a): per-user provider credentials, live transcript lines,
-- Twilio provider-call-id column, atomic transcript append.
--
-- Timestamp is AFTER 20261029142121_phase1_org_scope.sql (already applied live)
-- so `supabase db push` applies it as a pending migration without --include-all.
-- No BEGIN/COMMIT (house rule). Idempotent: safe to re-run.
-- Depends on live objects: organizations, call_logs, organization_users,
-- public.user_in_organization(uuid) (ONE argument), publication supabase_realtime.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. call_logs.provider_call_id: Twilio CallSid (house rule). Telnyx keeps
--    using telnyx_call_control_id. caller_id (live) is the from-number column,
--    so no from_number column is added.
-- ----------------------------------------------------------------------------
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS provider_call_id text;

CREATE INDEX IF NOT EXISTS idx_call_logs_provider_call_id
  ON public.call_logs(provider_call_id)
  WHERE provider_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_telnyx_call_control_id
  ON public.call_logs(telnyx_call_control_id)
  WHERE telnyx_call_control_id IS NOT NULL;

COMMENT ON COLUMN public.call_logs.provider_call_id IS
  'Provider call id for non-Telnyx providers (Twilio CallSid of the parent/browser call). Telnyx uses telnyx_call_control_id.';

-- ----------------------------------------------------------------------------
-- 2. voice_credentials: one provider credential per (user, provider).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.voice_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('telnyx', 'twilio')),
  provider_credential_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_voice_credentials_organization_id
  ON public.voice_credentials(organization_id);

ALTER TABLE public.voice_credentials ENABLE ROW LEVEL SECURITY;

-- Read: company members, but only their own credential row (the id names a
-- provider object; nobody needs a teammate's). Writes: service_role only.
DROP POLICY IF EXISTS "Users view their own voice credentials" ON public.voice_credentials;
DROP POLICY IF EXISTS "Members view their own voice credentials" ON public.voice_credentials;
CREATE POLICY "Members view their own voice credentials"
  ON public.voice_credentials FOR SELECT TO authenticated
  USING (public.user_in_organization(organization_id) AND user_id = auth.uid());

REVOKE ALL ON TABLE public.voice_credentials FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.voice_credentials FROM authenticated;
GRANT SELECT ON TABLE public.voice_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.voice_credentials TO service_role;

COMMENT ON TABLE public.voice_credentials IS
  'Per-user browser-phone provider credentials (Telnyx telephony credential id). Written by edge functions only.';

-- ----------------------------------------------------------------------------
-- 3. call_live_transcripts: live transcript lines the coach reads via Realtime.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_live_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  seq integer NOT NULL,
  speaker text NOT NULL CHECK (speaker IN ('rep', 'contact', 'unknown')),
  text text NOT NULL,
  is_final boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (call_log_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_call_live_transcripts_call_seq
  ON public.call_live_transcripts(call_log_id, seq);

CREATE INDEX IF NOT EXISTS idx_call_live_transcripts_organization_id
  ON public.call_live_transcripts(organization_id);

ALTER TABLE public.call_live_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_live_transcripts REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Members view their tenant live transcripts" ON public.call_live_transcripts;
DROP POLICY IF EXISTS "Company members can view live transcripts" ON public.call_live_transcripts;
CREATE POLICY "Company members can view live transcripts"
  ON public.call_live_transcripts FOR SELECT TO authenticated
  USING (public.user_in_organization(organization_id));

-- No INSERT/UPDATE/DELETE policy for authenticated: webhooks write via service_role.
REVOKE ALL ON TABLE public.call_live_transcripts FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.call_live_transcripts FROM authenticated;
GRANT SELECT ON TABLE public.call_live_transcripts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.call_live_transcripts TO service_role;

COMMENT ON TABLE public.call_live_transcripts IS
  'Live transcript lines for browser-phone calls; written by webhooks (service_role), read by the coach via Realtime.';

-- Realtime publication (guarded; REPLICA IDENTITY FULL set above).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'call_live_transcripts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.call_live_transcripts;
  END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. append_call_live_transcript: atomic per-call sequence number.
--    Concurrent webhook deliveries (Twilio and Telnyx both fan out) would race
--    a SELECT max(seq)+1 / INSERT pair; the transaction-scoped advisory lock
--    serialises appends per call. SECURITY DEFINER, search_path pinned,
--    service_role only (house rule).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_call_live_transcript(
  p_call_log_id uuid,
  p_organization_id uuid,
  p_speaker text,
  p_text text,
  p_is_final boolean,
  p_at timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_seq integer;
  v_text text := btrim(coalesce(p_text, ''));
BEGIN
  IF p_call_log_id IS NULL OR p_organization_id IS NULL THEN
    RAISE EXCEPTION 'call_log_id and organization_id are required' USING ERRCODE = '22023';
  END IF;
  IF v_text = '' THEN
    RAISE EXCEPTION 'transcript text is required' USING ERRCODE = '22023';
  END IF;
  IF p_speaker IS NULL OR p_speaker NOT IN ('rep', 'contact', 'unknown') THEN
    RAISE EXCEPTION 'speaker must be rep, contact or unknown' USING ERRCODE = '22023';
  END IF;
  -- The line may only be attached to a call that belongs to the stated company.
  IF NOT EXISTS (
    SELECT 1 FROM public.call_logs cl
    WHERE cl.id = p_call_log_id AND cl.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'call_log % does not belong to organization %', p_call_log_id, p_organization_id
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('call_live_transcripts:' || p_call_log_id::text));

  SELECT coalesce(max(t.seq), 0) + 1
    INTO v_seq
    FROM public.call_live_transcripts t
   WHERE t.call_log_id = p_call_log_id;

  INSERT INTO public.call_live_transcripts (call_log_id, organization_id, seq, speaker, text, is_final, at)
  VALUES (p_call_log_id, p_organization_id, v_seq, p_speaker, left(v_text, 8000), coalesce(p_is_final, false), coalesce(p_at, now()));

  RETURN v_seq;
END;
$function$;

REVOKE ALL ON FUNCTION public.append_call_live_transcript(uuid, uuid, text, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_call_live_transcript(uuid, uuid, text, text, boolean, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.append_call_live_transcript(uuid, uuid, text, text, boolean, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.append_call_live_transcript(uuid, uuid, text, text, boolean, timestamptz) TO service_role;

COMMENT ON FUNCTION public.append_call_live_transcript(uuid, uuid, text, text, boolean, timestamptz) IS
  'Service-role only. Appends one live transcript line with the next per-call seq (advisory-locked). Verifies the call belongs to the given organization.';
