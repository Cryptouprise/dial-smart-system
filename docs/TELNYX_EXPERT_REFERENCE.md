# TELNYX EXPERT REFERENCE V4

## Competitive Battle Cards | TTS Voice Catalog | Webhook Schemas | Real-World Examples

Prepared for Infinite AI / CallBoss Operations — March 2026

---

## 36.1 Telnyx: Your Platform (The Baseline)

- **Advertised Price**: $0.06-$0.09/min all-in (STT + TTS + LLM + telephony bundled)
- **True Cost at Scale**: $0.06-$0.09/min. What you see is what you pay.
- **Infrastructure**: Private global backbone, co-located GPUs at telecom PoPs, licensed carrier in 30+ markets.
- **Key Differentiator**: Only platform that owns the entire stack from AI model to phone line. Zero third-party hops.

## 36.2 Master Comparison Table

| Feature | Telnyx | Vapi | Retell AI | Bland AI | Synthflow |
|---------|--------|------|-----------|----------|-----------|
| **Advertised $/min** | **$0.06-$0.09** | $0.05 | $0.07+ | $0.09-$0.11 | $0.08-$0.13 |
| **TRUE $/min (all-in)** | **$0.06-$0.09** | $0.13-$0.33 | $0.13-$0.31 | $0.09-$0.15+ | $0.08-$0.13 |
| **Monthly Platform Fee** | **$0** | $0-$999+ | $0 | $0-$499 | $375-$1,400 |
| **Owns Telephony?** | **YES** | NO (uses Telnyx/Twilio) | NO (uses Twilio) | YES (limited) | YES (own stack) |
| **Owns AI Infra?** | **YES (GPUs)** | NO | NO | YES (self-host) | NO |
| **STT/TTS/LLM Bundled?** | **All bundled** | All separate | Semi-bundled | Bundled | Bundled |
| **Custom LLM Support** | BYOK or open-source | Any provider | Any provider | GPT-4 default | GPT-4o, own models |
| **Latency** | <800ms (co-located) | <500ms (claimed) | ~800ms | ~800ms | <100ms (claimed) |
| **No-Code Builder?** | YES (Mission Control) | NO (API-only) | YES (visual) | NO (API-only) | YES (drag-drop) |
| **HIPAA/SOC2** | Both included | $1K/mo add-on | Available | SOC2 (enterprise) | Limited |
| **Best For** | Full-stack enterprise | Developer prototypes | Low-code teams | High-vol outbound | SMB no-code |

---

## 36.3 Battle Card: vs Vapi

**Their Pitch**: "$0.05/min, API-first, bring your own everything."

**Reality**: That $0.05 is ONLY the orchestration fee. You still pay separately for STT (~$0.01), LLM (~$0.06-$0.10), TTS (~$0.04), and telephony (~$0.01). Real cost: $0.13-$0.33/min. That is 2-5x what you pay with Telnyx.

### Killer Objection Handlers

- **"But Vapi is cheaper at $0.05/min"** → "That $0.05 is just the platform fee. Add STT, TTS, LLM, and phone costs and you are paying $0.18-$0.33/min. We bundle everything at $0.06-$0.09. Run 10,000 minutes and you save $700-$2,400/month."
- **"Vapi has sub-500ms latency"** → "They claim that, but they do not own the network. They rent from carriers like Telnyx and Twilio, adding hops. We co-locate GPUs at telecom points of presence. Our latency is real, not theoretical."
- **"I like picking my own providers"** → "You can do that with us too. Bring your own LLM keys, use ElevenLabs voices, or use our open-source models at no markup. The difference is we also own the phone network, so you eliminate an entire vendor."

**Trustpilot**: Vapi has a 2.6/5 rating with complaints about pricing transparency, billing surprises, and support responsiveness.

---

## 36.4 Battle Card: vs Retell AI

**Their Pitch**: "$0.07+/min, no platform fees, low-code visual builder."

**Reality**: The $0.07 covers voice engine only. Add LLM ($0.006-$0.06/min) and telephony (~$0.015/min via Twilio). Real cost: $0.13-$0.31/min. They have great UX but do not own infrastructure.

