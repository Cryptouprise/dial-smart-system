import { useCallback, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Prevent noisy toast loops when the browser temporarily can't reach Supabase
const DISPATCH_FETCH_COOLDOWN_MS = 60_000;
let dispatchFetchCooldownUntil = 0;

const isTransientFetchFailure = (err: unknown) => {
  const msg = (err as any)?.message ? String((err as any).message) : String(err);
  return msg.includes('Failed to fetch') || msg.includes('Load failed') || msg.includes('NetworkError');
};

const enterDispatchFetchCooldown = () => {
  dispatchFetchCooldownUntil = Date.now() + DISPATCH_FETCH_COOLDOWN_MS;
};

const shouldSkipDispatchFetch = () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return Date.now() < dispatchFetchCooldownUntil;
};

export const useCallDispatcher = () => {
  const [isDispatching, setIsDispatching] = useState(false);
  const { toast } = useToast();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dispatchInFlightRef = useRef(false);

  const dispatchCalls = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (dispatchInFlightRef.current || shouldSkipDispatchFetch()) return null;

      dispatchInFlightRef.current = true;
      setIsDispatching(true);

      try {
        console.log('Dispatching calls...');

        const { data, error } = await supabase.functions.invoke('call-dispatcher', {
          method: 'POST',
        });

        if (error) throw error;

        if (data?.dispatched > 0) {
          toast({
            title: 'Calls Dispatched',
            description: `Successfully dispatched ${data.dispatched} calls`,
          });
        } else if (!options.silent) {
          toast({
            title: 'No Calls to Dispatch',
            description: data?.message || 'No pending calls found',
            variant: 'default',
          });
        }

        return data;
      } catch (error: any) {
        // Avoid toast spam during temporary network issues
        if (isTransientFetchFailure(error)) {
          console.warn('[Call Dispatcher] Transient fetch failure, entering cooldown:', error?.message || error);
          enterDispatchFetchCooldown();
          return null;
        }

        console.error('Call dispatch error:', error);
        if (!options.silent) {
          toast({
            title: 'Dispatch Failed',
            description: error.message || 'Failed to dispatch calls',
            variant: 'destructive',
          });
        }
        return null;
      } finally {
        setIsDispatching(false);
        dispatchInFlightRef.current = false;
      }
    },
    [toast]
  );

  const startAutoDispatch = useCallback(
    (intervalSeconds: number = 30) => {
      console.log(`Starting auto-dispatch every ${intervalSeconds} seconds`);

      // Ensure we never create multiple overlapping intervals
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      intervalRef.current = setInterval(() => {
        void dispatchCalls({ silent: true });
      }, intervalSeconds * 1000);

      // Initial dispatch (silent)
      void dispatchCalls({ silent: true });

      return () => {
        console.log('Stopping auto-dispatch');
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    },
    [dispatchCalls]
  );


  return {
    dispatchCalls,
    startAutoDispatch,
    isDispatching
  };
};
