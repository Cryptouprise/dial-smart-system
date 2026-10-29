Assumption: "behind login" means wrapped in `<ProtectedRoute>` in App.tsx; the internals of `ProtectedRoute` are not in the material, so its mechanism is reported as UNKNOWN.

### A. Routes
All routes are declared in `src/App.tsx:132-153`. Public routes (not wrapped in `ProtectedRoute`):
- `/` -> `LandingPage` + `LegalBetaAnnouncement` (`src/App.tsx:133`)
- `/law-firms` -> `LegalBeta` (`src/App.tsx:134`)
- `/legal-beta` -> `LegalBeta` (`src/App.tsx:135`)
- `/auth` -> `Auth` (`src/App.tsx:136`)
- `/demo` -> `Demo` (`src/App.tsx:137`)
- `/.lovable/oauth/consent` -> `McpConsent` (`src/App.tsx:138`)
- `/showcase/*` -> `ShowcaseRouteBridge` (`src/App.tsx:139`)
- `*` -> `NotFound` (`src/App.tsx:152`)

Protected routes (each wrapped as `<ProtectedRoute><Component /></ProtectedRoute>`):
- `/dashboard` -> `Index` (`src/App.tsx:141`)
- `/sms-conversations` -> `AiSmsConversations` (`src/App.tsx:142`)
- `/number-webhooks` -> `NumberWebhooks` (`src/App.tsx:143`)
- `/settings` -> `Settings` (`src/App.tsx:144`)
- `/api-keys` -> `ApiKeys` (`src/App.tsx:145`)
- `/help` -> `HelpPage` (`src/App.tsx:146`)
- `/analytics` -> `Analytics` (`src/App.tsx:147`)
- `/install` -> `InstallApp` (`src/App.tsx:148`)
- `/system-testing` -> `SystemTestingHub` (`src/App.tsx:149`)
- `/connect` -> `AgentConnect` (`src/App.tsx:150`)

Protection mechanism: FACT — protection is done by wrapping the element in the `ProtectedRoute` component imported from `@/components/ProtectedRoute` (`src/App.tsx:14`, used at `src/App.tsx:141-150`). FACT — a second, independent redirect exists in `AuthContext`: on auth state change, if there is no session and the path is not public, it navigates to `/auth` (`src/contexts/AuthContext.tsx:46-53`). The public prefix list used there is `'/'`, `'/auth'`, `'/demo'`, `'/law-firms'`, `'/legal-beta'`, `'/showcase'`, `'/.lovable/oauth/consent'` (`src/contexts/AuthContext.tsx:15-23`). A parallel list `PUBLIC_SHELL_PREFIXES` with the same entries exists in App.tsx (`src/App.tsx:87-95`) and controls whether app chrome (mobile nav, install banner, AI chat) renders (`src/App.tsx:97-114`). INFERENCE: a new `/wholesale/*` path is not in either public list, so it is treated as non-public by both mechanisms — which is what we want for a protected module.

All page components are lazy-loaded via `lazy(() => import(...))` (`src/App.tsx:19-34`) inside a single `<Suspense fallback={<PageLoader />}>` (`src/App.tsx:131`).

### B. Auth
- FACT — session is obtained from Supabase: `supabase.auth.getSession()` on mount (`src/contexts/AuthContext.tsx:38-42`) and kept current via `supabase.auth.onAuthStateChange` (`src/contexts/AuthContext.tsx:44-54`).
- FACT — context name: `AuthContext` (`src/contexts/AuthContext.tsx:13`); provider: `AuthProvider` (`src/contexts/AuthContext.tsx:31`), mounted in App at `src/App.tsx:128`.
- FACT — hook name: `useAuth` (`src/contexts/AuthContext.tsx:71-77`); throws if used outside `AuthProvider` (`src/contexts/AuthContext.tsx:73-75`).
- FACT — exposed fields: `user: User | null`, `session: Session | null`, `loading: boolean`, `signOut: () => Promise<void>` (`src/contexts/AuthContext.tsx:6-11`, provided at `src/contexts/AuthContext.tsx:65`).
- FACT — `signOut` calls `supabase.auth.signOut()` then navigates to `/auth` (`src/contexts/AuthContext.tsx:59-62`).
- FACT — sign-up: the material does not show a sign-up implementation. `src/pages/Auth.tsx` only renders `AuthPage` from `@/components/AuthPage` (`src/pages/Auth.tsx:2-6`), and `AuthPage` is not in the material. Sign-up is UNKNOWN (see G).

