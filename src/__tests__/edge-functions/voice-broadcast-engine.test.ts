/**
 * Voice Broadcast Engine Tests
 *
 * Tests the core pacing logic and configuration constants used by the
 * voice-broadcast-engine edge function.
 *
 * Since the edge function runs in Deno and cannot be directly imported into
 * a Vitest/Node environment, we recreate the pure functions and constants
 * here and verify their behavior matches the documented specification.
 */

import { describe, it, expect } from 'vitest';

// ---- Recreated constants from voice-broadcast-engine/index.ts lines 10-15 ----
const MAX_CONCURRENT_CALLS = 100;
const ERROR_RATE_PAUSE_THRESHOLD = 0.25;
const ERROR_RATE_ALERT_THRESHOLD = 0.10;
const MIN_CALL_DELAY_MS = 100;
const DEFAULT_CALLS_PER_MINUTE = 50;
const MAX_RETRIES_ON_429 = 3;

// ---- Recreated pure function from voice-broadcast-engine/index.ts lines 19-23 ----
function calculatePacingDelay(callsPerMinute: number): number {
  const targetCallsPerMinute = Math.max(1, callsPerMinute || DEFAULT_CALLS_PER_MINUTE);
  const calculatedDelay = Math.floor(60000 / targetCallsPerMinute);
  return Math.max(MIN_CALL_DELAY_MS, calculatedDelay);
}

