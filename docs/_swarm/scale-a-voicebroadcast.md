# scale-a-voicebroadcast

- status: completed
- tldr: useVoiceBroadcast.ts has zero timers/polls/realtime subs; pure data hook (no useEffect).

Node scale-a-voicebroadcast done: read src/hooks/useVoiceBroadcast.ts (701 lines) IN FULL. Result: the file contains NO setInterval, setTimeout, requestAnimationFrame, supabase.channel()/.subscribe(), or addEventListener. It is a pure data hook (only useState, no useEffect) exposing async CRUD/RPC functions. Enrollment of timers/polls/subscriptions is empty by construction.

## Artifact

**Findings**

src/hooks/useVoiceBroadcast.ts contains ZERO timers, ZERO polling loops, and ZERO realtime subscriptions. It is a pure React data hook: one useState (line 85-87) and a set of async CRUD/RPC functions it returns (lines 679-699). No setInterval, setTimeout, requestAnimationFrame, supabase.channel()/.subscribe(), or addEventListener exists anywhere in the file (grep: 0 matches). Imports are only useState (line 1, no useEffect), supabase client (2), useToast (3), types (4). Therefore there is no trigger, no interval, no per-rep vs global scope, and no cleanup to enumerate for timers/subscriptions - the enumeration is empty by construction.

**evidence**

- line 1: `import { useState } from 'react';` - no useEffect, so no effect-scheduled timers
- line 87: `const { toast } = useToast();` - last state/hook setup before functions
- line 91: `supabase.auth.getUser()` inside loadBroadcasts (lines 89-107) - one-shot await, not scheduled
- line 275: `supabase.functions.invoke('voice-broadcast-tts', ...)` inside generateAudio - one-shot
- line 324/353/382/411/488/529/557/593/622/653: `supabase.functions.invoke('voice-broadcast-*', ...)` - all one-shot async calls, no interval
- lines 555-567 getBroadcastStats and 569-588 getQueueItems: plain async data-fetchers with no internal timer; if polling exists it is driven by the CALLER, not this file
- lines 679-699: returned API surface is functions + state only; no timer handles, no `unsubscribe`/cleanup function returned
- agentgrep regex `setInterval|setTimeout|requestAnimationFrame|\.channel\(|\.subscribe\(|addEventListener` over the whole file => 0 matches in 0 files

**validation**

Read all 701 lines in full with the read tool (one call, complete file). Cross-checked with agentgrep pattern for timer/subscription tokens returning 0 matches. Result is unambiguous: the enumeration set (trigger, interval file:line, per-rep/global, cleanup) is empty.

**open_questions**

- Does any COMPONENT that consumes this hook (e.g. a VoiceBroadcast page/panel) set up its own setInterval to call getBroadcastStats/getQueueItems? Such polling would live outside this file and is not covered here.
- Are there server-side (Edge Function / pg_cron / DB trigger) schedules for the voice-broadcast-engine and voice-broadcast-queue functions invoked here? Not visible in this repo file.

**what_i_did_not_check**

- Callers/consumers of useVoiceBroadcast (any .tsx that imports it) - potential caller-side setInterval polling was NOT inspected.
- The returned function names' side effects at the Supabase edge layer (voice-broadcast-tts, voice-broadcast-queue, voice-broadcast-engine) - server scheduling not inspected.
- Whether loadBroadcasts is called repeatedly by an external polling wrapper.

**confidence**: high