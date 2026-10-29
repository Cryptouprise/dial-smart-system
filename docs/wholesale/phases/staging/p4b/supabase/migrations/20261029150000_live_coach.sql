-- ============================================================================
-- P4b: Live AI coach - proposals, per-company learning, RLS.
--
-- Ordering: sorts AFTER 20261029142121_phase1_org_scope.sql (dispositions /
-- pipeline_boards / lead_pipeline_positions.organization_id) and AFTER the P4a
-- browser-phone migration 20261029020000 (call_live_transcripts + its Realtime
-- publication + REPLICA IDENTITY). This file does NOT create or alter
-- call_live_transcripts and does NOT touch the Realtime publication.
--
-- House rules applied: no BEGIN/COMMIT; user_in_organization(org_id) has ONE
-- argument; every SECURITY DEFINER function pins search_path, checks membership
-- explicitly (auth.uid() IS NULL is rejected unless current_user is
-- service_role/postgres) and is revoked from PUBLIC/anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Preconditions: fail loudly instead of shipping a coach that errors at
--    runtime. Nothing here creates or changes the referenced objects.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.call_live_transcripts') IS NULL THEN
    RAISE EXCEPTION 'public.call_live_transcripts is missing: apply the P4a browser-phone migration first';
  END IF;
  IF to_regprocedure('public.merge_custom_fields(uuid, jsonb)') IS NULL THEN
    RAISE EXCEPTION 'public.merge_custom_fields(uuid, jsonb) is missing: coach-decide field_fill depends on it';
  END IF;
  IF to_regprocedure('public.user_in_organization(uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.user_in_organization(uuid) is missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pipeline_boards' AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION 'pipeline_boards.organization_id is missing: apply 20261029142121_phase1_org_scope.sql first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. coach_proposals
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coach_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  call_log_id uuid NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  batch_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  transcript_through_seq integer NOT NULL DEFAULT 0,
  kind text NOT NULL CHECK (kind IN ('say_next','disposition','stage','next_action','field_fill')),
  proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  latency_ms integer,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','corrected','dismissed','expired')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  chosen jsonb
);

