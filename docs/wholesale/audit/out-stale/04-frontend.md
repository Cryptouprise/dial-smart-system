Assumption: `src/App.tsx` was supplied base64-encoded; I decoded it and cite line numbers from the decoded text (line numbers below refer to the decoded file, which is 1 logical line per original source line as printed in the material).

### A. Routes

FACT — all routes are declared in `src/App.tsx` inside `<Routes>` (decoded lines 62–84). Public routes (decoded lines 63–67):
- `/` -> `LandingPage` (`src/App.tsx:64`)
- `/auth` -> `Auth` (`src/App.tsx:65`)
- `/demo` -> `Demo` (`src/App.tsx:66`)
- `/showcase/*` -> `ShowcaseRouteBridge` (`src/App.tsx:67`)

FACT — protected routes, each wrapped in `<ProtectedRoute>` (decoded lines 70–80):
- `/dashboard` -> `Index` (`src/App.tsx:70`)
- `/sms-conversations` -> `AiSmsConversations` (`src/App.tsx:71`)
- `/number-webhooks` -> `NumberWebhooks` (`src/App.tsx:72`)
- `/settings` -> `Settings` (`src/App.tsx:73`)
- `/api-keys` -> `ApiKeys` (`src/App.tsx:74`)
- `/help` -> `HelpPage` (`src/App.tsx:75`)
- `/analytics` -> `Analytics` (`src/App.tsx:76`)
- `/install` -> `InstallApp` (`src/App.tsx:77`)
- `/system-testing` -> `SystemTestingHub` (`src/App.tsx:78`)
- `*` -> `NotFound` (`src/App.tsx:83`)

FACT — protection mechanism: a `<ProtectedRoute>` wrapper component imported from `@/components/ProtectedRoute` (`src/App.tsx:14`), used as `<Route path="..." element={<ProtectedRoute><Page /></ProtectedRoute>} />` (`src/App.tsx:70`–`78`). The internals of `ProtectedRoute` are not in the material.

FACT — a second, independent guard exists in `AuthContext`: on `onAuthStateChange`, if there is no session and the path is not one of `/`, `/auth`, `/demo`, `/showcase`, it navigates to `/auth` (`src/contexts/AuthContext.tsx:37`–`47`).

FACT — all page components are `lazy()`-loaded (`src/App.tsx:20`–`31`) and rendered inside `<Suspense fallback={<PageLoader />}>` (`src/App.tsx:61`, `src/App.tsx:81`).

FACT — provider nesting order (outer to inner): `GlobalErrorBoundary` > `HelmetProvider` > `QueryClientProvider` > `ThemeProvider` > `DemoModeProvider` > `SimpleModeProvider` > `AIErrorProvider` > `TooltipProvider` > `Toaster`/`Sonner` > `BrowserRouter` > `AuthProvider` > `OrganizationProvider` > `AIBrainProvider` > `Suspense` > `Routes` (`src/App.tsx:47`–`84`).

### B. Auth

FACT — context: `AuthContext`, created in `src/contexts/AuthContext.tsx:13`; provider `AuthProvider` (`src/contexts/AuthContext.tsx:15`); hook `useAuth()` (`src/contexts/AuthContext.tsx:65`).

FACT — exposed fields: `user: User | null`, `session: Session | null`, `loading: boolean`, `signOut: () => Promise<void>` (`src/contexts/AuthContext.tsx:6`–`11`).

FACT — session is obtained via `supabase.auth.getSession()` on mount (`src/contexts/AuthContext.tsx:23`) and kept current via `supabase.auth.onAuthStateChange` (`src/contexts/AuthContext.tsx:32`–`35`). `signOut` calls `supabase.auth.signOut()` then `navigate('/auth')` (`src/contexts/AuthContext.tsx:53`–`56`).

FACT — sign-up: the material contains no sign-up implementation. `src/pages/Auth.tsx` only renders `<AuthPage />` (`src/pages/Auth.tsx:2`–`5`); `src/components/AuthPage.tsx` is not in the material. UNKNOWN — see G.

### C. Organizations

FACT — context: `OrganizationContext`, created in `src/contexts/OrganizationContext.tsx:20`; provider `OrganizationProvider` (`src/contexts/OrganizationContext.tsx:26`); hook `useOrganizationContext()` (`src/contexts/OrganizationContext.tsx:104`).

FACT — exposed fields: `organizations: OrganizationWithRole[]`, `currentOrganization: OrganizationWithRole | null`, `setCurrentOrganization(org)`, `loading`, `refreshOrganizations()` (`src/contexts/OrganizationContext.tsx:12`–`18`).

FACT — convenience hooks: `useCurrentOrganizationId(): string | null` (`src/contexts/OrganizationContext.tsx:116`–`119`), `useIsOrganizationAdmin(): boolean` (owner/admin) (`src/contexts/OrganizationContext.tsx:124`–`128`), `useHasOrganizationRole(minimumRole)` with hierarchy member=1, manager=2, admin=3, owner=4 (`src/contexts/OrganizationContext.tsx:133`–`148`).

