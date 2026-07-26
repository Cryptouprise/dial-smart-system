BEGIN;

-- Phase 1 is an observer-only boundary. It records verified external command
-- deliveries, exact replays, and event-ID collisions, but it cannot authorize
-- contact, launch, queue, CRM, or spend effects.

-- ---------------------------------------------------------------------------
-- Quarantine legacy browser-readable OAuth credentials without deleting or
-- rewriting any stored token. Service-side migration access remains available.
-- ---------------------------------------------------------------------------

ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;

DO $calendar_quarantine$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'calendar_integrations'
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON public.calendar_integrations',
      policy_name
    );
  END LOOP;

  SELECT string_agg(
    format('%I', attribute.attname),
    ', ' ORDER BY attribute.attnum
  )
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.calendar_integrations'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.calendar_integrations
    FROM PUBLIC, anon, authenticated, service_role;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.calendar_integrations '
      'FROM PUBLIC, anon, authenticated, service_role',
      column_list
    );
  END IF;
END;
$calendar_quarantine$;

CREATE POLICY "Service role manages quarantined calendar integrations"
  ON public.calendar_integrations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.calendar_integrations TO service_role;

COMMENT ON TABLE public.calendar_integrations IS
  'Launch-quarantined legacy OAuth storage. Browser roles have no direct table or column privileges; stored token values are preserved for a later service-side Vault migration.';
COMMENT ON COLUMN public.calendar_integrations.access_token_encrypted IS
  'Legacy token value with no trustworthy encryption guarantee. Service-side migration input only; never expose to a browser.';
COMMENT ON COLUMN public.calendar_integrations.refresh_token_encrypted IS
  'Legacy token value with no trustworthy encryption guarantee. Service-side migration input only; never expose to a browser.';

-- ---------------------------------------------------------------------------
-- API keys remain service-minted and service-managed. Authenticated users may
-- read only their own metadata inside a live, explicit organization binding.
-- ---------------------------------------------------------------------------

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DO $api_key_policies$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'api_keys'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.api_keys', policy_name);
  END LOOP;

  SELECT string_agg(
    format('%I', attribute.attname),
    ', ' ORDER BY attribute.attnum
  )
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.api_keys'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.api_keys
    FROM PUBLIC, anon, authenticated, service_role;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.api_keys '
      'FROM PUBLIC, anon, authenticated, service_role',
      column_list
    );
  END IF;
END;
$api_key_policies$;

CREATE POLICY "Users read their tenant-bound API key metadata"
  ON public.api_keys
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND organization_id IS NOT NULL
    AND public.user_in_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Service role manages API keys"
  ON public.api_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT (
  id,
  organization_id,
  user_id,
  name,
  key_prefix,
  scopes,
  rate_limit_per_minute,
  last_used_at,
  expires_at,
  revoked_at,
  created_at,
  updated_at
) ON TABLE public.api_keys TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.api_keys TO service_role;

REVOKE ALL ON FUNCTION public.mint_api_key(
  uuid, text, text[], uuid, integer, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mint_api_key(
  uuid, text, text[], uuid, integer, timestamptz
) TO service_role;

-- Reassert the older per-request usage helper as a service-only capability.
-- It is SECURITY DEFINER in legacy history, so both its ACL and search path
-- must be pinned even if an earlier hardening migration already revoked it.
ALTER FUNCTION public.touch_api_key(uuid, text) SET search_path = '';
REVOKE ALL ON FUNCTION public.touch_api_key(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_api_key(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- A browser may inspect only its own live tenant-bound Slack mapping. It can no
-- longer self-claim a guessed Slack workspace/user identity or delete evidence.
-- ---------------------------------------------------------------------------

ALTER TABLE public.slack_users ENABLE ROW LEVEL SECURITY;

DO $slack_mapping_policies$
DECLARE
  policy_name text;
  column_list text;
BEGIN
  FOR policy_name IN
    SELECT policy.policyname
    FROM pg_policies AS policy
    WHERE policy.schemaname = 'public'
      AND policy.tablename = 'slack_users'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.slack_users', policy_name);
  END LOOP;

  SELECT string_agg(
    format('%I', attribute.attname),
    ', ' ORDER BY attribute.attnum
  )
  INTO column_list
  FROM pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.slack_users'::regclass
    AND attribute.attnum > 0
    AND NOT attribute.attisdropped;

  REVOKE ALL PRIVILEGES ON TABLE public.slack_users
    FROM PUBLIC, anon, authenticated, service_role;
  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%s) ON TABLE public.slack_users '
      'FROM PUBLIC, anon, authenticated, service_role',
      column_list
    );
  END IF;
END;
$slack_mapping_policies$;

CREATE POLICY "Users read their tenant-bound Slack mapping"
  ON public.slack_users
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND organization_id IS NOT NULL
    AND public.user_in_organization(auth.uid(), organization_id)
  );

