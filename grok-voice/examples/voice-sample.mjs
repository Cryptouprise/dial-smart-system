#!/usr/bin/env node
/**
 * Generate real Grok voice samples as MP3 files.
 *
 *   export XAI_API_KEY=xai-...
 *   node voice-sample.mjs                 # every available voice
 *   node voice-sample.mjs eve ara rex     # just these
 *
 * The TTS roster is the SAME roster the realtime Voice Agent API uses, so
 * these files are a genuine sample of what a Grok agent sounds like. What
 * they do NOT capture is conversational behavior -- turn-taking, barge-in,
 * and latency. For that you need a live session.
 *
 * Writes ./samples/grok-<voice>.mp3
 */

import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.XAI_API_KEY;
if (!API_KEY) {
  console.error(`
XAI_API_KEY is not set.

Get one at https://console.x.ai -> API Keys, then:
  export XAI_API_KEY=xai-...
  node voice-sample.mjs
`);
  process.exit(1);
}

const OUT_DIR = path.join(import.meta.dirname, "samples");

/**
 * A realistic outbound solar opener, not "the quick brown fox".
 * Exercises the expressive tags so you can hear what they actually do --
 * these are the difference between a broadcast drop that sounds human and
 * one that sounds like a robocall.
 */
const SCRIPT = `Hey, is this Chase? [pause] Hi Chase, this is Eve calling from Call Boss. <soft>I know I'm catching you out of the blue</soft>, so I'll be quick. [breath] I'm reaching out because you looked into solar a while back and never got a straight answer on what it'd actually cost you. Is that <slow>still something</slow> you're thinking about?`;

async function listVoices() {
  const res = await fetch("https://api.x.ai/v1/tts/voices", {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`voice list failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  // Don't assume the response shape -- the docs don't publish it.
  const voices = body.voices ?? body.data ?? body;
  return voices.map((v) => (typeof v === "string" ? { id: v } : v));
}

async function synthesize(voiceId) {
  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: SCRIPT,
      voice_id: voiceId,
      language: "en",
      output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
      speed: 1.0,
      text_normalization: true,
    }),
  });

  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

const requested = process.argv.slice(2);

let voices;
try {
  voices = await listVoices();
  console.log(`${voices.length} voices available: ${voices.map((v) => v.id).join(", ")}\n`);
} catch (err) {
  // Fall back to the three the docs actually name.
  console.warn(`could not list voices (${err.message}); falling back to known IDs\n`);
  voices = [{ id: "eve" }, { id: "ara" }, { id: "rex" }];
}

const targets = requested.length
  ? voices.filter((v) => requested.includes(v.id.toLowerCase()))
  : voices;

if (!targets.length) {
  console.error(`no match for: ${requested.join(", ")}`);
  process.exit(1);
}

await fs.mkdir(OUT_DIR, { recursive: true });

// ~340 chars at $15/1M => about half a cent per voice. Cheap to run wide.
const cost = ((SCRIPT.length * targets.length) / 1_000_000) * 15;
console.log(`generating ${targets.length} sample(s), est. $${cost.toFixed(4)}\n`);

for (const voice of targets) {
  process.stdout.write(`  ${voice.id.padEnd(12)} `);
  try {
    const audio = await synthesize(voice.id);
    const file = path.join(OUT_DIR, `grok-${voice.id}.mp3`);
    await fs.writeFile(file, audio);
    console.log(`ok  ${(audio.length / 1024).toFixed(0)} KB  ${file}`);
  } catch (err) {
    console.log(`FAILED  ${err.message}`);
  }
}

console.log(`\ndone -> ${OUT_DIR}`);
