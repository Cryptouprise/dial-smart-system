# Telnyx Messaging Platform (SMS/MMS) - Complete Technical Reference

> **Purpose**: Comprehensive knowledge base for integrating Telnyx Messaging (SMS/MMS) into dial-smart-system.
> **Last Updated**: February 23, 2026
> **Status**: Research Complete | API-Level Documentation
> **Companion Doc**: `TELNYX_VOICE_PLATFORM.md` (Voice AI integration)

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Authentication](#2-authentication)
3. [Messaging Profiles](#3-messaging-profiles)
4. [Sending SMS](#4-sending-sms)
5. [Sending MMS](#5-sending-mms)
6. [Number Pool](#6-number-pool)
7. [Receiving Messages (Webhooks)](#7-receiving-messages-webhooks)
8. [Webhook Payload Reference](#8-webhook-payload-reference)
9. [Delivery Receipts](#9-delivery-receipts)
10. [Alphanumeric Sender IDs](#10-alphanumeric-sender-ids)
11. [10DLC Registration](#11-10dlc-registration)
12. [Toll-Free Messaging](#12-toll-free-messaging)
13. [Rate Limits & Throughput](#13-rate-limits--throughput)
14. [MMS Media Support](#14-mms-media-support)
15. [Scheduling Messages](#15-scheduling-messages)
16. [Group MMS](#16-group-mms)
17. [Pricing](#17-pricing)
18. [Node.js SDK](#18-nodejs-sdk)
19. [Webhook Signature Verification](#19-webhook-signature-verification)
20. [Error Codes](#20-error-codes)
21. [Current Codebase Status](#21-current-codebase-status)
22. [Integration Plan](#22-integration-plan)

---

## 1. Platform Overview

Telnyx Messaging API (v2) provides programmable SMS and MMS capabilities globally. Key features:

- **Send/Receive SMS & MMS** via REST API or Node.js SDK
- **Number Types**: Long code (10DLC), toll-free, short code, alphanumeric sender ID
- **Number Pooling**: Distribute traffic across multiple numbers with sticky sender and geomatch
- **Auto-encoding**: Automatically selects most compact encoding (GSM-7 vs UCS-2)
- **Auto-splitting**: Long messages auto-split into multiple parts
- **MMS Transcoding**: Auto-resize media to meet carrier limits (up to 5 MB input)
- **Scheduling**: Send messages up to 5 days in the future
- **Group MMS**: Send to multiple recipients in a single thread
- **Webhooks**: Real-time delivery status and inbound message notifications
- **10DLC & Toll-Free Verification**: Built-in compliance registration

**Base URL**: `https://api.telnyx.com/v2`

---

## 2. Authentication

All API requests require a Bearer token in the `Authorization` header.

```
Authorization: Bearer YOUR_TELNYX_API_KEY
Content-Type: application/json
```

API keys are created in the Telnyx Mission Control Portal under API Keys.

For 10DLC endpoints, the base is `https://api.telnyx.com/10dlc/` with the same `Bearer` auth.

---

## 3. Messaging Profiles

A **Messaging Profile** is the central configuration object for all messaging behavior. Every SMS-capable number must be assigned to a messaging profile.

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/messaging_profiles` | Create a messaging profile |
| `GET` | `/v2/messaging_profiles` | List all messaging profiles |
| `GET` | `/v2/messaging_profiles/{id}` | Retrieve a messaging profile |
| `PATCH` | `/v2/messaging_profiles/{id}` | Update a messaging profile |
| `DELETE` | `/v2/messaging_profiles/{id}` | Delete a messaging profile |

### Configuration Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Profile name (required, must be unique) |
| `webhook_url` | string | URL for inbound message and delivery receipt webhooks |
| `webhook_failover_url` | string | Backup webhook URL if primary fails |
| `webhook_api_version` | string | `"1"`, `"2"`, or `"2010-04-01"` (legacy). Use `"2"` for v2 format |
| `whitelisted_destinations` | string[] | ISO 3166-1 alpha-2 country codes. `["*"]` = all. Required. |
| `number_pool_settings` | object | Number pool config (geomatch, weights, sticky sender, etc.) |
| `url_shortener_settings` | object | Link replacement/shortening settings |
| `daily_spend_limit` | string | Max USD spend before midnight UTC. Prevents runaway costs. |
| `alphanumeric_sender_id` | string | Default alphanumeric sender for international messages |

### Create Profile Example

```bash
curl -X POST https://api.telnyx.com/v2/messaging_profiles \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dial Smart SMS Profile",
    "webhook_url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/telnyx-webhook",
    "webhook_failover_url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/telnyx-webhook",
    "webhook_api_version": "2",
    "whitelisted_destinations": ["US", "CA"],
    "number_pool_settings": {
      "geomatch": true,
      "sticky_sender": true,
      "skip_unhealthy": true,
      "long_code_weight": 1,
      "toll_free_weight": 1
    }
  }'
```

### Update Profile Example

```bash
curl -X PATCH https://api.telnyx.com/v2/messaging_profiles/{PROFILE_ID} \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "webhook_url": "https://example.com/new-webhook",
    "daily_spend_limit": "100.00"
  }'
```

### Important Notes

- When sending to non-US destinations, a default `alphanumeric_sender_id` must be set on the profile.
- `whitelisted_destinations` is required for all profiles (security policy).
- `webhook_api_version: "2"` is strongly recommended for new integrations.

---

## 4. Sending SMS

### Primary Endpoint

```
POST https://api.telnyx.com/v2/messages
```

### Request Body Parameters

**Required:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | string | Your Telnyx number in E.164 format (e.g., `+15551234567`) |
| `to` | string | Destination number in E.164 format |
| `text` | string | Message body (non-empty string) |

**Optional:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `messaging_profile_id` | string | Required for alphanumeric sender. Associates message with a profile. |
| `webhook_url` | string | Override profile webhook for this message |
| `webhook_failover_url` | string | Override profile failover webhook |
| `use_profile_webhooks` | boolean | Use profile webhooks (default true) |
| `type` | string | `"SMS"` or `"MMS"`. Auto-detected if `media_urls` present. |
| `auto_detect` | boolean | Warn if message is unusually long |
| `send_at` | string | ISO 8601 datetime for scheduled send (5 min to 5 days in future) |
| `media_urls` | string[] | Array of publicly accessible media URLs (makes it MMS) |
| `subject` | string | MMS subject line |
| `tags` | string[] | Custom tags for tracking/filtering |

### Basic SMS Example

```json
POST https://api.telnyx.com/v2/messages

{
  "from": "+15551234567",
  "to": "+15559876543",
  "text": "Hello from Dial Smart System!"
}
```

### Full Example with All Options

```json
{
  "from": "+18445550001",
  "to": "+13125550002",
  "text": "Your appointment is confirmed for tomorrow at 2 PM.",
  "messaging_profile_id": "400176a0-8c67-4e87-b393-123456789abc",
  "webhook_url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/telnyx-webhook",
  "webhook_failover_url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/telnyx-webhook",
  "use_profile_webhooks": true,
  "type": "SMS"
}
```

### Response Body

```json
{
  "data": {
    "record_type": "message",
    "direction": "outbound",
    "id": "b0c7e8cb-6227-4c74-9f32-c7f80c30934b",
    "type": "SMS",
    "messaging_profile_id": "400176a0-8c67-4e87-b393-123456789abc",
    "organization_id": "some-org-id",
    "from": {
      "phone_number": "+15551234567",
      "carrier": "Telnyx",
      "line_type": "VoIP"
    },
    "to": [
      {
        "phone_number": "+15559876543",
        "status": "queued",
        "carrier": "T-Mobile",
        "line_type": "Wireless"
      }
    ],
    "text": "Hello from Dial Smart System!",
    "media": [],
    "webhook_url": "https://example.com/webhook",
    "webhook_failover_url": null,
    "encoding": "GSM-7",
    "parts": 1,
    "tags": [],
    "cost": {
      "amount": "0.0040",
      "currency": "USD"
    },
    "received_at": "2026-02-23T10:00:00.000Z",
    "sent_at": null,
    "completed_at": null,
    "valid_until": null,
    "errors": []
  }
}
```

### Key Response Fields

| Field | Description |
|-------|-------------|
| `data.id` | UUID for the message - use for tracking |
| `data.to[].status` | Initial status: `queued` |
| `data.encoding` | `GSM-7` (160 chars/part) or `UCS-2` (70 chars/part) |
| `data.parts` | Number of message segments |
| `data.cost.amount` | Cost in USD for this message |

### Alternative Send Endpoints

| Endpoint | Use Case |
|----------|----------|
| `POST /v2/messages` | Universal send (any number type) |
| `POST /v2/messages/long_code` | Force long code sending |
| `POST /v2/messages/short_code` | Send from short code |
| `POST /v2/messages/number_pool` | Send from number pool (no `from` required) |
| `POST /v2/messages/group_mms` | Group MMS to multiple recipients |

### Retrieve a Message

```
GET https://api.telnyx.com/v2/messages/{message_id}
```

Returns the same structure as the send response with updated status fields.

---

## 5. Sending MMS

MMS messages include media attachments. Use the same `POST /v2/messages` endpoint.

### MMS Example

```json
{
  "from": "+15551234567",
  "to": "+15559876543",
  "text": "Check out this property listing!",
  "subject": "Property Photos",
  "media_urls": [
    "https://example.com/property-photo.jpg"
  ],
  "type": "MMS"
}
```

### MMS Requirements

- `media_urls` must be **publicly accessible** HTTPS URLs
- Total media size must be **< 1 MB** (without transcoding)
- With **MMS transcoding enabled**: up to **5 MB** input (auto-compressed)
- MMS only supported to **US and Canada**
- From number must be **MMS-enabled**
- Passing an empty `media_urls: []` sends MMS without media content

### MMS-to-SMS Fallback

If the destination doesn't support MMS, Telnyx auto-converts:
- Recipient gets SMS with message text
- Each media URL listed on separate lines below the text

---

## 6. Number Pool

Number Pool distributes outbound traffic across all long code and toll-free numbers assigned to a messaging profile.

### Send from Number Pool

```
POST https://api.telnyx.com/v2/messages/number_pool
```

**Key difference**: Omit the `from` field. Specify `messaging_profile_id` instead.

```json
{
  "messaging_profile_id": "400176a0-8c67-4e87-b393-123456789abc",
  "to": "+15559876543",
  "text": "Hello from our pool!"
}
```

### Number Pool Features

| Feature | Description |
|---------|-------------|
| **Sticky Sender** | Remembers which number last sent to a destination. Reuses same number for all future messages to that recipient. |
| **Geomatch** | Selects a number matching the recipient's US area code. Falls back to random if no match. US only. |
| **Skip Unhealthy** | Auto-removes numbers with deliverability < 25% or spam detection > 75%. |
| **Weight Config** | Control ratio of long code vs toll-free sends. E.g., `long_code_weight: 5, toll_free_weight: 1` = 5 long code per 1 toll-free. |

### Configure Number Pool on Profile

```bash
curl -X PATCH https://api.telnyx.com/v2/messaging_profiles/{PROFILE_ID} \
  -H "Authorization: Bearer $TELNYX_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number_pool_settings": {
      "geomatch": true,
      "sticky_sender": true,
      "skip_unhealthy": true,
      "long_code_weight": 1,
      "toll_free_weight": 1
    }
  }'
```

### Health Check

If no healthy number exists in the pool, the message is **rejected** (not silently failed).

---

## 7. Receiving Messages (Webhooks)

Inbound SMS/MMS messages are delivered to your webhook URL via HTTP POST.

### Prerequisites

1. Configure `webhook_url` on your **Messaging Profile**
2. Webhook endpoint must be publicly accessible (HTTPS recommended)
3. Respond with **2xx** status within **2 seconds**

### Webhook URL Hierarchy (Priority Order)

1. `webhook_url` on the individual message (if provided at send time)
2. `webhook_url` on the messaging profile
3. If neither exists, no webhook is sent

### Retry Behavior

- Non-2xx or timeout (>2 seconds) triggers retry
- Up to **3 attempts** per URL
- Then attempts `webhook_failover_url` if configured
- Telnyx retries to each URL up to 3 times

### Webhook Event Types

| Event Type | Direction | Description |
|------------|-----------|-------------|
| `message.received` | Inbound | New SMS/MMS received on your number |
| `message.sent` | Outbound | Message sent to carrier |
| `message.finalized` | Outbound | Final delivery status (delivered, failed, etc.) |

---

## 8. Webhook Payload Reference

### Top-Level Structure

All webhooks share this envelope:

```json
{
  "data": {
    "event_type": "message.received",
    "id": "unique-event-uuid",
    "occurred_at": "2026-02-23T10:00:00.000+00:00",
    "payload": { ... },
    "record_type": "event"
  },
  "meta": {
    "attempt": 1,
    "delivered_to": "https://your-webhook-url.com/webhooks"
  }
}
```

### `message.received` Payload (Inbound SMS)

```json
{
  "data": {
    "event_type": "message.received",
    "id": "event-uuid",
    "occurred_at": "2026-02-23T10:00:00.000+00:00",
    "payload": {
      "id": "message-uuid",
      "record_type": "message",
      "direction": "inbound",
      "type": "SMS",
      "messaging_profile_id": "profile-uuid",
      "organization_id": "org-uuid",
      "from": {
        "phone_number": "+15559876543",
        "carrier": "T-Mobile",
        "line_type": "Wireless",
        "status": "webhook_delivered"
      },
      "to": [
        {
          "phone_number": "+15551234567",
          "status": "webhook_delivered"
        }
      ],
      "text": "Hi, I'm interested in learning more",
      "media": [],
      "encoding": "GSM-7",
      "parts": 1,
      "tags": [],
      "received_at": "2026-02-23T10:00:00.000+00:00"
    },
    "record_type": "event"
  },
  "meta": {
    "attempt": 1,
    "delivered_to": "https://your-webhook-url.com/webhooks"
  }
}
```

### `message.received` Payload (Inbound MMS)

Same as SMS but with `media` array populated:

```json
{
  "payload": {
    "type": "MMS",
    "text": "Look at this!",
    "media": [
      {
        "url": "https://telnyx-mms.s3.amazonaws.com/...",
        "content_type": "image/jpeg",
        "sha256": "abc123...",
        "size": 524288
      }
    ]
  }
}
```

**Important**: MMS media URLs expire after **30 days**. Download/cache media if needed long-term.

### `message.finalized` Payload (Delivery Receipt)

```json
{
  "data": {
    "event_type": "message.finalized",
    "id": "event-uuid",
    "occurred_at": "2026-02-23T10:00:01.000+00:00",
    "payload": {
      "id": "message-uuid",
      "record_type": "message",
      "direction": "outbound",
      "type": "SMS",
      "from": {
        "phone_number": "+15551234567",
        "carrier": "Telnyx",
        "line_type": "VoIP"
      },
      "to": [
        {
          "phone_number": "+15559876543",
          "status": "delivered",
          "carrier": "T-Mobile",
          "line_type": "Wireless"
        }
      ],
      "text": "Hello from Dial Smart!",
      "encoding": "GSM-7",
      "parts": 1,
      "cost": {
        "amount": "0.0040",
        "currency": "USD"
      },
      "errors": []
    },
    "record_type": "event"
  }
}
```

### Delivery Status Values (`to[].status`)

| Status | Description |
|--------|-------------|
| `queued` | Message accepted, waiting to send |
| `sending` | In process of sending to carrier |
| `sent` | Delivered to carrier network |
| `delivered` | Confirmed delivered to handset |
| `sending_failed` | Failed to send to carrier |
| `delivery_unconfirmed` | Sent but no delivery confirmation |
| `delivery_failed` | Carrier confirmed delivery failure |
| `expired` | Message expired before delivery |

---

## 9. Delivery Receipts

### How They Work

After sending a message, Telnyx sends webhook notifications as the message progresses:

1. `message.sent` - Message handed to carrier
2. `message.finalized` - Final delivery outcome

### Important Behaviors

- **Out-of-order delivery**: `message.finalized` may arrive BEFORE `message.sent`. Use `data.occurred_at` for sequencing.
- **Idempotency**: Duplicate webhooks are possible. Log event IDs and skip already-processed events.
- The `to[].status` field in `message.finalized` contains the final delivery verdict.
- `cost` object is populated in `message.finalized` with the actual charge.

---

## 10. Alphanumeric Sender IDs

Alphanumeric Sender IDs let you send SMS with a business name instead of a phone number (e.g., "DialSmart" instead of +15551234567).

### Restrictions

- **Cannot send to**: US, Canada, Puerto Rico (use long code or toll-free)
- **One-way only**: Recipients cannot reply to alphanumeric senders
- **Country-specific**: Some countries require pre-registration (Jordan, Oman, Turkey, etc.)
- **Account requirement**: Level 2 verification required

### Configuration

1. Set `alphanumeric_sender_id` on the Messaging Profile
2. Or set dynamically in the `from` field when sending:

```json
{
  "from": "DialSmart",
  "to": "+447911123456",
  "text": "Your appointment is confirmed.",
  "messaging_profile_id": "your-profile-id"
}
```

### Registration

For countries requiring registration, contact `alpha_sender_id@telnyx.com` with:
- Sender ID name
- Target country/countries
- Estimated monthly volume
- Company name and website
- Business documentation

### Country Categories

| Category | Examples | Notes |
|----------|----------|-------|
| No registration needed | UK, Germany, France, Australia | Works immediately |
| Registration required | Jordan, Oman, Turkey, Cuba | Provision time varies (days to months) |
| Not supported | US, Canada, Puerto Rico | Use long code/toll-free instead |

---

## 11. 10DLC Registration

10DLC (10-Digit Long Code) is the standard for A2P SMS on US local numbers. Required by T-Mobile, AT&T, and other carriers.

### Registration Flow

```
1. Register a Brand (identifies your business)
   ↓
2. Register a Campaign (describes your messaging use case)
   ↓
3. Assign Phone Numbers to the Campaign
```

### Step 1: Register a Brand

**Endpoint**: `POST https://api.telnyx.com/10dlc/brand`

**Required Information:**
- Business name (must match IRS Form CP-575 for US entities)
- EIN (Tax ID)
- Entity type (PUBLIC_PROFIT, PRIVATE_PROFIT, NON_PROFIT, etc.)
- Business address
- Website
- Contact information

**Cost**: $4 one-time, non-refundable (pass-through fee from The Campaign Registry)

**PUBLIC_PROFIT entities**: Must complete additional 2FA brand verification process (mandatory since Oct 3, 2024).

### Step 2: Register a Campaign

**Endpoint**: `POST https://api.telnyx.com/10dlc/campaign`

**Before creating**: Use `GET /10dlc/brand/{brand_id}/qualify_by_usecase` to check eligibility.

**Required Fields:**
- `brand_id` - Associated brand
- `usecase` - From valid use case types (retrieve via `/registry/enum/usecase`)
- `description` - Campaign description (40-2048 characters)
- `sample_messages` - At least one example message per use case
- `subscriber_help_keywords` - Comma-separated (e.g., `HELP`)
- `subscriber_help_message` - Response to HELP keyword
- `subscriber_opt_in_keywords` - Comma-separated (e.g., `START,YES`)
- `subscriber_opt_in_message` - Must include: program name, contact info, frequency, "msg and data rates may apply", opt-out instructions
- `subscriber_opt_out_keywords` - Comma-separated (e.g., `STOP,CANCEL`)
- `subscriber_opt_out_message` - Response to STOP keyword
- `message_flow` - Description of how users are opted in
- `webhook_url` - For campaign status updates

**Cost**: First 3 months upfront (non-refundable), then monthly:

| Use Case Type | Upfront | Monthly |
|--------------|---------|---------|
| Charity | $15 | $5/month |
| Low Mixed Volume | $6 | $2/month |
| All Other | $30 | $10/month |

### Step 3: Assign Numbers

Associate phone numbers with the approved campaign through the Telnyx API or portal.

### Campaign Statuses

| Status | Meaning |
|--------|---------|
| `TCR_PENDING` | Submitted to The Campaign Registry |
| `TCR_ACCEPTED` | Accepted by TCR |
| `TCR_FAILED` | Rejected by TCR |
| `TCR_SUSPENDED` | Suspended by TCR |
| `TELNYX_ACCEPTED` | Accepted by Telnyx |
| `MNO_PENDING` | Pending carrier approval |
| `MNO_ACCEPTED` | Carrier approved |
| `MNO_PROVISIONED` | Active and ready to send |
| `MNO_REJECTED` | Carrier rejected |

### Compliance Requirements

- Privacy Policy and T&C links required
- If marketing mentioned in CTA/Privacy Policy, campaign must include marketing use case
- Opt-in consent must be documented (web form, verbal, written)
- Pop-up form opt-in must be noted in CTA field
- Message flow description: 40-2048 characters

---

## 12. Toll-Free Messaging

### Verification Requirement

Toll-free numbers **must be verified** before sending outbound messages. Unverified numbers will be spam-blocked.

### Verification Process

**API Endpoint**: `POST https://api.telnyx.com/v2/messaging/toll_free/verification_requests`

**Portal**: Real Time Communications > Messaging > Compliance > Toll Free Verification

**Required Information:**
- Business contact name (person, not department)
- Contact phone number (not the toll-free number)
- Expected message volume
- Use case (conversational, marketing, transactional, fraud alerts, mixed)
- Description of messaging purpose
- Opt-in mechanism details
- Sample messages

### Opt-In Requirements

- Separate checkboxes for SMS opt-in and privacy policy (cannot be combined)
- Canadian toll-free numbers require **double opt-in** (confirmation message + affirmative reply)
- Senders have 24 hours to honor unsubscribe requests

### ISV/Reseller Notes

If Telnyx account domain does not match business domain, the request enters "Waiting For Customer" status until the Reseller field is filled.

### Approval Timeline

- Typically **5 business days** or less
- Can vary with volume of requests

### For Multiple Numbers

If submitting 5+ toll-free numbers in a single request, you must explain why multiple numbers are needed.

### Verification Statuses

| Status | Meaning |
|--------|---------|
| `Waiting For Vendor` | Pending vendor review |
| `Waiting For Customer` | Additional info needed |
| `Rejected` | Request was rejected |
| Approved | Active and verified |

### Throughput

- **Verified toll-free**: 1,200 messages/minute per number
- **Unverified (Level 1)**: 6 messages/minute (essentially blocked)
- **Level 2 account**: Full 1,200/min throughput

---

## 13. Rate Limits & Throughput

### Account-Level Limits

| Verification Level | Account Limit | Per-Number (US Long Code) |
|-------------------|---------------|--------------------------|
| Level 1 | 600 messages/min total | 6 msg/min international |
| Level 2 | Higher (contact sales) | Standard rates below |

### Per Number Type Limits

| Number Type | Rate Limit | Notes |
|-------------|-----------|-------|
| US Long Code (Unregistered) | 2 messages/min | Must register 10DLC for A2P |
| US Long Code (10DLC) | Varies by brand trust score | Higher trust = higher limits |
| Toll-Free (Verified) | 1,200 messages/min/number | Level 2 account required |
| Toll-Free (Unverified) | 6 messages/min | Effectively blocked |
| Short Code | 60,000 messages/min/number | Highest throughput |
| Alphanumeric Sender ID | 60,000 messages/min/ID | International only |

### 10DLC Throughput

10DLC throughput varies by brand trust score (assigned by carriers):
- Higher trust score = more messages per second
- **External vetting** (additional review) can boost trust score
- T-Mobile daily message limits apply based on brand score
- Exceeding daily limit returns an error

### Queuing Behavior

- Messages exceeding rate limits are **queued** (not rejected)
- Queue holds **4 hours** of messages at your rate
- Messages beyond 4-hour queue are **dropped and not sent**
- Queued messages do not appear in MDR reports until sent

### API Rate Limit Headers

Every API response includes:

| Header | Description |
|--------|-------------|
| `x-ratelimit-limit` | Your rate limit ceiling |
| `x-ratelimit-remaining` | Remaining requests in current window |
| `x-ratelimit-reset` | Seconds until rate limit resets |

### Scaling with Number Pool

To increase throughput: buy more numbers and assign to a messaging profile with number pooling enabled.

**Example**: 10 long code numbers in a pool = 10x the per-number rate.

---

## 14. MMS Media Support

### Supported File Types

| Content Type | Extension | Notes |
|-------------|-----------|-------|
| `text/plain` | .txt | Plain text attachment |
| `text/vcard` | .vcf | Contact card |
| `image/jpeg` | .jpg/.jpeg | Most common |
| `image/png` | .png | Supported |
| `image/gif` | .gif | Animated GIFs not transcoded |
| `video/3gpp` | .3gp | Mobile video format |
| `video/mp4` | .mp4 | Standard video |
| `application/octet-stream` | varies | Telnyx guesses content type |

### Size Limits by Carrier Tier

| Carrier Tier | Max Size | Examples |
|-------------|----------|----------|
| Tier 1 | 1 MB | Verizon, T-Mobile, AT&T, Sprint |
| Tier 2 | 600 KB | Regional carriers |
| Tier 3 | 300 KB | Smaller carriers |

**Recommendation**: Keep media under **900 KB** (1 MB minus encoding overhead).

### MMS Transcoding (Optional Feature)

When enabled on your messaging profile:
- Accepts media up to **5 MB** input
- Auto-compresses to meet carrier limits
- Images converted to **JPEG**
- Videos converted to **H.264 MP4**
- **Animated GIFs are NOT transcoded** - must be small enough natively
- Quality is reduced during compression

### Geographic Limitations

MMS is only supported for **US and Canada** destinations.

### Media Caching

- Telnyx caches media URLs for **1 hour**
- To force re-fetch: append a random query parameter to the URL
- Media URLs must be publicly accessible

### MMS-to-SMS Fallback

If destination doesn't support MMS:
- Text body sent as SMS
- Each media URL listed on separate lines
- Automatic, no configuration needed

---

## 15. Scheduling Messages

### Send Scheduled SMS/MMS

Use the `send_at` parameter on `POST /v2/messages`:

```json
{
  "from": "+15551234567",
  "to": "+15559876543",
  "text": "Reminder: Your appointment is in 1 hour!",
  "send_at": "2026-02-24T14:00:00Z"
}
```

### Constraints

- Must be **5 minutes to 5 days** in the future
- ISO 8601 format with timezone (use `Z` for UTC)
- Cannot cancel once scheduled (at time of writing)

### Alternative Endpoint

```
POST https://api.telnyx.com/v2/messages/schedule
```

Same parameters as `/v2/messages` but explicitly for scheduling.

---

## 16. Group MMS

Send a single MMS thread to multiple recipients.

### Endpoint

```
POST https://api.telnyx.com/v2/messages/group_mms
```

### Request Body

```json
{
  "from": "+13125551234",
  "to": ["+18655551234", "+14155551234"],
  "text": "Team meeting moved to 3 PM",
  "subject": "Meeting Update",
  "media_urls": ["https://example.com/agenda.pdf"],
  "webhook_url": "https://example.com/webhooks",
  "webhook_failover_url": "https://backup.example.com/hooks",
  "use_profile_webhooks": true
}
```

### Notes

- `to` is an **array** of E.164 numbers
- Creates a group thread (not individual messages)
- All participants see the same thread
- MMS-only (not available for plain SMS)

---

## 17. Pricing

### Pricing Model

- **Pay-per-message** (no monthly minimums)
- Charged **per message part** (encoding-dependent)
- Varies by: destination country, number type, carrier

### US Domestic Estimates

| Type | Approx. Cost | Notes |
|------|-------------|-------|
| SMS (Long Code) | ~$0.004/msg | Per segment |
| SMS (Toll-Free) | ~$0.004/msg | Per segment |
| SMS (Short Code) | ~$0.005-0.01/msg | Per segment |
| MMS (Long Code) | ~$0.01-0.02/msg | Per message |
| MMS (Toll-Free) | ~$0.01-0.02/msg | Per message |

### Additional Fees

| Fee | Amount | Notes |
|-----|--------|-------|
| SMS/MMS capability add-on | $0.10/month/number | To enable messaging on a number |
| 10DLC Brand Registration | $4 one-time | Non-refundable |
| 10DLC Campaign (Standard) | $30 upfront + $10/month | Non-refundable upfront |
| 10DLC Campaign (Charity) | $15 upfront + $5/month | Non-refundable upfront |
| 10DLC Campaign (Low Volume) | $6 upfront + $2/month | Non-refundable upfront |
| T-Mobile MMS surcharge | $0.001/MB over 5 MB | Rich media only |

### Cost Savings vs Twilio

Telnyx claims **30-70% savings** vs Twilio on SMS/MMS, up to 49% per message on some types and up to 91% on others.

### Volume Discounts

- 100M+ messages/month: automatic discount
- Custom contract pricing available for high volume

### Actual Per-Destination Rates

Visit [telnyx.com/pricing/messaging](https://telnyx.com/pricing/messaging) for interactive rate tables by country and number type.

---

## 18. Node.js SDK

### Installation

```bash
npm install telnyx
```

### Client Setup

```typescript
import Telnyx from 'telnyx';

const telnyx = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY,
  maxRetries: 2,   // default: 2
  // timeout: 60000 // default: 60s
});
```

### Send SMS

```typescript
const message = await telnyx.messages.create({
  from: '+15551234567',
  to: '+15559876543',
  text: 'Hello from Dial Smart!',
});

console.log('Message ID:', message.data.id);
console.log('Status:', message.data.to[0].status); // "queued"
console.log('Cost:', message.data.cost?.amount);
```

### Send MMS

```typescript
const mmsMessage = await telnyx.messages.create({
  from: '+15551234567',
  to: '+15559876543',
  text: 'Check this out!',
  media_urls: ['https://example.com/image.jpg'],
  type: 'MMS',
});
```

### Send from Number Pool

```typescript
const poolMessage = await telnyx.messages.numberPool.create({
  messaging_profile_id: 'your-profile-id',
  to: '+15559876543',
  text: 'Hello from our pool!',
});
```

### List Messaging Profiles

```typescript
const profiles = await telnyx.messagingProfiles.list();
for (const profile of profiles.data) {
  console.log(profile.id, profile.name, profile.webhook_url);
}
```

### Create Messaging Profile

```typescript
const profile = await telnyx.messagingProfiles.create({
  name: 'Dial Smart Messaging',
  webhook_url: 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/telnyx-webhook',
  webhook_api_version: '2',
  whitelisted_destinations: ['US', 'CA'],
});
```

### Webhook Signature Verification

```typescript
import Telnyx from 'telnyx';

// In your Express webhook handler:
app.post('/webhooks', (req, res) => {
  const event = telnyx.webhooks.constructEvent(
    JSON.stringify(req.body),
    req.headers['telnyx-signature-ed25519'],
    req.headers['telnyx-timestamp'],
    publicKey  // from Mission Control > Account Settings > Keys & Credentials
  );

  switch (event.data.event_type) {
    case 'message.received':
      handleInboundMessage(event.data.payload);
      break;
    case 'message.finalized':
      handleDeliveryReceipt(event.data.payload);
      break;
  }

  res.sendStatus(200);
});
```

### Error Handling

```typescript
try {
  const message = await telnyx.messages.create({ ... });
} catch (error) {
  if (error.status === 422) {
    console.error('Validation error:', error.errors);
  } else if (error.status === 429) {
    console.error('Rate limited. Retry after:', error.headers['x-ratelimit-reset']);
  }
}
```

### Retries & Timeouts

```typescript
const telnyx = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY,
  maxRetries: 0,     // disable retries
  // timeout: 30000,  // 30 second timeout
});
```

### Debugging

```typescript
const telnyx = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY,
  logLevel: 'debug', // logs all HTTP requests/responses including headers and bodies
});
```

---

## 19. Webhook Signature Verification

Telnyx uses **Ed25519 public key cryptography** to sign all webhooks.

### How It Works

1. Telnyx stores a public-private key pair
2. The **private key** signs each webhook payload
3. Your **public key** (from Mission Control > Account Settings > Keys & Credentials > Public Key) verifies the signature

### Verification Headers

Each webhook includes:

| Header | Description |
|--------|-------------|
| `telnyx-signature-ed25519` | The Ed25519 signature |
| `telnyx-timestamp` | Unix timestamp of when the webhook was signed |

### Signature is computed over

```
{timestamp}|{json_payload}
```

### Implementation (Deno/Edge Function)

```typescript
// Using tweetnacl for Ed25519 verification
import nacl from 'https://esm.sh/tweetnacl@1.0.3';
import { decode as decodeBase64 } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

function verifyTelnyxSignature(
  payload: string,
  signature: string,
  timestamp: string,
  publicKey: string
): boolean {
  const message = new TextEncoder().encode(`${timestamp}|${payload}`);
  const sig = decodeBase64(signature);
  const pk = decodeBase64(publicKey);
  return nacl.sign.detached.verify(message, sig, pk);
}
```

---

## 20. Error Codes

### Common Messaging Errors

| Code | Description | Action |
|------|-------------|--------|
| 40001 | Authentication failed | Check API key |
| 40002 | Insufficient funds | Add credits |
| 40003 | Number not enabled for messaging | Enable SMS on number or assign to messaging profile |
| 40004 | Message rejected (spam) | Review content, check 10DLC/TF verification |
| 40005 | Invalid destination | Verify E.164 format |
| 40006 | Rate limit exceeded | Slow down or buy more numbers |
| 40007 | Destination not whitelisted | Add country to messaging profile |
| 40008 | Number pool empty/unhealthy | Add numbers or check health |
| 40300 | Carrier rejected | Check 10DLC campaign status |
| 40400 | Message not found | Verify message ID |

### HTTP Status Codes

| Status | Meaning |
|--------|---------|
| 200 | Success |
| 400 | Bad request (invalid parameters) |
| 401 | Unauthorized (bad API key) |
| 404 | Resource not found |
| 422 | Validation error (check `errors` array) |
| 429 | Rate limited (check `x-ratelimit-reset` header) |
| 500 | Telnyx server error |

---

## 21. Current Codebase Status

### What Exists

| File | Status | Details |
|------|--------|---------|
| `src/services/providers/telnyxAdapter.ts` | **STUB** | `sendSms()` returns `{ success: false, error: 'not implemented' }` |
| `supabase/functions/telnyx-webhook/index.ts` | **STUB** | Receives webhooks, logs event types, no processing logic |
| `supabase/functions/voice-broadcast-engine/index.ts` | **WORKING** | `callWithTelnyx()` works for voice calls |
| `supabase/functions/sms-messaging/index.ts` | **WORKING** | Sends SMS via Twilio only |
| `supabase/functions/ai-sms-processor/index.ts` | **WORKING** | AI SMS via Twilio only |
| `supabase/functions/twilio-sms-webhook/index.ts` | **WORKING** | Twilio inbound SMS processing |
| Database schema | **COMPLETE** | `phone_providers`, `provider_numbers`, `carrier_configs` tables exist |
| TypeScript types | **COMPLETE** | `IProviderAdapter` includes `'telnyx'` provider type |

### What's Missing for Telnyx Messaging

1. **telnyxAdapter.ts** `sendSms()` - needs real API call implementation
2. **telnyx-webhook** SMS event processing - needs `message.received` and `message.finalized` handlers
3. **Messaging Profile management** - no CRUD for Telnyx messaging profiles
4. **Number Pool configuration** - no UI or API integration
5. **10DLC/Toll-Free registration** - no management flow
6. **sms-messaging edge function** - no Telnyx path (only Twilio)
7. **ai-sms-processor** - no Telnyx path for AI-generated SMS

---

## 22. Integration Plan

### Phase 1: Basic SMS Send/Receive (MVP)

**Goal**: Send and receive SMS through Telnyx as an alternative to Twilio.

1. **Implement `telnyxAdapter.sendSms()`** - Real `POST /v2/messages` call
2. **Update `sms-messaging` edge function** - Add Telnyx provider path
3. **Implement `telnyx-webhook` SMS handlers** - Process `message.received`, `message.sent`, `message.finalized`
4. **Update `ai-sms-processor`** - Add Telnyx send path
5. **Webhook signature verification** - Ed25519 validation

### Phase 2: Messaging Profile Management

1. **Create messaging profile** on Telnyx for the organization
2. **Configure webhook URL** to point to `telnyx-webhook` edge function
3. **Assign numbers** to messaging profile
4. **Admin UI** for profile settings

### Phase 3: Number Pool & Advanced Features

1. **Number pool setup** with geomatch and sticky sender
2. **MMS support** through Telnyx
3. **Scheduled messaging** via `send_at`
4. **Delivery tracking** - map Telnyx delivery statuses to internal statuses

### Phase 4: Compliance

1. **10DLC brand registration** via Telnyx API
2. **10DLC campaign registration** and number assignment
3. **Toll-free verification** submission
4. **Compliance dashboard** in admin UI

### Environment Variables Needed

```
TELNYX_API_KEY              # API key from Telnyx Mission Control
TELNYX_MESSAGING_PROFILE_ID # Default messaging profile ID
TELNYX_PUBLIC_KEY           # For webhook signature verification
```

---

## Sources

- [Send a Message API](https://developers.telnyx.com/api/messaging/send-message)
- [Send Your First Message](https://developers.telnyx.com/docs/messaging/messages/send-message)
- [Receive SMS and MMS Messages](https://developers.telnyx.com/docs/messaging/messages/receive-message)
- [Receiving Webhooks](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks)
- [Webhook Fundamentals](https://developers.telnyx.com/development/api-fundamentals/webhooks/receiving-webhooks)
- [Number Pool](https://developers.telnyx.com/docs/messaging/messages/number-pool)
- [Number Pool Send API](https://developers.telnyx.com/api/messaging/create-number-pool-message)
- [Alphanumeric Sender ID](https://developers.telnyx.com/docs/messaging/messages/alphanumeric-sender-id)
- [10DLC Quickstart](https://developers.telnyx.com/docs/messaging/10dlc/quickstart)
- [10DLC Rate Limits](https://developers.telnyx.com/docs/messaging/10dlc/10dlc-rate-limits)
- [Submit 10DLC Campaign API](https://developers.telnyx.com/api/messaging/10dlc/post-campaign)
- [10DLC Campaign Compliance](https://support.telnyx.com/en/articles/9940291-10dlc-campaign-compliance-requirements)
- [10DLC Brand Registration](https://telnyx.com/resources/10dlc-brand-registration)
- [10DLC FAQ](https://support.telnyx.com/en/articles/3679260-frequently-asked-questions-about-10dlc)
- [Toll-Free Messaging](https://support.telnyx.com/en/articles/5353868-toll-free-messaging)
- [Toll-Free Verification Guide](https://support.telnyx.com/en/articles/10729979-toll-free-verification-request-guide)
- [Submit Toll-Free Verification API](https://developers.telnyx.com/api/messaging/toll-free-verification/submit-verification-request)
- [Throughput Limits](https://support.telnyx.com/en/articles/96934-throughput-limit-for-outbound-long-code-sms)
- [MMS FAQ](https://support.telnyx.com/en/articles/4450150-faqs-about-mms-at-telnyx)
- [MMS Transcoding](https://developers.telnyx.com/docs/messaging/messages/mms-transcoding)
- [MMS Sending and Receiving](https://support.telnyx.com/en/articles/3102823-mms-sending-and-receiving)
- [Setting Up Messaging Profile](https://support.telnyx.com/en/articles/3562059-setting-up-a-messaging-profile)
- [List Messaging Profiles API](https://developers.telnyx.com/api/messaging/list-messaging-profiles)
- [Update Messaging Profile API](https://developers.telnyx.com/api/messaging/update-messaging-profile)
- [Schedule Messages](https://developers.telnyx.com/docs/messaging/messages/schedule-message)
- [Group MMS API](https://developers.telnyx.com/api/messaging/create-group-mms-message)
- [SMS/MMS Pricing](https://telnyx.com/pricing/messaging)
- [Telnyx Node.js SDK (npm)](https://www.npmjs.com/package/telnyx)
- [Send Message Node.js Docs](https://developers.telnyx.com/docs/messaging/messages/send-message?lang=node)
- [Receive Message Node.js Docs](https://developers.telnyx.com/docs/messaging/messages/receive-message?lang=node)
- [Messaging Error Codes](https://support.telnyx.com/en/articles/6505121-telnyx-messaging-error-codes)
- [Alphanumeric Sender ID Help](https://support.telnyx.com/en/articles/6354449-alphanumeric-sender-id)
- [Number Pooling Help](https://support.telnyx.com/en/articles/3154822-number-pooling)
- [Telnyx SDK Messaging Examples (DeepWiki)](https://deepwiki.com/team-telnyx/telnyx-node/6.1-messaging-examples)
