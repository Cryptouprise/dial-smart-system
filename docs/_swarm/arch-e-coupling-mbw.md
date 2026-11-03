# arch-e-coupling-mbw

- status: completed
- tldr: MBW: 1837 lines, 9 direct supabase calls (6 .from + 3 invoke), no props, 2 context hooks; dominant = direct-supabase.

DONE: Full inspection of MissionBriefingWizard.tsx for coupling pattern.
TOUCHED: none (read-only; temp analysis .ps1 files created and deleted).
EVIDENCE: LINECOUNT=1837; supabase.functions.invoke(=3; literal supabase.from(=0 but real .from( call sites=6 (multi-line chains); combined direct client calls=9; useContext(=0; no props; 2 custom context hooks.
RESULT: File=1837 lines. Direct supabase client calls: from=6, invoke=3, combined=9. Props: NONE (React.FC at :328). useContext(: 0. Custom hooks: useAIBrainContext (import :20, used :353) from '@/contexts/AIBrainContext'; useCurrentOrganizationId (import :23, used :354) from '@/contexts/OrganizationContext'. Examples: :364-368 phone_numbers count; :376-380 campaigns agent_id; :387-390 telnyx_assistants; :554 invoke('ghl-integration'); :624-628 campaigns; :634-638 campaign_workflows; :679 invoke('lead-csv-import'); :1091 invoke('phone-number-purchasing'). Classification: DIRECT-SUPABASE dominant (9 inline data-access calls in a 1837-line god component; no props; context via 2 custom hooks, not useContext).
COULD_NOT: n/a
CONFIDENCE: high
Validation: read file in windows + PowerShell ReadAllLines scan; temp scripts removed.

## Artifact

**Findings**

MissionBriefingWizard.tsx INSPECTED IN FULL (1837 lines). (a) EXACT LINE COUNT = 1837 (verified via [System.IO.File]::ReadAllLines().Count; note: `Get-Content | Measure-Object -Line` reports 1707, under-counting trailing/no-newline segments - trust 1837). (b) DIRECT SUPABASE CALLS: `supabase.functions.invoke(` = 3 (lines 554, 679, 1091); literal one-line `supabase.from(` = 0 BUT actual `.from(` call sites = 6 (lines 365, 377, 388, 625, 635, 645) because the client object sits on one line (`await supabase`) and `.from(` chains on the next line. Combined direct client calls = 6 + 3 = 9. Separate: from=6, invoke=3. (c) `useContext(` = 0 (context is NOT consumed via useContext; it is consumed via 2 custom context hooks). (d) PROPS: NONE - signature is `const MissionBriefingWizard: React.FC = () => {` (line 328); no Props interface, no destructured params. (e) CUSTOM HOOKS: `useAIBrainContext()` imported from '@/contexts/AIBrainContext' (import line 20, used line 353 -> destructures `sendMessage`); `useCurrentOrganizationId()` imported from '@/contexts/OrganizationContext' (import line 23, used line 354). All other hooks are React builtins (useState x~21, useEffect x4, useMemo x5, useRef x1). (f) EXAMPLES OF DIRECT SUPABASE CALLS (file:line + exact call text): 364-368 `const { count } = await supabase.from('phone_numbers').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'active');` | 376-380 `const { data: retellData } = await supabase.from('campaigns').select('agent_id').eq('organization_id', organizationId).not('agent_id', 'is', null);` | 387-390 `const { data: telnyxData } = await (supabase as any).from('telnyx_assistants').select('id, name, telnyx_assistant_id').eq('status', 'active');` | 554 `const { data: result, error } = await supabase.functions.invoke('ghl-integration', {` | 624-628 `const { data: campaigns } = await supabase.from('campaigns').select('id, name, status').order('created_at', { ascending: false }).limit(1);` | 634-638 `const { data: workflows } = await supabase.from('campaign_workflows').select('id, name').order('created_at', { ascending: false }).limit(1);` | 679 `const { error: uploadErr } = await supabase.functions.invoke('lead-csv-import', { body: formData });` | 1091 `const { data: result, error } = await supabase.functions.invoke('phone-number-purchasing', {`. CLASSIFICATION - dominant pattern = DIRECT-SUPABASE: this is a 1837-line 'god component' with 9 data-access calls (6 table reads via .from(), 3 edge-function invokes) baked inline; NO props at all; context is pulled in via 2 custom hooks (useAIBrainContext, useCurrentOrganizationId) rather than useContext. Secondary pattern = context (2 custom context hooks). The 'hooks' category is effectively the same as context here - the only custom hooks are the two context hooks. So: direct-supabase (dominant) > context (secondary, via hooks) > props (none).

**evidence**

- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:19 - `import { supabase } from '@/integrations/supabase/client';`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:328 - `const MissionBriefingWizard: React.FC = () => {` (no props)
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:353 - `const { sendMessage } = useAIBrainContext();`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:354 - `const organizationId = useCurrentOrganizationId();`
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:364-368 - phone_numbers count read
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:376-380 - campaigns agent_id read
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:387-390 - telnyx_assistants read ((supabase as any))
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:554 - functions.invoke('ghl-integration')
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:624-628 - campaigns latest read
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:634-638 - campaign_workflows read
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:644-648 - pipeline_boards read ((supabase as any))
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:679 - functions.invoke('lead-csv-import')
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:1091 - functions.invoke('phone-number-purchasing')
- Script counts (PowerShell ReadAllLines): LINECOUNT=1837, supabase.from(=0, functions.invoke(=3, useContext(=0, dot_from_total=6, combined=9

**validation**

Read the file in full via read tool (multiple windows: 1-120, 318-405, 620-694) plus a PowerShell ReadAllLines scan enumerating every line matching supabase / functions.invoke / useContext / .from( / use[A-Z]*. Cross-checked line numbers against actual reads. Confirmed no props by reading the component signature at line 328. Temp analysis scripts were created under src/components and removed afterward (verified absent).

**open_questions**

- Whether the coordinator's literal definition of 'direct supabase calls = supabase.from( + supabase.functions.invoke(' intends the 6 multi-line .from() chains to count as 6 (they should, they are real client calls) - reported both the literal single-line count (0 from) and the true call-site count (6).
- Whether 'hooks' vs 'context' should be counted as distinct categories given the only custom hooks ARE the two context hooks.

**what_i_did_not_check**

- Did not inspect the imported modules '@/contexts/AIBrainContext', '@/contexts/OrganizationContext', '@/integrations/supabase/client', '@/lib/testCallUtils' - coupling is reported from the call sites in this file only.
- Did not check other files/components for how MissionBriefingWizard is rendered (since it takes no props, parent usage is irrelevant to coupling but not verified).
- Did not analyze the ~1830 other lines for non-supabase side effects (e.g. executeTestCall at import line 22, toast calls) as coupling vectors.

**confidence**: high