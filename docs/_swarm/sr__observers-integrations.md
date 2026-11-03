# sr::observers-integrations

- status: completed
- tldr: 9 observers/integrations: all use service role; 7 hard-locked 503; scheduler=service-only-trust; no client org_id trust.

Service-role auth audit of 9 observers/integrations complete (read-only). Result per file — path | uses-service-role | disabled | caller-verified | evidence:

1. slack-webhook/index.ts | YES (:28,:42) | YES hard-locked, no env unlock (:24 const false, :51-52 gate; handler.ts:77-87 503) | VERIFIED-path (Slack signing secret via getSigningSecret :57) but UNREACHABLE behind gate.
2. teams-observer/index.ts | YES (:29,:43) | YES (:24,:52-53; handler.ts:65-73 503) | VERIFIED-path (Teams JWK resolver) UNREACHABLE.
3. zapier-observer/index.ts | YES (:27,:41) | YES (:23,:50-51; handler.ts:119-128 503) | VERIFIED-path (resolveZapierIdentity) UNREACHABLE.
4. mcp-observer/index.ts | YES (:27,:41) | YES (:23,:50-51; handler.ts:32-33 503) | VERIFIED-path (resolveMcpIdentity) UNREACHABLE.
5. workflow-executor/index.ts | YES (:234,:1669) | YES (:34-37 cert=false; :220-230 503) | VERIFIED (getUser :268 + userId-match 403 :276) but UNREACHABLE behind gate.
6. automation-scheduler/index.ts | YES (:41) | NO (active) | SERVICE-ONLY-TRUST by design — authorizeAutomationScheduler service-role bearer OR cron token (:48-59; scheduler-auth.ts:27-52); rejects anon/user JWT (tests scheduler-auth.test.ts:23-100).
7. calendar-integration/index.ts | YES (:55,:61) | YES unconditional 503 (:43-51) before createClient | VERIFIED-path (getUser :67) UNREACHABLE; hardcoded fallback userId :1728 also unreachable.
8. yellowstone-integration/index.ts | YES (:110,:119) | YES (:92-94 false; :101-106 503) | VERIFIED (getUser :121-130 -> 401) UNREACHABLE.
9. assistable-make-call/index.ts | YES (:32,:49) | PARTIAL — 503 (:101-111) after auth, before provider call | VERIFIED with service-trust branch: token===serviceKey trusts body.user_id (:64-71), else getUser (:73-80).

Net: no function trusts client-supplied org_id/organization_id for authz. Unreachable-but-present auth in workflow-executor/calendar-integration/yellowstone is dead code while their gate returns 503.
Validation: static read-only reads + agentgrep cross-check. No live calls, no secrets printed.

## Artifact

**Findings**

All 9 target functions read SUPABASE_SERVICE_ROLE_KEY and createClient() with the service-role key. 7 of 9 are hard-locked: an unconditional disable gate returns 503 from a hardcoded `false` const/function, and the observers state no env flag can unlock them. Only automation-scheduler is not globally disabled; it authorizes callers via authorizeAutomationScheduler() (exact service-role bearer or a distinct cron token) -> SERVICE-ONLY-TRUST by design. workflow-executor, calendar-integration, yellowstone-integration and assistable-make-call verify the caller with supabase.auth.getUser(token); the first three return 503 before that code, so their verification path is currently dead code. No function trusts a client-supplied org_id/organization_id from the request body for authorization: tenant ids come from DB rows (automation-scheduler derives user/org from dialing_queues->campaigns) or the verified JWT. assistable-make-call is the one service-trust branch: when the bearer equals the service-role key it uses body.user_id unm-verified (but its paid egress is still blocked by the 503 gate). calendar-integration:1728 has a hardcoded fallback user id, unreachable behind the gate.

**evidence**

- slack-webhook/index.ts:24 const SLACK_OBSERVER_LAUNCH_CERTIFIED=false; :28+:42 service role + createClient; :51-52 gate; handler.ts:77-87 disabled 503.
- teams-observer/index.ts:24 const false; :29+:43 service role; :52-53 gate; handler.ts:65-73 disabled 503.
- zapier-observer/index.ts:23 const false; :27+:41 service role; :50-51 gate; handler.ts:119-128 disabled 503.
- mcp-observer/index.ts:23 const false; :27+:41 service role; :50-51 gate; handler.ts:32-33 disabled 503.
- workflow-executor/index.ts:34-37 isWorkflowAutomationCertified=false; :220-230 gate->503; :234 service role; :243 createClient; :257-282 getUser(token)+userId-match(403); :1669 second service-role read only Bearer-auths fetch to assistable-make-call (:1678-1683).
- automation-scheduler/index.ts:41 service role; :61 createClient; :48-59 authorizeAutomationScheduler->401; scheduler-auth.ts:27-52 authorize() accepts exact service-role bearer (constantTimeEqual) or cron token, rejects anon/user JWT; scheduler-auth.test.ts:23-100 forged/whitespace/JWT -> authorized:false.
- calendar-integration/index.ts:43-51 unconditional 503 (CALENDAR_INTEGRATION_NOT_CERTIFIED) BEFORE createClient; :55+:61 service role; :63-71 getUser unreachable; :1728 hardcoded fallback userId.
- yellowstone-integration/index.ts:92-94 isYellowstoneIntegrationTenantCertified=false; :101-106 gate->503; :110+:119 service role; :121-130 getUser->401.
- assistable-make-call/index.ts:21-23 isAssistableEgressCertified=false; :32+:49 service role; :52-81 auth (token===serviceKey trusts body.user_id :64-71, else getUser :73-80); :101-111 egress 503 AFTER auth, before provider call.

**validation**

Static read-only audit of each index.ts/handler.ts/scheduler-auth.ts, cross-checked with agentgrep for SERVICE_ROLE/createClient/503/getUser/org_id/authorize across all 9 dirs. No runtime execution (research-only). Line numbers taken from direct file reads.

**open_questions**

- Observer handlers verify identity via credential/signing secret, but the hardcoded-false launch const makes that path dead: intended permanent lock or eventual env unlock?
- Treat unreachable auth in workflow-executor/calendar-integration/yellowstone as safe-because-gated or latent risk if a gate flips true?
- Confirm every internal caller of assistable-make-call sends a legitimate body.user_id on the service-role branch.

**what_i_did_not_check**

- Full observer handler credential-resolution internals (signing-secret/Zapier/MCP key/Teams JWK checks) not line-audited
- _shared/control-plane/observer-runtime.ts not inspected
- Platform-level verify_jwt config for these functions not checked
- Remaining ~1600 lines of workflow-executor not audited beyond the two service-role sites
- The *.test.ts suites were read for expected behavior only, not executed

**confidence**: high