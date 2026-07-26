BEGIN;

-- Call logs are provider, reconciliation, and billing evidence. Browser
-- clients may observe their tenant's records but may not manufacture, rewrite,
-- or delete lifecycle state through the generic REST table surface.
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'call_logs'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.call_logs', policy_name);
  END LOOP;

  SELECT string_agg(format('%I', attribute.attname), ', ' ORDER BY attribute.attnum)
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.call_logs'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.call_logs
    FROM PUBLIC, anon, authenticated;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.call_logs FROM PUBLIC, anon, authenticated',
      column_list
    );
  END IF;
END;
$$;

CREATE POLICY "Members view their tenant call logs"
  ON public.call_logs
  FOR SELECT
  TO authenticated
  USING (public.user_in_organization(auth.uid(), organization_id));

GRANT SELECT ON TABLE public.call_logs TO authenticated;
REVOKE DELETE ON TABLE public.call_logs FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.call_logs TO service_role;

-- Even trusted workers cannot erase the durable call record or rebind
-- established provider/billing identities. Lifecycle fields remain writable
-- so signed callbacks and the reconciliation worker can advance a call.
CREATE OR REPLACE FUNCTION public.protect_call_log_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CALL_LOG_EVIDENCE_IMMUTABLE'
      USING ERRCODE = '23514',
      DETAIL = format('call log %s is durable provider and billing evidence', OLD.id);
  END IF;

  IF (NEW.organization_id IS DISTINCT FROM OLD.organization_id
      OR NEW.user_id IS DISTINCT FROM OLD.user_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.organization_membership_transfers AS transfer
      WHERE transfer.transaction_id = txid_current()
        AND transfer.state = 'processing'
        AND transfer.organization_id = OLD.organization_id
        AND transfer.organization_id = NEW.organization_id
        AND transfer.from_user_id = OLD.user_id
        AND transfer.to_user_id = NEW.user_id
    )
  THEN
    RAISE EXCEPTION 'CALL_LOG_TENANT_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF (OLD.retell_call_id IS NOT NULL
      AND NEW.retell_call_id IS DISTINCT FROM OLD.retell_call_id)
    OR (OLD.telnyx_call_control_id IS NOT NULL
      AND NEW.telnyx_call_control_id IS DISTINCT FROM OLD.telnyx_call_control_id)
    OR (OLD.telnyx_call_session_id IS NOT NULL
      AND NEW.telnyx_call_session_id IS DISTINCT FROM OLD.telnyx_call_session_id)
    OR (OLD.telnyx_conversation_id IS NOT NULL
      AND NEW.telnyx_conversation_id IS DISTINCT FROM OLD.telnyx_conversation_id)
    OR (OLD.billed_cost_cents IS NOT NULL
      AND NEW.billed_cost_cents IS DISTINCT FROM OLD.billed_cost_cents)
    OR (OLD.credit_deducted = true AND NEW.credit_deducted IS DISTINCT FROM true)
  THEN
    RAISE EXCEPTION 'CALL_LOG_PROVIDER_BILLING_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514',
      DETAIL = format('call log %s attempted to overwrite established evidence', OLD.id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS call_log_evidence_guard ON public.call_logs;
CREATE TRIGGER call_log_evidence_guard
BEFORE UPDATE OR DELETE ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.protect_call_log_evidence();

REVOKE ALL ON FUNCTION public.protect_call_log_evidence()
  FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.call_logs IS
  'Durable tenant-bound call lifecycle, provider, reconciliation, and billing evidence. Browsers are read-only and physical deletion is prohibited.';
COMMENT ON FUNCTION public.protect_call_log_evidence() IS
  'Prevents physical deletion, tenant rebinding, provider identity replacement, and settled billing rollback on durable call evidence.';

COMMIT;
