import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Bot, Phone, MessageSquare, Clock, CheckCircle, XCircle, 
  ArrowRight, Sparkles, RefreshCw, Activity, TrendingUp,
  Calendar, User, Zap
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow, format } from 'date-fns';

interface AgentDecision {
  id: string;
  decision_type: string;
  reasoning: string;
  action_taken: string;
  executed_at: string;
  success: boolean;
  created_at: string;
  lead_id: string | null;
  lead_name: string | null;
}

interface ScheduledFollowUp {
  id: string;
  action_type: string;
  scheduled_at: string;
  status: string;
  executed_at: string | null;
  created_at: string;
  lead_id: string;
  lead?: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string;
  };
}

interface PipelineBoard {
  id: string;
  name: string;
  position: number;
  settings: any;
  created_at: string;
}

const AgentActivityDashboard = () => {
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [followUps, setFollowUps] = useState<ScheduledFollowUp[]>([]);
  const [autoCreatedStages, setAutoCreatedStages] = useState<PipelineBoard[]>([]);
  const [stats, setStats] = useState({
    totalDecisions: 0,
    todayDecisions: 0,
    pendingFollowUps: 0,
    autoCreatedStages: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, []);

  const loadActivity = async () => {
    setLoading(true);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [decisionsResult, followUpsResult, stagesResult] = await Promise.all([
      supabase
        .from('agent_decisions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('scheduled_follow_ups')
        .select(`
          *,
          lead:leads(first_name, last_name, phone_number)
        `)
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(20),
      supabase
        .from('pipeline_boards')
        .select('*')
        .order('created_at', { ascending: false })
    ]);

    if (decisionsResult.data) {
      setDecisions(decisionsResult.data);
      const todayCount = decisionsResult.data.filter(d => 
        new Date(d.created_at) >= today
      ).length;
      setStats(prev => ({ 
        ...prev, 
        totalDecisions: decisionsResult.data?.length || 0,
        todayDecisions: todayCount
      }));
    }
    
    if (followUpsResult.data) {
      setFollowUps(followUpsResult.data as any);
      setStats(prev => ({ ...prev, pendingFollowUps: followUpsResult.data?.length || 0 }));
    }
    
    if (stagesResult.data) {
      const autoCreated = stagesResult.data.filter(s => 
        s.settings && typeof s.settings === 'object' && (s.settings as any).auto_created
      );
      setAutoCreatedStages(autoCreated);
      setStats(prev => ({ ...prev, autoCreatedStages: autoCreated.length }));
    }
    
    setLoading(false);
  };

  const getDecisionIcon = (type: string) => {
    switch (type) {
      case 'sms_disposition':
        return <MessageSquare className="h-4 w-4 text-green-500" />;
      case 'call_disposition':
        return <Phone className="h-4 w-4 text-blue-500" />;
      case 'create_lead':
        return <User className="h-4 w-4 text-purple-500" />;
      case 'create_pipeline_stage':
        return <ArrowRight className="h-4 w-4 text-orange-500" />;
      case 'create_disposition':
        return <Zap className="h-4 w-4 text-yellow-500" />;
      default:
        return <Bot className="h-4 w-4 text-primary" />;
    }
  };

  const getDecisionTypeLabel = (type: string) => {
    switch (type) {
      case 'sms_disposition': return 'SMS Analysis';
      case 'call_disposition': return 'Call Analysis';
      case 'create_lead': return 'Lead Created';
      case 'create_pipeline_stage': return 'Stage Created';
      case 'create_disposition': return 'Disposition Created';
      default: return type.replace('_', ' ');
    }
  };

  const getActionTypeLabel = (type: string) => {
    switch (type) {
      case 'ai_call': return 'AI Call';
      case 'ai_sms': return 'AI SMS';
      case 'human_call': return 'Human Call';
      case 'email': return 'Email';
      default: return type;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Total Decisions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalDecisions}</div>
            <p className="text-xs text-muted-foreground">All time AI actions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Today's Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.todayDecisions}</div>
            <p className="text-xs text-muted-foreground">Decisions today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingFollowUps}</div>
            <p className="text-xs text-muted-foreground">Scheduled actions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Auto-Created Stages
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{stats.autoCreatedStages}</div>
            <p className="text-xs text-muted-foreground">Pipeline stages</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent Decisions */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Recent AI Decisions
              </CardTitle>
              <CardDescription>Autonomous actions taken by the AI agent</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadActivity}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {decisions.map((decision) => (
                  <div 
                    key={decision.id} 
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="mt-0.5">
                      {decision.success ? (
                        <div className="p-1.5 rounded-full bg-green-100 dark:bg-green-900">
                          {getDecisionIcon(decision.decision_type)}
                        </div>
                      ) : (
                        <div className="p-1.5 rounded-full bg-red-100 dark:bg-red-900">
                          <XCircle className="h-4 w-4 text-red-500" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {getDecisionTypeLabel(decision.decision_type)}
                        </span>
                        {decision.lead_name && (
                          <Badge variant="outline" className="text-xs">
                            {decision.lead_name}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {decision.reasoning}
                      </p>
                      {decision.action_taken && (
                        <p className="text-xs text-primary mt-1">
                          → {decision.action_taken}
                        </p>
                      )}
                      <span className="text-xs text-muted-foreground mt-1 block">
                        {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
                {decisions.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No AI decisions yet</p>
                    <p className="text-sm">The agent will log decisions here when processing calls and SMS</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Pending Follow-ups */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Upcoming Follow-ups
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {followUps.slice(0, 5).map((followUp) => (
                  <div key={followUp.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      {followUp.action_type === 'ai_call' ? (
                        <Phone className="h-4 w-4 text-blue-500" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-green-500" />
                      )}
                      <div>
                        <span className="text-sm font-medium">
                          {getActionTypeLabel(followUp.action_type)}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {followUp.lead?.first_name || followUp.lead?.phone_number || 'Unknown'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className="text-xs">
                        {new Date(followUp.scheduled_at) > new Date() 
                          ? formatDistanceToNow(new Date(followUp.scheduled_at))
                          : 'Due now'
                        }
                      </Badge>
                    </div>
                  </div>
                ))}
                {followUps.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No pending follow-ups
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Auto-Created Stages */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Auto-Created Pipeline Stages
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {autoCreatedStages.slice(0, 6).map((stage) => (
                  <div key={stage.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <ArrowRight className="h-4 w-4 text-orange-500" />
                      <span className="text-sm font-medium">{stage.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(stage.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
                {autoCreatedStages.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No auto-created stages yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AgentActivityDashboard;
