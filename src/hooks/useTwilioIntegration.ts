import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TwilioNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
}

interface A2PPhoneNumber {
  phone_number: string;
  sid: string;
  friendly_name: string;
  capabilities: { sms: boolean; voice: boolean; mms: boolean };
  status: string;
  a2p_registered?: boolean;
  messaging_service_sid?: string;
  messaging_service_name?: string;
}

interface A2PStatus {
  phone_numbers: A2PPhoneNumber[];
  messaging_services: any[];
  brand_registrations: any[];
  campaigns: any[];
  summary: {
    total_numbers: number;
    registered_numbers: number;
    pending_numbers: number;
    unregistered_numbers: number;
  };
}

export const useTwilioIntegration = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const listTwilioNumbers = async (): Promise<TwilioNumber[]> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_numbers' }
      });

      if (error) throw error;
      return data.numbers || [];
    } catch (error: any) {
      console.error('Failed to list Twilio numbers:', error);
      toast({
        title: "Failed to Load Twilio Numbers",
        description: error.message || "Could not fetch numbers from Twilio",
        variant: "destructive"
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const importNumber = async (phoneNumber: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: {
          action: 'import_number',
          phoneNumber
        }
      });

      if (error) throw error;

      toast({
        title: "Number Imported Successfully",
        description: `${phoneNumber} is now available in your pool`,
      });

      return data;
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import number",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const syncAllNumbers = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'sync_all' }
      });

      if (error) throw error;

      toast({
        title: "Sync Complete",
        description: `Imported ${data.imported_count} numbers. ${data.failed_count} failed.`,
      });

      return data;
    } catch (error: any) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync Twilio numbers",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const checkA2PStatus = async (): Promise<A2PStatus | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'check_a2p_status' }
      });

      if (error) throw error;
      return data as A2PStatus;
    } catch (error: any) {
      console.error('A2P status check error:', error);
      toast({
        title: "A2P Status Check Failed",
        description: error.message || "Could not fetch A2P registration status",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const addNumberToCampaign = async (phoneNumber: string, messagingServiceSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { 
          action: 'add_number_to_campaign',
          phoneNumber,
          messagingServiceSid
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Number Added to Campaign",
        description: `${phoneNumber} is now registered for A2P messaging`,
      });

      return data;
    } catch (error: any) {
      console.error('Add to campaign error:', error);
      toast({
        title: "Failed to Add Number",
        description: error.message || "Could not add number to campaign",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    listTwilioNumbers,
    importNumber,
    syncAllNumbers,
    checkA2PStatus,
    addNumberToCampaign,
    isLoading
  };
};