FACT — org list is loaded via `getUserOrganizations()` from `@/lib/organizationContext` (`src/contexts/OrganizationContext.tsx:9`, `:34`). On load, the saved org id is read from `localStorage` key `currentOrganizationId` and matched against the list; otherwise the first org is selected (`src/contexts/OrganizationContext.tsx:38`–`43`). The current org id is persisted to `localStorage` key `currentOrganizationId` on change (`src/contexts/OrganizationContext.tsx:71`–`75`).

FACT — switching org: `setCurrentOrganization(org)` (`src/contexts/OrganizationContext.tsx:77`–`79`), exposed in the UI via `<OrganizationSelector />` rendered in `src/components/Navigation.tsx:105` (component file `@/components/OrganizationSelector` imported at `src/components/Navigation.tsx:9`; its internals are not in the material).

FACT — org state is reset on `SIGNED_OUT` and reloaded on `SIGNED_IN` (`src/contexts/OrganizationContext.tsx:56`–`63`).

FACT — whether Supabase queries filter by `organization_id` or rely on RLS: the material contains no data-fetching query code (no `useQuery`/`supabase.from(...)` call sites are provided). UNKNOWN — see G.

### D. Navigation

FACT — three separate navigation surfaces exist:
1. `src/components/DashboardSidebar.tsx` — the main sidebar, driven by a typed data structure.
2. `src/components/MobileBottomNav.tsx` — mobile bottom bar, driven by an inline array.
3. `src/components/Navigation.tsx` — top nav bar, driven by an inline array.

FACT — sidebar data structures: `interface NavItem { title; value; icon: React.ElementType; simpleMode?; route?; adminOnly? }` (`src/components/DashboardSidebar.tsx:65`–`72`) and `interface NavGroup { label; items; defaultOpen?; simpleModeLabel? }` (`src/components/DashboardSidebar.tsx:74`–`79`). The array is `const navigationGroups: NavGroup[]` (`src/components/DashboardSidebar.tsx:81`–`159`), with existing groups `Overview` (`:82`), `Phone & Dialing` (`:93`), `Leads & Pipeline` (`:105`), `AI & Automation` (`:117`), `Reports & Analytics` (`:132`), `System & Settings` (`:148`).

FACT — item click behavior: if `item.route` is set, `navigate(item.route)`; otherwise `onTabChange(item.value)` (`src/components/DashboardSidebar.tsx:297`–`303`). So a sidebar item only navigates to a URL if it has a `route` field (existing examples: `Try Demo` -> `/demo` at `:88`, `System Testing` -> `/system-testing` at `:152`).

FACT — filtering: `getFilteredNavigation(isSimpleMode, isAdmin)` drops `adminOnly` items for non-admins (`src/components/DashboardSidebar.tsx:166`–`169`), and in simple mode keeps only items with `simpleMode: true` (`src/components/DashboardSidebar.tsx:172`–`179`), then drops empty groups (`:181`). INFERENCE: a new Wholesale group with no `simpleMode: true` items will be invisible in Simple Mode, and Simple Mode is the default for first-time users (`src/contexts/SimpleModeContext.tsx:18`–`25`).

FACT — mobile bottom nav items: inline array `navItems` with `{ path, label, icon }` (`src/components/MobileBottomNav.tsx:10`–`16`), rendered as `<Link>` (`:28`–`45`); hidden on `/demo*` and `/` (`src/components/MobileBottomNav.tsx:9`).

FACT — top nav links: inline array `navLinks` with `{ path, label, icon }` (`src/components/Navigation.tsx:18`–`26`); desktop shows `navLinks.slice(0,3)` (`:85`) and `navLinks.slice(3)` (`:109`).

FACT — icon library: `lucide-react` (`src/components/DashboardSidebar.tsx:3`–`40`, `src/components/MobileBottomNav.tsx:2`, `src/components/Navigation.tsx:5`).

FACT — sidebar primitives come from `@/components/ui/sidebar` (`src/components/DashboardSidebar.tsx:41`–`53`) and collapsible groups from `@/components/ui/collapsible` (`:55`–`59`).

### E. Conventions

FACT — Supabase client import path: `import { supabase } from '@/integrations/supabase/client'` (`src/integrations/supabase/client.ts:9` comment; used at `src/contexts/AuthContext.tsx:3` and `src/contexts/OrganizationContext.tsx:10`). Client is `createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)` (`src/integrations/supabase/client.ts:11`); the key is `<REDACTED>` (`:6`).

FACT — data fetching: `@tanstack/react-query` `QueryClient`/`QueryClientProvider` is configured at app root with `staleTime` 5 min, `gcTime` 10 min, `retry: 3`, `refetchOnWindowFocus: false` (`src/App.tsx:34`–`44`, provider at `:49`). No example `useQuery` call site is in the material.

