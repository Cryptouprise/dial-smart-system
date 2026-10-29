# JOB 07 - Make it amazing: fold the DoorBoss call workspace into the dialer, then find what else lifts it (lane: flash)
## WHAT WE HAVE (FACTS, verified by the foreman)
A. The dialer plan in the material (PLAN-draft-deepseek.md) + the four audit reports.
B. DoorBoss call workspace, LIVE since Oct 2026 for our door-to-door solar app. Runs on our own server (Hermes) as a
   service called doorboss-ai, pop-out window `call.html` (also embeds as an iframe with ?embed=1). Pieces:
   - Video/voice room via Daily.co (rooms created by the service, 40/day cap, two-participant 720p verified).
   - LIVE TRANSCRIPT in the window, every line labelled by speaker.
   - LIVE AI COACH: on every transcript line the service calls a cheap LLM (DeepSeek) and shows the rep what to say
     next + fills the intake form fields from what was said (8-9 fields per call for ~$0.001). "Use" buttons to accept.
   - "Ask AI" tab: rep asks questions, answers grounded in the rep's own records (SQL scoped to the rep).
   - Modes: video call with a homeowner link, OR "in-person record" (camera off, one mic, both people).
   - Recording kept; after the call ElevenLabs Scribe diarizes the audio (speaker 1/2) and replaces the transcript.
   - Phone calls made elsewhere (GHL) are pulled every 10 min, transcribed post-call with Scribe, and land on the
     same record with the same field-fill. There is NO live transcript for those phone calls today.
   - Every call lands on the customer record as a timeline entry (transcript + facts + recording).
   - Access: unlocked by the manager's app sign-in; caps on AI spend per day.
C. The dialer has NO browser calling today. We plan a Telnyx browser phone (WebRTC). Telnyx Call Control supports
   real-time transcription webhooks and recording (GUESS until verified against Telnyx docs - mark it).
## THE CEO'S ASK
"When people are calling, I want a coach telling them what to say, how to say it, exactly like our door-to-door app.
Take that whole thing and bring it over into our dialer: the video part, the calling part, the recording, the coaching."
Standing rule: NEVER rebuild a stripped-down copy of something we already have in full. Reuse the DoorBoss workspace.
## TASK
1. Design how the DoorBoss call workspace becomes the dialer's call screen. Where the audio comes from in each mode
   (Telnyx phone call vs Daily video vs in-person), how the live transcript is produced for a PHONE call so the coach
   works live (not post-call), how the coach prompt is driven by the company's industry pack + the lead's record, and how
   the call lands on the dialer's records (call_logs + the lead). Name the pieces that already exist vs new.
2. Rank the 3 options for live phone transcription (Telnyx real-time transcription webhook; pipe browser audio to a
   streaming STT; record-then-Scribe only) on latency, cost, build effort. Pick one. Mark GUESSes.
3. Then: 10 more ideas that make this dialer the best one a wholesaler or solar-exit team could buy, ranked by
   (value to the customer) / (build effort). One line each: idea, why it sells, effort S/M/L, which existing piece it reuses.
4. Where this changes the 6-phase plan: which phase, what gets added, what gets dropped.
## OUTPUT FORMAT
Markdown, headings: ### Call screen design ### Live phone transcript ### 10 ideas ### Plan changes. Under 1000 words.
