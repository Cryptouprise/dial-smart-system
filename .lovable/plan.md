

# Fix Telnyx Silent Calls + Ingest Reference Docs for Both Providers

## What's Actually Wrong

Two confirmed root causes for Telnyx call failures, both identified from your uploaded docs and production data:

### 1. ALL Telnyx calls fail with error 10015 (TeXML App ID invalid)
Every recent Telnyx call in your database failed with: `"Invalid value for connection_id (Call Control App ID)"`. The `outbound-calling` function sends calls to `POST /v2/texml/ai_calls/{texml_app_id}`, but the stored `telnyx_texml_app_id` values (e.g., `2928768894459971274`) are being rejected by Telnyx.

**Fix**: Add a fallback path. When the TeXML endpoint returns 10015, automatically retry using the direct AI Assistant Calls endpoint: `POST /v2/ai/assistants/{assistant_id}/calls` — which uses the `telnyx_assistant_id` directly and doesn't need a TeXML app ID at all. This is Method 3 from your reference doc.

### 2. Two assistants use voice 'astra' — which is SILENT
Your own reference doc (page 19, Section 12.1) explicitly states: **"Voice model 'astra' is SILENT — always use KokoroTTS or NaturalHD voices."** Two assistants in your DB use `Telnyx.NaturalHD.astra`:
- "Lexi" (assistant-e3ff...)
- "Rex - Conversion Intelligence" (assistant-31c3...)

**Fix**: Update both assistants' voice to a working voice like `Telnyx.KokoroTTS.af_heart` and add validation to prevent selecting 'astra' in the UI.

### 3. Retell already works — confirmed
The Retell path in `outbound-calling` already has full address/contact variable resolution with `custom_fields` fallback. No changes needed there.

---

## Implementation Plan

### Step 1: Fix the outbound-calling Telnyx path with dual-endpoint fallback
In `supabase/functions/outbound-calling/index.ts`, after the TeXML call attempt fails with 10015, add an automatic fallback to the direct assistant calls endpoint:

```
POST https://api.telnyx.com/v2/ai/assistants/{telnyx_assistant_id}/calls
{
  "assistant_id": "assistant-xxx",
  "from": "+1xxx",
  "to": "+1xxx",
  "dynamic_variables": { ... }
}
```

This bypasses the TeXML app ID entirely.

### Step 2: Fix silent 'astra' voice on existing assistants
- Run a DB update to change `voice` from `Telnyx.NaturalHD.astra` to `Telnyx.KokoroTTS.af_heart` on the two affected assistants
- Also push this voice change to the Telnyx API via the `telnyx-ai-assistant` edge function

### Step 3: Add 'astra' guard in the assistant editor
In `TelnyxAssistantEditor.tsx`, add a warning/block when the user selects a voice containing 'astra', since it's known to produce silent calls.

### Step 4: Save the reference docs into the codebase
- Update `docs/TELNYX_EXPERT_REFERENCE.md` with the new content from the uploaded docs (API endpoints, create assistant payload, dynamic variables webhook format, outbound calling methods, lessons learned)
- Update `.lovable/skills/telnyx-expert-reference.md` with the critical operational knowledge

### Step 5: Deploy and test
- Deploy `outbound-calling` edge function
- Deploy `telnyx-ai-assistant` if voice fix requires API push
- Test a Telnyx call to verify it connects and speaks

---

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/outbound-calling/index.ts` | Add 10015 fallback to direct assistant calls endpoint |
| `src/components/TelnyxAssistantEditor.tsx` | Add 'astra' voice warning |
| `docs/TELNYX_EXPERT_REFERENCE.md` | Merge new reference content |
| `.lovable/skills/telnyx-expert-reference.md` | Update with operational knowledge |
| DB migration | Update 2 assistants' voice from astra to KokoroTTS |

