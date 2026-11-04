# ce-outbound-calling-live

- status: completed
- tldr: Live outbound-calling: no consent/DNC/stop gates, calling-hours+credit fail-open before egress, no 503; main re-checks all and fails closed

Audited gate placement in the LIVE outbound-calling (v600, 1373 lines). Result: only calling-hours (320-358) and credit (360-452) exist, both one-shot before egress and both fail-open; consent, DNC and global-stop are entirely absent. Retell egress at 1159 has no boundary recheck and retries 3x. No launch-quarantine 503; Telnyx egress executes live (672/690). Main re-checks all gates inside the egress closure (enforceFinalBoundary at 1808), fails closed, and 503s Telnyx (295-305). Auth: verify_jwt=false (config.toml:123) with in-function auth (138-210).

## Artifact

**Findings**

LIVE (supabase/functions-live/outbound-calling/index.ts, v600, 1373 lines, last deploy 2026-07-01 18:15:11 UTC per functions-live/README.md:26) barely enforces any gate at egress. Of the five gates only calling-hours and credit exist; consent, DNC and global-stop are ABSENT entirely.

1) LIVE consent: NONE. No consent / evaluate_contact_stop / contact_stop code anywhere in the file.
2) LIVE DNC: NONE. skipDncCheck is declared (124) and destructured (224) but NEVER used; comments at 123 and 317 ('Bypass DNC') describe a check that does not exist.
3) LIVE global-stop: NONE. No evaluate_contact_stop RPC and no stop-list lookup.
4) LIVE calling-hours: EXISTS at 320-358, guarded ONLY by `if (!isTestCall && campaignId)` (324). Uses the CAMPAIGN timezone (332), not lead-local. Its catch swallows the error and continues (355-357) = FAILS OPEN. Not re-checked before egress.
5) LIVE credit: EXISTS at 360-452, guarded by `if (!isTestCall && !skipCreditCheck)` (360), checks a fixed 1-minute estimate (p_minutes_needed: 1, line 376), and is fail-OPEN for anything except 'Insufficient credits' (444-451). Not re-checked before egress.
6) LIVE Retell egress: line 1159 fetch to ${baseUrl}/create-phone-call inside retryWithBackoff (1156-1195) with 3 retries (1193). No gate is re-checked inside the retry closure, so a retry re-dials with no fresh safety evaluation.
7) LIVE Telnyx egress is LIVE and NOT quarantined: direct assistant call at 672 and TeXML fallback at 690 actually execute.
8) LIVE launch-quarantine 503: ABSENT. No PROVIDER_EGRESS_NOT_CERTIFIED/*_NOT_CERTIFIED branch. README.md:80 confirms the 503 gates exist only on main, never on live.
9) LIVE auth: verify_jwt DISABLED. supabase/config.toml:123-124 sets [functions.outbound-calling] verify_jwt = false ('Handles auth internally'). In-function auth: Authorization header required (138-150, 401), service-role token equality (170), else auth.getUser(token) (190) with 401 (198-207).

MAIN (supabase/functions/outbound-calling/index.ts, GitHub main, 2245 lines) re-checks EVERY relevant gate at the provider boundary. assertContactAllowed(boundary) (652-693) re-reads evaluate_contact_stop (653, CONTACT_STOPPED 664), leads.do_not_call (668-678, DNC_BLOCKED) and dnc_list by normalized phone (685-691, DNC_BLOCKED 691); skipDncCheck is explicitly ignored (683). assertCallingHoursAllowed (765-790) uses LEAD-local timezone (773) and is invoked via enforceFinalBoundary (810); the legacy guard (834-880) now FAILS CLOSED (throws CALLING_HOURS_SAFETY_UNAVAILABLE at 878). Credit (946-1043) sizes the hold on live certified max call duration (894), ignores skipCreditCheck (945), fails CLOSED (1035-1042). Retell egress: `await enforceFinalBoundary()` at 1808 sits IMMEDIATELY before create-phone-call at 1811, INSIDE the retry closure, so all gates re-run on every attempt; retries=1 (1861) to avoid duplicate physical calls. Telnyx is hard-disabled by 503 at 295-305 (path unreachable).

DIFFERENCE SUMMARY (live vs main): (a) live has NO consent/DNC/global-stop; main has all three re-checked at the boundary. (b) live's calling-hours+credit are one-shot before egress and FAIL OPEN; main's are re-checked inside the egress retry closure and FAIL CLOSED. (c) live uses campaign timezone; main uses lead-local. (d) live holds 1 minute of credit; main holds full certified exposure. (e) live executes Telnyx egress; main 503s it. (f) live retries Retell 3x; main 1x. (g) live trusts client isTestCall/skipDncCheck/skipCreditCheck to bypass; main ignores the skip flags and never lets a test flag bypass safety/billing.

**evidence**

- supabase/functions-live/outbound-calling/index.ts:320-358 (calling-hours guard, fail-open catch at 355-357)
- supabase/functions-live/outbound-calling/index.ts:360-452 (credit guard, 1-min estimate at 376, fail-open at 444-451)
- supabase/functions-live/outbound-calling/index.ts:123-124,224 (skipDncCheck declared/destructured, never used)
- supabase/functions-live/outbound-calling/index.ts:672,690 (live Telnyx egress) and 1159 (live Retell egress) inside retryWithBackoff 1156-1195 (3 retries at 1193)
- supabase/functions-live/outbound-calling/index.ts:138-210 (in-function auth), 170 (service-role equality), 190 (auth.getUser)
- supabase/config.toml:123-124 (verify_jwt = false for outbound-calling)
- supabase/functions-live/README.md:26 (live outbound-calling v600, 1373 lines, 2026-07-01) and :80 (503 gates only on main)
- supabase/functions/outbound-calling/index.ts:295-305 (503 PROVIDER_EGRESS_NOT_CERTIFIED)
- supabase/functions/outbound-calling/index.ts:652-693 (assertContactAllowed: evaluate_contact_stop 653, do_not_call 668-678, dnc_list 685-691, skipDncCheck ignored 683)
- supabase/functions/outbound-calling/index.ts:765-790 (assertCallingHoursAllowed, lead timezone 773) and 807-819 (enforceFinalBoundary)
- supabase/functions/outbound-calling/index.ts:945-1043 (credit holds certified exposure, fails closed)
- supabase/functions/outbound-calling/index.ts:1808-1835 (enforceFinalBoundary immediately before Retell create) and 1861 (retry=1)
- supabase/functions/outbound-calling/index.ts:1269,1306 (Telnyx boundary, unreachable due to 503)

**validation**

Full read of the 1373-line live file (1-1373) and targeted reads of main (280-410, 630-1044, 1258-1327, 1795-1865). Keyword greps for dnc/do_not_call/consent/global_stop/contact_stop/calling_hours/verify_jwt/503/not_certified/quarantine across both files and supabase/config.toml. Cross-checked live identity against functions-live/README.md (v600, 1373 lines). No files modified; research only.

**open_questions**

- Is the live verify_jwt=false the actual deployed value, or was it overridden by a later deploy? config.toml is the only in-repo source; the live README table does not record verify_jwt for outbound-calling.
- Does the live call-dispatcher pre-filter DNC/stop before invoking this function (compensating upstream control)? Not checked here.
- Do DB triggers or RLS on campaigns/leads enforce DNC independently of the function?

**what_i_did_not_check**

- The live call-dispatcher / automation-scheduler that feeds this function - whether dispatcher already filters DNC/stop/calling-hours.
- Whether DB-level triggers or RLS on campaigns/leads/call_logs enforce DNC or stop-list membership independently of the function.
- The live retell-call-webhook (post-egress) for any credit/DNC reconciliation.
- Live deploy records (Supabase MCP) to independently confirm the deployed verify_jwt value instead of inferring it from config.toml.

**confidence**: high