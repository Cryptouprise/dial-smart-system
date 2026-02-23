# Telnyx Voice AI Platform - Complete Technical Reference

> **Purpose**: Comprehensive knowledge base for integrating Telnyx Voice AI Agents into dial-smart-system.
> **Last Updated**: February 23, 2026
> **Status**: Research Complete | Integration Planning

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

## Tools & Function Calling

AI Assistants support 8 built-in tool types:

### 1. Webhook Tool
Make HTTP requests to external APIs during a conversation.

```json
{
  "type": "webhook",
  "name": "check_availability",
  "description": "Check calendar availability for appointment booking",
  "url": "https://your-api.com/availability/{date}",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer {{api_key}}"
  },
  "path_parameters": {
    "type": "object",
    "properties": {
      "date": { "type": "string", "description": "Date in YYYY-MM-DD format" }
    }
  },
  "query_parameters": {
    "type": "object",
    "properties": {
      "timezone": { "type": "string" }
    }
  },
  "body_parameters": {
    "type": "object",
    "properties": {
      "service_type": { "type": "string" }
    }
  }
}
```

**Features**:
- Supports GET, POST, PUT, PATCH, DELETE
- Headers can reference integration secrets (for API keys)
- Path/query/body parameters described as JSON Schema
- Dynamic variables can be used in URL and parameter descriptions
- Test button available in portal to verify with sample data

### 2. Transfer Tool
Transfer calls to human agents or other numbers.

```json
{
  "type": "transfer",
  "name": "transfer_to_sales",
  "description": "Transfer the caller to the sales team",
  "targets": [
    { "name": "Sales Team", "number": "+15551234567" },
    { "name": "Support", "number": "+15559876543" }
  ]
}
```

**Features**:
- Named targets with phone numbers
- Full conversation context passed to receiving agent
- Warm transfer (context preserved, no repeat info)
- AMD detection on transfer (detect voicemail, optionally leave message or cancel)

### 3. SIP Refer Tool
Transfer calls via SIP REFER for contact center integration.

### 4. Handoff Tool
Route conversation between multiple AI assistants.

```json
{
  "type": "handoff",
  "name": "handoff_to_billing",
  "description": "Hand off to billing specialist assistant",
  "assistant_id": "asst_billing_xxxxx"
}
```

**Features**:
- Transparent to the user (shared context, same voice by default)
- OR distinct voice mode (each assistant keeps its own voice)
- Team of specialist assistants on one call
- Shared conversation history

### 5. Hangup Tool
Let the assistant end the call programmatically.

### 6. Send DTMF Tool
Send touch-tone signals during the call (useful for IVR navigation).

### 7. Send Message Tool (NEW)
Send SMS directly from the voice agent during a call.

```json
{
  "type": "send_message",
  "name": "send_confirmation_sms",
  "description": "Send appointment confirmation SMS to the caller"
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

**Features**:
- Native MCP support in AI Assistants
- Connects to any public API with an MCP server
- Telnyx auto-includes `telnyx_conversation_id` (not susceptible to prompt injection)
- Integration secrets for secure URL storage
- Zapier integration via MCP (access 6,000+ apps)
- Can store MCP server URL as integration secret

### 9. Skip Turn Tool
Let the assistant stay silent and wait for more user input. Useful when the user is thinking or providing extended information.

### 10. Retrieval Tool (Knowledge Base / RAG)
Search the assistant's uploaded knowledge base (PDFs, DOCX, TXT, URLs) for relevant information during the conversation. Powered by vector embeddings on Telnyx GPUs.

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

### Memory System
Telnyx AI Assistants have built-in memory that persists across conversations:

- **Returning caller recognition**: Links past conversations to phone number
- **Time range flexibility**: Control how far back memory extends (days/weeks)
- **Configurable parameters**: What to store, how long, how it's recalled
- **Memory query**: Uses same filters as List Conversations endpoint

**Memory Query Configuration** (in dynamic variables webhook response):
```json
{
  "memory": {
    "conversation_query": {
      "phone_number": "+15551234567",
      "limit": 5,
      "order": "desc"
    },
    "insight_query": {
      "insight_ids": ["insight_abc", "insight_def"]
    }
  }
}
```

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

### Post-Call Insights Webhook
Configure a webhook URL in the Insights tab to receive structured analytics after every call:

```json
{
  "event_type": "call.conversation_insights.generated",
  "data": {
    "conversation_id": "conv_xxxxx",
    "assistant_id": "asst_xxxxx",
    "duration_seconds": 180,
    "summary": "Customer inquired about solar panel installation...",
    "sentiment": "positive",
    "action_items": ["Schedule site assessment", "Send pricing guide"],
    "custom_insights": { ... }
  }
}
```

**Features**:
- Automatic delivery (no polling needed)
- Custom insight grouping for multi-location/multi-brand
- Connect directly to CRM, EHR, compliance systems
- Separate webhooks per assistant

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

## Scheduled Events API

Schedule outbound calls or SMS at specific future times — perfect for appointment reminders, follow-ups, and proactive outreach.

### Create Scheduled Event
```bash
POST https://api.telnyx.com/v2/ai/assistants/{assistant_id}/scheduled_events
Authorization: Bearer <TELNYX_API_KEY>

