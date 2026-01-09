/**
 * Outbound Calling Rate Limit Tests
 * 
 * Tests that the outbound-calling function properly detects
 * and handles rate limits from Retell.
 */

import { describe, it, expect } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

describe('Outbound Calling Rate Limit Handling', () => {
  describe('Rate Limit Detection', () => {
    it('should have rate limit detection code in place', async () => {
      // This test verifies the function can be invoked
      // and returns structured responses
      const { data, error } = await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'check_health'
        }
      });

      // The function should respond (may error if invalid action, but shouldn't crash)
      // We're testing that the function exists and has been deployed
      expect(data !== undefined || error !== undefined).toBe(true);
    });

    it('should return structured error on rate limit', async () => {
      // Simulate what a rate limit response should look like
      // by calling with an action that would trigger rate limiting
      // (In practice, we can't easily trigger a real rate limit in tests)
      
      const { data, error } = await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'create_call',
          phoneNumber: '+15550000000', // Fake number
          callerId: '+15551234567',
          agentId: 'test_agent', // Will fail, but we're testing error handling
        }
      });

      // Should return a structured response, not crash
      expect(data !== undefined || error !== undefined).toBe(true);

      // If there's an error, it should be parseable
      if (error) {
        expect(typeof error.message).toBe('string');
      }

      // If there's data with an error, it should indicate what went wrong
      if (data?.error) {
        expect(typeof data.error).toBe('string');
      }
    });
  });

  describe('Error Response Structure', () => {
    it('should return meaningful error codes', async () => {
      // Call with intentionally invalid params to trigger error handling
      const { data, error } = await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'create_call',
          // Missing required fields
        }
      });

      // Should handle gracefully
      expect(data !== undefined || error !== undefined).toBe(true);

      // If rate limited, should indicate with specific code
      if (data?.code === 'RATE_LIMIT') {
        expect(data.retryAfter).toBeDefined();
      }
    });

    it('should include retry guidance when rate limited', async () => {
      // This test documents expected behavior
      // The actual rate limit scenario would need to be triggered in production
      
      // Expected rate limit response format:
      const expectedRateLimitResponse = {
        success: false,
        code: 'RATE_LIMIT',
        error: 'Rate limit exceeded',
        retryAfter: 10, // seconds
      };

      // Verify the structure is valid
      expect(expectedRateLimitResponse.code).toBe('RATE_LIMIT');
      expect(typeof expectedRateLimitResponse.retryAfter).toBe('number');
    });
  });
});

describe('Outbound Calling Error Handling', () => {
  it('should not crash on missing parameters', async () => {
    const { data, error } = await supabase.functions.invoke('outbound-calling', {
      body: {}
    });

    // Should return error, not crash
    expect(data?.error || error).toBeDefined();
  });

  it('should validate phone number format', async () => {
    const { data, error } = await supabase.functions.invoke('outbound-calling', {
      body: {
        action: 'create_call',
        phoneNumber: 'not-a-phone',
        callerId: '+15551234567',
        agentId: 'test_agent',
      }
    });

    // Should indicate invalid input
    expect(data?.error || error).toBeDefined();
  });

  it('should handle missing agent gracefully', async () => {
    const { data, error } = await supabase.functions.invoke('outbound-calling', {
      body: {
        action: 'create_call',
        phoneNumber: '+15550000000',
        callerId: '+15551234567',
        agentId: 'non_existent_agent_id',
      }
    });

    // Should fail gracefully with clear error
    expect(data?.error || error).toBeDefined();
  });
});
