# quality-tests

- status: completed
- tldr: 101 test files; ~8:1 behaviour:render, 0 snapshots; biggest untested risk = ai-autonomous-engine (4954 lines) + skipped call-dispatcher/outbound-calling tests.

TEST COVERAGE audit of C:/Users/charl/dial-smart-system complete. (1) 101 test files (*.test.ts/tsx + *.spec.ts/tsx); config: vitest.config.ts, src/test/setup.ts, playwright.config.ts, mcp-server/vitest.config.ts; 4 are Playwright e2e. (2) Largest files are BEHAVIOUR tests (disposition-router, observer-runtime, usePredictiveDialing, useConcurrencyManager, useAutonomousAgent, etc.); ScriptAnalyticsDashboard.test.tsx is the main RENDER-dominant one. (3) ~90 behaviour files vs ~11 render-dominant files (~8:1); ZERO snapshot tests, no .snap files. (4) BIGGEST UNTESTED RISK: ai-autonomous-engine/index.ts (4954 lines, deployed per config.toml) has zero tests; and the core dispatch path is effectively untested because call-dispatcher (1971 lines) and outbound-calling (2078 lines) tests are unconditionally skipped (describe.skip / opt-in live flag). predictive-dialing-engine (282 lines) also untested; 761 RLS policy statements across migrations with no RLS/DB test.

## Artifact

**Findings**

TEST COVERAGE of C:/Users/charl/dial-smart-system (101 test files). (1) COUNT: 101 files matching *.test.ts/tsx + *.spec.ts/tsx (FACT, automated PowerShell count, excluding node_modules). Setup/config present: vitest.config.ts, src/test/setup.ts, playwright.config.ts, mcp-server/vitest.config.ts. 4 of the 101 are Playwright e2e: e2e/{accessibility,auth,dashboard,navigation}.spec.ts. Breakdown: src/components/__tests__ 16, src/contexts/__tests__ 6, src/hooks/__tests__ 15, src/lib/__tests__ 16, src/packs/door_to_door/__tests__ 4, src/services/providers/__tests__ 1, src/__tests__/edge-functions 4, supabase/functions colocated 15, supabase/functions/_shared 20, mcp-server/test 4, e2e 4. (2) LARGEST FILES classified: disposition-router.test.ts (BEHAVIOUR, pure fns, e.g. line 118 expect(matchesCategory(...)).toBe(true)); observer-runtime.test.ts (BEHAVIOUR, Deno assertEquals x84, e.g. line 279 assertEquals(teamHash.length,64)); usePredictiveDialing.test.ts (BEHAVIOUR, line 75 expect(result.current.isLoading).toBe(false)); usePipelineManagement.extended.test.ts (BEHAVIOUR, line 162 expect(mockInvoke).toHaveBeenCalledWith(...)); useConcurrencyManager.test.ts (BEHAVIOUR, line 69 expect(result.current.activeCalls).toEqual([])); useAutonomousAgent.test.ts (BEHAVIOUR, line 89 expect(result.current.settings.enabled).toBe(false)); useCampaignWorkflows.extended.test.ts (BEHAVIOUR, line 80 expect(result.current.workflows).toHaveLength(1)); AIErrorContext.test.tsx (MIXED/behaviour-tilted, 59 expects vs 2 render, line 65 getByTestId('x').toBeInTheDocument); ScriptAnalyticsDashboard.test.tsx (RENDER-dominant, 26 render + 49 toBeInTheDocument, line 63 getByText('Script Analytics').toBeInTheDocument); AIBrainContext.test.tsx (behaviour-tilted, 56 expects vs 2 render, line 52 getByTestId('child')). No .snap files exist anywhere; zero toMatchSnapshot usage. (3) RATIO: 18 of 101 files call render(); ~11 of those are render-dominant (assertions mostly toBeInTheDocument): ActionQueuePanel, ScriptAnalyticsDashboard, LeadJourneyDashboard, ProductionHealthDashboard, ErrorBoundary, OperatorIntegrationStatus, ProviderManagement, CampaignLaunchVerification, EnhancedLeadManager, TenantPilotPortfolio, CommandCenter. Remaining ~90 files are behaviour tests (call fn/check output/state, no DOM). Ratio approx 8:1 behaviour:render, 0 snapshot tests. (4) BIGGEST UNTESTED RISK: supabase/functions/ai-autonomous-engine/index.ts (4954 lines, deployed per supabase/config.toml [functions.ai-autonomous-engine]) has ZERO tests -- no *.test file in its folder, no test file references it. Also: the core dispatch path is effectively untested because its only tests are UNCONDITIONALLY SKIPPED -- call-dispatcher/index.ts (1971 lines) test src/__tests__/edge-functions/call-dispatcher.integration.test.ts sets 'const describeLive = describe.skip' (line 17-19, comment: launch quarantine), and outbound-calling/index.ts (2078 lines) test src/__tests__/edge-functions/outbound-calling.integration.test.ts skips unless VITE_RUN_LIVE_OUTBOUND_TESTS=true. predictive-dialing-engine/index.ts (282 lines) also has no test (only frontend hooks usePredictiveDialing*.test.ts exist). disposition-router.test.ts explicitly says it tests 'business logic patterns extracted from the edge function source', i.e. a reimplementation, not the deployed function. 761 CREATE POLICY/ROW LEVEL SECURITY statements exist in supabase/migrations with no DB-level (pgTAP/RLS) test; only tenant-context.test.ts (helper unit test).

