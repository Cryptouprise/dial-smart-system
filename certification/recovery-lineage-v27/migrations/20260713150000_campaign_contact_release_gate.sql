BEGIN;

-- A campaign release is the last database-owned authorization required before
-- a real campaign contact can cross the Retell create-call boundary. There is
-- deliberately no seed data: absence of a matching, active release denies.
CREATE TABLE IF NOT EXISTS public.campaign_contact_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'retell' CHECK (provider = 'retell'),
  retell_agent_id text NOT NULL CHECK (retell_agent_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
  retell_agent_version integer NOT NULL CHECK (retell_agent_version >= 0),
  retell_llm_id text NOT NULL CHECK (retell_llm_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$'),
  retell_llm_version integer NOT NULL CHECK (retell_llm_version >= 0),
  caller_number_id uuid NOT NULL REFERENCES public.phone_numbers(id) ON DELETE RESTRICT,
  release_stage text NOT NULL CHECK (release_stage IN ('canary_5', 'canary_20', 'canary_50', 'normal')),
  cohort_limit integer NOT NULL CHECK (
    (release_stage = 'canary_5' AND cohort_limit = 5)
    OR (release_stage = 'canary_20' AND cohort_limit = 20)
    OR (release_stage = 'canary_50' AND cohort_limit = 50)
    OR (release_stage = 'normal' AND cohort_limit BETWEEN 1 AND 1000)
  ),
  campaign_bundle_sha256 text NOT NULL CHECK (campaign_bundle_sha256 ~ '^[a-f0-9]{64}$'),
  database_certificate_sha256 text NOT NULL CHECK (database_certificate_sha256 ~ '^[a-f0-9]{64}$'),
  provider_owned_phone_certificate_sha256 text NOT NULL CHECK (provider_owned_phone_certificate_sha256 ~ '^[a-f0-9]{64}$'),
  global_stop_drill_sha256 text NOT NULL CHECK (global_stop_drill_sha256 ~ '^[a-f0-9]{64}$'),
  seller_dnc_drill_sha256 text NOT NULL CHECK (seller_dnc_drill_sha256 ~ '^[a-f0-9]{64}$'),
  voice_opt_out_drill_sha256 text NOT NULL CHECK (voice_opt_out_drill_sha256 ~ '^[a-f0-9]{64}$'),
  conversation_suite_sha256 text NOT NULL CHECK (conversation_suite_sha256 ~ '^[a-f0-9]{64}$'),
  ghl_shadow_certificate_sha256 text NOT NULL CHECK (ghl_shadow_certificate_sha256 ~ '^[a-f0-9]{64}$'),
  approval_chain_sha256 text NOT NULL CHECK (approval_chain_sha256 ~ '^[a-f0-9]{64}$'),
  external_trust_root_sha256 text NOT NULL CHECK (external_trust_root_sha256 ~ '^[a-f0-9]{64}$'),
  activated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT campaign_contact_releases_expiry_after_activation CHECK (expires_at > activated_at),
  CONSTRAINT campaign_contact_releases_member_user_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS campaign_contact_releases_active_identity_key
  ON public.campaign_contact_releases (
    organization_id,
    user_id,
    campaign_id,
    provider,
    retell_agent_id,
    retell_agent_version,
    retell_llm_id,
    retell_llm_version,
    caller_number_id
  )
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS campaign_contact_releases_campaign_active_idx
  ON public.campaign_contact_releases (campaign_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.campaign_contact_release_members (
  release_id uuid NOT NULL REFERENCES public.campaign_contact_releases(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE RESTRICT,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (release_id, lead_id),
  CONSTRAINT campaign_contact_release_members_membership_fkey
    FOREIGN KEY (organization_id, user_id)
    REFERENCES public.organization_users(organization_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS campaign_contact_release_members_lookup_idx
  ON public.campaign_contact_release_members (campaign_id, lead_id, release_id);

CREATE OR REPLACE FUNCTION public.enforce_campaign_contact_release_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_AUDIT_DELETE_FORBIDDEN';
  END IF;

  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
    OR OLD.campaign_id IS DISTINCT FROM NEW.campaign_id
    OR OLD.provider IS DISTINCT FROM NEW.provider
    OR OLD.retell_agent_id IS DISTINCT FROM NEW.retell_agent_id
    OR OLD.retell_agent_version IS DISTINCT FROM NEW.retell_agent_version
    OR OLD.retell_llm_id IS DISTINCT FROM NEW.retell_llm_id
    OR OLD.retell_llm_version IS DISTINCT FROM NEW.retell_llm_version
    OR OLD.caller_number_id IS DISTINCT FROM NEW.caller_number_id
    OR OLD.release_stage IS DISTINCT FROM NEW.release_stage
    OR OLD.cohort_limit IS DISTINCT FROM NEW.cohort_limit
    OR OLD.campaign_bundle_sha256 IS DISTINCT FROM NEW.campaign_bundle_sha256
    OR OLD.database_certificate_sha256 IS DISTINCT FROM NEW.database_certificate_sha256
    OR OLD.provider_owned_phone_certificate_sha256 IS DISTINCT FROM NEW.provider_owned_phone_certificate_sha256
    OR OLD.global_stop_drill_sha256 IS DISTINCT FROM NEW.global_stop_drill_sha256
    OR OLD.seller_dnc_drill_sha256 IS DISTINCT FROM NEW.seller_dnc_drill_sha256
    OR OLD.voice_opt_out_drill_sha256 IS DISTINCT FROM NEW.voice_opt_out_drill_sha256
    OR OLD.conversation_suite_sha256 IS DISTINCT FROM NEW.conversation_suite_sha256
    OR OLD.ghl_shadow_certificate_sha256 IS DISTINCT FROM NEW.ghl_shadow_certificate_sha256
    OR OLD.approval_chain_sha256 IS DISTINCT FROM NEW.approval_chain_sha256
    OR OLD.external_trust_root_sha256 IS DISTINCT FROM NEW.external_trust_root_sha256
    OR OLD.activated_at IS DISTINCT FROM NEW.activated_at
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
    OR OLD.revoked_at IS NOT NULL
    OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_contact_releases_immutable ON public.campaign_contact_releases;
CREATE TRIGGER campaign_contact_releases_immutable
BEFORE UPDATE OR DELETE ON public.campaign_contact_releases
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_contact_release_immutable();

CREATE OR REPLACE FUNCTION public.enforce_campaign_contact_release_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.campaign_contact_releases%ROWTYPE;
  v_member_count integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_MEMBER_IMMUTABLE';
  END IF;

  SELECT * INTO v_release
  FROM public.campaign_contact_releases
  WHERE id = NEW.release_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_NOT_FOUND';
  END IF;
  IF v_release.revoked_at IS NOT NULL OR v_release.expires_at <= now() THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_NOT_ACTIVE';
  END IF;

  IF v_release.organization_id <> NEW.organization_id
    OR v_release.user_id <> NEW.user_id
    OR v_release.campaign_id <> NEW.campaign_id THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_MEMBER_IDENTITY_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaigns AS campaign
    JOIN public.leads AS lead ON lead.id = NEW.lead_id
    JOIN public.campaign_leads AS enrollment
      ON enrollment.campaign_id = campaign.id AND enrollment.lead_id = lead.id
    WHERE campaign.id = NEW.campaign_id
      AND campaign.organization_id = NEW.organization_id
      AND campaign.user_id = NEW.user_id
      AND lead.organization_id = NEW.organization_id
      AND lead.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_MEMBER_NOT_ENROLLED';
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.campaign_contact_release_members
  WHERE release_id = NEW.release_id;
  IF v_member_count + 1 > v_release.cohort_limit THEN
    RAISE EXCEPTION 'CAMPAIGN_CONTACT_RELEASE_COHORT_LIMIT_EXCEEDED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS campaign_contact_release_members_valid ON public.campaign_contact_release_members;
CREATE TRIGGER campaign_contact_release_members_valid
BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_contact_release_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_campaign_contact_release_member();

CREATE OR REPLACE FUNCTION public.evaluate_campaign_contact_release(
  p_user_id uuid,
  p_organization_id uuid,
  p_campaign_id uuid,
  p_lead_id uuid,
  p_provider text,
  p_retell_agent_id text,
  p_retell_agent_version integer,
  p_retell_llm_id text,
  p_retell_llm_version integer,
  p_caller_number_id uuid
)
RETURNS TABLE (
  allowed boolean,
  release_id uuid,
  release_stage text,
  reason_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_release public.campaign_contact_releases%ROWTYPE;
  v_matching_release public.campaign_contact_releases%ROWTYPE;
  v_member_count integer;
BEGIN
  IF p_user_id IS NULL OR p_organization_id IS NULL OR p_campaign_id IS NULL
    OR p_lead_id IS NULL OR p_caller_number_id IS NULL
    OR p_provider <> 'retell' OR p_retell_agent_id IS NULL
    OR p_retell_agent_version IS NULL OR p_retell_agent_version < 0
    OR p_retell_llm_id IS NULL OR p_retell_llm_version IS NULL
    OR p_retell_llm_version < 0 THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'CAMPAIGN_RELEASE_IDENTITY_MISMATCH'::text;
    RETURN;
  END IF;

  SELECT * INTO v_matching_release
  FROM public.campaign_contact_releases AS release
  WHERE release.organization_id = p_organization_id
    AND release.user_id = p_user_id
    AND release.campaign_id = p_campaign_id
    AND release.provider = p_provider
  ORDER BY release.activated_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'CAMPAIGN_RELEASE_NOT_FOUND'::text;
    RETURN;
  END IF;

  SELECT * INTO v_release
  FROM public.campaign_contact_releases AS release
  WHERE release.organization_id = p_organization_id
    AND release.user_id = p_user_id
    AND release.campaign_id = p_campaign_id
    AND release.provider = p_provider
    AND release.retell_agent_id = p_retell_agent_id
    AND release.retell_agent_version = p_retell_agent_version
    AND release.retell_llm_id = p_retell_llm_id
    AND release.retell_llm_version = p_retell_llm_version
    AND release.caller_number_id = p_caller_number_id
  ORDER BY release.activated_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'CAMPAIGN_RELEASE_IDENTITY_MISMATCH'::text;
    RETURN;
  END IF;
  IF v_release.revoked_at IS NOT NULL OR v_release.expires_at <= now() THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'CAMPAIGN_RELEASE_EXPIRED_OR_REVOKED'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    JOIN public.campaigns AS campaign
      ON campaign.id = p_campaign_id
      AND campaign.organization_id = p_organization_id
      AND campaign.user_id = p_user_id
      AND campaign.status = 'active'
      AND campaign.provider IN ('retell', 'both')
      AND campaign.agent_id = p_retell_agent_id
    JOIN public.leads AS lead
      ON lead.id = p_lead_id
      AND lead.organization_id = p_organization_id
      AND lead.user_id = p_user_id
    JOIN public.campaign_leads AS enrollment
      ON enrollment.campaign_id = campaign.id AND enrollment.lead_id = lead.id
    JOIN public.phone_numbers AS caller
      ON caller.id = p_caller_number_id
      AND caller.organization_id = p_organization_id
      AND caller.user_id = p_user_id
      AND caller.status = 'active'
      AND caller.retell_phone_id IS NOT NULL
    WHERE membership.organization_id = p_organization_id
      AND membership.user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'CAMPAIGN_RELEASE_IDENTITY_MISMATCH'::text;
    RETURN;
  END IF;

  SELECT count(*) INTO v_member_count
  FROM public.campaign_contact_release_members AS member
  WHERE member.release_id = v_release.id
    AND member.organization_id = p_organization_id
    AND member.user_id = p_user_id
    AND member.campaign_id = p_campaign_id;
  IF v_member_count < 1 OR v_member_count > v_release.cohort_limit THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'CAMPAIGN_RELEASE_COHORT_LIMIT_INVALID'::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_contact_release_members AS member
    WHERE member.release_id = v_release.id
      AND member.organization_id = p_organization_id
      AND member.user_id = p_user_id
      AND member.campaign_id = p_campaign_id
      AND member.lead_id = p_lead_id
  ) THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::text, 'LEAD_NOT_IN_RELEASE_COHORT'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_release.id, v_release.release_stage, 'CONTACT_RELEASE_APPROVED'::text;
END;
$$;

ALTER TABLE public.campaign_contact_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contact_release_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.campaign_contact_releases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.campaign_contact_release_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_campaign_contact_release(
  uuid, uuid, uuid, uuid, text, text, integer, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_campaign_contact_release(
  uuid, uuid, uuid, uuid, text, text, integer, text, integer, uuid
) TO service_role;

COMMENT ON TABLE public.campaign_contact_releases IS
  'Default-deny, evidence-bound campaign contact releases. No row means no real campaign call.';
COMMENT ON TABLE public.campaign_contact_release_members IS
  'Explicit, immutable lead cohorts permitted by a single campaign contact release.';
COMMENT ON FUNCTION public.evaluate_campaign_contact_release(
  uuid, uuid, uuid, uuid, text, text, integer, text, integer, uuid
) IS
  'Final default-deny campaign/lead/provider/evidence release decision before Retell create-phone-call.';

COMMIT;
