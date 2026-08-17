# 01 — Architecture: How Grok Voice Actually Works

## The core idea: unified speech-to-speech

Every voice AI platform you've integrated so far (`Retell`, `Telnyx`, `Vapi`, `ElevenLabs Agents`) is fundamentally a **cascading pipeline**:

```
caller audio → STT (Deepgram) → text → LLM (GPT-4o/Claude) → text → TTS (ElevenLabs) → caller audio
              ~100-200ms         ~300-600ms                    ~150-300ms
                                                        total: ~600-1000ms
```

Grok Voice is a **single model** that consumes audio tokens and emits audio tokens:

```
caller audio → grok-voice-think-fast-2.0 → caller audio
                    sub-second, one hop
```

### What this buys you

- **Latency.** No serialization boundaries, no three network hops, no waiting for a full transcript before the LLM starts. xAI markets sub-second; the class is roughly 200–500ms first-token depending on network.
- **Prosody survives the trip.** In a cascade, tone/emotion/emphasis is destroyed at the STT step — the LLM only ever sees flat text. A unified model hears *how* something was said. That matters enormously for a sales dialer: hesitation, irritation, and enthusiasm are signal, and a cascade throws all of it away.
- **Natural barge-in.** Interruption handling is native to the model rather than bolted on with VAD + TTS cancellation.
- **Native tool use inside the audio loop.** Web search, X search, file/collection search, and remote MCP all execute server-side without leaving the audio session.

### What it costs you

- **You cannot swap the LLM.** This is the big one. In our current architecture, the LLM is a swappable component — we route Retell through GPT-4o, Claude 3.5 Sonnet, etc., and `agent_pricing` tracks per-model cost. With Grok Voice the model *is* the product. No cheaper model for simple flows, no smarter model for complex ones, no OpenRouter tier fallback.
- **You cannot swap the voice engine independently.** Voices come from xAI's roster (or a custom clone). No ElevenLabs voice on a Grok agent.
- **No per-stage observability.** In a cascade you can inspect the transcript the LLM received and the text the TTS spoke. Here the intermediate representation is audio tokens — you get transcripts as a side channel (`conversation.item.input_audio_transcription.updated`), not as the ground truth the model reasoned over.
- **Shorter production track record.** The Voice Agent API launched December 2025. The STT→LLM→TTS pipeline pattern has years of production hardening behind it.

This is the whole trade in one line: **you trade control and modularity for latency and prosody.**

---

## Model lineup

| Model | Status | Price (audio) | Notes |
|---|---|---|---|
| `grok-voice-latest` | Alias | tracks 2.0 | Points to `grok-voice-think-fast-2.0` as of **Aug 5, 2026** |
| `grok-voice-think-fast-2.0` | **Current** | **$0.08/min** ($4.80/hr) | Flagship, enhanced reasoning |
| `grok-voice-think-fast-1.0` | **Deprecated** | $0.05/min ($3.00/hr) | Legacy compat only |

Plus `$0.004` per text input unit on both (negligible for voice-driven flows; relevant if you inject a lot of text context per turn).

> **Pinning advice:** pin `grok-voice-think-fast-2.0` explicitly rather than `grok-voice-latest` in production. The alias moved once already (1.0 → 2.0 on Aug 5, 2026) and that move was a **60% price increase**. An alias that silently re-prices your per-minute cost is not something you want pointed at a 5,000-call campaign.

### `reasoning.effort` — the cost/latency dial

Session config exposes `reasoning.effort`: `"high"` (default) or `"none"`.

For high-volume outbound dialing where the script is largely fixed and the agent is qualifying against a short rubric, `"none"` is likely the right default — you're paying for reasoning you don't use, and reasoning costs latency. Reserve `"high"` for genuinely open-ended conversations (inbound support, complex objection handling).

Docs do not state whether `effort` changes the billing rate — assume it does **not** (billing is per audio-minute) and treat it purely as a latency/quality dial.

---

## The four products, disambiguated

xAI's voice surface is four separate things sharing a voice roster. Don't confuse them.

### 1. Voice Agent API (Speech to Speech) — the main event
- `wss://api.x.ai/v1/realtime?model=grok-voice-latest`
- Full-duplex, WebSocket, OpenAI Realtime-compatible
- Server VAD, tool calling, 20+ languages with auto-detection
- **This is what you'd build a dialer on.** Everything in [02-api-reference.md](./02-api-reference.md).

