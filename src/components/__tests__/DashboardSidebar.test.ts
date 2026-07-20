import { describe, expect, it } from 'vitest';
import { getFilteredNavigation } from '../DashboardSidebar';

describe('DashboardSidebar Simple Mode', () => {
  it('keeps the default navigation on the pilot-safe workflow', () => {
    const items = getFilteredNavigation(true, true).flatMap((group) => group.items);
    const values = items.map((item) => item.value);

    expect(values).toEqual([
      'command-center',
      'launch-readiness',
      'leads',
      'autonomous-agent',
      'campaign-results',
      'settings',
    ]);
    expect(items.find((item) => item.value === 'leads')?.title).toBe('Lead Import & Review');
    expect(values).not.toContain('predictive');
    expect(values).not.toContain('sms');
    expect(values).not.toContain('calendar');
  });
});
