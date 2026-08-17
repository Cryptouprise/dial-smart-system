# 02 — Voice Agent API Reference

Complete working reference for `wss://api.x.ai/v1/realtime`.

---

## Connecting

```
wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0
```

Query params:
| Param | Purpose |
|---|---|
| `model` | Model ID. Pin `grok-voice-think-fast-2.0`, don't use the alias in prod. |
| `call_id` | For SIP sessions — supplied by the `realtime.call.incoming` webhook. Mutually exclusive with `model` in practice. |
| `conversation_id` | Resume a prior conversation (requires `resumption.enabled`). |

### Authentication — two modes

**Server-side (our case):** Bearer header.
```python
websockets.connect(
    "wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-2.0",
    additional_headers={"Authorization": f"Bearer {os.environ['XAI_API_KEY']}"}
)
```

**Client-side (browser/mobile):** ephemeral tokens. Browsers cannot set WebSocket headers, so the token goes in the subprotocol field prefixed `xai-client-secret.`.

> Never ship `XAI_API_KEY` to a client. For any in-browser agent testing UI we add to the dashboard, mint an ephemeral token from an edge function.

---

## Session configuration

Everything is configured by sending `session.update` after connect. Full shape:

```jsonc
{
  "type": "session.update",
  "session": {
    "voice": "eve",                          // built-in name or custom voice ID
    "instructions": "You are a helpful assistant.",
    "reasoning": { "effort": "high" },       // "high" (default) | "none"

    "turn_detection": {
      "type": "server_vad",                  // "server_vad" | null (manual)
      "threshold": 0.85,                     // 0.1–0.9, default 0.85. Higher = needs louder audio
      "silence_duration_ms": 200,            // 0–10000. Higher = tolerates longer pauses
      "prefix_padding_ms": 333,              // 0–10000, default 333. Captures word onsets
      "idle_timeout_ms": 8000                // Re-engage the user after assistant finishes
    },

    "audio": {
      "input": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "transport": "json",                 // "json" (base64) | "binary" (raw frames)
        "transcription": {
          "language_hint": "en",             // BCP-47
          "keyterms": ["Call Boss", "Retell"] // ≤100 terms, ≤50 chars each
        }
      },
      "output": {
        "format": { "type": "audio/pcm", "rate": 24000 },
        "transport": "json",
        "speed": 1.0                         // 0.7–1.5
      }
    },

    "replace": {                             // pronunciation overrides
      "Acme Mobile": "Acme Mobull"
    },

    "resumption": { "enabled": true },

    "tools": [ /* see Tools below */ ]
  }
}
```

### Turn detection tuning — dialer-specific advice

Default `threshold: 0.85` is **high**. That default is tuned for a quiet room with a headset. On a PSTN call with line noise, hold music bleed, or a caller on speakerphone in a car, 0.85 will cause the model to miss speech onsets and feel unresponsive.

Starting points for outbound PSTN:
- `threshold: 0.5–0.6` — LiveKit's plugin defaults to `0.5`, which is a meaningful signal about what actually works on real audio.
- `silence_duration_ms: 200–400` — LiveKit defaults `200`. Lower = snappier turn-taking but more mid-sentence interruptions. Sales calls where people trail off ("...so I guess, um...") want the higher end.
- `prefix_padding_ms: 300–333` — leave it. It exists to stop clipped first syllables.
- `idle_timeout_ms` — set this. It's how you get "Are you still there?" behavior instead of dead air.

**These are per-campaign tunables.** If we integrate, they belong in the campaign config, not hardcoded — the same way `calls_per_minute` is.

### Audio formats

| Codec | Encoding | Sample rates | Use |
|---|---|---|---|
| `audio/pcm` (default) | Linear16 LE | 8k, 16k, 22.05k, 24k, 32k, 44.1k, 48k | Most flexible. **24k default, recommended.** |
| `audio/pcmu` | G.711 μ-law | 8000 only | **US telephony.** Our SIP path. |
| `audio/pcma` | G.711 A-law | 8000 only | EU/international telephony |
| `audio/opus` | Opus | 24000 | One packet per payload |

> **Match your formats end to end.** If Twilio hands you μ-law 8k and you configure the session for PCM 24k, something in the middle is resampling — that's added latency and degraded quality for zero benefit. On a SIP/PSTN leg, use `audio/pcmu` @ 8000 on both input and output.

### Transcription keyterms — underrated

