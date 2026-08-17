# 06 — Verdict, Limitations & Gotchas

---

## Where Grok Voice is genuinely strong

**1. Latency.** Unified speech-to-speech eliminates the STT→LLM→TTS hop chain. Sub-second, and structurally so — not through optimization but through architecture. In sales, response latency reads as competence; a 900ms cascade gap is the single most common "this is a robot" tell.

**2. Prosody survives.** A cascade destroys tone at the STT boundary — the LLM sees flat text and never knows the prospect sighed. A unified model hears it. For qualification and objection handling this is a real, hard-to-replicate advantage, and it's the thing most likely to show up in conversion numbers rather than benchmark charts.

**3. Native server-side tools.** Web search, X search, collections/file search, and remote MCP all run inside the audio loop with no client round-trip. **X search has no equivalent anywhere else.**

**4. Remote MCP support.** We already have an MCP server deployed. A Grok agent can consume it directly, mid-call. That's the cleanest tool integration story of any platform we've evaluated.

**5. `force_message`.** Deterministic, non-interruptible, no-inference utterances. Purpose-built for compliance disclosures. Materially better than pre-pending TTS and hoping the model doesn't talk over it.

**6. STT pricing.** $0.10/hr with diarization and word timestamps is roughly an order of magnitude below market.

**7. OpenAI Realtime compatibility.** Cheap to trial, cheap to abandon. Build against the OpenAI event shape with a thin adapter and you get `gpt-realtime` as a fallback for free.

**8. Enterprise compliance.** SOC 2 Type II, HIPAA-eligible, GDPR, multi-region. Removes the standard procurement objection.

---

## Where it's weak

**1. No LLM swap.** Unified model means one model. No cheaper tier for simple flows, no smarter tier for hard ones, no fallback when xAI has an incident. Our `agent_pricing` system is built around per-model cost variance that simply doesn't exist here. Single point of failure with no hedge inside the vendor.

**2. No native AMD.** Nothing in the voice docs mentions answering-machine detection. Telnyx gives us ML-based AMD at the telephony layer (97% premium). Grok gives us nothing — AMD stays at the carrier. Workable, but it's a capability regression relative to Telnyx if you were imagining Grok as a full replacement.

