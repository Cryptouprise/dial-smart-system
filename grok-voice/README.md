# Grok Voice — Expert Reference

Everything about xAI's Grok voice stack: what it is, how it works, how to use it, what it costs, and how it compares to the Retell + Telnyx stack already running in `dial-smart-system`.

**Researched:** August 17, 2026
**Primary source:** [docs.x.ai](https://docs.x.ai/docs/guides/voice)

---

## Read this first — the 90-second version

xAI ships **four** voice products. Most people conflate them:

| Product | What it is | Endpoint | Price |
|---|---|---|---|
| **Voice Agent API** (Speech-to-Speech) | Full-duplex realtime conversation model. The main event. | `wss://api.x.ai/v1/realtime` | **$0.08/min** audio |
| **Text to Speech** | Standalone TTS with expressive tags | `POST/WSS /v1/tts` | $15.00 / 1M chars |
| **Speech to Text** | Standalone STT, 25 languages, diarization | `POST/WSS /v1/stt` | $0.10/hr REST, $0.20/hr streaming |
| **Voice Agent Builder** | No-code UI wrapping the above | console | $0.05/min + $0.01/min telephony |

The thing that matters for a dialer is the **Voice Agent API**.

### The three facts that actually change decisions

1. **It's a unified speech-to-speech model, not a pipeline.** There is no STT → LLM → TTS hop chain. Audio in, audio out, one model. That's where the sub-second latency comes from — and it's also the core trade-off: **you cannot swap the LLM.** You take Grok or you leave.

2. **It's OpenAI Realtime API-compatible.** Change the base URL to `wss://api.x.ai/v1/realtime` and most OpenAI Realtime client code works. This makes it cheap to trial and cheap to abandon. A handful of event names differ and xAI adds its own extensions (`force_message`, `resumption`, `replace`) — see [02-api-reference.md](./02-api-reference.md).

3. **⚠️ The $0.05/min number everywhere on the internet is stale.** That was `grok-voice-think-fast-1.0`, now deprecated. `grok-voice-latest` moved to **2.0 on August 5, 2026** at **$0.08/min**. Every blog post quoting $0.05 predates that. Budget $0.08 + telephony. Details in [04-pricing-and-comparison.md](./04-pricing-and-comparison.md).

---

## The bottom line for `dial-smart-system`

**All-in cost per talk-minute, our actual stack:**

| Provider | All-in | Notes |
|---|---|---|
| Retell (current primary) | $0.13 – $0.31 | Stacked: platform + LLM + STT + TTS + telephony |
| Telnyx (current alt) | ~$0.09 | Bundled, owns the carrier layer |
| **Grok Voice** | **~$0.09 – $0.10** | $0.08 model + ~$0.009–0.015 telephony |

Grok lands **roughly at Telnyx parity and well under Retell** — but the cost story is not the interesting part, because Telnyx already got us there. The interesting parts are **latency** (unified model, sub-200ms class) and **native tool use** (web search, X search, MCP, file search all server-side, no client round-trip).

**The blocker you need to know about up front:** xAI does **not** provision numbers via API, and the SIP path is documented **inbound-first** (`realtime.call.incoming` webhook). For a predictive dialer that is *entirely outbound*, this means Grok cannot be a drop-in replacement for the `outbound-calling` edge function. You originate on Twilio/Telnyx and bridge into `sip:{number}@sip.voice.x.ai`. That's a real architecture change, not a config flag. Fully worked out in [03-telephony-sip.md](./03-telephony-sip.md) and [05-integration-plan.md](./05-integration-plan.md).

**Recommendation:** worth a real pilot as a **third provider** behind the existing `provider` column on `call_logs`, scoped to inbound + warm-transfer flows first where the SIP model fits natively. Do not rip out Retell or Telnyx for it. Reasoning in [06-verdict.md](./06-verdict.md).

---

## Contents

| File | What's in it |
|---|---|
| [01-architecture.md](./01-architecture.md) | How the unified S2S model works, model lineup, why latency is lower, what you give up |
| [02-api-reference.md](./02-api-reference.md) | Complete Voice Agent API: session config, every event, tools, audio formats, VAD, resumption, force messages |
| [03-telephony-sip.md](./03-telephony-sip.md) | SIP trunking, Twilio/Telnyx/Plivo setup, DTMF, transfer, hangup, the outbound problem |
| [04-pricing-and-comparison.md](./04-pricing-and-comparison.md) | Real per-minute math vs Retell, Telnyx, OpenAI Realtime, ElevenLabs, Vapi |
| [05-integration-plan.md](./05-integration-plan.md) | Concrete phased plan to add Grok to `dial-smart-system` |
| [06-verdict.md](./06-verdict.md) | Limitations, gotchas, when to use it and when not to |
| [examples/](./examples/) | Runnable Node + Python starters |

---

## Source list

All claims here trace to these. Where the docs were thin or silent, the doc says so explicitly rather than guessing.

- [xAI Voice Overview](https://docs.x.ai/docs/guides/voice)
- [xAI Voice Agent API](https://docs.x.ai/docs/guides/voice/agent)
- [xAI Speech to Speech](https://docs.x.ai/developers/model-capabilities/audio/voice-agent)
- [xAI SIP Phone Calls](https://docs.x.ai/developers/model-capabilities/audio/voice-agent/sip)
- [xAI Text to Speech](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)
- [xAI Pricing](https://docs.x.ai/developers/pricing)
- [LiveKit xAI plugin](https://docs.livekit.io/agents/models/realtime/plugins/xai/)
- [LiteLLM xAI Realtime](https://docs.litellm.ai/docs/providers/xai_realtime)
- [Cobus Greyling — critical review of Voice Agent Builder](https://cobusgreyling.medium.com/grok-voice-agent-builder-b97d8570dc36)
- [Evalgent — xAI Grok Voice Agent guide](https://www.evalgent.com/blog/xai-grok-voice-agent)
- [DigitalApplied — Voice Agent Builder breakdown](https://www.digitalapplied.com/blog/grok-voice-agent-builder-no-code-voice-agents-2026)