{
  "channel": "phone_call",
  "agent_target": "+15551234567",
  "end_user_target": "+15559876543",
  "scheduled_at": "2026-02-24T14:00:00Z",
  "conversation_metadata": {
    "lead_id": "lead_123",
    "campaign": "solar_followup"
  }
}
```

**Response**:
```json
{
  "data": {
    "scheduled_event_id": "sched_xxxxx",
    "status": "scheduled"
  }
}
```

### Capabilities
- **Channel**: `phone_call` or `sms`
- **Precise timing**: ISO 8601 format
- **Custom metadata**: Track context per scheduled event
- **Post-call insights**: Webhook receives insights after scheduled call completes
- **Cancel**: DELETE the event by ID

### Use Cases for Our System
- Callback scheduling (lead says "call me Tuesday at 2pm")
- Appointment reminders (day-before, morning-of)
- Follow-up sequences (call → wait 2 days → call again)
- Campaign scheduling (schedule 1,000 calls at optimal times)

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

## Multi-Agent Handoff

Seamlessly route conversations between specialized AI assistants:

### Two Voice Modes
1. **Unified Voice**: All assistants share the same voice (seamless, caller doesn't notice the switch)
2. **Distinct Voice**: Each assistant keeps its own voice settings

### Use Cases
- **Triage → Specialist**: First assistant qualifies the lead, hands off to product specialist
- **Language switching**: English assistant → Spanish assistant
- **Escalation**: Sales AI → Manager AI → Human transfer

### How to Configure
Add handoff tools to your assistant, referencing other assistant IDs. The handoff is transparent — shared context, no disruption to the caller. Visual workflow editor in portal shows flowchart of nodes (color-coded: purple=transfers, red=hangups, blue=other).

---

## Versioning, A/B Testing & Canary Deployments

Built-in version management for assistants — no custom implementation needed:

- **Multiple versions**: Create and manage different assistant versions
- **Traffic splitting**: Percentage-based routing between versions (A/B testing)
- **Canary deployments**: Route a small portion of traffic to a new version before full rollout
- **Performance comparison**: Compare metrics across versions in real-world conditions
- **Test without risk**: All changes testable without impacting production traffic

### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v2/ai/assistants/tests` | List assistant tests with pagination |
| `POST` | `/v2/ai/assistants/tests` | Create a test case |
| `POST` | `/v2/ai/assistants/tests/trigger` | Execute a test suite |
| `GET` | `/v2/ai/assistants/tests/runs` | View test run results |

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

## Answering Machine Detection (AMD)

**Free** with Call Control — no additional charge.

### Detection Modes
| Mode | Description |
|------|-------------|
| `detect` | Basic human/machine detection |
| `detect_words` | Word-based detection + greeting end |
| `detect_beep` | Beep-only detection |
| `greeting_end` | Detects end of machine greeting |

### Premium AMD
- Advanced Voice Activity Detection (VAD)
- Granular classifications: `silence`, `machine_greeting`, `human_residence`, `human_business`
- Webhook: `call.machine.premium.detection.ended`
- Available on AI Assistant transfers too (new feature)

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

## Monitoring & Analytics

### Real-Time Cost Estimator
In the Mission Control Portal, a dynamic cost bar shows per-minute cost estimate as you configure the assistant (base rate + STT + TTS + LLM).

### Post-Call Insights
- **Automatic summaries**: Conversation summary generated after each call
- **Sentiment analysis**: Positive/negative/neutral per call
- **Action items**: Extracted to-do items
- **Custom insights**: Define your own extraction templates
- **Webhook delivery**: Push to your systems immediately

### Conversation History
- Full conversation logs accessible via API
- Searchable by phone number, date range, assistant
- Metadata tagging for custom filtering

### Latency Monitoring
- Demo links with per-turn latency measurement
- Shows client device, network, and compute delays
- Helps tune voice/model selection for optimal experience

### WebRTC React Library
For web-based monitoring and testing:
- `@telnyx/ai-agent-lib` — React library for AI agent frontends
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

## Knowledge Base

### Setup
- **Portal**: Drag-and-drop files (PDF, DOCX, TXT) or enter URLs
- **API**: Upload documents or embed website content via embedding endpoint
- **Auto-update**: Embeddings auto-update when documents change

### Embedding Models
- `thenlper/gte-large`
- `intfloat/multilingual-e5-large`
- `sentence-transformers/all-mpnet-base-v2`

Operates on Telnyx Storage Buckets. Processing is asynchronous. 90%+ cheaper than competitors on embeddings.

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

- [Telnyx Developer Docs](https://developers.telnyx.com/docs/overview)
- [Voice AI Assistant Guide](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant)
- [Create Assistant API](https://developers.telnyx.com/api/inference/inference-embedding/create-new-assistant-public-assistants-post)
- [Start AI Assistant on Call](https://developers.telnyx.com/api/call-control/call-start-ai-assistant)
- [Gather Using AI](https://developers.telnyx.com/api/call-control/call-gather-using-ai)
- [Scheduled Events API](https://developers.telnyx.com/api/inference/inference-embedding/create-scheduled-event)
- [AI Missions](https://telnyx.com/release-notes/missions-multi-call-orchestration)
- [Multi-Agent Handoff](https://telnyx.com/release-notes/multi-agent-handoff-tool)
- [MCP Server Integration](https://telnyx.com/release-notes/mcp-servers-ai-agents)
- [Dynamic Variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables)
- [Memory](https://developers.telnyx.com/docs/inference/ai-assistants/memory)
- [Post-Call Insights Webhook](https://telnyx.com/release-notes/ai-assistant-post-call-insights-webhook)
- [Conversational AI Pricing](https://telnyx.com/pricing/conversational-ai)
- [Telnyx vs Retell](https://telnyx.com/the-best-retell-alternative)
- [Node.js SDK (npm)](https://www.npmjs.com/package/telnyx)
- [Node.js SDK (GitHub)](https://github.com/team-telnyx/telnyx-node)
- [AI Agent React Library](https://www.npmjs.com/package/@telnyx/ai-agent-lib)
- [Telnyx MCP Server](https://github.com/team-telnyx/telnyx-mcp-server)
- [Release Notes](https://telnyx.com/release-notes)
