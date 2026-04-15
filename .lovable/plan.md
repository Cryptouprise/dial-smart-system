

# Pre-Launch Verification: Critical Findings

## ACTIVE BLOCKER — Disposition Router & Transcript Analysis Getting 401 Errors

The edge function logs from your most recent call show this **right now**:

```
[Retell Webhook] Disposition router error: Error: disposition-router 401: Invalid JWT
[Retell Webhook] AI analysis error: Error: analyze-call-transcript 401: Invalid JWT
[Retell Webhook] No pipeline stage mapping for outcome: completed
```

**Root cause:** In `supabase/config.toml`, both `disposition-router` and `analyze-call-transcript` are set to `verify_jwt = true`. When `retell-call-webhook` calls them internally using `SUPABASE_SERVICE_ROLE_KEY`, Supabase rejects it because `verify_jwt = true` expects a user JWT, not a service role key.

**Impact RIGHT NOW:** Every call that ends:
- Gets NO transcript analysis (falls back to basic sentiment only)
- Gets NO disposition routing (lead stays where it is)
- Gets NO pipeline movement
- Gets NO auto-actions (DNC, campaign removal, workflow triggers)
- The transfer detection fix from earlier? It works in the webhook but the disposition router never fires, so leads still won't move to the right pipeline.

**Fix:** Change both to `verify_jwt = false` in `supabase/config.toml` (they authenticate internally via service role key already). This is consistent with how `retell-call-webhook` itself is already configured (`verify_jwt = false`).

## Campaign-Specific Pipeline Routing — Not Yet Implemented

`ensurePipelineBoardLocal()` still matches boards by name only with no `campaign_id` filtering (lines 675-723). The `campaignId` is extracted at line 167 but never passed to the board lookup. This was the plan from the previous discussion — it has not been implemented yet.

**Impact:** All campaigns share the same pipeline boards. A "Transferred" lead from Campaign A and Campaign B both land on the same "Transferred" board. This is functional but not campaign-specific.

## Other Checks — All Good

| System | Status | Detail |
|--------|--------|--------|
| **Transfer detection** | ✅ Working | `mapCallStatusToOutcome` catches `transfer/handoff/warm_transfer/call_transferred`. `mapRetellAnalysisToDisposition` catches transcript transfer phrases. Both return `"transferred"`. |
| **Terminal dispositions** | ✅ Correct | `transferred` is in both `TERMINAL_DISPOSITIONS` and `CAMPAIGN_REMOVAL_DISPOSITIONS` (checked DEFAULT_REMOVE_ALL_DISPOSITIONS in disposition-router). |
| **Lead status mapping** | ✅ Correct | `transferred` → `qualified`, `transfer` → `qualified` in `mapDispositionToLeadStatus`. |
| **Disposition DB** | ✅ 23 dispositions | "Transferred" disposition exists with `pipeline_stage: transferred`. |
| **Phone numbers** | ✅ 1 available | Dispatcher shows 1/12 Retell numbers available for rotation. |
| **Dialing queue** | ✅ Clean | Only 1 stale pending entry from old test campaign (paused). |
| **Active campaign** | ✅ "Cortana NJ Solar Update" | Status: active, 5 calls/min. **Warning:** `max_attempts: 1` — no retries on no-answer/busy. |
| **Retry delay** | ✅ 15 min | Standard. |
| **Duplicate disposition** | ⚠️ Minor | Two "Not Interested" dispositions mapping to different stages (`not_interested` vs `cold_leads`). Non-blocking but could route inconsistently. |
| **invokeServiceFunction** | ✅ Correct pattern | Uses `SUPABASE_SERVICE_ROLE_KEY` as Bearer token + apikey header. The auth code is fine — it's the `config.toml` JWT gate that blocks it. |

## The Fix (2 changes)

### 1. Fix `supabase/config.toml` — CRITICAL, do this before launching
Change `verify_jwt` from `true` to `false` for:
- `[functions.disposition-router]`
- `[functions.analyze-call-transcript]`

Then redeploy both functions. This unblocks the entire post-call automation chain.

### 2. (Optional) Add campaign_id filtering to `ensurePipelineBoardLocal`
Pass the already-extracted `campaignId` into the board lookup so each campaign routes to its own pipeline boards. This is the change discussed in the previous message — nice to have but not a blocker for launch.

## Summary

One critical fix needed before launch: the JWT config is silently killing your disposition routing and transcript analysis on every single call. The transfer detection, terminal disposition logic, and campaign removal chain are all correctly implemented — they just never fire because the disposition router returns 401 before it can do anything.

Fix the config.toml, redeploy, and you're good to go.

