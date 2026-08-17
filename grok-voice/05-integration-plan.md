# 05 — Integration Plan for `dial-smart-system`

A phased plan that front-loads the wins and defers the risky part until an open question is answered.

**Nothing here is built.** This is a plan, not a changelog.

---

## Phase 0 — Answer the blocking question (do this first, costs nothing)

Before scoping any voice-agent work, get a definitive answer from xAI on:

1. **Native outbound origination.** Is there an API to originate a call, or is bridging the only path? The docs mention `CreatePhoneNumberV2` without publishing its schema — there may be more surface than is public.
2. **Concurrency ceiling.** Can the 100-session cap be raised? Our peak outbound need is ~150+ concurrent.
3. **API number provisioning.** Console-only today. On the roadmap?
4. **Custom voice pricing.** Undocumented; needed before any white-label quote.
5. **`reasoning.effort` billing.** Does `"none"` change the rate?

**These five answers determine whether Phase 3 is worth scoping at all.** Phases 1 and 2 are worth doing regardless.

---

## Phase 1 — Grok STT for post-call analysis ⭐ Start here

**Why first:** highest ROI, zero call-path risk, independent of every open question above. Ships alone.

$0.10/hr with word-level timestamps, multichannel, and speaker diarization.

**Changes:**
- New edge function `grok-stt` — wraps `POST https://api.x.ai/v1/stt`, takes a recording URL, returns diarized transcript + word timings
- `analyze-call-transcript` — accept a diarized transcript as an alternative input to the flat Retell/Telnyx transcript
- New nullable columns on `call_logs`: `diarized_transcript` (jsonb), `word_timestamps` (jsonb), `transcription_provider` (text)
- New secret: `XAI_API_KEY`

**What it unlocks:**
- `extract_opener_from_transcript` becomes reliable — diarization means we know the agent's first utterance exactly, instead of inferring it
- `calculate_time_wasted_score` gets real talk-time ratios instead of estimates
- `opener_analytics` / `top_openers` quality jumps
- `lead_intent_signals` LLM extraction gets cleaner input
- Transfer detection gets clean segment boundaries

**Risk:** none to live calls. Runs entirely post-call, async.
**Cost to validate:** ~$25 to reprocess an entire 5,000-call campaign.

---

## Phase 2 — Grok TTS for voice broadcasts

**Why second:** also off the live-conversation path, and the expressive tags are a genuine quality upgrade over flat ElevenLabs output.

$15.00/1M chars. Inline `[pause]`, `[breath]`, `[laugh]`; wrapping `<soft>`, `<slow>`, `<whisper>`.

**Changes:**
- New edge function `grok-tts` (or add a provider branch inside `elevenlabs-tts`)
- `voice-broadcast-engine` — provider selection for audio generation
- Store generated audio in Supabase storage, same as today; `audio_url` contract unchanged
- Support μ-law 8k output directly so no transcoding is needed for Twilio playback

**What it unlocks:**
- Broadcast drops that sound human — `[breath]` before a sentence and `<soft>` on a closing line kills a lot of the robot tell
- Character-level timestamps if we ever want captioned/synced playback
- Per-client cloned voices for white-label (pending pricing from Phase 0)

**Risk:** low. Audio is generated and reviewed before a campaign ships. A bad take never reaches a prospect.

---

## Phase 3 — Grok Voice Agent as a third provider

**Only scope this after Phase 0 answers land.** Gate on outbound origination + concurrency.

Follow the exact pattern established by the Telnyx integration (Feb 23, 2026): **100% additive, zero breaking changes to Retell.**

### Provider routing

`call_logs.provider` already exists (`retell` / `telnyx` / `twilio`, default `retell`). Add `grok`.

`outbound-calling` already branches on `provider`. Add a Grok branch alongside the Retell and Telnyx paths — do not touch either.

### Scope inbound first

Grok's SIP model is inbound-native. Start where it fits:

- Inbound callbacks from broadcast drops
- Inbound response to SMS campaigns
- Warm-transfer target
- After-hours / overflow

This gets real production audio through Grok — proving or disproving the latency and prosody claims — without touching `call-dispatcher`, the dialing queue, pacing, or retry logic.