`keyterms` (up to 100 domain terms) biases ASR. For our use case this is directly valuable: product names, competitor names, the client's company name, industry jargon, and — critically — the phonetically ambiguous stuff that wrecks lead qualification. Feed it lead-specific context per call: the prospect's name, their company, their city.

This is a straight upgrade over what a generic Deepgram model does out of the box, and it's per-session config, so it can be populated from lead data in the same place we build `retell_llm_dynamic_variables`.

---

## Events

### Client → Server

| Event | Purpose |
|---|---|
| `session.update` | Configure/reconfigure the session. Can be sent mid-session. |
| `input_audio_buffer.append` | Stream user audio (base64 in JSON mode, or raw binary frames) |
| `input_audio_buffer.commit` | Finalize the turn (manual turn mode only) |
| `input_audio_buffer.clear` | Discard buffered audio |
| `conversation.item.create` | Send text, tool output, or a force message |
| `response.create` | Request a model response (accepts per-turn instruction overrides) |

### Server → Client

| Event | Purpose |
|---|---|
| `session.created` | Session is up |
| `session.updated` | Echo of config change |
| `conversation.created` | Carries `conversation.id` — **capture this for resumption** |
| `conversation.item.created` | A turn was added (user / assistant / tool output) |
| `response.created` | Generation started |
| `response.output_audio.delta` | Audio chunk — **stream to the caller immediately, do not buffer** |
| `conversation.item.input_audio_transcription.updated` | Cumulative ASR transcript (note: `.updated`, **not** `.delta` like OpenAI) |
| `response.function_call_arguments.done` | Tool invocation with complete args |
| `response.done` | Turn complete |
| `input_audio_buffer.dtmf_event_received` | Keypad digit (SIP sessions only) |
| `error` | Session or protocol error |

---

## Tools

Four tool types. Three run **server-side** with zero client handling — that's a real differentiator, because in our Retell integration every tool call is a round trip out to an edge function and back.

### Server-side (no client work)

**Web search**
```json
{
  "type": "web_search",
  "allowed_domains": ["x.ai", "docs.x.ai"],
  "location": { "country": "US", "city": "San Francisco" },
  "enable_image_understanding": true
}
```

**X search** — unique to xAI, no competitor has this
```json
{
  "type": "x_search",
  "allowed_x_handles": ["xai"],
  "from_date": "2025-01-01",
  "to_date": "2025-06-01",
  "enable_image_understanding": true
}
```

**Collections / file search** — this is native RAG
```json
{
  "type": "file_search",
  "vector_store_ids": ["collection-id"],
  "max_num_results": 10
}
```

**Remote MCP** — connect an MCP server directly to the voice session
```json
{
  "type": "mcp",
  "server_url": "https://mcp.example.com/mcp",
  "server_label": "my-tools",
  "allowed_tools": ["tool1", "tool2"],
  "authorization": "Bearer token",
  "headers": { "X-Custom": "value" }
}
```

> **This is significant for us.** We already built and deployed an OAuth-protected MCP server (`src/lib/mcp`, the `mcp` edge function — see the July 20 2026 entry in `CLAUDE.md`) exposing account summary, campaigns, lead search, recent calls, and phone-number health. A Grok voice agent could consume that MCP server **directly, mid-call, server-side**, with no webhook plumbing. That's the single most interesting integration surface in this entire document.

### Client-handled custom functions

```json
{
  "type": "function",
  "name": "get_weather",
  "description": "Get current weather for a location",
  "parameters": {
    "type": "object",
    "properties": {
      "location": { "type": "string", "description": "City name" },
      "units": { "type": "string", "enum": ["celsius", "fahrenheit"] }
    },
    "required": ["location"]
  }
}
```

**Handling flow:**
1. Server emits `response.function_call_arguments.done` with `name`, `call_id`, `arguments`
2. You execute locally
3. Reply with `conversation.item.create` / `type: "function_call_output"`
4. Send `response.create` to continue

```python
async def handle_function_call(ws, event):
    function_name = event["name"]
    call_id = event["call_id"]
    arguments = json.loads(event["arguments"])

    result = FUNCTION_HANDLERS[function_name](**arguments)

    await ws.send(json.dumps({
        "type": "conversation.item.create",
        "item": {
            "type": "function_call_output",
            "call_id": call_id,
            "output": json.dumps(result)
        }
    }))
    await ws.send(json.dumps({"type": "response.create"}))
```