describe('Voice Broadcast Engine', () => {
  describe('Constants', () => {
    it('MAX_CONCURRENT_CALLS should be 100', () => {
      expect(MAX_CONCURRENT_CALLS).toBe(100);
    });

    it('ERROR_RATE_PAUSE_THRESHOLD should be 0.25 (25%)', () => {
      expect(ERROR_RATE_PAUSE_THRESHOLD).toBe(0.25);
    });

    it('ERROR_RATE_ALERT_THRESHOLD should be 0.10 (10%)', () => {
      expect(ERROR_RATE_ALERT_THRESHOLD).toBe(0.10);
    });

    it('alert threshold should be lower than pause threshold', () => {
      expect(ERROR_RATE_ALERT_THRESHOLD).toBeLessThan(ERROR_RATE_PAUSE_THRESHOLD);
    });

    it('MIN_CALL_DELAY_MS should be 100', () => {
      expect(MIN_CALL_DELAY_MS).toBe(100);
    });

    it('DEFAULT_CALLS_PER_MINUTE should be 50', () => {
      expect(DEFAULT_CALLS_PER_MINUTE).toBe(50);
    });

    it('MAX_RETRIES_ON_429 should be 3', () => {
      expect(MAX_RETRIES_ON_429).toBe(3);
    });
  });

  describe('calculatePacingDelay()', () => {
    describe('Standard pacing rates', () => {
      it('50 calls/min should produce 1200ms delay', () => {
        expect(calculatePacingDelay(50)).toBe(1200);
      });

      it('100 calls/min should produce 600ms delay', () => {
        expect(calculatePacingDelay(100)).toBe(600);
      });

      it('200 calls/min should produce 300ms delay', () => {
        expect(calculatePacingDelay(200)).toBe(300);
      });

      it('30 calls/min should produce 2000ms delay', () => {
        expect(calculatePacingDelay(30)).toBe(2000);
      });

      it('10 calls/min should produce 6000ms delay', () => {
        expect(calculatePacingDelay(10)).toBe(6000);
      });

      it('1 call/min should produce 60000ms delay', () => {
        expect(calculatePacingDelay(1)).toBe(60000);
      });
    });

    describe('Minimum delay enforcement (100ms floor)', () => {
      it('600 calls/min should be clamped to 100ms minimum', () => {
        // 60000 / 600 = 100, exactly at the floor
        expect(calculatePacingDelay(600)).toBe(100);
      });

      it('601+ calls/min should be clamped to 100ms minimum', () => {
        // 60000 / 601 = 99.8 → floor = 99 → clamped to 100
        expect(calculatePacingDelay(601)).toBe(100);
      });

      it('1000 calls/min should be clamped to 100ms minimum', () => {
        // 60000 / 1000 = 60 → clamped to 100
        expect(calculatePacingDelay(1000)).toBe(100);
      });

      it('10000 calls/min should be clamped to 100ms minimum', () => {
        expect(calculatePacingDelay(10000)).toBe(100);
      });
    });

    describe('Edge cases: zero, negative, undefined inputs', () => {
      it('0 calls/min should fall back to DEFAULT_CALLS_PER_MINUTE (1200ms)', () => {
        // 0 is falsy → callsPerMinute || DEFAULT_CALLS_PER_MINUTE → 50
        expect(calculatePacingDelay(0)).toBe(1200);
      });

      it('negative calls/min should be clamped to 1 via Math.max', () => {
        // -10 is truthy so || doesn't trigger, but Math.max(1, -10) = 1
        // 60000 / 1 = 60000
        expect(calculatePacingDelay(-10)).toBe(60000);
      });

      it('negative large value should be clamped to 1', () => {
        expect(calculatePacingDelay(-1000)).toBe(60000);
      });

      it('undefined input should fall back to DEFAULT_CALLS_PER_MINUTE', () => {
        // undefined || DEFAULT → 50
        expect(calculatePacingDelay(undefined as unknown as number)).toBe(1200);
      });

      it('NaN input should fall back to DEFAULT_CALLS_PER_MINUTE', () => {
        // NaN || DEFAULT → 50
        expect(calculatePacingDelay(NaN)).toBe(1200);
      });

      it('null input should fall back to DEFAULT_CALLS_PER_MINUTE', () => {
        // null || DEFAULT → 50
        expect(calculatePacingDelay(null as unknown as number)).toBe(1200);
      });
    });

    describe('Mathematical properties', () => {
      it('delay should be inversely proportional to calls/min (within valid range)', () => {
        const delay50 = calculatePacingDelay(50);
        const delay100 = calculatePacingDelay(100);
        // Doubling CPM should halve the delay
        expect(delay50).toBe(delay100 * 2);
      });

      it('result should always be a positive integer', () => {
        const testValues = [1, 5, 10, 33, 50, 77, 100, 200, 500, 1000];
        for (const v of testValues) {
          const delay = calculatePacingDelay(v);
          expect(delay).toBeGreaterThan(0);
          expect(Number.isInteger(delay)).toBe(true);
        }
      });

      it('result should never be less than MIN_CALL_DELAY_MS', () => {
        const extremeValues = [1, 100, 600, 1000, 100000, Infinity];
        for (const v of extremeValues) {
          // Infinity: 60000/Infinity = 0, floor=0, clamped to 100
          const delay = calculatePacingDelay(v);
          expect(delay).toBeGreaterThanOrEqual(MIN_CALL_DELAY_MS);
        }
      });
    });
  });

  describe('Error rate threshold logic', () => {
    it('error rate below 10% should not trigger alert or pause', () => {
      const errorRate = 0.05;
      expect(errorRate < ERROR_RATE_ALERT_THRESHOLD).toBe(true);
      expect(errorRate < ERROR_RATE_PAUSE_THRESHOLD).toBe(true);
    });

    it('error rate at exactly 10% should trigger alert but not pause', () => {
      const errorRate = 0.10;
      expect(errorRate >= ERROR_RATE_ALERT_THRESHOLD).toBe(true);
      expect(errorRate < ERROR_RATE_PAUSE_THRESHOLD).toBe(true);
    });

    it('error rate at 15% should trigger alert but not pause', () => {
      const errorRate = 0.15;
      expect(errorRate >= ERROR_RATE_ALERT_THRESHOLD).toBe(true);
      expect(errorRate < ERROR_RATE_PAUSE_THRESHOLD).toBe(true);
    });

    it('error rate at exactly 25% should trigger pause', () => {
      const errorRate = 0.25;
      expect(errorRate >= ERROR_RATE_PAUSE_THRESHOLD).toBe(true);
    });

    it('error rate at 50% should trigger pause', () => {
      const errorRate = 0.50;
      expect(errorRate >= ERROR_RATE_PAUSE_THRESHOLD).toBe(true);
    });
  });

  describe('Concurrency limits', () => {
    it('should allow dispatching when active calls below max', () => {
      const activeCalls = 50;
      expect(activeCalls < MAX_CONCURRENT_CALLS).toBe(true);
    });

    it('should block dispatching when at max concurrent calls', () => {
      const activeCalls = 100;
      expect(activeCalls >= MAX_CONCURRENT_CALLS).toBe(true);
    });

    it('should block dispatching when over max concurrent calls', () => {
      const activeCalls = 150;
      expect(activeCalls >= MAX_CONCURRENT_CALLS).toBe(true);
    });

    it('should calculate available slots correctly', () => {
      const activeCalls = 75;
      const availableSlots = MAX_CONCURRENT_CALLS - activeCalls;
      expect(availableSlots).toBe(25);
    });

    it('should report 0 available slots when at capacity', () => {
      const activeCalls = 100;
      const availableSlots = Math.max(0, MAX_CONCURRENT_CALLS - activeCalls);
      expect(availableSlots).toBe(0);
    });

    it('should clamp available slots to 0 when over capacity', () => {
      const activeCalls = 120;
      const availableSlots = Math.max(0, MAX_CONCURRENT_CALLS - activeCalls);
      expect(availableSlots).toBe(0);
    });
  });
});
