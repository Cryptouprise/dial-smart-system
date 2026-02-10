

# Fix All Build Errors from PR #52

This plan fixes all 15 build errors across edge functions and frontend components introduced by the GitHub Copilot merge.

---

## Error Groups and Fixes

### Group 1: Edge Function `error` is of type `unknown` (4 files)

**Files:** `demo-call`, `demo-scrape-website`, `demo-sms-reply`, `setup-lady-jarvis`

**Problem:** TypeScript strict mode requires casting `error` before accessing `.message`.

**Fix:** Change `error.message` to `(error as Error).message` in the catch blocks of all four files.

---

### Group 2: `supabase.raw()` does not exist (ai-brain)

**File:** `supabase/functions/ai-brain/index.ts` (line 4336)

**Problem:** The Supabase JS client doesn't have a `.raw()` method.

**Fix:** Split into two operations -- first fetch current `access_count`, then update with incremented value. Or simply remove the `access_count` increment and just update `last_accessed` (simpler, minimal impact since this is just a "touch" operation for memory access tracking).

---

### Group 3: `metadata.variant_id` not in type (retell-call-webhook)

**File:** `supabase/functions/retell-call-webhook/index.ts` (lines 956, 961, 976)

**Problem:** The `metadata` interface (line 39-47) doesn't include `variant_id` for A/B testing.

**Fix:** Add `variant_id?: string;` to the metadata interface definition.

---

### Group 4: Implicit `any` types in pagination loops (twilio-integration)

**File:** `supabase/functions/twilio-integration/index.ts` (lines 95, 99, 111, 400, 404, 411)

**Problem:** TypeScript can't infer types for variables that reference themselves in a loop.

**Fix:** Add explicit type annotations: `const fullUrl: string = ...`, `const response: Response = ...`, `const data: any = ...`, `const numbersResponse: Response = ...`, `const numbersData: any = ...`.

---

### Group 5: `release_phone_number` not in action union (twilio-integration)

**File:** `supabase/functions/twilio-integration/index.ts` (line 1520)

**Problem:** The action type union on line 11 doesn't include `release_phone_number`.

**Fix:** Add `'release_phone_number'` to the `TwilioImportRequest.action` union type.

---

### Group 6: Frontend components referencing tables not in Supabase types (ActionQueuePanel, LeadJourneyDashboard)

**Files:** `src/components/ActionQueuePanel.tsx`, `src/components/LeadJourneyDashboard.tsx`

**Problem:** These components query tables (`ai_action_queue`, `lead_journey_state`, `journey_event_log`) and columns (`manage_lead_journeys` on `autonomous_settings`) that don't exist in the generated Supabase types yet. The types file is auto-generated and cannot be manually edited.

**Fix:** Use the `.from()` call with explicit type casting to bypass TypeScript validation:
- Replace `supabase.from('ai_action_queue')` with `(supabase as any).from('ai_action_queue')`
- Same for `lead_journey_state` and `journey_event_log`
- Cast the `autonomous_settings` select to include `manage_lead_journeys`

This is the standard workaround when migrations add tables but the types haven't regenerated yet. Once types regenerate, the casts can be removed.

---

## Summary of Changes

| File | Error Count | Fix |
|------|------------|-----|
| `ai-brain/index.ts` | 1 | Remove `supabase.raw()`, update access_count separately |
| `demo-call/index.ts` | 1 | Cast `error as Error` |
| `demo-scrape-website/index.ts` | 1 | Cast `error as Error` |
| `demo-sms-reply/index.ts` | 1 | Cast `error as Error` |
| `setup-lady-jarvis/index.ts` | 1 | Cast `error as Error` |
| `retell-call-webhook/index.ts` | 3 | Add `variant_id` to metadata interface |
| `twilio-integration/index.ts` | 6 | Add type annotations + add action to union |
| `ActionQueuePanel.tsx` | 7 | Cast supabase client for new tables |
| `LeadJourneyDashboard.tsx` | 10 | Cast supabase client for new tables + columns |

**Total: 15 errors across 9 files -- all surgical fixes, no feature changes.**

