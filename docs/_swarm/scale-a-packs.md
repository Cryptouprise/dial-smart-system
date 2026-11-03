# scale-a-packs

- status: completed
- tldr: 16 setInterval sites in the single packs JS file; 5 boot/perf/idle intervals never cleared, 11 cleared. Full file:line detail in complete_node artifact.

Enumerated all recurring setInterval in src/packs JS. Only one JS file exists: door_to_door/app/scripts.js. 16 setInterval call sites found (14 source lines). Boot intervals at 1973-1975 are never cleared; heartbeat/pollTeam/flushQueue (CONFIG 20000/10000/30000ms) and refreshAll (180000ms) all hit the network via DB.* -> api() -> window.__D2D_HOST.api. Long-lived uncleared: 60000ms reminder tick (1975), 3000ms video banner keeper (2887), 60000ms perf tick (3188, network /perf/*), 30000ms idle wake release (3507). Cleared: CW timer tick 1000ms (cleared 2410, restarted-safe 2405), PR present poll 500ms (cleared 2601/2646), V.poll 1500ms video window (cleared 2714/2725), L.poll 6000ms /area/jobs poll NETWORK (cleared 3049 + self-stop), deep-link bootstraps t2 500ms (3262/3263/3277), t3 250ms (3276), t 500ms view (3287/3290/3291), hookMap 300ms (3449).

## Artifact

**Findings**

Every recurring setInterval in src/packs lives in the ONE JS file door_to_door/app/scripts.js (3460+ lines; no other .js under src/packs). 16 setInterval call sites across 14 source lines. CONFIG resolutions (scripts.js:12-32): heartbeatMs=20000, teamPollMs=10000, queueFlushMs=30000. Network layer: DB=IIFE at :280, api() at :322 delegates to window.__D2D_HOST.api (network); DB.heartbeat->api('POST','/heartbeat') :423, DB.listPositions->api('GET','/positions') :425, DB.flushQueue :428, DB.refresh :357. List: (1) :1973 setInterval(heartbeat,CONFIG.heartbeatMs=20000) - heartbeat() :1881 POSTs GPS position/trail to /heartbeat [NETWORK]; never cleared. (2) :1973 setInterval(pollTeam,CONFIG.teamPollMs=10000) - pollTeam() :1887 GET /positions [NETWORK] then renderReps/renderTeam; never cleared. (3) :1973 setInterval(()=>{flushQueue();},CONFIG.queueFlushMs=30000) - flushQueue() :1802 calls DB.flushQueue [NETWORK] + DB.listAppointments [NETWORK]; never cleared. (4) :1974 setInterval(refreshAll,180000) - refreshAll() :1803 calls DB.refresh [NETWORK]+reload(); never cleared. (5) :1975 setInterval(()=>{if(A.view==='follow')renderFollow(); updateFollowBadge(); reminderTick();},60000) - reminderTick() :1935 in-app reminders (no network; uses SW notification); never cleared. (6) :2405 tick=setInterval(...,1000) in CW.open() - updates #cwTimer text only [no network]; cleared at :2410 (CW.close) and pre-cleared/restarted at :2405. (7) :2601 PR.timer=setInterval(...,500) in presentation startPoll() - reads local DOM sig(), calls refresh() (local render) [no network]; cleared self at :2601 when no surfaces, and at :2646 (CW.hooks.onClose). (8) :2726 V.poll=setInterval(...,1500) in video start() - checks winOpen(), posts postMessage({type:'slides'}) and paint() [no network; postMessage only]; cleared at :2714 (resetWin) and :2725 (before reassign). (9) :2887 setInterval(()=>{try{injectCss();banner();}catch(e){}},3000) - re-injects vcCss and redraws call banner [no network]; never cleared. (10) :3048 L.poll=setInterval(...,6000) LD/L area loader startPoll() - refreshJobs() :3047 -> call('/area/jobs') [NETWORK]; cleared at :3049 stopPoll() and self-stops from refreshJobs when no pending jobs; startPoll() calls stopPoll() first. (11) :3188 P.timer=setInterval(...,60000) perf layer - tick() :3185 -> loadBoard/loadComps/loadRisk/loadPace/loadFeed/loadProfile/loadUsage -> call('/perf/{board,competitions,risk,pace,feed,badges}') and /billing/usage [NETWORK]; never cleared. (12) :3259 t2=setInterval(async()=>{...},500) deep-link call bootstrap - polls for A.me+window.CW, then fetch('/api/portal/intakes/<id>') [NETWORK]; cleared at :3263 (success), :3262 (k>60), :3277 (catch). (13) :3276 t3=setInterval(...,250) inperson recorder bootstrap - waits for window.CWV; cleared at :3276 on CWV present, k2>40, or catch. (14) :3283 t=setInterval(...,500) deep-link view apply - calls showView(view); cleared at :3287 (success), :3290 (n>60), :3291 (catch). (15) :3449 hookMap=setInterval(...,300) field module - one-shot: attaches map 'moveend' + filterChips click; cleared at :3449 the moment A.map exists. (16) :3507 setInterval(...,30000) field module idle - releases screen wake lock after 5 min idle [no network]; never cleared. SUMMARY: never-cleared (intentional, app-lifetime): the five boot intervals (:1973 x3,:1974,:1975), :2887, :3188, :3507. Cleared: :2405,:2601/:2646,:2726/:2714/:2725,:3048/:3049,:3259,:3276,:3283,:3449. Network-touching intervals: heartbeat, pollTeam, flushQueue, refreshAll, L.poll(/area/jobs), P.timer(/perf/*,/billing/usage), t2(intakes fetch).

**evidence**

- C:/Users/charl/dial-smart-system/src/packs/door_to_door/app/scripts.js:30-32 (CONFIG heartbeatMs=20000, teamPollMs=10000, queueFlushMs=30000)
- scripts.js:322 async function api(...){ return window.__D2D_HOST.api(...); }
- scripts.js:423 DB.heartbeat -> api('POST','/heartbeat')
- scripts.js:425 DB.listPositions -> api('GET','/positions')
- scripts.js:357 DB.refresh (network)
- scripts.js:428 DB.flushQueue (network)
- scripts.js:1973-1975 boot setInterval lines
- scripts.js:1881-1886 heartbeat()
- scripts.js:1887 pollTeam()
- scripts.js:1802 flushQueue()
- scripts.js:1803 refreshAll()
- scripts.js:1935-1951 reminderTick()
- scripts.js:2405 tick=setInterval(...,1000); clearInterval(tick) at 2410
- scripts.js:2601 PR.timer=setInterval(...,500); clearInterval(PR.timer) at 2601 and 2646
- scripts.js:2726 V.poll=setInterval(...,1500); clearInterval(V.poll) at 2714 and 2725
- scripts.js:2887 setInterval(injectCss;banner,3000)
- scripts.js:3048 L.poll=setInterval(...,6000); clearInterval(L.poll) at 3049
- scripts.js:3047 refreshJobs -> call('/area/jobs')
- scripts.js:3188 P.timer=setInterval(...,60000)
- scripts.js:3185 tick(); loaders call('/perf/*') :3169-3175
- scripts.js:3259 t2=setInterval(...,500); clears 3262/3263/3277; fetch 3268
- scripts.js:3276 t3=setInterval(...,250); clears within line
- scripts.js:3283 t=setInterval(...,500); clears 3287/3290/3291
- scripts.js:3449 hookMap=setInterval(...,300); clearInterval(hookMap) same line
- scripts.js:3507 setInterval(...,30000) idle wake release

**validation**

findstr /N over scripts.js for setInterval/clearInterval/CONFIG/fetch; read full callback bodies at 1878-1951, 2392-2412, 2595-2649, 2720-2732, 2810-2846, 3040-3054, 3180-3191, 3251-3294, 3440-3513; confirmed DB->api network chain (322,357,423,425,428); confirmed no other .js under src/packs via dir /s /b and agentgrep find (1 file).

**open_questions**

- CONFIG.hardcoded vs host override: scripts.js:42 Object.assign(CONFIG, window.__D2D_HOST.config) means the host can override heartbeatMs/teamPollMs/queueFlushMs at runtime - actual production cadence may differ from 20000/10000/30000.
- Whether any host (index.prod.html embed) adds further setIntervals outside this JS file is out of scope here.

**edge_cases_considered**

- setInterval at :1973 packs 3 calls on one line (heartbeat, pollTeam, flushQueue) - counted as 3 sites.
- setInterval at :3276 (t3) embeds 3 clearInterval calls on the same line - all cited.
- open() at :2405 clears tick before reassigning, so re-opening the CW never leaks timers.
- L.poll self-terminates from inside refreshJobs when no non-done jobs remain, in addition to stopPoll().
- V.poll console side-effects are postMessage, not fetch - explicitly flagged non-network.
- api() is a host bridge (window.__D2D_HOST.api), not a literal fetch; treated as network.

**what_i_did_not_check**

- Any setInterval inside HTML files under src/packs (e.g. index.prod.html inline scripts) - task scoped to JS under src/packs only.
- Whether sw.js or other non-.js-named script assets under src/packs run intervals (none found as .js, but a differently-named service worker was referenced at :1909 as 'sw.js').
- The concrete implementation of window.__D2D_HOST.api (the actual fetch/XHR) - it is host-provided, not in this repo path.
- Runtime behaviour (whether intervals survive route/view changes in practice) - static analysis only.

**confidence**: high