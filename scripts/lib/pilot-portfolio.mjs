import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const PILOT_PORTFOLIO_IDS = Object.freeze([
  'elite_solar_recovery',
  'omega_accounting',
  'noble_gold',
  'infinite_ai',
]);

const EXPECTED_STAGES = Object.freeze([
  'shadow_25',
  'owned_phone_20',
  'canary_5',
  'canary_20',
  'canary_50',
]);
const POLICY_REVIEW_STAGES = Object.freeze(['policy_review', ...EXPECTED_STAGES]);
const ORGANIZATION_PLACEHOLDERS = Object.freeze({
  elite_solar_recovery: '__REQUIRED_ELITE_SOLAR_ORGANIZATION_ID__',
  omega_accounting: '__REQUIRED_OMEGA_ACCOUNTING_ORGANIZATION_ID__',
  noble_gold: '__REQUIRED_NOBLE_GOLD_ORGANIZATION_ID__',
  infinite_ai: '__REQUIRED_INFINITE_AI_ORGANIZATION_ID__',
});
const REQUIRED_PILOT_KEYS = Object.freeze([
  'id',
  'display_name',
  'organization_id',
  'pilot_status',
  'contact_scope',
  'campaign_bundle',
  'copy_status',
  'next_gate',
  'launch_path',
]);
const REQUIRED_INVARIANT_KEYS = Object.freeze([
  'real_contact_authorized',
  'provider_writes_authorized',
  'crm_writes_authorized',
  'spend_authorized',
  'cross_tenant_resources_forbidden',
  'shared_lead_lists_forbidden',
  'shared_caller_ids_forbidden',
  'shared_provider_credentials_forbidden',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function sameKeys(value, expected) {
  return isPlainObject(value) && Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

function issue(issues, code, path, message) {
  issues.push({ code, path, message });
}

function isPlaceholder(value, id) {
  return value === ORGANIZATION_PLACEHOLDERS[id];
}

export function loadPilotPortfolio(root = 'campaigns/pilot-portfolio') {
  const manifestPath = resolve(root, 'manifest.json');
  return {
    root: resolve(root),
    manifestPath,
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
  };
}

export function validatePilotPortfolio(portfolio) {
  const issues = [];
  const manifest = portfolio?.manifest;
  if (!isPlainObject(manifest)) {
    return { valid: false, issues: [{ code: 'MANIFEST', path: 'manifest', message: 'Portfolio manifest must be an object.' }] };
  }

  if (manifest.schema_version !== '1.0.0') issue(issues, 'SCHEMA_VERSION', 'schema_version', 'Portfolio schema version must be 1.0.0.');
  if (manifest.portfolio_id !== 'dial-smart-multi-account-pilot-portfolio') issue(issues, 'PORTFOLIO_ID', 'portfolio_id', 'Portfolio identity is not canonical.');
  if (manifest.portfolio_status !== 'offline_planning') issue(issues, 'PORTFOLIO_STATUS', 'portfolio_status', 'The canonical portfolio must remain offline_planning.');
  if (manifest.production_launch_allowed !== false) issue(issues, 'LAUNCH_LOCK', 'production_launch_allowed', 'Production launch must remain false in the canonical portfolio.');
  if (typeof manifest.description !== 'string' || manifest.description.length < 20 || manifest.description.length > 400) issue(issues, 'DESCRIPTION', 'description', 'Portfolio description is missing or outside the safe bounds.');

  if (!sameKeys(manifest.global_invariants, REQUIRED_INVARIANT_KEYS)) {
    issue(issues, 'INVARIANT_SCHEMA', 'global_invariants', 'Global invariants must use the exact certified key set.');
  } else {
    for (const [key, value] of Object.entries(manifest.global_invariants)) {
      if (value !== (key.endsWith('_forbidden'))) issue(issues, 'INVARIANT_VALUE', `global_invariants.${key}`, 'Every canonical portfolio invariant must fail closed.');
    }
  }

  if (!Array.isArray(manifest.pilots) || manifest.pilots.length !== PILOT_PORTFOLIO_IDS.length) {
    issue(issues, 'PILOT_COUNT', 'pilots', 'Portfolio must contain exactly the four named pilot tenants.');
    return { valid: false, issues };
  }

  const ids = [];
  const organizations = [];
  for (const [index, pilot] of manifest.pilots.entries()) {
    const path = `pilots[${index}]`;
    if (!sameKeys(pilot, REQUIRED_PILOT_KEYS)) {
      issue(issues, 'PILOT_SCHEMA', path, 'Pilot must use the exact certified field set.');
      continue;
    }
    ids.push(pilot.id);
    organizations.push(pilot.organization_id);
    if (!PILOT_PORTFOLIO_IDS.includes(pilot.id)) issue(issues, 'UNKNOWN_PILOT', `${path}.id`, 'Pilot ID is not one of the authorized portfolio tenants.');
    if (typeof pilot.display_name !== 'string' || pilot.display_name.length < 3 || pilot.display_name.length > 80) issue(issues, 'DISPLAY_NAME', `${path}.display_name`, 'Pilot display name is invalid.');
    if (!isPlaceholder(pilot.organization_id, pilot.id)) issue(issues, 'TENANT_UNRESOLVED_ONLY', `${path}.organization_id`, 'The canonical portfolio must contain only its exact tenant placeholder.');
    if (typeof pilot.next_gate !== 'string' || pilot.next_gate.length < 40 || pilot.next_gate.length > 280) issue(issues, 'NEXT_GATE', `${path}.next_gate`, 'Pilot must name a concrete, bounded next gate.');

    const solar = pilot.id === 'elite_solar_recovery';
    if (solar) {
      if (pilot.contact_scope !== 'consented_database_reactivation_only') issue(issues, 'SOLAR_CONTACT_SCOPE', `${path}.contact_scope`, 'Elite Solar Recovery must remain limited to consented database reactivation only.');
      if (pilot.pilot_status !== 'offline_bundle_ready') issue(issues, 'SOLAR_STATUS', `${path}.pilot_status`, 'Elite Solar Recovery must remain offline_bundle_ready.');
      if (pilot.campaign_bundle !== '../solar-exit') issue(issues, 'SOLAR_BUNDLE', `${path}.campaign_bundle`, 'Elite Solar Recovery must bind only the Solar Exit canonical bundle.');
      if (pilot.copy_status !== 'review_ready_pending_legal_approval') issue(issues, 'SOLAR_COPY_STATUS', `${path}.copy_status`, 'Solar copy must remain pending legal approval.');
      if (JSON.stringify(pilot.launch_path) !== JSON.stringify(EXPECTED_STAGES)) issue(issues, 'SOLAR_PATH', `${path}.launch_path`, 'Solar rollout must use the fixed shadow → owned-phone → 5/20/50 sequence.');
    } else {
      if (pilot.contact_scope !== 'consented_speed_to_lead_intake_only') issue(issues, 'CONTACT_SCOPE', `${path}.contact_scope`, 'Undefined pilots must remain consented speed-to-lead intake only.');
      if (pilot.pilot_status !== 'intake_definition_required') issue(issues, 'UNDEFINED_PILOT_STATUS', `${path}.pilot_status`, 'Non-Solar pilots require a service definition before campaign work.');
      if (pilot.campaign_bundle !== null) issue(issues, 'UNDEFINED_PILOT_BUNDLE', `${path}.campaign_bundle`, 'Non-Solar pilots cannot claim a campaign bundle before one is supplied and reviewed.');
      if (pilot.copy_status !== 'not_started_no_service_claims_or_consent_artifact_provided') issue(issues, 'UNDEFINED_PILOT_COPY', `${path}.copy_status`, 'Non-Solar pilots cannot claim copy readiness without the service and consent artifacts.');
      if (JSON.stringify(pilot.launch_path) !== JSON.stringify(POLICY_REVIEW_STAGES)) issue(issues, 'UNDEFINED_PILOT_PATH', `${path}.launch_path`, 'Non-Solar pilots must begin with policy review before the shared rollout path.');
    }
  }

  if (new Set(ids).size !== ids.length || [...ids].sort().join('|') !== [...PILOT_PORTFOLIO_IDS].sort().join('|')) issue(issues, 'PILOT_IDENTITY', 'pilots', 'Pilot IDs must be unique and exactly match the four named tenants.');
  if (new Set(organizations).size !== organizations.length) issue(issues, 'TENANT_COLLISION', 'pilots.organization_id', 'No two pilots may share an organization identity.');

  return { valid: issues.length === 0, issues };
}

export function summarizePilotPortfolio(portfolio) {
  const report = validatePilotPortfolio(portfolio);
  const manifest = isPlainObject(portfolio?.manifest) ? portfolio.manifest : {};
  const pilots = Array.isArray(manifest.pilots) ? manifest.pilots : [];
  return {
    operation: 'pilot_portfolio_read_only_summary',
    valid: report.valid,
    portfolio_id: manifest.portfolio_id,
    portfolio_status: manifest.portfolio_status,
    authority: {
      contact_authorized: false,
      launch_authorized: false,
      queue_mutation_authorized: false,
      crm_write_authorized: false,
      provider_write_authorized: false,
      spend_authorized: false,
    },
    side_effect_invariants: {
      database_reads: 0,
      database_writes: 0,
      network_requests: 0,
      provider_calls: 0,
      external_messages: 0,
    },
    pilots: pilots.filter(isPlainObject).map((pilot) => ({
      id: pilot.id,
      display_name: pilot.display_name,
      pilot_status: pilot.pilot_status,
      copy_status: pilot.copy_status,
      campaign_bundle: pilot.campaign_bundle,
      next_gate: pilot.next_gate,
      launch_path: pilot.launch_path,
    })),
    issue_count: report.issues.length,
    issues: report.issues,
  };
}
