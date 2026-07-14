import type { AutonomousSettings } from '@/hooks/useAutonomousAgent';

/**
 * The first real Solar Exit release is a human-reviewed five-lead canary,
 * following zero-contact shadow and owned-phone evidence. This is a target
 * for the operator's readiness view, never an authorization to contact.
 */
export const SOLAR_EXIT_PILOT_COHORT_TARGET = 5;

/**
 * Configure the dashboard for the Solar Exit pilot without enabling an
 * autonomous worker, changing a campaign, queueing a lead, or placing a call.
 * Physical contact still requires the server-side contact-release gate.
 */
export const getSolarExitPilotSettingsPreset = (): Partial<AutonomousSettings> => ({
  enabled: false,
  autonomy_level: 'suggestions_only',
  auto_execute_recommendations: false,
  auto_approve_script_changes: false,
  require_approval_for_high_priority: true,
  max_daily_autonomous_actions: SOLAR_EXIT_PILOT_COHORT_TARGET,
  auto_prioritize_leads: false,
  daily_goal_calls: SOLAR_EXIT_PILOT_COHORT_TARGET,
  manage_lead_journeys: false,
  enable_script_ab_testing: false,
  auto_optimize_calling_times: false,
  auto_adjust_pacing: false,
  enable_daily_planning: true,
  enable_strategic_insights: true,
  auto_create_rules_from_insights: false,
});
