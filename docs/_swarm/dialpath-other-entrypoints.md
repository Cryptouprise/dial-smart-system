# dialpath-other-entrypoints

- status: completed
- tldr: All 10 number/trunk functions are 503 certification-disabled; none is a viable day-one provisioning path.

Surveyed all 10 in-scope number/trunk edge functions. RESULT: zero viable day-one provisioning paths. All 10 fail closed with a 503 certification guard: 8 return an unconditional 503 at top of serve() before try/auth (retell-phone-management:28-36, twilio-integration:34-42, setup-inbound-calls:14-22, check-number-config:13-21, remove-trunk:14-22, setup-lady-jarvis:102-110), and 3 use a hardcoded `return false` guard fn (retell-business-verification:34-36, validate-phone-numbers:67-69, enhanced-rotation-manager:19-21). telnyx-outbound-ai:133-143 is the only partial guard (503 only for make_call) but has NO buy/import/bind-number action, so it is not a provisioning path. Guards are hard-coded (no env/DB flag can flip them); enabling requires a code change. All verify_jwt settings captured from config.toml.

## Artifact

**Findings**

SURVEY RESULT: NONE of the 10 named functions is a viable day-one number-provisioning path for a fresh org. All fail closed with a 503 certification guard before any provider logic runs. 8 of 10 return an unconditional 503 at the very top of serve() (before try/auth), and 3 use a hardcoded `return false` guard function. telnyx-outbound-ai is the only non-unconditional one but it does not buy/import/bind numbers at all (it only places calls using an already-org-owned callerId), and its make_call action is itself 503-guarded. Ranked by closeness to a usable path (all still DISABLED):

1. telnyx-outbound-ai (index.ts:133-143): 503 ONLY for action==='make_call'; other actions (e.g. health_check) proceed. verify_jwt=false (config.toml:400-401). BUT it has NO purchase/import/bind-number action - it reads an existing org-owned callerId (index.ts:186-195). Severity: NOT a provisioning path; egress disabled.
2. twilio-integration (index.ts:34-42): unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED before try. verify_jwt=true (config.toml:148-149). Body would import numbers, create/list/delete SIP trunks, add/remove phone from trunk, release numbers (interface line 11) - i.e. a full provisioning surface - but ALL dead code. Severity: DISABLED (would be the strongest path if enabled).
3. retell-phone-management (index.ts:22-36): unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED, returned before try; declared actions include purchase/import/update/delete/list_available (line 12). verify_jwt=true (config.toml:120-121). Severity: DISABLED.
4. validate-phone-numbers (index.ts:67-88): guard fn isProviderPhoneInventoryTenantCertified() returns false (line 68) -> 503. verify_jwt=true (config.toml:356-359). Comment (lines 76-77) says it can import/mutate/delete numbers across sibling company accounts. Severity: DISABLED.
5. enhanced-rotation-manager (index.ts:19-33): guard fn isEnhancedRotationTenantCertified() returns false (line 20) -> 503. verify_jwt=true (config.toml:101-104). Would mutate number pools/provider. Severity: DISABLED.
6. setup-inbound-calls (index.ts:14-22): unconditional 503 CONTROL_PLANE_NOT_CERTIFIED before try. verify_jwt=true (config.toml:257-258). Would bind inbound voice webhook onto all Twilio numbers. Severity: DISABLED.
7. setup-lady-jarvis (index.ts:102-110): unconditional 503 CONTROL_PLANE_NOT_CERTIFIED before try. verify_jwt=true (config.toml:374-375). Provisions a Retell LLM + demo number. Severity: DISABLED.
8. remove-trunk (index.ts:14-22): unconditional 503 CONTROL_PLANE_NOT_CERTIFIED before try. verify_jwt=true (config.toml:266-267). Destructive trunk/number-removal. Severity: DISABLED.
9. check-number-config (index.ts:13-21): unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED before try. verify_jwt=true (config.toml:263-264). Read-only Twilio metadata. Severity: DISABLED.
10. retell-business-verification (index.ts:34-48): guard fn isRetellBusinessVerificationCertified() returns false (line 35) -> 503. verify_jwt=true (config.toml:179-182). CNAM/branded-calling prerequisite, not a number purchase. Severity: DISABLED.

KEY MECHANISM: guards are hard-coded (literal `return false` or an unconditional `return new Response(...503...)` before the try block). There is no env var, DB flag, or org-context path that can flip them; enabling any requires a code change. This is deliberate 'launch containment' (config toolbar comments repeatedly say 'Launch-quarantined in-function').
CONCLUSION: The 10 in-scope functions contain ZERO enabled alternative day-one provisioning path. Any fresh-org provisioning must come from outside this set.

**evidence**

- retell-phone-management/index.ts:28-36 unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED
- retell-business-verification/index.ts:34-36 guard fn returns false; :43-48 503
- twilio-integration/index.ts:34-42 unconditional 503; interface line 11 lists create_sip_trunk/import_number/release_phone_number
- telnyx-outbound-ai/index.ts:133-143 make_call 503 only; no purchase/import actions; :186-195 callerId must be org-owned
- setup-inbound-calls/index.ts:14-22 unconditional 503 CONTROL_PLANE_NOT_CERTIFIED
- check-number-config/index.ts:13-21 unconditional 503 PROVIDER_ADMIN_NOT_CERTIFIED
- validate-phone-numbers/index.ts:67-69 guard returns false; :78-88 503; :76-77 comment
- remove-trunk/index.ts:14-22 unconditional 503 CONTROL_PLANE_NOT_CERTIFIED
- setup-lady-jarvis/index.ts:102-110 unconditional 503 CONTROL_PLANE_NOT_CERTIFIED
- enhanced-rotation-manager/index.ts:19-21 guard returns false; :28-33 503
- config.toml verify_jwt lines: 101-104 enhanced-rotation true; 120-121 retell-phone-management true; 148-149 twilio-integration true; 179-182 retell-business-verification true; 257-258 setup-inbound-calls true; 263-264 check-number-config true; 266-267 remove-trunk true; 356-359 validate-phone-numbers true; 374-375 setup-lady-jarvis true; 400-401 telnyx-outbound-ai false

**validation**

Read and grepped all 10 index.ts files plus config.toml with findstr/read; confirmed guard lines are at top-of-handler or literal `return false`. Cross-checked each function's verify_jwt in config.toml. Note: agentgrep returned 0 matches on these files (likely encoding/BOM); used findstr + read instead.

**open_questions**

- Which function IS the enabled day-one provisioning path for a fresh org (likely phone-number-purchasing or provider-management, out of scope here)?
- Are these functions actually deployed in the current live project, or is source-only?
- Does any control-plane registry (_shared/control-plane/registry.ts) centrally gate or re-enable these?

**edge_cases_considered**

- Guard placed before vs after auth (all before, so even a valid-JWT fresh org gets 503)
- verify_jwt=true means the endpoint is network-callable with any valid JWT, but in-function guard still blocks
- telnyx-outbound-ai partial guard (per-action) - checked and it is not a number path
- Guard fns could read a flag - verified each is a literal `return false`

**what_i_did_not_check**

- phone-number-purchasing, provider-management, telnyx-ai-assistant, retell-agent-management, provider-router.ts, _shared/control-plane/registry.ts and elite-solar-provider-readiness.ts - all related provisioning entrypoints OUTSIDE the 10 named
- Live/deployed state vs source (read source + config only, did not hit the deployed project)
- Whether a NULL/absent org context changes any guard behavior
- The full 1544-line twilio-integration body for any secondary guard beyond line 34

**confidence**: high