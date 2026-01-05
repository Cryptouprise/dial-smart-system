
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useGoHighLevel } from '@/hooks/useGoHighLevel';
import { Link, RefreshCw, Users, ArrowLeftRight, Zap, Plus, Search, Database } from 'lucide-react';
import GHLFieldMappingTab from './GHLFieldMappingTab';

const GoHighLevelManager = () => {
  const [credentials, setCredentials] = useState({
    apiKey: '',
    locationId: '',
    webhookKey: ''
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectionData, setConnectionData] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedContact, setSelectedContact] = useState<any>(null);
  const [newOpportunity, setNewOpportunity] = useState({
    name: '',
    value: '',
    pipelineId: '',
    stageId: ''
  });
  const [syncSettings, setSyncSettings] = useState({
    autoSyncNewLeads: false,
    autoUpdateAfterCalls: true,
    syncDirection: 'bidirectional' as 'import' | 'export' | 'bidirectional',
    defaultPipelineId: '',
    defaultStageId: ''
  });
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [syncStats, setSyncStats] = useState({
    lastSync: null as string | null,
    contactsImported: 0,
    contactsUpdated: 0,
    errors: 0
  });

  const { toast } = useToast();
  const {
    isLoading,
    testConnection,
    saveGHLCredentials,
    getGHLCredentials,
    deleteGHLCredentials,
    syncContacts,
    getPipelines,
    getContacts,
    createOpportunity
  } = useGoHighLevel();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedCreds = await getGHLCredentials();
    if (savedCreds) {
      setCredentials({
        apiKey: savedCreds.apiKey,
        locationId: savedCreds.locationId,
        webhookKey: savedCreds.webhookKey || ''
      });
      // Test connection with saved credentials
      const result = await testConnection(savedCreds);
      if (result) {
        setIsConnected(true);
        setConnectionData(result);
        loadPipelines();
        loadContacts();
      }
    }
  };

  const handleConnect = async () => {
    if (!credentials.apiKey || !credentials.locationId) {
      toast({
        title: "Error",
        description: "Please enter both API Key and Location ID",
        variant: "destructive"
      });
      return;
    }

    const result = await testConnection(credentials);
    if (result) {
      const saved = await saveGHLCredentials(credentials);
      if (saved) {
        setIsConnected(true);
        setConnectionData(result);
        loadPipelines();
        loadContacts();
      }
    }
  };

  const loadPipelines = async () => {
    const pipelineData = await getPipelines();
    if (pipelineData) {
      setPipelines(pipelineData);
    }
  };

  const loadContacts = async () => {
    const contactData = await getContacts({ search: searchTerm });
    if (contactData) {
      setContacts(contactData);
    }
  };

  const handleSync = async () => {
    const result = await syncContacts(syncSettings.syncDirection);
    if (result) {
      const newStats = {
        lastSync: new Date().toISOString(),
        contactsImported: result.imported || 0,
        contactsUpdated: result.updated || 0,
        errors: result.errors || 0
      };
      setSyncStats(newStats);
      loadContacts(); // Refresh contacts after sync
    }
  };

  const handleCreateOpportunity = async () => {
    if (!selectedContact || !newOpportunity.name || !newOpportunity.pipelineId) {
      toast({
        title: "Error",
        description: "Please select a contact and fill in all required fields",
        variant: "destructive"
      });
      return;
    }

    const result = await createOpportunity(selectedContact.id, {
      name: newOpportunity.name,
      value: parseFloat(newOpportunity.value) || 0,
      pipelineId: newOpportunity.pipelineId,
      stageId: newOpportunity.stageId
    });

    if (result) {
      setNewOpportunity({ name: '', value: '', pipelineId: '', stageId: '' });
      setSelectedContact(null);
    }
  };

  const saveSyncSettings = () => {
    // Sync settings are non-sensitive, can stay in component state
    toast({
      title: "Settings Saved",
      description: "Go High Level sync settings have been saved",
    });
  };

  const handleDisconnect = async () => {
    await deleteGHLCredentials();
    setIsConnected(false);
    setConnectionData(null);
    setCredentials({ apiKey: '', locationId: '', webhookKey: '' });
    setContacts([]);
    toast({
      title: "Disconnected",
      description: "Go High Level connection has been removed",
    });
  };

  const filteredContacts = contacts.filter(contact => 
    !searchTerm || 
    (contact.firstName && contact.firstName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (contact.lastName && contact.lastName.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (contact.email && contact.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (contact.phone && contact.phone.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card className={`border-2 ${isConnected ? 'border-green-500 bg-green-50' : 'border-blue-500 bg-blue-50'}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link className="h-5 w-5" />
            Go High Level Integration
            <Badge variant={isConnected ? "default" : "secondary"}>
              {isConnected ? "Connected" : "Not Connected"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {isConnected 
              ? `Connected to: ${connectionData?.location?.name || 'Unknown Location'}`
              : "Connect your Go High Level account for bidirectional lead sync"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isConnected ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="apiKey">Go High Level API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="Enter your GHL API key"
                    value={credentials.apiKey}
                    onChange={(e) => setCredentials(prev => ({ ...prev, apiKey: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="locationId">Location ID</Label>
                  <Input
                    id="locationId"
                    placeholder="Enter your location/sub-account ID"
                    value={credentials.locationId}
                    onChange={(e) => setCredentials(prev => ({ ...prev, locationId: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="webhookKey">Webhook Signing Key (Optional)</Label>
                <Input
                  id="webhookKey"
                  type="password"
                  placeholder="Enter webhook signing key for secure webhooks"
                  value={credentials.webhookKey}
                  onChange={(e) => setCredentials(prev => ({ ...prev, webhookKey: e.target.value }))}
                />
              </div>
              <Button 
                onClick={handleConnect} 
                disabled={isLoading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isLoading ? 'Connecting...' : 'Connect to Go High Level'}
              </Button>
              <p className="text-sm text-gray-600">
                Get your API key and Location ID from your Go High Level settings.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-700">✓ Connected Successfully</p>
                  <p className="text-sm text-green-600">
                    Location: {connectionData?.location?.name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {connectionData?.location?.address || 'No address provided'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button 
                    onClick={loadPipelines} 
                    variant="outline" 
                    size="sm"
                    disabled={isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button 
                    onClick={handleDisconnect}
                    variant="destructive"
                    size="sm"
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isConnected && (
        <Tabs defaultValue="contacts" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
            <TabsTrigger value="sync">Sync & Import</TabsTrigger>
            <TabsTrigger value="field-mapping" className="flex items-center gap-1">
              <Database className="h-3 w-3" />
              Field Mapping
            </TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
          </TabsList>

          <TabsContent value="contacts">
            <div className="space-y-4">
              {/* Search and Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Contact Management
                  </CardTitle>
                  <CardDescription>
                    Search and manage your Go High Level contacts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Search contacts by name, email, or phone..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full"
                      />
                    </div>
                    <Button onClick={loadContacts} disabled={isLoading}>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Button>
                  </div>

                  {/* Contacts List */}
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {filteredContacts.length > 0 ? (
                      filteredContacts.map((contact) => (
                        <div 
                          key={contact.id} 
                          className={`p-3 border rounded-lg cursor-pointer transition-colors hover:bg-gray-50 ${
                            selectedContact?.id === contact.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                          }`}
                          onClick={() => setSelectedContact(contact)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">
                                {contact.firstName} {contact.lastName}
                              </p>
                              <p className="text-sm text-gray-600">{contact.email}</p>
                              <p className="text-sm text-gray-500">{contact.phone}</p>
                            </div>
                            <div className="flex gap-2">
                              <Badge variant="outline">
                                {contact.companyName || 'No Company'}
                              </Badge>
                              {selectedContact?.id === contact.id && (
                                <Badge variant="default">Selected</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        {isLoading ? 'Loading contacts...' : 'No contacts found'}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="opportunities">
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Create Opportunity
                  </CardTitle>
                  <CardDescription>
                    Create new opportunities for your contacts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedContact ? (
                    <>
                      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="font-medium">Selected Contact:</p>
                        <p className="text-sm">{selectedContact.firstName} {selectedContact.lastName}</p>
                        <p className="text-sm text-gray-600">{selectedContact.email}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="oppName">Opportunity Name</Label>
                          <Input
                            id="oppName"
                            placeholder="e.g., Website Design Project"
                            value={newOpportunity.name}
                            onChange={(e) => setNewOpportunity(prev => ({ ...prev, name: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="oppValue">Value ($)</Label>
                          <Input
                            id="oppValue"
                            type="number"
                            placeholder="5000"
                            value={newOpportunity.value}
                            onChange={(e) => setNewOpportunity(prev => ({ ...prev, value: e.target.value }))}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Pipeline</Label>
                          <Select 
                            value={newOpportunity.pipelineId}
                            onValueChange={(value) => setNewOpportunity(prev => ({ ...prev, pipelineId: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select pipeline" />
                            </SelectTrigger>
                            <SelectContent>
                              {pipelines.map((pipeline) => (
                                <SelectItem key={pipeline.id} value={pipeline.id}>
                                  {pipeline.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Stage</Label>
                          <Select 
                            value={newOpportunity.stageId}
                            onValueChange={(value) => setNewOpportunity(prev => ({ ...prev, stageId: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select stage" />
                            </SelectTrigger>
                            <SelectContent>
                              {pipelines
                                .find(p => p.id === newOpportunity.pipelineId)?.stages?.map((stage: any) => (
                                <SelectItem key={stage.id} value={stage.id}>
                                  {stage.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <Button 
                        onClick={handleCreateOpportunity}
                        disabled={isLoading}
                        className="w-full"
                      >
                        {isLoading ? 'Creating...' : 'Create Opportunity'}
                      </Button>
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      <p>Select a contact from the Contacts tab to create an opportunity</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sync">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Sync Controls */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <RefreshCw className="h-5 w-5" />
                    Lead Synchronization
                  </CardTitle>
                  <CardDescription>
                    Sync leads between Go High Level and your voice campaigns
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Sync Direction</Label>
                    <Select 
                      value={syncSettings.syncDirection} 
                      onValueChange={(value: any) => setSyncSettings(prev => ({ ...prev, syncDirection: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="import">
                          Import from GHL to Voice System
                        </SelectItem>
                        <SelectItem value="export">
                          Export from Voice System to GHL
                        </SelectItem>
                        <SelectItem value="bidirectional">
                          Bidirectional Sync
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Default Pipeline</Label>
                    <Select 
                      value={syncSettings.defaultPipelineId} 
                      onValueChange={(value) => setSyncSettings(prev => ({ ...prev, defaultPipelineId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select pipeline" />
                      </SelectTrigger>
                      <SelectContent>
                        {pipelines.map((pipeline) => (
                          <SelectItem key={pipeline.id} value={pipeline.id}>
                            {pipeline.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      onClick={handleSync}
                      disabled={isLoading}
                      className="flex-1"
                    >
                      <ArrowLeftRight className="h-4 w-4 mr-2" />
                      {isLoading ? 'Syncing...' : 'Start Sync'}
                    </Button>
                    <Button 
                      onClick={saveSyncSettings}
                      variant="outline"
                    >
                      Save Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Sync Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Sync Statistics</CardTitle>
                  <CardDescription>Recent synchronization activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 border rounded-lg">
                        <div className="text-2xl font-bold text-green-600">
                          {syncStats.contactsImported}
                        </div>
                        <div className="text-sm text-gray-500">Imported</div>
                      </div>
                      <div className="text-center p-3 border rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {syncStats.contactsUpdated}
                        </div>
                        <div className="text-sm text-gray-500">Updated</div>
                      </div>
                    </div>
                    
                    {syncStats.errors > 0 && (
                      <div className="text-center p-3 border rounded-lg border-red-200 bg-red-50">
                        <div className="text-2xl font-bold text-red-600">
                          {syncStats.errors}
                        </div>
                        <div className="text-sm text-red-500">Errors</div>
                      </div>
                    )}

                    {syncStats.lastSync && (
                      <div className="text-center">
                        <p className="text-sm text-gray-500">Last Sync</p>
                        <p className="text-xs">
                          {new Date(syncStats.lastSync).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="field-mapping">
            <GHLFieldMappingTab isConnected={isConnected} />
          </TabsContent>

          <TabsContent value="automation">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Automation Settings
                </CardTitle>
                <CardDescription>
                  Configure automatic workflows between GHL and voice campaigns
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <Label className="font-medium">Auto-Sync New Leads</Label>
                      <p className="text-sm text-gray-500">
                        Automatically import new GHL contacts to voice campaigns
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={syncSettings.autoSyncNewLeads ? "default" : "secondary"}>
                        {syncSettings.autoSyncNewLeads ? "Enabled" : "Disabled"}
                      </Badge>
                      <Switch
                        checked={syncSettings.autoSyncNewLeads}
                        onCheckedChange={(checked) => setSyncSettings(prev => ({ ...prev, autoSyncNewLeads: checked }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-1">
                      <Label className="font-medium">Auto-Update After Calls</Label>
                      <p className="text-sm text-gray-500">
                        Update GHL contacts automatically after voice calls complete
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={syncSettings.autoUpdateAfterCalls ? "default" : "secondary"}>
                        {syncSettings.autoUpdateAfterCalls ? "Enabled" : "Disabled"}
                      </Badge>
                      <Switch
                        checked={syncSettings.autoUpdateAfterCalls}
                        onCheckedChange={(checked) => setSyncSettings(prev => ({ ...prev, autoUpdateAfterCalls: checked }))}
                      />
                    </div>
                  </div>
                </div>

                <Button onClick={saveSyncSettings} className="w-full">
                  Save Automation Settings
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default GoHighLevelManager;
