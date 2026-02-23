# Telnyx Phone Numbers API - Complete Technical Reference

> **Purpose**: Comprehensive API reference for searching, purchasing, configuring, and managing phone numbers via the Telnyx API v2.
> **Last Updated**: February 23, 2026
> **Status**: Research Complete | Ready for Integration
> **Companion Doc**: `TELNYX_VOICE_PLATFORM.md` (Voice AI / Assistants)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Search Available Numbers](#2-search-available-numbers)
3. [Number Reservations](#3-number-reservations)
4. [Purchase Numbers (Number Orders)](#4-purchase-numbers-number-orders)
5. [Sub Number Orders & Regulatory](#5-sub-number-orders--regulatory)
6. [Manage Phone Numbers (CRUD)](#6-manage-phone-numbers-crud)
7. [Voice Settings Configuration](#7-voice-settings-configuration)
8. [Messaging Settings Configuration](#8-messaging-settings-configuration)
9. [CNAM / Caller ID](#9-cnam--caller-id)
10. [STIR/SHAKEN](#10-stirshaken)
11. [E911 Emergency Configuration](#11-e911-emergency-configuration)
12. [10DLC / A2P Registration](#12-10dlc--a2p-registration)
13. [Number Porting](#13-number-porting)
14. [Pricing](#14-pricing)
15. [Node.js SDK Reference](#15-nodejs-sdk-reference)
16. [Complete Endpoint Summary](#16-complete-endpoint-summary)
17. [Integration Notes for dial-smart-system](#17-integration-notes-for-dial-smart-system)

---

## 1. Authentication

All Telnyx API v2 requests require a Bearer token.

```
Authorization: Bearer YOUR_TELNYX_API_KEY
Content-Type: application/json
Accept: application/json
```

**Base URL**: `https://api.telnyx.com/v2`

API keys are managed in the Telnyx Mission Control Portal under Auth > Auth V2.

---

## 2. Search Available Numbers

### Endpoint

```
GET https://api.telnyx.com/v2/available_phone_numbers
```

### Filter Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `filter[country_code]` | **YES** | ISO 3166-1 alpha-2 code (e.g., `US`, `CA`, `GB`) |
| `filter[administrative_area]` | No | State/Province (e.g., `IL`, `CA`, `NY`) — US/CA only |
| `filter[locality]` | No | City/region/rate center (e.g., `Chicago`, `Boston`) |
| `filter[national_destination_code]` | No | Area code (e.g., `312`, `213`) |
| `filter[phone_number_type]` | No | `local`, `toll_free`, `national`, `mobile` |
| `filter[features]` | No | Array: `sms`, `mms`, `voice`, `fax`, `emergency` |
| `filter[reservable]` | No | `true` — only numbers eligible for reservation |
| `filter[exclude_held_numbers]` | No | `true` — exclude numbers on hold/recycling |
| `filter[best_effort]` | No | `false` — require exact matches only |
| `filter[limit]` | No | Max results to return (default varies) |

**Important**: Wildcard characters (`*`, `%`, etc.) are NOT supported in any filters.

### Example: Search for SMS-capable numbers in Chicago, IL

```bash
curl -X GET \
  --header "Accept: application/json" \
  --header "Authorization: Bearer $TELNYX_API_KEY" \
  --globoff "https://api.telnyx.com/v2/available_phone_numbers?filter[country_code]=US&filter[locality]=Chicago&filter[administrative_area]=IL&filter[features][]=sms&filter[limit]=10"
```

### Response Structure

```json
{
  "data": [
    {
      "phone_number": "+13125551234",
      "record_type": "available_phone_number",
      "vanity_format": null,
      "best_effort": false,
      "reservable": true,
      "region_information": [
        {
          "region_type": "rate_center",
          "region_name": "CHICAGO"
        },
        {
          "region_type": "state",
          "region_name": "IL"
        }
      ],
      "cost_information": {
        "upfront_cost": "1.00",
        "monthly_cost": "1.00",
        "currency": "USD"
      },
      "features": [
        { "name": "sms" },
        { "name": "mms" },
        { "name": "voice" }
      ],
      "phone_number_type": "local"
    }
  ],
  "metadata": {
    "total_results": 10
  }
}
```

### Node.js SDK

```typescript
import Telnyx from 'telnyx';
const telnyx = new Telnyx(process.env.TELNYX_API_KEY);

const { data: numbers } = await telnyx.availablePhoneNumbers.list({
  filter: {
    country_code: "US",
    administrative_area: "IL",
    locality: "Chicago",
    features: ["sms", "voice"],
    limit: 10
  }
});

console.log(numbers); // Array of available phone numbers
```

---

## 3. Number Reservations

Reserve numbers for 30 minutes to prevent others from purchasing them.

### Create Reservation

```
POST https://api.telnyx.com/v2/number_reservations
```

**Request Body:**
```json
{
  "phone_numbers": [
    { "phone_number": "+13125551234" },
    { "phone_number": "+13125555678" }
  ],
  "customer_reference": "my-batch-001"
}
```

**Response:**
```json
{
  "data": {
    "id": "12ade33a-21c0-473b-b055-b3c836e1c293",
    "record_type": "number_reservation",
    "status": "success",
    "customer_reference": "my-batch-001",
    "phone_numbers": [
      {
        "phone_number": "+13125551234",
        "status": "success",
        "expired_at": "2026-02-23T15:30:00Z",
        "expired": false
      }
    ],
    "created_at": "2026-02-23T15:00:00Z",
    "updated_at": "2026-02-23T15:00:00Z"
  }
}
```

### Extend Reservation (+30 min)

```
POST https://api.telnyx.com/v2/number_reservations/{id}/actions/extend
```

### List Reservations

```
GET https://api.telnyx.com/v2/number_reservations
```

### Retrieve Reservation

```
GET https://api.telnyx.com/v2/number_reservations/{id}
```

### Key Notes
- Reservations expire after **30 minutes**
- Not all numbers are reservable (check `reservable` field in search results)
- Individual numbers in a batch may fail (check per-number `status`)
- Can extend by another 30 minutes using the extend action

---

## 4. Purchase Numbers (Number Orders)

### Create a Number Order

```
POST https://api.telnyx.com/v2/number_orders
```

**Request Body:**
```json
{
  "phone_numbers": [
    { "phone_number": "+13125551234" },
    { "phone_number": "+13125555678" }
  ],
  "connection_id": "1234567890",
  "messaging_profile_id": "abc-def-123",
  "billing_group_id": "bg-123",
  "customer_reference": "order-batch-001"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `phone_numbers` | array | **Required.** Array of `{ phone_number: "+1..." }` objects |
| `connection_id` | string | Optional. Voice connection/application to assign |
| `messaging_profile_id` | string | Optional. Messaging profile to assign |
| `billing_group_id` | string | Optional. Billing group for cost allocation |
| `customer_reference` | string | Optional. Your reference string |

**CRITICAL**: Numbers must have appeared in a search result within the last **24 hours**.

### Response

```json
{
  "data": {
    "id": "order-id-123",
    "record_type": "number_order",
    "status": "pending",
    "phone_numbers_count": 2,
    "connection_id": "1234567890",
    "messaging_profile_id": "abc-def-123",
    "billing_group_id": "bg-123",
    "customer_reference": "order-batch-001",
    "requirements_met": true,
    "phone_numbers": [
      {
        "id": "pn-id-001",
        "phone_number": "+13125551234",
        "status": "success",
        "record_type": "number_order_phone_number",
        "regulatory_requirements": [],
        "requirements_met": true
      }
    ],
    "sub_number_orders_ids": ["sub-order-1"],
    "created_at": "2026-02-23T15:00:00Z",
    "updated_at": "2026-02-23T15:00:05Z"
  }
}
```

### Order Statuses

| Status | Description |
|--------|-------------|
| `pending` | Order is being processed or awaiting regulatory requirements |
| `success` | All numbers activated |
| `failure` | Order failed |

### List Number Orders

```
GET https://api.telnyx.com/v2/number_orders
```

### Retrieve Number Order

```
GET https://api.telnyx.com/v2/number_orders/{id}
```

### Node.js SDK

```typescript
import Telnyx from 'telnyx';
const client = new Telnyx(process.env.TELNYX_API_KEY);

// Create order
const order = await client.numberOrders.create({
  phone_numbers: [
    { phone_number: '+13125551234' },
    { phone_number: '+13125555678' }
  ],
  connection_id: 'your-voice-connection-id'
});

console.log(order.data.status); // "pending" or "success"
console.log(order.data.id);

// Poll for completion
const result = await client.numberOrders.retrieve(order.data.id);
console.log(result.data.status); // "success"
```

### Number Block Orders

For ordering consecutive number blocks:

```
POST https://api.telnyx.com/v2/number_block_orders
GET  https://api.telnyx.com/v2/number_block_orders
GET  https://api.telnyx.com/v2/number_block_orders/{id}
```

---

## 5. Sub Number Orders & Regulatory

When a number order includes numbers from multiple countries/types, it gets split into **sub number orders** processed independently.

### List Sub Number Orders

```
GET https://api.telnyx.com/v2/sub_number_orders
```

### Retrieve Sub Number Order

```
GET https://api.telnyx.com/v2/sub_number_orders/{id}
```

### Update Sub Number Order (Submit Regulatory Requirements)

```
PATCH https://api.telnyx.com/v2/sub_number_orders/{id}
```

### Regulatory Requirements Workflow

1. Create a number order (POST `/number_orders`)
2. If country requires documents, order stays in `pending` state
3. Retrieve sub number orders to see `regulatory_requirements` array
4. Upload documents via Documents API
5. PATCH sub number order to associate documents
6. Telnyx vets requirements individually
7. Each order has a `deadline` attribute -- requirements must be met by deadline or order auto-cancels
8. If requirements are rejected, new deadline is set for corrections

**US numbers have NO regulatory requirements** -- they activate immediately.

---

## 6. Manage Phone Numbers (CRUD)

### List Phone Numbers

```
GET https://api.telnyx.com/v2/phone_numbers
```

**Query Parameters:**

| Parameter | Description |
|-----------|-------------|
| `page[number]` | Page number (default: 1) |
| `page[size]` | Results per page (default: 20, max: 250) |
| `filter[phone_number]` | Filter by number (min 3 digits) |
| `filter[status]` | `purchase_pending`, `purchase_failed`, `port_pending`, `active`, `deleted`, `port_failed`, `emergency_only`, `ported_out`, `port_out_pending` |
| `filter[connection_id]` | Filter by voice connection |
| `filter[tag]` | Filter by tag |
| `sort` | `purchased_at`, `phone_number`, `connection_name`, `usage_payment_method` |

### Retrieve a Phone Number

```
GET https://api.telnyx.com/v2/phone_numbers/{id}
```

The `{id}` can be the phone number ID or the E.164 phone number string.

### Update a Phone Number

```
PATCH https://api.telnyx.com/v2/phone_numbers/{id}
```

**Request Body (example):**
```json
{
  "tags": ["campaign-solar", "primary"],
  "connection_id": "voice-connection-123",
  "billing_group_id": "bg-456",
  "customer_reference": "my-ref",
  "external_pin": "1234"
}
```

### Delete a Phone Number

```
DELETE https://api.telnyx.com/v2/phone_numbers/{id}
```

### Batch Update Phone Numbers

```
POST https://api.telnyx.com/v2/phone_numbers/jobs/update_phone_numbers
```

Update up to **1,000 numbers** per API call. At least one updateable field must be submitted.

### Batch Delete Phone Numbers

```
POST https://api.telnyx.com/v2/phone_numbers/jobs/delete_phone_numbers
```

Phone numbers must be in E.164 format.

### Retrieve Batch Job Status

```
GET https://api.telnyx.com/v2/phone_numbers/jobs/{id}
```

### Pagination Response Format

```json
{
  "data": [ ... ],
  "meta": {
    "page_number": 1,
    "page_size": 20,
    "total_pages": 5,
    "total_results": 100
  }
}
```

---

## 7. Voice Settings Configuration

### Retrieve Voice Settings

```
GET https://api.telnyx.com/v2/phone_numbers/{id}/voice
```

### Update Voice Settings

```
PATCH https://api.telnyx.com/v2/phone_numbers/{id}/voice
```

**Request Body:**
```json
{
  "connection_id": "voice-connection-id",
  "tech_prefix_enabled": false,
  "translated_number": "",
  "usage_payment_method": "pay-per-minute",
  "media_features": {
    "rtp_auto_adjust_enabled": true,
    "accept_any_rtp_packets_enabled": false,
    "t38_fax_gateway_enabled": false
  },
  "call_forwarding": {
    "call_forwarding_enabled": false,
    "forwarding_type": "always",
    "forwards_to": "+15551234567"
  },
  "cnam_listing": {
    "cnam_listing_enabled": true,
    "cnam_listing_details": "My Company"
  },
  "emergency": {
    "emergency_enabled": true,
    "emergency_address_id": "addr-123"
  }
}
```

**Key Voice Settings Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `connection_id` | string | Voice application/SIP connection to use |
| `tech_prefix_enabled` | boolean | Enable tech prefix for routing differentiation |
| `translated_number` | string | Number translation for SIP INVITE |
| `usage_payment_method` | string | `pay-per-minute` or `channel` |
| `call_forwarding.call_forwarding_enabled` | boolean | Enable call forwarding |
| `call_forwarding.forwards_to` | string | E.164 number to forward to |
| `cnam_listing.cnam_listing_enabled` | boolean | Enable CNAM listing |
| `cnam_listing.cnam_listing_details` | string | CNAM display name (max 15 chars) |
| `emergency.emergency_enabled` | boolean | Enable E911 |
| `emergency.emergency_address_id` | string | Address ID for E911 |

### List Phone Numbers with Voice Settings

```
GET https://api.telnyx.com/v2/phone_numbers/voice
```

---

## 8. Messaging Settings Configuration

### Update Messaging Settings (Single Number)

```
PATCH https://api.telnyx.com/v2/phone_numbers/{id}/messaging
```

**Request Body:**
```json
{
  "messaging_profile_id": "profile-123",
  "messaging_product": "P2P"
}
```

### Bulk Update Messaging Settings

```
PATCH https://api.telnyx.com/v2/phone_numbers/messaging
```

Updates messaging profile for multiple numbers at once.

### List Phone Numbers with Messaging Settings

```
GET https://api.telnyx.com/v2/phone_numbers/messaging
```

### Messaging Profile Setup

A Messaging Profile defines how SMS/MMS works on your numbers:

1. Create a Messaging Profile in Mission Control (or via API)
2. Configure webhook URL for inbound messages
3. Set API version (v2 recommended)
4. Optional: Enable `mobile_only` parameter to send only to mobile numbers
5. Assign phone numbers to the profile

### Messaging Profile API Endpoints

```
POST   https://api.telnyx.com/v2/messaging_profiles
GET    https://api.telnyx.com/v2/messaging_profiles
GET    https://api.telnyx.com/v2/messaging_profiles/{id}
PATCH  https://api.telnyx.com/v2/messaging_profiles/{id}
DELETE https://api.telnyx.com/v2/messaging_profiles/{id}
```

---

## 9. CNAM / Caller ID

### Two Types of Caller ID

| Type | Description |
|------|-------------|
| **CID (Caller ID Number)** | The phone number displayed to the called party |
| **CNAM (Caller ID Name)** | The name displayed (e.g., "ACME CORP") |

### Setting CNAM

CNAM is configured through the voice settings endpoint:

```
PATCH https://api.telnyx.com/v2/phone_numbers/{id}/voice
```

```json
{
  "cnam_listing": {
    "cnam_listing_enabled": true,
    "cnam_listing_details": "MY COMPANY"
  }
}
```

### CNAM Limitations
- **Max 15 characters** for CNAM display name
- **NOT supported** on toll-free numbers
- **NOT supported** on international numbers
- CNAM propagation to national CNAM database may take 24-48 hours

### CNAM Lookup (Inbound)

The legacy CNAM Data API (`data.telnyx.com`) was **deprecated September 30, 2022**.

Use **Number Lookup** instead:

```
GET https://api.telnyx.com/v2/number_lookup/{phone_number}
```

Returns caller name data along with carrier information.

---

## 10. STIR/SHAKEN

### Overview

STIR/SHAKEN is the FCC-mandated framework for authenticating caller identity to combat robocalls. Telnyx is an approved SHAKEN/STIR participant via STI-PA.

### Attestation Levels

| Level | Name | Meaning |
|-------|------|---------|
| **A** | Full Attestation | Provider knows the customer, they have rights to the number, and the call originates on the provider's network |
| **B** | Partial Attestation | Provider knows the customer but cannot verify the number |
| **C** | Gateway Attestation | Provider cannot verify the customer or number |

### What You Get Automatically

- **Numbers purchased from Telnyx** receive **Attestation A** (Full)
- **Ported numbers** typically receive **Attestation B** (Partial) until fully migrated
- Telnyx **authenticates every outbound call** with a valid U.S. Caller ID originating on their platform

### SIP Header: `verstat` Parameter

Telnyx includes the `verstat` parameter in the `P-Asserted-Identity` SIP header for inbound calls:

| Value | Meaning |
|-------|---------|
| `TN-Validation-Passed` | PASSPorT verified, Full Attestation (A) |
| `TN-Validation-Passed-B` | PASSPorT verified, Partial Attestation (B) |
| `TN-Validation-Passed-C` | PASSPorT verified, Gateway Attestation (C) |
| `TN-Validation-Failed` | PASSPorT verification failed |
| `No-TN-Validation` | No STIR/SHAKEN information present |

### Configuration

STIR/SHAKEN is **automatic** for Telnyx-originated calls -- no API configuration needed. You cannot manually set attestation levels; they are determined by number ownership and call origin.

For **receiving** STIR/SHAKEN data on inbound calls, the `verstat` parameter is automatically included in SIP headers for Call Control and TeXML applications.

---

## 11. E911 Emergency Configuration

### Standard E911 (V1)

```
PATCH https://api.telnyx.com/v1/numbers/{id}/e911
```

Enable E911 and associate an address with a phone number.

### Dynamic E911 (V2 -- Recommended)

#### Dynamic Emergency Addresses

```
POST   https://api.telnyx.com/v2/dynamic_emergency_addresses
GET    https://api.telnyx.com/v2/dynamic_emergency_addresses
GET    https://api.telnyx.com/v2/dynamic_emergency_addresses/{id}
PATCH  https://api.telnyx.com/v2/dynamic_emergency_addresses/{id}
DELETE https://api.telnyx.com/v2/dynamic_emergency_addresses/{id}
```

Create a physical address location for E911 calls. Returns a `sip_geolocation_id`.

#### Dynamic Emergency Endpoints

```
POST   https://api.telnyx.com/v2/dynamic_emergency_endpoints
GET    https://api.telnyx.com/v2/dynamic_emergency_endpoints
GET    https://api.telnyx.com/v2/dynamic_emergency_endpoints/{id}
PATCH  https://api.telnyx.com/v2/dynamic_emergency_endpoints/{id}
DELETE https://api.telnyx.com/v2/dynamic_emergency_endpoints/{id}
```

Create endpoint details (room, floor, booth). Returns a `sip_from_id`.

#### Enabling E911 on a Phone Number

```
POST https://api.telnyx.com/v2/phone_numbers/{id}/actions/enable_emergency
```

#### Two Methods for Location

1. **API-based**: Pre-configure addresses and endpoints (recommended for fixed locations)
2. **Built-in geolocation**: Pass lat/long in SIP headers (for mobile/IoT)

#### Testing

Call **933** (not 911) to test E911 without reaching actual emergency services.

---

## 12. 10DLC / A2P Registration

### Overview

10DLC (10-Digit Long Code) registration is required for A2P (Application-to-Person) messaging in the US via The Campaign Registry (TCR).

### Registration Flow

```
1. Register Brand  →  2. Brand Verification  →  3. Create Campaign  →  4. Campaign Review  →  5. Assign Numbers
```

### Step 1: Register a Brand

```
PATCH https://api.telnyx.com/10dlc/brand
```

Provide complete, accurate business information. Incorrect info limits throughput or causes verification delays.

### Step 2: Brand Verification (2FA)

```
POST https://api.telnyx.com/10dlc/brand/{brand_id}/2faEmail
```

Required for `PUBLIC_PROFIT` entity types (since October 3, 2024). A verification email is sent and must be completed via 2FA.

### Step 3: Check Use Case Qualification

Before creating a campaign, verify the brand qualifies for the intended use case:

```
GET https://api.telnyx.com/10dlc/brand/{brand_id}/usecase_qualification
```

### Step 4: Create a Campaign

```
POST https://api.telnyx.com/v2/10dlc/campaignBuilder
```

**Request Body Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `brandId` | string | **Required.** Brand to associate |
| `usecase` | string | **Required.** Campaign use case (e.g., `MARKETING`, `ACCOUNT_NOTIFICATION`) |
| `subUsecases` | array | Sub-use cases |
| `description` | string | Campaign description |
| `messageFlow` | string | How users opt in and message flow |
| `sampleMessages` | array | 2-5 sample messages |
| `embeddedLink` | boolean | Messages contain links? |
| `ageGated` | boolean | Age-gated content? |
| `numberPool` | boolean | Using a number pool? |
| `optinKeywords` | array | Opt-in keywords (e.g., `START`, `YES`) |
| `optoutKeywords` | array | Opt-out keywords (e.g., `STOP`, `CANCEL`) |
| `helpKeywords` | array | Help keywords (e.g., `HELP`, `INFO`) |
| `optinMessage` | string | Opt-in confirmation message |
| `optoutMessage` | string | Opt-out confirmation message |
| `helpMessage` | string | Help response message |

### Campaign Costs

| Use Case | Upfront (3 months) | Monthly After |
|----------|--------------------| --------------|
| Charity | $15 | $5/mo |
| Low Mixed Volume | $6 | $2/mo |
| All Other | $30 | $10/mo |

**Note**: Upfront cost is non-refundable. Campaigns are immutable after creation (except sample messages).

### Step 5: Assign Numbers to Campaign

After campaign approval, assign phone numbers to the campaign for sending.

### Campaign Review Process

1. TCR (The Campaign Registry) manually reviews brand + campaign info
2. Carriers (T-Mobile, AT&T, etc.) additionally review campaigns
3. This is mandatory for all A2P 10DLC registrations industry-wide

### Trust Score

Your brand's Trust Score determines A2P message throughput:
- Higher trust score = higher message throughput
- Trust score is based on brand verification status, business age, EIN verification, etc.

---

## 13. Number Porting

### Overview

Port existing numbers from other carriers to Telnyx.

### Create a Porting Order

```
POST https://api.telnyx.com/v2/porting_orders
```

### Porting Workflow

```
1. Portability Check
2. Create Draft Port Order  →  May split into multiple orders
3. Upload Documents (LOA + Invoice)
4. Select FOC Date
5. Submit Port Order
6. Processing (async with losing carrier)
7. Port Complete
```

### Port Order Statuses

| Status | Description |
|--------|-------------|
| `draft` | Order created, not yet submitted |
| `submitted` | Submitted to losing carrier |
| `in-process` | Being processed |
| `exception` | Issue found -- check comments for details |
| `foc-date-confirmed` | Firm Order Commitment date confirmed |
| `cancel-pending` | Cancellation requested |
| `ported` | Successfully ported |
| `cancelled` | Port cancelled |

### Required Documents

At minimum:
1. **Letter of Authorization (LOA)** -- Authorizes the port
2. **Recent Invoice** -- From the current carrier

Upload documents first, get document IDs, then attach to the porting order.

### FOC Date Selection

```
GET https://api.telnyx.com/v2/porting_orders/{id}/allowed_foc_windows
```

Select from allowed FOC (Firm Order Commitment) dates when submitting.

### Comments (Communication with Porting Team)

```
POST https://api.telnyx.com/v2/porting_orders/{id}/comments
```

### List Porting Orders

```
GET https://api.telnyx.com/v2/porting_orders
```

### Retrieve Porting Order

```
GET https://api.telnyx.com/v2/porting_orders/{id}
```

### List Porting Phone Numbers

```
GET https://api.telnyx.com/v2/porting_phone_numbers
```

### Webhooks

Subscribe to `porting_order.status_changed` events for real-time updates.

### Order Splitting

Port orders may automatically split based on:
- Country
- Number type
- SPID (Service Provider ID -- US/CA)
- FastPort eligibility

Each sub-order must be updated and submitted individually.

### Processing Times
- **FastPort-eligible** (same-day for simple US ports)
- **Standard US/CA** (5-10 business days typical)
- **International** (several weeks, varies by country)

---

## 14. Pricing

### Phone Number Costs

| Type | Monthly Cost | Notes |
|------|-------------|-------|
| Local DID (US) | **$1.00/number** | |
| Toll-Free (US) | **$1.00/number** | 800-series requires 12-month commitment at $40/mo |
| SMS Add-on | **$0.10/number/mo** | For SMS/MMS capability |

### Usage Pricing

| Type | Cost |
|------|------|
| Inbound voice (local) | **$0.0075/min** |
| Inbound voice (toll-free) | **$0.015/min** |
| Outbound voice | **$0.009/min** |
| Outbound SMS (long code) | **$0.0025/msg** |
| Inbound SMS | **Free** |
| Channel (alternative billing) | **$12.00/channel/mo** |

### Volume Discounts

- 50+ numbers/month: automatic discount
- Higher volumes: commitment-based discounts available
- Pay-as-you-go or monthly commitment models

### Compared to Twilio

| | Telnyx | Twilio |
|--|--------|--------|
| Local number | $1.00/mo | $1.15/mo |
| Toll-free | $1.00/mo | $2.15/mo |
| Outbound voice | $0.009/min | $0.014/min |
| Outbound SMS | $0.0025/msg | $0.0079/msg |

---

## 15. Node.js SDK Reference

### Installation

```bash
npm install telnyx
```

**Requirements**: Node.js 20 LTS or later, TypeScript >= 4.9

### Initialization

```typescript
import Telnyx from 'telnyx';

const client = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY,  // Required
  timeout: 60000,                       // Request timeout (default: 60000ms)
  maxRetries: 2                         // Max retries (default: 2)
});
```

### Search Available Numbers

```typescript
const { data } = await client.availablePhoneNumbers.list({
  filter: {
    country_code: "US",
    administrative_area: "IL",
    locality: "Chicago",
    features: ["sms", "voice"],
    phone_number_type: "local",
    limit: 25
  }
});
```

### Reserve Numbers

```typescript
const reservation = await client.numberReservations.create({
  phone_numbers: [
    { phone_number: "+13125551234" },
    { phone_number: "+13125555678" }
  ]
});

// Extend reservation
await client.numberReservations.extend(reservation.data.id);
```

### Purchase Numbers

```typescript
const order = await client.numberOrders.create({
  phone_numbers: [
    { phone_number: "+13125551234" }
  ],
  connection_id: "your-voice-connection-id",
  messaging_profile_id: "your-messaging-profile-id"
});

// Check order status
const status = await client.numberOrders.retrieve(order.data.id);
console.log(status.data.status); // "success"
```

### List Owned Numbers

```typescript
const { data, meta } = await client.phoneNumbers.list({
  page: { size: 100, number: 1 },
  filter: { status: "active" }
});

console.log(`Total: ${meta.total_results}`);
data.forEach(num => {
  console.log(`${num.phone_number} - ${num.status}`);
});
```

### Update Number Settings

```typescript
// Update general settings
await client.phoneNumbers.update("number-id-or-+1number", {
  tags: ["campaign-1", "solar"],
  connection_id: "voice-connection-id"
});

// Update voice settings
await client.phoneNumbers.voice.update("number-id", {
  connection_id: "voice-connection-id",
  cnam_listing: {
    cnam_listing_enabled: true,
    cnam_listing_details: "MY COMPANY"
  }
});
```

### Delete a Number

```typescript
await client.phoneNumbers.del("number-id-or-+1number");
```

### Error Handling

```typescript
try {
  const order = await client.numberOrders.create({
    phone_numbers: [{ phone_number: "+13125551234" }]
  });
} catch (err) {
  if (err instanceof Telnyx.APIError) {
    console.error(`Status: ${err.status}`);    // e.g., 400, 422
    console.error(`Name: ${err.name}`);         // e.g., "BadRequestError"
    console.error(`Headers: ${err.headers}`);
  } else {
    throw err;
  }
}
```

### Auto-Retry Behavior

These errors are automatically retried (up to `maxRetries`):
- Connection errors
- 408 Request Timeout
- 409 Conflict
- 429 Rate Limit
- 500+ Internal Server Errors

---

## 16. Complete Endpoint Summary

### Number Search

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/available_phone_numbers` | Search available numbers |

### Number Reservations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/number_reservations` | Reserve numbers (30 min) |
| `GET` | `/v2/number_reservations` | List reservations |
| `GET` | `/v2/number_reservations/{id}` | Retrieve reservation |
| `POST` | `/v2/number_reservations/{id}/actions/extend` | Extend reservation +30 min |

### Number Orders

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/number_orders` | Create a number order (purchase) |
| `GET` | `/v2/number_orders` | List number orders |
| `GET` | `/v2/number_orders/{id}` | Retrieve number order |
| `GET` | `/v2/sub_number_orders` | List sub number orders |
| `GET` | `/v2/sub_number_orders/{id}` | Retrieve sub number order |
| `PATCH` | `/v2/sub_number_orders/{id}` | Update sub order (regulatory) |
| `POST` | `/v2/number_block_orders` | Order consecutive number blocks |
| `GET` | `/v2/number_block_orders` | List block orders |
| `GET` | `/v2/number_block_orders/{id}` | Retrieve block order |

### Phone Number Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/phone_numbers` | List owned phone numbers |
| `GET` | `/v2/phone_numbers/{id}` | Retrieve phone number |
| `PATCH` | `/v2/phone_numbers/{id}` | Update phone number |
| `DELETE` | `/v2/phone_numbers/{id}` | Delete phone number |
| `POST` | `/v2/phone_numbers/jobs/update_phone_numbers` | Batch update (up to 1,000) |
| `POST` | `/v2/phone_numbers/jobs/delete_phone_numbers` | Batch delete |
| `GET` | `/v2/phone_numbers/jobs/{id}` | Retrieve batch job status |

### Voice Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/phone_numbers/voice` | List numbers with voice settings |
| `GET` | `/v2/phone_numbers/{id}/voice` | Get voice settings |
| `PATCH` | `/v2/phone_numbers/{id}/voice` | Update voice settings |

### Messaging Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/phone_numbers/messaging` | List numbers with messaging settings |
| `PATCH` | `/v2/phone_numbers/{id}/messaging` | Update messaging settings |
| `PATCH` | `/v2/phone_numbers/messaging` | Bulk update messaging settings |

### Emergency (E911)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/phone_numbers/{id}/actions/enable_emergency` | Enable E911 |
| `POST` | `/v2/dynamic_emergency_addresses` | Create emergency address |
| `GET` | `/v2/dynamic_emergency_addresses` | List addresses |
| `GET` | `/v2/dynamic_emergency_addresses/{id}` | Retrieve address |
| `PATCH` | `/v2/dynamic_emergency_addresses/{id}` | Update address |
| `DELETE` | `/v2/dynamic_emergency_addresses/{id}` | Delete address |
| `POST` | `/v2/dynamic_emergency_endpoints` | Create emergency endpoint |
| `GET` | `/v2/dynamic_emergency_endpoints` | List endpoints |
| `GET` | `/v2/dynamic_emergency_endpoints/{id}` | Retrieve endpoint |
| `PATCH` | `/v2/dynamic_emergency_endpoints/{id}` | Update endpoint |
| `DELETE` | `/v2/dynamic_emergency_endpoints/{id}` | Delete endpoint |

### Number Porting

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/porting_orders` | Create port order |
| `GET` | `/v2/porting_orders` | List port orders |
| `GET` | `/v2/porting_orders/{id}` | Retrieve port order |
| `GET` | `/v2/porting_orders/{id}/allowed_foc_windows` | Get FOC date options |
| `POST` | `/v2/porting_orders/{id}/comments` | Add comment |
| `GET` | `/v2/porting_phone_numbers` | List porting phone numbers |

### 10DLC / A2P

| Method | Endpoint | Description |
|--------|----------|-------------|
| `PATCH` | `/10dlc/brand` | Create/update brand |
| `POST` | `/10dlc/brand/{id}/2faEmail` | Trigger brand 2FA verification |
| `GET` | `/10dlc/brand/{id}/usecase_qualification` | Check use case qualification |
| `POST` | `/v2/10dlc/campaignBuilder` | Create campaign |

### Number Lookup

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/number_lookup/{phone_number}` | Lookup number (carrier, CNAM, type) |

### Messaging Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/messaging_profiles` | Create messaging profile |
| `GET` | `/v2/messaging_profiles` | List messaging profiles |
| `GET` | `/v2/messaging_profiles/{id}` | Retrieve messaging profile |
| `PATCH` | `/v2/messaging_profiles/{id}` | Update messaging profile |
| `DELETE` | `/v2/messaging_profiles/{id}` | Delete messaging profile |

---

## 17. Integration Notes for dial-smart-system

### Current State

The dial-smart-system currently uses **Twilio** as the primary carrier for phone number management. The Telnyx integration exists at these levels:

| Component | Status |
|-----------|--------|
| `voice-broadcast-engine` → `callWithTelnyx()` | **WORKING** for basic outbound calls |
| `telnyxAdapter.ts` (src/services/providers/) | **STUB** -- all methods return failures |
| `telnyx-webhook/index.ts` | **STUB** -- event cases defined but no processing |
| Database schema (phone_providers, carrier_configs) | **COMPLETE** |
| TypeScript types (IProviderAdapter includes 'telnyx') | **COMPLETE** |

### What Needs Building for Full Number Management

1. **Edge Function: `telnyx-number-management`**
   - Search available numbers (proxy to GET `/v2/available_phone_numbers`)
   - Purchase numbers (proxy to POST `/v2/number_orders`)
   - Configure voice settings (PATCH `/v2/phone_numbers/{id}/voice`)
   - Configure messaging (PATCH `/v2/phone_numbers/{id}/messaging`)
   - Delete numbers (DELETE `/v2/phone_numbers/{id}`)
   - Sync purchased numbers to `phone_numbers` table

2. **Update `telnyxAdapter.ts`** (or remove if edge functions handle everything)
   - Implement real API calls instead of stub responses
   - Match the pattern used by voice-broadcast-engine

3. **Phone Number UI Integration**
   - Add Telnyx as provider option in phone number purchase flow
   - Show Telnyx numbers alongside Twilio numbers
   - Provider-specific configuration (voice connection, messaging profile)

4. **10DLC Registration Flow**
   - Brand registration UI
   - Campaign creation UI
   - Number-to-campaign assignment
   - Shared with Twilio's 10DLC (TCR is the same backend)

5. **Webhook Processing**
   - Complete `telnyx-webhook/index.ts` for number order status updates
   - Port order status change handling

### Environment Variables Needed

```
TELNYX_API_KEY=KEY_YOUR_KEY_HERE
```

Already documented in Supabase secrets configuration. The key is used by `voice-broadcast-engine` for the existing Telnyx calling integration.

### Key Differences from Twilio

| Feature | Twilio | Telnyx |
|---------|--------|--------|
| Number search | `AvailablePhoneNumbers` resource | `GET /v2/available_phone_numbers` |
| Number purchase | `IncomingPhoneNumbers.create()` | `POST /v2/number_orders` (async) |
| Number config | Immediate on purchase | May require separate PATCH calls |
| Voice assignment | `voice_url` on number | `connection_id` on number |
| Messaging assignment | `messaging_service_sid` | `messaging_profile_id` |
| STIR/SHAKEN | Automatic (A for owned) | Automatic (A for owned) |
| CNAM | Via API | Via voice settings PATCH |
| Pricing (local) | $1.15/mo | $1.00/mo |
| Pricing (outbound) | $0.014/min | $0.009/min |

---

## Sources

- [Telnyx Number Search Guide](https://developers.telnyx.com/docs/numbers/phone-numbers/number-search)
- [List Available Phone Numbers API](https://developers.telnyx.com/api/numbers/list-available-phone-numbers)
- [Number Orders Tutorial](https://developers.telnyx.com/docs/numbers/phone-numbers/number-orders)
- [Create a Number Order API](https://developers.telnyx.com/api/numbers/create-number-order)
- [Number Reservations Guide](https://developers.telnyx.com/docs/numbers/phone-numbers/number-reservations)
- [Advanced Number Search](https://developers.telnyx.com/docs/numbers/phone-numbers/advanced-number-search)
- [Update Phone Number Voice Settings API](https://developers.telnyx.com/api/numbers/update-phone-number-voice-settings)
- [Update Phone Number Messaging Settings API](https://developers.telnyx.com/api/messaging/update-phone-number-messaging-settings)
- [Retrieve a Phone Number API](https://developers.telnyx.com/api/numbers/retrieve-phone-number)
- [Batch Update Numbers API](https://developers.telnyx.com/api/numbers/create-update-phone-numbers-job)
- [Batch Delete Numbers API](https://developers.telnyx.com/api/numbers/create-delete-phone-numbers-job)
- [STIR/SHAKEN with Telnyx](https://support.telnyx.com/en/articles/5402969-stir-shaken-with-telnyx)
- [SHAKEN/STIR Parameters](https://support.telnyx.com/en/articles/7421223-shaken-stir-parameters)
- [Caller ID Management](https://telnyx.com/use-cases/caller-id-management)
- [Dynamic E911 Guide](https://developers.telnyx.com/docs/voice/sip-trunking/emergency-calling-dynamic-e911)
- [10DLC Quickstart](https://developers.telnyx.com/docs/messaging/10dlc/quickstart)
- [Submit Campaign API](https://developers.telnyx.com/api/messaging/10dlc/post-campaign)
- [Number Porting Quickstart](https://developers.telnyx.com/docs/numbers/porting/quickstart)
- [List Porting Orders API](https://developers.telnyx.com/api/porting/porting-order/list-porting-orders)
- [Telnyx Pricing - Numbers](https://telnyx.com/pricing/numbers)
- [telnyx-node GitHub](https://github.com/team-telnyx/telnyx-node)
- [telnyx npm package](https://www.npmjs.com/package/telnyx)
- [Telnyx CNAM Deprecation Notice](https://support.telnyx.com/en/articles/6535207-telnyx-cnam-api-endpoint-deprecation)
- [E911 Setup Guide](https://support.telnyx.com/en/articles/1130683-e911-setup-guide)
- [10DLC Brand Registration](https://telnyx.com/resources/10dlc-brand-registration)
- [How to Create a 10DLC Campaign](https://support.telnyx.com/en/articles/6339152-how-to-create-a-10dlc-campaign)
