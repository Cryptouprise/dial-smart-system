#!/usr/bin/env node
/**
 * Inbound SIP call handler -- the production shape for Grok Voice telephony.
 *
 *   export XAI_API_KEY=xai-...
 *   export XAI_WEBHOOK_SECRET=whsec_...   # shown ONCE at number registration
 *   npm install ws express
 *   node sip-inbound-handler.mjs
 *
 * Flow:
 *   PSTN -> Twilio/Telnyx trunk -> sip:{number}@sip.voice.x.ai
 *        -> xAI POSTs realtime.call.incoming to this webhook
 *        -> we verify the signature and attach a WebSocket by call_id
 *        -> the agent talks
 *
 * Note that WE hold the socket for the duration of the call. That is different
 * from Retell/Telnyx, which manage the media session and call us back over
 * HTTP. Validate this against the Supabase edge-function runtime before
 * porting -- it may not fit a request/response model.
 */

import express from "express";
import crypto from "node:crypto";
import WebSocket from "ws";

const API_KEY = process.env.XAI_API_KEY;
const WEBHOOK_SECRET = process.env.XAI_WEBHOOK_SECRET;

const app = express();
// Signature verification needs the raw bytes, not a parsed object.
app.use(express.raw({ type: "application/json" }));

/** Svix-style webhook signature check. */
function verifySignature(req) {
  const id = req.header("webhook-id");
  const timestamp = req.header("webhook-timestamp");
  const signature = req.header("webhook-signature");
  if (!id || !timestamp || !signature) return false;

  // Reject anything older than 5 minutes to blunt replay attacks.
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (age > 300) return false;

  const secretBytes = Buffer.from(WEBHOOK_SECRET.split("_")[1] ?? "", "base64");
  const expected = crypto
    .createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${req.body}`)
    .digest("base64");

  // Header can carry several space-separated "v1,<sig>" values.
  return signature
    .split(" ")
    .some((part) => {
      const sig = part.split(",")[1];
      if (!sig || sig.length !== expected.length) return false;
      return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    });
}

app.post("/webhooks/grok-voice", (req, res) => {
  if (!verifySignature(req)) {
    console.warn("rejected webhook: bad signature");
    return res.sendStatus(401);
  }

  const event = JSON.parse(req.body.toString());
  if (event.type !== "realtime.call.incoming") return res.sendStatus(200);

  const { call_id, sip_headers } = event.data;
  const from = sip_headers?.find((h) => h.name === "From")?.value;
  const to = sip_headers?.find((h) => h.name === "To")?.value;
  console.log(`incoming call ${call_id}: ${from} -> ${to}`);

  // Ack fast, then attach out of band. Don't make xAI wait on our socket.
  res.sendStatus(200);
  attachToCall(call_id, from).catch((err) =>
    console.error(`call ${call_id} failed:`, err.message)
  );
});

async function attachToCall(callId, callerNumber) {
  // Real implementation: look the lead up by callerNumber and feed the result
  // into `instructions` and `keyterms`.
  const lead = { first_name: "there", company: null };

  const ws = new WebSocket(`wss://api.x.ai/v1/realtime?call_id=${callId}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: "eve",
          instructions: `You are a phone agent for Call Boss. The caller is ${lead.first_name}. Be brief and warm. Qualify their interest, then offer to book a callback.`,
          reasoning: { effort: "high" },

          turn_detection: {
            type: "server_vad",
            threshold: 0.6,          // PSTN audio -- the 0.85 default is too high
            silence_duration_ms: 300,
            idle_timeout_ms: 8000,   // triggers "still there?" instead of dead air
          },

          audio: {
            // G.711 mu-law @ 8k matches the SIP leg exactly, so nothing in the
            // path has to resample.
            input: {
              format: { type: "audio/pcmu", rate: 8000 },
              transcription: {
                language_hint: "en",
                keyterms: [lead.first_name, lead.company, "Call Boss"].filter(Boolean),
              },
            },
            output: { format: { type: "audio/pcmu", rate: 8000 } },
          },

          // Connect our existing MCP server so the agent can look up lead
          // history mid-call, server-side, with no webhook round-trip.
          // Scope the token to read-only tools -- never campaign dispatch.
          tools: [
            {
              type: "mcp",
              server_url: "https://emonjusymdripmkvtttc.supabase.co/functions/v1/mcp",
              server_label: "dial-smart",
              allowed_tools: ["search_leads", "recent_calls"],
              authorization: `Bearer ${process.env.DIALSMART_MCP_TOKEN ?? ""}`,
            },
          ],
        },
      })
    );

    // Compliance disclosure. `force_message` is synthesized directly with no
    // model inference, so the wording is guaranteed verbatim -- the model
    // cannot paraphrase or skip it. interruptible:false means the caller
    // can't talk over it.
    //
    // Do NOT send response.create after a force message: it IS the turn.
    ws.send(
      JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "force_message",
          role: "assistant",
          interruptible: false,
          content: [
            { type: "output_text", text: "This call may be recorded for quality assurance." },
          ],
        },
      })
    );

    // Now hand the floor to the model for the actual opener.
    ws.send(JSON.stringify({ type: "response.create" }));
  });

  ws.on("message", async (data) => {
    const event = JSON.parse(data);

    switch (event.type) {
      case "response.output_audio.delta":
        return; // audio is bridged by xAI on SIP sessions

      case "conversation.item.input_audio_transcription.updated":
        console.log(`[${callId}] caller:`, event.transcript);
        return;

      // SIP sessions only -- DTMF events are not emitted on direct WebSocket
      // sessions. Digits flush on '#', 2.5s idle, or when speech starts.
      case "input_audio_buffer.dtmf_event_received":
        console.log(`[${callId}] DTMF:`, event.event);
        return;

      case "response.function_call_arguments.done":
        await handleFunctionCall(ws, event);
        return;

      case "error":
        console.error(`[${callId}] error:`, JSON.stringify(event));
        return;
    }
  });

  ws.on("close", () => console.log(`[${callId}] session closed`));
}

const FUNCTION_HANDLERS = {
  book_callback: async ({ when }) => ({ ok: true, scheduled_for: when }),
};

async function handleFunctionCall(ws, event) {
  const args = JSON.parse(event.arguments);
  const handler = FUNCTION_HANDLERS[event.name];
  const result = handler
    ? await handler(args)
    : { error: `unknown function ${event.name}` };

  ws.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: event.call_id,
        output: JSON.stringify(result),
      },
    })
  );

  // WARNING: with parallel tool calls, do NOT send response.create until
  // EVERY outstanding function output has been submitted -- sending early
  // truncates the remaining calls. Track pending call_ids if you enable
  // parallel tools.
  ws.send(JSON.stringify({ type: "response.create" }));
}

/** Warm transfer to a human. SIP REFER. */
export async function transferCall(callId, targetUri) {
  return fetch(`https://api.x.ai/v1/realtime/calls/${callId}/refer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ target_uri: targetUri }),
  });
}

export async function hangupCall(callId) {
  return fetch(`https://api.x.ai/v1/realtime/calls/${callId}/hangup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
}

app.listen(3000, () => console.log("listening on :3000"));
