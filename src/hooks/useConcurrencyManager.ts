import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ConcurrencySettings {
  maxConcurrentCalls: number;
  callsPerMinute: number;
  maxCallsPerAgent: number;
  enableAdaptivePacing: boolean;
}

interface ActiveCall {
  id: string;
  phone_number: string;
  status: string;
  started_at: string;
  agent_id?: string;
}

export const useConcurrencyManager = () => {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [concurrencyLimit, setConcurrencyLimit] = useState(10);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Load active calls from database - only recent ones (last 5 minutes)
  const loadActiveCalls = async () => {
    try {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('call_logs')
        .select('id, phone_number, status, created_at, retell_call_id')
        .in('status', ['initiated', 'ringing', 'in_progress'])
        .gte('created_at', fiveMinutesAgo) // Only show recent calls
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedCalls: ActiveCall[] = (data || []).map(call => ({
        id: call.id,
        phone_number: call.phone_number,
        status: call.status,
        started_at: call.created_at,
        agent_id: call.retell_call_id
      }));

      setActiveCalls(formattedCalls);
      return formattedCalls;
    } catch (error: any) {
      console.error('Error loading active calls:', error);
      return [];
    }
  };

  // Clean up stuck calls
  const cleanupStuckCalls = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('call-dispatcher', {
        body: { action: 'cleanup_stuck_calls' }
      });

      if (error) throw error;

      toast({
        title: "Cleanup Complete",
        description: data.message || `Cleaned up ${data.cleaned} stuck calls`,
      });

      await loadActiveCalls();
      return data;
    } catch (error: any) {
      console.error('Error cleaning up stuck calls:', error);
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to clean up stuck calls",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Get current concurrency settings
  const getConcurrencySettings = async (): Promise<ConcurrencySettings> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Check if there's a user-specific settings table
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      return {
        maxConcurrentCalls: data?.max_concurrent_calls || 10,
        callsPerMinute: data?.calls_per_minute || 30,
        maxCallsPerAgent: data?.max_calls_per_agent || 3,
        enableAdaptivePacing: data?.enable_adaptive_pacing || true
      };
    } catch (error: any) {
      console.error('Error getting concurrency settings:', error);
      return {
        maxConcurrentCalls: 10,
        callsPerMinute: 30,
        maxCallsPerAgent: 3,
        enableAdaptivePacing: true
      };
    }
  };

  // Update concurrency settings
  const updateConcurrencySettings = async (settings: Partial<ConcurrencySettings>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('system_settings')
        .upsert({
          user_id: user.id,
          max_concurrent_calls: settings.maxConcurrentCalls,
          calls_per_minute: settings.callsPerMinute,
          max_calls_per_agent: settings.maxCallsPerAgent,
          enable_adaptive_pacing: settings.enableAdaptivePacing,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast({
        title: "Settings Updated",
        description: "Concurrency settings have been saved",
      });

      return true;
    } catch (error: any) {
      console.error('Error updating concurrency settings:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update settings",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we can make a new call based on concurrency
  const canMakeCall = async (): Promise<boolean> => {
    const calls = await loadActiveCalls();
    const settings = await getConcurrencySettings();
    
    return calls.length < settings.maxConcurrentCalls;
  };

  // Calculate optimal dialing rate
  const calculateDialingRate = async () => {
    const settings = await getConcurrencySettings();
    const calls = await loadActiveCalls();
    
    // Basic predictive algorithm
    const currentConcurrency = calls.length;
    const utilizationRate = currentConcurrency / settings.maxConcurrentCalls;
    
    let recommendedRate = settings.callsPerMinute;
    
    if (utilizationRate < 0.5) {
      // Low utilization, increase dialing rate
      recommendedRate = Math.min(settings.callsPerMinute * 1.5, 50);
    } else if (utilizationRate > 0.9) {
      // High utilization, decrease dialing rate
      recommendedRate = Math.max(settings.callsPerMinute * 0.7, 10);
    }
    
    return {
      currentConcurrency,
      maxConcurrency: settings.maxConcurrentCalls,
      utilizationRate: Math.round(utilizationRate * 100),
      recommendedRate: Math.round(recommendedRate),
      availableSlots: settings.maxConcurrentCalls - currentConcurrency
    };
  };

  // Subscribe to real-time updates
  useEffect(() => {
    loadActiveCalls();
    
    const channel = supabase
      .channel('call_logs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs'
        },
        () => {
          loadActiveCalls();
        }
      )
      .subscribe();

    // Refresh every 10 seconds
    const interval = setInterval(() => {
      loadActiveCalls();
    }, 10000);

    return () => {
      channel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return {
    activeCalls,
    concurrencyLimit,
    isLoading,
    loadActiveCalls,
    getConcurrencySettings,
    updateConcurrencySettings,
    canMakeCall,
    calculateDialingRate,
    cleanupStuckCalls
  };
};
