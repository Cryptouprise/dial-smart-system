-- Revoke old key
UPDATE api_keys SET revoked_at = now(), revoked_reason = 'replaced - plaintext lost' WHERE id = '7f795001-5919-46de-b22d-4997c46c12eb';

-- Insert new key with known hash
INSERT INTO api_keys (user_id, organization_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute)
SELECT '5969774f-5340-4e4f-8517-bcc89fa6b1eb', organization_id, 'Claude Code Admin', 'dsk_live_pNH', '9eb32832084fa3d3715d78045b157c027d875f902b331d34ae40e70e7b2ceea7', ARRAY['admin']::TEXT[], 120
FROM organization_users WHERE user_id = '5969774f-5340-4e4f-8517-bcc89fa6b1eb' LIMIT 1;