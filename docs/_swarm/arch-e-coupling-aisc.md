# arch-e-coupling-aisc

- status: completed
- tldr: AiSmsConversations.tsx: 1856 lines, 6 supabase.from( + 1 functions.invoke = 7 direct supabase calls, 0 useContext, 0 props, 5 custom hooks; dominant = direct-supabase.

DONE: Inspected C:/Users/charl/dial-smart-system/src/components/AiSmsConversations.tsx in full; reported line count, direct-supabase call counts, useContext count, props, custom hooks, and examples; classified dominant pattern.

TOUCHED: none (read-only).

EVIDENCE (findstr greps + full read):
- Lines = 1856
- `supabase.from(` literal substring = 0 (all `.from(` written multiline as `await supabase\n .from(...)`); semantic `.from(` chains = 6 at L103, L138, L145, L579, L645, L665
- `supabase.functions.invoke(` = 1 at L449
- Combined semantic direct supabase data calls (from + functions.invoke) = 7; literal-substring combined = 1
- Other supabase touches: auth.getUser x3 (L100, L134, L634), channel realtime (L480), removeChannel (L536), import (L77) => 13 total refs
- `useContext(` = 0
- Props received = NONE (L318 `const AiSmsConversations: React.FC = () => {`)
- Custom hooks: useNavigate/react-router-dom; useAiSmsMessaging/@/hooks/useAiSmsMessaging; useTwilioIntegration/@/hooks/useTwilioIntegration; useDebounce/@/hooks/useDebounce; useToast/@/hooks/use-toast

RESULT: Dominant pattern = direct-supabase (hybrid with hooks). Props and Context both absent. Data layer is coupled directly to the supabase client via 7 inline calls + inline realtime channel + auth reads.

COULD_NOT: nothing blocked.

CONFIDENCE: high.

## Artifact

**Findings**

File: C:/Users/charl/dial-smart-system/src/components/AiSmsConversations.tsx. (a) Exact line count = 1856. (b) Direct supabase client calls: literal `supabase.from(` substring count = 0 (every `.from(` is written multiline as `await supabase\n  .from(...)`); semantic `.from(` chained calls = 6 (L103, L138, L145, L579, L645, L665); `supabase.functions.invoke(` = 1 (L449). Combined semantic direct supabase data calls (from + functions.invoke) = 7; combined literal substring = 1. Additional direct supabase client touches outside from/invoke: auth.getUser x3 (L100, L134, L634), channel(...).on(...).subscribe() realtime (L480), removeChannel (L536). Total supabase references incl. import = 13. (c) `useContext(` count = 0. (d) Props received by the exported component: NONE. `const AiSmsConversations: React.FC = () => {` (L318) takes no props; no React Context is consumed. (The inner helper `CalendarIntegrationSection` (L83-86) DOES receive props {settings, updateSettings}, but that is a private child, not the exported component's contract.) (e) Custom hooks (non-builtin): useNavigate from 'react-router-dom' (L71, used L319); useAiSmsMessaging (+ types SmsConversation, SmsMessage, AiSmsSettings) from '@/hooks/useAiSmsMessaging' (L72, L80, used L330); useTwilioIntegration from '@/hooks/useTwilioIntegration' (L73, used L332); useDebounce from '@/hooks/useDebounce' (L74, used L396); useToast from '@/hooks/use-toast' (L78, used L87, L402). Builtin hooks: useState, useEffect, useRef. (f) Exact direct-supabase call text examples: L449 `await supabase.functions.invoke('sms-messaging', {`; L579-582 `await supabase.from('sms_conversations').update({ last_from_number: fromNumber }).eq('id', selectedConversation.id)`; L645-650 `await supabase.from('sms_conversations').select('*').eq('user_id', user.id).eq('contact_phone', normalizedPhone).maybeSingle()`; L665-673 `await supabase.from('sms_conversations').insert({...}).select().maybeSingle()`; L103-108 `await supabase.from('calendar_integrations').select('provider, provider_account_email, calendar_name, sync_enabled').eq('user_id', user.id).eq('sync_enabled', true).limit(1)`; L138-142 `await supabase.from('calendar_availability').select('weekly_schedule, timezone').eq('user_id', user.id).maybeSingle()`; L145-150 `await supabase.from('calendar_appointments').select('*', { count: 'exact' }).eq('user_id', user.id).gte('start_time', new Date().toISOString()).limit(3)`. Dominant pattern = direct-supabase (hybrid with hooks). Props drilling and Context are both ABSENT (0 props, 0 useContext). The component layers domain hooks (useAiSmsMessaging, useTwilioIntegration) on top of 7 raw supabase calls + an inline realtime channel + auth reads, so its data layer is coupled directly to the supabase client rather than to an injected/abstracted interface.

**evidence**

- AiSmsConversations.tsx:1856 total lines (findstr /v "" count)
- AiSmsConversations.tsx:449 supabase.functions.invoke('sms-messaging', {
- AiSmsConversations.tsx:579 supabase (then .from('sms_conversations').update)
- AiSmsConversations.tsx:645 supabase (+.from('sms_conversations').select)
- AiSmsConversations.tsx:665 supabase (+.from('sms_conversations').insert)
- AiSmsConversations.tsx:103 supabase (+.from('calendar_integrations'))
- AiSmsConversations.tsx:138 supabase (+.from('calendar_availability'))
- AiSmsConversations.tsx:145 supabase (+.from('calendar_appointments'))
- AiSmsConversations.tsx:480 supabase (+.channel('sms-messages-realtime'))
- AiSmsConversations.tsx:100/134/634 supabase.auth.getUser()
- AiSmsConversations.tsx:318 AiSmsConversations: React.FC = () => { (no props)
- findstr useContext( -> 0 hits

**validation**

Grepped the file with findstr: line count 1856; `supabase.from(` literal = 0 hits; `supabase.functions.invoke(` = 1 hit (L449); 6 lines where a line ends in bare `supabase` before a multiline `.from(`; `useContext(` = 0 hits. Full read of the 1856-line file confirms 6 semantic `.from(` chains, 1 functions.invoke, 3 auth.getUser, 1 channel, 1 removeChannel, 1 import. Props confirmed absent by signature at L318.

**open_questions**

- Do the injected hooks (useAiSmsMessaging/useTwilioIntegration) themselves already wrap the same supabase .from calls, making the 7 inline calls duplicate coupling rather than the only data path?
- Is the inline realtime channel (L480) an intentional feature not available via the hooks, or an ad-hoc coupling that should move into a hook?

**what_i_did_not_check**

- The contents of '@/hooks/useAiSmsMessaging', '@/hooks/useTwilioIntegration', '@/hooks/useDebounce', '@/hooks/use-toast' - did not open them, so whether they also touch supabase or accept params is unchecked.
- No React Context provider was searched across the app; verified only that THIS file has 0 useContext and receives no props - the consuming provider (if any) was not inspected.
- Did not check other components in dial-smart-system for the same coupling pattern (scope was this one file).

**confidence**: high