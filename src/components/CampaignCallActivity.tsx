import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Phone, PhoneOff, Clock, CheckCircle, XCircle, RefreshCw, 
  ChevronDown, ChevronUp, MessageSquare, Calendar, Users,
  TrendingUp, AlertCircle, PhoneCall, PhoneMissed, Voicemail,
  Play, Pause
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
  const [recentSms, setRecentSms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    overview: true,
    queue: false,
    recentCalls: false,
    smsActivity: true, // SMS expanded by default so users can see activity
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
    
    // Set up real-time subscription for call and SMS updates
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sms_messages'
        },
        () => loadSmsStats() // Reload SMS when any message changes
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
      const inProgress = data?.filter(q => q.status === 'in-progress' || q.status === 'dialing' || q.status === 'calling').length || 0;
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
        setRecentSms([]);
        return;
      }

      const leadIds = campaignLeads.map(cl => cl.lead_id).filter(Boolean);

      // Get SMS messages for these leads with lead info
      const { data: messages } = await supabase
        .from('sms_messages')
        .select(`
          id, direction, status, body, from_number, to_number, created_at, is_ai_generated,
          leads(first_name, last_name, phone_number)
        `)
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
        .limit(50);

      const allMessages = messages || [];
      const sent = allMessages.filter(m => m.direction === 'outbound' && m.status === 'delivered').length;
      const received = allMessages.filter(m => m.direction === 'inbound').length;
      const pending = allMessages.filter(m => m.direction === 'outbound' && (m.status === 'pending' || m.status === 'queued' || m.status === 'sending')).length;

      setSmsStats({ sent, received, pending });
      setRecentSms(allMessages.slice(0, 15)); // Keep recent 15 for display
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

      {/* SMS Activity Section - Expanded by default */}
      <Collapsible open={expandedSections.smsActivity} onOpenChange={() => toggleSection('smsActivity')}>
        <Card className={smsStats.pending > 0 ? 'ring-2 ring-yellow-500/50' : ''}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors py-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS Activity
                  {smsStats.pending > 0 && (
                    <Badge className="bg-yellow-500 text-white animate-pulse">{smsStats.pending} sending...</Badge>
                  )}
                  <Badge variant="outline" className="ml-2">{smsStats.sent + smsStats.received} total</Badge>
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); loadSmsStats(); }}
                  >
                    <RefreshCw className="h-3 w-3" />
                  </Button>
                  {expandedSections.smsActivity ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-blue-600">{smsStats.sent}</div>
                  <p className="text-xs text-muted-foreground">Delivered</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className="text-xl font-bold text-green-600">{smsStats.received}</div>
                  <p className="text-xs text-muted-foreground">Received</p>
                </div>
                <div className="text-center p-3 border rounded-lg">
                  <div className={`text-xl font-bold ${smsStats.pending > 0 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                    {smsStats.pending}
                  </div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>

              {/* Recent SMS Messages */}
              {recentSms.length > 0 ? (
                <div className="space-y-2 max-h-[250px] overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground">Recent Messages</p>
                  {recentSms.map((sms) => (
                    <div
                      key={sms.id}
                      className={`flex items-start gap-2 p-2 border rounded-lg text-sm ${
                        sms.direction === 'inbound' ? 'bg-green-50 dark:bg-green-900/20 border-green-200' : 
                        sms.status === 'pending' ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200' :
                        'bg-blue-50 dark:bg-blue-900/20 border-blue-200'
                      }`}
                    >
                      <div className={`mt-0.5 ${sms.direction === 'inbound' ? 'text-green-600' : 'text-blue-600'}`}>
                        {sms.direction === 'inbound' ? (
                          <MessageSquare className="h-4 w-4" />
                        ) : (
                          <MessageSquare className="h-4 w-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">
                            {sms.leads?.first_name || sms.to_number || 'Unknown'}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {sms.direction === 'inbound' ? 'Received' : sms.status}
                          </Badge>
                          {sms.is_ai_generated && (
                            <Badge variant="secondary" className="text-xs">AI</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                          {sms.body?.substring(0, 100)}{sms.body?.length > 100 ? '...' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(sms.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No SMS messages yet</p>
                </div>
              )}
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
                    <CallActivityRow key={call.id} call={call} getStatusBadge={getStatusBadge} />
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

// Recording player component for call activity rows
const CallActivityRow = ({ call, getStatusBadge }: { call: any; getStatusBadge: (status: string, outcome?: string) => React.ReactNode }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const togglePlayback = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(() => setAudioError(true));
    }
    setIsPlaying(!isPlaying);
  };

  const handleEnded = () => setIsPlaying(false);

  return (
    <div className="flex items-center justify-between p-2 border rounded-lg hover:bg-accent/50 transition-colors text-sm">
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
      
      <div className="flex items-center gap-2 ml-2">
        {/* Recording playback button */}
        {call.recording_url && !audioError && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={togglePlayback}
              title={isPlaying ? 'Pause recording' : 'Play recording'}
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Play className="h-3.5 w-3.5 text-primary" />
              )}
            </Button>
            <audio
              ref={audioRef}
              src={call.recording_url}
              onEnded={handleEnded}
              onError={() => setAudioError(true)}
              preload="none"
            />
          </>
        )}
        
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(call.created_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
};
