BEGIN;

-- These functions predate the certified schema lineage.  Their bodies still
-- referenced a replaced column name, reused polymorphic RECORD variables with
-- incompatible row shapes, or assumed pgcrypto was on the function search
-- path.  Recompile them against the canonical schema with explicit relations.

CREATE OR REPLACE FUNCTION public.get_agent_customer_price(
  p_organization_id uuid,
  p_retell_agent_id text
)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  custom_price numeric;
  default_price numeric;
BEGIN
  SELECT pricing.customer_price_per_min_cents
  INTO custom_price
  FROM public.agent_pricing AS pricing
  WHERE pricing.organization_id = p_organization_id
    AND pricing.retell_agent_id = p_retell_agent_id
    AND pricing.is_active = true;

  SELECT credits.cost_per_minute_cents
  INTO default_price
  FROM public.organization_credits AS credits
  WHERE credits.organization_id = p_organization_id;

  RETURN COALESCE(custom_price, default_price, 15.0);
END;
$$;

CREATE OR REPLACE FUNCTION public.predict_lead_conversion(
  p_user_id uuid,
  p_lead_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_model public.ml_models%ROWTYPE;
  v_lead public.leads%ROWTYPE;
  v_journey public.lead_journey_state%ROWTYPE;
  v_intent public.lead_intent_signals%ROWTYPE;
  v_logit numeric := 0;
  v_coeff jsonb;
BEGIN
  SELECT * INTO v_model
  FROM public.ml_models AS model
  WHERE model.user_id = p_user_id
    AND model.model_type = 'lead_conversion'
    AND model.is_active = true
  ORDER BY model.version DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN 0.5;
  END IF;

  SELECT * INTO v_lead
  FROM public.leads AS lead
  WHERE lead.id = p_lead_id
    AND lead.user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN 0.5;
  END IF;

  SELECT * INTO v_journey
  FROM public.lead_journey_state AS journey
  WHERE journey.lead_id = p_lead_id
    AND journey.user_id = p_user_id;

  SELECT * INTO v_intent
  FROM public.lead_intent_signals AS intent
  WHERE intent.lead_id = p_lead_id
    AND intent.user_id = p_user_id
  ORDER BY intent.created_at DESC
  LIMIT 1;

  v_coeff := v_model.coefficients;
  v_logit := COALESCE((v_coeff ->> 'intercept')::numeric, 0);
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'recency_days')::numeric, 0)
      * LEAST(
        COALESCE(
          EXTRACT(
            EPOCH FROM now() - COALESCE(
              v_journey.perpetual_last_touch_at,
              v_journey.updated_at,
              v_lead.created_at
            )
          ) / 86400,
          30
        ) / 90.0,
        1.0
      );
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'total_calls')::numeric, 0)
      * LEAST(COALESCE(v_journey.total_calls, 0)::numeric / 10.0, 1.0);
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'interest_level')::numeric, 0)
      * LEAST(COALESCE(v_intent.call_interest_score, 0)::numeric / 10.0, 1.0);
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'engagement_score')::numeric, 0)
      * LEAST(COALESCE(v_journey.engagement_score, 0)::numeric / 100.0, 1.0);
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'has_intent_timeline')::numeric, 0)
      * CASE WHEN v_intent.timeline IS NOT NULL THEN 1 ELSE 0 END;
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'is_decision_maker')::numeric, 0)
      * CASE WHEN v_intent.is_decision_maker THEN 1 ELSE 0 END;
  v_logit := v_logit
    + COALESCE((v_coeff -> 'features' ->> 'sentiment_score')::numeric, 0)
      * COALESCE(v_journey.sentiment_score, 0.5);

  RETURN public.sigmoid(v_logit);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_number_health(
  p_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  updated_count integer := 0;
  rec record;
  h1_calls integer;
  h24_calls integer;
  d7_calls integer;
  h24_answered integer;
  d7_answered integer;
  d30_answered integer;
  d30_total integer;
  h24_vm integer;
  spam_risk numeric;
  health integer;
  safe_daily integer;
  rest_until timestamptz;
BEGIN
  FOR rec IN
    SELECT phone.id, phone.number
    FROM public.phone_numbers AS phone
    WHERE phone.user_id = p_user_id
      AND phone.status = 'active'
  LOOP
    SELECT
      COUNT(*) FILTER (WHERE call_log.created_at > now() - INTERVAL '1 hour'),
      COUNT(*) FILTER (WHERE call_log.created_at > now() - INTERVAL '24 hours'),
      COUNT(*) FILTER (WHERE call_log.created_at > now() - INTERVAL '7 days'),
      COUNT(*) FILTER (
        WHERE call_log.created_at > now() - INTERVAL '24 hours'
          AND call_log.outcome IN ('completed', 'answered', 'appointment_set', 'interested', 'callback')
      ),
      COUNT(*) FILTER (
        WHERE call_log.created_at > now() - INTERVAL '7 days'
          AND call_log.outcome IN ('completed', 'answered', 'appointment_set', 'interested', 'callback')
      ),
      COUNT(*) FILTER (
        WHERE call_log.created_at > now() - INTERVAL '30 days'
          AND call_log.outcome IN ('completed', 'answered', 'appointment_set', 'interested', 'callback')
      ),
      COUNT(*) FILTER (WHERE call_log.created_at > now() - INTERVAL '30 days'),
      COUNT(*) FILTER (
        WHERE call_log.created_at > now() - INTERVAL '24 hours'
          AND call_log.outcome IN ('voicemail', 'left_voicemail')
      )
    INTO h1_calls, h24_calls, d7_calls, h24_answered, d7_answered,
      d30_answered, d30_total, h24_vm
    FROM public.call_logs AS call_log
    WHERE call_log.caller_id = rec.number
      AND call_log.user_id = p_user_id;

    spam_risk := 0;
    IF h24_calls > 80 THEN spam_risk := spam_risk + 0.3; END IF;
    IF h24_calls > 50 THEN spam_risk := spam_risk + 0.15; END IF;
    IF h1_calls > 20 THEN spam_risk := spam_risk + 0.2; END IF;
    IF h24_calls > 0 AND (h24_answered::numeric / h24_calls) < 0.05 THEN spam_risk := spam_risk + 0.25; END IF;
    IF h24_calls > 0 AND (h24_vm::numeric / h24_calls) > 0.9 THEN spam_risk := spam_risk + 0.1; END IF;
    spam_risk := LEAST(1.0, spam_risk);

    health := 100;
    health := health - LEAST(40, h24_calls / 2);
    health := health - LEAST(30, (spam_risk * 30)::integer);
    IF d7_calls > 0 AND (d7_answered::numeric / d7_calls) < 0.05 THEN
      health := health - 20;
    END IF;
    health := GREATEST(0, health);

    safe_daily := CASE
      WHEN spam_risk > 0.7 THEN 0
      WHEN spam_risk > 0.5 THEN 20
      WHEN spam_risk > 0.3 THEN 50
      WHEN spam_risk > 0.15 THEN 80
      ELSE 100
    END;

    rest_until := CASE
      WHEN health < 20 THEN now() + INTERVAL '48 hours'
      WHEN health < 40 THEN now() + INTERVAL '24 hours'
      WHEN health < 60 THEN now() + INTERVAL '12 hours'
      ELSE NULL
    END;

    INSERT INTO public.number_health_metrics (
      user_id, phone_number, phone_number_id,
      calls_last_hour, calls_last_24h, calls_last_7d,
      answer_rate_24h, answer_rate_7d, answer_rate_30d,
      voicemail_rate_24h,
      predicted_spam_risk, spam_risk_factors,
      recommended_rest_until, max_safe_daily_calls,
      health_score, last_calculated
    ) VALUES (
      p_user_id, rec.number, rec.id,
      h1_calls, h24_calls, d7_calls,
      CASE WHEN h24_calls > 0 THEN h24_answered::numeric / h24_calls ELSE 0 END,
      CASE WHEN d7_calls > 0 THEN d7_answered::numeric / d7_calls ELSE 0 END,
      CASE WHEN d30_total > 0 THEN d30_answered::numeric / d30_total ELSE 0 END,
      CASE WHEN h24_calls > 0 THEN h24_vm::numeric / h24_calls ELSE 0 END,
      spam_risk,
      jsonb_build_object(
        'velocity_24h', h24_calls,
        'velocity_1h', h1_calls,
        'answer_rate_24h', CASE WHEN h24_calls > 0 THEN ROUND(h24_answered::numeric / h24_calls, 4) ELSE 0 END,
        'voicemail_rate_24h', CASE WHEN h24_calls > 0 THEN ROUND(h24_vm::numeric / h24_calls, 4) ELSE 0 END
      ),
      rest_until, safe_daily,
      health, now()
    )
    ON CONFLICT (user_id, phone_number) DO UPDATE SET
      calls_last_hour = EXCLUDED.calls_last_hour,
      calls_last_24h = EXCLUDED.calls_last_24h,
      calls_last_7d = EXCLUDED.calls_last_7d,
      answer_rate_24h = EXCLUDED.answer_rate_24h,
      answer_rate_7d = EXCLUDED.answer_rate_7d,
      answer_rate_30d = EXCLUDED.answer_rate_30d,
      voicemail_rate_24h = EXCLUDED.voicemail_rate_24h,
      predicted_spam_risk = EXCLUDED.predicted_spam_risk,
      spam_risk_factors = EXCLUDED.spam_risk_factors,
      recommended_rest_until = EXCLUDED.recommended_rest_until,
      max_safe_daily_calls = EXCLUDED.max_safe_daily_calls,
      health_score = EXCLUDED.health_score,
      last_calculated = now();

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.mint_api_key(
  p_user_id uuid,
  p_name text,
  p_scopes text[] DEFAULT ARRAY['read']::text[],
  p_organization_id uuid DEFAULT NULL,
  p_rate_limit integer DEFAULT 600,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  plaintext text,
  key_prefix text,
  scopes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  selected_organization_id uuid;
  membership_count integer;
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  random_part text := '';
  random_byte integer;
  character_index integer;
  plaintext_key text;
  hashed_key text;
  prefix text;
  inserted_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_name IS NULL OR length(btrim(p_name)) = 0 THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;
  IF p_rate_limit IS NULL OR p_rate_limit < 1 OR p_rate_limit > 10000 THEN
    RAISE EXCEPTION 'p_rate_limit must be between 1 and 10000';
  END IF;

  IF p_organization_id IS NULL THEN
    SELECT count(DISTINCT membership.organization_id), min(membership.organization_id::text)::uuid
    INTO membership_count, selected_organization_id
    FROM public.organization_users AS membership
    WHERE membership.user_id = p_user_id;

    IF membership_count <> 1 THEN
      RAISE EXCEPTION 'An explicit p_organization_id is required for a user with % memberships', membership_count;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.user_id = p_user_id
      AND membership.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'The user is not a member of the requested organization'
      USING ERRCODE = '42501';
  ELSE
    selected_organization_id := p_organization_id;
  END IF;

  FOR character_index IN 1..32 LOOP
    random_byte := get_byte(extensions.gen_random_bytes(1), 0);
    random_part := random_part || substr(alphabet, (random_byte % 62) + 1, 1);
  END LOOP;

  plaintext_key := 'dsk_live_' || random_part;
  hashed_key := encode(extensions.digest(plaintext_key, 'sha256'), 'hex');
  prefix := substring(plaintext_key FOR 12);

  INSERT INTO public.api_keys (
    user_id,
    organization_id,
    name,
    key_prefix,
    key_hash,
    scopes,
    rate_limit_per_minute,
    expires_at
  ) VALUES (
    p_user_id,
    selected_organization_id,
    btrim(p_name),
    prefix,
    hashed_key,
    COALESCE(p_scopes, ARRAY['read']::text[]),
    p_rate_limit,
    p_expires_at
  )
  RETURNING api_keys.id INTO inserted_id;

  RETURN QUERY
  SELECT inserted_id, plaintext_key, prefix, COALESCE(p_scopes, ARRAY['read']::text[]);
END;
$$;

REVOKE ALL ON FUNCTION public.mint_api_key(uuid, text, text[], uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_api_key(uuid, text, text[], uuid, integer, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.get_agent_customer_price(uuid, text) IS
  'Returns tenant-bound active agent pricing or the organization default without polymorphic record-shape drift.';
COMMENT ON FUNCTION public.predict_lead_conversion(uuid, uuid) IS
  'Computes a user-bound lead-conversion score from the canonical journey schema; absent model or lead returns 0.5.';
COMMENT ON FUNCTION public.recalculate_number_health(uuid) IS
  'Service-only health recalculation using canonical phone_numbers.number provider identity.';
COMMENT ON FUNCTION public.mint_api_key(uuid, text, text[], uuid, integer, timestamptz) IS
  'Service-only tenant-aware API-key minting with explicit pgcrypto schema qualification.';

COMMIT;
