import { describe, it, expect } from 'vitest';
import {
  normalizePhoneNumber,
  formatPhoneNumber,
  isValidPhoneNumber,
  extractAreaCode,
  arePhoneNumbersEqual,
  getPhoneValidationError,
} from '../phoneUtils';

describe('phoneUtils', () => {
  describe('normalizePhoneNumber', () => {
    it('should normalize US 10-digit number', () => {
      expect(normalizePhoneNumber('5551234567')).toBe('+15551234567');
    });

    it('should normalize US number with formatting', () => {
      expect(normalizePhoneNumber('(555) 123-4567')).toBe('+15551234567');
    });

    it('should normalize US number with +1', () => {
      expect(normalizePhoneNumber('+15551234567')).toBe('+15551234567');
    });

    it('should normalize 11-digit US number', () => {
      expect(normalizePhoneNumber('15551234567')).toBe('+15551234567');
    });

    it('should handle international numbers', () => {
      expect(normalizePhoneNumber('+442071234567')).toBe('+442071234567');
    });

    it('should return null for invalid numbers', () => {
      expect(normalizePhoneNumber('123')).toBeNull();
      expect(normalizePhoneNumber('abc')).toBeNull();
      expect(normalizePhoneNumber('')).toBeNull();
    });

    it('should handle numbers with spaces and dashes', () => {
      expect(normalizePhoneNumber('555-123-4567')).toBe('+15551234567');
      expect(normalizePhoneNumber('555 123 4567')).toBe('+15551234567');
    });

    it('should handle numbers with dots', () => {
      expect(normalizePhoneNumber('555.123.4567')).toBe('+15551234567');
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format 10-digit US number', () => {
      expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567');
    });

    it('should format 11-digit US number', () => {
      expect(formatPhoneNumber('15551234567')).toBe('+1 (555) 123-4567');
    });

    it('should format international numbers', () => {
      expect(formatPhoneNumber('442071234567')).toBe('+442071234567');
    });

    it('should handle already formatted numbers', () => {
      // formatPhoneNumber formats E.164 to readable format
      expect(formatPhoneNumber('+15551234567')).toBe('+1 (555) 123-4567');
    });

    it('should return empty string for empty input', () => {
      expect(formatPhoneNumber('')).toBe('');
    });

    it('should format 10-digit number without + prefix', () => {
      expect(formatPhoneNumber('1234567890')).toBe('(123) 456-7890');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should validate correct phone numbers', () => {
      expect(isValidPhoneNumber('5551234567')).toBe(true);
      expect(isValidPhoneNumber('(555) 123-4567')).toBe(true);
      expect(isValidPhoneNumber('+15551234567')).toBe(true);
      expect(isValidPhoneNumber('+442071234567')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('abc')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
      expect(isValidPhoneNumber('12345678901234567')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isValidPhoneNumber(null as any)).toBe(false);
      expect(isValidPhoneNumber(undefined as any)).toBe(false);
    });
  });

  describe('extractAreaCode', () => {
    it('should extract area code from 10-digit number', () => {
      expect(extractAreaCode('5551234567')).toBe('555');
    });

    it('should extract area code from 11-digit number', () => {
      expect(extractAreaCode('15551234567')).toBe('555');
    });

    it('should extract area code from formatted number', () => {
      expect(extractAreaCode('(555) 123-4567')).toBe('555');
    });

    it('should return null for invalid numbers', () => {
      expect(extractAreaCode('123')).toBeNull();
      expect(extractAreaCode('')).toBeNull();
    });

    it('should handle international numbers', () => {
      expect(extractAreaCode('+442071234567')).toBeNull();
    });
  });

  describe('arePhoneNumbersEqual', () => {
    it('should identify equal phone numbers', () => {
      expect(arePhoneNumbersEqual('5551234567', '+15551234567')).toBe(true);
      expect(arePhoneNumbersEqual('(555) 123-4567', '555-123-4567')).toBe(true);
    });

    it('should identify different phone numbers', () => {
      expect(arePhoneNumbersEqual('5551234567', '5551234568')).toBe(false);
      expect(arePhoneNumbersEqual('+15551234567', '+15551234568')).toBe(false);
    });

    it('should handle invalid numbers', () => {
      expect(arePhoneNumbersEqual('123', '456')).toBe(false);
      expect(arePhoneNumbersEqual('', '')).toBe(false);
    });
  });

  describe('getPhoneValidationError', () => {
    it('should return null for valid numbers', () => {
      expect(getPhoneValidationError('5551234567')).toBeNull();
      expect(getPhoneValidationError('+15551234567')).toBeNull();
    });

    it('should return error for empty number', () => {
      expect(getPhoneValidationError('')).toBe('Phone number is required');
      expect(getPhoneValidationError('   ')).toBe('Phone number is required');
    });

    it('should return error for short number', () => {
      expect(getPhoneValidationError('123')).toBe('Phone number is too short');
    });

    it('should return error for long number', () => {
      expect(getPhoneValidationError('12345678901234567')).toBe('Phone number is too long');
    });

    it('should return error for invalid format', () => {
      // 'abcdefghij' has no digits, so it's too short
      const error = getPhoneValidationError('abcdefghij');
      expect(error).toBe('Phone number is too short');
    });
  });
});
