# scale-e-vendors-spof

- status: completed
- tldr: Retell is the sole dialing vendor, all vendor keys are global/shared, SMS carrier is sticky, 429 handling is inconsistent and the circuit breaker is unused.

SCALABILITY LANE (e) SINGLE POINTS OF FAILURE & VENDOR RATE LIMITS — complete. Critical path: Retell is the single vendor for all campaign AI dialing (outbound-calling/index.ts:1811); Telnyx outbound is deliberately disabled (call-dispatcher/index.ts:1646-1671), so a Retell hard-fail/throttle stops all dialing platform-wide. SMS carrier is sticky per number (sms-messaging/index.ts:210), no failover. carrierRouter.ts is a non-functional stub (TODO :12, empty loadProviderConfigs :78-81). All vendor keys are GLOBAL env vars (twilio.ts:85-88/118-121, telnyx.ts:48/54, RETELL_AI_API_KEY, openrouter.ts:122-123) => one shared key per vendor across all tenants = cross-tenant SPOF + rate-limit collision; per-provider api_key_reference rows exist (provider-management/index.ts:136-137) but are unwired. 429 handling is inconsistent: voice-broadcast-engine retries 3x exp backoff (:16,101,139-146), retell-reconciler retries 429/5xx (:116,156), but outbound-calling create never retries (:1861) and sms-messaging has zero retry. Dispatcher on 429 releases +10s then BREAKS the whole batch (call-dispatcher/index.ts:2030,2059-2070). Circuit-breaker/retry helpers in _shared/utils.ts:340-459 have zero call sites. resolveRouting supports health-aware failover but is used only for 'both' mode and never receives a health signal (provider-router.ts:77-80,102; call-dispatcher.ts:1630-1642). LLM layer is the one with real failover (openrouter.ts:111-172).

## Artifact

**Findings**

CRITICAL PATH: Retell is the single vendor for all campaign AI dialing. dispatcher -> outbound-calling -> Retell POST /create-phone-call (outbound-calling/index.ts:1811). Telnyx outbound is deliberately disabled (call-dispatcher/index.ts:1646-1671 marks the queue failed with TELNYX_EGRESS_NOT_CERTIFIED and continues), so 'both' mode's Telnyx half never dials. If Retell hard-fails or throttles, ALL outbound dialing stops platform-wide with no live alternate. FACT.

Retell 429 = batch halt. On 429/concurrency the create is never retried (maxRetries=1, outbound-calling/index.ts:1860-1863) and throws RATE_LIMIT; the dispatcher releases the queue row for a +10s retry and BREAKS the entire batch (call-dispatcher/index.ts:2030, 2059-2070). One Retell throttle event stalls every in-flight campaign. FACT.

SMS carrier is sticky with no failover. Provider comes only from the number row: isTelnyxNumber = phoneRecord.provider === 'telnyx' (sms-messaging/index.ts:210); then exactly one API is called (Telnyx :258-308 or Twilio :329-378). The Twilio branch also does a per-send ownership lookup against Twilio (:312-327) - an extra vendor round-trip on the send path. FACT.

No vendor call uses the circuit breaker. _shared/utils.ts:340-459 defines circuit breaker + retry + withDatabaseRetry, and api-gateway/_shared/utils.ts:254-370 duplicates them, but a grep over all supabase/functions returns only the definitions, zero call sites. Resilience primitives exist and are unwired. FACT (textual grep scope).

Per-tenant key plumbing exists but is not wired to the hot path. provider-management stores per-provider api_key_reference + config_json (provider-management/index.ts:136-137), and useMultiCarrierProvider.addProvider accepts an api_key. But every telephony/AI call reads GLOBAL env keys: TWILIO_ACCOUNT_SID/AUTH_TOKEN/API_KEY_SID/SECRET (twilio.ts:85-88,118-121), TELNYX_API_KEY/SIP_CONNECTION_ID (telnyx.ts:48,54), RETELL_AI_API_KEY, OPENROUTER/LOVABLE (openrouter.ts:122-123). One shared key per vendor across ALL tenants = cross-tenant SPOF + rate-limit collision. FACT.

carrierRouter.ts is a non-functional stub (TODOs at :12, empty loadProviderConfigs at :78-81); nothing on the dial/SMS path calls it. FACT.

Failover is half-built for 'both' mode only. _shared/provider-router.ts:102 resolveRouting implements health-aware fallback + attempt-parity alternation, but it is only consulted for provider==='both' (call-dispatcher/index.ts:1630-1642) and health is never supplied, so isHealthy() always returns true (provider-router.ts:77-80) and the ProviderHealth hook is inert. Explicit retell/telnyx campaigns deliberately do NOT cross-fall-back (:1622-1628). FACT.

LLM brain is the ONE layer with real failover: free -> paid on OpenRouter, then Lovable gateway (openrouter.ts:111-172; RETRYABLE_STATUSES={429,503} at :57). This is the pattern telephony lacks. FACT.

