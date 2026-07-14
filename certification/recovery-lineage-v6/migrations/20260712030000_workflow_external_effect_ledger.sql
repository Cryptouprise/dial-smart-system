-- Durable, at-most-once boundary for workflow steps that create external effects.
-- Every entered step attempt receives a persisted UUID generation. Scheduler
-- retries and ordinary resume retain it; only entering another step/loop or an
-- audited confirmed-not-accepted resolution may rotate it.

ALTER TABLE public.lead_workflow_progress
  ADD COLUMN IF NOT EXISTS external_effect_generation uuid;

UPDATE public.lead_workflow_progress
SET external_effect_generation = gen_random_uuid()
WHERE external_effect_generation IS NULL;

ALTER TABLE public.lead_workflow_progress
  ALTER COLUMN external_effect_generation SET DEFAULT gen_random_uuid(),
  ALTER COLUMN external_effect_generation SET NOT NULL;

CREATE TABLE IF NOT EXISTS public.workflow_external_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_progress_id uuid NOT NULL REFERENCES public.lead_workflow_progress(id) ON DELETE CASCADE,
  workflow_id uuid NOT NULL REFERENCES public.campaign_workflows(id) ON DELETE RESTRICT,
  workflow_step_id uuid NOT NULL REFERENCES public.workflow_steps(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  loop_iteration integer NOT NULL DEFAULT 0 CHECK (loop_iteration >= 0),
  execution_generation uuid NOT NULL,
  effect_type text NOT NULL CHECK (
    effect_type IN ('call', 'sms', 'ai_sms', 'assistable_call', 'webhook')
  ),
  status text NOT NULL DEFAULT 'processing' CHECK (
    status IN ('processing', 'accepted', 'completed', 'reconciliation_required', 'resolved_not_accepted')
  ),
  provider_reference text,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_reason text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  reconciliation_required_at timestamptz,
  resolution_decision text CHECK (
    resolution_decision IS NULL OR resolution_decision IN ('confirmed_accepted', 'confirmed_not_accepted')
  ),
  resolution_notes text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_external_effects_execution_key
    UNIQUE (
      workflow_progress_id,
      workflow_step_id,
      loop_iteration,
      execution_generation,
      effect_type
    )
);

CREATE INDEX IF NOT EXISTS idx_workflow_external_effects_reconciliation
  ON public.workflow_external_effects (user_id, status, reconciliation_required_at)
  WHERE resolution_decision IS NULL
    AND status IN ('processing', 'accepted', 'reconciliation_required');

ALTER TABLE public.workflow_external_effects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their workflow external effects"
  ON public.workflow_external_effects;
CREATE POLICY "Users can view their workflow external effects"
  ON public.workflow_external_effects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- The executor calls this as service_role. Ownership, current step, loop, and
