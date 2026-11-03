# sr::spam-inventory

- status: completed
- tldr: 10/10 spam/inventory/provider fns are service-role and disabled; only enhanced-spam-lookup verifies JWT+derives org; 4 have no caller auth at all.

DONE: Service-role auth audit of 10 spam/inventory/provider edge functions in C:/Users/charl/dial-smart-system. For each: (1) service-role usage, (2) hardcoded disable gate, (3) caller verification vs client-org trust.

RESULT (path:line | service-role | disabled | caller-verified):
1. enhanced-spam-lookup:42,48 | YES | YES (isEnhancedSpamProviderSurfaceCertified L24-26 false, 503 L33-38) | VERIFIED (getUser L67 + authorizeOrganizationContext L71-75)
2. advanced-spam-detection:43,49 | YES | YES (L10-12 false, 503 L29-39) | SERVICE-ONLY-TRUST (no auth; all-tenant read L70-91)
3. spam-detection:41,47 | YES | YES (L10-12 false, 503 L27-37) | SERVICE-ONLY-TRUST (no auth; all-tenant read L53-56)
4. reachability-scoring:35,44 | YES | YES (L9-11 false, 503 L21-31) | UNVERIFIED-CLIENT-ORG (no JWT; trusts body userId/leadId L46)
5. validate-phone-numbers:92,93 | YES | YES (L67-69 false, 503 L78-88) | VERIFIED user-scoped (getUser L104, user.id only L117)
6. provider-management:77,83 | YES | YES (L48-50 false, 503 L58-63) | VERIFIED user-scoped (getUser L87, user.id only L109/131)
7. enhanced-rotation-manager:37,43 | YES | YES (L19-21 false, 503 L28-33) | VERIFIED user-scoped (getUser L51; phone_numbers read L123-127 unfiltered)
8. phone-number-purchasing:48,57 | YES (dead) | YES (unconditional 503 block L36-44) | VERIFIED user-scoped (getUser L65, dead path)
9. scheduled-spam-check:38,44 | YES | YES (L10-12 false, 503 L22-32) | SERVICE-ONLY-TRUST cron (no auth; all-tenant quarantine release L57-66)
10. telnyx-webhook:249,255 | YES | YES (L172-174 false, 503 L185-195) | SERVICE-ONLY-TRUST (Ed25519 sig L217 + replay L229; no org binding)

VALIDATION: Static read-only of each handler's gate + auth lines; cross-checked _shared/tenant-context.ts:66-84. No execution, no live calls, no secrets printed. Confidence: high (all facts from direct reads).

BLOCKERS/FOLLOW-UPS: 9/10 use a hardcoded `return false` cert gate + 503 as the sole protection; the disabled bodies still hold cross-tenant service-role reads/writes. Only enhanced-spam-lookup derives org server-side. Did not review deep helper bodies or runtime deployment status.

## Artifact

**Findings**

Service-role auth audit of 10 spam/inventory/provider edge functions. FORMAT: path:line | uses-service-role | disabled | caller-verified | evidence. All service-role facts are FACT (read directly).

1) enhanced-spam-lookup/index.ts:42,48 | YES (env L42, createClient service key L48) | YES - isEnhancedSpamProviderSurfaceCertified() L24-26 returns false; 503 gate L33-38 (ENHANCED_SPAM_PROVIDER_SURFACE_NOT_CERTIFIED) | VERIFIED - auth.getUser L67, authorizeOrganizationContext() derives org server-side L71-75, phone ownership re-check L78-88 | evidence L24-26,33-38,42,48,67-75

2) advanced-spam-detection/index.ts:43,49 | YES (env L43, client L49) | YES - isAdvancedSpamAnalysisCertified() L10-12 false; 503 L29-39 (GLOBAL_SPAM_ANALYSIS_NOT_CERTIFIED) | SERVICE-ONLY-TRUST - NO Authorization/JWT check anywhere; checkAllNumbers L70-91 selects ALL active phone_numbers cross-tenant | evidence L10-12,29-39,43,49,70-74

3) spam-detection/index.ts:41,47 | YES | YES - isSpamDetectionCertified() L10-12 false; 503 L27-37 | SERVICE-ONLY-TRUST - no auth; L53-56 reads all active numbers across tenants; can quarantine | evidence L10-12,27-37,41,47,53-56

4) reachability-scoring/index.ts:35,44 | YES | YES - isReachabilityScoringCertified() L9-11 false; 503 L21-31 | UNVERIFIED-CLIENT-ORG - no JWT; destructures {action,leadId,userId,...} from request body L46 and uses them directly; queries .eq('user_id',userId) L81,L100 - caller supplies userId/leadId | evidence L9-11,21-31,35,44,46,81,100

5) validate-phone-numbers/index.ts:92,93 | YES | YES - isProviderPhoneInventoryTenantCertified() L67-69 false; 503 L78-88 | VERIFIED (user-scoped) - auth.getUser L104; scopes by user.id L117 (provider_credentials .eq user_id); NOT organization-derived | evidence L67-69,78-88,92,93,104,117

