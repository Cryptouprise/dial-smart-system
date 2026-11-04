# ce-anon-shared-auth

- status: completed
- tldr: All _shared guards reject anon-key browsers; scheduler auth lives in automation-scheduler/scheduler-auth.ts, not _shared; no _shared file reads SERVICE_ROLE_KEY.

Mapped every guard in _shared (plus the scheduler helper). Every real auth gate rejects an anon-key-only browser. Key corrections: (1) the scheduler/cron authorization helper used by automation-scheduler is NOT under _shared/control-plane/ — it is automation-scheduler/scheduler-auth.ts (authorizeAutomationScheduler), which accepts only the exact service-role bearer or a distinct cron token. (2) NO file in _shared reads SUPABASE_SERVICE_ROLE_KEY at all (grep: 0 matches). (3) _shared/control-plane/*.ts and _shared/tenant-context.ts are pure/identity-consuming: they enforce policy but do not authenticate, so their security depends on the calling function first resolving a verified identity — a call passing a body-supplied userId would bypass them. (4) corsHeaders (utils.ts:11) sets ACAO '*' for importers, widening browser reach but not granting auth.

## Artifact

**Findings**

MODULE | exported_guard | verifies | anon_browser_passes | file:line | note

1. _shared/api-auth.ts | authenticateApiKey | verifies=Bearer token must begin dsk_ then SHA-256(key) row lookup in api_keys + active organization_users membership | no | api-auth.ts:82-83, 86-94, 126-128 | decisive: if (!token.startsWith("dsk_")) throw new AuthenticationError("Invalid API key format (expected dsk_live_...)"); anon JWT starts eyJ so it is rejected before any DB call.
2. _shared/api-auth.ts | requireScope | verifies=scope set carried on the already-validated ApiKeyContext | no (post-auth only) | api-auth.ts:157-175 | decisive: throw new AuthenticationError('API key missing required scope: ...'); not an entry gate.
3. _shared/utils.ts | corsHeaders (export const, NOT a guard) | verifies=nothing; emits Access-Control-Allow-Origin '*' + apikey/authorization allowed headers | n/a | utils.ts:11-15 | any importing function is browser-reachable; success still depends on that function's own guard.
4. _shared/utils.ts | authenticateUser | verifies=user JWT via a CALLER-PASSED supabase client (.auth.getUser(token)) | no | utils.ts:148-166 | decisive: throw new AuthenticationError('Invalid or expired token'); errorResponse maps AuthenticationError -> 401 (utils.ts:108-110).
5. _shared/slack-request-auth.ts | verifySlackRequestSignature | verifies=HMAC-SHA256 over v0:{ts}:{rawBody} keyed by the Slack signing secret, constant-time WebCrypto verify; ts within 300s | no | slack-request-auth.ts:161-180 | decisive: returns {ok:false, reason:"signature_mismatch"} unless HMAC verifies; rejects non v0=[0-9a-f]{64} header at L147-152. parseSlackSlashCommandForm (L353) is unattested decoding only and must run after the check.
6. _shared/teams-bot-auth.ts | verifyTeamsBotFrameworkRequest | verifies=RS256 JWT signature against a resolved public JWK, plus iss=api.botframework.com (L417), aud=microsoftAppId (L418-423), exp/nbf/clock-skew (L440-448), serviceurl binding (L459-464) | no | teams-bot-auth.ts:395, 417-423, 473, 490-499 | decisive: if (header.alg !== "RS256") fail("invalid_alg"); if (!validSignature) fail("invalid_signature"). Anon key is HS256, so it fails at the alg check. Key lookup is a caller-injected resolver (L107), no network fetch here.
7. _shared/ghl-webhook-signature.ts | verifyHighLevelWebhookSignature | verifies=Ed25519 signature over the exact raw body, authoritative when X-GHL-Signature present; legacy RSA-SHA256 only when Ed25519 header absent | no | ghl-webhook-signature.ts:143-166, 193 | decisive: presence of X-GHL-Signature forbids fallback; returns {valid:false, reason:"signature_mismatch"} or, with no header, {valid:false, reason:"missing_signature"}. Trust root pinned by SPKI SHA-256 (L20-21, L89-92).
8. _shared/stripe-signature.ts | verifyStripeSignature | verifies=HMAC-SHA256 over {t}.{payload} keyed by the Stripe webhook secret, constant-time (constantTimeEqualBytes L19-29), ts within +300s/-60s | no | stripe-signature.ts:59-61, 64-88 | decisive: returns false on absent secret/header, stale ts, or non-matching HMAC; matched flips true only on constant-time match (L85).
9. _shared/twilio-signature.ts | verifyTwilioSignature | verifies=HMAC-SHA1 over full_url + sorted POST params keyed by TWILIO_AUTH_TOKEN, base64, constant-time | no | twilio-signature.ts:32, 40-53 | decisive: if (!input.url || !input.signature || !input.authToken) return false; then constant-time HMAC-SHA1 compare (L53). formParams (L60) only parses for the caller after verification.
10. _shared/tenant-context.ts | requireExplicitOrganizationId | verifies=value is a canonical UUID (UUID_PATTERN L8-9) | n/a | tenant-context.ts:16-22 | decisive: throw new Error('A valid explicit organizationId is required'). Pure; not an authentication gate.
11. _shared/tenant-context.ts | assertOrganizationMembership | verifies=requested org is a member of the caller-PROVIDED membership id list | no | tenant-context.ts:24-38 | decisive: if (!memberships.has(requested)) throw new Error('The authenticated user is not a member of the requested organization'); an empty supplied list always throws. DEPENDS ON CALLER: it trusts membershipOrganizationIds, does not fetch it.
12. _shared/tenant-context.ts | authorizeOrganizationContext | verifies=DB lookup: organization_users row for (userId, requestedOrg) exists | no | tenant-context.ts:66-83 | decisive: if (error) throw ...; then assertOrganizationMembership with [data.organization_id] or []. userId is a CALLER-SUPPLIED parameter; this function does not authenticate the caller.
13. _shared/tenant-context.ts | assertTenantResourceOwnership | verifies=each resource has a certified organization_id equal to target and matching user_id | n/a | tenant-context.ts:44-63 | decisive: throws when !resource.organization_id ('has no certified organization ownership') and on mismatch.
14. _shared/control-plane/authorization.ts | authorizeCommand | verifies=context.profile in CONTROL_PROFILES, context.role in ORGANIZATION_ROLES, ROLE_RANK[role] >= definition.minimum_role, and all required_scopes via scopeGrants | no (only if context untrusted) | authorization.ts:68-79, 90-101, 103-111 | decisive: if (ROLE_RANK[context.role] < ROLE_RANK[definition.minimum_role]) throw ... "ROLE_FORBIDDEN"; and "SCOPE_FORBIDDEN". PURE: makes no decision about who the caller is; a caller building context from unverified input would let an anon browser through.
15. _shared/control-plane/authorization.ts | createObserverResult | verifies=command_id is a canonical lowercase UUID and command is risk R0 + observer_allowed | n/a | authorization.ts:116-144 | decisive: throw ... "OBSERVER_RESULT_BLOCKED", "Observer results may be created for R0 commands only".
16. _shared/control-plane/observer-runtime.ts | resolveZapierIdentity / resolveMcpIdentity (internal resolveApiKeyObserverCredential) | verifies=credential matches ^dsk_live_[A-Za-z0-9]{32}$, SHA-256(key) row in api_keys not revoked/unexpired, tenant binding, and LIVE organization_users role in {owner,admin} | no | observer-runtime.ts:850, 862-878, 840-842 | decisive: if (!/^dsk_live_[A-Za-z0-9]{32}$/.test(credential)) return null; and throw new ObserverRuntimeError("LIVE_ADMIN_REQUIRED").
17. _shared/control-plane/observer-runtime.ts | submitSlackCommand / submitTeamsCommand / submitZapierCommand / submitMcpCommand | verifies=external identity resolved from external_control_installations + external_control_principals rows (DB) + live admin/owner role, then authorizeCommand(profile:observer) | no | observer-runtime.ts:926-939, 1088-1131, 1153-1200 | decisive: loadInstallation -> expectSingle(result, "INSTALLATION_NOT_ACTIVE") (L807-811) and loadObserverRole -> OBSERVER_ROLES check (L840-842); needs pre-provisioned non-active installation rows a browser cannot create.
18. automation-scheduler/scheduler-auth.ts (OUTSIDE _shared) | authorizeAutomationScheduler | verifies=Authorization Bearer constant-time-equals the SUPABASE service-role key, OR a distinct configured cron token constant-time-equals the supplied one | no | scheduler-auth.ts:27-52 | decisive: if (input.serviceRoleKey && bearer && constantTimeEqual(bearer, input.serviceRoleKey)) return { authorized: true, mechanism: "service_role" } else return { authorized: false, mechanism: "none" }. This helper is in the automation-scheduler folder, NOT in _shared/control-plane/.
19. _shared/credit-purchase-policy.ts | assertServiceControlledCreditAction / assertBillingSettingsController | verifies=isServiceRole boolean SUPPLIED BY THE CALLER; second also accepts owner/admin membership role | no | credit-purchase-policy.ts:133-155 | decisive: if (!isServiceRole) throw new CreditAuthorizationError('Forbidden: ... requires the platform service role'). Throws a domain error, not a 401/403 Response. Caller computes isServiceRole (credit-management/index.ts:111: const isServiceRole = token === supabaseServiceKey). _shared never reads SUPABASE_SERVICE_ROLE_KEY.

NEGATIVE FINDING: no file under _shared reads SUPABASE_SERVICE_ROLE_KEY (grep literal = 0 matches in _shared). The in-function guards that do `token === serviceRoleKey` and return 401/403 live in the edge function index.ts files (ai-sms-processor/index.ts:167, credit-management/index.ts:111, ai-brain/index.ts, analyze-call-transcript/index.ts:197, automation-scheduler/index.ts:41-61, etc.), not in _shared.

SCHEDULER/CRON CORRECTION: the authorization helper used by automation-scheduler is NOT under _shared/control-plane/ (which holds only authorization.ts, canonical-json.ts, observer-executor.ts, observer-runtime.ts, registry.ts, schemas.ts, types.ts + 2 test files). It is automation-scheduler/scheduler-auth.ts:authorizeAutomationScheduler, accepting only the exact service-role bearer or a distinct cron token, both compared constant-time.

**evidence**

- _shared/api-auth.ts:82-83, 86-94, 126-128 (dsk_ prefix + hash lookup + membership)
- _shared/utils.ts:11-15 (corsHeaders ACAO '*'), 108-110 (AuthenticationError->401), 148-166 (authenticateUser)
- _shared/slack-request-auth.ts:147-152, 161-180 (v0=[0-9a-f]{64}, HMAC verify -> signature_mismatch)
- _shared/teams-bot-auth.ts:395 (invalid_alg), 417-423 (iss/aud), 490-499 (RS256 verify)
- _shared/ghl-webhook-signature.ts:143-166, 193 (Ed25519 authoritative, missing_signature)
- _shared/stripe-signature.ts:19-29, 59-61, 64-88 (HMAC-SHA256 constant-time)
- _shared/twilio-signature.ts:32, 40-53 (HMAC-SHA1 constant-time)
- _shared/tenant-context.ts:16-22, 24-38, 44-63, 66-83
- _shared/control-plane/authorization.ts:62-113, 116-144
- _shared/control-plane/observer-runtime.ts:840-842, 850, 862-878, 807-811, 926-939
- _shared/credit-purchase-policy.ts:133-155
- automation-scheduler/scheduler-auth.ts:27-52
- grep SUPABASE_SERVICE_ROLE_KEY in _shared = 0 matches (agentgrep)
- control-plane file list: authorization.ts, canonical-json.ts, control-plane-contract.test.ts, observer-executor.ts, observer-executor.test.ts, observer-runtime.ts, observer-runtime.test.ts, registry.ts, schemas.ts, types.ts

**validation**

Read all 7 named _shared modules plus all files in _shared/control-plane/ (authorization.ts, canonical-json.ts, observer-executor.ts, observer-runtime.ts, registry.ts, schemas.ts, types.ts + 2 test files) and automation-scheduler/scheduler-auth.ts. Ran agentgrep for the literal SUPABASE_SERVICE_ROLE_KEY within _shared (0 matches) and for CRON_SECRET|SCHEDULER_SECRET|x-cron|service_role|Bearer|timingSafe across functions. Every anon verdict is anchored to the exact rejecting comparison, quoted with file:line.

**open_questions**

- Which edge functions call tenant-context.authorizeOrganizationContext / assertOrganizationMembership or control-plane authorizeCommand, and do they derive userId from a verified JWT (utils.authenticateUser or token===serviceRoleKey) or from the request body? A body-supplied userId would make those pure guards anon-passable.
- Do the edge functions importing _shared/utils.ts apply a guard (authenticateApiKey/authenticateUser/signature verify) on EVERY path, including the OPTIONS preflight branch that returns corsHeaders?
- Is verify_jwt disabled on any of these functions at the Supabase gateway level (config.toml), given the anon key is itself a valid JWT and would otherwise pass the platform gate?

**edge_cases_considered**

- requireScope is pure scope math but only reached after authenticateApiKey, so it cannot be the first reached gate.
- verifyTeamsBotFrameworkRequest takes a caller-injected resolvePublicJwk, so it does not itself fetch OpenID metadata; an anon key fails at the alg check before key lookup.
- ghl-webhook-signature precedence is by header PRESENCE not truthiness (L141-143), so a present-but-invalid X-GHL-Signature cannot downgrade to a valid legacy RSA signature.
- authorizeCommand and tenant-context guards enforce policy on context/parameters supplied by the caller; they are not authentication and would pass an anon browser if a caller fed them a body-supplied userId/role.
- credit-purchase-policy guards take isServiceRole as a parameter; the env read lives in the caller.

**what_i_did_not_check**

- The 40+ non-_shared edge function index.ts files that read SUPABASE_SERVICE_ROLE_KEY and perform token===serviceRoleKey 401/403 checks (ai-sms-processor, credit-management, ai-brain, analyze-call-transcript, automation-scheduler/index.ts) — grep locations confirmed but each rejecting branch not read.
- supabase/config.toml per-function verify_jwt settings (whether the platform gate is on/off).
- behavior of parseWireCommandRequest / parseBoundedJsonObject in depth (validated at a glance; they are parsers, not credential gates).
- the Slack/Teams/GHL/Stripe/Twilio HTTP adapter functions that invoke these verifiers (I assessed the verifiers, not whether every adapter calls them on every path).
- whether any importing function omits the guard on its OPTIONS/preflight branch.

**confidence**: high