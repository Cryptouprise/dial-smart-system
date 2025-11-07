import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TwilioOutboundCallRequest {
  from: string;
  to: string;
  twimlUrl?: string;
}

interface TwilioOutboundCallResponse {
  success: boolean;
  twilio?: any;
  error?: string;
  details?: any;
}

export const useTwilioOutbound = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const initiateCall = async (request: TwilioOutboundCallRequest): Promise<TwilioOutboundCallResponse> => {
    setIsLoading(true);
    try {
      console.log("[useTwilioOutbound] Initiating outbound call:", { to: request.to, from: request.from });
      
      const { data, error } = await supabase.functions.invoke("twilio-outbound-call", {
        body: {
          from: request.from,
          to: request.to,
          twimlUrl: request.twimlUrl
        }
      });

      if (error) {
        console.error("[useTwilioOutbound] Invocation error:", error);
        toast({
          title: "Call Failed",
          description: error.message || "Failed to initiate call",
          variant: "destructive"
        });
        return {
          success: false,
          error: error.message,
          details: error
        };
      }

      if (!data || !data.success) {
        const errorMsg = data?.error || "Unknown error";
        console.error("[useTwilioOutbound] Call failed:", errorMsg);
        toast({
          title: "Call Failed",
          description: errorMsg,
          variant: "destructive"
        });
        return {
          success: false,
          error: errorMsg,
          details: data
        };
      }

      toast({
        title: "Call Initiated",
        description: `Call to ${request.to} has been initiated`,
      });

      return {
        success: true,
        twilio: data.twilio
      };
    } catch (err: any) {
      console.error("[useTwilioOutbound] Unexpected error:", err);
      toast({
        title: "Call Failed",
        description: err?.message || "Unexpected error occurred",
        variant: "destructive"
      });
      return {
        success: false,
        error: err?.message || "Unexpected error",
        details: err
      };
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    initiateCall
  };
};
