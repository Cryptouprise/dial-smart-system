# Law Firm AI Intake Beta — Offer & Pricing Model

_Last updated: 2026-08-16_

## Recommendation

Launch with **one simple founding-beta offer** rather than a pricing matrix.

### Founding Beta — recommended hypothesis

**$995/month**

- No setup fee for the first 10 founding firms.
- Up to 1,000 AI conversation minutes / month included.
- Month-to-month during beta.
- Firm-specific after-hours / weekend / overflow intake agent.
- Website-derived firm context plus approved intake rules.
- New-vs-existing caller triage.
- Structured new-client intake.
- Urgency flagging / escalation rules.
- Call summaries / intake output.
- Basic optimization during beta.
- Overage hypothesis: **$0.50/minute** after included usage.

Do **not** publish this price until the first browser QA + live legal-demo run + actual per-minute cost sample are complete.

## Why $995 is a reasonable launch hypothesis

Current public platform references show AI voice cost can vary substantially with voice, LLM, telephony, knowledge base, and add-ons. Retell currently advertises roughly $0.07–$0.31/minute for AI Voice Agents and its example calculator shows approximately $0.11/minute for a common configuration before custom telephony. Twilio currently lists US local inbound at roughly $0.0085/minute.

For planning, use a deliberately conservative **$0.20–$0.25/minute all-in direct usage assumption** until production usage proves otherwise.

At 1,000 included minutes:

| Modeled COGS / min | Direct usage cost | Gross margin before onboarding/support at $995 |
|---:|---:|---:|
| $0.12 | $120 | ~88% |
| $0.15 | $150 | ~85% |
| $0.20 | $200 | ~80% |
| $0.25 | $250 | ~75% |
| $0.30 | $300 | ~70% |

This gives room for support and implementation while remaining positioned below the cost of many higher-volume human receptionist plans.

## Competitive price context

Ruby currently publishes live-receptionist plans including approximately:
- 50 minutes: $250/month
- 100 minutes: $395/month
- 200 minutes: $720/month
- 500 minutes: $1,725/month

Smith.ai currently markets AI legal receptionist offerings in roughly the few-hundred-dollar starting range, with some public law-firm materials describing plans around $500/month.

The Call Boss offer should **not** try to win as the cheapest answering service.

The differentiation is:
1. Personalized firm-specific live demo before purchase.
2. Transparent missed-opportunity economics.
3. Firm-specific intake / triage.
4. A direct expansion path into Speed-to-Lead, appointment rescue, Lead Recovery, SMS, and AI video.

## Why only one beta tier

A self-selling funnel breaks when the buyer has to decode five packages.

The first CTA should answer one question:

> “Do I want this solving my after-hours / missed-call problem?”

The expansion workflows can be priced after the first implementation proves value.

## Founding-beta scarcity

Recommended:

**First 10 firms**

This should be real operational scarcity, not fake urgency. Ten is enough to:
- learn across multiple practices,
- keep onboarding high-touch,
- catch edge cases,
- build proof,
- avoid overwhelming support.

After 10:
- reassess onboarding labor,
- review average minutes,
- review transfer / integration costs,
- review close rate,
- then set standard pricing.

## Overage strategy

Working hypothesis: **$0.50/minute** above 1,000 included minutes.

Reasoning:
- protects margin if model / voice configuration is expensive,
- keeps billing understandable,
- creates room for telephony and optional features,
- avoids microscopic line-item billing.

Before launch, verify whether transferred calls create additional carrier legs and decide whether those are included or passed through.

## Expansion pricing — do not self-serve yet

During beta, expansion workflows should be quoted after the initial intake product is running:

### Speed-to-Lead
Potential packaging:
- base platform add-on,
- usage / minute component,
- optional CRM / calendar integration.

### Lead Recovery Engine
Potential packaging:
- campaign setup / data preparation,
- monthly platform / agent fee,
- usage,
- optional performance component only if attribution is contractually clear.

### Appointment Rescue / No-Show Recovery
Likely small add-on or included in broader lifecycle package.

### AI Video Follow-Up
Price separately based on generation volume / creative complexity until costs stabilize.

## 30-day pilot success criteria

Agree on success measures before launch. Suggested metrics:
- eligible calls answered,
- new-prospect calls identified,
- usable intake capture rate,
- urgent matters correctly flagged,
- consultations / transfers / callbacks created,
- response time,
- human team time saved,
- caller-quality review,
- downstream signed clients where trackable.

Do not promise a specific number of retained cases.

## Upgrade path

The intended commercial motion is:

**$995 Intake Beta → prove value → identify the next leak → add one workflow**

Examples:
- Intake → Speed-to-Lead
- Intake → Lead Recovery
- Intake → Appointment Rescue
- Intake → SMS nurture
- Intake → Full Revenue Lifecycle

The upgrade conversation should be driven by observed process gaps, not a generic upsell checklist.

## Before publishing the offer

Must complete:
- [ ] One live law-firm end-to-end demo.
- [ ] Actual per-minute cost sample from the chosen production agent configuration.
- [ ] Transfer / escalation cost test.
- [ ] Browser QA desktop/mobile.
- [ ] Confirm what CRM / notification output is included.
- [ ] Confirm data retention / recording disclosure baseline.
- [ ] Decide whether taxes / carrier fees need special handling.
