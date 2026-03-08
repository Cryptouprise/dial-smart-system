

## Problem Analysis

There are **three compounding issues** preventing calls from going out:

### Issue 1: `retry_delay_minutes = 300` (5 hours!) on the campaign
The "3.7 test telnyx" campaign has `retry_delay_minutes: 300`. Every time a call fails (which happened ~15 times today due to the billing blocker), the dispatcher schedules the next retry 5 hours later. The current queue entry is scheduled for 19:03 UTC - that's from the last failure retry.

### Issue 2: Billing was blocking all calls (NOW FIXED)
The `billing_enabled` flag was `true` with $0 balance, so `outbound-calling` kept failing every attempt with "Insufficient credits". We just fixed this by setting `billing_enabled = false`. But the damage is done - the queue entry now has a future `scheduled_at` from the retry logic.

### Issue 3: "Dispatch Now" button doesn't bypass schedule
The `dispatchCalls()` function in `useCallDispatcher.ts` sends `body: {}` (empty). The `manualDispatchNow` bypass in the edge function requires either `action === 'dispatch'` or `immediate === true`. An empty body satisfies neither, so the scheduled_at filter blocks it.

The "Reset Schedule (Call Now)" button in CampaignManager DOES work (it updates `scheduled_at` directly in the DB), but the QuickTestCampaign and standard Dispatch buttons don't.

### What happens step by step:
1. Call fails with "Insufficient credits" 
2. Dispatcher retries → schedules 300 min later 
3. User clicks Dispatch → sends `{}` → dispatcher respects `scheduled_at` filter → 0 calls eligible 
4. User sees "1 calls pending but scheduled for later"

## Plan

### 1. Fix the Dispatch button to always bypass scheduling for manual clicks
In `supabase/functions/call-dispatcher/index.ts`, change the `manualDispatchNow` logic so ALL non-internal (user-initiated) calls bypass the `scheduled_at` gate. If you're a human clicking a button, you want calls NOW.

**Change**: Line ~1008
```
// BEFORE: Only bypass for specific action values
const manualDispatchNow = !isInternalCall && (action === 'dispatch' || immediateDispatchNow);

// AFTER: ALL user-initiated calls bypass scheduling
const manualDispatchNow = !isInternalCall;
```

This is the simplest, most robust fix. If the automation-scheduler calls it, it sends `internal: true` so it will still respect schedules. If a user clicks ANY dispatch button, calls go immediately.

### 2. Fix the campaign's retry_delay_minutes from 300 to 5
Run a SQL update to fix the "3.7 test telnyx" campaign's insane 300-minute retry delay back to a reasonable 5 minutes.

### 3. Reset the stuck queue entry to NOW
Clear the future `scheduled_at` on the pending queue entry so the next dispatch picks it up immediately.

### 4. Deploy the updated call-dispatcher edge function

### Technical Details
- **File modified**: `supabase/functions/call-dispatcher/index.ts` (line ~1008, 1 line change)
- **DB changes**: 
  - Update `campaigns.retry_delay_minutes` from 300 to 5 for campaign `0312b0de-63f5-41db-93dc-b32cbcb66961`
  - Update `dialing_queues.scheduled_at` to NOW for the stuck entry
- **Risk**: Low - only changes behavior for user-initiated calls. Automated/cron calls still respect schedules.

