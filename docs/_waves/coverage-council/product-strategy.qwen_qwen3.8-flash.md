# The defensible product strategy - reviewer qwen/qwen3.8-flash

cost: $0.0055

---

## 1) One-sentence wedge

**Salesperson sentence:**  
“DoorBoss is the only canvassing workspace that puts door-to-door territory work, AI voice campaigns, and autonomous campaign management into one multi-tenant app.”

- **FACT:** The repo has a `door_to_door` pack with territories, properties, knocks, workspace, and appointments mounted into the same shell [docs/dial-smart-app-map.md:49-51,123-125].  
- **FACT:** It also has AI voice/call capabilities, SMS, calendar/appointments, and an autonomous AI engine in the same product [docs/dial-smart-app-map.md:46-48,62-65,71-75,102-104].  
- **FACT:** It is described as one login, one database, many capabilities, multi-tenant with organization scoping [docs/dial-smart-app-map.md:13,127-132].  
- **THEORY:** “Only” / “no competitor does” is not grounded in supplied evidence; there is no competitor comparison in the repo excerpts.

## 2) First paying customer and week-one sale

**First paying customer:**  
A door-to-door / canvassing sales team that already has territory lists, property/knock records, and needs appointments booked.  
- **FACT basis:** The only implemented pack is `door_to_door`, covering territories, properties, knocks, workspace, appointments [docs/dial-smart-app-map.md:49-51]; D2D tables have 36 RLS policies [docs/dial-smart-app-map.md:131]; D2D core migration is referenced in `src/lib/d2dApi.ts` [src/lib/d2dApi.ts:6,11].  
- **THEORY:** This is the best first customer because the repo already carries the D2D vertical, not because customer evidence was supplied.

**Exactly what we sell in week one:**  
A paid, fixed-scope **Door-to-Door AI Voice Pilot**, not the whole platform.

Week-one deliverables:
1. Import their lead / property list.  
   - **FACT:** Lead import/upload components exist [docs/dial-smart-app-map.md:85-86].
2. Run one small AI voice broadcast campaign.  
   - **FACT:** Voice broadcast manager/engine exist [docs/dial-smart-app-map.md:62-65].
3. Use the D2D workspace to log knocks and create appointments manually.  
   - **FACT:** D2D pack includes knocks and appointments [docs/dial-smart-app-map.md:50]; calendar/follow-up components exist [docs/dial-smart-app-map.md:102-104].
4. Deliver a transcript/report review.  
   - **FACT:** Transcript analysis and daily report functions exist [docs/dial-smart-app-map.md:77,114].
5. Apply basic launch/compliance checks.  
   - **FACT:** `launchSafety.ts`, SMS acceptance, and campaign compliance hooks exist [docs/dial-smart-app-map.md:110-111].

**Do not sell in week one:** automatic doorstep callback.  
- **FACT:** Doorstep booking queues a callback that cannot fire while `isCallbackAutomationCertified()` returns `false` [docs/dial-smart-app-map.md:139-140].

## 3) What must be true for month-one renewal

For renewal, the pilot must prove a narrow loop: **list in → voice campaign → knock/appointment recorded → report shows value.**

Must be true:

1. **They actually used the D2D tables.**  
   - **FACT:** D2D pack includes properties, knocks, appointments [docs/dial-smart-app-map.md:50]; D2D tables are RLS-scoped [docs/dial-smart-app-map.md:131].  
   - **THEORY:** Usage predicts renewal.

2. **Voice events are not blocked by telephony secrets.**  
   - **FACT:** `voice-call-events` returns 503 when `WEBHOOK_SECRET_TELNYX` is unset [docs/dial-smart-app-map.md:136].  
   - **FACT:** A Telnyx key is believed leaked and needs rotating [docs/dial-smart-app-map.md:137].  
   - **THEORY:** If voice events fail, renewal is unlikely.

3. **Appointment automation is either certified or explicitly manual.**  
   - **FACT:** Callback automation gate is false [docs/dial-smart-app-map.md:139-140].  
   - **FACT:** Calendar/follow-up tools exist for manual scheduling [docs/dial-smart-app-map.md:102-104].  
   - **THEORY:** They will renew only if the appointment loop is reliable, even if manual.

4. **Consent recording is not an open blocker.**  
   - **FACT:** Consent “Record” switch is listed as open [docs/dial-smart-app-map.md:143].  
   - **THEORY:** For outbound AI voice/SMS, unresolved consent handling threatens renewal.

