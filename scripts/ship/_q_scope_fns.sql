SELECT p.proname, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('enforce_organization_scope','user_in_organization','default_organization_for_user');
