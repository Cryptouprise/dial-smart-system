# risks-b1a-dispatch-stop-enforcement

- status: completed
- tldr: DNC/contact-stop IS enforced: outbound-calling gates every provider create via enforceFinalBoundary; call-dispatcher double-checks; predictive/voice-broadcast disabled.

risks-b1a-dispatch-stop-enforcement DONE. Contact-stop/DNC IS enforced at the server dispatch boundary before physical egress. (1) ENFORCED: real gate lives in outbound-calling/index.ts: assertContactAllowed (652-693) calls RPC evaluate_contact_stop + re-reads leads.do_not_call + re-queries dnc_list, all fail-closed, and enforceFinalBoundary() (807-819) is invoked immediately before EVERY provider create (Telnyx direct 1269->1271, TeXML fallback 1306->1308, Retell 1808->1811). skipDncCheck ignored at boundary (683). (2) ENFORCED (defense in depth): call-dispatcher does early dnc_list hard-stop (1699-1727) + evaluate_contact_stop (1731-1750), fail-closed, before invoking outbound-calling (1955); filters do_not_call at 465-469/646/1031-1034. (3) evaluate_contact_stop is a real SECURITY DEFINER over contact_stop_controls, service_role-only (migration 20260712020000:196-257,694-712); dnc_list.phone_number_normalized is trigger-maintained and format-consistent (+1XXXXXXXXXX) with both lookup sites. (4) predictive-dialing-engine and voice-broadcast-engine place NO calls (both disabled -> 503; only queue/disposition code), so not bypasses. NOTE/cosmetic: contact_stop_controls has no application writer in the repo (migrations only), so that lever is real but SQL/org-admin-operated; dnc_list + do_not_call are the active gates. Confidence: medium. Follow-ups: other egress functions (voice-call, twilio-voice-call, telnyx-outbound-ai, assistable-make-call, quick-test-call, demo-call, voice-broadcast-queue) NOT audited for the same gate; live DB migration state not verified.

## Artifact

**Findings**

ENFORCED (real gate): physical egress is in outbound-calling/index.ts. assertContactAllowed(boundary) (652-693) calls RPC evaluate_contact_stop (653-665, fail-closed), re-reads leads.do_not_call (667-679), and re-queries dnc_list on phone_number_normalized (684-691); skipDncCheck is ignored at the boundary (683). ENFORCED: enforceFinalBoundary (807-819) runs immediately before EVERY provider create: Telnyx direct (call 1269/create 1271), Telnyx TeXML fallback (1306/1308), Retell create-phone-call (1808/1811). No create is reachable without passing it. ENFORCED (defense in depth): call-dispatcher does an early dnc_list hard-stop (1699-1727) and evaluate_contact_stop (1731-1750), both fail-closed, before invoking outbound-calling (1955); also filters do_not_call at queue build (1031-1034) and force-dispatch (465-469,646). ENFORCED (SQL): evaluate_contact_stop is SECURITY DEFINER over contact_stop_controls with expiry + scope priority (migration 20260712020000:196-257), executable only by service_role (694-712). ENFORCED (consistency): dnc_list.phone_number_normalized is trigger-maintained (20260712040000:31-33,88-91) via normalize_contact_phone (8-26) producing +1XXXXXXXXXX, matching both dispatcher's +1+10digits (1700) and outbound's +finalPhone (684, finalPhone always leading 1 via 354) - no normalization-mismatch bypass. DISABLED (not bypass): predictive-dialing-engine dials nothing (isPredictiveDialingTenantCertified()=false -> 503; only queues leads, no DNC check but no egress). DISABLED (not bypass): voice-broadcast-engine dials nothing (cert false -> 503; process_active/start hard-disabled; 2383-2408 is a post-call disposition handler). COSMETIC/NOTE: contact_stop_controls has NO application writer in the repo (appears only in migrations), so the stop lever is real and enforced but operable only via SQL/org-admin RLS; if empty it is a no-op and the dnc_list/do_not_call gates are the active controls.

**evidence**

- outbound-calling/index.ts:652-693 - assertContactAllowed(): evaluate_contact_stop RPC (653-665, fail-closed throw on error/empty), re-read leads.do_not_call (667-679, throw DNC_BLOCKED), re-query dnc_list on phone_number_normalized (684-691, throw DNC_BLOCKED); skipDncCheck explicitly ignored at boundary (683)
- outbound-calling/index.ts:807-819 - enforceFinalBoundary() calls assertContactAllowed('final-provider-boundary') + calling-hours + campaign release
- outbound-calling/index.ts:1269 -> create 1271 (Telnyx direct), 1306 -> create 1308 (Telnyx TeXML fallback), 1808 (inside retry loop) -> create 1811 (Retell create-phone-call): every egress preceded by enforceFinalBoundary
- call-dispatcher/index.ts:1695-1727 - DNC hard-stop vs dnc_list, fail-closed throw at 1708-1710; 1729-1750 - evaluate_contact_stop, fail-closed throw at 1738-1740; 1955 - invoke outbound-calling
- call-dispatcher/index.ts:441/465-469 (force-dispatch do_not_call gate), 646/1031-1034 (queue-build do_not_call filter)
- supabase/migrations/20260712020000_contact_safety_and_provider_idempotency.sql:196-257 evaluate_contact_stop body (scopes global/org/user/campaign/provider/channel); 694-712 REVOKE PUBLIC/anon/authenticated, GRANT EXECUTE service_role only; 583-635 provider_safety_health_check asserts contact_stop_ready + normalized_dnc_ready
- supabase/migrations/20260712040000_sms_delivery_safety.sql:8-26 normalize_contact_phone; 31-33 dnc_list.phone_number_normalized; 88-91 trigger sync_dnc_normalized_phone; 93-103 indexes
- predictive-dialing-engine/index.ts:15-17 + 24-29 (disabled 503); 155-160 status-only filter; 172-191 queue insert only (no provider create)
- voice-broadcast-engine/index.ts:636-638 + 647-657 + 690-699 (disabled); 121 retell create unreachable; 2383-2408 dnc disposition handler

**validation**

Static review of every grep hit plus surrounding region across all four in-scope functions, plus the defining migrations. Confirmed each provider-create call site (create-phone-call, /v2/ai/assistants/*/calls, /v2/texml/ai_calls) is preceded in-function by enforceFinalBoundary()->assertContactAllowed. No dynamic execution performed (research only).

**open_questions**

- Other egress functions (voice-call, twilio-voice-call, telnyx-outbound-ai, assistable-make-call, quick-test-call, demo-call) were not audited for the same contact-stop gate
- Whether contact_stop_controls ever holds rows in production, given no writer exists in the codebase
- Whether legacy dnc_list rows can have NULL organization_id, which the org-scoped lookups (organization_id = X) would fail to match

**what_i_did_not_check**

- Egress paths outside the four named functions: voice-call (partial), twilio-voice-call, telnyx-outbound-ai, assistable-make-call, quick-test-call, demo-call, voice-broadcast-queue
- Did not read the 97KB/105KB/106KB function files end-to-end; only grep-hit regions and surroundings
- Did not verify the live DB has these migrations applied (provider_safety_health_check exists to prove it but was not run)
- Did not check RLS paths that could remove a dnc_list suppression, nor any cron/cleanup deleting dnc_list rows
- Did not audit SMS/email channel suppression or the campaign_contact_release gate in depth

**confidence**: medium