# risks-b1c-sms-optout-stop

- status: completed
- tldr: SMS STOP is parsed + flags lead do_not_call but does NOT write dnc_list (disposition-router disabled); reply path bypasses the check.

SMS opt-out/STOP audit (research only) COMPLETE. Repo C:/Users/charl/dial-smart-system.

FINDINGS (FACT, file:line):
- Parsed: twilio-sms-webhook/index.ts:14-29 (OPT_OUT_KEYWORDS) + :166-183 (analyzeSmsForDisposition, substring includes() at :170).
- Writes: on opt-out it sets ONLY leads.do_not_call=true + status='dnc' (:682-704) and skips the current auto-reply (:718-726). It calls disposition-router (:651-673), but disposition-router is HARD-DISABLED: isDispositionAutomationTenantCertified() returns false (:76-78) => every call returns 503 (:89-99). So its dnc_list upsert (:318-323) is dead code. Net: SMS STOP does NOT populate dnc_list.
- Outbound enforce: sms-messaging egress DOES gate on dnc_list + leads.do_not_call, but only if lead_id is passed (sms-messaging/index.ts:194-209). The webhook's own auto-reply send omits lead_id (twilio-sms-webhook:1642-1658), so the do_not_call check is bypassed; only the (never-written) dnc_list check runs.
- Webhook never re-checks an existing do_not_call before replying (lead select :640 lacks do_not_call) => an already-DNC'd lead texting "hi" still gets an AI reply.
- If no lead row exists for the phone, the whole disposition block is skipped and merely logged (:645, :727-730) => no enforcement at all.
- Voice paths DO read dnc_list (call-dispatcher :1699-1727 normalized column; evaluate_contact_stop :1731 only call-dispatcher/outbound-calling), so opt-out blocks future calls but not the SMS reply path.

VALIDATION: read-only source inspection of the 3 target files plus disposition-router, sms-boundary.ts, call-dispatcher, migration 20260712040000. No DB/network calls. Caveat: agentgrep returned false 0-matches on short tokens; all load-bearing facts confirmed by reading line ranges.

CONFIDENCE: medium. Two open items matter: (a) which function is the LIVE inbound handler (twilio-sms-webhook vs ai-sms-processor process_webhook), (b) whether disposition-router is disabled in the DEPLOYED version too. Recommend follow-up nodes for both, plus confirming dnc_list column alignment (phone_number vs phone_number_normalized) and RLS on dnc_list inserts. Follow-up also: should the SMS reply path re-check do_not_call independent of lead_id.

## Artifact

**Findings**

SMS opt-out/STOP is PARSED but only PARTIALLY ENFORCED, and the intended dnc_list write is dead code. (1) Inbound parsing: twilio-sms-webhook parses opt-out keywords in analyzeSmsForDisposition via substring match (keyword list 14-29; branch 166-183). (2) On opt-out it sets only leads.do_not_call=true and lead.status='dnc' (696-698), skips the current AI auto-reply (718-726), and calls disposition-router (651-673). (3) disposition-router, which is the ONLY SMS path that would write dnc_list, is HARD-DISABLED: isDispositionAutomationTenantCertified() returns false (disposition-router/index.ts:76-78) so every process_disposition call returns 503 with 'DISPOSITION_AUTOMATION_NOT_TENANT_CERTIFIED' (89-99). Therefore an SMS STOP does NOT add the number to dnc_list. (4) Outbound checks: sms-messaging (the actual send egress) DOES gate on dnc_list by organization_id + phone_number candidates and on leads.do_not_call IF lead_id is passed (sms-messaging/index.ts:194-209). BUT the webhook's own auto-reply call to sms-messaging omits lead_id (twilio-sms-webhook:1642-1658), so the do_not_call check is skipped on that path; only the dnc_list check runs, and since opt-out never populates dnc_list, the gate passes. (5) The webhook never re-checks an already-DNC'd lead before replying: the lead lookup selects id/notes/status/first_name/last_name only (640), and the reply block runs regardless, so a lead already marked do_not_call who texts 'hi' still receives an AI reply. (6) If no lead row exists for the inbound phone, the disposition block is skipped entirely and only logged (645 then 727-730): no do_not_call, no dnc_list, no enforcement. Net: opt-out is enforced against FUTURE automatic voice dialing (call-dispatcher reads dnc_list normalized column 1699-1727) and against SMS only when a caller happens to pass lead_id, but for the live inbound SMS reply path STOP is effectively log/lead-flag only, not an egress block.

