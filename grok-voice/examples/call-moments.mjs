#!/usr/bin/env node
/**
 * Render one voice across the real moments of an outbound solar call.
 *
 *   export XAI_API_KEY=xai-...
 *   node call-moments.mjs ara          # default voice is ara
 *   node call-moments.mjs eve
 *
 * The opener sample tells you whether a voice is pleasant. These tell you
 * whether it can carry a whole call -- which is a different question. A voice
 * that nails a warm opener can still fall apart on an objection or sound
 * insincere confirming an appointment.
 *
 * Writes ./samples/<voice>-<moment>.mp3
 */

import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.XAI_API_KEY;
if (!API_KEY) {
  console.error("XAI_API_KEY is not set");
  process.exit(1);
}

const VOICE = (process.argv[2] ?? "ara").toLowerCase();
const OUT_DIR = path.join(import.meta.dirname, "samples");

/**
 * Each moment stresses a different vocal register. Tags are used the way
 * they'd actually ship, not decoratively.
 */
const MOMENTS = {
  // Cold open. Needs warmth without sounding like a telemarketer.
  opener: `Hey, is this Chase? [pause] Hi Chase, this is Ara calling from Call Boss. <soft>I know I'm catching you out of the blue</soft>, so I'll be quick. [breath] I'm reaching out because you looked into solar a while back and never got a straight answer on what it'd actually cost you. Is that <slow>still something</slow> you're thinking about?`,

  // Voicemail. No pauses for a response -- has to carry itself, and the
  // callback number needs to land clearly.
  voicemail: `Hi Chase, this is Ara with Call Boss. [breath] I'm following up on the solar quote you requested. <soft>No pressure at all</soft> -- I just wanted to get you an actual number so you're not left guessing. Give me a call back when you get a minute at <slow>eight five five, two four one, nine zero zero zero</slow>. Thanks Chase, talk soon.`,

  // The objection. This is the hardest test: it has to sound unbothered
  // rather than pushy or wounded.
  objection: `[breath] Totally fair, and I appreciate you being straight with me. <soft>Can I ask one quick thing before I let you go?</soft> [pause] Most people who tell me that got quoted something wild -- like forty grand -- and understandably tapped out. If it turned out your number was less than half that, would that change anything, or are you just done with the whole topic?`,

  // Appointment set. Warm, competent, unambiguous on the details.
  confirmation: `Perfect, I've got you down for <slow>Thursday at two</slow>. [pause] You'll get a text confirmation in about a minute, and Marcus will call you from this same number. [breath] He'll have your roof measurements and your actual utility rate pulled up, so it'll be a real conversation, not a sales pitch. <soft>Sound good, Chase?</soft>`,

  // Compliance. Delivered flat and clear on purpose -- in production this
  // ships as a force_message so the model can never paraphrase it.
  disclosure: `This call is being recorded for quality and training purposes.`,
};

async function synthesize(text) {
  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: VOICE,
      language: "en",
      output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
      speed: 1.0,
      text_normalization: true,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

await fs.mkdir(OUT_DIR, { recursive: true });

const chars = Object.values(MOMENTS).reduce((n, t) => n + t.length, 0);
console.log(`voice: ${VOICE}`);
console.log(`${Object.keys(MOMENTS).length} moments, est. $${((chars / 1e6) * 15).toFixed(4)}\n`);

for (const [moment, text] of Object.entries(MOMENTS)) {
  process.stdout.write(`  ${moment.padEnd(14)} `);
  try {
    const audio = await synthesize(text);
    const file = path.join(OUT_DIR, `${VOICE}-${moment}.mp3`);
    await fs.writeFile(file, audio);
    console.log(`ok  ${(audio.length / 1024).toFixed(0)} KB`);
  } catch (err) {
    console.log(`FAILED  ${err.message}`);
  }
}

console.log(`\ndone -> ${OUT_DIR}`);
