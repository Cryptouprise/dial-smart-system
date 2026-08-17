#!/usr/bin/env node
/**
 * Smallest possible Grok Voice smoke test.
 *
 *   export XAI_API_KEY=xai-...
 *   npm install ws
 *   node basic-agent.mjs
 *
 * Connects, configures a session, sends one text turn, and logs every event
 * that comes back. Audio deltas are counted rather than printed so the log
 * stays readable.
 */

import WebSocket from "ws";

const API_KEY = process.env.XAI_API_KEY;
if (!API_KEY) {
  console.error("XAI_API_KEY is not set");
  process.exit(1);
}

// Pin the version. `grok-voice-latest` moved 1.0 -> 2.0 on 2026-08-05 and
// re-priced +60% ($0.05 -> $0.08/min) when it did.
const MODEL = "grok-voice-think-fast-2.0";

const ws = new WebSocket(`wss://api.x.ai/v1/realtime?model=${MODEL}`, {
  headers: { Authorization: `Bearer ${API_KEY}` },
});

let audioChunks = 0;

ws.on("open", () => {
  console.log("connected\n");

  ws.send(
    JSON.stringify({
      type: "session.update",
      session: {
        voice: "eve",
        instructions:
          "You are a concise assistant. Answer in one short sentence.",

        // "none" skips reasoning. For scripted outbound dialing this is
        // usually the right default -- reasoning costs latency you aren't
        // using. Use "high" for open-ended conversation.
        reasoning: { effort: "none" },

        turn_detection: {
          type: "server_vad",
          // Default is 0.85, which is tuned for a quiet room with a headset.
          // On PSTN audio that misses speech onsets. LiveKit defaults to 0.5.
          threshold: 0.6,
          silence_duration_ms: 300,
          prefix_padding_ms: 333,
        },

        audio: {
          input: {
            format: { type: "audio/pcm", rate: 24000 },
            transcription: {
              language_hint: "en",
              // Biases ASR toward domain terms. Populate per-call from lead
              // data: prospect name, company, city.
              keyterms: ["Call Boss", "Dial Smart", "Retell", "Telnyx"],
            },
          },
          output: { format: { type: "audio/pcm", rate: 24000 }, speed: 1.0 },
        },
      },
    })
  );

  // Kick off a turn with text instead of audio, so this runs without a mic.
  ws.send(
    JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Hello! What are you?" }],
      },
    })
  );
  ws.send(JSON.stringify({ type: "response.create" }));
});

ws.on("message", (data) => {
  const event = JSON.parse(data);

  switch (event.type) {
    // Audio arrives as many small base64 chunks. In production, stream each
    // one to the caller immediately -- never buffer the full response.
    case "response.output_audio.delta":
      audioChunks++;
      return;

    // NOTE: xAI emits `.updated` (cumulative), not `.delta` like OpenAI.
    // This is the single most common bug when porting OpenAI Realtime code.
    case "conversation.item.input_audio_transcription.updated":
      console.log("transcript:", event.transcript ?? "");
      return;

    case "conversation.created":
      // Capture this if you want session resumption across reconnects.
      console.log("conversation.id:", event.conversation?.id);
      return;

    case "response.done":
      console.log(`\nturn complete (${audioChunks} audio chunks)`);
      ws.close();
      return;

    case "error":
      console.error("ERROR:", JSON.stringify(event, null, 2));
      return;

    default:
      console.log("event:", event.type);
  }
});

ws.on("close", () => console.log("closed"));
ws.on("error", (err) => console.error("socket error:", err.message));
