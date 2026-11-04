# The defensible product strategy

lane: product-strategy  mode: council  reconciled by: manager:deepseek/deepseek-v4.1-flash over 3 reviewers
reviewers: deepseek/deepseek-v4.1-flash, qwen/qwen3.8-flash, google/gemini-3.8-flash
cost: $0.0270 (reviewers $0.0240 + manager $0.0030)
tokens: 9506 in / 6000 out
files: docs/dial-smart-app-map.md

---

## Reconciled answer

**1. One thing.** “The live call coach runs your door-to-door playbook, not a generic script, inside the same system that dials and logs the door.”  
FACT: `door_to_door` is in the pack registry (`src/lib/packs.ts:14`); `coachContentForPack('door_to_door')` returns `DOOR_TO_DOOR_COACH` (`src/lib/coach/packContent.ts:11,14`; test `src/lib/__tests__/coachRules.test.ts:190-198`); `coach-suggest` is a real endpoint (`supabase/functions/coach-suggest/index.ts:2,100`). THEORY: no competitor does this. Do not claim automatic callback: `isCallbackAutomationCertified()` is false (`docs/dial-smart-app-map.md:139-140`).

**2. First paying customer / week one.** A door-to-door canvassing operation. FACT: only `door_to_door` has a pack (`docs/dial-smart-app-map.md:29,49-51,123`); `solar_exit`/`wholesale_re` are IDs only (`src/lib/packs.ts:14`). Sell a supervised pilot: load their territory/properties/knocks/appointments into the d2d pack; run `coach-suggest` on reps’ live calls; transcript/report; manual onboarding and manual invoicing because Stripe secrets are believed missing (`docs/dial-smart-app-map.md:138`). Precondition: rotate Telnyx key / set `WEBHOOK_SECRET_TELNYX`, or `voice-call-events` returns 503 (`docs/dial-smart-app-map.md:136-137`). Do not sell automatic callback (`docs/dial-smart-app-map.md:139-140`). THEORY on segment.

**3. Renewal after month one must be true.**  
- `coach-suggest` returns non-empty, useful proposals on real calls; it degrades to `{proposals: []}` on LLM failure (`supabase/functions/_shared/lithos.ts:80`; `coach-suggest/index.ts:244`). THEORY.  
- Appointment loop is reliable or explicitly manual; native callback cannot fire (`docs/dial-smart-app-map.md:139-140`); GHL integration exists if pushing appointments out (`docs/dial-smart-app-map.md:97-98`). THEORY.  
- Telephony webhooks not 503; Telnyx secret set/rotated (`docs/dial-smart-app-map.md:136-137`). FACT open.  
- Consent “Record” switch resolved (`docs/dial-smart-app-map.md:143`). FACT open; THEORY legal exposure.  
- Billing works or stays manual; Stripe secrets missing (`docs/dial-smart-app-map.md:138`). THEORY.  
- Customer actually uses D2D tables / sees attributable appointments (`docs/dial-smart-app-map.md:50,131`). THEORY.

**4. STOP building.**  
- Autonomous AI managers: `ai-autonomous-engine` 5,645 LOC, `MissionBriefingWizard` 1,838, `AutonomousAgentDashboard` 1,274 (`docs/dial-smart-app-map.md:72-74`).  
- Voice broadcast: `VoiceBroadcastManager` 3,054, engine 2,453, queue 462, hook 701 (`docs/dial-smart-app-map.md:63-64`).  
- Ads/cold email/phone scraping: `email-sender` 111, `demo-scrape-website` 283 (`docs/dial-smart-app-map.md:117,120`); owner asks (`docs/dial-smart-app-map.md:154-156`).  
Runner-up: carrier sprawl — Twilio/Telnyx/Retell all live (`docs/dial-smart-app-map.md:44-45`); one key believed leaked (`docs/dial-smart-app-map.md:137`).

**5. Risk / earliest signal.** Risk: platform with no proven tenant; differentiator unvalidated; core pipes blocked. Earliest signal: cannot get one named D2D operator to sign a two-week real-data pilot. If pilot starts, next signal: narrow loop fails (import list → voice campaign → record knock/appointment → report), especially voice events 503, callback uncertified, billing missing, no non-owner usage. THEORY.

## Disagreements

- **Differentiator:** R1 pack-scoped coach; R2 all-in-one D2D + AI voice + autonomous; R3 door-to-door knocks linked to instant AI outbound and live-coached callbacks. Evidence favours R1: pack-scoped coach is directly grounded; R3’s callback link is dead; R2’s “only” and autonomous are ungrounded/contradicted by stop recommendation.
- **First customer:** R1 solar/home services; R2 door-to-door canvassing; R3 regional residential field-sales. Evidence favours door-to-door canvassing: only `door_to_door` pack exists.
- **Week one:** R1 coach + transcript; R2 voice broadcast + D2D; R3 D2D + outbound dialing. Evidence favours coach-centred pilot because that is the differentiator; voice broadcast is recommended stop.
- **Renewal:** R1 CRM integration/not system of record; R2 D2D usage/report; R3 attributable closed revenue. Compatible; unresolved whether automated callback is required or manual is acceptable.
- **Stop third item:** R1 voice broadcast; R2 additional vertical packs; R3 ad/cold email/scraping. Evidence favours voice broadcast as active large build; additional packs not shown as active.
- **Earliest signal:** R1 pilot signup; R2 narrow loop failure; R3 48-hour callback failure. Evidence favours R1 as earliest; R2/R3 are pilot-internal. R3’s “20 callbacks” is invented.

## Rejected claims

- R2 “DoorBoss” name and “only” claim: no competitor evidence; name not in evidence.
- R2 “autonomous campaign management” as wedge: autonomous is recommended stop.
- R3 “instant AI-assisted outbound phone follow-ups and live-coached callbacks”: callback automation cannot fire (`docs/dial-smart-app-map.md:139-140`).
- R3 “High confidence”: no competitor/customer evidence.
- R3 “20 doorstep callbacks in 48 hours”: number not grounded.
- R1 “zero external tenants”: only one live org shown; not proof of zero customers. THEORY.
- R2 “stop additional vertical packs”: no evidence of active pack builds beyond registry IDs.

## None checked

Competitors, market, pricing, contracts, actual paying customers; live Supabase data beyond one org; secrets/Stripe/Telnyx state; full d2d pack, `call-dispatcher`, `coach-suggest` source beyond grep; whether `solar_exit`/`wholesale_re` have code; ads code; legal/compliance specifics; whether coach proposals are useful.

**Confidence: medium-low.** Next check: get one named D
