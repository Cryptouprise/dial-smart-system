# dialpath-ui-dayone

- status: completed
- tldr: Fresh org has no day-one from-number path: TwilioNumbersOverview load 503s at L135, PhoneNumberPurchasing purchase/import/sync locked at L99/134/171.

dialpath-ui-dayone RESULT: A brand-new org has NO day-one path to a usable from-number in the browser. Both UI affordances fail closed.

Key evidence:
- PhoneNumberPurchasing.tsx: purchase L99-102, import L134-137, sync L171-174 all early-return via browserProviderAdministrationAllowed() == hard-coded false (src/lib/launchSafety.ts:157-159); purchase also 503s server-side (phone-number-purchasing/index.ts:38-42).
- TwilioNumbersOverview.tsx: loadNumbers (L131-201) invokes twilio-integration check_a2p_status (L135-137), which returns 503 disabled unconditionally before its try (twilio-integration/index.ts:34-42), so the catch toasts 'Failed to Load Numbers' (L193-197) and the table stays empty (L1017-1019). Verify/Sync (L203-262) and configure/voice (L294-393) all hit 503 gates (validate-phone-numbers/index.ts:78-88; twilio-integration/index.ts:34-42).
- No manual entry-of-an-owned-number flow exists; NumberRotationManager 'Manual Import' (L247,402-412) only pushes already-pooled numbers into Retell AI.
- TwilioNumbersOverview has ZERO client-side launch-lock guard (inconsistent with PhoneNumberPurchasing).

Day-one blocked: TwilioNumbersOverview.tsx:135 (first load) and PhoneNumberPurchasing.tsx:99/134/171 (obtaining a number).

## Artifact

**Findings**

CRITICAL - A brand-new org has NO day-one path to a usable from-number: the only two UI affordances are purchase and import-from-Twilio, both fail closed; no manual entry-of-an-owned-number flow exists. CRITICAL - PhoneNumberPurchasing locks every provider action twice: client guard browserProviderAdministrationAllowed() is hard-coded false (launchSafety.ts:157-159), checked at handlePurchase (L99-102), handleImportSelected (L134-137), handleSyncAll (L171-174); purchase also fails server-side (503, phone-number-purchasing/index.ts:38-42). HIGH - TwilioNumbersOverview cannot even LOAD inventory: loadNumbers (L131-201) invokes check_a2p_status (L135-137) which 503s before its try (twilio-integration/index.ts:34-42), so L139 throws, catch toasts 'Failed to Load Numbers' (L193-197), table empty (L1017-1019). HIGH - Every action in TwilioNumbersOverview is dead: verifyAllNumbers/syncFromTwilio -> validate-phone-numbers 503 (L78-88); configureSelectedNumbers/configureVoiceWebhooks -> twilio-integration 503. MEDIUM - TwilioNumbersOverview has ZERO launch-lock guard, unlike PhoneNumberPurchasing. MEDIUM - PhoneNumberPurchasing discloses the lock but gives no CTA on HOW to satisfy certification. MEDIUM - empty states give no recovery path. LOW - NumberRotationManager 'Manual Import' (L247,402-412) imports pooled numbers into Retell AI, not a new from-number.

**evidence**

- TwilioNumbersOverview.tsx:131-201 and 135-137 (loadNumbers invokes twilio-integration check_a2p_status)
- twilio-integration/index.ts:34-42 (unconditional 503 disabled before try)
- PhoneNumberPurchasing.tsx:99-102,134-137,171-174 (guard calls)
- src/lib/launchSafety.ts:157-159 (browserProviderAdministrationAllowed returns false)
- validate-phone-numbers/index.ts:67-88 (503 PROVIDER_PHONE_INVENTORY_NOT_TENANT_CERTIFIED)
- phone-number-purchasing/index.ts:38-42 (503 PROVIDER_ADMIN_NOT_CERTIFIED)
- TwilioNumbersOverview.tsx:1017-1019 (empty-state)
- PhoneNumberPurchasing.tsx:240,491,570,578 (lock labels)

**validation**

Read both target files in full (TwilioNumbersOverview.tsx 1631 lines; PhoneNumberPurchasing.tsx 741), the guard src/lib/launchSafety.ts, hooks/useTwilioIntegration.ts, hooks/usePhoneNumberPurchasing.ts, and the edge-function gating prologues (twilio-integration L29-42, validate-phone-numbers L67-88, phone-number-purchasing L38-42). Cross-checked mount points via grep.

**open_questions**

- Is there any non-browser (service-role script/CLI/admin) path to add a from-number, or is the product hard-gated until certification?
- Do deployed edge functions match local 503-disabled source?
- Which Settings/provider-management surface completes the certification, and does it exist yet?

**edge_cases_considered**

- Unauthenticated org: PhoneNumberPurchasing shows Sign In alert (L209-224); TwilioNumbersOverview has no auth gate so its invoke simply errors.

**what_i_did_not_check**

- Whether local disabled edge functions match what is deployed to Supabase (no prod call made; research only).
- RLS policies on phone_numbers and fresh-org read/write.
- Other possible from-number surfaces: Settings API-keys, provider-management, retell-phone-management, retell-llm-management, useNumberSync.ts.
- Whether any env/JWT claim could make browserProviderAdministrationAllowed true (constant false client-side).
- Full edge-function bodies beyond the gating prologue.

**confidence**: high