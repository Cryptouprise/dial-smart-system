import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { 
  Phone, PhoneIncoming, PhoneOff, Clock, Pause, Play, Activity, 
  RefreshCw, Trash2, AlertTriangle, XCircle, CheckCircle,
  Users, Zap, TrendingUp, Radio
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLiveCampaignStats, useActiveCampaigns, useSystemHealth } from '@/hooks/useLiveCampaignStats';

interface QueueItem {
  id: string;
  phone_number: string;
  status: string;
  lead_name?: string;
  dtmf_pressed?: string;
  updated_at: string;
  call_duration_seconds?: number;
}

export const LiveCampaignMonitor: React.FC = () => {
  const { toast } = useToast();
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<string>('');
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [recentQueue, setRecentQueue] = useState<QueueItem[]>([]);
  
  const { stats, alerts, isLoading: statsLoading, refetch: refetchStats, acknowledgeAlert } = useLiveCampaignStats(selectedBroadcastId);
  const { campaigns: activeCampaigns, refetch: refetchCampaigns } = useActiveCampaigns();
  const { health, isChecking: healthChecking, runHealthCheck } = useSystemHealth();

  useEffect(() => {
    loadBroadcasts();
  }, []);

  useEffect(() => {
    if (selectedBroadcastId) {
      loadQueueData();
      const interval = setInterval(loadQueueData, 5000);
      
      // Subscribe to real-time updates on broadcast_queue
      const channel = supabase
        .channel('live-broadcast-queue')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'broadcast_queue',
          filter: `broadcast_id=eq.${selectedBroadcastId}`
        }, (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const item = payload.new as any;
            setRecentQueue(prev => {
              const filtered = prev.filter(q => q.id !== item.id);
              return [{
                id: item.id,
                phone_number: item.phone_number,
                status: item.status,
                lead_name: item.lead_name,
                dtmf_pressed: item.dtmf_pressed,
                updated_at: item.updated_at,
                call_duration_seconds: item.call_duration_seconds
              }, ...filtered].slice(0, 50);
            });
          }
        })
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }
  }, [selectedBroadcastId]);

  const loadBroadcasts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('voice_broadcasts')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['active', 'paused', 'draft'])
      .order('created_at', { ascending: false });
    setBroadcasts(data || []);
  };

  const loadQueueData = async () => {
    if (!selectedBroadcastId) return;

    const { data } = await supabase
      .from('broadcast_queue')
      .select('id, phone_number, status, lead_name, dtmf_pressed, updated_at, call_duration_seconds')
      .eq('broadcast_id', selectedBroadcastId)
      .order('updated_at', { ascending: false })
      .limit(50);

    setRecentQueue(data || []);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedBroadcastId) return;

    const { error } = await supabase
      .from('voice_broadcasts')
      .update({ status: newStatus })
      .eq('id', selectedBroadcastId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `Broadcast ${newStatus}` });
      loadBroadcasts();
    }
  };

  const clearStuckCalls = async () => {
    if (!selectedBroadcastId) return;

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: stuckCalls, error: fetchError } = await supabase
      .from('broadcast_queue')
      .select('id')
      .eq('broadcast_id', selectedBroadcastId)
      .eq('status', 'calling')
      .lt('updated_at', fiveMinAgo);

    if (fetchError) {
      toast({ title: 'Error', description: fetchError.message, variant: 'destructive' });
      return;
    }

    if (!stuckCalls || stuckCalls.length === 0) {
      toast({ title: 'No Stuck Calls', description: 'No stale calls found to clear' });
      return;
    }

    const { error: updateError } = await supabase
      .from('broadcast_queue')
      .update({ status: 'pending' })
      .in('id', stuckCalls.map(c => c.id));

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Reset Stuck Calls', 
        description: `Reset ${stuckCalls.length} stuck calls to pending` 
      });
      loadQueueData();
      refetchStats();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
      case 'answered':
      case 'transferred': return 'bg-green-500';
      case 'calling': return 'bg-blue-500 animate-pulse';
      case 'pending': return 'bg-slate-400';
      case 'failed': return 'bg-red-500';
      case 'no_answer': return 'bg-amber-500';
      case 'dnc': return 'bg-purple-500';
      default: return 'bg-slate-400';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const selectedBroadcast = broadcasts.find(b => b.id === selectedBroadcastId);
  const totalProcessed = stats ? (stats.completed + stats.failed + stats.answered + stats.transferred + stats.dnc) : 0;
  const totalAll = stats ? (stats.pending + stats.calling + totalProcessed) : 1;
  const progress = totalAll > 0 ? (totalProcessed / totalAll) * 100 : 0;

  // Derive health status from boolean
  const healthStatus = health?.healthy ? 'healthy' : (health?.stuckCalls > 5 || health?.unacknowledgedAlerts > 3) ? 'critical' : 'warning';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Radio className="h-6 w-6" />
            Live Broadcast Monitor
          </h2>
          <p className="text-muted-foreground">Real-time view of active voice broadcasts</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedBroadcastId} onValueChange={setSelectedBroadcastId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select broadcast" />
            </SelectTrigger>
            <SelectContent>
              {broadcasts.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                  <Badge variant={b.status === 'active' ? 'default' : 'secondary'} className="ml-2">
                    {b.status}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { loadBroadcasts(); refetchStats(); loadQueueData(); }}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* System Health Card */}
      {health && (
        <Card className={`border-2 ${healthStatus === 'healthy' ? 'border-green-500/30' : healthStatus === 'warning' ? 'border-amber-500/30' : 'border-red-500/30'}`}>
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${healthStatus === 'healthy' ? 'bg-green-500' : healthStatus === 'warning' ? 'bg-amber-500 animate-pulse' : 'bg-red-500 animate-pulse'}`} />
                <span className="font-medium">System Health: {healthStatus.toUpperCase()}</span>
                {health.stuckCalls > 0 && (
                  <Badge variant="outline" className="text-amber-600">
                    {health.stuckCalls} stuck calls
                  </Badge>
                )}
                {health.unacknowledgedAlerts > 0 && (
                  <Badge variant="outline" className="text-red-600">
                    {health.unacknowledgedAlerts} alerts
                  </Badge>
                )}
              </div>
              <Button variant="ghost" size="sm" onClick={runHealthCheck} disabled={healthChecking}>
                {healthChecking ? <RefreshCw className="h-4 w-4 animate-spin" /> : 'Check Now'}
              </Button>
            </div>
            {health.issues && health.issues.length > 0 && (
              <div className="mt-2 text-sm text-muted-foreground">
                {health.issues.slice(0, 2).join(' • ')}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedBroadcast ? (
        <>
          {/* Alerts Banner */}
          {alerts && alerts.length > 0 && (
            <div className="space-y-2">
              {alerts.slice(0, 3).map(alert => (
                <Alert key={alert.id} variant={alert.severity === 'critical' || alert.severity === 'error' ? 'destructive' : 'default'}>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{alert.title}</AlertTitle>
                  <AlertDescription className="flex items-center justify-between">
                    <span>{alert.message}</span>
                    <Button variant="ghost" size="sm" onClick={() => acknowledgeAlert(alert.id)}>
                      Dismiss
                    </Button>
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2">
            {selectedBroadcast.status === 'active' ? (
              <Button variant="outline" onClick={() => handleStatusChange('paused')}>
                <Pause className="h-4 w-4 mr-2" />
                Pause Broadcast
              </Button>
            ) : (
              <Button onClick={() => handleStatusChange('active')}>
                <Play className="h-4 w-4 mr-2" />
                Resume Broadcast
              </Button>
            )}
            <Button variant="outline" onClick={clearStuckCalls}>
              <Trash2 className="h-4 w-4 mr-2" />
              Reset Stuck Calls
            </Button>
          </div>

          {/* Progress Bar */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </CardContent>
          </Card>

          {/* Live Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold text-blue-500">{stats?.calling || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Activity className="h-3 w-3 animate-pulse" />
                  Calling
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold">{stats?.pending || 0}</div>
                <div className="text-xs text-muted-foreground">Pending</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold text-green-600">{stats?.completed || 0}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold text-green-500">{stats?.transferred || 0}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <PhoneIncoming className="h-3 w-3" />
                  Transferred
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold text-amber-500">{stats?.answered || 0}</div>
                <div className="text-xs text-muted-foreground">Answered</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className="text-3xl font-bold text-red-500">{stats?.failed || 0}</div>
                <div className="text-xs text-muted-foreground">Failed</div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3 text-center">
                <div className={`text-3xl font-bold ${(stats?.errorRate || 0) > 10 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {stats?.errorRate?.toFixed(1) || 0}%
                </div>
                <div className="text-xs text-muted-foreground">Error Rate</div>
              </CardContent>
            </Card>
          </div>

          {/* Status Indicator */}
          <Card>
            <CardContent className="py-3">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full ${selectedBroadcast.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="font-medium capitalize">{selectedBroadcast.status}</span>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  Avg Duration: {formatDuration(stats?.avgDuration)}
                </span>
                <span className="text-muted-foreground">•</span>
                <span className="text-sm text-muted-foreground">
                  Last Updated: {stats?.lastUpdated ? new Date(stats.lastUpdated).toLocaleTimeString() : 'N/A'}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Live Queue Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Live Queue Feed
              </CardTitle>
              <CardDescription>Real-time broadcast queue activity</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {recentQueue.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No queue items yet</p>
                  ) : (
                    recentQueue.map((item) => (
                      <div 
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(item.status)}`} />
                          <div>
                            <p className="font-mono text-sm">{item.phone_number}</p>
                            {item.lead_name && (
                              <p className="text-xs text-muted-foreground">{item.lead_name}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <Badge variant="outline">{item.status}</Badge>
                          {item.dtmf_pressed && (
                            <Badge className="bg-green-500">Pressed {item.dtmf_pressed}</Badge>
                          )}
                          <span className="text-muted-foreground">
                            {formatDuration(item.call_duration_seconds)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.updated_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Radio className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Select a broadcast to monitor</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LiveCampaignMonitor;
