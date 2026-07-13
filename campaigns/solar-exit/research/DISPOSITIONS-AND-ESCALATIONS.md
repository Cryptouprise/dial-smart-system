# Elite Solar Recovery: dispositions and escalation map

Status: **inactive design artifact; no database records created**

The disposition must describe what actually happened, not what the AI predicts. A disposition can create a human work item, but it cannot initiate another call, message, transfer, payment, document request, or workflow.

## Safety invariants

- Apply a suppression before ending a call when a stop request is heard.
- A seller-wide suppression outranks every retry, callback, campaign, workflow, and human task.
- Wrong-number and disputed-consent events quarantine the number before any later outreach.
- Store consumer allegations as `consumer_reported`; do not convert them to legal findings.
- Do not mark an appointment `booked` or `confirmed`. The only allowed state is a requested/preferred human follow-up window.
- Every disposition retains call ID, seller, tenant, campaign, script version, consent artifact ID, state, local time, and actor.

## Terminal consumer-choice dispositions

| Code | Meaning | Required action | Retry |
|---|---|---|---|
| `dnc_seller_global` | Any request to stop calls from Elite Solar Recovery | Create irreversible seller-wide DNC immediately; retain exact request phrase; end | Never |
| `consent_revoked_global` | Consumer clearly revokes AI/robocall or broader contact consent | Revoke applicable consent immediately; suppress all communication covered by revocation; end | Never unless consumer later gives new valid written consent |
| `not_interested_terminal` | Consumer declines this service without broader DNC | End without persuasion; close this campaign | Never in this campaign |
| `ai_declined_terminal` | Consumer does not want to interact with AI | End AI call | No AI retry; human only after explicit request and approved policy |
| `recording_declined_terminal` | Consumer declines or does not clearly accept recording | End AI call; retain only minimum compliance evidence allowed by policy | No AI retry; human only after explicit request and approved unrecorded mode |
| `wrong_number_quarantine` | Current subscriber is not the consenting consumer | Quarantine number/lead relationship; do not reveal reason for call | Never until ownership and new consent are independently re-proven |
| `deceased_or_incapacitated_quarantine` | Recipient reports the named consumer is deceased or cannot consent | Quarantine and human privacy review; do not ask for details | Never automatically |
| `consent_disputed_quarantine` | Consumer disputes requesting contact or source evidence is unavailable | Quarantine artifact and all automated outreach; compliance review | Never until a new valid consent is obtained |

## Contact-result dispositions

| Code | Meaning | Required action | Retry policy |
|---|---|---|---|
| `no_answer` | No person and no certified voicemail | Record carrier/provider result | Only within approved cadence and while consent remains valid |
| `busy_or_unavailable` | Person says they cannot speak but does not request a callback | End politely | No automatic retry; human review of consent/cadence |
| `callback_window_requested` | Consumer expressly asks for a callback and gives a window | Record requested channel, date, window, timezone, and whether human/AI was requested | Exactly as requested, subject to fresh preflight |
| `voicemail_left_certified` | Approved voicemail completed with tested opt-out numbers | Retain exact voicemail version and delivery evidence | Only within approved cadence |
| `voicemail_disabled` | Answering service/voicemail detected while voicemail gate is closed | Disconnect without message | Normal approved cadence only |
| `invalid_or_disconnected` | Provider indicates invalid/disconnected number | Quarantine number; reassigned-number review | Never automatically |
| `provider_or_audio_failure` | Technical failure prevented a compliant interaction | Reconcile provider state and confirm no partial message/DNC request | Manual retry approval only |
| `abandoned_or_dead_air` | Connection did not meet response timing | Compliance incident review and abandonment metric | No retry until incident closed |

## Qualification outcomes

| Code | Meaning | Required action |
|---|---|---|
| `human_review_requested` | Consumer completed minimum intake and requests human review | Create one human work item with factual summary and preferred window; no booking claim |
| `urgent_human_review_requested` | Consumer reports a near-term event/deadline or signed very recently | High-priority human review; state that AI did not calculate/preserve deadline |
| `documents_available` | Consumer says they have documents | Add flag only; human explains an approved secure process later |
| `documents_unavailable` | Consumer does not have documents | Add flag only; do not advise how to obtain legal/financial records |
| `jurisdiction_not_enabled` | Consumer/property location is outside approved state allowlist | End substantive intake; compliance/human review if service may later be available |
| `role_or_ownership_review` | Caller is not clearly an owner/signer or capacity is uncertain | Human review; no legal conclusion |
| `existing_representation_review` | Attorney or other representative is involved | Stop ordinary flow; human/legal review before any contact relating to matter |
| `outside_service_scope` | Concern is unrelated to solar-agreement review/support | Explain limits once and end; do not invent referral |

