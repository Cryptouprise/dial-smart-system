# quality-dup

- status: completed
- tldr: 4 big components share primitives but not domain helpers; top dupes: loadPhoneNumbers, phone_numbers query 4x, testCalendarConnection, status maps, 52 toast blocks.

quality-dup DONE (research only, no writes). Question: do the 4 big components share helpers or reimplement inline? Answer: they share the primitives layer well (ui/*, use-toast, supabase client all 4) but reuse almost no domain helper layer. TOP 5 duplications: (1) loadPhoneNumbers same name, divergent bodies VoiceBroadcastManager.tsx:199-262 vs AgentEditDialog.tsx:263-298; (2) phone_numbers table read hand-written 4x VoiceBroadcastManager.tsx:204-210, CampaignManager.tsx:236-240/793-801/425-435; (3) testCalendarConnection same name divergent AiSmsConversations.tsx:131-174 vs AgentEditDialog.tsx:973-1027; (4) status->color/variant map inline 3x VoiceBroadcastManager.tsx:594-603, CampaignManager.tsx:1457-1458, AiSmsConversations.tsx:708-722; (5) ~52 inline destructive-toast blocks (15/18/10/9) while src/lib/toastDedup.ts has ZERO importers. Shared modules available but underused: src/lib 25 modules, src/hooks 68 modules; only 6 lib modules imported across these 4 files; only 1 of 4 uses src/lib/phoneUtils.

## Artifact

**Findings**

MEASURED duplication across the 4 large components in C:/Users/charl/dial-smart-system. FACT: They share the UI/primitives layer well (all 4 import @/components/ui/*, @/hooks/use-toast, @/integrations/supabase/client) but reuse almost NO domain helper layer. FACT: src/lib has 25 modules and src/hooks has 68 modules available; the 4 files together import only 6 lib modules (launchSafety, providerUtils, testCallUtils, utils, phoneUtils) and ~9 distinct hooks. FACT: only 1 of 4 files imports @/lib/phoneUtils (AiSmsConversations.tsx:79). TOP 5 duplications follow. (1) Same-named local function loadPhoneNumbers with divergent bodies: VoiceBroadcastManager.tsx:199-262 (direct supabase.from('phone_numbers') table query + twilio-integration edge fn) vs AgentEditDialog.tsx:263-298 (retell-phone-management edge fn). Same name, same intent, two implementations. (2) The phone_numbers table read pattern is hand-written 4x with near-identical filter chains: VoiceBroadcastManager.tsx:204-210 (.eq user_id .eq status active .eq is_spam false), CampaignManager.tsx:236-240 (.eq user_id .eq organization_id), CampaignManager.tsx:793-801 (.eq user_id .eq organization_id .eq status active .not retell_phone_id null), CampaignManager.tsx:425-435. No shared query module exists. (3) Same-named local function testCalendarConnection with divergent bodies: AiSmsConversations.tsx:131-174 (queries calendar_availability + calendar_appointments tables) vs AgentEditDialog.tsx:973-1027 (invokes calendar-integration edge fn test_google_calendar). Same name/intent, two implementations; a calendar hook (useCalendarIntegration.ts exists, 15KB) is not used by either of these two call sites. (4) Status-to-visual mapping reimplemented inline 3x: VoiceBroadcastManager.tsx:594-603 getStatusColor switch, CampaignManager.tsx:1457-1458 inline variant ternary on campaign.status, AiSmsConversations.tsx:708-722 getMessageStatusIcon switch. No shared status-map module. (5) Destructive toast/error handling reimplemented inline ~52 times across the 4 files (AgentEditDialog 15, CampaignManager 18, VoiceBroadcastManager 10, AiSmsConversations 9 occurrences of variant:'destructive'); src/lib/toastDedup.ts exists but is imported by ZERO components. All counts are FACT from findstr/grep.

**evidence**

- src/components/VoiceBroadcastManager.tsx:14,18 imports use-toast + supabase (shared primitives reused)
- src/components/VoiceBroadcastManager.tsx:199-262 loadPhoneNumbers (direct phone_numbers table + twilio-integration edge fn)
- src/components/AgentEditDialog.tsx:263-298 loadPhoneNumbers (retell-phone-management edge fn) -- same name, different impl
- src/components/VoiceBroadcastManager.tsx:204-210 phone_numbers query with .eq('status','active').eq('is_spam',false)
- src/components/CampaignManager.tsx:236-240 phone_numbers query (.eq user_id .eq organization_id)
- src/components/CampaignManager.tsx:793-801 phone_numbers query (.eq status active .not retell_phone_id null)
- src/components/AiSmsConversations.tsx:131-174 testCalendarConnection (calendar_availability + calendar_appointments queries)
- src/components/AgentEditDialog.tsx:973-1027 testCalendarConnection (calendar-integration edge fn) -- same name, different impl
- src/components/VoiceBroadcastManager.tsx:594-603 getStatusColor switch(status)
- src/components/CampaignManager.tsx:1457-1458 inline variant ternary on campaign.status
- src/components/AiSmsConversations.tsx:708-722 getMessageStatusIcon switch(message.status)
- variant:'destructive' occurrence counts: AgentEditDialog 15, CampaignManager 18, VoiceBroadcastManager 10, AiSmsConversations 9 (findstr)
- src/lib/toastDedup.ts exists (1318 bytes) but grep for its import across src/components/*.tsx = 0 hits
- src/lib/phoneUtils.ts exports normalizePhoneNumber, formatPhoneNumber, isValidPhoneNumber, extractAreaCode, arePhoneNumbersEqual, getPhoneValidationError; imported by only AiSmsConversations.tsx:79 among the 4
- dir counts: src/lib has 25 .ts modules; src/hooks has 68 .ts/.tsx modules

**validation**

Verified by reading actual source line ranges with the read tool (AiSmsConversations 131-174/446-464, AgentEditDialog 263-298/973-1027, VoiceBroadcastManager 185-262/594-603, CampaignManager 228-255/788-809) plus findstr/grep counts for imports, table queries, and destructive-toast occurrences. Import lists extracted with findstr on '^import' per file.

**open_questions**

- Does a shared phone-numbers loading hook (e.g. useNumberSync.ts / usePhoneNumberPurchasing.ts) already cover the repeated phone_numbers table reads, and why is it not used by CampaignManager/VoiceBroadcastManager?
- Are there MORE copies of the status->color map and phone_numbers query beyond these 4 files (repo-wide count not measured for those patterns)?

**edge_cases_considered**

- Same-named functions (loadPhoneNumbers, testCalendarConnection) are name collisions with divergent bodies, NOT literal copy-paste; reported as such to stay accurate.
- Counted only @/lib and @/hooks module reuse, not @/components/ui or @/components sibling reuse (which is high and healthy).
- findstr quoting made an earlier 'variant:' scan return empty; destructive-toast counts were obtained with a working findstr invocation and are reliable.

**what_i_did_not_check**

- Repo-wide (all ~60+ component/hook files) counts for status-map, phone_numbers query, and destructive-toast duplication; only the 4 named files were measured.
- Whether the divergent loadPhoneNumbers/testCalendarConnection implementations produce different runtime behavior or are functionally equivalent.
- The many multiline import blocks at VoiceBroadcastManager.tsx:19-36, CampaignManager.tsx:38-46, AiSmsConversations.tsx:27-70 (icon/type import groups) were read for imports but their element usage was not audited.
- src/services and src/integrations layers, where an alternative shared data-access module might live.

**confidence**: high