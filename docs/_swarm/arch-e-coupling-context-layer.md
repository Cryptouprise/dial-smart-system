# arch-e-coupling-context-layer

- status: completed
- tldr: Synth 'no service interface' = overstated; no supabase repository layer, but services/ + lib helpers exist

VERDICT: synth's absolute claim "no repository/service interface" is FALSE as stated (overstated); the underlying coupling concern is FACT but qualified. Evidence: (1) client.ts IS a singleton but NOT env-sourced — hardcoded URL (line 5) + hardcoded anon key (line 6), export at line 11. (2) OrganizationContext.tsx provider DOES call supabase (auth subscription line 64) but org data access is delegated to lib/organizationContext.ts getUserOrganizations (lines 44-79, .from('organization_users')); organizationId derives from localStorage 'currentOrganizationId' (line 36) + membership list, exposed via useCurrentOrganizationId (line 131). (3) AIBrainContext.tsx does NOT touch supabase — it delegates to @/hooks/useAIBrain (line 2); the ai-brain invoke lives in the hook. (4) A partial layer EXISTS: src/services/ (carrierRouter + retell/telnyx/twilio adapters), src/lib/organizationContext.ts, src/lib/edgeFunctionUtils.ts. No src/api/ or src/repositories/. But ~190 files import @/integrations/supabase/client directly.

## Artifact

**Findings**

1) supabase/client.ts IS a singleton createClient but NOT env-sourced: hardcoded URL https://emonjusymdripmkvtttc.supabase.co (line 5) and hardcoded anon JWT (line 6), exported as `export const supabase = createClient<Database>(...)` (line 11). It is generated, no import.meta.env. 2) OrganizationContext.tsx DOES call supabase directly (import line 10; supabase.auth.onAuthStateChange line 64) but org DATA access is delegated to @/lib/organizationContext.ts getUserOrganizations (imported line 9, used line 34). organizationId is derived NOT from supabase in the provider but from localStorage key 'currentOrganizationId' (line 36) reconciled against the membership list (lines 41-51, 82); useCurrentOrganizationId returns currentOrganization?.id (line 131). getUserOrganizations (lib/organizationContext.ts lines 44-79) dynamically imports the client (line 47) and queries `.from('organization_users').select('role, organizations(...)').eq('user_id', user.id)` (lines 55-63), returns [] on error/table-missing. 3) AIBrainContext.tsx does NOT call supabase at all: it imports and delegates everything to @/hooks/useAIBrain (line 2); the supabase.functions.invoke('ai-brain') call lives in the hook, not the provider. 4) A partial service/data-access layer DOES exist: src/services/ with carrierRouter.ts + providers/ (retellAdapter, telnyxAdapter, twilioAdapter, factory createProviderAdapter), src/lib/organizationContext.ts (org queries), src/lib/edgeFunctionUtils.ts (centralized edge-fn invoke + error extraction). There is NO src/api/ and NO src/repositories/ dir. However ~190 files import `@/integrations/supabase/client` directly (components/*, hooks/*, pages/*, lib/*), so there is no universal repository layer over supabase.

**evidence**

- src/integrations/supabase/client.ts:5 hardcoded SUPABASE_URL
- src/integrations/supabase/client.ts:6 hardcoded SUPABASE_PUBLISHABLE_KEY
- src/integrations/supabase/client.ts:11 export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
- src/contexts/OrganizationContext.tsx:9 import getUserOrganizations from @/lib/organizationContext
- src/contexts/OrganizationContext.tsx:10 import supabase
- src/contexts/OrganizationContext.tsx:34 await getUserOrganizations()
- src/contexts/OrganizationContext.tsx:36 const savedOrgId = localStorage.getItem('currentOrganizationId')
- src/contexts/OrganizationContext.tsx:64 supabase.auth.onAuthStateChange(...)
- src/contexts/OrganizationContext.tsx:131 return currentOrganization?.id || null
- src/contexts/AIBrainContext.tsx:2 import { useAIBrain } from '@/hooks/useAIBrain'
- src/lib/organizationContext.ts:47 const { supabase } = await import('@/integrations/supabase/client')
- src/lib/organizationContext.ts:54-63 (supabase as any).from('organization_users').select(...).eq('user_id', user.id)
- src/services/carrierRouter.ts:15 header + providers/types import
- src/services/providers/index.ts:17-23 createProviderAdapter factory
- src/lib/edgeFunctionUtils.ts:1-4 edge function invoke/error helper
- dir check: src/services EXISTS, src/lib EXISTS, src/data EXISTS, src/integrations EXISTS, src/api ABSENT, src/repositories ABSENT

**validation**

Read client.ts fully (11 lines). Read OrganizationContext.tsx fully (161 lines). grep of contexts for 'supabase' (22 matches/6 files). Read lib/organizationContext.ts lines 1-100. Read heads of AIBrainContext.tsx, services/providers/index.ts, services/carrierRouter.ts, lib/edgeFunctionUtils.ts. Paths_only grep of src for '@/integrations/supabase/client' returned ~190 files. Filesystem existence check confirmed services/ present, api/ and repositories/ absent.

**open_questions**

- Where exactly does supabase.functions.invoke('ai-brain') live (hooks/useAIBrain.ts) and does it import the singleton client directly?
- Are the ~190 direct-import files a coherent coupling concern or mostly the same 3 patterns (auth, .from, .functions.invoke)?
- Is the hardcoded anon key a deployed-secret exposure or is RLS the only guard?

**what_i_did_not_check**

- Did not open hooks/useAIBrain.ts to confirm the ai-brain invoke import site.
- Did not enumerate/categorize all ~190 direct supabase imports by pattern (only counted them).
- Did not confirm whether client.ts anon key differs across envs / whether a .env overrides exist.
- Did not inspect src/lib/mcp, src/lib/coach, src/packs for supabase coupling.

**confidence**: high