# int-infra

- status: completed
- tldr: int-infra: Stripe=deep (live); Supabase=platform; ElevenLabs=stub (real call gated off); Calendar=built-deep but 503-gated (Google+GHL+Cal.com)

int-infra COMPLETE. Judged Stripe/Supabase/ElevenLabs/Calendar integration depth in C:/Users/charl/dial-smart-system with file:line evidence.

Verdicts:
- Stripe = INTEGRATED-DEEPLY (live, not gated): stripe-webhook (sig verify :318, idempotency stripe_events :258-289, subscription lifecycle :525-584, add_credits RPC :382), billing-portal (:152 portal, :198 checkout), credit-management (:605 live Stripe checkout POST), migration 20260124 (:15-21 billing cols).
- Supabase = THE PLATFORM (auth, edge functions, RLS, migrations, RPCs, service-role, org tenancy).
- ElevenLabs = STUB AT RUNTIME: real TTS call at elevenlabs-tts/index.ts:58-76 but hard-disabled by isElevenLabsTtsSpendCertified()=>false (:14-16) returning 503 (:25-35). Unreachable.
- Calendar = DEEPLY-BUILT BUT LAUNCH-DISABLED: calendar-integration/index.ts:43-51 returns unconditional 503 CALENDAR_INTEGRATION_NOT_CERTIFIED before try{}, so all 3497 lines are unreachable. Actually wired to THREE providers: Google Calendar (OAuth+CRUD, :205-317, 3141), GHL/LeadConnector (appointments, :428-525, 2137), Cal.com (slots+booking for Retell, :1252-1386). outlook/calendly are declared in the hook union (:32) but NOT implemented.
- Bonus: budget-tracker is also gated off (:21-23, :33-43), tracks Twilio/Retell not Stripe.

Validation: read each target file directly; confirmed gated functions return 503 before any work and non-gated Stripe code performs live API calls. Confidence: high.

## Artifact

**Findings**

INTEGRATION DEPTH, C:/Users/charl/dial-smart-system (FACT unless marked THEORY):