FACT — UI kit: shadcn-style components under `@/components/ui/*` — `toaster`, `sonner`, `tooltip`, `skeleton` (`src/App.tsx:2`–`5`, `:17`), `sidebar`, `button`, `collapsible`, `badge` (`src/components/DashboardSidebar.tsx:41`–`62`), `sheet` (`src/components/Navigation.tsx:4`).

FACT — toast: both `<Toaster />` and `<Sonner />` are mounted at root (`src/App.tsx:54`–`55`). No call-site example in the material.

FACT — forms: no form library or form component appears in the material. UNKNOWN.

FACT — path alias `@/` is used throughout (`src/App.tsx:2`, `src/contexts/AuthContext.tsx:3`).

FACT — route components are lazy-loaded (`src/App.tsx:20`–`31`).

### F. Add-a-page recipe

To add protected `/wholesale/properties` visible in sidebar and mobile nav:

1. Create the page component, e.g. `src/pages/wholesale/Properties.tsx` (convention: pages live in `src/pages/`, cf. `src/App.tsx:20`–`31`).
2. In `src/App.tsx`, add a lazy import next to the others (after `src/App.tsx:31`): `const WholesaleProperties = lazy(() => import("./pages/wholesale/Properties"));`
3. In `src/App.tsx`, add the route inside `<Routes>` above the `*` catch-all (the file itself instructs this at `src/App.tsx:82`), after `src/App.tsx:78`:
   `<Route path="/wholesale/properties" element={<ProtectedRoute><WholesaleProperties /></ProtectedRoute>} />`
4. In `src/components/DashboardSidebar.tsx`, add a new group to `navigationGroups` (insert after `src/components/DashboardSidebar.tsx:158`, before the closing `];` at `:159`), e.g.:
   `{ label: 'Wholesale', defaultOpen: true, items: [ { title: 'Properties', value: 'wholesale-properties', icon: Building2, route: '/wholesale/properties', simpleMode: true }, ... ] }`
   — `route` is required for URL navigation (`src/components/DashboardSidebar.tsx:297`–`303`); `simpleMode: true` is required to survive Simple Mode filtering (`:172`–`179`); import the icon from `lucide-react` in the import block at `src/components/DashboardSidebar.tsx:3`–`40`.
5. In `src/components/MobileBottomNav.tsx`, add an entry to `navItems` (`src/components/MobileBottomNav.tsx:10`–`16`), e.g. `{ path: '/wholesale/properties', label: 'Wholesale', icon: Building2 }`, and add the icon to the `lucide-react` import at `src/components/MobileBottomNav.tsx:2`. Note the bar renders all items in a fixed `justify-around` row (`:22`); adding a 6th item is a layout change, not a code break.
6. Optional (top nav): add to `navLinks` in `src/components/Navigation.tsx:18`–`26`; note desktop only renders `slice(0,3)` and `slice(3)` (`:85`, `:109`), so position determines placement.
7. No change needed to `AuthContext`/`OrganizationContext` for protection: `ProtectedRoute` (`src/App.tsx:14`) plus the auth-state redirect (`src/contexts/AuthContext.tsx:37`–`47`) already cover any non-public path.

### G. UNKNOWN list

- `src/components/ProtectedRoute.tsx` — internals of protection (does it check `loading`, redirect, render spinner?). File needed: `src/components/ProtectedRoute.tsx`.
- Sign-up flow — no sign-up code in material. File needed: `src/components/AuthPage.tsx`.
- Whether app queries filter by `organization_id` or rely on RLS — no query call sites provided. Files needed: any `src/hooks/*` or page using `supabase.from(...)`, plus RLS policies in `supabase/migrations/*`.
- `getUserOrganizations()` implementation and `OrganizationWithRole` shape (fields beyond `id`, `user_role`). File needed: `src/lib/organizationContext.ts`.
- `OrganizationSelector` component (how the switch UI calls `setCurrentOrganization`). File needed: `src/components/OrganizationSelector.tsx`.
- `useSimpleMode` hook (re-exported vs. context) — sidebar imports `@/hooks/useSimpleMode` (`src/components/DashboardSidebar.tsx:61`) while context is `@/contexts/SimpleModeContext` (`src/contexts/SimpleModeContext.tsx:61`). File needed: `src/hooks/useSimpleMode.ts`.
- Form library / validation convention — none in material.
- Toast call-site convention (`useToast` vs `sonner`) — only providers seen (`src/App.tsx:54`–`55`).
- `Dashboard` component and how `activeTab` is wired to `DashboardSidebar` — `src/pages/Index.tsx` renders `<Dashboard />` (`src/pages/Index.tsx:8`) but `DashboardSidebar` requires `activeTab`/`onTabChange` props (`src/components/DashboardSidebar.tsx:184`–`189`). File needed: `src/components/Dashboard.tsx`.