### Killer Objection Handlers

- **"Retell has a better no-code builder"** → "Our Mission Control portal lets you build, test, and deploy agents without code too. Plus we have a MCP server for Claude, so your AI tools can manage agents directly. Retell cannot match that."
- **"Retell has 4.8 stars on G2"** → "Great product for prototyping. But at 10,000+ calls/day, their Twilio dependency becomes your bottleneck and cost center. We own the network. No middleman markup."
- **"We already built on Retell"** → "We offer migration support. Our API is similar, and our Twilio migration skill converts code automatically. Most teams migrate in under a week and see 30-40% cost reduction immediately."

---

## 36.5 Battle Card: vs Bland AI

**Their Pitch**: "$0.09/min, 20,000 calls/hour, enterprise self-hosting."

**Reality**: As of December 2025, pricing is now plan-based. Scale plan users pay $0.11/min, not $0.09. Add transfer fees, SMS at $0.02/msg, and $0.015 minimum per failed outbound attempt. Monthly subscriptions ($299-$499) do NOT include minutes.

### Killer Objection Handlers

- **"Bland handles 20K calls/hour"** → "So do we. Telnyx processes billions of calls. We are a licensed carrier, not a startup with rented infrastructure. Our 99.999% uptime is backed by SLAs, not marketing claims."
- **"Bland has voice cloning"** → "We support ElevenLabs voice cloning natively. Store your API key in our secure vault and use cloned voices directly in agents. Plus MiniMax and ResembleAI for even more options."
- **"Bland's $0.09 is simple"** → "It was simple. Since December 2025 it is plan-based. Scale plan is $0.11/min plus $499/mo subscription. Failed calls cost $0.015 each. Transfers are billed separately. Our $0.06-$0.09 includes everything."

---

## 36.6 Battle Card: vs Synthflow

**Their Pitch**: "No-code, bundle everything, deploy in 30 minutes."

**Reality**: Synthflow removed their $29 Starter plan. Cheapest option is now $375/mo (Pro) with only 2,000 minutes. Overages are $0.12-$0.13/min. At 10,000 minutes, you are paying $900/mo (Growth plan). Good for SMBs but gets expensive at scale.

### Killer Objection Handlers

- **"Synthflow is easier to set up"** → "Our Mission Control builder is just as easy. But when you outgrow 4,000 minutes, Synthflow forces you to $900/mo or $1,400/mo plans. We scale linearly at $0.06-$0.09/min with no plan tiers."
- **"They own their telephony stack"** → "They built a voice stack, we built a telecom company. We are a licensed carrier with our own fiber network in 30+ countries. That is why our call quality is carrier-grade."
- **"Synthflow includes CRM integrations"** → "So do we, via webhooks, n8n, and native integrations. Plus we have MCP servers for Claude, Agent Skills for Cursor, and a full API. You get more flexibility, not less."

---

## Section 37: Complete TTS Voice Catalog

Telnyx supports seven TTS providers with dozens of voices.

### 37.1 Telnyx KokoroTTS (Built-In, Lowest Latency)

Open-source Kokoro model hosted on Telnyx GPUs. 82M parameters, fast inference, included in base pricing.
Format: `Telnyx.KokoroTTS.[voice_id]`

| Voice ID | Gender | Style | Best For |
|----------|--------|-------|----------|
| af | Female | Default American | General purpose |
| af_heart | Female | Warm, friendly | Customer service, sales |
| af_bella | Female | Professional | Business calls |
| af_sarah | Female | Conversational | Appointment setting |
| af_nicole | Female | Energetic | Sales outreach |
| af_sky | Female | Young, bright | Tech companies |
| am_adam | Male | Default American | General purpose |
| am_michael | Male | Professional | B2B, enterprise |
| bf_emma | Female | British | UK markets |
| bf_isabella | Female | British warm | Healthcare, luxury |
| bm_george | Male | British | UK markets |
| bm_lewis | Male | British warm | Professional UK |

### 37.2 Telnyx Natural (Mid-Tier Quality)

