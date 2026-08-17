BEGIN;

-- The external observer runtime authenticates an installation/principal before
-- it reaches this service-only summary. The RPC binds the same organization,
-- user, and campaign identities again and returns only a non-PII release
-- summary. It cannot authorize a lead or create a provider call.
CREATE OR REPLACE FUNCTION public.get_campaign_contact_release_observer_status(
  p_organization_id uuid,
  p_user_id uuid,
  p_campaign_id uuid
)
RETURNS TABLE (
  release_state text,
  release_stage text,
  release_expires_at timestamptz,
  cohort_limit integer,
  cohort_member_count integer,
  final_contact_evaluation_required boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_active_release public.campaign_contact_releases%ROWTYPE;
  v_latest_release public.campaign_contact_releases%ROWTYPE;
  v_member_count integer;
BEGIN
  IF p_organization_id IS NULL OR p_user_id IS NULL OR p_campaign_id IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.organization_users AS membership
      JOIN public.campaigns AS campaign
        ON campaign.id = p_campaign_id
       AND campaign.organization_id = p_organization_id
       AND campaign.user_id = p_user_id
      WHERE membership.organization_id = p_organization_id
        AND membership.user_id = p_user_id
    )
  THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_OBSERVER_STATUS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_active_release
  FROM public.campaign_contact_releases AS release
  WHERE release.campaign_id = p_campaign_id
    AND release.organization_id = p_organization_id
    AND release.user_id = p_user_id
    AND release.revoked_at IS NULL
    AND release.expires_at > now()
  ORDER BY release.activated_at DESC, release.id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT count(*) INTO v_member_count
    FROM public.campaign_contact_release_members AS member
    WHERE member.release_id = v_active_release.id
      AND member.campaign_id = p_campaign_id
      AND member.organization_id = p_organization_id
      AND member.user_id = p_user_id;

    IF v_member_count < 1 OR v_member_count > v_active_release.cohort_limit THEN
      RETURN QUERY SELECT
        'current_release_cohort_invalid'::text,
        v_active_release.release_stage,
        v_active_release.expires_at,
        v_active_release.cohort_limit,
        v_member_count,
        true;
      RETURN;
    END IF;

    RETURN QUERY SELECT
      'current_release_present'::text,
      v_active_release.release_stage,
      v_active_release.expires_at,
      v_active_release.cohort_limit,
      v_member_count,
      true;
    RETURN;
  END IF;

  SELECT * INTO v_latest_release
  FROM public.campaign_contact_releases AS release
  WHERE release.campaign_id = p_campaign_id
    AND release.organization_id = p_organization_id
    AND release.user_id = p_user_id
  ORDER BY release.activated_at DESC, release.id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT count(*) INTO v_member_count
    FROM public.campaign_contact_release_members AS member
    WHERE member.release_id = v_latest_release.id
      AND member.campaign_id = p_campaign_id
      AND member.organization_id = p_organization_id
      AND member.user_id = p_user_id;

    RETURN QUERY SELECT
      'latest_release_expired_or_revoked'::text,
      v_latest_release.release_stage,
      v_latest_release.expires_at,
      v_latest_release.cohort_limit,
      v_member_count,
      true;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'no_release'::text,
    NULL::text,
    NULL::timestamptz,
    NULL::integer,
    0,
    true;
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_contact_release_observer_status(
  uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_contact_release_observer_status(
  uuid, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.get_campaign_contact_release_observer_status(uuid, uuid, uuid) IS
  'Service-only, non-PII release summary for the authenticated external observer runtime. Never authorizes an individual contact.';

COMMIT;
