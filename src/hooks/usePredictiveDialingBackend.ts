
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const usePredictiveDialingBackend = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const startDialing = async (campaignId: string) => {
    setIsLoading(true);
    try {
      console.log(`Starting dialing for campaign ${campaignId}`);

      const { data, error } = await supabase.functions.invoke('predictive-dialing-engine', {
        method: 'POST',
        body: {
          campaignId,
          action: 'start'
        }
      });

      if (error) throw error;

      toast({
        title: "Dialing Started",
        description: `Campaign started with ${data.leads_queued} leads`,
      });

      return data;
    } catch (error) {
      console.error('Start dialing error:', error);
      toast({
        title: "Failed to Start Dialing",
        description: error.message || "Failed to start dialing campaign",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const stopDialing = async (campaignId: string) => {
    setIsLoading(true);
    try {
      console.log(`Stopping dialing for campaign ${campaignId}`);

      const { data, error } = await supabase.functions.invoke('predictive-dialing-engine', {
        method: 'POST',
        body: {
          campaignId,
          action: 'stop'
        }
      });

      if (error) throw error;

      toast({
        title: "Dialing Stopped",
        description: "Campaign has been paused",
      });

      return data;
    } catch (error) {
      console.error('Stop dialing error:', error);
      toast({
        title: "Failed to Stop Dialing",
        description: error.message || "Failed to stop dialing campaign",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const getDialingStatus = async (campaignId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('predictive-dialing-engine', {
        method: 'POST',
        body: {
          campaignId,
          action: 'status'
        }
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Get status error:', error);
      return null;
    }
  };

  const getDialingQueue = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('predictive-dialing-engine', {
        method: 'GET'
      });

      if (error) throw error;
      return data.queues;
    } catch (error) {
      console.error('Get queue error:', error);
      return [];
    }
  };

  return {
    startDialing,
    stopDialing,
    getDialingStatus,
    getDialingQueue,
    isLoading
  };
};
