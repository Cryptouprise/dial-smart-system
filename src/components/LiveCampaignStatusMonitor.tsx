import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Phone, MessageSquare, Clock, AlertTriangle, CheckCircle, 
  XCircle, RefreshCw, Play, Pause, Eye, ChevronRight,
  Bot, Loader2, ArrowRight, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WorkflowProgress {
  id: string;
  lead_id: string;
  workflow_id: string;
  campaign_id: string;
  status: string;
  current_step_id: string;
  next_action_at: string;
  last_action_at: string;
  started_at: string;
  lead?: {
    first_name: string;
    last_name: string;
    phone_number: string;
  };
  workflow_step?: {
    step_type: string;
    step_number: number;
    step_config: any;
  };
}

interface ExecutionLog {
  id: string;
  type: 'sms' | 'call' | 'workflow' | 'error';
  message: string;
  status: 'success' | 'failed' | 'pending';
  timestamp: string;
  details?: any;
  isStuck?: boolean;
}

interface LiveCampaignStatusMonitorProps {
  campaignId: string;
}

export function LiveCampaignStatusMonitor({ campaignId }: LiveCampaignStatusMonitorProps) {
  const [campaign, setCampaign] = useState<any>(null);
  const [workflowProgress, setWorkflowProgress] = useState<WorkflowProgress[]>([]);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearingStuck, setClearingStuck] = useState(false);

  const loadCampaignStatus = async () => {
    try {
      // Get campaign details
      const { data: campaignData } = await supabase
        .from('campaigns')
        .select(`
          *,
          campaign_workflows(id, name)
        `)
        .eq('id', campaignId)
        .maybeSingle();

      setCampaign(campaignData);

      // Get workflow progress for all leads in this campaign
      const { data: progressData } = await supabase
        .from('lead_workflow_progress')
        .select(`
          *,
          leads(first_name, last_name, phone_number),
          workflow_steps!lead_workflow_progress_current_step_id_fkey(step_type, step_number, step_config)
        `)
        .eq('campaign_id', campaignId)
        .order('updated_at', { ascending: false });

      setWorkflowProgress(progressData?.map((p: any) => ({
        ...p,
        lead: p.leads,
        workflow_step: p.workflow_steps
      })) || []);

      // Build execution logs from recent activity
      const logs: ExecutionLog[] = [];

      // Get recent SMS for this campaign's leads
      const leadIds = progressData?.map((p: any) => p.lead_id) || [];
      if (leadIds.length > 0) {
        const { data: smsData } = await supabase
          .from('sms_messages')
          .select('*')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false })
          .limit(20);

        smsData?.forEach((sms: any) => {
          logs.push({
            id: sms.id,
            type: 'sms',
            message: `SMS ${sms.direction === 'outbound' ? 'sent to' : 'received from'} ${sms.to_number || sms.from_number}`,
            status: sms.status === 'sent' || sms.status === 'delivered' ? 'success' : sms.status === 'failed' ? 'failed' : 'pending',
            timestamp: sms.created_at,
            details: { body: sms.body?.substring(0, 100) }
          });
        });

        // Get recent calls for this campaign
        const { data: callData } = await supabase
          .from('call_logs')
          .select('*')
          .eq('campaign_id', campaignId)
          .order('created_at', { ascending: false })
          .limit(20);

        callData?.forEach((call: any) => {
          const isFailed = call.status === 'failed' || !call.retell_call_id;
          const isPending = ['queued', 'ringing', 'initiated', 'in_progress'].includes(call.status);
          const age = Date.now() - new Date(call.created_at).getTime();
          const isStuck = isPending && age > 2 * 60 * 1000; // More than 2 minutes old
          
          logs.push({
            id: call.id,
            type: 'call',
            message: `Call to ${call.phone_number} - ${call.status}${!call.retell_call_id ? ' (Retell API failed)' : ''}${isStuck ? ' (STUCK)' : ''}`,
            status: isFailed ? 'failed' : call.status === 'completed' ? 'success' : 'pending',
            timestamp: call.created_at,
            isStuck,
            details: { 
              outcome: call.outcome, 
              duration: call.duration_seconds,
              retell_call_id: call.retell_call_id,
              error: !call.retell_call_id ? 'Retell API call failed - check agent/phone config' : null,
              callLogId: call.id
            }
          });
        });
      }

      // Sort logs by timestamp
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setExecutionLogs(logs);

    } catch (error) {
      console.error('Error loading campaign status:', error);
      toast.error('Failed to load campaign status');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadCampaignStatus();
    
    // Set up realtime subscription
    const channel = supabase
      .channel('campaign-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_workflow_progress' }, () => {
        loadCampaignStatus();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'call_logs' }, () => {
        loadCampaignStatus();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sms_messages' }, () => {
        loadCampaignStatus();
      })
      .subscribe();

    // Poll every 10 seconds for updates
    const interval = setInterval(loadCampaignStatus, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [campaignId]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadCampaignStatus();
  };

  const handleClearStuckCalls = async () => {
    setClearingStuck(true);
    try {
      const response = await supabase.functions.invoke('call-dispatcher', {
        body: { action: 'cleanup_stuck_calls' }
      });
      
      if (response.error) throw response.error;
      
      toast.success(`Cleaned ${response.data?.cleaned || 0} stuck calls`);
      await loadCampaignStatus();
    } catch (error) {
      console.error('Error clearing stuck calls:', error);
      toast.error('Failed to clear stuck calls');
    } finally {
      setClearingStuck(false);
    }
  };

  const getStepIcon = (stepType: string) => {
    switch (stepType) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'ai_sms': return <Bot className="h-4 w-4" />;
      case 'wait': return <Clock className="h-4 w-4" />;
      default: return <ArrowRight className="h-4 w-4" />;
    }
  };

  // Format wait step config into human-readable string
  const formatWaitStepDetails = (stepConfig: any) => {
    if (!stepConfig) return '';
    
    const parts: string[] = [];
    
    if (stepConfig.delay_days && stepConfig.delay_days > 0) {
      parts.push(`${stepConfig.delay_days} day${stepConfig.delay_days > 1 ? 's' : ''}`);
    }
    if (stepConfig.delay_hours && stepConfig.delay_hours > 0) {
      parts.push(`${stepConfig.delay_hours} hour${stepConfig.delay_hours > 1 ? 's' : ''}`);
    }
    if (stepConfig.delay_minutes && stepConfig.delay_minutes > 0) {
      parts.push(`${stepConfig.delay_minutes} min${stepConfig.delay_minutes > 1 ? 's' : ''}`);
    }
    
    if (parts.length === 0) {
      // Check for other formats
      if (stepConfig.wait_until) {
        return `until ${stepConfig.wait_until}`;
      }
      if (stepConfig.delay) {
        return `${stepConfig.delay}`;
      }
      return 'configured delay';
    }
    
    return parts.join(', ');
  };

  // Format step info with type-specific details
  const formatStepInfo = (step: any) => {
    if (!step) return 'Unknown step';
    
    const stepType = step.step_type;
    const stepNumber = step.step_number;
    const config = step.step_config;
    
    switch (stepType) {
      case 'wait':
        const waitDetails = formatWaitStepDetails(config);
        return `Step ${stepNumber}: Wait (${waitDetails})`;
      case 'call':
        return `Step ${stepNumber}: Call`;
      case 'sms':
        const smsPreview = config?.message?.substring(0, 30);
        return `Step ${stepNumber}: SMS${smsPreview ? ` - "${smsPreview}..."` : ''}`;
      case 'ai_sms':
        return `Step ${stepNumber}: AI SMS`;
      default:
        return `Step ${stepNumber}: ${stepType}`;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
      case 'paused':
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Paused</Badge>;
      case 'completed':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Completed</Badge>;
      case 'removed':
        return <Badge className="bg-muted text-muted-foreground">Removed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getLogIcon = (log: ExecutionLog) => {
    if (log.status === 'failed') return <XCircle className="h-4 w-4 text-destructive" />;
    if (log.status === 'pending') return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
    if (log.type === 'call') return <Phone className="h-4 w-4 text-green-500" />;
    if (log.type === 'sms') return <MessageSquare className="h-4 w-4 text-blue-500" />;
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  const formatTimeUntil = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    
    if (diff < 0) return 'Now';
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeCount = workflowProgress.filter(p => p.status === 'active').length;
  const failedLogs = executionLogs.filter(l => l.status === 'failed').length;
  const stuckCalls = executionLogs.filter(l => l.isStuck).length;

  return (
    <div className="space-y-4">
      {/* Campaign Status Header */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CardTitle className="text-lg">{campaign?.name || 'Campaign'}</CardTitle>
              {campaign?.status === 'active' ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 animate-pulse">
                  <span className="mr-1">●</span> Running
                </Badge>
              ) : (
                <Badge variant="outline">{campaign?.status}</Badge>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <div className="text-2xl font-bold text-foreground">{workflowProgress.length}</div>
              <div className="text-muted-foreground">Total Leads</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-green-500/10">
              <div className="text-2xl font-bold text-green-500">{activeCount}</div>
              <div className="text-muted-foreground">Active</div>
            </div>
            <div className="text-center p-3 rounded-lg bg-destructive/10">
              <div className="text-2xl font-bold text-destructive">{failedLogs}</div>
              <div className="text-muted-foreground">Errors</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stuck Calls Alert */}
      {stuckCalls > 0 && (
        <Alert className="border-yellow-500/50 bg-yellow-500/5">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-yellow-600">
              {stuckCalls} call(s) stuck in ringing/initiated state for over 2 minutes
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleClearStuckCalls}
              disabled={clearingStuck}
              className="ml-4"
            >
              <Trash2 className={`h-4 w-4 mr-1 ${clearingStuck ? 'animate-spin' : ''}`} />
              {clearingStuck ? 'Clearing...' : 'Clear Stuck'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Failed Operations Alert */}
      {failedLogs > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <p className="font-medium text-destructive">{failedLogs} operation(s) failed</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Check the execution log below for details. Common issues: Missing Retell agent, phone number not configured for outbound.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lead Workflow Progress */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Lead Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[200px]">
            <div className="space-y-3">
              {workflowProgress.map((progress) => (
                <div 
                  key={progress.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                      {getStepIcon(progress.workflow_step?.step_type || 'wait')}
                    </div>
                    <div>
                      <p className="font-medium text-sm">
                        {progress.lead?.first_name} {progress.lead?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {progress.lead?.phone_number}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(progress.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatStepInfo(progress.workflow_step)}
                    </p>
                    {progress.next_action_at && progress.status === 'active' && (
                      <p className="text-xs text-yellow-500 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Next action in: {formatTimeUntil(progress.next_action_at)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              {workflowProgress.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No leads in workflow yet</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Execution Log */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Execution Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {executionLogs.map((log) => (
                <div 
                  key={log.id} 
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    log.status === 'failed' 
                      ? 'bg-destructive/5 border-destructive/30' 
                      : 'bg-muted/30 border-border/50'
                  }`}
                >
                  <div className="mt-0.5">{getLogIcon(log)}</div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${log.status === 'failed' ? 'text-destructive' : ''}`}>
                      {log.message}
                    </p>
                    {log.details?.body && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        "{log.details.body}..."
                      </p>
                    )}
                    {log.details?.error && (
                      <p className="text-xs text-destructive mt-1">
                        ⚠️ {log.details.error}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
              {executionLogs.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No activity yet</p>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
