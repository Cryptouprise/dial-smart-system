import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface OutboundCallOptions {
  from: string;
  to: string;
  twimlUrl?: string;
}

export const useTwilioOutbound = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const initiateOutboundCall = async (options: OutboundCallOptions) => {
    setIsLoading(true);
    try {
      console.log("[useTwilioOutbound] Initiating outbound call:", options);
      
      const { data, error } = await supabase.functions.invoke("twilio-outbound-call", {
        body: {
          from: options.from,
          to: options.to,
          twimlUrl: options.twimlUrl
        }
      });

      if (error) {
        console.error("[useTwilioOutbound] Error:", error);
        throw error;
      }

      toast({
        title: "Call Initiated",
        description: `Call from ${options.from} to ${options.to} has been initiated`,
      });

      return data;
    } catch (err: any) {
      console.error("useTwilioOutbound error:", err?.message || err);
      toast({
        title: "Call Failed",
        description: err?.message || "Failed to initiate outbound call",
        variant: "destructive"
      });
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    initiateOutboundCall
  };
};
