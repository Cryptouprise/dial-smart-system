# scale-a-hooks

- status: completed
- tldr: 19 setInterval found; 15 network (Supabase), 4 local; only useCampaignCompliance.ts:246 lacks effective cleanup.

scale-a-hooks DONE. Inventoried 19 recurring setInterval instances across the 14 named hooks (20 grep matches; the 20th is a ReturnType<typeof setInterval> annotation). 15 are network-bearing (Supabase .from() or functions.invoke); 4 are pure-local. 18 cleared (17 via useEffect cleanup, 2 of those also ref+unmount). One flagged: useCampaignCompliance.ts:246 monitorInterval - its cleanup is defined (:318-321) but startMonitoring is an imperative useCallback with no consumer wiring it to a useEffect cleanup, so it never clears on unmount (only self-clears on violation at :261).

## Artifact

**Findings**

19 recurring setInterval instances across the 14 target hook files. Format: file:line | interval | target | cleared.

1. useCallDispatcher.ts:230 | safeIntervalSeconds*1000 (default 30000; consumers pass 30) | callback: dispatchCalls({silent:true}) -> supabase.functions.invoke('call-dispatcher') (useCallDispatcher.ts:139) | cleared YES - stored in module-level ref globalIntervalRef (:20); cleared via consumer useEffect cleanup components/CallCenter.tsx:53 -> stopAutoDispatch (useCallDispatcher.ts:250-253), plus self cleanup return :240 and org-switch effect :98.

2. useCallbacks.ts:176 | 30000 | loadCallbacks -> supabase .from('leads'):44, .from('dialing_queues'):77, .from('scheduled_follow_ups'):113 | cleared YES - useEffect cleanup :177.

3. useCampaignCompliance.ts:246 | 60000 | monitorInterval -> performComplianceCheck/autoPauseCampaign/calculateAbandonmentRate/checkCallingHours/checkDNCCompliance + supabase .from('call_logs'):280 and :291; self-clears :261 | cleared PARTIAL - local const; returned cleanup :318-321 exists but startMonitoring is an imperative useCallback whose cleanup is NEVER wired to a useEffect cleanup and has NO consumer (grep found no caller). No ref.

4. useCampaignCompliance.ts:362 | 60000 | refreshBadgeMetrics -> calculateAbandonmentRate | cleared YES - useEffect cleanup :366 (also isActive=false :365).

5. useCampaignOptimization.ts:292 | 300000 | analyzeCampaignHealth -> supabase .from('campaigns'):39, .from('call_logs'):48 | cleared YES - :296.

6. useConcurrencyManager.ts:429 | 15000 | loadActiveCalls (.from('call_logs'):87) + loadActiveTransfers (.from('active_ai_transfers'):118) | cleared YES - :436.

7. useGeolocation.ts:284 | 15000 | local setFixAgeMs(Date.now()-fix.at); NO network | cleared YES - :285 (window.clearInterval).

8. useIntelligentPacing.ts:189 | 30000 | calculateMetrics -> supabase .from('call_logs'):52 | cleared YES - :193.

9. useIntelligentPacing.ts:200 | 120000 | autoAdjustDialRate | cleared YES - :201.

10. useLiveCampaignStats.ts:185 | 10000 | fetchStats -> supabase .from('voice_broadcasts'), .from('broadcast_queue'), .from('system_alerts') (:55,:67,:130) | cleared YES - :189.

11. useLiveCampaignStats.ts:259 | 30000 | fetchActiveCampaigns -> supabase .from('voice_broadcasts'), .from('broadcast_queue') (:219,:227,:233) | cleared YES - :260.

12. useLiveCampaignStats.ts:311 | 300000 | runHealthCheck -> supabase.functions.invoke('campaign-health-monitor'):289 | cleared YES - :312.

13. usePipelineAnalytics.ts:258 | 3600000 | analyzePipeline (.from('pipeline_boards'):54, .from('lead_pipeline_positions'):64) + trackLeadMovements (.from('lead_pipeline_positions'):202) | cleared YES - :263.

14. useProactiveHealthMonitor.ts:299 | intervalMs (variable prop, default per hook) | checkHealth -> supabase .from('campaigns'):71, .from('phone_numbers'):79, .from('call_logs'):99 | cleared YES - stored in ref intervalRef; unmount cleanup :302-307 (clearInterval :304).

15. useRealtimeCallStatus.ts:231 | 30000 | supabase.auth.getUser() + calculateStats -> supabase .from('call_logs'):111 | cleared YES - :270.

