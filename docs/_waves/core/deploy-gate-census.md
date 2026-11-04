# The 503 certification gates: keep, flip or remove

lane: deploy-gate-census  model: deepseek/deepseek-v4.1-flash  cost: $0.0065
tokens: 8609 in / 12739 out
files: supabase/functions-live/README.md, supabase/functions/_shared/tenant-context.ts

---

## 1. Census (FACT — counted from the supplied grep)

**73 occurrences, 52 distinct files.** Two species, not one:

| Species | Count | Where |
|---|---|---|
| 503-style disabled response (`error_code: '…_NOT_CERTIFIED'`) | **54** | 50 files |
| `throw new Error('…_NOT_CERTIFIED…')` invariant assertion | **19** | `_shared/retell-provider-contract.ts` (12), `_shared/call-exposure-policy.ts` (2), `outbound-calling/index.ts:890,899,903,907,914` (5) |

The README's "503 certification gate" language (README:9-10, 80) describes only the first species. The 19 thrown errors are provider-contract assertions, not gates — reversing them is out of scope of the README's claim.

**54 response gates by family:**

| Family | n | file:line |
|---|---|---|
| UNSIGNED_WEBHOOK | 3 | call-tracking-webhook:137, inbound-transfer-webhook:129, twilio-amd-webhook:35 |
| CONTROL_PLANE | 4 | clear-voice-webhooks:16, remove-trunk:17, setup-inbound-calls:17, setup-lady-jarvis:105 |
| PROVIDER_ADMIN | 6 | check-number-config:16, phone-number-purchasing:39, retell-agent-management:47, retell-llm-management:25, retell-phone-management:31, twilio-integration:37 |
| Egress / spend | 15 | ai-assistant:3007, assistable-make-call:105, demo-sms-reply:163, elevenlabs-tts:29, nudge-scheduler:40, outbound-calling:299, quick-test-call:19, telnyx-ai-assistant:285, telnyx-outbound-ai:137, telnyx-scheduled-events:94, voice-broadcast-engine:694, voice-broadcast-tts:24, workflow-executor:1746, call-dispatcher:1666, ghl-webhook-trigger:91 |
| AI feature | 7 | ai-assistant-config:203, ai-configuration-complete:341, ai-error-analyzer:55, ai-workflow-generator:18, retell-business-verification:44, backfill-call-agent-data:19, telnyx-scheduled-events:52 |
| Spam / scoring | 5 | advanced-spam-detection:33, enhanced-spam-lookup:34, scheduled-spam-check:26, spam-detection:31, reachability-scoring:25 |
| Integration sync | 5 | airtable-sync:40, calendar-integration:46, ghl-batch-callback:302, ghl-integration:79, generate-daily-report:226 |
| Workflow / automation | 3 | workflow-executor:224, test-workflow:99, call-dispatcher:417 |
| Misc | 6 | call-dispatcher:1777, system-health-monitor:128, telnyx-webhook:189, telnyx-dynamic-vars:29, retell-inbound-webhook:46, retell-cost-backfill:24 |

**Finding the census misses:** 21 files have a low-line `return false` with **no** `NOT_CERTIFIED` string — ai-brain:11, pipeline-management:11, email-sender:9, provider-management:49, retell-force-webhook:10, voice-broadcast-queue:10, telnyx-insights:45, telnyx-knowledge-base:34, validate-phone-numbers:68, yellowstone-integration:93, autonomous-prioritization:20, budget-tracker:22, campaign-health-monitor:28, enhanced-rotation-manager:20, ml-learning-engine:51, predictive-dialing-engine:16, disposition-router:77, retell-call-webhook:83, sms-messaging/sms-boundary.ts:25, ai-autonomous-engine:3458/5499. If the gate pattern is `isCertified(){return false}` + a 503 response, these are **additional gates** whose removal is not covered by deleting the 73 strings. (THEORY — I cannot see the helper bodies.)

## 2. Per-gate: what it disables, literal `return false`, class

**Literal `return false`?** In **31 of the 50** response-gate files a `return false;` sits 9–19 lines above the `NOT_CERTIFIED` response (e.g. ai-workflow-generator:9→18, ai-error-analyzer:46→55, backfill-call-agent-data:10→19, voice-broadcast-tts:10→24, workflow-executor:35→224, call-dispatcher:16/20/24→417/1666/1777). That is consistent with a literal `return false` helper with **no env toggle** (THEORY — bodies not supplied). In **18 files** (calendar-integration, call-tracking-webhook, check-number-config, clear-voice-webhooks, inbound-transfer-webhook, phone-number-purchasing, quick-test-call, remove-trunk, retell-agent-management, retell-inbound-webhook, retell-llm-management, retell-phone-management, setup-inbound-calls, setup-lady-jarvis, telnyx-dynamic-vars, telnyx-outbound-ai, twilio-amd-webhook, twilio-integration) **no `return false` appears at all** — I cannot say how those gates are implemented.

