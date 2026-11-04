# ce-live-retell-call-webhook

- status: completed
- tldr: retell-call-webhook LIVE: verify_jwt=false, no certification gate, no signature check (open handler); anon POST can write call_logs/leads(DNC)/credits and invoke other fns + send SMS.

Node ce-live-retell-call-webhook DONE. (a) config.toml:274 [functions.retell-call-webhook], line 275 verify_jwt = false (confirmed). (b) NO certification gate in LIVE bytes: full-file grep of the 2485-line LIVE index.ts for certified|_NOT_CERTIFIED|isRetellAnalysisAutomationCertified = 0 matches; the only 'gate' hits (2448-2449 gateErr/GHL gate lookup, 1508 'not gated by org') are unrelated. MAIN also has no *_NOT_CERTIFIED constant, only helper isRetellAnalysisAutomationCertified()@82-84 returning false, matching LIVE-VS-MAIN-GATES.md:38 ('only certified... helpers'). (c) LIVE handler is OPEN: serve()@419 has no signature/secret/bearer/tenant check before processing; imports only serve@11/createClient@12/manager-notify@13. MAIN enforces a Retell signature (import@17; verifyMode!=='enforce' 503 @572-577; !explicitSigningKey 503 @578-583; verifyRetellWebhookSignature on X-Retell-Signature @584-588; invalid 401 @589-595) - none of those bytes exist in LIVE. Unauthenticated POST can trigger, with service-role DB (426/435): call_logs upsert@553-555, leads update + do_not_call=true@1368-1376, scheduled_follow_ups insert@1315, lead_nudge_tracking upsert@2138, lead_pipeline_positions upsert@2207 (+2263/2295/2320/2332/2390/2403), system_alerts inserts@1604/1642/1668/2474, call_logs cost update@1545 + organization_credits add_credits auto-recharge@1629-1633, service-role invokes to disposition-router@1381, analyze-call-transcript@2110-2111, ghl-integration@2453, and real manager SMS via sendManagerNotification@1487/1497 -> sms-messaging send_sms (manager-notify.ts:95-102).

## Artifact

**Findings**

(a) verify_jwt: supabase/config.toml declares [functions.retell-call-webhook] at line 274 and verify_jwt = false at line 275. Confirmed source-side as expected. LIVE deployment (2026-07-01 mass deploy per LIVE-VS-MAIN-GATES.md:10) predates config gating so the deployed function is ungated at the platform layer too. (b) Certification gate in LIVE bytes: NONE. Grep of the full 2485-line LIVE index.ts for certified|isRetellAnalysisAutomationCertified|_NOT_CERTIFIED = 0 matches. The only 'gate' hits are unrelated identifiers: 'GHL gate lookup'/'gateErr' (2448-2449) and 'not gated by org' (1508). MAIN source also has NO *_NOT_CERTIFIED gate constant for this function; it only carries the helper isRetellAnalysisAutomationCertified() at lines 82-84 (hard-coded return false), exactly as LIVE-VS-MAIN-GATES.md:38 states ('only certified... helpers'). (c) Anon reachability in LIVE: the handler is OPEN. LIVE serve() entry at line 419 has NO signature check, NO shared-secret check, NO bearer/apikey check, and NO tenant check before processing. Imports are only serve@11, createClient@12, sendManagerNotification@13. Grep for verifyMode|explicitSigningKey|verifyRetellWebhookSignature in LIVE = 0 matches. MAIN (the hardened profile) DOES enforce a signature, proving the control was deliberately dropped in LIVE: import @17; health payload webhook_verify_mode/webhook_signing_configured @560-561; if verifyMode!=='enforce' 503 @572-577; if !explicitSigningKey 503 @578-583; verifyRetellWebhookSignature with req.headers X-Retell-Signature @584-588; invalid 401 @589-595. None of these bytes exist in LIVE. Unauthenticated POST triggers (LIVE, service-role client at 426/435): call_logs upsert onConflict retell_call_id @553-555; leads update incl do_not_call=true @1368-1376; scheduled_follow_ups insert @1315; lead_nudge_tracking upsert @2138; lead_pipeline_positions upsert @2207 plus pipeline insert @2263 and updates/deletes @2295/2320/2332/2390/2403; system_alerts inserts @1604/1642/1668/2474; call_logs cost update @1545 and organization_credits RPC add_credits for auto-recharge @1629-1633; outbound service-role invokes to disposition-router @1381, analyze-call-transcript @2110-2111, ghl-integration {action:log_call} @2453; real manager SMS via sendManagerNotification @1487/@1497 which calls sms-messaging send_sms (manager-notify.ts:95-102); outbound Retell API cost fetches @719-725/@1511-1520. Health surface also open: OPTIONS @421-423 and {action:health_check} @444-456 return 200 unauthenticated.

