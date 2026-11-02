-- Post-apply verification for the Door to Door core migration. One result set.
SELECT 'tables_rls' AS check_name,
       coalesce(string_agg(c.relname || '(rls=' || c.relrowsecurity::text || ')', ', ' ORDER BY c.relname), 'NONE') AS value
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'd2d_%'
UNION ALL
SELECT 'policy_count', coalesce(count(*)::text, '0') FROM pg_policies WHERE tablename LIKE 'd2d_%'
UNION ALL
SELECT 'triggers', coalesce(string_agg(t.tgname || '@' || c.relname, ', ' ORDER BY c.relname, t.tgname), 'NONE')
  FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE c.relname LIKE 'd2d_%' AND NOT t.tgisinternal
UNION ALL
SELECT 'migration_recorded', coalesce(version || ' ' || name, 'MISSING')
  FROM supabase_migrations.schema_migrations WHERE version = '20261102234500'
UNION ALL
SELECT 'rows_terr/props/knocks',
       (SELECT count(*)::text FROM public.d2d_territories) || '/' ||
       (SELECT count(*)::text FROM public.d2d_properties)  || '/' ||
       (SELECT count(*)::text FROM public.d2d_knocks)
UNION ALL
SELECT 'property_columns', count(*)::text
  FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'd2d_properties';
