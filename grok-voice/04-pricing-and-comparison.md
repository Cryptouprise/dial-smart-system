# 04 — Pricing & Competitive Comparison

---

## ⚠️ Correct the number you've probably seen

Nearly every article about Grok Voice quotes **$0.05/min**. That rate belongs to `grok-voice-think-fast-1.0`, which is **deprecated**.

`grok-voice-latest` moved to **2.0 on August 5, 2026**. Current rate: **$0.08/min ($4.80/hr)** — a 60% increase.

| Model | Status | Audio | Text input |
|---|---|---|---|
| `grok-voice-think-fast-2.0` | **Current** | **$0.08/min** ($4.80/hr) | $0.004 |
| `grok-voice-think-fast-1.0` | Deprecated | $0.05/min ($3.00/hr) | $0.004 |

Anything published before Aug 5, 2026 — including the Voice Agent Builder marketing at "$0.05/min + $0.01 telephony = ~$0.06 all-in" — is quoting the old rate. **Budget $0.08.**

### Full xAI voice price list

| Product | Price |
|---|---|
| Speech to Speech (2.0) | $0.08 / min audio + $0.004 / text input |
| Speech to Text — REST | **$0.10 / hr** |
| Speech to Text — streaming | $0.20 / hr |
| Text to Speech | $15.00 / 1M chars |
| Custom voices | Not documented — verify before quoting clients |

---

## Real per-minute math for our stack

### Inbound (native SIP — the clean path)

| Component | Cost/min |
|---|---|
| Telnyx inbound DID termination | ~$0.005 |
| Grok Voice 2.0 | $0.080 |
| **Total** | **~$0.085** |

### Outbound (bridged — see [03](./03-telephony-sip.md#-the-outbound-problem))

| Component | Cost/min |
|---|---|
| Telnyx outbound origination to prospect | $0.009 |
| Telnyx → xAI SIP termination leg | ~$0.005 |
| Grok Voice 2.0 | $0.080 |
| **Total** | **~$0.094** |
| Telnyx premium AMD (per call, not per min) | $0.0065/call |

> The bridge costs about a half cent a minute. Not the reason to avoid the bridge — latency and operational complexity are. But it does erase the "cheaper than Telnyx" pitch: at ~$0.094 vs Telnyx AI at $0.09, **outbound Grok is a wash on cost.** Any case for it has to be made on quality and latency, not price.

---

## Head to head

All-in cost per talk-minute, typical production config:

| Platform | All-in $/min | Model swappable? | Native AMD | Concurrency | Notes |
|---|---|---|---|---|---|
| **Grok Voice 2.0** | **$0.085 – $0.094** | ❌ No | ❌ No | **100 sessions** | Unified S2S. Lowest latency class. Native web/X/MCP/file search. |
| **Telnyx AI** (ours) | ~$0.09 | ⚠️ Limited | ✅ Yes (97% premium) | Higher | Owns carrier→GPU. Already integrated. |
| **Retell** (ours) | $0.13 – $0.31 | ✅ Yes | Via carrier | Higher | Cascade. $0.07 base is misleading — LLM/STT/TTS/telephony all extra. Enterprise ~$0.05+. |
| **OpenAI Realtime** (`gpt-realtime-2.1`) | $0.06 – $0.11 cached<br>$0.18 – $0.46 uncached | ❌ No | ❌ No | — | Token-billed ($32/$64 per 1M audio in/out), not per-minute. **Caching discipline determines whether it's cheap or brutal.** Mini: $0.02–$0.05. |
| **ElevenLabs Agents** | $0.08 – $0.24 | ✅ Yes | ❌ No | — | Best-in-class voice quality. Cascade. |
| **Vapi** | $0.08 – $0.15 + telephony | ✅ Yes (BYO keys) | ❌ No | — | $0.05 orchestration fee + your own STT/LLM/TTS bills. |
| **Bland** | ~$0.09 advertised | ❌ No | — | — | |

**Market reality check:** all-in costs span ~$0.07 on aggressive self-serve to ~$0.35 on premium/enterprise — a 5× spread. Every platform's headline number excludes something. Grok's $0.08 is unusually honest by comparison: it bundles model, voices, retrieval, tools, and guardrails, with only telephony outside the meter.

---

## Where Grok actually wins on cost

Not on the voice agent. **On speech-to-text.**

**$0.10/hr REST transcription** is roughly an order of magnitude below typical STT pricing, and it includes word-level timestamps, multichannel, and speaker diarization across 25 languages.

Applied to our post-call pipeline:

| Workload | Volume | Cost |
|---|---|---|
| Test 1.18 campaign (5,000 calls @ 3 min avg) | 250 hours | **$25.00** |
| Every call, 100k calls/month @ 3 min | 5,000 hours | **$500/month** |

For $25 we could transcribe an entire campaign with diarization and word timings, which would materially sharpen:
- `analyze-call-transcript` opener extraction (`extract_opener_from_transcript`)
- `opener_analytics` / `top_openers` — diarization means we can isolate *who spoke first and for how long* instead of regexing a merged transcript
- `calculate_time_wasted_score` — word timestamps give real talk-time ratios
- Two-signal transfer detection — cleaner segment boundaries
- `lead_intent_signals` extraction quality

**This is the highest-ROI, lowest-risk item in the entire Grok surface.** It touches no call path, breaks nothing, needs no SIP work, and can ship independently of any voice-agent decision.

---

## White-label credit system impact

Our `organization_credits` model tracks `cost_per_minute_cents` (our cost) and `retell_cost_per_minute_cents`, with margin computed per transaction in `finalize_call_cost()`.

| Provider | Our cost/min | Customer price | Margin |
|---|---|---|---|
| Retell (typical) | $0.13 | $0.15 | 15% |
| Retell (enterprise) | $0.07 | $0.15 | 114% |
| Telnyx | $0.09 | $0.15 | 67% |
| **Grok Voice (inbound)** | **$0.085** | $0.15 | **76%** |
| **Grok Voice (outbound bridged)** | **$0.094** | $0.15 | **60%** |

Grok sits between Telnyx and enterprise Retell. **It does not unlock a new margin tier** — the enterprise Retell rate still beats it. The credit system's per-agent pricing (`agent_pricing`, `calculate_agent_base_cost()`) would need a Grok row, but no structural change: Grok is simpler than Retell to price because there are no separate LLM/voice/telephony components to sum. One flat rate.

> If we do integrate, add a `pricing_tiers` row for Grok Voice at 8¢/min flat and let `agent_pricing` markup work unchanged.

---

## Cost verdict

**Grok Voice is not a cost play for us.** Telnyx already put us at $0.09/min. Grok lands at $0.085–$0.094 — inside the noise.

The case for Grok is **latency, prosody, and native tool use (especially MCP)**. The case against is **no LLM swap, no AMD, no API number provisioning, no documented outbound origination, and a 100-session cap.**

The case for Grok **STT** is unambiguous and independent: $0.10/hr with diarization is a straight win, ship it separately.
