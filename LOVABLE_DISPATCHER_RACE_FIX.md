# Lovable spec — Fix dispatcher race condition (multi-dial bug)

## Symptom (FACT, observed 2026-04-15)

In a 90-min campaign run on Cortana (`c2756255-d99e-4c18-87f6-d756634cd8a2`) with `max_attempts=1` per queue entry:

| Dial count | Leads affected |
|---|---|
| 1 (correct) | 216 (86%) |
| 2 | 22 |
| 3 | 6 |
| 4 | 4 |
| 5+ | 2 |

**34 of 250 leads (14%) got 2-5 calls each, all within 4-30 seconds of one another.** Worst case: lead `c0c0188a-66bc-45a9-a28b-ad3ae702747c` (JILL BASHIR) got 5 calls within 5 seconds (20:54:23, 20:54:23, 20:54:24, 20:54:27, 20:54:28). Not retries from a callback — these are simultaneous duplicate dispatches.

`max_attempts=1` was honored at the queue-entry level (the single entry shows `attempts=1, max_attempts=1`), but the dispatcher fired multiple outbound calls FROM that one entry before any of them could mark it `calling`.

## Root cause (FACT, code-cited)

`supabase/functions/automation-scheduler/index.ts` invokes `call-dispatcher` **6 times per minute per user**, staggered 8 seconds apart, for parallel throughput.

`supabase/functions/call-dispatcher/index.ts:1054-1062` reads pending entries:

```ts
const { data: queuedCalls } = await supabase
  .from('dialing_queues')
  .select(`*, leads(...), campaigns(...)`)
  .in('campaign_id', campaignIds)
  .eq('status', 'pending');
```

Then iterates and only marks `status='calling'` deep inside the loop at `call-dispatcher/index.ts:1343-1349` (Retell path) and `call-dispatcher/index.ts:1193-1195` (Assistable path).

**The race window:** when 2-6 dispatcher invocations execute concurrently, they all SELECT the same `pending` entry before any one of them UPDATEs it to `calling`. Each invocation then proceeds to fire a duplicate outbound call.

## The fix

Atomic claim via Postgres `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`. Only one dispatcher can claim each row; concurrent runs skip locked rows entirely.

### Step 1 — Add a Postgres function (migration)

```sql
-- supabase/migrations/<timestamp>_dispatcher_claim_atomic.sql
CREATE OR REPLACE FUNCTION public.claim_pending_dispatches(
  p_campaign_ids UUID[],
  p_limit INT DEFAULT 50
)
RETURNS SETOF public.dialing_queues
LANGUAGE SQL
AS $$
  UPDATE public.dialing_queues
  SET status = 'calling',
      attempts = COALESCE(attempts, 0) + 1,
      updated_at = now()
  WHERE id IN (
    SELECT id FROM public.dialing_queues
    WHERE campaign_id = ANY(p_campaign_ids)
      AND status = 'pending'
      AND scheduled_at <= now()
    ORDER BY priority DESC NULLS LAST, scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
$$;

GRANT EXECUTE ON FUNCTION public.claim_pending_dispatches(UUID[], INT) TO service_role;
```

The `FOR UPDATE SKIP LOCKED` is the lock primitive: each concurrent dispatcher run claims a *disjoint* set of rows and skips rows another run has already locked.

### Step 2 — Replace the dispatcher's SELECT with the RPC

In `supabase/functions/call-dispatcher/index.ts` around line 1054, replace:

```ts
// OLD — race condition
const { data: queuedCalls } = await supabase
  .from('dialing_queues')
  .select(`*, leads(...), campaigns(...)`)
  .in('campaign_id', campaignIds)
  .eq('status', 'pending');
```

with:

```ts
// NEW — atomic claim, no race
const { data: claimed } = await supabase
  .rpc('claim_pending_dispatches', {
    p_campaign_ids: campaignIds,
    p_limit: callsPerMinute || 50,
  });

// Hydrate leads + campaigns separately (RPC returns rows from one table)
const queuedCalls = await hydrateClaimedRows(supabase, claimed);
```

Where `hydrateClaimedRows` joins `leads` and `campaigns` for each claimed row (one batched query each, not N+1).

### Step 3 — Remove the now-redundant `UPDATE status='calling'` calls

Lines 1193-1195 (Assistable path) and 1343-1349 (Retell path) currently set `status='calling'` and `attempts=attempts+1`. The RPC already did both. Delete these UPDATEs to avoid double-incrementing `attempts`.

## Acceptance criteria

A test that proves the fix:

1. Insert 100 fresh `pending` queue entries for one campaign with `max_attempts=1` each.
2. Trigger `automation-scheduler` 3 times back-to-back so call-dispatcher runs 18 times concurrently.
3. Wait 5 minutes, then query:

   ```sql
   SELECT lead_id, COUNT(*) AS calls
   FROM call_logs
   WHERE campaign_id = '<test_campaign>'
   GROUP BY lead_id
   HAVING COUNT(*) > 1;
   ```

   Expected: zero rows. Every lead got exactly one call.

4. Queue final state: 100 entries with `status IN ('completed','failed')` and `attempts=1`.

## Files to change

- New migration: `supabase/migrations/<timestamp>_dispatcher_claim_atomic.sql`
- `supabase/functions/call-dispatcher/index.ts` — replace SELECT (line 1054), remove redundant UPDATEs (lines 1193-1195, 1343-1349)

## Don't break

- Existing pacing config (`campaigns.calls_per_minute`) — keep using it as `p_limit`.
- The retry logic in `call-tracking-webhook` for `no_answer/busy/failed` (already attempt-bounded by `max_attempts`).
- The per-campaign GHL toggle in `retell-call-webhook` (`campaigns.metadata.sync_to_ghl`).
- The callback-loop fix in `automation-scheduler:338-360` and `call-dispatcher:498-525` (already respect `max_attempts` before reset).
- The transfer-detection patches in `retell-call-webhook` (`mapCallStatusToOutcome`, `mapRetellAnalysisToDisposition`, `mapDispositionToLeadStatus`).
- The pipeline-routing patch in `retell-call-webhook` (`updatePipelinePosition` stageMapping).

## Why this can ship today

- `FOR UPDATE SKIP LOCKED` is a stock Postgres primitive (since 9.5). No extension required.
- The Supabase JS client supports `.rpc()` calls returning row sets.
- Migration is additive (new function, no schema change). Safe rollback.
- No frontend changes.

Once deployed, the multi-dial rate goes from 14% to 0%.
