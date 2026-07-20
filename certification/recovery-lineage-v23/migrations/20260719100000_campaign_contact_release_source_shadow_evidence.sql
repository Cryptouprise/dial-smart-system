BEGIN;

-- The original release gate named its only source-evidence column after the
-- first optional CRM adapter. A direct signed export is now a first-class
-- source path, so retain the legacy GHL digest only for legacy/GHL rows while
-- recording the actual source adapter and its evidence generically.
ALTER TABLE public.campaign_contact_releases
  ADD COLUMN source_shadow_adapter text,
  ADD COLUMN source_shadow_certificate_sha256 text;

UPDATE public.campaign_contact_releases
SET
  source_shadow_adapter = 'signed_ghl_shadow',
  source_shadow_certificate_sha256 = ghl_shadow_certificate_sha256
WHERE source_shadow_adapter IS NULL
  AND source_shadow_certificate_sha256 IS NULL;

ALTER TABLE public.campaign_contact_releases
  ALTER COLUMN ghl_shadow_certificate_sha256 DROP NOT NULL,
  ALTER COLUMN source_shadow_adapter SET NOT NULL,
  ALTER COLUMN source_shadow_certificate_sha256 SET NOT NULL,
  ADD CONSTRAINT campaign_contact_releases_source_shadow_adapter_check
    CHECK (source_shadow_adapter IN ('signed_direct_import', 'signed_ghl_shadow')),
  ADD CONSTRAINT campaign_contact_releases_source_shadow_certificate_sha256_check
    CHECK (source_shadow_certificate_sha256 ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT campaign_contact_releases_source_shadow_adapter_evidence_check
    CHECK (
      (source_shadow_adapter = 'signed_direct_import' AND ghl_shadow_certificate_sha256 IS NULL)
      OR (
        source_shadow_adapter = 'signed_ghl_shadow'
        AND ghl_shadow_certificate_sha256 = source_shadow_certificate_sha256
      )
    );

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
    OR OLD.source_shadow_adapter IS DISTINCT FROM NEW.source_shadow_adapter
    OR OLD.source_shadow_certificate_sha256 IS DISTINCT FROM NEW.source_shadow_certificate_sha256
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

COMMENT ON COLUMN public.campaign_contact_releases.source_shadow_adapter IS
  'Exact, independently reconciled source path: signed_direct_import or signed_ghl_shadow.';
COMMENT ON COLUMN public.campaign_contact_releases.source_shadow_certificate_sha256 IS
  'SHA-256 of the source-path reconciliation certificate bound to this release.';
COMMENT ON COLUMN public.campaign_contact_releases.ghl_shadow_certificate_sha256 IS
  'Legacy GHL-only evidence digest. Present only when source_shadow_adapter is signed_ghl_shadow.';

COMMIT;
