# arch-b-dashboard

- status: completed
- tldr: Dashboard.tsx = 544-line hybrid/god object (47 cases), real router is App.tsx (18 routes).

arch-b-dashboard DONE. Verdict: src/components/Dashboard.tsx is a HYBRID with god-object characteristics, NOT a URL router. 544 lines; 47 case labels (44 distinct targets via 3 alias pairs); owns state (110-116), a direct supabase.from('phone_numbers') fetch (153-156), provider-inference logic (160-182), launch-lock handlers (195-209), and a ~169-line inlined 'overview' screen (267-435). The real router is src/App.tsx (171 lines, 18 <Route>) + src/pages/Index.tsx (14-line wrapper). Only the switch (234-519, ~286 lines) is routing, and ~169 of those are non-routing inline UI. Fix: extract OverviewTab + usePhoneNumbers hook to return Dashboard to thin tab-switch.

## Artifact

**Findings**

FACT: src/components/Dashboard.tsx is 544 lines (PowerShell Get-Content .Count = 544). It is NOT a URL router. It is a HYBRID: an in-body tab-switcher (switch on activeTab) that ALSO owns data state, a direct Supabase fetch, provider-inference business logic, and an entire screen's JSX inlined inline instead of delegating to a component. God-object traits are present (single 544-line file, 47 case branches, owns fetch+state+logic+view). The REAL URL routing layer is src/App.tsx (171 lines, 18 <Route> declarations) with react-router BrowserRouter; src/pages/Index.tsx (14 lines) is a thin wrapper: <Navigation /> + <Dashboard />. Dashboard is the single component behind route /dashboard, and internally switches 47 tab keys.

EXACT COUNTS: Dashboard.tsx = 544 lines. case labels = 47 (all verified real switch labels, no false positives). Distinct component targets = 44 (47 labels, because 3 alias pairs share one body: pipeline/pipelines, predictive/dialer, campaign-results/campaigns). Return statements = 44 case bodies + 1 default = 45. The switch begins at line 234; default at line 517.

CASE LIST (file:line -> key): 235 command-center; 243 manager-notifications; 251 launch-readiness; 259 health; 267 overview; 436 leads; 438 pipeline; 439 pipelines; 441 predictive; 442 dialer; 444 retell; 446 workflows; 448 lead-upload; 450 analytics; 452 ai-engine; 454 rotation; 456 spam; 458 sms; 460 reports; 462 automation; 464 dispositions; 466 ai-manager; 468 follow-ups; 470 agent-activity; 472 ai-workflows; 474 reachability; 476 campaign-results; 477 campaigns; 479 live-monitor; 481 ab-testing; 483 broadcast; 485 ai-errors; 487 budget; 489 onboarding; 491 ai-setup; 493 calendar; 495 autonomous-agent; 497 agent-builder; 499 credits; 501 call-history; 503 client-portal; 505 admin-settings; 507 telnyx-ai; 509 packs; 511 wh-properties; 513 se-workspace; 515 d2d-app.

STATE (holds it, lines 110-116): useSearchParams; useState activeTab (111); useState numbers (112); useToast; useSimpleMode; useDemoMode; useEnabledPacks.

DIRECT SUPABASE CALLS (yes): import at line 23; query at lines 153-156 supabase.from('phone_numbers').select('*').order('created_at'). This is a direct DB read inside the container component, bypassing any data hook.

DATA FETCHING (yes): loadNumbers() lines 136-189 (demo-mode branch 138-150; live query 152-184), triggered by useEffect lines 191-193.

BUSINESS LOGIC (yes, embedded): demo-data mapping 139-148; provider inference (retell/telnyx/twilio) 160-182; error toast via debouncedErrorToast 187; launch-lock handlers handleTestCall 195-201 and handleReleaseFromQuarantine 203-209 that surface CONTACT_EGRESS_LAUNCH_LOCK_MESSAGE / QUARANTINE_RELEASE_LAUNCH_LOCK_MESSAGE; area-code parsing inline 347-350; simple-mode redirect effect 120-129.

