import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Edit, Phone, Server, Shield, DollarSign, Check, AlertCircle, Zap, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SipTrunkConfig {
  id: string;
  name: string;
  provider_type: 'twilio' | 'telnyx' | 'generic';
  is_active: boolean;
  is_default: boolean;
  sip_host?: string;
  sip_port?: number;
  transport?: string;
  auth_type?: string;
  username?: string;
  twilio_trunk_sid?: string;
  twilio_termination_uri?: string;
  telnyx_connection_id?: string;
  outbound_proxy?: string;
  caller_id_header?: string;
  cost_per_minute?: number;
  created_at?: string;
}

interface TwilioTrunk {
  sid: string;
  friendly_name: string;
  domain_name: string;
  termination_uri: string;
  secure?: boolean;
  recording?: string;
  date_created: string;
}

interface TrunkSettings {
  recording: 'do-not-record' | 'record-from-ringing' | 'record-from-answer' | 'record-from-ringing-dual' | 'record-from-answer-dual';
  secure: boolean;
  cnamLookupEnabled: boolean;
}

interface TrunkPhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
  trunk_sid: string;
}

const defaultConfig: Partial<SipTrunkConfig> = {
  provider_type: 'generic',
  is_active: true,
  is_default: false,
  sip_port: 5060,
  transport: 'udp',
  auth_type: 'credentials',
  caller_id_header: 'P-Asserted-Identity',
  cost_per_minute: 0.007,
};

const defaultTrunkSettings: TrunkSettings = {
  recording: 'do-not-record',
  secure: false,
  cnamLookupEnabled: false,
};

