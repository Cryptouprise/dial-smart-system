# Runnable Examples

Minimal, dependency-light starters. Node 20+.

```bash
export XAI_API_KEY=xai-...
npm install ws
```

| File | What it does |
|---|---|
| `voice-sample.mjs` | **Hear it.** Generates real Grok MP3 samples of a solar opener across every available voice. ~$0.005 for the whole roster. |
| `basic-agent.mjs` | Connects to the realtime API, configures a session, sends a text turn, logs all events. Smallest possible smoke test. |
| `sip-inbound-handler.mjs` | Express webhook for `realtime.call.incoming` → verifies signature → attaches the WebSocket → drives the call. The inbound production shape. |
| `stt-transcribe.mjs` | Post-call transcription with diarization + word timestamps. **This is the Phase 1 recommendation** — start here. |

> These are reference implementations for evaluation, not production code. No retry logic, no structured logging, no error taxonomy. Wire those in before anything touches a real call path.
