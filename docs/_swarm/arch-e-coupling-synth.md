# arch-e-coupling-synth

- status: completed
- tldr: Synthesized 5 coupling reports: 11637 lines, 28 .from + 25 invoke = 53 direct supabase calls, 0 useContext, 0-5 props. All 5 bypass any service layer.

CONSOLIDATED SYNTHESIS of 5 dial-smart-system components (arch-e-coupling-synth), from siblings vbm/cm/aed/mbw/aisc. All 5 siblings self-report confidence=high; no file re-read needed.

(1) PER-FILE TABLE
| File | Lines | .from | .invoke | useContext | Props | Custom hooks | Dominant pattern |
|---|---|---|---|---|---|---|---|
| VoiceBroadcastManager.tsx | 3053 | 7 | 6 | 0 | 0 | 5 | hooks-over-direct-supabase hybrid |
| CampaignManager.tsx | 2179 | 9 | 3 | 0 | 1 | 9 | hooks + direct-supabase (co-dominant) |
| AgentEditDialog.tsx | 2712 | 0 | 12 | 0 | 5 | 2 | direct-supabase |
| MissionBriefingWizard.tsx | 1837 | 6 | 3 | 0 | 0 | 2 | direct-supabase |
| AiSmsConversations.tsx | 1856 | 6 | 1 | 0 | 0 | 5 | direct-supabase (hybrid w/ hooks) |
TOTALS: 11637 lines; 28 .from + 25 .invoke = 53 combined direct client calls; 0 useContext across all 5.

(2) DOMINANT PATTERN ACROSS ALL 5 = DIRECT SUPABASE CLIENT ACCESS. Every file imports the singleton `supabase` (@/integrations/supabase/client) and issues inline table reads/writes and edge-function invokes from the component body. Naive grep undercounts badly: literal single-line `supabase.from(` = 0 for VBM/AED/MBW/AISC (CM=1) because the fluent style puts `await supabase` on one line and `.from(...)` on the next; 28 real .from call sites exist. Context is uniformly absent via useContext (0/5); MBW and CM touch context only through custom context hooks. Props coupling is near-dead (MBW/AISC/VBM get ZERO props; CM 1 optional callback; AED 5). Custom hooks are present but never the sole data path.

(3) VERDICT: YES - all 5 reach directly into Supabase (DB tables + edge functions), bypassing any abstraction/service layer. No repository/service interface sits between these components and Supabase.

(4) FILE:LINE EXAMPLES (from siblings): VBM :189 .from('telnyx_assistants'), :476 invoke('voice-broadcast-engine'); CM :221 .from('campaign_workflows'), :557 .from('campaigns').insert, :271 invoke('retell-agent-management'); AED :221 auth.getUser(), :237 invoke('retell-agent-management'), :398 invoke('retell-llm-management'), :850 invoke('outbound-calling'); MBW :364 .from('phone_numbers'), :554 invoke('ghl-integration'), :1091 invoke('phone-number-purchasing'); AISC :103 .from('calendar_integrations'), :449 invoke('sms-messaging'), :645 .from('sms_conversations').select, :480 channel(...,realtime).

Known limitations carried forward: hook interiors (whether they themselves wrap supabase) unverified by all siblings; parent/consumer wiring unverified; AED hardcodes project ref in 9 URL literals.

## Artifact

**Findings**

CONSOLIDATED SYNTHESIS of 5 dial-smart-system components (arch-e-coupling-vbm/-cm/-aed/-mbw/-aisc).

