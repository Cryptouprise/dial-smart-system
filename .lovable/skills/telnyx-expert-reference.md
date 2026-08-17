# Telnyx Expert Reference

Full docs: `docs/TELNYX_EXPERT_REFERENCE.md` (**V6.0, verified 17 Aug 2026**) and
`docs/TELNYX_INTEGRATION_ARCHITECTURE.md`. The three root-level `TELNYX_*.md` files are
February 2026 and each carries a staleness header listing what's now wrong.

## ⚠️ Corrections to the V4/V5 version of this skill

| Old claim | Reality (Aug 2026) |
|---|---|
| Telnyx **$0.06–$0.09/min all-in** | **$0.05/min** = orchestration + Telnyx-hosted STT + TTS. LLM (~$0.004/min) and telephony (from $0.0032/min) separate. All-in **≈$0.056**, or ≈$0.093 with a frontier LLM |
| Standard AMD free | **$0.002/invocation** (premium $0.0065 unchanged) |
| STT includes Whisper / Google | **Both removed** from AI Assistant transcription models |
| ElevenLabs / Azure resold by Telnyx | **Both BYO-API-key now** — need an Integration Secret via `voice_api_key_ref` |
| KokoroTTS lowest latency | **Telnyx Ultra** is the low-latency default (sub-100ms TTFB, 44 languages). ⚠️ **REST-only, not on the TTS WebSocket** |
| MCP as inline tool `{"type":"mcp_server","url":…}` | **Standalone `/ai/mcp_servers` resource** referenced by ID from a top-level `mcp_servers[]` |
| `tools[]` defines tools | **"Deprecated for new integrations"** — use `tool_ids[]` (shared Tools Library) + `mcp_servers[]` |
| Dynamic-vars webhook must answer **<1s** | **1500 ms** default, max 10000. Response **must** be wrapped `{"dynamic_variables": {...}}` |
| Async webhooks have **no timeout** | Assistant stops waiting at `async_timeout_ms` — **default 300 ms** |
| Docs 403 behind CDN | **Directly fetchable** — see below |
| "2 msg/min unregistered long code" | **Unregistered 10DLC BLOCKED outright** since Feb 2025 |
| Python `telnyx-mcp-server` | **Deprecated** → `telnyx-mcp` (npm) or hosted `api.telnyx.com/v2/mcp` |

## Research endpoints (bypass the CDN wall)

`developers.telnyx.com/llms.txt` · `.../docs/development/llms/ai-assistants-llms-full-txt` (364 KB) ·
`voice-tts-llms-full-txt` · `voice-stt-llms-full-txt` · `telnyx.com/pricing.md` (705 KB) ·
`raw.githubusercontent.com/team-telnyx/openapi/master/openapi/spec3.json` (5.8 MB) ·
`telnyx.statuspage.io/api/v2/summary.json`.
**`telnyx.com/changelog` is 404 → `telnyx.com/release-notes`.**

## Valid AI Assistant STT models (complete)

`deepgram/flux` · `deepgram/nova-3` · `deepgram/nova-2` · `azure/fast` ·
`assemblyai/universal-streaming` · `xai/grok-stt` · `nvidia/parakeet-v3`
(Parakeet: final transcripts only, ignores endpointing — **not for turn-taking**.)

## TTS

Telnyx-native: Ultra (REST-only), Natural, NaturalHD, KokoroTTS, Qwen3TTS (cloned voices via
Voice Design), Grok, Bayan (Arabic, 13 dialects), Sukhan (Urdu).
Third-party: Rime Coda, Inworld Realtime TTS 2, Fish Audio (inline `[whisper]` `[excited]`
markers), Murf, Resemble. **ElevenLabs + Azure Neural HD = BYO key.**
Format `Provider.Model.VoiceId`; mustache supported (`Telnyx.Ultra.{{voice_id}}`, voice only).
Expressive Mode: Ultra and Grok only.

**`astra` silent-voice warning:** no fix note published, but `astra` is now the canonical example
voice throughout current docs (15 occurrences). Circumstantially fixed — retest before trusting.

## Tools — 12 types

Webhook · Retrieval · Handoff · Hangup · Transfer · SIP Refer · DTMF · SendMessage · SkipTurn ·
MCPServer · **Invite** (new, multi-participant) · **Client-Side** (new, runs in browser).
`store_fields_as_variables` binds webhook response fields to dynamic variables by dot-path.
**Filler Messages** cover synchronous tool latency.

## New since April 2026

Realtime **WebSocket voice** (`wss://api.telnyx.com/v2/ai/assistants/{id}/conversation`, PCM16,
no telephony cost) · **Conversation Workflows** (directed graph, per-node model/voice/tool
scoping) · **Tools Library** · **Scheduled-Event native retries**
(`max_retries_client_errors`, `retry_interval_secs`) · **Edge Compute + AgentSDK** ·
**Web Search API** ($5/1k) · **Conversation Relay** (BYO-LLM, $0.05/min) ·
**Langfuse tracing** (native, zero instrumentation) · **Canary deploy targeting** ·
**Premium AMD detects iOS Call Screening** · **Number Reputation** · **Branded Calling**.

## Messaging

**RCS has been GA since July 2025** — `POST /v2/messages/rcs`, rich cards, carousels (2–10),
suggested replies, read receipts. $0.0065/segment text, $0.016 rich media. ⚠️ **RCS webhooks are
structurally different from SMS** (text at `payload.body.text`, media at `body.user_file` with
GCS URLs, sender `from.agent_id`, inbound routes to the RCS Agent) — reusing the SMS parser breaks.

**SMS Smart Encoding** (Jan 2026) auto-substitutes GSM-7 for 200+ Unicode chars — a direct cost
lever for LLM-generated SMS, which emits curly quotes and em dashes that force UCS-2
(160 → 70 chars/segment).

Messaging is in maintenance mode at Telnyx: **zero core SMS/MMS releases Feb–Aug 2026.**

## Webhooks & limits

71 event types. Ed25519, signed payload `` `${ts}|${rawBody}` ``. **2 s timeout, ONE retry,
at-least-once, no ordering.** `webhook_api_version` **defaults to `"1"`** — audit connections.
⚠️ **Don't use the SDK's `webhooks.unwrap()`** — it reads headers Telnyx never sends.
Enable **`call_cost_in_webhooks`** for real per-call cost with `client_state` echo.

**Voice CPS ceiling: 50 calls/sec** (`503 CPS limit` above). Message queue holds **4 hours FIFO
then silently drops**. `POST /calls` supports **`command_id`** for idempotency; **SMS has none**.

## Competitive (audit-safe)

Don't say "all-in pricing", "sub-200ms", "$500–$2,100/mo savings", "30+ countries", or "BYOK" —
all retired. Independent caller-side benchmark: **Telnyx 1,296 ms median (best of 5)**, but p95
worse than ElevenLabs. **Lead with compliance-adjusted cost:** Vapi's HIPAA path is +$3,000/mo
and 3.6× Telnyx at 10k min. **xAI Grok** (Jul 2026) is $0.05/min genuinely bundled and cheaper
than Telnyx — counter on compliance (no HIPAA/SOC2/PCI).
