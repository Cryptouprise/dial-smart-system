import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TwilioNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
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

  return {
    listTwilioNumbers,
    importNumber,
    syncAllNumbers,
    isLoading
  };
};
