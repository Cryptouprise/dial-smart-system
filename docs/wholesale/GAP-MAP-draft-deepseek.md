Assumption: "every row from the feature inventory" = every feature named in DIALER-FEATURES.md sections 1–2; features the inventory lists without a class are marked UNKNOWN in the class column.

| feature | class | Dial Smart today | what closes the gap | effort | plan phase |
|---|---|---|---|---|---|
| Click-to-call | table stakes | PARTIAL — no browser-calling code exists (PLAN.md:19); API `POST /v1/calls` exists but the whole gateway returns 503 before auth (02-api.md:86) | Telnyx browser phone + `telnyx-voice-token`/`telnyx-call-control`; extend `outbound-calling` | L | 4 |
| Power / progressive dialer | table stakes | PARTIAL — predictive pacing by `calls_per_minute` exists (PLAN.md:48) but no human browser dialing (PLAN.md:19) | DoorBoss call workspace in PHONE mode over the existing `call-dispatcher` queue | L | 4 |
| Voicemail drop | table stakes | HAVE — broadcast audio voicemail drop (PLAN.md:49) | none | S | — |
| Local presence | table stakes | HAVE — local presence / number rotation (PLAN.md:49) | none | S | — |
| AMD | table stakes for multi-line | HAVE — AMD present (PLAN.md:49); `twilio-amd-webhook` parses `AnsweredBy` (03-sms-voice.md:62) | none | S | — |
| Notes, recording | table stakes | HAVE — call recording URL (PLAN.md:50); recording only as a SIP trunk setting (03-sms-voice.md:66) | none | S | — |
| Dispositions | table stakes | HAVE — dispositions with auto_actions (PLAN.md:49) | none | S | — |
| Call scripts on screen | table stakes | PARTIAL — `agent_scripts` rows seeded per pack (PLAN.md:26); no call screen yet (PLAN.md:19) | render `agent_scripts` in the DoorBoss workspace | M | 4 |
| Hold / transfer / conference | table stakes | MISSING — no `<Conference>` TwiML anywhere (03-sms-voice.md:69); conference/IVR/forward-to-cell listed "Not now" (PLAN.md:62) | new Telnyx call-control actions | L | later |
| AI summary | table stakes in 2026 | HAVE — transcript + AI analysis + sentiment + summary (PLAN.md:50) | none | S | — |
| Auto CRM log + update | table stakes | HAVE — `call_logs` row + lead timeline entry + field-fill (PLAN.md:27) | none | S | — |
| Follow-up tasks / sequences | table stakes | HAVE — workflows/sequences (PLAN.md:49) | none | S | — |
| SMS after call from same number | table stakes | PARTIAL — SMS send is hard-disabled with `SMS_EGRESS_NOT_CERTIFIED` (03-sms-voice.md:5) | phase 5 org-scoped texting, then re-enable `sms-messaging` | M | 5 |
| Call lists/queues | table stakes | HAVE — `dialing_queues`, `campaign_leads` (02-api.md:31, 35) | none | S | — |
| Filters + saved/shareable queues | table stakes | PARTIAL — `POST /v1/leads/search` filters exist (02-api.md:29) but gateway is 503 (02-api.md:86); no saved-queue UI shown | saved-queue UI over `searchLeads` | M | later |
| Callbacks | table stakes | PARTIAL — `next_callback_at` on leads (02-api.md:27); no callback queue shown | callback queue over `dialing_queues` | M | later |
| Re-queue after outcome | table stakes (GHL: differentiator) | HAVE — `POST /v1/campaigns/:id/retry-failed` requeues (02-api.md:41) | none | S | — |
| Import caps | table stakes | UNKNOWN — no cap shown; `bulkCreateLeads` max 500 per call (02-api.md:30) | UNKNOWN — would be answered by billing/plan config | S | later |
| Calendar booking | table stakes | HAVE — Google + GHL calendar booking (PLAN.md:49) | none | S | — |
| DNC + known-litigator scrub | table stakes for real estate | PARTIAL — DNC list exists (PLAN.md:49); `markLeadDnc` upsert supplies `phone_number` not `phone_number_normalized` (02-api.md:96); no litigator scrub found | fix `markLeadDnc` conflict column; add litigator list to `dnc_list` | M | 1 |
| Spam-label / reputation monitoring | table stakes now | PARTIAL — number health metrics + spam scoring columns (PLAN.md:49); `GET /v1/phone-numbers/health` unreachable (02-api.md:86) | surface health in UI; extend `phone_numbers` health columns | M | later |
| Number health | table stakes now | PARTIAL — health metrics + spam scoring columns exist (PLAN.md:49); API route 503 (02-api.md:86) | same as above | M | later |
| Listen/whisper/barge | table stakes | MISSING — no whisper/barge (PLAN.md:19) | Telnyx call-control listen/barge on the browser leg | L | later |
| Live floor dashboards | table stakes | PARTIAL — `GET /v1/campaigns/:id/live-stats` exists (02-api.md:39) but 503 (02-api.md:86) | dashboard over `live-stats` | M | later |
| TCPA hours by contact time zone | differentiator | PARTIAL — calling hours by campaign timezone (PLAN.md:49), not contact timezone | per-lead timezone check in `call-dispatcher` | S | later |
| Parallel / multi-line | differentiator | MISSING — no parallel human dialing (PLAN.md:19) | multi-leg dial on `telnyx-call-control`, connect on human answer | L | later |
| Predictive | differentiator, call-center tier | HAVE — predictive dialing, pacing by `calls_per_minute` (PLAN.md:48) | none | S | — |
| Preview dialer | differentiator | MISSING — no preview mode shown | preview mode on the DoorBoss workspace | M | 4 |
| Number rotation / auto-replace | differentiator | PARTIAL — rotation_enabled, daily caps, quarantine (PLAN.md:49); no auto-replace shown | auto-replace on quarantine in `phone_numbers` | M | later |
| Live transcript | differentiator | MISSING — no live transcript (PLAN.md:19); `telnyx-transcription` planned (PLAN.md:27) | `telnyx-transcription` real-time webhook into the workspace | L | 4 |
| AI coach / real-time assist | differentiator | MISSING — no live coach (PLAN.md:19); coach prompt planned (PLAN.md:27) | coach prompt = pack scripts + lead record + live lines (PLAN.md:27) | L | 4 |
| Recording consent notice | differentiator | MISSING — not found in material | consent line in the workspace before dial | S | 4 |
| Noise cancellation | differentiator | MISSING — not found in material | UNKNOWN — would be answered by the WebRTC client config | M | later |
| Auto-disposition | differentiator | PARTIAL — coach proposes disposition, rep accepts (PLAN.md:41-43); not automatic | coach proposal + one-tap accept via `disposition-router` | M | 4 |
| Pipeline stage move | differentiator | HAVE — disposition-router moves stages (PLAN.md:49); coach stage moves run through it (PLAN.md:44) | none | S | — |
| QA/call scoring | differentiator | MISSING — no QA scoring UI (PLAN.md:19) | score from `call_logs.ai_analysis` + `coach_feedback` | M | later |
| Leaderboards | differentiator | MISSING — no leaderboards (PLAN.md:19) | aggregate `call_logs` per user | M | later |
| Free admin seat | differentiator | UNKNOWN — not found in material | UNKNOWN — would be answered by the billing/plan config | S | later |
| International | UNKNOWN | UNKNOWN — not found in material | UNKNOWN — would be answered by `phone_numbers` provider config | M | later |
| Included number pools | UNKNOWN | UNKNOWN — not found in material | UNKNOWN — would be answered by the billing/plan config | M | later |
| Salesforce/HubSpot sync | UNKNOWN | MISSING — only GHL contact sync shown (PLAN.md:49) | new connector | L | later |
| Open API | UNKNOWN | PARTIAL — API gateway with scoped keys exists (PLAN.md:49) but hard-disabled, 503 before auth (02-api.md:86) | re-enable gateway after certification | M | later |
| Mobile apps | UNKNOWN | PARTIAL — mobile PWA (PLAN.md:49); no native iOS/Android shown | none | S | — |
| Per-user/per-list reporting | UNKNOWN | PARTIAL — `GET /v1/system/stats` and `live-stats` exist (02-api.md:53, 39) but 503 (02-api.md:86) | reporting UI over those routes | M | later |
| Deep analytics upsell | UNKNOWN | UNKNOWN — not found in material | UNKNOWN — would be answered by the billing/plan config | M | later |
| STIR/SHAKEN | UNKNOWN (unverified everywhere, DIALER-FEATURES.md:51) | PARTIAL — attestation column exists but nothing acts on it (PLAN.md:19) | act on the attestation column in number selection | M | later |
| Consent logs | UNKNOWN (unverified everywhere, DIALER-FEATURES.md:51) | UNKNOWN — not found in material | UNKNOWN — would be answered by the schema/migration files | M | later |
| Porting | UNKNOWN (unverified everywhere, DIALER-FEATURES.md:51) | UNKNOWN — not found in material | UNKNOWN — would be answered by the `phone_numbers` provider config | M | later |
| SOC 2 | UNKNOWN | UNKNOWN — not found in material | UNKNOWN — would be answered by compliance docs | L | later |

Where Dial Smart + the DoorBoss call workspace BEAT every product in the list:
1. Live transcript + live AI coach + field-fill + Ask AI in one screen, with the coach proposing disposition and pipeline stage the rep accepts in one tap (PLAN.md:11-12, 41-43) — no listed product shows coach-driven pipeline moves.
2. Coach learns per company from recorded accept/correct feedback (`coach_feedback` few-shot) (PLAN.md:42-44) — no listed product shows per-team coach learning.
3. Accepted stage moves run through the existing `disposition-router`, so pipelines, tags, workflows and sequences fire as today (PLAN.md:44-45) — beats GHL's 10-disposition cap (DIALER-FEATURES.md:28, 69).
4. Speaker-labelled transcript after the call plus every call on the customer's timeline (PLAN.md:12, 27) — no listed product shows a per-lead call timeline.
5. Predictive AI dialing and the human browser dialer share one queue and one coach (PLAN.md:8-9, 27) — no listed product shows AI caller and human dialer on one coached screen.