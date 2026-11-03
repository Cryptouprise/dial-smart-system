# scale-a-calltracking

- status: completed
- tldr: useCallTracking.ts: 0 timers/subscriptions. No setInterval/setTimeout/poll/realtime; all work is caller-triggered one-shot Supabase queries. No cleanup surface.

Compared useCallTracking.ts (461 lines, read in full) against every timer/realtime pattern. RESULT: zero setInterval, zero setTimeout, zero polling loops, zero realtime subscriptions. L1 imports only useState/useCallback (no useEffect). All async work is caller-triggered one-shot Supabase queries: getLeadCallHistory (L50), getLeadCallStats (L81), getBatchCallStats (L151), analyzePipelineForRecommendations (L403, serial for..of loop, no delay). logCall (L132) is a no-op toast stub. No per-rep/global cadence and no cleanup surface exist because nothing schedules or repeats. Evidence: full read + grep for setInterval|setTimeout|useEffect|.channel(|.subscribe(|realtime|addEventListener|requestAnimationFrame = 0 matches. Confidence: high. Not checked: parent-component consumers (a poll could live outside this hook) and the supabase client config.

## Artifact

**Findings**

useCallTracking.ts contains ZERO setInterval, setTimeout, polling loops, or Supabase realtime subscriptions. The file (461 lines, two exported hooks: useCallTracking L44-235 and useAIPipelineManager L238-461) has no useEffect import (L1 imports only useState, useCallback) and no subscription/channel/on() calls. All async behavior is on-demand, caller-invoked Supabase queries: getLeadCallHistory (L50, single .select on call_logs, scoped by lead_id + organization_id, ordered created_at desc), getLeadCallStats (L81, wraps getLeadCallHistory then computes counts in-memory), getBatchCallStats (L151, one batched .in('lead_id', leadIds) query then in-memory grouping), and useAIPipelineManager.analyzePipelineForRecommendations (L403, a serial for..of loop awaiting analyzeLeadForRecommendations per lead, no timer/delay, no concurrency). logCall (L132) is a hard-coded no-op that only fires a destructive toast (CALL_LOG_CONTROL_LAUNCH_LOCK_MESSAGE) and returns false; it performs no DB write. There is no per-rep vs global distinction to report because nothing schedules or repeats. 'Cleanup' = N/A: there are no timers/subscriptions to tear down, so no memory-leak surface from this hook. Trigger for every function is the consumer calling it; nothing is time-driven.

**evidence**

- L1: `import { useState, useCallback } from 'react';` (no useEffect)
- L7-L17: CallHistoryEntry interface (no timer fields)
- L50: getLeadCallHistory = useCallback(async (leadId) => {...}, [organizationId])
- L54-L59: supabase.from('call_logs').select('*').eq('lead_id',leadId).eq('organization_id',organizationId).order('created_at',{ascending:false}) - one-shot query
- L81: getLeadCallStats = useCallback, depends on getLeadCallHistory (L83 await getLeadCallHistory(leadId))
- L132-L148: logCall stub - toast only, returns false (L147); no write
- L151-L226: getBatchCallStats, single query L157-L162 .in('lead_id',leadIds)
- L238-L243: useAIPipelineManager; L241 useCallTracking()
- L403-L433: analyzePipelineForRecommendations = useCallback(async (leads)=>{...}, [...]); L408 `for (const lead of leads)` serial await loop, no setTimeout/interval
- grep of setInterval|setTimeout|useEffect|.channel(|.subscribe(|realtime|addEventListener|requestAnimationFrame => 0 matches

**validation**

Read all 461 lines in full (read tool, no truncation) AND independently grepped the file for setInterval|setTimeout|useEffect|.channel(|.subscribe(|realtime|addEventListener|requestAnimationFrame which returned 0 matches in 0 files. Both methods agree: no timers, no polls, no realtime subscriptions.

**open_questions**

- Do CALLERS of useCallTracking (e.g. a leads/pipeline screen) set up their own setTimeout/interval polls that re-invoke getBatchCallStats? Out of scope of this file; would need to grep the app for consumers.
- Whether the launch-locked logCall (L132) is intentional interim behavior or an unfinished feature is unknown from this file alone.

**what_i_did_not_check**

- Callers/consumers of useCallTracking and useAIPipelineManager elsewhere in the repo (polling may live in the parent component, not this hook).
- Supabase client config/global realtime defaults in @/integrations/supabase/client.
- Whether OrganizationContext (useCurrentOrganizationId) or useToast internally use timers.
- Any dynamic interval configuration stored in DB/config that would drive external pollers.

**confidence**: high