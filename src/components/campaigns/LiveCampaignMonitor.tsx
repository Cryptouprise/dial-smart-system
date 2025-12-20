import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, PhoneIncoming, PhoneOff, Clock, Pause, Play, Activity, RefreshCw, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CallEvent {
  id: string;
  phone_number: string;
  status: string;
  outcome?: string;
  duration_seconds?: number;
  created_at: string;
  lead_name?: string;
}

export const LiveCampaignMonitor: React.FC = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
  const [recentCalls, setRecentCalls] = useState<CallEvent[]>([]);
  const [stats, setStats] = useState({
    inProgress: 0,
    completedLast5Min: 0,
    connectedLast5Min: 0,
    waitingInQueue: 0
  });

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedCampaignId) {
      loadCampaignData();
      const interval = setInterval(loadCampaignData, 10000); // Refresh every 10s
      
      // Subscribe to real-time updates
      const channel = supabase
        .channel('live-calls')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'call_logs',
          filter: `campaign_id=eq.${selectedCampaignId}`
        }, (payload) => {
          const newCall = payload.new as any;
          setRecentCalls(prev => [{
            id: newCall.id,
            phone_number: newCall.phone_number,
            status: newCall.status,
            outcome: newCall.outcome,
            duration_seconds: newCall.duration_seconds,
            created_at: newCall.created_at
          }, ...prev].slice(0, 50));
        })
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'call_logs',
          filter: `campaign_id=eq.${selectedCampaignId}`
        }, (payload) => {
          const updated = payload.new as any;
          setRecentCalls(prev => prev.map(c => 
            c.id === updated.id 
              ? { ...c, status: updated.status, outcome: updated.outcome, duration_seconds: updated.duration_seconds }
              : c
          ));
        })
        .subscribe();

      return () => {
        clearInterval(interval);
        supabase.removeChannel(channel);
      };
    }
  }, [selectedCampaignId]);

  const loadCampaigns = async () => {
    const { data } = await supabase
      .from('campaigns')
      .select('*')
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false });
    setCampaigns(data || []);
  };

  const loadCampaignData = async () => {
    if (!selectedCampaignId) return;

    // Get campaign details
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', selectedCampaignId)
      .maybeSingle();
    setSelectedCampaign(campaign);

    // Get recent calls
    const { data: calls } = await supabase
      .from('call_logs')
      .select(`
        id, phone_number, status, outcome, duration_seconds, created_at,
        leads(first_name, last_name)
      `)
      .eq('campaign_id', selectedCampaignId)
      .order('created_at', { ascending: false })
      .limit(50);

    const formattedCalls: CallEvent[] = (calls || []).map(c => ({
      id: c.id,
      phone_number: c.phone_number,
      status: c.status,
      outcome: c.outcome || undefined,
      duration_seconds: c.duration_seconds || undefined,
      created_at: c.created_at,
      lead_name: c.leads ? `${c.leads.first_name || ''} ${c.leads.last_name || ''}`.trim() : undefined
    }));
    setRecentCalls(formattedCalls);

    // Calculate stats
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const inProgress = formattedCalls.filter(c => c.status === 'in-progress' || c.status === 'ringing').length;
    const last5MinCalls = formattedCalls.filter(c => c.created_at > fiveMinAgo);
    const completedLast5Min = last5MinCalls.filter(c => c.status === 'completed').length;
    const connectedLast5Min = last5MinCalls.filter(c => (c.duration_seconds || 0) > 0).length;

    // Get queue count
    const { count: queueCount } = await supabase
      .from('dialing_queues')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', selectedCampaignId)
      .eq('status', 'pending');

    setStats({
      inProgress,
      completedLast5Min,
      connectedLast5Min,
      waitingInQueue: queueCount || 0
    });
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!selectedCampaignId) return;

    const { error } = await supabase
      .from('campaigns')
      .update({ status: newStatus })
      .eq('id', selectedCampaignId);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `Campaign ${newStatus}` });
      loadCampaignData();
    }
  };

  const clearStuckCalls = async () => {
    if (!selectedCampaignId) return;

    // Find calls that have been "ringing" for more than 5 minutes
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data: stuckCalls, error: fetchError } = await supabase
      .from('call_logs')
      .select('id')
      .eq('campaign_id', selectedCampaignId)
      .in('status', ['ringing', 'in-progress'])
      .lt('created_at', fiveMinAgo);

    if (fetchError) {
      toast({ title: 'Error', description: fetchError.message, variant: 'destructive' });
      return;
    }

    if (!stuckCalls || stuckCalls.length === 0) {
      toast({ title: 'No Stuck Calls', description: 'No stale calls found to clear' });
      return;
    }

    // Update stuck calls to "timed_out" status
    const { error: updateError } = await supabase
      .from('call_logs')
      .update({ status: 'timed_out', outcome: 'call_timed_out' })
      .in('id', stuckCalls.map(c => c.id));

    if (updateError) {
      toast({ title: 'Error', description: updateError.message, variant: 'destructive' });
    } else {
      toast({ 
        title: 'Cleared Stuck Calls', 
        description: `Marked ${stuckCalls.length} stale calls as timed out` 
      });
      loadCampaignData();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500';
      case 'in-progress': return 'bg-blue-500';
      case 'ringing': return 'bg-amber-500';
      case 'failed': return 'bg-red-500';
      case 'no-answer': 
      case 'no_answer': return 'bg-slate-500';
      case 'timed_out': return 'bg-orange-500';
      default: return 'bg-slate-400';
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Live Campaign Monitor</h2>
          <p className="text-muted-foreground">Real-time view of active campaigns</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedCampaignId} onValueChange={setSelectedCampaignId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Select campaign" />
            </SelectTrigger>
            <SelectContent>
              {campaigns.map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                  <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="ml-2">
                    {c.status}
                  </Badge>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadCampaignData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {selectedCampaign ? (
        <>
          {/* Quick Actions */}
          <div className="flex gap-2">
            {selectedCampaign.status === 'active' ? (
              <Button variant="outline" onClick={() => handleStatusChange('paused')}>
                <Pause className="h-4 w-4 mr-2" />
                Pause Campaign
              </Button>
            ) : (
              <Button onClick={() => handleStatusChange('active')}>
                <Play className="h-4 w-4 mr-2" />
                Resume Campaign
              </Button>
            )}
            <Button variant="outline" onClick={clearStuckCalls}>
              <Trash2 className="h-4 w-4 mr-2" />
              Clear Stuck Calls
            </Button>
          </div>

          {/* Live Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
                  <span className="text-sm text-muted-foreground">In Progress</span>
                </div>
                <p className="text-3xl font-bold">{stats.inProgress}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Last 5 min</span>
                </div>
                <p className="text-3xl font-bold">{stats.completedLast5Min}</p>
                <p className="text-xs text-muted-foreground">{stats.connectedLast5Min} connected</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">In Queue</span>
                </div>
                <p className="text-3xl font-bold">{stats.waitingInQueue}</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${selectedCampaign.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="text-sm text-muted-foreground">Status</span>
                </div>
                <p className="text-xl font-bold capitalize">{selectedCampaign.status}</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Calls Feed */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Live Call Feed
              </CardTitle>
              <CardDescription>Real-time call activity</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-2">
                  {recentCalls.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">No calls yet</p>
                  ) : (
                    recentCalls.map((call) => (
                      <div 
                        key={call.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${getStatusColor(call.status)}`} />
                          <div>
                            <p className="font-mono text-sm">{call.phone_number}</p>
                            {call.lead_name && (
                              <p className="text-xs text-muted-foreground">{call.lead_name}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <Badge variant="outline">{call.status}</Badge>
                          {call.outcome && (
                            <Badge>{call.outcome}</Badge>
                          )}
                          <span className="text-muted-foreground">
                            {formatDuration(call.duration_seconds)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(call.created_at).toLocaleTimeString()}
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
            <p className="text-muted-foreground">Select an active campaign to monitor</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LiveCampaignMonitor;