(1) PER-FILE TABLE (from = semantic .from() call sites; invoke = supabase.functions.invoke()):
| File | Lines | .from | .invoke | useContext | Props | Custom hooks | Dominant pattern |
|---|---|---|---|---|---|---|---|
| VoiceBroadcastManager.tsx | 3053 | 7 | 6 | 0 | 0 | 5 | hooks-over-direct-supabase hybrid |
| CampaignManager.tsx | 2179 | 9 | 3 | 0 | 1 (onRefresh) | 9 | hooks + direct-supabase (co-dominant) |
| AgentEditDialog.tsx | 2712 | 0 | 12 | 0 | 5 | 2 | direct-supabase |
| MissionBriefingWizard.tsx | 1837 | 6 | 3 | 0 | 0 | 2 (both context hooks) | direct-supabase |
| AiSmsConversations.tsx | 1856 | 6 | 1 | 0 | 0 | 5 | direct-supabase (hybrid w/ hooks) |
TOTALS: 11637 lines; 28 .from + 25 .invoke = 53 combined direct client calls; 0 useContext across all 5.

(2) DOMINANT COUPLING PATTERN ACROSS ALL 5 = DIRECT SUPABASE CLIENT ACCESS (raw @/integrations/supabase/client). Evidence: every file imports the singleton `supabase` client and issues inline table reads/writes plus edge-function invocations from within the component body. Naive grep massively undercounts because the fluent style writes `await supabase` on one line and `.from(...)` on the next: literal single-line `supabase.from(` = 0 for VBM, AED, MBW, AISC (only CM scored 1), yet 28 real .from() call sites exist across the 5 files. Combined direct calls = 53. React Context is uniformly ABSENT via useContext (0 in all 5); the two files that touch context (MBW, CM) do so through custom context hooks (useAIBrainContext/useCurrentOrganizationId), not useContext. Props coupling is near-dead: MBW/AISC/VBM receive ZERO props, CM receives one optional callback, AED receives five (open/onOpenChange/agent/onSave/isLoading). Custom hooks (domain wrappers) are present but NEVER the sole data path: each component layers hooks ON TOP of a raw supabase/an-edge-function layer, and every sibling flags that the injected hooks may themselves call supabase (unverified), which would only raise true coupling.

(3) VERDICT: YES - all 5 components reach directly into the DB and edge functions, bypassing any abstraction/service layer. None of the 5 routes its data exclusively through hooks or props/context. Each imports the concrete supabase client singleton and performs inline queries against named tables (campaigns, phone_numbers, telnyx_assistants, broadcast_queue, leads, sms_conversations, calendar_*, campaign_workflows, sip_trunk_configs) and invokes named edge functions (voice-broadcast-engine, retell-agent-management, retell-llm-management, sms-messaging, ghl-integration, lead-csv-import, phone-number-purchasing, outbound-calling, calendar-integration, elevenlabs-tts, twilio-integration). There is no repository/service interface between these components and Supabase. AED additionally hardcodes the project ref emonjusymdripmkvtttc in 9 static URL literals; AISC opens an inline realtime channel (L480).

(4) FILE:LINE EXAMPLES OF DIRECT SUPABASE CALLS (drawn from siblings):
- VoiceBroadcastManager.tsx:189-190 .from('telnyx_assistants'); :204-206 .from('phone_numbers'); :215 invoke('twilio-integration'); :347-348 .from('broadcast_queue'); :476 invoke('voice-broadcast-engine'); :1899 invoke('voice-broadcast-engine')  [sibling arch-e-coupling-vbm]
- CampaignManager.tsx:221 .from('campaign_workflows').select(...); :237 .from('phone_numbers'); :271 invoke('retell-agent-management'); :407 invoke('sms-messaging'); :557 await supabase.from('campaigns').insert({...}); :703 .from('campaigns').update({...})  [sibling arch-e-coupling-cm]
- AgentEditDialog.tsx:221 supabase.auth.getUser(); :237 invoke('retell-agent-management'); :398 invoke('retell-llm-management'); :569 invoke('calendar-integration'); :779 invoke('elevenlabs-tts'); :850 invoke('outbound-calling')  [sibling arch-e-coupling-aed]
- MissionBriefingWizard.tsx:364-368 .from('phone_numbers').select(...).eq('organization_id',...); :376-380 .from('campaigns'); :387-390 (supabase as any).from('telnyx_assistants'); :554 invoke('ghl-integration'); :679 invoke('lead-csv-import'); :1091 invoke('phone-number-purchasing')  [sibling arch-e-coupling-mbw]
- AiSmsConversations.tsx:103-108 .from('calendar_integrations'); :449 invoke('sms-messaging'); :579 .from('sms_conversations').update(...); :645 .from('sms_conversations').select(...); :665 .from('sms_conversations').insert({...}); :480 supabase.channel('sms-messages-realtime')  [sibling arch-e-coupling-aisc]

