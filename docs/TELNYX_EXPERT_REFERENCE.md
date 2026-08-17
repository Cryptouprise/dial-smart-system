# TELNYX EXPERT REFERENCE V6.0

**Refreshed 17 August 2026** for Infinite AI / CallBoss Operations.
Supersedes V1–V5 (March–April 2026). Everything below was re-verified this pass against
primary sources unless explicitly marked otherwise.

> **Read §1 before quoting anything from V5 in a client meeting.** Two of our most-used
> claims were factually wrong, and one of them is a ~38% cost error baked into live code.

---

## 0. How to research Telnyx now (this changed — read first)

The V1–V5 note "Telnyx dev docs are behind aggressive CDN bot protection (403 on direct
fetch)" is **obsolete**. Telnyx now publishes machine-readable docs that bypass the wall:

| URL | What | Size |
|---|---|---|
| `https://developers.telnyx.com/llms.txt` | Index of all LLM-readable docs | small |
| `https://developers.telnyx.com/docs/development/llms/ai-assistants-llms-full-txt` | **Complete AI Assistants doc** | 364 KB |
| `https://developers.telnyx.com/docs/development/llms/voice-tts-llms-full-txt` | Complete TTS doc | — |
| `https://developers.telnyx.com/docs/development/llms/voice-stt-llms-full-txt` | Complete STT doc | — |
| `https://telnyx.com/pricing.md` | **Every SKU, machine-readable** | 705 KB |
| `https://raw.githubusercontent.com/team-telnyx/openapi/master/openapi/spec3.json` | Full OpenAPI 3.1 spec, 863 paths | 5.8 MB |
| `https://telnyx.statuspage.io/api/v2/summary.json` | Live status, 94 components | small |

Also changed: **`telnyx.com/changelog` is a 404.** The changelog is now
`https://telnyx.com/release-notes` (tag index at `/release-notes/tag/voice-ai`).
Permalinks intermittently 404 — retry with a trailing slash; `?query=` params break the route.

WebFetch still gets throttled by the CDN after ~3 requests. Plain `curl` with a browser
user-agent returns 200 reliably.

---

## 1. CRITICAL CORRECTIONS to V1–V5

| V1–V5 claimed | Reality (Aug 2026) | Impact |
|---|---|---|
| Telnyx **$0.09/min all-in** (skill file said $0.06–$0.09) | **$0.05/min** covers orchestration + Telnyx-hosted STT + TTS. LLM (~$0.004/min) and telephony (from $0.0032/min) are **separate**. Realistic all-in **≈$0.056/min**; ≈$0.093/min with a frontier LLM. | **~38% cost overestimate.** Hardcoded at `telnyx-outbound-ai/index.ts:257`. See §7. |
| Standard AMD is **free** | **$0.002/invocation.** Premium $0.0065 (unchanged). | Per-call cost math is wrong |
| "2 msg/min unregistered US long code" | **Unregistered 10DLC is BLOCKED outright** since Feb 2025, not throttled | Capacity planning wrong; any unregistered fallback is dead |
| STT: Deepgram Nova-3/Flux, Google, **Whisper** | **Whisper and Google removed** from AI Assistant transcription models | `TelnyxAssistantEditor.tsx:893` offers an invalid option |
| ElevenLabs / Azure Neural HD resold by Telnyx | **Both are now BYO-API-key.** Telnyx no longer resells them. | Existing assistants on those voices break without an Integration Secret |
| `KokoroTTS` = lowest latency | **Telnyx Ultra** is now the recommended low-latency default (sub-100ms TTFB). ⚠️ **Ultra is REST-only — not on the TTS WebSocket.** | Wiring Ultra into a streaming path fails |
| MCPServerTool is inline `{"type":"mcp_server","url":…}` in `tools[]` | **Superseded.** MCP servers are standalone `/ai/mcp_servers` resources referenced by ID from a top-level `mcp_servers[]`. | Our documented shape no longer exists |
| `tools[]` array is how you define tools | Marked **"Deprecated for new integrations."** Use `tool_ids[]` (shared Tools Library) + `mcp_servers[]`. | — |
| Dynamic-vars webhook must respond **<1 second** | Default **1500 ms**, configurable `dynamic_variables_webhook_timeout_ms` (max 10000). On timeout the call proceeds with defaults. | We were over-constraining |
| Async webhook tools have **no timeout** | Your *backend* has no deadline, but the assistant stops waiting at `async_timeout_ms` — **default 300 ms** — then tells the LLM "Submitted." | Materially different mental model |
| Number reservations last **30 minutes** | **1 day**, extendable by one more | — |
| MMS size tiers T1/T2/T3 (1MB/600KB/300KB) | **Per-carrier × per-number-type matrix.** T-Mobile long code now 1.5MB. Safe max **600KB**. | — |
| Python `telnyx-mcp-server` | **Deprecated.** Use `telnyx-mcp` (npm) or hosted `api.telnyx.com/v2/mcp`. | — |
| Dev docs 403 behind CDN | Directly fetchable; see §0 | — |

