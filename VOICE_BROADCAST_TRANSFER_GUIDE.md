# Voice Broadcast Transfer & Webhook Guide

## Question: Do We Need Webhooks for Internal Agent Transfers?

**Short Answer: YES** - Webhooks are **always required** for voice broadcast transfers, even when transferring to internal agents.

## Understanding the Flow

### Voice Broadcast Transfer Flow (When Someone Presses 1)

```
1. Voice Broadcast Call Made
   ↓
2. Recipient Listens to Audio Message
   ↓
3. Recipient Presses 1 (or other DTMF digit)
   ↓
4. Twilio Calls the DTMF Handler Webhook ← **WEBHOOK REQUIRED HERE**
   ↓
5. Webhook Returns TwiML Instructions
   ↓
6. Twilio Executes Transfer to Agent
```

### Why the Webhook is Required

The `twilio-dtmf-handler` webhook is **essential** for several reasons:

#### 1. **Twilio Needs Instructions**
- Twilio doesn't automatically know what to do when a digit is pressed
- The webhook must return TwiML (Twilio Markup Language) to tell Twilio to transfer the call
- Example TwiML returned by webhook:
  ```xml
  <Response>
    <Say>Connecting you now.</Say>
    <Dial timeout="30">
      <Number>+15551234567</Number>
    </Dial>
  </Response>
  ```

#### 2. **Call Tracking & Analytics**
- The webhook updates the `broadcast_queue` table with:
  - Status (transferred, answered, callback, dnc, completed)
  - DTMF digit pressed
  - Timestamp of interaction
- Updates broadcast statistics:
  - `calls_answered` count
  - `transfers_completed` count
  - `callbacks_scheduled` count
  - `dnc_requests` count

#### 3. **Business Logic Processing**
- **Transfer (Press 1)**: Creates TwiML to dial the transfer number
- **Callback (Press 2)**: Schedules callback and updates lead record
- **DNC (Press 3)**: Adds to Do Not Call list, updates lead status
- **Other**: Marks as completed

## Internal vs External Transfers

### Internal Transfer (Agent in Your System)
- **Transfer To**: Your own phone number registered in the system
- **Webhook Required**: ✅ YES
- **Webhook Used**: `twilio-dtmf-handler`
- **Purpose**: Handle DTMF response, return transfer TwiML, track stats
- **Example**: Transfer to agent number `+15559876543` (your number)

```json
// Voice broadcast configuration
{
  "dtmf_actions": [
    {
      "digit": "1",
      "action": "transfer",
      "transfer_to": "+15559876543",  // ← Your internal agent number
      "label": "Talk to an agent"
    }
  ]
}
```

**Flow:**
1. Call recipient presses 1
2. Twilio calls webhook: `/functions/v1/twilio-dtmf-handler?transfer=+15559876543&...`
3. Webhook returns `<Dial><Number>+15559876543</Number></Dial>`
4. Twilio transfers call to your agent
5. Your agent's phone rings and they answer

### External Inbound Transfer (VICIdial → You)
- **Transfer From**: External system like VICIdial
- **Webhook Required**: ✅ YES (different webhook)
- **Webhook Used**: `inbound-transfer-webhook`
- **Purpose**: Receive lead data from external system
- **Example**: VICIdial pushes hot lead to you with metadata

```json
// VICIdial sends to inbound-transfer-webhook
{
  "from_number": "+15551234567",
  "to_number": "+15559876543",  // ← Your number
  "client_info": {
    "first_name": "John",
    "last_name": "Doe"
  }
}
```

**Flow:**
1. VICIdial agent qualifies a lead
2. VICIdial calls webhook: `/functions/v1/inbound-transfer-webhook`
3. Webhook creates lead record in your system
4. VICIdial transfers call to your agent
5. Your agent has lead info before answering

## Common Scenarios Explained

### Scenario 1: Voice Broadcast to Your Own Agents
**Question**: "We send voice broadcasts, people press 1, we transfer to our internal agent numbers. Do we need webhooks?"

**Answer**: **YES** - The `twilio-dtmf-handler` webhook is required to:
- Receive the "1" press from Twilio
- Return TwiML to perform the transfer
- Track that the transfer happened
- Update broadcast statistics

**What You Need**:
- ✅ Voice broadcast configured with `dtmf_actions`
- ✅ `transfer_to` set to your agent's phone number
- ✅ `twilio-dtmf-handler` webhook endpoint active
- ✅ Agent phone number added to your account (optional but recommended)

