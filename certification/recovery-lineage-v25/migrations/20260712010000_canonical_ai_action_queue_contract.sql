-- Canonical autonomous action queue contract.
--
-- The first queue migration created action_payload + text priority. A later
-- CREATE TABLE IF NOT EXISTS expected action_params + integer priority, but it
-- never altered existing installations. Keep the legacy columns so deployed
-- UI/code remains compatible while introducing unambiguous canonical fields.

ALTER TABLE public.ai_action_queue
  ADD COLUMN IF NOT EXISTS action_params JSONB,
  ADD COLUMN IF NOT EXISTS priority_score INTEGER,
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN,
  ADD COLUMN IF NOT EXISTS reasoning TEXT;

UPDATE public.ai_action_queue
SET
  action_params = COALESCE(action_params, action_payload, '{}'::jsonb),
  priority_score = COALESCE(
    priority_score,
    CASE lower(COALESCE(priority::text, 'medium'))
      WHEN 'urgent' THEN 1
      WHEN 'critical' THEN 1
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 5
      WHEN 'normal' THEN 5
      WHEN 'low' THEN 9
      ELSE CASE
        WHEN priority::text ~ '^[0-9]+$' THEN LEAST(100, GREATEST(1, priority::text::integer))
        ELSE 5
      END
    END
  ),
  requires_approval = COALESCE(requires_approval, status = 'pending'),
  reasoning = COALESCE(reasoning, description);

ALTER TABLE public.ai_action_queue
  ALTER COLUMN action_params SET DEFAULT '{}'::jsonb,
  ALTER COLUMN action_params SET NOT NULL,
  ALTER COLUMN priority_score SET DEFAULT 5,
  ALTER COLUMN priority_score SET NOT NULL,
  ALTER COLUMN requires_approval SET DEFAULT true,
  ALTER COLUMN requires_approval SET NOT NULL;

ALTER TABLE public.ai_action_queue
  DROP CONSTRAINT IF EXISTS ai_action_queue_priority_score_check;

ALTER TABLE public.ai_action_queue
  ADD CONSTRAINT ai_action_queue_priority_score_check
  CHECK (priority_score BETWEEN 1 AND 100);

CREATE INDEX IF NOT EXISTS idx_ai_action_queue_execution_order
  ON public.ai_action_queue (user_id, status, priority_score, created_at);

ALTER TABLE public.ai_action_queue
  DROP CONSTRAINT IF EXISTS ai_action_queue_source_check;
ALTER TABLE public.ai_action_queue
  ADD CONSTRAINT ai_action_queue_source_check CHECK (source IN (
    'autonomous_engine', 'ai_brain', 'ai_assistant', 'manual',
    'journey_engine', 'funnel_intelligence', 'number_health',
    'daily_planner', 'strategic_insight', 'churn_detection'
  )) NOT VALID;

-- Mirror canonical and legacy payload/reasoning fields in both directions.
-- Canonical values win when both are supplied on INSERT. On UPDATE, the field
-- that actually changed wins. This lets old clients coexist during rollout.
CREATE OR REPLACE FUNCTION public.sync_ai_action_queue_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  legacy_insert boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    legacy_insert := (NEW.action_params IS NULL OR NEW.action_params = '{}'::jsonb)
      AND NEW.action_payload IS NOT NULL
      AND NEW.action_payload <> '{}'::jsonb;
    IF NEW.action_params IS NULL OR NEW.action_params = '{}'::jsonb THEN
      NEW.action_params := COALESCE(NEW.action_payload, '{}'::jsonb);
    END IF;
    NEW.action_payload := NEW.action_params;
    NEW.reasoning := COALESCE(NEW.reasoning, NEW.description);
    NEW.description := COALESCE(NEW.description, NEW.reasoning);
    IF legacy_insert THEN
      NEW.priority_score := CASE lower(COALESCE(NEW.priority::text, 'medium'))
        WHEN 'urgent' THEN 1 WHEN 'critical' THEN 1 WHEN 'high' THEN 1
        WHEN 'medium' THEN 5 WHEN 'normal' THEN 5 WHEN 'low' THEN 9
        ELSE 5
      END;
    ELSE
      NEW.priority_score := COALESCE(NEW.priority_score, 5);
    END IF;
    NEW.title := COALESCE(NULLIF(NEW.title, ''), initcap(replace(NEW.action_type, '_', ' ')));
  ELSE
    IF NEW.action_params IS DISTINCT FROM OLD.action_params THEN
      NEW.action_payload := NEW.action_params;
    ELSIF NEW.action_payload IS DISTINCT FROM OLD.action_payload THEN
      NEW.action_params := COALESCE(NEW.action_payload, '{}'::jsonb);
    END IF;

    IF NEW.reasoning IS DISTINCT FROM OLD.reasoning THEN
      NEW.description := NEW.reasoning;
    ELSIF NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.reasoning := NEW.description;
    END IF;

    IF NEW.priority_score IS DISTINCT FROM OLD.priority_score THEN
      NEW.priority := CASE
        WHEN NEW.priority_score <= 3 THEN 'high'
        WHEN NEW.priority_score <= 6 THEN 'medium'
        ELSE 'low'
      END;
    ELSIF NEW.priority IS DISTINCT FROM OLD.priority THEN
      NEW.priority_score := CASE lower(COALESCE(NEW.priority::text, 'medium'))
        WHEN 'urgent' THEN 1 WHEN 'critical' THEN 1 WHEN 'high' THEN 1
        WHEN 'medium' THEN 5 WHEN 'normal' THEN 5 WHEN 'low' THEN 9
        ELSE NEW.priority_score
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_ai_action_queue_contract_trigger ON public.ai_action_queue;
CREATE TRIGGER sync_ai_action_queue_contract_trigger
BEFORE INSERT OR UPDATE ON public.ai_action_queue
FOR EACH ROW EXECUTE FUNCTION public.sync_ai_action_queue_contract();

-- Once an action leaves pending state, its target/contract is immutable. This
-- prevents a user-writable approval row from changing underneath the worker or
-- after the audit trail says a different action executed.
CREATE OR REPLACE FUNCTION public.protect_ai_action_queue_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status <> 'pending' AND (
    NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.action_type IS DISTINCT FROM OLD.action_type
    OR NEW.action_params IS DISTINCT FROM OLD.action_params
    OR NEW.action_payload IS DISTINCT FROM OLD.action_payload
    OR NEW.target_entity_type IS DISTINCT FROM OLD.target_entity_type
    OR NEW.target_entity_id IS DISTINCT FROM OLD.target_entity_id
    OR NEW.source IS DISTINCT FROM OLD.source
  ) THEN
    RAISE EXCEPTION 'approved/executing action contracts are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_ai_action_queue_contract_trigger ON public.ai_action_queue;
CREATE TRIGGER protect_ai_action_queue_contract_trigger
BEFORE UPDATE ON public.ai_action_queue
FOR EACH ROW EXECUTE FUNCTION public.protect_ai_action_queue_contract();

COMMENT ON COLUMN public.ai_action_queue.action_params IS
  'Canonical action payload. action_payload is retained and mirrored for backward compatibility.';
COMMENT ON COLUMN public.ai_action_queue.priority_score IS
  'Canonical execution priority; lower values execute first. Legacy text priority remains for compatibility.';
