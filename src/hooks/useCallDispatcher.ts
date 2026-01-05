import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Prevent noisy toast loops when the browser temporarily can't reach Supabase
const DISPATCH_FETCH_COOLDOWN_MS = 60_000;
let dispatchFetchCooldownUntil = 0;

// Global singleton state - ensures only ONE auto-dispatch interval runs app-wide
let globalAutoDispatchActive = false;
let globalIntervalRef: ReturnType<typeof setInterval> | null = null;
let globalDispatchInFlight = false;

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

  const dispatchCalls = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (globalDispatchInFlight || shouldSkipDispatchFetch()) return null;

      globalDispatchInFlight = true;
      setIsDispatching(true);

      try {
        console.log('[Call Dispatcher] Dispatching calls...');

        const { data, error } = await supabase.functions.invoke('call-dispatcher', {
          method: 'POST',
          body: {}, // Empty body to prevent parse warnings
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

        console.error('[Call Dispatcher] Error:', error);
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
        globalDispatchInFlight = false;
      }
    },
    [toast]
  );

  const startAutoDispatch = useCallback(
    (intervalSeconds: number = 30) => {
      // CRITICAL: Prevent duplicate intervals across all components
      if (globalAutoDispatchActive) {
        console.warn('[Auto-Dispatch] Already running globally, ignoring duplicate start');
        return () => {}; // Return no-op cleanup
      }

      console.log(`[Auto-Dispatch] Starting globally every ${intervalSeconds} seconds`);
      globalAutoDispatchActive = true;

      // Clear any lingering intervals
      if (globalIntervalRef) {
        clearInterval(globalIntervalRef);
        globalIntervalRef = null;
      }

      globalIntervalRef = setInterval(() => {
        void dispatchCalls({ silent: true });
      }, intervalSeconds * 1000);

      // Initial dispatch (silent)
      void dispatchCalls({ silent: true });

      return () => {
        console.log('[Auto-Dispatch] Stopping globally');
        if (globalIntervalRef) {
          clearInterval(globalIntervalRef);
          globalIntervalRef = null;
        }
        globalAutoDispatchActive = false;
      };
    },
    [dispatchCalls]
  );

  // Force re-queue all leads for a campaign
  const forceRequeueLeads = useCallback(
    async (campaignId: string) => {
      try {
        // Get all campaign leads with phone numbers
        const { data: campaignLeadData, error: fetchError } = await supabase
          .from('campaign_leads')
          .select('lead_id, leads(phone_number)')
          .eq('campaign_id', campaignId);

        if (fetchError) throw fetchError;

        if (!campaignLeadData || campaignLeadData.length === 0) {
          toast({
            title: 'No Leads Found',
            description: 'No leads in this campaign to re-queue',
            variant: 'default',
          });
          return;
        }

        // Delete existing queue entries for this campaign
        await supabase
          .from('dialing_queues')
          .delete()
          .eq('campaign_id', campaignId);

        // Re-add leads to queue with immediate scheduling
        const queueEntries = campaignLeadData
          .filter((cl: any) => cl.leads?.phone_number)
          .map((cl: any) => ({
            campaign_id: campaignId,
            lead_id: cl.lead_id,
            phone_number: cl.leads.phone_number,
            status: 'pending',
            priority: 1,
            max_attempts: 3,
            attempts: 0,
            scheduled_at: new Date().toISOString(),
          }));

        if (queueEntries.length > 0) {
          const { error: insertError } = await supabase
            .from('dialing_queues')
            .insert(queueEntries);

          if (insertError) throw insertError;
        }

        toast({
          title: 'Leads Re-queued',
          description: `${queueEntries.length} leads added to queue for immediate calling`,
        });

        // Trigger immediate dispatch
        await dispatchCalls({ silent: false });
      } catch (error: any) {
        console.error('[Force Requeue] Error:', error);
        toast({
          title: 'Re-queue Failed',
          description: error.message || 'Failed to re-queue leads',
          variant: 'destructive',
        });
      }
    },
    [toast, dispatchCalls]
  );

  return {
    dispatchCalls,
    startAutoDispatch,
    forceRequeueLeads,
    isDispatching,
  };
};