ELEVENLABS = STUB AT RUNTIME (real call exists but is hard-disabled). supabase/functions/elevenlabs-tts/index.ts:14-16 isElevenLabsTtsSpendCertified() returns false; :25-35 returns 503 ELEVENLABS_TTS_SPEND_NOT_CERTIFIED before any work. The real TTS call is at :58-76 (POST https://api.elevenlabs.io/v1/text-to-speech/${voiceId}, xi-api-key header, model eleven_turbo_v2_5) but it is UNREACHABLE. So the 106-line function is a genuine API call wrapped in a closed launch gate, not a fake stub and not reachable in production.

STRIPE = INTEGRATED-DEEPLY (live, NOT gated). stripe-webhook/index.ts: signature verify _shared/stripe-signature.ts (constant-time, 5-min replay) called :318; idempotency claim via public.stripe_events INSERT + 23505 + release-on-failure :258-289; handles checkout.session.completed (payment credits via add_credits RPC :382; subscription path :347-361), payment_intent.succeeded auto-recharge :404-433, invoice.paid :436-476, invoice.payment_failed+grace window :478-523, customer.subscription.created/updated/deleted lifecycle+status mapping+plan resolution :525-584. billing-portal/index.ts: live PUTs to /billing_portal/sessions :152 and /checkout/sessions :198 with idempotency key :197. credit-management/index.ts: live POST https://api.stripe.com/v1/checkout/sessions :605; add_credits RPC :417. Migration supabase/migrations/20260124_white_label_credits.sql:15-21 adds organizations.billing_enabled/stripe_customer_id/billing_email. Companion shared module _shared/stripe-signature.test.ts exists.

CALENDAR = DEEPLY-BUILT BUT LAUNCH-DISABLED (runtime stub). supabase/functions/calendar-integration/index.ts:43-51 returns 503 CALENDAR_INTEGRATION_NOT_CERTIFIED UNCONDITIONALLY, before the try block, so all 3497 lines of handler code below are unreachable at runtime. Providers it is actually wired to: (1) GOOGLE Calendar - OAuth get_google_auth_url :205, google_callback+token exchange+calendarList :237-317, full CRUD/events :636-695, token refresh ensureFreshGoogleToken :3141, busy-times :918-960; (2) GHL / LeadConnector - sync_ghl_calendar :428-525, create appointment POST services.leadconnectorhq.com/calendars/events :751/2137, busy times :962-1019; (3) CAL.COM - test_calcom :1252-1288, calcom_get_slots :1289-1327, calcom_book_appointment :1329-1386 (Retell voice path :1393+). NO provider implementation for outlook or calendly: src/hooks/useCalendarIntegration.ts:32 declares provider union 'google'|'ghl'|'outlook'|'calendly' but only google/ghl/calcom handlers exist in the function.

SUPABASE = THE PLATFORM ITSELF (integrated-deeply; not an 'integration'). Auth (createClient + auth.getUser, e.g. credit-management/index.ts:116, calendar :67), Edge Functions runtime, service-role admin clients (:107), RLS policies + tables (migration 20260124:27-70), PL/pgSQL RPCs (add_credits/reserve_credits/finalize_call_cost/check_credit_balance/check_credit_balance used in credit-management :260-428), multi-tenant org model (organization_users, tenant-context.ts).

BONUS (asked context): budget-tracker/index.ts is also a STUB AT RUNTIME: isProviderBudgetTrackingTenantCertified()=>false :21-23 → 503 :33-43; its body tracks Twilio+Retell spend (:104+ fetchUsageFromProviders, user_credentials), not Stripe.

Frontends are real, not stubs: src/components/CreditDashboard.tsx invokes credit-management get_balance/get_transactions/get_usage via supabase.functions.invoke :119-127. FollowUpScheduler.tsx is an SMS/call follow-up scheduler (ai_sms/manual_sms/ai_call), NOT a calendar feature (calendar icon only is an Ionicons glyph).

**evidence**

- supabase/functions/elevenlabs-tts/index.ts:14-16 (gate false)
- supabase/functions/elevenlabs-tts/index.ts:25-35 (503)
- supabase/functions/elevenlabs-tts/index.ts:58-76 (real TTS fetch, unreachable)
- supabase/functions/stripe-webhook/index.ts:258-289 (idempotency)
- supabase/functions/stripe-webhook/index.ts:318 (signature verify)
- supabase/functions/stripe-webhook/index.ts:382 (add_credits RPC)
- supabase/functions/stripe-webhook/index.ts:525-584 (subscription lifecycle)
- supabase/functions/billing-portal/index.ts:152,198 (portal+checkout)
- supabase/functions/credit-management/index.ts:605 (live Stripe checkout POST)
- supabase/functions/calendar-integration/index.ts:43-51 (unconditional 503 gate)
- supabase/functions/calendar-integration/index.ts:205-317 (Google OAuth)
- supabase/functions/calendar-integration/index.ts:428-525 (GHL sync)
- supabase/functions/calendar-integration/index.ts:1252-1386 (Cal.com slots+booking)
- supabase/functions/calendar-integration/index.ts:3141 (Google token refresh)
- src/hooks/useCalendarIntegration.ts:32 (provider union incl. outlook/calendly, unimplemented)
- supabase/functions/budget-tracker/index.ts:21-23,33-43 (disabled gate)
- supabase/migrations/20260124_white_label_credits.sql:15-21,27-70 (billing columns + credits table + RLS)
- src/components/CreditDashboard.tsx:119-127 (invokes credit-management)

**validation**

Read all target files directly (stripe-webhook 599 lines, credit-management 819, billing-portal 204, elevenlabs-tts 106, calendar-integration header+provider grep, budget-tracker 120, migration 70, CreditDashboard 185). Non-gated functions (Stripe) confirmed live API calls present; gated functions (ElevenLabs/calendar/budget) confirmed 503 returns before any work.

**open_questions**

- Is there any env/deploy-time way to flip isElevenLabsTtsSpendCertified/isProviderBudgetTrackingTenantCertified/the calendar gate (they are hardcoded false)?
- Does the deployed functions-live/ tree differ from these source files (stripe-webhook header claims byte-exact from functions-live 205-line)

**edge_cases_considered**

- ElevenLabs has a real API call, so 'stub' must be qualified as disabled-not-fake
- calendar gate is placed before try{} so even OAuth GET callbacks are blocked
- hook advertises outlook/calendly providers that the function never implements
- budget-tracker is Twilio/Retell not Stripe

**what_i_did_not_check**

- Did not read the remaining ~3420 lines of calendar-integration beyond header + provider grep (CRUD semantics assumed from grep hits)
- Did not read the rest of budget-tracker (lines 120-547) beyond provider-fetch entry
- Did not read RetellCalendarSetup.tsx / CalendarIntegrationManager.tsx bodies (only outlines) or the calendar migration for calendar_tool_invocations
- Did not compare to supabase/functions-live/ deployed copies or verify runtime behaviour
- Did not check whether the disabled gates are overridden by any config.toml/secret

**confidence**: high