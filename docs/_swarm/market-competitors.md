# market-competitors

- status: completed
- tldr: 5-competitor pricing table (GHL, Close, JustCall, Aircall, Nooks) + closest competitor = GoHighLevel; confidence medium.

market-competitors DONE. Delivered a 5-row competitor price/capability table plus the closest-competitor call, all as the node artifact.

TABLE (prices seen 2026-11-03; FACT = on the vendor page):
1. GoHighLevel $97/$297/$497 per mo, unlimited seats (gohighlevel.com/pricing)
2. Close $9-$149/user/mo by tier + AI credits (close.com/pricing)
3. JustCall $29-$109/user/mo, 2-seat min, pooled minutes+credits (justcall.io/pricing)
4. Aircall $30/$50/license/mo, 3-seat min, AI add-ons (aircall.io/pricing)
5. Nooks - NO published price, custom quote (nooks.ai/pricing); ~$30k/yr median is THEORY (third party)

Quote-only extras: Orum (9-seat min), Outreach (seat + AI credits), Salesloft.

CLOSEST COMPETITOR: GoHighLevel - same multi-tenant sub-account + usage-based credits/rebilling architecture, already the incumbent Dial Smart integrates with (ghl-integration 1,225). Dial Smart's edge = door-to-door vertical pack + autonomous AI-management engine; its gap = the marketing/funnel/content stack.

VALIDATION: fetched each vendor pricing page over HTTPS today; 4/5 rows carry on-page dollar figures. Dial Smart capabilities grounded in map file:line (section 4). Third-party figures explicitly marked THEORY.

BLOCKERS/FOLLOW-UPS: DuckDuckGo/Bing served anti-bot pages here, so Orum's real numbers and pure AI-SDR (Artisan/11x/Regie) public prices were not retrieved; GHL/Close per-unit usage rates and Dial Smart's mobile-app/SSO/compliance posture are unverified. Confidence: medium.

## Artifact

**Findings**

5-row competitor table (prices seen 2026-11-03). FACT = read on the vendor pricing page that day; THEORY = inferred/third-party.

ROW 1 - GoHighLevel. Price FACT: Starter $97/mo, Unlimited $297/mo, Founder $497/mo; unlimited users+contacts; add-ons (AI Employee $50/mo or $97/mo per sub-account; Branded Client Portal $49/mo; dedicated email IP $59/mo). Source: https://www.gohighlevel.com/pricing (seen 2026-11-03). Model: per-agency platform subscription + N sub-accounts + usage-based telecom/AI with rebilling. They have that Dial Smart does NOT: full marketing stack (funnels/websites, email+SMS marketing, social, reputation/reviews, courses, communities, forms/surveys, Ad Manager, WordPress), a white-label mobile app ($497/mo add-on), and self-serve SaaS-mode rebilling. Dial Smart has that they do NOT: a door-to-door vertical pack (territories/properties/knocks, map section 4 packs), simultaneous multi-carrier telephony (Twilio+Telnyx+Retell), an autonomous AI-management engine, a built-in white-label metered credit ledger, and a spam/reachability dashboard.

ROW 2 - Close. Price FACT (annual/monthly per user/mo): Solo $9/$19, Essentials $35/$49, Growth $99/$109, Scale $139/$149; AI credits 500-2,000/user/mo (shared pool); phone lines from $1/line/mo, calling usage-based. Source: https://www.close.com/pricing (seen 2026-11-03). THEORY: ~$0.02/min calling (third party salescrew.io, not verified on Close page). Model: per-seat + AI credits + telephony usage. They have that Dial Smart does NOT: a mature email-centric CRM with two-way email sync, bulk email, native iOS/Android apps. Dial Smart has that they do NOT: multi-tenant white-label credit resale, door-to-door pack, voice-broadcast manager, multi-carrier routing.

ROW 3 - JustCall. Price FACT (annual/monthly per user/mo): Team $29/$39, Pro $49/$69, Pro Plus $89/$109, Business/SalesPro custom; 2-license minimum; pooled minutes+SMS; overflow billed from credits; AI Voice Agent $0.99/min overage; extra number $6/mo; annual saves up to 29%. Source: https://justcall.io/pricing/ and https://help.justcall.io/en/articles/10323630 (seen 2026-11-03). Model: per-seat + bundled pooled minutes + prepaid credits + add-ons. They have that Dial Smart does NOT: IVR/ACD contact-center maturity, WhatsApp/RCS/shared email inbox, formal answering-service/AI-receptionist products, 100+ integrations. Dial Smart has that they do NOT: white-label credit resale, door-to-door pack, autonomous AI management, multi-carrier telephony, reachability/spam scoring.

