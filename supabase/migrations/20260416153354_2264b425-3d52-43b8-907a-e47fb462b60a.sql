CREATE OR REPLACE FUNCTION public.predict_lead_conversion(p_user_id uuid, p_lead_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
AS $function$
DECLARE v_model RECORD; v_lead RECORD; v_journey RECORD; v_intent RECORD; v_logit NUMERIC := 0; v_coeff JSONB;
BEGIN
  SELECT * INTO v_model FROM ml_models WHERE user_id = p_user_id AND model_type = 'lead_conversion' AND is_active = true ORDER BY version DESC LIMIT 1;
  IF v_model IS NULL THEN RETURN 0.5; END IF;
  v_coeff := v_model.coefficients;
  SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
  SELECT * INTO v_journey FROM lead_journey_state WHERE lead_id = p_lead_id;
  SELECT * INTO v_intent FROM lead_intent_signals WHERE lead_id = p_lead_id ORDER BY created_at DESC LIMIT 1;
  v_logit := COALESCE((v_coeff->>'intercept')::NUMERIC, 0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'recency_days')::NUMERIC, 0) * LEAST(COALESCE(EXTRACT(EPOCH FROM now() - COALESCE(v_journey.last_touch_at, v_lead.created_at)) / 86400, 30) / 90.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'total_calls')::NUMERIC, 0) * LEAST(COALESCE(v_journey.total_calls, 0)::NUMERIC / 10.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'interest_level')::NUMERIC, 0) * LEAST(COALESCE(v_journey.interest_level, 0)::NUMERIC / 10.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'engagement_score')::NUMERIC, 0) * LEAST(COALESCE(v_journey.engagement_score, 0)::NUMERIC / 100.0, 1.0);
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'has_intent_timeline')::NUMERIC, 0) * CASE WHEN v_intent.timeline IS NOT NULL THEN 1 ELSE 0 END;
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'is_decision_maker')::NUMERIC, 0) * CASE WHEN v_intent.is_decision_maker THEN 1 ELSE 0 END;
  v_logit := v_logit + COALESCE((v_coeff->'features'->>'sentiment_score')::NUMERIC, 0) * COALESCE(v_journey.sentiment_score, 0.5);
  RETURN sigmoid(v_logit);
END;
$function$;