export type EliteSolarPilotCopilotReply = Readonly<{
  topic: string;
  headline: string;
  detail: string;
  nextActions: readonly string[];
  recognized: boolean;
}>;

export const ELITE_SOLAR_COPILOT_SUGGESTIONS = Object.freeze([
  'Morning beat',
  'What do you need?',
  'What is next?',
  'Source shadow',
  'Testing plan',
  'Launch status',
  'Email campaign',
  'MCP and Slack',
] as const);

const HELP_REPLY: EliteSolarPilotCopilotReply = Object.freeze({
  topic: 'Pilot guide',
  headline: 'Elite Solar is in review-only pilot mode.',
  detail: 'Ask about the source shadow, test plan, launch status, email campaign, or MCP and Slack. This local guide does not inspect live systems or authorize action.',
  nextActions: Object.freeze([
    'Use the signed direct-import source path first; GHL is optional.',
    'Keep every provider, contact, queue, and CRM action locked until evidence is accepted.',
  ]),
  recognized: true,
});

const REPLIES: Readonly<Record<string, EliteSolarPilotCopilotReply>> = Object.freeze({
  help: HELP_REPLY,
  handoff: Object.freeze({
    topic: 'Live-evidence handoff',
    headline: 'Three evidence packages unlock the real Elite pilot; none belong in this chat.',
    detail: 'The system needs campaign identity and approvals, a signed 25-record source shadow outside the repository, and owned-phone/provider configuration held in the correct secret store. It does not need raw contacts or credentials pasted here.',
    nextActions: Object.freeze([
      'Provide the legal seller/DBA, approved offer source, sender identity, booking destination, and named compliance/owner approvers as external evidence references.',
      'Create one short-lived 25-record reactivation export with original source/permission proof, current suppression/revocation state, and an external signature; run it only in zero-contact shadow mode.',
      'Store Retell and optional email-provider credentials as deployment secrets, then run only the redacted readiness checks and owned-phone tests before a human-reviewed canary.',
    ]),
    recognized: true,
  }),
  morning: Object.freeze({
    topic: 'Morning beat',
    headline: 'Elite Solar is staged for review; it is not authorized to contact anyone.',
    detail: 'The locked campaign bundle, call-copy checks, direct-import path, email draft lane, and operator beat are prepared. The next real proof is still a signed 25-record zero-contact source shadow.',
    nextActions: Object.freeze([
      'Keep calls, texts, provider sends, CRM writes, queues, and spend locked.',
      'Use the non-PII provider readiness brief after a provider key is stored as a deployment secret.',
      'Review the signed source shadow before any owned-phone or human-canary work.',
    ]),
    recognized: true,
  }),
  next: Object.freeze({
    topic: 'Next gate',
    headline: 'Start with the 25-record signed direct-import shadow.',
    detail: 'The first useful proof is a zero-contact comparison of a user-owned, consent-proven Elite export. It is not a CRM import or a call release.',
    nextActions: Object.freeze([
      'Create the keys outside the repository and pin only the public fingerprint in an isolated release candidate.',
      'Export 25 records with the original consent phone, exact seller/source/disclosure evidence, states, and suppression/revocation status.',
      'Sign the external export and run the zero-contact shadow evaluator. Review a clean 25/25 report before any owned-phone work.',
    ]),
    recognized: true,
  }),
  source: Object.freeze({
    topic: 'Signed source shadow',
    headline: 'The direct import is the primary Elite source path.',
    detail: 'It is GHL-independent, tenant-bound, signed, and redacted. A historical appointment, a database row, or a current CRM phone does not establish permission by itself.',
    nextActions: Object.freeze([
      'Use a controlled export only; do not paste records, keys, or raw consent evidence here.',
      'Require exact seller-specific AI/telemarketing consent and original-phone matching for every record.',
      'Treat the report as evidence only. It never authorizes a call.',
    ]),
    recognized: true,
  }),
  testing: Object.freeze({
    topic: 'Testing plan',
    headline: 'Earn the first human canary through evidence, not a toggle.',
    detail: 'Run the locked campaign suite, exercise synthetic conversations, then complete 20 company-owned-phone lifecycles with provider, webhook, billing, DNC, and reconciliation proof.',
    nextActions: Object.freeze([
      'Use synthetic transcript linting to catch high-risk language before sandbox or owned-phone testing.',
      'Run the 27 conversation contracts and preserve human recording/transcript review evidence.',
      'Pass the owned-phone 20 stage before a manually reviewed 5-person cohort.',
    ]),
    recognized: true,
  }),
  launch: Object.freeze({
    topic: 'Launch status',
    headline: 'The production path is intentionally still locked.',
    detail: 'Offline validation is green, but live authority requires resolved legal/consent/state inputs, exact Retell versions, a signed source shadow, database and suppression drills, owned-phone evidence, and five bound approvals.',
    nextActions: Object.freeze([
      'Do not treat a healthy UI, GHL read, or a campaign draft as contact permission.',
      'Complete the evidence chain in an isolated release candidate, then run the launch gate again.',
    ]),
    recognized: true,
  }),
  email: Object.freeze({
    topic: 'Email campaign',
    headline: 'The Elite reactivation email has a draft and a small-cohort handoff proposal, but cannot send.',
    detail: 'The copy, no-send plan compiler, read-only Instantly/Mailgun readiness probes, and a 1–25-recipient non-PII handoff proposal are ready. This lane cannot send, import recipients, or create a provider campaign; those remain separate reviewed actions.',
    nextActions: Object.freeze([
      'Approve sender identity, postal address, reply owner, booking destination, source basis, suppression synchronization, and final copy.',
      'Use an external provider key only through a reviewed deployment secret, never in this chat or a campaign file.',
    ]),
    recognized: true,
  }),
  operators: Object.freeze({
    topic: 'MCP and Slack',
    headline: 'The operator layer is observer-only by design.',
    detail: 'MCP, Slack, and Teams are being prepared to surface a tenant-bound morning beat, campaign status, and Elite release posture. They cannot activate, dispatch, import, or spend.',
    nextActions: Object.freeze([
      'Provision one isolated test channel and bind it to a single tenant after the source-review work is accepted.',
      'Keep the command set limited to read-only status and exact campaign inspection until durable receipts and tenant binding are certified.',
    ]),
    recognized: true,
  }),
});