**evidence**

- src/hooks/__tests__/usePredictiveDialing.test.ts:75
- src/__tests__/edge-functions/disposition-router.test.ts:118
- supabase/functions/_shared/control-plane/observer-runtime.test.ts:279
- src/__tests__/edge-functions/call-dispatcher.integration.test.ts:19
- src/__tests__/edge-functions/outbound-calling.integration.test.ts:11
- src/components/__tests__/ScriptAnalyticsDashboard.test.tsx:63
- src/components/__tests__/ActionQueuePanel.test.tsx:97
- supabase/functions/ai-autonomous-engine/index.ts (4954 lines, no test)
- supabase/functions/call-dispatcher/index.ts (1971 lines)
- supabase/functions/outbound-calling/index.ts (2078 lines)
- supabase/functions/predictive-dialing-engine/index.ts (282 lines)
- supabase/config.toml [functions.ai-autonomous-engine]

**validation**

Automated enumeration: PowerShell Get-ChildItem -Recurse -Include *.test.ts,*.test.tsx,*.spec.ts,*.spec.tsx (excluding node_modules) => TOTAL 101. Per-file regex counts of render(, expect(, toBeInTheDocument/toMatchSnapshot. Absence proofs: no *.snap files found; zero test files under ai-autonomous-engine or predictive-dialing-engine; grep for 'ai-autonomous-engine' across all test files => none; grep for 'predictive-dialing-engine' in tests => none. Skipped-test count across suite = 11 describe.skip/it.skip occurrences.

**open_questions**

- Is ai-autonomous-engine actually invoked at runtime (cron/scheduler/dynamic name) or dormant? Registered in config.toml but no static caller found in functions dir.
- Does any pgTAP / RLS isolation test exist outside the repo (CI-only) that this scan missed?
- Are the 4 e2e Playwright specs actually executed in CI, or also gated/skipped?

**what_i_did_not_check**

- I did not run the test suites (no pass/fail counts, no line/statement coverage percentages).
- I did not read all 101 test files line-by-line; classification of small files is by aggregate regex counts, not full review.
- I did not verify whether skipped (describe.skip) suites are re-enabled in CI via env flags for the call-dispatcher suite (that one appears hard-skipped).
- I did not inspect supabase/migrations contents to confirm RLS policies have no accompanying automated test harness (only counted 761 policy statements).
- I did not confirm ai-autonomous-engine's runtime reachability (cron entry / dynamic invoke) beyond config.toml registration.

**confidence**: high