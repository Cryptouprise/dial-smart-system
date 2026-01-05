import { useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Prevent noisy toast loops when the browser temporarily can't reach Supabase
const DISPATCH_FETCH_COOLDOWN_MS = 60_000;
const MIN_DISPATCH_INTERVAL_MS = 5_000;

let dispatchFetchCooldownUntil = 0;

// Global singleton state - ensures only ONE auto-dispatch interval runs app-wide
let globalAutoDispatchActive = false;
let globalIntervalRef: ReturnType<typeof setInterval> | null = null;
let globalDispatchInFlight = false;
let globalLastDispatchAttemptAt = 0;

const getErrorText = (err: unknown) => {
  const anyErr = err as any;
  const parts = [
    anyErr?.name,
    anyErr?.message,
    anyErr?.context?.message,
    anyErr?.context?.value?.message,
    anyErr?.cause?.message,
  ].filter(Boolean);

  // Avoid huge JSON.stringify spam, but still include something useful
  return parts.map(String).join(' | ');
};

const isTransientFetchFailure = (err: unknown) => {
  const anyErr = err as any;
  const text = getErrorText(err);

  // Supabase-js uses this when the function endpoint can’t be reached
  if (anyErr?.name === 'FunctionsFetchError') return true;
  if (text.includes('Failed to send a request to the Edge Function')) return true;

  return (
    text.includes('Failed to fetch') ||
    text.includes('Load failed') ||
    text.includes('NetworkError') ||
    text.includes('net::ERR_')
  );
};

const enterDispatchFetchCooldown = () => {
  dispatchFetchCooldownUntil = Date.now() + DISPATCH_FETCH_COOLDOWN_MS;
};

const shouldSkipDispatchFetch = () => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (Date.now() - globalLastDispatchAttemptAt < MIN_DISPATCH_INTERVAL_MS) return true;
  return Date.now() < dispatchFetchCooldownUntil;
};

export const useCallDispatcher = () => {
  const [isDispatching, setIsDispatching] = useState(false);
  const { toast } = useToast();

  const dispatchCalls = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (globalDispatchInFlight || shouldSkipDispatchFetch()) return null;

      globalDispatchInFlight = true;
      globalLastDispatchAttemptAt = Date.now();
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
        // Avoid toast/log spam during temporary network/edge-function reachability issues
        if (isTransientFetchFailure(error)) {
          enterDispatchFetchCooldown();
          if (!options.silent) {
            toast({
              title: 'Network Issue',
              description: 'Can’t reach the call dispatcher right now. Retrying automatically in ~1 minute.',
              variant: 'destructive',
            });
          }
          return null;
        }

        if (!options.silent) {
          console.error('[Call Dispatcher] Error:', error);
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
      const safeIntervalSeconds = Number.isFinite(intervalSeconds) && intervalSeconds >= 5 ? intervalSeconds : 30;

      // CRITICAL: Prevent duplicate intervals across all components
      if (globalAutoDispatchActive) {
        console.warn('[Auto-Dispatch] Already running globally, ignoring duplicate start');
        return () => {}; // Return no-op cleanup
      }

      console.log(`[Auto-Dispatch] Starting globally every ${safeIntervalSeconds} seconds`);
      globalAutoDispatchActive = true;

      // Clear any lingering intervals
      if (globalIntervalRef) {
        clearInterval(globalIntervalRef);
        globalIntervalRef = null;
      }

      globalIntervalRef = setInterval(() => {
        void dispatchCalls({ silent: true });
      }, safeIntervalSeconds * 1000);

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

  const stopAutoDispatch = useCallback(() => {
    if (globalIntervalRef) {
      clearInterval(globalIntervalRef);
      globalIntervalRef = null;
    }
    globalAutoDispatchActive = false;
  }, []);

  // Force re-queue all leads for a campaign (fully resets their state)
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

        const leadIds = campaignLeadData.map((cl: any) => cl.lead_id);

        // 1. Delete existing queue entries for this campaign
        await supabase
          .from('dialing_queues')
          .delete()
          .eq('campaign_id', campaignId);

        // 2. Delete workflow progress entries for these leads (so they can re-enroll)
        const { error: workflowDeleteError } = await supabase
          .from('lead_workflow_progress')
          .delete()
          .in('lead_id', leadIds);
        
        if (workflowDeleteError) {
          console.warn('[Force Requeue] Failed to clear workflow progress:', workflowDeleteError);
        }

        // 3. Reset lead status to 'new' so they're eligible again
        const { error: leadResetError } = await supabase
          .from('leads')
          .update({ 
            status: 'new',
            last_contacted_at: null,
          })
          .in('id', leadIds);
        
        if (leadResetError) {
          console.warn('[Force Requeue] Failed to reset lead status:', leadResetError);
        }

        // 4. Re-add leads to queue with immediate scheduling
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
          title: 'Leads Fully Reset',
          description: `${queueEntries.length} leads reset and re-queued for calling`,
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
    stopAutoDispatch,
    forceRequeueLeads,
    isDispatching,
  };
};
