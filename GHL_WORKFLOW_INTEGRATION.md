# GHL Workflow ↔ Voice Broadcast Integration

This document describes the integration between GoHighLevel (GHL) workflows and Dial Smart voice broadcasts.

## Overview

This integration enables:
1. **GHL → Dial Smart**: GHL workflows can trigger voice broadcasts by adding contacts via webhook
2. **Dial Smart → GHL**: Call outcomes are automatically synced back to GHL contacts with tags, custom fields, and activity notes

## Architecture

```
GHL Workflow (HTTP Request Step)
         │
         ▼ Webhook (per contact)
┌─────────────────────────────────────┐
│  ghl-webhook-trigger                │
│  - Validates webhook_key            │
│  - Adds contact to broadcast_queue  │
│  - Stores ghl_contact_id            │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  broadcast_queue                    │
│  + ghl_contact_id                   │
│  + ghl_callback_status              │
└─────────────────────────────────────┘
         │
         ▼ (calls processed by voice-broadcast-engine)
┌─────────────────────────────────────┐
│  call-tracking-webhook              │
│  + Inserts to ghl_pending_updates   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  ghl_pending_updates                │
│  - Batched outcomes for GHL sync    │
└─────────────────────────────────────┘
         │
         ▼ (triggered on broadcast complete)
┌─────────────────────────────────────┐
│  ghl-batch-callback                 │
│  - Updates GHL contacts in batches  │
│  - Adds tags, custom fields, notes  │
└─────────────────────────────────────┘
         │
         ▼
    GHL Contact Updated
```

---

## Setup Instructions

### Step 1: Generate Webhook Key

1. Go to **Settings → GHL Integration → Webhook tab**
2. Click **"Generate Key"** to create your unique webhook key
3. Copy and save your webhook key securely

### Step 2: Create Custom Fields in GHL

Before the integration can sync data back to GHL, you need these custom fields:

| Field Name | Key | Type |
|------------|-----|------|
| Last Broadcast Date | `last_broadcast_date` | Date |
| Broadcast Outcome | `broadcast_outcome` | Text |
| Broadcast Name | `broadcast_name` | Text |
| Broadcast DTMF Pressed | `broadcast_dtmf_pressed` | Text |
| Broadcast Callback Requested | `broadcast_callback_requested` | Text |
| Broadcast Callback Time | `broadcast_callback_time` | Date |

**Easy Setup**: Use the "Setup Broadcast Fields" button in the GHL Field Mapping tab to create these automatically.

### Step 3: Configure GHL Workflow

In your GHL workflow, add an **HTTP Request** step with:

**Method**: POST

**URL**: 
```
https://emonjusymdripmkvtttc.supabase.co/functions/v1/ghl-webhook-trigger
```

**Headers**:
```
Content-Type: application/json
```

**Body**:
```json
{
  "action": "add_to_broadcast",
  "webhook_key": "YOUR_WEBHOOK_KEY",
  "broadcast_id": "YOUR_BROADCAST_UUID",
  "phone": "{{contact.phone}}",
  "name": "{{contact.firstName}} {{contact.lastName}}",
  "ghl_contact_id": "{{contact.id}}",
  "email": "{{contact.email}}"
}
```

### Step 4: Get Your Broadcast ID

1. Create a voice broadcast in Dial Smart
2. Open the broadcast settings
3. Copy the broadcast ID from the URL or settings panel

---

## API Reference

### ghl-webhook-trigger

**Endpoint**: `POST /functions/v1/ghl-webhook-trigger`

**Authentication**: Via `webhook_key` in request body

#### Actions

##### add_to_broadcast
Add a contact to a voice broadcast queue.

**Request**:
```json
{
  "action": "add_to_broadcast",
  "webhook_key": "wh_abc123...",
  "broadcast_id": "uuid-of-broadcast",
  "phone": "+15551234567",
  "name": "John Smith",
  "ghl_contact_id": "ghl-contact-id",
  "email": "john@example.com"
}
```

**Response**:
```json
{
  "success": true,
  "queue_item_id": "uuid",
  "position": 47,
  "broadcast_name": "Friday Campaign",
  "broadcast_status": "active",
  "message": "Contact added to broadcast queue"
}
```

**Error Responses**:
- `401`: Invalid or missing webhook key
- `404`: Broadcast not found
- `429`: Rate limit exceeded (100 req/min)

##### test
Test webhook connectivity.

```json
{
  "action": "test",
  "webhook_key": "wh_abc123..."
}
```

##### list_broadcasts
List available broadcasts for your account.

```json
{
  "action": "list_broadcasts",
  "webhook_key": "wh_abc123..."
}
```

---

