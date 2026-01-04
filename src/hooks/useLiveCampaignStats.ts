import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface LiveCampaignStats {
  broadcastId: string;
  broadcastName: string;
  status: string;
  total: number;
  pending: number;
  calling: number;
  completed: number;
  answered: number;
  transferred: number;
  failed: number;
  dnc: number;
  callback: number;
  errorRate: number;
  completionRate: number;
  avgDuration: number;
  lastUpdated: Date;
}

interface SystemAlert {
  id: string;
  alertType: string;
  severity: string;
  title: string;
  message: string;
  relatedId: string | null;
  acknowledged: boolean;
  createdAt: Date;
}

export const useLiveCampaignStats = (broadcastId?: string) => {
  const [stats, setStats] = useState<LiveCampaignStats | null>(null);
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!broadcastId) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get broadcast info
      const { data: broadcast, error: broadcastError } = await supabase
        .from('voice_broadcasts')
        .select('id, name, status')
        .eq('id', broadcastId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (broadcastError || !broadcast) {
        throw new Error('Broadcast not found');
      }

      // Get queue stats
      const { data: queueItems, error: queueError } = await supabase
        .from('broadcast_queue')
        .select('status, call_duration_seconds')
        .eq('broadcast_id', broadcastId);

      if (queueError) throw queueError;

      const statCounts = {
        total: queueItems?.length || 0,
        pending: 0,
        calling: 0,
        completed: 0,
        answered: 0,
        transferred: 0,
        failed: 0,
        dnc: 0,
        callback: 0,
      };

      let totalDuration = 0;
      let durationCount = 0;

      for (const item of queueItems || []) {
        const status = item.status as keyof typeof statCounts;
        if (status in statCounts) {
          statCounts[status]++;
        }
        if (item.call_duration_seconds) {
          totalDuration += item.call_duration_seconds;
          durationCount++;
        }
      }

      const processedCalls = statCounts.completed + statCounts.answered + statCounts.transferred + statCounts.failed + statCounts.dnc;
      const successfulCalls = statCounts.completed + statCounts.answered + statCounts.transferred;

      setStats({
        broadcastId,
        broadcastName: broadcast.name,
        status: broadcast.status,
        ...statCounts,
        errorRate: processedCalls > 0 ? (statCounts.failed / processedCalls) * 100 : 0,
        completionRate: statCounts.total > 0 ? (successfulCalls / statCounts.total) * 100 : 0,
        avgDuration: durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
        lastUpdated: new Date(),
      });

      // Get recent alerts
      const { data: alertsData } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('user_id', user.id)
        .eq('related_id', broadcastId)
        .eq('acknowledged', false)
        .order('created_at', { ascending: false })
        .limit(10);

      setAlerts(
        (alertsData || []).map(a => ({
          id: a.id,
          alertType: a.alert_type,
          severity: a.severity,
          title: a.title,
          message: a.message,
          relatedId: a.related_id,
          acknowledged: a.acknowledged,
          createdAt: new Date(a.created_at),
        }))
      );

    } catch (err: any) {
      console.error('Error fetching live stats:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [broadcastId]);

  // Acknowledge an alert
  const acknowledgeAlert = useCallback(async (alertId: string) => {
    try {
      await supabase
        .from('system_alerts')
        .update({ 
          acknowledged: true, 
          acknowledged_at: new Date().toISOString() 
        })
        .eq('id', alertId);

      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  }, []);

  // Set up auto-refresh
  useEffect(() => {
    if (!broadcastId) return;

    // Initial fetch
    fetchStats();

    // Refresh every 10 seconds while active
    const interval = setInterval(() => {
      fetchStats();
    }, 10000);

    return () => clearInterval(interval);
  }, [broadcastId, fetchStats]);

  return {
    stats,
    alerts,
    isLoading,
    error,
    refetch: fetchStats,
    acknowledgeAlert,
  };
};

// Hook for getting all active campaigns
export const useActiveCampaigns = () => {
  const [campaigns, setCampaigns] = useState<Array<{
    id: string;
    name: string;
    status: string;
    pending: number;
    calling: number;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchActiveCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: broadcasts } = await supabase
        .from('voice_broadcasts')
        .select('id, name, status')
        .eq('user_id', user.id)
        .eq('status', 'active');

      const campaignStats = await Promise.all(
        (broadcasts || []).map(async (b) => {
          const { count: pendingCount } = await supabase
            .from('broadcast_queue')
            .select('*', { count: 'exact', head: true })
            .eq('broadcast_id', b.id)
            .eq('status', 'pending');

          const { count: callingCount } = await supabase
            .from('broadcast_queue')
            .select('*', { count: 'exact', head: true })
            .eq('broadcast_id', b.id)
            .eq('status', 'calling');

          return {
            id: b.id,
            name: b.name,
            status: b.status,
            pending: pendingCount || 0,
            calling: callingCount || 0,
          };
        })
      );

      setCampaigns(campaignStats);
    } catch (err) {
      console.error('Error fetching active campaigns:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActiveCampaigns();
    const interval = setInterval(fetchActiveCampaigns, 30000);
    return () => clearInterval(interval);
  }, [fetchActiveCampaigns]);

  return { campaigns, isLoading, refetch: fetchActiveCampaigns };
};

// Hook for system health overview
export const useSystemHealth = () => {
  const [health, setHealth] = useState<{
    healthy: boolean;
    issues: string[];
    stuckCalls: number;
    unacknowledgedAlerts: number;
    lastCheck: Date | null;
  }>({
    healthy: true,
    issues: [],
    stuckCalls: 0,
    unacknowledgedAlerts: 0,
    lastCheck: null,
  });
  const [isChecking, setIsChecking] = useState(false);

  const runHealthCheck = useCallback(async () => {
    setIsChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const response = await supabase.functions.invoke('campaign-health-monitor', {
        body: { action: 'check' }
      });

      if (response.data) {
        setHealth({
          healthy: response.data.healthy,
          issues: response.data.issues || [],
          stuckCalls: response.data.metrics?.stuckCalls || 0,
          unacknowledgedAlerts: response.data.alerts?.length || 0,
          lastCheck: new Date(),
        });
      }
    } catch (err) {
      console.error('Health check error:', err);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
    const interval = setInterval(runHealthCheck, 5 * 60 * 1000); // Every 5 minutes
    return () => clearInterval(interval);
  }, [runHealthCheck]);

  return { health, isChecking, runHealthCheck };
};
