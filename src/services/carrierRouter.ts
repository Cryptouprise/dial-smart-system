/**
 * Carrier Router Service
 * 
 * This service handles intelligent routing of calls, SMS, and RVM requests
 * across multiple providers (Retell AI, Telnyx, Twilio) based on:
 * - Required capabilities (voice, SMS, RVM, STIR/SHAKEN)
 * - Provider priority and availability
 * - Local presence matching
 * - Cost constraints
 * - STIR/SHAKEN signing requirements
 * 
 * TODO: Full implementation in PR E
 */

import type {
  IProviderAdapter,
  ProviderType,
  ProviderNumber,
  ProviderConfig,
  RoutingRequirements,
  RoutingResult,
  NumberCapability,
  UserContext,
} from './providers/types';
import { createProviderAdapter, extractAreaCode } from './providers';

export interface CarrierRouterConfig {
  /** Default provider to use when no specific requirements */
  defaultProvider: ProviderType;
  /** Enable automatic fallback to next priority provider on failure */
  enableFallback: boolean;
  /** Prefer STIR/SHAKEN signed calls when available */
  preferSignedCalls: boolean;
  /** Enable local presence matching (match caller ID area code to lead area code) */
  enableLocalPresence: boolean;
}

const DEFAULT_CONFIG: CarrierRouterConfig = {
  defaultProvider: 'retell',
  enableFallback: true,
  preferSignedCalls: true,
  enableLocalPresence: true,
};

/**
 * CarrierRouter - Main routing service for multi-carrier support
 * 
 * Usage:
 * ```typescript
 * const router = new CarrierRouter();
 * const result = await router.selectProvider({
 *   capabilities: ['voice', 'shaken'],
 *   local_presence: true,
 * }, userContext, targetPhoneNumber);
 * 
 * if (result) {
 *   const callResult = await result.adapter.createCall({
 *     to: targetPhoneNumber,
 *     from: result.selected_number.number,
 *     signedOptions: { sign_call: true },
 *   });
 * }
 * ```
 */
export class CarrierRouter {
  private config: CarrierRouterConfig;
  private providers: Map<ProviderType, ProviderConfig> = new Map();
  private providerNumbers: ProviderNumber[] = [];
  
  constructor(config: Partial<CarrierRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Load provider configurations from database
   * TODO: Implement database loading in PR E
   */
  async loadProviderConfigs(userContext: UserContext): Promise<void> {
    console.log('[CarrierRouter] Loading provider configs for user:', userContext.user_id);
    // TODO: Query phone_providers table for active providers
    // TODO: Query provider_numbers table for available numbers
  }
  
  /**
   * Select the best provider and number for a given request
   */
  async selectProvider(
    requirements: RoutingRequirements,
    userContext: UserContext,
    targetNumber?: string
  ): Promise<RoutingResult | null> {
    console.log('[CarrierRouter] Selecting provider with requirements:', requirements);
    
    // Ensure provider configs are loaded
    if (this.providers.size === 0) {
      await this.loadProviderConfigs(userContext);
    }
    
    // Step 1: Filter numbers by required capabilities
    const eligibleNumbers = this.filterByCapabilities(requirements.capabilities);
    
    if (eligibleNumbers.length === 0) {
      console.log('[CarrierRouter] No eligible numbers found for requirements');
      return null;
    }
    
    // Step 2: Apply local presence matching if required
    let matchedNumbers = eligibleNumbers;
    if (requirements.local_presence && targetNumber) {
      matchedNumbers = this.filterByLocalPresence(eligibleNumbers, targetNumber);
      // Fall back to all eligible if no local match
      if (matchedNumbers.length === 0) {
        matchedNumbers = eligibleNumbers;
      }
    }
    
    // Step 3: Prefer STIR/SHAKEN capable numbers if signed call required
    if (requirements.signed_call) {
      const shakenNumbers = matchedNumbers.filter(n => 
        n.capabilities.includes('shaken')
      );
      if (shakenNumbers.length > 0) {
        matchedNumbers = shakenNumbers;
      }
    }
    
    // Step 4: Sort by provider priority
    const sortedNumbers = this.sortByProviderPriority(matchedNumbers);
    
    if (sortedNumbers.length === 0) {
      return null;
    }
    
    // Select the best number
    const selectedNumber = sortedNumbers[0];
    const adapter = createProviderAdapter(selectedNumber.provider_type);
    
    return {
      selected_provider: selectedNumber.provider_type,
      selected_number: selectedNumber,
      adapter,
      routing_reason: this.buildRoutingReason(requirements, selectedNumber),
    };
  }
  
  /**
   * Get adapter for a specific provider (for manual provider selection)
   */
  getAdapter(providerType: ProviderType): IProviderAdapter {
    return createProviderAdapter(providerType);
  }
  
  /**
   * Get all available numbers across all providers
   */
  async getAllNumbers(userContext: UserContext): Promise<ProviderNumber[]> {
    await this.loadProviderConfigs(userContext);
    return this.providerNumbers;
  }
  
  /**
   * Filter numbers by required capabilities
   */
  private filterByCapabilities(capabilities: NumberCapability[]): ProviderNumber[] {
    return this.providerNumbers.filter(number => 
      capabilities.every(cap => number.capabilities.includes(cap))
    );
  }
  
  /**
   * Filter numbers by local presence (matching area code)
   */
  private filterByLocalPresence(numbers: ProviderNumber[], targetNumber: string): ProviderNumber[] {
    const targetAreaCode = extractAreaCode(targetNumber);
    
    if (!targetAreaCode) {
      return numbers;
    }
    
    return numbers.filter(number => {
      const numberAreaCode = extractAreaCode(number.number);
      return numberAreaCode === targetAreaCode;
    });
  }
  
  /**
   * Sort numbers by provider priority
   */
  private sortByProviderPriority(numbers: ProviderNumber[]): ProviderNumber[] {
    return [...numbers].sort((a, b) => {
      const priorityA = this.getProviderPriority(a.provider_type);
      const priorityB = this.getProviderPriority(b.provider_type);
      return priorityA - priorityB;
    });
  }
  
  /**
   * Get priority for a provider type (lower = higher priority)
   */
  private getProviderPriority(providerType: ProviderType): number {
    const config = this.providers.get(providerType);
    return config?.priority ?? 999;
  }
  
  /**
   * Build human-readable routing reason
   */
  private buildRoutingReason(requirements: RoutingRequirements, selected: ProviderNumber): string {
    const reasons: string[] = [];
    
    reasons.push(`Selected ${selected.provider_type} provider`);
    
    if (requirements.local_presence) {
      reasons.push('local presence match');
    }
    
    if (requirements.signed_call && selected.capabilities.includes('shaken')) {
      reasons.push('STIR/SHAKEN capable');
    }
    
    reasons.push(`capabilities: ${selected.capabilities.join(', ')}`);
    
    return reasons.join(' - ');
  }
}

// Export singleton instance for convenience
export const carrierRouter = new CarrierRouter();

export default CarrierRouter;
