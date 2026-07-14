import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import {
  browserCallDispatchAllowed,
  CALL_DISPATCH_LAUNCH_LOCK_MESSAGE,
  QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
} from '@/lib/launchSafety';

// Prevent noisy toast loops when the browser temporarily can't reach Supabase
const DISPATCH_FETCH_COOLDOWN_MS = 60_000;
const MIN_DISPATCH_INTERVAL_MS = 5_000;

let dispatchFetchCooldownUntil = 0;

// Global singleton state - ensures only ONE auto-dispatch interval runs app-wide
let globalAutoDispatchActive = false;
let globalAutoDispatchOrganizationId: string | null = null;
let globalIntervalRef: ReturnType<typeof setInterval> | null = null;
let globalDispatchInFlight = false;
let globalLastDispatchAttemptAt = 0;

// Store last dispatcher response for diagnostics (singleton for global access)
let globalLastDispatcherResponse: DispatcherResponse | null = null;

export interface DispatcherDiagnostics {
  pending_total: number;
  pending_eligible_now: number;
  pending_scheduled_future: number;
  earliest_scheduled_at: string | null;
  server_now_iso: string;
  message: string;
}

export interface DispatcherResponse {
  success?: boolean;
  dispatched?: number;
  remaining?: number;
  message?: string;
  diagnostics?: DispatcherDiagnostics | null;
  activeCallCount?: number;
  maxDialsInFlight?: number;
  status?: string;
  error?: string;
}

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
  const [lastResponse, setLastResponse] = useState<DispatcherResponse | null>(null);
  const { toast } = useToast();
  const organizationId = useCurrentOrganizationId();

  useEffect(() => {
    // Never let an interval created under one company survive an organization
    // switch and continue dispatching with a stale closure.
    if (globalAutoDispatchActive && globalAutoDispatchOrganizationId !== organizationId) {
      if (globalIntervalRef) clearInterval(globalIntervalRef);
      globalIntervalRef = null;
      globalAutoDispatchActive = false;
      globalAutoDispatchOrganizationId = null;
      globalLastDispatcherResponse = null;
      globalLastDispatchAttemptAt = 0;
    }
  }, [organizationId]);

  const dispatchCalls = useCallback(
    async (options: { silent?: boolean } = {}): Promise<DispatcherResponse | null> => {
      if (!browserCallDispatchAllowed()) {
        if (!options.silent) {
          toast({
            title: 'Call dispatch is launch-locked',
            description: CALL_DISPATCH_LAUNCH_LOCK_MESSAGE,
            variant: 'destructive',
          });
        }
        return null;
      }

      if (!organizationId) {
        if (!options.silent) {
          toast({
            title: 'Select a Company',
            description: 'Choose the organization whose campaigns you want to dispatch.',
            variant: 'destructive',
          });
        }
        return null;
      }
      if (globalDispatchInFlight || shouldSkipDispatchFetch()) return globalLastDispatcherResponse;

      globalDispatchInFlight = true;
      globalLastDispatchAttemptAt = Date.now();
      setIsDispatching(true);

      try {
        console.log('[Call Dispatcher] Dispatching calls...');

        const { data, error } = await supabase.functions.invoke('call-dispatcher', {
          method: 'POST',
          body: { organizationId },
        });

        if (error) throw error;

        // Store last response for diagnostics
        globalLastDispatcherResponse = data as DispatcherResponse;
        setLastResponse(data);

        if (data?.dispatched > 0) {
          toast({
            title: 'Calls Dispatched',
            description: `Successfully dispatched ${data.dispatched} calls`,
          });
        } else if (!options.silent) {
          // Show more helpful message with diagnostics
          const diagMsg = data?.diagnostics?.message || data?.message || 'No pending calls found';
          toast({
            title: 'No Calls to Dispatch',
            description: diagMsg,
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
    [organizationId, toast]
  );

  const startAutoDispatch = useCallback(
    (intervalSeconds: number = 30) => {
      if (!browserCallDispatchAllowed()) {
        toast({
          title: 'Auto-dispatch is launch-locked',
          description: CALL_DISPATCH_LAUNCH_LOCK_MESSAGE,
          variant: 'destructive',
        });
        return () => {};
      }

      const safeIntervalSeconds = Number.isFinite(intervalSeconds) && intervalSeconds >= 5 ? intervalSeconds : 30;
      if (!organizationId) {
        console.warn('[Auto-Dispatch] Organization selection is required');
        return () => {};
      }

      // CRITICAL: Prevent duplicate intervals across all components
      if (globalAutoDispatchActive) {
        console.warn('[Auto-Dispatch] Already running globally, ignoring duplicate start');
        return () => {}; // Return no-op cleanup
      }

      console.log(`[Auto-Dispatch] Starting globally every ${safeIntervalSeconds} seconds`);
      globalAutoDispatchActive = true;
      globalAutoDispatchOrganizationId = organizationId;

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
        globalAutoDispatchOrganizationId = null;
      };
    },
    [dispatchCalls, organizationId, toast]
  );

  const stopAutoDispatch = useCallback(() => {
    if (globalIntervalRef) {
      clearInterval(globalIntervalRef);
      globalIntervalRef = null;
    }
    globalAutoDispatchActive = false;
    globalAutoDispatchOrganizationId = null;
  }, []);

  // Force re-queue all leads for a campaign (fully resets their state)
  const forceRequeueLeads = useCallback(
    async (_campaignId: string) => {
      toast({
        title: 'Force re-queue is launch-locked',
        description: QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
        variant: 'destructive',
      });
    },
    [toast]
  );

  // Force dispatch a specific lead immediately (clears stuck calls, resets queue)
  const forceDispatchLead = useCallback(
    async (_leadId: string, _campaignId: string) => {
      toast({
        title: 'Force dispatch is launch-locked',
        description: QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
        variant: 'destructive',
      });
      return null;
    },
    [toast]
  );

  // Reset schedule for pending leads to make them dispatchable now
  const resetSchedule = useCallback(
    async (_campaignId: string) => {
      toast({
        title: 'Schedule reset is launch-locked',
        description: QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
        variant: 'destructive',
      });
      return null;
    },
    [toast]
  );

  // Cleanup stuck calls manually
  const cleanupStuckCalls = useCallback(
    async () => {
      try {
        if (!organizationId) throw new Error('Select an organization before cleanup');
        console.log('[Cleanup] Requesting stuck call cleanup...');

        const { data, error } = await supabase.functions.invoke('call-dispatcher', {
          method: 'POST',
          body: { action: 'cleanup_stuck_calls', organizationId },
        });

        if (error) throw error;

        toast({
          title: 'Cleanup Complete',
          description: data?.message || 'Stuck calls cleaned up',
        });

        return data;
      } catch (error: any) {
        console.error('[Cleanup] Error:', error);
        toast({
          title: 'Cleanup Failed',
          description: error.message || 'Failed to cleanup stuck calls',
          variant: 'destructive',
        });
        return null;
      }
    },
    [organizationId, toast]
  );

  return {
    dispatchCalls,
    startAutoDispatch,
    stopAutoDispatch,
    forceRequeueLeads,
    forceDispatchLead,
    resetSchedule,
    cleanupStuckCalls,
    isDispatching,
    lastResponse,
  };
};
