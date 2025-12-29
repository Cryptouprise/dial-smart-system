# Inbound Transfer Webhook Integration Guide

## Overview

The Dial Smart System now supports receiving **inbound call transfers** from external dialing systems like VICIdial with complete client metadata. This allows external systems that are calling high volumes (e.g., 500,000 calls/day) to transfer live, qualified leads to your system along with all relevant client information.

## Key Features

✅ **Receive Live Transfers**: Accept hot transfers from external dialers  
✅ **Client Data Transfer**: Receive complete lead/client information via webhook  
✅ **Automatic Lead Creation**: Automatically create or update lead records  
✅ **Call Tracking**: Full integration with existing call logs and analytics  
✅ **Flexible Metadata**: Support for custom fields and campaign data  
✅ **Secure**: Optional webhook authentication with secrets  

## How It Works

1. **External System** (e.g., VICIdial) generates a live transfer
2. **Webhook Called**: External system sends transfer details to your webhook endpoint
3. **Data Processed**: System receives client info, creates/updates lead record
4. **Call Routed**: Call is transferred to your specified phone number
5. **Tracked**: Full tracking in call logs and transfer history

## Setup Instructions

### Step 1: Add Your Phone Number

First, ensure the phone number that will receive transfers is added to your Dial Smart System:

1. Navigate to **Settings → Phone Numbers**
2. Add the phone number that VICIdial will transfer calls to
3. Note the phone number in E.164 format (e.g., `+15551234567`)

### Step 2: Configure Webhook Secret (Optional but Recommended)

For security, set up a webhook secret in your Supabase environment:

1. Go to Supabase Dashboard → Project Settings → Edge Functions
2. Add environment variable:
   ```
   INBOUND_TRANSFER_WEBHOOK_SECRET=your_secret_key_here
   ```
3. Use a strong random string (minimum 32 characters)

### Step 3: Get Your Webhook URL

Your webhook endpoint URL will be:

```
https://[your-project-ref].supabase.co/functions/v1/inbound-transfer-webhook
```

Replace `[your-project-ref]` with your actual Supabase project reference ID.

### Step 4: Configure VICIdial (or External System)

#### For VICIdial:

1. **Create Transfer Campaign**:
   - Go to Admin → Campaigns
   - Create or edit campaign
   - Set transfer type to "API" or "External"

2. **Configure Transfer URL**:
   - Set the transfer URL to your webhook endpoint
   - Method: `POST`
   - Content-Type: `application/json`

3. **Set Transfer Script**:
   Add a custom script in VICIdial to send the webhook with required data (see payload format below)

#### For Other Systems:

Configure your dialer to make a POST request to the webhook URL with the required JSON payload when initiating a transfer.

## Webhook API Reference

### Endpoint

```
POST https://[your-project].supabase.co/functions/v1/inbound-transfer-webhook
```

### Headers

```
Content-Type: application/json
X-Webhook-Secret: your_secret_key_here  (if configured)
```

### Request Payload Format

#### Minimal Required Fields:

```json
{
  "from_number": "+15551234567",
  "to_number": "+15559876543"
}
```

#### Complete Payload with All Fields:

```json
{
  "external_call_id": "VIC123456789",
  "external_campaign_id": "CAMP-001",
  "external_list_id": "LIST-456",
  "from_number": "+15551234567",
  "to_number": "+15559876543",
  "transfer_type": "live",
  "client_info": {
    "first_name": "John",
    "last_name": "Doe",
    "email": "john.doe@example.com",
    "phone": "+15551234567",
    "address": "123 Main Street",
    "city": "New York",
    "state": "NY",
    "zip": "10001",
    "country": "USA"
  },
  "transfer_metadata": {
    "reason": "Interested in solar installation",
    "agent_notes": "Customer asked about pricing and financing options. Ready to schedule consultation.",
    "disposition": "Hot Lead",
    "priority": 10
  },
  "custom_fields": {
    "property_type": "Single Family Home",
    "roof_age": "5 years",
    "electric_bill": "$250/month",
    "decision_timeframe": "30 days",
    "budget": "50000"
  },
  "source_system": "vicidial"
}
```