### C. Organizations
- FACT — context: `OrganizationContext` (`src/contexts/OrganizationContext.tsx:20`); provider `OrganizationProvider` (`src/contexts/OrganizationContext.tsx:26`), mounted inside `AuthProvider` at `src/App.tsx:129`.
- FACT — hook: `useOrganizationContext()` (`src/contexts/OrganizationContext.tsx:117-123`). Convenience hooks: `useCurrentOrganizationId()` returns `currentOrganization?.id || null` (`src/contexts/OrganizationContext.tsx:129-132`); `useIsOrganizationAdmin()` returns true for roles `owner`/`admin` (`src/contexts/OrganizationContext.tsx:137-141`); `useHasOrganizationRole(minimumRole)` with hierarchy member=1, manager=2, admin=3, owner=4 (`src/contexts/OrganizationContext.tsx:146-161`).
- FACT — exposed fields: `organizations: OrganizationWithRole[]`, `currentOrganization: OrganizationWithRole | null`, `setCurrentOrganization`, `loading`, `refreshOrganizations` (`src/contexts/OrganizationContext.tsx:12-18`, provided at `src/contexts/OrganizationContext.tsx:100-106`).
- FACT — how the current org is chosen: orgs are loaded via `getUserOrganizations()` from `@/lib/organizationContext` (`src/contexts/OrganizationContext.tsx:9`, `src/contexts/OrganizationContext.tsx:34`). Selection order: saved id in `localStorage['currentOrganizationId']` if still a member (`src/contexts/OrganizationContext.tsx:36-43`); else the current org if still authorized (`src/contexts/OrganizationContext.tsx:45-46`); else the single org if exactly one membership, otherwise `null` — multi-membership users must choose explicitly (`src/contexts/OrganizationContext.tsx:48-50`). The selection is persisted to `localStorage['currentOrganizationId']` (`src/contexts/OrganizationContext.tsx:80-84`).
- FACT — how a user switches org: `setCurrentOrganization(org)` validates the org is in the user's memberships and throws otherwise (`src/contexts/OrganizationContext.tsx:86-92`). The UI control is `OrganizationSelector` from `@/components/OrganizationSelector` (`src/components/Navigation.tsx:9`), rendered in the top nav (`src/components/Navigation.tsx:106`); its internals are not in the material.
- FACT — on `SIGNED_OUT` the org list and current org are cleared and the localStorage key removed (`src/contexts/OrganizationContext.tsx:67-71`).
- FACT — whether Supabase queries filter by `organization_id` or rely on RLS: the material contains no data-fetching query code (no hooks or pages that query tables are included), so this cannot be determined. UNKNOWN (see G). INFERENCE: the context itself does not inject any org filter into the Supabase client — it only exposes the id (`src/contexts/OrganizationContext.tsx:129-132`), so any filtering would have to be done per-query by callers or by RLS.

### D. Navigation
Three separate navigation surfaces exist:

1. Sidebar — `src/components/DashboardSidebar.tsx`.
   - FACT — data structure: `NavItem { title, value, icon, simpleMode?, route?, adminOnly? }` (`src/components/DashboardSidebar.tsx:66-73`) and `NavGroup { label, items, defaultOpen?, simpleModeLabel? }` (`src/components/DashboardSidebar.tsx:75-80`).
   - FACT — items are defined in the `navigationGroups: NavGroup[]` array (`src/components/DashboardSidebar.tsx:82-161`), with groups "Overview" (`:83`), "Phone & Dialing" (`:95`), "Leads & Pipeline" (`:107`), "AI & Automation" (`:119`), "Reports & Analytics" (`:134`), "System & Settings" (`:150`).
   - FACT — filtering: `getFilteredNavigation(isSimpleMode, isAdmin)` drops `adminOnly` items for non-admins (`src/components/DashboardSidebar.tsx:167-171`) and, in simple mode, keeps only items with `simpleMode: true` and swaps in `simpleModeLabel` (`src/components/DashboardSidebar.tsx:173-181`); empty groups are removed (`src/components/DashboardSidebar.tsx:183`).
   - FACT — click behavior: if `item.route` is set, `navigate(route)`; otherwise `onTabChange(item.value)` — i.e. items without `route` switch an in-dashboard tab, they do not change the URL (`src/components/DashboardSidebar.tsx:300-306`).
   - FACT — rendering: groups are collapsible via `Collapsible`/`SidebarGroup`/`SidebarMenu` from `@/components/ui/sidebar` and `@/components/ui/collapsible` (`src/components/DashboardSidebar.tsx:42-60`, rendered at `src/components/DashboardSidebar.tsx:247-261` and `:308-345`).
   - FACT — icons library: `lucide-react` (`src/components/DashboardSidebar.tsx:3-41`).

