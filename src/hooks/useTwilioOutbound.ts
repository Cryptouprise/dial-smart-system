import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TwilioOutboundCallRequest {
  phoneNumber: string;
  callerId: string;
  twimlUrl?: string;
  campaignId?: string;
  leadId?: string;
}

export const useTwilioOutbound = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const makeCall = async (request: TwilioOutboundCallRequest) => {
    setIsLoading(true);
    try {
      console.log('[useTwilioOutbound] Making outbound call:', request);
      
      const { data, error } = await supabase.functions.invoke('twilio-outbound-call', {
        body: request
      });

      if (error) {
        console.error('[useTwilioOutbound] Call error:', error);
        throw error;
      }

      console.log('[useTwilioOutbound] Call success:', data);

      toast({
        title: "Success",
        description: `Call initiated to ${request.phoneNumber}`,
      });

      return data;
    } catch (error: any) {
      console.error('[useTwilioOutbound] Call failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to initiate call",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    makeCall,
    isLoading
  };
};
