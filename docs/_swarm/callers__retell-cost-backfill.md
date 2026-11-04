# callers::retell-cost-backfill

- status: completed
- tldr: Zero live callers of retell-cost-backfill found in repo (docs+config only); no migration/cron targets it; verify_jwt=true gives 401 before the in-function 503.

Inventory of live callers of supabase edge function 'retell-cost-backfill' (repo C:\Users\charl\dial-smart-system).

HEADLINE: ZERO live callers exist in the repo. No fetch()/supabase.functions.invoke()/curl/net.http_post anywhere targets /functions/v1/retell-cost-backfill, in src/**, scripts/, dashboards, supabase/functions/**, or supabase/migrations/**/*.sql. All 'retell-cost-backfill' hits (59 in 10 files) are docs + one config entry.

MIGRATIONS: 0 references. Every cron.schedule/net.http_post edge target in the live migration path is automation-scheduler (20251204062700:16; 20260713050000:47), ai-autonomous-engine (20260210:282), campaign-health-monitor (20260703224351:215), retell-reconciler (20260713043000:1898), run_safety_backstops() (:202) - none is retell-cost-backfill. No cron.job definition names it. http_request: 0 hits repo-wide.

GENERIC INVOKERS ruled out: ai-autonomous-engine.fetchFunctionJson (index.ts:414) -> sms-messaging:673, outbound-calling:752, ai-sms-processor:779; retell-call-webhook.invokeServiceFunction (index.ts:37/50) -> sms-messaging:1863, disposition-router:1909, analyze-call-transcript:2691, ghl-integration:3040. Hardcoded literals only.

HTTP-200 EXPECTATION: N/A - no caller to break on the hard 503.

config.toml:283-286: [functions.retell-cost-backfill] verify_jwt = true. The platform JWT gate runs BEFORE the handler: a JWT-less/invalid caller gets HTTP 401 and never reaches the 503; a caller with a VALID project JWT (legacy anon/service_role keys) passes the gate and then gets the in-function 503. verify_jwt does not bypass the 503.

DISABLE GATE: index.ts:8-10 hardcoded return false; :20 gate -> :21-29 status 503 error_code RETELL_COST_BACKFILL_NOT_CERTIFIED. :13-15 OPTIONS returns 200 before the gate. :32-179 service-role body unreachable. No config/route bypass; only editing index.ts:9 reaches the body.

Only 'invocation-adjacent' mention: DEPLOYMENT_AUDIT.md:99 = an operator `supabase functions delete ... retell-cost-backfill` CLI command (deletion, not a runtime caller).

Validation: repo-wide + directory-scoped greps (retell-cost-backfill, cost-backfill, retell_cost_backfill, RETELL_COST_BACKFILL, functions/v1/, net.http_post, cron.schedule, cron.job, functions.invoke, http_request); read config.toml:270-309 and the full 180-line function. Cross-checked an agentgrep false-negative ('fetchFunctionJson' returned 0) with findstr, which found the real call sites.

Blockers/follow-ups: cannot see the LIVE cron.job table (dashboard-created crons are not in git per AUTONOMOUS_SYSTEM_FLOW.md:441), so a live cron absent from the repo is not ruled out; also unverified whether the deployed verify_jwt matches config.toml and whether the function was already deleted from prod. confidence: medium (high for the repo inventory, medium overall due to the un-inspectable live cron table).

## Artifact

**Findings**

