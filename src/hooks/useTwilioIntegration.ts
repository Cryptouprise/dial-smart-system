import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TwilioNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
}

interface TwilioNumberConfig {
  recordCalls?: boolean;
  voicemailDetection?: boolean;
  callForwarding?: string;
  statusCallbackUrl?: string;
  voiceUrl?: string;
  smsUrl?: string;
  friendlyName?: string;
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
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
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

  const configureNumber = async (phoneNumberSid: string, config: TwilioNumberConfig) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: {
          action: 'configure_number',
          phoneNumberSid,
          config
        }
      });

      if (error) throw error;

      toast({
        title: "Number Configured",
        description: "Twilio number settings have been updated",
      });

      return data;
    } catch (error) {
      console.error('Configure error:', error);
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

  const getNumberConfig = async (phoneNumberSid: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: {
          action: 'get_number_config',
          phoneNumberSid
        }
      });

      if (error) throw error;
      return data.config;
    } catch (error) {
      console.error('Get config error:', error);
      toast({
        title: "Failed to Get Configuration",
        description: error.message || "Could not fetch number configuration",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    listTwilioNumbers,
    importNumber,
    syncAllNumbers,
    configureNumber,
    getNumberConfig,
    isLoading
  };
};
