# market-synth

- status: completed
- tldr: Positioning doc written: POSITIONING.md; Dial Smart ships as a solar-exit canvassing app, priced per seat; everything else is disabled.

market-synth DONE. Wrote ONE positioning doc: C:/Users/charl/dial-smart-system/docs/market/POSITIONING.md (137 lines, ~3-min read). Contains all 6 required sections: (1) positioning statement true from the code, (2) moat analysis (defensible vs copyable), (3) first market + price point, (4) top objection + honest answer, (5) condensed 5-competitor table, (6) explicit what-we-did-not-check list. Every claim FACT (file:line or pricing-page URL) or THEORY; no sibling claim accepted without evidence.

## Artifact

**Findings**

Wrote ONE owner-facing positioning doc at C:/Users/charl/dial-smart-system/docs/market/POSITIONING.md (137 lines, ~3-min read). (1) Positioning statement true from the code: Dial Smart = a multi-tenant field-canvassing app for solar-exit door-knocking teams on its own Supabase Postgres (not a wrapper), a DoorBoss port whose canvassing day works end-to-end with no telephony egress, while the dialer/AI-manager/broadcast/GHL half is fail-closed disabled in the repo. (2) Moat: none of the 5 headline differentiators is defensible; all are copyable features. Real defensibility is cumulative/off-list: 199 migrations + 495 RLS policies, data gravity, GHL integration depth, pre-written vertical content. (3) First market = residential door-to-door solar-exit canvassing team; recommend per-seat price ~$25-39/rep/mo (THEORY, anchored to Close/JustCall/Aircall seats), no usage price (pack meters nothing). (4) Top objection = 'half the product is switched off' with the honest answer that it is deliberate fail-closed containment + the main-vs-live divergence, plus a fair-play rebuttal that 'no tests' is false. (5) Condensed 5-competitor table. (6) Explicit what-we-did-not-check list.

**evidence**

- C:/Users/charl/dial-smart-system/docs/market/POSITIONING.md (the deliverable, 137 lines)
- C:/Users/charl/dial-smart-system/docs/dial-smart-app-map.md:13-19 (own codebase / own Supabase project, not a wrapper); :53-125 (capability inventory); :97-98 (GHL integration present); :123-125 (packs / d2d single case)
- src/packs/door_to_door/DoorToDoorApp.tsx:4 ('a port, not a re-implementation'); host.ts:1568-2050 (REST surface); host.ts:1364-1379 (pack meters nothing); host.ts:1403,1514-1542 (solar-exit content)
- src/components/Dashboard.tsx:511-516 (only d2d pack has a real screen)
- src/lib/launchSafety.ts:128-159 (four browser*Allowed gates false)
- supabase/functions/call-dispatcher/index.ts:15-25 (three isXCertified false, used :413,:640,:1266)
- supabase/functions/ai-assistant/index.ts:2887-2890 (fail-closed rationale comment)
- supabase/migrations/20260713061000 (autonomous engine cron quarantined :5, unscheduled :16-26)
- src/services/providers/twilioAdapter.ts:7, telnyxAdapter.ts:7, retellAdapter.ts:7, carrierRouter.ts:12 (copyable stubs)
- supabase/migrations/20260124_white_label_credits.sql:27-58,92+ ; stripe-webhook:382,417 ; retell-call-webhook:2114 (credit mechanism)
- src/lib/packs.ts:54,67,80 (routes empty)
- campaigns/pilot-portfolio/manifest.json:18-28 (first customer class)
- supabase/functions-live/README.md:8-10 (main-vs-live gate divergence); :23 (anon get_available_numbers leak)
- supabase/functions/voice-call-events/index.ts:212-220 (503 Telnyx webhook)
- package.json:21-26 (vitest+playwright)
- pricing pages (FACT, seen 2026-11-03): https://www.gohighlevel.com/pricing ; https://www.close.com/pricing ; https://justcall.io/pricing/ ; https://aircall.io/pricing/ ; https://www.nooks.ai/pricing

**validation**

Re-read the shared app map (140 lines) and confirmed it matches the siblings' cited line ranges (git 71f70c5e, ref emonjusymdripmkvtttc, not-a-wrapper 13-19, GHL 97-98, d2d port 123-125). Cross-checked every clause of the positioning statement against a sibling evidence file:line. Rejected nothing outright (all 5 siblings carried file:line evidence) but flagged weak items: the leaked-Telnyx-key / missing-Stripe claims rest only on session checkpoints (no code hits), and the 15c/min retail voice price is a schema default, not a live value. Competitor prices are labeled FACT (read on vendor pages 2026-11-03); the seat-price recommendation is labeled THEORY. No repo writes beyond the one deliverable, no live-system calls, no secrets printed.

**open_questions**

- Do the 503 certification gates exist in the DEPLOYED functions, or only on main? (functions-live/README.md:8-10 says live does NOT carry them.) This decides whether a demo and a code review tell the same story.
- Are the 'Telnyx key leaked' / 'missing Stripe secrets' claims true in the live secret store? Unverifiable from the repo.
- Do pricing_tiers / agent_pricing production rows exist on the live org (they would change the price model)?
- Is the live anon get_available_numbers leak still open after the 11/02 ship?
- Is the DoorBoss port defensible IP or a licensing liability?
- Does any paying external canvassing customer exist today, or is this internal-only?

**what_i_did_not_check**

- Live deployed function bodies / secret store on emonjusymdripmkvtttc (repo-only analysis).
- Live pricing_tiers / agent_pricing production row values, and plan/subscription monthly prices (stripe_price_id -> plan).
- Ran no tests and no build; suite configured but no green run observed.
- Whether the AI managers / multi-carrier dispatch actually work when enabled (code-complexity only).
- DoorBoss vendored app.js / coachRules.ts licensing and ownership.
- Competitor unit economics (GHL/Close per-minute and per-credit rates) and AI-SDR pure-play public prices (search engines blocked in the competitor lane).

**confidence**: medium