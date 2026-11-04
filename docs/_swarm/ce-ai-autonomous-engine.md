# ce-ai-autonomous-engine

- status: completed
- tldr: ai-autonomous-engine is coded to autonomously egress calls/SMS but is fully launch-quarantined (early 503, service-only auth, cron removed); DNC+hours checked, no credit/consent check.

ce-ai-autonomous-engine: RESEARCH ONLY, nothing changed. VERDICT: ai-autonomous-engine CAN and is coded to autonomously egress paid calls + SMS and to queue dials, but it is fully launch-quarantined and cannot run.

Egress (index.ts): journey_call -> outbound-calling (:752), send_followup_sms -> sms-messaging (:673), journey_ai_sms -> ai-sms-processor (:779), queue_leads_for_calling -> dialing_queues upsert (:656). All via service-role fetch (:417).
Quarantine: isAutonomousEngineTenantCertified() hard-coded false (:5498-5500) -> early 503 (:5511-5521) BEFORE any auth.
Auth: requires Bearer == SUPABASE_SERVICE_ROLE_KEY (:5534-5543, else 401); config.toml verify_jwt=true (:321-325). Browser can reach/read (CORS '*', :29-32) but hits the 503 then would 401.
Cron: was scheduled every 5 min (migration 20260210:262-282); removed with no enable switch by 20260713061000:8-27 (cron.unschedule). Residual refs are alert-only + a test.
Safety on the gated path: DNC enforced (:447, :635-636, :881, :908, :1545, :1611); calling-hours coarse server-local (:849-852, :1964-1975); NO consent/TCPA check; NO credit check in-engine (delegated to outbound-calling:951/1003/1008).

Validation: static read-only, file:line cited. Blockers: none. Follow-ups: confirm sms-messaging/ai-sms-processor credit+consent guards, whether the heartbeat monitor now false-alarms, and whether the live DB actually lacks the cron job (no live query run).

## Artifact

**Findings**

TARGET: C:/Users/charl/dial-smart-system/supabase/functions/ai-autonomous-engine/index.ts (5644 lines, 230 KB).

1) EGRESS CAPABILITY (yes, it can egress calls + SMS + queue dials, but it is behind a hard quarantine):
- The engine DOES contain real external egress. It posts over HTTP to sibling edge functions using the service-role key (index.ts:414-432, fetch to `${SUPABASE_URL}/functions/v1/${functionName}` at :417).
- Call egress: action_type 'journey_call' POSTs to 'outbound-calling' with buildOutboundCallRequest -> a real paid outbound call (index.ts:743-769, fetch at :752).
- SMS egress: 'send_followup_sms' -> 'sms-messaging' (:665-683, fetch at :673); 'journey_ai_sms' -> 'ai-sms-processor' (:772-791, fetch at :779).
- Campaign/dispatch activation: 'queue_leads_for_calling' (:606-661) upserts rows into dialing_queues (:656-659) so the dialer will call them; this is dispatch-by-queue rather than an explicit 'activate campaign' write, but it is the same egress path. It does NOT set a campaign to active (it requires the campaign already be status='active', :612-615).

2) LAUNCH QUARANTINE (early 503, in-function, yes):
- isAutonomousEngineTenantCertified() returns false (index.ts:5498-5500).
- The handler returns 503 immediately when that is false (index.ts:5511-5521, error_code AUTONOMOUS_ENGINE_NOT_TENANT_CERTIFIED, disabled:true).
- Ordering inside serve(): OPTIONS (:5503) -> quarantine 503 (:5511) -> service-token check (:5534-5543). So the quarantine fires BEFORE any auth logic and gates 100% of the run.

