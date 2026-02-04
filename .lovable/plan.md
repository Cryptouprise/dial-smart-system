
# GHL Workflow ↔ Voice Broadcast Integration - Implementation Plan

## Overview

This plan implements a complete integration between GoHighLevel workflows and Dial Smart voice broadcasts, enabling:
- GHL workflows to trigger voice broadcasts via webhook
- Dial Smart to send call outcomes back to GHL contacts
- One-click setup for all required GHL custom fields

---

## Phase 1: Database Schema Changes

### 1.1 Add webhook key and GHL columns to existing tables

```sql
-- Add webhook_key to ghl_sync_settings
ALTER TABLE ghl_sync_settings ADD COLUMN broadcast_webhook_key TEXT UNIQUE;

-- Add GHL tracking columns to broadcast_queue  
ALTER TABLE broadcast_queue 
  ADD COLUMN ghl_contact_id TEXT,
  ADD COLUMN ghl_callback_status TEXT DEFAULT 'pending' 
    CHECK (ghl_callback_status IN ('pending', 'queued', 'sent', 'skipped', 'failed'));

-- Create index for GHL contact lookups
CREATE INDEX idx_broadcast_queue_ghl_contact ON broadcast_queue(ghl_contact_id) 
  WHERE ghl_contact_id IS NOT NULL;
```

### 1.2 Create new table: `ghl_pending_updates`

Stores call outcomes waiting to be sent back to GHL in batches:

```sql
CREATE TABLE ghl_pending_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  ghl_contact_id TEXT NOT NULL,
  broadcast_id UUID REFERENCES voice_broadcasts(id),
  queue_item_id UUID REFERENCES broadcast_queue(id),
  broadcast_name TEXT,
  call_outcome TEXT NOT NULL,
  call_duration_seconds INTEGER,
  call_timestamp TIMESTAMPTZ,
  dtmf_pressed TEXT,
  callback_requested BOOLEAN DEFAULT FALSE,
  callback_time TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
```

---

## Phase 2: New Edge Function - `ghl-webhook-trigger`

### Purpose
Receive webhooks from GHL workflows and add contacts to voice broadcast queues.

### Location
`supabase/functions/ghl-webhook-trigger/index.ts`

### Authentication
- Uses `webhook_key` instead of JWT (external callers)
- Validates key against `ghl_sync_settings.broadcast_webhook_key`

### Request Format
```json
{
  "action": "add_to_broadcast",
  "webhook_key": "user-secret-key",
  "broadcast_id": "uuid-of-broadcast",
  "phone": "+15551234567",
  "name": "John Smith",
  "ghl_contact_id": "ghl-contact-id-here"
}
```

### Key Logic
1. Validate webhook_key against stored keys
2. Find user by webhook_key
3. Verify broadcast exists and belongs to user
4. Normalize phone to E.164 format
5. Check DNC list
6. Insert into `broadcast_queue` with `ghl_contact_id`
7. Return queue position

### Config
Add to `supabase/config.toml`:
```toml
[functions.ghl-webhook-trigger]
verify_jwt = false  # External webhook
```

---

## Phase 3: New Edge Function - `ghl-batch-callback`

### Purpose
Process pending GHL updates in batches and send call outcomes back to GHL contacts.

### Location
`supabase/functions/ghl-batch-callback/index.ts`

### Triggers
- Called when a broadcast completes
- Can be called manually or on schedule

### Request Format
```json
{
  "action": "process_broadcast",
  "broadcast_id": "uuid-of-completed-broadcast"
}
```

### GHL Updates Per Contact
**Tags Added:**
- `broadcast_answered`
- `broadcast_voicemail_left`
- `broadcast_no_answer`
- `broadcast_busy`
- `broadcast_failed`

**Custom Fields Updated:**
- `last_broadcast_date` (DATE)
- `broadcast_outcome` (TEXT)
- `broadcast_name` (TEXT)
- `broadcast_dtmf_pressed` (TEXT)
- `broadcast_callback_requested` (TEXT)
- `broadcast_callback_time` (DATE)

**Notes Added:**
Activity note with call summary

### Key Logic
1. Query `ghl_pending_updates` where status = 'pending'
2. Group by user_id
3. For each user: get GHL credentials
4. Process in batches of 50
5. Update GHL contacts via API
6. Mark updates as 'sent' or 'failed'

### Config
Add to `supabase/config.toml`:
```toml
[functions.ghl-batch-callback]
verify_jwt = true  # Internal use only
```

---

## Phase 4: Modify Existing Edge Functions

### 4.1 Modify `call-tracking-webhook`

**Location:** Lines ~436-450 after queue item status update

