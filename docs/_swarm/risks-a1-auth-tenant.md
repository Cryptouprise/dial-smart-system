# risks-a1-auth-tenant

- status: completed
- tldr: Day-one auth/tenant review: no invite/provisioning path (blocker), self-signup is org-less (blocker), plus silent-empty-app and role-gating failures.

LANE risks-a1-auth-tenant complete. Ranked day-one failures: (1) BLOCKER - no way to provision users 2-5's org membership: no invite UI/edge function, no new-user trigger, addUserToOrganization is a stub returning false (lib/organizationContext.ts:147-154), rows only come from a migration-time backfill (20260108_phase2_organizations.sql:190-217). (2) BLOCKER - self-signup leaves the user org-less (AuthPage.tsx:39-45; OrganizationContext.tsx:50 -> currentOrganization=null). (3) HIGH - org-less/failed load degrades to a silently empty app (ProtectedRoute.tsx:50; CampaignManager.tsx:187-191; organizationContext.ts:65-78 swallows errors). (4) HIGH - membership load runs once on mount + SIGNED_IN only, reload race can leave the session org-less (OrganizationContext.tsx:59-77). (5) HIGH - role is free text, only 'owner' exists live (host.ts:103); admin/billing UI gated on owner/admin, so users 2-5 need an exact role string. (6) MEDIUM - org-less writes fail at DB with 42501 (phase1_org_scope.sql:93-125). (7) MEDIUM - two org-resolution paths can disagree. Positive: OrganizationContext won't silently pick among multiple orgs (OrganizationContext.tsx:41-51,86-92).

## Artifact

**Findings**

1) BLOCKER: No way to provision membership for users 2-5. No invite UI/edge function exists (grep 'invite' over src/ = 0 matches), no new-user DB trigger exists (grep handle_new_user|on_auth_user_created|AFTER INSERT ON auth.users over supabase/migrations = 0 matches), the only client helper addUserToOrganization is a stub returning false (src/lib/organizationContext.ts:147-154) and createOrganization throws (src/lib/organizationContext.ts:134-141). organization_users rows are only ever created by a one-time migration backfill (supabase/migrations/20260108_phase2_organizations.sql:190-217). Putting users 2-5 into org 11824e05 requires a manual service-role SQL insert. 2) BLOCKER: Self-signup leaves the user org-less: src/components/AuthPage.tsx:39-45 calls only supabase.auth.signUp; getUserOrganizations returns [] (src/lib/organizationContext.ts:44-79); OrganizationContext sets currentOrganization=null unless exactly one membership (src/contexts/OrganizationContext.tsx:50). 3) HIGH: An org-less (or load-failed) session degrades to a silently empty app, not an error: ProtectedRoute renders children when currentOrganization is null (src/components/ProtectedRoute.tsx:50) and consumers guard null by returning empty data (src/components/CampaignManager.tsx:187-191); getUserOrganizations swallows ALL errors into [] (src/lib/organizationContext.ts:65-78). 4) HIGH: Membership load runs once on mount and on SIGNED_IN/SIGNED_OUT only (src/contexts/OrganizationContext.tsx:59-77); Supabase emits INITIAL_SESSION on a persisted-session reload, not SIGNED_IN, and the only identity read is supabase.auth.getUser() (src/lib/organizationContext.ts:49), so a race can leave the session org-less. THEORY on timing. 5) HIGH: organization_users.role is free text and only 'owner' exists in production (FACT, comment src/packs/door_to_door/host.ts:103); all admin/billing capability is gated on owner/admin via useIsOrganizationAdmin (src/contexts/OrganizationContext.tsx:137-141) used in DashboardSidebar.tsx:240, AdminSettings.tsx:52, PackSettings.tsx:22, ClientPortal.tsx:119, and host.ts roleOf maps unknown roles to 'rep' (host.ts:115-117). Base-migration CHECK was role IN ('owner','admin','manager','member') (migrations/20260108_phase2_organizations.sql:57) but the live table is described as free text (constraint presumably dropped later; unverified). 6) MEDIUM: Org-less writes fail at the DB with 42501/encode errors, not in the UI: NOT NULL organization_id on leads/campaigns/phone_numbers/call_logs and enforce_organization_scope (supabase/migrations/20261029142121_phase1_org_scope.sql:93-125). 7) MEDIUM: Two org-resolution paths can disagree: UI localStorage 'currentOrganizationId' (src/contexts/OrganizationContext.tsx:36,82) vs default_organization_for_user RPC (src/lib/d2dApi.ts:157-174); they agree for single-membership, diverge for multi-membership. THEORY. 8) POSITIVE: OrganizationContext refuses to silently choose among multiple orgs (src/contexts/OrganizationContext.tsx:41-51) and validates programmatic selection (86-92) - the right safety behavior and why the 5-user single-org case works once membership rows exist. 9) NOTE: organizations.max_users defaults to 5 (migrations/20260108_phase2_organizations.sql:23); not enforced anywhere in code, so not a blocker.

**evidence**

- src/components/AuthPage.tsx:39-45
- src/lib/organizationContext.ts:44-79,134-141,147-154
- src/contexts/OrganizationContext.tsx:41-51,59-77,86-92,117-161
- src/components/ProtectedRoute.tsx:32-61
- src/components/CampaignManager.tsx:187-191
- src/packs/door_to_door/host.ts:103,107-117
- src/lib/d2dApi.ts:157-174,319-344
- supabase/migrations/20260108_phase2_organizations.sql:23,53-57,148-166,182-217
- supabase/migrations/20261029142121_phase1_org_scope.sql:18-30,93-125
- grep: 'invite|invitation'=0 in src/; 'handle_new_user|on_auth_user_created|AFTER INSERT ON auth.users'=0 in supabase/migrations

**validation**

Read the named files directly (App.tsx, pages/Index.tsx, pages/Auth.tsx, components/AuthPage.tsx, contexts/AuthContext.tsx, contexts/OrganizationContext.tsx, lib/organizationContext.ts, components/ProtectedRoute.tsx, hooks/useCurrentUser.ts, hooks/useOrgStanding.ts, components/CampaignManager.tsx:98-217, packs/door_to_door/host.ts:1-150, lib/d2dApi.ts:1-344) and ran repo agentgrep for invite/provisioning/role/RLS terms. No writes, no live calls (research-only contract). Every finding cites file:line.

**open_questions**

- Does the live organization_users table still carry the CHECK (role IN owner/admin/manager/member), or was it dropped to free text?
- Is email/password signup enabled and is email confirmation required in the Supabase project?
- Is there any runbook/script outside the repo (Hermes cron, dashboard action) that inserts organization_users rows?
- How many memberships and which role strings does org 11824e05 have live?
- Do edge functions that read organization_users (api-gateway, ai-sms-processor, sms-messaging, coach-*) each reject a caller with no membership, or default to a shared org?

**what_i_did_not_check**

- The live database schema and data: org/role/RLS claims are from migration files and code comments, not from querying the live project.
- RLS policies beyond organization_users/organizations and the four org-scoped core tables; the other ~190 migrations were not audited table-by-table.
- Edge-function auth boundaries: 110 functions, several read organization_users, but each was not verified for membership/null-org handling.
- Runtime behavior of the session/token-refresh path (no live calls made).
- The Door-to-door pack's own auth wall, per-team settings table, and quota logic.
- pages/LandingPage and the landing->signup funnel; whether signup is reachable from the marketing site.
- Supabase Auth project config (email confirmation, SMTP, enabled providers, redirect allow-list).

**confidence**: high