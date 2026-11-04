# ce-outbound-calling-gates

- status: completed
- tldr: outbound-calling gates: MAIN enforces DNC/global-stop/hours/credit/release (not consent); deployed LIVE v600 enforces almost none; service-role path reachable.

Node ce-outbound-calling-gates DONE. The api-gateway call path (POST /v1/calls -> placeCall() -> service-role fetch to /functions/v1/outbound-calling {action:'create_call',...}) IS reachable via the service-role/internal path in both outbound-calling versions (token===serviceRoleKey -> userId from body). KEY SPLIT: supabase/functions/api-gateway/index.ts is byte-identical to supabase/functions-live/api-gateway (md5 021A1B4F9B28B2CA8B53E0A836A06C56, live v39 = deployed), but the two outbound-calling trees differ (main 2245 lines FD4C627A...; live snapshot 1373 lines E843137F..., v600, never redeployed per functions-live/README.md:79-80). Gate verdicts: (1) DNC: ENFORCED on MAIN (leads.do_not_call :667-679, dnc_list :685-691) / ABSENT in deployed LIVE outbound-calling (findstr 'dnc' -> only param+comment lines 123,124,224,317) / PARTIAL at api-gateway (leads.do_not_call :449-451). (2) consent: ABSENT in BOTH (findstr 'consent' in main -> 0; agentgrep has_consent/consent_given -> 0 files). (3) global-stop: ENFORCED on MAIN via evaluate_contact_stop (:653-665; RPC matches scope_type='global', migration 20260712020000:221) / ABSENT LIVE + api-gateway. (4) calling-hours: ENFORCED on MAIN fail-closed (:765-790,:830-880) / LIVE present but weak+fail-open (:324-358, campaign tz default America/New_York, non-fatal catch). (5) credit: ENFORCED on MAIN fail-closed, full-exposure reservation (:945-1043) / LIVE weak+fail-open, 1-min estimate (:360-452). (6) campaign release/status: ENFORCED on MAIN (status :379, enrollment :447-457, release gate :793-805/:926-943) / ABSENT LIVE (campaignId used only for calling hours). Side-finding: on MAIN, api-gateway's payload would be rejected (no idempotencyKey/queueId/dispatchGeneration; campaign/lead pairing :361-368) - so the deployed LIVE v600 is what actually serves the path.

## Artifact

**Findings**

The api-gateway call path is: POST /v1/calls -> placeCall() -> fetch(`${SUPABASE_URL}/functions/v1/outbound-calling`, Authorization: Bearer <SERVICE_ROLE_KEY>, body {action:'create_call', leadId, userId, phoneNumber, callerId, agentId, telnyxAssistantId, campaignId, provider}) -- supabase/functions/api-gateway/index.ts:485-501 (this file is BYTE-IDENTICAL to supabase/functions-live/api-gateway/index.ts, md5 021A1B4F9B28B2CA8B53E0A836A06C56, 1393 lines, live v39, so it IS the deployed api-gateway). Reachability: YES. Both outbound-calling versions accept the service-role/internal shape: token === serviceRoleKey -> service-role call, userId from body (MAIN supabase/functions/outbound-calling/index.ts:220,227-237; LIVE supabase/functions-live/outbound-calling/index.ts:170,177-187); no scope check beyond that. CRITICAL SPLIT: the two source trees differ (MAIN 2245 lines md5 FD4C627A95A93954902CA7B2F4058898; LIVE snapshot 1373 lines md5 E843137F0B25B6E5AFB1D9F4DDE8127B). Per supabase/functions-live/README.md:1-11,20,26,79-80 the LIVE snapshot is the code actually deployed (outbound-calling v600, last bulk deploy 2026-07-01 18:15 UTC, never redeployed), while MAIN carries unreleased 503 certification gates never deployed to live. So the gates below are ENFORCED on MAIN source, but on the DEPLOYED (LIVE) runtime most are ABSENT.