**Add Logic:**
When a broadcast call completes, if `queueItem.ghl_contact_id` exists:
1. Determine callback requested based on DTMF
2. Insert record into `ghl_pending_updates`
3. Update `broadcast_queue.ghl_callback_status = 'queued'`

### 4.2 Modify `voice-broadcast-engine`

**Location:** When broadcast status changes to 'completed'

**Add Logic:**
Invoke `ghl-batch-callback` to process all pending updates for this broadcast:
```typescript
await supabase.functions.invoke('ghl-batch-callback', {
  body: { action: 'process_broadcast', broadcast_id: broadcast.id }
});
```

---

## Phase 5: Frontend UI Components

### 5.1 New Component: `GHLWebhookConfig.tsx`

**Location:** `src/components/settings/GHLWebhookConfig.tsx`

**Features:**
- Generate/regenerate webhook key button
- Display copyable webhook URL
- Show GHL workflow configuration template
- Test webhook endpoint button
- View recent webhook activity (optional)

### 5.2 Add Broadcast Fields Setup Section

**Location:** Modify `src/components/GHLFieldMappingTab.tsx`

**Add to SYSTEM_FIELDS:**
```typescript
broadcastData: {
  label: 'Voice Broadcast',
  fields: [
    { key: 'lastBroadcastDate', label: 'Last Broadcast Date', ... },
    { key: 'broadcastOutcome', label: 'Broadcast Outcome', ... },
    { key: 'broadcastName', label: 'Broadcast Name', ... },
    { key: 'broadcastDtmf', label: 'DTMF Pressed', ... },
    { key: 'broadcastCallbackRequested', label: 'Callback Requested', ... },
    { key: 'broadcastCallbackTime', label: 'Callback Time', ... },
  ]
}
```

**Add "Setup Broadcast Fields" Button:**
- Detects which fields already exist in GHL
- Creates missing fields with one click
- Shows progress during creation

---

## Phase 6: Documentation Updates

### 6.1 Update AGENT.md

Add new section documenting the GHL workflow integration:
- How webhooks work
- Available custom fields
- Callback data mapping
- Troubleshooting guide

### 6.2 Create GHL_WORKFLOW_INTEGRATION.md

Comprehensive guide with:
- Architecture diagrams
- Setup instructions
- GHL workflow configuration steps
- API reference

---

## File Summary

### New Files

| File | Purpose |
|------|---------|
| `supabase/functions/ghl-webhook-trigger/index.ts` | Receive GHL workflow webhooks |
| `supabase/functions/ghl-batch-callback/index.ts` | Send outcomes back to GHL |
| `src/components/settings/GHLWebhookConfig.tsx` | Webhook configuration UI |
| `GHL_WORKFLOW_INTEGRATION.md` | Documentation |

### Modified Files

| File | Change |
|------|--------|
| `supabase/config.toml` | Add new function configs |
| `supabase/functions/call-tracking-webhook/index.ts` | Insert GHL pending updates |
| `supabase/functions/voice-broadcast-engine/index.ts` | Trigger batch callback |
| `src/components/GHLFieldMappingTab.tsx` | Add broadcast fields + setup button |
| `AGENT.md` | Add integration documentation |

### Database Migration

Single migration file with:
- `broadcast_webhook_key` column on `ghl_sync_settings`
- `ghl_contact_id` and `ghl_callback_status` columns on `broadcast_queue`
- New `ghl_pending_updates` table with RLS policies

---

## Security Considerations

1. **Webhook Authentication:** Unique key per user, validated on every request
2. **Rate Limiting:** Max 100 requests/minute per webhook key
3. **Input Validation:** Phone E.164 format, UUID validation
4. **DNC Check:** Contacts checked before adding to queue
5. **No sensitive data in logs:** Mask webhook keys in logs

---

## Testing Plan

1. **Unit Tests:**
   - Webhook key validation
   - Phone number normalization
   - DNC check logic

2. **Integration Tests:**
   - End-to-end webhook → broadcast queue flow
   - GHL API mocking for batch callbacks

3. **Manual Tests:**
   - Configure webhook in GHL workflow
   - Send test contact through workflow
   - Verify contact added to broadcast
   - Verify GHL contact updated after call

---

## Estimated Implementation Time

| Phase | Effort |
|-------|--------|
| Phase 1: Database Migration | 30 min |
| Phase 2: ghl-webhook-trigger | 1.5 hours |
| Phase 3: ghl-batch-callback | 2 hours |
| Phase 4: Modify existing functions | 1 hour |
| Phase 5: Frontend UI | 2 hours |
| Phase 6: Documentation | 1 hour |
| **Total** | **8 hours** |
