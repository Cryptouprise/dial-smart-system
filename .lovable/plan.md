

# Fix Autonomous Engine: Broken Model ID + Missing Column

## What's Wrong (from the live test)

1. **Free model ID is wrong** -- `meta-llama/llama-3.3-70b:free` does not exist on OpenRouter. The correct ID is `meta-llama/llama-3.3-70b-instruct:free`. Every 5-minute run is failing on the free model and falling back to paid Claude Sonnet, costing real money.

2. **`plan_status` column missing** from `daily_battle_plans` table -- the engine code checks `existingPlan.plan_status` but the column was never created, so battle plan generation is skipped every run.

## Fix 1: Update Free Model IDs

**File:** `supabase/functions/_shared/openrouter.ts`

Change all three entries from `meta-llama/llama-3.3-70b:free` to `meta-llama/llama-3.3-70b-instruct:free`.

Also add a faster alternative for the `fast` tier using `openai/gpt-oss-120b:free` (OpenAI's open-weight MoE model, fast with only 5.1B active params per pass).

Updated config:
- **fast:** `openai/gpt-oss-120b:free` -- lightweight, great for classification/SMS
- **balanced:** `meta-llama/llama-3.3-70b-instruct:free` -- solid all-rounder
- **premium:** `meta-llama/llama-3.3-70b-instruct:free` -- same fast model, avoids slow reasoning models

## Fix 2: Add `plan_status` Column

**Database migration** to add:
```
ALTER TABLE public.daily_battle_plans 
ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'draft';
```

This unblocks the Daily Battle Plan generation step.

## Fix 3: Redeploy

Redeploy `ai-autonomous-engine` so it picks up the corrected model IDs.

## Expected Result After Fix

- Free model calls succeed (no more 400 errors)
- No paid Claude fallback unless free models are rate-limited
- Battle plans actually generate instead of being skipped
- The summary line should show `plan=generated` instead of `plan=skipped`

