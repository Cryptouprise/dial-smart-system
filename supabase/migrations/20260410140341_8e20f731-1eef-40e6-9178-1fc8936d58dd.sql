DO $$
DECLARE
  v_plain   TEXT;
  v_hash    TEXT;
  v_prefix  TEXT;
  v_org_id  UUID;
  v_user_id UUID := '5969774f-5340-4e4f-8517-bcc89fa6b1eb';
BEGIN
  v_plain := 'dsk_live_' || replace(replace(replace(
               encode(gen_random_bytes(24), 'base64'),
               '+','A'), '/','B'), '=','');
  v_hash  := encode(digest(v_plain, 'sha256'), 'hex');
  v_prefix := substring(v_plain FROM 1 FOR 12);

  SELECT organization_id INTO v_org_id
    FROM organization_users
   WHERE user_id = v_user_id
   LIMIT 1;

  INSERT INTO api_keys (
    user_id, organization_id, name, key_prefix, key_hash,
    scopes, rate_limit_per_minute
  ) VALUES (
    v_user_id, v_org_id, 'Claude Code', v_prefix, v_hash,
    ARRAY['admin']::TEXT[], 120
  );

  RAISE NOTICE 'API_KEY=%', v_plain;
END;
$$;