

# Plan: Finish Dispatcher Logic, Solar Dispositions & Quick Test Feature

## Current State

**What's already done:**
- Campaign Manager UI has the 4-way provider toggle (Retell / Telnyx / Both / Assistable) with all form fields
- Dispatcher already routes Retell vs Telnyx calls correctly based on `campaign.provider`
- Disposition router already clears leads from all queues (broadcast, dialing, workflow)
- `assistable-make-call` edge function exists and works
- MissionBriefingWizard already has a test call feature for Retell, Telnyx, and Assistable
- Dispositions table already has most solar dispositions (Transferred is missing, Dropped Call Positive is missing, Send More Info is missing)

**What's NOT done:**
1. `createCampaign` in `usePredictiveDialing` doesn't pass `provider`, `telnyx_assistant_id`, `sms_from_number`, or `workflow_id` to the DB
2. Dispatcher doesn't handle `provider: 'both'` (alternating Retell/Telnyx) or `provider: 'assistable'`
3. Campaigns table has no column for Assistable metadata (agent_id, number_pool_id) — needs `metadata` JSONB column or dedicated columns
4. Missing solar dispositions: Transferred, Dropped Call Positive, Send More Info, Bad Number, Busy Signal, Call Not Connected
5. No standalone "Quick Test" button on campaign cards for instant test calls

---

## Implementation Steps

### 1. Add Missing Solar Dispositions (DB insert)
Insert the missing dispositions into the `dispositions` table for the user:
- **Transferred** → pipeline_stage: `transferred` (terminal - remove from queues)
- **Dropped Call Positive** → pipeline_stage: `hot_leads` (pause workflow, follow up)
- **Bad Number** → pipeline_stage: `invalid_leads` (terminal)
- **Busy Signal** → pipeline_stage: `callbacks` (pause, retry later)
- **Call Not Connected** → pipeline_stage: `callbacks` (pause, retry later)
- **Send More Info** → pipeline_stage: `follow_up` (pause workflow)

Update the disposition router's `REMOVE_ALL_DISPOSITIONS` to include `transferred` and `bad_number`. Update `PAUSE_WORKFLOW_DISPOSITIONS` to include `dropped_call_positive`, `busy_signal`, `send_more_info`, `call_not_connected`.

### 2. Fix Campaign Create/Update to Pass All Provider Fields
Update `usePredictiveDialing.createCampaign()` to pass `provider`, `telnyx_assistant_id`, `sms_from_number`, and `workflow_id` to the database insert. Currently these fields are silently dropped.

### 3. Add `metadata` JSONB Column to Campaigns Table
Add a `metadata` JSONB column to `campaigns` for storing Assistable config (`assistable_agent_id`, `assistable_number_pool_id`) and future extensibility. Update the save logic in CampaignManager to write/read Assistable fields from this column.

### 4. Dispatcher: Handle "Both" Provider (Retell + Telnyx Alternation)
In `call-dispatcher`, when `campaign.provider === 'both'`:
- Load BOTH Retell and Telnyx number pools
- For each call, alternate between providers using a simple round-robin (odd attempt = Retell, even = Telnyx, or vice versa based on queue position)
- Use the correct agent ID for each provider (`agent_id` for Retell, `telnyx_assistant_id` for Telnyx)
- Pass the correct `provider` field to `outbound-calling`

### 5. Dispatcher: Handle "Assistable" Provider
In `call-dispatcher`, when `campaign.provider === 'assistable'`:
- Read `assistable_agent_id` and `assistable_number_pool_id` from campaign metadata
- Instead of calling `outbound-calling`, invoke `assistable-make-call` directly with the agent ID, number pool ID, and lead phone number
- Mark queue item as `calling`, track the call in `call_logs` with `provider: 'assistable'`

### 6. Quick Test Button on Campaign Cards
Add a "Test" button (phone icon) to each campaign card in CampaignManager that:
- Opens a small popover/dialog asking for your phone number
- Calls you immediately using the campaign's configured agent and provider
- Bypasses all queuing, DNC checks, scheduling, and credit checks
- Works for all 4 provider types (Retell, Telnyx, Both, Assistable)
- Shows result inline (success/failure toast)
- Reuses the same test call logic from MissionBriefingWizard

### 7. Deploy & Verify
- Deploy `call-dispatcher` and `disposition-router`
- Verify the stuck queue entry (attempts 9 >= max 2) gets marked failed
- Test a campaign launch with a single test number

---

## Technical Details

**Files to modify:**
- `supabase/functions/call-dispatcher/index.ts` — Add `both` alternation logic and `assistable` dispatch path
- `supabase/functions/disposition-router/index.ts` — Add missing disposition strings to the correct arrays
- `src/hooks/usePredictiveDialing.ts` — Fix `createCampaign` to pass all fields
- `src/components/CampaignManager.tsx` — Add Quick Test button, fix metadata save/load
- `supabase/migrations/` — Add `metadata` JSONB column to campaigns

**Dispositions already correct (no changes needed):**
- Hot Lead, Potential Prospect, Follow Up, Not Interested, Wrong Number, Dropped Call, Not Connected, Voicemail, Do Not Call, Callback Requested, Appointment Booked

