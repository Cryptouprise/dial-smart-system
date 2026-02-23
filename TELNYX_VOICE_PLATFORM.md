# Telnyx Voice AI Platform - Complete Technical Reference

> **Purpose**: Comprehensive knowledge base for integrating Telnyx Voice AI Agents into dial-smart-system.
> **Last Updated**: February 23, 2026 (Deep Technical Detail Update)
> **Status**: Research Complete | Deep API-Level Documentation | Integration Planning

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Architecture & Infrastructure](#architecture--infrastructure)
3. [AI Assistants (Voice Agents)](#ai-assistants-voice-agents)
4. [API Reference](#api-reference)
5. [Tools & Function Calling](#tools--function-calling)
6. [Voice & Speech Configuration](#voice--speech-configuration)
7. [Memory & Dynamic Variables](#memory--dynamic-variables)
8. [Webhooks & Events](#webhooks--events)
9. [Outbound Calling](#outbound-calling)
10. [Scheduled Events API](#scheduled-events-api)
11. [AI Missions (Multi-Call Orchestration)](#ai-missions-multi-call-orchestration)
12. [Multi-Agent Handoff](#multi-agent-handoff)
13. [Call Control Integration](#call-control-integration)
14. [Monitoring & Analytics](#monitoring--analytics)
15. [Pricing](#pricing)
16. [Telnyx vs Retell AI Comparison](#telnyx-vs-retell-ai-comparison)
17. [Node.js SDK](#nodejs-sdk)
18. [Current Codebase Integration Status](#current-codebase-integration-status)
19. [Integration Architecture Plan](#integration-architecture-plan)

---

## Platform Overview

Telnyx is a **full-stack, agent-native voice AI platform** that owns everything from the carrier network to AI inference. Unlike competitors that abstract over third-party infrastructure, Telnyx owns:

- **Layer 1-3**: Bare-metal fiber, direct peering, private global IP backbone (bypasses public internet)
- **Layer 4-5**: Programmable identity & compliance (STIR/SHAKEN, 10DLC/KYC, SOC2, HIPAA, PCI, GDPR)
- **Layer 6-9**: Agent execution & memory — colocated GPUs with telephony PoPs for ultra-low latency

### Key Stats
- **Latency**: Sub-200ms round-trip (sub-500ms end-to-end including client)
- **PoPs**: 16+ Points of Presence globally
- **Countries**: 30+ with licensed carrier footprint
- **Languages**: 40+ supported with real-time multilingual transcription
- **Compliance**: ISO, PCI, HIPAA, GDPR, SOC2 Type II

---

## Architecture & Infrastructure

```
┌─────────────────────────────────────────────────────┐
│                 Your Application                      │
│         (dial-smart-system / Edge Functions)          │
├─────────────────────────────────────────────────────┤
│                  Telnyx API Layer                      │
│   REST API  │  Call Control  │  TeXML  │  WebRTC      │
├─────────────────────────────────────────────────────┤
│              Agent Control Plane (L6-9)               │
│   AI Assistants │ LLM Inference │ TTS │ STT │ Memory  │
├─────────────────────────────────────────────────────┤
│           Identity & Compliance (L4-5)                │
│   STIR/SHAKEN │ 10DLC │ KYC │ Number Management      │
├─────────────────────────────────────────────────────┤
│              Owned Network (L1-3)                     │
│   Private Fiber │ Direct Peering │ Edge PoPs + GPUs   │
└─────────────────────────────────────────────────────┘
```

### Why This Matters for Us
- **No handoffs**: Voice → STT → LLM → TTS all happen on the same infrastructure
- **No lag**: GPUs colocated with telephony PoPs eliminates network hops
- **No third-party dependencies**: Unlike Retell (which uses Twilio/Telnyx for telephony), Telnyx IS the telephony
- **Cost**: Single vendor = no stacking of STT + LLM + TTS + telephony fees

---

## AI Assistants (Voice Agents)

### What They Are
Telnyx AI Assistants are fully managed voice AI agents that handle phone calls autonomously. They combine:
- An LLM for conversation intelligence
- Speech-to-Text for understanding the caller
- Text-to-Speech for speaking back
- Tools for taking real-world actions (webhooks, transfers, DTMF, etc.)
- Memory for recalling past interactions
- Telephony for actual phone connectivity

### Creating an Assistant

#### Via Mission Control Portal (No-Code)
1. Navigate to AI Assistant section
2. Name the assistant
3. Select an AI model
4. Write system instructions (persona, purpose, conversation steps)
5. Configure greeting message
6. Enable tools (webhook, transfer, handoff, etc.)
7. Configure voice and transcription settings
8. Enable telephony (inbound/outbound)
9. Assign phone numbers
10. Test with built-in call tester

#### Via API (Programmatic)
```bash
POST https://api.telnyx.com/v2/ai/assistants
Authorization: Bearer <TELNYX_API_KEY>
Content-Type: application/json

{
  "name": "Solar Sales Agent",
  "model": "qwen/qwen3-235b-a22b",
  "instructions": "You are a friendly solar energy consultant...",
  "greeting": "Hi! Thanks for your interest in solar energy. How can I help you today?",
  "tools": [...],
  "voice_settings": {
    "voice": "Telnyx.NaturalHD.Ava",
    "api_key_ref": null
  },
  "transcription": {
    "model": "telnyx_deepgram_nova3"
  },
  "telephony_settings": {
    "default_texml_app_id": "app_xxxxx"
  },
  "messaging_settings": {
    "default_messaging_profile_id": "profile_xxxxx"
  },
  "enabled_features": ["telephony", "messaging"],
  "dynamic_variables_webhook_url": "https://your-server.com/init",
  "dynamic_variables": {
    "company_name": "Solar Solutions Inc"
  },
  "insight_settings": {
    "insight_group_id": "group_xxxxx"
  },
  "privacy_settings": {
    "data_retention": true
  }
}
```

### Available Models

Telnyx supports models from multiple providers:

| Provider | Model | Notes |
|----------|-------|-------|
| **Qwen** | qwen/qwen3-235b-a22b | Recommended starting point, no API key needed |
| **OpenAI** | gpt-4o, gpt-4o-mini, gpt-5.2 | Requires OpenAI API key |
| **Anthropic** | Claude Sonnet | Requires API key |
| **Mistral** | Various | Available on platform |
| **Google** | Gemini models | Available on platform |
| **xAI** | Grok models | Available on platform |
| **Deepseek** | Deepseek models | Available on platform |
| **Fixie.ai** | ultravox-v0_4 | Native audio model (no separate STT needed) |
| **Custom** | Any OpenAI-compatible endpoint | BYOK - bring your own model |

**Fallback Model**: You can configure a fallback model that activates if the primary goes down.

**Custom LLM**: Enable "Use Custom LLM" and provide a Base URL for any OpenAI-compatible inference endpoint.

---

## API Reference

### Assistant CRUD Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/ai/assistants` | Create a new assistant |
| `GET` | `/v2/ai/assistants` | List all assistants |
| `GET` | `/v2/ai/assistants/{id}` | Get assistant by ID |
| `POST` | `/v2/ai/assistants/{id}` | Update assistant |
| `DELETE` | `/v2/ai/assistants/{id}` | Delete assistant |
| `POST` | `/v2/ai/assistants/{id}/clone` | Clone assistant (excludes telephony/messaging settings) |
| `POST` | `/v2/ai/assistants/import` | Import from Retell/Vapi/ElevenLabs |
| `POST` | `/v2/ai/assistants/{id}/chat` | Chat with assistant (BETA) |
| `POST` | `/v2/ai/assistants/{id}/sms_chat` | SMS chat with assistant |

### Call Control Commands

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/calls` | Dial an outbound call |
| `POST` | `/v2/calls/{id}/actions/answer` | Answer incoming call |
| `POST` | `/v2/calls/{id}/actions/ai_assistant_start` | Start AI assistant on call |
| `POST` | `/v2/calls/{id}/actions/gather_using_ai` | Gather structured data via AI |
| `POST` | `/v2/calls/{id}/actions/hangup` | Hang up call |
| `POST` | `/v2/calls/{id}/actions/transfer` | Transfer call |
| `POST` | `/v2/calls/{id}/actions/speak` | Speak text (TTS) |
| `POST` | `/v2/calls/{id}/actions/suppression_start` | Start noise suppression |
| `POST` | `/v2/calls/{id}/actions/siprec_start` | Start SIPREC recording |

### TeXML AI Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/texml/ai_calls/{texml_app_id}` | Initiate outbound AI call |

### Scheduled Events

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v2/ai/assistants/{id}/scheduled_events` | Schedule a call or SMS |
| `GET` | `/v2/ai/assistants/{id}/scheduled_events` | List scheduled events |
| `DELETE` | `/v2/ai/assistants/{id}/scheduled_events/{event_id}` | Cancel scheduled event |

### Conversations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/ai/assistants/{id}/conversations` | List conversations |
| `GET` | `/v2/ai/assistants/{id}/conversations/{conv_id}` | Get conversation details |

### Authentication
All requests use Bearer token authentication:
```
Authorization: Bearer <TELNYX_API_KEY>
```

---

## Tools & Function Calling (Deep Technical Detail)

AI Assistants support 10 built-in tool types. Tools are configured in the `tools` array when creating/updating an assistant via the API. The LLM decides when to invoke tools based on the conversation context and tool descriptions.

### Tool Types in the `tools` Array

The `tools` array accepts objects of these types: `WebhookTool`, `RetrievalTool`, `HandoffTool`, `HangupTool`, `TransferTool`, `SIPReferTool`, `DTMFTool`, `SendMessageTool`, `SkipTurnTool`, and `MCPServerTool`.

All tools can be templated with **dynamic variables** using `{{variable_name}}` syntax in URLs, headers, descriptions, and parameter definitions.

### 1. Webhook Tool (Primary Function Calling Mechanism)
Make HTTP requests to external APIs during a conversation. This is the main way to give the AI real-world capabilities.

```json
{
  "type": "webhook",
  "name": "check_availability",
  "description": "Check calendar availability for appointment booking",
  "url": "https://your-api.com/availability/{date}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{#integration_secret}}your-secret-name{{/integration_secret}}"
  },
  "path_parameters": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "Date in YYYY-MM-DD format" }
    },
    "required": ["date"]
  },
  "query_parameters": {
    "type": "object",
    "properties": {
      "timezone": { "type": "string", "description": "IANA timezone" }
    }
  },
  "body_parameters": {
    "type": "object",
    "properties": {
      "service_type": { "type": "string", "enum": ["consultation", "installation", "maintenance"] }
    }
  }
}
```

**Configuration details:**
- `url`: The URL to call. Supports path parameters via `{param_name}` placeholders.
- `method`: GET, POST, PUT, PATCH, DELETE
- `headers`: Static headers. Use Mustache templating `{{#integration_secret}}name{{/integration_secret}}` to reference stored secrets (never expose API keys in the tool definition).
- `path_parameters`: JSON Schema object. Values extracted by the LLM and substituted into URL placeholders.
- `query_parameters`: JSON Schema object. Values appended as URL query string.
- `body_parameters`: JSON Schema object. Values sent as JSON request body.
- Each parameter type supports `properties`, `required`, and standard JSON Schema features (type, description, enum, etc.)
- **Test button**: Available in the portal to send sample requests during configuration (not just during live calls)
- **Webhook timeout**: Must respond within **2 seconds** or Telnyx retries

### 2. Transfer Tool
Transfer calls to human agents or other phone numbers.

```json
{
  "type": "transfer",
  "name": "transfer_to_sales",
  "description": "Transfer the caller to the sales team when they want to speak with a human",
  "targets": [
    { "name": "Sales Team", "number": "+15551234567" },
    { "name": "Support", "number": "+15559876543" }
  ]
}
```

**Features:**
- Named targets with phone numbers -- LLM picks the right target based on conversation
- Full conversation context preserved (warm transfer)
- **AMD on transfer**: Telnyx can detect voicemail on the transfer destination and either cancel the transfer or have the AI leave a voicemail message
- Generates `call.initiated` webhook for the new leg

### 3. SIP Refer Tool
Transfer calls via SIP REFER for contact center integration. Lower cost than a regular transfer ($0.002 vs $0.10) because it uses SIP signaling rather than creating a new call leg.

### 4. Handoff Tool (Multi-Agent)
Route conversation between multiple AI assistants. See dedicated [Multi-Agent Handoff](#multi-agent-handoff) section below for full details.

```json
{
  "type": "handoff",
  "name": "handoff_to_billing",
  "description": "Hand off to billing specialist assistant when the user has billing questions",
  "assistant_id": "asst_billing_xxxxx",
  "voice_mode": "unified"
}
```

- `assistant_id`: The target assistant's ID to hand off to
- `voice_mode`: `"unified"` (same voice, transparent) or `"distinct"` (each agent keeps its voice)

### 5. Hangup Tool
Let the assistant end the call programmatically when the conversation is complete.

```json
{
  "type": "hangup",
  "name": "end_call",
  "description": "End the call when the conversation is complete and all questions are answered"
}
```

### 6. Send DTMF Tool
Send touch-tone signals during the call. Useful for navigating legacy IVR systems.

```json
{
  "type": "dtmf",
  "name": "navigate_ivr",
  "description": "Send DTMF tones to navigate phone menus"
}
```

### 7. Send Message Tool
Send SMS directly from the voice agent during a call. Requires `messaging_settings.default_messaging_profile_id` on the assistant.

```json
{
  "type": "send_message",
  "name": "send_confirmation_sms",
  "description": "Send appointment confirmation SMS to the caller with the details discussed"
}
```

### 8. MCP Server Tool
Connect to any Model Context Protocol server for external integrations.

```json
{
  "type": "mcp_server",
  "name": "crm_integration",
  "description": "Access CRM data via MCP",
  "url": "https://your-mcp-server.com/mcp"
}
```

**Features:**
- Native MCP support -- connects to any public API with an MCP server
- Telnyx auto-includes `telnyx_conversation_id` in requests (tamper-proof, not susceptible to prompt injection)
- Integration secrets for secure URL storage
- Zapier integration via MCP (access 6,000+ apps)
- Telnyx publishes their own MCP server: `github.com/team-telnyx/telnyx-mcp-server`

### 9. Skip Turn Tool
Let the assistant stay silent and wait for more user input. Useful when the user is thinking or providing extended information.

```json
{
  "type": "skip_turn",
  "name": "wait_for_input",
  "description": "Stay silent and wait when the user seems to be thinking or looking something up"
}
```

### 10. Retrieval Tool (Knowledge Base / RAG)
Search the assistant's uploaded knowledge base for relevant information during the conversation. See dedicated [Knowledge Base / RAG](#knowledge-base-1) section below for full details.

```json
{
  "type": "retrieval",
  "name": "search_knowledge_base",
  "description": "Search company documents for product information, pricing, and policies"
}
```

The retrieval tool automatically searches the embedded storage buckets configured on the assistant. The assistant configuration includes a list of bucket names for RAG.

---

## Voice & Speech Configuration

### Text-to-Speech (TTS) Providers

| Provider | Voices | Notes |
|----------|--------|-------|
| **Telnyx NaturalHD** | Multiple voices | Native, lowest latency, English + 30+ languages |
| **ElevenLabs** | Full library | Requires ElevenLabs API key |
| **ResembleAI (Chatterbox)** | Emotion-preserving | New addition, preserves style/accent |
| **Minimax** | Expressive speech | Natural, multilingual |
| **Azure Neural HD** | Microsoft voices | Enterprise-grade |
| **AWS Polly** | Standard + Neural | Use `AWS.Polly.<VoiceId>-Neural` format |

### Speech-to-Text (STT) Providers

| Provider | Model | Notes |
|----------|-------|-------|
| **Telnyx/Deepgram** | Nova-3 | Default, high accuracy |
| **Deepgram Flux** | Eager end-of-turn | Adjustable thresholds, reduces latency |
| **Google** | Cloud Speech | With speaker separation |
| **Distil-Whisper** | distil-whisper | Via AI transcription API |

### Configuration Options
- **Voice selection**: Preview and compare samples in portal
- **Language**: Dropdown of 40+ languages
- **Noise suppression**: Toggle on/off for cleaner transcription
- **Background audio**: Optional ambient sounds (e.g., "Office")
- **Interruption settings**: Allow/disallow caller interrupting the assistant
- **Max duration**: Configure maximum AI assistant participation time

---

## Memory & Dynamic Variables

### Memory System (Deep Technical Detail)

Telnyx AI Assistants have built-in memory that persists across conversations. Instead of starting each phone call or text exchange from scratch, the assistant naturally continues previous discussions.

#### How Memory Persists Between Calls

Memory is keyed on **phone number** (the `telnyx_end_user_target`). When a returning caller calls in (or you call them out), Telnyx can automatically recall their previous conversations. The mechanism works as follows:

1. **Call starts** -- Telnyx fires the `assistant.initialization` webhook to your `dynamic_variables_webhook_url`
2. **Your webhook responds** with a `memory` object specifying which past conversations to load
3. **Telnyx fetches** the matching conversations from its stored history
4. **The assistant receives** those past conversations as context alongside the system instructions
5. **During the call**, the assistant can reference what was discussed before
6. **After the call**, the new conversation is automatically stored (if `data_retention: true`)

#### The `memory` Object -- Query Language

Telnyx exposed a **flexible query language** that mirrors the List Conversations API. Any query you can build with the List Conversations endpoint can be used as a `conversation_query` string. The format is URL query-string syntax with PostgREST-style filters.

**Full webhook response with memory (the canonical example):**
```json
{
  "dynamic_variables": {
    "full_name": "Rachel Thomas",
    "facility_name": "UCHealth",
    "facility_department": "Cardiology"
  },
  "memory": {
    "conversation_query": "metadata->telnyx_end_user_target=eq.+13128675309&limit=5&order=last_message_at.desc",
    "insight_query": "insight_ids=cfcc865c-d3d4-4823-8a4b-f0df57d9f56f,a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  },
  "conversation": {
    "metadata": {
      "lead_id": "lead_123",
      "campaign": "solar_followup",
      "your_custom_metadata": "your_custom_value"
    }
  }
}
```

**Query string breakdown:**
- `metadata->telnyx_end_user_target=eq.+13128675309` -- filter by caller phone number (PostgREST JSON arrow operator)
- `limit=5` -- return only the last 5 conversations
- `order=last_message_at.desc` -- most recent first

#### `conversation_query` -- What Conversations to Remember

Controls WHICH past conversations the assistant can see. Supports:
- Filtering by metadata fields (phone number, custom tags, campaign ID, etc.)
- Limiting how many past conversations (e.g., `limit=5` for last 5)
- Ordering (typically `last_message_at.desc` for most recent first)
- Time-based filtering via metadata or date ranges

#### `insight_query` -- What Information to Remember

Controls WHAT from those conversations is remembered. Instead of feeding full conversation transcripts (which can be verbose), you specify insight IDs:
- `insight_ids=123,456` -- comma-delimited list of insight IDs
- Only the **results** from those specific insights will be included in memory
- Insight IDs are found in the Insights tab for your assistant (UUID format)
- Example: If you have a "Conversation Summary" insight, passing its ID means the assistant only sees summaries, not raw transcripts

#### `conversation.metadata` -- Tagging Current Conversation

You can attach custom metadata to the CURRENT conversation in the webhook response. This metadata is stored with the conversation and can be used in future `conversation_query` filters:
```json
{
  "conversation": {
    "metadata": {
      "lead_id": "lead_123",
      "campaign_type": "solar_followup",
      "agent_version": "v2"
    }
  }
}
```

In future conversations, you can then filter on this metadata:
`"conversation_query": "metadata->lead_id=eq.lead_123&limit=10&order=last_message_at.desc"`

#### Reading Conversations Programmatically

**List Conversations:**
```
GET https://api.telnyx.com/v2/ai/assistants/{assistant_id}/conversations
```

**Get Conversation Details (with messages/transcript):**
```
GET https://api.telnyx.com/v2/ai/assistants/{assistant_id}/conversations/{conversation_id}
```

These endpoints return conversation history including messages, metadata, and timestamps. The `data_retention` setting on the assistant must be `true` for conversations to be stored.

#### Cross-Channel Memory

Memory works across **voice AND SMS**. The same assistant can remember a phone call when the person texts, and vice versa. The `telnyx_end_user_target` (phone number) is the linking key across channels.

#### Key Limitations & Gotchas

- **Webhook timeout**: Your `dynamic_variables_webhook_url` must respond within **1 second** or the call proceeds with fallback values (no memory loaded)
- **`data_retention` must be `true`**: If false, no conversation history is stored, so memory has nothing to query
- **Shared numbers**: If multiple end users share a number, memory may cross-contaminate -- use custom metadata to disambiguate
- **Memory is read-only during call**: You cannot write to memory mid-call; the conversation is stored after it ends
- **No direct "write memory" API**: Memory is implicitly populated by conversation history and insights -- you control what gets stored via `data_retention` and what gets recalled via the `memory` query

### Dynamic Variables

Variables that personalize conversations at runtime. Use `{{variable_name}}` syntax in instructions, greeting, and tool configurations.

**System Variables** (auto-populated by Telnyx):
| Variable | Description |
|----------|-------------|
| `telnyx_current_time` | Current timestamp |
| `telnyx_conversation_channel` | Channel type (phone_call, sms, web) |
| `telnyx_agent_target` | The assistant's phone number |
| `telnyx_end_user_target` | The caller's phone number |
| `telnyx_end_user_target_verified` | STIR/SHAKEN verification status |
| `call_control_id` | Unique call identifier |

**Custom Variables**: Define your own (e.g., `company_name`, `appointment_time`, `patient_name`)

**Injection Methods**:
1. **Default values**: Set in assistant builder (fallback)
2. **API injection**: Pass via `AIAssistantDynamicVariables` parameter in outbound call
3. **Webhook**: `dynamic_variables_webhook_url` — called at conversation start
4. **SIP headers**: Custom SIP headers mapped to variables

**Webhook Initialization** (`assistant.initialization` event):
```json
{
  "event_type": "assistant.initialization",
  "data": {
    "telnyx_conversation_channel": "phone_call",
    "telnyx_agent_target": "+15551234567",
    "telnyx_end_user_target": "+15559876543",
    "telnyx_end_user_target_verified": true,
    "call_control_id": "v3:xxxxx",
    "assistant_id": "asst_xxxxx"
  }
}
```

**Important**: Webhook must respond within **1 second** or the call proceeds with fallback values.

---

## Webhooks & Events

### Call Control Webhooks

| Event Type | Trigger |
|------------|---------|
| `call.initiated` | Call is being set up |
| `call.ringing` | Call is ringing |
| `call.answered` | Call was answered |
| `call.hangup` | Call ended |
| `call.speak.started` | TTS playback started |
| `call.speak.ended` | TTS playback ended |
| `call.conversation.ended` | AI conversation finished |
| `call.conversation_insights.generated` | Post-call insights ready |
| `call.machine.detection.ended` | AMD completed |
| `call.gather.ended` | AI gather completed |

### Post-Call Insights Webhook (Deep Technical Detail)

Insights are configurable, structured data extraction from conversations. Unlike simple transcription, insights use AI to analyze the conversation and extract specific information you define.

#### Insight Architecture

```
Insight Templates (define what to extract)
        │
        ▼
Insight Groups (organize templates into sets)
        │
        ▼
Assigned to Assistant (via insight_settings.insight_group_id)
        │
        ▼
After each call → Insights auto-generated
        │
        ▼
Webhook delivery (push to your endpoint)
```

#### Creating Insight Templates

**Portal:** AI, Storage and Compute -> AI Insights -> Create Insight

Each insight template has:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Descriptive identifier (e.g., "Conversation Summary", "Customer Sentiment") |
| `instructions` | Yes | Detailed prompt for what to analyze and extract |
| `json_schema` | No | JSON Schema for structured output (forces consistent format) |
| `webhook` | No | Per-insight webhook override |

**Example insight templates:**

**1. Conversation Summary:**
```
Name: "Conversation Summary"
Instructions: "Summarize this conversation for use as future context. Include: key facts mentioned, decisions made, user preferences expressed, and action items or follow-ups needed. Keep it concise (2-3 sentences) focusing on useful information for future conversations."
```

**2. Customer Sentiment (Structured):**
```
Name: "Customer Sentiment"
Instructions: "Measure the positivity and negativity of the call. Rate from 1-5 in ascending order."
JSON Schema: { "type": "object", "properties": { "score": { "type": "integer", "minimum": 1, "maximum": 5 }, "reasoning": { "type": "string" } } }
```

**3. Lead Qualification:**
```
Name: "Lead Qualification"
Instructions: "Extract the following from the conversation: homeowner status (yes/no/unknown), roof type, monthly electricity bill range, timeline for solar installation, and any objections raised."
JSON Schema: { "type": "object", "properties": { "homeowner": { "type": "string", "enum": ["yes", "no", "unknown"] }, "roof_type": { "type": "string" }, "monthly_bill": { "type": "string" }, "timeline": { "type": "string" }, "objections": { "type": "array", "items": { "type": "string" } } } }
```

#### Insight Groups

- Group multiple insight templates together
- Assign a group to one or more assistants
- All insights in the group run automatically after every conversation
- Groups can have a default webhook URL (all insights in the group push there)
- Per-assistant webhook override possible

#### Webhook Delivery

**Event type:** `call.conversation_insights.generated`

**Configure:** Set webhook URL on the Insight Group, or override per-assistant in the Analysis tab.

**Payload structure (estimated based on documentation):**
```json
{
  "event_type": "call.conversation_insights.generated",
  "data": {
    "conversation_id": "conv_xxxxx",
    "assistant_id": "asst_xxxxx",
    "insight_group_id": "group_xxxxx",
    "insights": [
      {
        "insight_id": "cfcc865c-d3d4-4823-8a4b-f0df57d9f56f",
        "name": "Conversation Summary",
        "result": "Customer Rachel Thomas called about solar panel installation for her home in Denver. She has a south-facing roof and pays ~$200/month in electricity. Interested in scheduling a site assessment next week."
      },
      {
        "insight_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "name": "Customer Sentiment",
        "result": { "score": 4, "reasoning": "Customer was enthusiastic and asked detailed questions" }
      },
      {
        "insight_id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
        "name": "Lead Qualification",
        "result": {
          "homeowner": "yes",
          "roof_type": "south-facing shingle",
          "monthly_bill": "$180-200",
          "timeline": "next 2-3 months",
          "objections": ["wants to compare pricing"]
        }
      }
    ],
    "metadata": {
      "telnyx_end_user_target": "+15559876543",
      "telnyx_agent_target": "+15551234567",
      "your_custom_metadata": "your_custom_value"
    }
  }
}
```

**Note:** The exact webhook payload schema is not fully documented publicly. The above is reconstructed from documentation fragments. Run a test call and inspect the actual payload to confirm exact field names.

#### Dynamic Variables in Insights

Insights can reference dynamic variables in their instructions:
- `{{telnyx_conversation_channel}}` -- channel type
- `{{telnyx_current_time}}` -- timestamp
- `{{telnyx_end_user_target}}` -- caller's number
- Any custom dynamic variables you defined

#### Memory + Insights Integration

Insight IDs can be used in the `memory.insight_query` field to control what the assistant remembers. Instead of loading full conversation transcripts into memory, load only specific insight results -- much more efficient.

#### Get Insight Template API

```
GET https://api.telnyx.com/v2/ai/insights/{insight_id}
```

Returns the insight template definition including `id`, `name`, `instructions`, `json_schema`, `webhook`, `created_at`, and `insight_type`.

#### Gotchas

- Insights are generated **after** the call ends -- not available in real-time during the call
- Structured insights (with `json_schema`) are more reliable for downstream automation
- The webhook must respond with 2xx or Telnyx retries
- Insights inherit the assistant's `data_retention` setting -- if false, no insights are stored
- Separate webhooks per assistant allow different routing for different agent types

### Assistant Initialization Webhook
Fires at conversation start when `dynamic_variables_webhook_url` is configured.

### Call Progress Events Webhook
Configure under Voice settings for telephony lifecycle events.

### Webhook Signature Verification
Telnyx signs every webhook using **Ed25519 public key cryptography**:
- Headers: `telnyx-timestamp`, `telnyx-signature-ed25519`
- Compatible with Standard Webhooks specification
- Must return HTTP 200 or Telnyx retries at failover URL

### Testing Webhooks
Built-in webhook testing in the portal — test during configuration, not just live calls.

---

## Outbound Calling

### Method 1: TeXML AI Calls (Simplest)
```bash
POST https://api.telnyx.com/v2/texml/ai_calls/{texml_app_id}
Authorization: Bearer <TELNYX_API_KEY>

{
  "From": "+15551234567",
  "To": "+15559876543",
  "AIAssistantId": "asst_xxxxx",
  "MachineDetection": "Enable",
  "AsyncAmd": true,
  "DetectionMode": "Premium",
  "AIAssistantDynamicVariables": {
    "customer_name": "John",
    "appointment_time": "2pm"
  }
}
```

### Method 2: Call Control + Start AI Assistant
```bash
# Step 1: Dial the call
POST https://api.telnyx.com/v2/calls
{
  "connection_id": "conn_xxxxx",
  "from": "+15551234567",
  "to": "+15559876543",
  "webhook_url": "https://your-server.com/webhooks"
}

# Step 2: On call.answered webhook, start the AI assistant
POST https://api.telnyx.com/v2/calls/{call_control_id}/actions/ai_assistant_start
{
  "assistant": {
    "id": "asst_xxxxx"
  },
  "voice": "Telnyx.NaturalHD.Ava",
  "greeting": "Hi {{customer_name}}, this is Sarah from Solar Solutions!",
  "transcription": {
    "model": "telnyx_deepgram_nova3"
  },
  "interruption_settings": {
    "enable": true
  }
}
```

**Response**:
```json
{
  "data": {
    "result": "ok",
    "conversation_id": "conv_xxxxx"
  }
}
```

### Method 3: Node.js SDK
```javascript
import Telnyx from 'telnyx';
const client = new Telnyx({ apiKey: process.env.TELNYX_API_KEY });

// Dial outbound call
const call = await client.calls.dial({
  connection_id: 'conn_xxxxx',
  from: '+15551234567',
  to: '+15559876543',
  webhook_url: 'https://your-server.com/webhooks'
});

// Start AI assistant on the call
await client.calls.actions.startAIAssistant(call.data.call_control_id, {
  assistant: { id: 'asst_xxxxx' },
  voice: 'Telnyx.NaturalHD.Ava',
  greeting: 'Hello! How can I help you today?'
});
```

### Answering Machine Detection
Configure AMD in the outbound call request:
- `MachineDetection: "Enable"` — basic detection
- `DetectionMode: "Premium"` — higher accuracy
- `AsyncAmd: true` — don't wait for detection to answer

AMD also works on transfers — the assistant can detect voicemail when transferring and either stop the transfer or leave a message.

### Outbound Voice Profile
Required for outbound calls. Controls which countries/regions you can call. Create in Mission Control Portal.

---

## Scheduled Events API (Deep Technical Detail)

Schedule outbound calls or SMS at specific future times. Telnyx executes them automatically -- perfect for callbacks, reminders, follow-ups, and campaign scheduling. This replaces custom retry/scheduling logic.

### Create Scheduled Event

**Endpoint:**
```
POST https://api.telnyx.com/v2/ai/assistants/{assistant_id}/scheduled_events
```

**Headers:**
```
Authorization: Bearer <TELNYX_API_KEY>
Content-Type: application/json
Accept: application/json
```

**Request Body:**
```json
{
  "telnyx_conversation_channel": "phone_call",
  "telnyx_agent_target": "+15551234567",
  "telnyx_end_user_target": "+15559876543",
  "scheduled_at_fixed_datetime": "2026-02-24T14:00:00Z",
  "text": "Hi, this is a follow-up call about your solar consultation.",
  "conversation_metadata": {
    "lead_id": "lead_123",
    "campaign": "solar_followup",
    "attempt": 2
  }
}
```

**Parameter details:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `telnyx_conversation_channel` | string | Yes | `"phone_call"` or `"sms_chat"` |
| `telnyx_agent_target` | string | Yes | The FROM number (must be a Telnyx number assigned to the assistant) |
| `telnyx_end_user_target` | string | Yes | The TO number (the person being called/texted) |
| `scheduled_at_fixed_datetime` | string | Yes | ISO 8601 datetime for when to fire (e.g., `"2026-02-24T14:00:00Z"`) |
| `text` | string | No | Message text (primarily for SMS; for calls, the assistant's greeting is used) |
| `conversation_metadata` | object | No | Custom metadata attached to the conversation for tracking |

**Response:**
```json
{
  "data": {
    "scheduled_event_id": "sched_xxxxx",
    "status": "scheduled"
  }
}
```

### List Scheduled Events

```
GET https://api.telnyx.com/v2/ai/assistants/{assistant_id}/scheduled_events
```

Returns all scheduled events for the assistant with their statuses.

### Cancel Scheduled Event

```
DELETE https://api.telnyx.com/v2/ai/assistants/{assistant_id}/scheduled_events/{event_id}
```

### What Happens When Event Fires

**For phone calls:**
1. At `scheduled_at_fixed_datetime`, Telnyx initiates an outbound call using the assistant
2. The `dynamic_variables_webhook_url` fires (if configured) -- you can inject lead-specific context
3. The AI assistant conducts the conversation using its instructions/tools
4. Post-call insights are generated and delivered via webhook (if configured)
5. The conversation is stored and accessible via the Conversations API

**For SMS:**
1. At `scheduled_at_fixed_datetime`, Telnyx sends the SMS with the `text` content
2. If the recipient replies, the assistant handles the SMS conversation
3. Insights and history are stored normally

### Use Cases for Our System

| Use Case | How to Implement |
|----------|-----------------|
| **Callback requests** ("call me Tuesday at 2pm") | Schedule event with exact datetime from lead's request |
| **Appointment reminders** | Schedule 3 events: day-before, morning-of, 1-hour-before |
| **Follow-up sequences** | After call ends, schedule next call for +2 days |
| **Campaign scheduling** | Schedule 1,000 events at optimal times (stagger by seconds to avoid burst) |
| **Retry on no-answer** | Schedule retry event for +60min when first call goes unanswered |
| **Timezone-aware outreach** | Calculate local time, schedule within 9am-9pm in lead's timezone |

### Gotchas & Limitations

- The `assistant_id` in the URL determines WHICH agent makes the call -- choose the right specialized agent
- Events are fire-and-forget: if the call fails, you need to handle retry logic via webhooks
- Metadata is preserved through the call and available in post-call insights
- Events execute at the specified time regardless of calling hours -- enforce your own 9am-9pm logic before scheduling
- For high-volume scheduling (1000+ events), stagger `scheduled_at_fixed_datetime` by a few seconds to avoid rate limits

---

## AI Missions (Multi-Call Orchestration)

**AI Missions** is an advanced orchestration API designed for AI agents to coordinate multi-step outbound workflows.

### How It Works
1. **Create Mission**: Define a goal (e.g., "Call 50 solar leads and qualify them")
2. **Plan Execution**: Agent breaks mission into steps
3. **Deploy Agents**: Create assistants with custom instructions per step
4. **Track Progress**: Every action logged as events (full audit trail)
5. **Collect Insights**: Structured data extraction after each call

### Capabilities
- Parallel outreach (call multiple leads simultaneously)
- Sequential workflows (use info from call A to inform call B)
- IVR navigation and data extraction
- Structured insight capture with templates
- Error recovery and retry logic

### Relevance for Our System
This maps directly to our voice broadcast + lead journey system:
- **Campaigns as Missions**: Each broadcast campaign = a Mission
- **Lead qualification**: AI extracts structured data per call
- **Follow-up sequences**: Results from call 1 determine call 2 approach
- **Audit trail**: Every action tracked for compliance

---

## Multi-Agent Handoff (Deep Technical Detail)

Seamlessly route conversations between specialized AI assistants within a single call. Instead of building one monolithic agent that handles everything, you build a team of specialist agents that collaborate.

### How Handoff Works

1. **Detection**: The current agent identifies (via its instructions) that another agent would handle the request better
2. **Transition**: The handoff tool is invoked, Telnyx switches the active assistant
3. **Context Transfer**: The target agent receives the FULL conversation history (all messages, collected data, user info)
4. **Continuation**: The new agent continues seamlessly -- the caller does NOT need to repeat anything

### Two Voice Modes

#### Unified Voice Mode (Default)
All assistants share the same voice. The handoff is **completely invisible** to the caller -- they have no idea a different AI is now talking. Best for:
- Back-office routing where the caller shouldn't notice
- Specialized knowledge domains that feel like one agent

#### Distinct Voice Mode
Each assistant retains its own configured voice settings. The handoff feels like being transferred to a different specialist on a conference call. Best for:
- Simulating a team of people
- Making it clear when a different department is handling the request
- Language switching (English voice -> Spanish voice)

### API Configuration

Add handoff tools to the `tools` array when creating an assistant:

```json
{
  "tools": [
    {
      "type": "handoff",
      "name": "handoff_to_billing",
      "description": "Hand off to billing specialist when the user asks about invoices, payments, or account charges",
      "assistant_id": "asst_billing_xxxxx",
      "voice_mode": "unified"
    },
    {
      "type": "handoff",
      "name": "handoff_to_spanish",
      "description": "Hand off to Spanish-speaking assistant when the user prefers Spanish",
      "assistant_id": "asst_spanish_xxxxx",
      "voice_mode": "distinct"
    }
  ]
}
```

### Portal Configuration

1. Navigate to AI Assistants in Mission Control Portal
2. Select the agent to edit
3. On the Agent tab, click "Add tool" -> "Handoff"
4. In the popup, select the target assistant and choose "Unified" or "Distinct"
5. The portal shows a visual flowchart with color-coded nodes (purple = transfers, red = hangups, blue = handoffs)

### Context Passed During Handoff

The target agent receives:
- **Full conversation history** (all messages from all prior agents in the chain)
- **User information** (phone number, any collected data)
- **Collected data** (order numbers, issue details, preferences)
- **Agent actions** (what previous agents already tried or gathered)
- **Dynamic variables** (all variables from the session)

### Multi-Agent Architecture Patterns

| Pattern | Example | When to Use |
|---------|---------|-------------|
| **By domain** | Sales -> Billing -> Support | Different knowledge bases needed |
| **By task** | Triage -> Qualification -> Booking | Sequential workflow steps |
| **By language** | English -> Spanish -> French | Multilingual support |
| **By complexity** | FAQ Bot -> Deep Support -> Human | Escalation ladder |
| **By customer segment** | Standard -> VIP -> Enterprise | Different service levels |

### Model Agnostic

Each agent in the handoff chain can use a **different LLM model**. Example: a fast triage agent on Qwen (cheap) handing off to a complex sales agent on GPT-4o (expensive). This lets you optimize cost vs. quality per agent role.

### Bidirectional Handoff

Agents can hand off back and forth. Agent A can hand to Agent B, and Agent B can have a handoff tool pointing back to Agent A if the conversation shifts topics.

### Gotchas & Limitations

- Each assistant must be **pre-created** with its own ID -- you cannot create agents dynamically during a call
- Handoff tool instructions matter: be explicit about WHEN the handoff should trigger (e.g., "Hand off when the user says 'billing' or asks about invoices")
- Test with direct requests: "I need to talk to billing" to verify handoff triggers correctly
- All agents in the chain share the same `conversation_id`
- Maximum chain depth is not publicly documented -- test with your specific workflow

---

## Versioning, A/B Testing & Canary Deployments (Deep Technical Detail)

Built-in version management for assistants -- no custom implementation needed. Released July 2025.

### How Versions Work

Each AI assistant can have multiple **versions**. A version captures a complete snapshot of the assistant's configuration (instructions, tools, voice, model, etc.). You can:
- Create new versions without affecting the live production version
- Compare metrics between versions using real traffic
- Gradually shift traffic from one version to another

### A/B Testing Workflow

1. **Create baseline assistant** -- your current production agent
2. **Create a new version** -- modify instructions, model, voice, or tools
3. **Create a test** -- define success criteria (e.g., "greeting must include company name")
4. **Run the test** -- Telnyx simulates conversations and evaluates against your criteria
5. **Deploy canary** -- route a small percentage (e.g., 10%) of real traffic to the new version
6. **Compare metrics** -- monitor performance across versions in real-world conditions
7. **Roll out or roll back** -- increase traffic to the winner or revert

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/ai/assistants/tests` | List assistant tests with pagination |
| `POST` | `/v2/ai/assistants/tests` | Create a test case |
| `GET` | `/v2/ai/assistants/tests/{test_id}` | Get a specific test |
| `PUT` | `/v2/ai/assistants/tests/{test_id}` | Update a test |
| `DELETE` | `/v2/ai/assistants/tests/{test_id}` | Delete a test |
| `GET` | `/v2/ai/assistants/tests/test-suites` | List all test suite names |
| `POST` | `/v2/ai/assistants/tests/trigger` | Trigger test suite execution |
| `GET` | `/v2/ai/assistants/tests/runs` | View test run history/results |

### Test Object Schema

```json
{
  "test_id": "test_xxxxx",
  "name": "Solar greeting validation",
  "description": "Validates the solar sales agent greets correctly and asks qualifying questions",
  "telnyx_conversation_channel": "phone_call",
  "destination": "+15551234567",
  "max_duration_seconds": 120,
  "test_suite": "solar_sales_v2",
  "instructions": "Call as a homeowner interested in solar panels. Ask about pricing and timeline.",
  "rubric": [
    {
      "name": "Greeting Quality",
      "criteria": "Agent must introduce themselves by name and mention the company within the first response"
    },
    {
      "name": "Qualification",
      "criteria": "Agent must ask about roof type, electricity bill, and homeownership status"
    },
    {
      "name": "Booking Attempt",
      "criteria": "Agent must attempt to book a consultation before ending the call"
    }
  ]
}
```

**Channel options**: `phone_call`, `web_call`, `sms_chat`, `web_chat`

### Traffic Distribution / Canary Deployment

After tests pass, deploy with percentage-based traffic routing:
- Route a configurable percentage of incoming/outgoing calls to each version
- Example: 90% to v1 (stable), 10% to v2 (experimental)
- Gradually increase v2's share as confidence grows
- Compare performance metrics in real-world conditions between versions
- Roll back instantly by setting v2 traffic to 0%

### Portal Workflow

1. Navigate to AI Assistants, select the agent to edit
2. Create a new version of the agent
3. Move to the Test tab, run tests comparing versions
4. Launch a canary deployment to direct partial traffic to the new version
5. Monitor performance and adjust traffic split

### Why This Matters for Us

This replaces our custom `agent_script_variants` / `call_variant_assignments` A/B testing system (built in Migration Phase 7). Telnyx handles variant selection, traffic routing, and performance tracking natively -- no custom Thompson Sampling or UCB1 rebalancing needed.

---

## Embeddable Web Widget

Deploy AI agents as web widgets with a single code snippet:

1. Navigate to AI Assistants in Mission Control Portal
2. Select assistant > Edit > Widget tab
3. Copy/paste embed code into your website

**Features**:
- Voice-based AI conversations in browser
- Real-time transcript display for accessibility
- Custom SIP headers via `X-*` prefix (mapped to dynamic variables)
- Image upload support (with vision-capable LLMs like GPT-4o)
- Built on Telnyx WebRTC infrastructure

### Client SDKs
| Platform | Package |
|----------|---------|
| React | `@telnyx/ai-agent-lib` |
| iOS (SwiftUI) | Voice AI embeddable widget |
| Android | Voice/video SDK |
| Flutter | `flutter_telnyx_voice_ai_widget` |

---

## Background Audio & Noise Suppression

### Background Audio
- Add ambient noise during calls (e.g., "Office" environment)
- Makes pauses during tool calls feel natural (caller hears office sounds, not silence)
- Predefined options or custom public URL
- Configured in Mission Control Portal > Voice tab

### Noise Suppression
- ML-based (Silero VAD) — distinguishes speech from background noise
- Enabled by default for all AI agents
- Toggle available in portal (disable for music/multi-speaker)
- Improves STT accuracy significantly

---

## Call Control Integration

### What is Call Control?
Telnyx Call Control is a real-time API that lets you control every aspect of a phone call with code. Unlike pre-scripted systems, commands can be issued at any point during the call.

### Complete Call Control Commands (36 Actions)

All action endpoints: `POST /v2/calls/{call_control_id}/actions/{action}`
Except Dial: `POST /v2/calls`

| # | Command | Description | Expected Webhooks |
|---|---------|-------------|-------------------|
| 1 | **Dial** | Initiate outbound call | `call.initiated`, `call.answered`/`call.hangup` |
| 2 | **Answer** | Answer incoming call | `call.answered` |
| 3 | **Hangup** | End call | `call.hangup` |
| 4 | **Reject** | Reject incoming call | None |
| 5 | **Transfer** | Transfer to new destination | `call.initiated` (new leg) |
| 6 | **Bridge** | Bridge two call legs | `call.bridged` |
| 7 | **Speak** | Text-to-speech | `call.speak.started/ended` |
| 8 | **Play Audio** | Play WAV/MP3 file | `call.playback.started/ended` |
| 9 | **Stop Playback** | Stop audio | None |
| 10 | **Gather** | Collect DTMF digits | `call.gather.ended`, `call.dtmf.received` |
| 11 | **Gather Using Audio** | Play audio + collect DTMF | `call.gather.ended` |
| 12 | **Gather Using Speak** | TTS + collect DTMF | `call.gather.ended` |
| 13 | **Gather Using AI** | AI-powered structured gather | AI events |
| 14 | **Gather Stop** | Stop active gather | None |
| 15 | **Send DTMF** | Send touch-tones on call | None |
| 16 | **Recording Start** | Start recording | `call.recording.saved` |
| 17 | **Recording Stop** | Stop recording | `call.recording.saved` |
| 18 | **Record Pause** | Pause recording | None |
| 19 | **Record Resume** | Resume recording | None |
| 20 | **Streaming Start** | Start WebSocket media stream | `streaming.started/stopped` |
| 21 | **Streaming Stop** | Stop media stream | `streaming.stopped` |
| 22 | **Forking Start** | Start RTP media fork | `call.fork.started` |
| 23 | **Forking Stop** | Stop media fork | `call.fork.stopped` |
| 24 | **Transcription Start** | Real-time transcription | Transcription events |
| 25 | **Transcription Stop** | Stop transcription | None |
| 26 | **SIP Refer** | Send SIP REFER | SIP events |
| 27 | **Send SIP Info** | Send SIP INFO | None |
| 28 | **SIPREC Start** | Start SIPREC session | SIPREC events |
| 29 | **SIPREC Stop** | Stop SIPREC | None |
| 30 | **Enqueue** | Put call in queue | Queue events |
| 31 | **Dequeue** | Remove from queue | None |
| 32 | **Update Client State** | Update state on call | None |
| 33 | **Noise Suppression Start** | Start noise suppression (BETA) | None |
| 34 | **Noise Suppression Stop** | Stop noise suppression | None |
| 35 | **Switch Supervisor Role** | Switch supervisor role | None |
| 36 | **AI Assistant Start** | Attach AI assistant to call | `call.conversation.ended`, `call.conversation_insights.generated` |

### Key Dial Parameters
```json
{
  "connection_id": "conn_xxxxx",        // Required: Voice API application
  "to": "+15551234567",                 // E.164 or SIP URI
  "from": "+15559876543",               // Caller ID (E.164)
  "webhook_url": "https://...",         // Per-call webhook override
  "answering_machine_detection": "detect", // detect|detect_words|detect_beep|greeting_end
  "stream_url": "wss://...",            // WebSocket URL for streaming
  "timeout_secs": 30,                   // 5-600 seconds
  "time_limit_secs": 3600,              // Max call duration
  "record": "record-from-answer",       // Auto-record
  "custom_headers": [...]               // SIP custom headers
}
```

### Management Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/calls` | List active calls |
| `GET` | `/v2/calls/{id}` | Get call details |
| `GET` | `/v2/call_events` | List call events |
| `POST` | `/v2/call_control_applications` | Create application |
| `GET` | `/v2/call_control_applications` | List applications |
| `PATCH` | `/v2/call_control_applications/{id}` | Update application |
| `DELETE` | `/v2/call_control_applications/{id}` | Delete application |

### Gather Using AI
Collect structured data from a conversation using JSON Schema:

```bash
POST /v2/calls/{call_control_id}/actions/gather_using_ai
{
  "assistant": {
    "instructions": "You are collecting appointment information."
  },
  "parameters": {
    "type": "object",
    "properties": {
      "preferred_date": { "type": "string", "description": "Preferred appointment date" },
      "preferred_time": { "type": "string", "description": "Preferred time of day" },
      "service_type": { "type": "string", "enum": ["consultation", "installation", "maintenance"] }
    },
    "required": ["preferred_date", "preferred_time", "service_type"]
  }
}
```

When all required fields are gathered, a webhook is fired with the structured data.

---

## TeXML (TwiML-Compatible XML)

TeXML is Telnyx's XML scripting language with **full TwiML parity**. Existing TwiML code works without changes.

### All TeXML Verbs

| Verb | Description | Notes |
|------|-------------|-------|
| `<Dial>` | Dial a number | Nouns: `<Number>`, `<Sip>`, `<Client>` |
| `<Say>` | Text-to-speech | Multiple voices/languages |
| `<Play>` | Play audio file | WAV/MP3 |
| `<Gather>` | Collect DTMF | `input`, `numDigits`, `timeout`, `action` |
| `<AIGather>` | AI-powered gather | Telnyx-specific |
| `<AIAssistant>` | Start AI assistant | Telnyx-specific |
| `<Record>` | Record call | `channels="single\|dual"` |
| `<Conference>` | Join conference | Full conference management |
| `<Enqueue>` | Put in queue | Queue management |
| `<Hangup>` | End call | |
| `<Pause>` | Pause execution | `length` attribute |
| `<Redirect>` | Redirect to new TeXML URL | |
| `<Reject>` | Reject incoming call | |
| `<Stream>` | Start WebSocket stream | Telnyx-specific |
| `<HttpRequest>` | Make HTTP request during call | Telnyx-specific |
| `<Refer>` | SIP REFER transfer | |
| `<Siprec>` | Start SIPREC | |
| `<Suppression>` | Noise suppression | |
| `<Transcription>` | Real-time transcription | |

**TwiML Migration**: Upload existing TwiML code directly — works without changes. Just switch the endpoint to `https://api.telnyx.com/v2/texml/`.

---

## Complete Webhook Event Reference

### Call Lifecycle Events
| Event | Description | Key Payload Fields |
|-------|-------------|-------------------|
| `call.initiated` | Call started | `call_control_id`, `from`, `to`, `direction` |
| `call.answered` | Call answered | `start_time`, `tags` |
| `call.hangup` | Call ended | `hangup_cause`, `hangup_source`, `sip_hangup_cause`, `start_time`, `end_time` |
| `call.bridged` | Two calls bridged | `state: "bridged"` |

### TTS/Audio Events
| Event | Description |
|-------|-------------|
| `call.speak.started` | TTS playback began |
| `call.speak.ended` | TTS playback ended |
| `call.playback.started` | Audio file playback began |
| `call.playback.ended` | Audio file playback ended |

### DTMF/Gather Events
| Event | Key Fields |
|-------|------------|
| `call.gather.ended` | `digits` (collected) |
| `call.dtmf.received` | `digit` (single) |

### Recording Events
| Event | Key Fields |
|-------|------------|
| `call.recording.saved` | Recording URL (valid 10 min), duration |

### AMD Events
| Event | Description |
|-------|-------------|
| `call.machine.detection.ended` | Basic result: human/machine |
| `call.machine.greeting.ended` | Machine greeting ended (beep detected) |
| `call.machine.premium.detection.ended` | Granular: silence, machine greeting, human residence, human business |
| `call.machine.premium.greeting.ended` | Premium greeting ended |

### AI/Conversation Events
| Event | Description |
|-------|-------------|
| `call.conversation.ended` | AI assistant conversation ended |
| `call.conversation_insights.generated` | Post-call insights ready |

### Streaming Events
| Event | Description |
|-------|-------------|
| `streaming.started` | WebSocket streaming started |
| `streaming.stopped` | WebSocket streaming stopped |
| `streaming.failed` | WebSocket streaming failed |

### Media Fork Events
| Event | Description |
|-------|-------------|
| `call.fork.started` | Media forking started |
| `call.fork.stopped` | Media forking stopped |

### Webhook Delivery Rules
- Must respond with 2xx HTTP status
- Retries with exponential backoff on failure
- Primary + failover URL support
- Ed25519 signature verification via `telnyx-signature-ed25519` + `telnyx-timestamp` headers
- Duplicate delivery possible — implement idempotency

---

## Media Streaming (WebSocket)

Real-time bidirectional audio streaming over WebSocket.

### Start Streaming
```json
POST /v2/calls/{call_control_id}/actions/streaming_start
{
  "stream_url": "wss://your-server.com/stream",
  "stream_track": "both_tracks",
  "codec": "PCMU"
}
```

### Supported Codecs
| Codec | Sample Rates |
|-------|-------------|
| PCMU | 8 kHz (default) |
| PCMA | 8 kHz |
| G722 | 8 kHz |
| OPUS | 8, 16 kHz |
| AMR-WB | 8, 16 kHz |

### WebSocket Events
- **start**: Connection opened, includes `media_format`, `call_control_id`
- **media**: Audio data as base64 payload
- **dtmf**: DTMF digit events via WebSocket
- **stop**: Connection closed
- **error**: Error with code/detail

### Bidirectional Audio
Send audio back to the call through the WebSocket — enables real-time AI-generated audio responses.

---

## Answering Machine Detection / AMD (Deep Technical Detail)

AMD is **free** with Call Control (standard detection). Premium AMD is $0.0065/call. Telnyx claims 97% accuracy with their algorithms.

### Two Interfaces for AMD

#### 1. Call Control API (REST)

When dialing with `POST /v2/calls`, set the `answering_machine_detection` parameter:

```json
{
  "connection_id": "conn_xxxxx",
  "from": "+15551234567",
  "to": "+15559876543",
  "answering_machine_detection": "detect",
  "answering_machine_detection_config": {
    "total_analysis_time_millis": 5000,
    "after_greeting_silence_millis": 800,
    "between_words_silence_millis": 50,
    "greeting_duration_millis": 3500,
    "initial_silence_millis": 3500,
    "maximum_number_of_words": 5,
    "silence_threshold": 256
  }
}
```

**Detection mode values:**

| Value | Description | Events Fired |
|-------|-------------|--------------|
| `detect` | Basic human/machine detection | `call.machine.detection.ended` |
| `detect_words` | Word-count-based detection (>5 words = machine) + greeting end | `call.machine.detection.ended` + `call.machine.greeting.ended` |
| `detect_beep` | Listens for voicemail beep after machine detection | `call.machine.detection.ended` + `call.machine.greeting.ended` |
| `greeting_end` | Detects end of machine greeting | `call.machine.detection.ended` + `call.machine.greeting.ended` |
| `premium` | Advanced ML-based detection with granular classifications | `call.machine.premium.detection.ended` + `call.machine.premium.greeting.ended` |

#### 2. TeXML (TwiML-compatible)

When initiating outbound calls via `POST /v2/texml/calls/{app_id}`, use these parameters:

```json
{
  "From": "+15551234567",
  "To": "+15559876543",
  "MachineDetection": "Enable",
  "DetectionMode": "Premium",
  "AsyncAmd": true,
  "AsyncAmdStatusCallback": "https://your-server.com/amd-callback",
  "AsyncAMDStatusCallbackMethod": "POST"
}
```

**TeXML AMD parameters:**

| Parameter | Values | Default | Description |
|-----------|--------|---------|-------------|
| `MachineDetection` | `Enable`, `Disable`, `DetectMessageEnd` | `Disable` | Enable AMD |
| `DetectionMode` | `Regular`, `Premium` | `Regular` | Standard vs. premium detection |
| `AsyncAmd` | `true`, `false` | `false` | Run AMD in background (don't block TeXML execution) |
| `AsyncAmdStatusCallback` | URL | - | Where to send async AMD results |
| `AsyncAMDStatusCallbackMethod` | `GET`, `POST` | Inherited | HTTP method for callback |

**Sync vs Async modes:**
- **Synchronous** (`AsyncAmd: false`): TeXML instructions wait until AMD completes. Result comes in the `AnsweredBy` parameter of the StatusCallback.
- **Asynchronous** (`AsyncAmd: true`): TeXML instructions execute in parallel with AMD. Results arrive at the `AsyncAmdStatusCallback` URL separately.

### TeXML AI Calls with AMD

For AI assistant calls specifically:
```json
{
  "From": "+15551234567",
  "To": "+15559876543",
  "AIAssistantId": "asst_xxxxx",
  "MachineDetection": "Enable",
  "AsyncAmd": true,
  "DetectionMode": "Premium"
}
```

### Webhook Events (Call Control)

#### `call.machine.detection.ended` (Standard)
```json
{
  "data": {
    "event_type": "call.machine.detection.ended",
    "payload": {
      "call_control_id": "v3:xxxxx",
      "call_leg_id": "leg_xxxxx",
      "call_session_id": "sess_xxxxx",
      "connection_id": "conn_xxxxx",
      "from": "+15551234567",
      "to": "+15559876543",
      "result": "machine",
      "client_state": "base64_encoded_state"
    }
  }
}
```

**`result` values:** `"human"` or `"machine"`

#### `call.machine.greeting.ended` (Standard)
Fires when the voicemail greeting finishes (beep detected or timeout):
```json
{
  "data": {
    "event_type": "call.machine.greeting.ended",
    "payload": {
      "call_control_id": "v3:xxxxx",
      "result": "beep_detected"
    }
  }
}
```

**`result` values:** `"beep_detected"`, `"ended"`, `"no_beep_detected"`

#### `call.machine.premium.detection.ended` (Premium)
Granular classifications with ML-based detection:
```json
{
  "data": {
    "event_type": "call.machine.premium.detection.ended",
    "payload": {
      "call_control_id": "v3:xxxxx",
      "result": "human_residence"
    }
  }
}
```

**`result` values:** `"silence"`, `"machine_greeting"`, `"human_residence"`, `"human_business"`

#### `call.machine.premium.greeting.ended` (Premium)
Same as standard greeting ended but with premium accuracy. If beep detected before detection ends, only this event fires (not the detection event).

### Typical Event Flow

```
1. call.answered
   │
   ├─── Standard AMD ───────────────────────────────────────┐
   │    2. call.machine.detection.ended (human/machine)     │
   │    3. call.machine.greeting.ended (beep/no_beep)       │
   │                                                         │
   ├─── Premium AMD ────────────────────────────────────────┐
   │    2. call.machine.premium.detection.ended             │
   │       (silence/machine_greeting/human_residence/       │
   │        human_business)                                 │
   │    3. call.machine.premium.greeting.ended              │
   │       (beep_detected)                                  │
   │                                                         │
   └─── At any point: call.hangup possible ─────────────────┘
```

### AMD on Transfers

AMD also works when the AI assistant transfers a call. If the transfer destination goes to voicemail, the assistant can:
- Detect the voicemail greeting
- Optionally leave a message
- Or cancel the transfer

### Pricing

| Type | Cost |
|------|------|
| Standard AMD (`detect`, `detect_words`, `detect_beep`, `greeting_end`) | **Free** |
| Premium AMD (`premium`) | **$0.0065/call** |

Compare to Twilio: $0.0075/call for basic AMD.

### Gotchas

- Every webhook MUST be acknowledged with HTTP 2xx -- Telnyx keeps retrying otherwise
- The callee can hang up at ANY point, generating `call.hangup` (handle this in your flow)
- With `detect_words` mode, if more than 5 words are detected from the callee, it is classified as a machine
- Premium AMD beep detection: if beep arrives before `premium.detection.ended`, you only get `premium.greeting.ended`
- In async mode, the call proceeds immediately while AMD runs -- your AI may start talking before AMD completes

---

## Import Agents from Other Platforms

Telnyx can import AI agents directly from competitors:

```bash
POST https://api.telnyx.com/v2/ai/assistants/import
{
  "provider": "retell",     // or "vapi" or "elevenlabs"
  "api_key_ref": "stored-api-key-ref"
}
```

**What gets imported**: Instructions, greeting, voice config, tools/functions, call analysis settings, secret placeholders. For Retell: both single- and multi-prompt agents supported.

---

## Monitoring & Analytics (Deep Technical Detail)

### Real-Time Cost Estimator
In the Mission Control Portal, a dynamic cost bar shows per-minute cost estimate as you configure the assistant (base rate + STT + TTS + LLM). Changes in real-time as you switch models/voices.

### Post-Call Data Available

After each AI assistant call completes, you can access:

| Data | How to Get It | Timing |
|------|--------------|--------|
| Call events | `call.conversation.ended` webhook | Immediately at call end |
| Conversation transcript | `GET /v2/ai/assistants/{id}/conversations/{conv_id}` | After call end |
| AI-generated insights | `call.conversation_insights.generated` webhook | Seconds after call end |
| Call recording | `call.recording.saved` webhook (if recording enabled) | Shortly after call end |
| Call metadata | `GET /v2/calls/{call_control_id}` | During or after call |

#### `call.conversation.ended` Webhook

Fires when the AI assistant conversation finishes (before hangup). Contains:
- `call_control_id` -- correlate with call lifecycle events
- `conversation_id` -- use to fetch full transcript via Conversations API
- `call_leg_id`, `call_session_id` -- session tracking
- `connection_id` -- which Voice API application
- Standard Telnyx V2 webhook envelope with `event_type`, `occurred_at`, `record_type`

#### `call.conversation_insights.generated` Webhook

Fires after insights are computed (see Post-Call Insights section above for full details). Contains all configured insight results as structured data.

### Conversation History API

**List all conversations for an assistant:**
```
GET https://api.telnyx.com/v2/ai/assistants/{assistant_id}/conversations
```

Supports query parameters for filtering by:
- Phone number (`metadata->telnyx_end_user_target`)
- Date range
- Custom metadata
- Pagination (`limit`, `offset`, `order`)

**Get a specific conversation (with full message history):**
```
GET https://api.telnyx.com/v2/ai/assistants/{assistant_id}/conversations/{conversation_id}
```

Returns the complete conversation including:
- All messages (user and assistant turns)
- Tool calls and results
- Timestamps per message
- Conversation metadata
- Duration and channel info

**Requires `data_retention: true`** on the assistant configuration.

### Latency Monitoring
- Demo links with per-turn latency measurement
- Shows client device, network, and compute delays
- Helps tune voice/model selection for optimal experience
- Deepgram Flux STT option with adjustable thresholds to cut latency further

### WebRTC React Library
For web-based monitoring and testing:
- `@telnyx/ai-agent-lib` -- React library for AI agent frontends
- Real-time transcription display
- Connection state management
- Latency measurement
- Event handling

---

## Pricing

### Base Pricing

| Component | Cost |
|-----------|------|
| **AI Orchestration + STT + TTS** | $0.08/min |
| **Open-source LLM (Telnyx GPUs)** | $0.025/min |
| **All-in bundle (orchestration + open-source LLM)** | $0.09/min |
| **Telephony (outbound, US)** | ~$0.01-0.02/min |
| **TeXML fee** | $0.002/min |

### What's Included in Base Rate
- Orchestration and call control
- Real-time speech-to-text
- Text-to-speech (Telnyx NaturalHD)
- Open-source LLMs on Telnyx GPUs

### Component-Level Pricing (A La Carte)

**Speech-to-Text:**
| Provider | Price/Min |
|----------|-----------|
| Telnyx STT (Whisper) | $0.015 |
| Deepgram Nova 2/3/Flux | $0.015 |
| Google STT | $0.017 |
| Azure STT | $0.017 |

**Text-to-Speech:**
| Provider | Price/Character | Notes |
|----------|----------------|-------|
| Telnyx KokoroTTS | $0.000003 | 26 voices, 8 languages |
| Telnyx Natural | $0.000003 | Enhanced naturalness |
| AWS Polly Standard | $0.000006 | Standard |
| Resemble AI | $0.000009 | Voice cloning |
| Telnyx NaturalHD | $0.000012 | Premium HD quality |
| ElevenLabs | BYO API key | 70+ languages |

**Voice ID Format**: `Provider.ModelId.VoiceId` — e.g., `Telnyx.KokoroTTS.af_heart`, `Telnyx.NaturalHD.andersen_johan`, `Polly.Amy-Neural`, `Azure.en-CA-ClaraNeural`

**Telephony Components:**
| Feature | Price |
|---------|-------|
| Inbound/Outbound calls | Starting $0.002/min |
| TeXML fee | $0.002/call |
| Call recording | $0.002/min |
| Conference | $0.002/participant/min |
| Call transfer | $0.10/invocation |
| AMD (standard) | Free |
| AMD (premium) | $0.0065/call |

### What Costs Extra
- Premium third-party models (GPT-4o, Claude, etc.) — at provider's rate
- Third-party TTS (ElevenLabs, etc.) — at provider's rate
- BYOK (Bring Your Own Key) pass-through fees

### Volume Discounts
Available for monthly commitments. Predictable pricing with discounted rates as spending increases.

### Cost Comparison (All-In Per Minute)

| Platform | Estimated All-In Cost |
|----------|----------------------|
| **Telnyx (open-source LLM)** | ~$0.09-0.11/min |
| **Telnyx (GPT-4o)** | ~$0.13-0.15/min |
| **Retell AI** | ~$0.13-0.31/min |
| **Vapi** | ~$0.23-0.33/min |
| **ElevenLabs Conversational AI** | ~$0.15-0.25/min |

---

## Telnyx vs Retell AI Comparison

| Dimension | Telnyx | Retell AI |
|-----------|--------|-----------|
| **Infrastructure** | Owns entire stack (carrier → GPU) | Uses third-party telephony (Twilio/Telnyx) |
| **Latency** | Sub-200ms round-trip | ~600-800ms response time |
| **Pricing** | $0.09/min all-in (open-source LLM) | $0.07/min engine + stacked costs = $0.13-0.31/min |
| **Voice Quality** | HD voice codecs on private network | Depends on telephony provider |
| **Models** | Multiple providers + custom LLM | Multiple providers |
| **Agent Builder** | No-code portal + full API | API-first + portal |
| **Tools** | 8 built-in + MCP + webhooks | Custom functions + webhooks |
| **Multi-Agent** | Native handoff (unified/distinct voice) | Limited |
| **Memory** | Built-in cross-conversation memory | Custom implementation needed |
| **Scheduled Calls** | Native Scheduled Events API | Custom implementation needed |
| **Missions** | Multi-call orchestration API | Not available |
| **SMS During Call** | Native send_message tool | Not available |
| **AMD on Transfer** | Built-in | Not available |
| **MCP Server** | Native integration | Not available |
| **Compliance** | STIR/SHAKEN, SOC2, HIPAA, PCI, GDPR | SOC2, HIPAA, GDPR |
| **Best For** | Full control, cost efficiency, scale | Quick deployment, simple use cases |

### Why Telnyx Could Replace Retell for Us
1. **Cost**: 30-70% cheaper per minute at scale
2. **Latency**: Significantly lower (sub-200ms vs 600-800ms)
3. **Native telephony**: No Twilio dependency, no stacked costs
4. **Built-in features**: Memory, scheduled calls, missions, multi-agent — things we built custom
5. **AMD on transfer**: Handles voicemail detection on warm transfers
6. **SMS tool**: Agent can send SMS mid-call without external logic
7. **MCP**: Connect to any external system natively

### What Retell Does Better
1. **Simpler onboarding**: Retell's API is more straightforward for basic use cases
2. **Existing integration**: Our system already has Retell deeply integrated
3. **Transcript analysis**: Retell provides detailed call transcripts (Telnyx does too via insights)

---

## Node.js SDK

### Installation
```bash
npm install telnyx
```

### Basic Setup
```javascript
import Telnyx from 'telnyx';

const client = new Telnyx({
  apiKey: process.env.TELNYX_API_KEY,
  maxRetries: 2,  // Default: 2 retries with exponential backoff
  timeout: 60000  // Default: 1 minute
});
```

### Key Operations

```javascript
// Create AI Assistant
const assistant = await client.ai.assistants.create({
  name: 'Solar Sales Agent',
  model: 'qwen/qwen3-235b-a22b',
  instructions: 'You are a friendly solar consultant...',
  greeting: 'Hi! How can I help you with solar today?',
  tools: [/* webhook, transfer, etc. */],
  voice_settings: { voice: 'Telnyx.NaturalHD.Ava' },
  enabled_features: ['telephony']
});

// Dial outbound call
const call = await client.calls.dial({
  connection_id: 'conn_xxxxx',
  from: '+15551234567',
  to: '+15559876543',
  webhook_url: 'https://your-server.com/webhooks'
});

// Start AI assistant on active call
await client.calls.actions.startAIAssistant(callControlId, {
  assistant: { id: assistant.id },
  voice: 'Telnyx.NaturalHD.Ava',
  greeting: 'Hello!'
});

// Schedule a future call
await client.ai.assistants.scheduledEvents.create(assistantId, {
  channel: 'phone_call',
  agent_target: '+15551234567',
  end_user_target: '+15559876543',
  scheduled_at: '2026-02-24T14:00:00Z'
});

// List conversations
const conversations = await client.ai.assistants.conversations.list(assistantId);

// Audio transcription
const transcript = await client.ai.audio.transcribe({
  model: 'distil-whisper',
  file: fs.createReadStream('audio.mp3')
});

// Number management
const order = await client.numberOrders.create({
  phone_numbers: [{ phone_number: '+15551234567' }]
});
```

### Additional Packages
- `@telnyx/webrtc` — WebRTC SDK for browser-based calling
- `@telnyx/ai-agent-lib` — React library for AI agent UIs

### Error Handling
```javascript
try {
  const assistant = await client.ai.assistants.create({...});
} catch (err) {
  if (err instanceof Telnyx.BadRequestError) { /* 400 */ }
  if (err instanceof Telnyx.AuthenticationError) { /* 401 */ }
  if (err instanceof Telnyx.RateLimitError) { /* 429 */ }
}
```

---

## Rate Limits & Error Handling

### Rate Limit Headers
| Header | Description |
|--------|-------------|
| `x-ratelimit-limit` | Max requests in current window |
| `x-ratelimit-remaining` | Requests remaining |
| `x-ratelimit-reset` | Seconds until reset |

### HTTP Error Codes
| Code | Meaning | SDK Class |
|------|---------|-----------|
| 400 | Bad Request | `BadRequestError` |
| 401 | Unauthorized (invalid API key) | `AuthenticationError` |
| 403 | Permission Denied | `PermissionDeniedError` |
| 404 | Not Found | `NotFoundError` |
| 422 | Unprocessable Entity | `UnprocessableEntityError` |
| 429 | Rate Limit Exceeded | `RateLimitError` |
| 500+ | Server Error | `InternalServerError` |

**SDK auto-retries**: 408, 409, 429, and 500+ errors are automatically retried up to 2 times with exponential backoff.

**Webhook timeout**: Endpoints must respond within **2000ms** with 2xx. Non-2xx triggers retry.

---

## Knowledge Base / RAG (Deep Technical Detail)

The Retrieval Tool gives AI assistants access to your documents during live calls. When the caller asks a question, the assistant automatically searches your knowledge base using vector similarity and incorporates relevant information into its response.

### Architecture Overview

```
Your Documents (PDF, DOCX, TXT, URLs)
        │
        ▼
Telnyx Cloud Storage (S3-compatible bucket)
        │
        ▼
Embeddings API (vectorize documents into chunks)
        │
        ▼
Vector Index (stored alongside documents)
        │
        ▼
Retrieval Tool (AI assistant searches during call)
        │
        ▼
LLM uses retrieved context to answer caller
```

### Step 1: Create a Storage Bucket

Telnyx Cloud Storage is S3-compatible. Create a bucket via the portal or API.

**API (S3-compatible PUT):**
```bash
PUT / HTTP/1.1
Host: your-bucket-name.us-central-1.telnyxcloudstorage.com
Authorization: AWS4-HMAC-SHA256 ...
```

**Regional endpoints:**
- `us-central-1.telnyxcloudstorage.com`
- `us-east-1.telnyxcloudstorage.com`
- `us-west-1.telnyxcloudstorage.com`

**Authentication:** Your Telnyx API Key serves as the S3 Access Key ID. Buckets are free (up to 100 per account).

### Step 2: Upload Documents

Upload files to the bucket using S3-compatible PutObject or the portal (drag-and-drop).

**Supported formats:** PDF, DOCX, TXT, and any text-based file. Non-text files are attempted as unstructured text.

**Portal:** Navigate to AI Assistants -> select agent -> Knowledge Bases section -> drag-and-drop files or enter URLs.

### Step 3: Embed the Documents

**Embed files from a storage bucket:**
```bash
POST https://api.telnyx.com/v2/ai/embeddings
Authorization: Bearer <TELNYX_API_KEY>
Content-Type: application/json

{
  "bucket_name": "solar-knowledge-base",
  "embedding_model": "thenlper/gte-large",
  "document_chunk_size": 1024,
  "document_chunk_overlap_size": 512
}
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `bucket_name` | string | required | Name of existing Telnyx Storage bucket |
| `embedding_model` | string | required | One of the supported models (see below) |
| `document_chunk_size` | integer | 1024 | Size of document chunks in characters |
| `document_chunk_overlap_size` | integer | 512 | Overlap between chunks for context continuity |
| `loader` | string | "default" | Custom loader (`"intercom"` for Intercom articles) |

**Response:** Returns a `task_id` for tracking. Processing runs **in the background**.

**Check embedding status:**
```
GET https://api.telnyx.com/v2/ai/embeddings/{task_id}
```

**Embed website content (URL crawling):**
```bash
POST https://api.telnyx.com/v2/ai/embeddings/url
Authorization: Bearer <TELNYX_API_KEY>
Content-Type: application/json

{
  "url": "https://your-company.com/products",
  "bucket_name": "solar-knowledge-base",
  "embedding_model": "thenlper/gte-large"
}
```

This automatically crawls the URL and child pages **up to 5 levels deep** within the same domain, loads content into the storage bucket, and embeds it.

### Supported Embedding Models

| Model | Best For |
|-------|---------|
| `thenlper/gte-large` | General English text (recommended default) |
| `intfloat/multilingual-e5-large` | Multilingual content (40+ languages) |
| `sentence-transformers/all-mpnet-base-v2` | Semantic similarity tasks |

### Auto-Sync

When you update documents in a bucket, embeddings **automatically update**:
- Add/update a file -> automatically re-embedded
- Delete a file -> embeddings deleted for that file
- No manual re-embedding needed

### Step 4: Connect to Assistant via Retrieval Tool

When creating/updating the assistant, include the retrieval tool and reference the bucket:

```json
{
  "tools": [
    {
      "type": "retrieval",
      "name": "search_knowledge",
      "description": "Search company documents for product info, pricing, and FAQs"
    }
  ]
}
```

The assistant's configuration links to the embedded bucket(s) -- configure this in the Knowledge Bases section of the assistant builder.

### Similarity Search API (Direct)

You can also query the knowledge base directly (outside of an assistant call):

```bash
POST https://api.telnyx.com/v2/ai/embeddings/similarity-search
Authorization: Bearer <TELNYX_API_KEY>
Content-Type: application/json

{
  "bucket_name": "solar-knowledge-base",
  "query": "What is the warranty period for solar panels?",
  "num_docs": 5,
  "embedding_model": "thenlper/gte-large"
}
```

Returns the most similar `num_docs` document chunks to the query, with `loader_metadata` if a custom loader was used.

### Pricing

Telnyx claims 90%+ cheaper than competitors on embeddings. Storage costs are minimal (standard cloud storage rates). The embedding computation itself is charged per request.

### Gotchas & Limitations

- **Processing is async**: Large document sets can take minutes to embed. Poll the task status endpoint.
- **Chunk size matters**: Smaller chunks (512) give more precise retrieval but less context per chunk. Larger chunks (2048) give more context but may dilute relevance.
- **URL crawling depth**: Only goes 5 levels deep and stays on the same domain. External links are not followed.
- **Supported formats**: While PDF/DOCX/TXT are explicitly supported, other formats are attempted as unstructured text -- results may vary.
- **No real-time updates**: If you update a document, re-embedding happens automatically but is not instant.

---

## Transcription Timing (Endpointing)

Fine-tune when the AI considers the user's turn "done":

| Setting | Description | Recommended |
|---------|-------------|-------------|
| `on_punctuation_seconds` | Delay after period/question mark | 0.1s |
| `on_no_punctuation_seconds` | Delay after unpunctuated pause | 1.5s |
| `on_number_seconds` | Delay after digit sequences | 1.0s |

These settings prevent the AI from interrupting the user mid-sentence while keeping response times fast.

---

## Inference API (Standalone LLM)

Telnyx also offers a standalone inference API (OpenAI-compatible):

```bash
POST https://api.telnyx.com/v2/ai/chat/completions
{
  "model": "meta-llama/Meta-Llama-3.1-70B-Instruct",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true,
  "tools": [...],
  "tool_choice": "auto"
}
```

**Works with OpenAI SDK** — just change the base URL:
```javascript
import OpenAI from 'openai';
const client = new OpenAI({
  apiKey: 'TELNYX_API_KEY',
  baseURL: 'https://api.telnyx.com/v2/ai'
});
```

Supports function calling, streaming, structured output (JSON schema), and parallel tool calls.

---

## Current Codebase Integration Status

### What Already Exists

| Component | Status | Details |
|-----------|--------|---------|
| `telnyxAdapter.ts` | STUB | All methods return failures/empty |
| `telnyx-webhook/index.ts` | STUB | Event cases defined but no processing |
| `voice-broadcast-engine` | WORKING | `callWithTelnyx()` function works |
| `provider-management` | STUB | Actions defined but not implemented |
| Database schema | COMPLETE | `phone_providers`, `provider_numbers`, carrier configs |
| TypeScript types | COMPLETE | `IProviderAdapter`, `ProviderType` includes 'telnyx' |
| Provider factory | COMPLETE | `createProviderAdapter('telnyx')` works |
| SIP trunk config | COMPLETE | `telnyx_connection_id` supported |
| Environment config | READY | `TELNYX_API_KEY` referenced throughout |
| Webhook config | READY | `verify_jwt = false` set in supabase config |
| Demo data | EXISTS | Demo phone number with `provider: 'telnyx'` |

### What's Missing for AI Agent Integration

1. **Telnyx AI Assistant management** — Create/update/delete/list assistants
2. **AI outbound calling** — Use TeXML AI calls endpoint instead of basic `callWithTelnyx()`
3. **Webhook handler** — Process `call.conversation.ended`, `call.conversation_insights.generated`
4. **Dynamic variables webhook** — Serve lead data to Telnyx at call start
5. **Scheduled events** — Use native scheduling instead of custom retry logic
6. **Insight ingestion** — Receive and store post-call insights
7. **Cost tracking** — Track Telnyx-specific costs per call
8. **Assistant sync** — Sync Telnyx assistants to our agent management UI

---

## Integration Architecture Plan

### Phase 1: Core AI Assistant Management
- Edge function: `telnyx-assistant-management` (CRUD for assistants)
- UI: Add Telnyx tab to Agent Builder / Retell AI Manager
- Store assistant configs in database (map to our agent records)

### Phase 2: AI Outbound Calling
- Modify `voice-broadcast-engine` to use TeXML AI calls for Telnyx AI broadcasts
- Modify `outbound-calling` to support Telnyx AI assistants alongside Retell
- Dynamic variables webhook endpoint (serve lead data at call start)
- Handle AMD natively via Telnyx

### Phase 3: Webhooks & Insights
- Implement `telnyx-webhook` event processing for AI call events
- Ingest post-call insights (summary, sentiment, action items)
- Map to our `call_logs` and analytics tables
- Feed into lead journey intelligence

### Phase 4: Advanced Features
- Scheduled Events for callback management
- Multi-agent handoff for specialized conversations
- MCP server integration for CRM sync
- AI Missions for campaign orchestration
- Send Message tool for mid-call SMS

### Phase 5: Migration & Optimization
- Side-by-side A/B testing: Telnyx AI vs Retell AI
- Cost comparison per campaign
- Latency measurement per provider
- Gradual migration of call volume

### Environment Variables Required
```
TELNYX_API_KEY=<your_telnyx_api_key>
TELNYX_TEXML_APP_ID=<your_texml_app_id>
TELNYX_CONNECTION_ID=<your_connection_id>
TELNYX_OUTBOUND_VOICE_PROFILE_ID=<your_ovp_id>
```

---

## Key Sources

### Developer Documentation (API Reference)
- [Telnyx Developer Docs](https://developers.telnyx.com/docs/overview)
- [Voice AI Assistant Guide](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant)
- [Create Assistant API](https://developers.telnyx.com/api/inference/inference-embedding/create-new-assistant-public-assistants-post)
- [Get Assistant API](https://developers.telnyx.com/api/inference/inference-embedding/get-assistant-public-assistants-assistant-id-get)
- [Start AI Assistant on Call](https://developers.telnyx.com/api/call-control/call-start-ai-assistant)
- [Gather Using AI](https://developers.telnyx.com/api/call-control/call-gather-using-ai)
- [Scheduled Events API](https://developers.telnyx.com/api/inference/inference-embedding/create-scheduled-event)
- [Create Assistant Test API](https://developers.telnyx.com/api/inference/inference-embedding/create-assistant-test-public-assistants-tests-post)
- [List Assistant Tests API](https://developers.telnyx.com/api/inference/inference-embedding/get-assistant-tests-public-assistants-tests-get)
- [Get All Test Suite Names API](https://developers.telnyx.com/api/inference/inference-embedding/fetch-test-suites-public-assistants-tests-test-suites-get)
- [Embed Documents API](https://developers.telnyx.com/api/inference/inference-embedding/post-embedding)
- [Embed URL Content API](https://developers.telnyx.com/api/inference/inference-embedding/post-embedding-url)
- [Get Insight Template API](https://developers.telnyx.com/api/inference/inference-embedding/get-insight-by-id)
- [Initiate TeXML Call API](https://developers.telnyx.com/api/call-scripting-twexit/initiate-texml-call)
- [Create Bucket API](https://developers.telnyx.com/api/cloud-storage/bucket-operations/create-bucket)
- [Inference API Reference](https://developers.telnyx.com/api/inference)

### Feature Guides
- [Memory](https://developers.telnyx.com/docs/inference/ai-assistants/memory)
- [Dynamic Variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables)
- [Agent Handoff](https://developers.telnyx.com/docs/inference/ai-assistants/agent-handoff)
- [Version Testing & Traffic Distribution](https://developers.telnyx.com/docs/inference/ai-assistants/version-testing-traffic-distribution)
- [Creating Insights](https://developers.telnyx.com/docs/inference/ai-insights/creating-insights)
- [TeXML AMD](https://developers.telnyx.com/docs/voice/programmable-voice/texml-answering-machine)
- [Call Control AMD](https://developers.telnyx.com/docs/voice/programmable-voice/answering-machine-detection)
- [Cloud Storage API Endpoints](https://developers.telnyx.com/docs/cloud-storage/api-endpoints)
- [AWS S3 Compatibility](https://developers.telnyx.com/docs/cloud-storage/aws-s3-compatibility)

### Release Notes & Product Pages
- [AI Missions](https://telnyx.com/release-notes/missions-multi-call-orchestration)
- [Multi-Agent Handoff](https://telnyx.com/release-notes/multi-agent-handoff)
- [Dual Voice Modes for Handoff](https://telnyx.com/release-notes/two-voice-modes-ai-agent-handoff-tool)
- [Multi-Assistant Handoff Update](https://telnyx.com/release-notes/multi-assistant-ai-handoff-update)
- [Versioning & Canary Deployments](https://telnyx.com/release-notes/versioning-canary-deployments)
- [Scheduled Events API](https://telnyx.com/release-notes/ai-assistant-scheduled-events-api)
- [Memory Feature](https://telnyx.com/release-notes/AI-assistant-memory-release-note)
- [Post-Call Insights Webhook](https://telnyx.com/release-notes/ai-assistant-post-call-insights-webhook)
- [Knowledge Base Uploads](https://telnyx.com/release-notes/fast-knowledge-base-uploads)
- [URL Embedding API](https://telnyx.com/release-notes/url-embedding-API-endpoint)
- [Simplified Knowledge Base Setup](https://telnyx.com/release-notes/simplified-knowledge-base-setup)
- [Embed Website Content](https://telnyx.com/release-notes/embed-website-content-ai-assistant)
- [Webhook Testing in AI Builder](https://telnyx.com/release-notes/test-webhooks-instantly-ai-agents)
- [Premium AMD](https://telnyx.com/release-notes/premium-answering-machine-detection)
- [Standard AMD](https://telnyx.com/release-notes/amd-is-live-on-telnyx)
- [Conversation History & Insights](https://telnyx.com/release-notes/conversation-history-insights-ai-assistant-builder)
- [MCP Server Integration](https://telnyx.com/release-notes/mcp-servers-ai-agents)
- [Conversational AI Pricing](https://telnyx.com/pricing/conversational-ai)
- [Telnyx vs Retell](https://telnyx.com/the-best-retell-alternative)

### SDKs & Libraries
- [Node.js SDK (npm)](https://www.npmjs.com/package/telnyx)
- [Node.js SDK (GitHub)](https://github.com/team-telnyx/telnyx-node)
- [AI Agent React Library](https://www.npmjs.com/package/@telnyx/ai-agent-lib)
- [Telnyx MCP Server](https://github.com/team-telnyx/telnyx-mcp-server)
- [AMD Demo (GitHub)](https://github.com/team-telnyx/demo-amd)

### Resources & Guides
- [AI Assistant Builder Guide](https://telnyx.com/resources/ai-assistant-builder)
- [Voice AI Agent Platform Guide](https://telnyx.com/resources/voice-AI-agent-platform)
- [AI Voice Analytics](https://telnyx.com/resources/ai-voice-analytics-telephony)
- [AI Personalization with Memory](https://telnyx.com/resources/ai-assistant-personalization)
- [AMD Explained for Call Centers](https://telnyx.com/resources/answering-machine-detection-explained)
- [Release Notes (All)](https://telnyx.com/release-notes)
