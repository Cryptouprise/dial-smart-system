import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export const useCallDispatcher = () => {
  const [isDispatching, setIsDispatching] = useState(false);
  const { toast } = useToast();

  const dispatchCalls = async () => {
    setIsDispatching(true);
    
    try {
      console.log('Dispatching calls...');
      
      const { data, error } = await supabase.functions.invoke('call-dispatcher', {
        method: 'POST'
      });

      if (error) throw error;

      if (data.dispatched > 0) {
        toast({
          title: "Calls Dispatched",
          description: `Successfully dispatched ${data.dispatched} calls`,
        });
      } else {
        toast({
          title: "No Calls to Dispatch",
          description: data.message || "No pending calls found",
          variant: "default"
        });
      }

      return data;
      
    } catch (error) {
      console.error('Call dispatch error:', error);
      toast({
        title: "Dispatch Failed",
        description: error instanceof Error ? error.message : "Failed to dispatch calls",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsDispatching(false);
    }
  };

  const startAutoDispatch = (intervalSeconds: number = 30) => {
    console.log(`Starting auto-dispatch every ${intervalSeconds} seconds`);
    
    const interval = setInterval(() => {
      dispatchCalls();
    }, intervalSeconds * 1000);

    // Initial dispatch
    dispatchCalls();

    return () => {
      console.log('Stopping auto-dispatch');
      clearInterval(interval);
    };
  };

  return {
    dispatchCalls,
    startAutoDispatch,
    isDispatching
  };
};
