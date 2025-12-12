import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Edit, Phone, Server, Shield, DollarSign, Check, AlertCircle } from 'lucide-react';
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

export function SipTrunkManager() {
  const [configs, setConfigs] = useState<SipTrunkConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<SipTrunkConfig> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
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

  const openNewDialog = () => {
    setEditingConfig({ ...defaultConfig });
    setIsDialogOpen(true);
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
            <Button onClick={openNewDialog} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Your First SIP Trunk
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {configs.map((config) => (
              <div
                key={config.id}
                className="flex items-center justify-between p-4 border rounded-lg bg-card"
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
                        <Badge variant="outline" className="text-xs">Inactive</Badge>
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
                  <div className="text-right mr-4">
                    <div className="flex items-center gap-1 text-sm text-green-600">
                      <DollarSign className="h-3 w-3" />
                      ${config.cost_per_minute?.toFixed(4)}/min
                    </div>
                  </div>
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
                    onClick={() => handleDelete(config.id)}
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

              {editingConfig?.provider_type === 'twilio' && (
                <>
                  <div>
                    <Label>Trunk SID</Label>
                    <Input
                      value={editingConfig?.twilio_trunk_sid || ''}
                      onChange={(e) => setEditingConfig(prev => ({ ...prev, twilio_trunk_sid: e.target.value }))}
                      placeholder="TKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                  </div>
                  <div>
                    <Label>Termination URI</Label>
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
      </CardContent>
    </Card>
  );
}
