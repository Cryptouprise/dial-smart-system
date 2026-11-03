# arch-e-coupling-cm

- status: completed
- tldr: CampaignManager.tsx: 2179 lines; 12 direct supabase calls (9 from + 3 invoke); 0 useContext; 1 prop (onRefresh); 9 custom hooks; dominant pattern hooks + heavy direct-supabase.

Node arch-e-coupling-cm COMPLETE. Inspected C:/Users/charl/dial-smart-system/src/components/CampaignManager.tsx in full (2179 lines). (a) lines=2179. (b) Direct supabase calls: from=9 + functions.invoke=3 = COMBINED 12 (naive literal grep for 'supabase.from(' undercounts to 1 because 8 of 9 .from( sit on the continuation line after 'await supabase'). (c) useContext=0. (d) Props: exactly one, onRefresh?: () => void. (e) 9 custom hooks used: usePredictiveDialing, useCampaignCompliance, useLeadPrioritization, useCallDispatcher, useCampaignReadiness, useToast, useDemoData, useCurrentUser (all @/hooks/*), useCurrentOrganizationId (@/contexts/OrganizationContext). (f) 8 example call sites with exact text provided. Dominant data-access pattern = HOOKS (lifecycle CRUD via custom hooks; 1 callback prop; 0 useContext), with direct-supabase as a heavy co-dominant secondary creating tight coupling to 5 tables + 3 edge functions.

## Artifact

**Findings**

CampaignManager.tsx is 2179 lines. (a) lines=2179. (b) Direct supabase client calls: supabase.from( = 9, supabase.functions.invoke( = 3, COMBINED = 12. A naive grep for the literal 'supabase.from(' undercounts to 1 because 8 of the 9 .from( calls are chained on the line AFTER 'await supabase' (multi-line fluent style); all 9 .from( attach to the supabase client. (c) useContext( = 0. (d) Props = exactly ONE: onRefresh?: () => void (interface CampaignManagerProps, lines 79-81; component destructures { onRefresh } at line 98). (e) Custom hooks USED with import source: usePredictiveDialing (L17 import, L99 call, @/hooks/usePredictiveDialing); useCampaignCompliance (L18, L902 inside nested CampaignComplianceStatus component, @/hooks/useCampaignCompliance); useLeadPrioritization (L19, L101, @/hooks/useLeadPrioritization); useCallDispatcher (L20, L102, @/hooks/useCallDispatcher); useCampaignReadiness (L23, L493, @/hooks/useCampaignReadiness); useToast (L29, L103, @/hooks/use-toast); useDemoData (L32, L104, @/hooks/useDemoData); useCurrentUser (L33, L105, @/hooks/useCurrentUser); useCurrentOrganizationId (L37, L106, @/contexts/OrganizationContext). = 9 custom hooks. Builtin react hooks (L2): useState/useEffect used; useMemo imported but NOT called (unused import). (f) Dominant data-access pattern = HOOKS: the campaign/lead/call/dispatch/readiness/compliance/prioritization lifecycle flows through custom hooks, props is only a single callback, and there are 0 useContext calls. HOWEVER direct-supabase is a heavy co-dominant secondary (12 raw client calls to 5 tables + 3 edge functions), so the component is effectively a hooks+direct-supabase hybrid with heavy direct coupling; weighted by raw DB/edge calls alone, direct-supabase would be dominant. 5-8 file:line examples: L221 .from('campaign_workflows').select('id, name, description, active'); L237 .from('phone_numbers').select('number, retell_phone_id, status, quarantine_until'); L271 supabase.functions.invoke('retell-agent-management', { body: { action: 'list' } }); L331 .from('telnyx_assistants').select('id, name, telnyx_assistant_id'); L407 supabase.functions.invoke('sms-messaging', { body: { action: 'get_available_numbers' } }); L557 await supabase.from('campaigns').insert({...}); L599 .from('calendar_integrations').select('id'); L703 .from('campaigns').update({ retry_delay_minutes: 15 }).

**evidence**

- CampaignManager.tsx:2179 line count
- CampaignManager.tsx:79-81 props interface CampaignManagerProps { onRefresh?: () => void }
- CampaignManager.tsx:98 destructures { onRefresh }
- CampaignManager.tsx:221 .from('campaign_workflows')
- CampaignManager.tsx:237 .from('phone_numbers')
- CampaignManager.tsx:271 supabase.functions.invoke('retell-agent-management', { body: { action: 'list' } })
- CampaignManager.tsx:272 supabase.functions.invoke('retell-phone-management', { body: { action: 'list' } })
- CampaignManager.tsx:331 .from('telnyx_assistants')
- CampaignManager.tsx:407 supabase.functions.invoke('sms-messaging', { body: { action: 'get_available_numbers' } })
- CampaignManager.tsx:430 .from('phone_numbers') fallback
- CampaignManager.tsx:547 .from('campaigns') ownership check
- CampaignManager.tsx:557 await supabase.from('campaigns').insert({...})
- CampaignManager.tsx:599 .from('calendar_integrations')
- CampaignManager.tsx:703 .from('campaigns').update({ retry_delay_minutes: 15 })
- CampaignManager.tsx:794 .from('phone_numbers') for AI call
- grep useContext( = 0 matches

**validation**

Read the file in full (2179 lines) via the read tool; ran PowerShell Get-Content Count for line count and regex match counts. Reconciled the 1-vs-9 .from( discrepancy by listing every .from( line number (221,237,331,430,547,557,599,703,794) and confirming each is chained to `supabase`. Verified all 3 supabase.functions.invoke( lines match the 3 invoke strings.

**open_questions**

- Are the imported custom hooks themselves thin wrappers over supabase, making true direct-supabase coupling higher than the 12 literal calls suggest?
- Does any parent pass onRefresh meaningfully, or is the single prop near-dead coupling?
- Is useMemo's unused import lint debt worth flagging in the arch report?

**what_i_did_not_check**

- Opened the imported hook files (usePredictiveDialing/useCallDispatcher/useCampaignReadiness etc.) to confirm whether those hooks themselves call supabase or an edge function - per-hook data-access depth unverified.
- Inspected the parent that renders <CampaignManager> to confirm onRefresh usage.
- Verified useMemo is truly unused via AST (grep-based only).
- Checked the other dial-smart-system components (covered by other arch-sweep nodes).

**confidence**: high