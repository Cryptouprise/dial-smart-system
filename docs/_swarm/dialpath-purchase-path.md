# dialpath-purchase-path

- status: completed
- tldr: Seed confirmed: main's purchase fn is an unconditional pre-try 503; every caller gated; live deploy may predate gates.

Node dialpath-purchase-path COMPLETE. SEED CONFIRMED: supabase/functions/phone-number-purchasing/index.ts:36-44 returns an unconditional 503 {disabled:true, error_code:'PROVIDER_ADMIN_NOT_CERTIFIED'} before the try at line 46, so lines 46-489 (auth, twilio/telnyx/retell purchase, phone_numbers insert) are unreachable dead code. NO path on main buys a number: every caller is blocked. Browser surfaces die first at the client lock (launchSafety.ts:157 browserProviderAdministrationAllowed()==false), consumed at usePhoneNumberPurchasing.ts:21 and PhoneNumberPurchasing.tsx:99/:134/:171. Two callers bypass the client lock and die at the backend 503: MissionBriefingWizard.tsx:1091 and ai-assistant/index.ts:2625. No alternative: twilio-integration/index.ts:34-42 and retell-phone-management/index.ts:28-36 are identical unconditional 503s; telnyx-ai-assistant purchase_number gated @232. KEY RISK: this is the REPO/main state. LIVE-VS-MAIN-GATES.md:9-11 says gates landed 2026-07-13 but live (emonjusymdripmkvtttc) was last deployed 2026-07-01 = PRE-GATE, so the DEPLOYED function may still purchase. Cannot settle without reading the deployed function. Confidence HIGH for repo, MEDIUM for live reality.

## Artifact

**Findings**

RANKED FINDINGS (severity). [CRITICAL] supabase/functions/phone-number-purchasing/index.ts:36-44 return an unconditional HTTP 503 {success:false,disabled:true,error_code:'PROVIDER_ADMIN_NOT_CERTIFIED'} for every non-OPTIONS request, placed BEFORE the try at line 46. SEED CONFIRMED: lines 46-489 (auth, number_orders insert, twilio/telnyx/retell purchase, phone_numbers insert, order completion) are unreachable dead code; no method, auth state, or body can reach it. [HIGH] Every caller terminates at that 503. Browser surfaces are ALSO client-locked first: launchSafety.ts:157 browserProviderAdministrationAllowed() hard-returns false, consumed at usePhoneNumberPurchasing.ts:21 (purchaseNumbers, before the invoke at :30) and PhoneNumberPurchasing.tsx:99/:134/:171. For a browser user the FIRST death is the client guard, before any network call. [HIGH] Two callers reach the endpoint with NO client lock and still die at the backend 503: MissionBriefingWizard.tsx:1091 ('Buy' button) and ai-assistant/index.ts:2625 (buy_phone_numbers tool, service-role fetch). [HIGH] NO alternative purchase path exists on main: twilio-integration/index.ts:34-42 (unconditional 503), retell-phone-management/index.ts:28-36 (unconditional 503, kills purchase at :163 used by ai-brain/index.ts:2963), telnyx-ai-assistant/index.ts:1556 purchase_number gated @232; sms-messaging get_available_numbers @142 and check-number-config @16 (LIVE-VS-MAIN-GATES.md:24,32). [INFORMATIONAL] launchSafety.test.ts:203-210 enforces the client lock in CI, so it is intentional. [KEY OPEN RISK] The gate may not be what is deployed: LIVE-VS-MAIN-GATES.md:9-11 says gates landed 2026-07-13 (commit a8393da5) but the live project (emonjusymdripmkvtttc) was last deployed 2026-07-01, 12 days earlier, i.e. PRE-GATE. So the deployed phone-number-purchasing may still execute a real purchase even though main source is 503-dead. WHERE A FRESH ACCOUNT DIES: browser flow -> PhoneNumberPurchasing.tsx:99 client toast, returns, no network call; even if bypassed -> phone-number-purchasing/index.ts:36 backend 503; MissionBriefingWizard.tsx:1091 -> backend 503 at index.ts:36.

