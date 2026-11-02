-- Door to Door smoke test A: happy path. Rolled back by run_migration.py --dry.
INSERT INTO public.d2d_territories (organization_id, name, polygon)
VALUES ('11824e05-24e3-4dc3-b684-5d0bc7c436d6', 'SMOKE TEST TERRITORY',
        '[[39.70,-104.99],[39.70,-104.95],[39.74,-104.95]]'::jsonb);

INSERT INTO public.d2d_properties (organization_id, address, city, state, zip, territory_id,
                                   installer, installer_status, tier, lat, lng)
SELECT '11824e05-24e3-4dc3-b684-5d0bc7c436d6', '1 Smoke Test Way', 'Denver', 'CO', '80202', t.id,
       'Test Solar Co', 'bankrupt', 'verified_installed', 39.72, -104.97
  FROM public.d2d_territories t WHERE t.name = 'SMOKE TEST TERRITORY';

INSERT INTO public.d2d_knocks (organization_id, property_id, user_id, status, callback_at, note, source)
SELECT '11824e05-24e3-4dc3-b684-5d0bc7c436d6', p.id, '5969774f-5340-4e4f-8517-bcc89fa6b1eb',
       'callback', now() + interval '2 days', 'smoke test knock', 'door'
  FROM public.d2d_properties p WHERE p.address = '1 Smoke Test Way';

SELECT 'property_state_after_knock' AS check_name,
       (p.status = 'callback')::text || ' | last_knock_at_set=' || (p.last_knock_at IS NOT NULL)::text
       || ' | callback_at_set=' || (p.callback_at IS NOT NULL)::text
       || ' | last_knock_by_set=' || (p.last_knock_by IS NOT NULL)::text
       || ' | territory_linked=' || (p.territory_id IS NOT NULL)::text AS value
  FROM public.d2d_properties p WHERE p.address = '1 Smoke Test Way'
UNION ALL
SELECT 'knock_client_id_autofilled', (k.client_id IS NOT NULL)::text
  FROM public.d2d_knocks k WHERE k.note = 'smoke test knock'
UNION ALL
SELECT 'knock_org_matches_property', (k.organization_id = p.organization_id)::text
  FROM public.d2d_knocks k JOIN public.d2d_properties p ON p.id = k.property_id
 WHERE k.note = 'smoke test knock'
UNION ALL
SELECT 'updated_at_touched', (p.updated_at >= p.created_at)::text
  FROM public.d2d_properties p WHERE p.address = '1 Smoke Test Way'
UNION ALL
SELECT 'row_counts', (SELECT count(*)::text FROM public.d2d_territories) || '/' ||
                     (SELECT count(*)::text FROM public.d2d_properties) || '/' ||
                     (SELECT count(*)::text FROM public.d2d_knocks);