Enhanced speech quality with improved naturalness. Format: `Telnyx.Natural.[voice_name]`
Known voices include: abbie, and others accessible via the Mission Control voice picker. Natural voices offer better pronunciation accuracy than KokoroTTS but slightly higher latency.

### 37.3 Telnyx NaturalHD (Premium Quality)

Highest-quality Telnyx-native voices. Wideband audio, handles disfluencies like 'um' and 'uh' naturally, supports soft laughter.
Format: `Telnyx.NaturalHD.[voice_name]`
Known voices include: andersen_johan, Estelle, and others. NaturalHD supports English plus French, Spanish, Portuguese, Arabic, Chinese, Hindi, and many more languages. Updated in early 2026 with clearer audio, more emotion, and authentic conversational quirks.

### 37.4 Third-Party Voice Providers

**AWS Polly (via Telnyx)**
Format: `Polly.[VoiceName]` or `Polly.[VoiceName]-Neural`
Popular: Polly.Joanna-Neural (US Female), Polly.Matthew-Neural (US Male), Polly.Amy-Neural (UK Female), Polly.Brian (UK Male)

**Azure AI Speech (via Telnyx)**
Format: `Azure.[locale]-[Name]Neural`
Example: `Azure.en-US-JennyNeural`. HD voices available: `en-US-Emma:DragonHDLatestNeural`

**ElevenLabs (via Telnyx)**
Format: `ElevenLabs.Default.[voice_id]`
Requires premium ElevenLabs account. Store API key via Telnyx integration secrets API. Highest quality but highest latency.

**MiniMax (via Telnyx)**
Format: `Minimax.speech-2.6-turbo.[voice_name]`
Example: `Minimax.speech-2.6-turbo.English_expressive_narrator`

**ResembleAI (via Telnyx)**
Format: `Resemble.Pro.[voice_name]`
Example: `Resemble.Pro.Aaron_en-US`. Built on Chatterbox model, preserves emotion, style, and accent.

### 37.5 Voice Selection Decision Matrix

| Priority | Provider | Latency | Cost | Quality |
|----------|----------|---------|------|---------|
| **Speed first** | KokoroTTS | Lowest | Included | Good |
| **Balance** | NaturalHD | Low | Included | Very Good |
| **Quality first** | ElevenLabs | Higher | Add-on | Best |
| **Multilingual** | Azure Neural | Medium | Add-on | Very Good |
| **Cost optimize** | AWS Polly | Medium | Add-on | Good |

---

## Section 38: Webhook Event Schemas

### 38.1 Webhook Fundamentals

- **Delivery**: POST requests with JSON payloads to your configured endpoint.
- **Authentication**: Ed25519 signatures via `telnyx-signature-ed25519` and `telnyx-timestamp` headers.
- **Idempotency**: Events may be delivered more than once. Log event IDs and skip duplicates.
- **Response**: Always return 200 OK immediately, then process asynchronously. Telnyx will retry on failure.

### 38.2 Voice/Call Control Events

| Event Type | Trigger | Key Payload Fields |
|-----------|---------|-------------------|
| call.initiated | Call starts ringing | call_control_id, direction (inbound/outgoing), from, to, state, connection_id |
| call.answered | Callee picks up | call_control_id, from, to, start_time, call_session_id |
| call.bridged | Two legs connected | call_control_id, from, to, call_session_id |
| call.hangup | Call ends | call_control_id, hangup_cause, hangup_source, call_quality_stats (MOS, jitter, packets) |
| call.machine.detection.ended | AMD completes | call_control_id, result (human/machine/not_sure), machine_type |
| call.machine.greeting.ended | Voicemail beep detected | call_control_id, result |
| call.speak.started | TTS begins playing | call_control_id |
| call.speak.ended | TTS finishes | call_control_id |
| call.playback.started | Audio file starts | call_control_id, media_url |
| call.playback.ended | Audio file ends | call_control_id |
| call.gather.ended | DTMF input received | call_control_id, digits, status (valid/timeout) |
| call.recording.saved | Recording uploaded | call_control_id, recording_urls (wav/mp3), channels, duration_millis |
| call.fork.started | Media fork begins | call_control_id, stream_url |
| call.fork.stopped | Media fork ends | call_control_id |

