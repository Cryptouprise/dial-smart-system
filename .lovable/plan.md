

## Problem Diagnosis

**Retell API 400 Error: "Got empty url"**

The edge function logs show the exact error:
```
Retell AI API error: 400 - {"status":"error","message":"Got empty url"}
```

The payload being sent includes `"webhook_url":""` (empty string). Retell's API rejects empty strings for URL fields — it expects either a valid URL or the field to be omitted entirely.

**Root cause**: `AgentEditDialog.tsx` line 546 initializes `webhook_url: agent.webhook_url || ''`, and the `handleSave` function (line 579) only sanitizes `pii_config` but passes all empty URL strings through untouched.

## Plan

### Task 1: Fix Retell Agent Save — Sanitize Empty URLs

**File: `supabase/functions/retell-agent-management/index.ts`**

In the `update` case (around line 137), after building `updateData`, strip out any fields with empty string values that Retell treats as URLs. This is the safest place to fix it (server-side) so it catches all callers:

- Before sending to Retell API, iterate over `updateData` and delete any key where:
  - The value is `""` (empty string)
  - AND the key matches URL-related fields: `webhook_url`, `post_call_webhook_url`, `transfer_webhook_url`
- Also strip the internal `_retellTools` key (if present) since that's our UI-only field, not a Retell API field — sending unknown keys could cause issues.
- Apply the same sanitization in the `create` case for safety.

### Task 2: Frontend Sanitization Belt-and-Suspenders

**File: `src/components/AgentEditDialog.tsx`**

In `handleSave` (line 579), add URL sanitization before calling `onSave`:
- Delete `webhook_url` if it's empty string
- Delete `post_call_webhook_url` and `transfer_webhook_url` if empty
- Delete `_retellTools` (internal UI state, not an API field)

### Task 3: Campaign Launch / Dispatch / Calling Audit

Based on my review of the full dispatch chain, the following are confirmed working:

| Component | Status | Notes |
|-----------|--------|-------|
| `call-dispatcher` number rotation | OK | Retell fallback to all active numbers, Telnyx provider-specific pool |
| `call-dispatcher` provider routing | OK | Both/Retell/Telnyx/Assistable paths all have agent validation |
| `call-dispatcher` dedup check | OK | 30-min recent answered call check prevents repeat dials |
| `call-dispatcher` concurrency | OK | Capacity-aware batch sizing |
| `outbound-calling` Retell path | OK | Standard Retell create-call API |
| `outbound-calling` Telnyx path | OK | TeXML AI calls endpoint (fixed in prior session) |
| `outbound-calling` DNC validation | OK | Checks before calling |
| Number daily limit reset | OK | `reset_stale_daily_calls` RPC called before dispatch |
| Queue recycling | OK | Upsert on campaign_id+lead_id for terminal rows |
| Manual dispatch bypass | OK | Both `action: 'dispatch'` and `immediate: true` bypass schedule gate |

No additional dispatch/calling issues found. The only blocker is the Retell save error.

### Task 4: Deploy and Verify

- Deploy `retell-agent-management` edge function
- Verify build passes

## Summary

Two small edits fix the 400 error — sanitize empty URL strings both server-side (retell-agent-management) and client-side (AgentEditDialog). The campaign launch/dispatch/calling pipeline is solid.

