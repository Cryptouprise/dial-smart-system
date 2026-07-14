import { describe, it, expect } from 'vitest';
import {
  getSolarExitPilotSettingsPreset,
  SOLAR_EXIT_PILOT_COHORT_TARGET,
} from '../autonomousSettingsPresets';

describe('autonomousSettingsPresets', () => {
  it('returns a review-only five-lead Solar Exit pilot setup', () => {
    const preset = getSolarExitPilotSettingsPreset();

    expect(preset.enabled).toBe(false);
    expect(preset.daily_goal_calls).toBe(SOLAR_EXIT_PILOT_COHORT_TARGET);
    expect(preset.max_daily_autonomous_actions).toBe(SOLAR_EXIT_PILOT_COHORT_TARGET);
    expect(preset.autonomy_level).toBe('suggestions_only');
    expect(preset.auto_execute_recommendations).toBe(false);
    expect(preset.auto_approve_script_changes).toBe(false);
    expect(preset.require_approval_for_high_priority).toBe(true);
    expect(preset.auto_prioritize_leads).toBe(false);
    expect(preset.manage_lead_journeys).toBe(false);
    expect(preset.enable_script_ab_testing).toBe(false);
    expect(preset.auto_optimize_calling_times).toBe(false);
    expect(preset.auto_adjust_pacing).toBe(false);
    expect(preset.enable_daily_planning).toBe(true);
    expect(preset.enable_strategic_insights).toBe(true);
    expect(preset.auto_create_rules_from_insights).toBe(false);
  });
});
