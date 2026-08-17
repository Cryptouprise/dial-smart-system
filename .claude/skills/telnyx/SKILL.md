---
name: telnyx
description: Telnyx platform expert reference — Voice AI assistants, tools, TTS/STT catalogues, messaging (SMS/MMS/RCS), phone numbers, 10DLC, pricing, webhooks, MCP, multi-tenancy, and competitive positioning vs Retell/Vapi/Twilio/Bland/xAI. Use whenever work touches Telnyx APIs, `telnyx-*` edge functions, `TelnyxAssistantEditor`, `TelnyxAIManager`, voice-agent pricing or cost modelling, SMS/10DLC compliance, number health or spam reputation, or when comparing voice-AI vendors for a client. Verified 17 August 2026.
---

# Telnyx Expert Reference (verified 17 Aug 2026)

Full docs in this repo:
- `docs/TELNYX_EXPERT_REFERENCE.md` — V6.0, the master reference
- `docs/TELNYX_INTEGRATION_ARCHITECTURE.md` — embedding Telnyx as background infrastructure
- `TELNYX_VOICE_PLATFORM.md` / `TELNYX_MESSAGING_PLATFORM.md` / `TELNYX_PHONE_NUMBERS_API.md` —
  February 2026, **each carries a staleness header listing what's now wrong**

## Research these endpoints, not the HTML docs

The old "docs are 403 behind CDN protection" note is obsolete. Machine-readable now:

- `developers.telnyx.com/llms.txt` — index
- `developers.telnyx.com/docs/development/llms/ai-assistants-llms-full-txt` — 364 KB, complete
- `developers.telnyx.com/docs/development/llms/voice-tts-llms-full-txt` / `voice-stt-llms-full-txt`
- `telnyx.com/pricing.md` — 705 KB, every SKU
- `raw.githubusercontent.com/team-telnyx/openapi/master/openapi/spec3.json` — 5.8 MB, 863 paths
- `telnyx.statuspage.io/api/v2/summary.json` — 94 components

**`telnyx.com/changelog` is a 404** → use `telnyx.com/release-notes` (`/tag/voice-ai`).
WebFetch throttles after ~3 requests; `curl` with a browser UA works.

## Pricing (the number people get wrong)

**$0.05/min covers orchestration + Telnyx-hosted STT + TTS only.** LLM (~$0.004/min) and
telephony (from $0.0032/min) are **separate**. Realistic all-in **≈$0.056/min**, or **≈$0.093/min**
with a frontier LLM. Our older docs said $0.09 flat — that's a ~38% error.

AMD: **standard $0.002/invocation** (NOT free), premium $0.0065.
HIPAA included on every plan **including PAYG**. Plan floors: PAYG $0 · Committed $500/mo ·
Enterprise $5,000/mo.

Messaging: SMS $0.004/part · MMS $0.015 out / $0.005 in · **RCS $0.0065/segment text,
$0.016 rich media**. Numbers from $1.00/mo.

## Voice / TTS

**Telnyx Ultra** is the low-latency default (sub-100ms TTFB, 44 languages) — **but REST-only,
not on the TTS WebSocket.** Others: Natural, NaturalHD, KokoroTTS, Qwen3TTS (cloned voices),
Grok, Bayan (Arabic), Sukhan (Urdu).

⚠️ **ElevenLabs and Azure Neural HD are BYO-API-key now** — Telnyx stopped reselling. Needs an
Integration Secret via `voice_api_key_ref`.

Voice ID format: `Provider.Model.VoiceId`. Dynamic selection supports mustache:
`Telnyx.Ultra.{{voice_id}}` (voice only — provider/model stay fixed).

**Expressive Mode**: Ultra and Grok only. Grok+Expressive has *higher* latency.

The old `Telnyx.NaturalHD.astra` silent-voice warning: no fix note exists, but `astra` is now
the canonical example voice throughout current docs (15 occurrences). **Circumstantially fixed
— retest before trusting.**

## STT — complete valid list for AI Assistants

`deepgram/flux` · `deepgram/nova-3` · `deepgram/nova-2` · `azure/fast` ·
`assemblyai/universal-streaming` · `xai/grok-stt` · `nvidia/parakeet-v3`

⚠️ **Whisper and Google were REMOVED.** They still exist on the Voice API / REST surface.
⚠️ **Parakeet gives final transcripts only, ignores endpointing — do not use for turn-taking.**

## Tools — 12 types, and the shape changed

Webhook · Retrieval · Handoff · Hangup · Transfer · SIP Refer · DTMF · SendMessage · SkipTurn ·
MCPServer · **Invite** (new — pull a third party into a live call) · **Client-Side** (new —
executes in the browser, no webhook).

- `tools[]` is **"deprecated for new integrations"** → use `tool_ids[]` (shared **Tools Library**
  at `portal.telnyx.com/#/ai/tools`) + `mcp_servers[]`.
- **MCP is no longer an inline tool.** Register at `POST /v2/ai/mcp_servers`
  (`{name, type, url, api_key_ref, allowed_tools}`), then reference by ID in the assistant's
  top-level `mcp_servers[]`. Two-level tool allowlisting (server + per-assistant).
- Webhook tool: `async_timeout_ms` **default 300 ms** — the assistant stops waiting there and
  tells the LLM "Submitted." Backend itself has no deadline.
