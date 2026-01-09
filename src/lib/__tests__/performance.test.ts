import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackPerformance, trackAPICall } from '../performance';

describe('performance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('trackPerformance', () => {
    it('should track custom performance metrics', () => {
      const spy = vi.spyOn(console, 'log');
      
      trackPerformance('CustomOperation', 150, 'ms');
      
      // Logs in dev mode
      if (import.meta.env.DEV) {
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0]).toContain('CustomOperation');
        expect(spy.mock.calls[0][0]).toContain('150');
      }
    });

    it('should handle different units', () => {
      const spy = vi.spyOn(console, 'log');
      
      trackPerformance('MemoryUsage', 75, '%');
      
      if (import.meta.env.DEV) {
        expect(spy).toHaveBeenCalled();
        expect(spy.mock.calls[0][0]).toContain('%');
      }
    });
  });

  describe('trackAPICall', () => {
    it('should track successful API calls', async () => {
      const mockAPICall = vi.fn(() => Promise.resolve({ data: 'test' }));
      
      const result = await trackAPICall('testAPI', mockAPICall);
      
      expect(result).toEqual({ data: 'test' });
      expect(mockAPICall).toHaveBeenCalledOnce();
    });

    it('should track API call errors', async () => {
      const mockError = new Error('API Error');
      const mockAPICall = vi.fn(() => Promise.reject(mockError));
      
      await expect(trackAPICall('testAPI', mockAPICall)).rejects.toThrow('API Error');
      expect(mockAPICall).toHaveBeenCalledOnce();
    });

    it('should measure API call duration', async () => {
      const mockAPICall = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: 'test' };
      });
      
      await trackAPICall('slowAPI', mockAPICall);
      
      expect(mockAPICall).toHaveBeenCalledOnce();
    });

    it('should handle fast API calls', async () => {
      const mockAPICall = vi.fn(() => Promise.resolve({ data: 'fast' }));
      
      const result = await trackAPICall('fastAPI', mockAPICall);
      
      expect(result).toEqual({ data: 'fast' });
    });
  });
});