### Field Descriptions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from_number` | string | ✅ Yes | Caller's phone number (E.164 format recommended) |
| `to_number` | string | ✅ Yes | Your phone number receiving the transfer |
| `external_call_id` | string | No | Unique call ID from external system |
| `external_campaign_id` | string | No | Campaign ID from external system |
| `external_list_id` | string | No | List ID from external system |
| `transfer_type` | string | No | Type: `live`, `warm`, or `cold` (default: `live`) |
| `client_info` | object | No | Lead/client information |
| `client_info.first_name` | string | No | Client's first name |
| `client_info.last_name` | string | No | Client's last name |
| `client_info.email` | string | No | Client's email address |
| `client_info.phone` | string | No | Client's phone number |
| `client_info.address` | string | No | Client's street address |
| `client_info.city` | string | No | Client's city |
| `client_info.state` | string | No | Client's state/province |
| `client_info.zip` | string | No | Client's ZIP/postal code |
| `client_info.country` | string | No | Client's country |
| `transfer_metadata` | object | No | Transfer-specific metadata |
| `transfer_metadata.reason` | string | No | Reason for transfer |
| `transfer_metadata.agent_notes` | string | No | Notes from transferring agent |
| `transfer_metadata.disposition` | string | No | Disposition from external system |
| `transfer_metadata.priority` | number | No | Priority level (0-10) |
| `custom_fields` | object | No | Any additional custom data (flexible JSON) |
| `source_system` | string | No | Name of source system (default: `vicidial`) |

### Response Format

#### Success (200 OK):