### ghl-batch-callback

**Endpoint**: `POST /functions/v1/ghl-batch-callback`

**Authentication**: Bearer token (JWT or service role)

#### Actions

##### process_broadcast
Process all pending GHL updates for a specific broadcast.

```json
{
  "action": "process_broadcast",
  "broadcast_id": "uuid-of-broadcast"
}
```

##### process_pending
Process all pending updates (used for scheduled runs).

```json
{
  "action": "process_pending",
  "user_id": "optional-user-id"
}
```

##### get_status
Get callback status counts for a broadcast.

```json
{
  "action": "get_status",
  "broadcast_id": "uuid-of-broadcast"
}
```

---

## Data Synced to GHL

### Tags Added
Based on call outcome:

| Outcome | Tag |
|---------|-----|
| Human answered | `broadcast_answered` |
| Voicemail left | `broadcast_voicemail_left` |
| No answer (max retries) | `broadcast_no_answer` |
| Busy (max retries) | `broadcast_busy` |
| Call failed | `broadcast_failed` |

### Custom Fields Updated

| Field | Value |
|-------|-------|
| `last_broadcast_date` | Timestamp of the call |
| `broadcast_outcome` | answered, voicemail, no_answer, busy, failed |
| `broadcast_name` | Name of the broadcast campaign |
| `broadcast_dtmf_pressed` | Key pressed (1-9) if any |
| `broadcast_callback_requested` | true/false |
| `broadcast_callback_time` | Scheduled callback time if requested |

### Activity Notes
An activity note is added to the contact with:
- Broadcast name
- Call outcome
- DTMF pressed (if any)
- Callback requested status
- Call duration
- Timestamp

---

## Database Schema

### ghl_pending_updates

Stores call outcomes waiting to be synced to GHL.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Owner of the broadcast |
| ghl_contact_id | TEXT | GHL contact ID |
| broadcast_id | UUID | Reference to voice_broadcasts |
| broadcast_name | TEXT | Cached broadcast name |
| call_outcome | TEXT | answered, voicemail, no_answer, etc. |
| call_duration_seconds | INTEGER | Call duration |
| call_timestamp | TIMESTAMPTZ | When the call occurred |
| dtmf_pressed | TEXT | Key pressed during call |
| callback_requested | BOOLEAN | Whether callback was requested |
| callback_time | TIMESTAMPTZ | Scheduled callback time |
| status | TEXT | pending, processing, sent, failed |
| retry_count | INTEGER | Number of sync attempts |
| error_message | TEXT | Last error if failed |

### broadcast_queue additions

| Column | Type | Description |
|--------|------|-------------|
| ghl_contact_id | TEXT | GHL contact ID for callback |
| ghl_callback_status | TEXT | pending, queued, sent, skipped, failed |

### ghl_sync_settings addition

| Column | Type | Description |
|--------|------|-------------|
| broadcast_webhook_key | TEXT | Unique key for webhook authentication |

---

## Security

1. **Webhook Authentication**: Each user has a unique webhook key that must be included in every request
2. **Rate Limiting**: Maximum 100 requests per minute per webhook key
3. **Input Validation**: Phone numbers normalized to E.164, UUIDs validated
4. **DNC Check**: Contacts are checked against the Do Not Call list before adding to queue
5. **User Isolation**: Users can only access their own broadcasts and contacts

---

## Troubleshooting

### "Invalid webhook key"
- Verify you're using the correct webhook key from Settings → GHL Integration → Webhook tab
- Try regenerating the key if you think it may have been compromised

### "Broadcast not found"
- Verify the broadcast_id is correct
- Ensure the broadcast belongs to your account
- Check that the broadcast is not completed or cancelled

### "Rate limit exceeded"
- Wait 1 minute before retrying
- If you need higher limits, batch your GHL workflow to send fewer concurrent requests

### Contacts not syncing back to GHL
1. Check that GHL credentials are configured in Settings → GHL Integration
2. Verify the custom fields exist in your GHL account
3. Check the ghl_pending_updates table for failed entries

### Call outcomes not showing in GHL
1. Verify broadcast has completed processing
2. Check ghl_pending_updates for status = 'failed'
3. Look for error_message in failed records

---

## Best Practices

1. **Test First**: Use the "Test Webhook" button before adding to production workflows
2. **Create Fields First**: Set up all custom fields in GHL before running broadcasts
3. **Monitor**: Check the Webhook tab for recent activity and any failures
4. **Batch Workflows**: If adding many contacts, consider using GHL's bulk actions instead of individual workflow triggers
5. **Handle Duplicates**: The system automatically skips duplicate phone numbers in the same broadcast

---

*Last Updated: February 4, 2026*
