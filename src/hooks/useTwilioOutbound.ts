import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TwilioOutboundCallParams {
  to: string;
  from: string;
  url?: string;
  twiml?: string;
  statusCallback?: string;
}

interface TwilioCallResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  [key: string]: unknown;
}

export const useTwilioOutbound = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [lastCall, setLastCall] = useState<TwilioCallResponse | null>(null);
  const { toast } = useToast();

  /**
   * Create an outbound call using Twilio
   * @param params - Call parameters including to, from, and either url or twiml
   * @returns Call response data or null on error
   */
  const createCall = async (params: TwilioOutboundCallParams): Promise<TwilioCallResponse | null> => {
    setIsLoading(true);
    try {
      console.log('[useTwilioOutbound] Creating call:', {
        to: params.to,
        from: params.from,
        hasUrl: !!params.url,
        hasTwiml: !!params.twiml
      });

      // Validate parameters
      if (!params.to || !params.from) {
        throw new Error('to and from phone numbers are required');
      }

      if (!params.url && !params.twiml) {
        throw new Error('Either url or twiml is required');
      }

      const { data, error } = await supabase.functions.invoke('twilio-outbound-call', {
        body: params
      });

      if (error) {
        console.error('[useTwilioOutbound] Error:', error);
        throw error;
      }

      console.log('[useTwilioOutbound] Call created successfully:', data);
      setLastCall(data);

      toast({
        title: "Call Initiated",
        description: `Outbound call to ${params.to} has been initiated`,
      });

      return data;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to create outbound call";
      console.error('[useTwilioOutbound] Failed to create call:', error);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Create a simple outbound call with TwiML instructions
   * @param to - Destination phone number
   * @param from - Source phone number (must be Twilio number)
   * @param message - Text message to speak
   * @returns Call response data or null on error
   */
  const createSimpleCall = async (
    to: string,
    from: string,
    message: string
  ): Promise<TwilioCallResponse | null> => {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${message}</Say>
</Response>`;

    return createCall({
      to,
      from,
      twiml
    });
  };

  /**
   * Create an outbound call that connects to a URL for instructions
   * @param to - Destination phone number
   * @param from - Source phone number (must be Twilio number)
   * @param url - URL to fetch TwiML instructions from
   * @param statusCallback - Optional webhook URL for call status updates
   * @returns Call response data or null on error
   */
  const createCallWithUrl = async (
    to: string,
    from: string,
    url: string,
    statusCallback?: string
  ): Promise<TwilioCallResponse | null> => {
    return createCall({
      to,
      from,
      url,
      statusCallback
    });
  };

  return {
    createCall,
    createSimpleCall,
    createCallWithUrl,
    isLoading,
    lastCall
  };
};
