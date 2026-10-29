# Dial Smart -> one app for many companies, with industry packs and a coached call screen

Owner: Charles. Foreman: Fable (reviews, runs, deploys, holds every key). Crew: DeepSeek V4.1 on Lithos (drafts code, red-teams).
Drafts this plan was merged from: `PLAN-draft-deepseek.md`, `AMAZING-draft-deepseek.md`. Audit facts: `audit/out/*.md`. Kanban P1731.
Date: 2026-10-28. Branch: `wholesale` (off GitHub main d370432f).

## What we are building
One app. Every company gets the shared core: team logins + roles, contacts, a dialer their PEOPLE use from the browser AND the AI
caller (Grace), texting, numbers, Do Not Call, billing with an automatic access lock. At sign-up a company picks one or more
INDUSTRY PACKS (Solar Exit, Wholesale Real Estate; later Mortgage, Law Firm), each a set of screens, fields, pipeline stages and
scripts. The call screen is the DoorBoss call workspace brought over whole: live transcript, live AI coach, field-fill, Ask AI,
recording, speaker-labelled transcript after the call, every call on the customer's timeline.

## Facts settled against the live DB (Fable, 10/28)
- Live DB has ONE company ("Default Organization": 3,298 leads, 40 numbers). Never tested with a second company.
- `leads.custom_fields jsonb` EXISTS live (DeepSeek draft said missing). `call_logs.lead_id` exists. `organizations.settings jsonb` exists.
- The July 2026 safety migrations in the repo (tenant triggers, delete guards, RLS lockdowns) were NEVER applied live.
- Texting tables (`sms_messages`, `sms_conversations`) are per-user; unknown inbound texts fall back to "most recent user".
- No browser-calling code exists. Telnyx numbers, Telnyx AI calls and a Telnyx SMS path exist.

## Phases (build order)
| # | Phase | Size | Proof it works |
|---|---|---|---|
| 1 | ✅ DONE 10/29 (reshaped). Live had 10 Aug migrations the repo lacked (now in `audit/phase1/live_only/`); repo had 30 July migrations never applied; DeepSeek review (`phases/out/p1-reconcile.md`) = 7 HOLD incl. the tenancy core, so they were NOT applied. Instead migration `20261029142121_phase1_org_scope` (Fable): backfilled every NULL organization_id, default-org BEFORE INSERT trigger, company-membership RLS added beside the per-user RLS on 8 core tables, `tenant_scope_guard` (write only your own company, no org hop), NOT NULL on leads/campaigns/phone_numbers/call_logs | S | verified live: 0 NULLs, 32 "Company ..." policies, 16 triggers, 4 NOT NULL |
| 2 | Packs: storage + screens. `organizations.settings.packs`, one `useEnabledPacks()` hook, sidebar groups + routes gated | M | set packs on the live org, only that pack's screens show; unset, they hide |
| 3 | Packs: fields, stages, scripts. On enable, seed `dispositions`/`pipeline_boards`/`agent_scripts` rows for that company; pack field schema in `custom_fields` | M | enable a pack, rows exist for this company and are invisible to another |
| 4 | Call screen = DoorBoss workspace + Telnyx browser phone. Edge fns `telnyx-voice-token`, `telnyx-call-control` (webhook, service role), `telnyx-transcription` (real-time transcript -> coach). `call.html?embed=1` at a protected route in PHONE mode: audio = the Telnyx WebRTC leg, transcript = Telnyx real-time webhook (no Daily room needed for phone mode; Daily stays for video mode). Coach prompt = pack scripts + lead record + live lines. Caller ID must be a number this company owns. DNC check before dial. After call: recording -> Scribe diarize -> replace transcript; `call_logs` row + lead timeline entry + field-fill into `custom_fields` | L | place a browser call to Charles's test number; coach lines appear live; `call_logs` row with `telnyx_call_control_id` + `recording_url`; transcript on the lead |
| 5 | Texting per company: `organization_id` on sms tables, RLS rewritten, "most recent user" fallback removed, per-company AI-reply switch | M | two teammates see one thread; a second company sees none |
| 6 | Billing lock: Stripe subscription -> `subscription_status`; `ProtectedRoute` + RLS hide everything for a locked company except a "paused" banner | M | set status past_due, users are locked out; set active, back in |