> ⚠️ **Parallel tool calls:** when the model fires multiple functions, do **not** send `response.create` until *every* output has been submitted. Sending it early truncates the remaining calls. This is the #1 tool-calling bug in realtime APIs.

---

## `force_message` — xAI extension, very useful

Inject a scripted, TTS-synthesized utterance with **no model inference**. Deterministic, cheap, instant.

```python
await ws.send(json.dumps({
    "type": "conversation.item.create",
    "item": {
        "type": "force_message",
        "role": "assistant",
        "interruptible": False,
        "content": [{"type": "output_text", "text": "This call is being recorded."}]
    }
}))
```

> Do **not** send `response.create` after a force message — the force message *is* the turn.

**Why this matters to us:** compliance disclosures. `"This call is being recorded"`, `"This call may be monitored for quality"`, state-specific two-party-consent language. With `interruptible: false` you get a legally-clean, guaranteed-verbatim disclosure that the model cannot paraphrase, skip, or hallucinate around. In a cascade you'd normally implement this by pre-pending TTS audio and hoping the LLM doesn't step on it.

Also useful for: guaranteed openers (removing opener variance from A/B tests), hold messages, and transfer announcements.

---

## Session resumption

1. Send `"resumption": {"enabled": true}` in `session.update`
2. Capture `conversation.id` from the `conversation.created` event
3. On reconnect: `?conversation_id={id}` and re-enable resumption
4. Server replays cached turns as `conversation.item.created` events

History expires after **30 minutes** of inactivity.

Good for network blips mid-call. Note the interaction with the 30-minute max session duration below — resumption preserves *context*, it does not extend the session cap.

---

## Limits

| Limit | Value |
|---|---|
| Max session duration | **30 minutes** |
| Concurrent realtime sessions | **100 per team** |
| TTS concurrent WebSocket sessions | 50 per team |
| Resumption history TTL | 30 minutes inactivity |
| `keyterms` | 100 terms, ≤50 chars each |
| TTS text | 15,000 chars/request |
| TTS pronunciation replacements | 200/request |
| Custom voice reference audio | 120 seconds |

> 🚨 **100 concurrent sessions is the hard ceiling on this as a dialer backend.** Our `voice-broadcast-engine` is configured for up to 100 concurrent calls and the Test 1.18 campaign targets 50 calls/min against 5,000 leads. At 50 calls/min with a 3-minute average handle time, steady-state concurrency is ~150 sessions — **over the cap**. Grok Voice cannot carry our peak outbound load today without a negotiated limit increase. Confirm with xAI sales before committing to anything beyond a pilot.

---

## OpenAI Realtime compatibility

Most OpenAI Realtime SDK clients work by pointing the base URL at `https://api.x.ai/v1` / `wss://api.x.ai/v1/realtime` and swapping the key.

**Differences to watch:**
- `conversation.item.input_audio_transcription.updated` (xAI) vs `.delta` (OpenAI)
- Unsupported: `conversation.item.retrieve`, `output_audio_buffer.clear` over WebSocket, and others
- xAI-only extensions: `force_message`, `resumption`, `replace`

**Practical consequence:** a Grok pilot is cheap to start and cheap to abandon. If we build the integration against the OpenAI Realtime event shape with a thin adapter for the deltas above, the same code path can target OpenAI's `gpt-realtime` as a fallback provider. That's a good hedge given the 100-session cap.

---

## Framework integrations

**LiveKit** (`livekit-agents[xai]~=1.5` / `@livekit/agents-plugin-xai@1.x`)
```python
from livekit.agents import AgentSession
from livekit.plugins import xai

session = AgentSession(
    llm=xai.realtime.RealtimeModel(voice="Ara"),
)
```
Defaults: `model='grok-voice-think-fast-1.0'` (⚠️ the **deprecated** one — override it), `voice='ara'`, VAD `threshold=0.5`, `prefix_padding_ms=300`, `silence_duration_ms=200`.

Provider tools (`XSearch`, `WebSearch`, `FileSearch`) are **Python-only** in the LiveKit plugin.

**Also supported:** LiteLLM, Pipecat, Voximplant, 3CX.

---

## Best practices

- Start the WebSocket and mic/media capture **in parallel**, not sequentially
- Stream `response.output_audio.delta` to the caller immediately
- After a tool call, wait for playback to finish before `response.create` to avoid overlap
- Enable `server_vad` for natural barge-in
- Match input/output audio formats to avoid resampling
- Reconnect with exponential backoff + resumption
- Pin the model version explicitly
