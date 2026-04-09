
Goal: stop the app from “erroring out” during test calls, fix the real launch blockers first, then do a short reliability sweep so the common call/testing flows are safe.

What I verified
- There is a real current blocker in deployed logs: `outbound-calling` is receiving a test call request and failing with `Phone number and caller ID are required`.
- The immediate root cause is in `CampaignManager.tsx`: the campaign-card Quick Test sends `phoneNumber` and `provider`, but does not send `callerId` for Retell/Telnyx/Both.
- I also found two more broken test-call paths:
  1. `MissionBriefingWizard.tsx` sends Telnyx test calls with `assistantId` / `toNumber`, but `telnyx-ai-assistant` expects `assistant_id` / `to_number`.
  2. `MissionBriefingWizard.tsx` sends Assistable test calls with `phone_number`, but `assistable-make-call` requires `contact_id`.
- A secondary but noisy app issue is also present on the homepage: `LandingPage.tsx` is generating the React ref warning around `AutoplayVideo`, which can trip Guardian and make the app feel unstable.

Implementation plan
1. Fix the immediate test-call failure
- Update the Campaign Manager Quick Test flow so it always resolves and passes a valid `callerId` before invoking `outbound-calling`.
- Provider rules:
  - Retell: use an active number with `retell_phone_id`
  - Telnyx: use an active Telnyx number (`provider='telnyx'` or carrier match)
  - Both: choose the active provider first, then use the same fallback logic as dispatcher
- If no valid caller ID exists, stop before the edge function call and show a clear toast instead of letting the function fail.

2. Standardize all test-call entry points
- Create one shared frontend helper for test-call payload building so all buttons use the same logic.
- Apply it to:
  - `CampaignManager`
  - `MissionBriefingWizard`
  - any other direct `outbound-calling` / `assistable-make-call` / `telnyx-ai-assistant test_call` entry points found in the sweep
- This removes the current mismatch where different screens send different field names and requirements.

3. Fix the known payload mismatches
- Telnyx test calls: send `assistant_id` and `to_number` consistently.
- Assistable test calls: stop sending raw `phone_number` to `assistable-make-call`.
- For Assistable quick tests, use the same GHL-safe rule as the dispatcher:
  - prefer a real `ghl_contact_id`
  - if unavailable, fail gracefully with an exact message explaining that Assistable test calls need a mapped GHL contact
- If there is already enough integration data in the project to resolve/create a GHL contact safely, wire that in; otherwise keep the failure explicit and actionable instead of silent.

4. Harden edge-function error handling so the UI does not feel broken
- Update `outbound-calling` and `assistable-make-call` to return structured operational errors more safely for non-auth/non-billing failures.
- Keep the response parseable by the frontend with:
  - clear `error`
  - optional `error_code`
  - provider-specific fix hint
- This keeps test failures inside the toast/UI layer instead of looking like the whole app stopped.

5. Remove the recurring homepage error noise
- Fix the `LandingPage` / `AutoplayVideo` ref warning so Guardian stops surfacing that issue on normal browsing.
- Keep this scoped and surgical: just remove the ref misuse or make the component ref-safe.

6. Do a launch-readiness sweep on the risky call/testing flows
- Search all direct test-call invocations and verify each one has:
  - correct field names
  - provider-specific caller ID
  - correct agent/assistant identifiers
  - correct Assistable contact handling
  - correct test flags (`isTestCall`, skip flags where intended)
- Also verify the UI readiness messaging is provider-aware so you can see missing Retell/Telnyx/Assistable prerequisites before clicking.

7. Verify after implementation
- Re-test campaign-card Quick Test for:
  - Retell
  - Telnyx
  - Both
  - Assistable
- Confirm the outbound-calling logs no longer show `Phone number and caller ID are required`.
- Confirm Mission Briefing test calls no longer fail from bad payload names.
- Confirm the homepage ref warning is gone.
- Do a short smoke pass through the core screens you’re actively using so normal usage no longer gets interrupted by obvious runtime errors.

Technical details
- Files likely to change:
  - `src/components/CampaignManager.tsx`
  - `src/components/MissionBriefingWizard.tsx`
  - `src/pages/LandingPage.tsx`
  - `supabase/functions/outbound-calling/index.ts`
  - `supabase/functions/assistable-make-call/index.ts`
  - possibly a shared helper such as `src/lib/testCallUtils.ts`
  - `CLAUDE.md`
- Guardrails:
  - keep changes on the real production paths (edge functions), not the provider stub adapters
  - keep quick-test provider fallback aligned with dispatcher behavior
  - treat Assistable as GHL-contact-based, not raw-phone-based
