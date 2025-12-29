# Voice Broadcast Webhook FAQ

## Quick Answer: Do I Need Webhooks for Internal Agent Transfers?

### ✅ **YES - Webhooks are ALWAYS required!**

Even if you're transferring to your own internal agent numbers, the webhook is **essential** and **cannot be bypassed**.

---

## Why?

The webhook (`twilio-dtmf-handler`) serves three critical purposes:

### 1. 🎛️ **Call Control**
- Twilio doesn't automatically know what to do when someone presses a digit
- The webhook **must** return TwiML instructions telling Twilio to transfer the call
- Without the webhook, the transfer simply won't happen

### 2. 📊 **Tracking & Analytics**
- Updates broadcast queue status (transferred, answered, callback, dnc)
- Increments broadcast statistics (transfers_completed, calls_answered, etc.)
- Tracks which DTMF digit was pressed
- Logs the interaction for reporting

### 3. 🔧 **Business Logic**
- Handles DNC (Do Not Call) requests
- Schedules callbacks
- Updates lead records
- Processes custom actions

---

## Common Misunderstanding

❌ **WRONG**: "If I transfer to my own agent number, I don't need a webhook because it's internal"

✅ **CORRECT**: "The webhook is required for ALL transfers - internal or external - because Twilio needs instructions on what to do"

---

## The Flow

```
1. Voice Broadcast Call → Recipient listens to message
2. Recipient Presses 1 → Twilio receives DTMF
3. Twilio Calls Webhook ← **REQUIRED STEP**
4. Webhook Returns TwiML → Instructions for transfer
5. Twilio Executes Transfer → Calls the agent number
6. Webhook Updates Database → Tracks the transfer
```

**Without step 3-4**: Call ends with "An error occurred. Goodbye."

---

## Two Different Webhooks - Don't Confuse Them!

### Voice Broadcast DTMF Webhook
- **File**: `supabase/functions/twilio-dtmf-handler/index.ts`
- **Purpose**: Handle DTMF responses during voice broadcasts
- **Used When**: YOU send broadcasts → people press digits → transfer to agents
- **Always Required**: ✅ YES

### Inbound Transfer Webhook
- **File**: `supabase/functions/inbound-transfer-webhook/index.ts`
- **Purpose**: Receive leads from external systems
- **Used When**: External system (VICIdial) sends YOU qualified leads
- **Required Only If**: You're receiving inbound transfers from external systems

---

## What Happens Without the Webhook?

If `twilio-dtmf-handler` is not available or not working:

❌ **Transfers fail** - No TwiML returned to Twilio  
❌ **Statistics don't update** - No tracking of responses  
❌ **Calls drop** - Recipient hears error message  
❌ **No DNC handling** - Can't remove people from lists  
❌ **No callback scheduling** - Business logic doesn't execute  

---

## Configuration Example

### Voice Broadcast with Internal Agent Transfer

```json
{
  "name": "Solar Lead Broadcast",
  "audio_url": "https://storage.example.com/solar-message.mp3",
  "dtmf_actions": [
    {
      "digit": "1",
      "action": "transfer",
      "transfer_to": "+15559876543",  // ← Your internal agent number
      "label": "Talk to a solar expert"
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

**What happens when someone presses 1:**
1. Twilio receives DTMF digit "1"
2. Twilio calls: `https://[project].supabase.co/functions/v1/twilio-dtmf-handler?transfer=+15559876543&...`
3. Webhook returns TwiML: `<Dial><Number>+15559876543</Number></Dial>`
4. Twilio transfers call to +15559876543 (your agent)
5. Your agent's phone rings

**The webhook is in step 2-3 and is MANDATORY!**

---

## Testing Your Webhook

### Test that it's working:

```bash
curl -X POST 'https://your-project.supabase.co/functions/v1/twilio-dtmf-handler?transfer=%2B15559876543&queue_item_id=test&broadcast_id=test' \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "Digits=1&From=%2B15551234567&To=%2B15559876543"
```

**Expected response:**
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

---

## Need More Information?

📖 **Comprehensive Guide**: See [VOICE_BROADCAST_TRANSFER_GUIDE.md](./VOICE_BROADCAST_TRANSFER_GUIDE.md)

This FAQ covers the quick answer. The full guide includes:
- Detailed flow diagrams
- Technical implementation details
- Complete configuration checklist
- Troubleshooting guide
- Testing procedures
- Code examples

---

## Summary

**Question**: "Do I need a webhook if I transfer to an internal agent?"

**Answer**: **YES** - The webhook is always required. It doesn't matter if the transfer is to:
- Your own agent (internal)
- A call center (external)
- Any phone number anywhere

The webhook is about **how the transfer works**, not **where** the call is going.

Without the webhook:
- ❌ No transfers work
- ❌ No tracking happens
- ❌ Calls fail

With the webhook:
- ✅ Transfers work perfectly
- ✅ Full tracking and analytics
- ✅ Business logic executes
- ✅ Works for internal AND external numbers
