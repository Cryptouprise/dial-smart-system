/**
 * The first Elite Solar Recovery campaign is an editable human-review artifact,
 * not an agent prompt or a contact instruction. Keeping the language beside the
 * campaign profile makes the claims and handoff rules visible before a future
 * certified provider binding is even considered.
 */
export const SOLAR_EXIT_REVIEW_BRIEF = Object.freeze({
  title: 'Solar Contract Exit: review-only intake brief',
  status: 'No-contact draft — human approval required',
  purpose:
    'Give consented people a clear, neutral intake path to request a human review of their solar agreement.',
  opening:
    'Hi {{first_name}}, this is {{agent_name}} calling on behalf of Elite Solar Recovery. You requested information about getting help understanding your solar agreement. Is now an okay time for a short intake?',
  disclosure:
    'I am an intake assistant. I can collect basic information, but I cannot give legal or financial advice, promise a result, tell you to cancel an agreement, or advise you to stop making payments.',
  questions: [
    'Are you the person who asked Elite Solar Recovery for information about your solar agreement?',
    'What would you like help understanding about the agreement or your experience?',
    'When did you sign the agreement or have the system installed, if you recall?',
    'What state is the property in?',
    'Have you already contacted the installer, lender, or another professional about this?',
    'If a qualified team member is able to review your intake, what is the best way and time to reach you?',
  ],
  permittedStatements: [
    'We can document your request for a human review.',
    'A team member may follow up after reviewing the intake and eligibility.',
    'We cannot promise a result, a cancellation, a refund, savings, relief, or a particular timeframe.',
  ],
  hardStops: [
    'If the person says stop, do not call, unsubscribe, or indicates they are not the intended person: end the interaction and require suppression handling before any future contact.',
    'If the person asks for legal, tax, lending, credit, or financial advice: state that the intake assistant cannot provide that advice and offer only a human-review request.',
    'Do not discuss an account balance, payment instruction, lawsuit, cancellation process, refund amount, or guaranteed outcome.',
  ],
  handoff:
    'Thank you. I will record your request for human review. If the intake is eligible, a team member may contact you. No outcome, cancellation, refund, savings, relief, or timeline is promised.',
  reviewDispositions: [
    'requested_human_review',
    'not_intended_person',
    'do_not_contact',
    'needs_legal_or_financial_advice',
    'insufficient_intake_information',
  ],
  prohibitedActions: [
    'call',
    'text',
    'email',
    'voicemail',
    'booking',
    'transfer',
    'CRM write',
    'provider request',
    'automatic follow-up',
  ],
} as const);
