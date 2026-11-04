# ce-anon-true-authC-gap-shared-tenant-context

- status: completed
- tldr: tenant-context helper fails closed and proves org server-side; only 2 of the audited 11 call it; gate-lift does NOT create cross-tenant reachability for authed users.

ce-anon-true-authC-gap-shared-tenant-context COMPLETE (confidence: high). HELPER: authorizeOrganizationContext(_shared/tenant-context.ts:66-84) sig (supabaseAdmin, userId, requestedOrganizationId)=>Promise<string>; validates explicit UUID, then verifies EXACT server-side membership via organization_users (user_id=userId AND organization_id=requested, maybeSingle), fails CLOSED on every path (missing/invalid org, non-member, DB error all throw), no first-membership fallback. Does NOT trust caller orgId as authority (it is a request proven against membership). userId is a param (helper does not read JWT); it throws plain Error with no HTTP status (callers map: voice-call/voice-token->403, others->outer 500/400). AUDITED-11: only 2 of 11 call it - retell-phone-management:67 (org from body, userId from getUser) and telnyx-ai-assistant:274 (org from body params, userId from getUser/service branch); both gates 503 precede the call. telnyx-outbound-ai uses its own equivalent fail-closed resolveExactOrganization:31-53. RISK VERDICT: NO - lifting either gate alone does NOT create cross-tenant reachability for ordinary authed users (org is server-proven and fails closed). Only residual cross-tenant path is the internal service-role branch (retell-phone-management:58-60 / telnyx-ai-assistant:253) passing an arbitrary userId, which requires the service-role secret - a pre-existing internal trust boundary, not introduced by the gate-lift. Genuine weak spots in the 11 are the ones avoiding this helper (retell-force-webhook client org:63; body-userId service paths).

## Artifact

**Findings**

HELPER: authorizeOrganizationContext (supabase/functions/_shared/tenant-context.ts:66-84). Signature: async (supabaseAdmin: any, userId: string, requestedOrganizationId: unknown) => Promise<string>; returns canonical lowercased organizationId on success. What it checks: (1) UUID-format validity of requestedOrganizationId via requireExplicitOrganizationId (:16-23, throws 'A valid explicit organizationId is required' on missing/blank/non-UUID); (2) EXACT membership via SELECT organization_id FROM organization_users WHERE user_id=userId AND organization_id=requested, .maybeSingle() (:72-77); (3) DB error -> throw (:79); (4) assertOrganizationMembership with membershipOrganizationIds = [data.organization_id] or [] (:80-83) -> throws 'The authenticated user is not a member of the requested organization' if not the member (:34-36). FAILS CLOSED: yes, on every path. No fail-open; explicitly NO fallback to first/any membership (test asserts this, tenant-context.test.ts:13-26,28-37,74-94). TRUST: it does NOT trust the caller-supplied orgId as authority; that value is a REQUEST that must be proven against server-side membership. userId is a PARAMETER, so the helper trusts whatever userId the calling function passes; it never inspects the JWT itself (no JWT binding inside the helper). ERROR/HTTP: throws a plain Error with NO HTTP status; each caller maps it (voice-call:82-86 and voice-token:69-73 -> 403 ORG_FORBIDDEN; retell-phone-management:67-71, telnyx-ai-assistant:274-278, ai-assistant:2956-2960, ghl-integration:127-131, enhanced-spam-lookup:71-75, outbound-calling:288-290, call-dispatcher:317-319 rely on the outer try -> generic 500/400). COMBO NOTE: _shared/api-auth.ts implements an EQUIVALENT live-membership re-check that is also fail-closed (api-auth.ts:109-128: key must be org-bound, then organization_users re-checked by key.user_id+key.organization_id each request) but no audited function imports it. AUDITED-11 CALLER LIST (sr__agent-config.md:9-19 defines the 11): of the 11, exactly TWO import/call authorizeOrganizationContext: (3) retell-phone-management/index.ts:67 - arg = requestedOrganizationId from client body.organizationId (interface :11, destructured :41); userId server-derived (getUser :62, or service-role branch trusting body userId :58-60); gate 503 PROVIDER_ADMIN_NOT_CERTIFIED at :28-36 BEFORE try(). (5) telnyx-ai-assistant/index.ts:274 - arg = params.organizationId ?? params.organization_id (client-supplied request, :277); userId server-derived (getUser :258, or service-role branch trusting body user_id :253); gate 503 TELNYX_ASSISTANT_MANAGEMENT_NOT_TENANT_CERTIFIED at :228-238. The other 9 of the 11 do NOT call it: telnyx-outbound-ai uses its own equivalent fail-closed resolveExactOrganization (telnyx-outbound-ai/index.ts:31-53, requires exactly 1 membership match); retell-force-webhook trusts client body organizationId (:63 -> listed weak spot); retell-agent-management/retell-llm-management/telnyx-outbound-ai service-role branches trust body userId. Repo-wide there are 9 caller files total (the 2 above plus OUTSIDE the 11: ai-assistant:2956, call-dispatcher:319, enhanced-spam-lookup:71, ghl-integration:127, outbound-calling:290, voice-call:83, voice-token:70) - all pass a server-derived userId from getUser and the client-supplied org as the REQUEST. RISK VERDICT: NO - lifting either gate does not by itself make the endpoint cross-tenant-reachable for ordinary authenticated users; the org is proven against organization_users server-side and the helper fails closed, so a forged/absent organizationId is rejected (403/thrown), never silently resolved to some other tenant. The only residual cross-tenant path is the INTERNAL service-role branch (retell-phone-management:58-60, telnyx-ai-assistant:253) where a holder of the service-role secret can pass an arbitrary userId, after which the org must still be one that victim user belongs to; that is a pre-existing internal-service trust boundary requiring the server secret, not a hole created by the gate-lift. The genuinely weak cross-tenant spots in the audited 11 are the functions that do NOT use this helper (retell-force-webhook client org :63; body-userId service paths).

