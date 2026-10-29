Assumption: the DoorBoss workspace is described only in the brief (WHAT WE HAVE B), not in the three material files; I cite it as "brief B" and mark anything beyond it UNKNOWN.

### Call screen design

FACT: the dialer has no browser-calling code today (docs/wholesale/audit/out/03-sms-voice.md:72); a Telnyx browser phone is planned as Phase 4 (docs/wholesale/PLAN-draft-deepseek.md:21-24). FACT: `call_logs` already carries `telnyx_call_control_id`, `telnyx_call_session_id`, `telnyx_conversation_id` and `recording_url` (docs/wholesale/PLAN-draft-deepseek.md:23, :49). FACT: `call_logs` is revoked from `authenticated`, so writes must use the service-role key (docs/wholesale/PLAN-draft-deepseek.md:48). FACT: tenant triggers `call_logs_require_authoritative_tenant` and `call_logs_same_tenant_graph` reject bad rows (docs/wholesale/PLAN-draft-deepseek.md:50).

The call screen is the existing DoorBoss `call.html` window (brief B), embedded via `?embed=1` (brief B), mounted at a new protected route. FACT: a new `/wholesale/*` path is non-public by both auth mechanisms (docs/wholesale/audit/out/04-frontend.md:26); the add-a-page recipe is docs/wholesale/audit/out/04-frontend.md:77-86.

Audio source per mode:
- Telnyx phone call: browser WebRTC client (new; none exists, docs/wholesale/audit/out/03-sms-voice.md:72) feeds the Daily room as the rep's mic. INFERENCE: Daily is the transport into the workspace; Telnyx carries the PSTN leg.
- Daily video: unchanged, existing Daily.co room (brief B).
- In-person record: unchanged, camera off / one mic (brief B).

Coach prompt: driven by the company's industry pack + the lead's record. FACT: packs live in `organizations.settings` JSONB as `{"packs":[...]}` (docs/wholesale/PLAN-draft-deepseek.md:13, :38); pack scripts seed `agent_scripts` (docs/wholesale/PLAN-draft-deepseek.md:18, :42); pack fields are `leads.custom_fields` JSONB (GUESS, docs/wholesale/PLAN-draft-deepseek.md:18, :40). INFERENCE: the coach prompt = pack script rows + `leads.custom_fields` + the live transcript.

Landing on records: the Telnyx call-control webhook writes `call_logs` with `organization_id`, `user_id`, `telnyx_call_control_id` (docs/wholesale/PLAN-draft-deepseek.md:50); recording URL into `call_logs.recording_url` (docs/wholesale/PLAN-draft-deepseek.md:49). The lead link: UNKNOWN — no material shows a `call_logs.lead_id` column; file that would answer it: the migration SQL for `call_logs` (docs/wholesale/audit/out/03-sms-voice.md:91).

Existing vs new:
- Existing: DoorBoss workspace, Daily rooms, live transcript, live coach, Ask AI, Scribe diarization, GHL pull, timeline entry, spend caps (brief B); `call_logs` columns (docs/wholesale/PLAN-draft-deepseek.md:23); `phone_numbers` with `provider='telnyx'` (docs/wholesale/PLAN-draft-deepseek.md:52).
- New: `telnyx-voice-token` edge function (docs/wholesale/PLAN-draft-deepseek.md:23, :46); `telnyx-call-control` webhook (docs/wholesale/PLAN-draft-deepseek.md:23, :48); browser WebRTC client (docs/wholesale/audit/out/03-sms-voice.md:72); the bridge that pipes Telnyx audio into the Daily room (INFERENCE — not in material).

### Live phone transcript

FACT: today phone calls via GHL have NO live transcript; they are transcribed post-call with Scribe (brief B). FACT: Telnyx Call Control real-time transcription webhooks are a GUESS until verified against Telnyx docs (brief C).