### 38.3 AI Assistant Events

| Event Type | Trigger | Key Payload Fields |
|-----------|---------|-------------------|
| ai_assistant.conversation_ended | Call with AI assistant ends | assistant_id, conversation_id, transcript, duration, insights |
| ai_assistant.tool.invoked | Assistant calls a tool | assistant_id, tool_name, tool_input, conversation_id |
| ai_assistant.insights.ready | Post-call insights extracted | assistant_id, conversation_id, insights (key-value pairs) |
| ai_assistant.transfer.initiated | Call transfer triggered | assistant_id, transfer_to, reason |

### 38.5 Example JSON: call.hangup

```json
{
  "event_type": "call.hangup",
  "payload": {
    "call_control_id": "v3:abc123...",
    "call_leg_id": "uuid-here",
    "call_session_id": "uuid-here",
    "connection_id": "1234567890",
    "from": "+19728844602",
    "to": "+15551234567",
    "hangup_cause": "normal_clearing",
    "hangup_source": "callee",
    "call_quality_stats": {
      "inbound": { "mos": "4.50", "jitter_max_variance": "63.77" },
      "outbound": { "mos": "4.50", "jitter_max_variance": "12.34" }
    }
  }
}
```

### 38.6 n8n Webhook Handler Pattern

Webhook Node (POST /telnyx-webhook) → Switch Node (on body.event_type) → Route to appropriate handler nodes.

---

## Section 39: Real-World Examples & Code Snippets

### 39.1 Telnyx: Production-Ready Examples

#### Example 1: Outbound AI Dialer (Python)
```python
import telnyx
telnyx.api_key = 'KEY...'

call = telnyx.Call.create(
    connection_id='2901290113608713910',
    to='+15551234567',
    from_='+19728844602',
    answering_machine_detection='detect',
    answering_machine_detection_config={
        'total_analysis_time_millis': 5000,
        'after_greeting_silence_millis': 800
    }
)
```

#### Example 2: Webhook Handler (Node.js)
```javascript
app.post('/telnyx-webhook', (req, res) => {
    const event = req.body;
    switch (event.event_type) {
        case 'call.initiated':
            console.log(`Call from ${event.payload.from} to ${event.payload.to}`);
            break;
        case 'call.answered':
            // Enable transcription, start AI assistant
            break;
        case 'call.hangup':
            const mos = event.payload.call_quality_stats?.inbound?.mos;
            console.log(`Call ended. MOS: ${mos}`);
            break;
        case 'call.machine.detection.ended':
            if (event.payload.result === 'machine') {
                // Leave voicemail or hangup
            }
            break;
    }
    res.sendStatus(200);
});
```

#### Example 3: Send SMS with Delivery Tracking (Python)
```python
import telnyx
telnyx.api_key = 'KEY...'

msg = telnyx.Message.create(
    from_='+19728844602',
    to='+15551234567',
    text='Hi! Your appointment is confirmed for tomorrow at 2pm.',
    webhook_url='https://your-server.com/sms-webhook'
)
```

#### Example 4: AI Assistant with Custom Tools (API)
```bash
curl -X POST https://api.telnyx.com/v2/ai/assistants \
  -H 'Authorization: Bearer KEY...' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Reactivation Agent",
    "model": "telnyx/qwen3-235b-a22b",
    "instructions": "You are a friendly representative...",
    "greeting": "Hi, this is Sarah...",
    "voice": { "provider": "telnyx", "model": "NaturalHD", "voice": "Estelle" },
    "tools": [{
      "type": "webhook",
      "webhook": {
        "name": "check_availability",
        "url": "https://your-n8n.com/webhook/check-slots",
        "method": "POST"
      }
    }]
  }'
```

### 39.2 GitHub Repos Worth Studying