### Still unverified — do not assert either way

- **The `Telnyx.NaturalHD.astra` silent-voice bug.** No fix note exists anywhere. But `astra`
  now appears **15 times as the canonical example voice** across current TTS docs (WebSocket
  example, REST example, the troubleshooting table, four SDK samples, a TeXML `<Say>` example).
  Telnyx would not document a silent voice as its primary example. **Circumstantially fixed —
  retest empirically before trusting it.** Note the April observation may also have been
  Ultra-over-WebSocket failing (Ultra is REST-only), not `astra` at all.
- **`POST /v2/ai/assistants/{id}/calls`** — the endpoint our 10 Apr 2026 fix made *primary*
  for `test_call` — **appears nowhere** in the 364 KB assistants doc, and `openapi.json` 404s.
  Not proven broken. Treat as unsupported; consider reverting TeXML to primary. Needs a live probe.
- **Error 10015** — no current error catalogue found. Our root cause (TeXML app ID used as a
  Call Control `connection_id`) remains architecturally sound and uncontradicted.
- **`call.conversation_insights.generated` full payload schema** — still unpublished (same gap as Feb).
- **`telnyx_conversation_id` auto-injection into MCP tools** — the string appears **zero times**
  in the 5.8 MB OpenAPI spec. Our V5 claim traces to the old inline-tool shape. **Do not depend on it.**

---

## 2. Current pricing (verified 17 Aug 2026)