## Mandatory escalation triggers

### Urgent timing — `urgent_human_review_requested`

Trigger when the consumer reports any of the following:

- agreement signed within the last five business days;
- installation, funding, inspection, closing, arbitration, hearing, sale, foreclosure, repossession, collection deadline, or court date within 72 hours;
- a cancellation/rescission date printed in a document that may be near; or
- uncertainty about a legal deadline.

Required response:

> Timing can matter, and I can't calculate or advise you about a deadline. I'm marking this for urgent human review. Please don't rely on this call to preserve any right or deadline.

Do not calculate dates, draft notices, advise mailing method, or say the consumer is eligible.

### Legal/proceeding — `legal_review_required`

Trigger for an attorney, lawsuit, arbitration, bankruptcy, foreclosure, lien, collection action, regulator inquiry, subpoena, or settlement offer.

Required response:

> I can't give legal advice or discuss strategy. I'll stop the ordinary sales questions and mark this for qualified human review. If you have a deadline, contact your attorney or another qualified attorney promptly.

Do not interfere with representation or suggest withholding payments/performance.

### Identity theft, forgery, coercion, or vulnerable adult — `fraud_or_vulnerability_review`

Trigger when the consumer alleges a forged signature, stolen identity, inability to understand what was signed, coercion, elder/vulnerable-adult exploitation, or unauthorized account use.

Required response:

> I'm sorry you're dealing with that. I can't determine whether a crime or legal violation occurred. I will limit what I collect and mark this for urgent human review. Please don't share account numbers, passwords, Social Security numbers, or other sensitive information with me.

Do not label any person a criminal or fraudster. A human can provide approved CFPB, FTC, state-AG, identity-theft, or attorney resources.

### Safety, electrical, roof, fire, or medical emergency — `safety_emergency_ended`

Trigger for fire, smoke, sparking, active electrical hazard, serious roof instability, immediate threat, medical emergency, self-harm, or threat of violence.

Required response:

> This may require immediate help, and I can't safely handle it. If anyone is in immediate danger, call 911 now and follow instructions from emergency services. For an electrical or utility hazard, move to a safe location and contact the appropriate emergency provider. I'm ending the sales conversation.

End. Do not troubleshoot equipment or keep the person engaged in qualification.

### Financial-action request — `financial_advice_declined`

Trigger when asked whether to stop payments, cancel autopay, move funds, dispute a charge, ignore collection, refinance, claim a tax credit, or make another financial decision.

Required response:

> I can't advise you to take or stop a financial or legal action. Those choices can have consequences. Please speak promptly with a qualified attorney, tax professional, or financial professional for advice about your situation.

### Complaint about Elite Solar Recovery — `company_complaint_escalated`

Trigger for allegations about Elite Solar Recovery, its ad, call, staff, fees, privacy, prior contact, or service.

Required response:

> Thank you for telling me. I won't debate the complaint. I'll stop the sales flow and send the exact concern to the designated human complaint team. Would you also like all future calls stopped?

If yes, create DNC first. Do not route the complaint back to sales.

## Minimum evidence fields

Every completed call attempt should retain:

- `organization_id`, `seller_id`, `campaign_id`, `lead_id`, `call_id`, provider call ID;
- called and calling number in canonical form;
- consumer and property states; verified local timezone;
- consent artifact ID, consent seller, disclosure version, consent time, and validity result;
- federal/state/entity DNC preflight versions and results;
- reassigned-number and ownership result;
- agent, LLM, prompt, script, and policy versions;
- recording disclosure time and response;
- AI disclosure time, seller disclosure time, sales-purpose disclosure time, opt-out instruction time;
- start/end time, duration, provider result, disposition, and retry eligibility;
- exact stop/complaint phrase when applicable;
- consumer-reported issue categories and minimal factual summary;
- escalation code, creation time, owner, and resolution state; and
- whether a voicemail, message, transfer, booking, payment, or workflow occurred (all should be `false` except certified voicemail).

Sensitive source documents and account data must not be copied into free-text disposition notes.

