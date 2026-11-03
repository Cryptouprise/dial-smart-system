# scale-a-predictive

- status: completed
- tldr: usePredictiveDialing.ts has zero timers/polls/realtime subs and no useEffect; it is a pure CRUD hook. Real timers live in usePredictiveDialingAlgorithm.ts:290.

Researched src/hooks/usePredictiveDialing.ts (795 lines, read in full). RESULT: the file contains ZERO setInterval, setTimeout, polls, or Supabase realtime subscriptions, and no useEffect at all, so there is nothing to enumerate as per-rep/global recurring work and no cleanup-on-unmount exists. It is a flat, purely imperative CRUD hook (one-shot async functions + single isLoading state at line 77). FACT evidence: line 2 imports only useState/useCallback (no useEffect); two independent searches (agentgrep regex + findstr) over the whole file returned 0 matches for every timer/subscription token. The actual scheduling/polling concern appears to live in a SIBLING file, usePredictiveDialingAlgorithm.ts:290 (only PredictiveDialing* file with a useEffect/timer token). Artifact lists open questions and what_i_did_not_check (component-level intervals, React Query refetchInterval, edge-function/server crons). Research only, no writes.

## Artifact

**Findings**

usePredictiveDialing.ts contains ZERO setInterval, ZERO setTimeout, ZERO polling, and ZERO Supabase realtime subscriptions. It has no useEffect at all, so it registers no recurring work and therefore has no cleanup-on-unmount to describe. It is a purely imperative CRUD hook: a flat object of async functions (createLead, updateLead, importLeads, getLeads, getLeadCount, getAllMatchingLeadIds, resetLeadsForCalling, createCampaign, updateCampaign, addLeadsToCampaign, getCampaigns, makeCall, getCallLogs, updateCallOutcome) that each run once per caller invocation. There is exactly one piece of React state, isLoading (line 77), set via setIsLoading. 'Per-rep vs global' is not applicable: nothing here schedules per-rep or global work. All data refresh is caller-driven (React Query / component) calling these functions on demand, not on a timer inside the hook.

**evidence**

- FACT src/hooks/usePredictiveDialing.ts:2 — `import { useCallback, useState } from 'react';` — only useState/useCallback imported; no useEffect imported anywhere in the file, so no interval/timeout/subscription can exist.
- FACT src/hooks/usePredictiveDialing.ts:76-795 — the entire hook body is async CRUD functions; no timer constructor, no `.channel()`, no `.subscribe(` appears.
- FACT grep over whole file (regex `setInterval|setTimeout|\.channel\(|\.subscribe\(|useEffect|on\(|realtime|poll`) = 0 matches (agentgrep) and findstr for setInterval/setTimeout/subscribe/channel/useEffect/realtime/poll = 0 matches (independent second method).
- FACT src/hooks/usePredictiveDialing.ts:77 — `const [isLoading, setIsLoading] = useState(false);` — the only React state.
- FACT src/hooks/usePredictiveDialing.ts:691-702 — makeCall invokes the `outbound-calling` edge function once per call (one-shot request, not a poll).
- FACT sibling: src/hooks/usePredictiveDialingAlgorithm.ts:290 contains a `useEffect(...)` (the only PredictiveDialing* file with any useEffect/timer token; 2 matches in 1 file across the group), so the app's recurring/polling logic — if any — lives there, NOT in usePredictiveDialing.ts.
- FACT sibling: src/hooks/usePredictiveDialingBackend.ts has 0 timer/subscription matches in the group grep.

**validation**

Read src/hooks/usePredictiveDialing.ts in full (795 lines, read limit 5000 so no truncation). Verified by two independent search methods plus the import line and full-body inspection: (1) agentgrep regex over the file returned 0 matches; (2) Windows findstr for the token set returned exit 0 with no output. Cross-checked the sibling PredictiveDialing* hooks to confirm the question's 'polling/per-rep' concern is satisfied elsewhere.

**open_questions**

- Which caller components (e.g. a dialer dashboard) invoke getLeads/getCallLogs/getDialingStatus on a component-level setInterval to refresh UI? That interval, if it exists, lives in the component, not this hook.
- What is the exact interval and cleanup inside usePredictiveDialingAlgorithm.ts:290's useEffect (the group grep shows a useEffect but not its interval value or dependencies)?
- Does usePredictiveDialingBackend.startDialing/getDialingStatus poll the DB, or is it also purely caller-driven (group grep shows 0 timer tokens, suggesting caller-driven)?

**what_i_did_not_check**

- Component-level polling: did not grep src/components or pages for setInterval that calls the functions returned by this hook.
- The exact interval/cleanup of the useEffect at usePredictiveDialingAlgorithm.ts:290 (out of this node's file scope).
- Whether the `outbound-calling` / `dialing-engine` edge functions or server crons run the real scheduling loop that this UI hook is a thin client over.
- React Query / TanStack refetchInterval configuration on any useQuery wrapping these functions.

**confidence**: high