ROW 4 - Aircall. Price FACT (annual per license/mo): Essentials $30, Professional $50, Enterprise custom; 3-license minimum; AI Voice Agents $100/mo minimum (50 AI min included on Essentials); AI Assist Pro $49/seat; extra number $6/mo. Source: https://aircall.io/pricing/ (seen 2026-11-03). Model: per-license + add-ons + AI minute allowances. They have that Dial Smart does NOT: 250+ integration marketplace, native softphone mobile apps, smart routing/queue callback/IVR, SSO+SCIM, HIPAA/GDPR/SOC2, Salesforce/Zendesk/Intercom connectors. Dial Smart has that they do NOT: multi-tenant white-label credits, door-to-door vertical, autonomous AI managers, multi-carrier simultaneously, built-in spam/reachability dashboard.

ROW 5 - Nooks. Price FACT: NO published price - its pricing page lists five products (AI Dialer, AI Sequencing, Signals, AI Coaching, Contact Data) with no numbers or terms. Source: https://www.nooks.ai/pricing (seen 2026-11-03). THEORY: third-party vendor data (Vendr via revspire.io, Feb 2026, 59 purchases) puts median contract ~$30,105/yr - not a vendor-published figure. Model: custom quote per product package. They have that Dial Smart does NOT: true parallel dialer (2-5 lines, Turbo ~6) with AI answer detection, virtual salesfloor/digital bullpen with live whisper coaching, signal-based dialing, native contact-data enrichment, native Salesforce/HubSpot. Dial Smart has that they do NOT: multi-tenant white-label credits, door-to-door vertical, autonomous AI management, voice broadcast, multi-carrier.

SUPPLEMENTARY quote-only (all custom, no public price): Orum (min 9-seat; unlimited dials quoted; orum.com/pricing), Outreach (seat + AI credits: Essentials 10K, Core 25K, Amplify Plus 50K, Amplify Pro 100K; custom; outreach.io/pricing), Salesloft (talk-to-sales, no published price; salesloft.com/pricing).

CLOSEST COMPETITOR: GoHighLevel. Reason: identical business architecture - multi-tenant agency/sub-account model, unlimited seats, usage-based telecom+AI paid via rebilling/credits (the analogue of Dial Smart's white-label credit ledger, map lines 105-107), all-in-one calling+AI+SMS+CRM+calendar. It is also the incumbent Dial Smart already integrates with (GoHighLevelManager.tsx 998, ghl-integration 1,225, map lines 97-98). Dial Smart's differentiators are the door-to-door vertical pack (map lines 49-51, 122-125) and the autonomous AI-management engine (map lines 71-74); its gap vs GHL is the entire marketing/funnel/content stack.

**evidence**

- C:/Users/charl/dial-smart-system/docs/dial-smart-app-map.md:53-125 (Dial Smart capability inventory, packs, multi-tenant/credits model)
- C:/Users/charl/dial-smart-system/docs/dial-smart-app-map.md:97-98 (GHL integration already present: GoHighLevelManager.tsx 998, ghl-integration 1,225)
- https://www.gohighlevel.com/pricing (FACT pricing, seen 2026-11-03)
- https://www.close.com/pricing (FACT pricing, seen 2026-11-03)
- https://justcall.io/pricing/ + https://help.justcall.io/en/articles/10323630 (FACT pricing, seen 2026-11-03)
- https://aircall.io/pricing/ (FACT pricing, seen 2026-11-03)
- https://www.nooks.ai/pricing (FACT: no published price, seen 2026-11-03)
- https://www.orum.com/pricing, https://www.outreach.io/pricing, https://www.salesloft.com/pricing (quote-only, seen 2026-11-03)

**validation**

Fetched each vendor pricing page over HTTPS on 2026-11-03 and read the rendered text; 4 of 5 table rows carry on-page dollar figures (GHL, Close, JustCall, Aircall). Every Dial Smart-side capability claim is grounded in a file:line of the shared map (section 4). Price figures labeled FACT are verbatim from the page; the single third-party figure (Close $0.02/min, Nooks ~$30k/yr) is labeled THEORY.

**open_questions**

- What are GoHighLevel's per-unit telecom/AI usage rates (the page says 'usage based' with no numbers)?
- True all-in monthly cost for Close/JustCall/Aircall once minutes+AI usage is modeled - not derivable from list pages alone.
- Does Dial Smart ship a mobile app or SSO/SCIM (competitors do)? Map does not mention either.
- Public pricing for Orum and pure AI-SDR tools (Artisan/11x/Regie) - search engines were blocked this session.

**what_i_did_not_check**

- Orum's actual dollar figures and any AI-SDR pure-play public prices (DuckDuckGo/Bing blocked here).
- GoHighLevel and Close per-minute/per-credit unit rates beyond the headline plan price.
- Independent verification of Dial Smart's claimed lack of a mobile app / SSO / compliance certs (inferred from the map, not audited).
- Whether Dial Smart's 'autonomous AI managers' are actually shipped/working vs scaffolding (map describes code size, not runtime behavior).
- Any competitor's hidden enterprise/contract pricing obtained via negotiation.

**confidence**: medium