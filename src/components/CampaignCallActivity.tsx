import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Phone, PhoneOff, Clock, CheckCircle, XCircle, RefreshCw, 
  ChevronDown, ChevronUp, MessageSquare, Calendar, Users,
  TrendingUp, AlertCircle, PhoneCall, PhoneMissed, Voicemail
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface CampaignCallActivityProps {
  campaignId: string;
}

interface QueueStats {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  total: number;
}

export const CampaignCallActivity = ({ campaignId }: CampaignCallActivityProps) => {
  const { toast } = useToast();
  const [calls, setCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    queue: false,
    recentCalls: false,
    smsActivity: false,
  });
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
    noAnswer: 0,
    voicemail: 0,
    connected: 0,
    avgDuration: 0,
  });
  const [queueStats, setQueueStats] = useState<QueueStats>({
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
    total: 0,
  });
  const [smsStats, setSmsStats] = useState({
    sent: 0,
    received: 0,
    pending: 0,
  });

  useEffect(() => {
    loadAllData();
    
    // Set up real-time subscription for call updates
    const channel = supabase
      .channel(`campaign-activity-${campaignId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs',
          filter: `campaign_id=eq.${campaignId}`
        },
        () => loadAllData()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dialing_queues',
          filter: `campaign_id=eq.${campaignId}`
        },
        () => loadQueueStats()
      )
      .subscribe();

    // Refresh every 15 seconds
    const interval = setInterval(loadAllData, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [campaignId]);

  const loadAllData = async () => {
    await Promise.all([
      loadCallActivity(),
      loadQueueStats(),
      loadSmsStats(),
    ]);
  };

  const loadQueueStats = async () => {
    try {
      const { data, error } = await supabase
        .from('dialing_queues')
        .select('status')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      const pending = data?.filter(q => q.status === 'pending').length || 0;
      const inProgress = data?.filter(q => q.status === 'in-progress' || q.status === 'dialing').length || 0;
      const completed = data?.filter(q => q.status === 'completed').length || 0;
      const failed = data?.filter(q => q.status === 'failed' || q.status === 'max_attempts').length || 0;

      setQueueStats({
        pending,
        inProgress,
        completed,
        failed,
        total: data?.length || 0,
      });
    } catch (error) {
      console.error('Error loading queue stats:', error);
    }
  };

  const loadSmsStats = async () => {
    try {
      // Get leads from this campaign
      const { data: campaignLeads } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      if (!campaignLeads?.length) {
        setSmsStats({ sent: 0, received: 0, pending: 0 });
        return;
      }

      const leadIds = campaignLeads.map(cl => cl.lead_id);

      // Get SMS messages for these leads
      const { data: messages } = await supabase
        .from('sms_messages')
        .select('direction, status')
        .in('lead_id', leadIds);

      const sent = messages?.filter(m => m.direction === 'outbound' && m.status === 'delivered').length || 0;
      const received = messages?.filter(m => m.direction === 'inbound').length || 0;
      const pending = messages?.filter(m => m.direction === 'outbound' && m.status === 'pending').length || 0;

      setSmsStats({ sent, received, pending });
    } catch (error) {
      console.error('Error loading SMS stats:', error);
    }
  };

  const loadCallActivity = async () => {
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .select(`
          *,
          leads(first_name, last_name, phone_number)
        `)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setCalls(data || []);

      // Calculate comprehensive stats
      const allCalls = data || [];
      const completed = allCalls.filter(c => c.status === 'completed').length;
      const failed = allCalls.filter(c => c.status === 'failed').length;
      const inProgress = allCalls.filter(c => c.status === 'in-progress' || c.status === 'ringing').length;
      const noAnswer = allCalls.filter(c => c.status === 'no-answer' || c.outcome === 'no-answer').length;
      const voicemail = allCalls.filter(c => c.outcome === 'voicemail' || c.amd_result === 'machine').length;
      const connected = allCalls.filter(c => c.outcome === 'connected' || c.outcome === 'answered' || (c.duration_seconds && c.duration_seconds > 10)).length;
      
      // Calculate average duration for completed calls
      const completedCalls = allCalls.filter(c => c.duration_seconds && c.duration_seconds > 0);
      const avgDuration = completedCalls.length > 0 
        ? Math.round(completedCalls.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / completedCalls.length)
        : 0;

      setStats({
        total: allCalls.length,
        completed,
        failed,
        inProgress,
        noAnswer,
        voicemail,
        connected,
        avgDuration,
      });

    } catch (error: any) {
      console.error('Error loading call activity:', error);
      toast({
        title: "Error",
        description: "Failed to load call activity",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getStatusBadge = (status: string, outcome?: string) => {
    const variants: Record<string, any> = {
      'completed': { variant: 'default', icon: CheckCircle, label: 'Completed', className: 'bg-green-600' },
      'failed': { variant: 'destructive', icon: XCircle, label: 'Failed' },
      'in-progress': { variant: 'secondary', icon: PhoneCall, label: 'In Progress', className: 'bg-blue-600 text-white' },
      'ringing': { variant: 'secondary', icon: Phone, label: 'Ringing', className: 'bg-yellow-500 text-white' },
      'no-answer': { variant: 'outline', icon: PhoneMissed, label: 'No Answer' },
      'voicemail': { variant: 'outline', icon: Voicemail, label: 'Voicemail' },
    };

    const key = outcome === 'voicemail' ? 'voicemail' : status;
    const config = variants[key] || { variant: 'outline', icon: Clock, label: status };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className={`gap-1 ${config.className || ''}`}>
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Loading campaign activity...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Overview Section - Always visible summary */}
      <Collapsible open={expandedSections.overview} onOpenChange={() => toggleSection('overview')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Campaign Overview
                </CardTitle>
                {expandedSections.overview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-accent/30 rounded-lg">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <p className="text-xs text-muted-foreground">Total Calls</p>
                </div>
                <div className="text-center p-3 bg-green-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{stats.connected}</div>
                  <p className="text-xs text-muted-foreground">Connected</p>
                </div>
                <div className="text-center p-3 bg-amber-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-amber-600">{stats.noAnswer + stats.voicemail}</div>
                  <p className="text-xs text-muted-foreground">No Answer/VM</p>
                </div>
                <div className="text-center p-3 bg-blue-500/10 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.avgDuration > 0 ? `${Math.floor(stats.avgDuration / 60)}:${(stats.avgDuration % 60).toString().padStart(2, '0')}` : '--'}
                  </div>
                  <p className="text-xs text-muted-foreground">Avg Duration</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Queue Status Section */}
      <Collapsible open={expandedSections.queue} onOpenChange={() => toggleSection('queue')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Dialing Queue
                  <Badge variant="outline" className="ml-2">{queueStats.pending} pending</Badge>
                </CardTitle>
                {expandedSections.queue ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-yellow-600">{queueStats.pending}</div>
                  <p className="text-xs text-muted-foreground">Waiting</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-blue-600">{queueStats.inProgress}</div>
                  <p className="text-xs text-muted-foreground">In Progress</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-green-600">{queueStats.completed}</div>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-red-600">{queueStats.failed}</div>
                  <p className="text-xs text-muted-foreground">Failed/Max</p>
                </div>
              </div>
              {queueStats.total > 0 && (
                <div className="mt-3">
                  <div className="h-2 bg-accent rounded-full overflow-hidden flex">
                    <div 
                      className="bg-green-500 h-full" 
                      style={{ width: `${(queueStats.completed / queueStats.total) * 100}%` }} 
                    />
                    <div 
                      className="bg-blue-500 h-full" 
                      style={{ width: `${(queueStats.inProgress / queueStats.total) * 100}%` }} 
                    />
                    <div 
                      className="bg-yellow-500 h-full" 
                      style={{ width: `${(queueStats.pending / queueStats.total) * 100}%` }} 
                    />
                    <div 
                      className="bg-red-500 h-full" 
                      style={{ width: `${(queueStats.failed / queueStats.total) * 100}%` }} 
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-1">
                    {Math.round((queueStats.completed / queueStats.total) * 100)}% complete
                  </p>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* SMS Activity Section */}
      <Collapsible open={expandedSections.smsActivity} onOpenChange={() => toggleSection('smsActivity')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS Activity
                  <Badge variant="outline" className="ml-2">{smsStats.sent + smsStats.received} total</Badge>
                </CardTitle>
                {expandedSections.smsActivity ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-blue-600">{smsStats.sent}</div>
                  <p className="text-xs text-muted-foreground">Sent</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-green-600">{smsStats.received}</div>
                  <p className="text-xs text-muted-foreground">Received</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-yellow-600">{smsStats.pending}</div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Recent Calls Section */}
      <Collapsible open={expandedSections.recentCalls} onOpenChange={() => toggleSection('recentCalls')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Recent Calls
                  <Badge variant="outline" className="ml-2">{calls.length}</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); loadCallActivity(); }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  {expandedSections.recentCalls ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 max-h-[300px] overflow-y-auto">
              {calls.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Phone className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No calls yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {calls.map((call) => (
                    <div
                      key={call.id}
                      className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors text-sm"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {call.leads?.first_name || 'Unknown'} {call.leads?.last_name || ''}
                          </span>
                          {getStatusBadge(call.status, call.outcome)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                          <span className="font-mono">{call.phone_number}</span>
                          {call.duration_seconds > 0 && (
                            <span>• {Math.floor(call.duration_seconds / 60)}:{(call.duration_seconds % 60).toString().padStart(2, '0')}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {new Date(call.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