2. Top navigation — `src/components/Navigation.tsx`.
   - FACT — `navLinks` array of `{ path, label, icon }` (`src/components/Navigation.tsx:18-27`); first 3 shown on desktop left (`src/components/Navigation.tsx:86`), the rest on desktop right (`src/components/Navigation.tsx:110`), all in the mobile `Sheet` menu (`src/components/Navigation.tsx:57-74`). Icons from `lucide-react` (`src/components/Navigation.tsx:5`).

3. Mobile bottom nav — `src/components/MobileBottomNav.tsx`.
   - FACT — `navItems` array of `{ path, label, icon }` (`src/components/MobileBottomNav.tsx:10-16`); rendered as `Link`s (`src/components/MobileBottomNav.tsx:23-47`); hidden on `/demo*` and `/` (`src/components/MobileBottomNav.tsx:9`); visible only below `md` (`src/components/MobileBottomNav.tsx:21`). Icons from `lucide-react` (`src/components/MobileBottomNav.tsx:2`).
   - FACT — `MobileBottomNav` is rendered globally by `PublicAwareAppChrome` for all non-public paths (`src/App.tsx:107-113`, `src/App.tsx:155`).

How to add a new group with sub-items: FACT — append a `NavGroup` object to `navigationGroups` (`src/components/DashboardSidebar.tsx:82-161`) with `label` and `items: NavItem[]`; each item needs `title`, `value`, `icon`, and `route` if it should navigate to a URL (`src/components/DashboardSidebar.tsx:66-73`, `:300-306`). INFERENCE: because simple mode filters to `simpleMode: true` items only (`src/components/DashboardSidebar.tsx:179`), a Wholesale group will be invisible in simple mode unless its items are marked `simpleMode: true`; and simple mode is the default for first-time users (`src/contexts/SimpleModeContext.tsx:28-31`).

### E. Conventions
- FACT — UI kit: shadcn-style components under `@/components/ui/*` (e.g. `@/components/ui/toaster`, `@/components/ui/sonner`, `@/components/ui/tooltip` at `src/App.tsx:2-4`; `@/components/ui/sidebar`, `@/components/ui/button`, `@/components/ui/collapsible`, `@/components/ui/badge` at `src/components/DashboardSidebar.tsx:42-63`; `@/components/ui/sheet` at `src/components/Navigation.tsx:4`).
- FACT — data fetching: `@tanstack/react-query` is installed and configured with a shared `QueryClient` (staleTime 5 min, gcTime 10 min, retry 3, no refetch on window focus) (`src/App.tsx:5`, `src/App.tsx:41-50`), provided at `src/App.tsx:119`. FACT — direct Supabase client usage also exists: `supabase.auth.*` is called directly in contexts (`src/contexts/AuthContext.tsx:38`, `:46`, `:60`; `src/contexts/OrganizationContext.tsx:64`). The material contains no example of a table query, so which pattern table reads use is UNKNOWN.
- FACT — supabase client import path: `import { supabase } from '@/integrations/supabase/client';` (`src/integrations/supabase/client.ts:8-9`; used at `src/contexts/AuthContext.tsx:3`, `src/contexts/OrganizationContext.tsx:10`). The client is `createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)` (`src/integrations/supabase/client.ts:11`); the key is `<REDACTED>` (`src/integrations/supabase/client.ts:6`).
- FACT — toast: two toasters mounted globally — `Toaster` from `@/components/ui/toaster` and `Sonner` from `@/components/ui/sonner` (`src/App.tsx:2-3`, rendered at `src/App.tsx:125-126`).
- FACT — forms: no form library or form component appears in the material. UNKNOWN.
- FACT — class merging helper: `cn` from `@/lib/utils` (`src/components/DashboardSidebar.tsx:61`, `src/components/MobileBottomNav.tsx:3`, `src/components/NavLink.tsx:2`).
- FACT — routing helpers: `react-router-dom` (`BrowserRouter`, `Routes`, `Route`, `useLocation`, `useNavigate`, `Link`, `NavLink`) (`src/App.tsx:6`, `src/components/Navigation.tsx:2`, `src/components/NavLink.tsx:1`); a custom `NavLink` wrapper with `activeClassName` exists at `src/components/NavLink.tsx:9-18`.
- FACT — provider nesting order (outer to inner): `GlobalErrorBoundary` > `HelmetProvider` > `QueryClientProvider` > `ThemeProvider` > `DemoModeProvider` > `SimpleModeProvider` > `AIErrorProvider` > `TooltipProvider` > `BrowserRouter` > `AuthProvider` > `OrganizationProvider` > `AIBrainProvider` > `Suspense`/`Routes` (`src/App.tsx:117-156`). INFERENCE: a new page inside `Routes` can use `useAuth`, `useOrganizationContext`, react-query, and toasts without adding providers.

