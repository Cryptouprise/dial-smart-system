

# Pre-Launch Risk Assessment — Final Once-Over

## Issues Found

### 1. CRITICAL: Broken Free LLM Model (Active in Production RIGHT NOW)

The OpenRouter free model `meta-llama/llama-3.3-70b:free` is **failing on every engine run** with a 400 error: "not a valid model ID." This is visible in the live edge function logs. The engine falls back to paid Claude Sonnet, which means **you're burning paid OpenRouter credits every 5 minutes** unnecessarily.

**Fix:** Update `supabase/functions/_shared/openrouter.ts` — replace all three `meta-llama/llama-3.3-70b:free` entries with a valid free model (e.g., `meta-llama/llama-4-scout:free` or `google/gemma-3-27b-it:free`), or remove the free tier fallback entirely if you're okay with paid-only.

**Impact:** Cost savings. No functional breakage (fallback works), but wasteful.

---

### 2. HIGH: No DNC Check in `outbound-calling` Edge Function

The `call-dispatcher` checks `do_not_call` before queuing leads, and `voice-broadcast-engine` handles DNC properly. But the **`outbound-calling` edge function** — the one that actually places AI calls — has **zero DNC validation**. If a lead gets passed directly (e.g., from the action queue or a manual trigger), it will call a DNC number without checking.

**Fix:** Add a DNC check after phone normalization (around line 246) — query `leads` for `do_not_call = true` or check the `dnc_list` table before proceeding.

**Impact:** Compliance risk. TCPA violation potential.

---

### 3. MEDIUM: No Caller ID Validation for Standalone Calls

When `outbound-calling` is called directly (not through `call-dispatcher`), the `callerId` comes from the request body with no validation that it's an active, non-spam-flagged number owned by the user. The dispatcher validates this, but direct calls skip it.

**Fix:** Add a check that the `callerId` exists in `phone_numbers` with `status = 'active'` for the user.

---

### 4. LOW: Engine Running in `suggestions_only` Mode

The logs show `Processing user ... (level: suggestions_only)`. This means the engine is scoring leads and analyzing data but **not auto-executing any actions**. If you want autonomous calling/SMS, you'll need to change `autonomy_level` to `full_auto` or `approval_required` in `autonomous_settings`.

This isn't a bug — just a configuration note for when you're ready to go live.

---

### 5. LOW: Journey Engine Showing 0/0 Actions

The log shows `journey=0/0 actions/0 stage changes`. This could mean `manage_lead_journeys` is still `false` in autonomous_settings, or leads haven't been synced to `lead_journey_state` yet. Verify the toggle is on before expecting journey-based follow-ups.

---

## Summary — What to Fix Before Launch

| Priority | Issue | Risk | Effort |
|----------|-------|------|--------|
| CRITICAL | Fix broken free LLM model ID | Burning paid credits | 2 min |
| HIGH | Add DNC check in `outbound-calling` | TCPA compliance | 10 min |
| MEDIUM | Validate caller ID in direct calls | Bad caller ID errors | 5 min |
| LOW | Set autonomy_level if you want auto-execution | No auto actions | Config change |
| LOW | Enable `manage_lead_journeys` toggle | No journey follow-ups | Config change |

## Recommended Action

Fix items 1-3 in code, then verify your autonomous_settings configuration (items 4-5) before launching. Everything else — telephony, webhooks, credit system, A/B testing, battle plans — looks solid and ready.

