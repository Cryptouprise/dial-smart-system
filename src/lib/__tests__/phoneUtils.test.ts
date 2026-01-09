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
    it('should normalize 10-digit US numbers', () => {
      expect(normalizePhoneNumber('2145291531')).toBe('+12145291531');
      expect(normalizePhoneNumber('(214) 529-1531')).toBe('+12145291531');
      expect(normalizePhoneNumber('214-529-1531')).toBe('+12145291531');
    });

    it('should normalize 11-digit US numbers with country code', () => {
      expect(normalizePhoneNumber('12145291531')).toBe('+12145291531');
      expect(normalizePhoneNumber('+12145291531')).toBe('+12145291531');
    });

    it('should handle international numbers', () => {
      expect(normalizePhoneNumber('+442071234567')).toBe('+442071234567');
      expect(normalizePhoneNumber('442071234567')).toBe('+442071234567');
    });

    it('should return null for invalid inputs', () => {
      expect(normalizePhoneNumber('')).toBe(null);
      expect(normalizePhoneNumber('123')).toBe(null); // Too short
      expect(normalizePhoneNumber('12345678901234567')).toBe(null); // Too long
    });

    it('should handle null and undefined', () => {
      expect(normalizePhoneNumber(null as any)).toBe(null);
      expect(normalizePhoneNumber(undefined as any)).toBe(null);
    });
  });

  describe('formatPhoneNumber', () => {
    it('should format US numbers correctly', () => {
      expect(formatPhoneNumber('12145291531')).toBe('+1 (214) 529-1531');
      expect(formatPhoneNumber('2145291531')).toBe('(214) 529-1531');
      expect(formatPhoneNumber('+12145291531')).toBe('+1 (214) 529-1531');
    });

    it('should handle international numbers', () => {
      expect(formatPhoneNumber('442071234567')).toBe('+442071234567');
      expect(formatPhoneNumber('+442071234567')).toBe('+442071234567');
    });

    it('should handle invalid inputs gracefully', () => {
      expect(formatPhoneNumber('')).toBe('');
      expect(formatPhoneNumber(null as any)).toBe('');
      expect(formatPhoneNumber(undefined as any)).toBe('');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should validate US phone numbers', () => {
      expect(isValidPhoneNumber('+12145291531')).toBe(true);
      expect(isValidPhoneNumber('2145291531')).toBe(true);
      expect(isValidPhoneNumber('(214) 529-1531')).toBe(true);
      expect(isValidPhoneNumber('214-529-1531')).toBe(true);
    });

    it('should validate international numbers', () => {
      expect(isValidPhoneNumber('+442071234567')).toBe(true);
      expect(isValidPhoneNumber('+33123456789')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(isValidPhoneNumber('')).toBe(false);
      expect(isValidPhoneNumber('123')).toBe(false);
      expect(isValidPhoneNumber('invalid')).toBe(false);
      expect(isValidPhoneNumber('12345678901234567')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isValidPhoneNumber(null as any)).toBe(false);
      expect(isValidPhoneNumber(undefined as any)).toBe(false);
    });
  });

  describe('extractAreaCode', () => {
    it('should extract area code from US numbers', () => {
      expect(extractAreaCode('12145291531')).toBe('214');
      expect(extractAreaCode('2145291531')).toBe('214');
      expect(extractAreaCode('+12145291531')).toBe('214');
      expect(extractAreaCode('(214) 529-1531')).toBe('214');
    });

    it('should return null for invalid numbers', () => {
      expect(extractAreaCode('123')).toBe(null);
      expect(extractAreaCode('+')).toBe(null);
      expect(extractAreaCode('')).toBe(null);
    });
  });

  describe('arePhoneNumbersEqual', () => {
    it('should consider equivalent numbers equal', () => {
      expect(arePhoneNumbersEqual('2145291531', '+12145291531')).toBe(true);
      expect(arePhoneNumbersEqual('(214) 529-1531', '214-529-1531')).toBe(true);
      expect(arePhoneNumbersEqual('+12145291531', '12145291531')).toBe(true);
    });

    it('should consider different numbers unequal', () => {
      expect(arePhoneNumbersEqual('2145291531', '2145291532')).toBe(false);
      expect(arePhoneNumbersEqual('+12145291531', '+12145291532')).toBe(false);
    });

    it('should handle invalid inputs', () => {
      expect(arePhoneNumbersEqual('', '')).toBe(false);
      expect(arePhoneNumbersEqual('123', '456')).toBe(false);
      expect(arePhoneNumbersEqual('2145291531', '')).toBe(false);
    });
  });

  describe('getPhoneValidationError', () => {
    it('should return null for valid numbers', () => {
      expect(getPhoneValidationError('+12145291531')).toBe(null);
      expect(getPhoneValidationError('2145291531')).toBe(null);
      expect(getPhoneValidationError('(214) 529-1531')).toBe(null);
    });

    it('should return error for empty numbers', () => {
      expect(getPhoneValidationError('')).toBe('Phone number is required');
      expect(getPhoneValidationError('   ')).toBe('Phone number is required');
    });

    it('should return error for too short numbers', () => {
      expect(getPhoneValidationError('123')).toBe('Phone number is too short');
      expect(getPhoneValidationError('12345')).toBe('Phone number is too short');
    });

    it('should return error for too long numbers', () => {
      const longNumber = '12345678901234567';
      expect(getPhoneValidationError(longNumber)).toBe('Phone number is too long');
    });

    it('should return error for invalid format', () => {
      // 'invalid' has less than 10 digits, so returns "too short"
      expect(getPhoneValidationError('invalid')).toBe('Phone number is too short');
    });
  });
});