6) provider-management/index.ts:77,83 | YES | YES - isProviderConfigurationTenantCertified() L48-50 false; 503 L58-63 | VERIFIED (user-scoped) - auth.getUser L87; provider rows scoped .eq('user_id',user.id) L109, inserts carry user_id L131; no organization derivation | evidence L48-50,58-63,77,83,87,109,131

7) enhanced-rotation-manager/index.ts:37,43 | YES | YES - isEnhancedRotationTenantCertified() L19-21 false; 503 L28-33 | VERIFIED (user-scoped) - auth.getUser L51; rotation_settings scoped user.id L78; BUT phone_numbers read L123-127 has NO user_id/org filter (cross-tenant read) | evidence L19-21,28-33,37,43,51,78,123-127

8) phone-number-purchasing/index.ts:48,57 | NOMINAL/dead (env read L48, createClient L57 are UNREACHABLE) | YES - no named gate; unconditional 503 return block L36-44 (PROVIDER_ADMIN_NOT_CERTIFIED) precedes all logic | VERIFIED (user-scoped, dead path) - auth.getUser L65; orders insert user_id L103 | evidence L36-44,48,57,65,103

9) scheduled-spam-check/index.ts:38,44 | YES | YES - isScheduledSpamCheckCertified() L10-12 false; 503 L22-32 | SERVICE-ONLY-TRUST (cron) - no token/JWT check; invokes spam-detection L47 and bulk-updates phone_numbers status L57-66 across ALL tenants | evidence L10-12,22-32,38,44,47,57-66

10) telnyx-webhook/index.ts:249,255 | YES | YES - isTelnyxWebhookLifecycleCertified() L172-174 false; 503 L185-195 | SERVICE-ONLY-TRUST (signature-bound) - Ed25519 sig verify L217 + 300s replay window L229; NO JWT/org binding; routes events by call_sid / phone number L277-298 | evidence L172-174,185-195,217,229,249,255,277-298

SUMMARY: 9/10 gated by a hardcoded `return false` cert function + 503 (1/10 uses an unconditional 503 block instead). All 10 read SUPABASE_SERVICE_ROLE_KEY and build a service-role client. Only enhanced-spam-lookup derives organization server-side from the JWT (VERIFIED, strongest). validate-phone-numbers, provider-management, enhanced-rotation-manager, phone-number-purchasing verify the JWT but scope by user.id only (no org). reachability-scoring trusts client-supplied userId/leadId entirely. advanced-spam-detection, spam-detection, scheduled-spam-check, telnyx-webhook have no caller identity binding (service-only/signature-only). Net: the containment gates are the sole current protection; the disabled bodies still contain cross-tenant service-role reads/writes (e.g. quarantining all tenants' numbers).

**evidence**

- enhanced-spam-lookup/index.ts:24-26 (isEnhancedSpamProviderSurfaceCertified returns false)
- enhanced-spam-lookup/index.ts:33-38 (503 gate)
- enhanced-spam-lookup/index.ts:42,48 (service role)
- enhanced-spam-lookup/index.ts:67-75 (getUser + authorizeOrganizationContext)
- advanced-spam-detection/index.ts:10-12,29-39,43,49,70-74
- spam-detection/index.ts:10-12,27-37,41,47,53-56
- reachability-scoring/index.ts:9-11,21-31,35,44,46,81,100
- validate-phone-numbers/index.ts:67-69,78-88,92,93,104,117
- provider-management/index.ts:48-50,58-63,77,83,87,109,131
- enhanced-rotation-manager/index.ts:19-21,28-33,37,43,51,78,123-127
- phone-number-purchasing/index.ts:36-44,48,57,65,103
- scheduled-spam-check/index.ts:10-12,22-32,38,44,47,57-66
- telnyx-webhook/index.ts:172-174,185-195,217,229,249,255,277-298
- _shared/tenant-context.ts:66-84 (authorizeOrganizationContext resolves org from organization_users membership)

**validation**

Static read of each index.ts entry handler and its gate + auth lines; cross-checked tenant-context.ts helper. No code executed, no live calls, no secrets printed. Line numbers from direct file reads this session.

**open_questions**

- Was any of these gates previously enabled (true) in git history, and are these functions actually deployed as-is?
- Do any of the 4 SERVICE-ONLY-TRUST functions have a separate API-gateway in front that adds auth before hitting them?

**edge_cases_considered**

- A disable gate that returns false is the ONLY guard in the 4 no-auth functions; if toggled to true the cross-tenant service-role bodies activate immediately.
- phone-number-purchasing disables BEFORE any auth/env access, so its service-role block is dead code (hostile reads still nothing executed).
- enhanced-rotation-manager's phone_numbers read lacks a user filter even though the caller is authenticated.
- telnyx-webhook enforces Ed25519 signature + replay window but that binds the provider, not a company/organization.

**what_i_did_not_check**

- The deep helper bodies beyond the entry handlers (e.g. enhanced-spam-lookup syncNumbersFromTelnyx/checkAllNumbers, provider-management switch cases beyond list/add, rotation-manager remaining actions, telnyx-webhook write paths past L300) - only the gate + auth + first query of each were read.
- Runtime deployment status / whether these functions are invoked, and whether an upstream gateway enforces auth - out of scope for a static audit.
- Other functions in the repo with the same gate pattern (only the 10 named targets audited).

**confidence**: high