/**
 * Phone Number Utilities
 * 
 * Provides phone number validation, formatting, and normalization utilities
 * for SMS messaging and dialing features.
 */

/**
 * Normalize a phone number to E.164 format
 * @param phone - Phone number in any format
 * @returns Normalized phone number in E.164 format (+1234567890) or null if invalid
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;
  
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  // If it already starts with +, validate length
  if (cleaned.startsWith('+')) {
    // Valid E.164 format should be + followed by 1-15 digits
    if (cleaned.length >= 11 && cleaned.length <= 16) {
      return cleaned;
    }
    return null;
  }
  
  // Remove any leading + or 00
  const digitsOnly = cleaned.replace(/^(\+|00)/, '');
  
  // If it's 10 digits, assume US/Canada number and add +1
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  }
  
  // If it's 11 digits and starts with 1, it's already US/Canada format
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  }
  
  // If it's between 4-15 digits, add + prefix (international format)
  if (digitsOnly.length >= 4 && digitsOnly.length <= 15) {
    return `+${digitsOnly}`;
  }
  
  return null;
}

/**
 * Format a phone number for display in a human-readable format
 * @param phone - Phone number in E.164 or any format
 * @returns Formatted phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  
  const cleaned = phone.replace(/\D/g, '');
  
  // US/Canada format: +1 (555) 123-4567
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  // US/Canada format without country code: (555) 123-4567
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // International format: just add + if not present
  if (!phone.startsWith('+') && cleaned.length > 0) {
    return `+${cleaned}`;
  }
  
  return phone;
}

/**
 * Validate a phone number
 * @param phone - Phone number to validate
 * @returns true if valid, false otherwise
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  
  const normalized = normalizePhoneNumber(phone);
  return normalized !== null;
}

/**
 * Extract area code from a phone number
 * @param phone - Phone number in any format
 * @returns Area code or null if not found
 */
export function extractAreaCode(phone: string): string | null {
  const cleaned = phone.replace(/\D/g, '');
  
  // US/Canada: area code is first 3 digits after country code
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return cleaned.slice(1, 4);
  }
  
  if (cleaned.length === 10) {
    return cleaned.slice(0, 3);
  }
  
  return null;
}

/**
 * Check if two phone numbers are equivalent (ignoring formatting)
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if they represent the same number
 */
export function arePhoneNumbersEqual(phone1: string, phone2: string): boolean {
  const normalized1 = normalizePhoneNumber(phone1);
  const normalized2 = normalizePhoneNumber(phone2);
  
  if (!normalized1 || !normalized2) return false;
  
  return normalized1 === normalized2;
}

/**
 * Get validation error message for a phone number
 * @param phone - Phone number to validate
 * @returns Error message or null if valid
 */
export function getPhoneValidationError(phone: string): string | null {
  if (!phone || phone.trim() === '') {
    return 'Phone number is required';
  }
  
  const cleaned = phone.replace(/[^\d+]/g, '');
  
  if (cleaned.length < 10) {
    return 'Phone number is too short';
  }
  
  if (cleaned.length > 16) {
    return 'Phone number is too long';
  }
  
  if (!isValidPhoneNumber(phone)) {
    return 'Invalid phone number format. Please use format: +1234567890';
  }
  
  return null;
}