3) AUTH:
- After the quarantine, it requires the caller's Bearer token to equal SUPABASE_SERVICE_ROLE_KEY exactly; otherwise 401 (index.ts:5534-5543). So only a service-role caller could ever run it.
- config.toml sets verify_jwt = true for this function (supabase/config.toml:321-325), so the platform also rejects unauthenticated requests at the edge before the function body runs. Comment there says: 'Launch-quarantined in-function before service-role construction... its old pg_cron job is removed by a forward safety migration.'
- Browser reachability: CORS is open (Access-Control-Allow-Origin '*', index.ts:29-32), so a browser CAN send and read responses, BUT verify_jwt=true means an unauthenticated browser request is refused at the edge; an authenticated browser request with a *user* JWT passes edge verification, then immediately hits the 503 quarantine (:5511) and, if that ever flipped, would fail the token!==serviceKey check with 401 (:5538). No browser path can trigger egress.

4) CRON REMOVED (yes):
- Originally scheduled: migration 20260210_autonomous_engine_upgrade.sql:262-282 creates cron job 'ai-autonomous-engine-job' every 5 minutes hitting /functions/v1/ai-autonomous-engine.
- Removed: migration 20260713061000_disable_uncertified_autonomous_engine_cron.sql:8-27 loops cron.job and cron.unschedule() for jobname IN ('ai-autonomous-engine-job','safety-backstops','campaign-health-autofix'), and the header states 'provide no enable switch' (:6). No later migration re-schedules it (repo-wide migration scan found no other cron.schedule for this job).
- Residual references are non-egress: a heartbeat ALERT monitor that fires when last_engine_run goes stale (20260712050000_provider_safe_unattended_backstops.sql:50), and a test asserting the cron jobs are absent (supabase/tests/automation_scheduler_auth_contract.sql:32).

5) SAFETY CHECKS ON THE (gated) EGRESS PATH:
- DNC/consent: do_not_call is enforced before call/SMS egress. resolveLeadAndCampaign throws if lead.do_not_call (index.ts:447); queue_leads_for_calling rejects DNC/missing-phone leads (:635-636); decision-time queries filter .eq('do_not_call', false) (:175, :881, :908, :1545); journey loop skips DNC (lead.do_not_call -> continue, :1611). Opt-out handling exists only as a stop-disposition 'unsubscribe' (:1921) and status exclusion 'unsubscribed' (:4749). There is NO explicit TCPA / prior-express-consent / opt-in check anywhere in the file.
- Hours: two guards. Decision engine returns no decisions outside 9am-5pm server local time (index.ts:849-852). Perpetual journey defers 'call' touches outside 9am-9pm server local time to next-day 10am (:1964-1975). Both use new Date().getHours() (server timezone), NOT per-lead timezone — no timezone/quiet-hours table is consulted.
- Credit: there is NO credit/balance gate inside ai-autonomous-engine. Its only cost logic is estimation/planning (index.ts:1075-1079, :1804-1830, :2308-2309 daily_budget_cents default 50000). Credit is enforced downstream: outbound-calling does check_credit_balance + reserve_credits and fails the call on insufficient balance (outbound-calling/index.ts:951, :1003, :1008, and explicitly ignores skipCreditCheck at :945). sms-messaging/index.ts had ZERO matches for credit|balance|check_credit, so SMS egress via this engine is not visibly credit-gated at the sms-messaging layer.

BOTTOM LINE: Definitively YES it is built to autonomously egress paid calls/SMS and to queue dials, and YES it checks DNC + coarse server-hour calling windows, but it currently CANNOT run: an in-function 503 quarantine (certified flag hard-coded false) gates the whole handler before auth, its service-role-only auth is defense in depth on top of verify_jwt=true, its pg_cron job was unscheduled by a forward migration with no enable switch, and browser callers cannot get past the JWT/503 gate. No credit check in the engine itself (delegated to outbound-calling; not evident in sms-messaging).

**evidence**