GATE 1 - lead do_not_call / DNC:
  * LIVE outbound-calling (deployed): ABSENT. Only occurrences of 'dnc' in supabase/functions-live/outbound-calling/index.ts are 123 (param doc), 124 (skipDncCheck field), 224 (destructure), 317 (comment). No query of leads.do_not_call, no query of dnc_list. Search: `findstr /n /i "/c:dnc" supabase\functions-live\outbound-calling\index.ts`.
  * api-gateway layer (deployed): PARTIAL. leads.do_not_call IS blocked at api-gateway/index.ts:449-451 (lead selected with do_not_call at :446). No phone-level dnc_list check anywhere in api-gateway.
  * MAIN outbound-calling: ENFORCED. leads.do_not_call at index.ts:667-679 (throw DNC_BLOCKED :678), dnc_list phone-level at :685-691 (throw DNC_BLOCKED :691); assertContactAllowed also ignores skipDncCheck at :683. Invoked at :822 (preflight) and :809 (final provider boundary).

GATE 2 - consent (consent_given / has_consent / TCPA):
  * ABSENT in BOTH outbound-calling versions. MAIN: `findstr /n /i "/c:consent" supabase\functions\outbound-calling\index.ts` -> no matches (exit 1). LIVE: multi-term findstr including "consent" -> no matches. Repo-wide: agentgrep "has_consent" -> 0 files; "consent_given" -> 0 files. Consent artifacts (consent_artifact_id, consent_text_version, approved_consent_artifacts) exist ONLY in the GHL shadow-ingest control plane (_shared/control-plane/schemas.ts:620,671-674; ghl-shadow-contract.test.ts:37-82), which is not the dial path. The final release gate does not check consent either (see gate 6). NOTE: no TCPA/consent gate exists on the api-gateway path at all.

GATE 3 - global-stop / global stop table:
  * LIVE outbound-calling: ABSENT (no contact_stop reference; findstr for contact_stop returned 0).
  * MAIN outbound-calling: ENFORCED. assertContactAllowed calls RPC evaluate_contact_stop at index.ts:653-665 (throws CONTACT_STOPPED :664 using result.scope_type); the RPC (certification/recovery-lineage-v24/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196) reads public.contact_stop_controls and matches scope_type='global' at :221 ('global' OR organization OR user OR campaign OR provider OR channel). Invoked :809 and :822.
  * api-gateway layer: ABSENT (no contact_stop global-stop check).

GATE 4 - calling-hours / quiet-hours (timezone):
  * LIVE outbound-calling: ENFORCED but WEAK. index.ts:324-358: only when !isTestCall && campaignId; timezone = campaign.timezone || 'America/New_York' (:332, NOT lead-local); HH:MM string compare (:338, returns OUTSIDE_CALLING_HOURS :348); catch is non-fatal (:356 'non-fatal' -> fail OPEN).
  * MAIN outbound-calling: ENFORCED, fail-closed. assertCallingHoursAllowed :765-790 requires configured campaign hours (:770-771) AND lead-local timezone (:773-774), uses certifiedOutboundCallingWindow, throws OUTSIDE_CALLING_HOURS (:788); invoked at :810. A second campaign-level guard :830-880 fails the call with OUTSIDE_CALLING_HOURS (:869) and throws CALLING_HOURS_SAFETY_UNAVAILABLE on any internal error (:878).
  * api-gateway layer: ABSENT.

GATE 5 - credit / balance:
  * LIVE outbound-calling: ENFORCED but WEAK/fail-OPEN. index.ts:360-452: runs only if !isTestCall && !skipCreditCheck; org resolved from organization_users (:362-369); check_credit_balance with p_minutes_needed:1 (:373-377, one minute only); insufficient balance throws (:416); but ANY other error logs and CONTINUES (:449-450 'fail open for backward compatibility') and a failed reserve_credits also continues (:432-434).
  * MAIN outbound-calling: ENFORCED, fail-closed. index.ts:945-1043: skipCreditCheck ignored (:945); balance checked for the FULL certified max call exposure (billingExposureMinutes, :953); insufficient -> throw (:1003); reserve_credits (:1008-1016) must succeed (:1018-1022); any error -> throw (:1035-1041).
  * api-gateway layer: ABSENT.

