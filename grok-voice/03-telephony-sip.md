# 03 — Telephony & SIP

How Grok Voice connects to real phone calls, and the specific problem it creates for an outbound dialer.

---

## The architecture

```
PSTN ──► Your carrier (Twilio / Telnyx / Plivo) ──SIP/TLS──► sip.voice.x.ai
                                                                   │
                                          xAI fires realtime.call.incoming webhook
                                                                   │
                                                                   ▼
                                                        Your webhook handler
                                                                   │
                                    wss://api.x.ai/v1/realtime?call_id={call_id}
```

Key insight: **xAI does not become your carrier.** You keep Twilio/Telnyx for numbers, PSTN termination, and billing. xAI is a SIP endpoint you bridge audio into. This is architecturally similar to how Retell works, and it means our existing `phone_numbers` table, rotation logic, and number-health tracking all stay relevant.

---

## Number provisioning

Two paths:

**1. BYO trunk (`origin: "byo_trunk"`)** — our path. You own the number at Twilio/Telnyx, you register it with xAI, you route SIP to `sip.voice.x.ai`.

**2. xAI-provisioned** — every account gets a free number for testing. **Not available via API** — console only. Fine for dev, useless for a system that rotates through 12+ numbers programmatically.

> ⚠️ **No API number provisioning is a real constraint.** Our `phone_numbers` inventory is managed programmatically (Twilio MCP purchases, `provider-management` edge function). Grok numbers would be a manual console step, or BYO-trunk registration per number. For 12 Retell numbers that's tolerable; for a scaled white-label deployment where each client gets their own pool, it's a bottleneck.

### Registering a BYO number

Requires:
- `origin: "byo_trunk"`
- One SIP auth method — digest credentials **or** allowed IP addresses
- A webhook URL for incoming-call events

Returns a **signing secret, shown exactly once.** Store it immediately (Supabase secrets). There is no recovery.

---

## Inbound call flow

### 1. Webhook fires

```json
{
  "object": "event",
  "id": "evt_123",
  "type": "realtime.call.incoming",
  "created_at": 1750000000,
  "data": {
    "call_id": "00000000-0000-0000-0000-000000000000",
    "sip_headers": [
      { "name": "From", "value": "+14155550100" },
      { "name": "To",   "value": "+18005550199" }
    ],
    "metadata": {}
  }
}
```

Verify `webhook-id`, `webhook-timestamp`, `webhook-signature` against the stored signing secret. (Standard Svix-style webhook signing.)

### 2. Open the WebSocket with `call_id`

```python
async with websockets.connect(
    f"wss://api.x.ai/v1/realtime?call_id={call_id}",
    additional_headers={"Authorization": f"Bearer {os.environ['XAI_API_KEY']}"},
) as ws:
    await ws.send(json.dumps({
        "type": "session.update",
        "session": {
            "voice": "eve",
            "instructions": "You are a helpful phone support agent.",
            "turn_detection": {"type": "server_vad"},
        },
    }))
    await ws.send(json.dumps({"type": "response.create"}))
```

```javascript
const ws = new WebSocket(`wss://api.x.ai/v1/realtime?call_id=${callId}`, {
  headers: { Authorization: `Bearer ${process.env.XAI_API_KEY}` },
});
ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      voice: "eve",
      instructions: "You are a helpful phone support agent.",
      turn_detection: { type: "server_vad" },
    },
  }));
  ws.send(JSON.stringify({ type: "response.create" }));
});
```

Note the `response.create` — on a SIP call the agent speaks first, so you trigger the opening turn explicitly.

---

## Call control

**Transfer (SIP REFER):**
```bash
curl -X POST "https://api.x.ai/v1/realtime/calls/$CALL_ID/refer" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_uri": "sip:agent@example.com"}'
```

**Hangup:**
```bash
curl -X POST "https://api.x.ai/v1/realtime/calls/$CALL_ID/hangup" \
  -H "Authorization: Bearer $XAI_API_KEY"
```

> **Transfer is SIP REFER only.** There's no documented warm-transfer-with-whisper primitive, and no documented Ringba-style payload attachment. Our `retell-call-webhook` two-signal transfer detection (`detectTransferToolFired()` + `detectTransferTranscriptSignal()`) has no direct equivalent here — but it also isn't needed, because with REFER *we* initiate the transfer, so we know definitively that it happened. That's actually cleaner than inferring it from Retell's disconnection reason.
>
> For transfer context handoff, use `force_message` to announce, then REFER. Context passing to the receiving agent has to happen out-of-band (our own webhook to the agent's screen-pop), same as today.

---

## DTMF

Digits buffer and flush to the model when:
- User presses `#`
- 2.5s idle after a keypress
- User starts speaking

