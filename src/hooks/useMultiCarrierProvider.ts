/**
 * useMultiCarrierProvider Hook
 * 
 * React hook for managing multi-carrier providers (Retell, Telnyx, Twilio).
 * Provides methods for:
 * - Listing and managing provider configurations
 * - Importing and syncing phone numbers from providers
 * - Testing provider connections
 * - Selecting providers for calls/SMS/RVM
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { ProviderType, ProviderNumber } from '@/services/providers/types';

export interface PhoneProvider {
  id: string;
  user_id: string;
  name: ProviderType;
  display_name: string | null;
  config_json: Record<string, unknown>;
  api_key_reference: string | null;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProviderNumberWithProvider extends ProviderNumber {
  phone_providers?: {
    name: string;
    display_name: string | null;
  };
}

export interface AddProviderConfig {
  display_name?: string;
  priority?: number;
  active?: boolean;
  api_key?: string;
  config_json?: Record<string, unknown>;
}

export const useMultiCarrierProvider = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<PhoneProvider[]>([]);
  const [providerNumbers, setProviderNumbers] = useState<ProviderNumberWithProvider[]>([]);
  const { toast } = useToast();

  /**
   * List all configured providers
   */
  const listProviders = useCallback(async (): Promise<PhoneProvider[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: { action: 'list_providers' }
      });

      if (error) throw error;
      
      const providerList = data?.providers || [];
      setProviders(providerList);
      return providerList;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to list providers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load providers',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Add a new provider configuration
   */
  const addProvider = useCallback(async (
    providerType: ProviderType,
    config: AddProviderConfig
  ): Promise<PhoneProvider | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'add_provider',
          provider_type: providerType,
          config,
        }
      });

      if (error) throw error;

      toast({
        title: 'Provider Added',
        description: `${providerType} provider configured successfully`,
      });

      // Refresh providers list
      await listProviders();
      
      return data?.provider || null;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to add provider:', error);
      toast({
        title: 'Error',
        description: `Failed to add ${providerType} provider`,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, listProviders]);

  /**
   * Update provider configuration
   */
  const updateProvider = useCallback(async (
    providerId: string,
    config: Partial<AddProviderConfig>
  ): Promise<PhoneProvider | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'update_provider',
          provider_id: providerId,
          config,
        }
      });

      if (error) throw error;

      toast({
        title: 'Provider Updated',
        description: 'Provider configuration updated successfully',
      });

      // Refresh providers list
      await listProviders();
      
      return data?.provider || null;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to update provider:', error);
      toast({
        title: 'Error',
        description: 'Failed to update provider',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, listProviders]);

  /**
   * Delete a provider configuration
   */
  const deleteProvider = useCallback(async (providerId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'delete_provider',
          provider_id: providerId,
        }
      });

      if (error) throw error;

      toast({
        title: 'Provider Deleted',
        description: 'Provider configuration removed',
      });

      // Refresh providers list
      await listProviders();
      
      return true;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to delete provider:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete provider',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, listProviders]);

  /**
   * Test provider connection
   */
  const testConnection = useCallback(async (
    providerType: ProviderType
  ): Promise<{ success: boolean; message: string }> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'test_connection',
          provider_type: providerType,
        }
      });

      if (error) throw error;

      const result = data || { success: false, message: 'Unknown error' };
      
      toast({
        title: result.success ? 'Connection Successful' : 'Connection Failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });

      return result;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Connection test failed:', error);
      const message = error instanceof Error ? error.message : 'Connection test failed';
      toast({
        title: 'Connection Failed',
        description: message,
        variant: 'destructive',
      });
      return { success: false, message };
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * List phone numbers across all providers or for specific provider
   */
  const listNumbers = useCallback(async (
    providerType?: ProviderType,
    providerId?: string
  ): Promise<ProviderNumberWithProvider[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'list_numbers',
          provider_type: providerType,
          provider_id: providerId,
        }
      });

      if (error) throw error;
      
      const numbers = data?.numbers || [];
      setProviderNumbers(numbers);
      return numbers;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to list numbers:', error);
      toast({
        title: 'Error',
        description: 'Failed to load phone numbers',
        variant: 'destructive',
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Import a phone number from a provider
   */
  const importNumber = useCallback(async (
    providerType: ProviderType,
    phoneNumber: string
  ): Promise<ProviderNumber | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'import_number',
          provider_type: providerType,
          number: phoneNumber,
        }
      });

      if (error) throw error;

      toast({
        title: 'Number Imported',
        description: `${phoneNumber} imported from ${providerType}`,
      });

      // Refresh numbers list
      await listNumbers();
      
      return data?.number || null;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to import number:', error);
      toast({
        title: 'Error',
        description: `Failed to import number from ${providerType}`,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast, listNumbers]);

  /**
   * Sync numbers from a provider
   */
  const syncNumbers = useCallback(async (
    providerType?: ProviderType,
    providerId?: string
  ): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('provider-management', {
        body: {
          action: 'sync_numbers',
          provider_type: providerType,
          provider_id: providerId,
        }
      });

      if (error) throw error;

      toast({
        title: data?.success ? 'Sync Complete' : 'Sync Pending',
        description: data?.message || 'Numbers synced successfully',
      });

      // Refresh numbers list
      await listNumbers();
      
      return data?.success || false;
    } catch (error) {
      console.error('[useMultiCarrierProvider] Failed to sync numbers:', error);
      toast({
        title: 'Error',
        description: 'Failed to sync numbers',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast, listNumbers]);

  /**
   * Get available provider types
   */
  const getAvailableProviderTypes = useCallback((): ProviderType[] => {
    return ['retell', 'telnyx', 'twilio'];
  }, []);

  return {
    // State
    isLoading,
    providers,
    providerNumbers,
    
    // Provider management
    listProviders,
    addProvider,
    updateProvider,
    deleteProvider,
    testConnection,
    
    // Number management
    listNumbers,
    importNumber,
    syncNumbers,
    
    // Utilities
    getAvailableProviderTypes,
  };
};

export default useMultiCarrierProvider;
