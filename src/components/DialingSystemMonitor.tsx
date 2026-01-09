/**
 * Dialing System Monitor Component
 * 
 * Real-time monitoring of the dialing system's behavior:
 * - Current batch sizes being used
 * - Active call count vs limit
 * - Rate limit events in last hour
 * - Dispatcher invocation frequency
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Gauge, 
  Phone, 
  AlertTriangle, 
  CheckCircle,
  RefreshCw,
  TrendingUp,
  Clock,
  Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DialingMetrics {
  activeCallCount: number;
  maxConcurrent: number;
  callsPerMinute: number;
  lastBatchSize: number;
  availableSlots: number;
  queuedLeads: number;
  rateLimitEventsLast30m: number;
  dispatcherInvocationsLast5m: number;
  lastDispatchAt: string | null;
}

interface HealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  concurrency: 'healthy' | 'warning' | 'critical';
  rateLimit: 'healthy' | 'warning' | 'critical';
  dispatcher: 'healthy' | 'warning' | 'critical';
}

export const DialingSystemMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<DialingMetrics | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);

    try {
      // Fetch system settings
      const { data: settings } = await supabase
        .from('system_settings')
        .select('max_concurrent_calls, calls_per_minute, retell_max_concurrent')
        .limit(1)
        .maybeSingle();

      const maxConcurrent = settings?.retell_max_concurrent || settings?.max_concurrent_calls || 10;
      const callsPerMinute = settings?.calls_per_minute || 30;

      // Count active calls (in_progress, ringing, initiated in last 5 mins)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count: activeCallCount } = await supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .in('status', ['in_progress', 'ringing', 'initiated', 'queued'])
        .gte('created_at', fiveMinutesAgo);

      // Count queued leads
      const { count: queuedLeads } = await supabase
        .from('dialing_queues')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Check for rate limit errors in edge_function_errors
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { count: rateLimitEvents } = await supabase
        .from('edge_function_errors')
        .select('*', { count: 'exact', head: true })
        .ilike('error_message', '%rate%limit%')
        .gte('created_at', thirtyMinutesAgo);

      // Get last dispatch info from call_logs
      const { data: recentCalls } = await supabase
        .from('call_logs')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      // Estimate dispatcher invocations by call creation frequency
      const fiveMinCalls = (recentCalls || []).filter(
        c => new Date(c.created_at) > new Date(Date.now() - 5 * 60 * 1000)
      );
      
      // Calculate available slots
      const availableSlots = Math.max(0, maxConcurrent - (activeCallCount || 0));

      // Estimate batch size from recent call patterns
      const lastBatchSize = Math.min(fiveMinCalls.length, 10);

      const newMetrics: DialingMetrics = {
        activeCallCount: activeCallCount || 0,
        maxConcurrent,
        callsPerMinute,
        lastBatchSize,
        availableSlots,
        queuedLeads: queuedLeads || 0,
        rateLimitEventsLast30m: rateLimitEvents || 0,
        dispatcherInvocationsLast5m: Math.ceil(fiveMinCalls.length / (lastBatchSize || 1)),
        lastDispatchAt: recentCalls?.[0]?.created_at || null,
      };

      setMetrics(newMetrics);

      // Calculate health status
      const newHealth: HealthStatus = {
        concurrency: 
          availableSlots > 5 ? 'healthy' : 
          availableSlots > 0 ? 'warning' : 'critical',
        rateLimit: 
          (rateLimitEvents || 0) === 0 ? 'healthy' :
          (rateLimitEvents || 0) < 5 ? 'warning' : 'critical',
        dispatcher: 
          fiveMinCalls.length > 0 ? 'healthy' :
          (queuedLeads || 0) > 0 ? 'warning' : 'healthy',
        overall: 'healthy',
      };

      // Calculate overall health
      if (newHealth.concurrency === 'critical' || newHealth.rateLimit === 'critical') {
        newHealth.overall = 'critical';
      } else if (
        newHealth.concurrency === 'warning' || 
        newHealth.rateLimit === 'warning' ||
        newHealth.dispatcher === 'warning'
      ) {
        newHealth.overall = 'warning';
      }

      setHealth(newHealth);
      setLastRefresh(new Date());

    } catch (err) {
      console.error('Failed to fetch dialing metrics:', err);
    }

    setIsLoading(false);
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    fetchMetrics();

    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchMetrics, autoRefresh]);

  const getStatusColor = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'critical': return 'text-red-600';
    }
  };

  const getStatusBg = (status: 'healthy' | 'warning' | 'critical') => {
    switch (status) {
      case 'healthy': return 'bg-green-100 dark:bg-green-900/30';
      case 'warning': return 'bg-yellow-100 dark:bg-yellow-900/30';
      case 'critical': return 'bg-red-100 dark:bg-red-900/30';
    }
  };

  const concurrencyPercent = metrics 
    ? (metrics.activeCallCount / metrics.maxConcurrent) * 100 
    : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            <div>
              <CardTitle>Dialing System Monitor</CardTitle>
              <CardDescription>Real-time behavioral monitoring</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {health && (
              <Badge 
                variant={health.overall === 'healthy' ? 'default' : 'destructive'}
                className={`${getStatusColor(health.overall)}`}
              >
                {health.overall === 'healthy' ? (
                  <><CheckCircle className="h-3 w-3 mr-1" />Healthy</>
                ) : health.overall === 'warning' ? (
                  <><AlertTriangle className="h-3 w-3 mr-1" />Warning</>
                ) : (
                  <><AlertTriangle className="h-3 w-3 mr-1" />Critical</>
                )}
              </Badge>
            )}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchMetrics}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {metrics && health && (
          <>
            {/* Concurrency Usage */}
            <div className={`p-4 rounded-lg ${getStatusBg(health.concurrency)}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4" />
                  <span className="font-medium">Concurrency</span>
                </div>
                <span className={`font-bold ${getStatusColor(health.concurrency)}`}>
                  {metrics.activeCallCount} / {metrics.maxConcurrent}
                </span>
              </div>
              <Progress 
                value={concurrencyPercent} 
                className={`h-2 ${concurrencyPercent > 90 ? 'bg-red-200' : ''}`}
              />
              <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                <span>{metrics.availableSlots} slots available</span>
                <span>{concurrencyPercent.toFixed(0)}% utilized</span>
              </div>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 border rounded-lg text-center">
                <Phone className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{metrics.callsPerMinute}</div>
                <div className="text-xs text-muted-foreground">CPM Target</div>
              </div>
              <div className="p-3 border rounded-lg text-center">
                <Zap className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{metrics.lastBatchSize}</div>
                <div className="text-xs text-muted-foreground">Last Batch</div>
              </div>
              <div className="p-3 border rounded-lg text-center">
                <TrendingUp className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                <div className="text-2xl font-bold">{metrics.queuedLeads}</div>
                <div className="text-xs text-muted-foreground">Queued</div>
              </div>
              <div className={`p-3 border rounded-lg text-center ${
                metrics.rateLimitEventsLast30m > 0 ? 'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20' : ''
              }`}>
                <AlertTriangle className={`h-4 w-4 mx-auto mb-1 ${
                  metrics.rateLimitEventsLast30m > 0 ? 'text-yellow-600' : 'text-muted-foreground'
                }`} />
                <div className={`text-2xl font-bold ${
                  metrics.rateLimitEventsLast30m > 0 ? 'text-yellow-600' : ''
                }`}>
                  {metrics.rateLimitEventsLast30m}
                </div>
                <div className="text-xs text-muted-foreground">Rate Limits (30m)</div>
              </div>
            </div>

            {/* Dispatcher Activity */}
            <div className="p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Dispatcher Activity</span>
                </div>
                <Badge variant="outline">
                  ~{metrics.dispatcherInvocationsLast5m} calls in 5m
                </Badge>
              </div>
              {metrics.lastDispatchAt && (
                <div className="text-xs text-muted-foreground mt-1">
                  Last call: {new Date(metrics.lastDispatchAt).toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Last Refresh */}
            {lastRefresh && (
              <div className="text-xs text-muted-foreground text-center">
                Last updated: {lastRefresh.toLocaleTimeString()}
                {autoRefresh && ' (auto-refreshing every 30s)'}
              </div>
            )}
          </>
        )}

        {!metrics && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            Click refresh to load dialing system metrics
          </div>
        )}

        {isLoading && !metrics && (
          <div className="text-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <div className="mt-2 text-muted-foreground">Loading metrics...</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DialingSystemMonitor;
