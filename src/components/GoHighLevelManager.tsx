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
import { Link, Settings, RefreshCw, Users, ArrowLeftRight, CheckCircle, XCircle, RefreshCw as RefreshIcon, Zap } from 'lucide-react';

const GoHighLevelManager = () => {
  const [credentials, setCredentials] = useState({
    apiKey: '',
    locationId: '',
    webhookKey: ''
  });
  const [isConnected, setIsConnected] = useState(false);
  const [connectionData, setConnectionData] = useState<any>(null);
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
    syncContacts,
    getPipelines
  } = useGoHighLevel();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const savedCreds = getGHLCredentials();
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
      }
    }

    const savedSyncSettings = localStorage.getItem('ghl-sync-settings');
    if (savedSyncSettings) {
      setSyncSettings(JSON.parse(savedSyncSettings));
    }

    const savedStats = localStorage.getItem('ghl-sync-stats');
    if (savedStats) {
      setSyncStats(JSON.parse(savedStats));
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
      saveGHLCredentials(credentials);
      setIsConnected(true);
      setConnectionData(result);
      loadPipelines();
    }
  };

  const loadPipelines = async () => {
    const pipelineData = await getPipelines();
    if (pipelineData) {
      setPipelines(pipelineData);
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
      localStorage.setItem('ghl-sync-stats', JSON.stringify(newStats));
    }
  };

  const saveSyncSettings = () => {
    localStorage.setItem('ghl-sync-settings', JSON.stringify(syncSettings));
    toast({
      title: "Settings Saved",
      description: "Go High Level sync settings have been saved",
    });
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setConnectionData(null);
    setCredentials({ apiKey: '', locationId: '', webhookKey: '' });
    const creds = JSON.parse(localStorage.getItem('api-credentials') || '[]');
    const filtered = creds.filter((c: any) => c.service !== 'gohighlevel');
    localStorage.setItem('api-credentials', JSON.stringify(filtered));
    toast({
      title: "Disconnected",
      description: "Go High Level connection has been removed",
    });
  };

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
        <Tabs defaultValue="sync" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sync">Lead Sync</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

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

          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>Integration Analytics</CardTitle>
                <CardDescription>
                  Performance metrics and sync health monitoring
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Integration Health */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 border rounded-lg">
                      <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                      <p className="font-medium">Connection Status</p>
                      <p className="text-sm text-green-600">Healthy</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                      <p className="font-medium">Total Contacts</p>
                      <p className="text-sm text-gray-600">Syncing...</p>
                    </div>
                    <div className="text-center p-4 border rounded-lg">
                      <RefreshCw className="h-8 w-8 text-purple-500 mx-auto mb-2" />
                      <p className="font-medium">Sync Rate</p>
                      <p className="text-sm text-gray-600">Real-time</p>
                    </div>
                  </div>

                  {/* Webhook Status */}
                  <div className="p-4 border rounded-lg bg-yellow-50">
                    <h3 className="font-medium mb-2">Webhook Configuration</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      Set up webhooks in GHL to enable real-time sync
                    </p>
                    <div className="text-xs bg-gray-100 p-2 rounded font-mono">
                      https://your-domain.com/api/ghl-webhook
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default GoHighLevelManager;
