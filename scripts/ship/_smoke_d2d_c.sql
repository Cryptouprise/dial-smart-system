-- Door to Door smoke test C: a knock may not point at another company, and a NULL organization_id
-- is filled in from the property. Rolled back by run_migration.py --dry.
INSERT INTO public.d2d_properties (organization_id, address, city, state, zip)
VALUES ('11824e05-24e3-4dc3-b684-5d0bc7c436d6', '2 Smoke Test Way', 'Denver', 'CO', '80202');

-- 1. NULL organization_id: the BEFORE trigger should adopt the property's company.
INSERT INTO public.d2d_knocks (property_id, user_id, status, note, source)
SELECT p.id, '5969774f-5340-4e4f-8517-bcc89fa6b1eb', 'not_home', 'null-org knock', 'door'
  FROM public.d2d_properties p WHERE p.address = '2 Smoke Test Way';

SELECT 'null_org_adopted_from_property' AS check_name,
       (k.organization_id = p.organization_id)::text AS value
  FROM public.d2d_knocks k JOIN public.d2d_properties p ON p.id = k.property_id
 WHERE k.note = 'null-org knock';

-- 2. A knock claiming a different company must be rejected with 42501.
INSERT INTO public.d2d_knocks (organization_id, property_id, user_id, status, note, source)
SELECT '00000000-0000-0000-0000-000000000001', p.id, '5969774f-5340-4e4f-8517-bcc89fa6b1eb',
       'not_home', 'cross-company knock', 'door'
  FROM public.d2d_properties p WHERE p.address = '2 Smoke Test Way';