- **`store_fields_as_variables`** extracts response fields by dot-path into dynamic variables —
  cleaner than stuffing state into the tool's text response.

## Dynamic variables webhook

Timeout is **1500 ms default** (max 10000, `dynamic_variables_webhook_timeout_ms`) — not the
"<1 second" our old docs claimed. **Response MUST be wrapped: `{"dynamic_variables": {...}}`.**
A flat object is silently ignored.

## Webhooks

**71 event types.** Ed25519 via `Telnyx-Signature-Ed25519` + `Telnyx-Timestamp`; signed payload
is `` `${timestamp}|${rawBody}` `` (literal pipe, raw body). 300 s replay window.

⚠️ **Do NOT use the SDK's `client.webhooks.unwrap()`** — it calls `standardwebhooks`, which reads
`webhook-id`/`webhook-signature` headers Telnyx never sends. Working Deno implementation is in
`docs/TELNYX_INTEGRATION_ARCHITECTURE.md` §3.2.

**2 s timeout, ONE retry, at-least-once, no ordering guarantee.** Never do work in the request —
verify, insert raw, return 200, fan out from `pg_cron` ordered by `occurred_at`.

⚠️ **`webhook_api_version` defaults to `"1"`** — v2 is the Ed25519-signed format. Audit every
connection.

**`call.cost` webhook** (enable `call_cost_in_webhooks: true`) gives real per-call cost with
`cost_parts[].rate` and echoes our `client_state` — the right input for margin tracking.
Handle `status: 'error'`.

## Multi-tenancy

Managed Accounts are real sub-accounts but need a **$1,000/mo+ commitment plan** and
`rollup_billing` is immutable — not worth it yet. **Use instead:** one Call Control App +
one Messaging Profile per org, `client_state` on every dial (base64, echoed on every webhook),
and `daily_spend_limit` per messaging profile as a Telnyx-enforced financial backstop.

## Reliability limits that constrain a dialer

- REST API **2000 req/s**
- **Voice CPS: 50 calls/sec** — excess returns `503 CPS limit`
- Concurrent channels ~200 outbound default
- SMS 50 MPS account · long code **0.1 MPS** per number · toll-free 20 MPS
- **Message queue holds 4 hours FIFO then silently drops.** Queue full → error `40318`
- **No global idempotency header.** But `POST /calls` accepts **`command_id`** — use a
  deterministic one per (campaign, lead, attempt) for free dedupe. **SMS has none** — build it.

## 10DLC / compliance

⚠️ **Unregistered 10DLC is BLOCKED outright** since Feb 2025 — not throttled to 2/min.
Toll-free verification needs three BRN fields since 17 Feb 2026 (HTTP 400 without).
Sole-proprietor 10DLC exists now (no EIN, 1 campaign, 1 number).

## Observability

**Langfuse tracing is native and zero-instrumentation** — set `observability_settings` on the
assistant and get per-turn prompts, tool calls, latency, tokens, grouped by `conversation_id`.
Turn this on.

**Gap:** no exportable per-call MOS/jitter for PSTN via API — Portal-only.

## Competitive positioning (audit-safe)

**Do NOT say "all-in pricing"** — Telnyx unbundled; a prospect will find it.
**Do NOT say "sub-200ms"** — the independent caller-side benchmark puts Telnyx first at
**1,296 ms median**, and our p95 (1,856 ms) is worse than ElevenLabs'.
**Do NOT say "$500–$2,100/mo savings"** — audited to **$300–$1,600**.
**Do NOT say "licensed carrier in 30+ countries"** or **"BYOK supported"** — unsourceable.

**Lead with compliance-adjusted cost.** Vapi's HIPAA path is **+$3,000/mo in add-ons** and pushes
BAA negotiation onto the client — **3.6× Telnyx at 10k min/month**. That is the strongest
defensible number available.

**xAI Grok Voice Agent Builder** (launched 1 Jul 2026) is $0.05/min *genuinely* bundled + $0.01
telephony, no platform fee — **cheaper than Telnyx** with a frontier LLM. Counter on compliance:
xAI has no HIPAA, SOC 2, or PCI.

**Telnyx's honest weaknesses:** support quality complaints, 3,000+ outages logged on StatusGator
over ~4 years, no free tier, weak no-code story, thin ecosystem.

## Known code issues in this repo

| Issue | Location |
|---|---|
| `$0.09/min` hardcoded (actual ≈$0.056) — **needs a business decision, see V6.0 §7** | `telnyx-outbound-ai/index.ts:257` |
| Pacing floor allows 600 CPS vs Telnyx's 50 CPS ceiling | `voice-broadcast-engine` `calculatePacingDelay()` |
| Webhook handler covers 9 of 71 events; missing `call.cost`, `call.conversation.ended`, `call.conversation_insights.generated`, `call.transcription`, `call.recording.saved` | `telnyx-webhook/index.ts` |
| In-request event switch instead of verify-and-enqueue | `telnyx-webhook/index.ts` |
| `telnyxAdapter.ts` still a stub (17 markers) | `src/services/providers/` |
| Outbound SMS via Telnyx thin (11 refs vs 64 Twilio) | `sms-messaging`, `ai-sms-processor` |
| No Unicode→GSM-7 normalization; Telnyx **Smart Encoding** fixes this at profile level | SMS paths |
