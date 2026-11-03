# scale-a-lib-pages

- status: completed
- tldr: One setInterval: src/lib/performance.ts:212, 30s, local perf.memory only (no Supabase), never cleared. Zero in src/pages.

Node scale-a-lib-pages done. ONE setInterval in lib/pages: src/lib/performance.ts:212 = 30,000ms, callback -> trackMemoryUsage() (local perf.memory read + local trackPerformance logger), NO Supabase/network. No cleanup: initPerformanceMonitoring (205-217) returns void, no clearInterval. src/pages has zero setInterval.

## Artifact

**Findings**

Exactly ONE recurring setInterval exists across src/lib and src/pages combined: src/lib/performance.ts:212 inside initPerformanceMonitoring (line 205-217). Interval = 30000 ms (30s). Callback calls trackMemoryUsage() (performance.ts:185-200), which reads performance.memory (usedJSHeapSize/jsHeapSizeLimit), calls the local trackPerformance('Memory Usage', ...) logger, and console.warn()s if >90%. NO Supabase and no network/fetch of any kind is invoked by this interval. Cleanup: NONE. initPerformanceMonitoring returns void (no handle stored, no clearInterval anywhere); it is fire-and-forget. src/lib has NO other setInterval. src/pages has ZERO setInterval; the only 'interval' hits in pages are unrelated field names in Settings.tsx:70 (rotation_interval_hours) and :113. src/lib/monitoringScheduler.ts and its test contain 'interval' only as determineMonitoringIntervalDays (a plain date-math function, no timer).

**evidence**

- src/lib/performance.ts:212 `setInterval(() => {`
- src/lib/performance.ts:213-214 `trackMemoryUsage(); }, 30000);`
- src/lib/performance.ts:205 `export const initPerformanceMonitoring = () => {` (returns undefined, no cleanup)
- src/lib/performance.ts:185-200 `export const trackMemoryUsage = () => { ... }` (local perf.memory read + trackPerformance + console.warn)
- grep 'setInterval' over src/lib -> 1 match (performance.ts:212)
- grep 'setInterval' over src/pages -> 0 matches
- grep '[iI]nterval' over src/pages -> 2 matches, both in Settings.tsx (lines 70,113) as 'rotation_interval_hours' data fields, not timers
- grep 'Interval' over src/lib -> monitoringScheduler.ts:42,50-51 (date math) + performance.ts:212 only

**validation**

Case-insensitive regex grep of both full directories (recursed into __tests__ and all subfolders). setInterval and [iI]nterval both run; only one true timer found. Read the handler body and the enclosing function to confirm return/no-cleanup.

**open_questions**

- Who calls initPerformanceMonitoring, and is it ever invoked more than once (which would stack intervals with no way to clear them)?
- Is a leaked 30s interval acceptable given it only reads perf.memory locally, or should a clearInterval handle be returned?

**what_i_did_not_check**

- Did not search outside src/lib and src/pages (e.g. src/components, src/hooks, or the app entry) for other setIntervals.
- Did not trace the call sites of initPerformanceMonitoring to confirm invocation count.

**confidence**: high