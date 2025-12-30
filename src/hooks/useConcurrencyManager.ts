import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ConcurrencySettings {
  maxConcurrentCalls: number;
  callsPerMinute: number;
  maxCallsPerAgent: number;
  enableAdaptivePacing: boolean;
  retellMaxConcurrent: number;
  assistableMaxConcurrent: number;
  transferQueueEnabled: boolean;
}

interface ActiveCall {
  id: string;
  phone_number: string;
  status: string;
  started_at: string;
  agent_id?: string;
}

interface ActiveTransfer {
  id: string;
  platform: 'retell' | 'assistable';
  call_sid?: string;
  retell_call_id?: string;
  lead_id?: string;
  transfer_number?: string;
  started_at: string;
  status: string;
}

interface PlatformCapacity {
  active: number;
  max: number;
  available: number;
  utilizationRate: number;
}

export const useConcurrencyManager = () => {
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [activeTransfers, setActiveTransfers] = useState<ActiveTransfer[]>([]);
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

  // Load active AI transfers by platform
  const loadActiveTransfers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('active_ai_transfers')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('started_at', { ascending: false });

      if (error) throw error;

      const transfers: ActiveTransfer[] = (data || []).map(t => ({
        id: t.id,
        platform: t.platform as 'retell' | 'assistable',
        call_sid: t.call_sid,
        retell_call_id: t.retell_call_id,
        lead_id: t.lead_id,
        transfer_number: t.transfer_number,
        started_at: t.started_at,
        status: t.status
      }));

      setActiveTransfers(transfers);
      return transfers;
    } catch (error: any) {
      console.error('Error loading active transfers:', error);
      return [];
    }
  };

  // Get platform-specific capacity
  const getPlatformCapacity = async (platform: 'retell' | 'assistable'): Promise<PlatformCapacity> => {
    const settings = await getConcurrencySettings();
    const transfers = await loadActiveTransfers();
    
    const platformTransfers = transfers.filter(t => t.platform === platform);
    const maxConcurrent = platform === 'retell' 
      ? settings.retellMaxConcurrent 
      : settings.assistableMaxConcurrent;
    
    const active = platformTransfers.length;
    const available = Math.max(0, maxConcurrent - active);
    const utilizationRate = maxConcurrent > 0 ? Math.round((active / maxConcurrent) * 100) : 0;

    return {
      active,
      max: maxConcurrent,
      available,
      utilizationRate
    };
  };

  // Get all platform capacities
  const getAllPlatformCapacities = async () => {
    const [retell, assistable] = await Promise.all([
      getPlatformCapacity('retell'),
      getPlatformCapacity('assistable')
    ]);
    
    return { retell, assistable };
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
      await loadActiveTransfers();
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

  // Clean up stuck transfers
  const cleanupStuckTransfers = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Mark transfers older than 30 minutes as completed (stuck)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      const { data, error } = await supabase
        .from('active_ai_transfers')
        .update({ 
          status: 'completed', 
          ended_at: new Date().toISOString() 
        })
        .eq('user_id', user.id)
        .eq('status', 'active')
        .lt('started_at', thirtyMinutesAgo)
        .select();

      if (error) throw error;

      const cleaned = data?.length || 0;
      
      toast({
        title: "Cleanup Complete",
        description: `Cleaned up ${cleaned} stuck transfers`,
      });

      await loadActiveTransfers();
      return { cleaned };
    } catch (error: any) {
      console.error('Error cleaning up stuck transfers:', error);
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to clean up stuck transfers",
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
        enableAdaptivePacing: data?.enable_adaptive_pacing ?? true,
        retellMaxConcurrent: data?.retell_max_concurrent || 10,
        assistableMaxConcurrent: data?.assistable_max_concurrent || 200,
        transferQueueEnabled: data?.transfer_queue_enabled ?? true
      };
    } catch (error: any) {
      console.error('Error getting concurrency settings:', error);
      return {
        maxConcurrentCalls: 10,
        callsPerMinute: 30,
        maxCallsPerAgent: 3,
        enableAdaptivePacing: true,
        retellMaxConcurrent: 10,
        assistableMaxConcurrent: 200,
        transferQueueEnabled: true
      };
    }
  };

  // Update concurrency settings
  const updateConcurrencySettings = async (settings: Partial<ConcurrencySettings>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Build the update object with required fields
      const updateData = {
        user_id: user.id,
        updated_at: new Date().toISOString(),
        max_concurrent_calls: settings.maxConcurrentCalls,
        calls_per_minute: settings.callsPerMinute,
        max_calls_per_agent: settings.maxCallsPerAgent,
        enable_adaptive_pacing: settings.enableAdaptivePacing,
        retell_max_concurrent: settings.retellMaxConcurrent,
        assistable_max_concurrent: settings.assistableMaxConcurrent,
        transfer_queue_enabled: settings.transferQueueEnabled
      };

      const { error } = await supabase
        .from('system_settings')
        .upsert(updateData, { onConflict: 'user_id' });

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

  // Check if we can transfer to a specific platform
  const canTransferToPlatform = async (platform: 'retell' | 'assistable'): Promise<boolean> => {
    const capacity = await getPlatformCapacity(platform);
    return capacity.available > 0;
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
    loadActiveTransfers();
    
    const callsChannel = supabase
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

    const transfersChannel = supabase
      .channel('active_ai_transfers_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'active_ai_transfers'
        },
        () => {
          loadActiveTransfers();
        }
      )
      .subscribe();

    // Refresh every 10 seconds
    const interval = setInterval(() => {
      loadActiveCalls();
      loadActiveTransfers();
    }, 10000);

    return () => {
      callsChannel.unsubscribe();
      transfersChannel.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return {
    activeCalls,
    activeTransfers,
    concurrencyLimit,
    isLoading,
    loadActiveCalls,
    loadActiveTransfers,
    getConcurrencySettings,
    updateConcurrencySettings,
    canMakeCall,
    canTransferToPlatform,
    getPlatformCapacity,
    getAllPlatformCapacities,
    calculateDialingRate,
    cleanupStuckCalls,
    cleanupStuckTransfers
  };
};