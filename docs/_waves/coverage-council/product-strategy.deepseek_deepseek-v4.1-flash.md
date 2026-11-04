# The defensible product strategy - reviewer deepseek/deepseek-v4.1-flash

cost: $0.0040

---

## 1. The one thing (salesperson's sentence)

**"One system for the door and the dial — and the coach on the call uses the playbook for your vertical, not a generic script."**

Grounded in: the pack registry declares verticals (`src/lib/packs.ts:14` — `['solar_exit','wholesale_re','door_to_door']`), only `door_to_door` has a built pack (12 files / 7,666 LOC, `docs/dial-smart-app-map.md:29,123`), and the live-call coach is pack-scoped — `coachContentForPack('door_to_door')` returns `DOOR_TO_DOOR_COACH` (`src/lib/coach/packContent.ts:11,14`; asserted at `src/lib/__tests__/coachRules.test.ts:190-198`). The coach is a real endpoint, not a mock: `coach-suggest` POSTs `{call_log_id, through_seq}` with rate limiting (`supabase/functions/coach-suggest/index.ts:2,100`).

**THEORY:** that no competitor does this. I have no competitor evidence. What I can ground is that *this* product couples a vertical pack to per-vertical coaching rules, which is unusual plumbing.

**Honest caveat the salesperson must not skip:** the doorstep-booking → callback half is dead code today — `call-dispatcher/index.ts:19` `isCallbackAutomationCertified()` returns `false` (`docs/dial-smart-app-map.md:139-140`). Do not say "and it calls them back automatically."

## 2. First paying customer, and week one

**Who:** a door-to-door canvassing operation (solar or home services). **THEORY** on the segment; grounded in that `door_to_door` is the only vertical with code (`docs/dial-smart-app-map.md:29,123`) while `solar_exit` and `wholesale_re` are declared IDs with no pack directory in evidence (`src/lib/packs.ts:14`).

**What we sell in week one — a supervised pilot, not the platform:**
- Their territory, properties, knocks and appointments loaded into the d2d pack (`docs/dial-smart-app-map.md:49-50`).
- `coach-suggest` running on their reps' live calls, plus transcript analysis (`analyze-call-transcript` 758 LOC, `docs/dial-smart-app-map.md:78`).
- A weekly readout. Manual onboarding, **manual invoicing** — Stripe secrets are believed missing in the live environment (`docs/dial-smart-app-map.md:138`), so the product cannot take money this week.

**Preconditions before any live traffic:** rotate the believed-leaked Telnyx key and set `WEBHOOK_SECRET_TELNYX`, or `voice-call-events` returns 503 (`docs/dial-smart-app-map.md:136-137`). **THEORY:** that a 503 there degrades live-call data feeding the coach.

## 3. What must be true to renew after month one

1. **The coach is not silent.** `coach-suggest` degrades to `{proposals: []}` on LLM failure (`supabase/functions/_shared/lithos.ts:80`; `coach-suggest/index.ts:244`). Empty output looks identical to "nothing to say." **THEORY:** renewal requires non-empty proposals that the customer rates useful on real doorstep calls.
2. **The appointment lands where they already work.** The native callback can't fire (`docs/dial-smart-app-map.md:139-140`), so either fix that boolean or push appointments into their existing CRM — the GHL surface is deep and already built (`ghl-integration` 1,225, `ghl-webhook-trigger` 424, `ghl-batch-callback` 617, `ghl-shadow-ingest` 148; `docs/dial-smart-app-map.md:97-98`). **THEORY:** renewal depends on Dial Smart not having to be the system of record.
3. **Recording consent is captured.** The consent "Record" switch is an open item (`docs/dial-smart-app-map.md:143`). **FACT** it's open; **THEORY** that it's a legal exposure in door-to-door + outbound calling.
4. **Billing works.** Stripe secrets believed missing (`docs/dial-smart-app-map.md:138`) — **THEORY:** renewal stays manual until fixed.

## 4. Three things to STOP building

1. **Voice broadcast.** `VoiceBroadcastManager.tsx` is 3,054 lines — the single largest component — plus `voice-broadcast-engine` 2,453, `voice-broadcast-queue` 462, `useVoiceBroadcast` 701 (`docs/dial-smart-app-map.md:63-64`). ~6,700 lines for the capability furthest from the differentiator and closest to the compliance edge.
2. **The autonomous AI managers.** `ai-autonomous-engine` is the largest edge function at 5,645 LOC, with `MissionBriefingWizard` 1,838, `AutonomousAgentDashboard` 1,274 and four hooks (`docs/dial-smart-app-map.md:72-74`). AI managing AI, for a product with zero external tenants (`docs/dial-smart-app-map.md:130`).
3. **The owner's "last pieces" — ads, cold email, phone-number scraping** (`docs/dial-smart-app-map.md:154-156`). Evidence they're barely started: `email-sender` 111 lines, `demo-scrape-website` 283 lines (`docs/dial-smart-app-map.md:117,120`). These are acquisition channels for a product that hasn't retained customer one.

*Runner-up, not in the three:* carrier sprawl — Twilio, Telnyx and Retell all live at once (`docs/dial-smart-app-map.md:44-45`) with `SipTrunkManager` 1,180, `TwilioNumbersOverview` 1,632, `PhoneNumberPurchasing` 742, `useMultiCarrierProvider` 387, `carrierRouter` 227 (`docs/dial-smart-app-map.md:90-91`). Three carriers is three leak surfaces, and one already leaked (`docs/dial-smart-app-map.md:137`).

## 5. The honest risk, and the earliest signal

**The risk is not that the code is bad. It's that it's a platform with no tenant.** The live org's sole member is owner *and* platform admin (`docs/dial-smart-app-map.md:130`) — there is no second user. 160,832 lines, 110 edge functions, 199 migrations (`docs/dial-smart-app-map.md:25,33,34`) were built before a buyer existed, and the differentiator (pack-scoped coaching) can't be evaluated without adopting the whole platform first. **THEORY.**

**Earliest signal (THEORY):** whether one named canvassing operator will let you load their real territory and run one crew for two weeks — free, with their data. Not a demo. A signed pilot. If you cannot get one operator to say yes to that, the product never sells, and no amount of ads/cold-email/scraping (`docs/dial-smart-app-map.md:154-156`) changes it.

**Second signal (THEORY):** on those real calls, are `coach-suggest` proposals non-empty and rated useful? If the coach is silent or generic, the one differentiator is dead — and the `{proposals: []}` degradation path (`lithos.ts:80`) means you can lose it without an error.

**What I did NOT check:** I did not open any file beyond the supplied grep hits; I did not read `packs.ts` past lines 14 and 69-70, or any of the d2d pack source; I did not verify whether `solar_exit`/`wholesale_re` have any code; I did not verify the live Supabase project, Stripe/Telnyx secret state, or the callback boolean; I did not read pricing, contracts, or any customer data; I did not check any competitor.

**Confidence: medium** — repo facts are cited, but every strategic claim is inference from one census document plus three grep hits.
