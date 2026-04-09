-- ═══════════════════════════════════════════════════════════════════════
-- Mint a fresh admin API key for the Dial Smart MCP + REST API.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Requirements:
--   1. Migration 20260409020305_api_keys.sql has been applied
--   2. Migration 20260409030000_mint_api_key_helper.sql has been applied
--   3. You're running this in the Supabase SQL Editor (as postgres/service_role)
--
-- Instructions:
--   1. Replace the WHERE clause below with YOUR email
--   2. Run the whole file
--   3. Copy the `plaintext` value from the result row — this is shown ONCE
--   4. Store it in your password manager
--   5. Export it: `export DIALSMART_API_KEY=dsk_live_...`
--
-- To revoke a key later:
--   UPDATE public.api_keys
--     SET revoked_at = NOW(), revoked_reason = 'rotating'
--     WHERE key_prefix = 'dsk_live_XX';  -- use the 12-char prefix
--
-- To list your active keys (no plaintext — just metadata):
--   SELECT id, name, key_prefix, scopes, rate_limit_per_minute,
--          last_used_at, created_at, expires_at
--   FROM public.api_keys
--   WHERE user_id = auth.uid() AND revoked_at IS NULL
--   ORDER BY created_at DESC;

SELECT *
FROM public.mint_api_key(
  p_user_id    => (SELECT id FROM auth.users WHERE email = 'YOUR_EMAIL@example.com' LIMIT 1),
  p_name       => 'Claude Code (admin)',
  p_scopes     => ARRAY['admin']::TEXT[],
  p_rate_limit => 600
);
