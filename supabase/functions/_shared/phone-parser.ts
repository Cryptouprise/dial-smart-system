/**
 * Phone Number Parsing Utility
 * 
 * Provides robust phone number parsing and area code extraction for Supabase Edge Functions.
 * Uses a fallback approach since libphonenumber-js may not be compatible with Deno edge runtime.
 */

/**
 * Extract area code from a phone number.
 * Supports various formats including E.164, national, and formatted numbers.
 * 
 * @param phoneNumber - Phone number in any common format
 * @returns Area code (3 digits) or empty string if not found
 * 
 * @example
 * extractAreaCode('+14155551234') // Returns '415'
 * extractAreaCode('(415) 555-1234') // Returns '415'
 * extractAreaCode('415-555-1234') // Returns '415'
 */
export function extractAreaCode(phoneNumber: string): string {
  if (!phoneNumber) {
    return '';
  }

  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // Handle different phone number formats:
  // - E.164 format: +14155551234 (country code + area code + number)
  // - National format: 4155551234 or (415) 555-1234
  // - International format without +: 14155551234

  // For US/Canada numbers (country code 1), we expect 11 digits total
  // Format: 1 (country) + 415 (area) + 5551234 (local)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return digitsOnly.slice(1, 4);
  }

  // For 10-digit US/Canada numbers without country code
  // Format: 415 (area) + 5551234 (local)
  if (digitsOnly.length === 10) {
    return digitsOnly.slice(0, 3);
  }

  // For 10+ digit international numbers, assume format similar to US
  if (digitsOnly.length > 10) {
    // Skip potential country code(s) and extract next 3 digits
    const offset = digitsOnly.length - 10;
    return digitsOnly.slice(offset, offset + 3);
  }

  console.warn('[Phone Parser] Unable to extract area code from:', phoneNumber);
  return '';
}

/**
 * Format a phone number to E.164 format (+1XXXXXXXXXX for US/Canada).
 * 
 * @param phoneNumber - Phone number in any common format
 * @returns E.164 formatted phone number or original if parsing fails
 * 
 * @example
 * formatToE164('(415) 555-1234') // Returns '+14155551234'
 * formatToE164('415-555-1234') // Returns '+14155551234'
 */
export function formatToE164(phoneNumber: string): string {
  if (!phoneNumber) {
    return '';
  }

  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // Already in E.164-like format (11 digits starting with 1)
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return '+' + digitsOnly;
  }

  // 10-digit number - add US country code
  if (digitsOnly.length === 10) {
    return '+1' + digitsOnly;
  }

  // If it already starts with +, assume it's international
  if (phoneNumber.startsWith('+')) {
    return '+' + digitsOnly;
  }

  // Default: return with + prefix
  return '+' + digitsOnly;
}

/**
 * Validate if a phone number appears to be valid.
 * Basic validation for US/Canada numbers.
 * 
 * @param phoneNumber - Phone number to validate
 * @returns true if phone number appears valid
 * 
 * @example
 * isValidPhoneNumber('+14155551234') // Returns true
 * isValidPhoneNumber('123') // Returns false
 */
export function isValidPhoneNumber(phoneNumber: string): boolean {
  if (!phoneNumber) {
    return false;
  }

  const digitsOnly = phoneNumber.replace(/\D/g, '');

  // Valid US/Canada numbers should have 10 or 11 digits
  if (digitsOnly.length === 10) {
    return true;
  }

  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return true;
  }

  // For international numbers, just check if we have at least 10 digits
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
    return true;
  }

  return false;
}

/**
 * Parse a phone number and return all relevant information.
 * 
 * @param phoneNumber - Phone number in any common format
 * @returns Object containing parsed phone number details
 * 
 * @example
 * parsePhoneNumber('+14155551234')
 * // Returns: { 
 * //   original: '+14155551234',
 * //   e164: '+14155551234',
 * //   areaCode: '415',
 * //   isValid: true
 * // }
 */
export function parsePhoneNumber(phoneNumber: string): {
  original: string;
  e164: string;
  areaCode: string;
  isValid: boolean;
} {
  return {
    original: phoneNumber,
    e164: formatToE164(phoneNumber),
    areaCode: extractAreaCode(phoneNumber),
    isValid: isValidPhoneNumber(phoneNumber),
  };
}