### 2. Text to Speech
- `POST https://api.x.ai/v1/tts` and `wss://api.x.ai/v1/tts`
- Up to 15,000 chars/request, MP3/WAV/PCM/μ-law/A-law
- **Expressive inline tags** — genuinely good, and directly useful to us:
  - Inline: `[pause]`, `[long-pause]`, `[laugh]`, `[cry]`, `[breath]`, `[cough]`, `[throat-clear]`
  - Wrapping: `<loud>`, `<soft>`, `<slow>`, `<fast>`, `<high>`, `<low>`, `<whisper>`, `<sing>`
- Character-level timestamps (caption/lip-sync)
- Pronunciation replacement, up to 200 entries/request
- 50 concurrent WebSocket sessions per team
- **Relevance to us:** this is a drop-in candidate to replace ElevenLabs for `voice-broadcast-engine` audio generation and the `elevenlabs-tts` edge function. $15/1M chars is competitive, and the `[breath]`/`<soft>` tags would make broadcast drops sound markedly less robotic.

### 3. Speech to Text
- `POST https://api.x.ai/v1/stt` and WebSocket streaming
- 12 audio formats, word-level timestamps, multichannel, **speaker diarization**, 25 languages
- $0.10/hr REST, $0.20/hr streaming
- **Relevance to us:** absurdly cheap for post-call processing. Diarization + word timestamps on recordings would materially improve `analyze-call-transcript` and the opener-effectiveness tracking in `ScriptAnalyticsDashboard`. At $0.10/hr, transcribing every call in a 5,000-call campaign averaging 3 min is ~$25. This is arguably the easiest, lowest-risk win in the entire Grok surface.

### 4. Voice Agent Builder — no-code
- Browser UI: describe the flow in plain language → working agent in ~2 minutes
- Free provisioned US phone number, in-browser testing
- Knowledge upload (PDF, MD, DOCX, PPTX, XLSX, HTML, JSON), shared collections
- Tool integrations: Google Calendar, Outlook, Linear, Notion, Google Drive, OneDrive, MCP, custom APIs
- 2-minute voice cloning
- Recordings, transcripts, tool-use logs, human handoff with realtime notification
- $0.05/min + $0.01/min telephony

**Honest assessment of the Builder:** it is a competitor to our product, not a component of it. Cobus Greyling's review is worth internalizing — flow definitions are high-level Markdown descriptions rather than graph-based control, with logic "offloaded to the model's reasoning capabilities." His verdict: *"organisations will outgrow the Grok Voice Agent Builder in no time as their application needs grow."*

That's precisely the gap `dial-smart-system` fills — campaign orchestration, queue lifecycle, disposition routing, retry logic, DNC, compliance windows, number rotation, A/B testing. The Builder has none of that. **Use the API, ignore the Builder** — except as competitive intel on where xAI is heading.

---

## Custom voices

- `POST https://api.x.ai/v1/custom-voices`
- Max **120 seconds** of reference audio
- Cloned voices work across **both** TTS and the realtime Voice Agent API

For white-label resale (the credit system in `WHITE_LABEL_SYSTEM.md`), per-client cloned voices are a genuinely strong upsell. Docs don't state custom-voice pricing — verify before quoting a client.

---

## Compliance posture

xAI states SOC 2 Type II, HIPAA eligibility, GDPR compliance, and multi-region availability.

That's a stronger enterprise posture than I expected and removes the usual "we can't put a new vendor in the call path" objection. **Verify HIPAA eligibility requires a signed BAA** before any healthcare-adjacent use — "eligible" and "covered" are different words.

---

## Where the docs are silent

Being explicit about gaps so nobody builds on an assumption:

- **Latency benchmarks.** xAI claims Grok Voice "scores well above Gemini and GPT realtime models" on their own audio benchmarks. Self-reported, no public methodology. Treat as marketing until measured on our own traffic.
- **`reasoning.effort` billing impact.** Not documented.
- **Custom voice pricing.** Not documented.
- **Full built-in voice roster.** Docs name `eve` (default), `ara`, `rex` and point to `GET /v1/tts/voices` for the rest. Fetch it programmatically; don't hardcode a list.
- **Answering machine detection.** No native AMD mentioned anywhere in the voice docs. This is a **significant gap for outbound dialing** — Telnyx gives us ML-based AMD at the telephony layer, and our `twilio-amd-webhook` handles the Twilio path. With Grok you'd be back to transcript-scanning heuristics, or you keep AMD at the carrier layer before bridging. See [03-telephony-sip.md](./03-telephony-sip.md).
