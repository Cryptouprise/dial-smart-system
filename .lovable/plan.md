

# Fix Campaign Dispatch, Retry Delay, Clear History, and Force Requeue

## What's actually broken (root causes)

1. **Retry delay = 300 minutes (5 hours)** — The original migration `20251208` set `DEFAULT 300` on `campaigns.retry_delay_minutes`. The campaign create/edit form never includes `retry_delay_minutes`, so every campaign inherits 300 from the DB. After a first call attempt fails, the next attempt is scheduled 5 hours later. The dispatcher UI warning shows it, but there's no way to change it.

2. **Clear History → TypeError** — `clearWorkflowHistory()` deletes from `lead_workflow_progress` using `.eq('campaign_id', campaignId)` but does NOT filter by `user_id`. The RLS policy requires `auth.uid() = user_id`. Without that filter, the Supabase client can't match rows → returns an error the UI catches as a generic TypeError.

3. **Force Requeue fails** — `forceRequeueLeads()` deletes old queue entries then re-inserts, but if the delete silently fails (RLS), the subsequent insert hits the `(campaign_id, lead_id)` unique constraint → error.

4. **Dispatch Now → "No calls to dispatch"** — Because retry_delay is 300 min, all retried leads are scheduled far in the future. Manual dispatch already bypasses `scheduled_at`, but if leads have status `completed` or `failed` (not `pending`), they won't be found. The real issue is a cascade: high retry delay → leads get scheduled far out → even with bypass, if the requeue/clear failed, no pending leads exist.

## Implementation plan

### Step 1: Fix the retry_delay_minutes DB default and existing campaigns
- Migration: `ALTER TABLE campaigns ALTER COLUMN retry_delay_minutes SET DEFAULT 15`
- Migration: `UPDATE campaigns SET retry_delay_minutes = 15 WHERE retry_delay_minutes = 300`
- This fixes all existing campaigns and future ones immediately.

### Step 2: Add retry_delay_minutes to the campaign form
- Add a `retry_delay_minutes` field to `formData` (default: 15).
- Add it to `resetForm()` and `handleEdit()`.
- Add a number input in the campaign create/edit dialog (near max_attempts), labeled "Retry Delay (minutes)", with min=1, max=60.
- Include it in `submitData` so it actually saves.

### Step 3: Fix Clear History RLS issue
- In `clearWorkflowHistory()`, get the user first (already done), then add `.eq('user_id', user.id)` to the `lead_workflow_progress` delete query so RLS can match rows.

### Step 4: Fix Force Requeue
- In `forceRequeueLeads()`, use `.upsert()` instead of `.insert()` for the queue entries, with `onConflict: 'campaign_id,lead_id'`. This handles the case where old entries weren't cleaned up.
- Also add user auth check at the top so the delete operations pass RLS.

### Step 5: Clamp retry delay in the dispatcher
- The dispatcher already clamps to 1-60 minutes at line 1440. Keep this as defense-in-depth, but with the DB fix it won't be needed for normal operation.

### Step 6: Add a "Fix Retry Delay" quick-action button
- In the warning banner that shows "Retry delay is 300 minutes", add a button that immediately updates the campaign's `retry_delay_minutes` to 15 and refreshes. This gives a one-click fix for any campaign that somehow ends up with a bad value.

## Files to modify

| File | Change |
|------|--------|
| New migration | Change default from 300→15, update all existing campaigns |
| `src/components/CampaignManager.tsx` | Add retry_delay_minutes to form, fix clearWorkflowHistory, add quick-fix button |
| `src/hooks/useCallDispatcher.ts` | Fix forceRequeueLeads to use upsert |

## Technical details

- The `dialing_queues` unique constraint `(campaign_id, lead_id)` means upsert is the correct pattern for requeue
- RLS on `lead_workflow_progress` requires `user_id = auth.uid()` — all delete queries must include this filter
- The dispatcher's 1-60 minute clamp on retry delay is good defense-in-depth but the root fix is the DB default + form control
- No edge function changes needed — the dispatcher already handles manual dispatch correctly once leads are in `pending` status with reasonable scheduling

