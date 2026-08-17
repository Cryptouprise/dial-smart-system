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

- ✅ Build “That was only one leak” transition.
- ✅ Build whole-system reveal screen.
- ✅ Add Lead Recovery Engine / Database Reactivation reveal.
- ✅ Add Speed-to-Lead expansion card.
- ✅ Add appointment/no-show recovery expansion card.
- ✅ Add SMS follow-up expansion card.
- ✅ Add AI video follow-up expansion card.
- ✅ Add a concise lifecycle visual / sequence across intake, response, appointments, nurture and recovery.
- ✅ Ensure expansion story comes after proof, not before it.
- 🟡 Replace VSL placeholder with finished produced asset.

## D. Frictionless close

- ✅ Build final low-friction beta close.
- ✅ CTA 1: Start My Beta.
- ✅ CTA 2: Talk to Someone First.
- ✅ CTA 3: Show Me Lead Recovery.
- ✅ Reuse website, firm name, demo session, call ID and demo-call phone when available.
- ✅ Ask only for genuinely missing contact fields.
- ✅ Create persistent `law_firm_beta_leads` record.
- ✅ Put beta submissions behind server-side validation / rate limiting rather than public table writes.
- ✅ Production-QA beta submission endpoint and remove QA row afterward.
- ⬜ Send lead into CRM / follow-up workflow.
- ⬜ Send internal notification for high-intent beta requests.
- 🟡 Confirmation is currently inline; decide whether a dedicated next-step screen converts better.

## E. VSL asset

- ✅ Finalize core 60-second VSL narrative/script direction.
- ✅ Create storyboard / shot sequence.
- ✅ Select AI avatar / visual direction.
- ✅ Generate reusable presenter frame in Higgsfield.
- 🟡 Produce avatar footage in Higgsfield — first 15-second quality-gate segment is rendering.
- 🟡 Add animated lifecycle / UI motifs inside the generated segments.
- ⬜ Generate remaining VSL segments after quality gate passes.
- ⬜ Assemble final 60–90 second VSL.
- ⬜ Add captions.
- ⬜ Add mute/unmute control.
- 🟡 Analytics backend supports VSL start / complete; wire final media events after asset is embedded.
- ⬜ Embed final VSL asset on post-demo vision page.

## F. Lead Recovery Engine

- ✅ Working front-end name: **Lead Recovery Engine**; subtitle / technical term: Database Reactivation.
- ✅ Add “Before you buy another lead, work the ones you already paid for” economic framing to the vision sequence.
- ⬜ Define eligible lead pools.
- ⬜ Define standard reactivation cadence.
- ⬜ Define voice + SMS + email roles.
- ⬜ Define stop conditions and opt-out handling.
- ⬜ Define disposition taxonomy.
- ⬜ Define handoff to human / booked consultation.
- ⬜ Build law-firm-specific interactive demo mode for Lead Recovery.
- ⬜ Add unit economics / cost-per-recovered-opportunity model.

## G. Analytics / instrumentation

- ✅ Create production `demo_funnel_events` table with RLS.
- ✅ Deploy privacy-safe `demo-funnel-track` Edge Function with event/metadata whitelist.
- ✅ Production-QA analytics endpoint and remove QA event afterward.
- ✅ Add client analytics helper with UTM attribution support.
- 🟡 Track law-firm landing views — client wiring pending final pass.
- 🟡 Track website submitted — client wiring pending final pass.
- 🟡 Track scrape success / failure — client wiring pending final pass.
- 🟡 Track legal setup viewed/completed — client wiring pending final pass.
- 🟡 Track demo call viewed / initiated / skipped — client wiring pending final pass.
- 🟡 Track inbound simulation viewed/completed — client wiring pending final pass.
- 🟡 Track ROI viewed — client wiring pending final pass.
- ✅ Post-demo vision component tracks vision view, VSL intent, CTA selection and beta submission.
- ⬜ Track VSL 25%, 50%, 75% once final video is embedded.
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

- ✅ Draft ICP, wedge positioning, channel sequence, launch phases and conversion metrics in `GO_TO_MARKET.md`.
- ✅ Ground initial positioning against current legal-response and receptionist market evidence.
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

1. Finish VSL quality gate and produce remaining segments if it passes.
2. Finish client-side analytics wiring.
3. Run build / browser QA across desktop and mobile.
4. Publish the newest GitHub batch to Lovable production.
5. Run a real law-firm end-to-end demo and verify the live call has zero solar/context leakage.
6. Set beta offer / pricing from actual COGS and desired pilot economics.
7. Build the first 100-account GTM target list and founder-led outreach assets.
8. Run 5–10 concierge demos, capture objections and proof.
9. Build the interactive Lead Recovery mini-demo.
10. Scale paid traffic only after the funnel converts reliably.