**evidence**

- twilio-sms-webhook/index.ts:14-29 (OPT_OUT_KEYWORDS list)
- twilio-sms-webhook/index.ts:166-183 (analyzeSmsForDisposition opt-out branch: shouldAddToDnc/shouldStopAutoReply/suggestedStatus=dnc)
- twilio-sms-webhook/index.ts:170 (substring includes() match)
- twilio-sms-webhook/index.ts:645 + 727-730 (disposition processed only when lead.id exists; otherwise only logged)
- twilio-sms-webhook/index.ts:682-704 (sets leads.do_not_call=true, status dn c)
- twilio-sms-webhook/index.ts:718-726 (skip auto-reply for THIS opt-out message only)
- twilio-sms-webhook/index.ts:1642-1658 (auto-reply send_sms call omits lead_id)
- sms-messaging/index.ts:194-209 (egress DNC gate: dnc_list phone_number candidates + lead.do_not_call if lead_id)
- disposition-router/index.ts:76-78 (isDispositionAutomationTenantCertified returns false)
- disposition-router/index.ts:89-99 (returns 503 disabled, never reaches DNC write)
- disposition-router/index.ts:318-323 (the dead dnc_list upsert onConflict user_id,phone_number)
- disposition-router/index.ts:12-15 (DEFAULT_DNC_DISPOSITIONS incl stop/remove)
- ai-sms-processor/index.ts:206-220 (inbound dnc_list check org + exact phone_number)
- ai-sms-processor/index.ts:483-496 (send gate on lead.do_not_call)
- call-dispatcher/index.ts:1699-1727 (reads dnc_list.phone_number_normalized, hard stop)
- call-dispatcher/index.ts:1731 / outbound-calling/index.ts:653 (evaluate_contact_stop RPC used only on VOICE paths)

**validation**

Read-only source inspection (agentgrep + read) of twilio-sms-webhook/index.ts, sms-messaging/index.ts, sms-messaging/sms-boundary.ts, disposition-router/index.ts, ai-sms-processor/index.ts, call-dispatcher/index.ts, and migration 20260712040000_sms_delivery_safety.sql. No code executed, no DB or network calls. Note: agentgrep returned false 0-match results for short tokens ('dnc','send_sms') in some files, so all load-bearing facts were confirmed by reading the actual line ranges, not by grep counts.

**open_questions**

- Which function is actually the live inbound SMS handler in production: twilio-sms-webhook (does its own inline AI) or ai-sms-processor process_webhook? Both exist with different DNC logic.
- Is disposition-router disabled only in repo source, or also in the deployed function version? If enabled in prod, opt-out WOULD write dnc_list.
- Does the sms-messaging dnc_list gate query column 'phone_number' contain the raw string that matches smsPhoneLookupVariants output, given the schema also has phone_number_normalized?
- Should the outbound SMS reply path re-check leads.do_not_call (and dnc_list) independent of lead_id being supplied?

**what_i_did_not_check**

- Live database state: whether any dnc_list rows are written by another path, whether phone_number vs phone_number_normalized is populated for SMS opt-outs, and RLS policies on dnc_list inserts.
- The deployed/active version of each edge function in Supabase (source may differ from what is live).
- Voice/DTMF opt-out path (voice-broadcast-engine dtmfAction, retell-call-webhook last10) beyond noting they write dnc_list.
- sms_boundary.test.ts assertions and other tests that might document intended opt-out behavior.
- The exact normalization mapping the webhook's dispositionName 'Do Not Call' to disposition-router's dncDispositions array (moot while router is disabled).
- The browser/action-queue callers (_shared/action-contracts.ts, ai-brain) that call send_sms with lead_id, to confirm whether they set lead_id consistently.

**confidence**: medium