const ALIASES: Readonly<Record<string, keyof typeof REPLIES>> = Object.freeze({
  help: 'help',
  'what can you do': 'help',
  'what do you need': 'handoff',
  'what do you need from me': 'handoff',
  'what do you need from us': 'handoff',
  handoff: 'handoff',
  'morning beat': 'morning',
  'morning brief': 'morning',
  'today\'s beat': 'morning',
  'daily beat': 'morning',
  'what is next': 'next',
  'what is next?': 'next',
  next: 'next',
  'source shadow': 'source',
  source: 'source',
  'direct import': 'source',
  'testing plan': 'testing',
  testing: 'testing',
  test: 'testing',
  'launch status': 'launch',
  launch: 'launch',
  status: 'launch',
  'email campaign': 'email',
  email: 'email',
  'mcp and slack': 'operators',
  mcp: 'operators',
  slack: 'operators',
  teams: 'operators',
});

const SENSITIVE_INPUT_PATTERN = /(?:\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b)|(?:\+?\d[\d\s().-]{6,}\d)|(?:\b(?:sk|pit|dsk_live)[-_][a-z0-9_-]{8,}\b)|(?:\b(?:super[-_]?secret|private[-_]?key|bearer[-_]?token)\b)/i;

function classifySafeQuestion(normalized: string): keyof typeof REPLIES | undefined {
  const exact = ALIASES[normalized];
  if (exact) return exact;

  if (/\b(?:morning|daily|today(?:'s)?|beat|brief)\b/.test(normalized)) return 'morning';
  if (/\b(?:launch|live|production|ready|activate|activation)\b/.test(normalized)) return 'launch';
  if (/\b(?:handoff|what do you need|what.*provide)\b/.test(normalized)) return 'handoff';
  if (/\b(?:email|instantly|mailgun|outreach|sequence|sender)\b/.test(normalized)) return 'email';
  if (/\b(?:shadow|source|import|consent|permission|suppression)\b/.test(normalized)) return 'source';
  if (/\b(?:test|testing|sandbox|owned[ -]?phone|canary|retell|transcript)\b/.test(normalized)) return 'testing';
  if (/\b(?:mcp|slack|teams|channel|operator)\b/.test(normalized)) return 'operators';
  if (/\b(?:next|start|first|begin|priorit(?:y|ize))\b/.test(normalized)) return 'next';
  if (/\b(?:help|explain|what can|how do|what do)\b/.test(normalized)) return 'help';
  return undefined;
}

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (value.length === 0 || value.length > 160 || !/^[\x20-\x7e]+$/.test(value)) return null;
  const normalized = value.trim().replace(/ +/g, ' ').toLowerCase();
  return normalized || null;
}

/**
 * A local, finite playbook - not an LLM prompt and not a control-plane client.
 * It understands a narrow safe vocabulary but never forwards free-form text.
 */
export function resolveEliteSolarPilotQuestion(value: unknown): EliteSolarPilotCopilotReply {
  const normalized = normalize(value);
  const key = normalized && !SENSITIVE_INPUT_PATTERN.test(normalized)
    ? classifySafeQuestion(normalized)
    : undefined;
  if (key) return REPLIES[key];
  return Object.freeze({
    topic: 'Unrecognized question',
    headline: 'Use one of the bounded Elite pilot questions.',
    detail: 'This guide never sends free-form text to a model or provider. Do not paste contacts, phone numbers, consent artifacts, credentials, or customer documents here.',
    nextActions: ELITE_SOLAR_COPILOT_SUGGESTIONS.map((item) => `Ask: ${item}`),
    recognized: false,
  });
}