429/retry is inconsistent across the platform: voice-broadcast-engine retries 3x with 1/2/4s backoff (:16,101,139-146); retell-reconciler retries 429/5xx (:116,156); but sms-messaging has ZERO retry (throws, :305-307,375-378) and outbound-calling create has ZERO retry by design (:1861). FACT.

CONCRETE FIXES: (1) Retell SPOF -> make Telnyx outbound certifiable OR add Assistable as a live hot-path fallback, and feed resolveRouting a real ProviderHealth signal so 'both' can route around a throttled Retell. (2) Batch-halt on 429 -> per-campaign pause + queue-level backoff instead of breaking the whole dispatcher loop; honor Retry-After. (3) Shared keys -> read per-org provider credentials (the api_key_reference/config_json rows already exist) in outbound-calling/sms-messaging/telnyx.ts instead of global env; rotate the leaked Telnyx key. (4) Unwired circuit breaker -> wrap every vendor fetch in withCircuitBreaker('retell'|'twilio'|'telnyx') and add bounded retry+backoff+jitter to sms-messaging and outbound-calling. (5) Retire/implement carrierRouter.ts so there is one real router.

**evidence**

- outbound-calling/index.ts:1811 (Retell POST /create-phone-call is the dial critical path)
- outbound-calling/index.ts:1860-1863 (maxRetries=1 -> create never retried)
- outbound-calling/index.ts:1843-1845,1864-1890 (5xx => AmbiguousProviderCreateError, quarantined)
- call-dispatcher/index.ts:1646-1671 (Telnyx outbound blocked: TELNYX_EGRESS_NOT_CERTIFIED)
- call-dispatcher/index.ts:2030,2059-2070 (RATE_LIMIT => release +10s then break batch)
- call-dispatcher/index.ts:1630-1642 (resolveRouting used only for 'both'; no health passed)
- _shared/provider-router.ts:77-89,102-146 (health hook exists but inert)
- src/services/carrierRouter.ts:12,78-81 (TODO stub; loadProviderConfigs empty)
- sms-messaging/index.ts:210 (isTelnyxNumber = row.provider === 'telnyx' => sticky)
- sms-messaging/index.ts:258-308 / 329-378 (single carrier called, no failover)
- sms-messaging/index.ts:312-327 (per-send Twilio ownership lookup on the send path)
- _shared/twilio.ts:85-88,118-121 (global TWILIO_* env keys)
- _shared/telnyx.ts:48,54 (global TELNYX_* env keys)
- _shared/openrouter.ts:57,111-172 (free->paid->Lovable = real LLM failover)
- voice-broadcast-engine/index.ts:16,101,139-146 (429 retry x3, 1/2/4s backoff)
- retell-reconciler/index.ts:116,156 (retry on 429/5xx)
- provider-management/index.ts:136-137 (per-provider api_key_reference stored, unwired)
- _shared/utils.ts:340-459 and api-gateway/_shared/utils.ts:254-370 (circuit breaker + retry defined, zero call sites)

**validation**

Read docs/dial-smart-app-map.md in full, then actually opened the carrier/vendor files (carrierRouter.ts, provider-router.ts, voice-provider.ts, twilio.ts, telnyx.ts, useMultiCarrierProvider.ts, enhanced-rotation-manager/index.ts, openrouter.ts) and the hot-path regions of outbound-calling (1780-1920), call-dispatcher (1600-1720, 1990-2150), sms-messaging (240-400) and voice-broadcast-engine (90-200). Ran greps for 429/retry/backoff, Deno.env.get, withCircuitBreaker/withDatabaseRetry/isCircuitOpen, api_key_reference/phone_providers, and resolveRouting across supabase/functions. No vendor API called; read-only.

**open_questions**

- Are per-tenant secrets actually set in the deployed Supabase project (function-scoped), overriding the global envs? Not visible from source.
- Is Telnyx outbound permanently off or behind a flag flip elsewhere?
- Is Assistable the de-facto Retell fallback in production or tenant-specific only?
- Are all Twilio/Telnyx numbers under one platform account (making the shared-key SPOF worse)?

**what_i_did_not_check**

- The live Supabase secret configuration (which keys are set, whether any are per-tenant).
- assistable-make-call and telnyx-outbound-ai / telnyx-ai-assistant runtime reachability.
- Actual vendor rate-limit thresholds and concurrency caps (no vendor API calls allowed).
- The retell-reconciler end-to-end flow and whether quarantined ambiguous calls ever get un-stuck.
- ai-sms-processor's own Telnyx/Twilio send paths (env use at ai-sms-processor/index.ts:569,594-595) - not read in depth.
- Migrations for any provider-credentials table (DB-level per-org secret storage).
- src/integrations (9,353 lines) beyond the supabase client.
- Whether RETELL_WEBHOOK_SIGNING_KEY is configured in prod.

**confidence**: medium