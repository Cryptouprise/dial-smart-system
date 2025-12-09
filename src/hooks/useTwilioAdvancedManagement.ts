import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useTwilioAdvancedManagement = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const searchNumbers = async (areaCode: string, contains?: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-advanced-management', {
        body: { action: 'search_numbers', areaCode, contains }
      });

      if (error) throw error;
      
      toast({
        title: "Numbers Found",
        description: `Found ${data.count} available numbers in area code ${areaCode}`,
      });

      return data.available_numbers || [];
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error.message || "Failed to search for numbers",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const buyNumber = async (phoneNumber: string, voiceUrl?: string, smsUrl?: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-advanced-management', {
        body: { action: 'buy_number', phoneNumber, voiceUrl, smsUrl }
      });

      if (error) throw error;

      toast({
        title: "Number Purchased",
        description: `${phoneNumber} purchased successfully`,
      });

      return data;
    } catch (error) {
      console.error('Purchase error:', error);
      toast({
        title: "Purchase Failed",
        description: error.message || "Failed to purchase number",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const bulkBuyNumbers = async (areaCode: string, quantity: number) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-advanced-management', {
        body: { action: 'bulk_buy', areaCode, quantity }
      });

      if (error) throw error;

      toast({
        title: "Bulk Purchase Complete",
        description: `${data.purchased_count} numbers purchased. ${data.failed_count} failed.`,
      });

      return data;
    } catch (error) {
      console.error('Bulk purchase error:', error);
      toast({
        title: "Bulk Purchase Failed",
        description: error.message || "Failed to purchase numbers",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const releaseNumber = async (phoneNumber: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-advanced-management', {
        body: { action: 'release_number', phoneNumber }
      });

      if (error) throw error;

      toast({
        title: "Number Released",
        description: `${phoneNumber} has been released`,
      });

      return data;
    } catch (error) {
      console.error('Release error:', error);
      toast({
        title: "Release Failed",
        description: error.message || "Failed to release number",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const bulkReleaseNumbers = async (phoneNumbers: string[]) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-advanced-management', {
        body: { action: 'bulk_release', phoneNumbers }
      });

      if (error) throw error;

      toast({
        title: "Bulk Release Complete",
        description: `${data.released_count} numbers released. ${data.failed_count} failed.`,
      });

      return data;
    } catch (error) {
      console.error('Bulk release error:', error);
      toast({
        title: "Bulk Release Failed",
        description: error.message || "Failed to release numbers",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const configureNumber = async (
    phoneNumber: string, 
    config: { voiceUrl?: string; smsUrl?: string; friendlyName?: string }
  ) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-advanced-management', {
        body: { action: 'configure_number', phoneNumber, ...config }
      });

      if (error) throw error;

      toast({
        title: "Number Configured",
        description: `${phoneNumber} configured successfully`,
      });

      return data;
    } catch (error) {
      console.error('Configuration error:', error);
      toast({
        title: "Configuration Failed",
        description: error.message || "Failed to configure number",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    searchNumbers,
    buyNumber,
    bulkBuyNumbers,
    releaseNumber,
    bulkReleaseNumbers,
    configureNumber,
    isLoading
  };
};
