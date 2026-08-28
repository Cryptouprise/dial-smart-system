#!/usr/bin/env node
/**
 * Solar EXIT call moments -- SolarComplaints.co / solar contract exit vertical.
 *
 *   node exit-moments.mjs ara
 *
 * This is a different job than solar sales, and the difference is the whole
 * thing. The person on this call was already worked by a smooth solar
 * salesperson, and that is exactly why they are calling. A polished sales
 * cadence is actively disqualifying here -- it sounds like the people who
 * put them in the contract.
 *
 * Voice per HANDOFF_FRAMEWORK.md: "a friend who knows the legal landscape
 * explaining things over coffee -- not a law firm brochure."
 *
 * COMPLIANCE: the agent qualifies and books an exit specialist. It does not
 * practice law, does not promise outcomes, and does not quote the refund
 * guarantee as a certainty. Hedged language below is deliberate -- do not
 * "tighten" it into promises.
 */

import fs from "node:fs/promises";
import path from "node:path";

const API_KEY = process.env.XAI_API_KEY;
if (!API_KEY) { console.error("XAI_API_KEY is not set"); process.exit(1); }

const VOICE = (process.argv[2] ?? "ara").toLowerCase();
const OUT_DIR = path.join(import.meta.dirname, "samples");

const MOMENTS = {
  // PRIMARY FLOW. They read an article, they're calling in. They are angry,
  // embarrassed, or both. Lead with "you're not stuck" -- not with a pitch.
  inbound_greeting: `Thanks for calling SolarComplaints. This is Ara. [pause] Before anything else -- <soft>I'm not a solar company, and I'm not selling you panels.</soft> [breath] We help homeowners get out of solar contracts they were talked into. So just tell me what happened, and I'll tell you straight whether there's something here.`,

  // They filled out the 60-second form. Callback within minutes.
  outbound_callback: `Hi, is this Chase? [pause] This is Ara with SolarComplaints, returning the form you filled out about your solar contract. [breath] <soft>I know that took you all of about sixty seconds, so let me do the work from here.</soft> Can you tell me who installed the system, and roughly when?`,

  // Qualification. Every question maps to a Tier 1 hook in LEGAL_ARSENAL.md:
  // Holder Rule, unlicensed contractor (B&P 7031), e-signature forgery,
  // failure to obtain PTO. Asked conversationally, not as an intake form.
  qualification: `Okay. A few quick things, and I promise there's a reason for each one. [breath] First -- when you signed, was that on the salesperson's tablet, or did you sign it yourself on your own device? [pause] And second, has the utility actually given you permission to operate? <slow>Meaning are the panels genuinely on and running</slow>, or have you been paying on a system that's been sitting there dark?`,

  // THE money objection. This audience got burned by someone who sounded
  // exactly like a confident salesperson. The right answer is to slow down
  // and hand them the exits, not to persuade.
  skepticism: `[breath] <soft>That's a completely fair question, and honestly, I'd rather you ask it than not.</soft> [pause] You already had one person talk fast at you, and that's how you ended up here. [pause] So -- we're not a law firm, and I'm not going to give you legal advice on this call. What we do is look at how your contract was actually sold to you, and whether the paperwork holds up. [breath] If there's nothing there, I'll tell you that, and you've lost ten minutes. <slow>Nobody's asking you for a card.</slow>`,

  // Handoff. Names the real outcomes without promising any of them.
  handoff: `Based on what you've told me, this is worth a real look -- <soft>the e-signature piece especially.</soft> [breath] I'm setting you up with one of our exit specialists. They'll pull your actual contract and walk you through what's realistic. [pause] Some homeowners end up canceled outright and keep the system. Some land somewhere in a forty to sixty percent reduction. [breath] <slow>I'm not going to tell you which one you are</slow> -- that's their call to make once they've read the paperwork.`,

  // Disclosure. Ships as force_message, interruptible:false -- guaranteed
  // verbatim, model can never paraphrase it. Critical in a legal-adjacent
  // vertical.
  disclosure: `This call is being recorded. SolarComplaints is not a law firm and does not provide legal advice.`,
};

async function synthesize(text) {
  const res = await fetch("https://api.x.ai/v1/tts", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      text, voice_id: VOICE, language: "en",
      output_format: { codec: "mp3", sample_rate: 24000, bit_rate: 128000 },
      speed: 1.0, text_normalization: true,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

await fs.mkdir(OUT_DIR, { recursive: true });
const chars = Object.values(MOMENTS).reduce((n, t) => n + t.length, 0);
console.log(`voice: ${VOICE}\n${Object.keys(MOMENTS).length} moments, est. $${((chars/1e6)*15).toFixed(4)}\n`);

for (const [moment, text] of Object.entries(MOMENTS)) {
  process.stdout.write(`  ${moment.padEnd(20)} `);
  try {
    const audio = await synthesize(text);
    await fs.writeFile(path.join(OUT_DIR, `exit-${VOICE}-${moment}.mp3`), audio);
    console.log(`ok  ${(audio.length/1024).toFixed(0)} KB`);
  } catch (err) { console.log(`FAILED  ${err.message}`); }
}
console.log(`\ndone -> ${OUT_DIR}`);
