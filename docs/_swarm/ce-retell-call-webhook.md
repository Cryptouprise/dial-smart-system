# ce-retell-call-webhook

- status: completed
- tldr: No new-call egress in either copy; only PATCH update-call + GET get-call. Main enforces HMAC signature + launch lock; deployed live copy is unsigned and ungated.

RESEARCH ONLY, no changes. Both retell-call-webhook files: the handler does NOT egress a new call. Only Retell-API egress is PATCH /v2/update-call (dynamic vars; main index.ts:971, live index.ts:722) and GET /v2/get-call (cost; main 2043, live 1515). No create-phone-call/create-web-call/transfer/bridge/redial exists in either file; all 'transfer' hits are disposition classification. It DOES egress SMS + CRM/workflow via invokeServiceFunction (sms-messaging main 1863/live 1349, disposition-router main 1909/live 1381, ghl-integration main 3040/live 2453). Signature: main enforces HMAC-SHA256 (contact-safety.ts:171-207, enforce mode + 5min tolerance, 503/401 at index.ts:572-595); the deployed live snapshot has NO signature verification (imports 11-13; health_check unauthenticated success:true at 442-459). Browser-reachable: yes, config.toml:274-275 verify_jwt=false + CORS '*' in both. Launch lock: main's isRetellAnalysisAutomationCertified()=false (82-85) gates the whole analysis fan-out (1402-1415, early return 1576-1594), so those effects do not run; but terminal reconciliation re-arms dialing_queues to 'pending' (1700-1723) outside that lock, and call-dispatcher is not launch-locked for Retell (880-885), a redial-adjacent path. No signature bypass via X-DialSmart-Reconciliation (reconciler re-signs, 199-215). Deployment caveat: functions-live/README.md:1-11,79-80 says the live tree IS what's deployed (v453) and the gates exist only on main.

## Artifact

**Findings**

