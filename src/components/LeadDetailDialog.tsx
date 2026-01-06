import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import LeadActivityTimeline from './LeadActivityTimeline';
import { PromptTemplateGuide } from '@/components/PromptTemplateGuide';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { LeadScoreIndicator } from '@/components/LeadScoreIndicator';
import { 
  User, 
  Phone, 
  Mail, 
  Building, 
  Calendar, 
  Clock, 
  MessageSquare, 
  Activity,
  Bot,
  CheckCircle2,
  XCircle,
  ArrowRight,
  FileText,
  Tag,
  Star,
  RotateCcw,
  Ban,
  MapPin,
  Workflow,
  AlertTriangle,
  Variable
} from 'lucide-react';

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string;
  email: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  status: string;
  notes: string | null;
  tags: string[] | null;
  timezone: string | null;
  lead_source: string | null;
  created_at: string;
  updated_at: string;
  last_contacted_at: string | null;
  next_callback_at: string | null;
  do_not_call: boolean | null;
  priority: number | null;
}

interface ActivityItem {
  id: string;
  type: 'call' | 'sms' | 'decision' | 'pipeline' | 'follow_up';
  title: string;
  description: string;
  timestamp: string;
  status?: string;
  metadata?: any;
}

interface WorkflowStatus {
  status: string;
  removal_reason?: string;
  workflow_name?: string;
}

interface CallWithDisposition {
  id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  duration_seconds: number | null;
}

interface LeadDetailDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated?: () => void;
  initialTab?: 'details' | 'activity' | 'calls' | 'messages' | 'ai' | 'prompts';
}

