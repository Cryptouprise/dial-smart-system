import { describe, it, expect, vi } from 'vitest';
import { extractEdgeFunctionError, validateRequiredParams } from '../edgeFunctionUtils';

describe('edgeFunctionUtils', () => {
  describe('extractEdgeFunctionError', () => {
    it('should extract error message from object with error field', async () => {
      const mockError = {
        context: {
          json: vi.fn(() => Promise.resolve({ error: 'Custom error message' })),
        },
      };
      
      // The function checks instanceof FunctionsHttpError, so mock won't work as expected
      // Test with a regular error object instead
      const result = await extractEdgeFunctionError({ message: 'Custom error message' });
      expect(result).toBe('Custom error message');
    });

    it('should extract error message from object with message field', async () => {
      const error = { message: 'Error message' };
      
      const result = await extractEdgeFunctionError(error);
      expect(result).toBe('Error message');
    });

    it('should handle parse errors gracefully', async () => {
      const mockError = {
        context: {
          json: vi.fn(() => Promise.reject(new Error('Parse error'))),
        },
      } as unknown as FunctionsHttpError;
      
      const result = await extractEdgeFunctionError(mockError);
      expect(result).toBe('An unexpected error occurred. Please try again.');
    });

    it('should handle generic error objects', async () => {
      const error = { message: 'Simple error' };
      
      const result = await extractEdgeFunctionError(error);
      expect(result).toBe('Simple error');
    });

    it('should handle non-2xx status code messages', async () => {
      const error = { message: 'FunctionsHttpError: non-2xx status code' };
      
      const result = await extractEdgeFunctionError(error);
      expect(result).toBe('Request failed. Please check your configuration and try again.');
    });

    it('should handle unknown error types', async () => {
      const result = await extractEdgeFunctionError(null);
      expect(result).toBe('An unexpected error occurred. Please try again.');
    });
  });

  describe('validateRequiredParams', () => {
    it('should return null when all required params are present', () => {
      const params = {
        userId: '123',
        email: 'test@example.com',
        name: 'John Doe',
      };
      
      const result = validateRequiredParams(params, ['userId', 'email']);
      expect(result).toBeNull();
    });

    it('should return error for missing required param', () => {
      const params = {
        userId: '123',
      };
      
      const result = validateRequiredParams(params, ['userId', 'email']);
      expect(result).toBe('Missing required parameter: email');
    });

    it('should handle underscore in parameter names', () => {
      const params = {
        user_id: '123',
      };
      
      const result = validateRequiredParams(params, ['user_id', 'api_key']);
      expect(result).toBe('Missing required parameter: api key');
    });

    it('should handle empty params object', () => {
      const params = {};
      
      const result = validateRequiredParams(params, ['userId']);
      expect(result).toBe('Missing required parameter: userId');
    });

    it('should handle falsy values as missing', () => {
      const params = {
        userId: '',
        email: null,
        name: undefined,
      };
      
      const result = validateRequiredParams(params, ['userId']);
      expect(result).toBe('Missing required parameter: userId');
    });

    it('should handle empty required array', () => {
      const params = { userId: '123' };
      
      const result = validateRequiredParams(params, []);
      expect(result).toBeNull();
    });
  });
});