**evidence**

- supabase/config.toml:274 [functions.retell-call-webhook]
- supabase/config.toml:275 verify_jwt = false
- LIVE supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:11-13 imports (no signature/secret module)
- LIVE index.ts:419 serve(async (req) => {
- LIVE index.ts:421-423 open OPTIONS
- LIVE index.ts:426 SUPABASE_SERVICE_ROLE_KEY
- LIVE index.ts:435 createClient(supabaseUrl, supabaseServiceKey)
- LIVE index.ts:444-456 open health_check (no auth)
- LIVE index.ts:461 JSON.parse(bodyText) then process (no gate)
- LIVE index.ts:553-555 call_logs upsert
- LIVE index.ts:1368-1376 leads update + do_not_call=true on dnc
- LIVE index.ts:1381 invokeServiceFunction('disposition-router')
- LIVE index.ts:1487,1497 sendManagerNotification
- LIVE index.ts:1545 call_logs cost update
- LIVE index.ts:1604,1642,1668,2474 system_alerts insert
- LIVE index.ts:1629-1633 organization_credits add_credits (auto-recharge)
- LIVE index.ts:2110-2111 invokeServiceFunction('analyze-call-transcript')
- LIVE index.ts:2453 invokeServiceFunction('ghl-integration')
- LIVE _shared/manager-notify.ts:95-102 supabase.functions.invoke('sms-messaging', send_sms)
- MAIN supabase/functions/retell-call-webhook/index.ts:17 import verifyRetellWebhookSignature
- MAIN index.ts:82-84 isRetellAnalysisAutomationCertified() returns false
- MAIN index.ts:572-595 signature enforcement 503/401 gate (absent from LIVE)
- LIVE-VS-MAIN-GATES.md:38 retell-call-webhook listed UNGATED on main (only certified... helpers)
- grep LIVE for certified|isRetellAnalysisAutomationCertified|verifyMode|explicitSigningKey|verifyRetellWebhookSignature => 0 matches

**validation**

Read LIVE handler head (1-13), handler entry (415-504), call_logs upsert (548-555), DNC/lead update (1365-1382), manager notify (1478-1503), cost/credits (1545-1673), analyze invoke (2105-2122), GHL invoke (2445-2458); read MAIN (17, 75-99, 560-604); read config.toml (165-184, 268-287); read LIVE-VS-MAIN-GATES.md in full; ran regex greps for certified/signature/secret/mode vars on both LIVE and MAIN sources. No anon POST was issued (research-only).

**open_questions**

- Does the LIVE gateway still require an apikey/anon header for invocation despite verify_jwt=false? Handler has no auth, but actual anon reachability depends on the platform key requirement (LIVE-VS-MAIN-GATES.md:5 used anon-key probes that returned 200 on other live functions, so anon-key reachability is likely).
- Do the deployed _shared bytes for manager-notify.ts match the repo snapshot used here?

**edge_cases_considered**

- Distinguished the certification gate (absent on both LIVE and main) from the separate signature-enforcement gate (present on main @572-595, absent on LIVE).
- Confirmed the 'gate' grep hits in LIVE (2448-2449, 1508) are unrelated identifiers, not certification gates.
- Noted health_check path short-circuits before any gate in both versions and is itself unauthenticated in LIVE.

**what_i_did_not_check**

- Did not issue any live unauthenticated POST to retell-call-webhook (research-only constraint); reachability is inferred from handler code plus sibling-function probe results in LIVE-VS-MAIN-GATES.md.
- Did not read all 2485 LIVE lines line-by-line; used targeted reads plus full-file greps.
- Did not verify the exact deployed LIVE version number / updated_at for retell-call-webhook (not in the priority-8 list of LIVE-VS-MAIN-GATES.md:42).
- Did not diff LIVE vs MAIN for every DB write; focused on the unauthenticated-reachable write/invoke set.

**confidence**: high