Wholesale pack (Cole's machine) ships on phase 3's mechanism: properties, distress list, call list, offers (Accept/Counter link),
deals. Its tables are the `wh_*` migration already drafted + red-teamed (`supabase/migrations/20261028210000_wholesale_core.sql`,
NOT applied). Solar Exit pack = what Solar Freedom runs today, wrapped.

## Added by Charles 10/28 (after the second pass)
- **Two carriers, not one.** The browser phone works on Telnyx AND Twilio. One `provider` switch per company/number; the
  token endpoint, call-control webhook and transcript feed each have a Telnyx and a Twilio implementation behind the same interface.
  Twilio: Voice JS SDK + TwiML app + Media Streams/real-time transcription. Telnyx: WebRTC SDK + Call Control + real-time transcription.
- **DoorBoss is a third pack.** The door-to-door app (knock list, intake, canvassing map, the call workspace) ships as the
  "Door-to-Door" pack on the same mechanism as Solar Exit and Wholesale. Its call workspace is the shared call screen for all packs.
- **The coach drives the pipeline.** During and after the call the coach proposes: disposition, pipeline stage ("we think this goes
  to Offer Sent, correct?"), next action and follow-up. The rep accepts or corrects with one tap. Every accept/correct is recorded
  (`coach_feedback`: proposed vs chosen, transcript snapshot, pack, company) and feeds back into the coach prompt per company
  (few-shot from its own corrections) so it gets better for that team. Accepted stage moves run through the existing
  `disposition-router` path so pipelines, tags, follow-up workflows and sequences fire exactly as they do today.
- **Feature parity with the popular dialers** (GHL dialer, Kixie, PhoneBurner, JustCall, Aircall, Dialpad, CallTools, Mojo,
  ReadyMode, BatchDialer...). Research agent `dialer-feature-research` is building the master feature list; DeepSeek then maps
  it against what Dial Smart already has; gaps become phase-4/5 items. Dial Smart already has: power/predictive dialing,
  AMD, voicemail drop (broadcast), local presence/number rotation, DNC, calling-hours by timezone, dispositions, pipelines,
  workflows/sequences, SMS, call recording, transcripts + AI analysis, campaign compliance, number health.

## 🚨 Repo vs live have diverged BOTH ways (Fable, 10/28)
- Live DB is missing the July 2026 migrations (tenant triggers, lockdowns).
- GitHub main's edge functions (commits a8393da5 2026-07-13 "Solar Exit certification gates", 429e1a6a 2026-07-03) contain
  **certification gates that return 503**: `sms-messaging send_sms` -> `SMS_EGRESS_NOT_CERTIFIED` ("Physical SMS egress is disabled in
  the Retell-only launch profile"); `api-gateway` -> `EXTERNAL_API_NOT_CERTIFIED` / `API_SMS_TENANT_SCHEMA_NOT_CERTIFIED`.
  The LIVE functions do not have these gates (the MCP sent SMS and read stats on 10/28). So the live Supabase runs OLDER function
  code than main. **Deploying any function from main as-is would switch off texting and the API.** Phase 1 must first decide, per
  function, which version is truth, and the gates must be lifted (or made per-company) before any deploy. Gap map: `GAP-MAP-draft-deepseek.md`.
- Feature research: `research/DIALER-FEATURES.md`. Dial Smart HAS most table stakes; MISSING table stakes = human click-to-call /
  power dialing from the browser (phase 4), hold/transfer/conference, whisper/barge, SMS-after-call (blocked by the gate above);
  PARTIAL = DNC (no litigator scrub, `markLeadDnc` conflict-column bug), spam/number-health UI, saved queues, callbacks, live floor.

## Live phone transcript: decision
Telnyx Call Control real-time transcription webhook (lowest latency, moderate build). VERIFY against Telnyx docs before phase 4.
Fallback: stream browser audio to a streaming STT. Record-then-Scribe stays as the after-call pass, never the only one.

## Before company #2 is onboarded (ranked by risk)
1. Texting leak (phase 5). 2. Safety migrations (phase 1). 3. Teammates can't edit each other's leads (`user_id = auth.uid()` on
UPDATE policies; `campaign_leads`/`dialing_queues` have no org id). 4. `user_roles` is global, not per company. 5. Caller-ID
ownership check. 6. `markLeadDnc` upsert conflict column bug. 7. Per-company AI texting off switch.

## Not now
API gateway rebuild; Twilio paths (Telnyx chosen); conference/IVR/forward-to-cell; START re-subscribe; a pack_config table; Mortgage and Law Firm packs (mechanism first, two packs shipped).

## Open with Charles
- Yes/no to live Dial Smart DB changes (phase 1 and the wh_* tables).
- Telnyx: key on disk, or Charles pastes one at phase 4.
- Stripe product/prices for the subscription (phase 6).
