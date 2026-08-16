# Law Firm AI Intake Beta — QA Checklist

Use this checklist before every meaningful production publish.

## Environments
- GitHub `main` is source of truth.
- Confirm Supabase project `emonjusymdripmkvtttc` is ACTIVE_HEALTHY.
- Confirm `demo-call` production Edge Function version matches intended GitHub code.
- Confirm Lovable preview has ingested latest GitHub commit.
- Confirm production publish has completed after the latest code batch.

## Desktop browser flow

### `/law-firms`
- Page loads without console/runtime error.
- Hero copy is visible without scrolling.
- Website input is immediately understandable.
- CTA is enabled only when URL is entered.
- Law-firm page does not use outbound-only 2,000-calls/day framing.
- Expansion cards appear below the primary wedge, not before it.

### Direct legal demo entry
- Submitting a website from `/law-firms` opens legal demo mode.
- User does not see generic workflow selection unless intentionally navigating from generic `/demo`.
- Website scraper starts automatically.
- Back action returns to `/law-firms`.

### Website scraper
Test at least:
- Personal injury firm.
- Criminal defense firm.
- Immigration firm.
- One non-law-firm site as a regression case.

Verify:
- Firm/business name is correct.
- Practice/service summary is reasonable.
- Knowledge base is not polluted with unrelated industry content.
- Failure state is clear if scrape fails.
- No fallback to solar or unrelated business context.

### Legal inbound setup
- Starts at top of viewport.
- Slider labels fit on common laptop widths.
- Inputs update summary math immediately.
- Total call volume, new-prospect %, and missed-prospect % are conceptually distinct.
- Existing-client/vendor traffic is excluded from revenue-at-risk math.
- Zero-call edge case works.
- High/low slider endpoints do not break layout.
- Mobile slider interaction is usable.

### Demo phone input
- Starts at top of viewport.
- Law-firm wording is active.
- Firm name is correct.
- User sees that the outbound phone call is transport for an inbound roleplay.
- Consent checkbox is required.
- Call cannot be triggered without valid phone and consent.
- Skip path is obvious.

### Live call
- Dedicated Lady Jarvis demo agent is used.
- Opening uses correct firm name.
- Agent behaves as inbound receptionist/intake specialist.
- No solar references unless the scanned business is actually solar.
- Agent does not give legal advice.
- Agent does not imply representation.
- Agent asks one question at a time.
- Agent handles “existing client” appropriately.
- Agent handles “new client” appropriately.
- Urgent situation produces appropriate escalation language.
- Agent uses website knowledge when asked about firm/practice areas.
- Unknown information is not fabricated.

### Call-complete transition
- Next page starts at top.
- No preserved middle-of-page scroll position.
- Skip-call path and completed-call path land on same intended legal simulation.

### 30-day inbound time-lapse
- Starts at top of viewport.
- Monthly total matches setup assumptions.
- New-prospect simulation roughly follows selected new-prospect mix.
- Existing clients and other calls are shown separately.
- Urgent new matters are a subset of new prospects, not double-counted as an extra call.
- Baseline missed-new-prospect figure matches setup math.
- Simulation reaches completion.
- CTA unlocks only when appropriate.
- Page is understandable without explanation from a salesperson.

### Legal ROI
- Starts at top.
- After-hours calls match setup.
- New prospects match setup.
- Missed prospects match setup.
- Potential client math uses missed new prospects only.
- Revenue-at-risk math uses firm revenue/fee value, not settlement/judgment value.
- 25%, 50%, 75% scenarios are clearly labeled as sensitivity scenarios.
- No wording implies guaranteed recovery.
- Expansion ecosystem appears after the primary proof.

### Post-demo vision / VSL
- “That was only one leak” transition is clear.
- VSL loads quickly.
- Muted autoplay works where supported.
- User can unmute.
- Captions are available.
- User can skip without losing ability to convert.
- Lead Recovery Engine is understandable.
- Full lifecycle visual is readable on desktop and mobile.

### Close
- Start My Beta is primary CTA.
- Talk to Someone First is secondary CTA.
- Show Me Lead Recovery is available.
- Known contact/firm data is prefilled.
- User is not asked to re-enter already-known values.
- Form validates.
- Submit produces a persistent lead record.
- Internal notification is generated.
- Confirmation screen explains what happens next.

## Mobile QA
Run at minimum:
- iPhone-sized viewport.
- Modern Android-sized viewport.

Check:
- Sticky/global nav does not cover content.
- Mobile bottom nav does not obscure CTA.
- Cards do not overflow horizontally.
- Slider labels remain readable.
- CTA buttons remain visible.
- Video controls are reachable.
- Every new step starts at top.
- Keyboard opening for form fields does not trap user.
- Phone number input works cleanly.

## Backend QA

### `demo-call`
- Requires consent.
- Validates session.
- Enforces daily IP/phone limits.
- Rejects invalid or unsafe demo agent config.
- Uses dedicated demo agent override.
- Uses call-level dynamic variables.
- Does not mutate a business-specific prompt onto a shared LLM per call.
- Logs initiated calls.
- Marks session call initiated.
- Legal follow-up SMS is legal-demo appropriate.

### Concurrency test
Create two sessions for different industries and initiate nearly simultaneous test calls.

Pass condition:
- Each call keeps its own business context.
- Neither call uses the other session’s firm name, services, or knowledge base.

### Website scraper
- Creates demo session.
- Handles public website errors.
- Does not silently substitute unrelated scraped data.

## Analytics QA
Once event instrumentation is built:
- Verify each major funnel event fires once.
- Verify no PII is accidentally sent into analytics event names/properties that should not contain it.
- Verify source/UTM is preserved across the demo flow.

## Trust / compliance QA
- AI identity disclosure language matches approved approach.
- Recording/transcription disclosure can be configured for applicable jurisdiction.
- Legal advice guardrail is present.
- Representation disclaimer is present where needed.
- Data handling FAQ matches actual architecture.
- Retention claims match actual retention configuration.

## Release Gate
Do not intentionally drive paid traffic until all P0 items pass:

### P0
- Law-firm landing loads.
- Scrape works.
- Legal setup works.
- Live call uses correct firm context.
- Skip path works.
- Scroll-to-top works.
- Inbound time-lapse completes.
- ROI math is correct.
- Primary CTA captures a real lead.
- Production version is published.

### P1
- VSL complete.
- Full analytics.
- CRM integration.
- Lead Recovery mini-demo.
- Security FAQ.

### P2
- Multilingual legal intake.
- Deeper CRM/case-management integrations.
- Practice-area templates.
- Partner dashboards.