PURE ROUTING vs LOGIC SPLIT: The switch (lines 234-519, ~286 lines) is thin routing for 43 of the 44 bodies (each body is a 1-3 line TabErrorBoundary+Suspense+lazy-component wrapper, e.g. 'leads' at 437, 'pipeline' at 440). The ONE exception is the 'overview' case (lines 267-435, ~169 lines) which INLINES a full screen: SystemHealthIndicator, TodayPerformanceCard, QuickLaunchButton, QuickStartCards, PendingCallbacksWidget, SystemHealthDashboard, four stat Cards (290-354) and a phone-numbers table (362-432) rendering the `numbers` state directly. So: ~286 lines switch, but ~169 of those are non-routing inline UI; plus ~86 lines of state/fetch/logic before the switch (109-218). Roughly half the file (logic+inline-UI, ~255 lines) is NOT routing.

CLASSIFICATION: HYBRID with god-object characteristics. It is not a pure router (App.tsx is the actual URL router). It is not a clean per-tab router either because it additionally owns a Supabase fetch, application state shared into 3 tabs (numbers passed to analytics/ai-engine/rotation at 451/453/455), and an inlined Overview screen. FIX DIRECTION: extract the overview JSX into <OverviewTab />, move the phone_numbers fetch into a usePhoneNumbers hook (or query lib), and leave Dashboard as a thin tab-switch. That would reduce the file to ~350 lines of near-pure routing.

**evidence**

- src/components/Dashboard.tsx:544 (file length; PowerShell (Get-Content).Count = 544)
- src/components/Dashboard.tsx:234 (switch (activeTab) {) and :517 (default:)
- src/components/Dashboard.tsx:235-515 (47 case labels, listed in findings; PowerShell Select-String 'case ' = 47 matches, all real labels)
- src/components/Dashboard.tsx:110-116 (useSearchParams, useState activeTab, useState numbers, useToast, useSimpleMode, useDemoMode, useEnabledPacks)
- src/components/Dashboard.tsx:23 and :153-156 (import { supabase } + direct .from('phone_numbers').select('*'))
- src/components/Dashboard.tsx:136-189 (loadNumbers fetch+provider-inference logic) and :191-193 (useEffect loadNumbers)
- src/components/Dashboard.tsx:267-435 (~169 inlined lines of 'overview' screen UI, not routing)
- src/components/Dashboard.tsx:437,440,443 (thin 1-line routing bodies typical of the other 43 cases)
- src/components/Dashboard.tsx:451,453,455 (numbers state passed into CallAnalytics/AIDecisionEngine/NumberRotationManager)
- src/App.tsx:127 BrowserRouter; :132-153 <Routes>; PowerShell (Select-String '<Route ').Count = 18; :141 <Route path="/dashboard" element={<ProtectedRoute><Index /></ProtectedRoute>}>
- src/pages/Index.tsx:1-13 (14-line wrapper: Navigation + Dashboard)

**validation**

Ran PowerShell on Windows (grep/wc unavailable in cmd.exe): (Get-Content).Count on Dashboard.tsx = 544; Select-String 'case ' = 47 matches, printed with line numbers and confirmed each is a real switch label (no substring false positives); Select-String '<Route ' in App.tsx = 18. Read all three files in full (Dashboard 544 lines, App 171, Index 14) and cross-checked every claim to a line number. Alias pairs verified by reading shared bodies at 438-440, 441-443, 476-478.

**open_questions**

- Are the alias keys (pipeline/pipelines, predictive/dialer, campaign-results/campaigns) intentional back-compat URLs? (low impact on classification)
- Does DashboardSidebar define the canonical ordered tab list, and does it duplicate the 47 keys (a second source of truth to sync)? Not checked.

**what_i_did_not_check**

- DashboardSidebar.tsx and the sidebar tab registry (possible duplicate list of the same tab keys).
- useEnabledPacks/packForTab internals (pack-gating at 223-232 assumed correct).
- Whether any tab key is dead/unreachable or missing a sidebar entry (reachability cross-check).
- Other large components under src/components (e.g. CommandCenter) that may themselves be god objects.

**confidence**: high