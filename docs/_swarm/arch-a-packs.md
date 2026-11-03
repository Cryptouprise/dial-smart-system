# arch-a-packs

- status: completed
- tldr: packs.ts = static central registry; pack gating is REAL, but the "plugin seam" is DECORATIVE (adding a pack needs edits in 4+ central places).

arch-a-packs complete. packs.ts is a STATIC hand-written registry (PACK_IDS/PACKS literal), not dynamic registration or auto-discovery. PackDefinition shape: { id, label, description, sidebarGroups[], routes[] } (packs.ts:31-38). Verdict: MIXED — REAL as a per-org gating feature (settings.packs + useEnabledPacks + set_org_packs/org_has_pack RPCs + DashboardSidebar + PackLocked/PackSettings), DECORATIVE as an extensibility seam (adding a pack needs central edits in PACK_IDS, PACKS, SQL allowed list migration:49, PACK_ICONS map DashboardSidebar.tsx:195, and a Dashboard switch case per tab; no pack manifest exists). 8 src importers + 1 test; routes[] empty for all packs so packForPath is dead code today.

## Artifact

**Findings**

packs.ts defines a 'pack' as a STATIC, hand-written registry entry, NOT a dynamic/auto-discovered plugin. Type shape (src/lib/packs.ts): PackId = union of PACK_IDS const ['solar_exit','wholesale_re','door_to_door'] (line 14-16); PackSidebarItem { id:string; label:string; icon:string } (18-24); PackSidebarGroup { title:string; items:PackSidebarItem[] } (26-29); PackDefinition { id:PackId; label:string; description:string; sidebarGroups:PackSidebarGroup[]; routes:string[] } (31-38). PACKS: Record<PackId,PackDefinition> is a literal object of 3 entries (40-82). Helpers: ALL_PACKS (85), isPackId (88), normalizePacks (93), packForTab (103), packForPath (113). VERDICT: MIXED - REAL as a gating feature, DECORATIVE as an extensibility seam. REAL: packs are genuinely consumed and enforced; per-org enable state lives in organizations.settings.packs, read via useEnabledPacks (fetch + module-level store + RPC set_org_packs), enforced server-side by org_has_pack/set_org_packs (migration 20261029010000_industry_packs.sql:9,42) with a hard-coded allowed list (line 49), gated in UI by Dashboard.renderContent via packForTab (Dashboard.tsx:223-232 -> PackLocked), surfaced by DashboardSidebar.getPackNavigation (210-229), and toggled by PackSettings (RPC at 45). Toggling truly changes sidebar/locks tabs. DECORATIVE: adding a pack is NOT auto-discovered; it requires editing a central list in at least 3-4 places: PACK_IDS + PACKS (lib/packs.ts:14,40), the SQL allowed list (migration:49), the PACK_ICONS map (DashboardSidebar.tsx:195-205), and a new Dashboard switch case for each tab (Dashboard.tsx:509-516). The pack folder has NO self-describing manifest the registry reads. Also decorative: PackDefinition.routes is [] for ALL three packs, so packForPath always returns null in practice (route-level gating built but unused).

**evidence**

- src/lib/packs.ts:14 PACK_IDS = ['solar_exit','wholesale_re','door_to_door'] as const
- src/lib/packs.ts:31-38 PackDefinition interface
- src/lib/packs.ts:40 PACKS: Record<PackId,PackDefinition> literal (3 entries, ends line 82)
- src/lib/packs.ts:103 packForTab walks ALL_PACKS.sidebarGroups
- src/lib/packs.ts:113 packForPath walks pack.routes; routes:[] at lines 54,67,80 so never matches
- Consumers of @/lib/packs (grep): Dashboard.tsx:29, DashboardSidebar.tsx:71, PackComingSoon.tsx:6, PackLocked.tsx:5, PackSettings.tsx:14, useEnabledPacks.ts:19, lib/coach/packContent.ts:9, components/call/CallWorkspace.tsx:58; plus lib/__tests__/coachRules.test.ts
- hooks/useEnabledPacks.ts:65-74 fetches organizations.settings and normalizePacks(settings?.packs)
- components/Dashboard.tsx:223-232 packForTab gating -> PackLocked; :516 case 'd2d-app' -> DoorToDoorApp
- components/DashboardSidebar.tsx:195-205 PACK_ICONS string->lucide map; :210-229 getPackNavigation
- components/PackSettings.tsx:45 supabase.rpc('set_org_packs',...)
- supabase/migrations/20261029010000_industry_packs.sql:49 v_allowed constant ARRAY['solar_exit','wholesale_re','door_to_door']
- packs/door_to_door/ has 13 files, no pack manifest; DoorToDoorApp.tsx:77-95 portals a booted vendored classic-script app into document.body; host.ts:583-588 DoorBossHost { api, config, assets } is the real app<->backend seam

**validation**

Read packs.ts in full (122 lines confirmed, matches stated length). Grepped whole src/ for lib/packs, packs/, and registry symbols (PACKS|ALL_PACKS|PACK_IDS|PackId|packForTab|packForPath|normalizePacks|isPackId|PackDefinition) with paths_only. Read all 8 consumer files plus the SQL migration and the door_to_door pack folder listing and its two mount files. Cross-checked the SQL allowed list equals PACK_IDS. Verified routes arrays are empty for all packs.

**open_questions**

- Does adding a 4th pack have any other hidden central edits, e.g. useSimpleMode SIMPLE_MODE_TABS, RLS policies referencing org_has_pack, or a settings UI whitelist beyond the migration? (Not traced.)
- Is org_has_pack actually used in any RLS predicate or query anywhere (server or client), or is gating entirely client-side via packForTab? Grep of src/ did not search supabase/migrations for org_has_pack call sites.
- Is CallWorkspace.tsx's PackId usage only for coach content lookup, or does it also gate the workspace per-pack?

**what_i_did_not_check**

- All supabase/migrations for other pack references / RLS policies using org_has_pack
- Whether other non-src directories (scripts/, docs/) reference the pack registry
- Full CallWorkspace.tsx body (only imports read) for how PackId/coach content is applied
- Whether a new pack's tab must also be registered in useSimpleMode SIMPLE_MODE_TABS
- Runtime behavior / tests passing for pack enable-disable (read code, did not execute)

**confidence**: high