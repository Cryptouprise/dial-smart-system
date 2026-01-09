import { describe, expect, it } from 'vitest';
import { computeHealthScore, determineMonitoringIntervalDays, getNextCheckDate } from '../monitoringScheduler';

describe('monitoringScheduler', () => {
  describe('computeHealthScore', () => {
    it('returns 100 when there are no issues', () => {
      expect(computeHealthScore([])).toBe(100);
    });

    it('reduces score based on issue severity and clamps at 0', () => {
      const score = computeHealthScore([
        { type: 'critical' },
        { type: 'critical' },
        { type: 'warning' },
        { type: 'info' },
      ]);

      expect(score).toBe(20);
      expect(computeHealthScore([{ type: 'critical' }, { type: 'critical' }, { type: 'critical' }, { type: 'critical' }])).toBe(0);
    });
  });

  describe('determineMonitoringIntervalDays', () => {
    it('uses the most frequent cadence for low scores but never more than daily', () => {
      expect(determineMonitoringIntervalDays(0)).toBe(1);
      expect(determineMonitoringIntervalDays(39)).toBe(1);
    });

    it('uses an every-other-day cadence for mid scores', () => {
      expect(determineMonitoringIntervalDays(50)).toBe(2);
      expect(determineMonitoringIntervalDays(69)).toBe(2);
    });

    it('spaces healthy systems out to every three days', () => {
      expect(determineMonitoringIntervalDays(70)).toBe(3);
      expect(determineMonitoringIntervalDays(95)).toBe(3);
    });
  });

  describe('getNextCheckDate', () => {
    it('calculates the next check date from a baseline date', () => {
      const baseline = new Date('2024-01-01T00:00:00Z');
      const next = getNextCheckDate(65, baseline);

      expect(next.toISOString()).toBe('2024-01-03T00:00:00.000Z');
    });
  });
});
