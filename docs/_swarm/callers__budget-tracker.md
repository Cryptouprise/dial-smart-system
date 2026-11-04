# callers::budget-tracker

- status: completed
- tldr: budget-tracker: 1 live caller (useBudgetTracker.ts, 6 invoke sites), none expect 200, all handle 503 gracefully; gate is hard-coded false -> 503 at index.ts:21-23/33-43

DONE: Inventoried every live caller of edge function 'budget-tracker' in C:\Users\charl\dial-smart-system and characterized its hard 503 disable gate.

TOUCHED: none (read-only inventory).

EVIDENCE / RESULT:
- Exactly ONE live in-repo caller: src/hooks/useBudgetTracker.ts via supabase.functions.invoke('budget-tracker',...) at :83, :129, :163, :196, :220, :248. Sole consumer src/components/BudgetManager.tsx (:27 import, :58). Compiled twin dist/assets/BudgetManager-DiaINzmP.js:1. Test src/hooks/__tests__/useBudgetTracker.test.ts (8 assert sites, not live).
- ZERO other callers: no hits in supabase/functions/**, scripts/, mcp-server/ (grep 'budget'=0), public/showcase, or migrations; no cron/pg_net target (only automation-scheduler is scheduled -> /functions/v1/automation-scheduler); no 'functions/v1/budget*' fetch-URL caller. config.toml:296-299 only sets verify_jwt=true (not a caller/bypass). Repo-wide 'budget-tracker' grep = 14 files, 11 of which are prose docs.
- HTTP handling: NONE expects 200. All 6 sites do `if (error) throw error` inside try/catch; a 503 is caught (console.error; two sites also show a destructive toast). Graceful, but BudgetManager silently shows $0.00 spend / no alerts.
- Gate: supabase/functions/budget-tracker/index.ts:21-23 `isProviderBudgetTrackingTenantCertified(){return false;}` HARD-CODED (no env var); :33-43 early-return 503 {disabled:true, error_code:'PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED'} right after the OPTIONS preflight (:26-28->200). Real logic :45-546 is behind it and unreachable.
- No in-repo route/config bypass: verify_jwt can't disable an in-function 503; the only env reads (:46-47) are behind the gate; functions-live/ has no budget-tracker; only one deployment dir exists; no Supabase path alias. Only out-of-repo bypasses (edit stub / deploy different source).

COULD_NOT: Did not call the live deployment to confirm the real 503 (read-only), did not trace the router, did not inspect external clients.

CONFIDENCE: high.

VALIDATION: three independent greps converge; index.ts read in full; scheduler migration and functions-live listed.

FOLLOW-UPS: (1) confirm prod actually returns 503 (live check, out of scope here); (2) confirm BudgetManager reachability in the app router; (3) note callers of OTHER gated functions (call-dispatcher, ai-error-analyzer, test-workflow, ai-configuration-complete per config.toml) may have the same silent-degradation pattern.

## Artifact

**Findings**

FACT: There is exactly ONE live in-repo caller of the edge function 'budget-tracker': the React hook src/hooks/useBudgetTracker.ts, which calls supabase.functions.invoke('budget-tracker', {...}) at 6 sites (lines 83, 129, 163, 196, 220, 248). Its only consumer is src/components/BudgetManager.tsx (:27 import, :58 useBudgetTracker(selectedCampaign)). A compiled copy of the same hook is bundled into dist/assets/BudgetManager-DiaINzmP.js (line 1), identical error semantics. The test file src/hooks/__tests__/useBudgetTracker.test.ts asserts invoke is called with 'budget-tracker' (8 sites) but is not a live caller. No other surface calls it: zero hits in supabase/functions/** (other edge functions), zero in scripts/, zero in mcp-server/ (grep 'budget' = 0 matches), zero in public/showcase, zero in migrations, zero cron/pg_net/net.http_post target it, and zero 'functions/v1/budget*'/fetch-URL callers anywhere. config.toml:296-299 only declares [functions.budget-tracker] verify_jwt=true (an auth gate, not a caller and not a bypass). \n\nFACT: NONE of the 6 call sites expects HTTP 200. Every site does `if (error) throw error` inside a try/catch, so a hard 503 is handled gracefully: fetchSpendingSummary(:91->catch:103 console.error), checkBudget(:136->catch:150 console.error + return null), updateBudgetSettings(:171->catch:183 console.error + destructive toast), acknowledgeAlert(:204->catch:211 console.error), togglePause(:229->catch:236 console.error), refreshUsage(:256->catch:268 console.error + destructive toast). supabase-js invoke maps a 503 to {data:null, error:FunctionsHttpError}, and the hook is robust whether invoke returns the error or rejects. Practical effect: no crash, but the BudgetManager panel silently renders $0.00 spend / no alerts (silent degradation, not breakage). \n\nFACT (disable gate): supabase/functions/budget-tracker/index.ts is gated by a HARD-CODED stub, not an env var or DB check. Lines 21-23: `function isProviderBudgetTrackingTenantCertified(): boolean { return false; }`. Lines 33-43: immediately after the CORS OPTIONS preflight (lines 26-28, returns 200), it returns status 503 with body {success:false, disabled:true, error_code:'PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED', error:'Provider budget tracking is disabled until usage is reconciled and aggregated by exact organization.'} and header Cache-Control: no-store. All real logic (lines 45-546) sits BEHIND this return and is unreachable while disabled. \n\nFACT (bypass analysis): No in-repo route or config can remove/bypass the gate. config.toml only sets verify_jwt (cannot disable an in-function 503; a valid JWT still gets 503). No env var toggles it (the only env reads, SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at :46-47, are behind the gate). There is no second/alternate deployment source of this function in the repo: supabase/functions-live/ contains 12 functions and NOT budget-tracker, and only one budget-tracker directory exists (supabase/functions/budget-tracker/). Supabase has no path-alias/rewrite that could point another route at this code. The only bypasses are out-of-repo: editing the stub to return true, or deploying a build from different source than the repo. \n\nComment (context, not gating): :30-32 comment says the route is quarantined because it reads account-global Twilio+Retell usage that can be misattributed across companies; it tracks provider spend (fetchUsageFromProviders, user_credentials), not Stripe.

**evidence**

- FACT: src/hooks/useBudgetTracker.ts:83 — supabase.functions.invoke('budget-tracker', {body:{action:'get_spending_summary',period,campaignId}}); :91 if(error)throw; :103 catch console.error (GRACEFUL)
- FACT: src/hooks/useBudgetTracker.ts:129 & :163 — invoke('budget-tracker', action:'check_budget' / 'update_budget_settings'); :136/:171 if(error)throw; catches :150/:183 (GRACEFUL)
- FACT: src/hooks/useBudgetTracker.ts:196, :220, :248 — invoke('budget-tracker', action:'acknowledge_alert'/'toggle_pause'/'fetch_usage'); catches :211/:236/:268 (GRACEFUL)
- FACT: src/hooks/useBudgetTracker.ts:280-285 — useEffect on mount fires fetchSpendingSummary x2 and hence 2 invokes (will 503, logged)
- FACT: src/components/BudgetManager.tsx:27 import { useBudgetTracker }; :58 } = useBudgetTracker(selectedCampaign); renders dailySummary/monthlySummary/alerts (defaults 0 / empty)
- FACT: src/hooks/__tests__/useBudgetTracker.test.ts:155,189,203,217,315,373,421,494 — expect(mockSupabase.functions.invoke).toHaveBeenCalledWith('budget-tracker', ...); mock returns {data:null,error:null} (:43-46)
- FACT: dist/assets/BudgetManager-DiaINzmP.js:1 — minified d.functions.invoke(`budget-tracker`,{body:{action:`get_spending_summary`...}}); same if(r)throw r;catch pattern
- FACT: supabase/config.toml:296-299 — [functions.budget-tracker] with comment 'Launch-quarantined before provider access' and verify_jwt = true
- FACT: grep 'budget-tracker' repo-wide = 14 files: docs/_swarm/{ALL-REPORTS,dialpath-provider-trunk-config,int-infra,market-objection,market-pricing-schema,risks-c1-credit-spend,sr__billing-credit__budget-tracker,sr__billing-credit__gate__config-verify-jwt}.md, docs/dial-smart-app-map.md, docs/dial-smart-review-digest.md, docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md, src/hooks/__tests__/useBudgetTracker.test.ts, src/hooks/useBudgetTracker.ts, supabase/config.toml. Only 3 are code (hook, its test, config); rest are prose docs.
- FACT: grep 'budget_tracker|budget-tracker' under supabase/ = 1 match (config.toml:296). No edge function references it.
- FACT: grep 'budget' under mcp-server/ = 0 matches; under public/ = showcase blog copy only (marketing prose); grep 'functions/v1/budget' repo-wide = 0 matches.
- FACT: supabase/functions/budget-tracker/index.ts:21-23 isProviderBudgetTrackingTenantCertified(){return false;} (hard-coded); :26-28 OPTIONS->200; :33-43 return 503 PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED; real logic :45-546 behind gate; only env reads :46-47 behind gate
- FACT: deps — only pg_cron/pg_net schedule in repo is supabase/migrations/20260713050000_automation_scheduler_cron_auth.sql which net.http_post's to rtrim(url)||'/functions/v1/automation-scheduler' (NOT budget-tracker)
- FACT: supabase/functions-live/ contains 12 functions (ai-sms-processor, api-gateway, call-dispatcher, disposition-router, outbound-calling, pipeline-management, retell-call-webhook, sms-messaging, stripe-webhook, telnyx-webhook, twilio-sms-webhook, workflow-executor) — no budget-tracker
- COVERAGE: docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:22 (prose, unverified by me) claims budget-tracker is gated with PROVIDER_BUDGET_TRACKING_NOT_TENANT_CERTIFIED@37 on both live and main

**validation**

Static verification only (file reads + greps); no live calls made. Confirmed single caller by three independent passes: (1) literal grep 'budget-tracker' repo-wide = 14 files, (2) grep under supabase/ = config only, (3) regex for SDK-arg / URL-embedded forms = hook only. Confirmed gate by reading index.ts end-to-end (all 546 lines). Confirmed no cron target by reading the one pg_net scheduler migration. Confirmed no duplicate deployment by listing supabase/functions-live.

**open_questions**

- Does the DEPLOYED cloud copy of budget-tracker match this repo source (i.e. is it actually returning 503 in prod)? Not verified — no live API call made (inventory/read-only scope).
- Is BudgetManager.tsx routed/visible in the app shell? Not confirmed (did not trace the router), so UI blast radius of the 503 is unverified.
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md claims a live-vs-main gate; not independently re-verified against the live deployment.

**edge_cases_considered**

- Case-insensitive / alternate names (budget_tracker, BudgetTracker, budget-tracker-*): repo-wide find returned only the same hook + docs; no dynamic name construction
- Dynamic/concatenated invoke target: regex 'functions/v1/budget|invoke(['\"]budget|budget-tracker['\"]' = only the hook (14 hits) — no string-built function name
- Direct fetch() URL caller bypassing the SDK: zero '/functions/v1/budget*' hits
- DB-scheduled callers (pg_cron + pg_net net.http_post / http_request): enumerated all such migrations; only automation-scheduler is scheduled
- Alternate deployment dirs that could hold an ungated copy: functions-live checked (no budget-tracker); only one budget-tracker dir exists
- Build output (dist) and static assets (public): dist lumps the same hook into BudgetManager chunk; public has no caller
- CORS preflight path: OPTIONS returns 200 without hitting the gate, so browsers never see a preflight failure
- supabase-js invoke semantics on non-2xx (returns error vs rejects): hook covers both via if(error)throw inside try/catch

**what_i_did_not_check**

- Did not call the live Supabase deployment to observe the real 503 response (read-only inventory; no live API calls per rules)
- Did not trace the React router to confirm BudgetManager is reachable in the shipped app
- Did not decompile/scan every minified dist chunk beyond grep (only 'budget-tracker' string searched; a bundler-renamed reference would have been missed)
- Did not inspect node_modules or binary files for references (grep respects ignore files)
- Did not verify whether other clients outside this repo (e.g. external dashboards/command-center, n8n, Hermes) call budget-tracker over the network — no external system was queried
- Did not audit the LiveSupabase project's real function list (functions-live/ is a repo folder, not a live API enumeration)

**confidence**: high