- supabase/functions/ai-autonomous-engine/index.ts:414-432 (fetchFunctionJson egress helper; fetch at :417 with service-role Bearer)
- supabase/functions/ai-autonomous-engine/index.ts:752 (journey_call -> outbound-calling)
- supabase/functions/ai-autonomous-engine/index.ts:673 (send_followup_sms -> sms-messaging)
- supabase/functions/ai-autonomous-engine/index.ts:779 (journey_ai_sms -> ai-sms-processor)
- supabase/functions/ai-autonomous-engine/index.ts:656-659 (queue_leads_for_calling upserts dialing_queues)
- supabase/functions/ai-autonomous-engine/index.ts:5498-5500 (isAutonomousEngineTenantCertified returns false)
- supabase/functions/ai-autonomous-engine/index.ts:5511-5521 (early 503 AUTONOMOUS_ENGINE_NOT_TENANT_CERTIFIED)
- supabase/functions/ai-autonomous-engine/index.ts:5534-5543 (token must equal service-role key, else 401)
- supabase/functions/ai-autonomous-engine/index.ts:29-32 (CORS Access-Control-Allow-Origin '*')
- supabase/config.toml:321-325 (verify_jwt = true + launch-quarantine comment)
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:262-282 (cron job ai-autonomous-engine-job every 5 min)
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:8-27 (cron.unschedule of ai-autonomous-engine-job; 'no enable switch' at :6)
- supabase/migrations/20260712050000_provider_safe_unattended_backstops.sql:50 (heartbeat alert only)
- supabase/functions/ai-autonomous-engine/index.ts:447,635-636,881,908,1545,1611 (DNC guards)
- supabase/functions/ai-autonomous-engine/index.ts:849-852 and :1964-1975 (server-local calling-hours guards)
- supabase/functions/ai-autonomous-engine/index.ts:1075-1079,2308-2309 (cost/budget estimation only, no credit gate)
- supabase/functions/outbound-calling/index.ts:951,1003,1008 (check_credit_balance/reserve_credits; :945 skipCreditCheck ignored)
- supabase/functions/sms-messaging/index.ts (grep credit|balance|check_credit -> no matches)

**validation**

Static read-only verification only (RESEARCH ONLY; nothing changed). Read the full handler tail (:5470-5644), the execution switch (:600-800), the decision/calling-hours blocks (:840-885, :1955-1985), the fetch helper (:400-432), config.toml:314-329, and the three relevant migrations plus a repo-wide grep for 'ai-autonomous-engine' and for credit/quarantine/DNC markers. Line numbers cited directly from file reads.

**open_questions**

- Does sms-messaging (or ai-sms-processor) enforce credit/consent elsewhere (e.g. via a shared guard) even though 'credit' does not appear in sms-messaging/index.ts? Not fully read.
- Does the heartbeat monitor (20260712050000:50) now emit persistent false 'Autonomous calling NOT executing' alerts because last_engine_run will be stale forever?
- Is ai_action_queue populated/approved by any other live path that a future certified replacement would consume?

**edge_cases_considered**

- A user-JWT browser call passes edge verify_jwt but is stopped by the in-function 503 (index.ts:5511) which precedes the token check (index.ts:5538).
- A caller spoofing a user JWT cannot egress; only a caller presenting the exact SUPABASE_SERVICE_ROLE_KEY could reach runForUser, and the 503 blocks even that.
- Multiple-postgres-install variants: migration guards to_regclass('cron.job') IS NULL (20260713061000:12-14) so it no-ops in environments without pg_cron.
- Stale/duplicate executions handled via 30-min lease expiry + compare-and-set claim (index.ts:552-596) reducing double-egress risk if it ever ran.
- Calling-hours guards use server local time, so a tenant in a different timezone could be outside real local hours even when the guard passes (theoretical).

**what_i_did_not_check**

- Full read of downstream functions sms-messaging/index.ts and ai-sms-processor/index.ts for credit/consent/timezone enforcement (only grep-sampled).
- Whether any OTHER invoker (e.g. a Deno.cron, an external scheduler, or the Hermes server) calls this function's URL outside the repo.
- Whether the deployed (live) Supabase project's cron.job actually lacks the job vs the migration file merely existing (no live DB query performed).
- The _shared/action-contracts.ts build*Request helpers' internal payload shape and any additional guards they add.

**confidence**: high