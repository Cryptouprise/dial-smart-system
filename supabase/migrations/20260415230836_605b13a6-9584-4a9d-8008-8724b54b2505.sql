
CREATE OR REPLACE FUNCTION public.claim_pending_dispatches(
  p_campaign_ids UUID[],
  p_limit INT DEFAULT 50
)
RETURNS SETOF public.dialing_queues
LANGUAGE SQL
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

GRANT EXECUTE ON FUNCTION public.claim_pending_dispatches(UUID[], INT) TO service_role;