CREATE INDEX IF NOT EXISTS idx_coach_proposals_call_log
  ON public.coach_proposals(call_log_id);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_org_created
  ON public.coach_proposals(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_org_kind_status
  ON public.coach_proposals(organization_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_batch
  ON public.coach_proposals(batch_id);
CREATE INDEX IF NOT EXISTS idx_coach_proposals_call_seq
  ON public.coach_proposals(call_log_id, transcript_through_seq);

ALTER TABLE public.coach_proposals ENABLE ROW LEVEL SECURITY;

-- Select: any member of the company.
DROP POLICY IF EXISTS "Members view their tenant coach proposals" ON public.coach_proposals;
CREATE POLICY "Members view their tenant coach proposals"
  ON public.coach_proposals FOR SELECT TO authenticated
  USING (public.user_in_organization(organization_id));

-- Update: members of the company. WHICH columns they may change is enforced by
-- the column-level GRANT below plus the decide-guard trigger.
DROP POLICY IF EXISTS "Members decide their tenant coach proposals" ON public.coach_proposals;
CREATE POLICY "Members decide their tenant coach proposals"
  ON public.coach_proposals FOR UPDATE TO authenticated
  USING (public.user_in_organization(organization_id))
  WITH CHECK (public.user_in_organization(organization_id));

-- Insert: service_role only (coach-suggest). No authenticated INSERT policy.
DROP POLICY IF EXISTS "Service role inserts coach proposals" ON public.coach_proposals;
CREATE POLICY "Service role inserts coach proposals"
  ON public.coach_proposals FOR INSERT TO service_role
  WITH CHECK (true);

-- Privileges: authenticated may SELECT and UPDATE only the four decision
-- columns. No INSERT/DELETE for the browser. service_role has full access.
REVOKE ALL ON TABLE public.coach_proposals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.coach_proposals TO authenticated;
GRANT UPDATE (status, decided_by, decided_at, chosen)
  ON TABLE public.coach_proposals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.coach_proposals TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Decide-guard trigger.
--    * Nobody may change a column other than status/decided_by/decided_at/chosen
--      through UPDATE (service_role included; proposals are append-only facts).
--    * Browser roles (authenticated/anon) may only move a PENDING row to
--      accepted/corrected/dismissed, and decided_by is forced to auth.uid().
--    * service_role/postgres (coach-suggest expiring old batches, coach-decide
--      recording the caller's id) keep the values they write.
--    SECURITY INVOKER on purpose: inside a SECURITY DEFINER function
--    current_user is the function OWNER (postgres), so a role test there can
--    never see 'authenticated'. This trigger reads only NEW/OLD and auth.uid(),
--    which need no elevated privilege.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_proposal_decide_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.call_log_id IS DISTINCT FROM OLD.call_log_id
    OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.transcript_through_seq IS DISTINCT FROM OLD.transcript_through_seq
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.proposal IS DISTINCT FROM OLD.proposal
    OR NEW.confidence IS DISTINCT FROM OLD.confidence
    OR NEW.model IS DISTINCT FROM OLD.model
    OR NEW.prompt_tokens IS DISTINCT FROM OLD.prompt_tokens
    OR NEW.completion_tokens IS DISTINCT FROM OLD.completion_tokens
    OR NEW.latency_ms IS DISTINCT FROM OLD.latency_ms
  THEN
    RAISE EXCEPTION 'COACH_PROPOSAL_IMMUTABLE_COLUMNS'
      USING ERRCODE = '42501',
            DETAIL = 'Only status, decided_by, decided_at and chosen may change.';
  END IF;

  IF current_user IN ('authenticated', 'anon') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'COACH_PROPOSAL_ALREADY_DECIDED'
        USING ERRCODE = '42501', DETAIL = format('Proposal is already %s.', OLD.status);
    END IF;
    IF NEW.status NOT IN ('accepted', 'corrected', 'dismissed') THEN
      RAISE EXCEPTION 'COACH_PROPOSAL_BAD_DECISION'
        USING ERRCODE = '42501', DETAIL = 'Browser decisions may only be accepted, corrected or dismissed.';
    END IF;
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_proposal_decide_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS coach_proposal_decide_guard ON public.coach_proposals;
CREATE TRIGGER coach_proposal_decide_guard
  BEFORE UPDATE ON public.coach_proposals
  FOR EACH ROW EXECUTE FUNCTION public.coach_proposal_decide_guard();

-- ---------------------------------------------------------------------------
-- 3. coach_recent_corrections(p_org_id, p_kind, p_limit)
--    Last N (<= 12) corrected/accepted proposals for one company and kind with
--    a 400-char transcript snippet (final lines up to transcript_through_seq).
--    Few-shot source for the next prompt of that company.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_recent_corrections(
  p_org_id uuid,
  p_kind text,
  p_limit integer DEFAULT 12
)
RETURNS TABLE (
  proposal_id uuid,
  kind text,
  proposal jsonb,
  chosen jsonb,
  status text,
  transcript_snippet text,
  created_at timestamptz,
  decided_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_limit integer;
  v_role  text;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('say_next','disposition','stage','next_action','field_fill') THEN
    RAISE EXCEPTION 'p_kind must be one of say_next, disposition, stage, next_action, field_fill'
      USING ERRCODE = '22023';
  END IF;

  -- Membership: edge functions (service_role) and migrations/tests (postgres)
  -- are exempt; every other caller must be a signed-in member of the company.
  -- The caller's role comes from the JWT claim (auth.role()), NOT current_user:
  -- inside a SECURITY DEFINER body current_user is the owner (postgres).
  v_role := COALESCE(auth.role(), session_user::text);
  IF v_role NOT IN ('service_role', 'postgres') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.user_in_organization(p_org_id) THEN
      RAISE EXCEPTION 'not a member of organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 12), 1), 12);

  RETURN QUERY
  SELECT
    cp.id,
    cp.kind,
    cp.proposal,
    cp.chosen,
    cp.status,
    LEFT(
      COALESCE(
        (
          SELECT string_agg(t.speaker || ': ' || t.text, E'\n' ORDER BY t.seq)
          FROM public.call_live_transcripts AS t
          WHERE t.call_log_id = cp.call_log_id
            AND t.organization_id = cp.organization_id
            AND t.seq <= cp.transcript_through_seq
            AND t.is_final = true
        ),
        ''
      ),
      400
    ) AS transcript_snippet,
    cp.created_at,
    cp.decided_at
  FROM public.coach_proposals AS cp
  WHERE cp.organization_id = p_org_id
    AND cp.kind = p_kind
    AND cp.status IN ('corrected', 'accepted')
  ORDER BY cp.decided_at DESC NULLS LAST, cp.created_at DESC
  LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_recent_corrections(uuid, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.coach_recent_corrections(uuid, text, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. coach_move_stage(p_lead_id, p_org_id, p_board_id)
--    Atomic delete+insert of the lead's pipeline position (boards act as
--    stages; one position row per lead per owner, unique (lead_id, user_id)).
--    Company-scoped: the lead must belong to p_org_id and the board must belong
--    to p_org_id OR (organization_id IS NULL AND user_id = lead owner) while
--    rows are being backfilled. service_role only: the browser never moves a
--    lead directly; it goes through coach-decide.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.coach_move_stage(
  p_lead_id uuid,
  p_org_id uuid,
  p_board_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_lead_org   uuid;
  v_lead_user  uuid;
  v_board_name text;
  v_role       text;
BEGIN
  IF p_lead_id IS NULL OR p_org_id IS NULL OR p_board_id IS NULL THEN
    RAISE EXCEPTION 'p_lead_id, p_org_id and p_board_id are required' USING ERRCODE = '22023';
  END IF;

  -- Role from the JWT claim, not current_user (see coach_recent_corrections).
  v_role := COALESCE(auth.role(), session_user::text);
  IF v_role NOT IN ('service_role', 'postgres') THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
    END IF;
    IF NOT public.user_in_organization(p_org_id) THEN
      RAISE EXCEPTION 'not a member of organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT l.organization_id, l.user_id INTO v_lead_org, v_lead_user
    FROM public.leads AS l WHERE l.id = p_lead_id;
  IF v_lead_org IS NULL OR v_lead_org IS DISTINCT FROM p_org_id THEN
    RAISE EXCEPTION 'lead not in organization' USING ERRCODE = '42501';
  END IF;

  SELECT b.name INTO v_board_name
    FROM public.pipeline_boards AS b
   WHERE b.id = p_board_id
     AND (b.organization_id = p_org_id
          OR (b.organization_id IS NULL AND b.user_id = v_lead_user));
  IF v_board_name IS NULL THEN
    RAISE EXCEPTION 'board not in organization' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.lead_pipeline_positions AS p
   WHERE p.lead_id = p_lead_id
     AND (p.organization_id = p_org_id OR p.organization_id IS NULL);

  INSERT INTO public.lead_pipeline_positions (
    user_id, organization_id, lead_id, pipeline_board_id, position,
    moved_at, moved_by_user, notes
  ) VALUES (
    v_lead_user, p_org_id, p_lead_id, p_board_id, 0,
    now(), true, 'Moved by live coach (rep accepted)'
  );

  RETURN jsonb_build_object('board_id', p_board_id, 'board_name', v_board_name);
END;
$$;

REVOKE ALL ON FUNCTION public.coach_move_stage(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coach_move_stage(uuid, uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Comments
-- ---------------------------------------------------------------------------
COMMENT ON TABLE public.coach_proposals IS
  'Live AI coach proposals (one row per kind per batch) and the rep''s decision. Per-company learning source. Inserted by coach-suggest (service_role); decided through coach-decide or the four decision columns only.';
COMMENT ON COLUMN public.coach_proposals.batch_id IS
  'Groups the 5 kinds produced by one coach-suggest call. Also mirrored in proposal->>''batch_id''.';
COMMENT ON FUNCTION public.coach_recent_corrections(uuid, text, integer) IS
  'Last N (<=12) corrected/accepted coach proposals for one company and kind with a 400-char transcript snippet. Membership-checked; service_role exempt.';
COMMENT ON FUNCTION public.coach_move_stage(uuid, uuid, uuid) IS
  'Atomic company-scoped move of a lead to a pipeline board (delete+insert of lead_pipeline_positions). service_role only; called by coach-decide.';
COMMENT ON FUNCTION public.coach_proposal_decide_guard() IS
  'BEFORE UPDATE guard on coach_proposals: only decision columns may change; browser roles may only decide a pending row and decided_by is forced to auth.uid().';
