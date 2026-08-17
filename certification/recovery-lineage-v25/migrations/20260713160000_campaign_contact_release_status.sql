BEGIN;

-- This is deliberately a summary-only operator view. It lets an authenticated
-- tenant member see whether a campaign has a current release record without
-- exposing lead membership, provider identifiers, caller IDs, or evidence
-- digests. A current record is never a per-contact authorization: outbound
-- calling still evaluates the exact lead and live provider configuration at
-- the final service-only boundary.
CREATE OR REPLACE FUNCTION public.get_campaign_contact_release_status(
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
  v_organization_id uuid;
  v_active_release public.campaign_contact_releases%ROWTYPE;
  v_latest_release public.campaign_contact_releases%ROWTYPE;
  v_member_count integer;
BEGIN
  IF p_campaign_id IS NULL OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_STATUS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT campaign.organization_id
  INTO v_organization_id
  FROM public.campaigns AS campaign
  JOIN public.organization_users AS membership
    ON membership.organization_id = campaign.organization_id
   AND membership.user_id = auth.uid()
  WHERE campaign.id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_STATUS_NOT_AUTHORIZED'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_active_release
  FROM public.campaign_contact_releases AS release
  WHERE release.campaign_id = p_campaign_id
    AND release.organization_id = v_organization_id
    AND release.revoked_at IS NULL
    AND release.expires_at > now()
  ORDER BY release.activated_at DESC, release.id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT count(*) INTO v_member_count
    FROM public.campaign_contact_release_members AS member
    WHERE member.release_id = v_active_release.id
      AND member.campaign_id = p_campaign_id
      AND member.organization_id = v_organization_id;

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
    AND release.organization_id = v_organization_id
  ORDER BY release.activated_at DESC, release.id DESC
  LIMIT 1;
  IF FOUND THEN
    SELECT count(*) INTO v_member_count
    FROM public.campaign_contact_release_members AS member
    WHERE member.release_id = v_latest_release.id
      AND member.campaign_id = p_campaign_id
      AND member.organization_id = v_organization_id;

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

REVOKE ALL ON FUNCTION public.get_campaign_contact_release_status(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_campaign_contact_release_status(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_campaign_contact_release_status(uuid) IS
  'Tenant-scoped, summary-only campaign release status. Never authorizes an individual contact; the final service-only evaluator remains mandatory.';

COMMIT;
