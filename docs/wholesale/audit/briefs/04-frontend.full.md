## WHY THIS AUDIT EXISTS (read first)
We are turning a real-estate wholesaler's lead machine into a product that lives INSIDE this app (Dial Smart).
Each wholesaler company will be one tenant. Their people log in, see their property leads, call homeowners and listing
agents THEMSELVES from the browser (human calling, click-to-call) AND let the AI caller (Grace, on Retell) call for them,
text sellers, track offers and deals, and pay us monthly. We will ADD new tables (prefix wh_) and new edge functions
(prefix wh-) on a branch. We will NOT change existing tables or functions. Your job is to tell us exactly what already
exists that we can reuse, and what would break if we leaned on it. Precision matters more than coverage.
# JOB 04 - Frontend structure: where a new Wholesale module plugs in (lane: flash)
## TASK
Read the React files provided (router, auth + organization contexts, navigation/sidebar components). We will add a new
section "Wholesale" with pages: Properties, Call list, Dialer (human click-to-call), Inbox, Offers, Deals, Settings.
## QUESTIONS
1. Routing: list every route in App.tsx (path -> component), which are behind login, and how protection is done.
2. Auth: how the user session is obtained and exposed (context name, hook name, fields). How sign-up works.
3. Organizations: how the current organization is chosen and exposed (context, hook, fields), how a user switches org, and
   whether Supabase queries in the app filter by organization_id or rely on RLS.
4. Navigation: how sidebar / nav / mobile bottom nav items are defined (data structure, file:line), how to add a new group
   with sub-items, icons library used.
5. Conventions to copy: UI kit (shadcn components path), data fetching (react-query? direct supabase client?), toast,
   forms, the supabase client import path.
6. Exact step list to add a new protected page "/wholesale/properties" so it appears in the sidebar and mobile nav, citing
   the lines that would change.
## OUTPUT FORMAT
### A. Routes
### B. Auth
### C. Organizations
### D. Navigation
### E. Conventions
### F. Add-a-page recipe
### G. UNKNOWN list
