import {
  loadSolarExitBundle,
  requiredPlaceholderOccurrences,
  validateSolarExitBundleData,
} from './solar-exit-bundle.mjs';

const NO_AUTHORITY = Object.freeze({
  contact_authorized: false,
  launch_authorized: false,
  queue_mutation_authorized: false,
  crm_write_authorized: false,
  provider_write_authorized: false,
  spend_authorized: false,
});

const NO_SIDE_EFFECTS = Object.freeze({
  database_reads: 0,
  database_writes: 0,
  network_requests: 0,
  provider_calls: 0,
  external_messages: 0,
});

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

/**
 * Builds the one-screen operator handoff for the current Elite Solar source
 * bundle. It deliberately reads only local, non-PII campaign specifications:
 * no credential, customer, CRM, provider, or network input is accepted.
 *
 * A green `offline_validation` means the immutable draft is structurally
 * sound. It is never a production launch certificate.
 */
export function buildEliteSolarMorningBrief(bundle = loadSolarExitBundle()) {
  const validation = validateSolarExitBundleData(bundle, { mode: 'offline' });
  const unresolvedPlaceholders = uniqueSorted(
    requiredPlaceholderOccurrences(bundle).map((entry) => entry.placeholder),
  );
  const manifest = bundle.manifest;
  const campaign = manifest.campaign || {};
  const source = bundle.directImport || {};

  return Object.freeze({
    kind: 'elite_solar_morning_brief_v1',
    status: validation.valid ? 'offline_bundle_ready' : 'offline_bundle_invalid',
    statement: validation.valid
      ? 'The review-only bundle is internally valid. It remains zero-contact until the separately retained production evidence chain passes.'
      : 'The review-only bundle has structural errors. Resolve those local errors before attempting any release-candidate work.',
    bundle: Object.freeze({
      bundle_id: manifest.bundle_id,
      bundle_version: manifest.bundle_version,
      environment: manifest.environment,
      campaign_name: campaign.name,
      campaign_type: campaign.campaign_type,
      campaign_status: campaign.status,
      primary_source_mode: source.mode,
      gohighlevel_required: source.gohighlevel_required === true,
    }),
    offline_validation: Object.freeze({
      valid: validation.valid,
      error_count: validation.error_count,
      warning_count: validation.warning_count,
      dispositions: validation.counts.dispositions,
      conversation_contracts: validation.counts.conversation_tests,
      synthetic_leads: validation.counts.synthetic_leads,
      synthetic_consent_records: validation.counts.consent_fixtures,
    }),
    production_release: Object.freeze({
      launch_authorized: false,
      blocker_count: validation.launch_blockers.length,
      blockers: Object.freeze([...validation.launch_blockers]),
      unresolved_placeholder_count: unresolvedPlaceholders.length,
      unresolved_placeholders: Object.freeze(unresolvedPlaceholders),
    }),
    next_gate: Object.freeze({
      id: 'signed_source_shadow_25',
      label: 'Create an isolated release candidate and complete a 25-record signed direct-import shadow.',
      why: 'This first proof is zero-contact. It binds an approved source, exact seller-specific consent, matching original phone, state, and suppression evidence before any provider interaction.',
      operator_handoff: Object.freeze([
        'Keep signing keys, source exports, consent artifacts, and provider credentials outside this repository and out of chat.',
        'Resolve legal, policy, tenant, and source bindings only in a separately created, launch-disabled release candidate.',
        'Use the signed direct-import path first; GHL remains an optional shadow adapter and is not contact authority.',
        'Review the redacted 25-record result. A clean report is evidence only, not permission to call, email, text, queue, or write a CRM.',
      ]),
    }),
    release_ladder: Object.freeze([
      'signed_source_shadow_25',
      'owned_phone_20',
      'human_approved_canary_5',
      'human_approved_canary_20',
      'human_approved_canary_50',
    ]),
    email_lane: Object.freeze({
      status: 'draft_and_human_handoff_proposal_ready_separate_from_calling_campaign',
      providers: Object.freeze(['instantly', 'mailgun']),
      provider_action: 'none',
      handoff_proposal_command: 'npm run email:elite-solar:handoff -- --draft <approved-email-plan.json> --release <elite-email-release.json>',
      required_before_future_handoff: Object.freeze([
        'approved source basis and list hygiene',
        'verified sender identity, domain, reply handling, postal address, and unsubscribe path',
        'suppression synchronization, provider health, copy approval, and a separately signed staged recipient release',
      ]),
    }),
    voice_lane: Object.freeze({
      status: 'candidate_readiness_check_available_provider_connection_not_established',
      provider: 'retell',
      provider_action: 'none',
      readiness_command: 'npm run retell:solar:readiness',
      required_before_owned_phone_testing: Object.freeze([
        'exact reviewed Retell agent/version candidate held in the approved deployment secret store',
        'human-approved caller identity, calling-window, recording/review, escalation, DNC, global-stop, and reconciliation policy',
        '20 company-owned phone lifecycles with human recording/transcript review',
      ]),
    }),
    authority: NO_AUTHORITY,
    side_effect_invariants: NO_SIDE_EFFECTS,
  });
}
