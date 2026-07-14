# Elite Solar Recovery: legal and claims guardrails

Status: **research draft; inactive; not legal advice; not approved for live calling**  
Research current through: **2026-07-13**  
Intended first lane: **consent-proven speed-to-lead and requested re-contact only**

This document translates current primary-source requirements into a conservative campaign policy. Qualified counsel must approve the business model, fee model, jurisdictions, consent language, recording practice, and final script before any consumer receives an AI-voice call.

## Executive conclusion

Elite Solar Recovery should not use an AI voice for cold calls. The FCC has held that current AI-generated human voices are artificial or prerecorded voices under the TCPA. Telemarketing calls using such a voice require the called party's prior express written consent, absent an applicable exception. The consent must exist **before the call begins**; a friendly response after answering does not cure an unauthorized initiation.

The launchable campaign profile is therefore narrow:

- The consumer affirmatively requested contact from Elite Solar Recovery.
- A retained record proves the consumer authorized Elite Solar Recovery to deliver telemarketing using an artificial or prerecorded voice at the specific number.
- The number passed federal, seller-specific, state, reassigned-number, time-zone, and jurisdiction checks.
- The call only qualifies the consumer and requests a human specialist follow-up. It does not provide legal advice, enroll the consumer, collect payment, or promise an outcome.
- Any stop request is applied immediately across Elite Solar Recovery outreach, regardless of phrasing or campaign.

