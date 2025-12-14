
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Play, Pause, Edit, Trash2, Users, Activity, Shield, TrendingUp, AlertCircle, Phone, PhoneOff, Workflow, MessageSquare, Calendar, CalendarOff } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';
import { useCampaignCompliance } from '@/hooks/useCampaignCompliance';
import { useLeadPrioritization } from '@/hooks/useLeadPrioritization';
import { CampaignLeadManager } from './CampaignLeadManager';
import { CampaignCallActivity } from './CampaignCallActivity';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  agent_id?: string;
  workflow_id?: string;
  sms_from_number?: string;
  calls_per_minute: number;
  max_attempts: number;
  calling_hours_start: string;
  calling_hours_end: string;
  timezone: string;
  created_at: string;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
}

interface CampaignManagerProps {
  onRefresh?: () => void;
}

interface AgentWithPhoneStatus {
  agent_id: string;
  agent_name: string;
  voice_id?: string;
  hasActivePhone: boolean;
  phoneNumber?: string;
}

interface PhoneNumberStatus {
  number: string;
  hasRetellId: boolean;
  status: string;
  quarantine_until?: string;
}

const CampaignManager = ({ onRefresh }: CampaignManagerProps) => {
  const { getCampaigns, createCampaign, updateCampaign, isLoading } = usePredictiveDialing();
  const { prioritizeLeads, isCalculating } = useLeadPrioritization();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [agents, setAgents] = useState<AgentWithPhoneStatus[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberStatus[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
  const [viewingCallsFor, setViewingCallsFor] = useState<string | null>(null);
  const [prioritizingCampaignId, setPrioritizingCampaignId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    agent_id: '',
    workflow_id: '',
    sms_from_number: '',
    calls_per_minute: 5,
    max_attempts: 3,
    calling_hours_start: '09:00',
    calling_hours_end: '17:00',
    timezone: 'America/New_York'
  });
  const [twilioNumbers, setTwilioNumbers] = useState<{number: string; provider: string}[]>([]);

  useEffect(() => {
    loadCampaigns();
    loadAgentsWithPhoneStatus();
    loadPhoneNumberStatus();
    loadWorkflows();
    loadTwilioNumbers();
  }, []);

  const loadWorkflows = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('campaign_workflows')
        .select('id, name, description, active')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;
      setWorkflows(data || []);
    } catch (error) {
      console.error('Error loading workflows:', error);
    }
  };

  const loadPhoneNumberStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('phone_numbers')
        .select('number, retell_phone_id, status, quarantine_until')
        .eq('user_id', user.id);

      if (error) throw error;

      const phoneStatus: PhoneNumberStatus[] = (data || []).map(p => ({
        number: p.number,
        hasRetellId: !!p.retell_phone_id,
        status: p.status,
        quarantine_until: p.quarantine_until || undefined
      }));

      setPhoneNumbers(phoneStatus);
    } catch (error) {
      console.error('Error loading phone numbers:', error);
    }
  };

  const loadCampaigns = async () => {
    const data = await getCampaigns();
    if (data) setCampaigns(data);
  };

  const loadAgentsWithPhoneStatus = async () => {
    setLoadingAgents(true);
    try {
      // Load agents and phone numbers in parallel
      const [agentsResponse, phonesResponse] = await Promise.all([
        supabase.functions.invoke('retell-agent-management', { body: { action: 'list' } }),
        supabase.functions.invoke('retell-phone-management', { body: { action: 'list' } })
      ]);
      
      if (agentsResponse.error) throw agentsResponse.error;
      
      const agentArray = Array.isArray(agentsResponse.data) ? agentsResponse.data : (agentsResponse.data?.agents || []);
      const phoneArray = Array.isArray(phonesResponse.data) ? phonesResponse.data : (phonesResponse.data?.phone_numbers || []);
      
      // Create a map of agent_id to phone numbers
      const agentPhoneMap = new Map<string, string>();
      phoneArray.forEach((phone: any) => {
        if (phone.inbound_agent_id) {
          agentPhoneMap.set(phone.inbound_agent_id, phone.phone_number);
        }
        if (phone.outbound_agent_id) {
          agentPhoneMap.set(phone.outbound_agent_id, phone.phone_number);
        }
      });
      
      // Deduplicate and enrich agents with phone status
      const uniqueAgents: AgentWithPhoneStatus[] = agentArray.reduce((acc: AgentWithPhoneStatus[], agent: any) => {
        if (!acc.find(a => a.agent_id === agent.agent_id)) {
          const phoneNumber = agentPhoneMap.get(agent.agent_id);
          acc.push({
            agent_id: agent.agent_id,
            agent_name: agent.agent_name,
            voice_id: agent.voice_id,
            hasActivePhone: !!phoneNumber,
            phoneNumber
          });
        }
        return acc;
      }, []);
      
      // Sort: agents with phones first
      uniqueAgents.sort((a, b) => {
        if (a.hasActivePhone && !b.hasActivePhone) return -1;
        if (!a.hasActivePhone && b.hasActivePhone) return 1;
        return a.agent_name.localeCompare(b.agent_name);
      });
      
      console.log('Loaded agents with phone status:', uniqueAgents.length);
      setAgents(uniqueAgents);
    } catch (error) {
      console.error('Error loading agents:', error);
      toast({
        title: "Error loading agents",
        description: "Could not fetch Retell AI agents. Please check your API configuration.",
        variant: "destructive"
      });
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingCampaign) {
      await updateCampaign(editingCampaign.id, formData);
    } else {
      await createCampaign({ ...formData, status: 'draft' });
    }
    
    setShowCreateDialog(false);
    setEditingCampaign(null);
    resetForm();
    loadCampaigns();
    onRefresh?.();
  };

  const loadTwilioNumbers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('phone_numbers')
        .select('number, provider')
        .eq('user_id', user.id)
        .eq('provider', 'twilio')
        .eq('status', 'active');

      if (error) throw error;
      setTwilioNumbers(data || []);
    } catch (error) {
      console.error('Error loading Twilio numbers:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      agent_id: '',
      workflow_id: '',
      sms_from_number: '',
      calls_per_minute: 5,
      max_attempts: 3,
      calling_hours_start: '09:00',
      calling_hours_end: '17:00',
      timezone: 'America/New_York'
    });
  };

  const handleEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setFormData({
      name: campaign.name,
      description: campaign.description || '',
      agent_id: campaign.agent_id || '',
      workflow_id: campaign.workflow_id || '',
      sms_from_number: campaign.sms_from_number || '',
      calls_per_minute: campaign.calls_per_minute,
      max_attempts: campaign.max_attempts,
      calling_hours_start: campaign.calling_hours_start,
      calling_hours_end: campaign.calling_hours_end,
      timezone: campaign.timezone
    });
    setShowCreateDialog(true);
  };

  const handleStatusChange = async (campaign: Campaign, newStatus: string) => {
    await updateCampaign(campaign.id, { status: newStatus });
    loadCampaigns();
    onRefresh?.();
  };

  const handleDeleteCampaign = async (campaignId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Delete campaign leads first
      await supabase
        .from('campaign_leads')
        .delete()
        .eq('campaign_id', campaignId);

      // Delete dialing queue entries
      await supabase
        .from('dialing_queues')
        .delete()
        .eq('campaign_id', campaignId);

      // Delete the campaign
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Campaign deleted",
        description: "The campaign has been permanently deleted.",
      });
      loadCampaigns();
      onRefresh?.();
    } catch (error) {
      console.error('Error deleting campaign:', error);
      toast({
        title: "Error",
        description: "Failed to delete campaign. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Check if calendar is connected for the user
  const [hasCalendarIntegration, setHasCalendarIntegration] = useState(false);
  
  useEffect(() => {
    const checkCalendarIntegration = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('calendar_integrations')
        .select('id')
        .eq('user_id', user.id)
        .eq('sync_enabled', true)
        .limit(1);
      
      setHasCalendarIntegration((data?.length || 0) > 0);
    };
    checkCalendarIntegration();
  }, []);

  // Determine campaign type based on workflow and SMS settings
  const getCampaignType = (campaign: Campaign) => {
    if (campaign.workflow_id && campaign.sms_from_number) {
      return { label: 'Call + SMS', icon: MessageSquare, color: 'text-blue-600 border-blue-600' };
    } else if (campaign.sms_from_number) {
      return { label: 'SMS Only', icon: MessageSquare, color: 'text-green-600 border-green-600' };
    } else {
      return { label: 'Voice Call', icon: Phone, color: 'text-purple-600 border-purple-600' };
    }
  };

  const handlePrioritizeLeads = async (campaignId: string, timezone: string) => {
    setPrioritizingCampaignId(campaignId);
    try {
      await prioritizeLeads({
        campaignId,
        timeZone: timezone,
        maxLeads: 500 // Prioritize top 500 leads
      });
      toast({
        title: "Success",
        description: "Leads have been prioritized for optimal calling",
      });
    } catch (error) {
      console.error('Error prioritizing leads:', error);
    } finally {
      setPrioritizingCampaignId(null);
    }
  };

  // Render compliance status badge
  const CampaignComplianceStatus = ({ campaignId }: { campaignId: string }) => {
    const { metrics } = useCampaignCompliance(campaignId);
    
    if (!metrics) return null;

    return (
      <div className="flex items-center gap-2 text-xs">
        <Shield className={`h-4 w-4 ${
          metrics.abandonmentRate <= 3 ? 'text-green-500' : 'text-red-500'
        }`} />
        <span className={
          metrics.abandonmentRate <= 3 ? 'text-green-600' : 'text-red-600'
        }>
          {metrics.abandonmentRate.toFixed(2)}% abandon rate
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Campaign Manager
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Create and manage your dialing campaigns
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingCampaign(null); }}>
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {editingCampaign ? 'Edit Campaign' : 'Create New Campaign'}
              </DialogTitle>
              <DialogDescription>
                Set up your campaign parameters and calling schedule.
              </DialogDescription>
            </DialogHeader>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Campaign Name
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter campaign name"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Description
                </label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Campaign description (optional)"
                  rows={3}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Retell AI Agent *
                </label>
                <Select
                  value={formData.agent_id}
                  onValueChange={(value) => setFormData({ ...formData, agent_id: value })}
                  disabled={loadingAgents}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={loadingAgents ? "Loading agents..." : "Select an agent"} />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {agents.map((agent) => (
                      <SelectItem key={agent.agent_id} value={agent.agent_id}>
                        <div className="flex items-center gap-2">
                          {agent.hasActivePhone ? (
                            <Phone className="h-4 w-4 text-green-500" />
                          ) : (
                            <PhoneOff className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{agent.agent_name}</span>
                          {!agent.hasActivePhone && (
                            <span className="text-xs text-muted-foreground">(No active phone)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.agent_id && !agents.find(a => a.agent_id === formData.agent_id)?.hasActivePhone && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    This agent has no active phone number in Retell - calls won't work
                  </p>
                )}
              </div>

              {/* Workflow Selector */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  Link Workflow (Optional)
                </label>
                <Select
                  value={formData.workflow_id || "none"}
                  onValueChange={(value) => setFormData({ ...formData, workflow_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workflow" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="none">No Workflow</SelectItem>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        <div className="flex items-center gap-2">
                          <span>{workflow.name}</span>
                          {!workflow.active && (
                            <Badge variant="outline" className="text-xs">Inactive</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.workflow_id && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Leads will be enrolled in this workflow when the campaign starts.
                  </p>
                )}
              </div>

              {/* SMS From Number Selector */}
              <div>
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  SMS From Number (for workflow texts)
                </label>
                <Select
                  value={formData.sms_from_number || "none"}
                  onValueChange={(value) => setFormData({ ...formData, sms_from_number: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a Twilio number for SMS" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="none">No SMS Number</SelectItem>
                    {twilioNumbers.map((phone) => (
                      <SelectItem key={phone.number} value={phone.number}>
                        <span className="font-mono">{phone.number}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.sms_from_number ? (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                    <MessageSquare className="h-3 w-3" />
                    Workflow SMS will be sent from this A2P number
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Select a number if your workflow includes SMS steps
                  </p>
                )}
              </div>

              {/* Phone Number Status Section */}
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Your Phone Numbers
                </label>
                {phoneNumbers.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No phone numbers configured</p>
                ) : (
                  <div className="space-y-1">
                    {phoneNumbers.map((phone) => (
                      <div key={phone.number} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{phone.number}</span>
                        <div className="flex items-center gap-2">
                          {phone.quarantine_until ? (
                            <Badge variant="outline" className="text-amber-600 border-amber-600 text-xs">
                              Quarantined
                            </Badge>
                          ) : phone.hasRetellId ? (
                            <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                              <Phone className="h-3 w-3 mr-1" />
                              Retell Ready
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-600 text-xs">
                              <PhoneOff className="h-3 w-3 mr-1" />
                              Not in Retell
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {phoneNumbers.length > 0 && !phoneNumbers.some(p => p.hasRetellId && !p.quarantine_until) && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    No Retell-ready phone numbers! Calls will fail.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Calls/Minute
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="30"
                    value={formData.calls_per_minute}
                    onChange={(e) => setFormData({ ...formData, calls_per_minute: parseInt(e.target.value) })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Max Attempts
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.max_attempts}
                    onChange={(e) => setFormData({ ...formData, max_attempts: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Start Time
                  </label>
                  <Input
                    type="time"
                    value={formData.calling_hours_start}
                    onChange={(e) => setFormData({ ...formData, calling_hours_start: e.target.value })}
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    End Time
                  </label>
                  <Input
                    type="time"
                    value={formData.calling_hours_end}
                    onChange={(e) => setFormData({ ...formData, calling_hours_end: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={isLoading || !formData.agent_id}>
                  {editingCampaign ? 'Update' : 'Create'} Campaign
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
              </div>
              {!formData.agent_id && (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Please select a Retell AI agent to continue
                </p>
              )}
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    {campaign.name}
                    {/* Campaign Type Badge */}
                    {(() => {
                      const type = getCampaignType(campaign);
                      return (
                        <Badge variant="outline" className={type.color}>
                          <type.icon className="h-3 w-3 mr-1" />
                          {type.label}
                        </Badge>
                      );
                    })()}
                    <Badge variant={campaign.status === 'active' ? 'default' : 
                                  campaign.status === 'paused' ? 'secondary' : 'outline'}>
                      {campaign.status}
                    </Badge>
                    {campaign.agent_id && (() => {
                      const agent = agents.find(a => a.agent_id === campaign.agent_id);
                      if (agent) {
                        return agent.hasActivePhone ? (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            <Phone className="h-3 w-3 mr-1" />
                            {agent.agent_name}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-amber-600 border-amber-600">
                            <PhoneOff className="h-3 w-3 mr-1" />
                            {agent.agent_name} (No phone)
                          </Badge>
                        );
                      }
                      return null;
                    })()}
                    {campaign.workflow_id && (() => {
                      const workflow = workflows.find(w => w.id === campaign.workflow_id);
                      if (workflow) {
                        return (
                          <Badge variant="outline" className="text-indigo-600 border-indigo-600">
                            <Workflow className="h-3 w-3 mr-1" />
                            {workflow.name}
                          </Badge>
                        );
                      }
                      return null;
                    })()}
                    {/* Calendar Connection Status */}
                    {hasCalendarIntegration ? (
                      <Badge variant="outline" className="text-teal-600 border-teal-600">
                        <Calendar className="h-3 w-3 mr-1" />
                        Calendar
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground border-muted-foreground">
                        <CalendarOff className="h-3 w-3 mr-1" />
                        No Calendar
                      </Badge>
                    )}
                  </CardTitle>
                  {campaign.description && (
                    <CardDescription>{campaign.description}</CardDescription>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(campaign)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  
                  {campaign.status === 'active' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleStatusChange(campaign, 'paused')}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(campaign, 'active')}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Delete Button */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete "{campaign.name}"? This will also remove all associated leads and queue entries. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDeleteCampaign(campaign.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-slate-500">Calls/Min:</span>
                    <div className="font-medium">{campaign.calls_per_minute}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Max Attempts:</span>
                    <div className="font-medium">{campaign.max_attempts}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Hours:</span>
                    <div className="font-medium">
                      {campaign.calling_hours_start} - {campaign.calling_hours_end}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Timezone:</span>
                    <div className="font-medium">{campaign.timezone}</div>
                  </div>
                </div>

                {/* Compliance Status */}
                {campaign.status === 'active' && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                    <CampaignComplianceStatus campaignId={campaign.id} />
                  </div>
                )}

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setExpandedCampaignId(
                      expandedCampaignId === campaign.id ? null : campaign.id
                    )}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    {expandedCampaignId === campaign.id ? 'Hide' : 'Manage'} Leads
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => setViewingCallsFor(
                      viewingCallsFor === campaign.id ? null : campaign.id
                    )}
                  >
                    <Activity className="h-4 w-4 mr-2" />
                    {viewingCallsFor === campaign.id ? 'Hide' : 'View'} Call Activity
                  </Button>

                  <Button
                    variant="outline"
                    onClick={() => handlePrioritizeLeads(campaign.id, campaign.timezone)}
                    disabled={prioritizingCampaignId === campaign.id || isCalculating}
                  >
                    <TrendingUp className="h-4 w-4 mr-2" />
                    {prioritizingCampaignId === campaign.id ? 'Prioritizing...' : 'Prioritize Leads'}
                  </Button>
                </div>

                {expandedCampaignId === campaign.id && (
                  <div className="pt-4">
                    <CampaignLeadManager
                      campaignId={campaign.id}
                      campaignName={campaign.name}
                    />
                  </div>
                )}

                {viewingCallsFor === campaign.id && (
                  <div className="pt-4">
                    <CampaignCallActivity campaignId={campaign.id} />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        
        {campaigns.length === 0 && (
          <Card className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm">
            <CardContent className="text-center py-8">
              <p className="text-slate-500 dark:text-slate-400">
                No campaigns created yet. Create your first campaign to get started.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CampaignManager;
