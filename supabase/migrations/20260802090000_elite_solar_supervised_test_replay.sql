BEGIN;

ALTER TABLE public.elite_solar_supervised_test_call_event_receipts
ADD COLUMN IF NOT EXISTS call_recording_url text,
ADD COLUMN IF NOT EXISTS call_transcript text;

ALTER TABLE public.elite_solar_supervised_test_call_event_receipts
  ADD CONSTRAINT IF NOT EXISTS elite_solar_supervised_test_call_event_receipts_recording_url_format_ck
    CHECK (call_recording_url IS NULL OR call_recording_url ~ '^https://.+$');

CREATE INDEX IF NOT EXISTS elite_solar_supervised_test_call_event_receipts_run_id_occurred_at_idx
  ON public.elite_solar_supervised_test_call_event_receipts (run_id, occurred_at DESC);

CREATE OR REPLACE FUNCTION public.record_elite_solar_supervised_test_call_event(
  p_provider_event_key text,
  p_provider_call_id text,
  p_dispatch_id uuid,
  p_test_run_id uuid,
  p_event text,
  p_occurred_at timestamptz,
  p_payload_sha256 text,
  p_agent_id text,
  p_agent_version integer,
  p_call_recording_url text DEFAULT NULL,
  p_call_transcript text DEFAULT NULL
)
RETURNS TABLE (recorded boolean, result_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.elite_solar_supervised_test_dispatches%ROWTYPE;
  v_run public.elite_solar_supervised_test_runs%ROWTYPE;
  v_target public.elite_solar_supervised_test_targets%ROWTYPE;
  v_id uuid;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();
  IF p_provider_event_key IS NULL OR p_provider_event_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_provider_call_id IS NULL OR p_provider_call_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_dispatch_id IS NULL OR p_test_run_id IS NULL OR p_event IS NULL
    OR p_event NOT IN ('call_started', 'call_ended', 'call_analyzed', 'call_failed')
    OR p_occurred_at IS NULL OR p_payload_sha256 IS NULL OR lower(p_payload_sha256) !~ '^[a-f0-9]{64}$'
    OR p_agent_id IS NULL OR p_agent_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,255}$'
    OR p_agent_version IS NULL OR p_agent_version < 0
    OR (p_call_recording_url IS NOT NULL AND p_call_recording_url !~ '^https://.+$')
    OR (p_call_transcript IS NOT NULL
        AND length(p_call_transcript) > 24000)
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_CALL_EVENT_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT dispatch.*, run.*, target.*
  INTO v_dispatch, v_run, v_target
  FROM public.elite_solar_supervised_test_dispatches AS dispatch
  JOIN public.elite_solar_supervised_test_runs AS run ON run.id = dispatch.run_id
  JOIN public.elite_solar_supervised_test_targets AS target ON target.id = run.target_id
  WHERE dispatch.id = p_dispatch_id
    AND dispatch.run_id = p_test_run_id
    AND dispatch.provider = 'retell'
    AND dispatch.channel = 'voice'
    AND dispatch.status = 'accepted'
    AND dispatch.provider_object_id = p_provider_call_id
    AND dispatch.retell_agent_id = p_agent_id
    AND dispatch.retell_agent_version = p_agent_version
    AND target.retell_agent_id = p_agent_id
    AND target.retell_agent_version = p_agent_version
  FOR UPDATE OF dispatch;

  IF v_dispatch.id IS NULL THEN
    RETURN QUERY SELECT false, 'SUPERVISED_TEST_CALL_EVENT_NOT_MATCHED'::text; RETURN;
  END IF;

  INSERT INTO public.elite_solar_supervised_test_call_event_receipts (
    run_id, dispatch_id, organization_id, owner_user_id,
    provider_event_key, provider_call_id, event, occurred_at,
    payload_sha256, agent_id, agent_version,
    call_recording_url, call_transcript
  ) VALUES (
    v_run.id, v_dispatch.id, v_run.organization_id, v_run.owner_user_id,
    p_provider_event_key, p_provider_call_id, p_event, p_occurred_at,
    lower(p_payload_sha256), p_agent_id, p_agent_version,
    p_call_recording_url, p_call_transcript
  ) ON CONFLICT (provider_event_key) DO NOTHING RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT false, 'SUPERVISED_TEST_CALL_EVENT_DUPLICATE_OR_REPLAY'::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, 'SUPERVISED_TEST_CALL_EVENT_RECORDED'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_elite_solar_supervised_test_replay(
  p_owner_user_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid,
  p_plan_id text,
  p_plan_version text,
  p_run_id uuid
)
RETURNS TABLE (replay jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run public.elite_solar_supervised_test_runs%ROWTYPE;
  v_target public.elite_solar_supervised_test_targets%ROWTYPE;
  v_steps jsonb;
  v_inbound jsonb;
  v_call_events jsonb;
  v_handoff jsonb;
BEGIN
  PERFORM public.require_elite_solar_supervised_test_service();

  IF p_run_id IS NULL OR p_owner_user_id IS NULL OR p_organization_id IS NULL
    OR p_campaign_id IS NULL OR p_plan_id IS NULL OR p_plan_version IS NULL
    OR p_plan_id <> 'elite_solar_self_test_v1'
    OR p_plan_version <> '2026-07-26'
  THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_REPLAY_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  SELECT run.*, target.*
  INTO v_run, v_target
  FROM public.elite_solar_supervised_test_runs AS run
  JOIN public.elite_solar_supervised_test_targets AS target
    ON target.id = run.target_id
  WHERE run.id = p_run_id
    AND run.owner_user_id = p_owner_user_id
    AND run.organization_id = p_organization_id
    AND run.campaign_id = p_campaign_id
    AND run.plan_id = p_plan_id
    AND run.plan_version = p_plan_version
    AND target.organization_id = p_organization_id
    AND target.owner_user_id = p_owner_user_id
    AND target.campaign_id = p_campaign_id
    AND target.revoked_at IS NULL;

  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'ELITE_SOLAR_SUPERVISED_TEST_REPLAY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'step_id', s.id,
        'ordinal', s.ordinal,
        'provider', s.provider,
        'channel', s.channel,
        'simulated_elapsed_minutes', s.simulated_elapsed_minutes,
        'compressed_offset_seconds', s.compressed_offset_seconds,
        'simulation_label', s.simulation_label,
        'not_before_at', s.not_before_at,
        'message_body', s.message_body,
        'status', s.status,
        'accepted_at', s.accepted_at,
        'cancelled_at', s.cancelled_at,
        'cancellation_reason_code', s.cancellation_reason_code,
        'dispatch', CASE
          WHEN d.id IS NULL THEN NULL
          ELSE jsonb_build_object(
            'dispatch_id', d.id,
            'status', d.status,
            'provider_object_id', d.provider_object_id,
            'authorized_at', d.authorized_at,
            'claimed_at', d.claimed_at,
            'finalized_at', d.finalized_at,
            'error_code', d.error_code,
            'provider_response_sha256', d.provider_response_sha256
          )
        END
      )
      ORDER BY s.ordinal
    ),
    '[]'::jsonb
  )
  INTO v_steps
  FROM public.elite_solar_supervised_test_steps AS s
  LEFT JOIN public.elite_solar_supervised_test_dispatches AS d
    ON d.step_id = s.id
  WHERE s.run_id = v_run.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'receipt_id', r.id,
        'provider_event_id', r.provider_event_id,
        'provider_message_id', r.provider_message_id,
        'occurred_at', r.occurred_at,
        'message_text', r.message_text,
        'is_first_reply', r.is_first_reply,
        'is_stop', r.is_stop,
        'recorded_at', r.recorded_at
      )
      ORDER BY r.occurred_at, r.recorded_at
    ),
    '[]'::jsonb
  )
  INTO v_inbound
  FROM public.elite_solar_supervised_test_inbound_receipts AS r
  WHERE r.run_id = v_run.id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'event_id', e.id,
        'dispatch_id', e.dispatch_id,
        'provider_call_id', e.provider_call_id,
        'event', e.event,
        'occurred_at', e.occurred_at,
        'agent_id', e.agent_id,
        'agent_version', e.agent_version,
        'recording_url', e.call_recording_url,
        'transcript', e.call_transcript,
        'recorded_at', e.recorded_at
      )
      ORDER BY e.occurred_at, e.recorded_at
    ),
    '[]'::jsonb
  )
  INTO v_call_events
  FROM public.elite_solar_supervised_test_call_event_receipts AS e
  WHERE e.run_id = v_run.id;

  SELECT to_jsonb(h.*)
  INTO v_handoff
  FROM public.elite_solar_supervised_test_handoffs AS h
  WHERE h.run_id = v_run.id;

  RETURN QUERY SELECT jsonb_build_object(
    'run', jsonb_build_object(
      'run_id', v_run.id,
      'status', v_run.status,
      'plan_id', v_run.plan_id,
      'plan_version', v_run.plan_version,
      'stop_on_first_inbound_reply', v_run.stop_on_first_inbound_reply,
      'inbound_reply_outcome', v_run.inbound_reply_outcome,
      'current_step_ordinal', v_run.current_step_ordinal,
      'stop_requested', v_run.stop_requested,
      'provider_reconciliation_required', v_run.provider_reconciliation_required,
      'terminal_reason_code', v_run.terminal_reason_code,
      'armed_at', v_run.armed_at,
      'completed_at', v_run.completed_at,
      'cancelled_at', v_run.cancelled_at,
      'from_e164', v_run.from_e164,
      'to_e164', v_run.to_e164
    ),
    'target', jsonb_build_object(
      'target_id', v_target.id,
      'sms_step_1_body', v_target.sms_step_1_body,
      'sms_step_2_body', v_target.sms_step_2_body,
      'sms_step_3_body', v_target.sms_step_3_body,
      'retell_agent_id', v_target.retell_agent_id,
      'retell_agent_version', v_target.retell_agent_version
    ),
    'steps', v_steps,
    'inbound_sms', v_inbound,
    'call_events', v_call_events,
    'handoff', COALESCE(v_handoff, NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_elite_solar_supervised_test_call_event(
  text, text, uuid, uuid, text, timestamptz, text, text, integer, text, text
) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_elite_solar_supervised_test_replay(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_elite_solar_supervised_test_call_event(
  text, text, uuid, uuid, text, timestamptz, text, text, integer, text, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_elite_solar_supervised_test_replay(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;

COMMENT ON TABLE public.elite_solar_supervised_test_call_event_receipts IS
  'Test call receipts now capture optional recording + transcript so supervised campaign replays can render a customer/agent conversation timeline for QA.';
COMMENT ON FUNCTION public.record_elite_solar_supervised_test_call_event(
  text, text, uuid, uuid, text, timestamptz, text, text, integer, text, text
) IS
  'Records immutable Retell lifecycle receipts for a supervised test run. Supports optional call recording URL and transcript for replay visualization.';
COMMENT ON FUNCTION public.get_elite_solar_supervised_test_replay(
  uuid, uuid, uuid, text, text, uuid
) IS
  'Returns a replay snapshot for an owned supervised test run including planned steps, inbound SMS, and call events.';

COMMIT;
