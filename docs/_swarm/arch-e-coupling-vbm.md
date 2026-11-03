# arch-e-coupling-vbm

- status: completed
- tldr: VBM.tsx: 3053 lines, 0 props, 0 useContext, 13 direct supabase calls (7 from + 6 invoke), 5 custom hooks; dominant pattern = hooks (heavy direct-supabase hybrid).

DONE: Inspected VoiceBroadcastManager.tsx in full (3053 lines).
TOUCHED: none (read-only).
EVIDENCE: full file read + manual enumeration of every `supabase` occurrence.
RESULT: (a) 3053 lines. (b) Direct supabase client calls = 13 total (7 chained `.from(...)` + 6 `supabase.functions.invoke(...)`). Literal single-line `supabase.from(` = 0 (all `.from` are chained across lines: `supabase`\n  `.from(`). (c) `useContext(` = 0. (d) Props = NONE — signature `export const VoiceBroadcastManager: React.FC = () => {` (L86). (e) Custom hooks: useToast (@/hooks/use-toast), useVoiceBroadcast (@/hooks/useVoiceBroadcast), useBroadcastReadiness (@/hooks/useBroadcastReadiness), useLiveCampaignStats + useSystemHealth (@/hooks/useLiveCampaignStats). (f) supabase call examples: L189-190 `.from('telnyx_assistants')`; L204-206 `.from('phone_numbers')`; L347-348 `.from('broadcast_queue')`; L431-433 `.from('leads')`; L452-454 `.from('broadcast_queue')`; L215/L250/L281/L309 `functions.invoke('twilio-integration')`; L476/L1899 `functions.invoke('voice-broadcast-engine')`. Classification: DOMINANT = hooks, with a substantial direct-supabase secondary (13 raw calls in 5 loader fns); no props, no context — a hooks-over-direct-supabase hybrid.
COULD_NOT: nothing; all requested items answered. Literal `supabase.from(` genuinely = 0 due to multi-line formatting style (reported both literal and chained counts).
CONFIDENCE: high.

## Artifact

**Findings**

VoiceBroadcastManager.tsx is 3053 lines. It receives NO props (signature `export const VoiceBroadcastManager: React.FC = () => {` at line 86; default export at 3053). It uses ZERO React context (`useContext(` count = 0). Direct supabase client access: 13 total (7 chained `.from(...)` query builders + 6 `supabase.functions.invoke(...)`). NOTE: literal single-line `supabase.from(` count is 0 because every `.from` is written as `supabase` end-of-line then `.from(...)` on the next line; counting the chained calls gives 7. Custom hooks: useToast (@/hooks/use-toast, L14), useVoiceBroadcast (@/hooks/useVoiceBroadcast, L15), useBroadcastReadiness (@/hooks/useBroadcastReadiness, L16), useLiveCampaignStats and useSystemHealth (both @/hooks/useLiveCampaignStats, L17). Classification: DOMINANT = hooks (core domain ops: broadcast CRUD/lifecycle/readiness/live-stats all via hooks), with a substantial DIRECT-SUPABASE secondary layer (13 raw calls for supporting reads: telnyx assistants, phone numbers, sip configs, broadcast_queue, leads, queue results, pending counts). It is a hooks-over-direct-supabase hybrid; no props, no context.

**evidence**

- C:/Users/charl/dial-smart-system/src/components/VoiceBroadcastManager.tsx:1-3053 (full file read)
- L86 `export const VoiceBroadcastManager: React.FC = () => {` (no props)
- L3053 `export default VoiceBroadcastManager;`
- L14 import { useToast } from '@/hooks/use-toast'
- L15 import { useVoiceBroadcast, VoiceBroadcast, DTMFAction, parseDTMFActions } from '@/hooks/useVoiceBroadcast'
- L16 import { useBroadcastReadiness, BroadcastReadinessResult } from '@/hooks/useBroadcastReadiness'
- L17 import { useLiveCampaignStats, useSystemHealth } from '@/hooks/useLiveCampaignStats'
- L18 import { supabase } from '@/integrations/supabase/client'
- L189-190 `const { data } = await supabase` then `.from('telnyx_assistants')`
- L204-206 `const { data, error } = await supabase` then `.from('phone_numbers')`
- L215 `await supabase.functions.invoke('twilio-integration', {`
- L237-238 `const { data: sipData } = await supabase` then `.from('sip_trunk_configs')`
- L250 `await supabase.functions.invoke('twilio-integration', {`
- L281 `await supabase.functions.invoke('twilio-integration', {`
- L295-296 `await supabase` then `.from('phone_numbers').update(...)`
- L309 `await supabase.functions.invoke('twilio-integration', {`
- L347-348 `const { count, error } = await supabase` then `.from('broadcast_queue')`
- L431-433 `const { data, error } = await supabase` then `.from('leads')`
- L452-454 `const { data, error } = await supabase` then `.from('broadcast_queue')`
- L476 `await supabase.functions.invoke('voice-broadcast-engine', {`
- L1899 `await supabase.functions.invoke('voice-broadcast-engine', {`

**validation**

Read the entire 3053-line file via the read tool and manually enumerated every `supabase` occurrence (from/invoke/auth). Cross-checked the literal-string grep (returned 0, as expected given multi-line `.from(` formatting). Counts: from=7 (L189,204,237,295,347,431,452), functions.invoke=6 (L215,250,281,309,476,1899), combined client calls=13; auth-only calls (getUser/getSession) at L187,201,428,449,1898 excluded. useContext( = 0 (searched full file). Props = none.

**open_questions**

- Are the 13 direct-supabase calls in the 5 loader functions (loadLeads, loadPhoneNumbers, loadTelnyxAssistants, loadQueueResults, loadPendingCounts) intended to be migrated into useVoiceBroadcast or a new hook, or are they deliberate escape hatches?
- Does useVoiceBroadcast itself call supabase directly (out of scope for this node), and would moving these calls in create duplicate state?
- Is the multi-line `supabase` + `.from(` formatting style the repo convention (affects any grep-based coupling metric)?
- retryFailedCalls is destructured (L102) but appears unused in the render tree — is it dead, or used indirectly?

**what_i_did_not_check**

- The innards of the custom hooks (useVoiceBroadcast, useBroadcastReadiness, useLiveCampaignStats, useSystemHealth) — whether they themselves use direct supabase or context; this node scopes only the component file.
- Whether any child components (QuickTestBroadcast, BroadcastQueueManager, LiveProgressDashboard, BroadcastReadinessChecker, BroadcastStepIndicator, imported L37-41) add further direct-supabase coupling.
- Whether useBroadcastReadiness/useLiveCampaignStats internally consume React context (would change the 'no context' conclusion to indirect).
- Whether retryFailedCalls and other destructured hook members are actually referenced anywhere in the JSX (only spot-checked).

**confidence**: high