5. **Billing/credits can meter and invoice.**  
   - **FACT:** Credit dashboard, Stripe webhook, credit management, billing portal, and budget tracker exist [docs/dial-smart-app-map.md:105-107].  
   - **FACT:** Stripe secrets are believed missing in the live environment [docs/dial-smart-app-map.md:138].  
   - **THEORY:** A paying customer cannot renew if billing cannot be trusted.

6. **The report shows attributable appointments or qualified interest.**  
   - **FACT:** Transcript analysis and daily report generation exist [docs/dial-smart-app-map.md:77,114].  
   - **THEORY:** Renewal depends on visible commercial value, not feature breadth.

## 4) Three things we must STOP building

### Stop 1: Stop building additional vertical packs beyond `door_to_door`

- **FACT:** The pack registry already lists `solar_exit`, `wholesale_re`, and `door_to_door` [src/lib/packs.ts:14].  
- **FACT:** The app map says `door_to_door` is the first pack and the only pack folder shown [docs/dial-smart-app-map.md:49-51,123].  
- **THEORY:** More packs before the D2D loop is paid dilutes the wedge.

### Stop 2: Stop building the autonomous AI manager layer until the paid core loop works

- **FACT:** Autonomous AI is large: `ai-autonomous-engine` 5,645 LOC, `MissionBriefingWizard` 1,838, `AutonomousAgentDashboard` 1,274 [docs/dial-smart-app-map.md:72-75].  
- **FACT:** The largest edge function is `ai-autonomous-engine` [docs/dial-smart-app-map.md:74].  
- **THEORY:** This is too much surface area for a product whose first sale should be a narrow D2D voice/appointment pilot.

### Stop 3: Stop building peripheral outbound channels and carrier breadth

- **FACT:** Twilio, Telnyx, and Retell are all present simultaneously [docs/dial-smart-app-map.md:44].  
- **FACT:** Numbers, trunks, purchasing, multi-carrier routing, and rotation already exist [docs/dial-smart-app-map.md:89-92].  
- **FACT:** Email and scraping already exist but are small [docs/dial-smart-app-map.md:116-121].  
- **FACT:** The owner’s future asks include ads, cold email, and scraping phone numbers [docs/dial-smart-app-map.md:154].  
- **THEORY:** More channels and more carrier breadth increase operational risk without proving the D2D wedge.

## 5) Honest risk that this never sells, and earliest signal

**Risk:**  
This may never sell because it is a platform-shaped pile of capabilities rather than a certified, billable, narrow workflow.

- **FACT:** The app is described as one login, one database, many capabilities bolted onto it [docs/dial-smart-app-map.md:13].  
- **FACT:** The measured size is large: 462 `src/` files, 160,832 lines, 110 edge functions, 199 migrations [docs/dial-smart-app-map.md:25-34].  
- **FACT:** Several core operational blockers remain: Telnyx webhook 503 risk, leaked key, missing Stripe secrets, uncertified callback automation, open consent handling, unimplemented new-house geocoding [docs/dial-smart-app-map.md:136-143].  
- **THEORY:** Breadth without a certified paid loop is a strong “never sells” risk.

**Earliest signal that it will not sell:**  
Within week one of the first paid D2D pilot, the customer cannot complete the narrow loop: **import list → run voice campaign → record knock/appointment → see report.**

Specific early failure signals:
1. Voice events return 503 because telephony secrets are unset [docs/dial-smart-app-map.md:136].  
2. Callback automation is expected but remains uncertified [docs/dial-smart-app-map.md:139-140].  
3. Billing/credit metering cannot be trusted because Stripe secrets are believed missing [docs/dial-smart-app-map.md:138].  
4. No non-owner usage appears in the D2D tables after the pilot; the evidence currently names one live org whose sole member is owner/admin [docs/dial-smart-app-map.md:130-131].  
   - **THEORY:** This is a signal, not a proven absence of customers.

## What I did NOT check

- I did not read all 160,832 source lines [docs/dial-smart-app-map.md:25].  
- I did not inspect live Supabase data, actual customer usage, or whether paying customers exist.  
- I did not verify competitor products or “no competitor does” claims.  
- I did not verify live secrets, Stripe configuration, Telnyx key status, or vendor account health.  
- I did not inspect whether `solar_exit` or `wholesale_re` have real pack implementations beyond the registry [src/lib/packs.ts:14].  
- I did not inspect ads functionality because no ads code was supplied.

**Confidence: medium.**
