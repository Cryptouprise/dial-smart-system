# Law Firm AI Intake Beta — Task Tracker

Legend: ✅ Done · 🟡 In progress / needs QA · ⬜ Not started · 🔒 Blocked

## A. Core demo mechanics

- ✅ Fix Retell demo routing so the dedicated Lady Jarvis demo agent is used per call.
- ✅ Remove shared personalized-prompt mutation and use per-call dynamic variables.
- ✅ Restore / verify Supabase `Number rotator` project.
- ✅ Deploy corrected `demo-call` Edge Function.
- ✅ Smoke-test production demo backend without placing a call.
- ✅ Smoke-test website scraper and clean up test data.
- ✅ Add explicit legal-after-hours campaign type.
- ✅ Add legal-safe voice-agent behavior and guardrails.
- ✅ Reset browser viewport to top on every demo-step transition.
- 🟡 Run live end-to-end call using a real law-firm site.
- 🟡 Confirm no solar / unrelated industry leakage on at least three non-solar sites.
- ⬜ Add automated regression tests for cross-business context leakage.

## B. Law-firm funnel

- ✅ Create `/law-firms` landing page.
- ✅ Create `/legal-beta` alias.
- ✅ Add main-site doorway for Law Firm Beta.
- ✅ Route law-firm landing page directly into legal demo mode.
- ✅ Keep main outbound demo separate rather than diluting the opening message.
- ✅ Build inbound opportunity setup.
- ✅ Separate total inbound calls from new-prospect share.
- ✅ Keep existing-client / vendor traffic out of revenue math.
- ✅ Build 30-day inbound time-lapse.
- ✅ Build legal missed-opportunity / ROI page.
- ✅ Use 25% / 50% / 75% sensitivity scenarios rather than guarantees.
- 🟡 Visually QA law-firm landing page desktop.
- 🟡 Visually QA law-firm landing page mobile.
- 🟡 Visually QA inbound setup desktop/mobile.
- 🟡 Visually QA live-call screen desktop/mobile.
- 🟡 Visually QA inbound simulation desktop/mobile.
- 🟡 Visually QA legal ROI desktop/mobile.
- ⬜ Add progress indicator / clear stage context across the legal flow if QA shows confusion.

## C. Post-demo self-selling sequence

- ⬜ Build “That was only one leak” transition.
- ⬜ Build VSL / whole-system reveal screen.
- ⬜ Add Lead Recovery Engine / Database Reactivation reveal.
- ⬜ Add Speed-to-Lead expansion card.
- ⬜ Add appointment/no-show recovery expansion card.
- ⬜ Add SMS follow-up expansion card.
- ⬜ Add AI video follow-up expansion card.
- ⬜ Add a concise lifecycle visual: inbound → qualification → appointment → nurture → recovery → reactivation.
- ⬜ Ensure expansion story comes after proof, not before it.

## D. Frictionless close

- ⬜ Build final “Ready to put this on your firm?” close.
- ⬜ CTA 1: Start My Beta.
- ⬜ CTA 2: Talk to Someone First.
- ⬜ CTA 3: Show Me Lead Recovery.
- ⬜ Reuse website, firm name, contact name, email, phone, and inbound estimates already captured.
- ⬜ Ask only for genuinely missing fields.
- ⬜ Create persistent beta-lead record.
- ⬜ Send lead into CRM / follow-up workflow.
- ⬜ Send internal notification for high-intent beta requests.
- ⬜ Add confirmation / next-step screen.

## E. VSL asset

- ⬜ Finalize 60–90 second VSL script.
- ⬜ Create storyboard / shot list.
- ⬜ Select AI avatar / voice direction.
- ⬜ Produce avatar footage in Higgsfield.
- ⬜ Add animated lifecycle graphics and UI overlays.
- ⬜ Add captions.
- ⬜ Add mute/unmute control.
- ⬜ Add analytics for play, 25%, 50%, 75%, complete.
- ⬜ Embed on post-demo vision page.

## F. Lead Recovery Engine

