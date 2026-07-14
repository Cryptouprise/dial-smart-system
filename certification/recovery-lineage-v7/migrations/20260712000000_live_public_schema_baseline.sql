-- DIAL SMART OFFLINE DATABASE RECOVERY BASELINE CANDIDATE
-- Source schema SHA-256: c87c5dccd8dcc250c0685cfb0d827524b13ec15c185e39bd8bc478f62a9783bf
-- This file is for a new disposable/staging lineage only.
-- Never apply this baseline to the existing production database.
--
-- PostgreSQL database dump
--


-- Dumped from database version 15.8
-- Dumped by pg_dump version 15.18

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'manager',
    'user'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";

--
-- Name: add_credits("uuid", integer, "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."add_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_transaction_type" "text" DEFAULT 'manual_add'::"text", "p_description" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "new_balance_cents" integer, "transaction_id" "uuid", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_transaction_id UUID;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_transaction_id
    FROM credit_transactions
    WHERE idempotency_key = p_idempotency_key;

    IF v_transaction_id IS NOT NULL THEN
      SELECT ct.balance_after_cents INTO v_new_balance
      FROM credit_transactions ct WHERE ct.id = v_transaction_id;

      RETURN QUERY SELECT true, v_new_balance, v_transaction_id, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Lock and get current balance
  SELECT balance_cents INTO v_current_balance
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;

  -- If no record exists, create one
  IF v_current_balance IS NULL THEN
    INSERT INTO organization_credits (organization_id, balance_cents)
    VALUES (p_organization_id, 0)
    ON CONFLICT (organization_id) DO NOTHING;
    v_current_balance := 0;
  END IF;

  v_new_balance := v_current_balance + p_amount_cents;

  UPDATE organization_credits
  SET balance_cents = v_new_balance,
      updated_at = now(),
      last_recharge_at = CASE WHEN p_amount_cents > 0 THEN now() ELSE last_recharge_at END
  WHERE organization_id = p_organization_id;

  INSERT INTO credit_transactions (
    organization_id, transaction_type, amount_cents,
    balance_before_cents, balance_after_cents, description, idempotency_key
  ) VALUES (
    p_organization_id, p_transaction_type, p_amount_cents,
    v_current_balance, v_new_balance, p_description, p_idempotency_key
  )
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT true, v_new_balance, v_transaction_id, NULL::TEXT;
END;
$$;


ALTER FUNCTION "public"."add_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_transaction_type" "text", "p_description" "text", "p_idempotency_key" "text") OWNER TO "postgres";

--
-- Name: api_keys_touch_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."api_keys_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."api_keys_touch_updated_at"() OWNER TO "postgres";

--
-- Name: auto_route_to_contacting(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."auto_route_to_contacting"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_user_id UUID;
  v_board_id UUID;
BEGIN
  -- Get the user_id from the campaign
  SELECT user_id INTO v_user_id FROM public.campaigns WHERE id = NEW.campaign_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  -- Find the user's "Contacting" board
  SELECT id INTO v_board_id
  FROM public.pipeline_boards
  WHERE user_id = v_user_id AND name = 'Contacting'
  ORDER BY position ASC, created_at ASC
  LIMIT 1;
  IF v_board_id IS NULL THEN RETURN NEW; END IF;

  -- Upsert the lead's position to Contacting (only if not already in a terminal board)
  INSERT INTO public.lead_pipeline_positions (
    user_id, lead_id, pipeline_board_id, position, moved_at, moved_by_user, notes
  ) VALUES (
    v_user_id, NEW.lead_id, v_board_id, 0, now(), false,
    'Auto-routed to Contacting on campaign add'
  )
  ON CONFLICT (lead_id, user_id) DO UPDATE
    SET pipeline_board_id = EXCLUDED.pipeline_board_id,
        moved_at = now(),
        notes = 'Auto-routed to Contacting on campaign add'
    WHERE
      -- Don't overwrite terminal/positive states
      lead_pipeline_positions.pipeline_board_id NOT IN (
        SELECT id FROM public.pipeline_boards
        WHERE user_id = v_user_id
          AND name IN ('Transferred','DNC','Already Has Solar','Bad Number / Wrong Number','Appointment Booked','Hot Leads')
      );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."auto_route_to_contacting"() OWNER TO "postgres";

--
-- Name: calculate_agent_base_cost("text", "text", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."calculate_agent_base_cost"("p_llm_model" "text", "p_voice_provider" "text", "p_has_knowledge_base" boolean DEFAULT false) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_llm_cost NUMERIC(10,4) := 0;
  v_voice_cost NUMERIC(10,4) := 0;
  v_telephony_cost NUMERIC(10,4) := 1.5; -- Default Retell telephony
  v_kb_cost NUMERIC(10,4) := 0;
BEGIN
  -- Get LLM cost
  SELECT base_cost_per_min_cents INTO v_llm_cost
  FROM pricing_tiers
  WHERE tier_type = 'llm' AND tier_name = LOWER(p_llm_model)
  LIMIT 1;
  
  -- Get Voice cost
  SELECT base_cost_per_min_cents INTO v_voice_cost
  FROM pricing_tiers
  WHERE tier_type = 'voice' AND tier_name = LOWER(p_voice_provider)
  LIMIT 1;
  
  -- Get Knowledge Base cost if applicable
  IF p_has_knowledge_base THEN
    SELECT base_cost_per_min_cents INTO v_kb_cost
    FROM pricing_tiers
    WHERE tier_type = 'addon' AND tier_name = 'knowledge-base'
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_llm_cost, 5.0) + COALESCE(v_voice_cost, 7.0) + v_telephony_cost + COALESCE(v_kb_cost, 0);
END;
$$;


ALTER FUNCTION "public"."calculate_agent_base_cost"("p_llm_model" "text", "p_voice_provider" "text", "p_has_knowledge_base" boolean) OWNER TO "postgres";

--
-- Name: calculate_time_wasted_score(integer, "text", "text", "text", timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."calculate_time_wasted_score"("p_duration" integer, "p_amd_result" "text", "p_outcome" "text", "p_auto_disposition" "text", "p_answered_at" timestamp with time zone, "p_created_at" timestamp with time zone) RETURNS TABLE("score" integer, "reason" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_score INTEGER := 0;
  v_reason TEXT := NULL;
  v_time_to_answer INTEGER;
BEGIN
  -- Calculate time to answer
  IF p_answered_at IS NOT NULL AND p_created_at IS NOT NULL THEN
    v_time_to_answer := EXTRACT(EPOCH FROM (p_answered_at - p_created_at))::INTEGER;
  ELSE
    v_time_to_answer := 0;
  END IF;

  -- Scenario 1: Hit voicemail after 30+ seconds of ringing (wasted 30s waiting)
  IF p_amd_result LIKE 'machine%' AND v_time_to_answer > 30 THEN
    v_score := 70;
    v_reason := 'vm_too_late';

  -- Scenario 2: Short call with no outcome (< 15s, likely immediate hangup or wrong number)
  ELSIF p_duration < 15 AND (p_outcome IS NULL OR p_outcome IN ('no_answer', 'failed', 'unknown')) THEN
    v_score := 40;
    v_reason := 'short_no_outcome';

  -- Scenario 3: Long call with no conversion (> 5 min, no appointment)
  ELSIF p_duration > 300 AND p_auto_disposition NOT IN ('appointment_booked', 'interested', 'callback') THEN
    v_score := 60;
    v_reason := 'long_no_conversion';

  -- Scenario 4: Voicemail left but message too long (implied by duration > 60s on VM)
  ELSIF p_amd_result LIKE 'machine%' AND p_duration > 60 THEN
    v_score := 50;
    v_reason := 'vm_message_too_long';

  -- Scenario 5: Human answered but hung up quickly (< 20s)
  ELSIF p_amd_result = 'human' AND p_duration < 20 THEN
    v_score := 55;
    v_reason := 'quick_hangup';

  -- Scenario 6: Failed/busy calls (infrastructure waste)
  ELSIF p_outcome IN ('failed', 'busy') THEN
    v_score := 30;
    v_reason := 'call_failed';
  END IF;

  RETURN QUERY SELECT v_score, v_reason;
END;
$$;


ALTER FUNCTION "public"."calculate_time_wasted_score"("p_duration" integer, "p_amd_result" "text", "p_outcome" "text", "p_auto_disposition" "text", "p_answered_at" timestamp with time zone, "p_created_at" timestamp with time zone) OWNER TO "postgres";

--
-- Name: calibrate_lead_scoring_weights("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."calibrate_lead_scoring_weights"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  sample_count INTEGER;
  avg_converted_score NUMERIC;
  avg_not_converted_score NUMERIC;
  factor TEXT;
  new_weight NUMERIC;
  result JSONB := '{}'::jsonb;
  factors TEXT[] := ARRAY['engagement', 'recency', 'answer_rate', 'status'];
  default_weights NUMERIC[] := ARRAY[0.30, 0.25, 0.25, 0.20];
  total_weight NUMERIC := 0;
  weights NUMERIC[] := ARRAY[0.30, 0.25, 0.25, 0.20];
  i INTEGER;
BEGIN
  SELECT COUNT(*) INTO sample_count
  FROM lead_score_outcomes
  WHERE user_id = p_user_id
    AND created_at > now() - INTERVAL '30 days';

  IF sample_count < 50 THEN
    RETURN jsonb_build_object('calibrated', false, 'reason', 'Need 50+ outcomes (have ' || sample_count || ')', 'sample_size', sample_count);
  END IF;

  FOR i IN 1..4 LOOP
    factor := factors[i];

    SELECT
      COALESCE(AVG(CASE WHEN converted THEN (factors_at_contact->>factor)::NUMERIC END), 0),
      COALESCE(AVG(CASE WHEN NOT converted THEN (factors_at_contact->>factor)::NUMERIC END), 0)
    INTO avg_converted_score, avg_not_converted_score
    FROM lead_score_outcomes
    WHERE user_id = p_user_id AND created_at > now() - INTERVAL '30 days';

    IF avg_converted_score > avg_not_converted_score * 1.2 THEN
      weights[i] := default_weights[i] + 0.05;
    ELSIF avg_converted_score < avg_not_converted_score * 0.8 THEN
      weights[i] := default_weights[i] - 0.05;
    ELSE
      weights[i] := default_weights[i];
    END IF;
  END LOOP;

  -- Normalize
  total_weight := weights[1] + weights[2] + weights[3] + weights[4];
  FOR i IN 1..4 LOOP
    weights[i] := weights[i] / total_weight;

    INSERT INTO lead_scoring_weights (user_id, factor_name, weight, calibrated_at, sample_size)
    VALUES (p_user_id, factors[i], weights[i], now(), sample_count)
    ON CONFLICT (user_id, factor_name) DO UPDATE SET
      weight = EXCLUDED.weight,
      calibrated_at = now(),
      sample_size = EXCLUDED.sample_size;
  END LOOP;

  RETURN jsonb_build_object(
    'calibrated', true, 'sample_size', sample_count,
    'weights', jsonb_build_object(
      'engagement', ROUND(weights[1], 4),
      'recency', ROUND(weights[2], 4),
      'answer_rate', ROUND(weights[3], 4),
      'status', ROUND(weights[4], 4)
    )
  );
END;
$$;


ALTER FUNCTION "public"."calibrate_lead_scoring_weights"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: check_and_reset_daily_calls(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."check_and_reset_daily_calls"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.phone_numbers 
  SET daily_calls = 0, last_daily_reset = CURRENT_DATE
  WHERE last_daily_reset IS NULL OR last_daily_reset < CURRENT_DATE;
END;
$$;


ALTER FUNCTION "public"."check_and_reset_daily_calls"() OWNER TO "postgres";

--
-- Name: check_credit_balance("uuid", numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."check_credit_balance"("p_organization_id" "uuid", "p_minutes_needed" numeric DEFAULT 1) RETURNS TABLE("billing_enabled" boolean, "has_balance" boolean, "available_balance_cents" integer, "cost_per_minute_cents" integer, "required_cents" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_billing_enabled BOOLEAN;
  v_balance INTEGER;
  v_cost_per_min INTEGER;
  v_required INTEGER;
BEGIN
  -- Check if billing is enabled for this org
  SELECT o.billing_enabled INTO v_billing_enabled
  FROM organizations o
  WHERE o.id = p_organization_id;

  IF NOT v_billing_enabled OR v_billing_enabled IS NULL THEN
    -- Billing not enabled, return success
    RETURN QUERY SELECT false, true, 0, 0, 0;
    RETURN;
  END IF;

  -- Get credit info
  SELECT 
    COALESCE(oc.balance_cents, 0),
    COALESCE(oc.cost_per_minute_cents, 15)
  INTO v_balance, v_cost_per_min
  FROM organization_credits oc
  WHERE oc.organization_id = p_organization_id;

  -- If no credits record, create one
  IF v_balance IS NULL THEN
    INSERT INTO organization_credits (organization_id, balance_cents, cost_per_minute_cents)
    VALUES (p_organization_id, 0, 15)
    ON CONFLICT (organization_id) DO NOTHING;
    v_balance := 0;
    v_cost_per_min := 15;
  END IF;

  v_required := CEIL(p_minutes_needed * v_cost_per_min);

  RETURN QUERY SELECT 
    true,
    v_balance >= v_required,
    v_balance,
    v_cost_per_min,
    v_required;
END;
$$;


ALTER FUNCTION "public"."check_credit_balance"("p_organization_id" "uuid", "p_minutes_needed" numeric) OWNER TO "postgres";

--
-- Name: chi_square_2x2(integer, integer, integer, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."chi_square_2x2"("a" integer, "b" integer, "c" integer, "d" integer) RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE n INTEGER; chi2 NUMERIC; p_approx NUMERIC;
BEGIN
  n := a + b + c + d;
  IF n = 0 THEN RETURN 1.0; END IF;
  chi2 := (n * power(abs(a * d - b * c) - n / 2.0, 2)) / ((a + b)::NUMERIC * (c + d)::NUMERIC * (a + c)::NUMERIC * (b + d)::NUMERIC);
  IF chi2 < 0.001 THEN RETURN 1.0;
  ELSIF chi2 > 10 THEN RETURN 0.001;
  ELSE p_approx := exp(-0.5 * chi2); RETURN GREATEST(0.001, LEAST(1.0, p_approx));
  END IF;
END;
$$;


ALTER FUNCTION "public"."chi_square_2x2"("a" integer, "b" integer, "c" integer, "d" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: dialing_queues; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."dialing_queues" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "priority" integer DEFAULT 1 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 3 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "notes" "text"
);


ALTER TABLE "public"."dialing_queues" OWNER TO "postgres";

--
-- Name: claim_pending_dispatches("uuid"[], integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."claim_pending_dispatches"("p_campaign_ids" "uuid"[], "p_limit" integer DEFAULT 50) RETURNS SETOF "public"."dialing_queues"
    LANGUAGE "sql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  UPDATE public.dialing_queues
  SET status = 'calling',
      attempts = COALESCE(attempts, 0) + 1,
      updated_at = now()
  WHERE id IN (
    SELECT id FROM public.dialing_queues
    WHERE campaign_id = ANY(p_campaign_ids)
      AND status = 'pending'
      AND scheduled_at <= now()
    ORDER BY priority DESC NULLS LAST, scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;


ALTER FUNCTION "public"."claim_pending_dispatches"("p_campaign_ids" "uuid"[], "p_limit" integer) OWNER TO "postgres";

--
-- Name: cleanup_old_guardian_alerts(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."cleanup_old_guardian_alerts"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  DELETE FROM guardian_alerts 
  WHERE status = 'resolved' 
    AND detected_at < NOW() - INTERVAL '30 days';
END;
$$;


ALTER FUNCTION "public"."cleanup_old_guardian_alerts"() OWNER TO "postgres";

--
-- Name: create_user_feature_flags(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_user_feature_flags"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO user_feature_flags (user_id, current_tier, voice_broadcast, ghl_contact_import, ghl_basic_tagging)
  VALUES (NEW.id, 'free', true, true, true)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_user_feature_flags"() OWNER TO "postgres";

--
-- Name: decrement_daily_calls("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."decrement_daily_calls"("phone_last_10" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE public.phone_numbers 
  SET daily_calls = GREATEST(0, COALESCE(daily_calls, 0) - 1)
  WHERE number ILIKE '%' || phone_last_10;
END;
$$;


ALTER FUNCTION "public"."decrement_daily_calls"("phone_last_10" "text") OWNER TO "postgres";

--
-- Name: decrement_daily_calls("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."decrement_daily_calls"("phone_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE phone_numbers
  SET daily_calls = GREATEST(0, daily_calls - 1),
      updated_at = now()
  WHERE id = phone_id;
END;
$$;


ALTER FUNCTION "public"."decrement_daily_calls"("phone_id" "uuid") OWNER TO "postgres";

--
-- Name: expire_old_actions(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."expire_old_actions"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE ai_action_queue
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at < now();
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;


ALTER FUNCTION "public"."expire_old_actions"() OWNER TO "postgres";

--
-- Name: extract_opener_from_transcript("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."extract_opener_from_transcript"("p_transcript" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_opener TEXT;
  v_lines TEXT[];
  v_agent_lines TEXT := '';
  v_line TEXT;
  v_count INTEGER := 0;
BEGIN
  IF p_transcript IS NULL OR LENGTH(p_transcript) < 10 THEN
    RETURN NULL;
  END IF;

  -- Split into lines
  v_lines := string_to_array(p_transcript, E'\n');

  -- Get first few agent lines (usually marked with "Agent:" or similar)
  FOREACH v_line IN ARRAY v_lines LOOP
    -- Look for agent speech patterns
    IF v_line ~* '^(agent|assistant|ai|bot|rep):' OR
       (v_count = 0 AND LENGTH(v_line) > 10) THEN
      v_agent_lines := v_agent_lines || ' ' || v_line;
      v_count := v_count + 1;
      IF v_count >= 3 THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  -- If no agent lines found, just take first 500 chars
  IF LENGTH(v_agent_lines) < 10 THEN
    v_opener := LEFT(p_transcript, 500);
  ELSE
    v_opener := LEFT(TRIM(v_agent_lines), 500);
  END IF;

  RETURN v_opener;
END;
$$;


ALTER FUNCTION "public"."extract_opener_from_transcript"("p_transcript" "text") OWNER TO "postgres";

--
-- Name: finalize_call_cost("uuid", "uuid", "text", numeric, integer, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."finalize_call_cost"("p_organization_id" "uuid", "p_call_log_id" "uuid" DEFAULT NULL::"uuid", "p_retell_call_id" "text" DEFAULT NULL::"text", "p_actual_minutes" numeric DEFAULT 1, "p_retell_cost_cents" integer DEFAULT NULL::integer, "p_idempotency_key" "text" DEFAULT NULL::"text", "p_agent_id" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "amount_deducted_cents" integer, "new_balance_cents" integer, "margin_cents" integer, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $_$
DECLARE
  v_current_balance INTEGER;
  v_reservation_amount INTEGER := 0;
  v_customer_cost_per_min NUMERIC;
  v_retell_cost_per_min NUMERIC;
  v_actual_customer_cost INTEGER;
  v_actual_retell_cost INTEGER;
  v_adjustment INTEGER;
  v_new_balance INTEGER;
  v_margin INTEGER;
  v_existing_tx UUID;
BEGIN
  -- Check idempotency
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_tx
    FROM credit_transactions
    WHERE idempotency_key = p_idempotency_key;
    
    IF v_existing_tx IS NOT NULL THEN
      -- Already processed, return success
      SELECT balance_after_cents INTO v_new_balance
      FROM credit_transactions WHERE id = v_existing_tx;
      RETURN QUERY SELECT true, 0, COALESCE(v_new_balance, 0), 0, 'Already processed'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Get current balance and pricing
  SELECT 
    oc.balance_cents,
    oc.cost_per_minute_cents,
    oc.retell_cost_per_minute_cents
  INTO v_current_balance, v_customer_cost_per_min, v_retell_cost_per_min
  FROM organization_credits oc
  WHERE oc.organization_id = p_organization_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, 0, 'No credits record found'::TEXT;
    RETURN;
  END IF;

  -- Check for agent-specific pricing
  IF p_agent_id IS NOT NULL THEN
    SELECT 
      ap.customer_price_per_min_cents,
      ap.base_cost_per_min_cents
    INTO v_customer_cost_per_min, v_retell_cost_per_min
    FROM agent_pricing ap
    WHERE ap.organization_id = p_organization_id
      AND ap.retell_agent_id = p_agent_id
      AND ap.is_active = true;
  END IF;

  -- Use defaults if not found
  v_customer_cost_per_min := COALESCE(v_customer_cost_per_min, 15);
  v_retell_cost_per_min := COALESCE(v_retell_cost_per_min, 7);

  -- Calculate actual costs
  v_actual_customer_cost := CEIL(p_actual_minutes * v_customer_cost_per_min);
  
  -- Use actual Retell cost if provided, otherwise estimate
  IF p_retell_cost_cents IS NOT NULL THEN
    v_actual_retell_cost := p_retell_cost_cents;
  ELSE
    v_actual_retell_cost := CEIL(p_actual_minutes * v_retell_cost_per_min);
  END IF;

  -- Find reservation amount (if any)
  SELECT ABS(amount_cents) INTO v_reservation_amount
  FROM credit_transactions
  WHERE organization_id = p_organization_id
    AND transaction_type = 'reservation'
    AND (call_log_id = p_call_log_id OR retell_call_id = p_retell_call_id)
  ORDER BY created_at DESC
  LIMIT 1;

  v_reservation_amount := COALESCE(v_reservation_amount, 0);

  -- Calculate adjustment: negative means charge more, positive means refund
  -- Already deducted reservation, now need to adjust to actual
  v_adjustment := v_reservation_amount - v_actual_customer_cost;
  v_new_balance := v_current_balance + v_adjustment;
  v_margin := v_actual_customer_cost - v_actual_retell_cost;

  -- Apply adjustment
  UPDATE organization_credits
  SET balance_cents = v_new_balance,
      last_deduction_at = now(),
      updated_at = now()
  WHERE organization_id = p_organization_id;

  -- Record finalization transaction
  INSERT INTO credit_transactions (
    organization_id, transaction_type, amount_cents,
    balance_before_cents, balance_after_cents,
    description, margin_cents, call_log_id, retell_call_id, idempotency_key
  ) VALUES (
    p_organization_id, 'call_finalized', -v_actual_customer_cost,
    v_current_balance, v_new_balance,
    format('Call finalized: %s min @ $%s/min (Retell: $%s)', 
           p_actual_minutes, 
           (v_customer_cost_per_min / 100.0)::TEXT,
           (v_actual_retell_cost / 100.0)::TEXT),
    v_margin, p_call_log_id, p_retell_call_id, p_idempotency_key
  );

  RETURN QUERY SELECT true, v_actual_customer_cost, v_new_balance, v_margin, NULL::TEXT;
END;
$_$;


ALTER FUNCTION "public"."finalize_call_cost"("p_organization_id" "uuid", "p_call_log_id" "uuid", "p_retell_call_id" "text", "p_actual_minutes" numeric, "p_retell_cost_cents" integer, "p_idempotency_key" "text", "p_agent_id" "text") OWNER TO "postgres";

--
-- Name: generate_webhook_key(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."generate_webhook_key"() RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  key_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  result TEXT := '';
  i INTEGER;
BEGIN
  -- Generate a 32-character random key
  FOR i IN 1..32 LOOP
    result := result || substr(key_chars, floor(random() * length(key_chars) + 1)::INTEGER, 1);
  END LOOP;
  RETURN 'wh_' || result;
END;
$$;


ALTER FUNCTION "public"."generate_webhook_key"() OWNER TO "postgres";

--
-- Name: get_agent_customer_price("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_agent_customer_price"("p_organization_id" "uuid", "p_retell_agent_id" "text") RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_pricing RECORD;
BEGIN
  SELECT * INTO v_pricing
  FROM agent_pricing
  WHERE organization_id = p_organization_id
    AND retell_agent_id = p_retell_agent_id
    AND is_active = true;
  
  IF v_pricing IS NULL THEN
    -- No custom pricing, use organization default
    SELECT cost_per_minute_cents INTO v_pricing
    FROM organization_credits
    WHERE organization_id = p_organization_id;
    
    RETURN COALESCE(v_pricing.cost_per_minute_cents, 15.0);
  END IF;
  
  RETURN COALESCE(v_pricing.customer_price_per_min_cents, 15.0);
END;
$$;


ALTER FUNCTION "public"."get_agent_customer_price"("p_organization_id" "uuid", "p_retell_agent_id" "text") OWNER TO "postgres";

--
-- Name: get_effective_daily_calls("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_effective_daily_calls"("phone_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  result integer;
BEGIN
  SELECT 
    CASE 
      WHEN last_daily_reset IS NULL OR last_daily_reset < CURRENT_DATE THEN 0
      ELSE daily_calls
    END INTO result
  FROM phone_numbers
  WHERE id = phone_id;
  
  RETURN COALESCE(result, 0);
END;
$$;


ALTER FUNCTION "public"."get_effective_daily_calls"("phone_id" "uuid") OWNER TO "postgres";

--
-- Name: get_funnel_trend("uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_funnel_trend"("p_user_id" "uuid", "p_days" integer DEFAULT 14) RETURNS TABLE("snapshot_date" "date", "total_leads" integer, "hot_count" integer, "engaged_count" integer, "stalled_count" integer, "booked_count" integer, "won_count" integer, "calls_made" integer, "appointments_booked" integer, "total_spend_cents" integer, "cost_per_appointment_cents" integer, "overall_conversion_rate" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    fs.snapshot_date,
    fs.total_leads,
    fs.hot_count,
    fs.engaged_count,
    fs.stalled_count,
    fs.booked_count,
    fs.won_count,
    fs.calls_made,
    fs.appointments_booked,
    fs.total_spend_cents,
    fs.cost_per_appointment_cents,
    fs.overall_conversion_rate
  FROM funnel_snapshots fs
  WHERE fs.user_id = p_user_id
    AND fs.snapshot_date >= CURRENT_DATE - p_days
  ORDER BY fs.snapshot_date ASC;
END;
$$;


ALTER FUNCTION "public"."get_funnel_trend"("p_user_id" "uuid", "p_days" integer) OWNER TO "postgres";

--
-- Name: get_telnyx_assistant_for_call("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_telnyx_assistant_for_call"("p_user_id" "uuid", "p_assistant_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("assistant_id" "uuid", "telnyx_assistant_id" "text", "name" "text", "instructions" "text", "greeting" "text", "voice" "text", "model" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF p_assistant_id IS NOT NULL THEN
    RETURN QUERY
      SELECT ta.id, ta.telnyx_assistant_id, ta.name, ta.instructions, ta.greeting, ta.voice, ta.model
      FROM telnyx_assistants ta
      WHERE ta.id = p_assistant_id AND ta.user_id = p_user_id AND ta.status = 'active'
      LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT ta.id, ta.telnyx_assistant_id, ta.name, ta.instructions, ta.greeting, ta.voice, ta.model
      FROM telnyx_assistants ta
      WHERE ta.user_id = p_user_id AND ta.status = 'active'
      ORDER BY ta.created_at DESC
      LIMIT 1;
  END IF;
END;
$$;


ALTER FUNCTION "public"."get_telnyx_assistant_for_call"("p_user_id" "uuid", "p_assistant_id" "uuid") OWNER TO "postgres";

--
-- Name: get_user_org_role("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."get_user_org_role"("org_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT role FROM organization_users
  WHERE organization_id = org_id AND user_id = auth.uid()
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_org_role"("org_id" "uuid") OWNER TO "postgres";

--
-- Name: has_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = _user_id AND role = _role
  );
$$;


ALTER FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") OWNER TO "postgres";

--
-- Name: increment_daily_calls_with_reset("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."increment_daily_calls_with_reset"("target_phone_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  new_count integer;
BEGIN
  UPDATE phone_numbers
  SET
    daily_calls = CASE
      WHEN last_call_at IS NULL OR last_call_at::date < CURRENT_DATE THEN 1
      ELSE daily_calls + 1
    END,
    last_call_at = now(),
    updated_at = now()
  WHERE id = target_phone_id
  RETURNING daily_calls INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;


ALTER FUNCTION "public"."increment_daily_calls_with_reset"("target_phone_id" "uuid") OWNER TO "postgres";

--
-- Name: is_org_admin("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_org_admin"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = org_id 
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_org_admin"("org_id" "uuid") OWNER TO "postgres";

--
-- Name: merge_custom_fields("uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."merge_custom_fields"("p_lead_id" "uuid", "p_updates" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  new_fields jsonb;
BEGIN
  UPDATE leads
  SET custom_fields = COALESCE(custom_fields, '{}'::jsonb) || p_updates,
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING custom_fields INTO new_fields;

  RETURN new_fields;
END;
$$;


ALTER FUNCTION "public"."merge_custom_fields"("p_lead_id" "uuid", "p_updates" "jsonb") OWNER TO "postgres";

--
-- Name: mint_api_key("uuid", "text", "text"[], integer, interval); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."mint_api_key"("p_user_id" "uuid", "p_name" "text" DEFAULT 'API Key'::"text", "p_scopes" "text"[] DEFAULT ARRAY['read'::"text"], "p_rate_limit" integer DEFAULT 120, "p_expires_in" interval DEFAULT NULL::interval) RETURNS TABLE("id" "uuid", "name" "text", "key_prefix" "text", "scopes" "text"[], "plaintext" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_plain   TEXT;
  v_hash    TEXT;
  v_prefix  TEXT;
  v_org_id  UUID;
  v_id      UUID;
BEGIN
  v_plain := 'dsk_live_' || replace(replace(replace(
               encode(gen_random_bytes(24), 'base64'),
               '+','A'), '/','B'), '=','');
  v_hash  := encode(digest(v_plain, 'sha256'), 'hex');
  v_prefix := substring(v_plain FROM 1 FOR 12);

  SELECT organization_id INTO v_org_id
    FROM organization_users
   WHERE user_id = p_user_id
   LIMIT 1;

  INSERT INTO api_keys (
    user_id, organization_id, name, key_prefix, key_hash,
    scopes, rate_limit_per_minute, expires_at
  ) VALUES (
    p_user_id, v_org_id, p_name, v_prefix, v_hash,
    p_scopes, p_rate_limit,
    CASE WHEN p_expires_in IS NOT NULL THEN NOW() + p_expires_in END
  ) RETURNING api_keys.id INTO v_id;

  RETURN QUERY
    SELECT v_id, p_name, v_prefix, p_scopes, v_plain;
END;
$$;


ALTER FUNCTION "public"."mint_api_key"("p_user_id" "uuid", "p_name" "text", "p_scopes" "text"[], "p_rate_limit" integer, "p_expires_in" interval) OWNER TO "postgres";

--
-- Name: normalize_opener_text("text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."normalize_opener_text"("p_opener" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  IF p_opener IS NULL THEN
    RETURN NULL;
  END IF;

  -- Lowercase, remove extra whitespace, remove punctuation except periods
  RETURN LOWER(REGEXP_REPLACE(
    REGEXP_REPLACE(TRIM(p_opener), '\s+', ' ', 'g'),
    '[^\w\s\.]', '', 'g'
  ));
END;
$$;


ALTER FUNCTION "public"."normalize_opener_text"("p_opener" "text") OWNER TO "postgres";

--
-- Name: predict_lead_conversion("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."predict_lead_conversion"("p_user_id" "uuid", "p_lead_id" "uuid") RETURNS numeric
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
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
$$;


ALTER FUNCTION "public"."predict_lead_conversion"("p_user_id" "uuid", "p_lead_id" "uuid") OWNER TO "postgres";

--
-- Name: prune_api_key_audit_log(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."prune_api_key_audit_log"("p_retention_days" integer DEFAULT 90) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM api_key_audit_log
   WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;


ALTER FUNCTION "public"."prune_api_key_audit_log"("p_retention_days" integer) OWNER TO "postgres";

--
-- Name: rebalance_variant_weights("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."rebalance_variant_weights"("p_user_id" "uuid", "p_agent_id" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  rec RECORD;
  v_total_calls INTEGER := 0;
  results JSONB := '[]'::JSONB;
  conversion_rate NUMERIC;
  ucb NUMERIC;
  total_ucb NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(asv.total_calls), 0) INTO v_total_calls
  FROM agent_script_variants asv
  WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true;

  IF v_total_calls < 20 THEN
    RETURN jsonb_build_object('rebalanced', false, 'reason', 'Need 20+ total calls');
  END IF;

  -- First pass: compute UCBs
  FOR rec IN
    SELECT id, variant_name, asv.total_calls AS vc, asv.total_conversions,
           CASE WHEN asv.total_calls > 0
             THEN asv.total_conversions::NUMERIC / asv.total_calls
             ELSE 0 END AS conv_rate
    FROM agent_script_variants asv
    WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true
  LOOP
    IF rec.vc > 0 THEN
      ucb := rec.conv_rate + SQRT(2.0 * LN(v_total_calls::NUMERIC) / rec.vc);
    ELSE
      ucb := 999;
    END IF;
    total_ucb := total_ucb + ucb;

    -- Store temporarily
    UPDATE agent_script_variants
    SET weight = GREATEST(0.1, ucb)
    WHERE id = rec.id;

    results := results || jsonb_build_object('variant', rec.variant_name, 'calls', rec.vc, 'conv_rate', ROUND(rec.conv_rate, 4), 'ucb', ROUND(ucb, 4));
  END LOOP;

  -- Normalize weights to sum ~= 1
  IF total_ucb > 0 THEN
    UPDATE agent_script_variants
    SET weight = GREATEST(0.1, weight / total_ucb)
    WHERE user_id = p_user_id AND agent_id = p_agent_id AND is_active = true;
  END IF;

  RETURN jsonb_build_object('rebalanced', true, 'total_calls', v_total_calls, 'variants', results);
END;
$$;


ALTER FUNCTION "public"."rebalance_variant_weights"("p_user_id" "uuid", "p_agent_id" "text") OWNER TO "postgres";

--
-- Name: recalculate_calling_windows("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."recalculate_calling_windows"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  windows_updated INTEGER := 0;
BEGIN
  INSERT INTO optimal_calling_windows (
    user_id, day_of_week, hour_of_day,
    total_calls, answered_calls, converted_calls,
    answer_rate, conversion_rate, score, updated_at
  )
  SELECT
    p_user_id,
    EXTRACT(DOW FROM cl.created_at)::INTEGER as dow,
    EXTRACT(HOUR FROM cl.created_at)::INTEGER as hod,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set')) as answered,
    COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set') as converted,
    CASE WHEN COUNT(*) > 0
      THEN COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set'))::NUMERIC / COUNT(*)
      ELSE 0 END,
    CASE WHEN COUNT(*) > 0
      THEN COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set')::NUMERIC / COUNT(*)
      ELSE 0 END,
    CASE WHEN COUNT(*) > 0
      THEN (
        COUNT(*) FILTER (WHERE cl.outcome IN ('completed', 'answered', 'appointment_set'))::NUMERIC / COUNT(*)
        + 3.0 * COUNT(*) FILTER (WHERE cl.outcome = 'appointment_set')::NUMERIC / COUNT(*)
      ) ELSE 0 END,
    now()
  FROM call_logs cl
  WHERE cl.user_id = p_user_id
    AND cl.created_at > now() - INTERVAL '30 days'
  GROUP BY dow, hod
  ON CONFLICT (user_id, day_of_week, hour_of_day) DO UPDATE SET
    total_calls = EXCLUDED.total_calls,
    answered_calls = EXCLUDED.answered_calls,
    converted_calls = EXCLUDED.converted_calls,
    answer_rate = EXCLUDED.answer_rate,
    conversion_rate = EXCLUDED.conversion_rate,
    score = EXCLUDED.score,
    updated_at = now();

  GET DIAGNOSTICS windows_updated = ROW_COUNT;
  RETURN windows_updated;
END;
$$;


ALTER FUNCTION "public"."recalculate_calling_windows"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: recalculate_number_health("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."recalculate_number_health"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  updated_count INTEGER := 0;
  rec RECORD;
  h1_calls INTEGER;
  h24_calls INTEGER;
  d7_calls INTEGER;
  h24_answered INTEGER;
  d7_answered INTEGER;
  d30_answered INTEGER;
  d30_total INTEGER;
  h24_vm INTEGER;
  spam_risk NUMERIC;
  health INTEGER;
  safe_daily INTEGER;
  rest_until TIMESTAMPTZ;
BEGIN
  FOR rec IN
    SELECT pn.id, pn.phone_number
    FROM phone_numbers pn
    WHERE pn.user_id = p_user_id AND pn.status = 'active'
  LOOP
    SELECT
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '1 hour'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '24 hours'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '7 days'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '24 hours' AND cl.outcome IN ('completed','answered','appointment_set','interested','callback')),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '7 days' AND cl.outcome IN ('completed','answered','appointment_set','interested','callback')),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '30 days' AND cl.outcome IN ('completed','answered','appointment_set','interested','callback')),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '30 days'),
      COUNT(*) FILTER (WHERE cl.created_at > now() - INTERVAL '24 hours' AND cl.outcome IN ('voicemail','left_voicemail'))
    INTO h1_calls, h24_calls, d7_calls, h24_answered, d7_answered, d30_answered, d30_total, h24_vm
    FROM call_logs cl
    WHERE cl.caller_id = rec.phone_number
      AND cl.user_id = p_user_id;

    spam_risk := 0;
    IF h24_calls > 80 THEN spam_risk := spam_risk + 0.3; END IF;
    IF h24_calls > 50 THEN spam_risk := spam_risk + 0.15; END IF;
    IF h1_calls > 20 THEN spam_risk := spam_risk + 0.2; END IF;
    IF h24_calls > 0 AND (h24_answered::NUMERIC / h24_calls) < 0.05 THEN spam_risk := spam_risk + 0.25; END IF;
    IF h24_calls > 0 AND (h24_vm::NUMERIC / h24_calls) > 0.9 THEN spam_risk := spam_risk + 0.1; END IF;
    spam_risk := LEAST(1.0, spam_risk);

    health := 100;
    health := health - LEAST(40, h24_calls / 2);
    health := health - LEAST(30, (spam_risk * 30)::INTEGER);
    IF d7_calls > 0 AND (d7_answered::NUMERIC / d7_calls) < 0.05 THEN
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

    INSERT INTO number_health_metrics (
      user_id, phone_number, phone_number_id,
      calls_last_hour, calls_last_24h, calls_last_7d,
      answer_rate_24h, answer_rate_7d, answer_rate_30d,
      voicemail_rate_24h,
      predicted_spam_risk, spam_risk_factors,
      recommended_rest_until, max_safe_daily_calls,
      health_score, last_calculated
    ) VALUES (
      p_user_id, rec.phone_number, rec.id,
      h1_calls, h24_calls, d7_calls,
      CASE WHEN h24_calls > 0 THEN h24_answered::NUMERIC / h24_calls ELSE 0 END,
      CASE WHEN d7_calls > 0 THEN d7_answered::NUMERIC / d7_calls ELSE 0 END,
      CASE WHEN d30_total > 0 THEN d30_answered::NUMERIC / d30_total ELSE 0 END,
      CASE WHEN h24_calls > 0 THEN h24_vm::NUMERIC / h24_calls ELSE 0 END,
      spam_risk,
      jsonb_build_object(
        'velocity_24h', h24_calls,
        'velocity_1h', h1_calls,
        'answer_rate_24h', CASE WHEN h24_calls > 0 THEN ROUND(h24_answered::NUMERIC / h24_calls, 4) ELSE 0 END,
        'voicemail_rate_24h', CASE WHEN h24_calls > 0 THEN ROUND(h24_vm::NUMERIC / h24_calls, 4) ELSE 0 END
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


ALTER FUNCTION "public"."recalculate_number_health"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: reserve_credits("uuid", integer, "uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reserve_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_call_log_id" "uuid" DEFAULT NULL::"uuid", "p_retell_call_id" "text" DEFAULT NULL::"text") RETURNS TABLE("success" boolean, "reservation_id" "uuid", "available_balance_cents" integer, "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_current_balance INTEGER;
  v_new_balance INTEGER;
  v_reservation_id UUID;
BEGIN
  -- Lock and get current balance
  SELECT balance_cents INTO v_current_balance
  FROM organization_credits
  WHERE organization_id = p_organization_id
  FOR UPDATE;
  
  IF v_current_balance IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, 0, 'No credits record found'::TEXT;
    RETURN;
  END IF;

  IF v_current_balance < p_amount_cents THEN
    RETURN QUERY SELECT false, NULL::UUID, v_current_balance, 'Insufficient balance'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount_cents;

  -- Reserve by deducting (will be adjusted on finalization)
  UPDATE organization_credits
  SET balance_cents = v_new_balance,
      updated_at = now()
  WHERE organization_id = p_organization_id;

  -- Record the reservation transaction
  INSERT INTO credit_transactions (
    organization_id, transaction_type, amount_cents,
    balance_before_cents, balance_after_cents, 
    description, call_log_id, retell_call_id
  ) VALUES (
    p_organization_id, 'reservation', -p_amount_cents,
    v_current_balance, v_new_balance,
    'Credit reserved for call', p_call_log_id, p_retell_call_id
  )
  RETURNING id INTO v_reservation_id;

  RETURN QUERY SELECT true, v_reservation_id, v_new_balance, NULL::TEXT;
END;
$$;


ALTER FUNCTION "public"."reserve_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_call_log_id" "uuid", "p_retell_call_id" "text") OWNER TO "postgres";

--
-- Name: reset_all_daily_calls(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reset_all_daily_calls"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE phone_numbers
  SET daily_calls = 0,
      last_daily_reset = CURRENT_DATE,
      updated_at = now()
  WHERE daily_calls > 0;
END;
$$;


ALTER FUNCTION "public"."reset_all_daily_calls"() OWNER TO "postgres";

--
-- Name: reset_stale_daily_calls("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reset_stale_daily_calls"("target_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE phone_numbers
  SET
    daily_calls = 0,
    updated_at = now()
  WHERE user_id = target_user_id
    AND daily_calls > 0
    AND (
      last_call_at IS NULL
      OR last_call_at::date < CURRENT_DATE
    );
END;
$$;


ALTER FUNCTION "public"."reset_stale_daily_calls"("target_user_id" "uuid") OWNER TO "postgres";

--
-- Name: run_safety_backstops(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."run_safety_backstops"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $_$
DECLARE
  v_now timestamptz := now();
  v_stale record;
  v_stuck_count int := 0;
  v_budget record;
  v_daily_spend numeric;
  v_monthly_spend numeric;
  v_alerts int := 0;
  v_paused int := 0;
BEGIN
  FOR v_stale IN
    SELECT s.user_id, s.last_engine_run, s.engine_interval_minutes
    FROM autonomous_settings s
    WHERE s.enabled = true
      AND s.last_engine_run IS NOT NULL
      AND s.last_engine_run < v_now - make_interval(
            mins => GREATEST(COALESCE(s.engine_interval_minutes, 5) * 3, 15))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM system_alerts a
      WHERE a.user_id = v_stale.user_id
        AND a.alert_type = 'engine_heartbeat_stale'
        AND a.acknowledged = false AND a.auto_resolved = false
        AND a.created_at > v_now - interval '6 hours'
    ) THEN
      INSERT INTO system_alerts (user_id, alert_type, severity, title, message, metadata)
      VALUES (
        v_stale.user_id, 'engine_heartbeat_stale', 'critical',
        'Autonomous engine heartbeat lost',
        'ai-autonomous-engine has not completed a run since '
          || to_char(v_stale.last_engine_run, 'YYYY-MM-DD HH24:MI UTC')
          || '. Autonomous calling/follow-ups are NOT executing. Check pg_cron and function logs.',
        jsonb_build_object('last_engine_run', v_stale.last_engine_run)
      );
      v_alerts := v_alerts + 1;
    END IF;
  END LOOP;

  UPDATE system_alerts a
  SET auto_resolved = true, resolved_at = v_now
  FROM autonomous_settings s
  WHERE a.alert_type = 'engine_heartbeat_stale'
    AND a.auto_resolved = false
    AND s.user_id = a.user_id
    AND s.last_engine_run > v_now - make_interval(
          mins => GREATEST(COALESCE(s.engine_interval_minutes, 5) * 2, 10));

  WITH stuck AS (
    UPDATE dialing_queues q
    SET status = 'failed',
        updated_at = v_now,
        notes = COALESCE(q.notes || ' | ', '') || 'auto-failed by safety backstop: stuck in calling >15min'
    WHERE q.status = 'calling'
      AND q.updated_at < v_now - interval '15 minutes'
    RETURNING q.campaign_id
  ),
  per_user AS (
    SELECT c.user_id, count(*) AS n
    FROM stuck s
    JOIN campaigns c ON c.id = s.campaign_id
    GROUP BY c.user_id
  ),
  ins AS (
    INSERT INTO system_alerts (user_id, alert_type, severity, title, message, metadata)
    SELECT pu.user_id, 'stuck_calls_recovered', 'warning',
           'Stuck queue entries auto-recovered',
           pu.n || ' of your dialing-queue entries were stuck in calling >15 min and were marked failed. If this repeats, the dispatch/webhook path is dropping calls.',
           jsonb_build_object('count', pu.n)
    FROM per_user pu
    WHERE NOT EXISTS (
      SELECT 1 FROM system_alerts a
      WHERE a.user_id = pu.user_id
        AND a.alert_type = 'stuck_calls_recovered'
        AND a.created_at > v_now - interval '1 hour')
    RETURNING 1
  )
  SELECT count(*) INTO v_stuck_count FROM stuck;

  FOR v_budget IN
    SELECT b.* FROM budget_settings b
    WHERE b.auto_pause_enabled = true AND b.is_paused = false
  LOOP
    SELECT GREATEST(
      COALESCE((SELECT sum(ss.total_cost) FROM spending_summaries ss
                WHERE ss.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR ss.campaign_id = v_budget.campaign_id)
                  AND ss.summary_date = current_date), 0),
      COALESCE((SELECT sum(cl.call_cost) FROM call_logs cl
                WHERE cl.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR cl.campaign_id = v_budget.campaign_id)
                  AND cl.created_at >= date_trunc('day', v_now)), 0)
    ) INTO v_daily_spend;

    SELECT GREATEST(
      COALESCE((SELECT sum(ss.total_cost) FROM spending_summaries ss
                WHERE ss.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR ss.campaign_id = v_budget.campaign_id)
                  AND ss.summary_date >= date_trunc('month', v_now)::date), 0),
      COALESCE((SELECT sum(cl.call_cost) FROM call_logs cl
                WHERE cl.user_id = v_budget.user_id
                  AND (v_budget.campaign_id IS NULL OR cl.campaign_id = v_budget.campaign_id)
                  AND cl.created_at >= date_trunc('month', v_now)), 0)
    ) INTO v_monthly_spend;

    IF (v_budget.daily_limit IS NOT NULL AND v_budget.daily_limit > 0 AND v_daily_spend >= v_budget.daily_limit)
       OR (v_budget.monthly_limit IS NOT NULL AND v_budget.monthly_limit > 0 AND v_monthly_spend >= v_budget.monthly_limit) THEN

      UPDATE budget_settings
      SET is_paused = true, paused_at = v_now,
          pause_reason = 'Auto-paused by safety backstop: spend $' || round(v_daily_spend, 2)
            || ' today / $' || round(v_monthly_spend, 2) || ' this month exceeded limit'
      WHERE id = v_budget.id;

      UPDATE campaigns
      SET status = 'paused', updated_at = v_now
      WHERE user_id = v_budget.user_id
        AND status IN ('active','running')
        AND (v_budget.campaign_id IS NULL OR id = v_budget.campaign_id);

      INSERT INTO budget_alerts (user_id, budget_setting_id, alert_type, threshold_percent,
                                 amount_spent, budget_limit, message, action_taken)
      VALUES (v_budget.user_id, v_budget.id, 'auto_pause', 100,
              v_daily_spend, COALESCE(v_budget.daily_limit, v_budget.monthly_limit),
              'Safety backstop auto-paused campaigns: budget limit reached.',
              'campaigns_paused');

      INSERT INTO system_alerts (user_id, alert_type, severity, title, message, metadata)
      VALUES (v_budget.user_id, 'budget_auto_pause', 'critical',
              'Budget limit reached — campaigns auto-paused',
              'Spend reached $' || round(v_daily_spend,2) || ' today / $' || round(v_monthly_spend,2)
                || ' this month. Campaigns were paused by the unattended safety backstop.',
              jsonb_build_object('daily_spend', v_daily_spend, 'monthly_spend', v_monthly_spend,
                                 'budget_setting_id', v_budget.id));
      v_paused := v_paused + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'heartbeat_alerts', v_alerts,
    'stuck_recovered', v_stuck_count,
    'budgets_paused', v_paused,
    'ran_at', v_now);
END;
$_$;


ALTER FUNCTION "public"."run_safety_backstops"() OWNER TO "postgres";

--
-- Name: save_operational_memory("uuid", "text", "text", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_operational_memory"("p_user_id" "uuid", "p_memory_type" "text", "p_subject" "text", "p_content" "jsonb", "p_importance" integer DEFAULT 5) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  memory_id UUID;
BEGIN
  SELECT id INTO memory_id
  FROM ai_operational_memory
  WHERE user_id = p_user_id
    AND memory_type = p_memory_type
    AND memory_key = p_subject
  LIMIT 1;

  IF memory_id IS NOT NULL THEN
    UPDATE ai_operational_memory
    SET memory_value = p_content,
        confidence = p_importance,
        last_accessed_at = now(),
        access_count = access_count + 1,
        updated_at = now()
    WHERE id = memory_id;
    RETURN memory_id;
  ELSE
    INSERT INTO ai_operational_memory (user_id, memory_type, memory_key, memory_value, confidence)
    VALUES (p_user_id, p_memory_type, p_subject, p_content, p_importance)
    RETURNING id INTO memory_id;
    RETURN memory_id;
  END IF;
END;
$$;


ALTER FUNCTION "public"."save_operational_memory"("p_user_id" "uuid", "p_memory_type" "text", "p_subject" "text", "p_content" "jsonb", "p_importance" integer) OWNER TO "postgres";

--
-- Name: seed_default_playbook("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."seed_default_playbook"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  rules_created INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM followup_playbook WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 0;
  END IF;

  -- FRESH: Speed to lead
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Speed to Lead', 'fresh', 1,
   '{"min_touches": 0, "max_touches": 0}'::jsonb,
   '{"type": "call", "delay_hours": 0.08, "config": {"urgency": "immediate"}}'::jsonb, true),
  (p_user_id, 'Fresh SMS Intro', 'attempting', 2,
   '{"min_touches": 1, "max_touches": 1}'::jsonb,
   '{"type": "sms", "delay_hours": 0.03, "template": "Hey {{first_name}}, just tried to give you a call. Is now a good time?"}'::jsonb, true),
  (p_user_id, 'Second Call Attempt', 'attempting', 3,
   '{"min_touches": 1, "max_touches": 2}'::jsonb,
   '{"type": "call", "delay_hours": 0.5}'::jsonb, true),
  (p_user_id, 'Third Call Attempt', 'attempting', 4,
   '{"min_touches": 2, "max_touches": 3}'::jsonb,
   '{"type": "call", "delay_hours": 4}'::jsonb, true),
  (p_user_id, 'Value-Driven AI SMS', 'attempting', 5,
   '{"min_touches": 3, "max_touches": 4}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 1, "prompt": "Write a short friendly follow-up SMS. Under 160 chars."}'::jsonb, true);
  rules_created := rules_created + 5;

  -- ENGAGED
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Engaged Follow-up SMS', 'engaged', 1,
   '{"min_touches": 1, "max_touches": 10}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 1, "prompt": "Write a brief warm follow-up SMS. Under 160 chars."}'::jsonb, true),
  (p_user_id, 'Engaged Next Call', 'engaged', 3,
   '{"min_touches": 2, "max_touches": 10}'::jsonb,
   '{"type": "call", "delay_hours": 36}'::jsonb, true);
  rules_created := rules_created + 2;

  -- HOT
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Hot Same-Day Call', 'hot', 1,
   '{}'::jsonb,
   '{"type": "call", "delay_hours": 4}'::jsonb, true),
  (p_user_id, 'Hot Morning Check-in', 'hot', 2,
   '{"min_touches": 2}'::jsonb,
   '{"type": "sms", "delay_hours": 18, "template": "Good morning {{first_name}}! Any questions about what we discussed?"}'::jsonb, true);
  rules_created := rules_created + 2;

  -- NURTURING
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Nurture Week 1', 'nurturing', 3,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 144, "prompt": "Write a helpful non-salesy follow-up. Under 160 chars."}'::jsonb, true),
  (p_user_id, 'Nurture Week 3', 'nurturing', 4,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 432, "prompt": "Write a brief genuine check-in. Under 120 chars."}'::jsonb, true),
  (p_user_id, 'Nurture Monthly', 'nurturing', 5,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 720, "prompt": "Write a brief friendly monthly check-in. Under 100 chars."}'::jsonb, true);
  rules_created := rules_created + 3;

  -- STALLED
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Stalled Re-engagement', 'stalled', 2,
   '{}'::jsonb,
   '{"type": "ai_sms", "delay_hours": 72, "prompt": "Write a brief re-engagement SMS using curiosity. Under 140 chars."}'::jsonb, true),
  (p_user_id, 'Breakup Text', 'stalled', 5,
   '{"min_touches": 4}'::jsonb,
   '{"type": "sms", "delay_hours": 240, "template": "Hey {{first_name}}, I haven''t heard back so I don''t want to keep bothering you. If things change, my line is always open!"}'::jsonb, true);
  rules_created := rules_created + 2;

  -- CALLBACK SET
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Callback Reminder SMS', 'callback_set', 1,
   '{}'::jsonb,
   '{"type": "sms", "delay_hours": 0, "template": "Hi {{first_name}}, heads up I''ll be calling you shortly as discussed!"}'::jsonb, true),
  (p_user_id, 'Execute Callback', 'callback_set', 1,
   '{}'::jsonb,
   '{"type": "call", "delay_hours": 0, "config": {"respect_explicit_time": true}}'::jsonb, true);
  rules_created := rules_created + 2;

  -- BOOKED
  INSERT INTO followup_playbook (user_id, name, trigger_stage, priority, conditions, actions, is_active) VALUES
  (p_user_id, 'Booking Confirmation', 'booked', 1,
   '{"min_touches": 0, "max_touches": 0}'::jsonb,
   '{"type": "sms", "delay_hours": 0.05, "template": "Awesome {{first_name}}! Your appointment is confirmed!"}'::jsonb, true),
  (p_user_id, 'Day-Before Reminder', 'booked', 2,
   '{}'::jsonb,
   '{"type": "sms", "template": "Hi {{first_name}}, reminder about our call tomorrow!"}'::jsonb, true),
  (p_user_id, 'Morning-Of Reminder', 'booked', 3,
   '{}'::jsonb,
   '{"type": "sms", "template": "Good morning {{first_name}}! Looking forward to our chat today!"}'::jsonb, true);
  rules_created := rules_created + 3;

  RETURN rules_created;
END;
$$;


ALTER FUNCTION "public"."seed_default_playbook"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: seed_disposition_values("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."seed_disposition_values"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  seeded INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM disposition_values WHERE user_id = p_user_id LIMIT 1) THEN
    RETURN 0;
  END IF;
  INSERT INTO disposition_values (user_id, disposition_name, conversion_probability, value_weight, maps_to_stage, priority_boost, requires_immediate_followup, custom_followup_delay_hours)
  VALUES
    (p_user_id, 'appointment_set',    0.95, 10, 'booked',      50, true,  0.05),
    (p_user_id, 'talk_to_human',      0.60, 9,  'hot',         40, true,  0.08),
    (p_user_id, 'interested',         0.45, 8,  'hot',         35, true,  0.5),
    (p_user_id, 'hot_lead',           0.40, 8,  'hot',         35, true,  0.5),
    (p_user_id, 'callback',           0.35, 8,  'callback_set', 30, false, null),
    (p_user_id, 'callback_requested', 0.35, 8,  'callback_set', 30, false, null),
    (p_user_id, 'completed',          0.15, 6,  'engaged',     15, false, 1),
    (p_user_id, 'answered',           0.12, 6,  'engaged',     10, false, 1),
    (p_user_id, 'contacted',          0.10, 5,  'engaged',     5,  false, 4),
    (p_user_id, 'left_voicemail',     0.08, 4,  'attempting',  0,  false, 4),
    (p_user_id, 'voicemail',          0.08, 4,  'attempting',  0,  false, 4),
    (p_user_id, 'no_answer',          0.05, 3,  'attempting',  -5, false, null),
    (p_user_id, 'busy',               0.04, 3,  'attempting',  -5, false, null),
    (p_user_id, 'failed',             0.02, 2,  'attempting',  -10, false, null),
    (p_user_id, 'not_interested',     0.01, 1,  'closed_lost', -50, false, null),
    (p_user_id, 'dnc',                0.00, 1,  'closed_lost', -100, false, null),
    (p_user_id, 'wrong_number',       0.00, 1,  'closed_lost', -100, false, null),
    (p_user_id, 'disconnected',       0.00, 1,  'closed_lost', -100, false, null);
  GET DIAGNOSTICS seeded = ROW_COUNT;
  RETURN seeded;
END;
$$;


ALTER FUNCTION "public"."seed_disposition_values"("p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: select_script_variant("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."select_script_variant"("p_user_id" "uuid", "p_agent_id" "text") RETURNS TABLE("variant_id" "uuid", "variant_name" "text", "prompt_patch" "jsonb", "variant_label" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  total_weight NUMERIC;
  random_val NUMERIC;
  running_total NUMERIC := 0;
  rec RECORD;
BEGIN
  SELECT COALESCE(SUM(asv.weight), 0) INTO total_weight
  FROM agent_script_variants asv
  WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true;

  IF total_weight = 0 THEN RETURN; END IF;

  random_val := random() * total_weight;

  FOR rec IN
    SELECT asv.id, asv.variant_name, asv.prompt_patch, asv.variant_label, asv.weight
    FROM agent_script_variants asv
    WHERE asv.user_id = p_user_id AND asv.agent_id = p_agent_id AND asv.is_active = true
    ORDER BY asv.weight DESC
  LOOP
    running_total := running_total + rec.weight;
    IF running_total >= random_val THEN
      variant_id := rec.id;
      variant_name := rec.variant_name;
      prompt_patch := rec.prompt_patch;
      variant_label := rec.variant_label;
      RETURN NEXT;
      RETURN;
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."select_script_variant"("p_user_id" "uuid", "p_agent_id" "text") OWNER TO "postgres";

--
-- Name: select_sms_variant("uuid", "text", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."select_sms_variant"("p_user_id" "uuid", "p_context_type" "text", "p_context_id" "uuid") RETURNS TABLE("variant_id" "uuid", "variant_label" "text", "message_template" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_total_sends INTEGER;
  v_record RECORD;
  v_best_score NUMERIC := -1;
  v_best_variant RECORD;
BEGIN
  SELECT COALESCE(SUM(times_sent), 0) INTO v_total_sends
  FROM sms_copy_variants WHERE user_id = p_user_id AND context_type = p_context_type AND context_id = p_context_id AND is_active = true;

  IF v_total_sends < 20 THEN
    RETURN QUERY SELECT sv.id, sv.variant_label, sv.message_template FROM sms_copy_variants sv
    WHERE sv.user_id = p_user_id AND sv.context_type = p_context_type AND sv.context_id = p_context_id AND sv.is_active = true ORDER BY random() LIMIT 1;
    RETURN;
  END IF;

  FOR v_record IN
    SELECT sv.id, sv.variant_label, sv.message_template, sv.times_sent, sv.positive_rate,
           sv.positive_rate + sqrt(2 * ln(v_total_sends) / GREATEST(sv.times_sent, 1)) AS ucb_score
    FROM sms_copy_variants sv WHERE sv.user_id = p_user_id AND sv.context_type = p_context_type AND sv.context_id = p_context_id AND sv.is_active = true
  LOOP
    IF v_record.ucb_score > v_best_score THEN
      v_best_score := v_record.ucb_score;
      v_best_variant := v_record;
    END IF;
  END LOOP;

  IF v_best_variant IS NOT NULL THEN
    variant_id := v_best_variant.id;
    variant_label := v_best_variant.variant_label;
    message_template := v_best_variant.message_template;
    RETURN NEXT;
  END IF;
END;
$$;


ALTER FUNCTION "public"."select_sms_variant"("p_user_id" "uuid", "p_context_type" "text", "p_context_id" "uuid") OWNER TO "postgres";

--
-- Name: sigmoid(numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."sigmoid"("x" numeric) RETURNS numeric
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
  SELECT 1.0 / (1.0 + exp(-LEAST(GREATEST(x, -500), 500)));
$$;


ALTER FUNCTION "public"."sigmoid"("x" numeric) OWNER TO "postgres";

--
-- Name: touch_api_key("uuid", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."touch_api_key"("p_key_id" "uuid", "p_ip" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$ BEGIN UPDATE public.api_keys SET last_used_at = NOW(), last_used_ip = COALESCE(p_ip, last_used_ip) WHERE id = p_key_id; END; $$;


ALTER FUNCTION "public"."touch_api_key"("p_key_id" "uuid", "p_ip" "text") OWNER TO "postgres";

--
-- Name: update_guardian_alerts_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_guardian_alerts_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_guardian_alerts_updated_at"() OWNER TO "postgres";

--
-- Name: update_lj_memory_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_lj_memory_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_lj_memory_updated_at"() OWNER TO "postgres";

--
-- Name: update_opener_analytics("uuid", "text", "text", "text", boolean, boolean, boolean, integer, "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_opener_analytics"("p_user_id" "uuid", "p_agent_id" "text", "p_agent_name" "text", "p_opener_text" "text", "p_was_answered" boolean, "p_was_engaged" boolean, "p_was_converted" boolean, "p_call_duration" integer, "p_call_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_opener_id UUID;
  v_normalized TEXT;
BEGIN
  v_normalized := normalize_opener_text(p_opener_text);

  IF v_normalized IS NULL OR LENGTH(v_normalized) < 10 THEN
    RETURN NULL;
  END IF;

  -- Upsert opener analytics
  INSERT INTO public.opener_analytics (
    user_id, agent_id, agent_name, opener_text, opener_normalized,
    total_uses, calls_answered, calls_engaged, calls_converted,
    avg_call_duration, last_used_at
  ) VALUES (
    p_user_id, p_agent_id, p_agent_name, LEFT(p_opener_text, 500), v_normalized,
    1,
    CASE WHEN p_was_answered THEN 1 ELSE 0 END,
    CASE WHEN p_was_engaged THEN 1 ELSE 0 END,
    CASE WHEN p_was_converted THEN 1 ELSE 0 END,
    COALESCE(p_call_duration, 0),
    NOW()
  )
  ON CONFLICT (user_id, opener_normalized) DO UPDATE SET
    total_uses = opener_analytics.total_uses + 1,
    calls_answered = opener_analytics.calls_answered + CASE WHEN p_was_answered THEN 1 ELSE 0 END,
    calls_engaged = opener_analytics.calls_engaged + CASE WHEN p_was_engaged THEN 1 ELSE 0 END,
    calls_converted = opener_analytics.calls_converted + CASE WHEN p_was_converted THEN 1 ELSE 0 END,
    avg_call_duration = (opener_analytics.avg_call_duration * opener_analytics.total_uses + COALESCE(p_call_duration, 0)) / (opener_analytics.total_uses + 1),
    last_used_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_opener_id;

  -- Update calculated rates
  UPDATE public.opener_analytics SET
    answer_rate = CASE WHEN total_uses > 0 THEN (calls_answered::DECIMAL / total_uses * 100) ELSE 0 END,
    engagement_rate = CASE WHEN calls_answered > 0 THEN (calls_engaged::DECIMAL / calls_answered * 100) ELSE 0 END,
    conversion_rate = CASE WHEN calls_engaged > 0 THEN (calls_converted::DECIMAL / calls_engaged * 100) ELSE 0 END,
    effectiveness_score = LEAST(100, GREATEST(0,
      (CASE WHEN total_uses > 0 THEN (calls_answered::DECIMAL / total_uses * 30) ELSE 0 END) +
      (CASE WHEN calls_answered > 0 THEN (calls_engaged::DECIMAL / calls_answered * 40) ELSE 0 END) +
      (CASE WHEN calls_engaged > 0 THEN (calls_converted::DECIMAL / calls_engaged * 30) ELSE 0 END)
    )::INTEGER)
  WHERE id = v_opener_id;

  -- Log the call-opener relationship
  INSERT INTO public.call_opener_logs (
    user_id, call_id, opener_id, was_answered, was_engaged, was_converted,
    call_duration, opener_text_used
  ) VALUES (
    p_user_id, p_call_id, v_opener_id, p_was_answered, p_was_engaged, p_was_converted,
    p_call_duration, LEFT(p_opener_text, 500)
  );

  RETURN v_opener_id;
END;
$$;


ALTER FUNCTION "public"."update_opener_analytics"("p_user_id" "uuid", "p_agent_id" "text", "p_agent_name" "text", "p_opener_text" "text", "p_was_answered" boolean, "p_was_engaged" boolean, "p_was_converted" boolean, "p_call_duration" integer, "p_call_id" "uuid") OWNER TO "postgres";

--
-- Name: update_smart_lists_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_smart_lists_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_smart_lists_updated_at"() OWNER TO "postgres";

--
-- Name: update_sms_variant_stats("uuid", boolean, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_sms_variant_stats"("p_variant_id" "uuid", "p_replied" boolean DEFAULT false, "p_positive" boolean DEFAULT false, "p_appointment" boolean DEFAULT false, "p_opted_out" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE sms_copy_variants SET
    times_sent = times_sent + 1,
    replies_received = replies_received + CASE WHEN p_replied THEN 1 ELSE 0 END,
    positive_replies = positive_replies + CASE WHEN p_positive THEN 1 ELSE 0 END,
    led_to_appointment = led_to_appointment + CASE WHEN p_appointment THEN 1 ELSE 0 END,
    opt_outs = opt_outs + CASE WHEN p_opted_out THEN 1 ELSE 0 END,
    reply_rate = CASE WHEN times_sent > 0 THEN (replies_received + CASE WHEN p_replied THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1) ELSE 0 END,
    positive_rate = CASE WHEN times_sent > 0 THEN (positive_replies + CASE WHEN p_positive THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1) ELSE 0 END,
    appointment_rate = CASE WHEN times_sent > 0 THEN (led_to_appointment + CASE WHEN p_appointment THEN 1 ELSE 0 END)::NUMERIC / (times_sent + 1) ELSE 0 END,
    last_sent_at = now()
  WHERE id = p_variant_id;
END;
$$;


ALTER FUNCTION "public"."update_sms_variant_stats"("p_variant_id" "uuid", "p_replied" boolean, "p_positive" boolean, "p_appointment" boolean, "p_opted_out" boolean) OWNER TO "postgres";

--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

--
-- Name: update_variant_stats("uuid", "text", integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_variant_stats"("p_variant_id" "uuid", "p_outcome" "text", "p_duration" integer, "p_converted" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE agent_script_variants SET
    total_calls = total_calls + 1,
    total_conversions = total_conversions + CASE WHEN p_converted THEN 1 ELSE 0 END,
    avg_duration_seconds = CASE
      WHEN total_calls = 0 THEN p_duration
      ELSE (avg_duration_seconds * total_calls + p_duration) / (total_calls + 1)
    END,
    updated_at = now()
  WHERE id = p_variant_id;
END;
$$;


ALTER FUNCTION "public"."update_variant_stats"("p_variant_id" "uuid", "p_outcome" "text", "p_duration" integer, "p_converted" boolean) OWNER TO "postgres";

--
-- Name: update_voicemail_analytics("uuid", "uuid", "text", integer, boolean, boolean, boolean, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."update_voicemail_analytics"("p_user_id" "uuid", "p_broadcast_id" "uuid", "p_voicemail_audio_url" "text", "p_voicemail_duration" integer, "p_is_callback" boolean DEFAULT false, "p_callback_within_1h" boolean DEFAULT false, "p_callback_within_24h" boolean DEFAULT false, "p_resulted_in_appointment" boolean DEFAULT false) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  v_analytics_id UUID;
BEGIN
  -- Find or create analytics record
  SELECT id INTO v_analytics_id
  FROM public.voicemail_analytics
  WHERE user_id = p_user_id
    AND (broadcast_id = p_broadcast_id OR (broadcast_id IS NULL AND p_broadcast_id IS NULL))
    AND (voicemail_audio_url = p_voicemail_audio_url OR (voicemail_audio_url IS NULL AND p_voicemail_audio_url IS NULL));

  IF v_analytics_id IS NULL THEN
    INSERT INTO public.voicemail_analytics (
      user_id, broadcast_id, voicemail_audio_url, voicemail_duration_seconds,
      total_voicemails_left
    ) VALUES (
      p_user_id, p_broadcast_id, p_voicemail_audio_url, p_voicemail_duration,
      CASE WHEN NOT p_is_callback THEN 1 ELSE 0 END
    )
    RETURNING id INTO v_analytics_id;
  ELSE
    -- Update existing record
    IF p_is_callback THEN
      UPDATE public.voicemail_analytics SET
        callbacks_received = callbacks_received + 1,
        callbacks_within_1h = callbacks_within_1h + CASE WHEN p_callback_within_1h THEN 1 ELSE 0 END,
        callbacks_within_24h = callbacks_within_24h + CASE WHEN p_callback_within_24h THEN 1 ELSE 0 END,
        appointments_from_callbacks = appointments_from_callbacks + CASE WHEN p_resulted_in_appointment THEN 1 ELSE 0 END,
        updated_at = NOW()
      WHERE id = v_analytics_id;
    ELSE
      UPDATE public.voicemail_analytics SET
        total_voicemails_left = total_voicemails_left + 1,
        last_used_at = NOW(),
        updated_at = NOW()
      WHERE id = v_analytics_id;
    END IF;
  END IF;

  -- Recalculate rates
  UPDATE public.voicemail_analytics SET
    callback_rate = CASE WHEN total_voicemails_left > 0
      THEN (callbacks_received::DECIMAL / total_voicemails_left * 100) ELSE 0 END,
    callback_rate_24h = CASE WHEN total_voicemails_left > 0
      THEN (callbacks_within_24h::DECIMAL / total_voicemails_left * 100) ELSE 0 END,
    appointment_conversion_rate = CASE WHEN callbacks_received > 0
      THEN (appointments_from_callbacks::DECIMAL / callbacks_received * 100) ELSE 0 END,
    effectiveness_score = LEAST(100, GREATEST(0,
      (CASE WHEN total_voicemails_left > 0 THEN (callbacks_received::DECIMAL / total_voicemails_left * 50) ELSE 0 END) +
      (CASE WHEN callbacks_received > 0 THEN (appointments_from_callbacks::DECIMAL / callbacks_received * 50) ELSE 0 END)
    )::INTEGER)
  WHERE id = v_analytics_id;

  RETURN v_analytics_id;
END;
$$;


ALTER FUNCTION "public"."update_voicemail_analytics"("p_user_id" "uuid", "p_broadcast_id" "uuid", "p_voicemail_audio_url" "text", "p_voicemail_duration" integer, "p_is_callback" boolean, "p_callback_within_1h" boolean, "p_callback_within_24h" boolean, "p_resulted_in_appointment" boolean) OWNER TO "postgres";

--
-- Name: upgrade_user_tier("uuid", "text", "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_stripe_customer_id" "text" DEFAULT NULL::"text", "p_stripe_subscription_id" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
BEGIN
  UPDATE user_feature_flags
  SET 
    current_tier = p_tier,
    stripe_customer_id = COALESCE(p_stripe_customer_id, stripe_customer_id),
    stripe_subscription_id = COALESCE(p_stripe_subscription_id, stripe_subscription_id),
    subscription_status = 'active',
    updated_at = NOW(),
    -- Tier 1 features (always on for paid)
    voice_broadcast = true,
    ghl_contact_import = true,
    ghl_basic_tagging = true,
    -- Tier 2 features
    pipeline_sync = p_tier IN ('tier2', 'tier3', 'tier4', 'tier5', 'enterprise'),
    disposition_automation = p_tier IN ('tier2', 'tier3', 'tier4', 'tier5', 'enterprise'),
    callback_scheduling = p_tier IN ('tier2', 'tier3', 'tier4', 'tier5', 'enterprise'),
    workflow_triggers = p_tier IN ('tier2', 'tier3', 'tier4', 'tier5', 'enterprise'),
    -- Tier 3 features
    ai_dialing = p_tier IN ('tier3', 'tier4', 'tier5', 'enterprise'),
    retell_integration = p_tier IN ('tier3', 'tier4', 'tier5', 'enterprise'),
    transcript_analysis = p_tier IN ('tier3', 'tier4', 'tier5', 'enterprise'),
    predictive_pacing = p_tier IN ('tier3', 'tier4', 'tier5', 'enterprise'),
    -- Tier 4 features
    autonomous_mode = p_tier IN ('tier4', 'tier5', 'enterprise'),
    ai_pipeline_manager = p_tier IN ('tier4', 'tier5', 'enterprise'),
    self_learning = p_tier IN ('tier4', 'tier5', 'enterprise'),
    script_optimization = p_tier IN ('tier4', 'tier5', 'enterprise'),
    -- Tier 5 features
    multi_carrier = p_tier IN ('tier5', 'enterprise'),
    custom_dashboard = p_tier IN ('tier5', 'enterprise'),
    white_label = p_tier IN ('enterprise'),
    api_access = p_tier IN ('tier5', 'enterprise')
  WHERE user_id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") OWNER TO "postgres";

--
-- Name: user_in_organization("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."user_in_organization"("org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_users
    WHERE organization_id = org_id AND user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."user_in_organization"("org_id" "uuid") OWNER TO "postgres";

--
-- Name: validate_phone_number_uses(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."validate_phone_number_uses"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'extensions', 'pg_temp'
    AS $$
DECLARE
  invalid_uses TEXT[];
  valid_codes TEXT[];
BEGIN
  -- Skip validation if allowed_uses is empty or null
  IF NEW.allowed_uses IS NULL OR array_length(NEW.allowed_uses, 1) IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get all valid codes
  SELECT array_agg(code) INTO valid_codes FROM phone_number_use_types WHERE is_active = true;
  
  -- Find any invalid use types
  SELECT array_agg(use_type) INTO invalid_uses
  FROM unnest(NEW.allowed_uses) AS use_type
  WHERE use_type != ALL(COALESCE(valid_codes, '{}'::TEXT[]));
  
  IF invalid_uses IS NOT NULL AND array_length(invalid_uses, 1) > 0 THEN
    RAISE EXCEPTION 'Invalid use types: %. Valid types are: %', 
      array_to_string(invalid_uses, ', '),
      array_to_string(valid_codes, ', ');
  END IF;
  
  -- If sip_broadcast is in allowed_uses, ensure sip_trunk_config_id is set (warning only)
  IF 'sip_broadcast' = ANY(NEW.allowed_uses) AND NEW.sip_trunk_config_id IS NULL THEN
    RAISE NOTICE 'Warning: Number % has sip_broadcast use but no sip_trunk_config_id', NEW.number;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_phone_number_uses"() OWNER TO "postgres";

--
-- Name: FUNCTION "validate_phone_number_uses"(); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION "public"."validate_phone_number_uses"() IS 'Validates that allowed_uses contains only valid codes from phone_number_use_types';


--
-- Name: active_ai_transfers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."active_ai_transfers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "call_sid" "text",
    "retell_call_id" "text",
    "lead_id" "uuid",
    "broadcast_id" "uuid",
    "transfer_number" "text",
    "started_at" timestamp with time zone DEFAULT "now"(),
    "ended_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "active_ai_transfers_platform_check" CHECK (("platform" = ANY (ARRAY['retell'::"text", 'assistable'::"text"]))),
    CONSTRAINT "active_ai_transfers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."active_ai_transfers" OWNER TO "postgres";

--
-- Name: adaptive_pacing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."adaptive_pacing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "current_cpm" numeric(5,2) DEFAULT 1.0,
    "target_answer_rate" numeric(5,2) DEFAULT 0.25,
    "actual_answer_rate" numeric(5,2),
    "window_size_minutes" integer DEFAULT 15,
    "last_adjusted_at" timestamp with time zone,
    "adjustment_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."adaptive_pacing" OWNER TO "postgres";

--
-- Name: advanced_dialer_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."advanced_dialer_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enable_amd" boolean DEFAULT false,
    "enable_local_presence" boolean DEFAULT false,
    "enable_timezone_compliance" boolean DEFAULT true,
    "enable_dnc_check" boolean DEFAULT true,
    "amd_sensitivity" "text" DEFAULT 'medium'::"text",
    "local_presence_strategy" "text" DEFAULT 'match_area_code'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "advanced_dialer_settings_amd_sensitivity_check" CHECK (("amd_sensitivity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "advanced_dialer_settings_local_presence_strategy_check" CHECK (("local_presence_strategy" = ANY (ARRAY['match_area_code'::"text", 'match_prefix'::"text", 'nearest'::"text"])))
);


ALTER TABLE "public"."advanced_dialer_settings" OWNER TO "postgres";

--
-- Name: agent_decisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."agent_decisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "lead_name" "text",
    "decision_type" "text" NOT NULL,
    "reasoning" "text",
    "action_taken" "text",
    "outcome" "text",
    "success" boolean,
    "executed_at" timestamp with time zone,
    "approved_by" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agent_decisions_approved_by_check" CHECK (("approved_by" = ANY (ARRAY['autonomous'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."agent_decisions" OWNER TO "postgres";

--
-- Name: agent_improvement_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."agent_improvement_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "agent_name" "text",
    "improvement_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "text" DEFAULT 'user'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "agent_improvement_history_created_by_check" CHECK (("created_by" = ANY (ARRAY['user'::"text", 'lady_jarvis'::"text", 'autonomous'::"text"]))),
    CONSTRAINT "agent_improvement_history_improvement_type_check" CHECK (("improvement_type" = ANY (ARRAY['script_update'::"text", 'analysis_insight'::"text", 'manual_note'::"text", 'auto_optimization'::"text", 'performance_review'::"text"])))
);


ALTER TABLE "public"."agent_improvement_history" OWNER TO "postgres";

--
-- Name: agent_pricing; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."agent_pricing" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "retell_agent_id" "text" NOT NULL,
    "agent_name" "text",
    "llm_model" "text",
    "voice_provider" "text",
    "has_knowledge_base" boolean DEFAULT false,
    "base_cost_per_min_cents" numeric(10,4),
    "markup_cents" numeric(10,4) DEFAULT 3.0,
    "markup_type" "text" DEFAULT 'fixed'::"text",
    "markup_percentage" numeric(5,2),
    "customer_price_per_min_cents" numeric(10,4),
    "is_active" boolean DEFAULT true,
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."agent_pricing" OWNER TO "postgres";

--
-- Name: agent_script_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."agent_script_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_id" "text" NOT NULL,
    "variant_name" "text" NOT NULL,
    "variant_label" "text",
    "prompt_patch" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "weight" numeric(5,4) DEFAULT 0.5,
    "alpha" integer DEFAULT 1,
    "beta" integer DEFAULT 1,
    "total_calls" integer DEFAULT 0,
    "total_conversions" integer DEFAULT 0,
    "avg_duration_seconds" numeric(10,2),
    "avg_sentiment_score" numeric(5,2),
    "is_active" boolean DEFAULT true,
    "is_control" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."agent_script_variants" OWNER TO "postgres";

--
-- Name: ai_action_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_action_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_entity_type" "text",
    "target_entity_id" "uuid",
    "action_payload" "jsonb" DEFAULT '{}'::"jsonb",
    "result" "jsonb",
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "executed_at" timestamp with time zone,
    "expires_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source" "text" DEFAULT 'autonomous_engine'::"text"
);


ALTER TABLE "public"."ai_action_queue" OWNER TO "postgres";

--
-- Name: ai_campaign_strategies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_campaign_strategies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "goal_type" "text" NOT NULL,
    "goal_description" "text" NOT NULL,
    "analysis" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_workflows" "jsonb" DEFAULT '[]'::"jsonb",
    "created_playbook_rules" "jsonb" DEFAULT '[]'::"jsonb",
    "created_pipelines" "jsonb" DEFAULT '[]'::"jsonb",
    "status" "text" DEFAULT 'analyzing'::"text" NOT NULL,
    "approved_at" timestamp with time zone,
    "total_leads_processed" integer DEFAULT 0,
    "total_calls_made" integer DEFAULT 0,
    "total_appointments_set" integer DEFAULT 0,
    "total_conversions" integer DEFAULT 0,
    "conversion_rate" numeric(5,4) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ai_campaign_strategies_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['appointment_setting'::"text", 'lead_qualification'::"text", 'database_reactivation'::"text", 'debt_collection'::"text", 'insurance_sales'::"text", 'real_estate'::"text", 'solar_sales'::"text", 'home_services'::"text", 'custom'::"text"]))),
    CONSTRAINT "ai_campaign_strategies_status_check" CHECK (("status" = ANY (ARRAY['analyzing'::"text", 'proposed'::"text", 'approved'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."ai_campaign_strategies" OWNER TO "postgres";

--
-- Name: ai_chatbot_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_chatbot_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "voice_enabled" boolean DEFAULT true,
    "voice_id" "text" DEFAULT 'EXAVITQu4vr4xnSDxMaL'::"text",
    "auto_speak" boolean DEFAULT false,
    "ai_actions_enabled" boolean DEFAULT true,
    "custom_report_instructions" "text",
    "report_metrics" "text"[] DEFAULT ARRAY['total_calls'::"text", 'connected_calls'::"text", 'answer_rate'::"text", 'appointments_set'::"text", 'wins'::"text", 'improvements'::"text", 'recommendations'::"text"],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_chatbot_settings" OWNER TO "postgres";

--
-- Name: ai_daily_insights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_daily_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "insight_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "total_interactions" integer DEFAULT 0,
    "positive_feedback" integer DEFAULT 0,
    "negative_feedback" integer DEFAULT 0,
    "top_actions" "jsonb" DEFAULT '[]'::"jsonb",
    "patterns_learned" "jsonb" DEFAULT '[]'::"jsonb",
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_daily_insights" OWNER TO "postgres";

--
-- Name: ai_feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "response_id" "text" NOT NULL,
    "rating" "text" NOT NULL,
    "message_content" "text",
    "response_content" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_feedback_rating_check" CHECK (("rating" = ANY (ARRAY['up'::"text", 'down'::"text"])))
);


ALTER TABLE "public"."ai_feedback" OWNER TO "postgres";

--
-- Name: ai_learning; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_learning" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pattern_type" "text" NOT NULL,
    "pattern_key" "text" NOT NULL,
    "pattern_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "success_count" integer DEFAULT 0,
    "failure_count" integer DEFAULT 0,
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_learning" OWNER TO "postgres";

--
-- Name: ai_operational_memory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_operational_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_type" "text" NOT NULL,
    "memory_key" "text" NOT NULL,
    "memory_value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "confidence" numeric(5,2) DEFAULT 0.5,
    "last_accessed_at" timestamp with time zone,
    "access_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_operational_memory" OWNER TO "postgres";

--
-- Name: ai_session_memory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_session_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_id" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "action_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "resource_id" "text",
    "resource_type" "text",
    "resource_name" "text",
    "can_undo" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ai_session_memory" OWNER TO "postgres";

--
-- Name: ai_sms_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_sms_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true,
    "context_window_size" integer DEFAULT 20,
    "max_context_tokens" integer DEFAULT 4000,
    "enable_image_analysis" boolean DEFAULT true,
    "enable_reaction_detection" boolean DEFAULT true,
    "prevent_double_texting" boolean DEFAULT true,
    "double_text_delay_seconds" integer DEFAULT 300,
    "use_number_rotation" boolean DEFAULT false,
    "retell_agent_id" "text",
    "ai_personality" "text" DEFAULT 'professional and helpful'::"text",
    "auto_response_enabled" boolean DEFAULT false,
    "business_hours_only" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ai_provider" "text" DEFAULT 'lovable'::"text",
    "retell_llm_id" "text",
    "retell_voice_id" "text",
    "custom_instructions" "text" DEFAULT ''::"text",
    "knowledge_base" "text" DEFAULT ''::"text",
    "dynamic_variables_enabled" boolean DEFAULT true,
    "include_lead_context" boolean DEFAULT true,
    "include_call_history" boolean DEFAULT true,
    "include_sms_history" boolean DEFAULT true,
    "max_history_items" integer DEFAULT 5,
    "enable_calendar_integration" boolean DEFAULT false,
    "calendar_booking_link" "text",
    CONSTRAINT "ai_sms_settings_ai_provider_check" CHECK (("ai_provider" = ANY (ARRAY['lovable'::"text", 'retell'::"text"])))
);


ALTER TABLE "public"."ai_sms_settings" OWNER TO "postgres";

--
-- Name: ai_workflow_generations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ai_workflow_generations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "user_prompt" "text" NOT NULL,
    "generated_workflow_id" "uuid",
    "generated_steps" "jsonb" NOT NULL,
    "user_feedback" "text",
    "modifications_made" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ai_workflow_generations" OWNER TO "postgres";

--
-- Name: api_key_audit_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."api_key_audit_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "api_key_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "method" "text" NOT NULL,
    "path" "text" NOT NULL,
    "status_code" integer,
    "ip_address" "text",
    "user_agent" "text",
    "duration_ms" integer,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_key_audit_log" OWNER TO "postgres";

--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."api_keys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "key_prefix" "text" NOT NULL,
    "key_hash" "text" NOT NULL,
    "scopes" "text"[] DEFAULT ARRAY['read'::"text"] NOT NULL,
    "rate_limit_per_minute" integer DEFAULT 120 NOT NULL,
    "last_used_at" timestamp with time zone,
    "last_used_ip" "text",
    "expires_at" timestamp with time zone,
    "revoked_at" timestamp with time zone,
    "revoked_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."api_keys" OWNER TO "postgres";

--
-- Name: autonomous_goals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."autonomous_goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "goal_type" "text" NOT NULL,
    "goal_date" "date" NOT NULL,
    "appointments_target" integer DEFAULT 5,
    "appointments_achieved" integer DEFAULT 0,
    "calls_target" integer DEFAULT 100,
    "calls_achieved" integer DEFAULT 0,
    "conversations_target" integer DEFAULT 20,
    "conversations_achieved" integer DEFAULT 0,
    "goal_met" boolean DEFAULT false,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "autonomous_goals_goal_type_check" CHECK (("goal_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text"])))
);


ALTER TABLE "public"."autonomous_goals" OWNER TO "postgres";

--
-- Name: autonomous_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."autonomous_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT false,
    "auto_execute_recommendations" boolean DEFAULT false,
    "auto_approve_script_changes" boolean DEFAULT false,
    "require_approval_for_high_priority" boolean DEFAULT true,
    "max_daily_autonomous_actions" integer DEFAULT 50,
    "decision_tracking_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "autonomy_level" "text" DEFAULT 'suggestions_only'::"text",
    "daily_goal_appointments" integer DEFAULT 5,
    "daily_goal_calls" integer DEFAULT 100,
    "daily_goal_conversations" integer DEFAULT 20,
    "learning_enabled" boolean DEFAULT true,
    "auto_optimize_campaigns" boolean DEFAULT false,
    "auto_prioritize_leads" boolean DEFAULT true,
    "auto_script_optimization" boolean DEFAULT false,
    "script_optimization_threshold" integer DEFAULT 50,
    "max_auto_script_changes_per_day" integer DEFAULT 3,
    "require_approval_for_script_changes" boolean DEFAULT true,
    "manage_lead_journeys" boolean DEFAULT false,
    "auto_adjust_pacing" boolean DEFAULT false,
    "enable_script_ab_testing" boolean DEFAULT false,
    "last_engine_run" timestamp with time zone,
    "engine_interval_minutes" integer DEFAULT 5,
    "auto_optimize_calling_times" boolean DEFAULT false,
    "journey_max_daily_touches" integer DEFAULT 200,
    "enable_daily_planning" boolean DEFAULT false,
    "enable_strategic_insights" boolean DEFAULT false,
    "daily_budget_cents" integer DEFAULT 50000,
    "auto_create_rules_from_insights" boolean DEFAULT false,
    "insight_confidence_threshold" numeric DEFAULT 0.75,
    "briefing_frequency" "text" DEFAULT 'daily'::"text",
    "perpetual_followup_enabled" boolean DEFAULT false,
    "perpetual_max_days" integer DEFAULT 365,
    "perpetual_min_gap_days" integer DEFAULT 7,
    "perpetual_max_gap_days" integer DEFAULT 30,
    "perpetual_channels" "jsonb" DEFAULT '["sms", "call"]'::"jsonb",
    "perpetual_stop_on" "jsonb" DEFAULT '["dnc", "not_interested", "unsubscribe"]'::"jsonb",
    CONSTRAINT "autonomous_settings_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['full_auto'::"text", 'approval_required'::"text", 'suggestions_only'::"text"])))
);


ALTER TABLE "public"."autonomous_settings" OWNER TO "postgres";

--
-- Name: broadcast_queue; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."broadcast_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "broadcast_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "phone_number" "text" NOT NULL,
    "lead_name" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0,
    "max_attempts" integer DEFAULT 1,
    "scheduled_at" timestamp with time zone DEFAULT "now"(),
    "dtmf_pressed" "text",
    "call_duration_seconds" integer,
    "transfer_status" "text",
    "callback_scheduled_at" timestamp with time zone,
    "ai_transcript" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "call_sid" "text",
    "recording_url" "text",
    "amd_result" "text",
    "call_cost" numeric(10,4),
    "error_message" "text",
    "error_code" "text",
    "ghl_contact_id" "text",
    "ghl_callback_status" "text" DEFAULT 'pending'::"text",
    CONSTRAINT "broadcast_queue_ghl_callback_status_check" CHECK (("ghl_callback_status" = ANY (ARRAY['pending'::"text", 'queued'::"text", 'sent'::"text", 'skipped'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."broadcast_queue" OWNER TO "postgres";

--
-- Name: COLUMN "broadcast_queue"."call_sid"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."broadcast_queue"."call_sid" IS 'Twilio CallSid for matching status webhooks';


--
-- Name: COLUMN "broadcast_queue"."recording_url"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."broadcast_queue"."recording_url" IS 'URL to call recording if available';


--
-- Name: COLUMN "broadcast_queue"."amd_result"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."broadcast_queue"."amd_result" IS 'Twilio AMD detection result: human, machine_start, machine_end_beep, machine_end_silence, machine_end_other, fax, unknown';


--
-- Name: COLUMN "broadcast_queue"."call_cost"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."broadcast_queue"."call_cost" IS 'Actual cost from Twilio in USD';


--
-- Name: COLUMN "broadcast_queue"."ghl_contact_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."broadcast_queue"."ghl_contact_id" IS 'GHL contact ID for callback after call completes';


--
-- Name: COLUMN "broadcast_queue"."ghl_callback_status"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."broadcast_queue"."ghl_callback_status" IS 'Status of GHL callback: pending, queued, sent, skipped, failed';


--
-- Name: budget_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."budget_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "budget_setting_id" "uuid",
    "alert_type" "text" NOT NULL,
    "threshold_percent" integer,
    "amount_spent" numeric(10,4),
    "budget_limit" numeric(10,4),
    "message" "text",
    "acknowledged" boolean DEFAULT false,
    "acknowledged_at" timestamp with time zone,
    "action_taken" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."budget_alerts" OWNER TO "postgres";

--
-- Name: budget_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."budget_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "daily_limit" numeric(10,2),
    "monthly_limit" numeric(10,2),
    "alert_threshold_percent" integer DEFAULT 80,
    "auto_pause_enabled" boolean DEFAULT true,
    "is_paused" boolean DEFAULT false,
    "paused_at" timestamp with time zone,
    "pause_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."budget_settings" OWNER TO "postgres";

--
-- Name: calendar_appointments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."calendar_appointments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "meeting_link" "text",
    "start_time" timestamp with time zone NOT NULL,
    "end_time" timestamp with time zone NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "google_event_id" "text",
    "ghl_appointment_id" "text",
    "outlook_event_id" "text",
    "reminder_sent" boolean DEFAULT false,
    "reminder_at" timestamp with time zone,
    "notes" "text",
    "outcome" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_appointments" OWNER TO "postgres";

--
-- Name: calendar_availability; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."calendar_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "timezone" "text" DEFAULT 'America/New_York'::"text" NOT NULL,
    "weekly_schedule" "jsonb" DEFAULT '{"friday": [{"end": "17:00", "start": "09:00"}], "monday": [{"end": "17:00", "start": "09:00"}], "sunday": [], "tuesday": [{"end": "17:00", "start": "09:00"}], "saturday": [], "thursday": [{"end": "17:00", "start": "09:00"}], "wednesday": [{"end": "17:00", "start": "09:00"}]}'::"jsonb" NOT NULL,
    "buffer_before_minutes" integer DEFAULT 15,
    "buffer_after_minutes" integer DEFAULT 15,
    "default_meeting_duration" integer DEFAULT 30,
    "min_notice_hours" integer DEFAULT 2,
    "max_days_ahead" integer DEFAULT 30,
    "slot_interval_minutes" integer DEFAULT 15,
    "check_calendar_conflicts" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_availability" OWNER TO "postgres";

--
-- Name: calendar_integrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."calendar_integrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "provider_account_id" "text",
    "provider_account_email" "text",
    "access_token_encrypted" "text",
    "refresh_token_encrypted" "text",
    "token_expires_at" timestamp with time zone,
    "calendar_id" "text",
    "calendar_name" "text",
    "is_primary" boolean DEFAULT false,
    "sync_enabled" boolean DEFAULT true,
    "sync_direction" "text" DEFAULT 'bidirectional'::"text",
    "last_sync_at" timestamp with time zone,
    "sync_errors" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_integrations" OWNER TO "postgres";

--
-- Name: calendar_tool_invocations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."calendar_tool_invocations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "parameters" "jsonb" DEFAULT '{}'::"jsonb",
    "result" "jsonb" DEFAULT '{}'::"jsonb",
    "success" boolean DEFAULT true,
    "error_message" "text",
    "duration_ms" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_tool_invocations" OWNER TO "postgres";

--
-- Name: call_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "lead_id" "uuid",
    "phone_number" "text" NOT NULL,
    "caller_id" "text" NOT NULL,
    "retell_call_id" "text",
    "status" "text" NOT NULL,
    "duration_seconds" integer DEFAULT 0,
    "outcome" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "answered_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "amd_result" "text",
    "transcript" "text",
    "ai_analysis" "jsonb",
    "auto_disposition" "text",
    "confidence_score" numeric(3,2),
    "agent_id" "text",
    "agent_name" "text",
    "recording_url" "text",
    "sentiment" "text",
    "call_summary" "text",
    "time_wasted_score" integer DEFAULT 0,
    "time_wasted_reason" "text",
    "opener_extracted" "text",
    "opener_score" integer,
    "provider" "text" DEFAULT 'retell'::"text",
    "telnyx_call_control_id" "text",
    "telnyx_call_session_id" "text",
    "telnyx_conversation_id" "text",
    "telnyx_assistant_id" "text",
    "amd_type" "text",
    "organization_id" "uuid",
    "started_at" timestamp with time zone,
    "retell_cost_cents" integer,
    "cost_breakdown" "jsonb",
    "token_usage" "jsonb",
    CONSTRAINT "call_logs_amd_result_check" CHECK (("amd_result" = ANY (ARRAY['human'::"text", 'machine'::"text", 'unknown'::"text"]))),
    CONSTRAINT "call_logs_outcome_check" CHECK ((("outcome" IS NULL) OR ("outcome" = ANY (ARRAY['interested'::"text", 'not_interested'::"text", 'callback'::"text", 'callback_requested'::"text", 'converted'::"text", 'do_not_call'::"text", 'contacted'::"text", 'appointment_set'::"text", 'dnc'::"text", 'completed'::"text", 'voicemail'::"text", 'no_answer'::"text", 'busy'::"text", 'failed'::"text", 'unknown'::"text", 'wrong_number'::"text", 'not_qualified'::"text", 'already_customer'::"text", 'not_decision_maker'::"text"])))),
    CONSTRAINT "call_logs_status_check" CHECK (("status" = ANY (ARRAY['queued'::"text", 'ringing'::"text", 'answered'::"text", 'busy'::"text", 'no_answer'::"text", 'voicemail'::"text", 'failed'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."call_logs" OWNER TO "postgres";

--
-- Name: COLUMN "call_logs"."time_wasted_reason"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."call_logs"."time_wasted_reason" IS 'Reason for time wasted: vm_too_late (hit VM after 30s), short_no_outcome (< 15s, no result),
long_no_conversion (> 5min, no appointment), repeated_no_answer, objection_not_handled';


--
-- Name: call_opener_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."call_opener_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "call_id" "uuid",
    "opener_id" "uuid",
    "was_answered" boolean DEFAULT false,
    "was_engaged" boolean DEFAULT false,
    "was_converted" boolean DEFAULT false,
    "call_duration" integer DEFAULT 0,
    "time_to_engagement" integer,
    "opener_text_used" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."call_opener_logs" OWNER TO "postgres";

--
-- Name: TABLE "call_opener_logs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."call_opener_logs" IS 'Links individual calls to their openers for detailed analysis';


--
-- Name: leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "company" "text",
    "notes" "text",
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "priority" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_contacted_at" timestamp with time zone,
    "next_callback_at" timestamp with time zone,
    "lead_source" "text",
    "tags" "text"[],
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "preferred_contact_time" "text",
    "do_not_call" boolean DEFAULT false,
    "ghl_contact_id" "text",
    "address" "text",
    "city" "text",
    "state" "text",
    "zip_code" "text",
    CONSTRAINT "leads_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 5))),
    CONSTRAINT "leads_status_check" CHECK ((("status" IS NULL) OR ("status" = ANY (ARRAY['new'::"text", 'contacted'::"text", 'interested'::"text", 'not_interested'::"text", 'callback'::"text", 'converted'::"text", 'do_not_call'::"text", 'appointment'::"text", 'dnc'::"text", 'invalid'::"text", 'qualified'::"text", 'won'::"text", 'dead'::"text", 'nurturing'::"text", 'stalled'::"text"]))))
);


ALTER TABLE "public"."leads" OWNER TO "postgres";

--
-- Name: COLUMN "leads"."lead_source"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."lead_source" IS 'Source of the lead (e.g., website, referral, paid ad, cold outreach)';


--
-- Name: COLUMN "leads"."tags"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."tags" IS 'Array of tags for categorizing leads';


--
-- Name: COLUMN "leads"."custom_fields"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."custom_fields" IS 'JSONB object for storing any custom data specific to the lead';


--
-- Name: COLUMN "leads"."timezone"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."timezone" IS 'Timezone of the lead for optimal calling times';


--
-- Name: COLUMN "leads"."preferred_contact_time"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."preferred_contact_time" IS 'Preferred time to contact the lead';


--
-- Name: COLUMN "leads"."do_not_call"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."do_not_call" IS 'Flag to prevent calling this lead';


--
-- Name: COLUMN "leads"."ghl_contact_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."ghl_contact_id" IS 'GoHighLevel contact ID for integration';


--
-- Name: COLUMN "leads"."address"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."address" IS 'Street address for the lead';


--
-- Name: COLUMN "leads"."city"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."city" IS 'City for the lead';


--
-- Name: COLUMN "leads"."state"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."state" IS 'State for the lead';


--
-- Name: COLUMN "leads"."zip_code"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."leads"."zip_code" IS 'ZIP/Postal code for the lead';


--
-- Name: call_outcome_dimensions; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."call_outcome_dimensions" WITH ("security_invoker"='on') AS
 SELECT "cl"."id" AS "call_id",
    "cl"."user_id",
    "cl"."lead_id",
    "cl"."outcome",
    "cl"."duration_seconds",
    "cl"."sentiment",
    "cl"."created_at" AS "call_time",
    EXTRACT(dow FROM "cl"."created_at") AS "day_of_week",
    EXTRACT(hour FROM "cl"."created_at") AS "hour_of_day",
    "cl"."caller_id" AS "from_number",
    "cl"."phone_number" AS "to_number",
    "cl"."agent_id",
    "cl"."campaign_id",
    "l"."lead_source",
    "l"."status" AS "lead_status"
   FROM ("public"."call_logs" "cl"
     LEFT JOIN "public"."leads" "l" ON (("cl"."lead_id" = "l"."id")));


ALTER TABLE "public"."call_outcome_dimensions" OWNER TO "postgres";

--
-- Name: call_variant_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."call_variant_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "call_id" "uuid",
    "variant_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "outcome" "text",
    "duration_seconds" integer,
    "sentiment_score" numeric(5,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."call_variant_assignments" OWNER TO "postgres";

--
-- Name: campaign_automation_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."campaign_automation_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "rule_type" "text" DEFAULT 'schedule'::"text" NOT NULL,
    "priority" integer DEFAULT 0,
    "enabled" boolean DEFAULT true,
    "conditions" "jsonb" DEFAULT '{}'::"jsonb",
    "actions" "jsonb" DEFAULT '{}'::"jsonb",
    "start_date" "date",
    "end_date" "date",
    "days_of_week" "text"[] DEFAULT ARRAY['monday'::"text", 'tuesday'::"text", 'wednesday'::"text", 'thursday'::"text", 'friday'::"text"],
    "time_windows" "jsonb" DEFAULT '[{"end": "17:00", "start": "09:00"}]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_automation_rules" OWNER TO "postgres";

--
-- Name: campaign_leads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."campaign_leads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "lead_id" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_leads" OWNER TO "postgres";

--
-- Name: campaign_phone_pools; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."campaign_phone_pools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "phone_number_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'outbound'::"text",
    "is_primary" boolean DEFAULT false,
    "priority" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "campaign_phone_pools_role_check" CHECK (("role" = ANY (ARRAY['outbound'::"text", 'caller_id_only'::"text", 'sms_only'::"text", 'inbound'::"text"])))
);


ALTER TABLE "public"."campaign_phone_pools" OWNER TO "postgres";

--
-- Name: campaign_workflows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."campaign_workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "workflow_type" "text" DEFAULT 'calling_only'::"text" NOT NULL,
    "is_template" boolean DEFAULT false,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "auto_reply_settings" "jsonb"
);


ALTER TABLE "public"."campaign_workflows" OWNER TO "postgres";

--
-- Name: COLUMN "campaign_workflows"."auto_reply_settings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."campaign_workflows"."auto_reply_settings" IS 'Workflow-level AI auto-reply settings: { enabled: boolean, ai_instructions: string, response_delay_seconds: number, stop_on_human_reply: boolean, calendar_enabled: boolean, booking_link: string }';


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "script" "text",
    "agent_id" "text",
    "calls_per_minute" integer DEFAULT 5,
    "max_attempts" integer DEFAULT 3,
    "calling_hours_start" time without time zone DEFAULT '09:00:00'::time without time zone,
    "calling_hours_end" time without time zone DEFAULT '17:00:00'::time without time zone,
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "workflow_id" "uuid",
    "retry_delay_minutes" integer DEFAULT 15,
    "max_calls_per_day" integer DEFAULT 2,
    "sms_on_no_answer" boolean DEFAULT false,
    "sms_template" "text",
    "sms_from_number" "text",
    "provider" "text" DEFAULT 'retell'::"text" NOT NULL,
    "telnyx_assistant_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "campaigns_calls_per_minute_check" CHECK ((("calls_per_minute" >= 1) AND ("calls_per_minute" <= 30))),
    CONSTRAINT "campaigns_max_attempts_check" CHECK ((("max_attempts" >= 1) AND ("max_attempts" <= 10))),
    CONSTRAINT "campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";

--
-- Name: COLUMN "campaigns"."sms_from_number"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."campaigns"."sms_from_number" IS 'The Twilio A2P phone number to use for sending SMS in workflows';


--
-- Name: COLUMN "campaigns"."provider"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."campaigns"."provider" IS 'AI voice provider: retell or telnyx';


--
-- Name: COLUMN "campaigns"."telnyx_assistant_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."campaigns"."telnyx_assistant_id" IS 'Telnyx assistant ID when provider=telnyx';


--
-- Name: churn_risk_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."churn_risk_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "risk_score" numeric(5,4) NOT NULL,
    "risk_level" "text" NOT NULL,
    "trigger_reason" "text" NOT NULL,
    "risk_signals" "jsonb" DEFAULT '{}'::"jsonb",
    "action_taken" "text",
    "action_result" "text",
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "churn_risk_events_risk_level_check" CHECK (("risk_level" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"])))
);


ALTER TABLE "public"."churn_risk_events" OWNER TO "postgres";

--
-- Name: credit_transactions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."credit_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "transaction_type" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "balance_before_cents" integer NOT NULL,
    "balance_after_cents" integer NOT NULL,
    "description" "text",
    "margin_cents" integer,
    "call_log_id" "uuid",
    "retell_call_id" "text",
    "stripe_payment_id" "text",
    "idempotency_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."credit_transactions" OWNER TO "postgres";

--
-- Name: daily_battle_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."daily_battle_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "executive_summary" "text",
    "priority_order" "jsonb" DEFAULT '[]'::"jsonb",
    "budget_allocation" "jsonb" DEFAULT '{}'::"jsonb",
    "number_allocation" "jsonb" DEFAULT '{}'::"jsonb",
    "time_blocks" "jsonb" DEFAULT '[]'::"jsonb",
    "risk_factors" "jsonb" DEFAULT '[]'::"jsonb",
    "expected_outcomes" "jsonb" DEFAULT '{}'::"jsonb",
    "actual_outcomes" "jsonb" DEFAULT '{}'::"jsonb",
    "adherence_score" numeric,
    "resource_inventory" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_battle_plans" OWNER TO "postgres";

--
-- Name: daily_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."daily_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "report_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "report_type" "text" DEFAULT 'daily'::"text" NOT NULL,
    "total_calls" integer DEFAULT 0,
    "connected_calls" integer DEFAULT 0,
    "answer_rate" numeric DEFAULT 0,
    "avg_call_duration" integer DEFAULT 0,
    "appointments_set" integer DEFAULT 0,
    "callbacks_scheduled" integer DEFAULT 0,
    "dnc_added" integer DEFAULT 0,
    "sms_sent" integer DEFAULT 0,
    "sms_received" integer DEFAULT 0,
    "summary" "text",
    "wins" "text"[],
    "improvements" "text"[],
    "failures" "text"[],
    "recommendations" "text"[],
    "performance_score" integer DEFAULT 0,
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."daily_reports" OWNER TO "postgres";

--
-- Name: demo_agent_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."demo_agent_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "retell_agent_id" "text" NOT NULL,
    "retell_llm_id" "text" NOT NULL,
    "demo_phone_number" "text" NOT NULL,
    "retell_phone_id" "text",
    "base_prompt" "text" NOT NULL,
    "voice_id" "text" DEFAULT '11labs-Sarah'::"text",
    "is_active" boolean DEFAULT true,
    "max_calls_per_ip_per_day" integer DEFAULT 3,
    "max_calls_per_day" integer DEFAULT 100,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "campaign_prompts" "jsonb" DEFAULT '{}'::"jsonb",
    "sms_confirmation_enabled" boolean DEFAULT true
);


ALTER TABLE "public"."demo_agent_config" OWNER TO "postgres";

--
-- Name: demo_call_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."demo_call_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid",
    "phone_number" "text" NOT NULL,
    "ip_address" "text" NOT NULL,
    "retell_call_id" "text",
    "status" "text" DEFAULT 'initiated'::"text",
    "error_message" "text",
    "call_duration_seconds" integer,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."demo_call_logs" OWNER TO "postgres";

--
-- Name: demo_sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."demo_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "website_url" "text",
    "scraped_data" "jsonb",
    "campaign_type" "text",
    "simulation_config" "jsonb",
    "prospect_phone" "text",
    "prospect_name" "text",
    "prospect_email" "text",
    "ip_address" "text",
    "user_agent" "text",
    "call_initiated" boolean DEFAULT false,
    "call_completed" boolean DEFAULT false,
    "retell_call_id" "text",
    "call_duration_seconds" integer,
    "call_recording_url" "text",
    "simulation_started" boolean DEFAULT false,
    "simulation_completed" boolean DEFAULT false,
    "roi_viewed" boolean DEFAULT false,
    "cta_clicked" "text",
    "converted_to_signup" boolean DEFAULT false,
    "projected_annual_savings" numeric,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."demo_sessions" OWNER TO "postgres";

--
-- Name: disposition_auto_actions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."disposition_auto_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "disposition_id" "uuid",
    "disposition_name" "text",
    "action_type" "text" NOT NULL,
    "action_config" "jsonb" DEFAULT '{}'::"jsonb",
    "priority" integer DEFAULT 0,
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."disposition_auto_actions" OWNER TO "postgres";

--
-- Name: disposition_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."disposition_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "call_id" "uuid",
    "disposition_id" "uuid",
    "disposition_name" "text" NOT NULL,
    "set_by" "text" DEFAULT 'manual'::"text" NOT NULL,
    "set_by_user_id" "uuid",
    "ai_confidence_score" numeric(5,4),
    "call_ended_at" timestamp with time zone,
    "disposition_set_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "time_to_disposition_seconds" integer,
    "previous_status" "text",
    "new_status" "text",
    "previous_pipeline_stage" "text",
    "new_pipeline_stage" "text",
    "workflow_id" "uuid",
    "campaign_id" "uuid",
    "actions_triggered" "jsonb" DEFAULT '[]'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."disposition_metrics" OWNER TO "postgres";

--
-- Name: disposition_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."disposition_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "disposition_name" "text" NOT NULL,
    "conversion_probability" numeric(5,4) DEFAULT 0.05 NOT NULL,
    "value_weight" integer DEFAULT 5 NOT NULL,
    "maps_to_stage" "text",
    "priority_boost" integer DEFAULT 0 NOT NULL,
    "requires_immediate_followup" boolean DEFAULT false,
    "custom_followup_delay_hours" numeric(8,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "disposition_values_maps_to_stage_check" CHECK (("maps_to_stage" = ANY (ARRAY['fresh'::"text", 'attempting'::"text", 'engaged'::"text", 'hot'::"text", 'nurturing'::"text", 'stalled'::"text", 'dormant'::"text", 'callback_set'::"text", 'booked'::"text", 'closed_won'::"text", 'closed_lost'::"text"]))),
    CONSTRAINT "disposition_values_value_weight_check" CHECK ((("value_weight" >= 1) AND ("value_weight" <= 10)))
);


ALTER TABLE "public"."disposition_values" OWNER TO "postgres";

--
-- Name: dispositions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."dispositions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "color" "text" DEFAULT '#3B82F6'::"text" NOT NULL,
    "pipeline_stage" "text" NOT NULL,
    "auto_actions" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dispositions" OWNER TO "postgres";

--
-- Name: dnc_list; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."dnc_list" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "reason" "text",
    "added_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."dnc_list" OWNER TO "postgres";

--
-- Name: edge_function_errors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."edge_function_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "function_name" "text" NOT NULL,
    "error_message" "text" NOT NULL,
    "stack_trace" "text",
    "request_context" "jsonb",
    "user_id" "uuid",
    "severity" "text" DEFAULT 'error'::"text" NOT NULL,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."edge_function_errors" OWNER TO "postgres";

--
-- Name: TABLE "edge_function_errors"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."edge_function_errors" IS 'Logs errors from Supabase Edge Functions for debugging and monitoring';


--
-- Name: follow_up_sequences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."follow_up_sequences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "pipeline_stage_id" "uuid",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."follow_up_sequences" OWNER TO "postgres";

--
-- Name: followup_playbook; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."followup_playbook" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "trigger_stage" "text" NOT NULL,
    "conditions" "jsonb" DEFAULT '{}'::"jsonb",
    "actions" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "priority" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "campaign_type" "text" DEFAULT 'all'::"text"
);


ALTER TABLE "public"."followup_playbook" OWNER TO "postgres";

--
-- Name: funnel_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."funnel_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "snapshot_date" "date" NOT NULL,
    "total_leads" integer DEFAULT 0,
    "fresh_count" integer DEFAULT 0,
    "attempting_count" integer DEFAULT 0,
    "engaged_count" integer DEFAULT 0,
    "hot_count" integer DEFAULT 0,
    "nurturing_count" integer DEFAULT 0,
    "stalled_count" integer DEFAULT 0,
    "callback_count" integer DEFAULT 0,
    "booked_count" integer DEFAULT 0,
    "won_count" integer DEFAULT 0,
    "lost_count" integer DEFAULT 0,
    "calls_made" integer DEFAULT 0,
    "sms_sent" integer DEFAULT 0,
    "appointments_booked" integer DEFAULT 0,
    "total_spend_cents" integer DEFAULT 0,
    "cost_per_appointment_cents" integer DEFAULT 0,
    "cost_per_conversation_cents" integer DEFAULT 0,
    "call_to_conversation_rate" numeric(5,4) DEFAULT 0,
    "conversation_to_appointment_rate" numeric(5,4) DEFAULT 0,
    "overall_conversion_rate" numeric(5,4) DEFAULT 0,
    "strategic_analysis" "text",
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."funnel_snapshots" OWNER TO "postgres";

--
-- Name: ghl_pending_updates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ghl_pending_updates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "ghl_contact_id" "text" NOT NULL,
    "broadcast_id" "uuid",
    "queue_item_id" "uuid",
    "broadcast_name" "text",
    "call_outcome" "text" NOT NULL,
    "call_duration_seconds" integer,
    "call_timestamp" timestamp with time zone,
    "dtmf_pressed" "text",
    "callback_requested" boolean DEFAULT false,
    "callback_time" timestamp with time zone,
    "status" "text" DEFAULT 'pending'::"text",
    "retry_count" integer DEFAULT 0,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "processed_at" timestamp with time zone,
    CONSTRAINT "ghl_pending_updates_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."ghl_pending_updates" OWNER TO "postgres";

--
-- Name: TABLE "ghl_pending_updates"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ghl_pending_updates" IS 'Stores voice broadcast call outcomes pending GHL sync';


--
-- Name: COLUMN "ghl_pending_updates"."ghl_contact_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ghl_pending_updates"."ghl_contact_id" IS 'GHL contact ID to update';


--
-- Name: COLUMN "ghl_pending_updates"."call_outcome"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ghl_pending_updates"."call_outcome" IS 'Call result: answered, voicemail, no_answer, busy, failed';


--
-- Name: COLUMN "ghl_pending_updates"."callback_requested"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ghl_pending_updates"."callback_requested" IS 'True if caller pressed DTMF for callback';


--
-- Name: ghl_sync_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ghl_sync_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "field_mappings" "jsonb" DEFAULT '{}'::"jsonb",
    "pipeline_stage_mappings" "jsonb" DEFAULT '{}'::"jsonb",
    "tag_rules" "jsonb" DEFAULT '{}'::"jsonb",
    "auto_create_opportunities" boolean DEFAULT false,
    "default_opportunity_value" numeric DEFAULT 0,
    "default_pipeline_id" "text",
    "remove_conflicting_tags" boolean DEFAULT true,
    "sync_enabled" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "calendar_preference" "text" DEFAULT 'both'::"text",
    "ghl_calendar_id" "text",
    "ghl_calendar_name" "text",
    "broadcast_webhook_key" "text",
    "broadcast_field_mappings" "jsonb" DEFAULT '{"tags": {"tag_prefix": "broadcast_", "add_outcome_tags": true}, "notes": {"add_activity_notes": true}, "fields": {"broadcast_name": {"enabled": true, "ghl_field_key": null}, "broadcast_outcome": {"enabled": true, "ghl_field_key": null}, "last_broadcast_date": {"enabled": true, "ghl_field_key": null}, "broadcast_dtmf_pressed": {"enabled": true, "ghl_field_key": null}, "broadcast_callback_time": {"enabled": true, "ghl_field_key": null}, "broadcast_callback_requested": {"enabled": true, "ghl_field_key": null}}, "enabled": true}'::"jsonb",
    CONSTRAINT "ghl_sync_settings_calendar_preference_check" CHECK (("calendar_preference" = ANY (ARRAY['google'::"text", 'ghl'::"text", 'both'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."ghl_sync_settings" OWNER TO "postgres";

--
-- Name: COLUMN "ghl_sync_settings"."broadcast_webhook_key"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ghl_sync_settings"."broadcast_webhook_key" IS 'Unique key for GHL workflow webhooks to add contacts to broadcasts';


--
-- Name: COLUMN "ghl_sync_settings"."broadcast_field_mappings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."ghl_sync_settings"."broadcast_field_mappings" IS 'Stores GHL custom field IDs for broadcast callback data. Structure: {enabled: bool, fields: {field_name: {enabled: bool, ghl_field_key: string}}, tags: {...}, notes: {...}}';


--
-- Name: guardian_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."guardian_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "severity" "text" DEFAULT 'medium'::"text" NOT NULL,
    "component" "text",
    "file_path" "text",
    "line_number" integer,
    "function_name" "text",
    "message" "text" NOT NULL,
    "stack_trace" "text",
    "context" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "resolution" "text",
    "resolved_by" "text",
    "resolved_at" timestamp with time zone,
    "detected_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "guardian_alerts_severity_check" CHECK (("severity" = ANY (ARRAY['critical'::"text", 'high'::"text", 'medium'::"text", 'low'::"text"]))),
    CONSTRAINT "guardian_alerts_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'investigating'::"text", 'resolved'::"text", 'dismissed'::"text", 'escalated'::"text"]))),
    CONSTRAINT "guardian_alerts_type_check" CHECK (("type" = ANY (ARRAY['frontend_error'::"text", 'backend_error'::"text", 'edge_function_error'::"text", 'database_error'::"text", 'performance_issue'::"text", 'security_issue'::"text", 'build_failure'::"text", 'test_failure'::"text", 'type_error'::"text", 'runtime_error'::"text", 'api_failure'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."guardian_alerts" OWNER TO "postgres";

--
-- Name: TABLE "guardian_alerts"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."guardian_alerts" IS 'Bridge table for Guardian AI to communicate issues to Claude Code for investigation and resolution';


--
-- Name: insight_generated_rules; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."insight_generated_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "insight_id" "uuid",
    "rule_type" "text" NOT NULL,
    "rule_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "performance_score" numeric,
    "times_fired" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."insight_generated_rules" OWNER TO "postgres";

--
-- Name: journey_event_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."journey_event_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "journey_state_id" "uuid",
    "event_type" "text" NOT NULL,
    "event_source" "text" DEFAULT 'system'::"text" NOT NULL,
    "from_stage" "text",
    "to_stage" "text",
    "event_data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."journey_event_log" OWNER TO "postgres";

--
-- Name: lead_intent_signals; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_intent_signals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "call_id" "uuid",
    "timeline" "text" DEFAULT 'unknown'::"text",
    "budget_mentioned" boolean DEFAULT false,
    "budget_range" "text",
    "is_decision_maker" boolean DEFAULT true,
    "decision_maker_name" "text",
    "buying_signals" "jsonb" DEFAULT '[]'::"jsonb",
    "objections" "jsonb" DEFAULT '[]'::"jsonb",
    "questions_asked" "jsonb" DEFAULT '[]'::"jsonb",
    "pain_points" "jsonb" DEFAULT '[]'::"jsonb",
    "specific_dates_mentioned" "jsonb" DEFAULT '[]'::"jsonb",
    "competitor_mentions" "jsonb" DEFAULT '[]'::"jsonb",
    "call_interest_score" integer DEFAULT 5,
    "llm_reasoning" "text",
    "model_used" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "lead_intent_signals_call_interest_score_check" CHECK ((("call_interest_score" >= 1) AND ("call_interest_score" <= 10)))
);


ALTER TABLE "public"."lead_intent_signals" OWNER TO "postgres";

--
-- Name: lead_journey_state; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_journey_state" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "current_stage" "text" DEFAULT 'new'::"text" NOT NULL,
    "previous_stage" "text",
    "stage_entered_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_touches" integer DEFAULT 0,
    "total_calls" integer DEFAULT 0,
    "total_sms" integer DEFAULT 0,
    "total_emails" integer DEFAULT 0,
    "sentiment_score" numeric(5,2),
    "engagement_score" numeric(5,2),
    "journey_health" "text" DEFAULT 'neutral'::"text",
    "next_recommended_action" "text",
    "next_action_scheduled_at" timestamp with time zone,
    "stale_since" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "total_cost_cents" integer DEFAULT 0,
    "call_cost_cents" integer DEFAULT 0,
    "sms_cost_cents" integer DEFAULT 0,
    "estimated_value_cents" integer DEFAULT 0,
    "roi_score" numeric(8,2) DEFAULT 0,
    "last_disposition" "text",
    "campaign_type" "text" DEFAULT 'cold_outreach'::"text",
    "strategy_id" "uuid",
    "perpetual_touch_count" integer DEFAULT 0,
    "perpetual_last_touch_at" timestamp with time zone,
    "perpetual_next_touch_at" timestamp with time zone
);


ALTER TABLE "public"."lead_journey_state" OWNER TO "postgres";

--
-- Name: lead_list_memberships; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_list_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "smart_list_id" "uuid",
    "lead_id" "uuid",
    "added_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_list_memberships" OWNER TO "postgres";

--
-- Name: lead_nudge_tracking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_nudge_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "lead_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "last_ai_contact_at" timestamp with time zone,
    "last_lead_response_at" timestamp with time zone,
    "nudge_count" integer DEFAULT 0,
    "next_nudge_at" timestamp with time zone,
    "is_engaged" boolean DEFAULT false,
    "sequence_paused" boolean DEFAULT false,
    "pause_reason" "text",
    "current_sequence_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_nudge_tracking" OWNER TO "postgres";

--
-- Name: lead_pipeline_positions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_pipeline_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "pipeline_board_id" "uuid" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "moved_at" timestamp with time zone DEFAULT "now"(),
    "moved_by_user" boolean DEFAULT true,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_pipeline_positions" OWNER TO "postgres";

--
-- Name: lead_predictions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_predictions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "model_id" "uuid",
    "conversion_probability" numeric(5,4) DEFAULT 0,
    "churn_risk" numeric(5,4) DEFAULT 0,
    "optimal_contact_hour" integer,
    "optimal_contact_day" integer,
    "expected_value_cents" integer DEFAULT 0,
    "roi_score" numeric(8,4) DEFAULT 0,
    "feature_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "actual_outcome" "text",
    "outcome_recorded_at" timestamp with time zone,
    "predicted_segment" "text",
    "predicted_at" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval)
);


ALTER TABLE "public"."lead_predictions" OWNER TO "postgres";

--
-- Name: lead_priority_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_priority_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "priority_score" numeric DEFAULT 50,
    "engagement_score" numeric DEFAULT 0,
    "recency_score" numeric DEFAULT 0,
    "sentiment_score" numeric DEFAULT 50,
    "best_contact_time" "text",
    "best_contact_day" "text",
    "factors" "jsonb" DEFAULT '{}'::"jsonb",
    "last_calculated_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_priority_scores" OWNER TO "postgres";

--
-- Name: lead_reachability_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_reachability_scores" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "reachability_score" numeric DEFAULT 50 NOT NULL,
    "confidence_level" numeric DEFAULT 50,
    "total_call_attempts" integer DEFAULT 0,
    "successful_calls" integer DEFAULT 0,
    "voicemails_left" integer DEFAULT 0,
    "sms_sent" integer DEFAULT 0,
    "sms_replies" integer DEFAULT 0,
    "emails_sent" integer DEFAULT 0,
    "emails_opened" integer DEFAULT 0,
    "last_successful_contact" timestamp with time zone,
    "best_contact_time" "text",
    "best_contact_day" "text",
    "preferred_channel" "text",
    "decay_applied" boolean DEFAULT false,
    "score_factors" "jsonb" DEFAULT '{}'::"jsonb",
    "ai_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."lead_reachability_scores" OWNER TO "postgres";

--
-- Name: lead_score_outcomes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_score_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid",
    "score_at_contact" numeric(5,2),
    "factors_at_contact" "jsonb",
    "outcome" "text",
    "converted" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_score_outcomes" OWNER TO "postgres";

--
-- Name: lead_scoring_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_scoring_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "weight_recency" numeric DEFAULT 0.15 NOT NULL,
    "weight_call_history" numeric DEFAULT 0.20 NOT NULL,
    "weight_response_rate" numeric DEFAULT 0.15 NOT NULL,
    "weight_engagement" numeric DEFAULT 0.20 NOT NULL,
    "weight_sentiment" numeric DEFAULT 0.20 NOT NULL,
    "weight_manual_priority" numeric DEFAULT 0.10 NOT NULL,
    "positive_keywords" "jsonb" DEFAULT '["interested", "yes", "tell me more", "sounds good", "great", "love it", "sign me up", "when can we start", "lets do it", "absolutely", "definitely", "perfect", "excited", "looking forward"]'::"jsonb" NOT NULL,
    "negative_keywords" "jsonb" DEFAULT '["not interested", "stop calling", "remove me", "no thanks", "busy", "wrong number", "do not call", "leave me alone", "unsubscribe", "scam", "spam", "go away", "hell no", "never"]'::"jsonb" NOT NULL,
    "neutral_keywords" "jsonb" DEFAULT '["maybe", "i dont know", "perhaps", "let me think", "call back", "not now", "later", "haha", "lol", "funny", "joking", "kidding"]'::"jsonb" NOT NULL,
    "positive_sentiment_bonus" integer DEFAULT 15 NOT NULL,
    "negative_sentiment_penalty" integer DEFAULT 25 NOT NULL,
    "neutral_sentiment_adjustment" integer DEFAULT 0 NOT NULL,
    "email_open_bonus" integer DEFAULT 10 NOT NULL,
    "sms_reply_bonus" integer DEFAULT 20 NOT NULL,
    "callback_request_bonus" integer DEFAULT 30 NOT NULL,
    "voicemail_left_penalty" integer DEFAULT 5 NOT NULL,
    "no_answer_penalty" integer DEFAULT 10 NOT NULL,
    "quick_response_minutes" integer DEFAULT 30 NOT NULL,
    "quick_response_bonus" integer DEFAULT 15 NOT NULL,
    "days_before_score_decay" integer DEFAULT 14 NOT NULL,
    "decay_rate_per_day" numeric DEFAULT 2.0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_scoring_settings" OWNER TO "postgres";

--
-- Name: lead_scoring_weights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_scoring_weights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "factor_name" "text" NOT NULL,
    "weight" numeric(5,4) DEFAULT 1.0,
    "calibrated_at" timestamp with time zone,
    "sample_size" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."lead_scoring_weights" OWNER TO "postgres";

--
-- Name: lead_workflow_progress; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lead_workflow_progress" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "current_step_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "last_action_at" timestamp with time zone,
    "next_action_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "removal_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "loop_count" integer DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb"
);


ALTER TABLE "public"."lead_workflow_progress" OWNER TO "postgres";

--
-- Name: learning_outcomes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."learning_outcomes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "decision_id" "uuid",
    "outcome_type" "text" NOT NULL,
    "outcome_details" "jsonb" DEFAULT '{}'::"jsonb",
    "learned_adjustment" "jsonb" DEFAULT '{}'::"jsonb",
    "conversion_happened" boolean DEFAULT false,
    "response_time_seconds" integer,
    "lead_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "learning_outcomes_outcome_type_check" CHECK (("outcome_type" = ANY (ARRAY['success'::"text", 'failure'::"text", 'neutral'::"text"])))
);


ALTER TABLE "public"."learning_outcomes" OWNER TO "postgres";

--
-- Name: lj_memory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."lj_memory" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "memory_type" "text" NOT NULL,
    "memory_key" "text" NOT NULL,
    "memory_value" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "lj_memory_memory_type_check" CHECK (("memory_type" = ANY (ARRAY['preference'::"text", 'fact'::"text", 'recent_action'::"text", 'learned_pattern'::"text"])))
);


ALTER TABLE "public"."lj_memory" OWNER TO "postgres";

--
-- Name: message_effectiveness; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_effectiveness" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "message_type" "text" NOT NULL,
    "message_content" "text",
    "message_hash" "text",
    "effective_for_stage" "text",
    "effective_for_source" "text",
    "effective_for_disposition" "text",
    "effective_for_interest_range" "int4range",
    "times_sent" integer DEFAULT 0,
    "replies" integer DEFAULT 0,
    "positive_replies" integer DEFAULT 0,
    "appointments" integer DEFAULT 0,
    "opt_outs" integer DEFAULT 0,
    "effectiveness_score" numeric(5,4) DEFAULT 0,
    "is_significant" boolean DEFAULT false,
    "p_value" numeric(6,5),
    "confidence_level" numeric(5,4) DEFAULT 0,
    "sample_size_needed" integer,
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "message_effectiveness_message_type_check" CHECK (("message_type" = ANY (ARRAY['sms'::"text", 'ai_sms'::"text", 'opener'::"text", 'voicemail'::"text"])))
);


ALTER TABLE "public"."message_effectiveness" OWNER TO "postgres";

--
-- Name: ml_learning_data; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ml_learning_data" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "call_id" "uuid",
    "lead_id" "uuid",
    "agent_id" "text",
    "agent_name" "text",
    "call_outcome" "text",
    "disposition" "text",
    "sentiment" "text",
    "sentiment_score" numeric(3,2),
    "confidence_score" numeric(3,2),
    "call_duration_seconds" integer,
    "key_points" "text"[],
    "objections" "text"[],
    "pain_points" "text"[],
    "next_action" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."ml_learning_data" OWNER TO "postgres";

--
-- Name: ml_models; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ml_models" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "model_type" "text" NOT NULL,
    "coefficients" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "training_samples" integer DEFAULT 0,
    "training_positives" integer DEFAULT 0,
    "training_accuracy" numeric(5,4) DEFAULT 0,
    "auc_score" numeric(5,4) DEFAULT 0,
    "precision_score" numeric(5,4) DEFAULT 0,
    "recall_score" numeric(5,4) DEFAULT 0,
    "predictions_made" integer DEFAULT 0,
    "correct_predictions" integer DEFAULT 0,
    "online_accuracy" numeric(5,4) DEFAULT 0,
    "version" integer DEFAULT 1,
    "is_active" boolean DEFAULT true,
    "superseded_by" "uuid",
    "trained_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "ml_models_model_type_check" CHECK (("model_type" = ANY (ARRAY['lead_conversion'::"text", 'churn_risk'::"text", 'contact_timing'::"text", 'message_effectiveness'::"text", 'lead_scoring_weights'::"text"])))
);


ALTER TABLE "public"."ml_models" OWNER TO "postgres";

--
-- Name: number_health_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."number_health_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "phone_number_id" "uuid",
    "calls_last_hour" integer DEFAULT 0 NOT NULL,
    "calls_last_24h" integer DEFAULT 0 NOT NULL,
    "calls_last_7d" integer DEFAULT 0 NOT NULL,
    "answer_rate_24h" numeric(5,4) DEFAULT 0,
    "answer_rate_7d" numeric(5,4) DEFAULT 0,
    "answer_rate_30d" numeric(5,4) DEFAULT 0,
    "voicemail_rate_24h" numeric(5,4) DEFAULT 0,
    "predicted_spam_risk" numeric(5,4) DEFAULT 0,
    "spam_risk_factors" "jsonb" DEFAULT '{}'::"jsonb",
    "recommended_rest_until" timestamp with time zone,
    "max_safe_daily_calls" integer DEFAULT 100,
    "health_score" integer DEFAULT 100,
    "last_calculated" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "number_health_metrics_health_score_check" CHECK ((("health_score" >= 0) AND ("health_score" <= 100)))
);


ALTER TABLE "public"."number_health_metrics" OWNER TO "postgres";

--
-- Name: number_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."number_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "area_code" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider" "text" DEFAULT 'telnyx'::"text" NOT NULL,
    "total_cost" numeric(10,2),
    "order_details" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."number_orders" OWNER TO "postgres";

--
-- Name: opener_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."opener_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "agent_id" "text",
    "agent_name" "text",
    "opener_text" "text" NOT NULL,
    "opener_normalized" "text" NOT NULL,
    "total_uses" integer DEFAULT 0,
    "calls_answered" integer DEFAULT 0,
    "calls_engaged" integer DEFAULT 0,
    "calls_converted" integer DEFAULT 0,
    "avg_call_duration" integer DEFAULT 0,
    "avg_engagement_duration" integer DEFAULT 0,
    "answer_rate" numeric(5,2) DEFAULT 0.00,
    "engagement_rate" numeric(5,2) DEFAULT 0.00,
    "conversion_rate" numeric(5,2) DEFAULT 0.00,
    "effectiveness_score" integer DEFAULT 0,
    "first_used_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."opener_analytics" OWNER TO "postgres";

--
-- Name: TABLE "opener_analytics"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."opener_analytics" IS 'Tracks effectiveness of different script openers';


--
-- Name: optimal_calling_windows; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."optimal_calling_windows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "day_of_week" integer NOT NULL,
    "hour_of_day" integer NOT NULL,
    "total_calls" integer DEFAULT 0,
    "answered_calls" integer DEFAULT 0,
    "converted_calls" integer DEFAULT 0,
    "answer_rate" numeric(5,4),
    "conversion_rate" numeric(5,4),
    "score" numeric(5,2) DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."optimal_calling_windows" OWNER TO "postgres";

--
-- Name: organization_credits; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."organization_credits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "balance_cents" integer DEFAULT 0 NOT NULL,
    "cost_per_minute_cents" integer DEFAULT 15 NOT NULL,
    "retell_cost_per_minute_cents" integer DEFAULT 7 NOT NULL,
    "low_balance_threshold_cents" integer DEFAULT 1000,
    "cutoff_threshold_cents" integer DEFAULT 100,
    "auto_recharge_enabled" boolean DEFAULT false,
    "auto_recharge_amount_cents" integer DEFAULT 5000,
    "auto_recharge_trigger_cents" integer DEFAULT 500,
    "last_recharge_at" timestamp with time zone,
    "last_deduction_at" timestamp with time zone,
    "last_low_balance_alert_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_credits" OWNER TO "postgres";

--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."organization_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organization_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'member'::"text"])))
);


ALTER TABLE "public"."organization_users" OWNER TO "postgres";

--
-- Name: TABLE "organization_users"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."organization_users" IS 'Junction table linking users to organizations with roles';


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "subscription_tier" "text" DEFAULT 'basic'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "max_users" integer DEFAULT 5,
    "max_campaigns" integer DEFAULT 10,
    "max_phone_numbers" integer DEFAULT 5,
    "monthly_call_limit" integer DEFAULT 1000,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "billing_enabled" boolean DEFAULT false,
    "stripe_customer_id" "text",
    "billing_email" "text",
    CONSTRAINT "organizations_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'trial'::"text", 'suspended'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "organizations_subscription_tier_check" CHECK (("subscription_tier" = ANY (ARRAY['basic'::"text", 'professional'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";

--
-- Name: TABLE "organizations"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."organizations" IS 'Multi-tenant organizations for data isolation';


--
-- Name: pacing_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."pacing_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "pacing_id" "uuid" NOT NULL,
    "old_cpm" numeric(5,2),
    "new_cpm" numeric(5,2),
    "answer_rate" numeric(5,2),
    "calls_in_window" integer,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pacing_history" OWNER TO "postgres";

--
-- Name: phone_number_use_types; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."phone_number_use_types" (
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "icon" "text",
    "color" "text",
    "sort_order" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."phone_number_use_types" OWNER TO "postgres";

--
-- Name: TABLE "phone_number_use_types"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."phone_number_use_types" IS 'Reference table for phone number use type categories';


--
-- Name: phone_numbers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."phone_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "number" "text" NOT NULL,
    "area_code" "text" NOT NULL,
    "daily_calls" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "quarantine_until" "date",
    "is_spam" boolean DEFAULT false NOT NULL,
    "last_used" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "retell_phone_id" "text",
    "stir_shaken_attestation" "text",
    "line_type" "text",
    "carrier_name" "text",
    "caller_name" "text",
    "is_voip" boolean DEFAULT false,
    "external_spam_score" integer DEFAULT 0,
    "last_lookup_at" timestamp with time zone,
    "friendly_name" "text",
    "provider" "text" DEFAULT 'twilio'::"text",
    "purpose" "text" DEFAULT 'general_rotation'::"text",
    "sip_trunk_provider" "text",
    "sip_trunk_config" "jsonb" DEFAULT '{}'::"jsonb",
    "is_stationary" boolean DEFAULT false,
    "rotation_enabled" boolean DEFAULT true,
    "max_daily_calls" integer DEFAULT 100,
    "twilio_verified" boolean DEFAULT false,
    "twilio_verified_at" timestamp with time zone,
    "twilio_sid" "text",
    "capabilities" "jsonb" DEFAULT '{}'::"jsonb",
    "last_daily_reset" "date" DEFAULT CURRENT_DATE,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "last_call_at" timestamp with time zone,
    "allowed_uses" "text"[] DEFAULT '{}'::"text"[],
    "sip_trunk_config_id" "uuid",
    "call_direction" "text" DEFAULT 'outbound'::"text" NOT NULL,
    CONSTRAINT "phone_numbers_call_direction_check" CHECK (("call_direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text", 'both'::"text"]))),
    CONSTRAINT "phone_numbers_provider_check" CHECK (("provider" = ANY (ARRAY['twilio'::"text", 'telnyx'::"text", 'retell_native'::"text", 'other'::"text"]))),
    CONSTRAINT "phone_numbers_purpose_check" CHECK (("purpose" = ANY (ARRAY['broadcast'::"text", 'retell_agent'::"text", 'follow_up_dedicated'::"text", 'general_rotation'::"text", 'sms_only'::"text"]))),
    CONSTRAINT "phone_numbers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'quarantined'::"text", 'cooldown'::"text"]))),
    CONSTRAINT "phone_numbers_stir_shaken_attestation_check" CHECK (("stir_shaken_attestation" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'not_verified'::"text"])))
);


ALTER TABLE "public"."phone_numbers" OWNER TO "postgres";

--
-- Name: COLUMN "phone_numbers"."stir_shaken_attestation"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."stir_shaken_attestation" IS 'SHAKEN/STIR attestation level: A=Full verification, B=Partial, C=Gateway, not_verified=No attestation';


--
-- Name: COLUMN "phone_numbers"."line_type"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."line_type" IS 'Type of line: mobile, landline, voip, tollfree';


--
-- Name: COLUMN "phone_numbers"."carrier_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."carrier_name" IS 'Carrier/provider name from Twilio Lookup';


--
-- Name: COLUMN "phone_numbers"."caller_name"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."caller_name" IS 'Registered caller name (CNAM)';


--
-- Name: COLUMN "phone_numbers"."external_spam_score"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."external_spam_score" IS 'Spam score from external databases (0-100)';


--
-- Name: COLUMN "phone_numbers"."last_lookup_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."last_lookup_at" IS 'Last time carrier/spam lookup was performed';


--
-- Name: COLUMN "phone_numbers"."twilio_verified"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."twilio_verified" IS 'Whether this number has been verified against the Twilio API';


--
-- Name: COLUMN "phone_numbers"."twilio_sid"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."twilio_sid" IS 'The Twilio SID for this number, proving ownership';


--
-- Name: COLUMN "phone_numbers"."capabilities"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."capabilities" IS 'Number capabilities: sms, voice, mms, fax';


--
-- Name: COLUMN "phone_numbers"."tags"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."tags" IS 'Array of tags for categorizing and filtering phone numbers';


--
-- Name: COLUMN "phone_numbers"."allowed_uses"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."allowed_uses" IS 'Array of use type codes from phone_number_use_types table';


--
-- Name: COLUMN "phone_numbers"."sip_trunk_config_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."phone_numbers"."sip_trunk_config_id" IS 'Foreign key to sip_trunk_configs for numbers assigned to a SIP trunk';


--
-- Name: phone_providers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."phone_providers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "display_name" "text",
    "is_active" boolean DEFAULT true,
    "config_json" "jsonb" DEFAULT '{}'::"jsonb",
    "capabilities" "jsonb" DEFAULT '{"mms": false, "sms": true, "voice": true}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."phone_providers" OWNER TO "postgres";

--
-- Name: pipeline_boards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."pipeline_boards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "disposition_id" "uuid",
    "position" integer DEFAULT 0 NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "campaign_id" "uuid"
);


ALTER TABLE "public"."pipeline_boards" OWNER TO "postgres";

--
-- Name: COLUMN "pipeline_boards"."campaign_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."pipeline_boards"."campaign_id" IS 'Optional campaign association. NULL means global/shared pipeline board.';


--
-- Name: playbook_optimization_log; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."playbook_optimization_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "optimization_type" "text" NOT NULL,
    "rule_id" "uuid",
    "rule_name" "text",
    "before_value" "jsonb",
    "after_value" "jsonb",
    "reasoning" "text" NOT NULL,
    "data_basis" "jsonb",
    "model_used" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."playbook_optimization_log" OWNER TO "postgres";

--
-- Name: playbook_performance; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."playbook_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "rule_name" "text" NOT NULL,
    "times_fired" integer DEFAULT 0 NOT NULL,
    "led_to_response" integer DEFAULT 0 NOT NULL,
    "led_to_positive_response" integer DEFAULT 0 NOT NULL,
    "led_to_appointment" integer DEFAULT 0 NOT NULL,
    "led_to_no_response" integer DEFAULT 0 NOT NULL,
    "avg_response_time_hours" numeric(8,2),
    "response_rate" numeric(5,4) DEFAULT 0,
    "appointment_rate" numeric(5,4) DEFAULT 0,
    "performance_score" numeric(8,4) DEFAULT 0,
    "last_calculated" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."playbook_performance" OWNER TO "postgres";

--
-- Name: predictive_dialing_stats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."predictive_dialing_stats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "concurrent_calls" integer NOT NULL,
    "calls_attempted" integer DEFAULT 0,
    "calls_connected" integer DEFAULT 0,
    "calls_abandoned" integer DEFAULT 0,
    "answer_rate" numeric DEFAULT 0,
    "abandonment_rate" numeric DEFAULT 0,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."predictive_dialing_stats" OWNER TO "postgres";

--
-- Name: pricing_tiers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."pricing_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tier_type" "text" NOT NULL,
    "tier_name" "text" NOT NULL,
    "display_name" "text" NOT NULL,
    "base_cost_per_min_cents" numeric(10,4) NOT NULL,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pricing_tiers" OWNER TO "postgres";

--
-- Name: reachability_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."reachability_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_outcome" "text",
    "caller_id" "text",
    "contact_time" time without time zone,
    "contact_day" "text",
    "duration_seconds" integer,
    "response_time_minutes" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."reachability_events" OWNER TO "postgres";

--
-- Name: retell_agents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."retell_agents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "retell_agent_id" "text" NOT NULL,
    "retell_llm_id" "text",
    "agent_name" "text" NOT NULL,
    "voice_id" "text",
    "webhook_url" "text",
    "begin_message_delay_ms" integer,
    "llm_model" "text",
    "general_prompt" "text",
    "begin_message" "text",
    "general_tools" "jsonb" DEFAULT '[]'::"jsonb",
    "voicemail_detection" "jsonb",
    "ambient_sound_volume" numeric,
    "end_call_after_silence_ms" integer,
    "agent_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "llm_snapshot" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'active'::"text",
    "last_synced_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retell_agents" OWNER TO "postgres";

--
-- Name: retell_branded_calls; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."retell_branded_calls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_profile_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "display_name_short" "text" NOT NULL,
    "display_name_long" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "retell_branded_id" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retell_branded_calls" OWNER TO "postgres";

--
-- Name: retell_business_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."retell_business_profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_name" "text" NOT NULL,
    "business_registration_number" "text" NOT NULL,
    "business_address" "text" NOT NULL,
    "city" "text" NOT NULL,
    "state" "text" NOT NULL,
    "zip_code" "text" NOT NULL,
    "country" "text" DEFAULT 'US'::"text" NOT NULL,
    "contact_phone" "text" NOT NULL,
    "website_url" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "retell_profile_id" "text",
    "submitted_at" timestamp with time zone,
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retell_business_profiles" OWNER TO "postgres";

--
-- Name: retell_transfer_context; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."retell_transfer_context" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "from_number" "text" NOT NULL,
    "to_number" "text" NOT NULL,
    "lead_id" "uuid",
    "lead_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '00:15:00'::interval) NOT NULL
);


ALTER TABLE "public"."retell_transfer_context" OWNER TO "postgres";

--
-- Name: retell_verified_numbers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."retell_verified_numbers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_profile_id" "uuid" NOT NULL,
    "phone_number" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "retell_verification_id" "text",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."retell_verified_numbers" OWNER TO "postgres";

--
-- Name: rotation_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."rotation_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "phone_number" "text",
    "reason" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rotation_history_user_id_check" CHECK (("user_id" IS NOT NULL))
);


ALTER TABLE "public"."rotation_history" OWNER TO "postgres";

--
-- Name: rotation_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."rotation_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "rotation_interval_hours" integer DEFAULT 24 NOT NULL,
    "high_volume_threshold" integer DEFAULT 50 NOT NULL,
    "auto_import_enabled" boolean DEFAULT true NOT NULL,
    "auto_remove_quarantined" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rotation_settings" OWNER TO "postgres";

--
-- Name: scheduled_follow_ups; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."scheduled_follow_ups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "sequence_id" "uuid",
    "current_step_id" "uuid",
    "scheduled_at" timestamp with time zone NOT NULL,
    "action_type" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "executed_at" timestamp with time zone,
    "error_message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "scheduled_follow_ups_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."scheduled_follow_ups" OWNER TO "postgres";

--
-- Name: segment_roi_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."segment_roi_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "segment_name" "text" NOT NULL,
    "segment_criteria" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "total_leads" integer DEFAULT 0,
    "total_spend_cents" integer DEFAULT 0,
    "total_calls" integer DEFAULT 0,
    "total_sms" integer DEFAULT 0,
    "appointments_set" integer DEFAULT 0,
    "conversions" integer DEFAULT 0,
    "cost_per_appointment_cents" integer DEFAULT 0,
    "cost_per_conversion_cents" integer DEFAULT 0,
    "roi_ratio" numeric(8,4) DEFAULT 0,
    "conversion_rate" numeric(5,4) DEFAULT 0,
    "recommended_budget_pct" numeric(5,2) DEFAULT 0,
    "recommended_channel" "text",
    "recommended_pacing" integer,
    "roi_trend" "text" DEFAULT 'stable'::"text",
    "period_start" timestamp with time zone,
    "period_end" timestamp with time zone,
    "calculated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "segment_roi_metrics_roi_trend_check" CHECK (("roi_trend" = ANY (ARRAY['improving'::"text", 'stable'::"text", 'declining'::"text"])))
);


ALTER TABLE "public"."segment_roi_metrics" OWNER TO "postgres";

--
-- Name: sequence_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sequence_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sequence_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "action_type" "text" NOT NULL,
    "delay_minutes" integer DEFAULT 0,
    "content" "text",
    "ai_prompt" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sequence_steps_action_type_check" CHECK (("action_type" = ANY (ARRAY['ai_call'::"text", 'ai_sms'::"text", 'manual_sms'::"text", 'email'::"text", 'wait'::"text"])))
);


ALTER TABLE "public"."sequence_steps" OWNER TO "postgres";

--
-- Name: sequence_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sequence_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text" NOT NULL,
    "steps" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "recommended_goal_type" "text",
    "recommended_calling_hours" "jsonb" DEFAULT '{"end": 21, "start": 9}'::"jsonb",
    "estimated_touchpoints" integer DEFAULT 1,
    "estimated_days_to_complete" integer DEFAULT 1,
    "is_system_template" boolean DEFAULT false,
    "user_id" "uuid",
    "times_used" integer DEFAULT 0,
    "avg_conversion_rate" numeric(5,4) DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "sequence_templates_category_check" CHECK (("category" = ANY (ARRAY['speed_to_lead'::"text", 'appointment_setting'::"text", 'nurture_drip'::"text", 'database_reactivation'::"text", 'collections'::"text", 're_engagement'::"text", 'appointment_confirmation'::"text", 'post_sale'::"text", 'win_back'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."sequence_templates" OWNER TO "postgres";

--
-- Name: sip_trunk_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sip_trunk_configs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "provider_type" "text" DEFAULT 'generic'::"text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "is_default" boolean DEFAULT false,
    "sip_host" "text",
    "sip_port" integer DEFAULT 5060,
    "transport" "text" DEFAULT 'udp'::"text",
    "auth_type" "text" DEFAULT 'credentials'::"text",
    "username" "text",
    "password_encrypted" "text",
    "twilio_trunk_sid" "text",
    "twilio_termination_uri" "text",
    "telnyx_connection_id" "text",
    "outbound_proxy" "text",
    "caller_id_header" "text" DEFAULT 'P-Asserted-Identity'::"text",
    "extra_headers" "jsonb" DEFAULT '{}'::"jsonb",
    "cost_per_minute" numeric(10,6) DEFAULT 0.007,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sip_trunk_configs" OWNER TO "postgres";

--
-- Name: slack_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."slack_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slack_team_id" "text" NOT NULL,
    "slack_user_id" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "display_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."slack_users" OWNER TO "postgres";

--
-- Name: smart_lists; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."smart_lists" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "filters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_dynamic" boolean DEFAULT true,
    "lead_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."smart_lists" OWNER TO "postgres";

--
-- Name: sms_context_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sms_context_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "context_window" "text" NOT NULL,
    "summary" "text",
    "token_count" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sms_context_history" OWNER TO "postgres";

--
-- Name: sms_conversations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sms_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "contact_phone" "text" NOT NULL,
    "contact_name" "text",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unread_count" integer DEFAULT 0,
    "context_summary" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_from_number" "text"
);


ALTER TABLE "public"."sms_conversations" OWNER TO "postgres";

--
-- Name: sms_copy_variants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sms_copy_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "context_type" "text" NOT NULL,
    "context_id" "uuid",
    "variant_label" "text" DEFAULT 'A'::"text" NOT NULL,
    "message_template" "text" NOT NULL,
    "times_sent" integer DEFAULT 0,
    "replies_received" integer DEFAULT 0,
    "positive_replies" integer DEFAULT 0,
    "led_to_call_answer" integer DEFAULT 0,
    "led_to_appointment" integer DEFAULT 0,
    "opt_outs" integer DEFAULT 0,
    "reply_rate" numeric(5,4) DEFAULT 0,
    "positive_rate" numeric(5,4) DEFAULT 0,
    "appointment_rate" numeric(5,4) DEFAULT 0,
    "traffic_weight" numeric(5,2) DEFAULT 50,
    "is_control" boolean DEFAULT false,
    "is_active" boolean DEFAULT true,
    "ai_generated" boolean DEFAULT false,
    "ai_reasoning" "text",
    "parent_variant_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_sent_at" timestamp with time zone,
    CONSTRAINT "sms_copy_variants_context_type_check" CHECK (("context_type" = ANY (ARRAY['playbook_rule'::"text", 'workflow_step'::"text", 'followup'::"text", 'reengagement'::"text", 'nurture'::"text", 'custom'::"text"])))
);


ALTER TABLE "public"."sms_copy_variants" OWNER TO "postgres";

--
-- Name: sms_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sms_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "conversation_id" "uuid",
    "to_number" "text" NOT NULL,
    "from_number" "text" NOT NULL,
    "body" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_type" "text" DEFAULT 'twilio'::"text",
    "provider_message_id" "text",
    "lead_id" "uuid",
    "is_ai_generated" boolean DEFAULT false,
    "has_image" boolean DEFAULT false,
    "image_url" "text",
    "image_analysis" "jsonb",
    "is_reaction" boolean DEFAULT false,
    "reaction_type" "text",
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "sms_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"])))
);


ALTER TABLE "public"."sms_messages" OWNER TO "postgres";

--
-- Name: sms_variant_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."sms_variant_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "variant_id" "uuid" NOT NULL,
    "lead_id" "uuid" NOT NULL,
    "sent_at" timestamp with time zone DEFAULT "now"(),
    "message_sent" "text",
    "reply_received" boolean DEFAULT false,
    "reply_text" "text",
    "reply_sentiment" numeric(3,2),
    "led_to_appointment" boolean DEFAULT false,
    "opted_out" boolean DEFAULT false,
    "outcome_recorded_at" timestamp with time zone
);


ALTER TABLE "public"."sms_variant_assignments" OWNER TO "postgres";

--
-- Name: spending_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."spending_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "broadcast_id" "uuid",
    "call_log_id" "uuid",
    "provider" "text" NOT NULL,
    "cost_type" "text" NOT NULL,
    "amount" numeric(10,4) DEFAULT 0 NOT NULL,
    "duration_seconds" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spending_logs" OWNER TO "postgres";

--
-- Name: spending_summaries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."spending_summaries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "summary_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "twilio_cost" numeric(10,4) DEFAULT 0,
    "retell_cost" numeric(10,4) DEFAULT 0,
    "elevenlabs_cost" numeric(10,4) DEFAULT 0,
    "total_cost" numeric(10,4) DEFAULT 0,
    "call_count" integer DEFAULT 0,
    "sms_count" integer DEFAULT 0,
    "total_duration_seconds" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."spending_summaries" OWNER TO "postgres";

--
-- Name: strategic_briefings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."strategic_briefings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "briefing_type" "text" DEFAULT 'daily'::"text" NOT NULL,
    "period_start" "date" NOT NULL,
    "period_end" "date" NOT NULL,
    "headline" "text",
    "executive_summary" "text",
    "wins" "jsonb" DEFAULT '[]'::"jsonb",
    "concerns" "jsonb" DEFAULT '[]'::"jsonb",
    "recommendations" "jsonb" DEFAULT '[]'::"jsonb",
    "action_items" "jsonb" DEFAULT '[]'::"jsonb",
    "metrics_current" "jsonb" DEFAULT '{}'::"jsonb",
    "metrics_previous" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."strategic_briefings" OWNER TO "postgres";

--
-- Name: strategic_insights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."strategic_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "insight_type" "text" NOT NULL,
    "pattern_description" "text" NOT NULL,
    "confidence" numeric DEFAULT 0 NOT NULL,
    "sample_size" integer DEFAULT 0 NOT NULL,
    "effect_magnitude" numeric,
    "recommended_action" "text",
    "statistical_backing" "jsonb" DEFAULT '{}'::"jsonb",
    "auto_rule_created" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."strategic_insights" OWNER TO "postgres";

--
-- Name: system_alerts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."system_alerts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "alert_type" "text" NOT NULL,
    "severity" "text" DEFAULT 'warning'::"text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "related_id" "text",
    "related_type" "text",
    "acknowledged" boolean DEFAULT false,
    "acknowledged_at" timestamp with time zone,
    "auto_resolved" boolean DEFAULT false,
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_alerts" OWNER TO "postgres";

--
-- Name: system_health_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."system_health_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_name" "text" NOT NULL,
    "status" "text" NOT NULL,
    "response_time_ms" integer,
    "error_message" "text",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_health_logs" OWNER TO "postgres";

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."system_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "max_concurrent_calls" integer DEFAULT 10,
    "calls_per_minute" integer DEFAULT 30,
    "max_calls_per_agent" integer DEFAULT 3,
    "enable_adaptive_pacing" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "retell_max_concurrent" integer DEFAULT 10,
    "assistable_max_concurrent" integer DEFAULT 200,
    "transfer_queue_enabled" boolean DEFAULT true
);


ALTER TABLE "public"."system_settings" OWNER TO "postgres";

--
-- Name: telnyx_assistants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."telnyx_assistants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid",
    "telnyx_assistant_id" "text",
    "telnyx_texml_app_id" "text",
    "telnyx_messaging_profile_id" "text",
    "name" "text" NOT NULL,
    "description" "text",
    "model" "text" DEFAULT 'Qwen/Qwen3-235B-A22B'::"text",
    "instructions" "text",
    "greeting" "text",
    "voice" "text" DEFAULT 'Telnyx.NaturalHD.Ava'::"text",
    "transcription_model" "text" DEFAULT 'telnyx_deepgram_nova3'::"text",
    "tools" "jsonb" DEFAULT '[]'::"jsonb",
    "enabled_features" "text"[] DEFAULT '{telephony}'::"text"[],
    "dynamic_variables_webhook_url" "text",
    "dynamic_variables" "jsonb" DEFAULT '{}'::"jsonb",
    "data_retention" boolean DEFAULT true,
    "insight_group_id" "text",
    "status" "text" DEFAULT 'active'::"text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "call_direction" "text" DEFAULT 'outbound'::"text" NOT NULL,
    "assigned_phone_number_ids" "text"[] DEFAULT '{}'::"text"[],
    CONSTRAINT "telnyx_assistants_call_direction_check" CHECK (("call_direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text", 'both'::"text"])))
);


ALTER TABLE "public"."telnyx_assistants" OWNER TO "postgres";

--
-- Name: telnyx_conversation_insights; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."telnyx_conversation_insights" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "telnyx_conversation_id" "text",
    "telnyx_assistant_id" "text",
    "telnyx_insight_group_id" "text",
    "call_log_id" "uuid",
    "lead_id" "uuid",
    "insights" "jsonb",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telnyx_conversation_insights" OWNER TO "postgres";

--
-- Name: telnyx_insight_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."telnyx_insight_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "instructions" "text",
    "json_schema" "jsonb",
    "telnyx_group_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telnyx_insight_templates" OWNER TO "postgres";

--
-- Name: telnyx_knowledge_bases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."telnyx_knowledge_bases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "bucket_name" "text",
    "embedding_model" "text" DEFAULT 'text-embedding-3-small'::"text",
    "document_chunk_size" integer DEFAULT 1000,
    "document_chunk_overlap" integer DEFAULT 200,
    "status" "text" DEFAULT 'pending'::"text",
    "last_embed_task_id" "text",
    "assistant_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telnyx_knowledge_bases" OWNER TO "postgres";

--
-- Name: telnyx_scheduled_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."telnyx_scheduled_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "telnyx_event_id" "text",
    "telnyx_assistant_id" "text",
    "channel" "text" DEFAULT 'phone_call'::"text",
    "from_number" "text",
    "to_number" "text",
    "scheduled_at" timestamp with time zone,
    "text_message" "text",
    "lead_id" "uuid",
    "campaign_id" "uuid",
    "conversation_metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'scheduled'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telnyx_scheduled_events" OWNER TO "postgres";

--
-- Name: telnyx_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."telnyx_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "api_key_configured" boolean DEFAULT false,
    "amd_enabled" boolean DEFAULT true,
    "amd_type" "text" DEFAULT 'premium'::"text",
    "webhook_url" "text",
    "dynamic_vars_webhook_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telnyx_settings" OWNER TO "postgres";

--
-- Name: time_wasted_summary; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."time_wasted_summary" WITH ("security_invoker"='on') AS
 SELECT "cl"."user_id",
    "cl"."time_wasted_reason",
    "count"(*) AS "call_count",
    "sum"("cl"."duration_seconds") AS "total_seconds_wasted",
    "avg"("cl"."time_wasted_score") AS "avg_waste_score"
   FROM "public"."call_logs" "cl"
  WHERE ("cl"."time_wasted_score" > 0)
  GROUP BY "cl"."user_id", "cl"."time_wasted_reason"
  ORDER BY ("sum"("cl"."duration_seconds")) DESC;


ALTER TABLE "public"."time_wasted_summary" OWNER TO "postgres";

--
-- Name: top_openers; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."top_openers" WITH ("security_invoker"='on') AS
 SELECT "oa"."id",
    "oa"."user_id",
    "oa"."agent_name",
    "oa"."opener_text",
    "oa"."total_uses",
    "oa"."calls_answered",
    "oa"."calls_engaged",
    "oa"."calls_converted",
    "oa"."answer_rate",
    "oa"."engagement_rate",
    "oa"."conversion_rate",
    "oa"."effectiveness_score",
    "oa"."avg_call_duration",
    "oa"."first_used_at",
    "oa"."last_used_at"
   FROM "public"."opener_analytics" "oa"
  WHERE ("oa"."total_uses" >= 5)
  ORDER BY "oa"."effectiveness_score" DESC;


ALTER TABLE "public"."top_openers" OWNER TO "postgres";

--
-- Name: user_credentials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_credentials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "service_name" "text" NOT NULL,
    "credential_key" "text" NOT NULL,
    "credential_value_encrypted" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_credentials" OWNER TO "postgres";

--
-- Name: user_feature_flags; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_feature_flags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "voice_broadcast" boolean DEFAULT true,
    "ghl_contact_import" boolean DEFAULT true,
    "ghl_basic_tagging" boolean DEFAULT true,
    "pipeline_sync" boolean DEFAULT false,
    "disposition_automation" boolean DEFAULT false,
    "callback_scheduling" boolean DEFAULT false,
    "workflow_triggers" boolean DEFAULT false,
    "ai_dialing" boolean DEFAULT false,
    "retell_integration" boolean DEFAULT false,
    "transcript_analysis" boolean DEFAULT false,
    "predictive_pacing" boolean DEFAULT false,
    "autonomous_mode" boolean DEFAULT false,
    "ai_pipeline_manager" boolean DEFAULT false,
    "self_learning" boolean DEFAULT false,
    "script_optimization" boolean DEFAULT false,
    "multi_carrier" boolean DEFAULT false,
    "custom_dashboard" boolean DEFAULT false,
    "white_label" boolean DEFAULT false,
    "api_access" boolean DEFAULT false,
    "current_tier" "text" DEFAULT 'free'::"text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "subscription_status" "text" DEFAULT 'inactive'::"text",
    "trial_ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_feature_flags_current_tier_check" CHECK (("current_tier" = ANY (ARRAY['free'::"text", 'tier1'::"text", 'tier2'::"text", 'tier3'::"text", 'tier4'::"text", 'tier5'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "user_feature_flags_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'past_due'::"text", 'canceled'::"text", 'trialing'::"text"])))
);


ALTER TABLE "public"."user_feature_flags" OWNER TO "postgres";

--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";

--
-- Name: voice_broadcasts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."voice_broadcasts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "message_text" "text" NOT NULL,
    "voice_id" "text" DEFAULT 'EXAVITQu4vr4xnSDxMaL'::"text",
    "voice_model" "text" DEFAULT 'eleven_turbo_v2_5'::"text",
    "audio_url" "text",
    "ivr_enabled" boolean DEFAULT true,
    "ivr_mode" "text" DEFAULT 'dtmf'::"text",
    "ivr_prompt" "text" DEFAULT 'Press 1 to speak with a representative. Press 2 to schedule a callback. Press 3 to opt out.'::"text",
    "dtmf_actions" "jsonb" DEFAULT '[{"digit": "1", "label": "Connect to Agent", "action": "transfer", "transfer_to": null}, {"digit": "2", "label": "Schedule Callback", "action": "callback", "delay_hours": 24}, {"digit": "3", "label": "Do Not Call", "action": "dnc"}]'::"jsonb",
    "ai_system_prompt" "text" DEFAULT 'You are a friendly assistant. If the caller is interested, offer to transfer them. If they want to opt out, respect their wishes.'::"text",
    "ai_transfer_keywords" "text"[] DEFAULT ARRAY['yes'::"text", 'interested'::"text", 'connect me'::"text", 'speak to someone'::"text"],
    "max_attempts" integer DEFAULT 1,
    "retry_delay_minutes" integer DEFAULT 60,
    "calling_hours_start" time without time zone DEFAULT '09:00:00'::time without time zone,
    "calling_hours_end" time without time zone DEFAULT '17:00:00'::time without time zone,
    "timezone" "text" DEFAULT 'America/New_York'::"text",
    "calls_per_minute" integer DEFAULT 50,
    "total_leads" integer DEFAULT 0,
    "calls_made" integer DEFAULT 0,
    "calls_answered" integer DEFAULT 0,
    "transfers_completed" integer DEFAULT 0,
    "callbacks_scheduled" integer DEFAULT 0,
    "dnc_requests" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "voice_speed" numeric DEFAULT 1.0,
    "caller_id" "text",
    "bypass_calling_hours" boolean DEFAULT false,
    "last_error" "text",
    "last_error_at" timestamp with time zone,
    "enable_amd" boolean DEFAULT true,
    "voicemail_action" character varying(50) DEFAULT 'hangup'::character varying,
    "voicemail_audio_url" "text",
    "use_sip_trunk" boolean DEFAULT false,
    "broadcast_provider" "text" DEFAULT 'twilio_classic'::"text",
    "telnyx_assistant_id" "uuid",
    "telnyx_script" "text"
);


ALTER TABLE "public"."voice_broadcasts" OWNER TO "postgres";

--
-- Name: COLUMN "voice_broadcasts"."caller_id"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."voice_broadcasts"."caller_id" IS 'The phone number ID or number to use as caller ID for this broadcast';


--
-- Name: COLUMN "voice_broadcasts"."bypass_calling_hours"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."voice_broadcasts"."bypass_calling_hours" IS 'Allow testing outside configured calling hours';


--
-- Name: COLUMN "voice_broadcasts"."last_error"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."voice_broadcasts"."last_error" IS 'Last error message encountered during broadcast';


--
-- Name: COLUMN "voice_broadcasts"."last_error_at"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."voice_broadcasts"."last_error_at" IS 'Timestamp of the last error';


--
-- Name: COLUMN "voice_broadcasts"."use_sip_trunk"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."voice_broadcasts"."use_sip_trunk" IS 'When true, use SIP trunk for calls (cost savings). When false (default), use direct API for reliability.';


--
-- Name: voicemail_analytics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."voicemail_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "broadcast_id" "uuid",
    "campaign_id" "uuid",
    "voicemail_audio_url" "text",
    "voicemail_message_text" "text",
    "voicemail_duration_seconds" integer,
    "total_voicemails_left" integer DEFAULT 0,
    "callbacks_received" integer DEFAULT 0,
    "callbacks_within_24h" integer DEFAULT 0,
    "callbacks_within_1h" integer DEFAULT 0,
    "appointments_from_callbacks" integer DEFAULT 0,
    "callback_rate" numeric(5,2) DEFAULT 0.00,
    "callback_rate_24h" numeric(5,2) DEFAULT 0.00,
    "appointment_conversion_rate" numeric(5,2) DEFAULT 0.00,
    "effectiveness_score" integer DEFAULT 0,
    "first_used_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"(),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."voicemail_analytics" OWNER TO "postgres";

--
-- Name: TABLE "voicemail_analytics"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."voicemail_analytics" IS 'Tracks voicemail message effectiveness and callback rates';


--
-- Name: voicemail_callback_tracking; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."voicemail_callback_tracking" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "voicemail_call_id" "uuid",
    "voicemail_left_at" timestamp with time zone NOT NULL,
    "lead_id" "uuid",
    "phone_number" "text" NOT NULL,
    "broadcast_id" "uuid",
    "voicemail_analytics_id" "uuid",
    "callback_call_id" "uuid",
    "callback_received_at" timestamp with time zone,
    "callback_outcome" "text",
    "time_to_callback_minutes" integer,
    "status" "text" DEFAULT 'waiting'::"text",
    "expired_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "voicemail_callback_tracking_status_check" CHECK (("status" = ANY (ARRAY['waiting'::"text", 'callback_received'::"text", 'no_callback'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."voicemail_callback_tracking" OWNER TO "postgres";

--
-- Name: TABLE "voicemail_callback_tracking"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."voicemail_callback_tracking" IS 'Tracks individual voicemail-to-callback connections';


--
-- Name: voicemail_performance; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."voicemail_performance" WITH ("security_invoker"='on') AS
 SELECT "va"."id",
    "va"."user_id",
    "va"."broadcast_id",
    "va"."voicemail_audio_url",
    "va"."voicemail_duration_seconds",
    "va"."total_voicemails_left",
    "va"."callbacks_received",
    "va"."callback_rate",
    "va"."callbacks_within_24h",
    "va"."callback_rate_24h",
    "va"."appointments_from_callbacks",
    "va"."appointment_conversion_rate",
    "va"."effectiveness_score",
    "va"."first_used_at",
    "va"."last_used_at"
   FROM "public"."voicemail_analytics" "va"
  WHERE ("va"."total_voicemails_left" >= 10)
  ORDER BY "va"."effectiveness_score" DESC;


ALTER TABLE "public"."voicemail_performance" OWNER TO "postgres";

--
-- Name: workflow_steps; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "step_number" integer NOT NULL,
    "step_type" "text" NOT NULL,
    "step_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "true_branch_step" integer,
    "false_branch_step" integer,
    "branch_conditions" "jsonb" DEFAULT '[]'::"jsonb",
    "loop_back_to_step" integer,
    "max_loop_count" integer DEFAULT 0
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";

--
-- Name: workflow_test_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workflow_test_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "test_id" "text" NOT NULL,
    "workflow_name" "text",
    "mode" "text",
    "speed" "text",
    "total_steps" integer,
    "successful_steps" integer,
    "failed_steps" integer,
    "estimated_cost" numeric(10,4),
    "test_results" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_test_logs" OWNER TO "postgres";

--
-- Name: TABLE "workflow_test_logs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."workflow_test_logs" IS 'Stores logs of workflow tests for validation and debugging';


--
-- Name: yellowstone_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."yellowstone_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "api_key_encrypted" "text",
    "webhook_url" "text",
    "auto_sync_enabled" boolean DEFAULT false NOT NULL,
    "sync_interval_minutes" integer DEFAULT 30 NOT NULL,
    "last_sync_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."yellowstone_settings" OWNER TO "postgres";

--
-- Name: active_ai_transfers active_ai_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."active_ai_transfers"
    ADD CONSTRAINT "active_ai_transfers_pkey" PRIMARY KEY ("id");


--
-- Name: adaptive_pacing adaptive_pacing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."adaptive_pacing"
    ADD CONSTRAINT "adaptive_pacing_pkey" PRIMARY KEY ("id");


--
-- Name: adaptive_pacing adaptive_pacing_user_id_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."adaptive_pacing"
    ADD CONSTRAINT "adaptive_pacing_user_id_campaign_id_key" UNIQUE ("user_id", "campaign_id");


--
-- Name: advanced_dialer_settings advanced_dialer_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."advanced_dialer_settings"
    ADD CONSTRAINT "advanced_dialer_settings_pkey" PRIMARY KEY ("id");


--
-- Name: advanced_dialer_settings advanced_dialer_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."advanced_dialer_settings"
    ADD CONSTRAINT "advanced_dialer_settings_user_id_key" UNIQUE ("user_id");


--
-- Name: agent_decisions agent_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_decisions"
    ADD CONSTRAINT "agent_decisions_pkey" PRIMARY KEY ("id");


--
-- Name: agent_improvement_history agent_improvement_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_improvement_history"
    ADD CONSTRAINT "agent_improvement_history_pkey" PRIMARY KEY ("id");


--
-- Name: agent_pricing agent_pricing_organization_id_retell_agent_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_pricing"
    ADD CONSTRAINT "agent_pricing_organization_id_retell_agent_id_key" UNIQUE ("organization_id", "retell_agent_id");


--
-- Name: agent_pricing agent_pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_pricing"
    ADD CONSTRAINT "agent_pricing_pkey" PRIMARY KEY ("id");


--
-- Name: agent_script_variants agent_script_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_script_variants"
    ADD CONSTRAINT "agent_script_variants_pkey" PRIMARY KEY ("id");


--
-- Name: ai_action_queue ai_action_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_action_queue"
    ADD CONSTRAINT "ai_action_queue_pkey" PRIMARY KEY ("id");


--
-- Name: ai_campaign_strategies ai_campaign_strategies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_campaign_strategies"
    ADD CONSTRAINT "ai_campaign_strategies_pkey" PRIMARY KEY ("id");


--
-- Name: ai_chatbot_settings ai_chatbot_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_chatbot_settings"
    ADD CONSTRAINT "ai_chatbot_settings_pkey" PRIMARY KEY ("id");


--
-- Name: ai_chatbot_settings ai_chatbot_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_chatbot_settings"
    ADD CONSTRAINT "ai_chatbot_settings_user_id_key" UNIQUE ("user_id");


--
-- Name: ai_daily_insights ai_daily_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_daily_insights"
    ADD CONSTRAINT "ai_daily_insights_pkey" PRIMARY KEY ("id");


--
-- Name: ai_daily_insights ai_daily_insights_user_id_insight_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_daily_insights"
    ADD CONSTRAINT "ai_daily_insights_user_id_insight_date_key" UNIQUE ("user_id", "insight_date");


--
-- Name: ai_feedback ai_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_feedback"
    ADD CONSTRAINT "ai_feedback_pkey" PRIMARY KEY ("id");


--
-- Name: ai_learning ai_learning_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_learning"
    ADD CONSTRAINT "ai_learning_pkey" PRIMARY KEY ("id");


--
-- Name: ai_operational_memory ai_operational_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_operational_memory"
    ADD CONSTRAINT "ai_operational_memory_pkey" PRIMARY KEY ("id");


--
-- Name: ai_operational_memory ai_operational_memory_user_id_memory_type_memory_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_operational_memory"
    ADD CONSTRAINT "ai_operational_memory_user_id_memory_type_memory_key_key" UNIQUE ("user_id", "memory_type", "memory_key");


--
-- Name: ai_session_memory ai_session_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_session_memory"
    ADD CONSTRAINT "ai_session_memory_pkey" PRIMARY KEY ("id");


--
-- Name: ai_sms_settings ai_sms_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_sms_settings"
    ADD CONSTRAINT "ai_sms_settings_pkey" PRIMARY KEY ("id");


--
-- Name: ai_sms_settings ai_sms_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_sms_settings"
    ADD CONSTRAINT "ai_sms_settings_user_id_key" UNIQUE ("user_id");


--
-- Name: ai_workflow_generations ai_workflow_generations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_workflow_generations"
    ADD CONSTRAINT "ai_workflow_generations_pkey" PRIMARY KEY ("id");


--
-- Name: api_key_audit_log api_key_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."api_key_audit_log"
    ADD CONSTRAINT "api_key_audit_log_pkey" PRIMARY KEY ("id");


--
-- Name: api_keys api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_key_hash_key" UNIQUE ("key_hash");


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id");


--
-- Name: autonomous_goals autonomous_goals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."autonomous_goals"
    ADD CONSTRAINT "autonomous_goals_pkey" PRIMARY KEY ("id");


--
-- Name: autonomous_goals autonomous_goals_user_id_goal_type_goal_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."autonomous_goals"
    ADD CONSTRAINT "autonomous_goals_user_id_goal_type_goal_date_key" UNIQUE ("user_id", "goal_type", "goal_date");


--
-- Name: autonomous_settings autonomous_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."autonomous_settings"
    ADD CONSTRAINT "autonomous_settings_pkey" PRIMARY KEY ("id");


--
-- Name: autonomous_settings autonomous_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."autonomous_settings"
    ADD CONSTRAINT "autonomous_settings_user_id_key" UNIQUE ("user_id");


--
-- Name: broadcast_queue broadcast_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."broadcast_queue"
    ADD CONSTRAINT "broadcast_queue_pkey" PRIMARY KEY ("id");


--
-- Name: budget_alerts budget_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."budget_alerts"
    ADD CONSTRAINT "budget_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: budget_settings budget_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."budget_settings"
    ADD CONSTRAINT "budget_settings_pkey" PRIMARY KEY ("id");


--
-- Name: budget_settings budget_settings_user_id_campaign_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."budget_settings"
    ADD CONSTRAINT "budget_settings_user_id_campaign_id_key" UNIQUE ("user_id", "campaign_id");


--
-- Name: calendar_appointments calendar_appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_appointments"
    ADD CONSTRAINT "calendar_appointments_pkey" PRIMARY KEY ("id");


--
-- Name: calendar_availability calendar_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_availability"
    ADD CONSTRAINT "calendar_availability_pkey" PRIMARY KEY ("id");


--
-- Name: calendar_availability calendar_availability_user_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_availability"
    ADD CONSTRAINT "calendar_availability_user_unique" UNIQUE ("user_id");


--
-- Name: calendar_integrations calendar_integrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_integrations"
    ADD CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("id");


--
-- Name: calendar_integrations calendar_integrations_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_integrations"
    ADD CONSTRAINT "calendar_integrations_user_id_unique" UNIQUE ("user_id", "provider", "calendar_id");


--
-- Name: calendar_integrations calendar_integrations_user_provider_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_integrations"
    ADD CONSTRAINT "calendar_integrations_user_provider_unique" UNIQUE ("user_id", "provider");


--
-- Name: calendar_tool_invocations calendar_tool_invocations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_tool_invocations"
    ADD CONSTRAINT "calendar_tool_invocations_pkey" PRIMARY KEY ("id");


--
-- Name: call_logs call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id");


--
-- Name: call_logs call_logs_retell_call_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_retell_call_id_key" UNIQUE ("retell_call_id");


--
-- Name: call_opener_logs call_opener_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_opener_logs"
    ADD CONSTRAINT "call_opener_logs_pkey" PRIMARY KEY ("id");


--
-- Name: call_variant_assignments call_variant_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_variant_assignments"
    ADD CONSTRAINT "call_variant_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: campaign_automation_rules campaign_automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_automation_rules"
    ADD CONSTRAINT "campaign_automation_rules_pkey" PRIMARY KEY ("id");


--
-- Name: campaign_leads campaign_leads_campaign_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_campaign_id_lead_id_key" UNIQUE ("campaign_id", "lead_id");


--
-- Name: campaign_leads campaign_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_pkey" PRIMARY KEY ("id");


--
-- Name: campaign_phone_pools campaign_phone_pools_campaign_id_phone_number_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_phone_pools"
    ADD CONSTRAINT "campaign_phone_pools_campaign_id_phone_number_id_key" UNIQUE ("campaign_id", "phone_number_id");


--
-- Name: campaign_phone_pools campaign_phone_pools_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_phone_pools"
    ADD CONSTRAINT "campaign_phone_pools_pkey" PRIMARY KEY ("id");


--
-- Name: campaign_workflows campaign_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_workflows"
    ADD CONSTRAINT "campaign_workflows_pkey" PRIMARY KEY ("id");


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");


--
-- Name: churn_risk_events churn_risk_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."churn_risk_events"
    ADD CONSTRAINT "churn_risk_events_pkey" PRIMARY KEY ("id");


--
-- Name: credit_transactions credit_transactions_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_idempotency_key_key" UNIQUE ("idempotency_key");


--
-- Name: credit_transactions credit_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id");


--
-- Name: daily_battle_plans daily_battle_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_battle_plans"
    ADD CONSTRAINT "daily_battle_plans_pkey" PRIMARY KEY ("id");


--
-- Name: daily_battle_plans daily_battle_plans_user_id_plan_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_battle_plans"
    ADD CONSTRAINT "daily_battle_plans_user_id_plan_date_key" UNIQUE ("user_id", "plan_date");


--
-- Name: daily_reports daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id");


--
-- Name: daily_reports daily_reports_user_id_report_date_report_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."daily_reports"
    ADD CONSTRAINT "daily_reports_user_id_report_date_report_type_key" UNIQUE ("user_id", "report_date", "report_type");


--
-- Name: demo_agent_config demo_agent_config_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."demo_agent_config"
    ADD CONSTRAINT "demo_agent_config_pkey" PRIMARY KEY ("id");


--
-- Name: demo_call_logs demo_call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."demo_call_logs"
    ADD CONSTRAINT "demo_call_logs_pkey" PRIMARY KEY ("id");


--
-- Name: demo_sessions demo_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."demo_sessions"
    ADD CONSTRAINT "demo_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: dialing_queues dialing_queues_campaign_lead_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dialing_queues"
    ADD CONSTRAINT "dialing_queues_campaign_lead_unique" UNIQUE ("campaign_id", "lead_id");


--
-- Name: dialing_queues dialing_queues_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dialing_queues"
    ADD CONSTRAINT "dialing_queues_pkey" PRIMARY KEY ("id");


--
-- Name: disposition_auto_actions disposition_auto_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_auto_actions"
    ADD CONSTRAINT "disposition_auto_actions_pkey" PRIMARY KEY ("id");


--
-- Name: disposition_metrics disposition_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_metrics"
    ADD CONSTRAINT "disposition_metrics_pkey" PRIMARY KEY ("id");


--
-- Name: disposition_values disposition_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_values"
    ADD CONSTRAINT "disposition_values_pkey" PRIMARY KEY ("id");


--
-- Name: disposition_values disposition_values_user_id_disposition_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_values"
    ADD CONSTRAINT "disposition_values_user_id_disposition_name_key" UNIQUE ("user_id", "disposition_name");


--
-- Name: dispositions dispositions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dispositions"
    ADD CONSTRAINT "dispositions_pkey" PRIMARY KEY ("id");


--
-- Name: dnc_list dnc_list_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dnc_list"
    ADD CONSTRAINT "dnc_list_pkey" PRIMARY KEY ("id");


--
-- Name: dnc_list dnc_list_user_id_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dnc_list"
    ADD CONSTRAINT "dnc_list_user_id_phone_number_key" UNIQUE ("user_id", "phone_number");


--
-- Name: edge_function_errors edge_function_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."edge_function_errors"
    ADD CONSTRAINT "edge_function_errors_pkey" PRIMARY KEY ("id");


--
-- Name: follow_up_sequences follow_up_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."follow_up_sequences"
    ADD CONSTRAINT "follow_up_sequences_pkey" PRIMARY KEY ("id");


--
-- Name: followup_playbook followup_playbook_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."followup_playbook"
    ADD CONSTRAINT "followup_playbook_pkey" PRIMARY KEY ("id");


--
-- Name: funnel_snapshots funnel_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."funnel_snapshots"
    ADD CONSTRAINT "funnel_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: funnel_snapshots funnel_snapshots_user_id_snapshot_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."funnel_snapshots"
    ADD CONSTRAINT "funnel_snapshots_user_id_snapshot_date_key" UNIQUE ("user_id", "snapshot_date");


--
-- Name: ghl_pending_updates ghl_pending_updates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_pending_updates"
    ADD CONSTRAINT "ghl_pending_updates_pkey" PRIMARY KEY ("id");


--
-- Name: ghl_sync_settings ghl_sync_settings_broadcast_webhook_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_sync_settings"
    ADD CONSTRAINT "ghl_sync_settings_broadcast_webhook_key_key" UNIQUE ("broadcast_webhook_key");


--
-- Name: ghl_sync_settings ghl_sync_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_sync_settings"
    ADD CONSTRAINT "ghl_sync_settings_pkey" PRIMARY KEY ("id");


--
-- Name: ghl_sync_settings ghl_sync_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_sync_settings"
    ADD CONSTRAINT "ghl_sync_settings_user_id_unique" UNIQUE ("user_id");


--
-- Name: guardian_alerts guardian_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guardian_alerts"
    ADD CONSTRAINT "guardian_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: insight_generated_rules insight_generated_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insight_generated_rules"
    ADD CONSTRAINT "insight_generated_rules_pkey" PRIMARY KEY ("id");


--
-- Name: journey_event_log journey_event_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journey_event_log"
    ADD CONSTRAINT "journey_event_log_pkey" PRIMARY KEY ("id");


--
-- Name: lead_intent_signals lead_intent_signals_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_intent_signals"
    ADD CONSTRAINT "lead_intent_signals_pkey" PRIMARY KEY ("id");


--
-- Name: lead_journey_state lead_journey_state_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_journey_state"
    ADD CONSTRAINT "lead_journey_state_pkey" PRIMARY KEY ("id");


--
-- Name: lead_journey_state lead_journey_state_user_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_journey_state"
    ADD CONSTRAINT "lead_journey_state_user_id_lead_id_key" UNIQUE ("user_id", "lead_id");


--
-- Name: lead_list_memberships lead_list_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_list_memberships"
    ADD CONSTRAINT "lead_list_memberships_pkey" PRIMARY KEY ("id");


--
-- Name: lead_list_memberships lead_list_memberships_smart_list_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_list_memberships"
    ADD CONSTRAINT "lead_list_memberships_smart_list_id_lead_id_key" UNIQUE ("smart_list_id", "lead_id");


--
-- Name: lead_nudge_tracking lead_nudge_tracking_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_nudge_tracking"
    ADD CONSTRAINT "lead_nudge_tracking_lead_id_key" UNIQUE ("lead_id");


--
-- Name: lead_nudge_tracking lead_nudge_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_nudge_tracking"
    ADD CONSTRAINT "lead_nudge_tracking_pkey" PRIMARY KEY ("id");


--
-- Name: lead_pipeline_positions lead_pipeline_positions_lead_id_pipeline_board_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_pipeline_positions"
    ADD CONSTRAINT "lead_pipeline_positions_lead_id_pipeline_board_id_key" UNIQUE ("lead_id", "pipeline_board_id");


--
-- Name: lead_pipeline_positions lead_pipeline_positions_lead_user_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_pipeline_positions"
    ADD CONSTRAINT "lead_pipeline_positions_lead_user_unique" UNIQUE ("lead_id", "user_id");


--
-- Name: lead_pipeline_positions lead_pipeline_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_pipeline_positions"
    ADD CONSTRAINT "lead_pipeline_positions_pkey" PRIMARY KEY ("id");


--
-- Name: lead_predictions lead_predictions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_predictions"
    ADD CONSTRAINT "lead_predictions_pkey" PRIMARY KEY ("id");


--
-- Name: lead_predictions lead_predictions_user_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_predictions"
    ADD CONSTRAINT "lead_predictions_user_id_lead_id_key" UNIQUE ("user_id", "lead_id");


--
-- Name: lead_priority_scores lead_priority_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_priority_scores"
    ADD CONSTRAINT "lead_priority_scores_pkey" PRIMARY KEY ("id");


--
-- Name: lead_priority_scores lead_priority_scores_user_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_priority_scores"
    ADD CONSTRAINT "lead_priority_scores_user_id_lead_id_key" UNIQUE ("user_id", "lead_id");


--
-- Name: lead_reachability_scores lead_reachability_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_reachability_scores"
    ADD CONSTRAINT "lead_reachability_scores_pkey" PRIMARY KEY ("id");


--
-- Name: lead_reachability_scores lead_reachability_scores_user_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_reachability_scores"
    ADD CONSTRAINT "lead_reachability_scores_user_id_lead_id_key" UNIQUE ("user_id", "lead_id");


--
-- Name: lead_score_outcomes lead_score_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_score_outcomes"
    ADD CONSTRAINT "lead_score_outcomes_pkey" PRIMARY KEY ("id");


--
-- Name: lead_scoring_settings lead_scoring_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_scoring_settings"
    ADD CONSTRAINT "lead_scoring_settings_pkey" PRIMARY KEY ("id");


--
-- Name: lead_scoring_settings lead_scoring_settings_user_id_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_scoring_settings"
    ADD CONSTRAINT "lead_scoring_settings_user_id_unique" UNIQUE ("user_id");


--
-- Name: lead_scoring_weights lead_scoring_weights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_scoring_weights"
    ADD CONSTRAINT "lead_scoring_weights_pkey" PRIMARY KEY ("id");


--
-- Name: lead_scoring_weights lead_scoring_weights_user_factor_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_scoring_weights"
    ADD CONSTRAINT "lead_scoring_weights_user_factor_unique" UNIQUE ("user_id", "factor_name");


--
-- Name: lead_scoring_weights lead_scoring_weights_user_id_factor_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_scoring_weights"
    ADD CONSTRAINT "lead_scoring_weights_user_id_factor_name_key" UNIQUE ("user_id", "factor_name");


--
-- Name: lead_workflow_progress lead_workflow_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_workflow_progress"
    ADD CONSTRAINT "lead_workflow_progress_pkey" PRIMARY KEY ("id");


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_pkey" PRIMARY KEY ("id");


--
-- Name: learning_outcomes learning_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."learning_outcomes"
    ADD CONSTRAINT "learning_outcomes_pkey" PRIMARY KEY ("id");


--
-- Name: lj_memory lj_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lj_memory"
    ADD CONSTRAINT "lj_memory_pkey" PRIMARY KEY ("id");


--
-- Name: lj_memory lj_memory_user_id_memory_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lj_memory"
    ADD CONSTRAINT "lj_memory_user_id_memory_key_key" UNIQUE ("user_id", "memory_key");


--
-- Name: message_effectiveness message_effectiveness_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_effectiveness"
    ADD CONSTRAINT "message_effectiveness_pkey" PRIMARY KEY ("id");


--
-- Name: message_effectiveness message_effectiveness_user_id_message_hash_effective_for_st_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_effectiveness"
    ADD CONSTRAINT "message_effectiveness_user_id_message_hash_effective_for_st_key" UNIQUE ("user_id", "message_hash", "effective_for_stage");


--
-- Name: ml_learning_data ml_learning_data_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_learning_data"
    ADD CONSTRAINT "ml_learning_data_pkey" PRIMARY KEY ("id");


--
-- Name: ml_models ml_models_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_models"
    ADD CONSTRAINT "ml_models_pkey" PRIMARY KEY ("id");


--
-- Name: ml_models ml_models_user_id_model_type_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_models"
    ADD CONSTRAINT "ml_models_user_id_model_type_version_key" UNIQUE ("user_id", "model_type", "version");


--
-- Name: number_health_metrics number_health_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."number_health_metrics"
    ADD CONSTRAINT "number_health_metrics_pkey" PRIMARY KEY ("id");


--
-- Name: number_health_metrics number_health_metrics_user_id_phone_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."number_health_metrics"
    ADD CONSTRAINT "number_health_metrics_user_id_phone_number_key" UNIQUE ("user_id", "phone_number");


--
-- Name: number_orders number_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."number_orders"
    ADD CONSTRAINT "number_orders_pkey" PRIMARY KEY ("id");


--
-- Name: opener_analytics opener_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opener_analytics"
    ADD CONSTRAINT "opener_analytics_pkey" PRIMARY KEY ("id");


--
-- Name: opener_analytics opener_analytics_user_id_opener_normalized_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."opener_analytics"
    ADD CONSTRAINT "opener_analytics_user_id_opener_normalized_key" UNIQUE ("user_id", "opener_normalized");


--
-- Name: optimal_calling_windows optimal_calling_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."optimal_calling_windows"
    ADD CONSTRAINT "optimal_calling_windows_pkey" PRIMARY KEY ("id");


--
-- Name: optimal_calling_windows optimal_calling_windows_user_day_hour_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."optimal_calling_windows"
    ADD CONSTRAINT "optimal_calling_windows_user_day_hour_key" UNIQUE ("user_id", "day_of_week", "hour_of_day");


--
-- Name: optimal_calling_windows optimal_calling_windows_user_id_day_of_week_hour_of_day_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."optimal_calling_windows"
    ADD CONSTRAINT "optimal_calling_windows_user_id_day_of_week_hour_of_day_key" UNIQUE ("user_id", "day_of_week", "hour_of_day");


--
-- Name: organization_credits organization_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organization_credits"
    ADD CONSTRAINT "organization_credits_pkey" PRIMARY KEY ("id");


--
-- Name: organization_users organization_users_organization_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_organization_id_user_id_key" UNIQUE ("organization_id", "user_id");


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_pkey" PRIMARY KEY ("id");


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_slug_key" UNIQUE ("slug");


--
-- Name: pacing_history pacing_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pacing_history"
    ADD CONSTRAINT "pacing_history_pkey" PRIMARY KEY ("id");


--
-- Name: phone_number_use_types phone_number_use_types_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_number_use_types"
    ADD CONSTRAINT "phone_number_use_types_pkey" PRIMARY KEY ("code");


--
-- Name: phone_numbers phone_numbers_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_numbers"
    ADD CONSTRAINT "phone_numbers_number_key" UNIQUE ("number");


--
-- Name: phone_numbers phone_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_numbers"
    ADD CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id");


--
-- Name: phone_providers phone_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_providers"
    ADD CONSTRAINT "phone_providers_pkey" PRIMARY KEY ("id");


--
-- Name: phone_providers phone_providers_user_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_providers"
    ADD CONSTRAINT "phone_providers_user_id_name_key" UNIQUE ("user_id", "name");


--
-- Name: pipeline_boards pipeline_boards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_boards"
    ADD CONSTRAINT "pipeline_boards_pkey" PRIMARY KEY ("id");


--
-- Name: playbook_optimization_log playbook_optimization_log_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_optimization_log"
    ADD CONSTRAINT "playbook_optimization_log_pkey" PRIMARY KEY ("id");


--
-- Name: playbook_performance playbook_performance_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_performance"
    ADD CONSTRAINT "playbook_performance_pkey" PRIMARY KEY ("id");


--
-- Name: playbook_performance playbook_performance_user_id_rule_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_performance"
    ADD CONSTRAINT "playbook_performance_user_id_rule_id_key" UNIQUE ("user_id", "rule_id");


--
-- Name: predictive_dialing_stats predictive_dialing_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."predictive_dialing_stats"
    ADD CONSTRAINT "predictive_dialing_stats_pkey" PRIMARY KEY ("id");


--
-- Name: pricing_tiers pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_tiers"
    ADD CONSTRAINT "pricing_tiers_pkey" PRIMARY KEY ("id");


--
-- Name: pricing_tiers pricing_tiers_tier_type_tier_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pricing_tiers"
    ADD CONSTRAINT "pricing_tiers_tier_type_tier_name_key" UNIQUE ("tier_type", "tier_name");


--
-- Name: reachability_events reachability_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reachability_events"
    ADD CONSTRAINT "reachability_events_pkey" PRIMARY KEY ("id");


--
-- Name: retell_agents retell_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_agents"
    ADD CONSTRAINT "retell_agents_pkey" PRIMARY KEY ("id");


--
-- Name: retell_agents retell_agents_user_agent_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_agents"
    ADD CONSTRAINT "retell_agents_user_agent_unique" UNIQUE ("user_id", "retell_agent_id");


--
-- Name: retell_branded_calls retell_branded_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_branded_calls"
    ADD CONSTRAINT "retell_branded_calls_pkey" PRIMARY KEY ("id");


--
-- Name: retell_business_profiles retell_business_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_business_profiles"
    ADD CONSTRAINT "retell_business_profiles_pkey" PRIMARY KEY ("id");


--
-- Name: retell_transfer_context retell_transfer_context_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_transfer_context"
    ADD CONSTRAINT "retell_transfer_context_pkey" PRIMARY KEY ("id");


--
-- Name: retell_verified_numbers retell_verified_numbers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_verified_numbers"
    ADD CONSTRAINT "retell_verified_numbers_pkey" PRIMARY KEY ("id");


--
-- Name: rotation_history rotation_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rotation_history"
    ADD CONSTRAINT "rotation_history_pkey" PRIMARY KEY ("id");


--
-- Name: rotation_settings rotation_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."rotation_settings"
    ADD CONSTRAINT "rotation_settings_pkey" PRIMARY KEY ("id");


--
-- Name: scheduled_follow_ups scheduled_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduled_follow_ups"
    ADD CONSTRAINT "scheduled_follow_ups_pkey" PRIMARY KEY ("id");


--
-- Name: segment_roi_metrics segment_roi_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."segment_roi_metrics"
    ADD CONSTRAINT "segment_roi_metrics_pkey" PRIMARY KEY ("id");


--
-- Name: segment_roi_metrics segment_roi_metrics_user_id_segment_name_period_start_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."segment_roi_metrics"
    ADD CONSTRAINT "segment_roi_metrics_user_id_segment_name_period_start_key" UNIQUE ("user_id", "segment_name", "period_start");


--
-- Name: sequence_steps sequence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sequence_steps"
    ADD CONSTRAINT "sequence_steps_pkey" PRIMARY KEY ("id");


--
-- Name: sequence_templates sequence_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sequence_templates"
    ADD CONSTRAINT "sequence_templates_pkey" PRIMARY KEY ("id");


--
-- Name: sip_trunk_configs sip_trunk_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sip_trunk_configs"
    ADD CONSTRAINT "sip_trunk_configs_pkey" PRIMARY KEY ("id");


--
-- Name: slack_users slack_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."slack_users"
    ADD CONSTRAINT "slack_users_pkey" PRIMARY KEY ("id");


--
-- Name: slack_users slack_users_slack_team_id_slack_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."slack_users"
    ADD CONSTRAINT "slack_users_slack_team_id_slack_user_id_key" UNIQUE ("slack_team_id", "slack_user_id");


--
-- Name: smart_lists smart_lists_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."smart_lists"
    ADD CONSTRAINT "smart_lists_pkey" PRIMARY KEY ("id");


--
-- Name: sms_context_history sms_context_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_context_history"
    ADD CONSTRAINT "sms_context_history_pkey" PRIMARY KEY ("id");


--
-- Name: sms_conversations sms_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_conversations"
    ADD CONSTRAINT "sms_conversations_pkey" PRIMARY KEY ("id");


--
-- Name: sms_copy_variants sms_copy_variants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_copy_variants"
    ADD CONSTRAINT "sms_copy_variants_pkey" PRIMARY KEY ("id");


--
-- Name: sms_copy_variants sms_copy_variants_user_id_context_type_context_id_variant_l_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_copy_variants"
    ADD CONSTRAINT "sms_copy_variants_user_id_context_type_context_id_variant_l_key" UNIQUE ("user_id", "context_type", "context_id", "variant_label");


--
-- Name: sms_messages sms_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id");


--
-- Name: sms_variant_assignments sms_variant_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_variant_assignments"
    ADD CONSTRAINT "sms_variant_assignments_pkey" PRIMARY KEY ("id");


--
-- Name: spending_logs spending_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_logs"
    ADD CONSTRAINT "spending_logs_pkey" PRIMARY KEY ("id");


--
-- Name: spending_summaries spending_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_summaries"
    ADD CONSTRAINT "spending_summaries_pkey" PRIMARY KEY ("id");


--
-- Name: spending_summaries spending_summaries_user_id_campaign_id_summary_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_summaries"
    ADD CONSTRAINT "spending_summaries_user_id_campaign_id_summary_date_key" UNIQUE ("user_id", "campaign_id", "summary_date");


--
-- Name: strategic_briefings strategic_briefings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."strategic_briefings"
    ADD CONSTRAINT "strategic_briefings_pkey" PRIMARY KEY ("id");


--
-- Name: strategic_insights strategic_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."strategic_insights"
    ADD CONSTRAINT "strategic_insights_pkey" PRIMARY KEY ("id");


--
-- Name: system_alerts system_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_alerts"
    ADD CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id");


--
-- Name: system_health_logs system_health_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_health_logs"
    ADD CONSTRAINT "system_health_logs_pkey" PRIMARY KEY ("id");


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id");


--
-- Name: system_settings system_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_user_id_key" UNIQUE ("user_id");


--
-- Name: telnyx_assistants telnyx_assistants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_assistants"
    ADD CONSTRAINT "telnyx_assistants_pkey" PRIMARY KEY ("id");


--
-- Name: telnyx_conversation_insights telnyx_conversation_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_conversation_insights"
    ADD CONSTRAINT "telnyx_conversation_insights_pkey" PRIMARY KEY ("id");


--
-- Name: telnyx_insight_templates telnyx_insight_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_insight_templates"
    ADD CONSTRAINT "telnyx_insight_templates_pkey" PRIMARY KEY ("id");


--
-- Name: telnyx_knowledge_bases telnyx_knowledge_bases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_knowledge_bases"
    ADD CONSTRAINT "telnyx_knowledge_bases_pkey" PRIMARY KEY ("id");


--
-- Name: telnyx_scheduled_events telnyx_scheduled_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_scheduled_events"
    ADD CONSTRAINT "telnyx_scheduled_events_pkey" PRIMARY KEY ("id");


--
-- Name: telnyx_settings telnyx_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_settings"
    ADD CONSTRAINT "telnyx_settings_pkey" PRIMARY KEY ("id");


--
-- Name: telnyx_settings telnyx_settings_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_settings"
    ADD CONSTRAINT "telnyx_settings_user_id_key" UNIQUE ("user_id");


--
-- Name: organization_credits unique_org_credits; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organization_credits"
    ADD CONSTRAINT "unique_org_credits" UNIQUE ("organization_id");


--
-- Name: user_credentials user_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_pkey" PRIMARY KEY ("id");


--
-- Name: user_credentials user_credentials_user_id_service_name_credential_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_user_id_service_name_credential_key_key" UNIQUE ("user_id", "service_name", "credential_key");


--
-- Name: user_feature_flags user_feature_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_feature_flags"
    ADD CONSTRAINT "user_feature_flags_pkey" PRIMARY KEY ("id");


--
-- Name: user_feature_flags user_feature_flags_user_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_feature_flags"
    ADD CONSTRAINT "user_feature_flags_user_id_key" UNIQUE ("user_id");


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");


--
-- Name: voice_broadcasts voice_broadcasts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voice_broadcasts"
    ADD CONSTRAINT "voice_broadcasts_pkey" PRIMARY KEY ("id");


--
-- Name: voicemail_analytics voicemail_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voicemail_analytics"
    ADD CONSTRAINT "voicemail_analytics_pkey" PRIMARY KEY ("id");


--
-- Name: voicemail_callback_tracking voicemail_callback_tracking_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voicemail_callback_tracking"
    ADD CONSTRAINT "voicemail_callback_tracking_pkey" PRIMARY KEY ("id");


--
-- Name: workflow_steps workflow_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id");


--
-- Name: workflow_test_logs workflow_test_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_test_logs"
    ADD CONSTRAINT "workflow_test_logs_pkey" PRIMARY KEY ("id");


--
-- Name: yellowstone_settings yellowstone_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."yellowstone_settings"
    ADD CONSTRAINT "yellowstone_settings_pkey" PRIMARY KEY ("id");


--
-- Name: idx_action_queue_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_action_queue_priority" ON "public"."ai_action_queue" USING "btree" ("priority", "created_at");


--
-- Name: idx_action_queue_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_action_queue_user_status" ON "public"."ai_action_queue" USING "btree" ("user_id", "status");


--
-- Name: idx_active_ai_transfers_call_sid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_active_ai_transfers_call_sid" ON "public"."active_ai_transfers" USING "btree" ("call_sid") WHERE ("call_sid" IS NOT NULL);


--
-- Name: idx_active_ai_transfers_platform_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_active_ai_transfers_platform_status" ON "public"."active_ai_transfers" USING "btree" ("user_id", "platform", "status") WHERE ("status" = 'active'::"text");


--
-- Name: idx_active_ai_transfers_retell_call_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_active_ai_transfers_retell_call_id" ON "public"."active_ai_transfers" USING "btree" ("retell_call_id") WHERE ("retell_call_id" IS NOT NULL);


--
-- Name: idx_agent_decisions_user_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_decisions_user_date" ON "public"."agent_decisions" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_agent_improvement_agent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_improvement_agent" ON "public"."agent_improvement_history" USING "btree" ("agent_id");


--
-- Name: idx_agent_improvement_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_improvement_created" ON "public"."agent_improvement_history" USING "btree" ("created_at" DESC);


--
-- Name: idx_agent_improvement_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_improvement_type" ON "public"."agent_improvement_history" USING "btree" ("improvement_type");


--
-- Name: idx_agent_improvement_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_improvement_user" ON "public"."agent_improvement_history" USING "btree" ("user_id");


--
-- Name: idx_agent_pricing_agent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_pricing_agent" ON "public"."agent_pricing" USING "btree" ("retell_agent_id");


--
-- Name: idx_agent_pricing_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_agent_pricing_org" ON "public"."agent_pricing" USING "btree" ("organization_id");


--
-- Name: idx_ai_daily_insights_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_daily_insights_date" ON "public"."ai_daily_insights" USING "btree" ("user_id", "insight_date");


--
-- Name: idx_ai_feedback_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_feedback_user_id" ON "public"."ai_feedback" USING "btree" ("user_id");


--
-- Name: idx_ai_learning_user_pattern; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_learning_user_pattern" ON "public"."ai_learning" USING "btree" ("user_id", "pattern_type");


--
-- Name: idx_ai_session_memory_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_session_memory_session" ON "public"."ai_session_memory" USING "btree" ("user_id", "session_id");


--
-- Name: idx_ai_strategies_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ai_strategies_user_status" ON "public"."ai_campaign_strategies" USING "btree" ("user_id", "status");


--
-- Name: idx_api_key_audit_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_api_key_audit_key" ON "public"."api_key_audit_log" USING "btree" ("api_key_id", "created_at" DESC);


--
-- Name: idx_api_key_audit_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_api_key_audit_user" ON "public"."api_key_audit_log" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_api_keys_hash; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_api_keys_hash" ON "public"."api_keys" USING "btree" ("key_hash") WHERE ("revoked_at" IS NULL);


--
-- Name: idx_api_keys_organization; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_api_keys_organization" ON "public"."api_keys" USING "btree" ("organization_id");


--
-- Name: idx_api_keys_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_api_keys_user" ON "public"."api_keys" USING "btree" ("user_id");


--
-- Name: idx_autonomous_goals_user_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_autonomous_goals_user_date" ON "public"."autonomous_goals" USING "btree" ("user_id", "goal_date" DESC);


--
-- Name: idx_battle_plans_user_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_battle_plans_user_date" ON "public"."daily_battle_plans" USING "btree" ("user_id", "plan_date" DESC);


--
-- Name: idx_broadcast_queue_amd_result; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_amd_result" ON "public"."broadcast_queue" USING "btree" ("broadcast_id", "amd_result") WHERE ("amd_result" IS NOT NULL);


--
-- Name: idx_broadcast_queue_broadcast_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_broadcast_status" ON "public"."broadcast_queue" USING "btree" ("broadcast_id", "status");


--
-- Name: idx_broadcast_queue_call_sid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_call_sid" ON "public"."broadcast_queue" USING "btree" ("call_sid") WHERE ("call_sid" IS NOT NULL);


--
-- Name: idx_broadcast_queue_calling; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_calling" ON "public"."broadcast_queue" USING "btree" ("broadcast_id", "status", "updated_at") WHERE ("status" = 'calling'::"text");


--
-- Name: idx_broadcast_queue_cost; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_cost" ON "public"."broadcast_queue" USING "btree" ("broadcast_id", "call_cost") WHERE ("call_cost" IS NOT NULL);


--
-- Name: idx_broadcast_queue_failed; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_failed" ON "public"."broadcast_queue" USING "btree" ("broadcast_id", "status") WHERE ("status" = 'failed'::"text");


--
-- Name: idx_broadcast_queue_ghl_contact; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_ghl_contact" ON "public"."broadcast_queue" USING "btree" ("ghl_contact_id") WHERE ("ghl_contact_id" IS NOT NULL);


--
-- Name: idx_broadcast_queue_scheduled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_scheduled" ON "public"."broadcast_queue" USING "btree" ("scheduled_at") WHERE ("status" = 'pending'::"text");


--
-- Name: idx_broadcast_queue_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_broadcast_queue_status" ON "public"."broadcast_queue" USING "btree" ("broadcast_id", "status");


--
-- Name: idx_budget_alerts_user_unack; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_budget_alerts_user_unack" ON "public"."budget_alerts" USING "btree" ("user_id", "acknowledged") WHERE ("acknowledged" = false);


--
-- Name: idx_calendar_appointments_user_start; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_calendar_appointments_user_start" ON "public"."calendar_appointments" USING "btree" ("user_id", "start_time");


--
-- Name: idx_calendar_tool_invocations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_calendar_tool_invocations_user_id" ON "public"."calendar_tool_invocations" USING "btree" ("user_id");


--
-- Name: idx_call_logs_agent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_agent_id" ON "public"."call_logs" USING "btree" ("agent_id");


--
-- Name: idx_call_logs_auto_disposition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_auto_disposition" ON "public"."call_logs" USING "btree" ("auto_disposition");


--
-- Name: idx_call_logs_campaign_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_campaign_id" ON "public"."call_logs" USING "btree" ("campaign_id");


--
-- Name: idx_call_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_created_at" ON "public"."call_logs" USING "btree" ("created_at");


--
-- Name: idx_call_logs_provider; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_provider" ON "public"."call_logs" USING "btree" ("provider");


--
-- Name: idx_call_logs_retell_cost; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_retell_cost" ON "public"."call_logs" USING "btree" ("campaign_id", "retell_cost_cents") WHERE ("retell_cost_cents" IS NOT NULL);


--
-- Name: idx_call_logs_sentiment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_sentiment" ON "public"."call_logs" USING "btree" ("sentiment");


--
-- Name: idx_call_logs_telnyx_control_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_telnyx_control_id" ON "public"."call_logs" USING "btree" ("telnyx_call_control_id") WHERE ("telnyx_call_control_id" IS NOT NULL);


--
-- Name: idx_call_logs_telnyx_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_telnyx_session_id" ON "public"."call_logs" USING "btree" ("telnyx_call_session_id") WHERE ("telnyx_call_session_id" IS NOT NULL);


--
-- Name: idx_call_logs_time_wasted; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_time_wasted" ON "public"."call_logs" USING "btree" ("user_id", "time_wasted_score" DESC) WHERE ("time_wasted_score" > 0);


--
-- Name: idx_call_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_logs_user_id" ON "public"."call_logs" USING "btree" ("user_id");


--
-- Name: idx_call_opener_logs_call; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_opener_logs_call" ON "public"."call_opener_logs" USING "btree" ("call_id");


--
-- Name: idx_call_opener_logs_opener; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_call_opener_logs_opener" ON "public"."call_opener_logs" USING "btree" ("opener_id", "created_at" DESC);


--
-- Name: idx_campaign_phone_pools_campaign; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_campaign_phone_pools_campaign" ON "public"."campaign_phone_pools" USING "btree" ("campaign_id");


--
-- Name: idx_campaign_phone_pools_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_campaign_phone_pools_phone" ON "public"."campaign_phone_pools" USING "btree" ("phone_number_id");


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_campaigns_status" ON "public"."campaigns" USING "btree" ("status");


--
-- Name: idx_campaigns_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_campaigns_user_id" ON "public"."campaigns" USING "btree" ("user_id");


--
-- Name: idx_churn_risk_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_churn_risk_active" ON "public"."churn_risk_events" USING "btree" ("user_id", "risk_level", "detected_at") WHERE ("resolved_at" IS NULL);


--
-- Name: idx_credit_transactions_org; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_credit_transactions_org" ON "public"."credit_transactions" USING "btree" ("organization_id", "created_at" DESC);


--
-- Name: idx_credit_tx_call; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_credit_tx_call" ON "public"."credit_transactions" USING "btree" ("call_log_id") WHERE ("call_log_id" IS NOT NULL);


--
-- Name: idx_credit_tx_retell; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_credit_tx_retell" ON "public"."credit_transactions" USING "btree" ("retell_call_id") WHERE ("retell_call_id" IS NOT NULL);


--
-- Name: idx_daily_reports_user_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_daily_reports_user_date" ON "public"."daily_reports" USING "btree" ("user_id", "report_date" DESC);


--
-- Name: idx_demo_call_logs_ip_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_demo_call_logs_ip_date" ON "public"."demo_call_logs" USING "btree" ("ip_address", "created_at");


--
-- Name: idx_demo_call_logs_session; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_demo_call_logs_session" ON "public"."demo_call_logs" USING "btree" ("session_id");


--
-- Name: idx_demo_sessions_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_demo_sessions_created" ON "public"."demo_sessions" USING "btree" ("created_at" DESC);


--
-- Name: idx_demo_sessions_ip; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_demo_sessions_ip" ON "public"."demo_sessions" USING "btree" ("ip_address");


--
-- Name: idx_dialing_queues_campaign_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dialing_queues_campaign_id" ON "public"."dialing_queues" USING "btree" ("campaign_id");


--
-- Name: idx_dialing_queues_scheduled_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dialing_queues_scheduled_at" ON "public"."dialing_queues" USING "btree" ("scheduled_at");


--
-- Name: idx_dialing_queues_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dialing_queues_status" ON "public"."dialing_queues" USING "btree" ("status");


--
-- Name: idx_disposition_auto_actions_disposition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disposition_auto_actions_disposition" ON "public"."disposition_auto_actions" USING "btree" ("disposition_id");


--
-- Name: idx_disposition_metrics_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disposition_metrics_created_at" ON "public"."disposition_metrics" USING "btree" ("created_at");


--
-- Name: idx_disposition_metrics_disposition_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disposition_metrics_disposition_name" ON "public"."disposition_metrics" USING "btree" ("disposition_name");


--
-- Name: idx_disposition_metrics_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disposition_metrics_lead_id" ON "public"."disposition_metrics" USING "btree" ("lead_id");


--
-- Name: idx_disposition_metrics_set_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disposition_metrics_set_by" ON "public"."disposition_metrics" USING "btree" ("set_by");


--
-- Name: idx_disposition_metrics_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_disposition_metrics_user_id" ON "public"."disposition_metrics" USING "btree" ("user_id");


--
-- Name: idx_dispositions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dispositions_user_id" ON "public"."dispositions" USING "btree" ("user_id");


--
-- Name: idx_dnc_list_phone_number; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dnc_list_phone_number" ON "public"."dnc_list" USING "btree" ("phone_number");


--
-- Name: idx_dnc_list_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_dnc_list_user_id" ON "public"."dnc_list" USING "btree" ("user_id");


--
-- Name: idx_edge_function_errors_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_edge_function_errors_created_at" ON "public"."edge_function_errors" USING "btree" ("created_at" DESC);


--
-- Name: idx_edge_function_errors_function_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_edge_function_errors_function_name" ON "public"."edge_function_errors" USING "btree" ("function_name");


--
-- Name: idx_edge_function_errors_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_edge_function_errors_severity" ON "public"."edge_function_errors" USING "btree" ("severity");


--
-- Name: idx_edge_function_errors_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_edge_function_errors_user_id" ON "public"."edge_function_errors" USING "btree" ("user_id");


--
-- Name: idx_ghl_pending_broadcast; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ghl_pending_broadcast" ON "public"."ghl_pending_updates" USING "btree" ("broadcast_id");


--
-- Name: idx_ghl_pending_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ghl_pending_created" ON "public"."ghl_pending_updates" USING "btree" ("created_at");


--
-- Name: idx_ghl_pending_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ghl_pending_status" ON "public"."ghl_pending_updates" USING "btree" ("status", "user_id");


--
-- Name: idx_ghl_sync_settings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ghl_sync_settings_user_id" ON "public"."ghl_sync_settings" USING "btree" ("user_id");


--
-- Name: idx_guardian_alerts_component; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_guardian_alerts_component" ON "public"."guardian_alerts" USING "btree" ("component");


--
-- Name: idx_guardian_alerts_severity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_guardian_alerts_severity" ON "public"."guardian_alerts" USING "btree" ("severity", "status");


--
-- Name: idx_guardian_alerts_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_guardian_alerts_status" ON "public"."guardian_alerts" USING "btree" ("status") WHERE ("status" = 'open'::"text");


--
-- Name: idx_guardian_alerts_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_guardian_alerts_user" ON "public"."guardian_alerts" USING "btree" ("user_id", "status");


--
-- Name: idx_insight_rules_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_insight_rules_user" ON "public"."insight_generated_rules" USING "btree" ("user_id", "is_active");


--
-- Name: idx_intent_signals_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_intent_signals_lead" ON "public"."lead_intent_signals" USING "btree" ("lead_id", "created_at" DESC);


--
-- Name: idx_intent_signals_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_intent_signals_user" ON "public"."lead_intent_signals" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_journey_events_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journey_events_lead" ON "public"."journey_event_log" USING "btree" ("lead_id", "created_at" DESC);


--
-- Name: idx_journey_perpetual; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journey_perpetual" ON "public"."lead_journey_state" USING "btree" ("user_id", "perpetual_next_touch_at") WHERE ("perpetual_next_touch_at" IS NOT NULL);


--
-- Name: idx_journey_user_stage; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_journey_user_stage" ON "public"."lead_journey_state" USING "btree" ("user_id", "current_stage", "next_action_scheduled_at");


--
-- Name: idx_lead_list_memberships_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_list_memberships_lead" ON "public"."lead_list_memberships" USING "btree" ("lead_id");


--
-- Name: idx_lead_list_memberships_list; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_list_memberships_list" ON "public"."lead_list_memberships" USING "btree" ("smart_list_id");


--
-- Name: idx_lead_nudge_engaged; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_nudge_engaged" ON "public"."lead_nudge_tracking" USING "btree" ("is_engaged");


--
-- Name: idx_lead_nudge_next; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_nudge_next" ON "public"."lead_nudge_tracking" USING "btree" ("next_nudge_at") WHERE ("sequence_paused" = false);


--
-- Name: idx_lead_pipeline_positions_board_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_pipeline_positions_board_id" ON "public"."lead_pipeline_positions" USING "btree" ("pipeline_board_id");


--
-- Name: idx_lead_pipeline_positions_lead_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_pipeline_positions_lead_id" ON "public"."lead_pipeline_positions" USING "btree" ("lead_id");


--
-- Name: idx_lead_pipeline_positions_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_pipeline_positions_user_id" ON "public"."lead_pipeline_positions" USING "btree" ("user_id");


--
-- Name: idx_lead_predictions_expiry; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_predictions_expiry" ON "public"."lead_predictions" USING "btree" ("expires_at") WHERE ("actual_outcome" IS NULL);


--
-- Name: idx_lead_predictions_segment; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_predictions_segment" ON "public"."lead_predictions" USING "btree" ("user_id", "predicted_segment", "conversion_probability" DESC);


--
-- Name: idx_lead_priority_scores_user_score; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_priority_scores_user_score" ON "public"."lead_priority_scores" USING "btree" ("user_id", "priority_score" DESC);


--
-- Name: idx_lead_workflow_progress_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_workflow_progress_lead" ON "public"."lead_workflow_progress" USING "btree" ("lead_id");


--
-- Name: idx_lead_workflow_progress_next_action; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_workflow_progress_next_action" ON "public"."lead_workflow_progress" USING "btree" ("next_action_at") WHERE ("status" = 'active'::"text");


--
-- Name: idx_lead_workflow_progress_workflow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lead_workflow_progress_workflow" ON "public"."lead_workflow_progress" USING "btree" ("workflow_id");


--
-- Name: idx_leads_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_created_at" ON "public"."leads" USING "btree" ("created_at");


--
-- Name: idx_leads_custom_fields; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_custom_fields" ON "public"."leads" USING "gin" ("custom_fields");


--
-- Name: idx_leads_ghl_contact_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_ghl_contact_id" ON "public"."leads" USING "btree" ("ghl_contact_id");


--
-- Name: idx_leads_lead_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_lead_source" ON "public"."leads" USING "btree" ("lead_source");


--
-- Name: idx_leads_next_callback; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_next_callback" ON "public"."leads" USING "btree" ("next_callback_at");


--
-- Name: idx_leads_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_status" ON "public"."leads" USING "btree" ("status");


--
-- Name: idx_leads_tags; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_tags" ON "public"."leads" USING "gin" ("tags");


--
-- Name: idx_leads_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_leads_user_id" ON "public"."leads" USING "btree" ("user_id");


--
-- Name: idx_learning_outcomes_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_learning_outcomes_user_created" ON "public"."learning_outcomes" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_lj_memory_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lj_memory_key" ON "public"."lj_memory" USING "btree" ("memory_key");


--
-- Name: idx_lj_memory_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lj_memory_type" ON "public"."lj_memory" USING "btree" ("memory_type");


--
-- Name: idx_lj_memory_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lj_memory_user" ON "public"."lj_memory" USING "btree" ("user_id");


--
-- Name: idx_lj_state_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lj_state_lead" ON "public"."lead_journey_state" USING "btree" ("lead_id");


--
-- Name: idx_lj_state_stage; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_lj_state_stage" ON "public"."lead_journey_state" USING "btree" ("user_id", "current_stage");


--
-- Name: idx_message_effectiveness_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_message_effectiveness_lookup" ON "public"."message_effectiveness" USING "btree" ("user_id", "message_type", "effective_for_stage");


--
-- Name: idx_ml_learning_data_agent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ml_learning_data_agent_id" ON "public"."ml_learning_data" USING "btree" ("agent_id");


--
-- Name: idx_ml_learning_data_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ml_learning_data_created_at" ON "public"."ml_learning_data" USING "btree" ("created_at" DESC);


--
-- Name: idx_ml_learning_data_disposition; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ml_learning_data_disposition" ON "public"."ml_learning_data" USING "btree" ("disposition");


--
-- Name: idx_ml_learning_data_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ml_learning_data_user_id" ON "public"."ml_learning_data" USING "btree" ("user_id");


--
-- Name: idx_ml_models_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_ml_models_active" ON "public"."ml_models" USING "btree" ("user_id", "model_type", "is_active") WHERE ("is_active" = true);


--
-- Name: idx_number_orders_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_number_orders_status" ON "public"."number_orders" USING "btree" ("status");


--
-- Name: idx_number_orders_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_number_orders_user_id" ON "public"."number_orders" USING "btree" ("user_id");


--
-- Name: idx_opener_analytics_agent; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_opener_analytics_agent" ON "public"."opener_analytics" USING "btree" ("agent_id", "effectiveness_score" DESC);


--
-- Name: idx_opener_analytics_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_opener_analytics_user" ON "public"."opener_analytics" USING "btree" ("user_id", "effectiveness_score" DESC);


--
-- Name: idx_organization_users_org_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_organization_users_org_id" ON "public"."organization_users" USING "btree" ("organization_id");


--
-- Name: idx_organization_users_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_organization_users_user_id" ON "public"."organization_users" USING "btree" ("user_id");


--
-- Name: idx_organizations_slug; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_organizations_slug" ON "public"."organizations" USING "btree" ("slug");


--
-- Name: idx_phone_numbers_allowed_uses; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_allowed_uses" ON "public"."phone_numbers" USING "gin" ("allowed_uses");


--
-- Name: idx_phone_numbers_area_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_area_code" ON "public"."phone_numbers" USING "btree" ("area_code");


--
-- Name: idx_phone_numbers_attestation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_attestation" ON "public"."phone_numbers" USING "btree" ("stir_shaken_attestation") WHERE ("status" = 'active'::"text");


--
-- Name: idx_phone_numbers_daily_reset; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_daily_reset" ON "public"."phone_numbers" USING "btree" ("user_id", "daily_calls", "last_call_at") WHERE ("daily_calls" > 0);


--
-- Name: idx_phone_numbers_provider_purpose; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_provider_purpose" ON "public"."phone_numbers" USING "btree" ("provider", "purpose");


--
-- Name: idx_phone_numbers_sip_trunk_config_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_sip_trunk_config_id" ON "public"."phone_numbers" USING "btree" ("sip_trunk_config_id") WHERE ("sip_trunk_config_id" IS NOT NULL);


--
-- Name: idx_phone_numbers_stationary; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_stationary" ON "public"."phone_numbers" USING "btree" ("is_stationary") WHERE ("is_stationary" = true);


--
-- Name: idx_phone_numbers_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_status" ON "public"."phone_numbers" USING "btree" ("status");


--
-- Name: idx_phone_numbers_tags; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_tags" ON "public"."phone_numbers" USING "gin" ("tags");


--
-- Name: idx_phone_numbers_twilio_verified; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_phone_numbers_twilio_verified" ON "public"."phone_numbers" USING "btree" ("user_id", "twilio_verified") WHERE ("twilio_verified" = true);


--
-- Name: idx_pipeline_boards_campaign_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_boards_campaign_id" ON "public"."pipeline_boards" USING "btree" ("campaign_id");


--
-- Name: idx_pipeline_boards_disposition_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_boards_disposition_id" ON "public"."pipeline_boards" USING "btree" ("disposition_id");


--
-- Name: idx_pipeline_boards_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_pipeline_boards_user_id" ON "public"."pipeline_boards" USING "btree" ("user_id");


--
-- Name: idx_predictive_dialing_stats_campaign_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_predictive_dialing_stats_campaign_id" ON "public"."predictive_dialing_stats" USING "btree" ("campaign_id");


--
-- Name: idx_predictive_dialing_stats_timestamp; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_predictive_dialing_stats_timestamp" ON "public"."predictive_dialing_stats" USING "btree" ("timestamp" DESC);


--
-- Name: idx_predictive_dialing_stats_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_predictive_dialing_stats_user_id" ON "public"."predictive_dialing_stats" USING "btree" ("user_id");


--
-- Name: idx_reachability_events_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reachability_events_lead" ON "public"."reachability_events" USING "btree" ("lead_id");


--
-- Name: idx_reachability_events_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reachability_events_time" ON "public"."reachability_events" USING "btree" ("created_at" DESC);


--
-- Name: idx_reachability_events_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reachability_events_type" ON "public"."reachability_events" USING "btree" ("event_type");


--
-- Name: idx_reachability_scores_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reachability_scores_lead" ON "public"."lead_reachability_scores" USING "btree" ("lead_id");


--
-- Name: idx_reachability_scores_score; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_reachability_scores_score" ON "public"."lead_reachability_scores" USING "btree" ("reachability_score");


--
-- Name: idx_retell_agents_retell_agent_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_retell_agents_retell_agent_id" ON "public"."retell_agents" USING "btree" ("retell_agent_id");


--
-- Name: idx_retell_agents_retell_llm_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_retell_agents_retell_llm_id" ON "public"."retell_agents" USING "btree" ("retell_llm_id");


--
-- Name: idx_retell_agents_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_retell_agents_user_id" ON "public"."retell_agents" USING "btree" ("user_id");


--
-- Name: idx_rotation_history_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rotation_history_created_at" ON "public"."rotation_history" USING "btree" ("created_at");


--
-- Name: idx_rotation_history_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rotation_history_user_id" ON "public"."rotation_history" USING "btree" ("user_id");


--
-- Name: idx_rotation_settings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_rotation_settings_user_id" ON "public"."rotation_settings" USING "btree" ("user_id");


--
-- Name: idx_scheduled_follow_ups_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_scheduled_follow_ups_user_status" ON "public"."scheduled_follow_ups" USING "btree" ("user_id", "status", "scheduled_at");


--
-- Name: idx_segment_roi_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_segment_roi_user" ON "public"."segment_roi_metrics" USING "btree" ("user_id", "calculated_at" DESC);


--
-- Name: idx_seq_templates_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_seq_templates_category" ON "public"."sequence_templates" USING "btree" ("category", "is_system_template");


--
-- Name: idx_sequence_steps_sequence; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sequence_steps_sequence" ON "public"."sequence_steps" USING "btree" ("sequence_id", "step_number");


--
-- Name: idx_sip_trunk_configs_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sip_trunk_configs_active" ON "public"."sip_trunk_configs" USING "btree" ("user_id", "is_active", "is_default");


--
-- Name: idx_sip_trunk_configs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sip_trunk_configs_user_id" ON "public"."sip_trunk_configs" USING "btree" ("user_id");


--
-- Name: idx_smart_lists_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_smart_lists_user_id" ON "public"."smart_lists" USING "btree" ("user_id");


--
-- Name: idx_sms_assignments_variant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_assignments_variant" ON "public"."sms_variant_assignments" USING "btree" ("variant_id", "sent_at");


--
-- Name: idx_sms_context_history_conversation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_context_history_conversation_id" ON "public"."sms_context_history" USING "btree" ("conversation_id");


--
-- Name: idx_sms_conversations_contact_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_conversations_contact_phone" ON "public"."sms_conversations" USING "btree" ("contact_phone");


--
-- Name: idx_sms_conversations_last_message; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_conversations_last_message" ON "public"."sms_conversations" USING "btree" ("last_message_at" DESC);


--
-- Name: idx_sms_conversations_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_conversations_user_id" ON "public"."sms_conversations" USING "btree" ("user_id");


--
-- Name: idx_sms_messages_conversation_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_messages_conversation_id" ON "public"."sms_messages" USING "btree" ("conversation_id");


--
-- Name: idx_sms_messages_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_messages_created_at" ON "public"."sms_messages" USING "btree" ("created_at" DESC);


--
-- Name: idx_sms_messages_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_messages_user_id" ON "public"."sms_messages" USING "btree" ("user_id");


--
-- Name: idx_sms_variants_context; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_sms_variants_context" ON "public"."sms_copy_variants" USING "btree" ("user_id", "context_type", "context_id", "is_active");


--
-- Name: idx_spending_logs_campaign; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_spending_logs_campaign" ON "public"."spending_logs" USING "btree" ("campaign_id", "created_at");


--
-- Name: idx_spending_logs_user_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_spending_logs_user_created" ON "public"."spending_logs" USING "btree" ("user_id", "created_at");


--
-- Name: idx_spending_summaries_user_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_spending_summaries_user_date" ON "public"."spending_summaries" USING "btree" ("user_id", "summary_date");


--
-- Name: idx_strategic_briefings_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_strategic_briefings_user" ON "public"."strategic_briefings" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_strategic_insights_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_strategic_insights_user" ON "public"."strategic_insights" USING "btree" ("user_id", "created_at" DESC);


--
-- Name: idx_system_alerts_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_system_alerts_created_at" ON "public"."system_alerts" USING "btree" ("created_at" DESC);


--
-- Name: idx_system_alerts_unacknowledged; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_system_alerts_unacknowledged" ON "public"."system_alerts" USING "btree" ("user_id", "acknowledged") WHERE (NOT "acknowledged");


--
-- Name: idx_system_alerts_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_system_alerts_user_id" ON "public"."system_alerts" USING "btree" ("user_id");


--
-- Name: idx_system_health_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_system_health_logs_created_at" ON "public"."system_health_logs" USING "btree" ("created_at");


--
-- Name: idx_system_health_logs_service_name; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_system_health_logs_service_name" ON "public"."system_health_logs" USING "btree" ("service_name");


--
-- Name: idx_telnyx_assistants_telnyx_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_telnyx_assistants_telnyx_id" ON "public"."telnyx_assistants" USING "btree" ("telnyx_assistant_id");


--
-- Name: idx_telnyx_assistants_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_telnyx_assistants_user_id" ON "public"."telnyx_assistants" USING "btree" ("user_id");


--
-- Name: idx_telnyx_insights_conversation; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_telnyx_insights_conversation" ON "public"."telnyx_conversation_insights" USING "btree" ("telnyx_conversation_id");


--
-- Name: idx_telnyx_insights_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_telnyx_insights_user_id" ON "public"."telnyx_conversation_insights" USING "btree" ("user_id");


--
-- Name: idx_user_feature_flags_tier; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_feature_flags_tier" ON "public"."user_feature_flags" USING "btree" ("current_tier");


--
-- Name: idx_user_feature_flags_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_user_feature_flags_user_id" ON "public"."user_feature_flags" USING "btree" ("user_id");


--
-- Name: idx_voice_broadcasts_user_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_voice_broadcasts_user_status" ON "public"."voice_broadcasts" USING "btree" ("user_id", "status");


--
-- Name: idx_voicemail_analytics_user; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_voicemail_analytics_user" ON "public"."voicemail_analytics" USING "btree" ("user_id", "effectiveness_score" DESC);


--
-- Name: idx_voicemail_callback_tracking_lead; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_voicemail_callback_tracking_lead" ON "public"."voicemail_callback_tracking" USING "btree" ("lead_id", "status");


--
-- Name: idx_voicemail_callback_tracking_phone; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_voicemail_callback_tracking_phone" ON "public"."voicemail_callback_tracking" USING "btree" ("phone_number", "status");


--
-- Name: idx_workflow_steps_workflow; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_workflow_steps_workflow" ON "public"."workflow_steps" USING "btree" ("workflow_id");


--
-- Name: idx_workflow_test_logs_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_workflow_test_logs_created_at" ON "public"."workflow_test_logs" USING "btree" ("created_at" DESC);


--
-- Name: idx_workflow_test_logs_test_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_workflow_test_logs_test_id" ON "public"."workflow_test_logs" USING "btree" ("test_id");


--
-- Name: idx_workflow_test_logs_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_workflow_test_logs_user_id" ON "public"."workflow_test_logs" USING "btree" ("user_id");


--
-- Name: idx_yellowstone_settings_user_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "idx_yellowstone_settings_user_id" ON "public"."yellowstone_settings" USING "btree" ("user_id");


--
-- Name: leads_phone_user_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "leads_phone_user_unique" ON "public"."leads" USING "btree" ("phone_number", "user_id");


--
-- Name: retell_transfer_context_expires_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "retell_transfer_context_expires_idx" ON "public"."retell_transfer_context" USING "btree" ("expires_at");


--
-- Name: retell_transfer_context_lookup_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "retell_transfer_context_lookup_idx" ON "public"."retell_transfer_context" USING "btree" ("to_number", "from_number", "created_at" DESC);


--
-- Name: guardian_alerts guardian_alerts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "guardian_alerts_updated_at" BEFORE UPDATE ON "public"."guardian_alerts" FOR EACH ROW EXECUTE FUNCTION "public"."update_guardian_alerts_updated_at"();


--
-- Name: smart_lists smart_lists_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "smart_lists_updated_at" BEFORE UPDATE ON "public"."smart_lists" FOR EACH ROW EXECUTE FUNCTION "public"."update_smart_lists_updated_at"();


--
-- Name: api_keys trg_api_keys_touch_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_api_keys_touch_updated_at" BEFORE UPDATE ON "public"."api_keys" FOR EACH ROW EXECUTE FUNCTION "public"."api_keys_touch_updated_at"();


--
-- Name: campaign_leads trg_auto_route_to_contacting; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "trg_auto_route_to_contacting" AFTER INSERT ON "public"."campaign_leads" FOR EACH ROW EXECUTE FUNCTION "public"."auto_route_to_contacting"();


--
-- Name: active_ai_transfers update_active_ai_transfers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_active_ai_transfers_updated_at" BEFORE UPDATE ON "public"."active_ai_transfers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ai_chatbot_settings update_ai_chatbot_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_ai_chatbot_settings_updated_at" BEFORE UPDATE ON "public"."ai_chatbot_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ai_daily_insights update_ai_daily_insights_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_ai_daily_insights_updated_at" BEFORE UPDATE ON "public"."ai_daily_insights" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ai_learning update_ai_learning_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_ai_learning_updated_at" BEFORE UPDATE ON "public"."ai_learning" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ai_sms_settings update_ai_sms_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_ai_sms_settings_updated_at" BEFORE UPDATE ON "public"."ai_sms_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: broadcast_queue update_broadcast_queue_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_broadcast_queue_updated_at" BEFORE UPDATE ON "public"."broadcast_queue" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: budget_settings update_budget_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_budget_settings_updated_at" BEFORE UPDATE ON "public"."budget_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: calendar_appointments update_calendar_appointments_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_calendar_appointments_updated_at" BEFORE UPDATE ON "public"."calendar_appointments" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: calendar_availability update_calendar_availability_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_calendar_availability_updated_at" BEFORE UPDATE ON "public"."calendar_availability" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: calendar_integrations update_calendar_integrations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_calendar_integrations_updated_at" BEFORE UPDATE ON "public"."calendar_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: campaign_automation_rules update_campaign_automation_rules_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_campaign_automation_rules_updated_at" BEFORE UPDATE ON "public"."campaign_automation_rules" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: campaign_phone_pools update_campaign_phone_pools_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_campaign_phone_pools_updated_at" BEFORE UPDATE ON "public"."campaign_phone_pools" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: campaigns update_campaigns_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: dialing_queues update_dialing_queues_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_dialing_queues_updated_at" BEFORE UPDATE ON "public"."dialing_queues" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: dispositions update_dispositions_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_dispositions_updated_at" BEFORE UPDATE ON "public"."dispositions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: ghl_sync_settings update_ghl_sync_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_ghl_sync_settings_updated_at" BEFORE UPDATE ON "public"."ghl_sync_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: lead_nudge_tracking update_lead_nudge_tracking_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_lead_nudge_tracking_updated_at" BEFORE UPDATE ON "public"."lead_nudge_tracking" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: lead_scoring_settings update_lead_scoring_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_lead_scoring_settings_updated_at" BEFORE UPDATE ON "public"."lead_scoring_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_leads_updated_at" BEFORE UPDATE ON "public"."leads" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: lj_memory update_lj_memory_timestamp; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_lj_memory_timestamp" BEFORE UPDATE ON "public"."lj_memory" FOR EACH ROW EXECUTE FUNCTION "public"."update_lj_memory_updated_at"();


--
-- Name: organizations update_organizations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_organizations_updated_at" BEFORE UPDATE ON "public"."organizations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: phone_numbers update_phone_numbers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_phone_numbers_updated_at" BEFORE UPDATE ON "public"."phone_numbers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: phone_providers update_phone_providers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_phone_providers_updated_at" BEFORE UPDATE ON "public"."phone_providers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: pipeline_boards update_pipeline_boards_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_pipeline_boards_updated_at" BEFORE UPDATE ON "public"."pipeline_boards" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: retell_branded_calls update_retell_branded_calls_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_retell_branded_calls_updated_at" BEFORE UPDATE ON "public"."retell_branded_calls" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: retell_business_profiles update_retell_business_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_retell_business_profiles_updated_at" BEFORE UPDATE ON "public"."retell_business_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: retell_verified_numbers update_retell_verified_numbers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_retell_verified_numbers_updated_at" BEFORE UPDATE ON "public"."retell_verified_numbers" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: rotation_settings update_rotation_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_rotation_settings_updated_at" BEFORE UPDATE ON "public"."rotation_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: sip_trunk_configs update_sip_trunk_configs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_sip_trunk_configs_updated_at" BEFORE UPDATE ON "public"."sip_trunk_configs" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: sms_conversations update_sms_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_sms_conversations_updated_at" BEFORE UPDATE ON "public"."sms_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: spending_summaries update_spending_summaries_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_spending_summaries_updated_at" BEFORE UPDATE ON "public"."spending_summaries" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: telnyx_assistants update_telnyx_assistants_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_telnyx_assistants_updated_at" BEFORE UPDATE ON "public"."telnyx_assistants" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: telnyx_insight_templates update_telnyx_insight_templates_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_telnyx_insight_templates_updated_at" BEFORE UPDATE ON "public"."telnyx_insight_templates" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: telnyx_knowledge_bases update_telnyx_knowledge_bases_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_telnyx_knowledge_bases_updated_at" BEFORE UPDATE ON "public"."telnyx_knowledge_bases" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: telnyx_scheduled_events update_telnyx_scheduled_events_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_telnyx_scheduled_events_updated_at" BEFORE UPDATE ON "public"."telnyx_scheduled_events" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: telnyx_settings update_telnyx_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_telnyx_settings_updated_at" BEFORE UPDATE ON "public"."telnyx_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: user_credentials update_user_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_user_credentials_updated_at" BEFORE UPDATE ON "public"."user_credentials" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: voice_broadcasts update_voice_broadcasts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_voice_broadcasts_updated_at" BEFORE UPDATE ON "public"."voice_broadcasts" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: yellowstone_settings update_yellowstone_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "update_yellowstone_settings_updated_at" BEFORE UPDATE ON "public"."yellowstone_settings" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();


--
-- Name: phone_numbers validate_phone_number_uses_trigger; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "validate_phone_number_uses_trigger" BEFORE INSERT OR UPDATE OF "allowed_uses" ON "public"."phone_numbers" FOR EACH ROW EXECUTE FUNCTION "public"."validate_phone_number_uses"();


--
-- Name: active_ai_transfers active_ai_transfers_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."active_ai_transfers"
    ADD CONSTRAINT "active_ai_transfers_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "public"."voice_broadcasts"("id");


--
-- Name: active_ai_transfers active_ai_transfers_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."active_ai_transfers"
    ADD CONSTRAINT "active_ai_transfers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id");


--
-- Name: adaptive_pacing adaptive_pacing_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."adaptive_pacing"
    ADD CONSTRAINT "adaptive_pacing_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: advanced_dialer_settings advanced_dialer_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."advanced_dialer_settings"
    ADD CONSTRAINT "advanced_dialer_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: agent_decisions agent_decisions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_decisions"
    ADD CONSTRAINT "agent_decisions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: agent_improvement_history agent_improvement_history_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_improvement_history"
    ADD CONSTRAINT "agent_improvement_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: agent_pricing agent_pricing_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."agent_pricing"
    ADD CONSTRAINT "agent_pricing_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: ai_campaign_strategies ai_campaign_strategies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_campaign_strategies"
    ADD CONSTRAINT "ai_campaign_strategies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: ai_workflow_generations ai_workflow_generations_generated_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ai_workflow_generations"
    ADD CONSTRAINT "ai_workflow_generations_generated_workflow_id_fkey" FOREIGN KEY ("generated_workflow_id") REFERENCES "public"."campaign_workflows"("id") ON DELETE SET NULL;


--
-- Name: api_key_audit_log api_key_audit_log_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."api_key_audit_log"
    ADD CONSTRAINT "api_key_audit_log_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE CASCADE;


--
-- Name: api_keys api_keys_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: api_keys api_keys_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."api_keys"
    ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: autonomous_goals autonomous_goals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."autonomous_goals"
    ADD CONSTRAINT "autonomous_goals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: broadcast_queue broadcast_queue_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."broadcast_queue"
    ADD CONSTRAINT "broadcast_queue_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "public"."voice_broadcasts"("id") ON DELETE CASCADE;


--
-- Name: broadcast_queue broadcast_queue_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."broadcast_queue"
    ADD CONSTRAINT "broadcast_queue_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: budget_alerts budget_alerts_budget_setting_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."budget_alerts"
    ADD CONSTRAINT "budget_alerts_budget_setting_id_fkey" FOREIGN KEY ("budget_setting_id") REFERENCES "public"."budget_settings"("id") ON DELETE CASCADE;


--
-- Name: budget_settings budget_settings_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."budget_settings"
    ADD CONSTRAINT "budget_settings_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: calendar_appointments calendar_appointments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."calendar_appointments"
    ADD CONSTRAINT "calendar_appointments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: call_logs call_logs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");


--
-- Name: call_logs call_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id");


--
-- Name: call_logs call_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_logs"
    ADD CONSTRAINT "call_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: call_opener_logs call_opener_logs_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_opener_logs"
    ADD CONSTRAINT "call_opener_logs_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "public"."call_logs"("id") ON DELETE CASCADE;


--
-- Name: call_opener_logs call_opener_logs_opener_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_opener_logs"
    ADD CONSTRAINT "call_opener_logs_opener_id_fkey" FOREIGN KEY ("opener_id") REFERENCES "public"."opener_analytics"("id") ON DELETE CASCADE;


--
-- Name: call_variant_assignments call_variant_assignments_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_variant_assignments"
    ADD CONSTRAINT "call_variant_assignments_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "public"."call_logs"("id") ON DELETE SET NULL;


--
-- Name: call_variant_assignments call_variant_assignments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_variant_assignments"
    ADD CONSTRAINT "call_variant_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: call_variant_assignments call_variant_assignments_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."call_variant_assignments"
    ADD CONSTRAINT "call_variant_assignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."agent_script_variants"("id") ON DELETE CASCADE;


--
-- Name: campaign_automation_rules campaign_automation_rules_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_automation_rules"
    ADD CONSTRAINT "campaign_automation_rules_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: campaign_leads campaign_leads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: campaign_leads campaign_leads_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_leads"
    ADD CONSTRAINT "campaign_leads_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: campaign_phone_pools campaign_phone_pools_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_phone_pools"
    ADD CONSTRAINT "campaign_phone_pools_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: campaign_phone_pools campaign_phone_pools_phone_number_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaign_phone_pools"
    ADD CONSTRAINT "campaign_phone_pools_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "public"."phone_numbers"("id") ON DELETE CASCADE;


--
-- Name: campaigns campaigns_telnyx_assistant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_telnyx_assistant_id_fkey" FOREIGN KEY ("telnyx_assistant_id") REFERENCES "public"."telnyx_assistants"("id") ON DELETE SET NULL;


--
-- Name: campaigns campaigns_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: campaigns campaigns_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."campaign_workflows"("id") ON DELETE SET NULL;


--
-- Name: churn_risk_events churn_risk_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."churn_risk_events"
    ADD CONSTRAINT "churn_risk_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: churn_risk_events churn_risk_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."churn_risk_events"
    ADD CONSTRAINT "churn_risk_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: credit_transactions credit_transactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."credit_transactions"
    ADD CONSTRAINT "credit_transactions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: demo_call_logs demo_call_logs_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."demo_call_logs"
    ADD CONSTRAINT "demo_call_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."demo_sessions"("id") ON DELETE CASCADE;


--
-- Name: disposition_auto_actions disposition_auto_actions_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_auto_actions"
    ADD CONSTRAINT "disposition_auto_actions_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE CASCADE;


--
-- Name: disposition_metrics disposition_metrics_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_metrics"
    ADD CONSTRAINT "disposition_metrics_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "public"."call_logs"("id") ON DELETE SET NULL;


--
-- Name: disposition_metrics disposition_metrics_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_metrics"
    ADD CONSTRAINT "disposition_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;


--
-- Name: disposition_metrics disposition_metrics_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_metrics"
    ADD CONSTRAINT "disposition_metrics_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE SET NULL;


--
-- Name: disposition_metrics disposition_metrics_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_metrics"
    ADD CONSTRAINT "disposition_metrics_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: disposition_values disposition_values_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."disposition_values"
    ADD CONSTRAINT "disposition_values_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: dispositions dispositions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dispositions"
    ADD CONSTRAINT "dispositions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: dnc_list dnc_list_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dnc_list"
    ADD CONSTRAINT "dnc_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: dialing_queues fk_dialing_queues_campaign; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dialing_queues"
    ADD CONSTRAINT "fk_dialing_queues_campaign" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: dialing_queues fk_dialing_queues_lead; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."dialing_queues"
    ADD CONSTRAINT "fk_dialing_queues_lead" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: follow_up_sequences follow_up_sequences_pipeline_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."follow_up_sequences"
    ADD CONSTRAINT "follow_up_sequences_pipeline_stage_id_fkey" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."pipeline_boards"("id") ON DELETE SET NULL;


--
-- Name: funnel_snapshots funnel_snapshots_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."funnel_snapshots"
    ADD CONSTRAINT "funnel_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: ghl_pending_updates ghl_pending_updates_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_pending_updates"
    ADD CONSTRAINT "ghl_pending_updates_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "public"."voice_broadcasts"("id") ON DELETE SET NULL;


--
-- Name: ghl_pending_updates ghl_pending_updates_queue_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_pending_updates"
    ADD CONSTRAINT "ghl_pending_updates_queue_item_id_fkey" FOREIGN KEY ("queue_item_id") REFERENCES "public"."broadcast_queue"("id") ON DELETE SET NULL;


--
-- Name: ghl_pending_updates ghl_pending_updates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ghl_pending_updates"
    ADD CONSTRAINT "ghl_pending_updates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: guardian_alerts guardian_alerts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."guardian_alerts"
    ADD CONSTRAINT "guardian_alerts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: insight_generated_rules insight_generated_rules_insight_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."insight_generated_rules"
    ADD CONSTRAINT "insight_generated_rules_insight_id_fkey" FOREIGN KEY ("insight_id") REFERENCES "public"."strategic_insights"("id");


--
-- Name: journey_event_log journey_event_log_journey_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journey_event_log"
    ADD CONSTRAINT "journey_event_log_journey_state_id_fkey" FOREIGN KEY ("journey_state_id") REFERENCES "public"."lead_journey_state"("id") ON DELETE SET NULL;


--
-- Name: journey_event_log journey_event_log_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."journey_event_log"
    ADD CONSTRAINT "journey_event_log_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_intent_signals lead_intent_signals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_intent_signals"
    ADD CONSTRAINT "lead_intent_signals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: lead_journey_state lead_journey_state_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_journey_state"
    ADD CONSTRAINT "lead_journey_state_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_journey_state lead_journey_state_strategy_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_journey_state"
    ADD CONSTRAINT "lead_journey_state_strategy_id_fkey" FOREIGN KEY ("strategy_id") REFERENCES "public"."ai_campaign_strategies"("id");


--
-- Name: lead_list_memberships lead_list_memberships_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_list_memberships"
    ADD CONSTRAINT "lead_list_memberships_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_list_memberships lead_list_memberships_smart_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_list_memberships"
    ADD CONSTRAINT "lead_list_memberships_smart_list_id_fkey" FOREIGN KEY ("smart_list_id") REFERENCES "public"."smart_lists"("id") ON DELETE CASCADE;


--
-- Name: lead_nudge_tracking lead_nudge_tracking_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_nudge_tracking"
    ADD CONSTRAINT "lead_nudge_tracking_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_pipeline_positions lead_pipeline_positions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_pipeline_positions"
    ADD CONSTRAINT "lead_pipeline_positions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_pipeline_positions lead_pipeline_positions_pipeline_board_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_pipeline_positions"
    ADD CONSTRAINT "lead_pipeline_positions_pipeline_board_id_fkey" FOREIGN KEY ("pipeline_board_id") REFERENCES "public"."pipeline_boards"("id") ON DELETE CASCADE;


--
-- Name: lead_pipeline_positions lead_pipeline_positions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_pipeline_positions"
    ADD CONSTRAINT "lead_pipeline_positions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: lead_predictions lead_predictions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_predictions"
    ADD CONSTRAINT "lead_predictions_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_predictions lead_predictions_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_predictions"
    ADD CONSTRAINT "lead_predictions_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "public"."ml_models"("id");


--
-- Name: lead_predictions lead_predictions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_predictions"
    ADD CONSTRAINT "lead_predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: lead_priority_scores lead_priority_scores_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_priority_scores"
    ADD CONSTRAINT "lead_priority_scores_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_priority_scores lead_priority_scores_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_priority_scores"
    ADD CONSTRAINT "lead_priority_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: lead_reachability_scores lead_reachability_scores_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_reachability_scores"
    ADD CONSTRAINT "lead_reachability_scores_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_score_outcomes lead_score_outcomes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_score_outcomes"
    ADD CONSTRAINT "lead_score_outcomes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: lead_workflow_progress lead_workflow_progress_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_workflow_progress"
    ADD CONSTRAINT "lead_workflow_progress_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;


--
-- Name: lead_workflow_progress lead_workflow_progress_current_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_workflow_progress"
    ADD CONSTRAINT "lead_workflow_progress_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE SET NULL;


--
-- Name: lead_workflow_progress lead_workflow_progress_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_workflow_progress"
    ADD CONSTRAINT "lead_workflow_progress_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: lead_workflow_progress lead_workflow_progress_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lead_workflow_progress"
    ADD CONSTRAINT "lead_workflow_progress_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."campaign_workflows"("id") ON DELETE CASCADE;


--
-- Name: leads leads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."leads"
    ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: learning_outcomes learning_outcomes_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."learning_outcomes"
    ADD CONSTRAINT "learning_outcomes_decision_id_fkey" FOREIGN KEY ("decision_id") REFERENCES "public"."agent_decisions"("id") ON DELETE CASCADE;


--
-- Name: learning_outcomes learning_outcomes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."learning_outcomes"
    ADD CONSTRAINT "learning_outcomes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: learning_outcomes learning_outcomes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."learning_outcomes"
    ADD CONSTRAINT "learning_outcomes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: lj_memory lj_memory_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."lj_memory"
    ADD CONSTRAINT "lj_memory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: message_effectiveness message_effectiveness_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_effectiveness"
    ADD CONSTRAINT "message_effectiveness_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: ml_learning_data ml_learning_data_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_learning_data"
    ADD CONSTRAINT "ml_learning_data_call_id_fkey" FOREIGN KEY ("call_id") REFERENCES "public"."call_logs"("id") ON DELETE SET NULL;


--
-- Name: ml_learning_data ml_learning_data_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_learning_data"
    ADD CONSTRAINT "ml_learning_data_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: ml_learning_data ml_learning_data_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_learning_data"
    ADD CONSTRAINT "ml_learning_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: ml_models ml_models_superseded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_models"
    ADD CONSTRAINT "ml_models_superseded_by_fkey" FOREIGN KEY ("superseded_by") REFERENCES "public"."ml_models"("id");


--
-- Name: ml_models ml_models_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ml_models"
    ADD CONSTRAINT "ml_models_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: number_health_metrics number_health_metrics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."number_health_metrics"
    ADD CONSTRAINT "number_health_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: organization_credits organization_credits_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organization_credits"
    ADD CONSTRAINT "organization_credits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: organization_users organization_users_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."organization_users"
    ADD CONSTRAINT "organization_users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: pacing_history pacing_history_pacing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pacing_history"
    ADD CONSTRAINT "pacing_history_pacing_id_fkey" FOREIGN KEY ("pacing_id") REFERENCES "public"."adaptive_pacing"("id") ON DELETE CASCADE;


--
-- Name: phone_numbers phone_numbers_sip_trunk_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_numbers"
    ADD CONSTRAINT "phone_numbers_sip_trunk_config_id_fkey" FOREIGN KEY ("sip_trunk_config_id") REFERENCES "public"."sip_trunk_configs"("id") ON DELETE SET NULL;


--
-- Name: phone_numbers phone_numbers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_numbers"
    ADD CONSTRAINT "phone_numbers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: pipeline_boards pipeline_boards_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_boards"
    ADD CONSTRAINT "pipeline_boards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;


--
-- Name: pipeline_boards pipeline_boards_disposition_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_boards"
    ADD CONSTRAINT "pipeline_boards_disposition_id_fkey" FOREIGN KEY ("disposition_id") REFERENCES "public"."dispositions"("id") ON DELETE CASCADE;


--
-- Name: pipeline_boards pipeline_boards_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."pipeline_boards"
    ADD CONSTRAINT "pipeline_boards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: playbook_optimization_log playbook_optimization_log_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_optimization_log"
    ADD CONSTRAINT "playbook_optimization_log_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."followup_playbook"("id");


--
-- Name: playbook_optimization_log playbook_optimization_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_optimization_log"
    ADD CONSTRAINT "playbook_optimization_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: playbook_performance playbook_performance_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_performance"
    ADD CONSTRAINT "playbook_performance_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."followup_playbook"("id") ON DELETE CASCADE;


--
-- Name: playbook_performance playbook_performance_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."playbook_performance"
    ADD CONSTRAINT "playbook_performance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: predictive_dialing_stats predictive_dialing_stats_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."predictive_dialing_stats"
    ADD CONSTRAINT "predictive_dialing_stats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;


--
-- Name: predictive_dialing_stats predictive_dialing_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."predictive_dialing_stats"
    ADD CONSTRAINT "predictive_dialing_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: reachability_events reachability_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."reachability_events"
    ADD CONSTRAINT "reachability_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: retell_agents retell_agents_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_agents"
    ADD CONSTRAINT "retell_agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;


--
-- Name: retell_agents retell_agents_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_agents"
    ADD CONSTRAINT "retell_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: retell_branded_calls retell_branded_calls_business_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_branded_calls"
    ADD CONSTRAINT "retell_branded_calls_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "public"."retell_business_profiles"("id") ON DELETE CASCADE;


--
-- Name: retell_verified_numbers retell_verified_numbers_business_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."retell_verified_numbers"
    ADD CONSTRAINT "retell_verified_numbers_business_profile_id_fkey" FOREIGN KEY ("business_profile_id") REFERENCES "public"."retell_business_profiles"("id") ON DELETE CASCADE;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_current_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduled_follow_ups"
    ADD CONSTRAINT "scheduled_follow_ups_current_step_id_fkey" FOREIGN KEY ("current_step_id") REFERENCES "public"."sequence_steps"("id") ON DELETE SET NULL;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduled_follow_ups"
    ADD CONSTRAINT "scheduled_follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: scheduled_follow_ups scheduled_follow_ups_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."scheduled_follow_ups"
    ADD CONSTRAINT "scheduled_follow_ups_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."follow_up_sequences"("id") ON DELETE CASCADE;


--
-- Name: segment_roi_metrics segment_roi_metrics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."segment_roi_metrics"
    ADD CONSTRAINT "segment_roi_metrics_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: sequence_steps sequence_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sequence_steps"
    ADD CONSTRAINT "sequence_steps_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "public"."follow_up_sequences"("id") ON DELETE CASCADE;


--
-- Name: sequence_templates sequence_templates_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sequence_templates"
    ADD CONSTRAINT "sequence_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: slack_users slack_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."slack_users"
    ADD CONSTRAINT "slack_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: sms_context_history sms_context_history_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_context_history"
    ADD CONSTRAINT "sms_context_history_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."sms_conversations"("id") ON DELETE CASCADE;


--
-- Name: sms_copy_variants sms_copy_variants_parent_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_copy_variants"
    ADD CONSTRAINT "sms_copy_variants_parent_variant_id_fkey" FOREIGN KEY ("parent_variant_id") REFERENCES "public"."sms_copy_variants"("id");


--
-- Name: sms_copy_variants sms_copy_variants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_copy_variants"
    ADD CONSTRAINT "sms_copy_variants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: sms_messages sms_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."sms_conversations"("id") ON DELETE CASCADE;


--
-- Name: sms_messages sms_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_messages"
    ADD CONSTRAINT "sms_messages_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;


--
-- Name: sms_variant_assignments sms_variant_assignments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_variant_assignments"
    ADD CONSTRAINT "sms_variant_assignments_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id");


--
-- Name: sms_variant_assignments sms_variant_assignments_variant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."sms_variant_assignments"
    ADD CONSTRAINT "sms_variant_assignments_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "public"."sms_copy_variants"("id") ON DELETE CASCADE;


--
-- Name: spending_logs spending_logs_broadcast_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_logs"
    ADD CONSTRAINT "spending_logs_broadcast_id_fkey" FOREIGN KEY ("broadcast_id") REFERENCES "public"."voice_broadcasts"("id") ON DELETE SET NULL;


--
-- Name: spending_logs spending_logs_call_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_logs"
    ADD CONSTRAINT "spending_logs_call_log_id_fkey" FOREIGN KEY ("call_log_id") REFERENCES "public"."call_logs"("id") ON DELETE SET NULL;


--
-- Name: spending_logs spending_logs_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_logs"
    ADD CONSTRAINT "spending_logs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;


--
-- Name: spending_summaries spending_summaries_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."spending_summaries"
    ADD CONSTRAINT "spending_summaries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;


--
-- Name: system_settings system_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."system_settings"
    ADD CONSTRAINT "system_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: telnyx_assistants telnyx_assistants_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_assistants"
    ADD CONSTRAINT "telnyx_assistants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");


--
-- Name: telnyx_conversation_insights telnyx_conversation_insights_call_log_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_conversation_insights"
    ADD CONSTRAINT "telnyx_conversation_insights_call_log_id_fkey" FOREIGN KEY ("call_log_id") REFERENCES "public"."call_logs"("id");


--
-- Name: telnyx_conversation_insights telnyx_conversation_insights_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_conversation_insights"
    ADD CONSTRAINT "telnyx_conversation_insights_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id");


--
-- Name: telnyx_scheduled_events telnyx_scheduled_events_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_scheduled_events"
    ADD CONSTRAINT "telnyx_scheduled_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id");


--
-- Name: telnyx_scheduled_events telnyx_scheduled_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."telnyx_scheduled_events"
    ADD CONSTRAINT "telnyx_scheduled_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id");


--
-- Name: user_credentials user_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_credentials"
    ADD CONSTRAINT "user_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: user_feature_flags user_feature_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_feature_flags"
    ADD CONSTRAINT "user_feature_flags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


--
-- Name: voice_broadcasts voice_broadcasts_telnyx_assistant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voice_broadcasts"
    ADD CONSTRAINT "voice_broadcasts_telnyx_assistant_id_fkey" FOREIGN KEY ("telnyx_assistant_id") REFERENCES "public"."telnyx_assistants"("id");


--
-- Name: voicemail_callback_tracking voicemail_callback_tracking_callback_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voicemail_callback_tracking"
    ADD CONSTRAINT "voicemail_callback_tracking_callback_call_id_fkey" FOREIGN KEY ("callback_call_id") REFERENCES "public"."call_logs"("id") ON DELETE SET NULL;


--
-- Name: voicemail_callback_tracking voicemail_callback_tracking_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voicemail_callback_tracking"
    ADD CONSTRAINT "voicemail_callback_tracking_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE CASCADE;


--
-- Name: voicemail_callback_tracking voicemail_callback_tracking_voicemail_analytics_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voicemail_callback_tracking"
    ADD CONSTRAINT "voicemail_callback_tracking_voicemail_analytics_id_fkey" FOREIGN KEY ("voicemail_analytics_id") REFERENCES "public"."voicemail_analytics"("id") ON DELETE SET NULL;


--
-- Name: voicemail_callback_tracking voicemail_callback_tracking_voicemail_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."voicemail_callback_tracking"
    ADD CONSTRAINT "voicemail_callback_tracking_voicemail_call_id_fkey" FOREIGN KEY ("voicemail_call_id") REFERENCES "public"."call_logs"("id") ON DELETE SET NULL;


--
-- Name: workflow_steps workflow_steps_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."campaign_workflows"("id") ON DELETE CASCADE;


--
-- Name: workflow_test_logs workflow_test_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workflow_test_logs"
    ADD CONSTRAINT "workflow_test_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: agent_pricing Admins can manage agent pricing; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can manage agent pricing" ON "public"."agent_pricing" USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE (("organization_users"."user_id" = "auth"."uid"()) AND ("organization_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: organization_credits Admins can update own org credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can update own org credits" ON "public"."organization_credits" USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE (("organization_users"."user_id" = "auth"."uid"()) AND ("organization_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: edge_function_errors Admins can view all edge function errors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view all edge function errors" ON "public"."edge_function_errors" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"public"."app_role")))));


--
-- Name: system_health_logs Admins can view system health logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Admins can view system health logs" ON "public"."system_health_logs" FOR SELECT USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));


--
-- Name: phone_number_use_types Allow read access to phone_number_use_types; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Allow read access to phone_number_use_types" ON "public"."phone_number_use_types" FOR SELECT TO "authenticated" USING (true);


--
-- Name: pricing_tiers Anyone can view pricing tiers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Anyone can view pricing tiers" ON "public"."pricing_tiers" FOR SELECT USING (true);


--
-- Name: organizations Authenticated users can create organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Authenticated users can create organizations" ON "public"."organizations" FOR INSERT WITH CHECK (("auth"."uid"() IS NOT NULL));


--
-- Name: demo_sessions Block authenticated user reads of demo_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Block authenticated user reads of demo_sessions" ON "public"."demo_sessions" AS RESTRICTIVE FOR SELECT TO "authenticated", "anon" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: organization_users Org admins can add members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org admins can add members" ON "public"."organization_users" FOR INSERT WITH CHECK (("public"."is_org_admin"("organization_id") OR (("auth"."uid"() = "user_id") AND ("role" = 'owner'::"text"))));


--
-- Name: organization_users Org admins can remove members; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org admins can remove members" ON "public"."organization_users" FOR DELETE USING ("public"."is_org_admin"("organization_id"));


--
-- Name: organization_users Org admins can update member roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org admins can update member roles" ON "public"."organization_users" FOR UPDATE USING ("public"."is_org_admin"("organization_id"));


--
-- Name: organizations Org admins can update their organization; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Org admins can update their organization" ON "public"."organizations" FOR UPDATE USING ("public"."is_org_admin"("id"));


--
-- Name: system_alerts Service role can insert alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can insert alerts" ON "public"."system_alerts" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: system_health_logs Service role can insert health logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can insert health logs" ON "public"."system_health_logs" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: daily_reports Service role can insert reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can insert reports" ON "public"."daily_reports" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: rotation_history Service role can insert rotation history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can insert rotation history" ON "public"."rotation_history" FOR INSERT WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: ml_learning_data Service role can manage all learning data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage all learning data" ON "public"."ml_learning_data" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: user_roles Service role can manage roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can manage roles" ON "public"."user_roles" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: daily_reports Service role can update reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role can update reports" ON "public"."daily_reports" FOR UPDATE USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: demo_sessions Service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access" ON "public"."demo_sessions" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: retell_transfer_context Service role full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access" ON "public"."retell_transfer_context" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: demo_agent_config Service role full access to demo_agent_config; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access to demo_agent_config" ON "public"."demo_agent_config" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: demo_call_logs Service role full access to demo_call_logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access to demo_call_logs" ON "public"."demo_call_logs" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: demo_sessions Service role full access to demo_sessions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access to demo_sessions" ON "public"."demo_sessions" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: ghl_pending_updates Service role full access to ghl_pending_updates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role full access to ghl_pending_updates" ON "public"."ghl_pending_updates" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));


--
-- Name: guardian_alerts Service role has full access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access" ON "public"."guardian_alerts" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: retell_agents Service role has full access to retell_agents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role has full access to retell_agents" ON "public"."retell_agents" USING (("auth"."role"() = 'service_role'::"text"));


--
-- Name: calendar_tool_invocations Service role or self can insert calendar invocations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Service role or self can insert calendar invocations" ON "public"."calendar_tool_invocations" FOR INSERT WITH CHECK (((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text") OR ("auth"."uid"() = "user_id")));


--
-- Name: campaign_leads Users can add their own leads to their campaigns; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add their own leads to their campaigns" ON "public"."campaign_leads" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "campaign_leads"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."leads"
  WHERE (("leads"."id" = "campaign_leads"."lead_id") AND ("leads"."user_id" = "auth"."uid"()))))));


--
-- Name: lead_list_memberships Users can add to their lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can add to their lists" ON "public"."lead_list_memberships" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."smart_lists"
  WHERE (("smart_lists"."id" = "lead_list_memberships"."smart_list_id") AND ("smart_lists"."user_id" = "auth"."uid"())))));


--
-- Name: telnyx_assistants Users can create own telnyx assistants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create own telnyx assistants" ON "public"."telnyx_assistants" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_insight_templates Users can create own telnyx insight templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create own telnyx insight templates" ON "public"."telnyx_insight_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_knowledge_bases Users can create own telnyx knowledge bases; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create own telnyx knowledge bases" ON "public"."telnyx_knowledge_bases" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_scheduled_events Users can create own telnyx scheduled events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create own telnyx scheduled events" ON "public"."telnyx_scheduled_events" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_settings Users can create own telnyx settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create own telnyx settings" ON "public"."telnyx_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ghl_sync_settings Users can create their own GHL sync settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own GHL sync settings" ON "public"."ghl_sync_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sip_trunk_configs Users can create their own SIP configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own SIP configs" ON "public"."sip_trunk_configs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: campaign_automation_rules Users can create their own automation rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own automation rules" ON "public"."campaign_automation_rules" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: retell_branded_calls Users can create their own branded calls; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own branded calls" ON "public"."retell_branded_calls" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: retell_business_profiles Users can create their own business profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own business profiles" ON "public"."retell_business_profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sms_context_history Users can create their own context; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own context" ON "public"."sms_context_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sms_conversations Users can create their own conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own conversations" ON "public"."sms_conversations" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: agent_decisions Users can create their own decisions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own decisions" ON "public"."agent_decisions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: dispositions Users can create their own dispositions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own dispositions" ON "public"."dispositions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: lead_pipeline_positions Users can create their own lead positions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own lead positions" ON "public"."lead_pipeline_positions" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sms_messages Users can create their own messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own messages" ON "public"."sms_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: pipeline_boards Users can create their own pipeline boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own pipeline boards" ON "public"."pipeline_boards" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ai_sms_settings Users can create their own settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own settings" ON "public"."ai_sms_settings" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: smart_lists Users can create their own smart lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own smart lists" ON "public"."smart_lists" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: retell_verified_numbers Users can create their own verified numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can create their own verified numbers" ON "public"."retell_verified_numbers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: agent_improvement_history Users can delete own agent history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own agent history" ON "public"."agent_improvement_history" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can delete own guardian alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own guardian alerts" ON "public"."guardian_alerts" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: lj_memory Users can delete own memories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own memories" ON "public"."lj_memory" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_assistants Users can delete own telnyx assistants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own telnyx assistants" ON "public"."telnyx_assistants" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_insight_templates Users can delete own telnyx insight templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own telnyx insight templates" ON "public"."telnyx_insight_templates" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_knowledge_bases Users can delete own telnyx knowledge bases; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own telnyx knowledge bases" ON "public"."telnyx_knowledge_bases" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_scheduled_events Users can delete own telnyx scheduled events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete own telnyx scheduled events" ON "public"."telnyx_scheduled_events" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: ghl_sync_settings Users can delete their own GHL sync settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own GHL sync settings" ON "public"."ghl_sync_settings" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: sip_trunk_configs Users can delete their own SIP configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own SIP configs" ON "public"."sip_trunk_configs" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_automation_rules Users can delete their own automation rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own automation rules" ON "public"."campaign_automation_rules" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_business_profiles Users can delete their own business profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own business profiles" ON "public"."retell_business_profiles" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: sms_conversations Users can delete their own conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own conversations" ON "public"."sms_conversations" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_credentials Users can delete their own credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own credentials" ON "public"."user_credentials" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: dispositions Users can delete their own dispositions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own dispositions" ON "public"."dispositions" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_pipeline_positions Users can delete their own lead positions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own lead positions" ON "public"."lead_pipeline_positions" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_priority_scores Users can delete their own lead priority scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own lead priority scores" ON "public"."lead_priority_scores" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: phone_numbers Users can delete their own phone numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own phone numbers" ON "public"."phone_numbers" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: pipeline_boards Users can delete their own pipeline boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own pipeline boards" ON "public"."pipeline_boards" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_agents Users can delete their own retell agents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own retell agents" ON "public"."retell_agents" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: smart_lists Users can delete their own smart lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can delete their own smart lists" ON "public"."smart_lists" FOR DELETE USING (("auth"."uid"() = "user_id"));


--
-- Name: agent_improvement_history Users can insert own agent history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own agent history" ON "public"."agent_improvement_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ghl_pending_updates Users can insert own ghl_pending_updates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own ghl_pending_updates" ON "public"."ghl_pending_updates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can insert own guardian alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own guardian alerts" ON "public"."guardian_alerts" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: lj_memory Users can insert own memories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own memories" ON "public"."lj_memory" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: retell_transfer_context Users can insert own transfer context; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert own transfer context" ON "public"."retell_transfer_context" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can insert their own alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own alerts" ON "public"."guardian_alerts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: autonomous_goals Users can insert their own autonomous goals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own autonomous goals" ON "public"."autonomous_goals" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: user_credentials Users can insert their own credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own credentials" ON "public"."user_credentials" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: predictive_dialing_stats Users can insert their own dialing stats; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own dialing stats" ON "public"."predictive_dialing_stats" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: lead_priority_scores Users can insert their own lead priority scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own lead priority scores" ON "public"."lead_priority_scores" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ml_learning_data Users can insert their own learning data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own learning data" ON "public"."ml_learning_data" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: learning_outcomes Users can insert their own learning outcomes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own learning outcomes" ON "public"."learning_outcomes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: phone_numbers Users can insert their own phone numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own phone numbers" ON "public"."phone_numbers" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: retell_agents Users can insert their own retell agents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own retell agents" ON "public"."retell_agents" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: rotation_history Users can insert their own rotation history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own rotation history" ON "public"."rotation_history" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: spending_logs Users can insert their own spending logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own spending logs" ON "public"."spending_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_conversation_insights Users can insert their own telnyx insights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own telnyx insights" ON "public"."telnyx_conversation_insights" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: workflow_test_logs Users can insert their own test logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can insert their own test logs" ON "public"."workflow_test_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: broadcast_queue Users can manage their broadcast queues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their broadcast queues" ON "public"."broadcast_queue" USING ((EXISTS ( SELECT 1
   FROM "public"."voice_broadcasts"
  WHERE (("voice_broadcasts"."id" = "broadcast_queue"."broadcast_id") AND ("voice_broadcasts"."user_id" = "auth"."uid"())))));


--
-- Name: dialing_queues Users can manage their campaign queues; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their campaign queues" ON "public"."dialing_queues" USING (((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "dialing_queues"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))) AND (EXISTS ( SELECT 1
   FROM "public"."leads"
  WHERE (("leads"."id" = "dialing_queues"."lead_id") AND ("leads"."user_id" = "auth"."uid"()))))));


--
-- Name: disposition_auto_actions Users can manage their disposition actions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their disposition actions" ON "public"."disposition_auto_actions" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_workflow_progress Users can manage their lead progress; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their lead progress" ON "public"."lead_workflow_progress" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_workflow_generations Users can manage their own AI generations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own AI generations" ON "public"."ai_workflow_generations" USING (("auth"."uid"() = "user_id"));


--
-- Name: dnc_list Users can manage their own DNC list; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own DNC list" ON "public"."dnc_list" USING (("auth"."uid"() = "user_id"));


--
-- Name: yellowstone_settings Users can manage their own Yellowstone settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own Yellowstone settings" ON "public"."yellowstone_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: active_ai_transfers Users can manage their own active transfers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own active transfers" ON "public"."active_ai_transfers" USING (("auth"."uid"() = "user_id"));


--
-- Name: calendar_appointments Users can manage their own appointments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own appointments" ON "public"."calendar_appointments" USING (("auth"."uid"() = "user_id"));


--
-- Name: autonomous_settings Users can manage their own autonomous settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own autonomous settings" ON "public"."autonomous_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: calendar_availability Users can manage their own availability; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own availability" ON "public"."calendar_availability" USING (("auth"."uid"() = "user_id"));


--
-- Name: daily_battle_plans Users can manage their own battle plans; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own battle plans" ON "public"."daily_battle_plans" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: strategic_briefings Users can manage their own briefings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own briefings" ON "public"."strategic_briefings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: voice_broadcasts Users can manage their own broadcasts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own broadcasts" ON "public"."voice_broadcasts" USING (("auth"."uid"() = "user_id"));


--
-- Name: budget_alerts Users can manage their own budget alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own budget alerts" ON "public"."budget_alerts" USING (("auth"."uid"() = "user_id"));


--
-- Name: budget_settings Users can manage their own budget settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own budget settings" ON "public"."budget_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: calendar_integrations Users can manage their own calendar integrations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own calendar integrations" ON "public"."calendar_integrations" USING (("auth"."uid"() = "user_id"));


--
-- Name: call_logs Users can manage their own call logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own call logs" ON "public"."call_logs" USING (("auth"."uid"() = "user_id"));


--
-- Name: call_opener_logs Users can manage their own call opener logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own call opener logs" ON "public"."call_opener_logs" USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_leads Users can manage their own campaign leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own campaign leads" ON "public"."campaign_leads" USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "campaign_leads"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));


--
-- Name: campaign_phone_pools Users can manage their own campaign phone pools; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own campaign phone pools" ON "public"."campaign_phone_pools" USING (("auth"."uid"() = "user_id"));


--
-- Name: campaigns Users can manage their own campaigns; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own campaigns" ON "public"."campaigns" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_chatbot_settings Users can manage their own chatbot settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own chatbot settings" ON "public"."ai_chatbot_settings" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: advanced_dialer_settings Users can manage their own dialer settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own dialer settings" ON "public"."advanced_dialer_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: disposition_metrics Users can manage their own disposition metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own disposition metrics" ON "public"."disposition_metrics" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ai_feedback Users can manage their own feedback; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own feedback" ON "public"."ai_feedback" USING (("auth"."uid"() = "user_id"));


--
-- Name: insight_generated_rules Users can manage their own generated rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own generated rules" ON "public"."insight_generated_rules" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: ai_daily_insights Users can manage their own insights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own insights" ON "public"."ai_daily_insights" USING (("auth"."uid"() = "user_id"));


--
-- Name: strategic_insights Users can manage their own insights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own insights" ON "public"."strategic_insights" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: leads Users can manage their own leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own leads" ON "public"."leads" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_learning Users can manage their own learning data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own learning data" ON "public"."ai_learning" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_nudge_tracking Users can manage their own nudge tracking; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own nudge tracking" ON "public"."lead_nudge_tracking" USING (("auth"."uid"() = "user_id"));


--
-- Name: number_orders Users can manage their own number orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own number orders" ON "public"."number_orders" USING (("auth"."uid"() = "user_id"));


--
-- Name: opener_analytics Users can manage their own opener analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own opener analytics" ON "public"."opener_analytics" USING (("auth"."uid"() = "user_id"));


--
-- Name: phone_providers Users can manage their own phone providers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own phone providers" ON "public"."phone_providers" USING (("auth"."uid"() = "user_id"));


--
-- Name: reachability_events Users can manage their own reachability events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own reachability events" ON "public"."reachability_events" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_reachability_scores Users can manage their own reachability scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own reachability scores" ON "public"."lead_reachability_scores" USING (("auth"."uid"() = "user_id"));


--
-- Name: rotation_settings Users can manage their own rotation settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own rotation settings" ON "public"."rotation_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_scoring_settings Users can manage their own scoring settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own scoring settings" ON "public"."lead_scoring_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: follow_up_sequences Users can manage their own sequences; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own sequences" ON "public"."follow_up_sequences" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_session_memory Users can manage their own session memory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own session memory" ON "public"."ai_session_memory" USING (("auth"."uid"() = "user_id"));


--
-- Name: spending_summaries Users can manage their own spending summaries; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own spending summaries" ON "public"."spending_summaries" USING (("auth"."uid"() = "user_id"));


--
-- Name: system_settings Users can manage their own system settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own system settings" ON "public"."system_settings" USING (("auth"."uid"() = "user_id"));


--
-- Name: voicemail_analytics Users can manage their own voicemail analytics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own voicemail analytics" ON "public"."voicemail_analytics" USING (("auth"."uid"() = "user_id"));


--
-- Name: voicemail_callback_tracking Users can manage their own voicemail callback tracking; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own voicemail callback tracking" ON "public"."voicemail_callback_tracking" USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_workflows Users can manage their own workflows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their own workflows" ON "public"."campaign_workflows" USING (("auth"."uid"() = "user_id"));


--
-- Name: scheduled_follow_ups Users can manage their scheduled follow-ups; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their scheduled follow-ups" ON "public"."scheduled_follow_ups" USING (("auth"."uid"() = "user_id"));


--
-- Name: sequence_steps Users can manage their sequence steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their sequence steps" ON "public"."sequence_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."follow_up_sequences"
  WHERE (("follow_up_sequences"."id" = "sequence_steps"."sequence_id") AND ("follow_up_sequences"."user_id" = "auth"."uid"())))));


--
-- Name: workflow_steps Users can manage their workflow steps; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can manage their workflow steps" ON "public"."workflow_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_workflows"
  WHERE (("campaign_workflows"."id" = "workflow_steps"."workflow_id") AND ("campaign_workflows"."user_id" = "auth"."uid"())))));


--
-- Name: user_feature_flags Users can read own feature flags; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own feature flags" ON "public"."user_feature_flags" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_transfer_context Users can read own transfer context; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can read own transfer context" ON "public"."retell_transfer_context" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_list_memberships Users can remove from their lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can remove from their lists" ON "public"."lead_list_memberships" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."smart_lists"
  WHERE (("smart_lists"."id" = "lead_list_memberships"."smart_list_id") AND ("smart_lists"."user_id" = "auth"."uid"())))));


--
-- Name: campaign_leads Users can remove their campaign leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can remove their campaign leads" ON "public"."campaign_leads" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "campaign_leads"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));


--
-- Name: agent_improvement_history Users can update own agent history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own agent history" ON "public"."agent_improvement_history" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: ghl_pending_updates Users can update own ghl_pending_updates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own ghl_pending_updates" ON "public"."ghl_pending_updates" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can update own guardian alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own guardian alerts" ON "public"."guardian_alerts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: lj_memory Users can update own memories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own memories" ON "public"."lj_memory" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_assistants Users can update own telnyx assistants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own telnyx assistants" ON "public"."telnyx_assistants" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_insight_templates Users can update own telnyx insight templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own telnyx insight templates" ON "public"."telnyx_insight_templates" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_knowledge_bases Users can update own telnyx knowledge bases; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own telnyx knowledge bases" ON "public"."telnyx_knowledge_bases" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_scheduled_events Users can update own telnyx scheduled events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own telnyx scheduled events" ON "public"."telnyx_scheduled_events" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_settings Users can update own telnyx settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update own telnyx settings" ON "public"."telnyx_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_leads Users can update their campaign leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their campaign leads" ON "public"."campaign_leads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "campaign_leads"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));


--
-- Name: ghl_sync_settings Users can update their own GHL sync settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own GHL sync settings" ON "public"."ghl_sync_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: sip_trunk_configs Users can update their own SIP configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own SIP configs" ON "public"."sip_trunk_configs" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can update their own alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own alerts" ON "public"."guardian_alerts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: system_alerts Users can update their own alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own alerts" ON "public"."system_alerts" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_automation_rules Users can update their own automation rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own automation rules" ON "public"."campaign_automation_rules" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: autonomous_goals Users can update their own autonomous goals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own autonomous goals" ON "public"."autonomous_goals" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_branded_calls Users can update their own branded calls; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own branded calls" ON "public"."retell_branded_calls" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_business_profiles Users can update their own business profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own business profiles" ON "public"."retell_business_profiles" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: sms_conversations Users can update their own conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own conversations" ON "public"."sms_conversations" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: user_credentials Users can update their own credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own credentials" ON "public"."user_credentials" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: dispositions Users can update their own dispositions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own dispositions" ON "public"."dispositions" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: edge_function_errors Users can update their own edge function errors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own edge function errors" ON "public"."edge_function_errors" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_pipeline_positions Users can update their own lead positions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own lead positions" ON "public"."lead_pipeline_positions" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_priority_scores Users can update their own lead priority scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own lead priority scores" ON "public"."lead_priority_scores" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: learning_outcomes Users can update their own learning outcomes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own learning outcomes" ON "public"."learning_outcomes" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: sms_messages Users can update their own messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own messages" ON "public"."sms_messages" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: phone_numbers Users can update their own phone numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own phone numbers" ON "public"."phone_numbers" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: pipeline_boards Users can update their own pipeline boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own pipeline boards" ON "public"."pipeline_boards" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_agents Users can update their own retell agents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own retell agents" ON "public"."retell_agents" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_sms_settings Users can update their own settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own settings" ON "public"."ai_sms_settings" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: smart_lists Users can update their own smart lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own smart lists" ON "public"."smart_lists" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_verified_numbers Users can update their own verified numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can update their own verified numbers" ON "public"."retell_verified_numbers" FOR UPDATE USING (("auth"."uid"() = "user_id"));


--
-- Name: organization_users Users can view members of their organizations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view members of their organizations" ON "public"."organization_users" FOR SELECT USING ("public"."user_in_organization"("organization_id"));


--
-- Name: lead_list_memberships Users can view memberships of their lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view memberships of their lists" ON "public"."lead_list_memberships" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."smart_lists"
  WHERE (("smart_lists"."id" = "lead_list_memberships"."smart_list_id") AND ("smart_lists"."user_id" = "auth"."uid"())))));


--
-- Name: organizations Users can view organizations they belong to; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view organizations they belong to" ON "public"."organizations" FOR SELECT USING ("public"."user_in_organization"("id"));


--
-- Name: agent_improvement_history Users can view own agent history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own agent history" ON "public"."agent_improvement_history" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: ghl_pending_updates Users can view own ghl_pending_updates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own ghl_pending_updates" ON "public"."ghl_pending_updates" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can view own guardian alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own guardian alerts" ON "public"."guardian_alerts" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: lj_memory Users can view own memories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own memories" ON "public"."lj_memory" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: agent_pricing Users can view own org agent pricing; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own org agent pricing" ON "public"."agent_pricing" FOR SELECT USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));


--
-- Name: organization_credits Users can view own org credits; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own org credits" ON "public"."organization_credits" FOR SELECT USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));


--
-- Name: credit_transactions Users can view own org transactions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own org transactions" ON "public"."credit_transactions" FOR SELECT USING (("organization_id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE ("organization_users"."user_id" = "auth"."uid"()))));


--
-- Name: telnyx_assistants Users can view own telnyx assistants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own telnyx assistants" ON "public"."telnyx_assistants" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_insight_templates Users can view own telnyx insight templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own telnyx insight templates" ON "public"."telnyx_insight_templates" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_knowledge_bases Users can view own telnyx knowledge bases; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own telnyx knowledge bases" ON "public"."telnyx_knowledge_bases" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_scheduled_events Users can view own telnyx scheduled events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own telnyx scheduled events" ON "public"."telnyx_scheduled_events" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_settings Users can view own telnyx settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view own telnyx settings" ON "public"."telnyx_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_leads Users can view their campaign leads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their campaign leads" ON "public"."campaign_leads" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."campaigns"
  WHERE (("campaigns"."id" = "campaign_leads"."campaign_id") AND ("campaigns"."user_id" = "auth"."uid"())))));


--
-- Name: ghl_sync_settings Users can view their own GHL sync settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own GHL sync settings" ON "public"."ghl_sync_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: sip_trunk_configs Users can view their own SIP configs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own SIP configs" ON "public"."sip_trunk_configs" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: guardian_alerts Users can view their own alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own alerts" ON "public"."guardian_alerts" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: system_alerts Users can view their own alerts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own alerts" ON "public"."system_alerts" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: campaign_automation_rules Users can view their own automation rules; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own automation rules" ON "public"."campaign_automation_rules" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: autonomous_goals Users can view their own autonomous goals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own autonomous goals" ON "public"."autonomous_goals" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_branded_calls Users can view their own branded calls; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own branded calls" ON "public"."retell_branded_calls" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_business_profiles Users can view their own business profiles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own business profiles" ON "public"."retell_business_profiles" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: calendar_tool_invocations Users can view their own calendar invocations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own calendar invocations" ON "public"."calendar_tool_invocations" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: sms_context_history Users can view their own context; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own context" ON "public"."sms_context_history" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: sms_conversations Users can view their own conversations; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own conversations" ON "public"."sms_conversations" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_credentials Users can view their own credentials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own credentials" ON "public"."user_credentials" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: agent_decisions Users can view their own decisions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own decisions" ON "public"."agent_decisions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: predictive_dialing_stats Users can view their own dialing stats; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own dialing stats" ON "public"."predictive_dialing_stats" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: dispositions Users can view their own dispositions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own dispositions" ON "public"."dispositions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: edge_function_errors Users can view their own edge function errors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own edge function errors" ON "public"."edge_function_errors" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_pipeline_positions Users can view their own lead positions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own lead positions" ON "public"."lead_pipeline_positions" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_priority_scores Users can view their own lead priority scores; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own lead priority scores" ON "public"."lead_priority_scores" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: ml_learning_data Users can view their own learning data; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own learning data" ON "public"."ml_learning_data" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: learning_outcomes Users can view their own learning outcomes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own learning outcomes" ON "public"."learning_outcomes" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: sms_messages Users can view their own messages; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own messages" ON "public"."sms_messages" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: phone_numbers Users can view their own phone numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own phone numbers" ON "public"."phone_numbers" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: pipeline_boards Users can view their own pipeline boards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own pipeline boards" ON "public"."pipeline_boards" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: daily_reports Users can view their own reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own reports" ON "public"."daily_reports" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_agents Users can view their own retell agents; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own retell agents" ON "public"."retell_agents" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: user_roles Users can view their own roles; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own roles" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: rotation_history Users can view their own rotation history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own rotation history" ON "public"."rotation_history" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_sms_settings Users can view their own settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own settings" ON "public"."ai_sms_settings" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: smart_lists Users can view their own smart lists; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own smart lists" ON "public"."smart_lists" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: spending_logs Users can view their own spending logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own spending logs" ON "public"."spending_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: telnyx_conversation_insights Users can view their own telnyx insights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own telnyx insights" ON "public"."telnyx_conversation_insights" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: workflow_test_logs Users can view their own test logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own test logs" ON "public"."workflow_test_logs" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: retell_verified_numbers Users can view their own verified numbers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users can view their own verified numbers" ON "public"."retell_verified_numbers" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: slack_users Users create their own slack mapping; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users create their own slack mapping" ON "public"."slack_users" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: slack_users Users delete their own slack mapping; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users delete their own slack mapping" ON "public"."slack_users" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: edge_function_errors Users insert their own edge function errors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users insert their own edge function errors" ON "public"."edge_function_errors" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = "auth"."uid"()));


--
-- Name: sms_copy_variants Users manage own SMS variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own SMS variants" ON "public"."sms_copy_variants" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_action_queue Users manage own action queue; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own action queue" ON "public"."ai_action_queue" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: optimal_calling_windows Users manage own calling windows; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own calling windows" ON "public"."optimal_calling_windows" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: churn_risk_events Users manage own churn events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own churn events" ON "public"."churn_risk_events" USING (("auth"."uid"() = "user_id"));


--
-- Name: disposition_values Users manage own disposition values; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own disposition values" ON "public"."disposition_values" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_journey_state Users manage own lead journeys; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own lead journeys" ON "public"."lead_journey_state" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: message_effectiveness Users manage own message effectiveness; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own message effectiveness" ON "public"."message_effectiveness" USING (("auth"."uid"() = "user_id"));


--
-- Name: ml_models Users manage own models; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own models" ON "public"."ml_models" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_operational_memory Users manage own operational memory; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own operational memory" ON "public"."ai_operational_memory" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: adaptive_pacing Users manage own pacing; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own pacing" ON "public"."adaptive_pacing" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: followup_playbook Users manage own playbooks; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own playbooks" ON "public"."followup_playbook" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: lead_predictions Users manage own predictions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own predictions" ON "public"."lead_predictions" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_score_outcomes Users manage own score outcomes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own score outcomes" ON "public"."lead_score_outcomes" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: lead_scoring_weights Users manage own scoring weights; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own scoring weights" ON "public"."lead_scoring_weights" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: agent_script_variants Users manage own script variants; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own script variants" ON "public"."agent_script_variants" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: segment_roi_metrics Users manage own segment ROI; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own segment ROI" ON "public"."segment_roi_metrics" USING (("auth"."uid"() = "user_id"));


--
-- Name: ai_campaign_strategies Users manage own strategies; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own strategies" ON "public"."ai_campaign_strategies" USING (("auth"."uid"() = "user_id"));


--
-- Name: sequence_templates Users manage own templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own templates" ON "public"."sequence_templates" USING ((("auth"."uid"() = "user_id") OR ("is_system_template" = true)));


--
-- Name: call_variant_assignments Users manage own variant assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users manage own variant assignments" ON "public"."call_variant_assignments" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: sms_variant_assignments Users see own SMS assignments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own SMS assignments" ON "public"."sms_variant_assignments" USING (("variant_id" IN ( SELECT "sms_copy_variants"."id"
   FROM "public"."sms_copy_variants"
  WHERE ("sms_copy_variants"."user_id" = "auth"."uid"()))));


--
-- Name: funnel_snapshots Users see own funnel snapshots; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own funnel snapshots" ON "public"."funnel_snapshots" USING (("auth"."uid"() = "user_id"));


--
-- Name: lead_intent_signals Users see own intent signals; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own intent signals" ON "public"."lead_intent_signals" USING (("auth"."uid"() = "user_id"));


--
-- Name: number_health_metrics Users see own number health; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own number health" ON "public"."number_health_metrics" USING (("auth"."uid"() = "user_id"));


--
-- Name: playbook_optimization_log Users see own optimization log; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own optimization log" ON "public"."playbook_optimization_log" USING (("auth"."uid"() = "user_id"));


--
-- Name: playbook_performance Users see own playbook performance; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see own playbook performance" ON "public"."playbook_performance" USING (("auth"."uid"() = "user_id"));


--
-- Name: sequence_templates Users see system and own templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users see system and own templates" ON "public"."sequence_templates" FOR SELECT USING ((("is_system_template" = true) OR ("auth"."uid"() = "user_id")));


--
-- Name: journey_event_log Users view own journey events; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view own journey events" ON "public"."journey_event_log" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: pacing_history Users view own pacing history; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view own pacing history" ON "public"."pacing_history" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: slack_users Users view their own slack mapping; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "Users view their own slack mapping" ON "public"."slack_users" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));


--
-- Name: active_ai_transfers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."active_ai_transfers" ENABLE ROW LEVEL SECURITY;

--
-- Name: adaptive_pacing; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."adaptive_pacing" ENABLE ROW LEVEL SECURITY;

--
-- Name: advanced_dialer_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."advanced_dialer_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_decisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agent_decisions" ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_improvement_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agent_improvement_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_pricing; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agent_pricing" ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_script_variants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."agent_script_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_action_queue; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_action_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_campaign_strategies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_campaign_strategies" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_chatbot_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_chatbot_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_daily_insights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_daily_insights" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_feedback; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_feedback" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_learning; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_learning" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_operational_memory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_operational_memory" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_session_memory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_session_memory" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_sms_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_sms_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_workflow_generations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ai_workflow_generations" ENABLE ROW LEVEL SECURITY;

--
-- Name: api_key_audit_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."api_key_audit_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."api_keys" ENABLE ROW LEVEL SECURITY;

--
-- Name: autonomous_goals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."autonomous_goals" ENABLE ROW LEVEL SECURITY;

--
-- Name: autonomous_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."autonomous_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: broadcast_queue; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."broadcast_queue" ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_alerts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."budget_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: budget_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."budget_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_appointments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."calendar_appointments" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_availability; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."calendar_availability" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_integrations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."calendar_integrations" ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_tool_invocations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."calendar_tool_invocations" ENABLE ROW LEVEL SECURITY;

--
-- Name: call_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."call_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: call_opener_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."call_opener_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: call_variant_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."call_variant_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_automation_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."campaign_automation_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_leads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."campaign_leads" ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_phone_pools; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."campaign_phone_pools" ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_workflows; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."campaign_workflows" ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;

--
-- Name: churn_risk_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."churn_risk_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_transactions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."credit_transactions" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_battle_plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."daily_battle_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: daily_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."daily_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_agent_config; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."demo_agent_config" ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_call_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."demo_call_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: demo_sessions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."demo_sessions" ENABLE ROW LEVEL SECURITY;

--
-- Name: dialing_queues; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."dialing_queues" ENABLE ROW LEVEL SECURITY;

--
-- Name: disposition_auto_actions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."disposition_auto_actions" ENABLE ROW LEVEL SECURITY;

--
-- Name: disposition_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."disposition_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: disposition_values; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."disposition_values" ENABLE ROW LEVEL SECURITY;

--
-- Name: dispositions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."dispositions" ENABLE ROW LEVEL SECURITY;

--
-- Name: dnc_list; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."dnc_list" ENABLE ROW LEVEL SECURITY;

--
-- Name: edge_function_errors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."edge_function_errors" ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_up_sequences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."follow_up_sequences" ENABLE ROW LEVEL SECURITY;

--
-- Name: followup_playbook; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."followup_playbook" ENABLE ROW LEVEL SECURITY;

--
-- Name: funnel_snapshots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."funnel_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: ghl_pending_updates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ghl_pending_updates" ENABLE ROW LEVEL SECURITY;

--
-- Name: ghl_sync_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ghl_sync_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: guardian_alerts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."guardian_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: insight_generated_rules; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."insight_generated_rules" ENABLE ROW LEVEL SECURITY;

--
-- Name: journey_event_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."journey_event_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_intent_signals; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_intent_signals" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_journey_state; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_journey_state" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_list_memberships; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_list_memberships" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_nudge_tracking; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_nudge_tracking" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_pipeline_positions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_pipeline_positions" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_predictions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_predictions" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_priority_scores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_priority_scores" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_reachability_scores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_reachability_scores" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_score_outcomes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_score_outcomes" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_scoring_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_scoring_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_scoring_weights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_scoring_weights" ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_workflow_progress; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lead_workflow_progress" ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."leads" ENABLE ROW LEVEL SECURITY;

--
-- Name: learning_outcomes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."learning_outcomes" ENABLE ROW LEVEL SECURITY;

--
-- Name: lj_memory; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."lj_memory" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_effectiveness; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_effectiveness" ENABLE ROW LEVEL SECURITY;

--
-- Name: ml_learning_data; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ml_learning_data" ENABLE ROW LEVEL SECURITY;

--
-- Name: ml_models; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ml_models" ENABLE ROW LEVEL SECURITY;

--
-- Name: number_health_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."number_health_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: number_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."number_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: opener_analytics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."opener_analytics" ENABLE ROW LEVEL SECURITY;

--
-- Name: optimal_calling_windows; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."optimal_calling_windows" ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations org_admin_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "org_admin_update" ON "public"."organizations" FOR UPDATE USING (("id" IN ( SELECT "organization_users"."organization_id"
   FROM "public"."organization_users"
  WHERE (("organization_users"."user_id" = "auth"."uid"()) AND ("organization_users"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));


--
-- Name: organization_credits; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."organization_credits" ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."organization_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;

--
-- Name: pacing_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pacing_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_number_use_types; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."phone_number_use_types" ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_numbers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."phone_numbers" ENABLE ROW LEVEL SECURITY;

--
-- Name: phone_providers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."phone_providers" ENABLE ROW LEVEL SECURITY;

--
-- Name: pipeline_boards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pipeline_boards" ENABLE ROW LEVEL SECURITY;

--
-- Name: playbook_optimization_log; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."playbook_optimization_log" ENABLE ROW LEVEL SECURITY;

--
-- Name: playbook_performance; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."playbook_performance" ENABLE ROW LEVEL SECURITY;

--
-- Name: predictive_dialing_stats; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."predictive_dialing_stats" ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_tiers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."pricing_tiers" ENABLE ROW LEVEL SECURITY;

--
-- Name: reachability_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."reachability_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: retell_agents; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."retell_agents" ENABLE ROW LEVEL SECURITY;

--
-- Name: retell_branded_calls; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."retell_branded_calls" ENABLE ROW LEVEL SECURITY;

--
-- Name: retell_business_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."retell_business_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: retell_transfer_context; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."retell_transfer_context" ENABLE ROW LEVEL SECURITY;

--
-- Name: retell_verified_numbers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."retell_verified_numbers" ENABLE ROW LEVEL SECURITY;

--
-- Name: rotation_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rotation_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: rotation_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."rotation_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: scheduled_follow_ups; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."scheduled_follow_ups" ENABLE ROW LEVEL SECURITY;

--
-- Name: segment_roi_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."segment_roi_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: sequence_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sequence_steps" ENABLE ROW LEVEL SECURITY;

--
-- Name: sequence_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sequence_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: sip_trunk_configs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sip_trunk_configs" ENABLE ROW LEVEL SECURITY;

--
-- Name: slack_users; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."slack_users" ENABLE ROW LEVEL SECURITY;

--
-- Name: smart_lists; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."smart_lists" ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_context_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sms_context_history" ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_conversations; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sms_conversations" ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_copy_variants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sms_copy_variants" ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sms_messages" ENABLE ROW LEVEL SECURITY;

--
-- Name: sms_variant_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."sms_variant_assignments" ENABLE ROW LEVEL SECURITY;

--
-- Name: spending_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."spending_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: spending_summaries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."spending_summaries" ENABLE ROW LEVEL SECURITY;

--
-- Name: strategic_briefings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."strategic_briefings" ENABLE ROW LEVEL SECURITY;

--
-- Name: strategic_insights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."strategic_insights" ENABLE ROW LEVEL SECURITY;

--
-- Name: system_alerts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."system_alerts" ENABLE ROW LEVEL SECURITY;

--
-- Name: system_health_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."system_health_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."system_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: telnyx_assistants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."telnyx_assistants" ENABLE ROW LEVEL SECURITY;

--
-- Name: telnyx_conversation_insights; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."telnyx_conversation_insights" ENABLE ROW LEVEL SECURITY;

--
-- Name: telnyx_insight_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."telnyx_insight_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: telnyx_knowledge_bases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."telnyx_knowledge_bases" ENABLE ROW LEVEL SECURITY;

--
-- Name: telnyx_scheduled_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."telnyx_scheduled_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: telnyx_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."telnyx_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_credentials; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_credentials" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_feature_flags; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_feature_flags" ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys users_manage_own_api_keys; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users_manage_own_api_keys" ON "public"."api_keys" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));


--
-- Name: api_key_audit_log users_read_own_api_audit; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "users_read_own_api_audit" ON "public"."api_key_audit_log" FOR SELECT USING (("auth"."uid"() = "user_id"));


--
-- Name: voice_broadcasts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."voice_broadcasts" ENABLE ROW LEVEL SECURITY;

--
-- Name: voicemail_analytics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."voicemail_analytics" ENABLE ROW LEVEL SECURITY;

--
-- Name: voicemail_callback_tracking; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."voicemail_callback_tracking" ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_steps; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;

--
-- Name: workflow_test_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workflow_test_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: yellowstone_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."yellowstone_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "add_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_transaction_type" "text", "p_description" "text", "p_idempotency_key" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."add_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_transaction_type" "text", "p_description" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_transaction_type" "text", "p_description" "text", "p_idempotency_key" "text") TO "service_role";


--
-- Name: FUNCTION "api_keys_touch_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."api_keys_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."api_keys_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."api_keys_touch_updated_at"() TO "service_role";


--
-- Name: FUNCTION "auto_route_to_contacting"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."auto_route_to_contacting"() TO "anon";
GRANT ALL ON FUNCTION "public"."auto_route_to_contacting"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auto_route_to_contacting"() TO "service_role";


--
-- Name: FUNCTION "calculate_agent_base_cost"("p_llm_model" "text", "p_voice_provider" "text", "p_has_knowledge_base" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_agent_base_cost"("p_llm_model" "text", "p_voice_provider" "text", "p_has_knowledge_base" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_agent_base_cost"("p_llm_model" "text", "p_voice_provider" "text", "p_has_knowledge_base" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_agent_base_cost"("p_llm_model" "text", "p_voice_provider" "text", "p_has_knowledge_base" boolean) TO "service_role";


--
-- Name: FUNCTION "calculate_time_wasted_score"("p_duration" integer, "p_amd_result" "text", "p_outcome" "text", "p_auto_disposition" "text", "p_answered_at" timestamp with time zone, "p_created_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."calculate_time_wasted_score"("p_duration" integer, "p_amd_result" "text", "p_outcome" "text", "p_auto_disposition" "text", "p_answered_at" timestamp with time zone, "p_created_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_time_wasted_score"("p_duration" integer, "p_amd_result" "text", "p_outcome" "text", "p_auto_disposition" "text", "p_answered_at" timestamp with time zone, "p_created_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_time_wasted_score"("p_duration" integer, "p_amd_result" "text", "p_outcome" "text", "p_auto_disposition" "text", "p_answered_at" timestamp with time zone, "p_created_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "calibrate_lead_scoring_weights"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."calibrate_lead_scoring_weights"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."calibrate_lead_scoring_weights"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "check_and_reset_daily_calls"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."check_and_reset_daily_calls"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_and_reset_daily_calls"() TO "service_role";


--
-- Name: FUNCTION "check_credit_balance"("p_organization_id" "uuid", "p_minutes_needed" numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."check_credit_balance"("p_organization_id" "uuid", "p_minutes_needed" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_credit_balance"("p_organization_id" "uuid", "p_minutes_needed" numeric) TO "service_role";


--
-- Name: FUNCTION "chi_square_2x2"("a" integer, "b" integer, "c" integer, "d" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."chi_square_2x2"("a" integer, "b" integer, "c" integer, "d" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."chi_square_2x2"("a" integer, "b" integer, "c" integer, "d" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."chi_square_2x2"("a" integer, "b" integer, "c" integer, "d" integer) TO "service_role";


--
-- Name: TABLE "dialing_queues"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dialing_queues" TO "anon";
GRANT ALL ON TABLE "public"."dialing_queues" TO "authenticated";
GRANT ALL ON TABLE "public"."dialing_queues" TO "service_role";


--
-- Name: FUNCTION "claim_pending_dispatches"("p_campaign_ids" "uuid"[], "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."claim_pending_dispatches"("p_campaign_ids" "uuid"[], "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_pending_dispatches"("p_campaign_ids" "uuid"[], "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_pending_dispatches"("p_campaign_ids" "uuid"[], "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "cleanup_old_guardian_alerts"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."cleanup_old_guardian_alerts"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cleanup_old_guardian_alerts"() TO "service_role";


--
-- Name: FUNCTION "create_user_feature_flags"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_user_feature_flags"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_user_feature_flags"() TO "service_role";


--
-- Name: FUNCTION "decrement_daily_calls"("phone_last_10" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."decrement_daily_calls"("phone_last_10" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrement_daily_calls"("phone_last_10" "text") TO "service_role";


--
-- Name: FUNCTION "decrement_daily_calls"("phone_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."decrement_daily_calls"("phone_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decrement_daily_calls"("phone_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "expire_old_actions"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."expire_old_actions"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_old_actions"() TO "service_role";


--
-- Name: FUNCTION "extract_opener_from_transcript"("p_transcript" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."extract_opener_from_transcript"("p_transcript" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_opener_from_transcript"("p_transcript" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_opener_from_transcript"("p_transcript" "text") TO "service_role";


--
-- Name: FUNCTION "finalize_call_cost"("p_organization_id" "uuid", "p_call_log_id" "uuid", "p_retell_call_id" "text", "p_actual_minutes" numeric, "p_retell_cost_cents" integer, "p_idempotency_key" "text", "p_agent_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."finalize_call_cost"("p_organization_id" "uuid", "p_call_log_id" "uuid", "p_retell_call_id" "text", "p_actual_minutes" numeric, "p_retell_cost_cents" integer, "p_idempotency_key" "text", "p_agent_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."finalize_call_cost"("p_organization_id" "uuid", "p_call_log_id" "uuid", "p_retell_call_id" "text", "p_actual_minutes" numeric, "p_retell_cost_cents" integer, "p_idempotency_key" "text", "p_agent_id" "text") TO "service_role";


--
-- Name: FUNCTION "generate_webhook_key"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."generate_webhook_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."generate_webhook_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_webhook_key"() TO "service_role";


--
-- Name: FUNCTION "get_agent_customer_price"("p_organization_id" "uuid", "p_retell_agent_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."get_agent_customer_price"("p_organization_id" "uuid", "p_retell_agent_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_agent_customer_price"("p_organization_id" "uuid", "p_retell_agent_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_agent_customer_price"("p_organization_id" "uuid", "p_retell_agent_id" "text") TO "service_role";


--
-- Name: FUNCTION "get_effective_daily_calls"("phone_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_effective_daily_calls"("phone_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_effective_daily_calls"("phone_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_funnel_trend"("p_user_id" "uuid", "p_days" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_funnel_trend"("p_user_id" "uuid", "p_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_funnel_trend"("p_user_id" "uuid", "p_days" integer) TO "service_role";


--
-- Name: FUNCTION "get_telnyx_assistant_for_call"("p_user_id" "uuid", "p_assistant_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_telnyx_assistant_for_call"("p_user_id" "uuid", "p_assistant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_telnyx_assistant_for_call"("p_user_id" "uuid", "p_assistant_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "get_user_org_role"("org_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."get_user_org_role"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_org_role"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_org_role"("org_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "has_role"("_user_id" "uuid", "_role" "public"."app_role"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_role"("_user_id" "uuid", "_role" "public"."app_role") TO "service_role";


--
-- Name: FUNCTION "increment_daily_calls_with_reset"("target_phone_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."increment_daily_calls_with_reset"("target_phone_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_daily_calls_with_reset"("target_phone_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "is_org_admin"("org_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_admin"("org_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "merge_custom_fields"("p_lead_id" "uuid", "p_updates" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."merge_custom_fields"("p_lead_id" "uuid", "p_updates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."merge_custom_fields"("p_lead_id" "uuid", "p_updates" "jsonb") TO "service_role";


--
-- Name: FUNCTION "mint_api_key"("p_user_id" "uuid", "p_name" "text", "p_scopes" "text"[], "p_rate_limit" integer, "p_expires_in" interval); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."mint_api_key"("p_user_id" "uuid", "p_name" "text", "p_scopes" "text"[], "p_rate_limit" integer, "p_expires_in" interval) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mint_api_key"("p_user_id" "uuid", "p_name" "text", "p_scopes" "text"[], "p_rate_limit" integer, "p_expires_in" interval) TO "service_role";


--
-- Name: FUNCTION "normalize_opener_text"("p_opener" "text"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."normalize_opener_text"("p_opener" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."normalize_opener_text"("p_opener" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."normalize_opener_text"("p_opener" "text") TO "service_role";


--
-- Name: FUNCTION "predict_lead_conversion"("p_user_id" "uuid", "p_lead_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."predict_lead_conversion"("p_user_id" "uuid", "p_lead_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."predict_lead_conversion"("p_user_id" "uuid", "p_lead_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."predict_lead_conversion"("p_user_id" "uuid", "p_lead_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "prune_api_key_audit_log"("p_retention_days" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."prune_api_key_audit_log"("p_retention_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_api_key_audit_log"("p_retention_days" integer) TO "service_role";


--
-- Name: FUNCTION "rebalance_variant_weights"("p_user_id" "uuid", "p_agent_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."rebalance_variant_weights"("p_user_id" "uuid", "p_agent_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rebalance_variant_weights"("p_user_id" "uuid", "p_agent_id" "text") TO "service_role";


--
-- Name: FUNCTION "recalculate_calling_windows"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."recalculate_calling_windows"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_calling_windows"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "recalculate_number_health"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."recalculate_number_health"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."recalculate_number_health"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "reserve_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_call_log_id" "uuid", "p_retell_call_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reserve_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_call_log_id" "uuid", "p_retell_call_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_credits"("p_organization_id" "uuid", "p_amount_cents" integer, "p_call_log_id" "uuid", "p_retell_call_id" "text") TO "service_role";


--
-- Name: FUNCTION "reset_all_daily_calls"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reset_all_daily_calls"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_all_daily_calls"() TO "service_role";


--
-- Name: FUNCTION "reset_stale_daily_calls"("target_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reset_stale_daily_calls"("target_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_stale_daily_calls"("target_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "run_safety_backstops"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."run_safety_backstops"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."run_safety_backstops"() TO "service_role";


--
-- Name: FUNCTION "save_operational_memory"("p_user_id" "uuid", "p_memory_type" "text", "p_subject" "text", "p_content" "jsonb", "p_importance" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_operational_memory"("p_user_id" "uuid", "p_memory_type" "text", "p_subject" "text", "p_content" "jsonb", "p_importance" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_operational_memory"("p_user_id" "uuid", "p_memory_type" "text", "p_subject" "text", "p_content" "jsonb", "p_importance" integer) TO "service_role";


--
-- Name: FUNCTION "seed_default_playbook"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."seed_default_playbook"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_default_playbook"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "seed_disposition_values"("p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."seed_disposition_values"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."seed_disposition_values"("p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "select_script_variant"("p_user_id" "uuid", "p_agent_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."select_script_variant"("p_user_id" "uuid", "p_agent_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."select_script_variant"("p_user_id" "uuid", "p_agent_id" "text") TO "service_role";


--
-- Name: FUNCTION "select_sms_variant"("p_user_id" "uuid", "p_context_type" "text", "p_context_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."select_sms_variant"("p_user_id" "uuid", "p_context_type" "text", "p_context_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."select_sms_variant"("p_user_id" "uuid", "p_context_type" "text", "p_context_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."select_sms_variant"("p_user_id" "uuid", "p_context_type" "text", "p_context_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "sigmoid"("x" numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."sigmoid"("x" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."sigmoid"("x" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sigmoid"("x" numeric) TO "service_role";


--
-- Name: FUNCTION "touch_api_key"("p_key_id" "uuid", "p_ip" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."touch_api_key"("p_key_id" "uuid", "p_ip" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_api_key"("p_key_id" "uuid", "p_ip" "text") TO "service_role";


--
-- Name: FUNCTION "update_guardian_alerts_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_guardian_alerts_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_guardian_alerts_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_lj_memory_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_lj_memory_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_lj_memory_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_lj_memory_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_opener_analytics"("p_user_id" "uuid", "p_agent_id" "text", "p_agent_name" "text", "p_opener_text" "text", "p_was_answered" boolean, "p_was_engaged" boolean, "p_was_converted" boolean, "p_call_duration" integer, "p_call_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_opener_analytics"("p_user_id" "uuid", "p_agent_id" "text", "p_agent_name" "text", "p_opener_text" "text", "p_was_answered" boolean, "p_was_engaged" boolean, "p_was_converted" boolean, "p_call_duration" integer, "p_call_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."update_opener_analytics"("p_user_id" "uuid", "p_agent_id" "text", "p_agent_name" "text", "p_opener_text" "text", "p_was_answered" boolean, "p_was_engaged" boolean, "p_was_converted" boolean, "p_call_duration" integer, "p_call_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_opener_analytics"("p_user_id" "uuid", "p_agent_id" "text", "p_agent_name" "text", "p_opener_text" "text", "p_was_answered" boolean, "p_was_engaged" boolean, "p_was_converted" boolean, "p_call_duration" integer, "p_call_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "update_smart_lists_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_smart_lists_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_smart_lists_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_smart_lists_updated_at"() TO "service_role";


--
-- Name: FUNCTION "update_sms_variant_stats"("p_variant_id" "uuid", "p_replied" boolean, "p_positive" boolean, "p_appointment" boolean, "p_opted_out" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_sms_variant_stats"("p_variant_id" "uuid", "p_replied" boolean, "p_positive" boolean, "p_appointment" boolean, "p_opted_out" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_sms_variant_stats"("p_variant_id" "uuid", "p_replied" boolean, "p_positive" boolean, "p_appointment" boolean, "p_opted_out" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_sms_variant_stats"("p_variant_id" "uuid", "p_replied" boolean, "p_positive" boolean, "p_appointment" boolean, "p_opted_out" boolean) TO "service_role";


--
-- Name: FUNCTION "update_updated_at_column"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_updated_at_column"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";


--
-- Name: FUNCTION "update_variant_stats"("p_variant_id" "uuid", "p_outcome" "text", "p_duration" integer, "p_converted" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."update_variant_stats"("p_variant_id" "uuid", "p_outcome" "text", "p_duration" integer, "p_converted" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_variant_stats"("p_variant_id" "uuid", "p_outcome" "text", "p_duration" integer, "p_converted" boolean) TO "service_role";


--
-- Name: FUNCTION "update_voicemail_analytics"("p_user_id" "uuid", "p_broadcast_id" "uuid", "p_voicemail_audio_url" "text", "p_voicemail_duration" integer, "p_is_callback" boolean, "p_callback_within_1h" boolean, "p_callback_within_24h" boolean, "p_resulted_in_appointment" boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."update_voicemail_analytics"("p_user_id" "uuid", "p_broadcast_id" "uuid", "p_voicemail_audio_url" "text", "p_voicemail_duration" integer, "p_is_callback" boolean, "p_callback_within_1h" boolean, "p_callback_within_24h" boolean, "p_resulted_in_appointment" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_voicemail_analytics"("p_user_id" "uuid", "p_broadcast_id" "uuid", "p_voicemail_audio_url" "text", "p_voicemail_duration" integer, "p_is_callback" boolean, "p_callback_within_1h" boolean, "p_callback_within_24h" boolean, "p_resulted_in_appointment" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_voicemail_analytics"("p_user_id" "uuid", "p_broadcast_id" "uuid", "p_voicemail_audio_url" "text", "p_voicemail_duration" integer, "p_is_callback" boolean, "p_callback_within_1h" boolean, "p_callback_within_24h" boolean, "p_resulted_in_appointment" boolean) TO "service_role";


--
-- Name: FUNCTION "upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."upgrade_user_tier"("p_user_id" "uuid", "p_tier" "text", "p_stripe_customer_id" "text", "p_stripe_subscription_id" "text") TO "service_role";


--
-- Name: FUNCTION "user_in_organization"("org_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."user_in_organization"("org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."user_in_organization"("org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_in_organization"("org_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "validate_phone_number_uses"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."validate_phone_number_uses"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_phone_number_uses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_phone_number_uses"() TO "service_role";


--
-- Name: TABLE "active_ai_transfers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."active_ai_transfers" TO "anon";
GRANT ALL ON TABLE "public"."active_ai_transfers" TO "authenticated";
GRANT ALL ON TABLE "public"."active_ai_transfers" TO "service_role";


--
-- Name: TABLE "adaptive_pacing"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."adaptive_pacing" TO "anon";
GRANT ALL ON TABLE "public"."adaptive_pacing" TO "authenticated";
GRANT ALL ON TABLE "public"."adaptive_pacing" TO "service_role";


--
-- Name: TABLE "advanced_dialer_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."advanced_dialer_settings" TO "anon";
GRANT ALL ON TABLE "public"."advanced_dialer_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."advanced_dialer_settings" TO "service_role";


--
-- Name: TABLE "agent_decisions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."agent_decisions" TO "anon";
GRANT ALL ON TABLE "public"."agent_decisions" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_decisions" TO "service_role";


--
-- Name: TABLE "agent_improvement_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."agent_improvement_history" TO "anon";
GRANT ALL ON TABLE "public"."agent_improvement_history" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_improvement_history" TO "service_role";


--
-- Name: TABLE "agent_pricing"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."agent_pricing" TO "anon";
GRANT ALL ON TABLE "public"."agent_pricing" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_pricing" TO "service_role";


--
-- Name: TABLE "agent_script_variants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."agent_script_variants" TO "anon";
GRANT ALL ON TABLE "public"."agent_script_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_script_variants" TO "service_role";


--
-- Name: TABLE "ai_action_queue"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_action_queue" TO "anon";
GRANT ALL ON TABLE "public"."ai_action_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_action_queue" TO "service_role";


--
-- Name: TABLE "ai_campaign_strategies"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_campaign_strategies" TO "anon";
GRANT ALL ON TABLE "public"."ai_campaign_strategies" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_campaign_strategies" TO "service_role";


--
-- Name: TABLE "ai_chatbot_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_chatbot_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_chatbot_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_chatbot_settings" TO "service_role";


--
-- Name: TABLE "ai_daily_insights"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_daily_insights" TO "anon";
GRANT ALL ON TABLE "public"."ai_daily_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_daily_insights" TO "service_role";


--
-- Name: TABLE "ai_feedback"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_feedback" TO "anon";
GRANT ALL ON TABLE "public"."ai_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_feedback" TO "service_role";


--
-- Name: TABLE "ai_learning"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_learning" TO "anon";
GRANT ALL ON TABLE "public"."ai_learning" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_learning" TO "service_role";


--
-- Name: TABLE "ai_operational_memory"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_operational_memory" TO "anon";
GRANT ALL ON TABLE "public"."ai_operational_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_operational_memory" TO "service_role";


--
-- Name: TABLE "ai_session_memory"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_session_memory" TO "anon";
GRANT ALL ON TABLE "public"."ai_session_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_session_memory" TO "service_role";


--
-- Name: TABLE "ai_sms_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_sms_settings" TO "anon";
GRANT ALL ON TABLE "public"."ai_sms_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_sms_settings" TO "service_role";


--
-- Name: TABLE "ai_workflow_generations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ai_workflow_generations" TO "anon";
GRANT ALL ON TABLE "public"."ai_workflow_generations" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_workflow_generations" TO "service_role";


--
-- Name: TABLE "api_key_audit_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."api_key_audit_log" TO "anon";
GRANT ALL ON TABLE "public"."api_key_audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."api_key_audit_log" TO "service_role";


--
-- Name: TABLE "api_keys"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."api_keys" TO "anon";
GRANT ALL ON TABLE "public"."api_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."api_keys" TO "service_role";


--
-- Name: TABLE "autonomous_goals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."autonomous_goals" TO "anon";
GRANT ALL ON TABLE "public"."autonomous_goals" TO "authenticated";
GRANT ALL ON TABLE "public"."autonomous_goals" TO "service_role";


--
-- Name: TABLE "autonomous_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."autonomous_settings" TO "anon";
GRANT ALL ON TABLE "public"."autonomous_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."autonomous_settings" TO "service_role";


--
-- Name: TABLE "broadcast_queue"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."broadcast_queue" TO "anon";
GRANT ALL ON TABLE "public"."broadcast_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."broadcast_queue" TO "service_role";


--
-- Name: TABLE "budget_alerts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."budget_alerts" TO "anon";
GRANT ALL ON TABLE "public"."budget_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_alerts" TO "service_role";


--
-- Name: TABLE "budget_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."budget_settings" TO "anon";
GRANT ALL ON TABLE "public"."budget_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."budget_settings" TO "service_role";


--
-- Name: TABLE "calendar_appointments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."calendar_appointments" TO "anon";
GRANT ALL ON TABLE "public"."calendar_appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_appointments" TO "service_role";


--
-- Name: TABLE "calendar_availability"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."calendar_availability" TO "anon";
GRANT ALL ON TABLE "public"."calendar_availability" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_availability" TO "service_role";


--
-- Name: TABLE "calendar_integrations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."calendar_integrations" TO "anon";
GRANT ALL ON TABLE "public"."calendar_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_integrations" TO "service_role";


--
-- Name: TABLE "calendar_tool_invocations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."calendar_tool_invocations" TO "anon";
GRANT ALL ON TABLE "public"."calendar_tool_invocations" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_tool_invocations" TO "service_role";


--
-- Name: TABLE "call_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."call_logs" TO "anon";
GRANT ALL ON TABLE "public"."call_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."call_logs" TO "service_role";


--
-- Name: TABLE "call_opener_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."call_opener_logs" TO "anon";
GRANT ALL ON TABLE "public"."call_opener_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."call_opener_logs" TO "service_role";


--
-- Name: TABLE "leads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."leads" TO "anon";
GRANT ALL ON TABLE "public"."leads" TO "authenticated";
GRANT ALL ON TABLE "public"."leads" TO "service_role";


--
-- Name: TABLE "call_outcome_dimensions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."call_outcome_dimensions" TO "anon";
GRANT ALL ON TABLE "public"."call_outcome_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."call_outcome_dimensions" TO "service_role";


--
-- Name: TABLE "call_variant_assignments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."call_variant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."call_variant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."call_variant_assignments" TO "service_role";


--
-- Name: TABLE "campaign_automation_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."campaign_automation_rules" TO "anon";
GRANT ALL ON TABLE "public"."campaign_automation_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_automation_rules" TO "service_role";


--
-- Name: TABLE "campaign_leads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."campaign_leads" TO "anon";
GRANT ALL ON TABLE "public"."campaign_leads" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_leads" TO "service_role";


--
-- Name: TABLE "campaign_phone_pools"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."campaign_phone_pools" TO "anon";
GRANT ALL ON TABLE "public"."campaign_phone_pools" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_phone_pools" TO "service_role";


--
-- Name: TABLE "campaign_workflows"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."campaign_workflows" TO "anon";
GRANT ALL ON TABLE "public"."campaign_workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_workflows" TO "service_role";


--
-- Name: TABLE "campaigns"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";


--
-- Name: TABLE "churn_risk_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."churn_risk_events" TO "anon";
GRANT ALL ON TABLE "public"."churn_risk_events" TO "authenticated";
GRANT ALL ON TABLE "public"."churn_risk_events" TO "service_role";


--
-- Name: TABLE "credit_transactions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."credit_transactions" TO "anon";
GRANT ALL ON TABLE "public"."credit_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_transactions" TO "service_role";


--
-- Name: TABLE "daily_battle_plans"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."daily_battle_plans" TO "anon";
GRANT ALL ON TABLE "public"."daily_battle_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_battle_plans" TO "service_role";


--
-- Name: TABLE "daily_reports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."daily_reports" TO "anon";
GRANT ALL ON TABLE "public"."daily_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_reports" TO "service_role";


--
-- Name: TABLE "demo_agent_config"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."demo_agent_config" TO "anon";
GRANT ALL ON TABLE "public"."demo_agent_config" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_agent_config" TO "service_role";


--
-- Name: TABLE "demo_call_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."demo_call_logs" TO "anon";
GRANT ALL ON TABLE "public"."demo_call_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_call_logs" TO "service_role";


--
-- Name: TABLE "demo_sessions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."demo_sessions" TO "anon";
GRANT ALL ON TABLE "public"."demo_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."demo_sessions" TO "service_role";


--
-- Name: TABLE "disposition_auto_actions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."disposition_auto_actions" TO "anon";
GRANT ALL ON TABLE "public"."disposition_auto_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."disposition_auto_actions" TO "service_role";


--
-- Name: TABLE "disposition_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."disposition_metrics" TO "anon";
GRANT ALL ON TABLE "public"."disposition_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."disposition_metrics" TO "service_role";


--
-- Name: TABLE "disposition_values"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."disposition_values" TO "anon";
GRANT ALL ON TABLE "public"."disposition_values" TO "authenticated";
GRANT ALL ON TABLE "public"."disposition_values" TO "service_role";


--
-- Name: TABLE "dispositions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dispositions" TO "anon";
GRANT ALL ON TABLE "public"."dispositions" TO "authenticated";
GRANT ALL ON TABLE "public"."dispositions" TO "service_role";


--
-- Name: TABLE "dnc_list"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."dnc_list" TO "anon";
GRANT ALL ON TABLE "public"."dnc_list" TO "authenticated";
GRANT ALL ON TABLE "public"."dnc_list" TO "service_role";


--
-- Name: TABLE "edge_function_errors"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."edge_function_errors" TO "anon";
GRANT ALL ON TABLE "public"."edge_function_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."edge_function_errors" TO "service_role";


--
-- Name: TABLE "follow_up_sequences"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."follow_up_sequences" TO "anon";
GRANT ALL ON TABLE "public"."follow_up_sequences" TO "authenticated";
GRANT ALL ON TABLE "public"."follow_up_sequences" TO "service_role";


--
-- Name: TABLE "followup_playbook"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."followup_playbook" TO "anon";
GRANT ALL ON TABLE "public"."followup_playbook" TO "authenticated";
GRANT ALL ON TABLE "public"."followup_playbook" TO "service_role";


--
-- Name: TABLE "funnel_snapshots"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."funnel_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."funnel_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."funnel_snapshots" TO "service_role";


--
-- Name: TABLE "ghl_pending_updates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ghl_pending_updates" TO "anon";
GRANT ALL ON TABLE "public"."ghl_pending_updates" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_pending_updates" TO "service_role";


--
-- Name: TABLE "ghl_sync_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ghl_sync_settings" TO "anon";
GRANT ALL ON TABLE "public"."ghl_sync_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ghl_sync_settings" TO "service_role";


--
-- Name: TABLE "guardian_alerts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."guardian_alerts" TO "anon";
GRANT ALL ON TABLE "public"."guardian_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."guardian_alerts" TO "service_role";


--
-- Name: TABLE "insight_generated_rules"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."insight_generated_rules" TO "anon";
GRANT ALL ON TABLE "public"."insight_generated_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."insight_generated_rules" TO "service_role";


--
-- Name: TABLE "journey_event_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."journey_event_log" TO "anon";
GRANT ALL ON TABLE "public"."journey_event_log" TO "authenticated";
GRANT ALL ON TABLE "public"."journey_event_log" TO "service_role";


--
-- Name: TABLE "lead_intent_signals"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_intent_signals" TO "anon";
GRANT ALL ON TABLE "public"."lead_intent_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_intent_signals" TO "service_role";


--
-- Name: TABLE "lead_journey_state"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_journey_state" TO "anon";
GRANT ALL ON TABLE "public"."lead_journey_state" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_journey_state" TO "service_role";


--
-- Name: TABLE "lead_list_memberships"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_list_memberships" TO "anon";
GRANT ALL ON TABLE "public"."lead_list_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_list_memberships" TO "service_role";


--
-- Name: TABLE "lead_nudge_tracking"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_nudge_tracking" TO "anon";
GRANT ALL ON TABLE "public"."lead_nudge_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_nudge_tracking" TO "service_role";


--
-- Name: TABLE "lead_pipeline_positions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_pipeline_positions" TO "anon";
GRANT ALL ON TABLE "public"."lead_pipeline_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_pipeline_positions" TO "service_role";


--
-- Name: TABLE "lead_predictions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_predictions" TO "anon";
GRANT ALL ON TABLE "public"."lead_predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_predictions" TO "service_role";


--
-- Name: TABLE "lead_priority_scores"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_priority_scores" TO "anon";
GRANT ALL ON TABLE "public"."lead_priority_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_priority_scores" TO "service_role";


--
-- Name: TABLE "lead_reachability_scores"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_reachability_scores" TO "anon";
GRANT ALL ON TABLE "public"."lead_reachability_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_reachability_scores" TO "service_role";


--
-- Name: TABLE "lead_score_outcomes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_score_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."lead_score_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_score_outcomes" TO "service_role";


--
-- Name: TABLE "lead_scoring_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_scoring_settings" TO "anon";
GRANT ALL ON TABLE "public"."lead_scoring_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scoring_settings" TO "service_role";


--
-- Name: TABLE "lead_scoring_weights"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_scoring_weights" TO "anon";
GRANT ALL ON TABLE "public"."lead_scoring_weights" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_scoring_weights" TO "service_role";


--
-- Name: TABLE "lead_workflow_progress"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lead_workflow_progress" TO "anon";
GRANT ALL ON TABLE "public"."lead_workflow_progress" TO "authenticated";
GRANT ALL ON TABLE "public"."lead_workflow_progress" TO "service_role";


--
-- Name: TABLE "learning_outcomes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."learning_outcomes" TO "anon";
GRANT ALL ON TABLE "public"."learning_outcomes" TO "authenticated";
GRANT ALL ON TABLE "public"."learning_outcomes" TO "service_role";


--
-- Name: TABLE "lj_memory"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."lj_memory" TO "anon";
GRANT ALL ON TABLE "public"."lj_memory" TO "authenticated";
GRANT ALL ON TABLE "public"."lj_memory" TO "service_role";


--
-- Name: TABLE "message_effectiveness"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_effectiveness" TO "anon";
GRANT ALL ON TABLE "public"."message_effectiveness" TO "authenticated";
GRANT ALL ON TABLE "public"."message_effectiveness" TO "service_role";


--
-- Name: TABLE "ml_learning_data"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ml_learning_data" TO "anon";
GRANT ALL ON TABLE "public"."ml_learning_data" TO "authenticated";
GRANT ALL ON TABLE "public"."ml_learning_data" TO "service_role";


--
-- Name: TABLE "ml_models"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ml_models" TO "anon";
GRANT ALL ON TABLE "public"."ml_models" TO "authenticated";
GRANT ALL ON TABLE "public"."ml_models" TO "service_role";


--
-- Name: TABLE "number_health_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."number_health_metrics" TO "anon";
GRANT ALL ON TABLE "public"."number_health_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."number_health_metrics" TO "service_role";


--
-- Name: TABLE "number_orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."number_orders" TO "anon";
GRANT ALL ON TABLE "public"."number_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."number_orders" TO "service_role";


--
-- Name: TABLE "opener_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."opener_analytics" TO "anon";
GRANT ALL ON TABLE "public"."opener_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."opener_analytics" TO "service_role";


--
-- Name: TABLE "optimal_calling_windows"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."optimal_calling_windows" TO "anon";
GRANT ALL ON TABLE "public"."optimal_calling_windows" TO "authenticated";
GRANT ALL ON TABLE "public"."optimal_calling_windows" TO "service_role";


--
-- Name: TABLE "organization_credits"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."organization_credits" TO "anon";
GRANT ALL ON TABLE "public"."organization_credits" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_credits" TO "service_role";


--
-- Name: TABLE "organization_users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."organization_users" TO "anon";
GRANT ALL ON TABLE "public"."organization_users" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_users" TO "service_role";


--
-- Name: TABLE "organizations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";


--
-- Name: TABLE "pacing_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pacing_history" TO "anon";
GRANT ALL ON TABLE "public"."pacing_history" TO "authenticated";
GRANT ALL ON TABLE "public"."pacing_history" TO "service_role";


--
-- Name: TABLE "phone_number_use_types"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."phone_number_use_types" TO "anon";
GRANT ALL ON TABLE "public"."phone_number_use_types" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_number_use_types" TO "service_role";


--
-- Name: TABLE "phone_numbers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."phone_numbers" TO "anon";
GRANT ALL ON TABLE "public"."phone_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_numbers" TO "service_role";


--
-- Name: TABLE "phone_providers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."phone_providers" TO "anon";
GRANT ALL ON TABLE "public"."phone_providers" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_providers" TO "service_role";


--
-- Name: TABLE "pipeline_boards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pipeline_boards" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_boards" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_boards" TO "service_role";


--
-- Name: TABLE "playbook_optimization_log"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."playbook_optimization_log" TO "anon";
GRANT ALL ON TABLE "public"."playbook_optimization_log" TO "authenticated";
GRANT ALL ON TABLE "public"."playbook_optimization_log" TO "service_role";


--
-- Name: TABLE "playbook_performance"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."playbook_performance" TO "anon";
GRANT ALL ON TABLE "public"."playbook_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."playbook_performance" TO "service_role";


--
-- Name: TABLE "predictive_dialing_stats"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."predictive_dialing_stats" TO "anon";
GRANT ALL ON TABLE "public"."predictive_dialing_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."predictive_dialing_stats" TO "service_role";


--
-- Name: TABLE "pricing_tiers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."pricing_tiers" TO "anon";
GRANT ALL ON TABLE "public"."pricing_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_tiers" TO "service_role";


--
-- Name: TABLE "reachability_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."reachability_events" TO "anon";
GRANT ALL ON TABLE "public"."reachability_events" TO "authenticated";
GRANT ALL ON TABLE "public"."reachability_events" TO "service_role";


--
-- Name: TABLE "retell_agents"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."retell_agents" TO "anon";
GRANT ALL ON TABLE "public"."retell_agents" TO "authenticated";
GRANT ALL ON TABLE "public"."retell_agents" TO "service_role";


--
-- Name: TABLE "retell_branded_calls"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."retell_branded_calls" TO "anon";
GRANT ALL ON TABLE "public"."retell_branded_calls" TO "authenticated";
GRANT ALL ON TABLE "public"."retell_branded_calls" TO "service_role";


--
-- Name: TABLE "retell_business_profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."retell_business_profiles" TO "anon";
GRANT ALL ON TABLE "public"."retell_business_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."retell_business_profiles" TO "service_role";


--
-- Name: TABLE "retell_transfer_context"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."retell_transfer_context" TO "anon";
GRANT ALL ON TABLE "public"."retell_transfer_context" TO "authenticated";
GRANT ALL ON TABLE "public"."retell_transfer_context" TO "service_role";


--
-- Name: TABLE "retell_verified_numbers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."retell_verified_numbers" TO "anon";
GRANT ALL ON TABLE "public"."retell_verified_numbers" TO "authenticated";
GRANT ALL ON TABLE "public"."retell_verified_numbers" TO "service_role";


--
-- Name: TABLE "rotation_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rotation_history" TO "anon";
GRANT ALL ON TABLE "public"."rotation_history" TO "authenticated";
GRANT ALL ON TABLE "public"."rotation_history" TO "service_role";


--
-- Name: TABLE "rotation_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."rotation_settings" TO "anon";
GRANT ALL ON TABLE "public"."rotation_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."rotation_settings" TO "service_role";


--
-- Name: TABLE "scheduled_follow_ups"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."scheduled_follow_ups" TO "anon";
GRANT ALL ON TABLE "public"."scheduled_follow_ups" TO "authenticated";
GRANT ALL ON TABLE "public"."scheduled_follow_ups" TO "service_role";


--
-- Name: TABLE "segment_roi_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."segment_roi_metrics" TO "anon";
GRANT ALL ON TABLE "public"."segment_roi_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."segment_roi_metrics" TO "service_role";


--
-- Name: TABLE "sequence_steps"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sequence_steps" TO "anon";
GRANT ALL ON TABLE "public"."sequence_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."sequence_steps" TO "service_role";


--
-- Name: TABLE "sequence_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sequence_templates" TO "anon";
GRANT ALL ON TABLE "public"."sequence_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."sequence_templates" TO "service_role";


--
-- Name: TABLE "sip_trunk_configs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sip_trunk_configs" TO "anon";
GRANT ALL ON TABLE "public"."sip_trunk_configs" TO "authenticated";
GRANT ALL ON TABLE "public"."sip_trunk_configs" TO "service_role";


--
-- Name: TABLE "slack_users"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."slack_users" TO "anon";
GRANT ALL ON TABLE "public"."slack_users" TO "authenticated";
GRANT ALL ON TABLE "public"."slack_users" TO "service_role";


--
-- Name: TABLE "smart_lists"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."smart_lists" TO "anon";
GRANT ALL ON TABLE "public"."smart_lists" TO "authenticated";
GRANT ALL ON TABLE "public"."smart_lists" TO "service_role";


--
-- Name: TABLE "sms_context_history"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sms_context_history" TO "anon";
GRANT ALL ON TABLE "public"."sms_context_history" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_context_history" TO "service_role";


--
-- Name: TABLE "sms_conversations"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sms_conversations" TO "anon";
GRANT ALL ON TABLE "public"."sms_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_conversations" TO "service_role";


--
-- Name: TABLE "sms_copy_variants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sms_copy_variants" TO "anon";
GRANT ALL ON TABLE "public"."sms_copy_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_copy_variants" TO "service_role";


--
-- Name: TABLE "sms_messages"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sms_messages" TO "anon";
GRANT ALL ON TABLE "public"."sms_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_messages" TO "service_role";


--
-- Name: TABLE "sms_variant_assignments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."sms_variant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."sms_variant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."sms_variant_assignments" TO "service_role";


--
-- Name: TABLE "spending_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."spending_logs" TO "anon";
GRANT ALL ON TABLE "public"."spending_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."spending_logs" TO "service_role";


--
-- Name: TABLE "spending_summaries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."spending_summaries" TO "anon";
GRANT ALL ON TABLE "public"."spending_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."spending_summaries" TO "service_role";


--
-- Name: TABLE "strategic_briefings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."strategic_briefings" TO "anon";
GRANT ALL ON TABLE "public"."strategic_briefings" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_briefings" TO "service_role";


--
-- Name: TABLE "strategic_insights"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."strategic_insights" TO "anon";
GRANT ALL ON TABLE "public"."strategic_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."strategic_insights" TO "service_role";


--
-- Name: TABLE "system_alerts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."system_alerts" TO "anon";
GRANT ALL ON TABLE "public"."system_alerts" TO "authenticated";
GRANT ALL ON TABLE "public"."system_alerts" TO "service_role";


--
-- Name: TABLE "system_health_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."system_health_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_health_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_health_logs" TO "service_role";


--
-- Name: TABLE "system_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."system_settings" TO "anon";
GRANT ALL ON TABLE "public"."system_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."system_settings" TO "service_role";


--
-- Name: TABLE "telnyx_assistants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."telnyx_assistants" TO "anon";
GRANT ALL ON TABLE "public"."telnyx_assistants" TO "authenticated";
GRANT ALL ON TABLE "public"."telnyx_assistants" TO "service_role";


--
-- Name: TABLE "telnyx_conversation_insights"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."telnyx_conversation_insights" TO "anon";
GRANT ALL ON TABLE "public"."telnyx_conversation_insights" TO "authenticated";
GRANT ALL ON TABLE "public"."telnyx_conversation_insights" TO "service_role";


--
-- Name: TABLE "telnyx_insight_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."telnyx_insight_templates" TO "anon";
GRANT ALL ON TABLE "public"."telnyx_insight_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."telnyx_insight_templates" TO "service_role";


--
-- Name: TABLE "telnyx_knowledge_bases"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."telnyx_knowledge_bases" TO "anon";
GRANT ALL ON TABLE "public"."telnyx_knowledge_bases" TO "authenticated";
GRANT ALL ON TABLE "public"."telnyx_knowledge_bases" TO "service_role";


--
-- Name: TABLE "telnyx_scheduled_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."telnyx_scheduled_events" TO "anon";
GRANT ALL ON TABLE "public"."telnyx_scheduled_events" TO "authenticated";
GRANT ALL ON TABLE "public"."telnyx_scheduled_events" TO "service_role";


--
-- Name: TABLE "telnyx_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."telnyx_settings" TO "anon";
GRANT ALL ON TABLE "public"."telnyx_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."telnyx_settings" TO "service_role";


--
-- Name: TABLE "time_wasted_summary"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."time_wasted_summary" TO "anon";
GRANT ALL ON TABLE "public"."time_wasted_summary" TO "authenticated";
GRANT ALL ON TABLE "public"."time_wasted_summary" TO "service_role";


--
-- Name: TABLE "top_openers"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."top_openers" TO "anon";
GRANT ALL ON TABLE "public"."top_openers" TO "authenticated";
GRANT ALL ON TABLE "public"."top_openers" TO "service_role";


--
-- Name: TABLE "user_credentials"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_credentials" TO "anon";
GRANT ALL ON TABLE "public"."user_credentials" TO "authenticated";
GRANT ALL ON TABLE "public"."user_credentials" TO "service_role";


--
-- Name: TABLE "user_feature_flags"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_feature_flags" TO "anon";
GRANT ALL ON TABLE "public"."user_feature_flags" TO "authenticated";
GRANT ALL ON TABLE "public"."user_feature_flags" TO "service_role";


--
-- Name: TABLE "user_roles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";


--
-- Name: TABLE "voice_broadcasts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."voice_broadcasts" TO "anon";
GRANT ALL ON TABLE "public"."voice_broadcasts" TO "authenticated";
GRANT ALL ON TABLE "public"."voice_broadcasts" TO "service_role";


--
-- Name: TABLE "voicemail_analytics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."voicemail_analytics" TO "anon";
GRANT ALL ON TABLE "public"."voicemail_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."voicemail_analytics" TO "service_role";


--
-- Name: TABLE "voicemail_callback_tracking"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."voicemail_callback_tracking" TO "anon";
GRANT ALL ON TABLE "public"."voicemail_callback_tracking" TO "authenticated";
GRANT ALL ON TABLE "public"."voicemail_callback_tracking" TO "service_role";


--
-- Name: TABLE "voicemail_performance"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."voicemail_performance" TO "anon";
GRANT ALL ON TABLE "public"."voicemail_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."voicemail_performance" TO "service_role";


--
-- Name: TABLE "workflow_steps"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_steps" TO "service_role";


--
-- Name: TABLE "workflow_test_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workflow_test_logs" TO "anon";
GRANT ALL ON TABLE "public"."workflow_test_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_test_logs" TO "service_role";


--
-- Name: TABLE "yellowstone_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."yellowstone_settings" TO "anon";
GRANT ALL ON TABLE "public"."yellowstone_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."yellowstone_settings" TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--



--
-- PostgreSQL database dump complete
--