**3. No documented outbound origination.** Inbound-first SIP. For a platform that is overwhelmingly outbound, this is the structural blocker. Bridge workaround exists ([03](./03-telephony-sip.md#-the-outbound-problem)) at ~$0.005/min and added connect latency.

**4. No API number provisioning.** Console only. Breaks programmatic number-pool management, which matters a lot for white-label.

**5. 100 concurrent sessions per team.** Our `voice-broadcast-engine` targets 100 concurrent calls; Test 1.18 runs 50 calls/min against 5,000 leads, implying ~150 steady-state concurrent sessions at a 3-min AHT. **Grok cannot carry our peak outbound load today.** Hard ceiling until negotiated.

**6. 30-minute max session.** Fine for sales calls. Not fine for long support sessions.

**7. We hold the WebSocket.** Retell and Telnyx manage the media session and call us back over HTTP. Grok makes *us* hold a socket for the call duration. Supabase edge functions are request/response — this may be the real architectural blocker, more than anything in the xAI API itself. Spike it before scoping.

**8. Short production track record.** API launched December 2025. The cascade pattern has years of hardening.

**9. Reduced per-stage observability.** No inspectable intermediate text. Transcripts are a side channel, not the ground truth the model reasoned over. Harder to debug "why did it say that."

**10. The Builder is a competitor.** Not a component. Worth watching as signal on xAI's direction.

---

## Gotchas — the list to keep

| # | Gotcha |
|---|---|
| 1 | **$0.05/min is stale.** Current rate is **$0.08/min** (2.0, as of Aug 5 2026). Every blog quoting $0.05 predates the alias move. |
| 2 | **Pin the model.** `grok-voice-latest` moved 1.0→2.0 and re-priced 60% higher. Don't point production at a moving alias. |
| 3 | **LiveKit's plugin defaults to the deprecated 1.0.** Override `model` explicitly. |
| 4 | **`threshold: 0.85` default is too high for PSTN.** Tuned for a quiet room. Start at 0.5–0.6 on phone audio — LiveKit's own default is 0.5. |
| 5 | **Match audio formats end to end.** μ-law 8k on SIP legs. Mismatched rates mean silent resampling: latency and quality loss for nothing. |
| 6 | **Parallel tool calls:** do not send `response.create` until *every* function output is submitted. Sending early truncates the rest. |
| 7 | **After `force_message`, do NOT send `response.create`.** The force message is the turn. |
| 8 | **Transcription event is `.updated`, not `.delta`.** Differs from OpenAI Realtime — the #1 porting bug. |
| 9 | **The SIP signing secret is shown exactly once.** No recovery. Store it on creation. |
| 10 | **DTMF events are SIP-only.** Not available on direct WebSocket sessions. |
| 11 | **DTMF auto-flushes after 2.5s** and is not documented as configurable. Use `#`-terminated prompts for faster IVR. |
| 12 | **Ephemeral tokens for anything client-side.** Browsers can't set WS headers — token goes in the subprotocol field prefixed `xai-client-secret.`. |
| 13 | **Resumption doesn't extend the 30-min cap.** It preserves context across reconnects, nothing more. History expires after 30 min idle. |
| 14 | **LiveKit provider tools (XSearch/WebSearch/FileSearch) are Python-only.** Not in the Node plugin. |
| 15 | **`reasoning.effort: "none"` is probably right for scripted dialing.** Default `"high"` costs latency you aren't using. Billing impact undocumented. |
| 16 | **"HIPAA eligible" ≠ HIPAA covered.** Requires a signed BAA. |
| 17 | **Don't hardcode the voice roster.** Fetch `GET /v1/tts/voices`. Docs only name `eve`, `ara`, `rex`. |

---

## The verdict

**For `dial-smart-system` specifically:**

Grok Voice is **not a Retell or Telnyx replacement**, and it isn't close to one. It cannot originate outbound calls natively, it caps at 100 concurrent sessions against our ~150 peak, it has no AMD, and it requires us to hold a WebSocket that our edge-function runtime isn't shaped for. Any of those alone would rule out a swap; together they settle it.

It is, however, **worth a real pilot as a third provider** — and the reason is latency and prosody, not price. At ~$0.09/min all-in it's a wash against Telnyx. What it might buy is calls that sound meaningfully more human, and a tool-use path (direct MCP, mid-call, server-side) that's cleaner than anything else on the market. Both are worth finding out about on real traffic.

**Do this:**

1. **Ship Grok STT now** (Phase 1). $0.10/hr with diarization, zero call-path risk, immediately improves opener analytics and intent extraction we already depend on. ~$25 to reprocess a full campaign. This is not a close call.
2. **Ask xAI the five Phase 0 questions.** Outbound origination and the concurrency cap decide whether the voice agent is ever more than an inbound specialist.
3. **Spike the WebSocket-in-edge-function problem** before scoping any voice-agent work. It may be the actual blocker.
4. **Pilot the voice agent inbound-only** — callbacks, SMS responses, transfer target, after-hours. Native fit, no dispatcher changes, real audio through the model.
5. **Keep Retell and Telnyx.** Additive or nothing, exactly like the Telnyx integration.

**What would change this assessment:** native outbound origination + a concurrency cap above ~500. With both, Grok becomes a serious primary-provider candidate on latency alone. Without them, it's an inbound specialist and an excellent STT vendor.

---

## Watch list

- Native outbound origination
- Concurrency cap increases
- API number provisioning
- Native AMD
- Custom voice pricing
- Whether `grok-voice-think-fast-3.0` re-prices again (the 1.0→2.0 move was +60%)
- Voice Agent Builder feature velocity — it's the competitive signal