```json
{
  "success": true,
  "transfer_id": "uuid-of-transfer-record",
  "lead_id": "uuid-of-lead-record",
  "message": "Inbound transfer received and processed",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### Error Responses:

**400 Bad Request** - Invalid payload:
```json
{
  "error": "Missing or invalid from_number",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**401 Unauthorized** - Invalid webhook secret:
```json
{
  "error": "Unauthorized",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**404 Not Found** - Phone number not configured:
```json
{
  "error": "Phone number not configured in system",
  "message": "The destination number +15559876543 is not registered. Please add it to your account first.",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**500 Internal Server Error** - Server error:
```json
{
  "error": "Internal server error",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## VICIdial Configuration Example

### Custom AGI Script for VICIdial

Create a custom AGI script in VICIdial to send the webhook:

```bash
#!/bin/bash
# /var/lib/asterisk/agi-bin/dial-smart-transfer.sh

# Configuration
WEBHOOK_URL="https://your-project.supabase.co/functions/v1/inbound-transfer-webhook"
WEBHOOK_SECRET="your_secret_key_here"

# Get call variables from VICIdial
CALL_ID="${1}"
CAMPAIGN_ID="${2}"
LIST_ID="${3}"
FROM_NUMBER="${4}"
TO_NUMBER="${5}"
LEAD_ID="${6}"
FIRST_NAME="${7}"
LAST_NAME="${8}"
EMAIL="${9}"
PHONE="${10}"
ADDRESS="${11}"
CITY="${12}"
STATE="${13}"
ZIP="${14}"

# Build JSON payload
JSON_PAYLOAD=$(cat <<EOF
{
  "external_call_id": "${CALL_ID}",
  "external_campaign_id": "${CAMPAIGN_ID}",
  "external_list_id": "${LIST_ID}",
  "from_number": "${FROM_NUMBER}",
  "to_number": "${TO_NUMBER}",
  "transfer_type": "live",
  "client_info": {
    "first_name": "${FIRST_NAME}",
    "last_name": "${LAST_NAME}",
    "email": "${EMAIL}",
    "phone": "${PHONE}",
    "address": "${ADDRESS}",
    "city": "${CITY}",
    "state": "${STATE}",
    "zip": "${ZIP}"
  },
  "transfer_metadata": {
    "reason": "Live transfer from VICIdial",
    "agent_notes": "Qualified lead ready for transfer",
    "disposition": "Transfer",
    "priority": 8
  },
  "source_system": "vicidial"
}
EOF
)

# Send webhook
curl -X POST "${WEBHOOK_URL}" \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: ${WEBHOOK_SECRET}" \
  -d "${JSON_PAYLOAD}"

# Continue with call transfer
exit 0
```

### VICIdial Campaign Settings

1. **Campaign Setup**:
   - Transfer Type: `SCRIPT`
   - Transfer Script: `dial-smart-transfer.sh`
   - Transfer Number: Your Dial Smart phone number

2. **Custom Fields Mapping**:
   Map VICIdial lead fields to the webhook payload in your script

## Testing Your Integration

### Test with cURL

```bash
curl -X POST https://your-project.supabase.co/functions/v1/inbound-transfer-webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your_secret_key_here" \
  -d '{
    "from_number": "+15551234567",
    "to_number": "+15559876543",
    "transfer_type": "live",
    "client_info": {
      "first_name": "Test",
      "last_name": "User",
      "email": "test@example.com",
      "phone": "+15551234567"
    },
    "transfer_metadata": {
      "reason": "Test transfer",
      "agent_notes": "This is a test",
      "priority": 5
    },
    "custom_fields": {
      "test_field": "test_value"
    }
  }'
```

### Expected Response

```json
{
  "success": true,
  "transfer_id": "123e4567-e89b-12d3-a456-426614174000",
  "lead_id": "987fcdeb-51a2-43d7-b789-123456789abc",
  "message": "Inbound transfer received and processed",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Viewing Transfer Data

### In the Dashboard

1. Navigate to **Call Logs** to view all transfer call records
2. Navigate to **Leads** to see created/updated lead records
3. Use filters to find specific transfers:
   - Filter by status: "inbound-transfer"
   - Filter by date range
   - Search by phone number

### Via Database Query

Query the `inbound_transfers` table:

```sql
SELECT 
  id,
  external_call_id,
  from_number,
  client_first_name,
  client_last_name,
  transfer_reason,
  agent_notes,
  custom_fields,
  status,
  created_at
FROM inbound_transfers
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC
LIMIT 100;
```

## Advanced Features

### Custom Fields

The `custom_fields` object supports any JSON structure:

```json
{
  "custom_fields": {
    "property_details": {
      "square_footage": 2500,
      "bedrooms": 4,
      "bathrooms": 3
    },
    "loan_info": {
      "loan_amount": 400000,
      "down_payment": 80000,
      "credit_score": 750
    },
    "tags": ["hot", "qualified", "high-value"]
  }
}
```

### Transfer Types

- **`live`**: Hot transfer - caller is on the line (default)
- **`warm`**: Warm transfer - caller was notified and hung up
- **`cold`**: Cold transfer - no caller interaction

### Priority Levels

Use priority (0-10) to rank transfers:
- **10**: Urgent, immediate attention required
- **7-9**: High priority
- **4-6**: Medium priority
- **1-3**: Low priority
- **0**: Standard priority

## Troubleshooting

### Common Issues

1. **"Phone number not configured in system"**
   - Solution: Add the destination phone number to your account first

2. **"Invalid webhook secret"**
   - Solution: Check that the `X-Webhook-Secret` header matches your configured secret

3. **"Invalid JSON payload"**
   - Solution: Ensure Content-Type is `application/json` and payload is valid JSON

4. **No lead created**
   - Solution: Include `client_info.phone` or `client_info.email` in the payload

### Debug Mode

Check Supabase Edge Function logs for detailed information:

1. Go to Supabase Dashboard
2. Navigate to Edge Functions → Logs
3. Filter by function: `inbound-transfer-webhook`
4. View request/response details and errors

## Security Best Practices

1. **Always use HTTPS** - Webhook endpoint only accepts HTTPS
2. **Configure webhook secret** - Protect against unauthorized requests
3. **Validate source IP** - Optionally whitelist VICIdial server IPs
4. **Monitor logs** - Regularly review webhook logs for suspicious activity
5. **Rotate secrets** - Periodically update webhook secrets

## Support

For integration support:
- Review edge function logs in Supabase Dashboard
- Check call_logs and inbound_transfers tables for data
- Verify phone number configuration
- Test with cURL before VICIdial integration

## Summary

You now have full capability to:
✅ Receive inbound transfers from VICIdial or any external system  
✅ Accept complete client metadata via webhook/API  
✅ Automatically create and track leads  
✅ Monitor all transfers in your dashboard  

Simply provide your webhook URL and phone number to your VICIdial operator, and you're ready to receive live transfers with full client information!
