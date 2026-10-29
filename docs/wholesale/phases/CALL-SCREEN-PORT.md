# Call screen port: DoorBoss call workspace -> Dial Smart (phase 4 UI), Fable 2026-10-29

Source of truth: `docs/wholesale/doorboss-call/call.html` (223 lines) + `call-content.js` (coach words) + `rep_assistant.py` (Ask AI),
pulled from Hermes `/opt/doorboss-ai/static/` on 10/29. Rule (Charles 10/21): never ship a stripped version; bring the whole workspace.

## What the DoorBoss page does today (facts from call.html)
| Piece | How | Line |
|---|---|---|
| Video (Daily room) + self view + "Waiting for the homeowner" | Daily `createCallObject`, `join({url, token})` | 117-118 |
| In-person mode | camera off, one mic hears both, every line treated as homeowner's for coach + AI | 87, 147, 210 |
| Consent gate | nothing is transcribed or recorded until the rep taps "● Record" after the homeowner says OK; switching consent off stops both | 154-161, 206 |
| Live transcript | Daily `startTranscription`; lines tagged REP / HOMEOWNER / BOTH; last 60 painted, 300 kept | 147, 97 |
| Live coach (rules) | keyword rules from `call-content.js` (`warn` / `say` / `next`, chips for top rules, `{first}`/`{rep}`/`{installer}` tokens); fires on homeowner lines or a typed line; only the rep sees it | 48-64, 218 |
| "The AI heard" field-fill | every 2.5 s after new homeowner text, POST `/extract` with last 300 lines -> `{fields:{key:{v,c,e}}}`; shown as Use / No; Use posts `apply` to the parent intake | 163-171 |
| Ask AI | separate `/ask` endpoint (rep_assistant.py): read-only, company-scoped data, DeepSeek, playbook lines, map actions, practice mode | rep_assistant.py |
| Share slides | Daily screen share of a window | 191-199 |
| Two-tap End | second tap within 4 s | 200-204 |
| Transcript to the record | on end/pagehide POST `/transcript` (keepalive) -> intake call log; recording kept server-side | 172-178, 158 |
| Embed | `?embed=1` docks inside the parent via postMessage (`init`, `consent`, `use`, `end`, `state`, `ended`) | 39, 65, 208-215 |

## Mapping into Dial Smart (one screen, three modes: PHONE / VIDEO / IN-PERSON)
| DoorBoss piece | Dial Smart home | Status |
|---|---|---|
| Daily video + in-person | `CallWorkspace` mode VIDEO/IN-PERSON keeps Daily (service stays on Hermes for now; later a `daily-room` edge fn) | later |
| Phone audio | mode PHONE = `src/lib/voice/BrowserPhone.ts` (P4a: Telnyx WebRTC or Twilio Voice SDK) | P4a draft |
| Consent gate | same switch; in PHONE mode it also starts/stops provider recording + transcription (voice-call-action `record_start`/`transcription_start`) | add to P4a |
| Live transcript | `call_live_transcripts` via Supabase Realtime (P4a webhooks write it) | P4a draft |
| Coach (rules) | port `call-content.js` rules as PACK content: `packs/<id>/coach-rules.json` (door_to_door = DoorBoss words verbatim; solar_exit same; wholesale_re = Cole's objection lines); same matcher (`kwRx`, `matchRules`, token fill) in `src/lib/coach/rules.ts` | to build |
| Coach (LLM proposals: say next, disposition, stage, next action, field fill) | `CoachPanel` + `coach-suggest`/`coach-decide` (P4b) | P4b draft |
| "The AI heard" field-fill | P4b `field_fill` kind -> writes `leads.custom_fields` on accept; UI = same Use / No rows | P4b draft |
| Ask AI | `ask-ai` edge fn later: company-scoped SQL over leads/calls/pipeline + pack playbook; port `rep_assistant.py` prompt rules (no prices/legal/free, untrusted data) | later |
| Share slides | VIDEO mode only (Daily) | later |
| Two-tap End, embed postMessage | keep two-tap; embed not needed (native React) | to build |
| Transcript to the record | `call_logs.transcript` built from `call_live_transcripts` on hangup + lead timeline entry | add to P4a webhooks |
| After-call diarization | recording_url -> ElevenLabs Scribe -> replace `call_logs.transcript` (reuse DoorBoss `recordings.py` flow as an edge fn or Hermes cron) | later |

## Build order for the screen
1. `CallWorkspace.tsx` shell (header status line, controls row, three columns: transcript / AI heard / coach) styled with shadcn.
2. PHONE mode wired to BrowserPhone + Realtime transcript + CoachPanel (P4a + P4b).
3. Coach rules per pack + chips.
4. Consent gate -> provider record/transcribe.
5. VIDEO / IN-PERSON via Daily (reuse DoorBoss service), then Ask AI.