### F. Add-a-page recipe
To add protected `/wholesale/properties` appearing in sidebar and mobile nav:

1. Create the page component file (e.g. `src/pages/wholesale/Properties.tsx`). No existing wholesale page exists in the material; this is a new file. (INFERENCE from the lazy-import pattern at `src/App.tsx:19-34`.)
2. Add a lazy import alongside the others in `src/App.tsx` (after line 34, in the block `src/App.tsx:19-34`): `const WholesaleProperties = lazy(() => import("./pages/wholesale/Properties"));`
3. Add the route inside `<Routes>` in the protected block, e.g. after `src/App.tsx:150`: `<Route path="/wholesale/properties" element={<ProtectedRoute><WholesaleProperties /></ProtectedRoute>} />` — following the pattern at `src/App.tsx:141-150`. No change needed to the public prefix lists (`src/App.tsx:87-95`, `src/contexts/AuthContext.tsx:15-23`) because `/wholesale` should stay non-public.
4. Sidebar: add a new `NavGroup` to `navigationGroups` in `src/components/DashboardSidebar.tsx:82-161`, e.g. `{ label: 'Wholesale', defaultOpen: true, items: [ { title: 'Properties', value: 'wholesale-properties', icon: <lucide icon>, route: '/wholesale/properties', simpleMode: true }, ... ] }`. The `route` field is required for URL navigation (`src/components/DashboardSidebar.tsx:71`, `:300-306`); `simpleMode: true` is required for it to appear in simple mode (`src/components/DashboardSidebar.tsx:179`). Import the icon from `lucide-react` in the existing import block (`src/components/DashboardSidebar.tsx:3-41`).
5. Mobile bottom nav: add `{ path: '/wholesale/properties', label: 'Wholesale', icon: <lucide icon> }` to `navItems` in `src/components/MobileBottomNav.tsx:10-16` and import the icon at `src/components/MobileBottomNav.tsx:2`. Note the bar currently has 5 items (`src/components/MobileBottomNav.tsx:11-15`); adding a 6th changes the layout of the `flex justify-around` row (`src/components/MobileBottomNav.tsx:22`). (INFERENCE on layout impact.)
6. Optional top nav: add `{ path: '/wholesale/properties', label: 'Wholesale', icon: <lucide icon> }` to `navLinks` in `src/components/Navigation.tsx:18-27` and import the icon at `src/components/Navigation.tsx:5`. Note desktop shows `navLinks.slice(0, 3)` left and `slice(3)` right (`src/components/Navigation.tsx:86`, `:110`), so position in the array decides placement. (INFERENCE.)
7. No change needed to `AuthProvider`/`OrganizationProvider` wiring (`src/App.tsx:128-129`) — the new route sits inside them.

### G. UNKNOWN list
- `ProtectedRoute` implementation (what it checks, where it redirects, whether it waits on `loading`): file `src/components/ProtectedRoute.tsx` would answer it. It is imported at `src/App.tsx:14` but not provided.
- Sign-up flow: file `src/components/AuthPage.tsx` (imported at `src/pages/Auth.tsx:2`) would answer it.
- `OrganizationSelector` UI and switch behavior: file `src/components/OrganizationSelector.tsx` (imported at `src/components/Navigation.tsx:9`) would answer it.
- `getUserOrganizations` and the `OrganizationWithRole` shape (fields such as `id`, `user_role`, name): file `src/lib/organizationContext.ts` (imported at `src/contexts/OrganizationContext.tsx:9`) would answer it.
- Whether table queries filter by `organization_id` or rely on RLS: no query code is in the material; the data hooks/pages that query tables (e.g. the `Dashboard` component imported at `src/pages/Index.tsx:2`, or any `src/hooks/*` query hooks) would answer it.
- Forms convention (form library, validation): no form code in the material; a page with a form (e.g. `src/pages/Settings.tsx`) would answer it.
- Whether `DashboardSidebar` is actually rendered anywhere: it is defined at `src/components/DashboardSidebar.tsx:191` but no file in the material imports it; `src/components/Dashboard.tsx` (imported at `src/pages/Index.tsx:2`) would answer it. INFERENCE: the sidebar's `onTabChange` prop implies it lives inside `Dashboard`.
- `useSimpleMode` hook (used at `src/components/DashboardSidebar.tsx:62`): file `src/hooks/useSimpleMode.ts` would answer it; the context it likely wraps is `src/contexts/SimpleModeContext.tsx:69-75`.