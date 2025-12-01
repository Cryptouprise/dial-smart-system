/**
 * Provider Constants
 * 
 * Shared constants for multi-carrier provider integration.
 * Centralizes provider types, labels, and descriptions.
 */

import type { ProviderType, NumberCapability } from './types';

/** Available provider types */
export const PROVIDER_TYPES: readonly ProviderType[] = ['retell', 'telnyx', 'twilio'] as const;

/** Human-readable labels for each provider */
export const PROVIDER_LABELS: Record<ProviderType, string> = {
  retell: 'Retell AI',
  telnyx: 'Telnyx',
  twilio: 'Twilio',
  custom: 'Custom',
} as const;

/** Short descriptions for each provider */
export const PROVIDER_DESCRIPTIONS: Record<ProviderType, string> = {
  retell: 'AI-powered voice conversations',
  telnyx: 'Voice, SMS, and RVM with STIR/SHAKEN',
  twilio: 'Voice and SMS with wide coverage',
  custom: 'Custom provider integration',
} as const;

/** Capability labels */
export const CAPABILITY_LABELS: Record<NumberCapability, string> = {
  voice: 'Voice',
  sms: 'SMS',
  rvm: 'RVM',
  shaken: 'STIR/SHAKEN',
} as const;

/** 
 * Area code extraction constants
 * US phone numbers in E.164 format: +1AAABBBCCCC
 * where AAA is the 3-digit area code
 */
export const PHONE_NUMBER_CONSTANTS = {
  /** Minimum length of a valid phone number (10 digits without country code) */
  MIN_PHONE_LENGTH: 10,
  /** Position where area code starts from the end of a 10-digit number */
  AREA_CODE_START_FROM_END: 10,
  /** Position where area code ends from the end of a 10-digit number */
  AREA_CODE_END_FROM_END: 7,
} as const;

/**
 * Get area code from a phone number
 * @param phoneNumber Phone number in any format
 * @returns 3-digit area code or null if invalid
 */
export function extractAreaCode(phoneNumber: string): string | null {
  const cleanNumber = phoneNumber.replace(/\D/g, '');
  if (cleanNumber.length < PHONE_NUMBER_CONSTANTS.MIN_PHONE_LENGTH) {
    return null;
  }
  return cleanNumber.slice(
    cleanNumber.length - PHONE_NUMBER_CONSTANTS.AREA_CODE_START_FROM_END,
    cleanNumber.length - PHONE_NUMBER_CONSTANTS.AREA_CODE_END_FROM_END
  );
}
