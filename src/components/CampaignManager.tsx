
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Play, Pause, Edit, Trash2, Users, Activity, Shield, TrendingUp, AlertCircle, Phone, PhoneOff } from 'lucide-react';
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
  calls_per_minute: number;
  max_attempts: number;
  calling_hours_start: string;
  calling_hours_end: string;
  timezone: string;
  created_at: string;
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

const CampaignManager = ({ onRefresh }: CampaignManagerProps) => {
  const { getCampaigns, createCampaign, updateCampaign, isLoading } = usePredictiveDialing();
  const { prioritizeLeads, isCalculating } = useLeadPrioritization();
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [agents, setAgents] = useState<AgentWithPhoneStatus[]>([]);
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
    calls_per_minute: 5,
    max_attempts: 3,
    calling_hours_start: '09:00',
    calling_hours_end: '17:00',
    timezone: 'America/New_York'
  });

  useEffect(() => {
    loadCampaigns();
    loadAgentsWithPhoneStatus();
  }, []);

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

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      agent_id: '',
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
                    This agent has no active phone number - calls won't work
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
                  <CardTitle className="flex items-center gap-2">
                    {campaign.name}
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