GATE 6 - campaign release gate / launch lock / campaign status:
  * LIVE outbound-calling: ABSENT. `findstr /n /i "/c:campaign"` on the LIVE file shows campaignId used ONLY for calling hours (:324-337) and call_logs writes (:289,:1168) and error logs (:1212,:1246). No campaigns.status query, no campaign_leads enrollment check, no launch-lock/release gate, no campaign ownership check.
  * MAIN outbound-calling: ENFORCED. campaigns.status !== 'active' -> throw 'Campaign is not active' at :379; campaign-lead enrollment check :447-457; catalog/caller-pool policy :497-508; and the launch release gate: evaluateCampaignContactRelease (:798, imported :23) wrapped by assertCampaignContactReleased :793-805 (throws CAMPAIGN_RELEASE_NOT_AUTHORIZED), invoked :942 (after building the release input :930-941) and :811 (final boundary). The RPC evaluate_campaign_contact_release checks campaign.status='active' and cohort/identity binding (migration 20260713150000_campaign_contact_release_gate.sql:187-314).
  * api-gateway layer: PARTIAL - assertOwnedCampaign at api-gateway/index.ts:456 (ownership only, not status/release).

IMPORTANT SIDE-FINDING (MAIN only): even if MAIN were deployed, api-gateway's create_call payload would be REJECTED by MAIN. MAIN requires campaignId+leadId to be paired (:361-362) and campaign calls to carry queueId+dispatchGeneration (:364-368) and non-queue calls to carry an 8-512 char idempotencyKey (:443-445). api-gateway sends leadId with campaignId possibly null (:492-500) and never sends queueId/dispatchGeneration/idempotencyKey. So on MAIN the proxy path throws; on the deployed LIVE v600 (which has none of these requirements) it passes. The MA-deployed/LIVE distinction is decisive for what actually protects a live dial today.

**evidence**

- supabase/functions/api-gateway/index.ts:442 requireScope calls:write; :446 lead lookup incl. do_not_call; :449-451 DNC block; :456 assertOwnedCampaign; :485-501 service-role proxy to /functions/v1/outbound-calling with action create_call, userId, Bearer SERVICE_KEY
- supabase/functions-live/README.md:1-11,20,26,79-80 (functions-live = verbatim LIVE deployed snapshots; outbound-calling v600 1373 lines updated 2026-07-01; the 503 *_NOT_CERTIFIED gates exist only on GitHub main)
- MD5/line evidence via PowerShell Get-FileHash: api-gateway main==live (021A1B4F9B28B2CA8B53E0A836A06C56, 1393 lines); outbound-calling main 2245 lines FD4C627A95A93954902CA7B2F4058898 vs live 1373 lines E843137F0B25B6E5AFB1D9F4DDE8127B
- MAIN supabase/functions/outbound-calling/index.ts:220 isServiceRoleCall=token===serviceRoleKey; :227-237 userId from body; :295-305 non-Retell create_call 503 PROVIDER_EGRESS_NOT_CERTIFIED
- MAIN .../outbound-calling/index.ts:379 'Campaign is not active'; :447-457 campaign_leads enrollment; :497-508 campaign phone pool; :667-679 lead do_not_call; :685-691 dnc_list; :765-790 + :830-880 calling hours; :793-805/:926-943 campaign release gate; :945-1043 credit fail-closed
- MAIN .../outbound-calling/index.ts:653-665 evaluate_contact_stop RPC call; certification/recovery-lineage-v24/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196 fn def, :221 scope_type='global'
- certification/recovery-lineage-v24/migrations/20260713150000_campaign_contact_release_gate.sql:187 evaluate_campaign_contact_release; docs/_swarm/ALL-REPORTS.md:5273 states it checks campaign.status='active' at :266
- LIVE supabase/functions-live/outbound-calling/index.ts:170,177-187 service-role auth; :254 create_call case; :324-358 calling-hours (weak); :360-452 credit (fail-open); findstr dnc -> only :123,:124,:224,:317; findstr campaign -> only :324-337,:289,:1168,:1212,:1246
- findstr /n /i "/c:consent" supabase\functions\outbound-calling\index.ts -> exit 1 (0 matches); agentgrep has_consent -> 0 files; agentgrep consent_given -> 0 files
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:11,42,57 (live outbound-calling v600 has NO gate strings; main adds certifiedOutboundCallingWindow, retell version pinning, max-exposure balance reservation)
- docs/_swarm/risks-b1d-consent-capture.md:6 (prior node: main outbound-calling enforces evaluate_contact_stop + DNC + calling hours + evaluate_campaign_contact_release - no consent); docs/_swarm/ce-call-dispatcher-gates.md:13 (prior node: global-stop ABSENT in LIVE dispatcher/outbound-calling)

