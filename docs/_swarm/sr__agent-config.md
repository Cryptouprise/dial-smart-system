# sr::agent-config

- status: completed
- tldr: sr::agent-config done: all 11 agent/LLM/phone fns use service-role AND are hard-disabled (503); org verified server-side except 4 weak service-role/client-org paths, all gated off.

sr::agent-config DONE. Audited all 11 named functions in C:/Users/charl/dial-smart-system/supabase/functions for service-role usage, disable gates, and caller verification.

RESULT (path:keyline | uses-service-role | disabled | caller-verified | evidence):
1. retell-agent-management:61 | YES | YES unconditional 503:44-52 (PROVIDER_ADMIN_NOT_CERTIFIED) | SERVICE-ONLY-TRUST (getUser:63 but service bypass:66 + trusts body userId:71, no org) | ev:61-71
2. retell-llm-management:39 | YES | YES 503:22-30 | SERVICE-ONLY-TRUST (getUser:41, bypass:44) | ev:39-49
3. retell-phone-management:52 | YES | YES 503:28-34 | VERIFIED (authorizeOrganizationContext:67) | ev:56-71
4. retell-business-verification:61 | YES | YES isRetellBusinessVerificationCertified()=false:34-36, gate:43 | VERIFIED-JWT (getUser:71) | ev:34-71
5. telnyx-ai-assistant:242 | YES | YES isTelnyxAssistantManagementTenantCertified()=false:79, gate:228 (+test_call:281) | VERIFIED (authorizeOrganizationContext:274) | ev:242-278
6. telnyx-knowledge-base:78 | YES | YES isTelnyxKnowledgeBaseTenantCertified()=false:33, gate:64 | VERIFIED-JWT (getUser:89) | ev:33-91
7. telnyx-insights:62 | YES | YES isTelnyxInsightsTenantCertified()=false:44, gate:53 | VERIFIED-JWT (getUser:73) | ev:44-79
8. telnyx-scheduled-events:60 | YES | YES isTelnyxScheduledEventSurfaceCertified()=false:42, gate:51 | VERIFIED-JWT (getUser:79) | ev:42-81
9. telnyx-outbound-ai:91 | YES | PARTIAL make_call 503:133-143 only | VERIFIED (resolveExactOrganization:127) but service path trusts body userId:113 | ev:31-143
10. telnyx-dynamic-vars:40 | YES | YES 503:26-34 (INBOUND_DYNAMIC_VARS_NOT_CERTIFIED) | N/A-UNVERIFIED no getUser (inbound webhook) | ev:21-41
11. retell-force-webhook:35 | YES | YES isRetellMaintenanceRouteTenantCertified():9, gate:20 | UNVERIFIED-CLIENT-ORG (trusts body organizationId:63) | ev:9-142

KEY: ALL 11 use the service role AND all 11 are hard-disabled (503). Correct server-side org pattern is _shared/tenant-context.ts authorizeOrganizationContext:66-84. Weak spots (all behind 503 gates, not currently exploitable): service-role paths trusting client userId (retell-agent-management:71, retell-llm-management, telnyx-outbound-ai:113) and retell-force-webhook's client organizationId:63.

VALIDATION: read each index.ts + tenant-context.ts directly; cross-checked with regex greps for service key/createClient, TenantCertified|503|disabled, getUser|organization_id|org_id, authorizeOrganizationContext, 'organization'. Read-only, no secrets printed.
BLOCKERS: none. FOLLOW-UP: verify whether any caller still expects a live 200 from these; trace downstream RPC org re-validation.

Confidence: high.

## Artifact

**Findings**