**What You DON'T Need**:
- ❌ The `inbound-transfer-webhook` (that's for external systems)
- ❌ VICIdial integration
- ❌ Additional webhook authentication

### Scenario 2: External System Transfers To You
**Question**: "VICIdial is calling 500k numbers/day and transferring hot leads to us. Do we need webhooks?"

**Answer**: **YES** - The `inbound-transfer-webhook` is required to:
- Receive lead metadata from VICIdial
- Create/update lead records in your system
- Track inbound transfers
- Provide agent with lead context

**What You Need**:
- ✅ `inbound-transfer-webhook` endpoint active
- ✅ Webhook URL provided to VICIdial
- ✅ Your phone numbers added to your account
- ✅ Optional webhook secret for security

**What You DON'T Need**:
- ❌ Voice broadcast setup
- ❌ DTMF configuration

## Technical Implementation Details

### Voice Broadcast DTMF Handler Webhook

**Endpoint**: `https://[your-project].supabase.co/functions/v1/twilio-dtmf-handler`

**Called By**: Twilio (automatically when DTMF is pressed)

**Method**: POST

**Parameters**:
- `transfer`: Phone number to transfer to (from broadcast config)
- `queue_item_id`: ID of the broadcast queue item
- `broadcast_id`: ID of the voice broadcast

**Request Body** (from Twilio):
- `Digits`: The digit pressed (e.g., "1")
- `From`: Caller's phone number
- `To`: Your phone number
- `CallSid`: Twilio's call identifier

**Response**: TwiML XML

**Example Response for Transfer**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial timeout="30">
    <Number>+15559876543</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>
```

### How It's Configured in Voice Broadcast Engine

```typescript
// In voice-broadcast-engine/index.ts (lines 560-563)
const dtmfActions = broadcast.dtmf_actions || [];
const transferAction = dtmfActions.find((a: any) => a.digit === '1' && a.action === 'transfer');
const transferNumber = transferAction?.transfer_to || '';
```

```typescript
// In voice-broadcast-engine/index.ts (lines 175-177)
const dtmfActionUrl = transferNumber 
  ? `${dtmfHandlerUrl}?transfer=${encodeURIComponent(transferNumber)}&queue_item_id=${encodeURIComponent(String(metadata.queue_item_id || ''))}&broadcast_id=${encodeURIComponent(String(metadata.broadcast_id || ''))}`
  : `${dtmfHandlerUrl}?queue_item_id=${encodeURIComponent(String(metadata.queue_item_id || ''))}&broadcast_id=${encodeURIComponent(String(metadata.broadcast_id || ''))}`;
```

### What Happens Without the Webhook

**If the webhook fails or is not configured:**
- ❌ Transfer will NOT happen (no TwiML returned)
- ❌ Call statistics will NOT be tracked
- ❌ Broadcast queue status will NOT update
- ❌ Agent will NOT receive the call
- ❌ Caller will hear "An error occurred. Goodbye." or timeout

**The webhook is not optional** - it's a critical part of the voice broadcast transfer functionality.

## Configuration Checklist

### For Voice Broadcast Internal Transfers

- [ ] **Voice Broadcast Created**
  - Broadcast configured in system
  - Audio message uploaded or TTS generated
  - Target list uploaded

- [ ] **DTMF Actions Configured**
  ```json
  {
    "dtmf_actions": [
      {
        "digit": "1",
        "action": "transfer",
        "transfer_to": "+15559876543",
        "label": "Speak with an agent"
      },
      {
        "digit": "2",
        "action": "callback",
        "label": "Request a callback"
      },
      {
        "digit": "3",
        "action": "dnc",
        "label": "Remove from list"
      }
    ]
  }
  ```

- [ ] **Webhook Endpoint Active**
  - Edge function `twilio-dtmf-handler` deployed
  - Endpoint accessible at: `https://[project].supabase.co/functions/v1/twilio-dtmf-handler`
  - Test with curl to verify it's working

- [ ] **Transfer Number Valid**
  - Phone number in E.164 format (e.g., `+15559876543`)
  - Number can receive calls
  - Optionally added to your system's phone numbers

- [ ] **Twilio Configuration**
  - Twilio credentials configured
  - Account has sufficient balance
  - Numbers configured for outbound calling

## Testing Your Setup

### Test Voice Broadcast Transfer

1. **Create a test broadcast**:
   ```json
   {
     "name": "Test Transfer",
     "audio_url": "https://your-audio.mp3",
     "dtmf_actions": [
       {
         "digit": "1",
         "action": "transfer",
         "transfer_to": "+1YOUR_PHONE_NUMBER"
       }
     ]
   }
   ```

2. **Add your own number to the broadcast list**

3. **Start the broadcast**

4. **When you receive the call**:
   - Listen to the message
   - Press 1
   - Verify you get "Connecting you now"
   - Verify the call transfers to the specified number

5. **Check tracking**:
   - Broadcast queue should show status = "transferred"
   - Broadcast stats should show `transfers_completed` incremented
   - Call logs should show the transfer

### Test Webhook Directly

```bash
# Simulate Twilio calling the webhook
curl -X POST 'https://your-project.supabase.co/functions/v1/twilio-dtmf-handler?transfer=%2B15559876543&queue_item_id=test-queue-id&broadcast_id=test-broadcast-id' \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Digits=1&From=%2B15551234567&To=%2B15559876543&CallSid=CAxxxx"
```

**Expected Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting you now.</Say>
  <Dial timeout="30">
    <Number>+15559876543</Number>
  </Dial>
  <Say>We could not connect you. Goodbye.</Say>
  <Hangup/>
</Response>
```

## Troubleshooting

### Transfer Not Working

**Problem**: Press 1 but call doesn't transfer

**Possible Causes**:
1. **Webhook not responding**
   - Check Supabase Edge Function logs
   - Verify endpoint is deployed and accessible
   - Check for errors in logs

2. **Transfer number invalid**
   - Verify E.164 format: `+15559876543`
   - Verify number can receive calls
   - Check for typos in configuration

3. **Twilio configuration issue**
   - Verify Twilio credentials are correct
   - Check Twilio account balance
   - Review Twilio call logs for errors

4. **DTMF action not configured**
   - Verify `dtmf_actions` array in broadcast
   - Check `digit: "1"` matches what you're pressing
   - Verify `action: "transfer"` is set
   - Verify `transfer_to` has valid number

### Statistics Not Updating

**Problem**: Transfers work but stats don't update

**Solution**:
- Check webhook logs for database update errors
- Verify `queue_item_id` and `broadcast_id` are passed correctly
- Check database permissions for edge function
- Review `broadcast_queue` and `voice_broadcasts` tables for updates

### Call Drops After Pressing 1

**Problem**: Call disconnects instead of transferring

**Solution**:
- Webhook timeout or error - check logs
- Invalid TwiML returned - verify XML format
- Twilio call timeout - check timeout settings
- Destination number unreachable - test the number directly

## Summary

### The Key Takeaway

**Webhooks are ALWAYS required for voice broadcast transfers**, regardless of whether you're transferring to:
- ✅ Internal agents (your own numbers)
- ✅ External numbers
- ✅ Call centers
- ✅ Any phone number

The webhook is **not about** where the call is going - it's about:
- 📊 **Tracking**: Recording what happened in the broadcast
- 🎛️ **Control**: Telling Twilio what to do next
- 📈 **Analytics**: Updating statistics and metrics
- 🔄 **Flow**: Returning TwiML instructions for call control

### Two Different Webhooks

| Webhook | Purpose | When Used |
|---------|---------|-----------|
| `twilio-dtmf-handler` | Handle voice broadcast DTMF responses | You send broadcasts, people press digits, calls get transferred |
| `inbound-transfer-webhook` | Receive external system transfers | External systems (VICIdial) send you leads with metadata |

**These are separate webhooks for separate purposes!**

## Related Documentation

- [INBOUND_TRANSFER_INTEGRATION.md](./INBOUND_TRANSFER_INTEGRATION.md) - External system transfers TO you
- [INBOUND_TRANSFER_QUICK_START.md](./INBOUND_TRANSFER_QUICK_START.md) - Quick reference for inbound transfers
- Voice broadcast engine: `supabase/functions/voice-broadcast-engine/index.ts`
- DTMF handler: `supabase/functions/twilio-dtmf-handler/index.ts`

## Questions?

If you have questions about:
- **Voice broadcast transfers** (press 1 to talk to agent) → This document
- **External system transfers** (VICIdial → You) → See INBOUND_TRANSFER_INTEGRATION.md
- **General voice broadcast setup** → See voice broadcast documentation
