BEGIN;

-- A supervised self-test is a tenant-bound state machine. It is not a
-- campaign queue and no function in this migration makes a provider request.

CREATE TABLE public.elite_solar_supervised_test_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  caller_phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE RESTRICT,
  engaged_pipeline_board_id uuid NOT NULL REFERENCES public.pipeline_boards(id) ON DELETE RESTRICT,
  dnc_pipeline_board_id uuid NOT NULL REFERENCES public.pipeline_boards(id) ON DELETE RESTRICT,
  plan_id text NOT NULL CHECK (plan_id = 'elite_solar_self_test_v1'),
  plan_version text NOT NULL CHECK (plan_version = '2026-07-26'),
  telnyx_messaging_profile_id text NOT NULL CHECK (telnyx_messaging_profile_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  retell_agent_id text NOT NULL CHECK (retell_agent_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  retell_agent_version integer NOT NULL CHECK (retell_agent_version BETWEEN 0 AND 1000000),
  retell_webhook_url text NOT NULL CHECK (retell_webhook_url ~ '^https://[A-Za-z0-9.-]{1,253}/functions/v1/elite-solar-supervised-retell-webhook$'),
  sms_step_1_body text NOT NULL CHECK (length(btrim(sms_step_1_body)) BETWEEN 1 AND 1500),
  sms_step_2_body text NOT NULL CHECK (length(btrim(sms_step_2_body)) BETWEEN 1 AND 1500),
  sms_step_3_body text NOT NULL CHECK (length(btrim(sms_step_3_body)) BETWEEN 1 AND 1500),
  consent_evidence_sha256 text NOT NULL CHECK (consent_evidence_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (engaged_pipeline_board_id <> dnc_pipeline_board_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_reason_code text CHECK (revoked_reason_code IS NULL OR revoked_reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX elite_solar_supervised_test_targets_one_active_identity ON public.elite_solar_supervised_test_targets (organization_id, owner_user_id, campaign_id, plan_id, plan_version) WHERE revoked_at IS NULL;

CREATE TABLE public.elite_solar_supervised_test_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_id uuid NOT NULL UNIQUE REFERENCES public.elite_solar_supervised_test_targets(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  caller_phone_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE RESTRICT,
  from_e164 text NOT NULL CHECK (from_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  to_e164 text NOT NULL CHECK (to_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  plan_id text NOT NULL CHECK (plan_id = 'elite_solar_self_test_v1'),
  plan_version text NOT NULL CHECK (plan_version = '2026-07-26'),
  stop_on_first_inbound_reply boolean NOT NULL DEFAULT true CHECK (stop_on_first_inbound_reply),
  inbound_reply_outcome text NOT NULL DEFAULT 'halt_and_human_handoff' CHECK (inbound_reply_outcome = 'halt_and_human_handoff'),
  status text NOT NULL DEFAULT 'armed' CHECK (status IN ('armed', 'dispatching', 'awaiting_reply', 'engaged', 'completed', 'cancelled', 'held', 'reconciliation_required')),
  current_step_ordinal smallint NOT NULL DEFAULT 0 CHECK (current_step_ordinal BETWEEN 0 AND 4),
  stop_requested boolean NOT NULL DEFAULT false,
  provider_reconciliation_required boolean NOT NULL DEFAULT false,
  terminal_reason_code text CHECK (terminal_reason_code IS NULL OR terminal_reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  armed_at timestamptz NOT NULL DEFAULT now(),
  first_reply_received_at timestamptz,
  first_inbound_receipt_id uuid,
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX elite_solar_supervised_test_runs_lookup_idx ON public.elite_solar_supervised_test_runs (organization_id, owner_user_id, campaign_id, status, armed_at DESC);

CREATE TABLE public.elite_solar_supervised_test_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.elite_solar_supervised_test_runs(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  ordinal smallint NOT NULL CHECK (ordinal BETWEEN 1 AND 4),
  provider text NOT NULL CHECK (provider IN ('telnyx', 'retell')),
  channel text NOT NULL CHECK (channel IN ('sms', 'voice')),
  simulated_elapsed_minutes integer NOT NULL CHECK (simulated_elapsed_minutes IN (0, 240, 480, 1440)),
  compressed_offset_seconds integer NOT NULL CHECK (compressed_offset_seconds IN (0, 300, 600, 900)),
  simulation_label text NOT NULL,
  not_before_at timestamptz NOT NULL,
  message_body text,
  retell_agent_id text,
  retell_agent_version integer,
  retell_webhook_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'authorized', 'claimed', 'accepted', 'definite_failure', 'acceptance_unknown', 'cancelled')),
  claimed_at timestamptz,
  accepted_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason_code text CHECK (cancellation_reason_code IS NULL OR cancellation_reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, ordinal),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (ordinal = 1 AND provider = 'telnyx' AND channel = 'sms' AND simulated_elapsed_minutes = 0 AND compressed_offset_seconds = 0 AND simulation_label = '[SIMULATED T+0]' AND message_body IS NOT NULL AND retell_agent_id IS NULL AND retell_agent_version IS NULL AND retell_webhook_url IS NULL)
    OR (ordinal = 2 AND provider = 'telnyx' AND channel = 'sms' AND simulated_elapsed_minutes = 240 AND compressed_offset_seconds = 300 AND simulation_label = '[SIMULATED T+4H]' AND message_body IS NOT NULL AND retell_agent_id IS NULL AND retell_agent_version IS NULL AND retell_webhook_url IS NULL)
    OR (ordinal = 3 AND provider = 'telnyx' AND channel = 'sms' AND simulated_elapsed_minutes = 480 AND compressed_offset_seconds = 600 AND simulation_label = '[SIMULATED T+8H]' AND message_body IS NOT NULL AND retell_agent_id IS NULL AND retell_agent_version IS NULL AND retell_webhook_url IS NULL)
    OR (ordinal = 4 AND provider = 'retell' AND channel = 'voice' AND simulated_elapsed_minutes = 1440 AND compressed_offset_seconds = 900 AND simulation_label = '[SIMULATED T+24H]' AND message_body IS NULL AND retell_agent_id IS NOT NULL AND retell_agent_version IS NOT NULL AND retell_webhook_url IS NOT NULL)
  )
);
CREATE INDEX elite_solar_supervised_test_steps_next_idx ON public.elite_solar_supervised_test_steps (run_id, status, ordinal);

CREATE TABLE public.elite_solar_supervised_test_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.elite_solar_supervised_test_runs(id) ON DELETE RESTRICT,
  step_id uuid NOT NULL UNIQUE REFERENCES public.elite_solar_supervised_test_steps(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('telnyx', 'retell')),
  channel text NOT NULL CHECK (channel IN ('sms', 'voice')),
  idempotency_key text NOT NULL UNIQUE CHECK (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
  from_e164 text NOT NULL CHECK (from_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  to_e164 text NOT NULL CHECK (to_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  message_body text,
  retell_agent_id text,
  retell_agent_version integer,
  retell_webhook_url text,
  status text NOT NULL DEFAULT 'authorized' CHECK (status IN ('authorized', 'claimed', 'accepted', 'definite_failure', 'acceptance_unknown', 'cancelled')),
  authorized_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claim_expires_at timestamptz,
  dispatcher_instance_id uuid,
  finalized_at timestamptz,
  provider_object_id text,
  provider_response_sha256 text CHECK (provider_response_sha256 IS NULL OR provider_response_sha256 ~ '^[a-f0-9]{64}$'),
  error_code text CHECK (error_code IS NULL OR error_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  cancellation_reason_code text CHECK (cancellation_reason_code IS NULL OR cancellation_reason_code ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT,
  CHECK ((provider = 'telnyx' AND channel = 'sms' AND message_body IS NOT NULL AND retell_agent_id IS NULL AND retell_agent_version IS NULL AND retell_webhook_url IS NULL) OR (provider = 'retell' AND channel = 'voice' AND message_body IS NULL AND retell_agent_id IS NOT NULL AND retell_agent_version IS NOT NULL AND retell_webhook_url IS NOT NULL))
);
CREATE INDEX elite_solar_supervised_test_dispatches_claim_idx ON public.elite_solar_supervised_test_dispatches (run_id, status, authorized_at);

CREATE TABLE public.elite_solar_supervised_test_inbound_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.elite_solar_supervised_test_runs(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider = 'telnyx'),
  provider_event_id text NOT NULL CHECK (provider_event_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  provider_message_id text NOT NULL CHECK (provider_message_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  from_e164 text NOT NULL CHECK (from_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  to_e164 text NOT NULL CHECK (to_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  message_text text NOT NULL CHECK (length(message_text) BETWEEN 1 AND 4096),
  is_stop boolean NOT NULL DEFAULT false,
  is_first_reply boolean NOT NULL DEFAULT false,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.elite_solar_supervised_test_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL UNIQUE REFERENCES public.elite_solar_supervised_test_runs(id) ON DELETE RESTRICT,
  inbound_receipt_id uuid NOT NULL REFERENCES public.elite_solar_supervised_test_inbound_receipts(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  pipeline_board_id uuid NOT NULL REFERENCES public.pipeline_boards(id) ON DELETE RESTRICT,
  pipeline_stage text NOT NULL CHECK (pipeline_stage IN ('engaged', 'dnc')),
  pipeline_board_name text NOT NULL CHECK (length(btrim(pipeline_board_name)) BETWEEN 1 AND 1024),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'completed')),
  reason_code text NOT NULL CHECK (reason_code IN ('INBOUND_REPLY', 'STOP')),
  dnc_recorded boolean NOT NULL DEFAULT false,
  provider_reconciliation_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  completed_at timestamptz,
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.elite_solar_supervised_test_runs ADD CONSTRAINT elite_solar_supervised_test_runs_first_receipt_fkey FOREIGN KEY (first_inbound_receipt_id) REFERENCES public.elite_solar_supervised_test_inbound_receipts(id) ON DELETE RESTRICT;
CREATE INDEX elite_solar_supervised_test_inbound_match_idx ON public.elite_solar_supervised_test_inbound_receipts (run_id, recorded_at DESC);

ALTER TABLE public.elite_solar_supervised_test_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elite_solar_supervised_test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elite_solar_supervised_test_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elite_solar_supervised_test_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elite_solar_supervised_test_inbound_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elite_solar_supervised_test_handoffs ENABLE ROW LEVEL SECURITY;


CREATE OR REPLACE FUNCTION public.require_elite_solar_supervised_test_service()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_elite_solar_supervised_test_target()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_DELETE_FORBIDDEN';
  END IF;
  IF OLD.revoked_at IS NOT NULL
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id
    OR NEW.campaign_id IS DISTINCT FROM OLD.campaign_id
    OR NEW.lead_id IS DISTINCT FROM OLD.lead_id
    OR NEW.caller_phone_number_id IS DISTINCT FROM OLD.caller_phone_number_id
    OR NEW.engaged_pipeline_board_id IS DISTINCT FROM OLD.engaged_pipeline_board_id
    OR NEW.dnc_pipeline_board_id IS DISTINCT FROM OLD.dnc_pipeline_board_id
    OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.plan_version IS DISTINCT FROM OLD.plan_version
    OR NEW.telnyx_messaging_profile_id IS DISTINCT FROM OLD.telnyx_messaging_profile_id
    OR NEW.retell_agent_id IS DISTINCT FROM OLD.retell_agent_id
    OR NEW.retell_agent_version IS DISTINCT FROM OLD.retell_agent_version
    OR NEW.retell_webhook_url IS DISTINCT FROM OLD.retell_webhook_url
    OR NEW.sms_step_1_body IS DISTINCT FROM OLD.sms_step_1_body
    OR NEW.sms_step_2_body IS DISTINCT FROM OLD.sms_step_2_body
    OR NEW.sms_step_3_body IS DISTINCT FROM OLD.sms_step_3_body
    OR NEW.consent_evidence_sha256 IS DISTINCT FROM OLD.consent_evidence_sha256
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.revoked_at IS NULL
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS elite_solar_supervised_test_target_guard ON public.elite_solar_supervised_test_targets;
CREATE TRIGGER elite_solar_supervised_test_target_guard
BEFORE UPDATE OR DELETE ON public.elite_solar_supervised_test_targets
FOR EACH ROW EXECUTE FUNCTION public.protect_elite_solar_supervised_test_target();

CREATE OR REPLACE FUNCTION public.configure_elite_solar_supervised_test_target(
  p_owner_user_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_caller_phone_number_id uuid,
  p_engaged_pipeline_board_id uuid,
  p_dnc_pipeline_board_id uuid,
  p_telnyx_messaging_profile_id text,
  p_retell_agent_id text,
  p_retell_agent_version integer,
  p_retell_webhook_url text,
  p_sms_step_1_body text,
  p_sms_step_2_body text,
  p_sms_step_3_body text,
  p_consent_evidence_sha256 text,
  p_plan_id text DEFAULT 'elite_solar_self_test_v1',
  p_plan_version text DEFAULT '2026-07-26'
)
RETURNS TABLE (target_id uuid, target_state text, reason_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lead public.leads%ROWTYPE;
  v_phone public.phone_numbers%ROWTYPE;
  v_engaged_pipeline_board public.pipeline_boards%ROWTYPE;
  v_dnc_pipeline_board public.pipeline_boards%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_owner_user_id IS NULL OR p_organization_id IS NULL OR p_campaign_id IS NULL
    OR p_lead_id IS NULL OR p_caller_phone_number_id IS NULL
    OR p_engaged_pipeline_board_id IS NULL OR p_dnc_pipeline_board_id IS NULL
    OR p_engaged_pipeline_board_id = p_dnc_pipeline_board_id
    OR p_plan_id <> 'elite_solar_self_test_v1' OR p_plan_version <> '2026-07-26'
    OR p_consent_evidence_sha256 IS NULL OR lower(p_consent_evidence_sha256) !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_users AS membership
    JOIN public.campaigns AS campaign
      ON campaign.id = p_campaign_id
     AND campaign.organization_id = p_organization_id
     AND campaign.user_id = p_owner_user_id
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_owner_user_id
  ) THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_TENANT_MISMATCH' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_engaged_pipeline_board
  FROM public.pipeline_boards AS board
  WHERE board.id = p_engaged_pipeline_board_id
    AND board.user_id = p_owner_user_id
    AND board.campaign_id = p_campaign_id
  FOR KEY SHARE;
  SELECT * INTO v_dnc_pipeline_board
  FROM public.pipeline_boards AS board
  WHERE board.id = p_dnc_pipeline_board_id
    AND board.user_id = p_owner_user_id
    AND board.campaign_id = p_campaign_id
  FOR KEY SHARE;
  IF v_engaged_pipeline_board.id IS NULL OR v_dnc_pipeline_board.id IS NULL THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_PIPELINE_STAGE_NOT_ELIGIBLE' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_lead FROM public.leads AS lead
  WHERE lead.id = p_lead_id AND lead.organization_id = p_organization_id AND lead.user_id = p_owner_user_id
  FOR UPDATE;
  SELECT * INTO v_phone FROM public.phone_numbers AS phone
  WHERE phone.id = p_caller_phone_number_id AND phone.organization_id = p_organization_id
    AND phone.user_id = p_owner_user_id AND phone.status = 'active'
  FOR UPDATE;
  IF v_lead.id IS NULL OR v_lead.phone_number_normalized IS NULL OR COALESCE(v_lead.do_not_call, false)
    OR v_phone.id IS NULL OR v_phone.number IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.campaign_leads AS member WHERE member.campaign_id = p_campaign_id AND member.lead_id = p_lead_id)
    OR EXISTS (SELECT 1 FROM public.dnc_list AS dnc WHERE dnc.organization_id = p_organization_id AND dnc.phone_number_normalized = v_lead.phone_number_normalized)
    OR NOT EXISTS (SELECT 1 FROM public.retell_agents AS agent WHERE agent.retell_agent_id = p_retell_agent_id AND agent.organization_id = p_organization_id AND agent.user_id = p_owner_user_id)
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_NOT_ELIGIBLE' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.elite_solar_supervised_test_targets AS target
    JOIN public.elite_solar_supervised_test_runs AS run ON run.target_id = target.id
    WHERE target.organization_id = p_organization_id AND target.owner_user_id = p_owner_user_id
      AND target.campaign_id = p_campaign_id AND target.plan_id = p_plan_id AND target.plan_version = p_plan_version
      AND target.revoked_at IS NULL
      AND run.status IN ('armed', 'dispatching', 'awaiting_reply', 'engaged')
  ) THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_ACTIVE_RUN_MUST_FINISH_OR_BE_CANCELLED';
  END IF;
  UPDATE public.elite_solar_supervised_test_targets
  SET revoked_at = now(), revoked_reason_code = 'SUPERSEDED'
  WHERE organization_id = p_organization_id AND owner_user_id = p_owner_user_id
    AND campaign_id = p_campaign_id AND plan_id = p_plan_id AND plan_version = p_plan_version
    AND revoked_at IS NULL;
  INSERT INTO public.elite_solar_supervised_test_targets (
    organization_id, owner_user_id, campaign_id, lead_id, caller_phone_number_id,
    engaged_pipeline_board_id, dnc_pipeline_board_id,
    plan_id, plan_version, telnyx_messaging_profile_id, retell_agent_id,
    retell_agent_version, retell_webhook_url, sms_step_1_body, sms_step_2_body,
    sms_step_3_body, consent_evidence_sha256
  ) VALUES (
    p_organization_id, p_owner_user_id, p_campaign_id, p_lead_id, p_caller_phone_number_id,
    p_engaged_pipeline_board_id, p_dnc_pipeline_board_id,
    p_plan_id, p_plan_version, btrim(p_telnyx_messaging_profile_id), btrim(p_retell_agent_id),
    p_retell_agent_version, btrim(p_retell_webhook_url), btrim(p_sms_step_1_body),
    btrim(p_sms_step_2_body), btrim(p_sms_step_3_body), lower(p_consent_evidence_sha256)
  ) RETURNING id INTO v_id;
  RETURN QUERY SELECT v_id, 'configured'::text, 'SUPERVISED_TEST_TARGET_CONFIGURED'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.arm_elite_solar_supervised_test_run(
  p_owner_user_id uuid, p_organization_id uuid, p_campaign_id uuid,
  p_plan_id text, p_plan_version text, p_stop_on_first_inbound_reply boolean,
  p_inbound_reply_outcome text, p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (run_id uuid, run_state text, reason_code text, dispatch_authorized boolean, dispatch_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target public.elite_solar_supervised_test_targets%ROWTYPE;
  v_run public.elite_solar_supervised_test_runs%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_phone public.phone_numbers%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_run_id IS NOT NULL OR p_owner_user_id IS NULL OR p_organization_id IS NULL OR p_campaign_id IS NULL
    OR p_plan_id <> 'elite_solar_self_test_v1' OR p_plan_version <> '2026-07-26'
    OR p_stop_on_first_inbound_reply IS DISTINCT FROM true
    OR p_inbound_reply_outcome <> 'halt_and_human_handoff'
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_ARM_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_target FROM public.elite_solar_supervised_test_targets AS target
  WHERE target.organization_id = p_organization_id AND target.owner_user_id = p_owner_user_id
    AND target.campaign_id = p_campaign_id AND target.plan_id = p_plan_id AND target.plan_version = p_plan_version
    AND target.revoked_at IS NULL
  FOR UPDATE;
  IF v_target.id IS NULL THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_NOT_CONFIGURED'; END IF;
  SELECT * INTO v_run FROM public.elite_solar_supervised_test_runs WHERE target_id = v_target.id FOR UPDATE;
  IF v_run.id IS NOT NULL THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_RUN_ALREADY_EXISTS'::text, false, NULL::uuid;
    RETURN;
  END IF;
  SELECT * INTO v_lead FROM public.leads WHERE id = v_target.lead_id AND organization_id = p_organization_id AND user_id = p_owner_user_id FOR UPDATE;
  SELECT * INTO v_phone FROM public.phone_numbers WHERE id = v_target.caller_phone_number_id AND organization_id = p_organization_id AND user_id = p_owner_user_id AND status = 'active' FOR UPDATE;
  IF v_lead.id IS NULL OR v_phone.id IS NULL OR v_lead.phone_number_normalized IS NULL OR COALESCE(v_lead.do_not_call, false)
    OR EXISTS (SELECT 1 FROM public.dnc_list AS dnc WHERE dnc.organization_id = p_organization_id AND dnc.phone_number_normalized = v_lead.phone_number_normalized)
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_TARGET_NOT_ELIGIBLE'; END IF;
  INSERT INTO public.elite_solar_supervised_test_runs (
    target_id, organization_id, owner_user_id, campaign_id, lead_id, caller_phone_number_id,
    from_e164, to_e164, plan_id, plan_version, armed_at
  ) VALUES (
    v_target.id, p_organization_id, p_owner_user_id, p_campaign_id, v_target.lead_id, v_target.caller_phone_number_id,
    v_phone.number, v_lead.phone_number_normalized, p_plan_id, p_plan_version, v_now
  ) RETURNING * INTO v_run;
  INSERT INTO public.elite_solar_supervised_test_steps (
    run_id, organization_id, owner_user_id, campaign_id, lead_id, ordinal, provider, channel,
    simulated_elapsed_minutes, compressed_offset_seconds, simulation_label, not_before_at,
    message_body, retell_agent_id, retell_agent_version, retell_webhook_url
  ) VALUES
    (v_run.id, p_organization_id, p_owner_user_id, p_campaign_id, v_target.lead_id, 1, 'telnyx', 'sms', 0, 0, '[SIMULATED T+0]', v_now, '[SIMULATED T+0]' || E'\n\n' || v_target.sms_step_1_body, NULL, NULL, NULL),
    (v_run.id, p_organization_id, p_owner_user_id, p_campaign_id, v_target.lead_id, 2, 'telnyx', 'sms', 240, 300, '[SIMULATED T+4H]', v_now + interval '5 minutes', '[SIMULATED T+4H]' || E'\n\n' || v_target.sms_step_2_body, NULL, NULL, NULL),
    (v_run.id, p_organization_id, p_owner_user_id, p_campaign_id, v_target.lead_id, 3, 'telnyx', 'sms', 480, 600, '[SIMULATED T+8H]', v_now + interval '10 minutes', '[SIMULATED T+8H]' || E'\n\n' || v_target.sms_step_3_body, NULL, NULL, NULL),
    (v_run.id, p_organization_id, p_owner_user_id, p_campaign_id, v_target.lead_id, 4, 'retell', 'voice', 1440, 900, '[SIMULATED T+24H]', v_now + interval '15 minutes', NULL, v_target.retell_agent_id, v_target.retell_agent_version, v_target.retell_webhook_url);
  RETURN QUERY SELECT v_run.id, 'armed'::text, 'SUPERVISED_TEST_ARMED'::text, false, NULL::uuid;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_elite_solar_supervised_test_run_status(
  p_owner_user_id uuid, p_organization_id uuid, p_campaign_id uuid,
  p_plan_id text, p_plan_version text, p_stop_on_first_inbound_reply boolean,
  p_inbound_reply_outcome text, p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (run_id uuid, run_state text, reason_code text, dispatch_authorized boolean, dispatch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_run public.elite_solar_supervised_test_runs%ROWTYPE;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_run_id IS NULL OR p_plan_id <> 'elite_solar_self_test_v1' OR p_plan_version <> '2026-07-26'
    OR p_stop_on_first_inbound_reply IS DISTINCT FROM true OR p_inbound_reply_outcome <> 'halt_and_human_handoff'
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_STATUS_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT run.* INTO v_run FROM public.elite_solar_supervised_test_runs AS run
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE run.id = p_run_id AND run.organization_id = p_organization_id AND run.owner_user_id = p_owner_user_id
    AND run.campaign_id = p_campaign_id AND run.plan_id = p_plan_id AND run.plan_version = p_plan_version
    AND target.organization_id = p_organization_id AND target.owner_user_id = p_owner_user_id
  LIMIT 1;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_RUN_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  RETURN QUERY SELECT v_run.id, v_run.status, COALESCE(v_run.terminal_reason_code, 'SUPERVISED_TEST_STATUS'), false, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_elite_solar_supervised_test_run(
  p_owner_user_id uuid, p_organization_id uuid, p_campaign_id uuid,
  p_plan_id text, p_plan_version text, p_stop_on_first_inbound_reply boolean,
  p_inbound_reply_outcome text, p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (run_id uuid, run_state text, reason_code text, dispatch_authorized boolean, dispatch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_run public.elite_solar_supervised_test_runs%ROWTYPE; v_inflight boolean := false;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_run_id IS NULL OR p_plan_id <> 'elite_solar_self_test_v1' OR p_plan_version <> '2026-07-26'
    OR p_stop_on_first_inbound_reply IS DISTINCT FROM true OR p_inbound_reply_outcome <> 'halt_and_human_handoff'
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_CANCEL_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT run.* INTO v_run FROM public.elite_solar_supervised_test_runs AS run
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE run.id = p_run_id AND run.organization_id = p_organization_id AND run.owner_user_id = p_owner_user_id
    AND run.campaign_id = p_campaign_id AND run.plan_id = p_plan_id AND run.plan_version = p_plan_version
    AND target.organization_id = p_organization_id AND target.owner_user_id = p_owner_user_id
  FOR UPDATE OF run;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_RUN_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF v_run.status IN ('engaged', 'completed', 'cancelled', 'held', 'reconciliation_required') THEN
    RETURN QUERY SELECT v_run.id, v_run.status, COALESCE(v_run.terminal_reason_code, 'SUPERVISED_TEST_ALREADY_TERMINAL'), false, NULL::uuid;
    RETURN;
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.elite_solar_supervised_test_dispatches WHERE run_id = v_run.id AND status = 'claimed') INTO v_inflight;
  UPDATE public.elite_solar_supervised_test_dispatches
  SET status = 'cancelled', cancellation_reason_code = 'SUPERVISED_TEST_CANCELLED', updated_at = now()
  WHERE run_id = v_run.id AND status = 'authorized';
  UPDATE public.elite_solar_supervised_test_steps
  SET status = 'cancelled', cancelled_at = now(), cancellation_reason_code = 'SUPERVISED_TEST_CANCELLED', updated_at = now()
  WHERE run_id = v_run.id AND status IN ('pending', 'authorized');
  UPDATE public.elite_solar_supervised_test_dispatches
  SET status = 'acceptance_unknown', cancellation_reason_code = 'SUPERVISED_TEST_CANCELLED_IN_FLIGHT', updated_at = now()
  WHERE run_id = v_run.id AND status = 'claimed';
  UPDATE public.elite_solar_supervised_test_steps
  SET status = 'acceptance_unknown', cancellation_reason_code = 'SUPERVISED_TEST_CANCELLED_IN_FLIGHT', updated_at = now()
  WHERE run_id = v_run.id AND status = 'claimed';
  UPDATE public.elite_solar_supervised_test_runs
  SET status = CASE WHEN v_inflight THEN 'reconciliation_required' ELSE 'cancelled' END,
      provider_reconciliation_required = v_inflight,
      terminal_reason_code = CASE WHEN v_inflight THEN 'SUPERVISED_TEST_CANCELLED_IN_FLIGHT_RECONCILIATION' ELSE 'SUPERVISED_TEST_CANCELLED' END,
      cancelled_at = now(), updated_at = now()
  WHERE id = v_run.id
  RETURNING * INTO v_run;
  RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_elite_solar_supervised_test_run(
  p_owner_user_id uuid, p_organization_id uuid, p_campaign_id uuid,
  p_plan_id text, p_plan_version text, p_stop_on_first_inbound_reply boolean,
  p_inbound_reply_outcome text, p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (run_id uuid, run_state text, reason_code text, dispatch_authorized boolean, dispatch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.elite_solar_supervised_test_runs%ROWTYPE;
  v_target public.elite_solar_supervised_test_targets%ROWTYPE;
  v_step public.elite_solar_supervised_test_steps%ROWTYPE;
  v_dispatch public.elite_solar_supervised_test_dispatches%ROWTYPE;
  v_allowed boolean;
  v_inflight integer := 0;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_run_id IS NULL OR p_plan_id <> 'elite_solar_self_test_v1' OR p_plan_version <> '2026-07-26'
    OR p_stop_on_first_inbound_reply IS DISTINCT FROM true OR p_inbound_reply_outcome <> 'halt_and_human_handoff'
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_ADVANCE_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT run.*, target.* INTO v_run, v_target
  FROM public.elite_solar_supervised_test_runs AS run
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE run.id = p_run_id AND run.organization_id = p_organization_id AND run.owner_user_id = p_owner_user_id
    AND run.campaign_id = p_campaign_id AND run.plan_id = p_plan_id AND run.plan_version = p_plan_version
  FOR UPDATE OF run, target;
  IF v_run.id IS NULL THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_RUN_NOT_FOUND' USING ERRCODE = '42501'; END IF;
  IF v_target.revoked_at IS NOT NULL THEN
    UPDATE public.elite_solar_supervised_test_runs SET status = 'held', terminal_reason_code = 'SUPERVISED_TEST_TARGET_REVOKED', updated_at = now() WHERE id = v_run.id RETURNING * INTO v_run;
    RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid; RETURN;
  END IF;
  SELECT count(*) INTO v_inflight FROM public.elite_solar_supervised_test_dispatches
  WHERE run_id = v_run.id AND status = 'claimed' AND claim_expires_at <= now();
  IF v_inflight > 0 THEN
    UPDATE public.elite_solar_supervised_test_dispatches SET status = 'acceptance_unknown', error_code = 'SUPERVISED_TEST_DISPATCH_LEASE_EXPIRED', updated_at = now()
    WHERE run_id = v_run.id AND status = 'claimed' AND claim_expires_at <= now();
    UPDATE public.elite_solar_supervised_test_steps SET status = 'acceptance_unknown', cancellation_reason_code = 'SUPERVISED_TEST_DISPATCH_LEASE_EXPIRED', updated_at = now()
    WHERE run_id = v_run.id AND status = 'claimed';
    UPDATE public.elite_solar_supervised_test_dispatches SET status = 'cancelled', cancellation_reason_code = 'SUPERVISED_TEST_RECONCILIATION_HOLD', updated_at = now()
    WHERE run_id = v_run.id AND status = 'authorized';
    UPDATE public.elite_solar_supervised_test_steps SET status = 'cancelled', cancelled_at = now(), cancellation_reason_code = 'SUPERVISED_TEST_RECONCILIATION_HOLD', updated_at = now()
    WHERE run_id = v_run.id AND status IN ('pending', 'authorized');
    UPDATE public.elite_solar_supervised_test_runs SET status = 'reconciliation_required', provider_reconciliation_required = true, terminal_reason_code = 'SUPERVISED_TEST_DISPATCH_LEASE_EXPIRED', updated_at = now() WHERE id = v_run.id RETURNING * INTO v_run;
    RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_dispatch FROM public.elite_solar_supervised_test_dispatches
  WHERE run_id = v_run.id AND status = 'authorized' ORDER BY authorized_at DESC LIMIT 1 FOR UPDATE;
  IF v_dispatch.id IS NOT NULL THEN
    RETURN QUERY SELECT v_run.id, 'dispatching'::text, 'SUPERVISED_TEST_ADVANCE_AUTHORIZED'::text, true, v_dispatch.id; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.elite_solar_supervised_test_dispatches WHERE run_id = v_run.id AND status = 'claimed') THEN
    RETURN QUERY SELECT v_run.id, 'dispatching'::text, 'SUPERVISED_TEST_DISPATCH_ALREADY_CLAIMED'::text, false, NULL::uuid; RETURN;
  END IF;
  IF v_run.status NOT IN ('armed', 'awaiting_reply') THEN
    RETURN QUERY SELECT v_run.id, v_run.status, COALESCE(v_run.terminal_reason_code, 'SUPERVISED_TEST_NOT_ADVANCEABLE'), false, NULL::uuid; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads AS lead WHERE lead.id = v_run.lead_id AND (COALESCE(lead.do_not_call, false) OR lead.organization_id <> v_run.organization_id OR lead.user_id <> v_run.owner_user_id))
    OR EXISTS (SELECT 1 FROM public.dnc_list AS dnc WHERE dnc.organization_id = v_run.organization_id AND dnc.phone_number_normalized = v_run.to_e164)
  THEN
    UPDATE public.elite_solar_supervised_test_runs SET status = 'held', terminal_reason_code = 'SUPERVISED_TEST_DNC_OR_LEAD_STOP', updated_at = now() WHERE id = v_run.id RETURNING * INTO v_run;
    RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid; RETURN;
  END IF;
  SELECT * INTO v_step FROM public.elite_solar_supervised_test_steps
  WHERE run_id = v_run.id AND status = 'pending' ORDER BY ordinal LIMIT 1 FOR UPDATE;
  IF v_step.id IS NULL THEN
    UPDATE public.elite_solar_supervised_test_runs SET status = 'completed', completed_at = COALESCE(completed_at, now()), terminal_reason_code = 'SUPERVISED_TEST_PLAN_COMPLETE', updated_at = now() WHERE id = v_run.id RETURNING * INTO v_run;
    RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid; RETURN;
  END IF;
  IF v_step.ordinal > 1 AND NOT EXISTS (SELECT 1 FROM public.elite_solar_supervised_test_steps WHERE run_id = v_run.id AND ordinal = v_step.ordinal - 1 AND status = 'accepted') THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_PREVIOUS_STEP_NOT_ACCEPTED'::text, false, NULL::uuid; RETURN;
  END IF;
  IF v_step.not_before_at > now() THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_STEP_NOT_DUE'::text, false, NULL::uuid; RETURN;
  END IF;
  SELECT stop.allowed INTO v_allowed FROM public.evaluate_contact_stop(v_run.owner_user_id, v_run.organization_id, v_run.campaign_id, v_step.provider, v_step.channel) AS stop;
  IF COALESCE(v_allowed, false) IS NOT TRUE THEN
    UPDATE public.elite_solar_supervised_test_runs SET status = 'held', terminal_reason_code = 'SUPERVISED_TEST_CONTACT_STOP_ACTIVE', updated_at = now() WHERE id = v_run.id RETURNING * INTO v_run;
    RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid; RETURN;
  END IF;
  INSERT INTO public.elite_solar_supervised_test_dispatches (
    run_id, step_id, organization_id, owner_user_id, campaign_id, lead_id, provider, channel,
    idempotency_key, from_e164, to_e164, message_body, retell_agent_id, retell_agent_version, retell_webhook_url
  ) VALUES (
    v_run.id, v_step.id, v_run.organization_id, v_run.owner_user_id, v_run.campaign_id, v_run.lead_id, v_step.provider, v_step.channel,
    'esst:' || replace(gen_random_uuid()::text, '-', ''), v_run.from_e164, v_run.to_e164, v_step.message_body, v_step.retell_agent_id, v_step.retell_agent_version, v_step.retell_webhook_url
  ) RETURNING * INTO v_dispatch;
  UPDATE public.elite_solar_supervised_test_steps SET status = 'authorized', updated_at = now() WHERE id = v_step.id;
  UPDATE public.elite_solar_supervised_test_runs SET status = 'dispatching', current_step_ordinal = v_step.ordinal, updated_at = now() WHERE id = v_run.id RETURNING * INTO v_run;
  RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_ADVANCE_AUTHORIZED'::text, true, v_dispatch.id;
END;
$$;


CREATE OR REPLACE FUNCTION public.claim_elite_solar_supervised_test_dispatch(
  p_test_run_id uuid, p_dispatcher_instance_id uuid
)
RETURNS TABLE (
  claimed boolean, dispatch_id uuid, test_run_id uuid, provider text, channel text,
  idempotency_key text, from_e164 text, to_e164 text, message_body text,
  retell_agent_id text, retell_agent_version integer, retell_webhook_url text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_run public.elite_solar_supervised_test_runs%ROWTYPE; v_dispatch public.elite_solar_supervised_test_dispatches%ROWTYPE; v_expired integer := 0;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_test_run_id IS NULL OR p_dispatcher_instance_id IS NULL THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_CLAIM_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_run FROM public.elite_solar_supervised_test_runs WHERE id = p_test_run_id FOR UPDATE;
  IF v_run.id IS NULL OR v_run.status <> 'dispatching' THEN RETURN; END IF;
  SELECT count(*) INTO v_expired FROM public.elite_solar_supervised_test_dispatches WHERE run_id = v_run.id AND status = 'claimed' AND claim_expires_at <= now();
  IF v_expired > 0 THEN
    UPDATE public.elite_solar_supervised_test_dispatches SET status = 'acceptance_unknown', error_code = 'SUPERVISED_TEST_DISPATCH_LEASE_EXPIRED', updated_at = now() WHERE run_id = v_run.id AND status = 'claimed' AND claim_expires_at <= now();
    UPDATE public.elite_solar_supervised_test_steps SET status = 'acceptance_unknown', cancellation_reason_code = 'SUPERVISED_TEST_DISPATCH_LEASE_EXPIRED', updated_at = now() WHERE run_id = v_run.id AND status = 'claimed';
    UPDATE public.elite_solar_supervised_test_dispatches SET status = 'cancelled', cancellation_reason_code = 'SUPERVISED_TEST_RECONCILIATION_HOLD', updated_at = now() WHERE run_id = v_run.id AND status = 'authorized';
    UPDATE public.elite_solar_supervised_test_steps SET status = 'cancelled', cancelled_at = now(), cancellation_reason_code = 'SUPERVISED_TEST_RECONCILIATION_HOLD', updated_at = now() WHERE run_id = v_run.id AND status IN ('pending', 'authorized');
    UPDATE public.elite_solar_supervised_test_runs SET status = 'reconciliation_required', provider_reconciliation_required = true, terminal_reason_code = 'SUPERVISED_TEST_DISPATCH_LEASE_EXPIRED', updated_at = now() WHERE id = v_run.id;
    RETURN;
  END IF;
  SELECT * INTO v_dispatch FROM public.elite_solar_supervised_test_dispatches
  WHERE run_id = v_run.id AND status = 'authorized'
  ORDER BY authorized_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_dispatch.id IS NULL THEN RETURN; END IF;
  UPDATE public.elite_solar_supervised_test_dispatches
  SET status = 'claimed', dispatcher_instance_id = p_dispatcher_instance_id, claimed_at = now(), claim_expires_at = now() + interval '5 minutes', updated_at = now()
  WHERE id = v_dispatch.id RETURNING * INTO v_dispatch;
  UPDATE public.elite_solar_supervised_test_steps SET status = 'claimed', claimed_at = now(), updated_at = now() WHERE id = v_dispatch.step_id AND status = 'authorized';
  RETURN QUERY SELECT true, v_dispatch.id, v_dispatch.run_id, v_dispatch.provider, v_dispatch.channel,
    v_dispatch.idempotency_key, v_dispatch.from_e164, v_dispatch.to_e164, v_dispatch.message_body,
    v_dispatch.retell_agent_id, v_dispatch.retell_agent_version, v_dispatch.retell_webhook_url;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_elite_solar_supervised_test_dispatch(
  p_dispatch_id uuid, p_dispatcher_instance_id uuid, p_status text,
  p_provider_object_id text DEFAULT NULL, p_provider_response_sha256 text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_dispatch public.elite_solar_supervised_test_dispatches%ROWTYPE; v_run public.elite_solar_supervised_test_runs%ROWTYPE; v_all_accepted boolean;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_dispatch_id IS NULL OR p_dispatcher_instance_id IS NULL OR p_status IS NULL OR p_status NOT IN ('accepted', 'definite_failure', 'acceptance_unknown')
    OR (p_status = 'accepted' AND (p_provider_object_id IS NULL OR btrim(p_provider_object_id) !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'))
    OR (p_provider_response_sha256 IS NOT NULL AND lower(p_provider_response_sha256) !~ '^[a-f0-9]{64}$')
    OR (p_error_code IS NOT NULL AND p_error_code !~ '^[A-Z][A-Z0-9_]{2,79}$')
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_FINALIZE_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_dispatch FROM public.elite_solar_supervised_test_dispatches WHERE id = p_dispatch_id FOR UPDATE;
  IF v_dispatch.id IS NULL OR v_dispatch.dispatcher_instance_id IS DISTINCT FROM p_dispatcher_instance_id THEN RETURN false; END IF;
  IF v_dispatch.status = p_status THEN RETURN true; END IF;
  IF v_dispatch.status NOT IN ('claimed', 'acceptance_unknown') THEN RETURN false; END IF;
  SELECT * INTO v_run FROM public.elite_solar_supervised_test_runs WHERE id = v_dispatch.run_id FOR UPDATE;
  UPDATE public.elite_solar_supervised_test_dispatches
  SET status = p_status, provider_object_id = COALESCE(btrim(p_provider_object_id), provider_object_id),
      provider_response_sha256 = COALESCE(lower(p_provider_response_sha256), provider_response_sha256),
      error_code = p_error_code, finalized_at = now(), claim_expires_at = NULL, updated_at = now()
  WHERE id = v_dispatch.id;
  UPDATE public.elite_solar_supervised_test_steps
  SET status = p_status, accepted_at = CASE WHEN p_status = 'accepted' THEN now() ELSE accepted_at END,
      updated_at = now()
  WHERE id = v_dispatch.step_id;
  IF v_run.status = 'engaged' THEN
    RETURN true;
  END IF;
  IF p_status = 'accepted' THEN
    SELECT NOT EXISTS (SELECT 1 FROM public.elite_solar_supervised_test_steps WHERE run_id = v_run.id AND status <> 'accepted') INTO v_all_accepted;
    UPDATE public.elite_solar_supervised_test_runs
    SET status = CASE WHEN v_all_accepted THEN 'completed' ELSE 'awaiting_reply' END,
        completed_at = CASE WHEN v_all_accepted THEN now() ELSE completed_at END,
        terminal_reason_code = CASE WHEN v_all_accepted THEN 'SUPERVISED_TEST_PLAN_COMPLETE' ELSE NULL END,
        updated_at = now()
    WHERE id = v_run.id;
  ELSE
    UPDATE public.elite_solar_supervised_test_dispatches
    SET status = 'cancelled', cancellation_reason_code = CASE WHEN p_status = 'acceptance_unknown' THEN 'SUPERVISED_TEST_RECONCILIATION_HOLD' ELSE 'SUPERVISED_TEST_PROVIDER_FAILURE' END, updated_at = now()
    WHERE run_id = v_run.id AND status = 'authorized';
    UPDATE public.elite_solar_supervised_test_steps
    SET status = 'cancelled', cancelled_at = now(), cancellation_reason_code = CASE WHEN p_status = 'acceptance_unknown' THEN 'SUPERVISED_TEST_RECONCILIATION_HOLD' ELSE 'SUPERVISED_TEST_PROVIDER_FAILURE' END, updated_at = now()
    WHERE run_id = v_run.id AND status IN ('pending', 'authorized');
    UPDATE public.elite_solar_supervised_test_runs
    SET status = CASE WHEN p_status = 'acceptance_unknown' THEN 'reconciliation_required' ELSE 'held' END,
        provider_reconciliation_required = (p_status = 'acceptance_unknown'),
        terminal_reason_code = CASE WHEN p_status = 'acceptance_unknown' THEN 'SUPERVISED_TEST_PROVIDER_ACCEPTANCE_UNKNOWN' ELSE 'SUPERVISED_TEST_PROVIDER_DEFINITE_FAILURE' END,
        updated_at = now()
    WHERE id = v_run.id;
  END IF;
  RETURN true;
END;
$$;


CREATE TABLE public.elite_solar_supervised_test_call_event_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.elite_solar_supervised_test_runs(id) ON DELETE RESTRICT,
  dispatch_id uuid NOT NULL REFERENCES public.elite_solar_supervised_test_dispatches(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider_event_key text NOT NULL UNIQUE CHECK (provider_event_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  provider_call_id text NOT NULL CHECK (provider_call_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  event text NOT NULL CHECK (event IN ('call_started', 'call_ended', 'call_analyzed', 'call_failed')),
  occurred_at timestamptz NOT NULL,
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  agent_id text NOT NULL CHECK (agent_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'),
  agent_version integer NOT NULL CHECK (agent_version BETWEEN 0 AND 1000000),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (organization_id, owner_user_id) REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);
ALTER TABLE public.elite_solar_supervised_test_call_event_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_elite_solar_supervised_test_reply(
  p_provider text, p_provider_event_id text, p_provider_message_id text,
  p_payload_sha256 text, p_occurred_at timestamptz, p_from_e164 text,
  p_to_e164 text, p_message_text text, p_messaging_profile_id text
)
RETURNS TABLE (recorded boolean, result_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.elite_solar_supervised_test_runs%ROWTYPE;
  v_target public.elite_solar_supervised_test_targets%ROWTYPE;
  v_receipt_id uuid;
  v_is_stop boolean;
  v_inflight boolean;
  v_normalized_text text;
  v_pipeline_board public.pipeline_boards%ROWTYPE;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_provider IS DISTINCT FROM 'telnyx' OR p_provider_event_id IS NULL OR p_provider_event_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_provider_message_id IS NULL OR p_provider_message_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_payload_sha256 IS NULL OR lower(p_payload_sha256) !~ '^[a-f0-9]{64}$'
    OR p_occurred_at IS NULL OR p_from_e164 IS NULL OR p_to_e164 IS NULL
    OR p_from_e164 !~ '^\+[1-9][0-9]{7,14}$' OR p_to_e164 !~ '^\+[1-9][0-9]{7,14}$'
    OR p_from_e164 <> public.normalize_contact_phone(p_from_e164) OR p_to_e164 <> public.normalize_contact_phone(p_to_e164)
    OR p_message_text IS NULL OR length(p_message_text) NOT BETWEEN 1 AND 4096 OR length(btrim(p_message_text)) = 0
    OR p_messaging_profile_id IS NULL OR p_messaging_profile_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_REPLY_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT run.*, target.* INTO v_run, v_target
  FROM public.elite_solar_supervised_test_runs AS run
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE target.revoked_at IS NULL AND target.telnyx_messaging_profile_id = p_messaging_profile_id
    AND run.to_e164 = p_from_e164 AND run.from_e164 = p_to_e164
  ORDER BY run.armed_at DESC LIMIT 1 FOR UPDATE OF run, target;
  IF v_run.id IS NULL THEN
    RETURN QUERY SELECT true, 'SUPERVISED_TEST_REPLY_NOT_MATCHED'::text; RETURN;
  END IF;
  IF p_occurred_at < v_run.armed_at - interval '5 minutes' THEN
    RETURN QUERY SELECT true, 'SUPERVISED_TEST_REPLY_IGNORED_PRE_ARM'::text; RETURN;
  END IF;
  INSERT INTO public.elite_solar_supervised_test_inbound_receipts (
    run_id, organization_id, owner_user_id, campaign_id, lead_id, provider,
    provider_event_id, provider_message_id, payload_sha256, occurred_at,
    from_e164, to_e164, message_text
  ) VALUES (
    v_run.id, v_run.organization_id, v_run.owner_user_id, v_run.campaign_id, v_run.lead_id, 'telnyx',
    p_provider_event_id, p_provider_message_id, lower(p_payload_sha256), p_occurred_at,
    p_from_e164, p_to_e164, p_message_text
  ) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id INTO v_receipt_id;
  IF v_receipt_id IS NULL THEN
    RETURN QUERY SELECT false, 'SUPERVISED_TEST_REPLY_DUPLICATE_OR_REPLAY'::text; RETURN;
  END IF;
  IF v_run.first_inbound_receipt_id IS NOT NULL THEN
    RETURN QUERY SELECT true, 'SUPERVISED_TEST_REPLY_RECORDED_SUBSEQUENT'::text; RETURN;
  END IF;
  v_normalized_text := upper(regexp_replace(btrim(p_message_text), '\s+', ' ', 'g'));
  v_is_stop := v_normalized_text IN ('STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT');
  SELECT * INTO v_pipeline_board
  FROM public.pipeline_boards AS board
  WHERE board.id = CASE WHEN v_is_stop THEN v_target.dnc_pipeline_board_id ELSE v_target.engaged_pipeline_board_id END
    AND board.user_id = v_run.owner_user_id
    AND board.campaign_id = v_run.campaign_id
  FOR KEY SHARE;
  IF v_pipeline_board.id IS NULL THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_PIPELINE_STAGE_BINDING_INVALID' USING ERRCODE = '23514';
  END IF;
  UPDATE public.elite_solar_supervised_test_inbound_receipts SET is_first_reply = true, is_stop = v_is_stop WHERE id = v_receipt_id;
  SELECT EXISTS (SELECT 1 FROM public.elite_solar_supervised_test_dispatches WHERE run_id = v_run.id AND status = 'claimed') INTO v_inflight;
  UPDATE public.elite_solar_supervised_test_dispatches SET status = 'cancelled', cancellation_reason_code = 'SUPERVISED_TEST_FIRST_REPLY', updated_at = now() WHERE run_id = v_run.id AND status = 'authorized';
  UPDATE public.elite_solar_supervised_test_steps SET status = 'cancelled', cancelled_at = now(), cancellation_reason_code = 'SUPERVISED_TEST_FIRST_REPLY', updated_at = now() WHERE run_id = v_run.id AND status IN ('pending', 'authorized');
  UPDATE public.elite_solar_supervised_test_dispatches SET status = 'acceptance_unknown', cancellation_reason_code = 'SUPERVISED_TEST_REPLY_DURING_IN_FLIGHT_DISPATCH', updated_at = now() WHERE run_id = v_run.id AND status = 'claimed';
  UPDATE public.elite_solar_supervised_test_steps SET status = 'acceptance_unknown', cancellation_reason_code = 'SUPERVISED_TEST_REPLY_DURING_IN_FLIGHT_DISPATCH', updated_at = now() WHERE run_id = v_run.id AND status = 'claimed';
  UPDATE public.leads
  SET do_not_call = CASE WHEN v_is_stop THEN true ELSE do_not_call END,
      status = CASE WHEN v_is_stop THEN 'dnc' ELSE 'engaged' END,
      last_contacted_at = GREATEST(COALESCE(last_contacted_at, p_occurred_at), p_occurred_at), updated_at = now()
  WHERE id = v_run.lead_id AND organization_id = v_run.organization_id AND user_id = v_run.owner_user_id;
  INSERT INTO public.lead_pipeline_positions (
    user_id, lead_id, pipeline_board_id, position, moved_at, moved_by_user, notes
  ) VALUES (
    v_run.owner_user_id, v_run.lead_id, v_pipeline_board.id, 0, now(), false,
    CASE
      WHEN v_is_stop THEN 'Supervised Elite Solar self-test: STOP received; automated outreach stopped.'
      ELSE 'Supervised Elite Solar self-test: inbound reply received; human handoff opened.'
    END
  ) ON CONFLICT (lead_id, user_id) DO UPDATE
  SET pipeline_board_id = EXCLUDED.pipeline_board_id,
      position = EXCLUDED.position,
      moved_at = EXCLUDED.moved_at,
      moved_by_user = EXCLUDED.moved_by_user,
      notes = EXCLUDED.notes;
  IF v_is_stop THEN
    INSERT INTO public.dnc_list (user_id, organization_id, phone_number, reason)
    VALUES (v_run.owner_user_id, v_run.organization_id, v_run.to_e164, 'SUPERVISED_TEST_STOP')
    ON CONFLICT (organization_id, phone_number_normalized) DO NOTHING;
  END IF;
  INSERT INTO public.elite_solar_supervised_test_handoffs (
    run_id, inbound_receipt_id, organization_id, owner_user_id, campaign_id, lead_id,
    pipeline_board_id, pipeline_stage, pipeline_board_name,
    reason_code, dnc_recorded, provider_reconciliation_required
  ) VALUES (
    v_run.id, v_receipt_id, v_run.organization_id, v_run.owner_user_id, v_run.campaign_id, v_run.lead_id,
    v_pipeline_board.id, CASE WHEN v_is_stop THEN 'dnc' ELSE 'engaged' END, v_pipeline_board.name,
    CASE WHEN v_is_stop THEN 'STOP' ELSE 'INBOUND_REPLY' END, v_is_stop, v_inflight
  ) ON CONFLICT (run_id) DO NOTHING;
  UPDATE public.elite_solar_supervised_test_runs
  SET status = 'engaged', stop_requested = v_is_stop,
      provider_reconciliation_required = v_inflight,
      terminal_reason_code = CASE WHEN v_is_stop THEN 'SUPERVISED_TEST_STOP_RECEIVED' ELSE 'SUPERVISED_TEST_REPLY_RECEIVED' END,
      first_reply_received_at = p_occurred_at, first_inbound_receipt_id = v_receipt_id, updated_at = now()
  WHERE id = v_run.id;
  RETURN QUERY SELECT true, CASE WHEN v_is_stop THEN 'SUPERVISED_TEST_STOP_RECORDED' ELSE 'SUPERVISED_TEST_REPLY_RECORDED' END::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_elite_solar_supervised_test_call_event(
  p_provider_event_key text, p_provider_call_id text, p_dispatch_id uuid,
  p_test_run_id uuid, p_event text, p_occurred_at timestamptz,
  p_payload_sha256 text, p_agent_id text, p_agent_version integer
)
RETURNS TABLE (recorded boolean, result_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_dispatch public.elite_solar_supervised_test_dispatches%ROWTYPE; v_run public.elite_solar_supervised_test_runs%ROWTYPE; v_target public.elite_solar_supervised_test_targets%ROWTYPE; v_id uuid;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_provider_event_key IS NULL OR p_provider_event_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_provider_call_id IS NULL OR p_provider_call_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_dispatch_id IS NULL OR p_test_run_id IS NULL OR p_event IS NULL OR p_event NOT IN ('call_started', 'call_ended', 'call_analyzed', 'call_failed')
    OR p_occurred_at IS NULL OR p_payload_sha256 IS NULL OR lower(p_payload_sha256) !~ '^[a-f0-9]{64}$'
    OR p_agent_id IS NULL OR p_agent_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$' OR p_agent_version IS NULL OR p_agent_version < 0
  THEN RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_CALL_EVENT_INPUT_INVALID' USING ERRCODE = '22023'; END IF;
  SELECT dispatch.*, run.*, target.* INTO v_dispatch, v_run, v_target
  FROM public.elite_solar_supervised_test_dispatches AS dispatch
  JOIN public.elite_solar_supervised_test_runs AS run ON run.id = dispatch.run_id
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE dispatch.id = p_dispatch_id AND dispatch.run_id = p_test_run_id
    AND dispatch.provider = 'retell' AND dispatch.channel = 'voice'
    AND dispatch.status = 'accepted' AND dispatch.provider_object_id = p_provider_call_id
    AND dispatch.retell_agent_id = p_agent_id AND dispatch.retell_agent_version = p_agent_version
    AND target.retell_agent_id = p_agent_id AND target.retell_agent_version = p_agent_version
  FOR UPDATE OF dispatch;
  IF v_dispatch.id IS NULL THEN
    RETURN QUERY SELECT false, 'SUPERVISED_TEST_CALL_EVENT_NOT_MATCHED'::text; RETURN;
  END IF;
  INSERT INTO public.elite_solar_supervised_test_call_event_receipts (
    run_id, dispatch_id, organization_id, owner_user_id, provider_event_key,
    provider_call_id, event, occurred_at, payload_sha256, agent_id, agent_version
  ) VALUES (
    v_run.id, v_dispatch.id, v_run.organization_id, v_run.owner_user_id, p_provider_event_key,
    p_provider_call_id, p_event, p_occurred_at, lower(p_payload_sha256), p_agent_id, p_agent_version
  ) ON CONFLICT (provider_event_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, 'SUPERVISED_TEST_CALL_EVENT_DUPLICATE_OR_REPLAY'::text; RETURN;
  END IF;
  RETURN QUERY SELECT true, 'SUPERVISED_TEST_CALL_EVENT_RECORDED'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_elite_solar_supervised_test_handoff(
  p_owner_user_id uuid, p_organization_id uuid, p_campaign_id uuid,
  p_plan_id text, p_plan_version text, p_stop_on_first_inbound_reply boolean,
  p_inbound_reply_outcome text, p_run_id uuid DEFAULT NULL
)
RETURNS TABLE (run_id uuid, run_state text, reason_code text, dispatch_authorized boolean, dispatch_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.elite_solar_supervised_test_runs%ROWTYPE;
  v_target public.elite_solar_supervised_test_targets%ROWTYPE;
  v_handoff public.elite_solar_supervised_test_handoffs%ROWTYPE;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_run_id IS NULL OR p_owner_user_id IS NULL OR p_organization_id IS NULL OR p_campaign_id IS NULL
    OR p_plan_id IS DISTINCT FROM 'elite_solar_self_test_v1'
    OR p_plan_version IS DISTINCT FROM '2026-07-26'
    OR p_stop_on_first_inbound_reply IS DISTINCT FROM true
    OR p_inbound_reply_outcome IS DISTINCT FROM 'halt_and_human_handoff'
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_HANDOFF_COMPLETE_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT run.*, target.* INTO v_run, v_target
  FROM public.elite_solar_supervised_test_runs AS run
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE run.id = p_run_id
    AND run.organization_id = p_organization_id
    AND run.owner_user_id = p_owner_user_id
    AND run.campaign_id = p_campaign_id
    AND run.plan_id = p_plan_id
    AND run.plan_version = p_plan_version
    AND target.organization_id = p_organization_id
    AND target.owner_user_id = p_owner_user_id
    AND target.campaign_id = p_campaign_id
    AND target.plan_id = p_plan_id
    AND target.plan_version = p_plan_version
  FOR UPDATE OF run, target;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_RUN_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_handoff
  FROM public.elite_solar_supervised_test_handoffs AS handoff
  WHERE handoff.run_id = v_run.id
    AND handoff.organization_id = p_organization_id
    AND handoff.owner_user_id = p_owner_user_id
    AND handoff.campaign_id = p_campaign_id
    AND handoff.lead_id = v_run.lead_id
  FOR UPDATE;
  IF v_handoff.id IS NULL THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_HANDOFF_NOT_AVAILABLE'::text, false, NULL::uuid;
    RETURN;
  END IF;
  IF v_run.provider_reconciliation_required OR v_handoff.provider_reconciliation_required THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_HANDOFF_RECONCILIATION_REQUIRED'::text, false, NULL::uuid;
    RETURN;
  END IF;
  IF v_run.status = 'completed' AND v_handoff.status = 'completed' THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_HANDOFF_ALREADY_COMPLETED'::text, false, NULL::uuid;
    RETURN;
  END IF;
  IF v_run.status <> 'engaged' OR v_handoff.status NOT IN ('open', 'acknowledged') THEN
    RETURN QUERY SELECT v_run.id, v_run.status, 'SUPERVISED_TEST_HANDOFF_NOT_COMPLETEABLE'::text, false, NULL::uuid;
    RETURN;
  END IF;

  UPDATE public.elite_solar_supervised_test_handoffs
  SET status = 'completed', completed_at = now()
  WHERE id = v_handoff.id
    AND status IN ('open', 'acknowledged')
    AND provider_reconciliation_required = false
  RETURNING * INTO v_handoff;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_HANDOFF_STATE_CHANGED' USING ERRCODE = '40001';
  END IF;

  UPDATE public.elite_solar_supervised_test_runs
  SET status = 'completed', completed_at = now(),
      terminal_reason_code = 'SUPERVISED_TEST_HANDOFF_COMPLETED', updated_at = now()
  WHERE id = v_run.id
    AND status = 'engaged'
    AND provider_reconciliation_required = false
  RETURNING * INTO v_run;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_RUN_STATE_CHANGED' USING ERRCODE = '40001';
  END IF;

  RETURN QUERY SELECT v_run.id, v_run.status, v_run.terminal_reason_code, false, NULL::uuid;
END;
$$;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_targets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_steps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_dispatches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_inbound_receipts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_handoffs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.elite_solar_supervised_test_call_event_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.elite_solar_supervised_test_targets, public.elite_solar_supervised_test_runs, public.elite_solar_supervised_test_steps, public.elite_solar_supervised_test_dispatches, public.elite_solar_supervised_test_inbound_receipts, public.elite_solar_supervised_test_handoffs, public.elite_solar_supervised_test_call_event_receipts TO service_role;

REVOKE ALL ON FUNCTION public.require_elite_solar_supervised_test_service() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.configure_elite_solar_supervised_test_target(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.arm_elite_solar_supervised_test_run(uuid, uuid, uuid, text, text, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_elite_solar_supervised_test_run_status(uuid, uuid, uuid, text, text, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_elite_solar_supervised_test_run(uuid, uuid, uuid, text, text, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_elite_solar_supervised_test_run(uuid, uuid, uuid, text, text, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_elite_solar_supervised_test_handoff(uuid, uuid, uuid, text, text, boolean, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_elite_solar_supervised_test_dispatch(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_elite_solar_supervised_test_dispatch(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_elite_solar_supervised_test_reply(text, text, text, text, timestamptz, text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_elite_solar_supervised_test_call_event(text, text, uuid, uuid, text, timestamptz, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.configure_elite_solar_supervised_test_target(uuid, uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer, text, text, text, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.arm_elite_solar_supervised_test_run(uuid, uuid, uuid, text, text, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_elite_solar_supervised_test_run_status(uuid, uuid, uuid, text, text, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_elite_solar_supervised_test_run(uuid, uuid, uuid, text, text, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_elite_solar_supervised_test_run(uuid, uuid, uuid, text, text, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_elite_solar_supervised_test_handoff(uuid, uuid, uuid, text, text, boolean, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_elite_solar_supervised_test_dispatch(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_elite_solar_supervised_test_dispatch(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_elite_solar_supervised_test_reply(text, text, text, text, timestamptz, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_elite_solar_supervised_test_call_event(text, text, uuid, uuid, text, timestamptz, text, text, integer) TO service_role;

COMMENT ON TABLE public.elite_solar_supervised_test_runs IS 'One explicitly configured, one-contact Elite Solar supervised test. No generic campaign work is authorized by this table.';
COMMENT ON FUNCTION public.record_elite_solar_supervised_test_reply(text, text, text, text, timestamptz, text, text, text, text) IS 'Service-only atomic first-reply receipt: cancels unsent supervised steps, moves the lead to its exact configured campaign board, creates a human handoff, and writes durable DNC on STOP.';
COMMENT ON FUNCTION public.complete_elite_solar_supervised_test_handoff(uuid, uuid, uuid, text, text, boolean, text, uuid) IS 'Service-only exact-owner handoff completion. It only completes an engaged non-reconciliation run and never clears STOP or DNC state.';

COMMIT;