Primary authority: [FCC AI Voice Declaratory Ruling, FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1_Rcd.pdf); [47 C.F.R. § 64.1200](https://www.ecfr.gov/current/title-47/part-64/section-64.1200).

## Hard legal gates before any real-lead call

1. **Entity identity:** verify the exact registered business or registered DBA name that must be spoken as the entity responsible for the call. `Elite Solar Recovery` is a placeholder until that verification is attached.
2. **Business-model classification:** counsel must determine whether any offered service is a recovery service, debt-relief service, legal-referral service, credit-repair service, or otherwise specially regulated in each state.
3. **Fee model:** counsel must approve when and how any fee can be requested or received. The AI may not quote, negotiate, authorize, or collect a fee.
4. **State allowlist:** no state is enabled until counsel documents telemarketing registration/bond, mini-TCPA, state DNC, calling-hours/holiday, recording-consent, privacy, solar-service, and professional-licensing requirements.
5. **Consent artifact:** retain the exact disclosure shown, the submitted consent, seller identity, purpose, number, name, signature/e-signature evidence, date/time, source URL/form version, and evidence tying the person to the number.
6. **DNC and reassigned-number evidence:** retain the federal/state suppression version, seller-specific suppression result, and reassigned-number check used for the call.
7. **Recording design:** obtain counsel approval for the recording and transcription flow in every enabled state. The conservative campaign policy is explicit recorded consent; if it is declined, end the AI call.
8. **Opt-out mechanism:** prove voice-activated opt-out during the conversation and the toll-free automated opt-out path required for voicemail before voicemail is enabled.
9. **Claims substantiation:** approve the exact service description, substantiation file, customer agreement, refund/cancellation terms, typical-results evidence, and human escalation language.
10. **Complaint and emergency paths:** staff and test the published customer-service/DNC number and human escalation queues.

## Federal AI-call requirements translated into campaign policy

### AI voice is regulated as artificial or prerecorded voice

The FCC confirmed that AI technologies that generate or simulate a human voice fall within the TCPA's artificial-or-prerecorded-voice restrictions. The presence of conversational intelligence or a live supervisor does not create a carve-out. If the message advertises or markets a service, prior express **written** consent is required for the covered wireless and residential calls. [FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1_Rcd.pdf); [47 C.F.R. § 64.1200(a)(2)-(3)](https://www.ecfr.gov/current/title-47/part-64/section-64.1200).

Campaign policy:

- `cold_ai_calling = prohibited`
- `purchased_or_shared_lead_without_exact_consent_artifact = prohibited`
- `verbal_consent_collected_after_answer = insufficient_to_initiate_call`
- Use the stricter product policy of consent naming Elite Solar Recovery, even though the Eleventh Circuit vacated the FCC's attempted one-to-one and logically/topically-related additions. The underlying prior-express-written-consent rule remains. [Insurance Marketing Coalition Ltd. v. FCC, 127 F.4th 303 (11th Cir. 2025)](https://media.ca11.uscourts.gov/opinions/pub/files/202410277.pdf).

### Identity, sales purpose, nature of service, telephone number, and opt-out

Artificial/prerecorded messages must identify the responsible entity at the beginning and state a qualifying telephone number during or after the message. Telemarketing artificial/prerecorded messages must provide an automated interactive voice/key-press opt-out and instructions within two seconds after the identity disclosure. The FTC's TSR separately requires truthful, prompt, clear disclosure of the seller, that the call's purpose is to sell goods or services, and the nature of the goods or services. [47 C.F.R. § 64.1200(b)](https://www.ecfr.gov/current/title-47/part-64/section-64.1200); [16 C.F.R. § 310.4(d)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.4).

Campaign policy:

- Speak the verified registered entity name immediately.
- Immediately tell the person they may say “stop calling” at any time.
- Promptly say this is a sales call and describe the service conservatively.
- Truthfully disclose that the speaker is an AI assistant; never simulate a human identity.
- State the approved, answered customer-service number during the call.
- Do not use local-presence spoofing or a number Elite Solar Recovery is not authorized to use.

### Do Not Call, revocation, and suppression

Covered call lists must be scrubbed against a National DNC Registry version obtained no more than 31 days before the call, along with the seller's entity-specific list. A consumer may revoke consent by any reasonable method; current rules list voice/key-press opt-out and common stop words as per se reasonable. The federal outside limit for honoring revocation is ten business days, but the campaign's operational standard is **immediate suppression before any next attempt**. [47 C.F.R. § 64.1200(a)(10)-(11), (c)-(d)](https://www.ecfr.gov/current/title-47/part-64/section-64.1200); [16 C.F.R. § 310.4(b)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.4).

Campaign policy:

- Treat “stop,” “don't call,” “remove me,” “not interested—leave me alone,” “wrong person,” and equivalent natural language as terminal safety events.
- Do not require a reason, transfer, key press, second request, or further pitch.
- Confirm once, create the suppression, end immediately.
- A wrong-number report invalidates the consent-to-subscriber link and blocks another AI attempt to that number.
- DNC is seller-wide, not merely campaign-wide.

### Calling hours, cadence, abandonment, and Caller ID

Federal baseline calling hours are 8:00 a.m. to 9:00 p.m. at the called person's location. The TSR and FCC rules impose abandoned-call controls, including a three-percent safe-harbor ceiling and timing/recordkeeping conditions. Caller ID must be transmitted accurately. [47 C.F.R. § 64.1200(a)(7), (c)(1)](https://www.ecfr.gov/current/title-47/part-64/section-64.1200); [16 C.F.R. § 310.4(b)-(c)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.4).

The campaign adopts a stricter default until each state is approved:

- Monday-Friday, 9:00 a.m.-6:30 p.m. lead-local time.
- No weekends, federal holidays, or state-restricted dates.
- Maximum one attempt per local calendar day and three attempts in seven days, unless the consumer requests a specific callback.
- No predictive dialing in the first pilot; one reserved AI session per initiated call.
- Use an Elite Solar Recovery-owned, callable number with approved CNAM; never spoof proximity.

### Records

Current TSR rules require five-year retention of materially different scripts/promotional materials and detailed call, consent, service-provider, DNC, and disposition records. [16 C.F.R. § 310.5](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.5).

The compliance evidence record should include:

- immutable script and prompt version;
- seller, telemarketer, provider, campaign, calling number, called number, local time, duration, and call ID;
- exact consent artifact and consent version;
- DNC/state/reassigned-number/time-window preflight evidence;
- whether AI/prerecorded voice and voicemail were used;
- recording-consent result;
- transcript/recording retention policy and access log;
- complete disposition, stop phrase, escalation, and human action;
- caller-ID authorization; and
- all claims/materials in effect for that version.

## Solar-contract claims policy

### No universal “solar exit” claim

Some consumers may have cancellation or rescission rights, but the answer depends on facts including contract type, financing structure, transaction location, security interest, dates, notices, performance, state law, and litigation posture. CFPB guidance says homeowners **could** have rights in some cases; it does not establish that every homeowner can cancel. [CFPB solar consumer advisory](https://www.consumerfinance.gov/archive/newsroom/consumer-advisory-steer-clear-of-costly-and-complex-loans-for-solar-energy-installation/).

Approved framing:

> Elite Solar Recovery helps homeowners organize information about a solar agreement and speak with a specialist about potential resolution paths. Whether any path is available depends on the documents and facts. An initial conversation is not legal advice and does not mean a contract can be cancelled.

Never say or imply:

- “We will cancel/get you out of your solar contract.”
- “You qualify” before a documented human review.
- “Your contract is invalid/illegal/fraudulent.”
- “You are still within your cancellation period.”
- “We will recover your money/refund/down payment.”
- “We will reduce/eliminate your balance, payment, lien, or utility bill.”
- “We have a special government, utility, lender, installer, or court program.”
- “Everyone/most people succeed,” a success percentage, or a timeline without approved substantiation and context.
- “Stop paying,” “block the lender,” “ignore collections,” “cancel installation,” “remove panels,” or any other instruction affecting legal/financial rights.

### Cooling-Off Rule is narrow

The FTC Cooling-Off Rule generally requires qualifying sellers in certain sales made at a consumer's home or certain temporary locations, above the regulatory threshold, to provide a three-business-day cancellation right and notices. It is not a universal solar-contract cancellation rule and has definitions, conditions, and exclusions. [16 C.F.R. Part 429](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-429); [FTC Cooling-Off Rule page](https://www.ftc.gov/legal-library/browse/rules/cooling-period-sales-made-home-or-other-locations).

AI policy: collect the date and location of signing, then say only, “Timing can matter, so I'll mark this for prompt human review.” Never calculate or announce a deadline.

### Regulation Z rescission is transaction-specific

Regulation Z provides a right to rescind for certain credit transactions in which a security interest is retained or acquired in the consumer's principal dwelling, subject to exemptions and detailed timing rules. Whether a solar financing arrangement qualifies is a legal determination. [12 C.F.R. § 1026.23](https://www.consumerfinance.gov/rules-policy/regulations/1026/23/).

AI policy: ask whether the consumer knows if the agreement is a loan, lease, PPA, cash purchase, or something else and whether documents mention a lien/security interest. Do not interpret the documents or state a rescission deadline.

### Solar financing and savings claims are high risk

The CFPB has reported risks involving hidden dealer fees, tax-credit assumptions, payment increases, and savings claims in solar-specific financing. Those are legitimate intake categories, not facts the AI may presume about a consumer's transaction. [CFPB Solar Financing Issue Spotlight](https://www.consumerfinance.gov/data-research/research-reports/issue-spotlight-solar-financing/).

AI policy:

- Ask, “What did you expect, and what happened?”
- Record the consumer's allegation as `consumer_reported`, never as an established fact.
- Do not offer tax advice or estimate credits, savings, damages, refunds, or loan balances.
- Do not call the installer/lender a scammer or state that fees are hidden without reviewed evidence.

### Recovery-service and debt-relief fee risk

The TSR restricts requesting or receiving payment for services represented to recover or assist in returning money or value from a previous transaction until seven business days after delivery, except for services provided by a licensed attorney. It separately regulates debt-relief services involving unsecured creditors and restricts advance fees. The applicability to Elite Solar Recovery's specific services and solar financing structures requires counsel review. [16 C.F.R. § 310.4(a)(3), (5)](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310/section-310.4).

Until counsel signs off:

- the AI cannot quote a price, request payment, take payment information, enroll a consumer, describe a success fee, or imply that payment buys a guaranteed recovery;
- the copy cannot promise return of money or alteration of debt; and
- the company name may be stated, but “recovery” may not be expanded into an outcome claim.

## Recording and transcription

Federal law supplies a one-party-consent baseline in many circumstances, but stricter state laws can require all participants' consent. For example, California Penal Code § 632 addresses recording confidential communications without all parties' consent, and Washington RCW 9.73.030 generally requires all participants' consent for private calls and explains how a recorded announcement can establish it. [California Penal Code § 632](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632); [Washington RCW 9.73.030](https://lawfilesext.leg.wa.gov/law/rcwpdf/rcw%20%20%209%20%20title/rcw%20%20%209%20.%2073%20%20chapter/RCW%20%20%209%20.%2073%20.030.pdf).

Campaign policy:

- Disclose AI and recording before substantive discussion.
- Obtain an affirmative “yes” to continue and record that response.
- If consent is refused or ambiguous, stop recording/transcription and end the AI call. Offer a human callback only when the consumer expressly requests it and the callback mode is legally approved.
- Never characterize silence as recording consent.
- Do not collect SSNs, bank/card numbers, login credentials, full loan account numbers, dates of birth, or document images over the AI call.

## State-law and professional-practice gate

Federal compliance is only a floor. Before a state enters the allowlist, counsel must document:

- seller/telemarketer registration, bond, script filing, and caller-ID requirements;
- state and local DNC/mini-TCPA rules, permitted hours, holidays, cadence, and consent wording;
- call recording, transcription, biometric/voice, and privacy requirements;
- solar salesperson, contractor, credit-service, debt-adjuster, recovery-service, attorney-referral, and unauthorized-practice-of-law rules;
- contract-cancellation and home-solicitation requirements;
- marketing of legal or financial outcomes; and
- complaint handling and record-retention periods.

No geolocation or area-code inference is enough. The campaign must know the consumer's physical state and applicable calling jurisdiction before substantive qualification.

## Primary-source register

- [FCC AI Voice Declaratory Ruling, FCC 24-17](https://docs.fcc.gov/public/attachments/FCC-24-17A1_Rcd.pdf)
- [47 C.F.R. § 64.1200, Delivery restrictions](https://www.ecfr.gov/current/title-47/part-64/section-64.1200)
- [16 C.F.R. Part 310, Telemarketing Sales Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-310)
- [FTC, Complying with the Telemarketing Sales Rule](https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule)
- [Insurance Marketing Coalition Ltd. v. FCC](https://media.ca11.uscourts.gov/opinions/pub/files/202410277.pdf)
- [16 C.F.R. Part 429, Cooling-Off Rule](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-429)
- [12 C.F.R. § 1026.23, Regulation Z right of rescission](https://www.consumerfinance.gov/rules-policy/regulations/1026/23/)
- [CFPB, Solar Financing Issue Spotlight](https://www.consumerfinance.gov/data-research/research-reports/issue-spotlight-solar-financing/)
- [CFPB solar consumer advisory](https://www.consumerfinance.gov/archive/newsroom/consumer-advisory-steer-clear-of-costly-and-complex-loans-for-solar-energy-installation/)
- [FTC/United States complaint, U.S. v. Solar XChange](https://www.ftc.gov/system/files/ftc_gov/pdf/20230714FiledComplaint.pdf) (allegations illustrate risks involving DNC, repetition, affiliation, and unsubstantiated savings claims; allegations are not treated as adjudicated facts)
- [California Penal Code § 632](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=PEN&sectionNum=632)
- [Washington RCW 9.73.030](https://lawfilesext.leg.wa.gov/law/rcwpdf/rcw%20%20%209%20%20title/rcw%20%20%209%20.%2073%20%20chapter/RCW%20%20%209%20.%2073%20.030.pdf)