-- immutable generation are checked in the same transaction as the insert.
CREATE OR REPLACE FUNCTION public.claim_workflow_external_effect(
  p_user_id uuid,
  p_workflow_progress_id uuid,
  p_workflow_id uuid,
  p_workflow_step_id uuid,
  p_lead_id uuid,
  p_campaign_id uuid,
  p_loop_iteration integer,
  p_execution_generation uuid,
  p_effect_type text
)
RETURNS TABLE(effect_id uuid, claimed boolean, effect_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effect_id uuid;
BEGIN
  IF p_effect_type NOT IN ('call', 'sms', 'ai_sms', 'assistable_call', 'webhook') THEN
    RAISE EXCEPTION 'Unsupported workflow external effect type: %', p_effect_type;
  END IF;
  IF p_loop_iteration < 0 OR p_execution_generation IS NULL THEN
    RAISE EXCEPTION 'Workflow loop iteration and execution generation are required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lead_workflow_progress progress
    JOIN public.leads lead
      ON lead.id = progress.lead_id
     AND lead.user_id = progress.user_id
    JOIN public.campaign_workflows workflow
      ON workflow.id = progress.workflow_id
     AND workflow.user_id = progress.user_id
    JOIN public.workflow_steps step
      ON step.id = progress.current_step_id
     AND step.workflow_id = progress.workflow_id
    WHERE progress.id = p_workflow_progress_id
      AND progress.user_id = p_user_id
      AND progress.status = 'active'
      AND progress.workflow_id = p_workflow_id
      AND progress.current_step_id = p_workflow_step_id
      AND progress.lead_id = p_lead_id
      AND progress.campaign_id IS NOT DISTINCT FROM p_campaign_id
      AND COALESCE(progress.loop_count, 0) = p_loop_iteration
      AND progress.external_effect_generation = p_execution_generation
      AND (
        p_campaign_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.campaigns campaign
          WHERE campaign.id = p_campaign_id
            AND campaign.user_id = p_user_id
            AND campaign.workflow_id = p_workflow_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'Workflow external effect ownership, step, loop, or generation validation failed';
  END IF;

  INSERT INTO public.workflow_external_effects (
    user_id, workflow_progress_id, workflow_id, workflow_step_id, lead_id,
    campaign_id, loop_iteration, execution_generation, effect_type, status
  ) VALUES (
    p_user_id, p_workflow_progress_id, p_workflow_id, p_workflow_step_id,
    p_lead_id, p_campaign_id, p_loop_iteration, p_execution_generation,
    p_effect_type, 'processing'
  )
  ON CONFLICT ON CONSTRAINT workflow_external_effects_execution_key DO NOTHING
  RETURNING id INTO v_effect_id;

  IF v_effect_id IS NOT NULL THEN
    RETURN QUERY SELECT v_effect_id, true, 'processing'::text;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT existing.id, false, existing.status
  FROM public.workflow_external_effects existing
  WHERE existing.workflow_progress_id = p_workflow_progress_id
    AND existing.workflow_step_id = p_workflow_step_id
    AND existing.loop_iteration = p_loop_iteration
    AND existing.execution_generation = p_execution_generation
    AND existing.effect_type = p_effect_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_workflow_external_effect(
  p_effect_id uuid,
  p_target_status text,
  p_provider_reference text DEFAULT NULL,
  p_response_metadata jsonb DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  IF p_target_status NOT IN ('accepted', 'completed', 'reconciliation_required') THEN
    RAISE EXCEPTION 'Invalid workflow external effect transition target: %', p_target_status;
  END IF;

  UPDATE public.workflow_external_effects effect
  SET status = p_target_status,
      provider_reference = COALESCE(p_provider_reference, effect.provider_reference),
      response_metadata = COALESCE(p_response_metadata, effect.response_metadata),
      failure_reason = CASE
        WHEN p_target_status = 'reconciliation_required'
          THEN COALESCE(NULLIF(p_failure_reason, ''), 'Ambiguous external effect outcome')
        ELSE effect.failure_reason
      END,
      accepted_at = CASE
        WHEN p_target_status = 'accepted' THEN COALESCE(effect.accepted_at, now())
        ELSE effect.accepted_at
      END,
      completed_at = CASE
        WHEN p_target_status = 'completed' THEN COALESCE(effect.completed_at, now())
        ELSE effect.completed_at
      END,
      reconciliation_required_at = CASE
        WHEN p_target_status = 'reconciliation_required'
          THEN COALESCE(effect.reconciliation_required_at, now())
        ELSE effect.reconciliation_required_at
      END,
      updated_at = now()
  WHERE effect.id = p_effect_id
    AND effect.resolution_decision IS NULL
    AND (
      (effect.status = 'processing' AND p_target_status IN ('accepted', 'reconciliation_required'))
      OR (effect.status = 'accepted' AND p_target_status IN ('completed', 'reconciliation_required'))
      OR (effect.status = 'reconciliation_required' AND p_target_status = 'reconciliation_required')
    )
  RETURNING effect.id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;

-- Audited recovery. The caller cannot supply a next step or generation. The
-- function locks the effect/progress, derives the valid next step and timing,
-- and updates the effect plus progress atomically.
CREATE OR REPLACE FUNCTION public.resolve_workflow_external_effect(
  p_effect_id uuid,
  p_decision text,
  p_expected_user_id uuid,
  p_resolved_by uuid,
  p_resolution_notes text
)
RETURNS TABLE(
  effect_id uuid,
  workflow_progress_id uuid,
  resolution_decision text,
  progress_status text,
  next_step_id uuid,
  external_effect_generation uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effect public.workflow_external_effects%ROWTYPE;
  v_progress public.lead_workflow_progress%ROWTYPE;
  v_step public.workflow_steps%ROWTYPE;
  v_next_step public.workflow_steps%ROWTYPE;
  v_has_next boolean := false;
  v_loop_back integer;
  v_max_loop integer;
  v_next_loop integer;
  v_target_step_number integer;
  v_new_generation uuid := gen_random_uuid();
  v_next_action_at timestamptz;
  v_delay interval;
  v_time_of_day time;
BEGIN
  IF p_decision NOT IN ('confirmed_accepted', 'confirmed_not_accepted') THEN
    RAISE EXCEPTION 'Resolution decision must be confirmed_accepted or confirmed_not_accepted';
  END IF;
  IF NULLIF(btrim(p_resolution_notes), '') IS NULL THEN
    RAISE EXCEPTION 'Resolution notes are required';
  END IF;

  SELECT * INTO v_effect
  FROM public.workflow_external_effects
  WHERE id = p_effect_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Workflow external effect not found'; END IF;
  IF v_effect.resolution_decision IS NOT NULL THEN
    RAISE EXCEPTION 'Workflow external effect is already resolved';
  END IF;
  IF p_expected_user_id IS DISTINCT FROM v_effect.user_id THEN
    RAISE EXCEPTION 'Workflow external effect does not belong to the expected user';
  END IF;
  IF p_resolved_by IS DISTINCT FROM v_effect.user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles
       WHERE user_id = p_resolved_by AND role = 'admin'::public.app_role
     ) THEN
    RAISE EXCEPTION 'Resolver must be the owning workflow user or an audited administrator';
  END IF;
  IF v_effect.status NOT IN ('processing', 'accepted', 'completed', 'reconciliation_required') THEN
    RAISE EXCEPTION 'Workflow external effect status cannot be resolved: %', v_effect.status;
  END IF;

  SELECT * INTO v_progress
  FROM public.lead_workflow_progress
  WHERE id = v_effect.workflow_progress_id
    AND user_id = v_effect.user_id
    AND workflow_id = v_effect.workflow_id
    AND lead_id = v_effect.lead_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bound workflow progress not found'; END IF;
  IF v_progress.status <> 'paused' THEN
    RAISE EXCEPTION 'Workflow progress must be paused for effect resolution';
  END IF;

  SELECT * INTO v_step
  FROM public.workflow_steps
  WHERE id = v_effect.workflow_step_id
    AND workflow_id = v_effect.workflow_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bound workflow step not found'; END IF;

  v_loop_back := COALESCE(
    v_step.loop_back_to_step,
    NULLIF(v_step.step_config->>'loop_back_to_step', '')::integer
  );
  v_max_loop := COALESCE(
    v_step.max_loop_count,
    NULLIF(v_step.step_config->>'max_loop_count', '')::integer,
    0
  );
  v_next_loop := v_effect.loop_iteration;

  IF v_loop_back IS NOT NULL
     AND v_loop_back <> v_step.step_number
     AND (v_max_loop = -1 OR (v_max_loop > 0 AND v_effect.loop_iteration < v_max_loop)) THEN
    v_target_step_number := v_loop_back;
    v_next_loop := v_effect.loop_iteration + 1;
  ELSE
    v_target_step_number := v_step.step_number + 1;
    IF v_loop_back = v_step.step_number OR v_max_loop > 0 THEN v_next_loop := 0; END IF;
  END IF;

  SELECT * INTO v_next_step
  FROM public.workflow_steps
  WHERE workflow_id = v_effect.workflow_id
    AND step_number = v_target_step_number;
  v_has_next := FOUND;

  IF NOT v_has_next AND v_target_step_number <> v_step.step_number + 1 THEN
    SELECT * INTO v_next_step
    FROM public.workflow_steps
    WHERE workflow_id = v_effect.workflow_id
      AND step_number = v_step.step_number + 1;
    v_has_next := FOUND;
    v_next_loop := v_effect.loop_iteration;
  END IF;

  IF v_has_next THEN
    v_next_action_at := now();
    IF v_next_step.step_type = 'wait' THEN
      v_delay := make_interval(
        mins => COALESCE((v_next_step.step_config->>'delay_minutes')::integer, 0)
          + COALESCE((v_next_step.step_config->>'delay_hours')::integer, 0) * 60
          + COALESCE((v_next_step.step_config->>'delay_days')::integer, 0) * 1440
      );
      v_next_action_at := now() + v_delay;
      IF NULLIF(v_next_step.step_config->>'time_of_day', '') IS NOT NULL THEN
        v_time_of_day := (v_next_step.step_config->>'time_of_day')::time;
        v_next_action_at := date_trunc('day', v_next_action_at)::date + v_time_of_day;
        IF v_next_action_at <= now() THEN v_next_action_at := v_next_action_at + interval '1 day'; END IF;
      END IF;
    END IF;
  END IF;

  IF p_decision = 'confirmed_not_accepted' THEN
    IF v_progress.current_step_id IS DISTINCT FROM v_effect.workflow_step_id
       OR COALESCE(v_progress.loop_count, 0) <> v_effect.loop_iteration
       OR v_progress.external_effect_generation IS DISTINCT FROM v_effect.execution_generation THEN
      RAISE EXCEPTION 'Confirmed-not-accepted retry is no longer bound to the unresolved step generation';
    END IF;

    UPDATE public.workflow_external_effects
    SET status = 'resolved_not_accepted',
        resolution_decision = p_decision,
        resolution_notes = p_resolution_notes,
        resolved_at = now(),
        resolved_by = p_resolved_by,
        updated_at = now()
    WHERE id = v_effect.id;

    UPDATE public.lead_workflow_progress
    SET status = 'active',
        next_action_at = now(),
        external_effect_generation = v_new_generation,
        metadata = COALESCE(metadata, '{}'::jsonb)
          - 'manual_reconciliation_required' - 'reconciliation_effect_id'
          - 'reconciliation_effect_status' - 'reconciliation_step_id'
          - 'reconciliation_reason' - 'reconciliation_required_at' - 'recovery',
        updated_at = now()
    WHERE id = v_progress.id;
  ELSE
    IF (
      v_progress.current_step_id IS DISTINCT FROM v_effect.workflow_step_id
      OR COALESCE(v_progress.loop_count, 0) <> v_effect.loop_iteration
      OR v_progress.external_effect_generation IS DISTINCT FROM v_effect.execution_generation
    ) THEN
      RAISE EXCEPTION 'Confirmed-accepted resolution is no longer bound to the unresolved step generation';
    END IF;

    UPDATE public.workflow_external_effects
    SET status = 'completed',
        accepted_at = COALESCE(accepted_at, now()),
        completed_at = COALESCE(completed_at, now()),
        resolution_decision = p_decision,
        resolution_notes = p_resolution_notes,
        resolved_at = now(),
        resolved_by = p_resolved_by,
        updated_at = now()
    WHERE id = v_effect.id;

    IF v_has_next THEN
      UPDATE public.lead_workflow_progress AS progress_update
      SET current_step_id = v_next_step.id,
          loop_count = v_next_loop,
          status = 'active',
          next_action_at = v_next_action_at,
          external_effect_generation = v_new_generation,
          metadata = COALESCE(metadata, '{}'::jsonb)
            - 'manual_reconciliation_required' - 'reconciliation_effect_id'
            - 'reconciliation_effect_status' - 'reconciliation_step_id'
            - 'reconciliation_reason' - 'reconciliation_required_at' - 'recovery',
          updated_at = now()
      WHERE id = v_progress.id;
    ELSE
      UPDATE public.lead_workflow_progress
      SET status = 'completed',
          completed_at = COALESCE(completed_at, now()),
          next_action_at = NULL,
          metadata = COALESCE(metadata, '{}'::jsonb)
            - 'manual_reconciliation_required' - 'reconciliation_effect_id'
            - 'reconciliation_effect_status' - 'reconciliation_step_id'
            - 'reconciliation_reason' - 'reconciliation_required_at' - 'recovery',
          updated_at = now()
      WHERE id = v_progress.id;
    END IF;
  END IF;

  RETURN QUERY
  SELECT effect.id, progress.id, p_decision, progress.status,
    CASE WHEN progress.status = 'completed' THEN NULL::uuid ELSE progress.current_step_id END,
    progress.external_effect_generation
  FROM public.workflow_external_effects effect
  JOIN public.lead_workflow_progress progress ON progress.id = effect.workflow_progress_id
  WHERE effect.id = v_effect.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workflow_external_effect(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, uuid, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_workflow_external_effect(
  uuid, text, text, jsonb, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_workflow_external_effect(
  uuid, text, uuid, uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workflow_external_effect(
  uuid, uuid, uuid, uuid, uuid, uuid, integer, uuid, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_workflow_external_effect(
  uuid, text, text, jsonb, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_workflow_external_effect(
  uuid, text, uuid, uuid, text
) TO service_role;

COMMENT ON TABLE public.workflow_external_effects IS
  'At-most-once workflow effect ledger. Uncertain effects remain blocked until an audited service-role resolution atomically advances or authorizes exactly one fresh generation.';
