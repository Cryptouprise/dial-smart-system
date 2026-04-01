

# Fix Build Errors Plan

There are 9 TypeScript errors across 4 edge function files and 3 test files. Here's the fix for each.

## Edge Function Fixes

### 1. `ai-autonomous-engine/index.ts` — 7 errors

**Error 1 (line 2516):** `auto_create_rules_from_insights` missing from `AutonomousSettings` interface.
- **Fix:** Add missing fields to the `AutonomousSettings` interface (lines 29-42): `manage_lead_journeys`, `enable_daily_planning`, `enable_strategic_insights`, `auto_create_rules_from_insights`, `perpetual_followup_enabled`, and related fields that are used throughout the file but never declared.

**Errors 2-3 (line 3446):** `callLLMJson` is called with `{ system, prompt, ... }` but expects `{ messages: ChatMessage[] }` per the `LLMCallOptions` interface.
- **Fix:** Refactor the `optimizeSmsCopy` call (around line 3444) to use `messages` array format instead of `system`/`prompt` shorthand. This also fixes errors on lines 3458-3459 where `improvement.improved_message` and `improvement.reasoning` are typed as `{}` — the generic `T` defaults to `Record<string, unknown>`, so we cast the result properly.

**Errors 4-6 (lines 4478, 4483, 4515):** `activeLeads` is possibly `undefined` because the variable is initialized as `leads` (the parameter), which can be undefined, and the `fetchedLeads || []` assignment only happens inside an `if (!activeLeads)` block.
- **Fix:** Change line 4475 from `activeLeads = fetchedLeads || []` — actually the issue is that after the `if (!activeLeads)` block, TypeScript still considers `activeLeads` could be undefined. Add a non-null assertion or re-declare with explicit type: `const safeLeads = activeLeads ?? []` after the block.

### 2. `telnyx-webhook/index.ts` — 1 error (line 191)

**Error:** `signature` is `string | null` from `req.headers.get()`, but `verifyTelnyxSignature` parameter `timestamp` accepts `string | null` while `signature` is being passed to a parameter typed as `string | null`. The actual error says `string | undefined` is not assignable to `string | null`.
- **Fix:** Looking more carefully, the `timestamp` variable comes from `req.headers.get()` which returns `string | null`. The function signature already accepts `string | null`. Let me re-read the error: "Argument of type 'string | undefined' is not assignable to parameter of type 'string | null'." This means one of the variables is `string | undefined` somewhere. Check: `webhookSecret` comes from `Deno.env.get()` which returns `string | undefined`. The function param is `webhookSecret: string | null`. Fix: pass `webhookSecret ?? null`.

### 3. `voice-broadcast-engine/index.ts` — 1 error (line 658)

**Error:** `telnyxApiKey` is typed as `string?` (optional) in `ProviderConfig` interface, but the value `|| null` produces `string | null` which isn't assignable to `string | undefined`.
- **Fix:** Change `|| null` to `|| undefined` on line 658, or change the interface to `telnyxApiKey?: string | null`.

## Test File Fixes

### 4. `ActionQueuePanel.test.tsx` (line 83) — missing `afterEach`
- **Fix:** Add `import { afterEach } from 'vitest'` or add `afterEach` to the existing vitest import.

### 5. `useBudgetTracker.test.ts` (lines 240, 490) — mock type mismatch
- **Fix:** Update the mock return type and property access to match current types.

### 6. `useConcurrencyManager.test.ts` (line 437) — type comparison mismatch
- **Fix:** Update the comparison to use a valid union member.

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/ai-autonomous-engine/index.ts` | Expand `AutonomousSettings` interface; fix `callLLMJson` call to use `messages` format; guard `activeLeads` against undefined |
| `supabase/functions/telnyx-webhook/index.ts` | Pass `webhookSecret ?? null` to `verifyTelnyxSignature` |
| `supabase/functions/voice-broadcast-engine/index.ts` | Change `|| null` to `|| undefined` for `telnyxApiKey` |
| `src/components/__tests__/ActionQueuePanel.test.tsx` | Add `afterEach` to vitest imports |
| `src/hooks/__tests__/useBudgetTracker.test.ts` | Fix mock type and property access |
| `src/hooks/__tests__/useConcurrencyManager.test.ts` | Fix invalid type comparison |

## No Database Changes

No migrations or schema changes needed — these are all TypeScript type fixes.

