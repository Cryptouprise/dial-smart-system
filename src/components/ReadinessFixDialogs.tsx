import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Phone, MessageSquare, Users, Bot, Clock, ExternalLink, 
  CheckCircle, AlertTriangle, Plus, Loader2, RefreshCw, Upload, Shield
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTwilioIntegration } from '@/hooks/useTwilioIntegration';

interface FixDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  onFixed?: () => void;
}

// ===== A2P Registration Dialog =====
export const A2PFixDialog: React.FC<FixDialogProps> = ({ open, onOpenChange, campaignId, onFixed }) => {
  const { checkA2PStatus, addNumberToCampaign } = useTwilioIntegration();
  const [a2pStatus, setA2pStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Campaign wiring
  const [campaignSmsFromNumber, setCampaignSmsFromNumber] = useState<string>('rotation');
  const [savingCampaignNumber, setSavingCampaignNumber] = useState(false);

  // A2P registration flow
  const [selectedNumber, setSelectedNumber] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [addingNumber, setAddingNumber] = useState(false);

  useEffect(() => {
    if (open) {
      loadCampaignSmsFromNumber();
      loadA2PStatus();
    }
  }, [open]);

  const loadCampaignSmsFromNumber = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('sms_from_number')
        .eq('id', campaignId)
        .maybeSingle();

      if (error) throw error;

      const value = data?.sms_from_number;
      setCampaignSmsFromNumber(value ? value : 'rotation');
    } catch (e) {
      // Non-blocking
      console.warn('Could not load campaign SMS from number', e);
      setCampaignSmsFromNumber('rotation');
    }
  };

  const loadA2PStatus = async () => {
    setLoading(true);
    const status = await checkA2PStatus();
    setA2pStatus(status);
    setLoading(false);
  };

  const handleSaveCampaignSmsNumber = async () => {
    setSavingCampaignNumber(true);
    try {
      const smsFromNumber = campaignSmsFromNumber === 'rotation' ? null : campaignSmsFromNumber;

      const { error } = await supabase
        .from('campaigns')
        .update({ sms_from_number: smsFromNumber })
        .eq('id', campaignId);

      if (error) throw error;

      toast.success('Campaign SMS number updated');
      onFixed?.();
    } catch (e) {
      console.error('Failed to update campaign SMS number:', e);
      toast.error('Failed to update campaign SMS number');
    } finally {
      setSavingCampaignNumber(false);
    }
  };

  const unregisteredNumbers = a2pStatus?.phone_numbers?.filter((n: any) => !n.a2p_registered) || [];
  const registeredNumbers = a2pStatus?.phone_numbers?.filter((n: any) => n.a2p_registered) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            A2P Registration Status
          </DialogTitle>
          <DialogDescription>
            Manage A2P 10DLC compliance for SMS messaging
          </DialogDescription>
        </DialogHeader>
        
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : !a2pStatus ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Could not load A2P status. Make sure your Twilio credentials are configured.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-2xl font-bold">{a2pStatus.summary?.total_numbers || 0}</p>
                <p className="text-xs text-muted-foreground">Total Numbers</p>
              </div>
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-green-600">{a2pStatus.summary?.registered_numbers || 0}</p>
                <p className="text-xs text-muted-foreground">Registered</p>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-amber-600">{a2pStatus.summary?.pending_numbers || 0}</p>
                <p className="text-xs text-muted-foreground">Pending</p>
              </div>
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-600">{a2pStatus.summary?.unregistered_numbers || 0}</p>
                <p className="text-xs text-muted-foreground">Unregistered</p>
              </div>
            </div>

            {/* Campaign wiring (set the same number the campaign editor uses) */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Campaign SMS From Number</p>
                  <p className="text-xs text-muted-foreground">
                    Pick which number this campaign will text from (this is the same field you edit on the campaign).
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleSaveCampaignSmsNumber}
                  disabled={savingCampaignNumber}
                >
                  {savingCampaignNumber ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  )}
                  Save
                </Button>
              </div>

              <Select value={campaignSmsFromNumber} onValueChange={setCampaignSmsFromNumber}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a number" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rotation">Use rotation (no fixed number)</SelectItem>
                  {registeredNumbers.map((n: any) => (
                    <SelectItem key={n.sid} value={n.phone_number}>
                      {n.phone_number}{n.messaging_service_name ? ` — ${n.messaging_service_name}` : ''}
                    </SelectItem>
                  ))}
                  {unregisteredNumbers.map((n: any) => (
                    <SelectItem key={n.sid} value={n.phone_number}>
                      {n.phone_number} — Not A2P registered
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {campaignSmsFromNumber !== 'rotation' && unregisteredNumbers.some((n: any) => n.phone_number === campaignSmsFromNumber) && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This number is not A2P registered. Text deliverability may be degraded until you register it.
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Tabs defaultValue="numbers" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="numbers">Phone Numbers</TabsTrigger>
                <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                <TabsTrigger value="register">Register Number</TabsTrigger>
              </TabsList>

              <TabsContent value="numbers" className="space-y-3">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {a2pStatus.phone_numbers?.map((phone: any) => (
                      <div key={phone.sid} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-mono text-sm">{phone.phone_number}</p>
                          {phone.messaging_service_name && (
                            <p className="text-xs text-muted-foreground">{phone.messaging_service_name}</p>
                          )}
                        </div>
                        <Badge variant={phone.a2p_registered ? 'default' : 'destructive'}>
                          {phone.a2p_registered ? 'A2P Ready' : 'Not Registered'}
                        </Badge>
                      </div>
                    ))}
                    {(!a2pStatus.phone_numbers || a2pStatus.phone_numbers.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No phone numbers found</p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="campaigns" className="space-y-3">
                <ScrollArea className="h-[200px]">
                  <div className="space-y-2">
                    {a2pStatus.campaigns?.map((campaign: any) => (
                      <div key={campaign.sid} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{campaign.use_case}</p>
                          <p className="text-xs text-muted-foreground">{campaign.messaging_service_name}</p>
                        </div>
                        <Badge variant={campaign.status === 'VERIFIED' ? 'default' : 'secondary'}>
                          {campaign.status}
                        </Badge>
                      </div>
                    ))}
                    {(!a2pStatus.campaigns || a2pStatus.campaigns.length === 0) && (
                      <p className="text-sm text-muted-foreground text-center py-4">No A2P campaigns found</p>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value="register" className="space-y-4">
                {unregisteredNumbers.length === 0 ? (
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      All your phone numbers are registered for A2P messaging!
                    </AlertDescription>
                  </Alert>
                ) : a2pStatus.messaging_services?.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      No messaging services found. Create a messaging service and A2P campaign in Twilio first.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Select Unregistered Number</Label>
                      <Select value={selectedNumber} onValueChange={setSelectedNumber}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a phone number" />
                        </SelectTrigger>
                        <SelectContent>
                          {unregisteredNumbers.map((n: any) => (
                            <SelectItem key={n.sid} value={n.phone_number}>
                              {n.phone_number}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Select Messaging Service</Label>
                      <Select value={selectedService} onValueChange={setSelectedService}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a messaging service" />
                        </SelectTrigger>
                        <SelectContent>
                          {a2pStatus.messaging_services?.map((s: any) => (
                            <SelectItem key={s.sid} value={s.sid}>
                              {s.friendly_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button 
                      onClick={handleAddNumberToCampaign} 
                      disabled={!selectedNumber || !selectedService || addingNumber}
                      className="w-full"
                    >
                      {addingNumber ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Number to A2P Campaign
                    </Button>
                  </>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" onClick={loadA2PStatus} disabled={loading}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => {
                onOpenChange(false);
                onFixed?.();
              }}>
                Done
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ===== Phone Numbers Dialog =====
export const PhoneNumbersFixDialog: React.FC<FixDialogProps> = ({ open, onOpenChange, onFixed }) => {
  const [phones, setPhones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) loadPhones();
  }, [open]);

  const loadPhones = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setPhones(data || []);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Phone Numbers
          </DialogTitle>
          <DialogDescription>
            Manage your phone numbers for calling and SMS
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : phones.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No phone numbers found. Purchase numbers from your provider (Twilio, Telnyx) 
                and add them here.
              </AlertDescription>
            </Alert>
          ) : (
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {phones.map(phone => (
                  <div key={phone.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <p className="font-mono text-sm">{phone.number}</p>
                      <p className="text-xs text-muted-foreground">{phone.provider || 'Unknown provider'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {phone.retell_phone_id ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">Retell Ready</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">Not in Retell</Badge>
                      )}
                      <Badge variant={phone.status === 'active' ? 'default' : 'secondary'}>
                        {phone.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={loadPhones}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              className="flex-1"
              onClick={() => {
                onOpenChange(false);
                // Navigate to phone numbers tab
                window.history.pushState({}, '', '/?tab=phone-numbers');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Phone Numbers
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===== Leads Fix Dialog =====
export const LeadsFixDialog: React.FC<FixDialogProps> = ({ open, onOpenChange, campaignId, onFixed }) => {
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (open) loadLeads();
  }, [open]);

  const loadLeads = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Get leads not already in campaign
      const { data: campaignLeads } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);
      
      const attachedIds = (campaignLeads || []).map(cl => cl.lead_id);
      
      const { data } = await supabase
        .from('leads')
        .select('id, first_name, last_name, phone_number, status')
        .eq('user_id', user.id)
        .not('id', 'in', attachedIds.length > 0 ? `(${attachedIds.join(',')})` : '(00000000-0000-0000-0000-000000000000)')
        .order('created_at', { ascending: false })
        .limit(100);
      
      setLeads(data || []);
    }
    setLoading(false);
  };

  const handleAddLeads = async () => {
    if (selectedLeads.length === 0) return;
    
    setAdding(true);
    try {
      const inserts = selectedLeads.map(leadId => ({
        campaign_id: campaignId,
        lead_id: leadId
      }));
      
      const { error } = await supabase
        .from('campaign_leads')
        .insert(inserts);
      
      if (error) throw error;
      
      toast.success(`Added ${selectedLeads.length} lead(s) to campaign`);
      setSelectedLeads([]);
      onFixed?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding leads:', error);
      toast.error('Failed to add leads');
    } finally {
      setAdding(false);
    }
  };

  const toggleAll = () => {
    if (selectedLeads.length === leads.length) {
      setSelectedLeads([]);
    } else {
      setSelectedLeads(leads.map(l => l.id));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Add Leads to Campaign
          </DialogTitle>
          <DialogDescription>
            Select leads to add to this campaign
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : leads.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No available leads found. Upload leads or all leads are already attached.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={toggleAll}>
                  {selectedLeads.length === leads.length ? 'Deselect All' : 'Select All'}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {selectedLeads.length} selected
                </span>
              </div>
              
              <ScrollArea className="h-[250px] border rounded-lg">
                <div className="p-2 space-y-1">
                  {leads.map(lead => (
                    <div 
                      key={lead.id} 
                      className={`flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-muted/50 ${
                        selectedLeads.includes(lead.id) ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => {
                        setSelectedLeads(prev => 
                          prev.includes(lead.id) 
                            ? prev.filter(id => id !== lead.id)
                            : [...prev, lead.id]
                        );
                      }}
                    >
                      <Checkbox checked={selectedLeads.includes(lead.id)} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {lead.first_name} {lead.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">{lead.phone_number}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{lead.status}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                window.history.pushState({}, '', '/?tab=leads');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload New Leads
            </Button>
            <Button 
              className="flex-1"
              onClick={handleAddLeads}
              disabled={selectedLeads.length === 0 || adding}
            >
              {adding ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Add {selectedLeads.length} Lead(s)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===== AI Agent Fix Dialog =====
export const AIAgentFixDialog: React.FC<FixDialogProps & { onAgentSelect?: (agentId: string) => void }> = ({ 
  open, onOpenChange, campaignId, onFixed, onAgentSelect 
}) => {
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadAgents();
  }, [open]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('retell-agent-management', {
        body: { action: 'list' }
      });
      setAgents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Error loading agents:', e);
    }
    setLoading(false);
  };

  const selectAgent = async (agentId: string) => {
    setSelecting(agentId);
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ agent_id: agentId })
        .eq('id', campaignId);
      
      if (error) throw error;
      
      toast.success('Agent assigned to campaign');
      onAgentSelect?.(agentId);
      onFixed?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error selecting agent:', error);
      toast.error('Failed to assign agent');
    } finally {
      setSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Select AI Agent
          </DialogTitle>
          <DialogDescription>
            Choose a Retell AI agent for this campaign's calls
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : agents.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                No AI agents found. Create an agent in your Retell dashboard first.
              </AlertDescription>
            </Alert>
          ) : (
            <ScrollArea className="h-[250px]">
              <div className="space-y-2">
                {agents.map(agent => (
                  <div 
                    key={agent.agent_id} 
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50"
                  >
                    <div>
                      <p className="font-medium text-sm">{agent.agent_name || 'Unnamed Agent'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{agent.agent_id}</p>
                    </div>
                    <Button 
                      size="sm"
                      onClick={() => selectAgent(agent.agent_id)}
                      disabled={selecting === agent.agent_id}
                    >
                      {selecting === agent.agent_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Select'
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={loadAgents}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              variant="outline"
              className="flex-1"
              onClick={() => window.open('https://beta.retellai.com/dashboard/agents', '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Create Agent in Retell
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===== Retell Phone Import Dialog =====
export const RetellPhoneFixDialog: React.FC<FixDialogProps> = ({ open, onOpenChange, onFixed }) => {
  const [localPhones, setLocalPhones] = useState<any[]>([]);
  const [retellPhones, setRetellPhones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<string | null>(null);

  useEffect(() => {
    if (open) loadPhones();
  }, [open]);

  const loadPhones = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get local phones
        const { data: local } = await supabase
          .from('phone_numbers')
          .select('*')
          .eq('user_id', user.id)
          .eq('status', 'active');
        setLocalPhones(local || []);

        // Get Retell phones
        const { data: retell } = await supabase.functions.invoke('retell-phone-management', {
          body: { action: 'list' }
        });
        setRetellPhones(Array.isArray(retell) ? retell : (retell?.phone_numbers || []));
      }
    } catch (e) {
      console.error('Error loading phones:', e);
    }
    setLoading(false);
  };

  const importToRetell = async (phone: any) => {
    setImporting(phone.number);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: { 
          action: 'import',
          phoneNumber: phone.number
        }
      });

      if (error) throw error;

      // Update local record with Retell ID
      await supabase
        .from('phone_numbers')
        .update({ retell_phone_id: data?.phone_number_id || `retell_${phone.number}` })
        .eq('id', phone.id);

      toast.success(`Imported ${phone.number} to Retell`);
      loadPhones();
      onFixed?.();
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import phone');
    } finally {
      setImporting(null);
    }
  };

  const phonesNotInRetell = localPhones.filter(p => !p.retell_phone_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Import Phone Numbers to Retell
          </DialogTitle>
          <DialogDescription>
            Phone numbers must be imported to Retell to make outbound AI calls
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : phonesNotInRetell.length === 0 ? (
            <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700 dark:text-green-300">
                All your phone numbers are already imported to Retell!
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {phonesNotInRetell.length} phone number(s) need to be imported to Retell for outbound calls.
                </AlertDescription>
              </Alert>

              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {phonesNotInRetell.map(phone => (
                    <div key={phone.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-mono text-sm">{phone.number}</p>
                        <p className="text-xs text-muted-foreground">{phone.provider}</p>
                      </div>
                      <Button 
                        size="sm"
                        onClick={() => importToRetell(phone)}
                        disabled={importing === phone.number}
                      >
                        {importing === phone.number ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Import
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={loadPhones}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===== Wait Steps Fix Dialog =====
export const WaitStepsFixDialog: React.FC<FixDialogProps & { workflowId?: string }> = ({ 
  open, onOpenChange, onFixed, workflowId 
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Configure Wait Steps
          </DialogTitle>
          <DialogDescription>
            Wait steps need delay times configured
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              One or more wait steps in your workflow don't have a delay time set. 
              Edit the workflow to configure delay minutes, hours, or days.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="font-medium">How to fix:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
              <li>Open the workflow editor</li>
              <li>Click on each wait step</li>
              <li>Set the delay time (minutes, hours, or days)</li>
              <li>Save the workflow</li>
            </ol>
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1"
              onClick={() => {
                onOpenChange(false);
                window.history.pushState({}, '', '/?tab=workflows');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              Open Workflow Editor
            </Button>
            <Button variant="outline" onClick={() => {
              onOpenChange(false);
              onFixed?.();
            }}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

// ===== AI SMS Settings Dialog =====
export const AISmsFixDialog: React.FC<FixDialogProps> = ({ open, onOpenChange, onFixed }) => {
  const [enabling, setEnabling] = useState(false);

  const enableAiSms = async () => {
    setEnabling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      await supabase
        .from('ai_sms_settings')
        .upsert({
          user_id: user.id,
          enabled: true,
          auto_response_enabled: true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      toast.success('AI SMS enabled');
      onFixed?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Error enabling AI SMS:', error);
      toast.error('Failed to enable AI SMS');
    } finally {
      setEnabling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Enable AI SMS
          </DialogTitle>
          <DialogDescription>
            Your workflow has AI SMS steps that require AI SMS to be enabled
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <Bot className="h-4 w-4" />
            <AlertDescription>
              AI SMS allows the system to automatically respond to leads using AI-generated messages.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2 pt-2">
            <Button 
              className="flex-1"
              onClick={enableAiSms}
              disabled={enabling}
            >
              {enabling ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
              Enable AI SMS Now
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                window.history.pushState({}, '', '/?tab=ai-sms');
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              Configure Settings
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
