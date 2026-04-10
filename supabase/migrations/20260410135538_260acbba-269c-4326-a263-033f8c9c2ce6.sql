-- API Keys table
CREATE TABLE IF NOT EXISTS public.api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  scopes          TEXT[] NOT NULL DEFAULT ARRAY['read']::TEXT[],
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
  last_used_at    TIMESTAMPTZ,
  last_used_ip    TEXT,
  expires_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash         ON public.api_keys(key_hash) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_user         ON public.api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_organization ON public.api_keys(organization_id);

-- Audit log
CREATE TABLE IF NOT EXISTS public.api_key_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id   UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  method       TEXT NOT NULL,
  path         TEXT NOT NULL,
  status_code  INTEGER,
  ip_address   TEXT,
  user_agent   TEXT,
  duration_ms  INTEGER,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_key_audit_key  ON public.api_key_audit_log(api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_key_audit_user ON public.api_key_audit_log(user_id, created_at DESC);

ALTER TABLE public.api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_api_keys"
  ON public.api_keys FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_read_own_api_audit"
  ON public.api_key_audit_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.api_keys_touch_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_keys_touch_updated_at ON public.api_keys;
CREATE TRIGGER trg_api_keys_touch_updated_at
  BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.api_keys_touch_updated_at();

CREATE OR REPLACE FUNCTION public.touch_api_key(p_key_id UUID, p_ip TEXT DEFAULT NULL)
RETURNS VOID AS $$ BEGIN UPDATE public.api_keys SET last_used_at = NOW(), last_used_ip = COALESCE(p_ip, last_used_ip) WHERE id = p_key_id; END; $$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.touch_api_key(UUID, TEXT) TO service_role;

-- Mint API key helper function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.mint_api_key(
  p_user_id    UUID,
  p_name       TEXT     DEFAULT 'API Key',
  p_scopes     TEXT[]   DEFAULT ARRAY['read']::TEXT[],
  p_rate_limit INTEGER  DEFAULT 120,
  p_expires_in INTERVAL DEFAULT NULL
)
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  key_prefix TEXT,
  scopes     TEXT[],
  plaintext  TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.mint_api_key FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_api_key TO service_role;

-- Audit log pruning helper
CREATE OR REPLACE FUNCTION public.prune_api_key_audit_log(
  p_retention_days INTEGER DEFAULT 90
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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