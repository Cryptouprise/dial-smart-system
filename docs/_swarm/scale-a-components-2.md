# scale-a-components-2

- status: completed
- tldr: 10 recurring setIntervals in 8/10 files, all cleared; 3 use Supabase; 2 files have none

Node scale-a-components-2 done: inventoried every recurring setInterval across the 10 assigned components-M-Z files. 10 recurring intervals in 8 files, all cleared (cleanup or self-clear at completion). 2 files (TodayPerformanceCard, WorkflowHealthWidget) have NONE. 3 hit Supabase: SystemHealthDashboard.tsx:96 (300s, supabase.functions.invoke system-health-monitor), VoiceBroadcastManager.tsx:405 (3s, loadBroadcasts via hook) and :419 (5s, supabase.from broadcast_queue). Rest are local UI/simulation timers.

## Artifact

**Findings**

Inventory of recurring setInterval in the 10 assigned files (components M-Z: ProductionHealthDashboard, SystemHealthDashboard, TodayPerformanceCard, VoiceBroadcastManager, WorkflowHealthWidget, ai-configuration/ConfigurationProgress, demo/DemoCallInProgress, demo/DemoLeadRecovery, demo/DemoLegalInboundSimulation, demo/DemoSimulationDashboard). 10 recurring setInterval calls across 8 files; 2 files have NONE. All recurring setIntervals ARE cleared in a useEffect cleanup (or self-clear at completion). Detail: (1) ProductionHealthDashboard.tsx:56 @30000ms calls checkSystemHealth() [local only: navigator.onLine, localStorage, performance.memory, perf navigation entries; NO fetch, NO supabase] cleared at :60. (2) SystemHealthDashboard.tsx:96 @300000ms (5*60*1000) calls loadRecentHealthData() -> supabase.functions.invoke('system-health-monitor', {method:'GET'}) at :60 = SUPABASE function invoke; cleared at :97. (3) VoiceBroadcastManager.tsx:405 @3000ms calls loadBroadcasts() (from useVoiceBroadcast hook = Supabase fetch) + setLastStatsUpdate; cleared at :410; only runs while a broadcast status==='active'. (4) VoiceBroadcastManager.tsx:419 @5000ms calls loadQueueResults(id) -> supabase.from('broadcast_queue').select(...) at :452 = SUPABASE; cleared at :423; only while results dialog open AND broadcast active. (5) ai-configuration/ConfigurationProgress.tsx:83 @1000ms setElapsedTime only (local Date.now() diff); cleared at :87. (6) demo/DemoCallInProgress.tsx:43 @1000ms setDuration (local); cleared at :44. (7) demo/DemoCallInProgress.tsx:49 @150ms setWaveformBars random (local); cleared at :52. (8) demo/DemoLeadRecovery.tsx:88 @80ms local progress simulation (timerRef, no network); cleared self at :99 and in cleanup effect at :72 and before restart at :77. (9) demo/DemoLegalInboundSimulation.tsx:85 @120ms local time-lapse simulation (intervalRef, no network); self-cleared at :141, cleanup at :150. (10) demo/DemoSimulationDashboard.tsx:209 @80ms local campaign simulation (simulationRef); calls generateSmsReply (local setState); self-cleared at :354, cleanup at :364. NO setInterval: TodayPerformanceCard.tsx (only one-shot setTimeout:36 for demo delay; Supabase reads in loadTodayStats at :53/:60/:67) and WorkflowHealthWidget.tsx (uses supabase.channel('workflow-health') realtime at :112 + debounce setTimeout 500 at :123; cleanup supabase.removeChannel at :129).

**evidence**

- ProductionHealthDashboard.tsx:51-61 useEffect, :56 setInterval(30000), :60 clearInterval
- SystemHealthDashboard.tsx:92-98 useEffect, :96 setInterval(5*60*1000), :60 supabase.functions.invoke('system-health-monitor'), :97 clearInterval
- VoiceBroadcastManager.tsx:405-410 setInterval 3000 + clearInterval; :419-423 setInterval 5000 + clearInterval; :452 supabase.from('broadcast_queue')
- ai-configuration/ConfigurationProgress.tsx:82-88 setInterval 1000 + clearInterval :87
- demo/DemoCallInProgress.tsx:41-53 two setIntervals (1000 @43, 150 @49) each cleared (:44,:52)
- demo/DemoLeadRecovery.tsx:56 timerRef, :88 setInterval 80, :99 self-clear, :72 cleanup, :77 pre-restart clear
- demo/DemoLegalInboundSimulation.tsx:76 intervalRef, :85 setInterval 120, :141 self-clear, :150 cleanup
- demo/DemoSimulationDashboard.tsx:138 simulationRef, :209 setInterval 80, :354 self-clear, :364 cleanup
- TodayPerformanceCard.tsx:33-41 useEffect w/ setTimeout:36 (no setInterval); :49/:53/:60/:67 supabase reads
- WorkflowHealthWidget.tsx:108-131 useEffect w/ supabase.channel :112 + setTimeout:123; :129 removeChannel

**validation**

Read each of the 10 target files in full or in relevant region and matched every occurrence of the literal setInterval. Cross-checked with a repo-wide ripgrep of setInterval that surfaced 29 matches in 22 files; all 10 assigned-file matches are accounted for and both 'no setInterval' files (TodayPerformanceCard, WorkflowHealthWidget) were verified by findstr for setInterval/setTimeout/supabase. Each recurring interval's clearInterval target was located by reading the surrounding useEffect return.

**open_questions**

- VoiceBroadcastManager loadBroadcasts() is external to the file (useVoiceBroadcast hook); its Supabase query was not read here, so marked as 'Supabase via hook' inferentially, not from cited file:line.
- DemoCallInProgress/DemoSimulationDashboard contain one-shot setTimeout callbacks that are NOT cleared (DemoSimulationDashboard.tsx:300/326 staggered mock callbacks); those are non-recurring and out of scope but noted.

**what_i_did_not_check**

- Did not open hooks/useVoiceBroadcast.ts to cite the exact Supabase table/queries behind loadBroadcasts() called by the 3s interval.
- Did not inventory setInterval in the other subdirs (call/, settings/, ui/) or files A-L, which belong to sibling nodes, not this one.
- Did not evaluate runtime behavior/leaks beyond textual presence of clearInterval (e.g., stale-closure correctness of the 3s VoiceBroadcastManager interval).

**confidence**: high