**evidence**

- supabase/functions/_shared/tenant-context.ts:16-23
- supabase/functions/_shared/tenant-context.ts:24-43
- supabase/functions/_shared/tenant-context.ts:44-63
- supabase/functions/_shared/tenant-context.ts:66-84
- supabase/functions/_shared/tenant-context.test.ts:13-26,28-37,74-94
- supabase/functions/_shared/api-auth.ts:109-128
- supabase/functions/retell-phone-management/index.ts:11,28-36,41,58-71,287-293
- supabase/functions/telnyx-ai-assistant/index.ts:228-238,253,258,271-278
- supabase/functions/telnyx-outbound-ai/index.ts:31-53,103-131
- supabase/functions/ai-assistant/index.ts:2956-2960
- supabase/functions/call-dispatcher/index.ts:317-319
- supabase/functions/enhanced-spam-lookup/index.ts:71-75
- supabase/functions/ghl-integration/index.ts:127-131
- supabase/functions/outbound-calling/index.ts:288-290
- supabase/functions/voice-call/index.ts:82-86
- supabase/functions/voice-token/index.ts:69-73
- docs/_swarm/sr__agent-config.md:9-19
- docs/_swarm/sr__agent-config.md:21

**validation**

Read tenant-context.ts and api-auth.ts in full (Deno TS, 84 and 210 lines). Read tenant-context.test.ts in full and confirmed the fail-closed assertions (assertThrows on undefined/'org-a'/non-member, assertRejects on wrong org; no first-membership fallback). repo-wide agentgrep for 'authorizeOrganizationContext' returned 22 matches in 11 files (2 shared + 9 caller index.ts); read the auth+call region of all 9 callers and of telnyx-outbound-ai for comparison. Confirmed the audited-11 list and its prior verdict from docs/_swarm/sr__agent-config.md and cross-checked that only retell-phone-management and telnyx-ai-assistant among the 11 import the helper. Confirmed api-auth.ts is imported by no function (grep). No writes, no live calls (research only).

**open_questions**

- The helper trusts the userId parameter, so any caller that passes a client- or service-supplied userId (not getUser-derived) shifts the trust boundary; retell-phone-management:58-60 and telnyx-ai-assistant:253 do exactly that on the service-role branch. Is the service-role secret ever reachable by a non-server caller (e.g. embedded in a provider webhook config, which telnyx-ai-assistant's own gate comment :224-225 says it previously did)?
- Do the audited-11 functions that skip the helper (retell-business-verification, telnyx-knowledge-base, telnyx-insights, telnyx-scheduled-events) scope their DB queries by userId only, and would that be vertical (cross-user) exposure within one org after a gate-lift?
- Does any frontend caller invoke these disabled endpoints expecting a live 200 (would a gate-lift change client-visible behavior/tenant leakage in the UI)?

**what_i_did_not_check**

- Did not read the full bodies of telnyx-ai-assistant (2200+ lines) or the audited functions beyond their auth/gate/call regions, so post-auth resource handlers could still have unscoped queries I did not see.
- Did not verify against the LIVE Supabase project whether organization_users has RLS/unique constraints that would make the helper's maybeSingle membership query behave differently than the test fake (read of migration files was not done for this node).
- Did not trace the downstream resources each caller reads after deriving organizationId (e.g. call-dispatcher campaign/lead lookups, outbound-calling caller-ID and lead binding) to confirm every subsequent query is filtered by organizationId; only the helper semantics and the org-derivation call sites are in scope here.
- Did not audit the 9 non-'11' callers (ai-assistant, call-dispatcher, enhanced-spam-lookup, ghl-integration, outbound-calling, voice-call, voice-token) for post-auth resource scoping beyond the org-derivation line.
- Did not check whether requireExplicitOrganizationId's UUID_PATTERN accepts uppercase/mixed input end-to-end at the DB layer beyond the lowercasing it performs (:21).

**confidence**: high