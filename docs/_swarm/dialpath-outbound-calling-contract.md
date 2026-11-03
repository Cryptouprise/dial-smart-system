# dialpath-outbound-calling-contract

- status: completed
- tldr: outbound-calling create_call contract mapped: callers, callerId binding, retell/telnyx/twilio dispatch, fresh-account death points; api-gateway proxy defect found.

Mapped the outbound-calling create_call contract end to end (repo C:/Users/charl/dial-smart-system). Callers, upstream callerId selection, provider-resource binding requirement, retell/telnyx/twilio dispatch, and fresh-account death points identified with file:line. Key new finding: api-gateway's create_call proxy omits idempotencyKey/queueId, so it can never pass outbound-calling's non-queue guard (index.ts:442-445) or campaign guard (364). Telnyx create_call is hard-disabled (295-305); Twilio is absent from this function.

## Artifact

**Findings**

CALLERS: call-dispatcher/index.ts:1955 (service-role; callerId=rotation-selected number :1928-1929); api-gateway/index.ts:485 (service-role proxy; callerId resolved :470-478); workflow-executor/index.ts:1468 (service-role; callerId via resolveWorkflowNumber :1456/:175-211); retell-force-webhook/index.ts:134 make_test_call; src/components/AgentEditDialog.tsx:850 browser JWT; ai-autonomous-engine/index.ts:752 via buildOutboundCallRequest; quick-test-call disabled. || AUTH: service-role detected by exact token===SERVICE_ROLE_KEY (:220) and requires body.userId (:230-236); else JWT getUser (:240-257). MISSING_CALLER_ID 400 when phoneNumber OR callerId absent (:332-341). || PROVIDER: default retell (:283); create_call + provider!=='retell' hard-disabled 503 PROVIDER_EGRESS_NOT_CERTIFIED (:295-305); Telnyx dispatch code exists (:1049-1406) but unreachable for create_call in launch profile. || CALLER-ID BINDING: callerId must match phone_numbers row owned by user+org (:460-467), status active (:469-471), canonical E.164 (:473-475), rotation_enabled===true (:476-478), not spam/quarantined (:479-484); retell requires retell_phone_id non-null (:490-492); telnyx requires provider='telnyx' (:493-495); campaign pool membership if pool exists (:497-508). || RETELL DOUBLE BINDING: with retell_phone_id set, path still does LIVE GET api.retellai.com/get-phone-number/{E.164} (:1422); 404 dies at :1427-1450 ('not registered in Retell AI', :1445). Live check keys on E.164 number, not retell_phone_id. || TELNYX/TWILIO: telnyx from-number must be provider='telnyx' (:493-495) but disabled earlier (:295-305); Twilio has ZERO refs in outbound-calling (grep=0); quick-test-call disabled; twilio_sid only in integrity migration 20260713072000. || FRESH-ACCOUNT DEATH: campaign dial dies BEFORE outbound-calling in call-dispatcher/index.ts:1914-1926 (no active rotation retell_phone_id number; pool query :1170-1177). Direct/UI/API with no callerId dies at outbound-calling/index.ts:332-341. Local row lacking retell_phone_id dies :490-492. retell_phone_id set but not imported in Retell dies :1445. || HIGH: api-gateway create_call proxy can never succeed - body (:491-501) sends no idempotencyKey/queueId/dispatchGeneration, so campaignId=null trips non-queue guard (:442-445) and campaignId set trips dispatcher guard (:364-368). || MEDIUM: rotation_enabled inconsistency - outbound-calling requires true unconditionally (:476-478) while dispatcher Telnyx fallback (:1217-1222) and resolveWorkflowNumber (:182-195) accept non-rotation numbers. || LOW: non-campaign calls restricted to active company-owned destinations (:532-546); skipDncCheck/skipCreditCheck explicitly ignored (:683,:945).

**evidence**

- outbound-calling/index.ts:220,230-236,283,295-305,332-341,364-368,442-445,460-508,532-546,683,945,1049-1406,1422,1445,1811-1835
- call-dispatcher/index.ts:1170-1177,1217-1222,1644-1658,1846-1868,1914-1926,1939-1961
- api-gateway/index.ts:470-512
- workflow-executor/index.ts:175-211,1451-1481
- retell-force-webhook/index.ts:123-150
- quick-test-call/index.ts:13-25
- src/components/AgentEditDialog.tsx:850-859
- _shared/action-contracts.ts:70-106
- migrations/20260713072000_provider_resource_ownership_boundary.sql:40-56,108-118,136-204

**validation**

Static read of full 2090-line function plus every in-repo caller and phone_numbers ownership migration. No live API calls or execution.

**open_questions**

- Is api-gateway create_call route actually wired to a live client or dead code?
- Does any client pass idempotencyKey to api-gateway out-of-band?
- Is retell-force-webhook make_test_call gated to certified admins?
- Does both-mode routing ever pick telnyx for create_call given it is disabled at the edge?

**what_i_did_not_check**

- Live production phone_numbers rows (retell_phone_id present vs bound).
- Retell dashboard import state beyond the code's live GET check.
- telnyx-outbound-ai internals (separate egress).
- assistable provider path (no branch in outbound-calling).
- Whether buildRetellCreatePhoneCallPayload asserts provider ownership beyond from-number.
- resolveRouting unit tests / both-mode runtime behavior.

**confidence**: high