| Family | Disables | Class | Basis |
|---|---|---|---|
| UNSIGNED_WEBHOOK (3) | processing of unsigned inbound webhooks | **KEEP** | If live accepts unsigned webhooks, that is a live hole; gate is the only control. Cannot confirm live verifies signatures. |
| CONTROL_PLANE (4) | trunk / voice-webhook / inbound-call provisioning (mutates Twilio/Telnyx account state) | **KEEP**, downgrade to FLIP if `verify_jwt=true` + `authorizeOrganizationContext` present | `_shared/tenant-context.ts:66-84` exists but I cannot see it wired into these slugs |
| PROVIDER_ADMIN (6) | phone-number purchase, agent/LLM/phone mutation, Twilio account config | **KEEP**, same downgrade | same |
| Egress / spend (15) | outbound dial, SMS send, TTS spend, broadcast, webhook egress | **FLIP** | Live already performs these ungated (README:80); needs a bounded-spend test, not a blanket 503 |
| AI feature (7) | AI config assistant/completion, error analysis, workflow generation, business verification, Retell backfill | **FLIP** | internal tooling; live runs it ungated |
| Spam / scoring (5) | spam analysis, provider lookup, scheduled check, reachability scoring | **FLIP** | read/analysis surface; live runs it ungated |
| Integration sync (5) | Airtable/GHL/calendar sync, daily report | **FLIP** | live runs it ungated; needs org-scoping test |
| Workflow / automation (3) | workflow executor, workflow test, force-dispatch | **FLIP** | live runs it ungated |
| Misc (6) | provider selection, health monitor, Telnyx webhook lifecycle, dynamic vars, Retell inbound vars, cost backfill | **FLIP** | live runs it ungated |
| Thrown contract errors (19) | nothing — they fire only on a mispinned Retell agent / over-long call | **KEEP** | not 503 gates; removing them removes the only guard against a misconfigured provider |

**The decisive fact the gates do not cover:** the one documented live vulnerability is `sms-messaging` `verify_jwt=FALSE → unauthenticated get_available_numbers leak` (README:23). `sms-messaging` has **no** `NOT_CERTIFIED` gate. The gate set is not aligned with the actual live risk.

## 3. Ordered reversal plan

1. **Do not deploy `main` as-is.** Live = 0 gates (README:80); deploying main turns on 54 503s and regresses every family above.
2. **Split the census.** Leave the 19 thrown contract errors alone — they are assertions, not gates.
3. **Diff each of the 50 gated files against `supabase/functions-live/<slug>/`** (byte-exact per README:66-68). The live body is the reference behaviour the gate replaced.
4. **REMOVE the 28 blanket gates** in Egress/spend (15), Spam/scoring (5), Integration sync (5), Workflow (3) — restore the live code path verbatim.
5. **FLIP the 13 gates** in AI feature (7) and Misc (6): replace the literal `return false` with an env check defaulting to *off* (`process.env.X_CERTIFIED !== 'true'`), so main matches live and each can be armed per-function after its named test.
6. **KEEP the 13** in UNSIGNED_WEBHOOK (3), CONTROL_PLANE (4), PROVIDER_ADMIN (6) — then re-check `verify_jwt` and `authorizeOrganizationContext` wiring per slug; downgrade to FLIP where both are present.
7. **Fix the real hole first, independently:** `sms-messaging` `verify_jwt=FALSE` (README:23). No gate covers it.
8. **Sweep the 21 no-`NOT_CERTIFIED` `return false` files** (section 1) — if they are the same helper pattern, steps 4–6 must cover them too.
9. **Re-snapshot and verify** sha256 main == live per README:66-68 before declaring parity.

## 4. What I did NOT check

- Gate **bodies** — no file content beyond `tenant-context.ts` and the README was supplied; every "literal `return false`" claim is adjacency-based THEORY.
- `verify_jwt` for any of the 50 gated slugs (README gives it only for twilio-sms-webhook, sms-messaging, ai-sms-processor, pipeline-management, api-gateway).
- Whether any env toggle exists.
- The live snapshot contents — I have only README:80's claim of 0.
- Non-`.ts` files; the grep is scoped to `supabase/functions .ts`.
- The 5 functions that failed to pull (README:35-39).

**Confidence: medium** — the 73/52 census is exact from the supplied grep; the KEEP/FLIP/REMOVE split rests on error-code names and line adjacency, not on gate bodies or auth config.