| Repo | Platform | What It Does | Why It Matters |
|------|----------|-------------|----------------|
| team-telnyx/ai-chatbot | Node.js | Full chatbot with Inference API + Storage RAG | White-label as customer support product |
| team-telnyx/demo-telnyx-heygen | Next.js | AI coaching with HeyGen avatars + WebRTC | Premium AI coaching platform with video |
| team-telnyx/demo-amd | Node.js | AMD with voicemail drop | Core pattern for outbound dialer campaigns |
| team-telnyx/voice-agent-tester | JS | Automated testing for AI voice assistants | QA agents before deploying to clients |
| team-telnyx/telnyx-mcp-server | Python | MCP for Claude/Cursor to manage Telnyx | Manage phone numbers and agents via AI |
| team-telnyx/n8n-nodes-telnyx-ai | TypeScript | Official n8n node for TTS, STT, Conv AI | Drop Telnyx AI directly into n8n workflows |
| team-telnyx/demo-python-telnyx | Python | SMS/MMS examples, call center, auto-responder | Quick-start code for common use cases |

### 39.3 Production Patterns from the Field

#### Pattern: Database Reactivation Campaign
**Stack**: Telnyx AI Assistant + Airtable (lead data) + n8n (orchestration) + GHL (CRM)

**Flow**:
1. Upload leads to Airtable with columns: name, phone, last_purchase_date, product_interest
2. n8n cron job pulls batch of leads daily
3. For each lead, trigger outbound call via Telnyx API with dynamic variables
4. AI assistant qualifies interest using structured insights
5. Post-call webhook fires to n8n → updates Airtable disposition → creates GHL task
6. Hot leads get SMS confirmation and calendar link

**Revenue Model**: $2-5K/month per client. Noble Gold case: $1.5M+ in closed deals from reactivated database.

#### Pattern: Solar Lead Qualification
**Stack**: Telnyx AI Assistant + Google Solar API + Cal.com + GHL

**Flow**:
1. Inbound/outbound to solar lead
2. AI asks qualifying questions: homeowner status, roof age, electric bill, shade
3. Agent tool calls Google Solar API with address
4. If qualified, books appointment via Cal.com tool
5. Post-call insights webhook sends data to GHL

**Revenue Model**: $1-3K/month per solar company.

#### Pattern: After-Hours AI Receptionist
**Stack**: Telnyx AI Assistant + webhook to CRM + SMS follow-up

**Flow**:
1. Inbound calls after hours route to AI assistant
2. Agent answers from knowledge base, captures caller info
3. If urgent → transfers to on-call staff
4. If not urgent → sends SMS with next-day callback commitment
5. Morning summary email with all after-hours call details

**Revenue Model**: $300-1K/month per business. Sell to medical offices, law firms, property managers.

---

## Cost Comparison at 10,000 Minutes/Month

**Bottom Line**: At 10,000 minutes/month, Telnyx saves you $500-$2,100/month versus every competitor. Over a year, that is $6,000-$25,200 in savings per client.

---

## Async Tools & Add Messages API (Mid-Call Context Injection)

### Async Webhooks
Set `async: true` on any webhook tool to make it non-blocking. The assistant continues talking while the backend processes.

```json
{
  "type": "webhook",
  "webhook": {
    "name": "lookup_order_status",
    "description": "Triggers an async order status lookup. Results delivered automatically.",
    "url": "https://your-backend.com/order-lookup",
    "method": "POST",
    "async": true,
    "body_parameters": {
      "type": "object",
      "properties": {
        "order_id": { "type": "string", "description": "Order ID" }
      },
      "required": ["order_id"]
    }
  }
}
```

**Backend receives**: Body parameters + `x-telnyx-call-control-id` header (critical for injecting results back).

### Add Messages API (Inject Context Mid-Call)
```
POST /v2/calls/{call_control_id}/actions/ai_assistant_add_messages
Authorization: Bearer $TELNYX_API_KEY
Content-Type: application/json

{
  "messages": [
    { "role": "system", "content": "[RESULT] Order shipped. Tracking: 1Z999. ETA: Tomorrow. Share with customer now." }
  ]
}
```

**Message roles**: `system` (instructions/context — recommended), `user` (simulate input), `assistant` (inject responses).

