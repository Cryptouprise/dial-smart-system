
# Update OpenRouter Model Tiers with Free Fallbacks

## What We're Doing
Updating `openrouter.ts` to use the best free OpenRouter models as primary defaults, with automatic fallback to paid models if the free ones fail (rate limited, etc.). This means the system **never stops working** even if credits run out.

## Model Strategy

| Tier | Primary (Free) | Fallback (Paid) | Use Case |
|------|----------------|-----------------|----------|
| Fast | `deepseek/deepseek-r1-0528:free` | `google/gemini-2.5-flash` | Disposition classification, SMS generation, simple parsing |
| Balanced | `meta-llama/llama-3.3-70b:free` | `anthropic/claude-sonnet-4-20250514` | Transcript analysis, intent extraction, playbook evaluation |
| Premium | `deepseek/deepseek-r1-0528:free` | `anthropic/claude-sonnet-4-20250514` | Strategic analysis, battle plans, funnel optimization |

## Changes to `supabase/functions/_shared/openrouter.ts`

1. **Add free model tier map** alongside the existing paid models
2. **Add retry-with-fallback logic** in `callLLM()`: try the free model first, and if it returns a 429 (rate limit) or 503 (overloaded), automatically retry with the paid model
3. **Add logging** so you can see in edge function logs which model actually served each request

## How the Fallback Works

```text
Request comes in (tier: "balanced")
  |
  Try FREE model (llama-3.3-70b:free)
  |
  Success? --> Return response
  |
  429/503? --> Log warning, retry with PAID model (claude-sonnet-4)
               |
               Success? --> Return response
               |
               Fail? --> Throw error
```

## Technical Details

- Only retries on 429 (rate limit) and 503 (overloaded) -- other errors throw immediately
- Adds ~0 latency on success, only adds retry latency when free model is unavailable
- Lovable AI gateway fallback still works as the final safety net if no OpenRouter key is set
- No changes needed to any calling code -- the `callLLM`, `callLLMJson`, and `promptLLM` APIs stay identical
- Will also update `CLAUDE.md` with the new model strategy

## Edge Functions to Redeploy
- `ai-autonomous-engine` (primary consumer of these tiers)
