#!/usr/bin/env node
/**
 * Post-call transcription with diarization and word-level timestamps.
 *
 * ** This is the Phase 1 recommendation -- start here. **
 *
 * $0.10/hr REST. Reprocessing a full 5,000-call campaign at a 3-minute
 * average handle time costs about $25. Zero risk to any live call path:
 * it runs entirely post-call, async, against recordings we already store.
 *
 *   export XAI_API_KEY=xai-...
 *   node stt-transcribe.mjs <recording-url>
 *
 * What diarization unlocks for us that a flat transcript can't:
 *   - extract_opener_from_transcript: know the agent's first utterance
 *     exactly, instead of inferring it with a regex
 *   - calculate_time_wasted_score: real talk-time ratios per speaker
 *   - opener_analytics / top_openers: dramatically cleaner inputs
 *   - lead_intent_signals: better LLM extraction from segmented text
 */

const API_KEY = process.env.XAI_API_KEY;
if (!API_KEY) {
  console.error("XAI_API_KEY is not set");
  process.exit(1);
}

const recordingUrl = process.argv[2];
if (!recordingUrl) {
  console.error("usage: node stt-transcribe.mjs <recording-url>");
  process.exit(1);
}

async function transcribe(url) {
  const audio = await fetch(url);
  if (!audio.ok) throw new Error(`fetch recording failed: ${audio.status}`);
  const blob = await audio.blob();

  const form = new FormData();
  form.append("file", blob, "recording.mp3");
  form.append("language", "en");
  form.append("diarize", "true");           // who spoke when
  form.append("word_timestamps", "true");   // per-word start/end

  const res = await fetch("https://api.x.ai/v1/stt", {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`STT failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

/**
 * Derive the metrics our analytics tables actually want.
 * Assumes speaker 0 is the agent (they speak first on outbound). For inbound,
 * flip it -- or better, key off which leg the recording channel belongs to.
 */
function deriveMetrics(result) {
  const segments = result.segments ?? [];
  if (!segments.length) return null;

  const agentId = segments[0].speaker;
  const talkTime = {};
  for (const s of segments) {
    talkTime[s.speaker] = (talkTime[s.speaker] ?? 0) + (s.end - s.start);
  }

  const agentTime = talkTime[agentId] ?? 0;
  const prospectTime = Object.entries(talkTime)
    .filter(([id]) => id !== String(agentId))
    .reduce((sum, [, t]) => sum + t, 0);
  const total = agentTime + prospectTime;

  return {
    // The agent's literal first utterance -- feeds opener_analytics directly,
    // with no regex guessing.
    opener: segments[0].text?.trim() ?? "",
    agent_talk_seconds: Number(agentTime.toFixed(1)),
    prospect_talk_seconds: Number(prospectTime.toFixed(1)),
    // Healthy discovery calls sit well under 0.5. A high ratio means the
    // agent monologued -- a strong time-wasted signal.
    agent_talk_ratio: total ? Number((agentTime / total).toFixed(3)) : 0,
    speaker_count: Object.keys(talkTime).length,
    // Long gap before the prospect says anything = likely voicemail or a
    // reluctant answer. Useful as a secondary AMD signal.
    seconds_to_first_prospect_word:
      segments.find((s) => s.speaker !== agentId)?.start ?? null,
  };
}

const result = await transcribe(recordingUrl);
const metrics = deriveMetrics(result);

console.log("--- transcript ---");
for (const s of result.segments ?? []) {
  console.log(`[${s.start.toFixed(1)}s] speaker ${s.speaker}: ${s.text}`);
}

console.log("\n--- derived metrics ---");
console.log(JSON.stringify(metrics, null, 2));

// Next step: persist to call_logs.diarized_transcript / .word_timestamps
// and feed `metrics` into opener_analytics + calculate_time_wasted_score.
