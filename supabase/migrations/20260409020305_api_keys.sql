-- API Keys for external tool / AI agent / MCP server access
-- Issued to an organization, scoped to a specific user identity for audit purposes.
-- Key format: dsk_live_<32 random base62 chars>
-- Only the SHA-256 hash is stored; the plaintext key is shown once at creation.

CREATE TABLE IF NOT EXISTS public.api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  key_prefix      TEXT NOT NULL,        -- first 12 chars of the plaintext key (e.g. "dsk_live_ab") for UI display
  key_hash        TEXT NOT NULL UNIQUE, -- SHA-256 hex of the full plaintext key
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

-- Audit log for every API request (kept lightweight - just enough to debug abuse)
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

-- RLS: users can only manage their own keys; service role bypasses
ALTER TABLE public.api_keys          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_key_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_manage_own_api_keys"
  ON public.api_keys
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_read_own_api_audit"
  ON public.api_key_audit_log
  FOR SELECT
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.api_keys_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_api_keys_touch_updated_at ON public.api_keys;
CREATE TRIGGER trg_api_keys_touch_updated_at
  BEFORE UPDATE ON public.api_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.api_keys_touch_updated_at();

-- Convenience: mark a key as used (called from the API gateway on every request)
CREATE OR REPLACE FUNCTION public.touch_api_key(
  p_key_id UUID,
  p_ip     TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.api_keys
  SET last_used_at = NOW(),
      last_used_ip = COALESCE(p_ip, last_used_ip)
  WHERE id = p_key_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.touch_api_key(UUID, TEXT) TO service_role;

COMMENT ON TABLE public.api_keys IS
  'External API keys for programmatic access to the Dial Smart platform. Used by MCP servers, external AI agents, and third-party integrations.';
COMMENT ON COLUMN public.api_keys.scopes IS
  'Array of permission scopes. Known values: read, write, admin, leads:read, leads:write, campaigns:read, campaigns:write, calls:read, calls:write, sms:read, sms:write, system:read.';
