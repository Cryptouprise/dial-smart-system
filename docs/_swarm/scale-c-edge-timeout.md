# scale-c-edge-timeout

- status: completed
- tldr: Lane C done: 3 big fns quarantined (503). ai-autonomous-engine = HIGH timeout risk (multi-tenant 21-step chain, no batching); ai-brain LOW-MED; calendar LOW. Cold start = file size.

LANE C (edge cold-start & timeouts) complete. Read docs/dial-smart-app-map.md in full, then inspected the three largest edge functions (ai-autonomous-engine 230KB, ai-brain 191KB, calendar-integration 141KB).

Headline: all three are launch-quarantined (return HTTP 503 before doing work: engine :5498-5521; ai-brain :10-12/4652-4664; calendar :43-51), so NONE can hit the platform timeout today. The real risk is 'when restored'.

- ai-autonomous-engine = HIGH risk: one invocation enumerates EVERY tenant (:5551-5554, loop :5573) and runs a ~21-step synchronous chain per tenant (:5110-5492) with ~6 LLM calls (:1244,1465,2342,3259,3716,3978), a 100-iteration ML training loop (:4573-4608) and multi-hundred-row loops (:2834/:2922/:4750). NO batching/cursor/page-cap/time-budget/AbortController anywhere. Trigger is pg_cron every 5 min (assumes <300s; 20260210_autonomous_engine_upgrade.sql:278-289, disabled 20260713061000:19-25). Timeout damage is non-atomic: per-decision inserts (:5209-5220) leave partial actions (duplicate risk) and the step-21 heartbeat (:5482) stays unwritten -> false 'has not completed a run' backstop alert. FIX: one tenant per invocation + durable run-cursor table (reuse observer-runtime.ts:600-631) + between-step time budget + move ML training to a queued worker + AbortController on fetchFunctionJson (:414).
- ai-brain = LOW-MED risk: bounded single tool round, max 2 LLM calls (:4814,:4963). Exposure is heavy tools (send_sms_blast 100ms-sleep loop :1693-1731). FIX: cap tool_calls/turn + queue the bulk tools.
- calendar-integration = LOW risk: single action per request (:157), bounded loops (guard<60 :3315). ~8 functions call it synchronously. FIX: AbortController on Google/Cal.com fetches.
- Cold start: dominated by single-file SIZE + deprecated deno std http 0.168.0 shim; no npm: deps in the three; sms-boundary.ts is import-free; openrouter is lazily imported.

Confidence: medium. Open gaps listed (exact 150s vs 400s platform limit not verifiable in-repo; live DB cron state and real runtimes not measured; other ~107 functions not audited).

## Artifact

**Findings**

C-1 (HIGH, FACT): ai-autonomous-engine is the only real timeout risk. One HTTP invocation enumerates EVERY tenant and runs a ~21-step synchronous await chain per tenant, with NO batching, cursor, page cap, or wall-clock budget. Evidence: index.ts:5551-5554 (select all enabled settings), :5573 (for..of every tenant, no limit), :5110-5492 (21 sequential steps).

C-2 (HIGH, FACT): per tenant it fires ~6 LLM calls (lazy openrouter) + a 100-iteration logistic-regression loop + multi-hundred-row loops. Evidence: dynamic import at :1244,1465,2342,3259,3716,3978; training loop :4573-4608; .limit(5000) :2834, .slice(0,200) :2922, .limit(2000)+.in(slice(0,2000)) :4750/:4765.

C-3 (HIGH, FACT): timeout state is non-atomic. Each decision inserts its own row (:5209-5220, no transaction) so a mid-run timeout leaves partial actions (duplicate risk next run), and the step-21 heartbeat (:5482) stays unwritten, which the unrelated safety backstop reads as 'engine has not completed a run' (backstop migration :50).

C-4 (MEDIUM, FACT): trigger is pg_cron '*/5' (every 300s), so the code implicitly assumes a full multi-tenant run finishes well under 300s; an overrun overlaps the next tick (double execution, no lock). Cron defined 20260210_autonomous_engine_upgrade.sql:278-289, unscheduled by 20260713061000:19-25.

C-5 (LOW-MED, FACT): ai-brain is bounded per invocation: one tool round, max 2 LLM calls (no multi-turn LLM loop). Timeout exposure is inside heavy tools, not the loop. Evidence: :4814 and :4963; tools executed once :4905-4954; send_sms_blast 100ms-sleep loop :1693-1731 (limit 100 :1658); number loops :2961,:3265.

C-6 (LOW, FACT): calendar-integration is a single bounded action per request (switch :157); availability loops bounded by date range with guard<60 (:3315). Real exposure: ~8 edge functions call it synchronously (ai-sms-processor:984, twilio-sms-webhook:1340/1469/1563, call-tracking-webhook:1212, disposition-router:747, voice-broadcast-engine:2277, retell-agent-management:13, telnyx-ai-assistant:128).

C-7 (INFO, FACT): all three are launch-quarantined and return HTTP 503 before doing any work, so TODAY none can hit the platform timeout. Risk is 'when restored'. Evidence: engine :5498-5521; ai-brain :10-12,4652-4664; calendar :43-51 (rest of file dead code).

C-8 (LOW, FACT): cold-start cost is dominated by module SIZE (single index.ts 230,691 / 191,249 / 141,403 bytes) + the deprecated deno std http 0.168.0 shim, not by heavy deps. No npm: imports in these three; sms-boundary.ts is import-free; the LLM module is deferred. (Only mcp/index.ts uses npm:.)