export function SipTrunkManager() {
  const [configs, setConfigs] = useState<SipTrunkConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<SipTrunkConfig> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [twilioTrunks, setTwilioTrunks] = useState<TwilioTrunk[]>([]);
  const [isLoadingTrunks, setIsLoadingTrunks] = useState(false);
  const [trunkSettings, setTrunkSettings] = useState<TrunkSettings>(defaultTrunkSettings);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [phoneNumbersDialogOpen, setPhoneNumbersDialogOpen] = useState(false);
  const [selectedTrunk, setSelectedTrunk] = useState<SipTrunkConfig | null>(null);
  const [trunkPhoneNumbers, setTrunkPhoneNumbers] = useState<TrunkPhoneNumber[]>([]);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [isLoadingPhoneNumbers, setIsLoadingPhoneNumbers] = useState(false);
  const [verifyingTrunkId, setVerifyingTrunkId] = useState<string | null>(null);
  const [verificationResults, setVerificationResults] = useState<Record<string, { verified: boolean; error?: string }>>({});
  const { toast } = useToast();

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('sip_trunk_configs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setConfigs((data as SipTrunkConfig[]) || []);
    } catch (error: any) {
      toast({
        title: "Error loading SIP configs",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingConfig?.name) {
      toast({
        title: "Name required",
        description: "Please enter a name for this SIP trunk configuration",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const configData = {
        ...editingConfig,
        user_id: user.id,
      };

      if (editingConfig.id) {
        // Update existing
        const { error } = await supabase
          .from('sip_trunk_configs')
          .update(configData)
          .eq('id', editingConfig.id);
        if (error) throw error;
        toast({ title: "SIP trunk updated" });
      } else {
        // Create new - ensure we have the required name field
        const insertData = {
          ...configData,
          name: configData.name!, // Assert that name exists (we validate above)
        };
        const { error } = await supabase
          .from('sip_trunk_configs')
          .insert([insertData]);
        if (error) throw error;
        toast({ title: "SIP trunk created" });
      }

      setIsDialogOpen(false);
      setEditingConfig(null);
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Error saving SIP config",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('sip_trunk_configs')
        .delete()
        .eq('id', id);
      if (error) throw error;
      toast({ title: "SIP trunk deleted" });
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Error deleting",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const setAsDefault = async (id: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Clear all defaults first
      await supabase
        .from('sip_trunk_configs')
        .update({ is_default: false })
        .eq('user_id', user.id);

      // Set new default
      await supabase
        .from('sip_trunk_configs')
        .update({ is_default: true })
        .eq('id', id);

      toast({ title: "Default SIP trunk updated" });
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Auto-provision a Twilio SIP trunk with settings
  const provisionTwilioTrunk = async (trunkName?: string, settings?: TrunkSettings) => {
    setIsProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { 
          action: 'create_sip_trunk', 
          trunkName: trunkName || `AutoDialer-${Date.now()}`,
          trunkSettings: settings || trunkSettings
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const trunk = data.trunk;
      
      // Save to our database
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error: dbError } = await supabase
        .from('sip_trunk_configs')
        .insert({
          user_id: user.id,
          name: trunk.friendly_name,
          provider_type: 'twilio',
          twilio_trunk_sid: trunk.sid,
          twilio_termination_uri: trunk.termination_uri,
          is_active: true,
          is_default: configs.length === 0,
          cost_per_minute: 0.007,
        });

      if (dbError) throw dbError;

      toast({ 
        title: "SIP Trunk Provisioned", 
        description: `Created "${trunk.friendly_name}" with recording: ${settings?.recording || 'do-not-record'}` 
      });
      setTrunkSettings(defaultTrunkSettings);
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Provisioning Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsProvisioning(false);
    }
  };

  // Manage phone numbers on trunk
  const openPhoneNumbersDialog = async (config: SipTrunkConfig) => {
    setSelectedTrunk(config);
    setPhoneNumbersDialogOpen(true);
    await loadTrunkPhoneNumbers(config.twilio_trunk_sid!);
    await loadAvailableNumbers();
  };

  const loadTrunkPhoneNumbers = async (trunkSid: string) => {
    setIsLoadingPhoneNumbers(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_trunk_phone_numbers', trunkSid }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setTrunkPhoneNumbers(data.phone_numbers || []);
    } catch (error: any) {
      toast({ title: "Error loading trunk numbers", description: error.message, variant: "destructive" });
    } finally {
      setIsLoadingPhoneNumbers(false);
    }
  };

  const loadAvailableNumbers = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_numbers' }
      });

      if (error) throw error;
      setAvailableNumbers(data.numbers || []);
    } catch (error: any) {
      console.error('Failed to load available numbers:', error);
    }
  };

  const addPhoneToTrunk = async (phoneNumberSid: string) => {
    if (!selectedTrunk?.twilio_trunk_sid) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { 
          action: 'add_phone_to_trunk', 
          trunkSid: selectedTrunk.twilio_trunk_sid,
          phoneNumberSid 
        }
      });

      if (error) throw error;
      if (data.error) {
        if (data.already_exists) {
          toast({ title: "Already assigned", description: "This number is already on a SIP trunk" });
        } else {
          throw new Error(data.error);
        }
        return;
      }

      toast({ title: "Phone added to trunk" });
      await loadTrunkPhoneNumbers(selectedTrunk.twilio_trunk_sid);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const removePhoneFromTrunk = async (phoneNumberSid: string) => {
    if (!selectedTrunk?.twilio_trunk_sid) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { 
          action: 'remove_phone_from_trunk', 
          trunkSid: selectedTrunk.twilio_trunk_sid,
          phoneNumberSid 
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({ title: "Phone removed from trunk" });
      await loadTrunkPhoneNumbers(selectedTrunk.twilio_trunk_sid);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Fetch existing Twilio SIP trunks
  const fetchTwilioTrunks = async () => {
    setIsLoadingTrunks(true);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_sip_trunks' }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      setTwilioTrunks(data.trunks || []);
    } catch (error: any) {
      console.error('Failed to fetch Twilio trunks:', error);
    } finally {
      setIsLoadingTrunks(false);
    }
  };

  // Verify a SIP trunk exists in Twilio
  const verifyTrunkInTwilio = async (config: SipTrunkConfig) => {
    if (!config.twilio_trunk_sid) {
      toast({ title: "No trunk SID", description: "This configuration doesn't have a Twilio trunk SID", variant: "destructive" });
      return;
    }
    
    setVerifyingTrunkId(config.id);
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'list_sip_trunks' }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const trunks = data.trunks || [];
      const found = trunks.find((t: TwilioTrunk) => t.sid === config.twilio_trunk_sid);
      
      if (found) {
        setVerificationResults(prev => ({ ...prev, [config.id]: { verified: true } }));
        toast({ title: "✅ Verified", description: `Trunk "${config.name}" exists in Twilio` });
      } else {
        setVerificationResults(prev => ({ ...prev, [config.id]: { verified: false, error: 'Not found in Twilio' } }));
        toast({ 
          title: "⚠️ Not Found", 
          description: `Trunk SID ${config.twilio_trunk_sid} not found in your Twilio account`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      setVerificationResults(prev => ({ ...prev, [config.id]: { verified: false, error: error.message } }));
      toast({ title: "Verification failed", description: error.message, variant: "destructive" });
    } finally {
      setVerifyingTrunkId(null);
    }
  };

  // Toggle trunk active state
  const toggleTrunkActive = async (config: SipTrunkConfig) => {
    try {
      const { error } = await supabase
        .from('sip_trunk_configs')
        .update({ is_active: !config.is_active })
        .eq('id', config.id);
      
      if (error) throw error;
      toast({ title: config.is_active ? "Trunk disabled" : "Trunk enabled" });
      loadConfigs();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Delete trunk from Twilio
  const deleteTrunkFromTwilio = async (config: SipTrunkConfig) => {
    if (!config.twilio_trunk_sid) {
      // Just delete from DB if no Twilio SID
      await handleDelete(config.id);
      return;
    }
    
    try {
      const { data, error } = await supabase.functions.invoke('twilio-integration', {
        body: { action: 'delete_sip_trunk', trunkSid: config.twilio_trunk_sid }
      });

      if (error) throw error;
      if (data.error) {
        // If trunk doesn't exist in Twilio, just delete from DB
        if (data.error.includes('not found') || data.error.includes('404')) {
          await handleDelete(config.id);
          toast({ title: "Removed", description: "Trunk removed from database (was not in Twilio)" });
          return;
        }
        throw new Error(data.error);
      }

      await handleDelete(config.id);
      toast({ title: "Deleted", description: "Trunk deleted from Twilio and database" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  // Import an existing Twilio trunk
  const importExistingTrunk = async (trunk: TwilioTrunk) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Check if already imported
      const existing = configs.find(c => c.twilio_trunk_sid === trunk.sid);
      if (existing) {
        toast({ title: "Already imported", description: "This trunk is already in your configuration" });
        return;
      }

      const { error: dbError } = await supabase
        .from('sip_trunk_configs')
        .insert({
          user_id: user.id,
          name: trunk.friendly_name,
          provider_type: 'twilio',
          twilio_trunk_sid: trunk.sid,
          twilio_termination_uri: trunk.termination_uri,
          is_active: true,
          is_default: configs.length === 0,
          cost_per_minute: 0.007,
        });

      if (dbError) throw dbError;

      toast({ title: "Trunk Imported", description: `Imported "${trunk.friendly_name}"` });
      loadConfigs();
    } catch (error: any) {
      toast({
        title: "Import Failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const openNewDialog = () => {
    setEditingConfig({ ...defaultConfig });
    setIsDialogOpen(true);
    fetchTwilioTrunks(); // Fetch existing trunks when opening dialog
  };

  const openEditDialog = (config: SipTrunkConfig) => {
    setEditingConfig({ ...config });
    setIsDialogOpen(true);
  };

  const getProviderIcon = (type: string) => {
    switch (type) {
      case 'twilio': return <Phone className="h-4 w-4" />;
      case 'telnyx': return <Server className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getProviderColor = (type: string) => {
    switch (type) {
      case 'twilio': return 'bg-red-500/10 text-red-500';
      case 'telnyx': return 'bg-green-500/10 text-green-500';
      default: return 'bg-blue-500/10 text-blue-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              SIP Trunk Configuration
            </CardTitle>
            <CardDescription>
              Configure SIP trunks for cheaper outbound calling (up to 50% savings)
            </CardDescription>
          </div>
          <Button onClick={openNewDialog} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add SIP Trunk
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 border border-dashed rounded-lg">
            <Server className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-2">No SIP trunks configured</p>
            <p className="text-sm text-muted-foreground mb-4">
              SIP trunking can reduce your calling costs by up to 50%
            </p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => provisionTwilioTrunk()} disabled={isProvisioning} size="sm">
                {isProvisioning ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4 mr-1" />
                )}
                Auto-Create Twilio Trunk
              </Button>
              <Button onClick={openNewDialog} variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Manual Setup
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`flex items-center justify-between p-4 border rounded-lg ${config.is_active ? 'bg-card' : 'bg-muted/50 opacity-75'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${getProviderColor(config.provider_type)}`}>
                    {getProviderIcon(config.provider_type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{config.name}</span>
                      {config.is_default && (
                        <Badge variant="secondary" className="text-xs">Default</Badge>
                      )}
                      {!config.is_active && (
                        <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-600 border-yellow-500/30">Disabled</Badge>
                      )}
                      {config.is_active && verificationResults[config.id]?.verified && (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-500/30">
                          <Check className="h-3 w-3 mr-1" />
                          Verified
                        </Badge>
                      )}
                      {verificationResults[config.id]?.verified === false && (
                        <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Not Found
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {config.provider_type === 'twilio' && config.twilio_termination_uri}
                      {config.provider_type === 'telnyx' && `Connection: ${config.telnyx_connection_id}`}
                      {config.provider_type === 'generic' && `${config.sip_host}:${config.sip_port}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right mr-2">
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <DollarSign className="h-3 w-3" />
                      ${config.cost_per_minute?.toFixed(4)}/min
                    </div>
                  </div>
                  
                  {/* Active Toggle */}
                  <div className="flex items-center gap-1 mr-2">
                    <Switch
                      checked={config.is_active}
                      onCheckedChange={() => toggleTrunkActive(config)}
                      className="scale-75"
                    />
                    <span className="text-xs text-muted-foreground">Active</span>
                  </div>
                  
                  {/* Verify in Twilio */}
                  {config.provider_type === 'twilio' && config.twilio_trunk_sid && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => verifyTrunkInTwilio(config)}
                      disabled={verifyingTrunkId === config.id}
                    >
                      {verifyingTrunkId === config.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Verify
                    </Button>
                  )}
                  
                  {config.provider_type === 'twilio' && config.twilio_trunk_sid && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openPhoneNumbersDialog(config)}
                    >
                      <Phone className="h-4 w-4 mr-1" />
                      Numbers
                    </Button>
                  )}
                  {!config.is_default && config.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAsDefault(config.id)}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditDialog(config)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTrunkFromTwilio(config)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingConfig?.id ? 'Edit SIP Trunk' : 'Add SIP Trunk'}
              </DialogTitle>
              <DialogDescription>
                Configure SIP trunking for lower-cost outbound calls
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={editingConfig?.name || ''}
                  onChange={(e) => setEditingConfig(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My SIP Trunk"
                />
              </div>

              <div>
                <Label>Provider Type</Label>
                <Select
                  value={editingConfig?.provider_type || 'generic'}
                  onValueChange={(value: 'twilio' | 'telnyx' | 'generic') => 
                    setEditingConfig(prev => ({ ...prev, provider_type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="twilio">Twilio Elastic SIP Trunk</SelectItem>
                    <SelectItem value="telnyx">Telnyx SIP</SelectItem>
                    <SelectItem value="generic">Generic / Wholesale Provider</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editingConfig?.provider_type === 'twilio' && !editingConfig?.id && (
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">Quick Setup</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    >
                      {showAdvancedSettings ? 'Hide' : 'Show'} Settings
                    </Button>
                  </div>
                  
                  {showAdvancedSettings && (
                    <div className="space-y-3 p-3 bg-background rounded border">
                      <div>
                        <Label className="text-xs">Call Recording</Label>
                        <Select
                          value={trunkSettings.recording}
                          onValueChange={(value: any) => setTrunkSettings(prev => ({ ...prev, recording: value }))}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="do-not-record">Do Not Record</SelectItem>
                            <SelectItem value="record-from-ringing">Record from Ringing</SelectItem>
                            <SelectItem value="record-from-answer">Record from Answer</SelectItem>
                            <SelectItem value="record-from-ringing-dual">Record Dual (from Ringing)</SelectItem>
                            <SelectItem value="record-from-answer-dual">Record Dual (from Answer)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">Secure (TLS)</Label>
                        <Switch
                          checked={trunkSettings.secure}
                          onCheckedChange={(checked) => setTrunkSettings(prev => ({ ...prev, secure: checked }))}
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <Label className="text-xs">CNAM Lookup</Label>
                        <Switch
                          checked={trunkSettings.cnamLookupEnabled}
                          onCheckedChange={(checked) => setTrunkSettings(prev => ({ ...prev, cnamLookupEnabled: checked }))}
                        />
                      </div>
                    </div>
                  )}
                  
                  <Button 
                    onClick={() => {
                      provisionTwilioTrunk(editingConfig?.name, trunkSettings);
                      setIsDialogOpen(false);
                    }} 
                    disabled={isProvisioning}
                    className="w-full"
                    size="sm"
                  >
                    {isProvisioning ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4 mr-2" />
                    )}
                    Auto-Create New Trunk in Twilio
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-muted px-2 text-muted-foreground">Or import existing</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={fetchTwilioTrunks}
                      disabled={isLoadingTrunks}
                      className="flex-1"
                    >
                      {isLoadingTrunks ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Fetch Existing Trunks
                    </Button>
                  </div>
                  
                  {twilioTrunks.length > 0 && (
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {twilioTrunks.map(trunk => (
                        <div 
                          key={trunk.sid} 
                          className="flex items-center justify-between p-2 bg-background rounded border text-sm"
                        >
                          <div>
                            <div className="font-medium">{trunk.friendly_name}</div>
                            <div className="text-xs text-muted-foreground">{trunk.termination_uri}</div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              importExistingTrunk(trunk);
                              setIsDialogOpen(false);
                            }}
                          >
                            Import
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-muted px-2 text-muted-foreground">Or enter manually</span>
                    </div>
                  </div>
                </div>
              )}

              {editingConfig?.provider_type === 'twilio' && (
                <>
                  <div>
                    <Label>Trunk SID {!editingConfig?.id && "(optional - auto-filled if created above)"}</Label>
                    <Input
                      value={editingConfig?.twilio_trunk_sid || ''}
                      onChange={(e) => setEditingConfig(prev => ({ ...prev, twilio_trunk_sid: e.target.value }))}
                      placeholder="TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </div>
                  <div>
                    <Label>Termination URI {!editingConfig?.id && "(optional - auto-filled if created above)"}</Label>
                    <Input
                      value={editingConfig?.twilio_termination_uri || ''}
                      onChange={(e) => setEditingConfig(prev => ({ ...prev, twilio_termination_uri: e.target.value }))}
                      placeholder="yourtrunk.pstn.twilio.com"
                    />
                  </div>
                </>
              )}

              {editingConfig?.provider_type === 'telnyx' && (
                <div>
                  <Label>Connection ID</Label>
                  <Input
                    value={editingConfig?.telnyx_connection_id || ''}
                    onChange={(e) => setEditingConfig(prev => ({ ...prev, telnyx_connection_id: e.target.value }))}
                    placeholder="1234567890"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Find this in your Telnyx Portal under Connections
                  </p>
                </div>
              )}

              {editingConfig?.provider_type === 'generic' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>SIP Host</Label>
                      <Input
                        value={editingConfig?.sip_host || ''}
                        onChange={(e) => setEditingConfig(prev => ({ ...prev, sip_host: e.target.value }))}
                        placeholder="sip.provider.com"
                      />
                    </div>
                    <div>
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={editingConfig?.sip_port || 5060}
                        onChange={(e) => setEditingConfig(prev => ({ ...prev, sip_port: parseInt(e.target.value) }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Transport</Label>
                    <Select
                      value={editingConfig?.transport || 'udp'}
                      onValueChange={(value) => setEditingConfig(prev => ({ ...prev, transport: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="udp">UDP</SelectItem>
                        <SelectItem value="tcp">TCP</SelectItem>
                        <SelectItem value="tls">TLS (Secure)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Authentication Type</Label>
                    <Select
                      value={editingConfig?.auth_type || 'credentials'}
                      onValueChange={(value) => setEditingConfig(prev => ({ ...prev, auth_type: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credentials">Username/Password</SelectItem>
                        <SelectItem value="ip_whitelist">IP Whitelist</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editingConfig?.auth_type === 'credentials' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Username</Label>
                        <Input
                          value={editingConfig?.username || ''}
                          onChange={(e) => setEditingConfig(prev => ({ ...prev, username: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Password</Label>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          onChange={(e) => setEditingConfig(prev => ({ ...prev, password_encrypted: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                  <div>
                    <Label>Outbound Proxy (Optional)</Label>
                    <Input
                      value={editingConfig?.outbound_proxy || ''}
                      onChange={(e) => setEditingConfig(prev => ({ ...prev, outbound_proxy: e.target.value }))}
                      placeholder="proxy.provider.com"
                    />
                  </div>
                  <div>
                    <Label>Caller ID Header</Label>
                    <Select
                      value={editingConfig?.caller_id_header || 'P-Asserted-Identity'}
                      onValueChange={(value) => setEditingConfig(prev => ({ ...prev, caller_id_header: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="P-Asserted-Identity">P-Asserted-Identity</SelectItem>
                        <SelectItem value="From">From</SelectItem>
                        <SelectItem value="Remote-Party-ID">Remote-Party-ID</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
                <Label>Cost Per Minute ($)</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={editingConfig?.cost_per_minute || 0.007}
                  onChange={(e) => setEditingConfig(prev => ({ ...prev, cost_per_minute: parseFloat(e.target.value) }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Used for cost tracking and budget calculations
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={editingConfig?.is_active ?? true}
                  onCheckedChange={(checked) => setEditingConfig(prev => ({ ...prev, is_active: checked }))}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Phone Numbers Management Dialog */}
        <Dialog open={phoneNumbersDialogOpen} onOpenChange={setPhoneNumbersDialogOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Manage Trunk Phone Numbers
              </DialogTitle>
              <DialogDescription>
                {selectedTrunk?.name} - Add or remove phone numbers from this SIP trunk
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Current trunk numbers */}
              <div>
                <Label className="text-sm font-medium">Numbers on This Trunk</Label>
                {isLoadingPhoneNumbers ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : trunkPhoneNumbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No phone numbers assigned to this trunk yet</p>
                ) : (
                  <div className="space-y-2 mt-2">
                    {trunkPhoneNumbers.map(num => (
                      <div key={num.sid} className="flex items-center justify-between p-2 border rounded bg-muted/50">
                        <div>
                          <span className="font-medium">{num.phone_number}</span>
                          {num.friendly_name && (
                            <span className="text-xs text-muted-foreground ml-2">{num.friendly_name}</span>
                          )}
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => removePhoneFromTrunk(num.sid)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Available numbers to add */}
              <div>
                <Label className="text-sm font-medium">Add Phone Numbers</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select from your Twilio account phone numbers
                </p>
                {availableNumbers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No available numbers found</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {availableNumbers
                      .filter(num => !trunkPhoneNumbers.some(tn => tn.phone_number === num.phone_number))
                      .map(num => (
                        <div key={num.sid} className="flex items-center justify-between p-2 border rounded">
                          <div>
                            <span className="font-medium">{num.phone_number}</span>
                            {num.friendly_name && (
                              <span className="text-xs text-muted-foreground ml-2">{num.friendly_name}</span>
                            )}
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => addPhoneToTrunk(num.sid)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setPhoneNumbersDialogOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
