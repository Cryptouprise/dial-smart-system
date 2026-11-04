# ce-anon-true-authC-gap-killswitch-classification

- status: completed
- tldr: All 22 isXTenantCertified() helpers are literal `return false;` (constant_false, no override, no env toggle).

Node ce-anon-true-authC-gap-killswitch-classification DONE (research only). Verdict: ALL 22 isXTenantCertified() helpers return_behavior=constant_false, override_found=no. Each is a bare 2-line body `function isXTenantCertified(): boolean { return false; }` - no Deno.env, no config read, no feature flag, no alternate branch. So every audited surface is HARD-DISABLED (unconditional 503) and can only be enabled by a code edit + redeploy; there is NO live/config toggle. Guards sit after OPTIONS/CORS and before auth, so unauth requests get 503, not 401. Repo-wide search for TenantCertified (204 hits / 58 files): only non-source matches are markdown reports, two read-only assertion harnesses (scripts/lib/*-surface-audit.mjs, readFileSync + state:'hard_disabled'), and stale duplicate checkouts under Documents\Codex\...\work\*. Targeted searches for an override-assignment form and a mock-returns-true form both returned 0. Pipe table (helper | file | L | behavior | override) delivered in the node artifact for all 22.

## Artifact

**Findings**

DECISIVE VERDICT: All 22 isXTenantCertified() helpers are return_behavior=constant_false and override_found=no. Every one is a 2-line function `function isXTenantCertified(): boolean {\n  return false;\n}`. There is NO Deno.env/get, NO config read, NO feature flag, and NO alternate branch: the body is a bare literal `false`. Therefore EVERY audited surface is HARD-DISABLED (unconditional 503) and can be enabled ONLY by a code edit + redeploy - no live/config toggle exists. The in-code comments ('Launch containment: ... until ...') confirm these are INTENDED to be enabled later, but the mechanism is a code change, not a knob. The guards are universally placed AFTER the OPTIONS/CORS preflight and BEFORE caller auth, so even an unauthenticated request receives 503 (not 401).

PIPE TABLE (HELPER | file | Lstart-Lend | return_behavior | override_found):
isAiAssistantToolSurfaceTenantCertified | ai-assistant/index.ts | 2878-2880 | constant_false | no
isAutonomousEngineTenantCertified | ai-autonomous-engine/index.ts | 5498-5500 | constant_false | no
isAiBrainTenantCertified | ai-brain/index.ts | 10-12 | constant_false | no
isFallbackTranscriptAnalysisTenantCertified | analyze-call-transcript/index.ts | 144-146 | constant_false | no
isAutonomousPrioritizationTenantCertified | autonomous-prioritization/index.ts | 19-21 | constant_false | no
isProviderBudgetTrackingTenantCertified | budget-tracker/index.ts | 21-23 | constant_false | no
isCampaignHealthAutomationTenantCertified | campaign-health-monitor/index.ts | 27-29 | constant_false | no
isDispositionAutomationTenantCertified | disposition-router/index.ts | 76-78 | constant_false | no
isEmailEgressTenantCertified | email-sender/index.ts | 8-10 | constant_false | no
isEnhancedRotationTenantCertified | enhanced-rotation-manager/index.ts | 19-21 | constant_false | no
isMlLearningTenantCertified | ml-learning-engine/index.ts | 50-52 | constant_false | no
isPipelineManagementTenantCertified | pipeline-management/index.ts | 10-12 | constant_false | no
isPredictiveDialingTenantCertified | predictive-dialing-engine/index.ts | 15-17 | constant_false | no
isProviderConfigurationTenantCertified | provider-management/index.ts | 48-50 | constant_false | no
isRetellMaintenanceRouteTenantCertified | retell-force-webhook/index.ts | 9-11 | constant_false | no
isTelnyxAssistantManagementTenantCertified | telnyx-ai-assistant/index.ts | 79-81 | constant_false | no
isTelnyxInsightsTenantCertified | telnyx-insights/index.ts | 44-46 | constant_false | no
isTelnyxKnowledgeBaseTenantCertified | telnyx-knowledge-base/index.ts | 33-35 | constant_false | no
isProviderPhoneInventoryTenantCertified | validate-phone-numbers/index.ts | 67-69 | constant_false | no
isVoiceBroadcastSurfaceTenantCertified | voice-broadcast-engine/index.ts | 636-638 | constant_false | no
isVoiceBroadcastQueueTenantCertified | voice-broadcast-queue/index.ts | 9-11 | constant_false | no
isYellowstoneIntegrationTenantCertified | yellowstone-integration/index.ts | 92-94 | constant_false | no

ANSWER TO 'overridden or patched elsewhere?': NO. Repo-wide search for `TenantCertified` (204 matches, 58 files) shows the only non-source hits are (a) markdown audit reports under docs/, (b) two read-only assertion harnesses scripts/lib/{contact-egress-surface-audit,provider-administration-surface-audit}.mjs that readFileSync the source and assert the literal strings/`state:'hard_disabled'` (no runtime redefinition), and (c) stale duplicate checkouts under C:\Users\charl\Documents\Codex\...\work\{dial-smart-system,elite-solar-supervised-test,observer-control-plane,operator-command-center,pr69-merge,provider-binding-center,solar-exit-campaign-brief}\ which mirror the identical gating. Targeted searches for an override form (`TenantCertified\s*[=:]\s*(\(\)|function|async|jest|mock|vi.)`) and for mock-returns-true (`mock.*TenantCertified|TenantCertified.*(true)`) both returned 0 matches.

**evidence**

- supabase/functions/ai-assistant/index.ts:2878-2880 (helper = `function isAiAssistantToolSurfaceTenantCertified(): boolean { return false; }`); 503 AI_ASSISTANT_TOOL_SURFACE_NOT_TENANT_CERTIFIED at :2895
- supabase/functions/ai-autonomous-engine/index.ts:5498-5500; 503 at :5511-5521 (error_code :5515)
- supabase/functions/ai-brain/index.ts:10-12; 503 AI_BRAIN_NOT_TENANT_CERTIFIED at :4652-4664
- supabase/functions/analyze-call-transcript/index.ts:144-146; 503 at :156-166
- supabase/functions/autonomous-prioritization/index.ts:19-21; 503 at :29-31
- supabase/functions/budget-tracker/index.ts:21-23; 503 at :33-43
- supabase/functions/campaign-health-monitor/index.ts:27-29; 503 at :36-38
- supabase/functions/disposition-router/index.ts:76-78; 503 at :89-99
- supabase/functions/email-sender/index.ts:8-10; 503 at :21-31
- supabase/functions/enhanced-rotation-manager/index.ts:19-21; 503 at :28-30
- supabase/functions/ml-learning-engine/index.ts:50-52; 503 at :59-61
- supabase/functions/pipeline-management/index.ts:10-12; 503 at :19-21
- supabase/functions/predictive-dialing-engine/index.ts:15-17; 503 at :24-26
- supabase/functions/provider-management/index.ts:48-50; 503 at :58-63
- supabase/functions/retell-force-webhook/index.ts:9-11; 503 at :20-26
- supabase/functions/telnyx-ai-assistant/index.ts:79-81; 503 at :228-232
- supabase/functions/telnyx-insights/index.ts:44-46; 503 at :53-55
- supabase/functions/telnyx-knowledge-base/index.ts:33-35; 503 at :64-68
- supabase/functions/validate-phone-numbers/index.ts:67-69; 503 at :78-88
- supabase/functions/voice-broadcast-engine/index.ts:636-638; 503 at :647-657
- supabase/functions/voice-broadcast-queue/index.ts:9-11; 503 at :18-23
- supabase/functions/yellowstone-integration/index.ts:92-94; 503 at :101-106
- scripts/lib/contact-egress-surface-audit.mjs:4-27 (readFileSync harness; voice_broadcast_retell_twilio_telnyx required=['function isVoiceBroadcastSurfaceTenantCertified(): boolean {','return false;',...], state:'hard_disabled')
- scripts/lib/provider-administration-surface-audit.mjs:4-63 (assertion harness; provider-management/retell-force-webhook/telnyx-ai-assistant each state:'hard_disabled', disabledFunction=literal signature)
- repo-wide grep `TenantCertified`: 204 matches / 58 files; all non-source hits are docs/*.md and the two .mjs harnesses; no override/mock (regex for override form and mock-true both 0 matches)

**validation**

Read the full body of all 22 helpers directly via file reads (windows sized to cover each `function ... { return false; }` block plus the next token) - all 22 show exactly `return false;` on a single line between the braces. Cross-checked against the structural outline (agentgrep found the pattern in exactly 22 files) and against repo-wide textual searches for the name, for an override-assignment form, and for a mock-returning-true form (last two returned 0 matches). Confirmed the two .mjs scripts are read-only assertion harnesses by reading their headers. Existing swarm docs (docs/_swarm/*.md, docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md) independently assert the same false->503 behavior for the majority of these, corroborating the readings.

**open_questions**

- LIVE vs REPO PARITY: this node verifies the REPO copies are constant_false. docs/wholesale/phases/staging/p4b/REVIEW.md:57 asserts the LIVE disposition-router 'has no certification gate', and docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md tracks live-vs-main drift. The deployed artifacts may therefore differ from the repo for at least disposition-router (and possibly others). A live-deployment diff is required to confirm which surfaces are truly neutered in production vs only in the repo.
- Toggling mechanism: since no env/config gate exists, converting any surface to enabled requires a code edit + redeploy - there is no operator switch. If the intent was a launch switch, that switch does not exist and must be built.
- Adjacent gated surfaces NOT in the 22-name set (ai-sms-processor isAiSmsProcessorTenantCertified, api-gateway isApiSmsTenantCertified/EXTERNAL_API_NOT_CERTIFIED, ai-error-analyzer, phone-number-purchasing, twilio-integration PROVIDER_ADMIN_NOT_CERTIFIED, telnyx-outbound-ai, assistable-make-call, etc.) follow the same constant-false pattern per docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md but were not body-verified here.

**edge_cases_considered**

- Whether the helper could be env/feature-gated (e.g. Deno.env.get('...') === 'true'): NO - literal `false`, no env read anywhere in the body; grep TENANT_CERTIFIED/... only matches the error_code string literals and the audit harnesses, not the guard condition.
- Whether a test/mock file overrides the helper to true: NO - repo-wide search for TenantCertified returned 0 test/spec files; no jest/vi mock matches.
- Whether the guard is defined once and imported/shared: NO - each is a distinct local function in its own index.ts (name pattern `function is.*TenantCertified(): boolean` matched exactly 22 files).
- Whether the audit .mjs scripts patch behavior: NO - they import only readFileSync/resolve and assert string presence; pure static verification.
- Whether the 503 fires before or after CORS/auth: considers the guard's position (after OPTIONS preflight, before caller auth) so an unauthenticated request sees 503 not 401 - relevant to attack-surface reasoning.
- Stale duplicate source trees under Documents\Codex\...\work\*: considered and excluded as non-authoritative mirrors (identical gating, separate checkouts).

**what_i_did_not_check**

- Did NOT verify the DEPLOYED (live Supabase) copies of these functions - only the repo working tree at C:/Users/charl/dial-smart-system. Live-vs-main drift is explicitly documented for disposition-router and must be checked per-function.
- Did NOT body-read the adjacent constant-false guards outside the 22 named helpers (ai-sms-processor, api-gateway, ai-error-analyzer, twilio-integration, phone-number-purchasing, telnyx-outbound-ai, assistable-make-call, setup-lady-jarvis, retell-*-management) - their state is taken from docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md, not from direct reads.
- Did NOT analyze guard CALL SITES beyond confirming the guard name is invoked (e.g. whether any caller caches the result or bypasses the 503) - the decision point is the constant-false helper, so call-site logic cannot flip the outcome.
- Did NOT inspect git history to determine when/whether these were flipped true at any commit or in any branch other than HEAD of the working tree.
- Did NOT enumerate the exact HTTP status/body for every one of the 22 503 branches individually (spot-verified several; others rely on the outline's error_code locations).

**confidence**: high