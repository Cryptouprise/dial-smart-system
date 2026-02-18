import { describe, it, expect } from 'vitest';
import { getSolarTestSettingsPreset, SOLAR_TEST_CALL_TARGET } from '../autonomousSettingsPresets';

describe('autonomousSettingsPresets', () => {
  it('returns a full-auto solar test preset for 2,000 calls', () => {
    const preset = getSolarTestSettingsPreset();

    expect(preset.daily_goal_calls).toBe(SOLAR_TEST_CALL_TARGET);
    expect(preset.max_daily_autonomous_actions).toBe(SOLAR_TEST_CALL_TARGET);
    expect(preset.autonomy_level).toBe('full_auto');
    expect(preset.manage_lead_journeys).toBe(true);
    expect(preset.enable_script_ab_testing).toBe(true);
    expect(preset.enable_daily_planning).toBe(true);
    expect(preset.enable_strategic_insights).toBe(true);
    expect(preset.auto_create_rules_from_insights).toBe(true);
  });
});
