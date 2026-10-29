# JOB P2 - Industry packs: storage, gating hook, sidebar/route gating, admin toggles (lane: ultra, BUILD contract)

## CONTEXT (facts; treat as true)
- One React+Vite app (Lovable), Supabase backend. Tenancy = `organizations` + `organization_users` (roles owner/admin/manager/member). SQL helpers that exist live: `user_in_organization(org_id uuid)`, `is_org_admin(org_id uuid)` (both SECURITY DEFINER, use auth.uid()), `is_platform_operator()`. `organizations.settings jsonb` EXISTS live. The trigger `trg_guard_organization_billing_columns` blocks tenant updates to billing/plan columns only; `settings` is NOT guarded.
- Frontend: `OrganizationContext.tsx` exposes `useOrganizationContext()`, `useCurrentOrganizationId()`, `useIsOrganizationAdmin()`. Dashboard navigation is `DashboardSidebar.tsx` (grouped sections) + `Dashboard.tsx` (tab switch by `?tab=`), routes in `App.tsx`, auth gate `ProtectedRoute.tsx`.
- Packs (industry modules) a company can enable, one or many: `solar_exit` (what Solar Freedom runs today: existing dialer screens), `wholesale_re` (properties, distress list, call list, offers, deals - screens arrive later), `door_to_door` (knock list, intake, canvassing map, call workspace - screens arrive later). Core screens (leads, campaigns, calls, texting, numbers, DNC, settings, billing) are NOT pack-gated.

## DESIGN DECISIONS (fixed - do not change)
1. Storage: `organizations.settings -> 'packs'` is a jsonb array of pack ids, e.g. `["solar_exit","wholesale_re"]`. Empty/missing = no packs (core only).
2. SQL: a migration `supabase/migrations/20261029010000_industry_packs.sql` that adds:
   - `public.org_has_pack(p_org_id uuid, p_pack text) returns boolean` STABLE SECURITY DEFINER, `SET search_path TO 'public','pg_temp'`, true when the pack id is in that org's settings.packs AND `public.user_in_organization(p_org_id)`; REVOKE from PUBLIC/anon, GRANT to authenticated, service_role.
   - `public.set_org_packs(p_org_id uuid, p_packs text[]) returns jsonb` SECURITY DEFINER, pinned search_path: requires `public.is_org_admin(p_org_id)` else RAISE 42501; validates every id against the allowed list ('solar_exit','wholesale_re','door_to_door') else RAISE 22023; writes `settings = coalesce(settings,'{}') || jsonb_build_object('packs', to_jsonb(p_packs))`; returns the new settings. Same grants pattern.
   - A `CHECK`-free approach (no constraint on settings) so unrelated settings keys keep working.
3. Frontend:
   - `src/lib/packs.ts`: `PACK_IDS`, `PackId` type, `PACKS` registry: id, label, description, `sidebarGroups` (array of {title, items:[{id (tab id), label, icon name string}]}), `routes` (array of path prefixes). Fill real items only for `solar_exit` using the dialer tabs that already exist in DashboardSidebar (cite them); for `wholesale_re` and `door_to_door` register ONE placeholder item each (`wh-properties` -> "Properties", `d2d-knock-list` -> "Knock list") whose screen is a `PackComingSoon` component.
   - `src/hooks/useEnabledPacks.ts`: reads the current organization's settings.packs from OrganizationContext (if the context already loads the organization row with settings, use it; else fetch `organizations.settings` by `useCurrentOrganizationId()` with supabase-js and cache in React state). Returns `{ packs: PackId[], has(pack): boolean, loading }`.
   - `DashboardSidebar.tsx` patch: append the enabled packs' `sidebarGroups` after the core groups; hide disabled packs' groups entirely.
   - `Dashboard.tsx` patch: for a `?tab=` that belongs to a pack the org has not enabled, render `PackLocked` (one sentence + "Ask an admin to enable the <pack> pack").
   - `src/components/PackSettings.tsx`: admin-only (useIsOrganizationAdmin) list of the three packs with a switch each; on change calls `supabase.rpc('set_org_packs', ...)`; non-admins see read-only badges. Register it as tab `packs` in Dashboard + a "Packs" item in the Settings sidebar group.
4. No new tables. No changes to existing tables except through `settings`.

## OUTPUT
DESIGN NOTE, then complete files (the migration, packs.ts, useEnabledPacks.ts, PackSettings.tsx, PackComingSoon.tsx, PackLocked.tsx, and the FULL patched DashboardSidebar.tsx and Dashboard.tsx), then TESTS: the SQL to enable `wholesale_re` on org 11824e05-24e3-4dc3-b684-5d0bc7c436d6 as service role, the SQL that proves `org_has_pack` answers true/false, and the manual UI check (which sidebar group appears/disappears).
Match existing import style (shadcn `@/components/ui/*`, `@/integrations/supabase/client`, lucide icons as used in the sidebar).