**validation**

Every gate claim is backed by a line-cited read of the actual file plus a named grep. Verified: (1) main and live outbound-calling are different files (md5 + line count, PowerShell Get-FileHash); (2) api-gateway source == live snapshot byte-for-byte; (3) positive controls (findstr found do_not_call/dnc_list/calling_hours/balance/contact_stop in MAIN) and negative controls (findstr /i 'dnc' in LIVE returns only the 4 param/comment lines; multi-term findstr incl 'consent' in LIVE returns exit 1; findstr 'campaign' in LIVE shows no status/release usage) proving the ABSENT verdicts are real absences, not search failures. Cross-checked with two independent prior swarm nodes (risks-b1d-consent-capture, ce-call-dispatcher-gates) which reach the same main-vs-live and global-stop/consent conclusions.

**open_questions**

- Has main outbound-calling EVER been deployed to the live project since 2026-07-01, i.e. is the served outbound-calling still v600 (ungated) today, 2026-11-04?
- Are the migrations that create contact_stop_controls, evaluate_contact_stop and evaluate_campaign_contact_release actually APPLIED to the live DB (emonjusymdripmkvtttc)? If not, the MAIN gates would throw CONTACT_SAFETY_UNAVAILABLE/CAMPAIGN_RELEASE_UNAVAILABLE even where they exist.
- Which api-gateway v39 build is live: does the deployed v39 include the 2026-11-01 ownership/DNC additions read here (:446-451,:456,:464-479)?
- Does the browser path (src/hooks/usePredictiveDialing.ts:691-702, AgentEditDialog.tsx:852) or call-dispatcher add gates that the api-gateway path lacks?

**what_i_did_not_check**

- Git branch/commit state: `git rev-parse/log/status` was issued but HUNG (>120s, task 940970g3qr) and was cancelled, so I did not confirm the checked-out branch/commit (evidence for deployment rests on functions-live/README.md + md5 equality).
- I did not query the live Supabase project (emonjusymdripmkvtttc) to confirm which function versions are served right now, nor whether the contact-safety migrations are applied live.
- I did not read the LIVE (functions-live) contact-safety/campaign-contact-release _shared modules' absence/presence beyond confirming the strings are absent from the LIVE outbound-calling file.
- I did not enumerate every other caller of outbound-calling create_call (browser usePredictiveDialing hook, AgentEditDialog test call, call-dispatcher) - only the api-gateway caller was in scope.
- I did not verify the exact body of evaluate_campaign_contact_release beyond its signature/reference and the prior-node summary that it checks campaign.status='active' at :266.

**confidence**: high