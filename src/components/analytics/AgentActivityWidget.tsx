import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Bot, MessageSquare, Phone, ArrowRight, Clock, AlertCircle, 
  ChevronDown, ChevronUp, CheckCircle, Loader2, X, Wrench 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { formatDistanceToNow } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface RecentActivity {
  id: string;
  type: 'decision' | 'followup' | 'error';
  decision_type?: string;
  action_type?: string;
  description: string;
  created_at: string;
  success?: boolean;
  reasoning?: string;
  outcome?: string;
}

interface ErrorDetails {
  error_id?: string;
  stack?: string;
  context?: Record<string, unknown>;
}

const AgentActivityWidget = () => {
  const [activities, setActivities] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<RecentActivity | null>(null);
  const [fixingErrors, setFixingErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecentActivity();
    const interval = setInterval(loadRecentActivity, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadRecentActivity = async () => {
    const [decisionsResult, followUpsResult] = await Promise.all([
      supabase
        .from('agent_decisions')
        .select('id, decision_type, action_taken, created_at, success, reasoning, outcome')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('scheduled_follow_ups')
        .select('id, action_type, scheduled_at, status, created_at')
        .eq('status', 'pending')
        .order('scheduled_at', { ascending: true })
        .limit(3)
    ]);

    const combined: RecentActivity[] = [];

    if (decisionsResult.data) {
      decisionsResult.data.forEach(d => {
        const isError = d.decision_type === 'error_captured';
        combined.push({
          id: d.id,
          type: isError ? 'error' : 'decision',
          decision_type: d.decision_type,
          description: isError ? extractErrorMessage(d.reasoning) : (d.action_taken || d.decision_type),
          created_at: d.created_at,
          success: d.success,
          reasoning: d.reasoning,
          outcome: d.outcome
        });
      });
    }

    if (followUpsResult.data) {
      followUpsResult.data.forEach(f => {
        combined.push({
          id: f.id,
          type: 'followup',
          action_type: f.action_type,
          description: `${f.action_type === 'ai_call' ? 'Call' : 'SMS'} scheduled`,
          created_at: f.scheduled_at
        });
      });
    }

    // Sort by date
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setActivities(combined.slice(0, 8));
    setLoading(false);
  };

  const extractErrorMessage = (reasoning?: string): string => {
    if (!reasoning) return 'Unknown error';
    // Extract the actual error message from "Captured runtime error: ..."
    const match = reasoning.match(/Captured runtime error:\s*(.+)/);
    if (match) {
      const msg = match[1].trim();
      // Truncate if too long
      return msg.length > 80 ? msg.substring(0, 77) + '...' : msg;
    }
    return reasoning.length > 80 ? reasoning.substring(0, 77) + '...' : reasoning;
  };

  const parseOutcome = (outcome?: string): ErrorDetails | null => {
    if (!outcome) return null;
    try {
      return JSON.parse(outcome);
    } catch {
      return null;
    }
  };

  const handleFixError = async (activity: RecentActivity) => {
    setFixingErrors(prev => new Set(prev).add(activity.id));
    
    // Show immediate feedback that we're working on it
    toast({
      title: "Auto Fix Started",
      description: "AI is analyzing the error and attempting a fix...",
    });

    try {
      // First, analyze the error
      const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke('ai-error-analyzer', {
        body: {
          action: 'analyze',
          error: {
            type: activity.decision_type === 'error_captured' ? 'runtime' : 'unknown',
            message: activity.reasoning?.replace('Captured runtime error: ', '') || 'Unknown error',
            stack: parseOutcome(activity.outcome)?.stack,
            context: parseOutcome(activity.outcome)?.context
          }
        }
      });

      if (analyzeError) throw analyzeError;

      // Then attempt to execute the fix
      const { data: fixData, error: fixError } = await supabase.functions.invoke('ai-error-analyzer', {
        body: {
          action: 'execute',
          error: {
            type: activity.decision_type === 'error_captured' ? 'runtime' : 'unknown',
            message: activity.reasoning?.replace('Captured runtime error: ', '') || 'Unknown error',
            stack: parseOutcome(activity.outcome)?.stack,
            context: parseOutcome(activity.outcome)?.context
          },
          suggestion: analyzeData?.suggestion
        }
      });

      if (fixError) throw fixError;

      // Show clear feedback about what happened
      if (fixData?.success) {
        toast({
          title: "Auto Fix Applied",
          description: fixData.message || "AI applied an automatic fix. Try the action again to confirm it's resolved.",
          variant: "default",
        });
      } else {
        const manualMessage =
          fixData?.action === 'manual_fix_suggested'
            ? "AI couldn't safely change anything automatically. No changes were made; please follow the suggested steps to fix this manually."
            : "AI couldn't complete an automatic fix. No changes were made; please review the error details and fix manually.";

        toast({
          title: "Manual Fix Required",
          description: manualMessage,
          variant: "destructive",
        });
      }

      // Refresh the activity list to show updated status
      await loadRecentActivity();
      
    } catch (error) {
      console.error('Auto fix failed:', error);
      toast({
        title: "Auto Fix Failed",
        description: error instanceof Error ? error.message : "Could not complete the auto-fix. Please try manually.",
        variant: "destructive",
      });
    } finally {
      setFixingErrors(prev => {
        const next = new Set(prev);
        next.delete(activity.id);
        return next;
      });
    }
  };

  const getIcon = (activity: RecentActivity) => {
    if (activity.type === 'error') {
      return <AlertCircle className="h-3 w-3 text-red-500" />;
    }
    if (activity.type === 'followup') {
      return activity.action_type === 'ai_call' 
        ? <Phone className="h-3 w-3 text-blue-500" />
        : <MessageSquare className="h-3 w-3 text-green-500" />;
    }
    
    switch (activity.decision_type) {
      case 'sms_disposition':
        return <MessageSquare className="h-3 w-3 text-green-500" />;
      case 'call_disposition':
        return <Phone className="h-3 w-3 text-blue-500" />;
      case 'create_pipeline_stage':
        return <ArrowRight className="h-3 w-3 text-orange-500" />;
      default:
        return <Bot className="h-3 w-3 text-purple-500" />;
    }
  };

  const errorCount = activities.filter(a => a.type === 'error').length;

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-card/80 backdrop-blur-sm border-border">
        <CardHeader className="pb-2 px-3 pt-3">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Bot className="h-4 w-4 text-purple-500" />
            AI Agent Activity
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                {errorCount} errors
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-3 pb-3">
          {activities.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">No recent activity</p>
          ) : (
            <div className="space-y-1.5">
              {activities.map((activity) => (
                <div key={activity.id}>
                  <div 
                    className={`flex items-center gap-2 text-xs p-1.5 rounded transition-colors ${
                      activity.type === 'error' 
                        ? 'bg-red-500/10 hover:bg-red-500/20 cursor-pointer' 
                        : 'bg-muted/50 hover:bg-muted/70'
                    }`}
                    onClick={() => {
                      if (activity.type === 'error') {
                        setExpandedError(expandedError === activity.id ? null : activity.id);
                      }
                    }}
                  >
                    {getIcon(activity)}
                    <span className={`flex-1 truncate ${
                      activity.type === 'error' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                    }`}>
                      {activity.description}
                    </span>
                    {activity.type === 'followup' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        <Clock className="h-2 w-2 mr-0.5" />
                        Soon
                      </Badge>
                    )}
                    {activity.type === 'error' && (
                      <>
                        {fixingErrors.has(activity.id) ? (
                          <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                        ) : (
                          expandedError === activity.id ? (
                            <ChevronUp className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          )
                        )}
                      </>
                    )}
                    <span className="text-muted-foreground text-[10px] whitespace-nowrap">
                      {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  
                  {/* Expanded Error Details */}
                  {activity.type === 'error' && expandedError === activity.id && (
                    <div className="mt-1 p-2 bg-red-500/5 rounded border border-red-500/20 text-xs space-y-2">
                      <div>
                        <span className="font-medium text-red-600 dark:text-red-400">Error:</span>
                        <p className="text-muted-foreground mt-0.5">
                          {activity.reasoning?.replace('Captured runtime error: ', '') || 'Unknown error'}
                        </p>
                      </div>
                      
                      {fixingErrors.has(activity.id) ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>Analyzing and fixing...</span>
                          </div>
                          <Progress value={60} className="h-1" />
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-6 text-[10px] px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedError(activity);
                            }}
                          >
                            View Details
                          </Button>
                          <Button 
                            size="sm" 
                            className="h-6 text-[10px] px-2 bg-blue-600 hover:bg-blue-700"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleFixError(activity);
                            }}
                          >
                            <Bot className="h-3 w-3 mr-1" />
                            Auto Fix
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Error Details Dialog */}
      <Dialog open={!!selectedError} onOpenChange={() => setSelectedError(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-5 w-5" />
              Error Details
            </DialogTitle>
          </DialogHeader>
          {selectedError && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-1">Error Message</h4>
                <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                  {selectedError.reasoning?.replace('Captured runtime error: ', '') || 'Unknown error'}
                </p>
              </div>
              
              {selectedError.outcome && (
                <>
                  {parseOutcome(selectedError.outcome)?.stack && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Stack Trace</h4>
                      <ScrollArea className="h-32">
                        <pre className="text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
                          {parseOutcome(selectedError.outcome)?.stack}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                  
                  {parseOutcome(selectedError.outcome)?.context && (
                    <div>
                      <h4 className="text-sm font-medium mb-1">Context</h4>
                      <pre className="text-xs text-muted-foreground bg-muted p-2 rounded overflow-x-auto">
                        {JSON.stringify(parseOutcome(selectedError.outcome)?.context, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}

              <div>
                <h4 className="text-sm font-medium mb-1">Status</h4>
                <div className="flex items-center gap-2">
                  <Badge variant={selectedError.success ? "default" : "secondary"}>
                    {selectedError.success ? (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Fixed
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Logged for Analysis
                      </>
                    )}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(selectedError.created_at), { addSuffix: true })}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button 
                  className="flex-1" 
                  onClick={() => {
                    handleFixError(selectedError);
                    setSelectedError(null);
                  }}
                >
                  <Bot className="h-4 w-4 mr-2" />
                  Attempt Auto Fix
                </Button>
                <Button variant="outline" onClick={() => setSelectedError(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AgentActivityWidget;
