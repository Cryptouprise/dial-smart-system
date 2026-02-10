import React, { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Phone,
  MessageSquare,
  Clock,
  Flame,
  Heart,
  PauseCircle,
  Moon,
  CalendarCheck,
  Calendar,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Timer,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StageCount {
  current_stage: string;
  count: number;
}

interface JourneyLead {
  id: string;
  lead_id: string;
  current_stage: string;
  total_touches: number;
  total_calls: number;
  total_sms: number;
  engagement_score: number | null;
  sentiment_score: number | null;
  journey_health: string;
  next_recommended_action: string | null;
  next_action_scheduled_at: string | null;
  stale_since: string | null;
  updated_at: string;
  leads: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string;
    status: string;
  };
}

interface JourneyEvent {
  id: string;
  lead_id: string;
  event_type: string;
  event_source: string;
  from_stage: string | null;
  to_stage: string | null;
  event_data: any;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Stage configuration
// ---------------------------------------------------------------------------

const STAGE_CONFIG: Record<string, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ReactNode;
  description: string;
}> = {
  fresh: {
    label: 'Fresh',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    icon: <Zap className="h-4 w-4" />,
    description: 'Never contacted. Speed to lead!',
  },
  attempting: {
    label: 'Attempting',
    color: 'text-blue-600',
    bgColor: 'bg-blue-500/10 border-blue-500/30',
    icon: <Phone className="h-4 w-4" />,
    description: 'Trying to reach. No answer yet.',
  },
  engaged: {
    label: 'Engaged',
    color: 'text-purple-600',
    bgColor: 'bg-purple-500/10 border-purple-500/30',
    icon: <MessageSquare className="h-4 w-4" />,
    description: 'Conversation started.',
  },
  hot: {
    label: 'Hot',
    color: 'text-red-600',
    bgColor: 'bg-red-500/10 border-red-500/30',
    icon: <Flame className="h-4 w-4" />,
    description: 'Strong interest. Compress timeline!',
  },
  nurturing: {
    label: 'Nurturing',
    color: 'text-amber-600',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
    icon: <Heart className="h-4 w-4" />,
    description: 'Long-term drip. Value, not pitch.',
  },
  stalled: {
    label: 'Stalled',
    color: 'text-orange-600',
    bgColor: 'bg-orange-500/10 border-orange-500/30',
    icon: <PauseCircle className="h-4 w-4" />,
    description: 'Went silent. Needs re-engagement.',
  },
  dormant: {
    label: 'Dormant',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10 border-gray-500/30',
    icon: <Moon className="h-4 w-4" />,
    description: '30+ days inactive. Low priority.',
  },
  callback_set: {
    label: 'Callback Set',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-500/10 border-cyan-500/30',
    icon: <CalendarCheck className="h-4 w-4" />,
    description: 'Explicit callback requested.',
  },
  booked: {
    label: 'Booked',
    color: 'text-green-600',
    bgColor: 'bg-green-500/10 border-green-500/30',
    icon: <Calendar className="h-4 w-4" />,
    description: 'Appointment set. Reduce no-shows.',
  },
  closed_won: {
    label: 'Won',
    color: 'text-green-700',
    bgColor: 'bg-green-600/10 border-green-600/30',
    icon: <CheckCircle2 className="h-4 w-4" />,
    description: 'Converted!',
  },
  closed_lost: {
    label: 'Lost',
    color: 'text-gray-400',
    bgColor: 'bg-gray-400/10 border-gray-400/20',
    icon: <XCircle className="h-4 w-4" />,
    description: 'DNC / Not interested.',
  },
};

