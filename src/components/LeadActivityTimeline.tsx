import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Phone, MessageSquare, Clock, CheckCircle, XCircle, ArrowRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

interface LeadActivityTimelineProps {
  leadId: string;
}

interface AgentDecision {
  id: string;
  decision_type: string;
  reasoning: string;
  action_taken: string;
  executed_at: string;
  success: boolean;
  created_at: string;
}

interface ScheduledFollowUp {
  id: string;
  action_type: string;
  scheduled_at: string;
  status: string;
  executed_at: string | null;
  created_at: string;
}

interface PipelinePosition {
  id: string;
  moved_at: string;
  notes: string;
  moved_by_user: boolean;
  pipeline_board: {
    name: string;
  } | null;
}

const LeadActivityTimeline = ({ leadId }: LeadActivityTimelineProps) => {
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [followUps, setFollowUps] = useState<ScheduledFollowUp[]>([]);
  const [pipelineHistory, setPipelineHistory] = useState<PipelinePosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, [leadId]);

  const loadActivity = async () => {
    setLoading(true);
    
    const [decisionsResult, followUpsResult, pipelineResult] = await Promise.all([
      supabase
        .from('agent_decisions')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('scheduled_follow_ups')
        .select('*')
        .eq('lead_id', leadId)
        .order('scheduled_at', { ascending: false })
        .limit(10),
      supabase
        .from('lead_pipeline_positions')
        .select(`
          *,
          pipeline_board:pipeline_boards(name)
        `)
        .eq('lead_id', leadId)
        .order('moved_at', { ascending: false })
        .limit(5)
    ]);

    if (decisionsResult.data) setDecisions(decisionsResult.data);
    if (followUpsResult.data) setFollowUps(followUpsResult.data);
    if (pipelineResult.data) setPipelineHistory(pipelineResult.data as any);
    
    setLoading(false);
  };

  const getDecisionIcon = (type: string) => {
    switch (type) {
      case 'sms_disposition':
        return <MessageSquare className="h-4 w-4" />;
      case 'call_disposition':
        return <Phone className="h-4 w-4" />;
      case 'create_lead':
        return <Sparkles className="h-4 w-4" />;
      case 'create_pipeline_stage':
        return <ArrowRight className="h-4 w-4" />;
      default:
        return <Bot className="h-4 w-4" />;
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'failed':
        return <Badge variant="outline" className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
      </div>
    );
  }

  const hasActivity = decisions.length > 0 || followUps.length > 0 || pipelineHistory.length > 0;

  if (!hasActivity) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No AI activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Scheduled Follow-ups */}
      {followUps.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Scheduled Follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-2">
              {followUps.map((followUp) => (
                <div key={followUp.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {followUp.action_type === 'ai_call' ? (
                      <Phone className="h-4 w-4 text-blue-500" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-green-500" />
                    )}
                    <div>
                      <span className="font-medium text-sm">{getActionTypeLabel(followUp.action_type)}</span>
                      <p className="text-xs text-muted-foreground">
                        {new Date(followUp.scheduled_at) > new Date() 
                          ? `In ${formatDistanceToNow(new Date(followUp.scheduled_at))}`
                          : formatDistanceToNow(new Date(followUp.scheduled_at), { addSuffix: true })
                        }
                      </p>
                    </div>
                  </div>
                  {getStatusBadge(followUp.status)}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pipeline History */}
      {pipelineHistory.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ArrowRight className="h-4 w-4" />
              Pipeline Moves
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <div className="space-y-2">
              {pipelineHistory.map((position) => (
                <div key={position.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {position.moved_by_user ? (
                      <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">Manual</span>
                    ) : (
                      <Bot className="h-4 w-4 text-purple-500" />
                    )}
                    <div>
                      <span className="font-medium text-sm">
                        {position.pipeline_board?.name || 'Unknown Stage'}
                      </span>
                      {position.notes && (
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {position.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(position.moved_at), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Agent Decisions */}
      {decisions.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4" />
              AI Decisions
            </CardTitle>
          </CardHeader>
          <CardContent className="py-2">
            <ScrollArea className="max-h-[200px]">
              <div className="space-y-2">
                {decisions.map((decision) => (
                  <div key={decision.id} className="p-2 bg-muted/50 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {decision.success ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {getDecisionIcon(decision.decision_type)}
                          <span className="font-medium text-sm">
                            {decision.decision_type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {decision.reasoning}
                        </p>
                        {decision.action_taken && (
                          <p className="text-xs text-primary mt-1">
                            → {decision.action_taken}
                          </p>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LeadActivityTimeline;