Ranking (latency / cost / build effort):
1. Telnyx real-time transcription webhook — latency: lowest (streams during call); cost: UNKNOWN (Telnyx pricing not in material); effort: M (new webhook + wire into workspace). GUESS on Telnyx capability (brief C).
2. Pipe browser audio to a streaming STT — latency: low; cost: UNKNOWN (STT vendor not in material); effort: L (new streaming client + STT integration; no such code exists, docs/wholesale/audit/out/03-sms-voice.md:72).
3. Record-then-Scribe only — latency: highest (post-call, brief B); cost: lowest (Scribe already paid, brief B); effort: S (already works for GHL, brief B). Fails the CEO's "live" ask (brief, CEO'S ASK).

Pick: option 1, Telnyx real-time transcription webhook, because it is the only one that meets "live" with moderate effort. GUESS: Telnyx supports it (brief C). Fallback if the GUESS fails: option 2.

### 10 ideas

Ranked by value/effort. Effort S/M/L. Reuse named.

1. Pack-driven coach prompt — sells because each vertical gets its own script out of the box; S; reuses `agent_scripts` + `organizations.settings` packs (docs/wholesale/PLAN-draft-deepseek.md:13, :42).
2. Live field-fill into `leads.custom_fields` during the call — sells as "no typing after the call"; S; reuses DoorBoss field-fill (brief B) + `custom_fields` (docs/wholesale/PLAN-draft-deepseek.md:40).
3. Post-call Scribe diarization on Telnyx calls — sells as accurate speaker-labelled records; S; reuses Scribe path already used for GHL (brief B).
4. Ask AI scoped to the rep's records — sells as "ask about this lead mid-call"; S; reuses DoorBoss Ask AI (brief B).
5. Per-org AI spend cap surfaced in settings — sells as cost control; S; reuses DoorBoss caps (brief B) + `organization_credits` (docs/wholesale/PLAN-draft-deepseek.md:33).
6. Caller-ID ownership check on `placeCall` — sells as compliance; S; reuses `phone_numbers` (docs/wholesale/PLAN-draft-deepseek.md:52); fixes known gap (docs/wholesale/PLAN-draft-deepseek.md:61).
7. Timeline entry on the lead for every call — sells as one record per customer; M; reuses DoorBoss timeline (brief B); needs `call_logs`→lead link (UNKNOWN, see above).
8. DNC check before dial — sells as TCPA safety; S; reuses `dnc_list` lookup pattern (docs/wholesale/audit/out/03-sms-voice.md:12).
9. Pack stages seeded on enable — sells as vertical-ready pipeline; M; reuses `dispositions.pipeline_stage` (docs/wholesale/PLAN-draft-deepseek.md:18, :41).
10. Simple-mode toggle for the call screen — sells as fast onboarding; S; reuses `simpleMode` filter (docs/wholesale/audit/out/04-frontend.md:65).

### Plan changes

Phase 4 (Telnyx browser phone, docs/wholesale/PLAN-draft-deepseek.md:21-24) is where this lands.
- Added: `telnyx-transcription-webhook` (new); bridge from Telnyx audio into the Daily room (new, INFERENCE); embed of `call.html?embed=1` at a new protected route (recipe docs/wholesale/audit/out/04-frontend.md:77-86); coach prompt reads pack + `leads.custom_fields`.
- Dropped: nothing in Phase 4 is dropped. The "record-then-Scribe only" path is not adopted for Telnyx calls (it stays for GHL, brief B).
- Phase 3 dependency: `leads.custom_fields` (GUESS, docs/wholesale/PLAN-draft-deepseek.md:40) must land before the coach can fill fields — so Phase 3 precedes the coach wiring.
- Phase 2 dependency: pack gating (docs/wholesale/PLAN-draft-deepseek.md:11-14) must land so the coach knows which pack is active.
- UNKNOWN: whether `call_logs` links to `leads`; file that would answer it: `call_logs` migration SQL (docs/wholesale/audit/out/03-sms-voice.md:91).