CREATE POLICY "Service role manages Slack mappings"
  ON public.slack_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON TABLE public.slack_users TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.slack_users TO service_role;

-- ---------------------------------------------------------------------------
-- Tenant-bound observer installations, verified principals, immutable logical
-- claims, and one append-only delivery receipt per first/replay/collision.
-- ---------------------------------------------------------------------------

CREATE TYPE public.external_control_provider AS ENUM (
  'slack',
  'teams',
  'zapier',
  'mcp'
);

CREATE TABLE public.external_control_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  provider public.external_control_provider NOT NULL,
  external_tenant_id_hmac text NOT NULL,
  external_installation_id_hmac text NOT NULL,
  external_route_id_hmac text NOT NULL,
  identifier_key_version text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'revoked')),
  created_by_user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  queue_mutation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  crm_write_authorized boolean GENERATED ALWAYS AS (false) STORED,
  spend_authorized boolean GENERATED ALWAYS AS (false) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  suspended_at timestamptz,
  revoked_at timestamptz,
  CONSTRAINT external_control_installation_hashes CHECK (
    external_tenant_id_hmac ~ '^[a-f0-9]{64}$'
    AND external_installation_id_hmac ~ '^[a-f0-9]{64}$'
    AND external_route_id_hmac ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT external_control_installation_key_version CHECK (
    identifier_key_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  CONSTRAINT external_control_installation_lifecycle CHECK (
    (status = 'pending'
      AND activated_at IS NULL AND suspended_at IS NULL AND revoked_at IS NULL)
    OR (status = 'active'
      AND activated_at IS NOT NULL AND suspended_at IS NULL AND revoked_at IS NULL)
    OR (status = 'suspended'
      AND activated_at IS NOT NULL AND suspended_at IS NOT NULL AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT external_control_installation_id_org_unique
    UNIQUE (id, organization_id),
  CONSTRAINT external_control_installation_id_org_provider_unique
    UNIQUE (id, organization_id, provider),
  CONSTRAINT external_control_route_tenant_unique
    UNIQUE (provider, external_tenant_id_hmac, external_route_id_hmac),
  CONSTRAINT external_control_route_installation_unique
    UNIQUE (provider, external_installation_id_hmac, external_route_id_hmac)
);

CREATE INDEX external_control_installations_org_status
  ON public.external_control_installations (organization_id, status, created_at);

CREATE TABLE public.external_control_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  external_principal_id_hmac text NOT NULL,
  user_id uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  verification_evidence_sha256 text NOT NULL,
  identifier_key_version text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'revoked')),
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  queue_mutation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  crm_write_authorized boolean GENERATED ALWAYS AS (false) STORED,
  spend_authorized boolean GENERATED ALWAYS AS (false) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT external_control_principal_installation_fk
    FOREIGN KEY (installation_id, organization_id)
    REFERENCES public.external_control_installations(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT external_control_principal_hashes CHECK (
    external_principal_id_hmac ~ '^[a-f0-9]{64}$'
    AND verification_evidence_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT external_control_principal_key_version CHECK (
    identifier_key_version ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'
  ),
  CONSTRAINT external_control_principal_lifecycle CHECK (
    (status = 'active' AND revoked_at IS NULL)
    OR (status = 'revoked' AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT external_control_principal_external_unique
    UNIQUE (installation_id, external_principal_id_hmac),
  CONSTRAINT external_control_principal_scope_unique
    UNIQUE (id, installation_id, organization_id)
);

CREATE INDEX external_control_principals_org_user_status
  ON public.external_control_principals
    (organization_id, user_id, status, created_at);

CREATE TABLE public.external_command_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL,
  provider public.external_control_provider NOT NULL,
  external_event_id_hmac text NOT NULL,
  payload_sha256 text NOT NULL,
  intent_sha256 text NOT NULL,
  command_name text NOT NULL,
  command_schema_version text NOT NULL,
  source_occurred_at timestamptz NOT NULL,
  decision text GENERATED ALWAYS AS ('held'::text) STORED,
  reason_codes text[] GENERATED ALWAYS AS (ARRAY['OBSERVER_ONLY']::text[]) STORED,
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  queue_mutation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  crm_write_authorized boolean GENERATED ALWAYS AS (false) STORED,
  spend_authorized boolean GENERATED ALWAYS AS (false) STORED,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_command_claim_installation_fk
    FOREIGN KEY (installation_id, organization_id, provider)
    REFERENCES public.external_control_installations(id, organization_id, provider)
    ON DELETE RESTRICT,
  CONSTRAINT external_command_claim_principal_fk
    FOREIGN KEY (principal_id, installation_id, organization_id)
    REFERENCES public.external_control_principals(id, installation_id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT external_command_claim_hashes CHECK (
    external_event_id_hmac ~ '^[a-f0-9]{64}$'
    AND payload_sha256 ~ '^[a-f0-9]{64}$'
    AND intent_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT external_command_claim_name CHECK (
    command_name IN (
      'operator.context',
      'system.status',
      'campaign.list',
      'campaign.inspect'
    )
  ),
  CONSTRAINT external_command_claim_schema_version CHECK (
    command_schema_version = 'control.command.v1'
  ),
  CONSTRAINT external_command_claim_event_unique
    UNIQUE (installation_id, external_event_id_hmac),
  CONSTRAINT external_command_claim_scope_unique
    UNIQUE (id, installation_id, organization_id, provider)
);

CREATE INDEX external_command_claims_org_received
  ON public.external_command_claims (organization_id, received_at, id);

CREATE TABLE public.external_command_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL,
  installation_id uuid NOT NULL,
  organization_id uuid NOT NULL
    REFERENCES public.organizations(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL,
  provider public.external_control_provider NOT NULL,
  attempted_external_event_id_hmac text NOT NULL,
  attempted_payload_sha256 text NOT NULL,
  attempted_intent_sha256 text NOT NULL,
  attempted_command_name text NOT NULL,
  attempted_command_schema_version text NOT NULL,
  attempted_source_occurred_at timestamptz NOT NULL,
  commit_status text NOT NULL
    CHECK (commit_status IN ('committed', 'duplicate', 'event_id_collision')),
  decision text NOT NULL CHECK (decision IN ('held', 'quarantined')),
  reason_codes text[] NOT NULL,
  contact_authorized boolean GENERATED ALWAYS AS (false) STORED,
  launch_authorized boolean GENERATED ALWAYS AS (false) STORED,
  queue_mutation_authorized boolean GENERATED ALWAYS AS (false) STORED,
  crm_write_authorized boolean GENERATED ALWAYS AS (false) STORED,
  spend_authorized boolean GENERATED ALWAYS AS (false) STORED,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_command_receipt_claim_fk
    FOREIGN KEY (claim_id, installation_id, organization_id, provider)
    REFERENCES public.external_command_claims(id, installation_id, organization_id, provider)
    ON DELETE RESTRICT,
  CONSTRAINT external_command_receipt_installation_fk
    FOREIGN KEY (installation_id, organization_id, provider)
    REFERENCES public.external_control_installations(id, organization_id, provider)
    ON DELETE RESTRICT,
  CONSTRAINT external_command_receipt_principal_fk
    FOREIGN KEY (principal_id, installation_id, organization_id)
    REFERENCES public.external_control_principals(id, installation_id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT external_command_receipt_hashes CHECK (
    attempted_external_event_id_hmac ~ '^[a-f0-9]{64}$'
    AND attempted_payload_sha256 ~ '^[a-f0-9]{64}$'
    AND attempted_intent_sha256 ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT external_command_receipt_name CHECK (
    attempted_command_name IN (
      'operator.context',
      'system.status',
      'campaign.list',
      'campaign.inspect'
    )
  ),
  CONSTRAINT external_command_receipt_schema_version CHECK (
    attempted_command_schema_version = 'control.command.v1'
  ),
  CONSTRAINT external_command_receipt_classification CHECK (
    (commit_status = 'committed'
      AND decision = 'held'
      AND reason_codes = ARRAY['OBSERVER_ONLY']::text[])
    OR (commit_status = 'duplicate'
      AND decision = 'held'
      AND reason_codes = ARRAY['EXACT_REPLAY', 'OBSERVER_ONLY']::text[])
    OR (commit_status = 'event_id_collision'
      AND decision = 'quarantined'
      AND reason_codes = ARRAY['EXTERNAL_EVENT_ID_COLLISION', 'OBSERVER_ONLY']::text[])
  )
);

CREATE INDEX external_command_receipts_org_attempted
  ON public.external_command_receipts (organization_id, attempted_at, id);
CREATE INDEX external_command_receipts_claim_attempted
  ON public.external_command_receipts (claim_id, attempted_at, id);

ALTER TABLE public.external_control_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_control_installations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_control_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_control_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_command_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_command_claims FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_command_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_command_receipts FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.external_control_is_org_admin(org_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_users AS membership
    WHERE membership.organization_id = org_uuid
      AND membership.user_id = auth.uid()
      AND membership.role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.external_control_is_org_admin(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.external_control_is_org_admin(uuid)
  TO authenticated, service_role;

CREATE POLICY "Organization owners and admins view external installations"
  ON public.external_control_installations
  FOR SELECT
  TO authenticated
  USING (public.external_control_is_org_admin(organization_id));
CREATE POLICY "Organization owners and admins view external principals"
  ON public.external_control_principals
  FOR SELECT
  TO authenticated
  USING (public.external_control_is_org_admin(organization_id));
CREATE POLICY "Organization owners and admins view external claims"
  ON public.external_command_claims
  FOR SELECT
  TO authenticated
  USING (public.external_control_is_org_admin(organization_id));
CREATE POLICY "Organization owners and admins view external receipts"
  ON public.external_command_receipts
  FOR SELECT
  TO authenticated
  USING (public.external_control_is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.guard_external_control_installation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EXTERNAL_CONTROL_INSTALLATION_DELETE_FORBIDDEN'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('pending', 'active') THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_INSTALLATION_INVALID_INITIAL_STATUS'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_users AS membership
      WHERE membership.organization_id = NEW.organization_id
        AND membership.user_id = NEW.created_by_user_id
        AND membership.role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_INSTALLATION_ADMIN_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'active' THEN
      NEW.activated_at := COALESCE(NEW.activated_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.provider IS DISTINCT FROM OLD.provider
    OR NEW.external_tenant_id_hmac IS DISTINCT FROM OLD.external_tenant_id_hmac
    OR NEW.external_installation_id_hmac IS DISTINCT FROM OLD.external_installation_id_hmac
    OR NEW.external_route_id_hmac IS DISTINCT FROM OLD.external_route_id_hmac
    OR NEW.identifier_key_version IS DISTINCT FROM OLD.identifier_key_version
    OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'EXTERNAL_CONTROL_INSTALLATION_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
    AND (
      NEW.activated_at IS DISTINCT FROM OLD.activated_at
      OR NEW.suspended_at IS DISTINCT FROM OLD.suspended_at
      OR NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
    )
  THEN
    RAISE EXCEPTION 'EXTERNAL_CONTROL_INSTALLATION_LIFECYCLE_MANAGED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'pending' AND NEW.status IN ('active', 'revoked'))
      OR (OLD.status = 'active' AND NEW.status IN ('suspended', 'revoked'))
      OR (OLD.status = 'suspended' AND NEW.status IN ('active', 'revoked'))
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_INSTALLATION_INVALID_TRANSITION:%->%',
        OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;

    IF NEW.status = 'active' THEN
      NEW.activated_at := COALESCE(OLD.activated_at, now());
      NEW.suspended_at := NULL;
      NEW.revoked_at := NULL;
    ELSIF NEW.status = 'suspended' THEN
      NEW.activated_at := OLD.activated_at;
      NEW.suspended_at := now();
      NEW.revoked_at := NULL;
    ELSIF NEW.status = 'revoked' THEN
      NEW.activated_at := OLD.activated_at;
      NEW.suspended_at := OLD.suspended_at;
      NEW.revoked_at := now();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER external_control_installation_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.external_control_installations
FOR EACH ROW EXECUTE FUNCTION public.guard_external_control_installation();

CREATE OR REPLACE FUNCTION public.guard_external_control_principal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_DELETE_FORBIDDEN'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_INVALID_INITIAL_STATUS'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.external_control_installations AS installation
      WHERE installation.id = NEW.installation_id
        AND installation.organization_id = NEW.organization_id
        AND installation.status = 'active'
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_ACTIVE_INSTALLATION_REQUIRED'
      USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.external_control_installations AS installation
      WHERE installation.id = NEW.installation_id
        AND installation.organization_id = NEW.organization_id
        AND installation.identifier_key_version = NEW.identifier_key_version
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_KEY_VERSION_MISMATCH'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_users AS membership
      WHERE membership.organization_id = NEW.organization_id
        AND membership.user_id = NEW.user_id
        AND membership.role IN ('owner', 'admin')
    ) THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_ADMIN_REQUIRED'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.installation_id IS DISTINCT FROM OLD.installation_id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.external_principal_id_hmac IS DISTINCT FROM OLD.external_principal_id_hmac
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.verification_evidence_sha256 IS DISTINCT FROM OLD.verification_evidence_sha256
    OR NEW.identifier_key_version IS DISTINCT FROM OLD.identifier_key_version
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_IDENTITY_IMMUTABLE'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
  THEN
    RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_LIFECYCLE_MANAGED'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status <> 'active' OR NEW.status <> 'revoked' THEN
      RAISE EXCEPTION 'EXTERNAL_CONTROL_PRINCIPAL_REVOCATION_ONE_WAY'
        USING ERRCODE = '23514';
    END IF;
    NEW.revoked_at := now();
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER external_control_principal_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.external_control_principals
FOR EACH ROW EXECUTE FUNCTION public.guard_external_control_principal();

CREATE OR REPLACE FUNCTION public.protect_external_command_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'EXTERNAL_COMMAND_EVIDENCE_APPEND_ONLY:%', TG_TABLE_NAME
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER external_command_claim_append_only
BEFORE UPDATE OR DELETE ON public.external_command_claims
FOR EACH ROW EXECUTE FUNCTION public.protect_external_command_evidence();
CREATE TRIGGER external_command_receipt_append_only
BEFORE UPDATE OR DELETE ON public.external_command_receipts
FOR EACH ROW EXECUTE FUNCTION public.protect_external_command_evidence();

CREATE OR REPLACE FUNCTION public.protect_external_control_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'EXTERNAL_CONTROL_TRUNCATE_FORBIDDEN:%', TG_TABLE_NAME
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER external_control_installation_no_truncate
BEFORE TRUNCATE ON public.external_control_installations
FOR EACH STATEMENT EXECUTE FUNCTION public.protect_external_control_truncate();
CREATE TRIGGER external_control_principal_no_truncate
BEFORE TRUNCATE ON public.external_control_principals
FOR EACH STATEMENT EXECUTE FUNCTION public.protect_external_control_truncate();
CREATE TRIGGER external_command_claim_no_truncate
BEFORE TRUNCATE ON public.external_command_claims
FOR EACH STATEMENT EXECUTE FUNCTION public.protect_external_control_truncate();
CREATE TRIGGER external_command_receipt_no_truncate
BEFORE TRUNCATE ON public.external_command_receipts
FOR EACH STATEMENT EXECUTE FUNCTION public.protect_external_control_truncate();

CREATE OR REPLACE FUNCTION public.claim_external_observer_command(
  p_organization_id uuid,
  p_installation_id uuid,
  p_external_principal_id_hmac text,
  p_external_event_id_hmac text,
  p_payload_sha256 text,
  p_intent_sha256 text,
  p_command_name text,
  p_command_schema_version text,
  p_source_occurred_at timestamptz
)
RETURNS TABLE (
  claim_id uuid,
  receipt_id uuid,
  commit_status text,
  decision text,
  reason_codes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  installation public.external_control_installations%ROWTYPE;
  principal public.external_control_principals%ROWTYPE;
  logical_claim public.external_command_claims%ROWTYPE;
  inserted_claim_id uuid;
  inserted_receipt_id uuid;
  final_commit_status text;
  final_decision text;
  final_reason_codes text[];
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'EXTERNAL_OBSERVER_SERVICE_ROLE_REQUIRED'
      USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL OR p_installation_id IS NULL THEN
    RAISE EXCEPTION 'EXTERNAL_OBSERVER_EXPLICIT_ORGANIZATION_AND_INSTALLATION_REQUIRED'
      USING ERRCODE = '22023';
  END IF;
  IF p_external_principal_id_hmac IS NULL
    OR p_external_principal_id_hmac !~ '^[a-f0-9]{64}$'
    OR p_external_event_id_hmac IS NULL
    OR p_external_event_id_hmac !~ '^[a-f0-9]{64}$'
    OR p_payload_sha256 IS NULL
    OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
    OR p_intent_sha256 IS NULL
    OR p_intent_sha256 !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'EXTERNAL_OBSERVER_CANONICAL_HASH_REQUIRED'
      USING ERRCODE = '22023';
  END IF;
  IF p_command_name IS NULL
    OR p_command_name NOT IN (
      'operator.context',
      'system.status',
      'campaign.list',
      'campaign.inspect'
    )
    OR p_command_schema_version IS DISTINCT FROM 'control.command.v1'
    OR p_source_occurred_at IS NULL
  THEN
    RAISE EXCEPTION 'EXTERNAL_OBSERVER_CANONICAL_COMMAND_ENVELOPE_REQUIRED'
      USING ERRCODE = '22023';
  END IF;

  SELECT candidate.*
  INTO installation
  FROM public.external_control_installations AS candidate
  WHERE candidate.id = p_installation_id
    AND candidate.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND OR installation.status <> 'active' THEN
    RAISE EXCEPTION 'EXTERNAL_OBSERVER_ACTIVE_INSTALLATION_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  SELECT candidate.*
  INTO principal
  FROM public.external_control_principals AS candidate
  JOIN public.organization_users AS membership
    ON membership.organization_id = candidate.organization_id
   AND membership.user_id = candidate.user_id
   AND membership.role IN ('owner', 'admin')
  WHERE candidate.installation_id = installation.id
    AND candidate.organization_id = installation.organization_id
    AND candidate.external_principal_id_hmac = p_external_principal_id_hmac
    AND candidate.status = 'active'
  FOR UPDATE OF candidate, membership;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXTERNAL_OBSERVER_LIVE_ADMIN_PRINCIPAL_REQUIRED'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.external_command_claims (
    installation_id,
    organization_id,
    principal_id,
    provider,
    external_event_id_hmac,
    payload_sha256,
    intent_sha256,
    command_name,
    command_schema_version,
    source_occurred_at
  ) VALUES (
    installation.id,
    installation.organization_id,
    principal.id,
    installation.provider,
    p_external_event_id_hmac,
    p_payload_sha256,
    p_intent_sha256,
    p_command_name,
    p_command_schema_version,
    p_source_occurred_at
  )
  ON CONFLICT (installation_id, external_event_id_hmac) DO NOTHING
  RETURNING id INTO inserted_claim_id;

  IF inserted_claim_id IS NOT NULL THEN
    SELECT candidate.*
    INTO STRICT logical_claim
    FROM public.external_command_claims AS candidate
    WHERE candidate.id = inserted_claim_id;
    final_commit_status := 'committed';
    final_decision := 'held';
    final_reason_codes := ARRAY['OBSERVER_ONLY']::text[];
  ELSE
    SELECT candidate.*
    INTO STRICT logical_claim
    FROM public.external_command_claims AS candidate
    WHERE candidate.installation_id = installation.id
      AND candidate.external_event_id_hmac = p_external_event_id_hmac
    FOR UPDATE;

    IF logical_claim.organization_id = installation.organization_id
      AND logical_claim.principal_id = principal.id
      AND logical_claim.provider = installation.provider
      AND logical_claim.payload_sha256 = p_payload_sha256
      AND logical_claim.intent_sha256 = p_intent_sha256
      AND logical_claim.command_name = p_command_name
      AND logical_claim.command_schema_version = p_command_schema_version
      AND logical_claim.source_occurred_at = p_source_occurred_at
    THEN
      final_commit_status := 'duplicate';
      final_decision := 'held';
      final_reason_codes := ARRAY['EXACT_REPLAY', 'OBSERVER_ONLY']::text[];
    ELSE
      final_commit_status := 'event_id_collision';
      final_decision := 'quarantined';
      final_reason_codes := ARRAY['EXTERNAL_EVENT_ID_COLLISION', 'OBSERVER_ONLY']::text[];
    END IF;
  END IF;

  INSERT INTO public.external_command_receipts (
    claim_id,
    installation_id,
    organization_id,
    principal_id,
    provider,
    attempted_external_event_id_hmac,
    attempted_payload_sha256,
    attempted_intent_sha256,
    attempted_command_name,
    attempted_command_schema_version,
    attempted_source_occurred_at,
    commit_status,
    decision,
    reason_codes
  ) VALUES (
    logical_claim.id,
    installation.id,
    installation.organization_id,
    principal.id,
    installation.provider,
    p_external_event_id_hmac,
    p_payload_sha256,
    p_intent_sha256,
    p_command_name,
    p_command_schema_version,
    p_source_occurred_at,
    final_commit_status,
    final_decision,
    final_reason_codes
  )
  RETURNING id INTO inserted_receipt_id;

  claim_id := logical_claim.id;
  receipt_id := inserted_receipt_id;
  commit_status := final_commit_status;
  decision := final_decision;
  reason_codes := final_reason_codes;
  RETURN NEXT;
END;
$$;

DO $external_control_privileges$
DECLARE
  table_name text;
  column_list text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'external_control_installations',
    'external_control_principals',
    'external_command_claims',
    'external_command_receipts'
  ] LOOP
    SELECT string_agg(
      format('%I', attribute.attname),
      ', ' ORDER BY attribute.attnum
    )
    INTO column_list
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = format('public.%I', table_name)::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I '
      'FROM PUBLIC, anon, authenticated, service_role',
      table_name
    );
    IF column_list IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%s) ON TABLE public.%I '
        'FROM PUBLIC, anon, authenticated, service_role',
        column_list,
        table_name
      );
    END IF;
  END LOOP;
END;
$external_control_privileges$;

GRANT SELECT ON TABLE
  public.external_control_installations,
  public.external_control_principals,
  public.external_command_claims,
  public.external_command_receipts
TO authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.external_control_installations,
  public.external_control_principals
TO service_role;
GRANT SELECT ON TABLE
  public.external_command_claims,
  public.external_command_receipts
TO service_role;

REVOKE ALL ON FUNCTION public.guard_external_control_installation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.guard_external_control_principal()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_external_command_evidence()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_external_control_truncate()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_external_observer_command(
  uuid, uuid, text, text, text, text, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_external_observer_command(
  uuid, uuid, text, text, text, text, text, text, timestamptz
) TO service_role;

COMMENT ON TABLE public.external_control_installations IS
  'Observer-only organization routes for verified Slack, Teams, Zapier, and MCP installations. External identifiers are keyed HMACs; no credentials or callback URLs are stored.';
COMMENT ON TABLE public.external_control_principals IS
  'Verified observer-only external principal bindings. Every claim rechecks current owner/admin membership.';
COMMENT ON TABLE public.external_command_claims IS
  'Immutable logical external-event claims. Installation-scoped event uniqueness preserves the first canonical payload hash.';
COMMENT ON TABLE public.external_command_receipts IS
  'Append-only delivery-attempt receipts for first observation, exact replay, and event-ID collision; all operational authority is fixed false.';
COMMENT ON FUNCTION public.claim_external_observer_command(
  uuid, uuid, text, text, text, text, text, text, timestamptz
) IS
  'Service-only observer claim boundary. Records only the four exact R0 command envelopes, requires an explicit organization and active installation, resolves a verified live owner/admin principal, binds a canonical intent digest separately from the raw payload digest, preserves exact replay, quarantines collisions, and does not authorize R0 execution or create effects.';

COMMIT;
