import type { AutonomousSettings } from '@/hooks/useAutonomousAgent';

export const SOLAR_TEST_CALL_TARGET = 2000;

export const getSolarTestSettingsPreset = (): Partial<AutonomousSettings> => ({
  enabled: true,
  autonomy_level: 'full_auto',
  auto_execute_recommendations: true,
  auto_prioritize_leads: true,
  daily_goal_calls: SOLAR_TEST_CALL_TARGET,
  max_daily_autonomous_actions: SOLAR_TEST_CALL_TARGET,
  manage_lead_journeys: true,
  enable_script_ab_testing: true,
  auto_optimize_calling_times: true,
  auto_adjust_pacing: true,
  enable_daily_planning: true,
  enable_strategic_insights: true,
  auto_create_rules_from_insights: true,
});
