# Call Boss — Law Firm AI Intake Beta Master Plan

## North Star
Build a self-selling law-firm funnel that starts with one narrow, obvious pain point — after-hours and missed new-client calls — proves value with a personalized live demo, then earns the right to reveal the broader Call Boss revenue engine.

The first sale is not “buy our entire AI department.” The first sale is: **stop letting qualified opportunities disappear when nobody answers.**

Once the prospect experiences the firm-specific intake agent and sees their own missed-opportunity math, we reveal the expansion path:

- Speed to Lead
- Lead Recovery / Database Reactivation
- Appointment confirmation and no-show recovery
- SMS follow-up
- AI video follow-up / education
- Broader outbound and lifecycle automation

## Product Positioning

### Wedge offer
**Law Firm AI Intake Beta**

Primary job:
- Answer after-hours, weekend, overflow, and missed calls.
- Behave as an intake/reception specialist, not an attorney.
- Use firm-specific website context.
- Capture structured new-client intake.
- Separate new prospects, existing clients, urgent matters, and non-client traffic.
- Route / flag urgent matters.
- Never give legal advice or imply representation.

### Expansion story
The receptionist is the doorway, not the whole house.

After the first problem is solved, Call Boss can work the rest of the lead lifecycle:

1. New lead arrives.
2. Speed-to-lead engages immediately.
3. Voice + SMS nurture the prospect.
4. Appointment gets booked.
5. Reminders reduce no-shows.
6. No-shows and stale prospects enter recovery.
7. Old leads enter the Lead Recovery Engine.
8. AI video and educational follow-up reinforce trust.
9. Every disposition feeds the next-best action.

## Funnel Architecture

### Main outbound funnel
`/demo`

Current intended flow:
1. Outbound-focused demo landing.
2. Website scrape.
3. Workflow selection.
4. Outbound campaign setup.
5. Live AI demo call.
6. Outbound simulation.
7. Outbound ROI.

Do not dilute this page to satisfy attorneys. It should remain strong for outbound buyers.

### Law firm funnel
`/law-firms`

Intended flow:
1. Law-firm-specific landing page.
2. Prospect enters law-firm website.
3. Website is scraped for firm context.
4. Legal inbound opportunity setup:
   - Typical weekday-evening calls.
   - Typical weekend-day calls.
   - Percent that are new prospects.
   - Percent of new-prospect calls currently missed / voicemail.
   - Approximate signed-client rate.
   - Average revenue/fee value to firm from a signed client.
5. Prospect experiences Lady Jarvis as the firm’s after-hours intake agent.
6. 30-day inbound time-lapse.
7. Missed-new-prospect opportunity model.
8. 25% / 50% / 75% recovery sensitivity scenarios.
9. Whole-system reveal / VSL.
10. Lowest-friction close.

## Self-Selling Principle
The prospect should learn the system by experiencing it, not by reading a giant feature page.

Desired emotional sequence:

- “That’s a real problem.”
- “It actually learned my firm.”
- “The voice experience is better than I expected.”
- “We may actually be losing meaningful opportunities.”
- “Wait — it can handle the rest of the lead lifecycle too?”
- “Why wouldn’t I test this?”

## Lead Recovery / Database Reactivation Positioning
Do not lead with the technical phrase alone.

Preferred front-end framing:

### Lead Recovery Engine
**Before you buy another lead, work the ones you already paid for.**

Core economic story:
- The acquisition cost has already been spent.
- The lead previously demonstrated intent.
- Humans can call, text, email, and follow up for weeks, but persistence consumes expensive resources.
- AI is well suited to structured, repetitive, multi-touch follow-up at scale.
- The goal is not to pretend every stale lead converts; the goal is to systematically recover value from first-party demand before buying more demand.

Lead pools to reactivate:
- Old web inquiries.
- Past callers who never retained.
- No-shows.
- “Call me later” prospects.
- Prospects who stopped responding.
- Unsigned consults.
- Old marketing databases.
- Lost intake records where follow-up stopped.

## Proof Strategy
The product should prove itself in layers:

### Proof 1 — personalization
The website scrape must accurately identify firm name, practice areas, team, locations, and useful context.

### Proof 2 — conversation
The demo call must stay within firm context and legal-intake guardrails.

### Proof 3 — operational visualization
The inbound time-lapse should make the workflow tangible without pretending to be historical client data.

### Proof 4 — economics
Use only prospect-provided assumptions for opportunity math.

### Proof 5 — expansion
Show how the same context powers additional workflows without making the first offer feel complicated.

## Guardrails
- Never present simulated caller mix as actual firm history.
- Never imply every missed call is a qualified lead.
- Keep existing-client/vendor traffic out of new-business revenue math.
- Use sensitivity scenarios instead of performance guarantees.
- No legal advice from the agent.
- No claim that representation has been accepted.
- Be careful with prospective-client and client confidentiality.
- Avoid exposing sensitive intake data to systems that are not intentionally configured for the firm.

## Technical Source of Truth
- GitHub: `Cryptouprise/dial-smart-system`
- Production Supabase project: `emonjusymdripmkvtttc` (currently display-named “Number rotator”)
- Lovable project: `aidialboss1`
- Public Lovable URL: `https://aidialboss1.lovable.app`
- Demo backend: Supabase Edge Function `demo-call`
- Retell demo architecture: dedicated Lady Jarvis demo agent + call-level dynamic variables

## Current Implemented Work
- Dynamic demo routing fixed to prevent wrong-agent / solar-agent bleed.
- Per-call business context implemented.
- Law-firm legal-after-hours workflow added.
- Demo step scroll position reset implemented.
- Legal inbound setup implemented.
- Legal inbound simulation implemented.
- Legal inbound ROI/opportunity page implemented.
- Dedicated `/law-firms` landing page created.
- `/legal-beta` alias created.
- Direct law-firm page → legal demo path created.
- Main homepage law-firm-beta doorway added in code.

## Next Major Build Blocks
1. End-to-end browser QA.
2. Post-demo VSL / whole-system reveal.
3. Lead Recovery Engine section.
4. Frictionless beta close using already-captured prospect data.
5. CRM / lead-capture handoff.
6. Real law-firm pilot test.
7. VSL asset production.
8. GTM traffic and outbound acquisition.

## Definition of “Ready to Drive Traffic”
The funnel is not considered launch-ready until:

- Desktop and mobile paths pass QA.
- Website scrape reliably works on representative law-firm sites.
- Live demo calls stay firm-specific.
- Skip-call path works.
- Every new demo step lands at top of viewport.
- Legal ROI math is internally consistent.
- VSL/vision step is live.
- CTA captures the prospect without re-entering known data.
- Lead enters a follow-up system.
- Analytics events exist for the major funnel steps.
- We have a clear beta offer and pricing hypothesis.
- We have at least one real pilot or credible demonstration record.