**evidence**

- supabase/functions/phone-number-purchasing/index.ts:31-46 (serve handler; unconditional 503 at 36-44 precedes try at 46; dead logic 46-489)
- src/lib/launchSafety.ts:157-159 (browserProviderAdministrationAllowed returns false)
- src/lib/launchSafety.ts:33-34 (PROVIDER_ADMIN_LAUNCH_LOCK_MESSAGE)
- src/hooks/usePhoneNumberPurchasing.ts:21-25 (client lock then throw) and :30 (invoke phone-number-purchasing)
- src/components/PhoneNumberPurchasing.tsx:99-102 handlePurchase lock; :133-137 handleImportSelected lock; :170-174 handleSyncAll lock
- src/components/MissionBriefingWizard.tsx:1088-1103 (ungated invoke phone-number-purchasing)
- supabase/functions/ai-assistant/index.ts:2605-2638 (buy_phone_numbers; fetch /functions/v1/phone-number-purchasing at 2625)
- supabase/functions/twilio-integration/index.ts:34-42 (unconditional 503)
- src/hooks/useTwilioIntegration.ts:57,79,110 (invoke twilio-integration list_numbers/import_number/sync_all)
- supabase/functions/retell-phone-management/index.ts:28-36 (unconditional 503); :163 case purchase
- supabase/functions/ai-brain/index.ts:2963-2970 (fetch retell-phone-management action purchase)
- docs/wholesale/audit/phase1/LIVE-VS-MAIN-GATES.md:9-11,29,35 (gate inventory, deploy-date mismatch)
- src/lib/__tests__/launchSafety.test.ts:203-210 (lock-before-invoke assertion)

**validation**

Read full source of phone-number-purchasing/index.ts (all 489 lines): the 503 is the first statement after the OPTIONS branch, before try/auth, with no conditional. Traced all in-repo call sites via grep phone-number-purchasing (29 matches/18 files; live invocations only at MissionBriefingWizard.tsx:1091, TelnyxAIManager.tsx:498, usePhoneNumberPurchasing.ts:30/90, ai-assistant/index.ts:2625). Read the client lock helper and both consuming hooks/components; read the three sibling provider functions' gate blocks and the gate-inventory audit; cross-checked the CI regression test.

**open_questions**

- Is the live deployment of phone-number-purchasing the pre-gate (2026-07-01) version (which would still purchase) or the gated main version? Requires reading the deployed function (read-only get_edge_function) or an unauthenticated probe.
- Is a frontend build containing launchSafety.ts actually deployed, or does the deployed UI predate the client lock (in which case browser flows would hit the live backend directly)?

**edge_cases_considered**

- OPTIONS preflight returns 200 before the gate (so CORS still works); all other methods hit 503.
- Authenticated vs unauthenticated: irrelevant, gate precedes auth.
- Service-role internal callers (ai-assistant) are equally blocked; the gate does not exempt the service key.

**what_i_did_not_check**

- The actual deployed/live function source for phone-number-purchasing and sibling provider functions (emonjusymdripmkvtttc) - not called, research-only constraint.
- Whether the deployed frontend bundle includes launchSafety.ts or predates it.
- Database RLS/policies on phone_numbers and number_orders (whether a direct client insert could bypass the edge function).
- TelnyxAIManager.tsx:498 'sync_telnyx' action - handler does not branch on 'sync_telnyx', so it 503s regardless; not fully traced.
- credit-management and stripe-webhook flows - these are CREDIT purchases, not phone-number purchases; assumed out of scope, not verified unrelated.
- Non-repo live-only functions (configure-sip-trunk, twilio-outbound-call, etc.) at LIVE-VS-MAIN-GATES.md:45.
- Other MCP/API surfaces (e.g. api-gateway MCP tools) that might expose a number-purchase action.

**confidence**: high