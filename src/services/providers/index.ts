/**
 * Multi-Carrier Provider Module
 * 
 * This module exports all provider adapters and types for the multi-carrier
 * routing system. Use the carrierRouter service to automatically select
 * the best provider for each call/SMS/RVM based on capabilities and rules.
 */

// Types
export * from './types';

// Adapters
export { RetellAdapter } from './retellAdapter';
export { TelnyxAdapter } from './telnyxAdapter';
export { TwilioAdapter } from './twilioAdapter';

// Factory function to get adapter by provider type
import type { IProviderAdapter, ProviderType } from './types';
import { RetellAdapter } from './retellAdapter';
import { TelnyxAdapter } from './telnyxAdapter';
import { TwilioAdapter } from './twilioAdapter';

export function createProviderAdapter(providerType: ProviderType): IProviderAdapter {
  switch (providerType) {
    case 'retell':
      return new RetellAdapter();
    case 'telnyx':
      return new TelnyxAdapter();
    case 'twilio':
      return new TwilioAdapter();
    case 'custom':
      throw new Error('Custom provider adapter requires specific implementation');
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}
