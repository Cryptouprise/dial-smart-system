# Lovable Agent Instructions for Dial Smart System

## 🚨 CRITICAL RULE: Check Dependencies Before ANY Code Change

This system has 63 edge functions and 280+ frontend files with **tightly interconnected features**. Changes in one area often break others.

### BEFORE Making Any Change:

1. **Search for ALL references** to what you're changing:
   ```bash
   grep -ri "feature_name" src/ supabase/
   ```

2. **Check these 5 critical integration points:**
   - **Voicemail/AMD Detection** → Used by AI calls AND voice broadcasts
   - **SMS Processing** → Auto-reply, workflows, broadcasts all connected
   - **Disposition Routing** → Affects pipelines, workflows, analytics
   - **Lead Status** → Triggers campaigns, scoring, analytics
   - **Campaign Execution** → Multiple services coordinate

3. **Ask yourself:**
   - What features use this code?
   - Will this break voice broadcasts? SMS? Workflows? Campaigns?
   - Are there parallel implementations (Retell/Twilio/Telnyx)?
   - What if data is null/missing?

4. **If impact is unclear → ASK THE USER** before proceeding:
   ```
   "I found [feature] is used by [A, B, C]. 
   Changing it could affect [impacts]. 
   Options: [list with risk levels]. 
   Which approach would you prefer?"
   ```

## 🛡️ Safety Patterns (ALWAYS Follow)

### Database Queries:
```typescript
// ❌ WRONG - crashes if no data
const { data } = await supabase.from('table').select('*').eq('id', id).single();

// ✅ CORRECT - safe
const { data } = await supabase.from('table').select('*').eq('id', id).maybeSingle();
if (!data) return { error: 'Not found' };
```

### Edge Functions - Support Both Auth Types:
```typescript
// Service-to-service calls use service role key, not JWT
const token = authHeader.replace('Bearer ', '');
let userId: string | null = null;
const requestBody = await req.json();

if (token === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') && requestBody.user_id) {
  userId = requestBody.user_id; // Internal call
} else {
  const { data: { user } } = await supabase.auth.getUser(token);
  if (!user) throw new Error('Unauthorized');
  userId = user.id; // JWT call
}
```

### Always Validate Inputs:
```typescript
// UUIDs: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Phone: Clean and normalize to E.164 format
// Quantities: Check min/max bounds (1-100)
```

## 🎯 Think Like a Business Owner

Before every change, ask:
- **Will this confuse users?** → Keep UX simple
- **Will this cause calls/SMS to fail?** → Reliability is critical
- **Will this increase costs?** → API usage adds up
- **Will this break compliance?** → TCPA/FCC rules are law
- **Will this lose data?** → Never delete without confirmation
- **Can this scale?** → Consider bulk operations

## ⚠️ NEVER Do Without Confirmation:

- Delete edge functions (may be used by multiple features)
- Remove database columns (breaks existing queries)
- Change authentication logic (locks out users)
- Modify provider API calls (breaks all calls/SMS)
- Remove error handling (causes silent failures)

## 📋 Quick Pre-Change Checklist:

1. ✅ Searched codebase for all references
2. ✅ Identified all affected features
3. ✅ Checked 5 critical integration points
4. ✅ Considered edge cases (null, missing config, API failures)
5. ✅ Using `.maybeSingle()` not `.single()`
6. ✅ Adding null checks after queries
7. ✅ Validating all inputs
8. ✅ Supporting both JWT and service role auth
9. ✅ Will test: build, lint, and manual verification

## 🔍 Real Example: Voicemail Detection

**User Request:** "Remove voicemail detection for AI agents"

**BAD Response:** ❌ Removes AMD webhook → Voice broadcasts break

**GOOD Response:** ✅
```
I found voicemail detection is used by:
1. AI agent calls (retell-call-webhook)
2. Voice broadcasts (voice-broadcast-queue)
3. Advanced dialer settings (UI)

Removing it completely would break broadcasts.

Options:
A) Add per-feature config flag (Low risk) ✅ RECOMMENDED
B) Remove from AI only (Medium risk)
C) Complete removal + redesign (High risk)

Which approach would you prefer?
```

## 🚀 Success = Zero Breaking Changes

Make minimal, surgical changes. Search first, ask when uncertain, test thoroughly.

**When in doubt, ASK. Better to clarify than to break the system.**

---

For full details, see: LOVABLE_CODING_INSTRUCTIONS.md, CODING_CHECKLIST.md, BUG_PREVENTION_PROTOCOL.md
