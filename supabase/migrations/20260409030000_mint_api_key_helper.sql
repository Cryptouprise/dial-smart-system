-- Reusable helper to mint API keys for the MCP + api-gateway stack.
-- Generates a dsk_live_ + 32 random base62 chars plaintext key, SHA-256
-- hashes it, inserts the row, and RETURNS the plaintext exactly once.
--
-- Usage:
--   SELECT * FROM public.mint_api_key(
--     p_user_id => '<auth.users.id>',
--     p_name    => 'Claude Code (admin)',
--     p_scopes  => ARRAY['admin']
--   );
--
-- The returned `plaintext` column is the only place the key is ever exposed.
-- Store it immediately; it cannot be recovered from the hash.

CREATE OR REPLACE FUNCTION public.mint_api_key(
  p_user_id         UUID,
  p_name            TEXT,
  p_scopes          TEXT[] DEFAULT ARRAY['admin']::TEXT[],
  p_organization_id UUID   DEFAULT NULL,
  p_rate_limit      INTEGER DEFAULT 600,
  p_expires_at      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  plaintext   TEXT,
  key_prefix  TEXT,
  scopes      TEXT[]
) AS $$
DECLARE
  v_alphabet   TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  v_random     TEXT := '';
  v_byte       INTEGER;
  v_i          INTEGER;
  v_plaintext  TEXT;
  v_hash       TEXT;
  v_prefix     TEXT;
  v_org_id     UUID;
  v_inserted   UUID;
BEGIN
  -- Sanity checks
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'p_name is required';
  END IF;

  -- Resolve org automatically if not passed in
  v_org_id := p_organization_id;
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id
    FROM public.organization_users
    WHERE user_id = p_user_id
    LIMIT 1;
  END IF;

  -- Generate 32 random base62 chars byte-by-byte for even distribution
  FOR v_i IN 1..32 LOOP
    v_byte := get_byte(gen_random_bytes(1), 0);
    v_random := v_random || substr(v_alphabet, (v_byte % 62) + 1, 1);
  END LOOP;

  v_plaintext := 'dsk_live_' || v_random;
  v_hash      := encode(digest(v_plaintext, 'sha256'), 'hex');
  v_prefix    := substring(v_plaintext FOR 12);

  INSERT INTO public.api_keys (
    user_id,
    organization_id,
    name,
    key_prefix,
    key_hash,
    scopes,
    rate_limit_per_minute,
    expires_at
  ) VALUES (
    p_user_id,
    v_org_id,
    p_name,
    v_prefix,
    v_hash,
    p_scopes,
    p_rate_limit,
    p_expires_at
  )
  RETURNING public.api_keys.id INTO v_inserted;

  RETURN QUERY
  SELECT v_inserted, v_plaintext, v_prefix, p_scopes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Only the service role (and the postgres superuser running via SQL Editor)
-- should be able to mint keys. Users can't grant themselves admin access.
REVOKE ALL ON FUNCTION public.mint_api_key(UUID, TEXT, TEXT[], UUID, INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mint_api_key(UUID, TEXT, TEXT[], UUID, INTEGER, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.mint_api_key(UUID, TEXT, TEXT[], UUID, INTEGER, TIMESTAMPTZ) IS
  'Mint a fresh Dial Smart API key. Returns the plaintext exactly once — store it immediately.';

-- Retention helper: delete audit-log rows older than N days.
-- Defaults to 30 days so the audit log doesn''t grow unbounded on a personal account.
-- Schedule via pg_cron: SELECT cron.schedule(''prune-api-audit'', ''0 3 * * *'', $$SELECT public.prune_api_key_audit_log(30)$$);
CREATE OR REPLACE FUNCTION public.prune_api_key_audit_log(
  p_retention_days INTEGER DEFAULT 30
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  IF p_retention_days < 1 THEN
    RAISE EXCEPTION 'retention_days must be >= 1';
  END IF;

  DELETE FROM public.api_key_audit_log
  WHERE created_at < NOW() - (p_retention_days || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.prune_api_key_audit_log(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_api_key_audit_log(INTEGER) TO service_role;

COMMENT ON FUNCTION public.prune_api_key_audit_log(INTEGER) IS
  'Delete api_key_audit_log rows older than the retention window. Intended to be run nightly via pg_cron.';