Source: [pricing/voice-ai-agents](https://telnyx.com/pricing/voice-ai-agents), cross-checked
against [pricing.md](https://telnyx.com/pricing.md).

### Voice AI

| Layer | Rate | In the $0.05? |
|---|---|---|
| Voice engine | **$0.05/min** | Orchestration (turn-taking, interruption, tools, KB retrieval) **+ Telnyx-hosted STT + TTS** |
| LLM tokens | ~**$0.004/min** typical (Kimi on Telnyx GPUs) | ❌ add-on |
| Telephony | from **$0.0032/min** | ❌ add-on |
| Premium third-party voices/models | listed per-minute rates | ❌ add-on |
| KB / conversational-AI storage | **$0.006/GiB/mo** | ❌ add-on |
| **Realistic production all-in** | **≈$0.056/min** | Telnyx's own stated figure |

Bundled TTS: Telnyx Ultra, Natural, NaturalHD, Qwen3TTS, Inworld, Rime, Resemble, Murf.
Bundled STT: Deepgram models + Telnyx STT.

**Plans:** PAYG $0 (500 concurrent calls, 100 API req/s, 50 SMS/s) · Committed **$500/mo min** ·
Enterprise **$5,000/mo min**. **HIPAA is included on every plan including PAYG** — Telnyx
explicitly contrasts vendors charging ~$2,000/mo for it.

**AMD:** Standard **$0.002/invocation** · Premium **$0.0065/invocation**.

**Conversation Relay** (BYO-LLM): **$0.05/min**.
**Web Search API:** **$5 per 1,000 calls**.

> ⚠️ **Internal inconsistency in Telnyx's own `pricing.md`:** the summary block (line 100)
> lists Kimi K2.6 at `$0.95/1M input`; the detail table (line 5124) gives `$0.000665/1K` =
> `$0.665/1M`. **Use the detail table.**

> ⚠️ **Genuinely ambiguous:** `pricing.md` lists discounted "for conversational AI"
> per-character TTS and per-minute STT rates even though the pricing page says STT+TTS are
> included in the $0.05. Unclear whether these bill *on top* or are internal cost accounting.
> **Ask Telnyx before modelling margin.**

### Messaging

| Type | Outbound | Inbound |
|---|---|---|
| Local/10DLC SMS | $0.004/part | $0.004/part |
| Local/10DLC MMS | $0.015/part | $0.005/part |
| Toll-free SMS | $0.0055/part | $0.0055/part |
| Short code SMS | $0.007/part | $0.007/part |
| **RCS rich text** | **$0.0065/segment** | same |
| **RCS rich media** | **$0.016/message** | same |

Volume discounts to $0.0005/part at 1B+/mo. All + carrier fees.

> A Telnyx *resource article* claims "RCS starts at $0.20/message" — that contradicts their own
> pricing page by ~30×. Trust the table.

**10DLC fees:** brand registration $4.50 one-time · campaign review $15 · monthly by use case
(Standard $10, Low-Volume Mixed $1.50, Sole Proprietor $2, Charity $3) · T-Mobile number pool
(50+) $50. Telnyx states **no markup** on 10DLC fees. Carrier pass-through per message: T-Mobile
$0.003, AT&T $0.003, Verizon $0.0045 (SMS send).

### Numbers & new SKUs

Local from **$1.00/mo**, volume tiers to $0.25 at 5,000+. New since Feb: SMS/MMS capability
add-on **$0.10/mo per number** · Reputation monitoring **$100 MRC** · Reputation check
**$0.10/number** · Remediation **$1/number** · **Branded Calling** $50 setup + $50/mo per brand
+ **$0.075/call**.

---

## 3. TTS catalogue (rebuilt since April)

| Model | Latency | Quality | Languages | Voice source | WebSocket | REST |
|---|---|---|---|---|---|---|
| Natural | Low | Good | English | Rime Mist | ✅ | ✅ |
| NaturalHD | Low | Better | 9 | Rime Arcana | ✅ | ✅ |
| KokoroTTS | Lowest | Good | 5 | Pre-built | ✅ | ✅ |
| **Qwen3TTS** *(new)* | Medium | High | 11 | **Cloned (Voice Design)** | ✅ | ✅ |
| **Ultra** *(new)* | **Lowest** | **Highest** | **44** | Pre-built | ❌ **REST only** | ✅ |
| **Grok** *(new)* | Higher | High | 20+ | Pre-built | Voice AI only | ✅ |
| **Bayan** *(new)* | Low | Good | Arabic (13 dialects) + EN | Pre-built | ✅ | ✅ |
| **Sukhan** *(new)* | Low | Good | Urdu | Pre-built | ✅ | ✅ |

**BYO-API-key now (Telnyx no longer resells):** ElevenLabs, Azure Neural HD.
**New third-party added Apr–Jul:** Rime Coda (26 May, 184 voices, 8 languages) · Inworld
Realtime TTS 2 (16 Jun, plain-English voice direction, 100+ languages) · Fish Audio (13 Jul,
inline emotion markers `[whisper]` `[excited]` `[laugh]`, 80+ languages) · xAI Grok voices
(27 Apr: Ara, Eve, Leo, Rex, Sal) · Murf · Resemble.

**Expressive Mode** — only Telnyx Ultra and xAI Grok support it. Telnyx warns Grok+Expressive
has *higher* latency and recommends **Ultra as the low-latency default**.

Voice ID format unchanged: `Provider.Model.VoiceId` (or `Provider.VoiceId` for single-model
providers). **Dynamic Voice Selection** (24 Apr) allows mustache: `Telnyx.Ultra.{{voice_id}}`
resolved per call from the dynamic-variables webhook — **voice only**; provider/model/language
stay fixed.

Also new: **Pronunciation Dictionaries** (2 Apr) — cross-provider alias + IPA phonemes, with
**PLS import from ElevenLabs / Retell / Vapi**.

---

## 4. STT catalogue (tripled since April)

**Valid AI Assistant transcription models — this is the complete list:**

`deepgram/flux` · `deepgram/nova-3` · `deepgram/nova-2` · `azure/fast` ·
`assemblyai/universal-streaming` · `xai/grok-stt` · `nvidia/parakeet-v3`

**Whisper and Google are NOT selectable as Assistant STT models.** They still exist on the
Voice API / REST surface (`openai/whisper-large-v3-turbo`, Google `latest_long` WebSocket-only).

- **Deepgram Flux is now multilingual** (29 Apr) — 10 languages + `multi` + `auto`. Was English-only.
- **Deepgram Keyterm Prompting** (20 Apr) — up to 100 domain terms, +90% keyword recall.
- **NVIDIA Parakeet** (17 Jul) — 25 European languages. ⚠️ **Final transcripts only, endpointing
  ignored — Telnyx explicitly says do not use for agent turn-taking.**
- Added: Speechmatics (18 May), Soniox, Basira (Arabic, 30 Jun), Humain, Cohere Arabic.

Per-minute STT: Parakeet $0.0015 · Soniox $0.002 · Grok $0.0033 · Speechmatics $0.0035 ·
AssemblyAI $0.007 · Deepgram Nova-2/3/Flux $0.0074 · Telnyx STT $0.015 · Google $0.017 · Azure $0.027.

---

## 5. New capabilities since April 2026

### 5.1 Realtime WebSocket voice — no telephony (3 Aug)

The direct analogue to Twilio's Agent Connect. **Same assistant config works over WebSocket
and PSTN**, with no telephony cost for in-app voice.

```
wss://api.telnyx.com/v2/ai/assistants/{assistant_id}/conversation
Authorization: Bearer <TELNYX_API_V2_KEY>
?input_sample_rate=8000|16000|24000|44100|48000   (default 16000)
```

- **PCM16 only**, base64 inside JSON text frames — never binary WS frames. No G.711.
- Server-side VAD, turn detection, turn-taking — you build none of it.
- `conversation.item.create` injects a text turn; `response.cancel` for client barge-in.
- Output sample rate is set by the assistant voice and reported in `session.created` —
  **do not assume 24 kHz**.
- Browsers can't set WS headers → connect from a backend, or use `@telnyx/ai-agent-lib`.

Ships with a **"Migrate from OpenAI Realtime"** guide. Documented gaps vs OpenAI Realtime:
no `session.update` beyond dynamic variables, no manual turn control, no `response.create`,
no text-only output, no `conversation.item.truncate/.retrieve/.delete`, no image input, no G.711.

### 5.2 Conversation Workflows (3 Jun)

Multi-step conversations as a **directed graph** via the `conversation_flow` API. Nodes carry
their own instructions and an **append-vs-replace** instruction mode. Edges route by **LLM
natural-language conditions** *or* **deterministic variable comparisons** (account state,
channel, duration, **STIR/SHAKEN attestation**). **Per-node model, voice, and tool scoping.**
Can route out to a different assistant. Transcripts are workflow-node-aware.

⚠️ **Overlaps substantially with our `workflow-executor` and parts of `ai-autonomous-engine`.**

### 5.3 Scheduled Events — native retry

| Field | Range | Notes |
|---|---|---|
| `max_retries_client_errors` | 0–10 | **on top of** the initial attempt (3 → 4 total) |
| `retry_interval_secs` | 60–86400 | required when retries > 0 |

Retryable terminal statuses: `busy`, `no-answer`, `failed`, `canceled`. Retry clock starts when
the *previous attempt's* terminal status arrives, not from the original scheduled time.
**Phone-call only — setting these on an SMS event returns 400.** Attempt history in `call_attempts[]`.

⚠️ **Overlaps our custom retry logic** in `call-tracking-webhook` (the 17 Jan work).

### 5.4 Tools — two new types, plus a shared library

- **Invite tool** (30 Apr) — assistant pulls another participant (phone or SIP URI) into a live
  call. Enables **multi-participant calls** with speaker awareness.
- **Client-Side Tools** (7 Jul) — execute **in the browser** during a WebRTC/WebSocket
  conversation, returned as `function_call_output`. No webhook needed.
- **Tools Library** — define once at `portal.telnyx.com/#/ai/tools`, assign to any assistant by
  `tool_ids[]`. Legacy inline tools still work; migration is optional. **Fixes our per-agent
  tool duplication problem.**

Our documented list of 10 tool types is now **12**.

### 5.5 Webhook tool — materially better

```ts
interface WebhookTool {
  name: string; description: string; url: string;   // url supports {templating}
  method?: 'GET'|'POST'|'PUT'|'DELETE'|'PATCH';
  async?: boolean;
  async_timeout_ms?: number;   // platform default 300ms — assistant stops waiting here
  timeout_ms?: number;         // only when async === false
  body_parameters?: JSONSchema; query_parameters?: JSONSchema; path_parameters?: JSONSchema;
  headers?: Array<{...}>;
  store_fields_as_variables?: Array<{ /* dot-path → dynamic variable */ }>;
}
```

**`store_fields_as_variables` is new and underrated** — extracts values from your webhook
response by dot-path and binds them to dynamic variables the LLM can reference for the rest of
the call. A cleaner state channel than stuffing everything into the tool's text response.

Also new: **Filler Messages** — scripted (not LLM-generated) phrases during *synchronous*
webhook and MCP calls. `request_start` (immediate) and `request_response_delayed`
(needs `timing_ms`, 100–120,000; multiple thresholds allowed). Does not apply to async webhooks.

### 5.6 Everything else, dated

| Date | Feature |
|---|---|
| 2 Apr | Pronunciation Dictionaries (PLS import from ElevenLabs/Retell/Vapi) |
| 6 Apr | **LiveKit on Telnyx** (beta) — LiveKit agents on Telnyx GPUs, ~50% below LiveKit Cloud |
| 13 Apr | **Langfuse tracing** — native, zero instrumentation. See §6 |
| 24 Apr | Dynamic Voice Selection |
| 27 Apr | STT Playground; xAI Grok voices |
| 6 May | **Canary deployment targeting** — traffic split by caller identifier (`is one of`, `starts with`), sequential first-match-wins |
| 11 May | Ultra voices upgrade — native alphanumeric handling, context-aware heteronyms, cloned Ultra voices |
| **18 May** | **Premium AMD detects iOS Call Screening + Live Voicemail** — directly relevant to our dialer |
| 3 Jun | Conversation Workflows |
| 26 Jun | **Number Reputation** · **Branded Calling** |
| 17 Jul | NVIDIA Parakeet STT |
| 20 Jul | Custom voicemail greetings per number |
| 29 Jul | Email API (beta) |
| **3 Aug** | **Edge Compute** (Functions GA, KV GA, Object Storage GA, StatefulActor beta, CloudFS beta) |
| **10 Aug** | **AgentSDK** (`@telnyx/edge-runtime@0.9.2`, beta) |
| 12 Aug | **Web Search API** — `/v1/web_search`, `/v1/contents`, `/v1/research` |
| 14 Aug | Rate limiting for Edge Compute |

**New integrations:** Salesforce, ServiceNow, Jira, HubSpot, Zendesk, Intercom, GitHub, Greenhouse.

**AI Missions still exists** but is now driven through an **OpenClaw agent + Telnyx Missions
skill from ClawHub** — materially different from our V1–V5 description.

---

## 6. Models available Apr–Aug 2026

| Date | Models |
|---|---|
| 22 Apr | Kimi K2.6 (`moonshotai/Kimi-K2.6`) |
| 23 Jul | GPT-5.4-mini (`openai/gpt-5.4-mini`) |
| 28 Jul | Kimi K3 — 3T class, 1M context, native vision |
| 6 Aug | **GLM-5.2** (highest-ranked open-weight, 1M context) · **GPT-5.6 Luna** (cost-efficient) · **GPT-5.6 Sol** (max capability) |

LLM token rates per 1K (input / cached / output): `gpt-5.6-luna` $0.0002/$0.00002/$0.0012 ·
`minimax-m2.7` $0.00021/$0.00003/$0.0012 · `moonshot-kimi-k2.5` $0.0006/$0.0004/$0.003 ·
`qwen3` $0.0006/$0.0004/$0.002 · `openai-gpt-5.4-mini` $0.00075/$0.000075/$0.0045 ·
`anthropic-claude-haiku-4.5` $0.001/$0.0001/$0.005 · `glm-5.2` $0.001/$0.0002/$0.004 ·
`gpt-4o` $0.0025/$0.00125/$0.01 · `gpt-5.6-sol` $0.005/$0.0005/$0.03.

The assistants doc "supported language models" table lags the release notes and lists
`moonshotai/Kimi-K2.5` as **"Recommended balance of intelligence and cost."**

---

## 7. Direct implications for `dial-smart-system`

Ranked by risk. See `TELNYX_INTEGRATION_ARCHITECTURE.md` for the full build plan.

| # | Issue | Location | Action |
|---|---|---|---|
| 1 | **ElevenLabs / Azure now BYO-key** | any assistant using those voices | Audit; attach an Integration Secret via `voice_api_key_ref` (plumbing already exists from 28 Feb) |
| 2 | **Whisper offered as Assistant STT** | `TelnyxAssistantEditor.tsx:893` | ✅ **Fixed this pass** — replaced with the current 7-model list |
| 3 | **$0.09/min hardcoded** | `telnyx-outbound-ai/index.ts:257` | ⚠️ **NOT changed — needs a business decision.** See below |
| 4 | Direct-assistant-calls endpoint undocumented | `telnyx-ai-assistant` `test_call` | Probe; consider reverting TeXML to primary |
| 5 | `Telnyx.Ultra.*` over WebSocket | any streaming TTS path | REST only |
| 6 | Standard AMD is $0.002, not free | cost math | Fold into `finalize_call_cost()` |
| 7 | Native Scheduled-Event retries | `call-tracking-webhook` | Evaluate replacing custom retry logic |
| 8 | Conversation Workflows + Tools Library | `workflow-executor`, tool duplication | Evaluate |
| 9 | Premium AMD iOS Call Screening | dispositioning | New signal we don't consume |

### ⚠️ Why the $0.09 constant was NOT changed

```js
// telnyx-outbound-ai/index.ts:256
// Telnyx is $0.09/min = 9 cents/min
const costPerMinuteCents = 9;
```

This feeds both the insufficient-credits gate and the reservation amount. It is wrong, but the
*correct* value depends on a business decision we should not make silently:

- The Retell path (`outbound-calling:964`) reserves `check.cost_per_minute_cents || 15` — the
  **customer price**.
- The Telnyx path reserves `9` — the **raw Telnyx cost**.

These are inconsistent. Lowering 9 → 6 makes the Telnyx path reserve even *less* than what the
customer will actually be charged. The real question is whether reservations should hold cost
or price. **Decide, then fix both paths together.**

Current behaviour is bounded: it over-reserves relative to true cost (blocking calls from orgs
that could afford them, and inflating held credit during concurrency), but `finalize_call_cost()`
still deducts actual at settlement, so nobody is over-billed.

---

## 8. Competitive battle cards — REWRITTEN

The V4 cards were written to sell Telnyx and no longer survive scrutiny. This version is
audit-safe.

### 8.1 The framing that now works

**Do not lead with "all-in pricing."** Telnyx unbundled; $0.05/min is orchestration + STT + TTS
with LLM and telephony separate. That is structurally the same unbundling the old cards attacked
Vapi and Retell for. A prospect who opens the pricing page mid-meeting will find it.

**Lead with compliance-adjusted cost.** That position is defensible and unique.

### 8.2 True all-in @ 10,000 min/month

Assumptions: mid-tier production config, GPT-4.1-class LLM (~$0.04–0.045/min), standard platform
TTS, US domestic telephony included, PAYG list rates.

| Vendor | $/min all-in | Monthly | Note |
|---|---:|---:|---|
| **Telnyx** (Telnyx-hosted model) | $0.057 | **$572** | |
| **xAI Grok** *(new)* | $0.060 | **$600** | genuinely bundled |
| **Telnyx** (frontier LLM) | $0.093 | **$932** | realistic client config |
| Twilio ConversationRelay | $0.124 | $1,240 | transport only, BYO LLM |
| Retell AI (mid) | $0.130 | $1,300 | |
| Vapi (mid) | $0.134 | $1,340 | |
| ElevenLabs (Scale) | $0.134 | $1,340 | |
| Bland AI (Build) | $0.150 | $1,499 | genuinely bundled |
| Retell (premium) | $0.270 | $2,700 | ElevenLabs + GPT-5.5 |
| Synthflow | ≥$0.250 | ≥$2,500 | enterprise floor |
| **Vapi + HIPAA** | **$0.334** | **$3,340** | +$2,000 HIPAA +$1,000 ZDR |

### 8.3 ❌ Retired claims

- **"$500–$2,100/month savings vs every competitor."** Recomputed: **$300–$1,600**. Only
  Synthflow clears $1,500. And **xAI Grok is cheaper than Telnyx** with a frontier LLM.
  Replacement: *"$300–$1,600/month cheaper than mainstream competitors at 10,000 min/month,
  and the gap widens sharply for HIPAA workloads."*
- **"Licensed carrier in 30+ countries."** Unsourceable. Telnyx materials cite 140+ countries
  for numbers, 80+ for local calling, 45+ for voice AI, 17 PoPs — no licensed-carrier count
  anywhere. **Stop quoting a number.**
- **"BYOK supported."** Not confirmed on any official page.
- **"Sub-200ms."** See §8.4.

### 8.4 Latency — three incompatible measurement regimes

Independent caller-side benchmark (openbenchmarks.com, 2026; dual-channel recording, Silero VAD,
2,078 usable turns, public code; **operator not identified — credible but unattributed**):

| Rank | Platform | Median TTFAB | p95 |
|---|---|---|---|
| 1 | **Telnyx** | **1,296 ms** | 1,856 ms |
| 2 | ElevenLabs | 1,424 ms | **1,768 ms** |
| 3 | Bland AI | 1,520 ms | 2,248 ms |
| 4 | Vapi | 1,558 ms | 2,008 ms |
| 5 | Retell AI | 1,740 ms | 2,259 ms |

Telnyx wins — but the honest number is **~1.3 seconds, not "sub-200ms."** The benchmark
quantifies the gap: vendor self-reports run **~490 ms optimistic** because they measure
server-side. **Our p95 is worse than ElevenLabs' — do not claim tail-latency superiority.**

**Safe framing:** *"In the one independent caller-side benchmark published in 2026, Telnyx has
the lowest median turn latency of five platforms tested — 1,296ms vs 1,424–1,740ms. Vendor-published
figures in this category, ours included, are server-side and read roughly 490ms optimistic."*

### 8.5 Compliance — our strongest ground

| Vendor | HIPAA/BAA | SOC 2 | PCI | Note |
|---|---|---|---|---|
| **Telnyx** | ✅ incl. PAYG | ✅ II | ✅ | + ISO 27001, GDPR, EU infra. One footprint across telephony + AI |
| Retell | ✅ self-serve BAA | ✅ I+II | — | PII redaction, RBAC, SSO on all plans free. Best compliance *value* |
| ElevenLabs | ✅ Enterprise only | ✅ II | ✅ **L1** | + FedRAMP, AIUC-1. Broadest set, gated |
| Bland | ✅ standard paid | — | — | |
| Vapi | ⚠️ **+$2,000/mo** | ✅ II | — | ZDR +$1,000. **Requires separate BAAs with every stack provider** |
| Twilio | ✅ | ✅ | ✅ | You self-host the agent — its compliance burden is yours |
| **xAI Grok** | ❌ | ❌ | ❌ | Beta. **Disqualified for healthcare/finance — our main defence** |

**Sharpest number in the deck:** Vapi's HIPAA path costs **$3,000/mo in add-ons** *and* pushes
BAA negotiation with every sub-provider onto the client. At 10k min that's **3.6× Telnyx**.

### 8.6 Honest weaknesses (know these before a prospect raises them)

1. **Support is the recurring complaint**, with a specific documented loop: each agent requests
   fresh test-call samples within 24–48h, takes days to respond, logs "expire," cycle restarts.
   Reports of AI-generated support replies.
2. **Reliability history isn't spotless** — StatusGator logs **3,000+ outages** affecting Telnyx
   users over ~4 years. The "99.999%" line dies on contact with a status aggregator.
3. **Weak no-code story.** Vapi has a click-to-build dashboard; xAI ships a live agent in ~2
   minutes. Edge Compute makes this *worse* short-term — more power for engineers, not less work
   for non-engineers.
4. **No free tier.** Trial credits only. Every major competitor lets a prospect kick tyres at $0.
5. **Thin ecosystem** — fewer StackOverflow answers, community integrations, tutorials.
6. **Plan floors are public** — $500/mo committed, $5,000/mo enterprise.
7. **No longer the price leader** (xAI).
8. **Latency lead is modest** — 9% over ElevenLabs, and worse at p95.

### 8.7 Where competitors genuinely win

**Vapi** — Amazon Ring picked them over 40 vendors, routes 100% of inbound through them. $50M
Series B at ~$500M (12 May 2026), 1B+ cumulative calls. "Nobody gets fired for buying Vapi" is
now true. · **Retell** — best compliance value; ~$50M ARR on $5.1M raised; Retell Assure
(automated voice-AI QA) productised a real gap. · **Bland** — the only major vendor with
*genuinely* bundled per-minute pricing including LLM tokens. Trivial to quote. · **Twilio** —
unmatched channel breadth (Voice/SMS/chat/WhatsApp/RCS, unified callbacks); if the client is
already on Twilio, migration cost usually beats our per-minute delta. · **ElevenLabs** — best
voice quality, broadest certifications (FedRAMP, PCI L1, AIUC-1). · **Synthflow** — enterprise
only now ($30k/yr floor), bundles delivery. · **xAI Grok** — cheapest genuine bundle, no platform
fee, agent live in ~2 min. Wins on speed-to-demo, loses instantly on compliance.

### 8.8 Market shifts to exploit

- **Synthflow closed self-serve entirely** (Enterprise from $30,000/yr). Their stranded SMB
  customers are the highest-intent prospect list available right now.
- **Twilio retired no-code AI Assistants** (July 2026) and repositioned to SDK/infrastructure
  (Agent Connect GA 6 May 2026). Twilio is no longer a no-code competitor.

**The honest pitch:** Telnyx is the only vendor combining the lowest independently-measured
caller-side latency, full-stack carrier ownership, and HIPAA+SOC2+PCI+ISO under one footprint
with **no compliance surcharge**. It is *not* the cheapest and *not* the easiest to start with.
Sell it to engineering-capable buyers in regulated industries at scale.

---

## Changelog

- **V1.0–V4.0** (March 2026): 41 sections, initial platform reference through competitive cards
- **V5.0** (April 2026): async tools & Add Messages API, developer portal index
- **V6.0** (17 August 2026): Full re-verification against primary sources. Corrected the
  pricing model ($0.09 → ~$0.056 all-in), AMD cost, STT/TTS catalogues, MCP tool shape,
  dynamic-vars timeout, async timeout semantics. Added: realtime WebSocket voice, Conversation
  Workflows, Tools Library, Invite + Client-Side tools, Scheduled-Event retries, Edge Compute +
  AgentSDK, Web Search API, Conversation Relay. Rewrote competitive battle cards after auditing
  every claim — retired two false ones and added xAI Grok as a new price leader. Added §0
  (machine-readable doc endpoints) and a companion `TELNYX_INTEGRATION_ARCHITECTURE.md`.
