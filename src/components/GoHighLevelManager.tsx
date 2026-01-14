
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
import { Link, RefreshCw, Users, ArrowLeftRight, Zap, Plus, Search, Database, Filter, Eye, X, Tag, Loader2 } from 'lucide-react';
import GHLFieldMappingTab from './GHLFieldMappingTab';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ImportFilters {
  tags: string[];
  excludeTags: string[];
  dateRange: { start: string; end: string } | null;
}

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
  
  // Import filter state
  const [ghlTags, setGhlTags] = useState<Array<{ id: string; name: string }>>([]);
  const [importFilters, setImportFilters] = useState<ImportFilters>({
    tags: [],
    excludeTags: [],
    dateRange: null
  });
  const [showFilters, setShowFilters] = useState(false);
  const [previewData, setPreviewData] = useState<{
    totalInGHL: number;
    matchingFilters: number;
    withValidPhone: number;
    sample: Array<{ name: string; phone: string; email?: string; tags: string[]; dateAdded?: string }>;
  } | null>(null);

  const { toast } = useToast();
  const {
    isLoading,
    isLoadingTags,
    isLoadingPreview,
    testConnection,
    saveGHLCredentials,
    getGHLCredentials,
    deleteGHLCredentials,
    syncContacts,
    getPipelines,
    getContacts,
    createOpportunity,
    getTags,
    previewFilteredContacts
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
        // Load data in parallel but await all to complete
        await Promise.all([
          loadPipelines(),
          loadContacts(),
          loadTags()
        ]);
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
        // Load data in parallel but await all to complete
        await Promise.all([
          loadPipelines(),
          loadContacts(),
          loadTags()
        ]);
      }
    }
  };

  const loadTags = async () => {
    const tagsData = await getTags();
    if (tagsData) {
      setGhlTags(tagsData);
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
    // Build filters object if any filters are set
    const hasFilters = importFilters.tags.length > 0 || 
                       importFilters.excludeTags.length > 0 || 
                       importFilters.dateRange !== null;
    
    const filtersToSend = hasFilters ? {
      tags: importFilters.tags.length > 0 ? importFilters.tags : undefined,
      excludeTags: importFilters.excludeTags.length > 0 ? importFilters.excludeTags : undefined,
      dateRange: importFilters.dateRange || undefined
    } : undefined;
    
    const result = await syncContacts(syncSettings.syncDirection, filtersToSend);
    if (result) {
      const newStats = {
        lastSync: new Date().toISOString(),
        contactsImported: result.imported || 0,
        contactsUpdated: result.updated || 0,
        errors: result.failed || 0
      };
      setSyncStats(newStats);
      setPreviewData(null); // Clear preview after sync
      loadContacts(); // Refresh contacts after sync
    }
  };

  const handlePreviewContacts = async () => {
    const hasFilters = importFilters.tags.length > 0 || 
                       importFilters.excludeTags.length > 0 || 
                       importFilters.dateRange !== null;
    
    const filtersToSend = {
      tags: importFilters.tags.length > 0 ? importFilters.tags : undefined,
      excludeTags: importFilters.excludeTags.length > 0 ? importFilters.excludeTags : undefined,
      dateRange: importFilters.dateRange || undefined
    };
    
    const preview = await previewFilteredContacts(filtersToSend);
    if (preview) {
      setPreviewData(preview);
    }
  };

  const clearFilters = () => {
    setImportFilters({
      tags: [],
      excludeTags: [],
      dateRange: null
    });
    setPreviewData(null);
  };

  const toggleTagFilter = (tagName: string, type: 'include' | 'exclude') => {
    if (type === 'include') {
      setImportFilters(prev => ({
        ...prev,
        tags: prev.tags.includes(tagName) 
          ? prev.tags.filter(t => t !== tagName)
          : [...prev.tags, tagName],
        excludeTags: prev.excludeTags.filter(t => t !== tagName) // Remove from exclude if adding to include
      }));
    } else {
      setImportFilters(prev => ({
        ...prev,
        excludeTags: prev.excludeTags.includes(tagName)
          ? prev.excludeTags.filter(t => t !== tagName)
          : [...prev.excludeTags, tagName],
        tags: prev.tags.filter(t => t !== tagName) // Remove from include if adding to exclude
      }));
    }
    setPreviewData(null); // Clear preview when filters change
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
            <div className="space-y-6">
              {/* Import Filters */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Filter className="h-5 w-5" />
                        Import Filters
                      </CardTitle>
                      <CardDescription>
                        Filter which contacts to import from GHL by tags, dates, etc.
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {(importFilters.tags.length > 0 || importFilters.excludeTags.length > 0 || importFilters.dateRange) && (
                        <Button variant="ghost" size="sm" onClick={clearFilters}>
                          <X className="h-4 w-4 mr-1" />
                          Clear Filters
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                      >
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                
                {showFilters && (
                  <CardContent className="space-y-4">
                    {/* Tag Filters */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Filter by Tags ({ghlTags.length} available)
                      </Label>
                      
                      {ghlTags.length > 0 ? (
                        <ScrollArea className="h-40 border rounded-lg p-3">
                          <div className="space-y-2">
                            {ghlTags.map(tag => {
                              const isIncluded = importFilters.tags.includes(tag.name);
                              const isExcluded = importFilters.excludeTags.includes(tag.name);
                              
                              return (
                                <div key={tag.id} className="flex items-center justify-between py-1">
                                  <span className="text-sm">{tag.name}</span>
                                  <div className="flex gap-1">
                                    <Button
                                      variant={isIncluded ? "default" : "outline"}
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => toggleTagFilter(tag.name, 'include')}
                                    >
                                      Include
                                    </Button>
                                    <Button
                                      variant={isExcluded ? "destructive" : "outline"}
                                      size="sm"
                                      className="h-7 text-xs"
                                      onClick={() => toggleTagFilter(tag.name, 'exclude')}
                                    >
                                      Exclude
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </ScrollArea>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground text-sm border rounded-lg">
                          <Button variant="ghost" size="sm" onClick={loadTags} disabled={isLoadingTags}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingTags ? 'animate-spin' : ''}`} />
                            {isLoadingTags ? 'Loading Tags...' : 'Load Tags from GHL'}
                          </Button>
                        </div>
                      )}
                      
                      {/* Active filters summary */}
                      {(importFilters.tags.length > 0 || importFilters.excludeTags.length > 0) && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {importFilters.tags.map(tag => (
                            <Badge key={`inc-${tag}`} variant="default" className="text-xs">
                              + {tag}
                              <X 
                                className="h-3 w-3 ml-1 cursor-pointer" 
                                onClick={() => toggleTagFilter(tag, 'include')}
                              />
                            </Badge>
                          ))}
                          {importFilters.excludeTags.map(tag => (
                            <Badge key={`exc-${tag}`} variant="destructive" className="text-xs">
                              - {tag}
                              <X 
                                className="h-3 w-3 ml-1 cursor-pointer" 
                                onClick={() => toggleTagFilter(tag, 'exclude')}
                              />
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Date Range Filter */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Date Added Range (Optional)</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">From</Label>
                          <Input
                            type="date"
                            value={importFilters.dateRange?.start || ''}
                            onChange={(e) => setImportFilters(prev => ({
                              ...prev,
                              dateRange: {
                                start: e.target.value,
                                end: prev.dateRange?.end || ''
                              }
                            }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">To</Label>
                          <Input
                            type="date"
                            value={importFilters.dateRange?.end || ''}
                            onChange={(e) => setImportFilters(prev => ({
                              ...prev,
                              dateRange: {
                                start: prev.dateRange?.start || '',
                                end: e.target.value
                              }
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* Preview Button */}
                    <Button
                      variant="outline"
                      onClick={handlePreviewContacts}
                      disabled={isLoadingPreview}
                      className="w-full"
                    >
                      {isLoadingPreview ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4 mr-2" />
                      )}
                      {isLoadingPreview ? 'Loading Preview...' : 'Preview Matching Contacts'}
                    </Button>
                    
                    {/* Preview Results */}
                    {previewData && (
                      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <div className="text-xl font-bold">{previewData.totalInGHL}</div>
                            <div className="text-xs text-muted-foreground">Total in GHL</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-primary">{previewData.matchingFilters}</div>
                            <div className="text-xs text-muted-foreground">Match Filters</div>
                          </div>
                          <div>
                            <div className="text-xl font-bold text-green-600">{previewData.withValidPhone}</div>
                            <div className="text-xs text-muted-foreground">Ready to Import</div>
                          </div>
                        </div>
                        
                        {previewData.sample.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium">Sample Contacts:</Label>
                            <ScrollArea className="h-32">
                              <div className="space-y-1">
                                {previewData.sample.map((contact, idx) => (
                                  <div key={idx} className="flex items-center justify-between text-sm p-1 bg-background rounded">
                                    <span>{contact.name}</span>
                                    <span className="text-muted-foreground text-xs">{contact.phone}</span>
                                  </div>
                                ))}
                              </div>
                            </ScrollArea>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>

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

                    {/* Show active filters summary */}
                    {(importFilters.tags.length > 0 || importFilters.excludeTags.length > 0) && (
                      <div className="p-2 border rounded bg-muted/30 text-xs">
                        <span className="font-medium">Active Filters: </span>
                        {importFilters.tags.length > 0 && (
                          <span className="text-green-600">+{importFilters.tags.length} tags </span>
                        )}
                        {importFilters.excludeTags.length > 0 && (
                          <span className="text-red-600">-{importFilters.excludeTags.length} tags</span>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button 
                        onClick={handleSync}
                        disabled={isLoading}
                        className="flex-1"
                      >
                        <ArrowLeftRight className="h-4 w-4 mr-2" />
                        {isLoading ? 'Syncing...' : previewData ? `Import ${previewData.withValidPhone} Contacts` : 'Start Sync'}
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
                          <div className="text-sm text-red-500">Failed</div>
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