export const LeadDetailDialog: React.FC<LeadDetailDialogProps> = ({
  lead,
  open,
  onOpenChange,
  onLeadUpdated,
  initialTab = 'details'
}) => {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [editedLead, setEditedLead] = useState<Partial<Lead>>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [currentDisposition, setCurrentDisposition] = useState<string | null>(null);
  const [lastCallWithDisposition, setLastCallWithDisposition] = useState<CallWithDisposition | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingHistory, setIsResettingHistory] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (lead && open) {
      loadLeadActivity(lead.id);
      setActiveTab(initialTab);
    }
  }, [lead, open, initialTab]);

  const loadLeadActivity = async (leadId: string) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch FRESH lead data, all activity, and workflow status in parallel
      const [freshLeadRes, callLogsRes, smsRes, decisionsRes, pipelineRes, followUpsRes, workflowRes] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .maybeSingle(),
        supabase
          .from('call_logs')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('sms_messages')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('agent_decisions')
          .select('*')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('lead_pipeline_positions')
          .select('*, pipeline_boards(name, description)')
          .eq('lead_id', leadId)
          .order('moved_at', { ascending: false })
          .limit(20),
        supabase
          .from('scheduled_follow_ups')
          .select('*')
          .eq('lead_id', leadId)
          .order('scheduled_at', { ascending: false })
          .limit(20),
        supabase
          .from('lead_workflow_progress')
          .select('status, removal_reason, campaign_workflows(name)')
          .eq('lead_id', leadId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      // Update lead with fresh data
      if (freshLeadRes.data) {
        setEditedLead(freshLeadRes.data);
      }

      // Set workflow status
      if (workflowRes.data) {
        setWorkflowStatus({
          status: workflowRes.data.status,
          removal_reason: workflowRes.data.removal_reason,
          workflow_name: (workflowRes.data.campaign_workflows as any)?.name
        });
      } else {
        setWorkflowStatus(null);
      }

      setCallLogs(callLogsRes.data || []);
      setSmsMessages(smsRes.data || []);
      
      // Get the most recent disposition from call logs - store full call record
      const recentCallWithOutcome = (callLogsRes.data || []).find((call: any) => call.outcome);
      if (recentCallWithOutcome?.outcome) {
        setCurrentDisposition(recentCallWithOutcome.outcome);
        setLastCallWithDisposition({
          id: recentCallWithOutcome.id,
          outcome: recentCallWithOutcome.outcome,
          notes: recentCallWithOutcome.notes,
          created_at: recentCallWithOutcome.created_at,
          duration_seconds: recentCallWithOutcome.duration_seconds
        });
      } else {
        setCurrentDisposition(null);
        setLastCallWithDisposition(null);
      }

      // Combine all activities into a single timeline
      const allActivities: ActivityItem[] = [];

      // Add call logs with notes inline
      (callLogsRes.data || []).forEach(call => {
        allActivities.push({
          id: `call-${call.id}`,
          type: 'call',
          title: `Call ${call.status}`,
          description: call.outcome || `Duration: ${call.duration_seconds || 0}s`,
          timestamp: call.created_at,
          status: call.status,
          metadata: { ...call, callNotes: call.notes }
        });
      });

      // Add SMS messages
      (smsRes.data || []).forEach(sms => {
        allActivities.push({
          id: `sms-${sms.id}`,
          type: 'sms',
          title: sms.direction === 'outbound' ? 'SMS Sent' : 'SMS Received',
          description: sms.body?.substring(0, 100) + (sms.body?.length > 100 ? '...' : ''),
          timestamp: sms.created_at,
          status: sms.status,
          metadata: sms
        });
      });

      // Add AI decisions
      (decisionsRes.data || []).forEach(decision => {
        allActivities.push({
          id: `decision-${decision.id}`,
          type: 'decision',
          title: `AI: ${decision.decision_type}`,
          description: decision.reasoning || decision.action_taken || 'No details',
          timestamp: decision.created_at,
          status: decision.success ? 'success' : 'pending',
          metadata: decision
        });
      });

      // Add pipeline moves
      (pipelineRes.data || []).forEach(pos => {
        allActivities.push({
          id: `pipeline-${pos.id}`,
          type: 'pipeline',
          title: `Moved to ${pos.pipeline_boards?.name || 'pipeline'}`,
          description: pos.notes || (pos.moved_by_user ? 'Moved manually' : 'Moved by AI'),
          timestamp: pos.moved_at || pos.created_at,
          metadata: pos
        });
      });

      // Add scheduled follow-ups
      (followUpsRes.data || []).forEach(followUp => {
        allActivities.push({
          id: `followup-${followUp.id}`,
          type: 'follow_up',
          title: `Follow-up: ${followUp.action_type}`,
          description: `Scheduled for ${format(new Date(followUp.scheduled_at), 'PPp')}`,
          timestamp: followUp.created_at,
          status: followUp.status,
          metadata: followUp
        });
      });

      // Sort by timestamp descending
      allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setActivities(allActivities);

    } catch (error) {
      console.error('Error loading lead activity:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-save function for individual fields
  const handleAutoSave = async (field: string, value: any) => {
    if (!lead) return;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('leads')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('id', lead.id);

      if (error) throw error;
      
      setEditedLead(prev => ({ ...prev, [field]: value }));
      onLeadUpdated?.();
    } catch (error) {
      console.error('Error auto-saving:', error);
      toast({
        title: "Save Failed",
        description: `Failed to save ${field}`,
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDialingHistory = async () => {
    if (!lead) return;
    setIsResettingHistory(true);

    try {
      const { error: progressError } = await supabase
        .from('lead_workflow_progress')
        .delete()
        .eq('lead_id', lead.id);

      if (progressError) throw progressError;

      const { error: queueError } = await supabase
        .from('dialing_queues')
        .delete()
        .eq('lead_id', lead.id);

      if (queueError) throw queueError;

      toast({
        title: "Dialing History Cleared",
        description: "This phone number can now be enrolled in campaigns again.",
      });

      setWorkflowStatus(null);
      onLeadUpdated?.();
    } catch (error) {
      console.error('Error clearing dialing history:', error);
      toast({
        title: "Error",
        description: "Failed to clear dialing history",
        variant: "destructive"
      });
    } finally {
      setIsResettingHistory(false);
    }
  };

  const getDispositionColor = (disposition: string): string => {
    const colors: Record<string, string> = {
      'appointment_set': '#22c55e',
      'appointment_booked': '#22c55e',
      'interested': '#3b82f6',
      'qualified': '#22c55e',
      'converted': '#16a34a',
      'callback_requested': '#f59e0b',
      'callback': '#f59e0b',
      'contacted': '#6b7280',
      'follow_up': '#f59e0b',
      'not_interested': '#ef4444',
      'dnc': '#991b1b',
      'do_not_call': '#991b1b',
      'wrong_number': '#dc2626',
      'voicemail': '#8b5cf6',
      'no_answer': '#6b7280',
      'busy': '#6b7280',
      'completed': '#22c55e',
    };
    return colors[disposition] || '#6b7280';
  };

  const formatDispositionName = (disposition: string): string => {
    return disposition
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'decision': return <Bot className="h-4 w-4" />;
      case 'pipeline': return <ArrowRight className="h-4 w-4" />;
      case 'follow_up': return <Clock className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) return null;
    
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      completed: 'default',
      success: 'default',
      pending: 'secondary',
      failed: 'destructive',
      cancelled: 'destructive'
    };
    
    return (
      <Badge variant={variants[status] || 'outline'} className="text-xs">
        {status}
      </Badge>
    );
  };

  const getWorkflowStatusBadge = () => {
    if (!workflowStatus) return null;
    
    const { status, removal_reason } = workflowStatus;
    
    if (status === 'active') {
      return (
        <Badge variant="default" className="text-xs">
          <Workflow className="h-3 w-3 mr-1" />
          In Workflow
        </Badge>
      );
    }
    
    if (status === 'removed' || status === 'completed') {
      return (
        <Badge variant="secondary" className="text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          {status === 'removed' ? 'Removed' : 'Completed'}
          {removal_reason && ` (${removal_reason.replace('Disposition: ', '')})`}
        </Badge>
      );
    }
    
    return null;
  };

  if (!lead) return null;

  const fullName = [editedLead.first_name || lead.first_name, editedLead.last_name || lead.last_name].filter(Boolean).join(' ') || 'Unknown';
  const currentLead = { ...lead, ...editedLead };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] md:w-full overflow-hidden flex flex-col p-4 md:p-6" aria-describedby="lead-detail-description">
        <DialogDescription id="lead-detail-description" className="sr-only">
          View and edit lead details including contact information, status, and activity history.
        </DialogDescription>
        <DialogHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <User className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <span className="text-lg md:text-xl block truncate">{fullName}</span>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge variant={currentLead.status === 'new' ? 'default' : 'secondary'} className="text-xs">
                    {currentLead.status}
                  </Badge>
                  {currentDisposition && currentDisposition !== currentLead.status && (
                    <Badge 
                      variant="outline" 
                      className="text-xs"
                      style={{ 
                        backgroundColor: getDispositionColor(currentDisposition) + '20',
                        borderColor: getDispositionColor(currentDisposition),
                        color: getDispositionColor(currentDisposition)
                      }}
                    >
                      {formatDispositionName(currentDisposition)}
                    </Badge>
                  )}
                  {currentLead.do_not_call && (
                    <Badge variant="destructive" className="text-xs">DNC</Badge>
                  )}
                  {getWorkflowStatusBadge()}
                  <LeadScoreIndicator priority={currentLead.priority} size="sm" />
                </div>
              </div>
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetDialingHistory}
                disabled={isResettingHistory}
              >
                <RotateCcw className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">{isResettingHistory ? 'Resetting...' : 'Reset Dialing'}</span>
              </Button>
              {isSaving && (
                <span className="text-xs text-muted-foreground">Saving...</span>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-6 h-auto">
            <TabsTrigger value="details" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
              <User className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Details</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
              <Activity className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Activity</span>
              <span className="ml-1 text-xs">({activities.length})</span>
            </TabsTrigger>
            <TabsTrigger value="calls" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
              <Phone className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Calls</span>
              <span className="ml-1 text-xs">({callLogs.length})</span>
            </TabsTrigger>
            <TabsTrigger value="messages" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
              <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">SMS</span>
              <span className="ml-1 text-xs">({smsMessages.length})</span>
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
              <Bot className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">AI</span>
            </TabsTrigger>
            <TabsTrigger value="prompts" className="text-xs sm:text-sm px-1 sm:px-3 py-2">
              <Variable className="h-3 w-3 sm:h-4 sm:w-4 sm:mr-2" />
              <span className="hidden sm:inline">Prompts</span>
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-3 md:mt-4">
            <TabsContent value="details" className="mt-0 space-y-3 md:space-y-4">
              {/* Lead Score Card */}
              <LeadScoreIndicator priority={currentLead.priority} showDetails />

              {/* Current Status Summary - Prominent Section */}
              <Card className="border-2 border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" />
                    Current Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Last Disposition with full details */}
                  {currentDisposition && lastCallWithDisposition && (
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-background border">
                      <Badge 
                        className="shrink-0"
                        style={{ 
                          backgroundColor: getDispositionColor(currentDisposition),
                          color: 'white'
                        }}
                      >
                        {formatDispositionName(currentDisposition)}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {formatDispositionName(currentDisposition)} at {format(new Date(lastCallWithDisposition.created_at), 'PPp')}
                        </p>
                        {lastCallWithDisposition.duration_seconds && lastCallWithDisposition.duration_seconds > 0 && (
                          <p className="text-xs text-muted-foreground">
                            Call duration: {Math.floor(lastCallWithDisposition.duration_seconds / 60)}m {lastCallWithDisposition.duration_seconds % 60}s
                          </p>
                        )}
                        {lastCallWithDisposition.notes && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {lastCallWithDisposition.notes.substring(0, 150)}...
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {!currentDisposition && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-dashed">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">No calls recorded yet</p>
                    </div>
                  )}
                  
                  {/* Next Callback - Show Past Due Warning */}
                  {currentLead.next_callback_at && (
                    (() => {
                      const callbackDate = new Date(currentLead.next_callback_at);
                      const isOverdue = callbackDate < new Date();
                      return (
                        <div className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${
                          isOverdue 
                            ? 'bg-destructive/10 border-destructive/30' 
                            : 'bg-amber-500/10 border-amber-500/30'
                        }`}>
                          <div className="flex items-center gap-3">
                            {isOverdue ? (
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                            ) : (
                              <Clock className="h-5 w-5 text-amber-600" />
                            )}
                            <div>
                              <p className={`text-sm font-medium ${isOverdue ? 'text-destructive' : 'text-amber-700 dark:text-amber-400'}`}>
                                {isOverdue ? 'Callback Overdue!' : 'Callback Scheduled'}
                              </p>
                              <p className="text-sm">{format(callbackDate, 'PPPp')}</p>
                            </div>
                          </div>
                          {isOverdue && (
                            <Button 
                              size="sm" 
                              variant="destructive"
                              onClick={async () => {
                                try {
                                  const { data: { user } } = await supabase.auth.getUser();
                                  if (!user) return;
                                  
                                  const { data: campaign } = await supabase
                                    .from('campaigns')
                                    .select('id')
                                    .eq('user_id', user.id)
                                    .eq('status', 'active')
                                    .limit(1)
                                    .maybeSingle();
                                  
                                  if (!campaign) {
                                    toast({ title: "No Active Campaign", description: "Please start a campaign first.", variant: "destructive" });
                                    return;
                                  }
                                  
                                  await supabase.from('dialing_queues').delete().eq('lead_id', lead.id).in('status', ['pending', 'failed']);
                                  await supabase.from('dialing_queues').insert({
                                    campaign_id: campaign.id,
                                    lead_id: lead.id,
                                    phone_number: currentLead.phone_number,
                                    status: 'pending',
                                    scheduled_at: new Date().toISOString(),
                                    priority: 10,
                                    max_attempts: 3,
                                    attempts: 0
                                  });
                                  
                                  await supabase.functions.invoke('call-dispatcher', { body: { immediate: true } });
                                  toast({ title: "Call Initiated", description: `Calling ${currentLead.first_name || 'lead'} now...` });
                                } catch (err: any) {
                                  toast({ title: "Error", description: err.message, variant: "destructive" });
                                }
                              }}
                            >
                              <Phone className="h-3 w-3 mr-1" />
                              Call Now
                            </Button>
                          )}
                        </div>
                      );
                    })()
                  )}
                  
                  {/* Workflow Status */}
                  {workflowStatus && (
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                      <Workflow className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Workflow: {workflowStatus.workflow_name || 'Unknown'}</span>
                      <Badge variant="secondary" className="text-xs">
                        {workflowStatus.status}
                        {workflowStatus.removal_reason && ` - ${workflowStatus.removal_reason}`}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Editable Notes - Moved UP for visibility */}
              <Card className="border-2 border-blue-500/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    Notes
                    <span className="text-xs text-muted-foreground font-normal">(click to edit)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={editedLead.notes ?? lead.notes ?? ''}
                    onChange={(e) => setEditedLead(prev => ({ ...prev, notes: e.target.value }))}
                    onBlur={(e) => handleAutoSave('notes', e.target.value)}
                    rows={4}
                    placeholder="Add notes about this lead..."
                    className="border-transparent hover:border-input focus:border-primary transition-colors"
                  />
                </CardContent>
              </Card>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {/* Contact Info - Inline Editable */}
                <Card>
                  <CardHeader className="pb-2 md:pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contact Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">First Name</Label>
                        <Input
                          value={editedLead.first_name ?? lead.first_name ?? ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, first_name: e.target.value }))}
                          onBlur={(e) => handleAutoSave('first_name', e.target.value)}
                          className="border-transparent hover:border-input focus:border-primary transition-colors"
                          placeholder="First name"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Last Name</Label>
                        <Input
                          value={editedLead.last_name ?? lead.last_name ?? ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, last_name: e.target.value }))}
                          onBlur={(e) => handleAutoSave('last_name', e.target.value)}
                          className="border-transparent hover:border-input focus:border-primary transition-colors"
                          placeholder="Last name"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        Phone Number
                      </Label>
                      <Input
                        value={editedLead.phone_number ?? lead.phone_number ?? ''}
                        onChange={(e) => setEditedLead(prev => ({ ...prev, phone_number: e.target.value }))}
                        onBlur={(e) => handleAutoSave('phone_number', e.target.value)}
                        className="border-transparent hover:border-input focus:border-primary transition-colors"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Email
                      </Label>
                      <Input
                        type="email"
                        value={editedLead.email ?? lead.email ?? ''}
                        onChange={(e) => setEditedLead(prev => ({ ...prev, email: e.target.value }))}
                        onBlur={(e) => handleAutoSave('email', e.target.value)}
                        className="border-transparent hover:border-input focus:border-primary transition-colors"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        Company
                      </Label>
                      <Input
                        value={editedLead.company ?? lead.company ?? ''}
                        onChange={(e) => setEditedLead(prev => ({ ...prev, company: e.target.value }))}
                        onBlur={(e) => handleAutoSave('company', e.target.value)}
                        className="border-transparent hover:border-input focus:border-primary transition-colors"
                        placeholder="Company name"
                      />
                    </div>
                    
                    {/* Address Section */}
                    <Separator className="my-3" />
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <MapPin className="h-3 w-3" />
                        Address
                      </Label>
                      <div className="space-y-2">
                        <Input
                          placeholder="Street Address"
                          value={editedLead.address ?? lead.address ?? ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, address: e.target.value }))}
                          onBlur={(e) => handleAutoSave('address', e.target.value)}
                          className="border-transparent hover:border-input focus:border-primary transition-colors"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Input
                            placeholder="City"
                            value={editedLead.city ?? lead.city ?? ''}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, city: e.target.value }))}
                            onBlur={(e) => handleAutoSave('city', e.target.value)}
                            className="border-transparent hover:border-input focus:border-primary transition-colors"
                          />
                          <Input
                            placeholder="State"
                            value={editedLead.state ?? lead.state ?? ''}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, state: e.target.value }))}
                            onBlur={(e) => handleAutoSave('state', e.target.value)}
                            className="border-transparent hover:border-input focus:border-primary transition-colors"
                          />
                          <Input
                            placeholder="ZIP"
                            value={editedLead.zip_code ?? lead.zip_code ?? ''}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, zip_code: e.target.value }))}
                            onBlur={(e) => handleAutoSave('zip_code', e.target.value)}
                            className="border-transparent hover:border-input focus:border-primary transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Lead Info - Quick Actions Always Visible */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Lead Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Quick Actions */}
                    <div className="p-3 rounded-lg border-2 border-primary/20 bg-primary/5 space-y-3">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide">Quick Actions</p>
                      
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <Select
                          value={editedLead.status ?? lead.status ?? 'new'}
                          onValueChange={(value) => {
                            setEditedLead(prev => ({ ...prev, status: value }));
                            handleAutoSave('status', value);
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">New</SelectItem>
                            <SelectItem value="contacted">Contacted</SelectItem>
                            <SelectItem value="interested">Interested</SelectItem>
                            <SelectItem value="not_interested">Not Interested</SelectItem>
                            <SelectItem value="callback">Callback</SelectItem>
                            <SelectItem value="converted">Converted</SelectItem>
                            <SelectItem value="do_not_call">Do Not Call</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Do Not Call Toggle */}
                      <div className="flex items-center justify-between p-2 rounded-md border bg-background">
                        <div className="flex items-center gap-2">
                          <Ban className="h-4 w-4 text-destructive" />
                          <div>
                            <Label className="text-sm font-medium">Do Not Call</Label>
                            <p className="text-xs text-muted-foreground">Block from dialing</p>
                          </div>
                        </div>
                        <Switch
                          checked={editedLead.do_not_call ?? lead.do_not_call ?? false}
                          onCheckedChange={(checked) => {
                            setEditedLead(prev => ({ ...prev, do_not_call: checked }));
                            handleAutoSave('do_not_call', checked);
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Priority</Label>
                        <Input
                          type="number"
                          min="1"
                          max="10"
                          value={editedLead.priority ?? lead.priority ?? 1}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                          onBlur={(e) => handleAutoSave('priority', parseInt(e.target.value))}
                          className="mt-1 border-transparent hover:border-input focus:border-primary transition-colors"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">Lead Source</Label>
                      <Input
                        value={editedLead.lead_source ?? lead.lead_source ?? ''}
                        onChange={(e) => setEditedLead(prev => ({ ...prev, lead_source: e.target.value }))}
                        onBlur={(e) => handleAutoSave('lead_source', e.target.value)}
                        className="border-transparent hover:border-input focus:border-primary transition-colors"
                        placeholder="e.g., Website, Referral"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Timezone</Label>
                      <Input
                        value={editedLead.timezone ?? lead.timezone ?? ''}
                        onChange={(e) => setEditedLead(prev => ({ ...prev, timezone: e.target.value }))}
                        onBlur={(e) => handleAutoSave('timezone', e.target.value)}
                        className="border-transparent hover:border-input focus:border-primary transition-colors"
                        placeholder="America/New_York"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Created</Label>
                      <p className="font-medium text-sm">{format(new Date(lead.created_at), 'PPp')}</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Dates */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Important Dates
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Last Contacted</Label>
                      <p className="font-medium text-sm">
                        {lead.last_contacted_at 
                          ? format(new Date(lead.last_contacted_at), 'PPp')
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Next Callback</Label>
                      <p className="font-medium text-sm">
                        {lead.next_callback_at 
                          ? format(new Date(lead.next_callback_at), 'PPp')
                          : 'Not scheduled'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Last Updated</Label>
                      <p className="font-medium text-sm">{format(new Date(lead.updated_at), 'PPp')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Tags */}
              {lead.tags && lead.tags.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Tags
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {lead.tags.map((tag, index) => (
                        <Badge key={index} variant="secondary">{tag}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No activity recorded yet</p>
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  
                  <div className="space-y-3">
                    {activities.map((activity) => (
                      <div 
                        key={activity.id} 
                        className="relative pl-10"
                      >
                        {/* Timeline dot */}
                        <div className="absolute left-2.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                        
                        <div className="p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              {getActivityIcon(activity.type)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{activity.title}</span>
                                {getStatusBadge(activity.status)}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(activity.timestamp), 'PPp')}
                              </p>
                            </div>
                          </div>
                          
                          <p className="text-sm text-muted-foreground mt-2">
                            {activity.description}
                          </p>
                          
                          {/* Show call notes inline */}
                          {activity.type === 'call' && activity.metadata?.callNotes && (
                            <div className="mt-2 p-2 rounded bg-muted/50 text-sm">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Call Notes:</p>
                              <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground max-h-32 overflow-y-auto">
                                {activity.metadata.callNotes.slice(-500)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="calls" className="mt-0">
              {callLogs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Phone className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No calls recorded</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {callLogs.map((call) => (
                    <div key={call.id} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4" />
                          <span className="font-medium">{call.status}</span>
                          {call.outcome && (
                            <Badge 
                              variant="outline" 
                              className="text-xs"
                              style={{ 
                                backgroundColor: getDispositionColor(call.outcome) + '20',
                                borderColor: getDispositionColor(call.outcome),
                                color: getDispositionColor(call.outcome)
                              }}
                            >
                              {formatDispositionName(call.outcome)}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(call.created_at), 'PPp')}
                        </span>
                      </div>
                      {call.duration_seconds > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          Duration: {Math.floor(call.duration_seconds / 60)}m {call.duration_seconds % 60}s
                        </p>
                      )}
                      {call.notes && (
                        <div className="mt-2 p-2 rounded bg-muted/50">
                          <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground max-h-40 overflow-y-auto">
                            {call.notes}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-0">
              {smsMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No SMS messages</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {smsMessages.map((sms) => (
                    <div 
                      key={sms.id} 
                      className={`p-3 rounded-lg border ${
                        sms.direction === 'outbound' ? 'bg-primary/5 ml-8' : 'bg-card mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={sms.direction === 'outbound' ? 'default' : 'secondary'} className="text-xs">
                          {sms.direction === 'outbound' ? 'Sent' : 'Received'}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(sms.created_at), 'PPp')}
                        </span>
                      </div>
                      <p className="text-sm">{sms.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ai" className="mt-0">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    AI Activity Timeline
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <LeadActivityTimeline leadId={lead.id} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="prompts" className="mt-0">
              <PromptTemplateGuide />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetailDialog;