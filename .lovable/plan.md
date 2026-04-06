

# Assistable AI Integration — Full Plan

## What You Pasted & What It Means

You've shared the Assistable.ai API docs covering:
1. **Make AI Call (GHL-Safe)** — `POST https://api.assistable.ai/v2/ghl/make-call` with `assistant_id`, `location_id`, `contact_id`
2. **Calendar Booking** — Assistable has its own calendar tools that can sync with GHL calendars
3. **Custom Tools / Extractions** — Assistable agents can extract data (name, email, project details) via custom tools that POST to webhooks
4. **Pre/Post Call Webhooks** — You mentioned needing these (docs not fully pasted yet)

## Current State

The Mission Briefing Wizard already has an "Assistable" platform toggle (step 4) that collects a webhook URL. But it's superficial — it just tells the AI to "include a webhook step." There's no real Assistable API integration.

The `workflow-executor` already supports a `webhook` step type that POSTs lead data (name, phone, email, status) to any URL.

## What Needs to Change

### 1. Upgrade Assistable in the Mission Briefing Wizard (Step 4)

**Current:** Just a webhook URL field.
**New:** Collect Assistable-specific fields:
- **Assistant ID** (required) — `asst_12345`
- **Location ID** (required for GHL-safe calls) — `loc_98765`
- **Number Pool ID** (optional) — for caller ID rotation on Assistable's side
- Keep webhook URL as optional (for custom extraction webhook flows)

The wizard prompt will then instruct the AI to create workflow steps that call the Assistable API directly (not just a generic webhook).

### 2. New Edge Function: `assistable-make-call`

A small edge function that wraps `POST https://api.assistable.ai/v2/ghl/make-call`:
- Takes `assistant_id`, `location_id`, `contact_id`, optional `number_pool_id`
- Uses stored Assistable API token from secrets
- Returns `call_id` on success
- Handles error responses (checking `success` field in body, not just HTTP status)

### 3. New Workflow Step Type: `assistable_call`

Add to `workflow-executor` alongside existing `call`, `sms`, `webhook` types:
- Looks up the lead's GHL contact ID (from `custom_fields` or `ghl_contact_id` column on leads)
- Calls the `assistable-make-call` edge function
- Logs the Assistable `call_id` back to `call_logs` with `provider: 'assistable'`

### 4. Calendar Integration Decision

You mentioned wanting to use your Google Calendar via a custom tool rather than Assistable's built-in calendar. Our existing `calendar-integration` edge function already handles Google Calendar booking. Two options:

**Option A (Recommended):** Keep using our existing calendar-integration for booking. Assistable agents use a custom tool that calls our `calendar-integration` edge function webhook to check availability and book.

**Option B:** Let Assistable handle calendar natively via its GHL calendar sync. This means Assistable manages availability independently.

### 5. Pre/Post Call Webhooks

You mentioned wanting to paste more info about these. Once you do, we can:
- **Pre-call webhook:** Feed lead context (name, history, notes) to Assistable before the call starts — similar to Telnyx's `dynamic-vars` pattern
- **Post-call webhook:** Receive call outcome, transcript, extracted data from Assistable and route it through our existing `disposition-router` pipeline

## Files to Create/Modify

| File | Action | What |
|------|--------|------|
| `supabase/functions/assistable-make-call/index.ts` | NEW | Wrapper for Assistable Make Call API |
| `supabase/functions/workflow-executor/index.ts` | MODIFY | Add `assistable_call` step type |
| `src/components/MissionBriefingWizard.tsx` | MODIFY | Replace webhook URL field with Assistant ID + Location ID fields |

## Secrets Needed

- `ASSISTABLE_API_KEY` — Bearer token for Assistable API auth

## Safety

- Zero changes to existing Retell/Telnyx paths
- `assistable_call` is a new step type alongside existing ones
- The edge function is standalone — no modification to `outbound-calling`
- Backward compatible: existing campaigns without Assistable continue working unchanged

## What I'm Waiting On

1. **Pre/Post call webhook docs** — you said you'd paste more. This determines how we receive call outcomes and feed context.
2. **Calendar approach** — Option A (our Google Calendar) or Option B (Assistable's GHL calendar)?

Once you paste the webhook docs and confirm the calendar approach, I'll finalize and build.

