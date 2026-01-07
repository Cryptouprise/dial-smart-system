import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface LiveCall {
  id: string;
  leadId: string;
  leadName: string;
  phoneNumber: string;
  callerId: string;
  campaignName: string;
  status: 'queued' | 'ringing' | 'in_progress' | 'completed' | 'failed' | 'no_answer';
  startedAt: string;
  answeredAt?: string;
  duration: number;
  retellCallId?: string;
}

interface CallStats {
  totalActive: number;
  ringing: number;
  inProgress: number;
  completedToday: number;
  answerRateToday: number;
  avgDurationToday: number;
}

export const useRealtimeCallStatus = () => {
  const [liveCalls, setLiveCalls] = useState<LiveCall[]>([]);
  const [stats, setStats] = useState<CallStats>({
    totalActive: 0,
    ringing: 0,
    inProgress: 0,
    completedToday: 0,
    answerRateToday: 0,
    avgDurationToday: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const { toast } = useToast();

  // Transform database call log to LiveCall
  const transformCallLog = (callLog: any): LiveCall => {
    const lead = callLog.leads as any;
    const campaign = callLog.campaigns as any;
    
    const startTime = new Date(callLog.created_at);
    const now = new Date();
    const duration = callLog.ended_at 
      ? Math.round((new Date(callLog.ended_at).getTime() - startTime.getTime()) / 1000)
      : Math.round((now.getTime() - startTime.getTime()) / 1000);

    return {
      id: callLog.id,
      leadId: callLog.lead_id || '',
      leadName: lead ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() : 'Unknown',
      phoneNumber: callLog.phone_number,
      callerId: callLog.caller_id,
      campaignName: campaign?.name || 'Unknown Campaign',
      status: callLog.status as LiveCall['status'],
      startedAt: callLog.created_at,
      answeredAt: callLog.answered_at,
      duration,
      retellCallId: callLog.retell_call_id
    };
  };

  // Load initial active calls
  const loadActiveCalls = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: calls, error } = await supabase
        .from('call_logs')
        .select(`
          *,
          leads (first_name, last_name),
          campaigns (name)
        `)
        .eq('user_id', user.id)
        .in('status', ['queued', 'ringing', 'in_progress', 'initiated'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const transformedCalls = (calls || []).map(transformCallLog);
      setLiveCalls(transformedCalls);

      // Calculate stats
      await calculateStats(user.id);
    } catch (error) {
      console.error('Error loading active calls:', error);
    }
  }, []);

  // Calculate today's stats
  const calculateStats = useCallback(async (userId: string) => {
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const { data: todayCalls, error } = await supabase
        .from('call_logs')
        .select('status, duration_seconds, answered_at')
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString());

      if (error) throw error;

      const calls = todayCalls || [];
      const completed = calls.filter(c => c.status === 'completed').length;
      const answered = calls.filter(c => c.answered_at).length;
      const durations = calls
        .filter(c => c.duration_seconds)
        .map(c => c.duration_seconds);

      const avgDuration = durations.length > 0 
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

      // Count active calls from state
      const activeFromState = liveCalls.filter(c => 
        ['queued', 'ringing', 'in_progress'].includes(c.status)
      );

      setStats({
        totalActive: activeFromState.length,
        ringing: activeFromState.filter(c => c.status === 'ringing').length,
        inProgress: activeFromState.filter(c => c.status === 'in_progress').length,
        completedToday: completed,
        answerRateToday: calls.length > 0 ? Math.round((answered / calls.length) * 100) : 0,
        avgDurationToday: avgDuration
      });
    } catch (error) {
      console.error('Error calculating stats:', error);
    }
  }, [liveCalls]);

  // Handle real-time updates
  const handleRealtimeUpdate = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    console.log('[Realtime] Call update:', eventType, newRecord?.id);

    if (eventType === 'INSERT' || eventType === 'UPDATE') {
      setLiveCalls(prev => {
        const existing = prev.findIndex(c => c.id === newRecord.id);
        const transformed = transformCallLog(newRecord);

        if (existing >= 0) {
          // Update existing call
          const updated = [...prev];
          updated[existing] = transformed;
          
          // Remove if no longer active
          if (['completed', 'failed', 'no_answer'].includes(newRecord.status)) {
            return updated.filter(c => c.id !== newRecord.id);
          }
          return updated;
        } else if (['queued', 'ringing', 'in_progress', 'initiated'].includes(newRecord.status)) {
          // Add new active call
          return [transformed, ...prev];
        }
        
        return prev;
      });

      // Show notification for answered calls
      if (newRecord.status === 'in_progress' && !oldRecord?.answered_at && newRecord.answered_at) {
        toast({
          title: "📞 Call Answered",
          description: `Connected to ${newRecord.phone_number}`
        });
      }

      // Show notification for completed calls
      if (newRecord.status === 'completed' && oldRecord?.status !== 'completed') {
        toast({
          title: "✅ Call Completed",
          description: `Duration: ${Math.round((newRecord.duration_seconds || 0) / 60)}m ${(newRecord.duration_seconds || 0) % 60}s`
        });
      }
    } else if (eventType === 'DELETE') {
      setLiveCalls(prev => prev.filter(c => c.id !== oldRecord.id));
    }
  }, [toast]);

  // Set up real-time subscription
  useEffect(() => {
    let channel: any;

    const setupSubscription = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load initial data
      await loadActiveCalls();

      // Subscribe to real-time updates
      channel = supabase
        .channel('call-status-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'call_logs',
            filter: `user_id=eq.${user.id}`
          },
          handleRealtimeUpdate
        )
        .subscribe((status) => {
          console.log('[Realtime] Subscription status:', status);
          setIsConnected(status === 'SUBSCRIBED');
        });
    };

    setupSubscription();

    // Refresh stats every 30 seconds
    const statsInterval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) calculateStats(user.id);
    }, 30000);

    // Update call durations every second AND auto-cleanup stuck calls
    const durationInterval = setInterval(() => {
      setLiveCalls(prev => {
        const now = new Date();
        return prev
          .filter(call => {
            // Auto-cleanup: Remove calls stuck in ringing/initiated for more than 3 minutes
            if (['ringing', 'initiated', 'queued'].includes(call.status)) {
              const startTime = new Date(call.startedAt);
              const age = now.getTime() - startTime.getTime();
              if (age > 3 * 60 * 1000) {
                console.log('[Cleanup] Auto-removing stuck call:', call.id, call.status, 'age:', Math.round(age / 1000), 's');
                return false;
              }
            }
            return true;
          })
          .map(call => {
            if (['ringing', 'in_progress'].includes(call.status)) {
              const startTime = new Date(call.startedAt);
              return {
                ...call,
                duration: Math.round((now.getTime() - startTime.getTime()) / 1000)
              };
            }
            return call;
          });
      });
    }, 1000);

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
      clearInterval(statsInterval);
      clearInterval(durationInterval);
    };
  }, [loadActiveCalls, handleRealtimeUpdate, calculateStats]);

  // Get call by ID
  const getCall = useCallback((callId: string): LiveCall | undefined => {
    return liveCalls.find(c => c.id === callId);
  }, [liveCalls]);

  // End a call
  const endCall = useCallback(async (callId: string) => {
    try {
      const call = liveCalls.find(c => c.id === callId);
      if (!call?.retellCallId) {
        throw new Error('Cannot end call - no Retell call ID');
      }

      await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'end_call',
          retellCallId: call.retellCallId
        }
      });

      toast({
        title: "Call Ended",
        description: "The call has been terminated"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to end call",
        variant: "destructive"
      });
    }
  }, [liveCalls, toast]);

  return {
    liveCalls,
    stats,
    isConnected,
    getCall,
    endCall,
    refreshCalls: loadActiveCalls
  };
};