### Combined Async Pattern (CRITICAL for our campaigns)
1. Assistant triggers async webhook (e.g., CRM lookup, calendar check)
2. Assistant keeps talking (promotions, qualifying questions)
3. Backend processes (5-30 seconds)
4. Backend calls Add Messages API with results
5. Assistant naturally incorporates: "Great news, I have your info now!"

### Multiple Parallel Lookups
Trigger multiple async webhooks simultaneously — each completes independently and drips results into the conversation naturally. Instruct assistant: "Call BOTH tools at the same time. Do not wait for one before calling another."

### Edge Cases
- **Call ended before results**: Add Messages returns 404 — log and move on
- **Backend**: Return 200 immediately, process async (background workers)
- **No timeout constraint**: Backend can take as long as needed

### Use Cases for Our Campaigns
- **Lead qualification**: Async CRM lookup while qualifying on the call
- **Calendar booking**: Check availability in background while gathering preferences
- **Transfer context**: Inject lead data before warm transfer
- **Supervisor intervention**: Human injects guidance during difficult calls
- **Cross-system triggers**: CRM pushes updates to active call in real-time

---

## Telnyx Developer Portal Structure

### API Fundamentals
- **Authentication**: Bearer token via `Authorization: Bearer $TELNYX_API_KEY`
- **SDKs**: Node.js, Python, PHP, Java, Ruby, Go
- **CLI**: `telnyx` CLI for scripting & automation
- **Dev Tools**: Postman collections, ngrok tunneling, Node-RED

### AI Assistants Documentation Index
- [Voice Assistant](https://developers.telnyx.com/docs/inference/ai-assistants/no-code-voice-assistant) — No-code setup
- [Memory](https://developers.telnyx.com/docs/inference/ai-assistants/memory) — Cross-conversation persistence
- [Dynamic Variables](https://developers.telnyx.com/docs/inference/ai-assistants/dynamic-variables) — Pre-call context injection
- [Workflow](https://developers.telnyx.com/docs/inference/ai-assistants/workflows) — Webhook tool configuration
- [Async Tools](https://developers.telnyx.com/docs/inference/ai-assistants/async-tools) — Non-blocking webhooks + Add Messages API
- [Agent Handoff](https://developers.telnyx.com/docs/inference/ai-assistants/agent-handoff) — Multi-agent transfer
- [Voicemail Detection on Transfer](https://developers.telnyx.com/docs/inference/ai-assistants/voicemail-detection-on-transfer) — AMD on transfers
- [Transcription Settings](https://developers.telnyx.com/docs/inference/ai-assistants/transcription-settings) — STT configuration
- [Integrations](https://developers.telnyx.com/docs/inference/ai-assistants/integrations) — Third-party connections
- [Testing & Traffic Distribution](https://developers.telnyx.com/docs/inference/ai-assistants/version-testing-traffic-distribution) — A/B testing & canary deploys
- [Importing Assistants](https://developers.telnyx.com/docs/inference/ai-assistants/importing) — Import from other platforms
- [Custom LLMs](https://developers.telnyx.com/docs/inference/ai-assistants/custom-llm) — BYOK model support

### For AI Agents (MCP)
- Local & Remote MCP servers for AI agents to query Telnyx APIs
- Agent Skills for extending agent capabilities

### Migration Guides
- Call Control migration, Messaging migration, **Twilio migration guide**

---

## Changelog

- **V1.0** (March 2026): Initial 14-section expert reference
- **V2.0** (March 2026): Added 11 sections (workflows, STIR/SHAKEN, MMS vision, inference, Flow, MCP, custom LLM)
- **V3.0** (March 2026): Added 11 sections (SDK inventory, GitHub repos, MCP setup, Agent Skills, OpenClaw, buildable apps)
- **V4.0** (March 2026): Added 4 sections: competitive battle cards, TTS voice catalog (7 providers), webhook event schemas, real-world production examples with code and cost analysis
- **V5.0** (April 2026): Added async tools & Add Messages API (mid-call context injection), developer portal documentation index

Combined V1-V5: 41 sections covering the entire Telnyx platform from API basics to async mid-call operations.