Audit event (SIP sessions only — **not** available on direct WebSocket sessions):
```json
{
  "type": "input_audio_buffer.dtmf_event_received",
  "event": "5",
  "received_at": 1730000000
}
```

Sufficient for our press-1 / press-2 broadcast flows. The 2.5s auto-flush is not documented as configurable — if we need faster IVR response, `#`-terminated prompts are the workaround.

---

## Carrier setup

Route to: `sip:{number}@sip.voice.x.ai;transport=tls`

### Twilio
1. Create an Elastic SIP Trunk
2. Add origination URI: `sip:{number}@sip.voice.x.ai;transport=tls`
3. Assign/purchase the phone number
4. Enable call transfer if you need mid-session REFER

### Telnyx
1. Create an **FQDN SIP Connection** in Voice Suite
2. Primary FQDN: `sip.voice.x.ai`, port `5060`, type `A`
3. Inbound destination format: **E.164**
4. Enable codecs: G.711 μ-law, G.711 A-law, or G.722
5. Assign the phone number

> We already have 5 Telnyx numbers and a working FQDN/TeXML setup from the Feb–Apr 2026 Telnyx work. Adding a second FQDN connection pointed at xAI is low-effort and doesn't disturb the existing Telnyx AI Assistant path.

### Plivo
1. Create a SIP trunk
2. Inbound URI FQDN: `sip.voice.x.ai`
3. Link/purchase the number

### Any other carrier
Point the outbound route/trunk at `sip:{number}@sip.voice.x.ai;transport=tls`.

---

## 🚨 The outbound problem

**This is the single biggest finding in this research.**

The entire documented SIP surface is **inbound**: register a number → receive `realtime.call.incoming` → attach a WebSocket. There is no documented "originate a call to +1XXX" endpoint. xAI does not provision numbers via API. There is no `POST /v1/realtime/calls` create-call equivalent to Retell's `create-phone-call` or Telnyx's `/v2/calls`.

`dial-smart-system` is **overwhelmingly an outbound platform.** `call-dispatcher`, `outbound-calling`, `voice-broadcast-engine`, the dialing queue, pacing, retry scheduling, calling-hours enforcement — all of it exists to originate calls.

### The workaround: originate elsewhere, bridge in

```
call-dispatcher picks a lead
        │
        ▼
Telnyx/Twilio originates the outbound call to the prospect   ← we already do this
        │
        │  prospect answers (carrier-level AMD runs here)
        ▼
Carrier bridges the answered leg into sip:{our-number}@sip.voice.x.ai
        │
        ▼
xAI fires realtime.call.incoming → we attach the WebSocket → agent talks
```

This works. It is how you'd do it. But be clear about what it costs:

| Consequence | Impact |
|---|---|
| **Two legs, two bills** | You pay carrier origination *and* carrier→xAI SIP termination, plus $0.08/min to xAI. See [04-pricing-and-comparison.md](./04-pricing-and-comparison.md). |
| **Added connect latency** | Extra bridge hop between answer and first agent word. Partially offsets Grok's latency advantage at exactly the moment it matters most — the first 2 seconds. |
| **AMD must stay at the carrier** | No native AMD in Grok. Keep Telnyx premium AMD (97%, $0.0065/call) or Twilio AMD *before* bridging. Don't bridge machines into a paid Grok session. This is actually fine — it's where AMD belongs anyway. |
| **Answer-detection coupling** | The bridge must fire on answer, not on dial. Standard carrier behavior, but it's another moving part in the dispatch path. |
| **Call ID correlation** | Our `call_logs` row is keyed on the carrier's call ID; xAI issues its own `call_id`. Need a mapping table or metadata passthrough to stitch them. |

### Verify before building

The docs mention `CreatePhoneNumberV2` in the SIP reference but do **not** publish its request/response schema, and the "no API provisioning" statement appears in secondary sources. There may be an outbound origination path that simply isn't in the public docs yet — this API is 8 months old and moving fast.

**Action item: ask xAI directly** whether native outbound origination exists or is on the roadmap. That single answer determines whether Grok is a full provider for us or an inbound-only specialist. Don't scope the integration until you have it.

---

## What this means for us, concretely

Grok Voice fits our **inbound** and **transfer-target** surfaces natively and cleanly:

- Inbound callbacks from broadcast drops ("press 1 to speak to someone")
- Inbound response to SMS campaigns
- The receiving end of a warm transfer
- After-hours / overflow answering

It fits our **outbound predictive dialing** surface only through a bridge, with the caveats above — and even then, the **100 concurrent session cap** ([02](./02-api-reference.md#limits)) means it cannot carry peak campaign load without a negotiated increase.

Scope the pilot to inbound. That's where it's strong, that's where the integration is clean, and that's where you learn whether the latency and prosody claims hold up on real calls before betting anything bigger on it.
