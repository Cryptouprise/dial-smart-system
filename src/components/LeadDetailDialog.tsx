import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  Edit3,
  Save,
  X,
  FileText,
  Tag,
  Star,
  RotateCcw,
  Ban,
  MapPin
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

interface LeadDetailDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadUpdated?: () => void;
}

export const LeadDetailDialog: React.FC<LeadDetailDialogProps> = ({
  lead,
  open,
  onOpenChange,
  onLeadUpdated
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedLead, setEditedLead] = useState<Partial<Lead>>({});
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [callLogs, setCallLogs] = useState<any[]>([]);
  const [smsMessages, setSmsMessages] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResettingHistory, setIsResettingHistory] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (lead && open) {
      setEditedLead(lead);
      loadLeadActivity(lead.id);
    }
  }, [lead, open]);

  const loadLeadActivity = async (leadId: string) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch all activity in parallel
      const [callLogsRes, smsRes, decisionsRes, pipelineRes, followUpsRes] = await Promise.all([
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
          .limit(20)
      ]);

      setCallLogs(callLogsRes.data || []);
      setSmsMessages(smsRes.data || []);

      // Combine all activities into a single timeline
      const allActivities: ActivityItem[] = [];

      // Add call logs
      (callLogsRes.data || []).forEach(call => {
        allActivities.push({
          id: `call-${call.id}`,
          type: 'call',
          title: `Call ${call.status}`,
          description: call.outcome || `Duration: ${call.duration_seconds || 0}s`,
          timestamp: call.created_at,
          status: call.status,
          metadata: call
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

  const handleSave = async () => {
    if (!lead) return;
    setIsSaving(true);
    
    try {
      const { error } = await supabase
        .from('leads')
        .update({
          first_name: editedLead.first_name,
          last_name: editedLead.last_name,
          email: editedLead.email,
          company: editedLead.company,
          address: editedLead.address,
          city: editedLead.city,
          state: editedLead.state,
          zip_code: editedLead.zip_code,
          phone_number: editedLead.phone_number,
          notes: editedLead.notes,
          status: editedLead.status,
          timezone: editedLead.timezone,
          lead_source: editedLead.lead_source,
          priority: editedLead.priority,
          do_not_call: editedLead.do_not_call,
          updated_at: new Date().toISOString()
        })
        .eq('id', lead.id);

      if (error) throw error;

      toast({
        title: "Lead Updated",
        description: "Lead information has been saved successfully",
      });

      setIsEditing(false);
      onLeadUpdated?.();
    } catch (error) {
      console.error('Error updating lead:', error);
      toast({
        title: "Error",
        description: "Failed to update lead",
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

  if (!lead) return null;

  const fullName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'Unknown';

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
                  <Badge variant={lead.status === 'new' ? 'default' : 'secondary'} className="text-xs">
                    {lead.status}
                  </Badge>
                  {lead.do_not_call && (
                    <Badge variant="destructive" className="text-xs">DNC</Badge>
                  )}
                  <LeadScoreIndicator priority={lead.priority} size="sm" />
                </div>
              </div>
            </DialogTitle>
            <div className="flex items-center gap-2 shrink-0">
              {isEditing ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(false)}>
                    <X className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Cancel</span>
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isSaving}>
                    <Save className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{isSaving ? 'Saving...' : 'Save'}</span>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetDialingHistory}
                    disabled={isResettingHistory}
                  >
                    <RotateCcw className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">{isResettingHistory ? 'Resetting...' : 'Reset Dialing'}</span>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Edit3 className="h-4 w-4 sm:mr-1" />
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-4 h-auto">
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
          </TabsList>

          <ScrollArea className="flex-1 mt-3 md:mt-4">
            <TabsContent value="details" className="mt-0 space-y-3 md:space-y-4">
              {/* Lead Score Card - Prominent on mobile */}
              <LeadScoreIndicator priority={lead.priority} showDetails />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {/* Contact Info */}
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
                        {isEditing ? (
                          <Input
                            value={editedLead.first_name || ''}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, first_name: e.target.value }))}
                          />
                        ) : (
                          <p className="font-medium">{lead.first_name || '—'}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Last Name</Label>
                        {isEditing ? (
                          <Input
                            value={editedLead.last_name || ''}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, last_name: e.target.value }))}
                          />
                        ) : (
                          <p className="font-medium">{lead.last_name || '—'}</p>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        Phone Number
                      </Label>
                      {isEditing ? (
                        <Input
                          value={editedLead.phone_number || ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, phone_number: e.target.value }))}
                        />
                      ) : (
                        <p className="font-medium">{lead.phone_number}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        Email
                      </Label>
                      {isEditing ? (
                        <Input
                          type="email"
                          value={editedLead.email || ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, email: e.target.value }))}
                        />
                      ) : (
                        <p className="font-medium">{lead.email || '—'}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building className="h-3 w-3" />
                        Company
                      </Label>
                      {isEditing ? (
                        <Input
                          value={editedLead.company || ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, company: e.target.value }))}
                        />
                      ) : (
                        <p className="font-medium">{lead.company || '—'}</p>
                      )}
                    </div>
                    
                    {/* Address Section */}
                    <Separator className="my-3" />
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <MapPin className="h-3 w-3" />
                        Address
                      </Label>
                      {isEditing ? (
                        <div className="space-y-2">
                          <Input
                            placeholder="Street Address"
                            value={editedLead.address || ''}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, address: e.target.value }))}
                          />
                          <div className="grid grid-cols-3 gap-2">
                            <Input
                              placeholder="City"
                              value={editedLead.city || ''}
                              onChange={(e) => setEditedLead(prev => ({ ...prev, city: e.target.value }))}
                            />
                            <Input
                              placeholder="State"
                              value={editedLead.state || ''}
                              onChange={(e) => setEditedLead(prev => ({ ...prev, state: e.target.value }))}
                            />
                            <Input
                              placeholder="ZIP"
                              value={editedLead.zip_code || ''}
                              onChange={(e) => setEditedLead(prev => ({ ...prev, zip_code: e.target.value }))}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm">
                          {lead.address || lead.city || lead.state || lead.zip_code ? (
                            <>
                              {lead.address && <p className="font-medium">{lead.address}</p>}
                              <p className="text-muted-foreground">
                                {[lead.city, lead.state, lead.zip_code].filter(Boolean).join(', ') || '—'}
                              </p>
                            </>
                          ) : (
                            <p className="text-muted-foreground">No address on file</p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Lead Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      Lead Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Quick Actions - Always Editable */}
                    <div className="p-3 rounded-lg border-2 border-primary/20 bg-primary/5 space-y-3">
                      <p className="text-xs font-semibold text-primary uppercase tracking-wide">Quick Actions</p>
                      
                      <div>
                        <Label className="text-xs text-muted-foreground">Status</Label>
                        <Select
                          value={editedLead.status || lead.status || 'new'}
                          onValueChange={async (value) => {
                            setEditedLead(prev => ({ ...prev, status: value }));
                            // Auto-save status change
                            const { error } = await supabase
                              .from('leads')
                              .update({ status: value, updated_at: new Date().toISOString() })
                              .eq('id', lead.id);
                            if (!error) {
                              toast({ title: "Status Updated", description: `Lead status changed to ${value}` });
                              onLeadUpdated?.();
                            }
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

                      {/* Do Not Call Toggle - Always Visible */}
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
                          onCheckedChange={async (checked) => {
                            setEditedLead(prev => ({ ...prev, do_not_call: checked }));
                            // Auto-save DNC change
                            const { error } = await supabase
                              .from('leads')
                              .update({ do_not_call: checked, updated_at: new Date().toISOString() })
                              .eq('id', lead.id);
                            if (!error) {
                              toast({ 
                                title: checked ? "Added to DNC" : "Removed from DNC", 
                                description: checked ? "Lead will not be called" : "Lead can now be called" 
                              });
                              onLeadUpdated?.();
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs text-muted-foreground">Priority</Label>
                        {isEditing ? (
                          <Input
                            type="number"
                            min="1"
                            max="10"
                            value={editedLead.priority || 1}
                            onChange={(e) => setEditedLead(prev => ({ ...prev, priority: parseInt(e.target.value) }))}
                            className="mt-1"
                          />
                        ) : (
                          <p className="font-medium">{lead.priority || 1}</p>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">Lead Source</Label>
                      {isEditing ? (
                        <Input
                          value={editedLead.lead_source || ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, lead_source: e.target.value }))}
                        />
                      ) : (
                        <p className="font-medium">{lead.lead_source || '—'}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Timezone</Label>
                      {isEditing ? (
                        <Input
                          value={editedLead.timezone || ''}
                          onChange={(e) => setEditedLead(prev => ({ ...prev, timezone: e.target.value }))}
                        />
                      ) : (
                        <p className="font-medium">{lead.timezone || 'America/New_York'}</p>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Created</Label>
                      <p className="font-medium">{format(new Date(lead.created_at), 'PPp')}</p>
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
                      <p className="font-medium">
                        {lead.last_contacted_at 
                          ? format(new Date(lead.last_contacted_at), 'PPp')
                          : 'Never'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Next Callback</Label>
                      <p className="font-medium">
                        {lead.next_callback_at 
                          ? format(new Date(lead.next_callback_at), 'PPp')
                          : 'Not scheduled'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Last Updated</Label>
                      <p className="font-medium">{format(new Date(lead.updated_at), 'PPp')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <Textarea
                      value={editedLead.notes || ''}
                      onChange={(e) => setEditedLead(prev => ({ ...prev, notes: e.target.value }))}
                      rows={4}
                      placeholder="Add notes about this lead..."
                    />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">
                      {lead.notes || 'No notes yet'}
                    </p>
                  )}
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
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div 
                      key={activity.id} 
                      className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        {getActivityIcon(activity.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{activity.title}</span>
                          {getStatusBadge(activity.status)}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {activity.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(activity.timestamp), 'PPp')}
                        </p>
                      </div>
                    </div>
                  ))}
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
                          <Badge variant="outline">{call.outcome || 'No outcome'}</Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(call.created_at), 'PPp')}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        <span>Duration: {call.duration_seconds || 0}s</span>
                        {call.notes && <p className="mt-1">{call.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="messages" className="mt-0">
              {smsMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No messages</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {smsMessages.map((msg) => (
                    <div 
                      key={msg.id} 
                      className={`p-3 rounded-lg border ${
                        msg.direction === 'outbound' 
                          ? 'bg-primary/5 ml-8' 
                          : 'bg-card mr-8'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={msg.direction === 'outbound' ? 'default' : 'secondary'}>
                            {msg.direction === 'outbound' ? 'Sent' : 'Received'}
                          </Badge>
                          {msg.is_ai_generated && (
                            <Badge variant="outline" className="text-xs">
                              <Bot className="h-3 w-3 mr-1" />
                              AI
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msg.created_at), 'PPp')}
                        </span>
                      </div>
                      <p className="text-sm">{msg.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default LeadDetailDialog;
