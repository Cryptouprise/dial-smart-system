

## Fix Build Errors in Telnyx Webhook + Missing Infrastructure

### What's Wrong

There are **2 TypeScript build errors** in `supabase/functions/telnyx-webhook/index.ts` and **1 missing database table** that need to be addressed.

---

### Error 1: Line 226 - Nonsensical conditional check
```
daily_calls: supabaseAdmin.rpc ? undefined : 0
```
`supabaseAdmin.rpc` is always a function (always truthy), so this condition always returns `undefined`. This was likely an attempt to skip the field. **Fix:** Simply remove the `daily_calls` field from the update since the comment says "Increment handled elsewhere."

### Error 2: Line 320 - `.catch()` on incompatible type
```
.then(() => {}).catch(() => {});
```
The Supabase `.insert()` returns a `PromiseLike` that doesn't have `.catch()`. **Fix:** Wrap in a standard `Promise.resolve()` or just `await` inside the existing try/catch block (which already handles failures).

### Missing Table: `telnyx_conversation_insights`
Line 285 inserts into `telnyx_conversation_insights`, but this table doesn't exist in the database. A migration is needed to create it.

---

### Missing Secret: Telnyx API Key
The secrets list shows no `TELNYX_API_KEY`. If Telnyx integration is active, this will likely be needed. You mentioned you might need to provide your API key -- I'll ask for it during implementation.

---

### Implementation Steps

1. **Fix line 226** - Remove the broken `daily_calls` field from the phone_numbers update
2. **Fix line 320** - Replace `.then().catch()` with a simple `await` (already inside try/catch)
3. **Create `telnyx_conversation_insights` table** via database migration with columns matching the insert on line 285 (user_id, telnyx_conversation_id, telnyx_assistant_id, telnyx_insight_group_id, call_log_id, lead_id, insights, raw_payload)
4. **Request Telnyx API key** as a Supabase secret if you want Telnyx functions to work

### Risk Assessment
- These are isolated fixes to the telnyx-webhook function only
- No other edge functions or frontend files reference these specific code paths
- The table creation is additive (no existing data affected)