**evidence**

- C:/Users/charl/dial-smart-system/src/components/VoiceBroadcastManager.tsx:86,3053 (no props), :189,204,237,295,347,431,452 (.from=7), :215,250,281,309,476,1899 (invoke=6), useContext=0 — arch-e-coupling-vbm
- C:/Users/charl/dial-smart-system/src/components/CampaignManager.tsx:79-81,98 (1 prop onRefresh), :221,237,331,430,547,557,599,703,794 (.from=9), :271,272,407 (invoke=3), useContext=0 — arch-e-coupling-cm
- C:/Users/charl/dial-smart-system/src/components/AgentEditDialog.tsx:24-30,157-163 (5 props), :221 auth.getUser, :237,268,398,569,779,850,979 (invoke=12), .from=0, useContext=0, 9 hardcoded project-ref URL literals — arch-e-coupling-aed
- C:/Users/charl/dial-smart-system/src/components/MissionBriefingWizard.tsx:328 (no props), :353-354 (2 context hooks), :364,376,387,624,634,644 (.from=6), :554,679,1091 (invoke=3), useContext=0 — arch-e-coupling-mbw
- C:/Users/charl/dial-smart-system/src/components/AiSmsConversations.tsx:318 (no props), :100,134,634 auth.getUser, :103,138,145,579,645,665 (.from=6), :449 (invoke=1), :480 channel(...,realtime), useContext=0 — arch-e-coupling-aisc

**validation**

Cross-checked all 5 sibling reports against each other: every sibling independently reports useContext=0 and independent supabase-client imports; four of five independently document the same multi-line `await supabase` +`.from(` formatting that makes literal `supabase.from(` grep report 0-1 while real call sites number 6-9. Reconciled the literal-vs-semantic count divergence explicitly (28 real .from sites vs 1 literal). Summed per-file counts: from 7+9+0+6+6=28, invoke 6+3+12+3+1=25, combined 53; total lines 3053+2179+2712+1837+1856=11637. All five siblings self-report confidence=high.

**open_questions**

- Do the injected domain hooks (useVoiceBroadcast, usePredictiveDialing, useAiSmsMessaging, useTwilioIntegration, useCallDispatcher, etc.) themselves call supabase/edge functions? If so, true coupling per component is higher than the 53 literal calls; unverified by every sibling.
- Is the multi-line `supabase` + `.from(` style a repo-wide convention? If so, any grep-based coupling metric in the arch report will undercount systematically (affects CM/VBM/AED/MBW/AISC all).
- Should VBM/CM's hybrid (hooks + direct supabase) be reported as 'hooks-dominant' or 'direct-supabase-dominant'? Siblings split: VBM says hooks-dominant, CM says co-dominant/effectively direct by raw call count. Consolidated table records both the structural label and the raw counts to avoid the ambiguity.
- AED hardcodes project ref emonjusymdripmkvtttc in 9 URL literals and AISC opens an inline realtime channel — are these recognised coupling/deployability defects deserving their own remediation nodes?

**what_i_did_not_check**

- Interiors of any custom hook (@/hooks/*) or context module — whether they wrap supabase; scoped out by all siblings.
- Parent/consumer files that render these 5 components — prop usage (e.g. CM's onRefresh) and provider wiring unverified.
- Whether the 12 AED edge functions and others are actually deployed at runtime.
- Child components of VBM (QuickTestBroadcast, BroadcastQueueManager, etc.) and inner helper CalendarIntegrationSection in AISC for additional coupling.
- Whether any supabase call is expressed via destructured aliases (const {from}=supabase) — none observed but not exhaustively ruled out in AED.

**confidence**: high