- ⬜ Finalize product name and subtitle.
- ⬜ Define eligible lead pools.
- ⬜ Define standard reactivation cadence.
- ⬜ Define voice + SMS + email roles.
- ⬜ Define stop conditions and opt-out handling.
- ⬜ Define disposition taxonomy.
- ⬜ Define handoff to human / booked consultation.
- ⬜ Build law-firm-specific demo mode for Lead Recovery.
- ⬜ Add “Before you buy another lead…” economic framing.
- ⬜ Add unit economics / cost-per-recovered-opportunity model.

## G. Analytics / instrumentation

- ⬜ Track law-firm landing views.
- ⬜ Track website submitted.
- ⬜ Track scrape success / failure.
- ⬜ Track legal setup completed.
- ⬜ Track consent given.
- ⬜ Track demo call initiated.
- ⬜ Track call skipped.
- ⬜ Track inbound simulation completed.
- ⬜ Track ROI viewed.
- ⬜ Track VSL started / completed.
- ⬜ Track Start Beta click.
- ⬜ Track Talk to Someone click.
- ⬜ Track Lead Recovery click.
- ⬜ Track beta form completed.
- ⬜ Track booked meeting / closed customer downstream.

## H. Offer / pricing

- ⬜ Calculate actual per-minute COGS for legal inbound configuration.
- ⬜ Decide included monthly minutes / usage policy.
- ⬜ Decide whether beta has setup fee.
- ⬜ Decide whether beta is monthly, 30-day pilot, or hybrid.
- ⬜ Decide overage rate.
- ⬜ Define human escalation / transfer costs if applicable.
- ⬜ Define founding-beta limit (e.g. first 10 or 20 firms).
- ⬜ Define pilot success criteria.
- ⬜ Define expansion pricing for Speed-to-Lead / Lead Recovery / SMS / AI video.

## I. Compliance / trust

- ✅ Agent explicitly avoids legal advice and representation claims.
- ⬜ Add public-facing privacy / data handling explanation for legal beta.
- ⬜ Document retention policy for demo and pilot intake data.
- ⬜ Confirm recording / transcription disclosure requirements for pilot jurisdictions.
- ⬜ Review state-specific attorney advertising / solicitation issues before paid campaigns by jurisdiction.
- ⬜ Add conflict-check disclaimer / workflow where relevant.
- ⬜ Add configurable PII redaction / retention for production clients.
- ⬜ Prepare short security / ethics FAQ for prospects.

## J. GTM launch

- ⬜ Finalize ICP priority tiers.
- ⬜ Build first 100-account target list.
- ⬜ Tag by practice area, geography, firm size, current intake method, and ad activity.
- ⬜ Create direct-demo prospecting workflow.
- ⬜ Create personalized outbound email / LinkedIn / call scripts.
- ⬜ Create “we built your demo already” outreach version.
- ⬜ Launch founder-led outreach to first 25 high-fit firms.
- ⬜ Run 5–10 concierge demos before paid traffic.
- ⬜ Collect objections and update funnel copy.
- ⬜ Close first 3–5 founding beta firms.
- ⬜ Capture proof / testimonials / call metrics.
- ⬜ Begin paid traffic only after conversion path is proven.
- ⬜ Test Google Search / Meta / LinkedIn / legal-newsletter channels selectively.
- ⬜ Build referral / agency / legal-marketing partner channel.

## K. Weekly operating rhythm

- ⬜ Monday: funnel metrics + sales pipeline review.
- ⬜ Tuesday: product / QA fixes from real demos.
- ⬜ Wednesday: outbound prospecting + partner outreach.
- ⬜ Thursday: customer interviews / beta onboarding / proof capture.
- ⬜ Friday: GTM experiment review and next-week priorities.

## Immediate priority order

1. QA the current legal funnel end-to-end.
2. Build post-demo VSL / whole-system reveal.
3. Build frictionless beta close and lead capture.
4. Create Lead Recovery reveal.
5. Set pilot offer and pricing.
6. Run concierge demos with real firms.
7. Use actual objections/results to tighten funnel.
8. Produce polished VSL.
9. Launch repeatable outbound acquisition.
10. Scale paid traffic only after the funnel converts.