16. useRealtimeCallStatus.ts:237 | 1000 | local setLiveCalls (duration refresh + stuck-call auto-cleanup); NO network | cleared YES - :271.

17. useSmartRetry.ts:277 | 60000 | loadPendingRetries -> supabase .from('campaigns'):183, .from('dialing_queues'):193 | cleared YES - :278.

18. useAutonomousCampaignOptimizer.ts:280 | settings.checkIntervalSeconds*1000 | runOptimizationCycle -> calculateMetrics (.from('call_logs')), answeredCalls (.from('phone_numbers')), spamNumbers (.from('call_logs')), rotateNumbers (.from('phone_numbers')) | cleared YES - ref intervalRef; unmount cleanup :336-342 (clearInterval :339); also stopOptimizer :289, restart-guard :272-274.

19. useAutonomousPrioritization.ts:288 | settings.intervalMinutes*60000 | runPrioritization -> supabase .from('leads'):196/:225, .from('lead_priority_scores'):160 | cleared YES - ref intervalRef; unmount cleanup :339-345 (clearInterval :342); also stopPrioritizationLoop :297-303, restart-guard :280-282.

SUMMARY: 19 intervals. 15 are network-bearing (Supabase client .from( / functions.invoke). 4 are pure-local (useGeolocation:284, useRealtimeCallStatus:237 only-local [statsInterval:231 IS network], none). Only useCampaignCompliance.ts:246 (monitorInterval) is uncleared-in-practice: its cleanup return is defined but its imperative startMonitoring has no consumer wiring. All others cleared (17 via useEffect cleanup, 2 also ref+unmount). No supabase.rpc calls; edge functions invoked: 'call-dispatcher' (useCallDispatcher), 'campaign-health-monitor' (useLiveCampaignStats).

**evidence**

- dial-smart-system/src/hooks/useCallDispatcher.ts:230 (setInterval), :139 (functions.invoke call-dispatcher), :20 (module ref), :240 (self clear), components/CallCenter.tsx:53 (consumer cleanup)
- dial-smart-system/src/hooks/useCallbacks.ts:176,177
- dial-smart-system/src/hooks/useCampaignCompliance.ts:246,261,318-321,362,366
- dial-smart-system/src/hooks/useCampaignOptimization.ts:39,48,292,296
- dial-smart-system/src/hooks/useConcurrencyManager.ts:87,118,429,436
- dial-smart-system/src/hooks/useGeolocation.ts:284,285
- dial-smart-system/src/hooks/useIntelligentPacing.ts:52,189,193,200,201
- dial-smart-system/src/hooks/useLiveCampaignStats.ts:185,189,259,260,289,311,312
- dial-smart-system/src/hooks/usePipelineAnalytics.ts:54,64,202,258,263
- dial-smart-system/src/hooks/useProactiveHealthMonitor.ts:71,79,99,299,302-307
- dial-smart-system/src/hooks/useRealtimeCallStatus.ts:111,231,237,270,271
- dial-smart-system/src/hooks/useSmartRetry.ts:183,193,277,278
- dial-smart-system/src/hooks/useAutonomousCampaignOptimizer.ts:280,336-342
- dial-smart-system/src/hooks/useAutonomousPrioritization.ts:160,196,225,288,339-345

**validation**

agentgrep for 'setInterval' returned 20 matches in 14 files; 19 are setInterval() calls (the 20th is a ReturnType<typeof setInterval> type annotation in useCallDispatcher.ts:20). Each setInterval was read in-file to confirm interval value, callback target, and the clearInterval location; supabase usage confirmed by grep of .from( / functions.invoke per file. Cleanup wiring confirmed by reading the useEffect return blocks and, for imperative starts (useCallDispatcher, useCampaignCompliance, optimizer, prioritization), grepping consumers.

**open_questions**

- useCampaignCompliance.ts startMonitoring returns a cleanup that no in-repo consumer wires up (grep found only the local definition) - is it dead code, or is its returned cleanup expected to be captured by a future consumer?
- useProactiveHealthMonitor.ts:299 default value of intervalMs prop not resolved (prop-driven; not traced to its default).

**what_i_did_not_check**

- The default runtime value of useProactiveHealthMonitor's intervalMs prop (prop-provided, default not traced).
- Whether useCampaignOptimization's analyzeCampaignHealth or other network intervals are wrapped by additional debounce/cooldown guards beyond what was read.
- Hooks outside the 14 named files that also contain setInterval (the task scope was limited to the listed files).

**confidence**: high