(1) LIVE CALLER INVENTORY = NONE (FACT). Repo-wide search of C:\Users\charl\dial-smart-system found ZERO runtime callers in frontend (src/**), scripts/, dashboards (src/components/Dashboard*), or supabase/functions/**. All 'retell-cost-backfill' hits are documentation + one config entry: DEPLOYMENT_AUDIT.md, docs/_swarm/{ALL-REPORTS,ai-vendors-truth,calllogs-insert-rls,int-telephony,sr__billing-credit__gate__config-verify-jwt,sr__billing-credit__retell-cost-backfill}.md, docs/dial-smart-review-digest.md, docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md, supabase/config.toml. (2) SQL MIGRATIONS = NONE (FACT). 'retell-cost-backfill' appears 0 times in supabase/migrations/**/*.sql. Every cron.schedule/net.http_post edge target in the live migration path is automation-scheduler (20251204062700:16; 20260713050000:47), ai-autonomous-engine (20260210:282), campaign-health-monitor (20260703224351:215), retell-reconciler (20260713043000:1898), plus run_safety_backstops() (:202). None names retell-cost-backfill. 'http_request' = 0 hits repo-wide. (3) GENERIC INVOKERS ruled out (FACT): ai-autonomous-engine.fetchFunctionJson (index.ts:414) posts to ${SUPABASE_URL}/functions/v1/${functionName} but all call sites pass hardcoded literals sms-messaging (:673), outbound-calling (:752), ai-sms-processor (:779); retell-call-webhook.invokeServiceFunction (index.ts:37, body at :50) passes sms-messaging (:1863), disposition-router (:1909), analyze-call-transcript (:2691), ghl-integration (:3040). (4) HTTP-200 EXPECTATION = N/A (FACT, repo scope): no fetch()/supabase.functions.invoke()/curl/net.http_post anywhere targets /functions/v1/retell-cost-backfill, so no in-repo caller can be broken by the hard 503. (5) config.toml verify_jwt (FACT): supabase/config.toml:283-286 sets [functions.retell-cost-backfill] verify_jwt = true. The Supabase platform JWT gate runs BEFORE the handler, so an unauthenticated caller (missing/invalid/expired Authorization) is rejected with HTTP 401 and index.ts never runs (it never sees the 503); a caller presenting a VALID project JWT (legacy anon or service_role JWT keys are valid project JWTs) passes the platform gate and THEN reaches the in-function 503. So verify_jwt=true gives 401-before-503 only for JWT-less/invalid callers; it does not stop a valid-JWT holder from hitting the 503. (config.toml:278 notes newer opaque publishable keys cannot pass the legacy JWT gate - extra nuance.) (6) DISABLE GATE (FACT): index.ts:8-10 `function isRetellCostBackfillCertified(): boolean { return false; }` is a hardcoded constant with no env/DB/config/query read; index.ts:20 `if (!isRetellCostBackfillCertified())` short-circuits and returns status 503, error_code 'RETELL_COST_BACKFILL_NOT_CERTIFIED' (:21-29); index.ts:13-15 handles method==='OPTIONS' returning 200 'ok' BEFORE the gate; index.ts:32-179 (service-role SELECT/UPDATE on call_logs + Retell API loop) is unreachable while the constant is false. (7) BYPASS ROUTES = none via config/routing (FACT): single Deno.serve handler, no query/header/env override and no alternate branch around the gate; verify_jwt only ADDS an upstream 401 gate, it cannot bypass the 503. The only way to reach the 503-free body is to edit index.ts:9 to return true (code change), which would then expose an unauthenticated-service-role cross-tenant backfill. (8) Only 'invocation-adjacent' mentions: DEPLOYMENT_AUDIT.md:60 lists retell-cost-backfill among live one-shot functions to delete, and :99 shows an operator `supabase functions delete ... retell-cost-backfill --project-ref emonjusymdripmkvtttc` command - a CLI deletion, not a runtime caller.

**evidence**

- supabase/functions/retell-cost-backfill/index.ts:8-10 isRetellCostBackfillCertified() hardcoded return false
- supabase/functions/retell-cost-backfill/index.ts:13-15 OPTIONS returns 200 'ok' before the gate
- supabase/functions/retell-cost-backfill/index.ts:20-29 disable gate -> status 503 error_code RETELL_COST_BACKFILL_NOT_CERTIFIED
- supabase/functions/retell-cost-backfill/index.ts:32-179 service-role body, unreachable while gate false
- supabase/config.toml:283-286 [functions.retell-cost-backfill] verify_jwt = true
- repo-wide grep 'retell-cost-backfill' = 59 matches in 10 files, ALL docs + config.toml (DEPLOYMENT_AUDIT.md; docs/_swarm/*; docs/dial-smart-review-digest.md; docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md); 0 in src/, scripts/, supabase/functions, supabase/migrations
- grep 'retell-cost-backfill' in supabase/migrations = 0 matches
- migrations cron/net.http_post targets via functions/v1/: automation-scheduler (20251204062700:16; 20260713050000:47), ai-autonomous-engine (20260210:282), campaign-health-monitor (20260703224351:215), retell-reconciler (20260713043000:1898) - none retell-cost-backfill
- supabase/functions/ai-autonomous-engine/index.ts:414,673,752,779 fetchFunctionJson literals sms-messaging/outbound-calling/ai-sms-processor only
- supabase/functions/retell-call-webhook/index.ts:37,50,1863,1909,2691,3040 invokeServiceFunction literals sms-messaging/disposition-router/analyze-call-transcript/ghl-integration only
- DEPLOYMENT_AUDIT.md:60 lists retell-cost-backfill as a live one-shot; :99 shows an operator `supabase functions delete` CLI command listing it (CLI deletion, not a runtime caller)

**validation**

Repo-wide + directory-scoped greps for retell-cost-backfill (59 hits/10 files, all docs+config), cost-backfill, retell_cost_backfill (0), RETELL_COST_BACKFILL, functions/v1/, net.http_post, cron.schedule, cron.job, functions.invoke, http_request. Enumerated every cron.schedule/net.http_post edge target across supabase/migrations/**/*.sql and certification/recovery-lineage-v*/migrations. Checked all generic dynamic-URL invokers and their call sites. Read config.toml:270-309 and the full 180-line supabase/functions/retell-cost-backfill/index.ts. Method note: agentgrep returned a false-negative 0-match for the bare identifier 'fetchFunctionJson'; corrected with findstr /n which found the real call sites (index.ts:673,752,779).

**open_questions**

- Does a cron.job row in the LIVE database (created via the Supabase dashboard SQL editor, hence absent from supabase/migrations) currently target /functions/v1/retell-cost-backfill? Repo evidence says no, but dashboard-created crons are not in git.
- Does the DEPLOYED function's verify_jwt match supabase/config.toml:286 (true), i.e. is config.toml the authoritative deployed equivalent?
- Has retell-cost-backfill already been deleted from the deployed project (per DEPLOYMENT_AUDIT.md:99), making both the 503 and the config entry moot?

**edge_cases_considered**

- OPTIONS preflight (index.ts:13-15) returns 200 'ok' BEFORE the disable gate, so a CORS preflight is never 503 while every other method is.
- verify_jwt=true blocks only callers lacking a valid project JWT; legacy anon/service_role JWT keys ARE valid project JWTs and pass the platform gate, so a bearer-holding caller reaches the in-function 503.
- Generic in-function invokers (ai-autonomous-engine.fetchFunctionJson, retell-call-webhook.invokeServiceFunction) could reach any function in principle, but all call sites pass hardcoded literals, none the backfill.
- certification/recovery-lineage-v*/migrations are snapshot copies; the live migration path supabase/migrations/**/*.sql has 0 references.

**what_i_did_not_check**

- The LIVE Postgres cron.job table and pg_cron history (no DB access used; per AUTONOMOUS_SYSTEM_FLOW.md:441 crons were created in the Supabase dashboard SQL editor and do not appear in git, so a live cron absent from the repo cannot be excluded by code alone).
- The deployed function's actual verify_jwt vs supabase/config.toml (assumed config.toml is the deployed equivalent).
- Whether the function still exists in the deployed project (DEPLOYMENT_AUDIT.md:99 suggests it was queued for CLI deletion).
- Supabase platform JWT-gate behavior for the project's newer opaque publishable keys (noted via config.toml:278, not independently tested).
- Dashboards/command-center hosted outside this repo (e.g. Hermes) that could call the URL server-side.

**confidence**: medium