C-9 (INFO, FACT): the fix pattern already exists in-repo but is unused by the three: offset + next_cursor read model at _shared/control-plane/observer-runtime.ts:600-631.

PER-FUNCTION VERDICTS:
- ai-autonomous-engine: shape=one long multi-tenant synchronous chain; chunking/budget=NONE; timeout risk=HIGH (when enabled). FIX: one tenant per invocation (cron fans out), add a durable per-tenant run-cursor table reusing observer-runtime.ts:600-631, add a between-step wall-clock budget that returns a resume cursor, move trainConversionModel/predictLeadConversion to a queued worker, record timeouts and resume instead of re-queuing, add AbortController to fetchFunctionJson (:414).
- ai-brain: shape=bounded agent turn (1 initial LLM + 1 final LLM, tools once); risk=LOW-MED. FIX: cap tool_calls per turn, add wall-clock budget, move send_sms_blast/purchase_retell_numbers/bulk_update_leads to a queue worker.
- calendar-integration: shape=single action per request; risk=LOW. FIX: AbortController timeouts on Google/Cal.com fetches; note it is 503 so callers are already degraded.

**evidence**

- supabase/functions/ai-autonomous-engine/index.ts:5551-5554 selects ALL autonomous_settings where enabled=true
- supabase/functions/ai-autonomous-engine/index.ts:5573 unbounded tenant fan-out loop
- supabase/functions/ai-autonomous-engine/index.ts:5110-5492 runForUser = 21 sequential steps
- supabase/functions/ai-autonomous-engine/index.ts:1244,1465,2342,3259,3716,3978 dynamic import('../_shared/openrouter.ts') = ~6 LLM calls per tenant
- supabase/functions/ai-autonomous-engine/index.ts:4573-4608 trainConversionModel MAX_ITERATIONS=100 nested training loop
- supabase/functions/ai-autonomous-engine/index.ts:414-432 fetchFunctionJson with no AbortController/timeout
- supabase/functions/ai-autonomous-engine/index.ts:5209-5220 per-decision insertCanonicalAction (no tx)
- supabase/functions/ai-autonomous-engine/index.ts:5482-5485 last_engine_run update is step 21
- supabase/functions/ai-autonomous-engine/index.ts:5498-5521 quarantine gate returns 503
- supabase/functions/ai-brain/index.ts:10-12 and 4652-4664 quarantine gate returns 503
- supabase/functions/ai-brain/index.ts:4814 initial LLM call and :4963 final LLM call (single tool round, no LLM loop)
- supabase/functions/ai-brain/index.ts:1693-1731 send_sms_blast 100ms-sleep per-lead loop (limit 100 at :1658)
- supabase/functions/ai-brain/index.ts:2961 and :3265 number purchase/assign loops
- supabase/functions/calendar-integration/index.ts:38-51 unconditional 503 (rest of file dead)
- supabase/functions/calendar-integration/index.ts:157 switch(action) single action per request
- supabase/functions/calendar-integration/index.ts:1054-1069 availability day/slot loops; guard<60 at :3315
- supabase/functions/calendar-integration/index.ts:3142 ensureFreshGoogleToken
- supabase/migrations/20260210_autonomous_engine_upgrade.sql:278-289 cron every 5 min calls ai-autonomous-engine
- supabase/migrations/20260713061000_disable_uncertified_autonomous_engine_cron.sql:19-25 unschedules the cron + safety-backstops
- supabase/migrations/20260712050000_provider_safe_unattended_backstops.sql:50 reads the 'has not completed a run since' heartbeat
- supabase/functions/_shared/control-plane/observer-runtime.ts:600-631 existing offset + next_cursor pattern (unused by the three)
- docs/dial-smart-app-map.md (read in full, 177 lines)

**validation**

Read docs/dial-smart-app-map.md in full. Opened each function's full serve handler (engine 5480-5645, ai-brain 4647-5026, calendar 38-177) and engine runForUser in full (5110-5492). Grepped module top-level imports for all three and sms-boundary.ts. Repo-wide grep for loop/batch/cursor/continue-token/time-budget/AbortController/waitUntil/EdgeRuntime and for docs stating 150s/400s (none found). Traced the cron trigger and its disabling migration. Measured the three files by byte size. Every finding cites file:line.

**open_questions**

- The exact Supabase Edge wall-clock limit assumed (150s paid vs any other) is a platform fact not stated anywhere in the repo, and the code contains no such constant, so nothing in-repo pins 150 vs 400.
- Whether the pg_cron '*/5' jobs are still scheduled in the LIVE database (migrations disable them; live DB state not queried).
- Real per-tenant runtime on a populated tenant was not measured (no live execution; quarantined).
- Whether Supabase's newer background-task/waitUntil mechanism is used anywhere (grep found none in this repo's functions).

**what_i_did_not_check**

- Did not read every one of the ~110 edge functions for timeout risk, only the three named plus immediate callers and _shared heuristics.
- Did not read all 5645/5027/3497 lines line-by-line; sampled entry points, loops and LLM calls via targeted grep.
- Did not query the live Supabase project (emonjusymdripmkvtttc) for deployed function config, version, or per-function timeout/memory settings.
- Did not measure real cold-start latency or real run duration (no execution permitted; quarantined).
- Did not audit voice-broadcast-engine, call-dispatcher, outbound-calling, or twilio-sms-webhook for their own timeout risk though they are large and call calendar-integration.
- Did not verify Supabase's 150s limit against external documentation.

**confidence**: medium