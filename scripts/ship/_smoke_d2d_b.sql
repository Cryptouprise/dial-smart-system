-- Door to Door smoke test B: the per-company address unique index must reject a duplicate.
-- Expect an error naming d2d_properties_addr_idx. Rolled back by run_migration.py --dry.
INSERT INTO public.d2d_properties (organization_id, address, city, state, zip)
VALUES ('11824e05-24e3-4dc3-b684-5d0bc7c436d6', '1 Smoke Test Way', 'Denver', 'CO', '80202');

-- different case + no zip vs '80202': lower(address) collides, coalesce(zip,'') differs, so this
-- one is expected to be ALLOWED - proving the index is per (address, zip).
INSERT INTO public.d2d_properties (organization_id, address, city, state, zip)
VALUES ('11824e05-24e3-4dc3-b684-5d0bc7c436d6', '1 SMOKE TEST WAY', 'Denver', 'CO', NULL);

SELECT 'allowed_so_far' AS check_name, count(*)::text AS value FROM public.d2d_properties;

-- this exact duplicate must fail
INSERT INTO public.d2d_properties (organization_id, address, city, state, zip)
VALUES ('11824e05-24e3-4dc3-b684-5d0bc7c436d6', '1 Smoke Test Way', 'Denver', 'CO', '80202');
