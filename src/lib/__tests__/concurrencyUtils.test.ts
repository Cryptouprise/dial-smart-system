import { describe, it, expect } from 'vitest';
import { computeDialingRate, computePlatformCapacities, ConcurrencySettings, TransferPlatform } from '../concurrencyUtils';

describe('concurrencyUtils', () => {
  const defaultSettings: ConcurrencySettings = {
    maxConcurrentCalls: 10,
    callsPerMinute: 20,
    maxCallsPerAgent: 5,
    enableAdaptivePacing: true,
    retellMaxConcurrent: 5,
    assistableMaxConcurrent: 5,
    transferQueueEnabled: true,
  };

  describe('computeDialingRate', () => {
    it('should compute metrics for low utilization', () => {
      const result = computeDialingRate(2, defaultSettings);
      
      expect(result.currentConcurrency).toBe(2);
      expect(result.maxConcurrency).toBe(10);
      expect(result.utilizationRate).toBe(20);
      expect(result.availableSlots).toBe(8);
      expect(result.recommendedRate).toBeGreaterThan(defaultSettings.callsPerMinute);
    });

    it('should compute metrics for high utilization', () => {
      const result = computeDialingRate(9, defaultSettings);
      
      expect(result.currentConcurrency).toBe(9);
      expect(result.maxConcurrency).toBe(10);
      expect(result.utilizationRate).toBe(90);
      expect(result.availableSlots).toBe(1);
      // At exactly 90% utilization, no rate adjustment is made
      expect(result.recommendedRate).toBe(20);
    });

    it('should reduce rate for very high utilization', () => {
      const result = computeDialingRate(10, defaultSettings);
      
      expect(result.utilizationRate).toBe(100);
      // 100% is > 0.9, so rate reduces to 70% (14)
      expect(result.recommendedRate).toBe(14);
    });

    it('should compute metrics for zero concurrency', () => {
      const result = computeDialingRate(0, defaultSettings);
      
      expect(result.currentConcurrency).toBe(0);
      expect(result.utilizationRate).toBe(0);
      expect(result.availableSlots).toBe(10);
    });

    it('should handle full capacity', () => {
      const result = computeDialingRate(10, defaultSettings);
      
      expect(result.utilizationRate).toBe(100);
      expect(result.availableSlots).toBe(0);
    });

    it('should cap recommended rate at 50', () => {
      const settings = { ...defaultSettings, callsPerMinute: 40 };
      const result = computeDialingRate(1, settings);
      
      expect(result.recommendedRate).toBeLessThanOrEqual(50);
    });

    it('should maintain minimum rate of 10', () => {
      const settings = { ...defaultSettings, callsPerMinute: 15 };
      const result = computeDialingRate(9, settings);
      
      expect(result.recommendedRate).toBeGreaterThanOrEqual(10);
    });
  });

  describe('computePlatformCapacities', () => {
    it('should compute capacities with no active transfers', () => {
      const result = computePlatformCapacities([], defaultSettings);
      
      expect(result.retell.active).toBe(0);
      expect(result.retell.available).toBe(5);
      expect(result.retell.utilizationRate).toBe(0);
      
      expect(result.assistable.active).toBe(0);
      expect(result.assistable.available).toBe(5);
      expect(result.assistable.utilizationRate).toBe(0);
    });

    it('should compute capacities with retell transfers', () => {
      const transfers = [
        { platform: 'retell' as TransferPlatform },
        { platform: 'retell' as TransferPlatform },
        { platform: 'retell' as TransferPlatform },
      ];
      
      const result = computePlatformCapacities(transfers, defaultSettings);
      
      expect(result.retell.active).toBe(3);
      expect(result.retell.available).toBe(2);
      expect(result.retell.utilizationRate).toBe(60);
    });

    it('should compute capacities with assistable transfers', () => {
      const transfers = [
        { platform: 'assistable' as TransferPlatform },
        { platform: 'assistable' as TransferPlatform },
      ];
      
      const result = computePlatformCapacities(transfers, defaultSettings);
      
      expect(result.assistable.active).toBe(2);
      expect(result.assistable.available).toBe(3);
      expect(result.assistable.utilizationRate).toBe(40);
    });

    it('should compute capacities with mixed transfers', () => {
      const transfers = [
        { platform: 'retell' as TransferPlatform },
        { platform: 'assistable' as TransferPlatform },
        { platform: 'retell' as TransferPlatform },
      ];
      
      const result = computePlatformCapacities(transfers, defaultSettings);
      
      expect(result.retell.active).toBe(2);
      expect(result.assistable.active).toBe(1);
    });

    it('should handle full capacity', () => {
      const transfers = Array(5).fill({ platform: 'retell' as TransferPlatform });
      
      const result = computePlatformCapacities(transfers, defaultSettings);
      
      expect(result.retell.active).toBe(5);
      expect(result.retell.available).toBe(0);
      expect(result.retell.utilizationRate).toBe(100);
    });
  });
});
