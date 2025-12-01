# Multi-Carrier Provider Integration Guide

This document describes how to set up and use the multi-carrier provider integration for Dial Smart System. The system supports **Retell AI**, **Telnyx**, and **Twilio** as telephony providers with intelligent routing, STIR/SHAKEN support, SMS, and ringless voicemail (RVM) capabilities.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Environment Variables](#environment-variables)
4. [Adding Provider Credentials](#adding-provider-credentials)
5. [Importing Phone Numbers](#importing-phone-numbers)
6. [Carrier Routing](#carrier-routing)
7. [STIR/SHAKEN Support](#stirshaken-support)
8. [SMS Integration](#sms-integration)
9. [Ringless Voicemail (RVM)](#ringless-voicemail-rvm)
10. [Webhook Configuration](#webhook-configuration)
11. [API Reference](#api-reference)
12. [Testing](#testing)
13. [Troubleshooting](#troubleshooting)

---

## Overview

The multi-carrier integration allows you to:

- **Use multiple telephony providers** (Retell AI, Telnyx, Twilio) simultaneously
- **Automatically route calls** based on capabilities, cost, and availability
- **Import provider-managed phone numbers** directly into the system
- **Enable STIR/SHAKEN signing** for verified caller ID
- **Send SMS messages** with templates and opt-out handling
- **Queue ringless voicemail** deliveries where supported
- **Schedule follow-up actions** based on call dispositions

### Provider Capabilities

| Feature | Retell AI | Telnyx | Twilio |
|---------|-----------|--------|--------|
| AI Voice Calls | ✅ Primary | ❌ | ❌ |
| Standard Voice | ✅ | ✅ | ✅ |
| SMS | ❌ | ✅ | ✅ |
| RVM | ❌ | ✅ | ⚠️ Third-party |
| STIR/SHAKEN | ⚠️ Limited | ✅ Full | ✅ Full |
| Local Presence | ✅ | ✅ | ✅ |

---

## Quick Start

1. **Configure Environment Variables**
   
   Add the required API keys to your Supabase secrets (see [Environment Variables](#environment-variables)).

2. **Add Provider via UI**
   
   Navigate to Settings > Provider Management and click "Add Provider" to configure your first provider.

3. **Import Phone Numbers**
   
   Once configured, import phone numbers from your provider account.

4. **Make Calls**
   
   The carrier router will automatically select the best provider and number for each call.

---

## Environment Variables

Add these secrets to your Supabase project:

### Retell AI (Primary AI Voice Provider)
```
RETELL_AI_API_KEY=your_retell_api_key
```

### Telnyx
```
TELNYX_API_KEY=your_telnyx_api_key
TELNYX_MESSAGING_KEY=your_telnyx_messaging_key  # Optional, if separate
TELNYX_ACCOUNT_ID=your_telnyx_account_id
```

### Twilio
```
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_MESSAGING_SID=your_messaging_service_sid  # Optional
```

### Webhook Secrets (for signature verification)
```
WEBHOOK_SECRET_RETELL=your_retell_webhook_secret
WEBHOOK_SECRET_TELNYX=your_telnyx_webhook_secret
WEBHOOK_SECRET_TWILIO=your_twilio_webhook_secret
```

### STIR/SHAKEN (Optional, for local signing)
```
STIR_LOCAL_PRIVATE_KEY=your_private_key_pem
```

---

## Adding Provider Credentials

### Via UI

1. Go to **Settings > Provider Management**
2. Click **"Add Provider"**
3. Select provider type (Retell AI, Telnyx, or Twilio)
4. Enter your API key and configure options
5. Set priority (1 = highest priority for routing)
6. Click **"Test Connection"** to verify

### Via API

```typescript
import { useMultiCarrierProvider } from '@/hooks/useMultiCarrierProvider';

const { addProvider } = useMultiCarrierProvider();

await addProvider('telnyx', {
  display_name: 'My Telnyx Account',
  api_key: 'your_api_key',
  priority: 1,
  active: true,
});
```

---

## Importing Phone Numbers

### Via UI

1. Go to **Settings > Provider Management**
2. Select the provider tab
3. Enter a phone number in E.164 format (e.g., +14155551234)
4. Click **"Import"**

Or use **"Sync"** to import all numbers from the provider account automatically.

### Via API

```typescript
import { useMultiCarrierProvider } from '@/hooks/useMultiCarrierProvider';

const { importNumber, syncNumbers } = useMultiCarrierProvider();

// Import single number
await importNumber('telnyx', '+14155551234');

// Sync all numbers from provider
await syncNumbers('telnyx');
```

---

## Carrier Routing

The carrier router automatically selects the best provider and phone number based on:

1. **Required Capabilities** - voice, SMS, RVM, STIR/SHAKEN
2. **Local Presence** - matches caller ID area code to lead's area code
3. **Provider Priority** - user-configured priority order
4. **STIR/SHAKEN** - prefers signed calls when required
5. **Cost Constraints** - (coming soon) considers per-minute costs

### Usage

```typescript
import { CarrierRouter } from '@/services/carrierRouter';

const router = new CarrierRouter();

const result = await router.selectProvider(
  {
    capabilities: ['voice', 'shaken'],
    local_presence: true,
    signed_call: true,
  },
  { user_id: 'your_user_id' },
  '+14155551234' // target phone number
);

if (result) {
  console.log('Selected provider:', result.selected_provider);
  console.log('Selected number:', result.selected_number.number);
  
  // Make the call
  const callResult = await result.adapter.createCall({
    to: '+14155551234',
    from: result.selected_number.number,
    signedOptions: { sign_call: true },
  });
}
```

### Manual Provider Override

You can override the automatic routing by specifying a provider:

```typescript
// In API call
const response = await supabase.functions.invoke('outbound-calling', {
  body: {
    action: 'create_call',
    phoneNumber: '+14155551234',
    callerId: '+14155550000',
    agentId: 'agent_123',
    provider_override: 'telnyx', // Force use Telnyx
  }
});
```

---

## STIR/SHAKEN Support

STIR/SHAKEN (Secure Telephone Identity Revisited / Signature-based Handling of Asserted information using toKENs) provides caller ID verification.

### Provider-Managed Signing (Recommended)

Both Telnyx and Twilio offer built-in STIR/SHAKEN signing:

**Telnyx:**
- Enable in your Telnyx portal under Phone Numbers > SHAKEN
- Numbers will receive "A" attestation when properly verified

**Twilio:**
- Enroll in Twilio's SHAKEN Trust Hub
- Verify your business information
- Assign Signed Calling to phone numbers

### Local Signing (Advanced)

If you have your own STI-CA certificate:

1. Add your private key to Supabase secrets as `STIR_LOCAL_PRIVATE_KEY`
2. Configure the certificate ID in provider settings
3. The system will sign calls locally before sending to the carrier

### Viewing Signature Status

Call signature information is stored in the `call_signatures` table and displayed in the call history UI.

---

## SMS Integration

### Sending SMS

```typescript
import { useMultiCarrierProvider } from '@/hooks/useMultiCarrierProvider';

// The system automatically routes to SMS-capable providers
const { sendSms } = useCarrierRouter();

await sendSms({
  to: '+14155551234',
  from: '+14155550000',
  body: 'Your appointment is confirmed for tomorrow at 2 PM.',
  template_id: 'appointment_confirmation',
});
```

### Templates

SMS templates are stored in the `sms_templates` table (coming soon) with variable substitution:

```
Hi {{first_name}}, this is {{company_name}}. Your appointment is at {{appointment_time}}.
Reply STOP to opt out.
```

### Opt-Out Handling

The system automatically:
- Includes opt-out instructions in messages
- Processes STOP replies via webhooks
- Adds opted-out numbers to the DNC list
- Checks DNC list before sending

---

## Ringless Voicemail (RVM)

RVM allows leaving voicemail without ringing the recipient's phone.

### Supported Providers

- **Telnyx**: Native RVM support
- **Twilio**: Requires third-party integration (e.g., Slybroadcast)

### Queuing RVM

```typescript
// RVM requests are queued and processed asynchronously
const { data } = await supabase
  .from('rvm_queue')
  .insert({
    user_id: userId,
    lead_id: leadId,
    provider_type: 'telnyx',
    to_number: '+14155551234',
    from_number: '+14155550000',
    audio_url: 'https://example.com/voicemail.mp3',
    status: 'pending',
  });
```

### RVM Status Updates

Status updates are received via webhooks and stored in the `rvm_queue` table.

---

## Webhook Configuration

### Retell AI Webhooks

Configure in Retell Dashboard:
- URL: `https://your-project.supabase.co/functions/v1/call-tracking-webhook`
- Events: All call events

### Telnyx Webhooks

Configure in Telnyx Portal:
- URL: `https://your-project.supabase.co/functions/v1/telnyx-webhook`
- Events: Call control events, Messaging events

### Twilio Webhooks

Configure per phone number in Twilio Console:
- Voice URL: `https://your-project.supabase.co/functions/v1/twilio-integration`
- SMS URL: `https://your-project.supabase.co/functions/v1/twilio-integration`

---

## API Reference

### Provider Management Edge Function

**Endpoint:** `/functions/v1/provider-management`

**Actions:**

| Action | Description | Parameters |
|--------|-------------|------------|
| `list_providers` | List all configured providers | - |
| `add_provider` | Add new provider | `provider_type`, `config` |
| `update_provider` | Update provider config | `provider_id`, `config` |
| `delete_provider` | Remove provider | `provider_id` |
| `test_connection` | Test provider API connection | `provider_type` |
| `list_numbers` | List imported numbers | `provider_type?`, `provider_id?` |
| `import_number` | Import single number | `provider_type`, `number` |
| `sync_numbers` | Sync all numbers from provider | `provider_type` |

### Example Request

```bash
curl -X POST \
  https://your-project.supabase.co/functions/v1/provider-management \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "list_providers"
  }'
```

---

## Testing

### Connection Test

```bash
# Test Telnyx connection
curl -X POST \
  https://your-project.supabase.co/functions/v1/provider-management \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "test_connection",
    "provider_type": "telnyx"
  }'
```

### Webhook Test (Telnyx)

```bash
# Simulate Telnyx call event
curl -X POST \
  https://your-project.supabase.co/functions/v1/telnyx-webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "data": {
      "event_type": "call.initiated",
      "id": "test_event_123",
      "occurred_at": "2024-01-15T10:30:00Z",
      "payload": {
        "call_control_id": "call_123",
        "from": "+14155551234",
        "to": "+14155550000",
        "direction": "outgoing"
      },
      "record_type": "event"
    }
  }'
```

---

## Troubleshooting

### Common Issues

**"Provider not configured" error**
- Ensure the provider is added via Provider Management UI
- Check that the API key is correctly set in Supabase secrets

**"Connection test failed"**
- Verify API key is correct
- Check provider account is active and has sufficient balance
- Ensure IP is not blocked by provider

**Numbers not importing**
- Verify the number exists in your provider account
- Check number format is E.164 (e.g., +14155551234)
- Ensure provider API permissions include phone number access

**Calls failing with STIR/SHAKEN**
- Verify number is registered for SHAKEN with provider
- Check attestation level matches your verification status
- Ensure certificates are valid and not expired

### Logs

Check Supabase Edge Function logs for detailed error messages:

1. Go to Supabase Dashboard > Edge Functions
2. Select the relevant function (e.g., `provider-management`)
3. Click "Logs" tab

### Support

For additional help:
- Check the [README.md](./README.md) for general setup
- Review provider-specific documentation:
  - [Retell AI Docs](https://docs.retellai.com)
  - [Telnyx Docs](https://developers.telnyx.com)
  - [Twilio Docs](https://www.twilio.com/docs)

---

## Database Schema

The multi-carrier integration uses the following tables:

| Table | Description |
|-------|-------------|
| `phone_providers` | Provider configurations |
| `provider_numbers` | Imported phone numbers |
| `carrier_configs` | Provider capability settings |
| `call_signatures` | STIR/SHAKEN signature data |
| `rvm_queue` | Ringless voicemail queue |
| `sms_messages` | SMS message history |
| `follow_ups` | Scheduled follow-up actions |

See migration file `20251201000000_multi_carrier_integration.sql` for full schema.