All 11 target functions read SUPABASE_SERVICE_ROLE_KEY and createClient with it, and ALL 11 are DISABLED by a hardcoded 503 gate before any provider mutation. PER-FILE (path:keyline | uses-service-role | disabled | caller-verified | evidence): 1. retell-agent-management/index.ts:61 YES createClient:62 | YES unconditional return:44-52 (PROVIDER_ADMIN_NOT_CERTIFIED, no named helper) | SERVICE-ONLY-TRUST: auth.getUser:63 but service-role bypass token===serviceRoleKey:66 and trusts client body userId:71, no org derivation | ev:61-71. 2. retell-llm-management/index.ts:39 YES:40 | YES unconditional return:22-30 | SERVICE-ONLY-TRUST: getUser:41, service-role bypass:44, no org | ev:39-49. 3. retell-phone-management/index.ts:52 YES:54 | YES unconditional return:28-34 | VERIFIED: getUser:62 (rejects acting-as-other-user:64) + authorizeOrganizationContext:67 derives org server-side | ev:56-71. 4. retell-business-verification/index.ts:61 YES:67 | YES isRetellBusinessVerificationCertified() returns false:34-36, gate:43 | VERIFIED(JWT): getUser:71, user-scoped, no client org trust | ev:34-71. 5. telnyx-ai-assistant/index.ts:242 YES:243 | YES isTelnyxAssistantManagementTenantCertified():79 returns false, gate:228; plus test_call gate:281 | VERIFIED: getUser:258 (or service+user_id:253) + authorizeOrganizationContext:274 | ev:242-278. 6. telnyx-knowledge-base/index.ts:78 YES:79 | YES isTelnyxKnowledgeBaseTenantCertified():33 returns false, gate:64 | VERIFIED(JWT): getUser:89, user_id scoped, no client org | ev:33-91. 7. telnyx-insights/index.ts:62 YES:63 | YES isTelnyxInsightsTenantCertified():44 returns false, gate:53 | VERIFIED(JWT): getUser:73, user_id scoped, no client org | ev:44-79. 8. telnyx-scheduled-events/index.ts:60 YES:61 | YES isTelnyxScheduledEventSurfaceCertified():42 returns false, gate:51 | VERIFIED(JWT): getUser:79, user_id scoped, no client org | ev:42-81. 9. telnyx-outbound-ai/index.ts:91 YES:92 | PARTIAL: function runs but action make_call hard-disabled:133-143 (TELNYX_OUTBOUND_EGRESS_NOT_CERTIFIED), no whole-fn gate | VERIFIED: getUser:115 + resolveExactOrganization:127 (membership-scoped via organization_users, throws Requested organization is not owned by the calling user:49); service-role path trusts body.userId:113 | ev:31-143. 10. telnyx-dynamic-vars/index.ts:40 YES:41 | YES unconditional return:26-34 (INBOUND_DYNAMIC_VARS_NOT_CERTIFIED) | N/A-UNVERIFIED: no auth.getUser (inbound unauthenticated webhook by design), disabled anyway | ev:21-41. 11. retell-force-webhook/index.ts:35 YES:47 | YES isRetellMaintenanceRouteTenantCertified():9, gate:20 | UNVERIFIED-CLIENT-ORG: getUser:48 but trusts client body organizationId:63 passed through:125/:142 with only agent-ownership check:78, no membership check; disabled anyway | ev:9-142. Two shared helpers implement correct server-side org: _shared/tenant-context.ts authorizeOrganizationContext:66-84 (requires explicit orgId, verifies organization_users membership) and telnyx-outbound-ai local resolveExactOrganization:31-53. Weak spots are the machine-to-machine service-role paths that trust client-supplied userId (retell-agent-management:71, retell-llm-management, telnyx-outbound-ai:113) and retell-force-webhook client organizationId:63, all currently behind 503 gates so not exploitable.

**evidence**

- retell-agent-management/index.ts:44-71
- retell-llm-management/index.ts:22-49
- retell-phone-management/index.ts:28-71
- retell-business-verification/index.ts:34-71
- telnyx-ai-assistant/index.ts:79-121,228-278
- telnyx-knowledge-base/index.ts:33-91
- telnyx-insights/index.ts:44-79
- telnyx-scheduled-events/index.ts:42-81
- telnyx-outbound-ai/index.ts:31-143
- telnyx-dynamic-vars/index.ts:21-41
- retell-force-webhook/index.ts:9-142
- _shared/tenant-context.ts:16-84

**validation**

Read each of the 11 index.ts files (entry points, auth blocks, gate regions) plus _shared/tenant-context.ts directly via read/grep. Cross-checked with regex greps for SUPABASE_SERVICE_ROLE_KEY|createClient, TenantCertified|503|disabled, getUser|organization_id|org_id, authorizeOrganizationContext, and 'organization'. No scripts executed (research only, no secrets printed).

**open_questions**

- Does any caller invoke these disabled endpoints expecting a live 200 (integration drift), or is the frontend aware they are 503?
- Is retell-force-webhook client-supplied organizationId:63 ever validated downstream before the gate is lifted in future?

**what_i_did_not_check**

- Did not trace downstream RPCs (telnyx-outbound-ai:249/271 p_organization_id, outbound-calling) to confirm they re-validate org.
- Did not audit the many other functions outside the 11 named.
- Did not confirm whether 503 gates are edge-config enforced vs in-code (assumed in-code).
- Did not read full bodies of telnyx-ai-assistant (2197 lines) or telnyx-outbound-ai beyond auth/switch head.
- Did not check _shared/api-auth.ts or tenant-context.test.ts for extra guards these functions may import.

**confidence**: high