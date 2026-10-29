# JOB 08 - Gap map: Dial Smart vs the popular dialers (lane: fast)
## MATERIAL
(1) DIALER-FEATURES.md = what GHL, Kixie, PhoneBurner, JustCall, Aircall, Dialpad, Mojo, BatchDialer, Salesfinity, Orum have, with
table-stakes vs differentiator and buyer complaints. (2) The audit reports on Dial Smart (03-sms-voice, 02-api). (3) PLAN.md.
## WHAT DIAL SMART ALREADY HAS (facts from the foreman, verified in code/skill docs; treat as true)
AI power + predictive dialing (call-dispatcher cron, pacing by calls_per_minute), Retell AI caller, Telnyx AI caller, Twilio voice
broadcast with AMD (twilio-amd-webhook) + DTMF + voicemail drop (broadcast audio), local presence / number rotation (rotation_enabled,
daily caps, quarantine), number health metrics + spam scoring columns, DNC list, calling hours by campaign timezone, dispositions with
auto_actions, pipeline boards + lead_pipeline_positions, disposition-router moves stages, workflows/sequences (workflow-executor),
SMS send/receive + AI auto-reply, call recording URL, transcript + AI analysis + sentiment + summary (analyze-call-transcript), campaign
compliance (abandonment rate), credit/billing system per organization, API gateway with scoped keys, Google + GHL calendar booking,
GHL contact sync, mobile PWA (vite-plugin-pwa). It has NO human browser dialing, NO live transcript, NO live coach, NO whisper/barge,
NO parallel human dialing, NO leaderboards / QA scoring UI, STIR/SHAKEN attestation column exists but nothing acts on it.
## TASK
Produce ONE table, every row from the feature inventory: feature | class (table stakes / differentiator) | Dial Smart today
(HAVE / PARTIAL / MISSING, one clause of evidence) | what closes the gap (one line; name the existing piece to extend if any) |
effort S/M/L | plan phase (1-6, or "pack", or "later"). Order: MISSING table stakes first, then PARTIAL table stakes, then
MISSING differentiators that buyers complain about (section 3 of the inventory), then the rest. After the table, 5 lines:
the features where Dial Smart + the DoorBoss call workspace would BEAT every product in the list. No prose beyond that.