const ACTIVE_STAGES = ['fresh', 'attempting', 'engaged', 'hot', 'nurturing', 'stalled', 'callback_set', 'booked'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const LeadJourneyDashboard: React.FC = () => {
  const [stageCounts, setStageCounts] = useState<StageCount[]>([]);
  const [upcomingActions, setUpcomingActions] = useState<JourneyLead[]>([]);
  const [recentEvents, setRecentEvents] = useState<JourneyEvent[]>([]);
  const [journeyEnabled, setJourneyEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [stageLeads, setStageLeads] = useState<JourneyLead[]>([]);
  const { toast } = useToast();

  const loadDashboard = useCallback(async () => {
    try {
      // Load all in parallel
      const [countsRes, actionsRes, eventsRes, settingsRes] = await Promise.all([
        // Stage distribution
        (supabase as any)
          .from('lead_journey_state')
          .select('current_stage')
          .then(({ data }: any) => {
            if (!data) return [];
            const counts: Record<string, number> = {};
            data.forEach((row: any) => {
              counts[row.current_stage] = (counts[row.current_stage] || 0) + 1;
            });
            return Object.entries(counts).map(([current_stage, count]) => ({ current_stage, count }));
          }),

        // Upcoming actions (next 24 hours)
        (supabase as any)
          .from('lead_journey_state')
          .select('*, leads!inner(first_name, last_name, phone_number, status)')
          .not('next_action_scheduled_at', 'is', null)
          .lte('next_action_scheduled_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
          .order('next_action_scheduled_at', { ascending: true })
          .limit(20),

        // Recent events
        (supabase as any)
          .from('journey_event_log')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(30),

        // Journey settings
        (supabase as any)
          .from('autonomous_settings')
          .select('manage_lead_journeys')
          .limit(1)
          .maybeSingle(),
      ]);

      setStageCounts(countsRes as StageCount[]);
      setUpcomingActions((actionsRes.data as JourneyLead[]) || []);
      setRecentEvents((eventsRes.data as JourneyEvent[]) || []);
      setJourneyEnabled((settingsRes.data as any)?.manage_lead_journeys || false);
    } catch (err: any) {
      console.error('Error loading journey dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Load leads when a stage is selected
  useEffect(() => {
    if (!selectedStage) {
      setStageLeads([]);
      return;
    }
    const loadStageLeads = async () => {
      const { data } = await (supabase as any)
        .from('lead_journey_state')
        .select('*, leads!inner(first_name, last_name, phone_number, status)')
        .eq('current_stage', selectedStage)
        .order('engagement_score', { ascending: false, nullsFirst: false })
        .limit(50);
      setStageLeads((data as JourneyLead[]) || []);
    };
    loadStageLeads();
  }, [selectedStage]);

  const toggleJourney = async (enabled: boolean) => {
    const { error } = await (supabase as any)
      .from('autonomous_settings')
      .update({ manage_lead_journeys: enabled })
      .not('user_id', 'is', null); // Updates for current user via RLS

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setJourneyEnabled(enabled);
      toast({
        title: enabled ? 'Journey Engine Activated' : 'Journey Engine Paused',
        description: enabled
          ? 'Every lead will now be actively managed through their journey.'
          : 'Lead journey management paused. No new follow-ups will be queued.',
      });
    }
  };

  const totalLeads = stageCounts.reduce((s, c) => s + c.count, 0);
  const activeLeads = stageCounts
    .filter(c => ACTIVE_STAGES.includes(c.current_stage))
    .reduce((s, c) => s + c.count, 0);
  const hotLeads = stageCounts.find(c => c.current_stage === 'hot')?.count || 0;
  const pendingActions = upcomingActions.filter(a =>
    a.next_action_scheduled_at && new Date(a.next_action_scheduled_at) <= new Date(Date.now() + 60 * 60 * 1000)
  ).length;

  const getSentimentIcon = (health: string) => {
    switch (health) {
      case 'positive': return <TrendingUp className="h-3 w-3 text-green-500" />;
      case 'negative': return <TrendingDown className="h-3 w-3 text-red-500" />;
      case 'neutral': return <Minus className="h-3 w-3 text-gray-400" />;
      default: return null;
    }
  };

  const getActionIcon = (type: string | null) => {
    if (!type) return <Clock className="h-3 w-3" />;
    if (type.includes('call')) return <Phone className="h-3 w-3 text-blue-500" />;
    if (type.includes('sms')) return <MessageSquare className="h-3 w-3 text-green-500" />;
    return <Clock className="h-3 w-3 text-yellow-500" />;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><CardContent className="p-4 h-20 animate-pulse bg-muted/50" /></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header + Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Lead Journey Intelligence</h3>
          <p className="text-sm text-muted-foreground">
            Every lead actively managed through their lifecycle
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Journey Engine</span>
          <Switch checked={journeyEnabled} onCheckedChange={toggleJourney} />
          <Button size="sm" variant="outline" onClick={loadDashboard}>
            <RefreshCw className="h-3 w-3 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{totalLeads}</p>
              <p className="text-xs text-muted-foreground">Total Tracked</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Zap className="h-5 w-5 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{activeLeads}</p>
              <p className="text-xs text-muted-foreground">Active Journeys</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Flame className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{hotLeads}</p>
              <p className="text-xs text-muted-foreground">Hot Leads</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-2">
            <Timer className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-2xl font-bold">{pendingActions}</p>
              <p className="text-xs text-muted-foreground">Actions Next Hour</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stage Funnel */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Journey Stage Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {ACTIVE_STAGES.map(stage => {
              const cfg = STAGE_CONFIG[stage];
              const count = stageCounts.find(c => c.current_stage === stage)?.count || 0;
              const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
              const isSelected = selectedStage === stage;
              return (
                <button
                  key={stage}
                  onClick={() => setSelectedStage(isSelected ? null : stage)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    isSelected ? 'ring-2 ring-primary' : ''
                  } ${cfg.bgColor} hover:opacity-80`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className={cfg.color}>{cfg.icon}</span>
                    <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
                  </div>
                  <p className="text-xl font-bold">{count}</p>
                  <div className="mt-1">
                    <Progress value={pct} className="h-1" />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{pct}%</p>
                </button>
              );
            })}
          </div>
          {/* Closed stages summary */}
          <div className="flex gap-4 mt-3 pt-3 border-t">
            {['closed_won', 'closed_lost', 'dormant'].map(stage => {
              const cfg = STAGE_CONFIG[stage];
              const count = stageCounts.find(c => c.current_stage === stage)?.count || 0;
              return (
                <div key={stage} className="flex items-center gap-1.5 text-xs">
                  <span className={cfg.color}>{cfg.icon}</span>
                  <span className="text-muted-foreground">{cfg.label}: <strong>{count}</strong></span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stage Detail View (when a stage is selected) */}
      {selectedStage && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <span className={STAGE_CONFIG[selectedStage]?.color}>
                  {STAGE_CONFIG[selectedStage]?.icon}
                </span>
                {STAGE_CONFIG[selectedStage]?.label} Leads
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setSelectedStage(null)}>
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
            <CardDescription>{STAGE_CONFIG[selectedStage]?.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {stageLeads.map(lead => (
                  <div key={lead.id} className="flex items-center justify-between p-2 rounded border bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {lead.leads?.first_name || 'Unknown'} {lead.leads?.last_name || ''}
                        </span>
                        <span className="text-xs text-muted-foreground">{lead.leads?.phone_number}</span>
                        {getSentimentIcon(lead.journey_health)}
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                        <span>Score: {lead.engagement_score ?? 'N/A'}</span>
                        <span>Touches: {lead.total_touches}</span>
                        <span>Calls: {lead.total_calls}</span>
                        <span>SMS: {lead.total_sms}</span>
                      </div>
                      {lead.next_recommended_action && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          Next: {lead.next_recommended_action}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      {lead.next_action_scheduled_at && (
                        <div className="flex items-center gap-1 text-xs">
                          {getActionIcon(lead.next_recommended_action)}
                          <span>{formatDistanceToNow(new Date(lead.next_action_scheduled_at), { addSuffix: true })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {stageLeads.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">No leads in this stage</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Upcoming Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Upcoming Follow-ups (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {upcomingActions.map(action => {
                  const stageCfg = STAGE_CONFIG[action.current_stage];
                  const isPast = action.next_action_scheduled_at && new Date(action.next_action_scheduled_at) < new Date();
                  return (
                    <div key={action.id} className={`p-2 rounded border ${isPast ? 'border-yellow-500/50 bg-yellow-500/5' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {getActionIcon(action.next_recommended_action)}
                          <span className="font-medium text-sm">
                            {action.leads?.first_name || 'Unknown'}
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${stageCfg?.bgColor || ''}`}>
                            {stageCfg?.label || action.current_stage}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {action.next_action_scheduled_at
                            ? formatDistanceToNow(new Date(action.next_action_scheduled_at), { addSuffix: true })
                            : 'Pending'}
                        </span>
                      </div>
                      {action.next_recommended_action && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">
                          {action.next_recommended_action}
                        </p>
                      )}
                    </div>
                  );
                })}
                {upcomingActions.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    {journeyEnabled ? 'No actions scheduled. Engine will analyze leads on next run.' : 'Enable journey engine to start managing follow-ups.'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Recent Journey Events */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Journey Event Log</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {recentEvents.map(event => (
                  <div key={event.id} className="p-2 rounded border text-sm">
                    <div className="flex items-center gap-2">
                      {event.event_type === 'stage_change' && (
                        <>
                          <Badge variant="outline" className={STAGE_CONFIG[event.from_stage || '']?.bgColor}>
                            {STAGE_CONFIG[event.from_stage || '']?.label || event.from_stage}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="outline" className={STAGE_CONFIG[event.to_stage || '']?.bgColor}>
                            {STAGE_CONFIG[event.to_stage || '']?.label || event.to_stage}
                          </Badge>
                        </>
                      )}
                      {event.event_type === 'action_queued' && (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-600">
                          {(event.event_data as any)?.action || 'Action queued'}
                        </Badge>
                      )}
                      {event.event_type === 'rule_fired' && (
                        <Badge variant="outline" className="bg-purple-500/10 text-purple-600">
                          {(event.event_data as any)?.rule || 'Rule fired'}
                        </Badge>
                      )}
                      {event.event_type === 'signal_detected' && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                          Signal detected
                        </Badge>
                      )}
                    </div>
                    {(event.event_data as any)?.reason && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">{(event.event_data as any).reason}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
                {recentEvents.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No journey events yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LeadJourneyDashboard;