### New tables (mirroring `telnyx_assistants`)

| Table | Purpose |
|---|---|
| `grok_agents` | Agent config: instructions, voice, VAD tuning, tools, reasoning effort |
| `grok_call_sessions` | Maps xAI `call_id` ↔ our `call_logs.id` ↔ carrier call ID |
| `grok_settings` | Per-user config: API key status, default voice, default VAD profile |

New `call_logs` columns: `grok_call_id`, `grok_conversation_id`, `grok_agent_id`.

### New edge functions

| Function | Purpose |
|---|---|
| `grok-voice-webhook` | Handles `realtime.call.incoming`, verifies signature, opens the WebSocket, drives the session |
| `grok-agent-management` | CRUD for agents, voice list via `GET /v1/tts/voices`, test call |
| `grok-outbound` | Bridge-based outbound (Phase 3b, gated on Phase 0) |

> ⚠️ **Edge function runtime constraint.** Supabase edge functions are request/response. A 30-minute WebSocket session held open by a Deno function is not the pattern they're built for. `grok-voice-webhook` needs to either (a) hold the socket for the call duration and accept the runtime limits, or (b) hand off to a persistent worker. **Validate this early** — it may be the real architectural blocker, more than anything in the xAI API. Retell and Telnyx both avoid this by managing the media session themselves and calling us back over HTTP; Grok makes *us* hold the socket. That is a genuinely different operational model and it deserves a spike before anything else in Phase 3 is scoped.

### Wire the existing MCP server ⭐

This is the most interesting piece. We already ship an OAuth-protected MCP server (`src/lib/mcp`, `mcp` edge function) exposing account summary, campaigns, lead search, recent calls, and phone-number health.

Grok Voice accepts remote MCP servers directly in session config:

```json
{
  "type": "mcp",
  "server_url": "https://emonjusymdripmkvtttc.supabase.co/functions/v1/mcp",
  "server_label": "dial-smart",
  "allowed_tools": ["search_leads", "recent_calls"],
  "authorization": "Bearer <scoped-token>"
}
```

The agent can then look up a lead's history **mid-call, server-side, with no webhook round-trip.** With Retell every tool call is an HTTP hop out to an edge function and back. This removes that entirely.

Scope the token tightly — read-only tools only, never campaign dispatch.

### Reuse what already works

- **Compliance disclosures** → `force_message` with `interruptible: false`. Better than what we have now: legally verbatim, model can't paraphrase it.
- **Keyterms** → populate from lead data (name, company, city) the same place we build `retell_llm_dynamic_variables`
- **VAD tuning** → per-campaign config, same as `calls_per_minute`
- **Transfer** → SIP REFER. Simpler than the two-signal detection in `retell-call-webhook`, because we initiate it and therefore know it happened.
- **AMD** → stays at the carrier. Don't bridge machines into a paid Grok session.
- **Credit system** → one `pricing_tiers` row at 8¢/min flat; `agent_pricing` markup works unchanged.

### Dashboard

New `GrokVoiceManager.tsx` under AI & Automation, mirroring `TelnyxAIManager.tsx`. Tabs: Agents, Voices, Sessions, Settings.

---

## Explicitly out of scope

- **Replacing Retell or Telnyx.** Both work. This is additive or it's nothing.
- **Voice Agent Builder.** It's a competitor to our product, not a component of it.
- **Outbound predictive dialing on Grok at scale.** Blocked on the 100-session cap and outbound origination. Revisit after Phase 0.

---

## Sequencing summary

| Phase | Depends on | Risk | Value |
|---|---|---|---|
| 0 — Ask xAI the five questions | — | none | Unblocks everything |
| 1 — STT for post-call | Phase 0 not required | none | **High** |
| 2 — TTS for broadcasts | Phase 0 (custom voice pricing) | low | Medium |
| 3a — Inbound voice agent | Phase 0 + edge runtime spike | medium | Medium — mainly learning |
| 3b — Outbound bridged | Phase 3a + concurrency answer | **high** | Unproven |

**Do Phase 1 now.** It's cheap, it's isolated, it improves analytics we already depend on, and it puts an `XAI_API_KEY` in the project so everything downstream is easier.
