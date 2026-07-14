/**
 * Temporary product-safety locks for controls that must cross a trusted server
 * boundary before launch. Keep these messages centralized so every surface
 * fails closed and explains why no mutation was attempted.
 */
export const QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE =
  'This queue control is launch-locked until it is moved behind a server-side safety check. No dialing data was changed.';

export const BILLING_CONTROL_LAUNCH_LOCK_MESSAGE =
  'Billing and pricing changes are launch-locked until they are handled by an audited server-side admin action. No billing data was changed.';

export const CALL_LOG_CONTROL_LAUNCH_LOCK_MESSAGE =
  'Call history is provider evidence. Browser-side logging and outcome changes are launch-locked until they use an audited server action. No call or lead data was changed.';

export const CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE =
  'Campaign activation is launch-locked until an audited server-side promotion proves consent, DNC, jurisdiction, provider version, balance, and global-stop readiness. The campaign remains unchanged.';

export const ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE =
  'Active campaign configuration is immutable in the browser. Pause the campaign before changing agents, providers, rates, hours, workflows, caller IDs, SMS settings, or lead queues. No campaign data was changed.';

export const CALL_DISPATCH_LAUNCH_LOCK_MESSAGE =
  'Manual and automatic browser dispatch are launch-locked until they cross an audited server-side safety boundary. No calls were started and no dialing data was changed.';

export const AUTONOMOUS_ACTION_LAUNCH_LOCK_MESSAGE =
  'Autonomous call, text, email, and follow-up actions are launch-locked in the browser. The AI may analyze and recommend, but a certified server-side action is required before any lead, queue, or external channel changes.';

export type LaunchCertificationRequirement = Readonly<{
  id: string;
  label: string;
  nextStep: string;
}>;

/**
 * Runtime health checks are useful diagnostics, but they are not launch
 * evidence. Keep the missing certification classes visible anywhere the
 * product reports readiness so a healthy function can never become a false
 * green for physical contact.
 */
export const LAUNCH_CERTIFICATION_REQUIREMENTS: readonly LaunchCertificationRequirement[] = [
  {
    id: 'recovered_database',
    label: 'Recovered staging database',
    nextStep: 'Replay the exact locked lineage twice and attach the non-authorizing database certificate.',
  },
  {
    id: 'consent_policy',
    label: 'Consent, claims, and jurisdiction policy',
    nextStep: 'Approve the exact source disclosure, seller, service claims, calling state, hours, DNC, and recording rules.',
  },
  {
    id: 'provider_binding',
    label: 'Provider and caller-ID binding',
    nextStep: 'Certify the exact published agent/LLM versions, webhook identity, owned number, balance, and resource tenant.',
  },
  {
    id: 'ghl_shadow',
    label: 'Signed GHL zero-contact shadow',
    nextStep: 'Reconcile real signed events with zero mismatches and zero calls, texts, queue changes, or operational CRM writes.',
  },
  {
    id: 'owned_phone_20',
    label: 'Twenty owned-phone lifecycles',
    nextStep: 'Complete exactly 20 consecutive company-owned-phone calls with terminal, webhook, billing, and reconciliation proof.',
  },
  {
    id: 'stop_drills',
    label: 'Stop and suppression drills',
    nextStep: 'Pass global stop, seller-wide DNC, spoken opt-out, duplicate, retry, and emergency-pause drills.',
  },
  {
    id: 'launch_approvals',
    label: 'Predecessor-bound launch approvals',
    nextStep: 'Bind product, operations, compliance, finance, and engineering approval to the exact release and first five-lead cohort.',
  },
] as const;

export function browserCampaignStatusMutationAllowed(status: string): boolean {
  // Pausing reduces exposure and remains available as a safety action. Starting
  // or re-starting physical calls must cross the certified server boundary.
  return status === 'paused';
}

export function browserCampaignConfigurationMutationAllowed(status: string): boolean {
  // Only explicitly non-running campaigns may be configured in the browser.
  // Unknown or terminal states fail closed; pausing remains the prerequisite
  // for editing a campaign that is currently active.
  return status === 'draft' || status === 'paused';
}

export function browserCallDispatchAllowed(): boolean {
  // Dispatch is intentionally unavailable from untrusted browser code. The
  // future launch path must cross a server-side gate with fresh campaign,
  // consent, suppression, jurisdiction, provider and global-stop checks.
  return false;
}

/**
 * Browser settings are not a trusted automation authorization. This remains
 * false even when a legacy row says "full_auto" so stale UI state can never
 * send a message, schedule a callback, or alter a lead's future contact path.
 */
export function browserAutonomousActionAllowed(): boolean {
  return false;
}