Q1 EGRESS OF A NEW CALL — NO in either file. The only Retell-API egress is (a) PATCH /v2/update-call/{call_id} injecting retell_llm_dynamic_variables on inbound call_started (main index.ts:971-980; live snapshot index.ts:722-731), and (b) GET /v2/get-call/{call_id} to read cost (main 2043-2052; live 1515-1524). There is NO create-phone-call, create-web-call, create-batch, transfer-call, bridge or redial call anywhere in either handler (exhaustive findstr over fetch(/api.retellai.com/create-*/transfer). Every 'transfer' hit is disposition CLASSIFICATION text, not egress. The handler otherwise only records events and calls downstream Supabase edge functions (invokeServiceFunction -> fetch to ${SUPABASE_URL}/functions/v1/<name>: definition main 37-74, fetch at 50). Downstream invokes = sms-messaging (main 1863; live 1349), disposition-router (main 1909; live 1381), ghl-integration (main 3040 via syncToGoHighLevel called at 2000; live 2453 via 1472). So it can egress an SMS and a CRM/workflow side-effect, but never a new voice call directly.

Q2 SIGNATURE/AUTH — the two files DIVERGE. Main (repo source) enforces a real HMAC-SHA256 signature: mode must be 'enforce' (522-523), signing key must exist (521, 578-583) else HTTP 503, then verifyRetellWebhookSignature(rawBody, X-Retell-Signature header, key) at 584-595, rejecting with HTTP 401. The verifier (_shared/contact-safety.ts:171-207) parses 'v={ts_ms},d={hex}', requires |now-ts|<=5min (185-188) and compares digests with a constant-time compare (203). Health checks are separately gated: require service-role bearer OR a valid user JWT (528-544), else 401. The live snapshot has NO signature verification at all: its imports are only serve/createClient/sendManagerNotification (index.ts:11-13); grep for signature/verify/RETELL_WEBHOOK/RETELL_WEBHOOK_SIGNING_KEY returns nothing, and its health_check branch returns success:true unauthenticated (442-459). Its post-call fan-out is gated ONLY by 'if (leadId)' (1238) + 'if (userId)' (1406). It also calls SMS via the old un-authed supabase.functions.invoke('sms-messaging') (1349-1357) rather than the service-role fetch used in main.

Q3 BROWSER-REACHABLE — yes. supabase/config.toml:274-275 sets [functions.retell-call-webhook] verify_jwt=false, and CORS is wide open (Access-Control-Allow-Origin '*' + OPTIONS short-circuit: main 21-24/490-492; live 15-18/421-423). So the platform JWT gate is OFF for both; the only gate is the in-function signature (main only) — which the deployed live copy does not have.

Q4 LAUNCH LOCK / BYPASS — main has a launch lock; live does not; one main path sits outside the lock. Main defines isRetellAnalysisAutomationCertified(): boolean { return false; } (82-85). It gates ownsAnalysisEffects (which requires that flag: 1402-1415). That in turn gates every downstream fan-out: lead status/workflow updates (1740), sms-messaging (1863), disposition-router (1909), GHL sync (2000), manager SMS (2011). If neither terminal nor analysis tokens are owned the handler early-returns (1576-1594), so in main those effects do NOT execute. HOWEVER the terminal-reconciliation branch (gated by ownsTerminalReconciliation, NOT by the certified flag) still runs the dialing-queue state machine and RE-ARMS the queue: status 'pending' with scheduled_at +5/+15min callback retry (1700-1703) and +30min standard retry (1720-1723), or 'failed'/terminal (1727). Re-arming a dialing_queues row to 'pending' feeds call-dispatcher, which is NOT launch-locked for Retell: it allows provider null|retell (call-dispatcher/index.ts:880-885) and blocks only Telnyx (1646-1668). So the queue re-arm is a redial-adjacent egress path the analysis-effects lock does not cover (though it is receipt-gated and does not itself create the call). Bypass-of-signature via the reconciliation header: none — X-DialSmart-Reconciliation: retell-provider-lookup (main 514-515) only suppresses clearing the quarantine flag (1249-1260); the reconciler still signs with the SAME key (retell-reconciler/index.ts:199-215), so no auth bypass.

DEPLOYMENT REALITY: supabase/functions-live/README.md:1-11,29,79-80 states the functions-live tree is the byte-exact snapshot of what is DEPLOYED to project emonjusymdripmkvtttc (retell-call-webhook v453), and that the 503 'certification gate' changes exist only on GitHub main, never on live. So the RUNNING handler today is the ungated, unsigned copy; the signed + launch-locked file is unreleased repo source.

**evidence**

- supabase/functions/retell-call-webhook/index.ts:37-74 (invokeServiceFunction fetch to SUPABASE_URL/functions/v1)
- supabase/functions/retell-call-webhook/index.ts:82-85 (isRetellAnalysisAutomationCertified -> false)
- supabase/functions/retell-call-webhook/index.ts:488 (serve entry)
- supabase/functions/retell-call-webhook/index.ts:514-515 (X-DialSmart-Reconciliation header)
- supabase/functions/retell-call-webhook/index.ts:521-523,572-595 (enforce mode, signing key, verifyRetellWebhookSignature, 401/503)
- supabase/functions/retell-call-webhook/index.ts:528-544 (health check requires service-role or user JWT)
- supabase/functions/retell-call-webhook/index.ts:971-980 (PATCH api.retellai.com/v2/update-call)
- supabase/functions/retell-call-webhook/index.ts:1249-1260 (reconciliation quarantine clear skipped when reconstructed)
- supabase/functions/retell-call-webhook/index.ts:1402-1415 (ownsAnalysisEffects gate)
- supabase/functions/retell-call-webhook/index.ts:1576-1594 (early return when no terminal/analysis claim)
- supabase/functions/retell-call-webhook/index.ts:1598-1737 (queue state machine; re-arm pending 1700-1703,1720-1723)
- supabase/functions/retell-call-webhook/index.ts:1740,1863,1909,2000,2011 (analysis-gated fan-out)
- supabase/functions/retell-call-webhook/index.ts:2043-2052 (GET api.retellai.com/v2/get-call)
- supabase/functions/retell-call-webhook/index.ts:3001-3052 (syncToGoHighLevel -> ghl-integration at 3040)
- supabase/functions/_shared/contact-safety.ts:171-207 (HMAC-SHA256 body+timestamp, 5min tolerance, constant-time compare)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:11-13 (imports: no signature helper)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:419-459 (serve entry; unauthenticated health_check success:true)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:722-731 (PATCH update-call)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:1238,1406 (only leadId/userId guards)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:1349-1357 (supabase.functions.invoke sms-messaging, no service-role)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:1381-1388 (disposition-router)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:1472,2453 (ghl-integration)
- supabase/functions-live/retell-call-webhook/functions/retell-call-webhook/index.ts:1515-1524 (GET get-call)
- supabase/config.toml:274-275 (verify_jwt = false for retell-call-webhook)
- supabase/functions/call-dispatcher/index.ts:880-885 (allows provider null|retell),1646-1668 (Telnyx blocked)
- supabase/functions/retell-reconciler/index.ts:199-215 (signs with same key + X-DialSmart-Reconciliation)
- supabase/functions-live/README.md:1-11,29,79-80 (functions-live = deployed snapshot v453; gates only on main)

**validation**

Exhaustive literal enumeration with findstr over both files for fetch(, api.retellai.com, create-phone-call, create-web-call, create-batch, transfer, plus grep for Certified/reconcil/claim_provider_callback/RETELL_WEBHOOK/signature/verify/Authorization. Main shows exactly 3 network sites (invokeServiceFunction:50, update-call:971, get-call:2043); live shows the same 3 (44/722/1515) plus the un-authed functions.invoke at 1349. config.toml verify_jwt entries read directly (274-275). README read directly to establish which tree is deployed. No files modified (read-only).

**open_questions**

- Is the repo main (signed + launch-locked) handler the intended next deploy, and does the deploy pipeline actually use supabase/functions/ rather than functions-live/?
- Does the dialing_queue 'pending' re-arm (main 1700-1723) actually result in a new Retell call under the current campaign-release/certification gate in call-dispatcher + migrations/20260713150000_campaign_contact_release_gate.sql?
- Why does disposition-router (a fan-out target) still carry its own launch gate isDispositionAutomationTenantCertified, and does that double-gate the same work?

**edge_cases_considered**

- OPTIONS/CORS preflight short-circuits before auth in both copies
- health_check path returns before signature check but is separately authenticated in main (401) and unauthenticated in live
- call_started inbound vs outbound branches (main 634+ requires an authoritative call log; live has no ownership gate)
- call_failed / call_ended / call_analyzed event filtering (main 1018)
- reconstructedProviderLookup suppresses quarantine-clearing but not signature verification
- idempotency via claim_provider_callback receipts (main only); live has none
- downstream invokeServiceFunction calls propagate service-role key in main vs un-authed supabase.functions.invoke in live

**what_i_did_not_check**

- Did not read every line of the 3072-line main / 2485-line live files (only all egress sites + auth + gate regions); non-egress logic such as transcript parsing was skimmed
- Did not verify at runtime which version is actually deployed (relied on functions-live/README.md:1-11,79-80 stating snapshots are byte-exact and dated 2026-10-29/11-02)
- Did not inspect the bodies of downstream functions (sms-messaging, disposition-router, ghl-integration) to confirm they cannot themselves egress a voice call
- Did not check migrations for a DB-level launch lock / release gate beyond noting 20260713150000_campaign_contact_release_gate.sql exists
- Did not confirm whether RETELL_WEBHOOK_SIGNING_KEY / RETELL_WEBHOOK_VERIFY_MODE are actually set in the deployed project env (enforcement is fail-closed to 503 if absent, but env was not read)

**confidence**: high