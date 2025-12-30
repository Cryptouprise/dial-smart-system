import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';
import { useGoHighLevel } from '@/hooks/useGoHighLevel';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import { RotateCcw, Upload, Users, RefreshCw, Database, Link, Phone, Mail, Building, MapPin, Edit, ChevronRight } from 'lucide-react';

interface Lead {
  id: string;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  status: string;
  priority?: number;
  notes?: string;
  tags?: string[];
  timezone?: string;
  lead_source?: string;
  created_at?: string;
  updated_at?: string;
  last_contacted_at?: string;
  next_callback_at?: string;
  do_not_call?: boolean;
  ghl_contact_id?: string;
}

const EnhancedLeadManager = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const { toast } = useToast();
  const { getLeads, createLead, importLeads, getCampaigns, addLeadsToCampaign, resetLeadsForCalling, isLoading } = usePredictiveDialing();
  const { getGHLCredentials, syncContacts, getContacts } = useGoHighLevel();

  useEffect(() => {
    loadData();
    checkGHLConnection();
  }, []);

  const loadData = async () => {
    const [leadsData, campaignsData] = await Promise.all([
      getLeads(),
      getCampaigns()
    ]);
    
    if (leadsData) setLeads(leadsData);
    if (campaignsData) setCampaigns(campaignsData);
  };

  const checkGHLConnection = () => {
    const creds = getGHLCredentials();
    setGhlConnected(!!creds);
  };

  const handleGHLSync = async () => {
    const result = await syncContacts('import');
    if (result) {
      loadData();
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        
        const leadsToImport = lines.slice(1)
          .filter(line => line.trim())
          .map(line => {
            const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
            const lead: any = {};
            
            headers.forEach((header, index) => {
              const value = values[index];
              if (!value) return;
              
              switch (header) {
                case 'phone':
                case 'phone_number':
                  lead.phone_number = value;
                  break;
                case 'first_name':
                case 'firstname':
                  lead.first_name = value;
                  break;
                case 'last_name':
                case 'lastname':
                  lead.last_name = value;
                  break;
                case 'email':
                  lead.email = value;
                  break;
                case 'company':
                  lead.company = value;
                  break;
                case 'address':
                case 'street':
                case 'street_address':
                  lead.address = value;
                  break;
                case 'city':
                  lead.city = value;
                  break;
                case 'state':
                  lead.state = value;
                  break;
                case 'zip':
                case 'zip_code':
                case 'postal_code':
                  lead.zip_code = value;
                  break;
              }
            });
            
            return lead;
          })
          .filter(lead => lead.phone_number);

        if (leadsToImport.length > 0) {
          await importLeads(leadsToImport);
          loadData();
        }
      } catch (error) {
        toast({
          title: "Import Error",
          description: "Failed to parse CSV file. Please check the format.",
          variant: "destructive"
        });
      }
    };
    reader.readAsText(file);
  };

  const handleAddToCampaign = async () => {
    if (!selectedCampaign || selectedLeads.length === 0) {
      toast({
        title: "Error",
        description: "Please select a campaign and at least one lead",
        variant: "destructive"
      });
      return;
    }

    const result = await addLeadsToCampaign(selectedCampaign, selectedLeads);
    if (result) {
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: `Added ${selectedLeads.length} leads to campaign`,
      });
    }
  };

  const handleResetForCalling = async () => {
    if (selectedLeads.length === 0) {
      toast({
        title: "No leads selected",
        description: "Please select at least one lead to reset",
        variant: "destructive"
      });
      return;
    }

    const result = await resetLeadsForCalling(selectedLeads);
    if (result) {
      setSelectedLeads([]);
      loadData();
    }
  };

  const toggleLeadSelection = (leadId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const openLeadDetail = (lead: Lead) => {
    setSelectedLead(lead);
    setIsDetailOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'contacted': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'interested': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'not_interested': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'converted': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200';
    }
  };

  const getLeadDisplayName = (lead: Lead) => {
    if (lead.first_name || lead.last_name) {
      return `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    }
    return lead.phone_number;
  };

  const getLeadAddress = (lead: Lead) => {
    const parts = [lead.city, lead.state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  };

  // Filter leads based on search and status
  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchQuery === '' || 
      getLeadDisplayName(lead).toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone_number.includes(searchQuery) ||
      (lead.email?.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Lead Management</h2>
          <p className="text-sm text-muted-foreground">
            Import, manage, and assign leads to campaigns
          </p>
        </div>
        
        {ghlConnected && (
          <Button onClick={handleGHLSync} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync GHL
          </Button>
        )}
      </div>

      <Tabs defaultValue="manage" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 h-auto">
          <TabsTrigger value="manage" className="text-xs sm:text-sm py-2">
            <Users className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Manage</span>
          </TabsTrigger>
          <TabsTrigger value="import" className="text-xs sm:text-sm py-2">
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Import</span>
          </TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs sm:text-sm py-2">
            <Link className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Assign</span>
          </TabsTrigger>
        </TabsList>

        {/* Manage Leads Tab - Mobile Optimized */}
        <TabsContent value="manage" className="space-y-4">
          {/* Search and Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input 
              placeholder="Search leads..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <div className="flex gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-32">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
                </SelectContent>
              </Select>
              {selectedLeads.length > 0 && (
                <Button 
                  onClick={handleResetForCalling}
                  disabled={isLoading}
                  variant="outline"
                  size="sm"
                  className="whitespace-nowrap"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset ({selectedLeads.length})
                </Button>
              )}
            </div>
          </div>

          {/* Lead Count */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {filteredLeads.length} lead{filteredLeads.length !== 1 ? 's' : ''}
              {selectedLeads.length > 0 && ` • ${selectedLeads.length} selected`}
            </p>
          </div>

          {/* Mobile-Friendly Lead Cards */}
          <div className="space-y-2">
            {filteredLeads.map((lead) => (
              <Card 
                key={lead.id} 
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedLeads.includes(lead.id) ? 'ring-2 ring-primary bg-primary/5' : ''
                }`}
              >
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <Checkbox
                      checked={selectedLeads.includes(lead.id)}
                      onCheckedChange={() => toggleLeadSelection(lead.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-1"
                    />
                    
                    {/* Lead Info */}
                    <div 
                      className="flex-1 min-w-0"
                      onClick={() => openLeadDetail(lead)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-medium text-sm sm:text-base truncate">
                            {getLeadDisplayName(lead)}
                          </h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {lead.phone_number}
                            </span>
                            {lead.email && (
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="h-3 w-3" />
                                <span className="truncate max-w-[120px] sm:max-w-none">{lead.email}</span>
                              </span>
                            )}
                          </div>
                          {(lead.company || getLeadAddress(lead)) && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                              {lead.company && (
                                <span className="flex items-center gap-1">
                                  <Building className="h-3 w-3" />
                                  {lead.company}
                                </span>
                              )}
                              {getLeadAddress(lead) && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {getLeadAddress(lead)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Status & Edit */}
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={`text-xs ${getStatusColor(lead.status)}`}>
                            {lead.status}
                          </Badge>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              openLeadDetail(lead);
                            }}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredLeads.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="font-medium">No leads found</p>
              <p className="text-sm">Import some leads to get started</p>
            </div>
          )}
        </TabsContent>

        {/* Import Leads Tab */}
        <TabsContent value="import">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* CSV Upload */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="h-5 w-5" />
                  CSV Upload
                </CardTitle>
                <CardDescription>Upload leads from a CSV file</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                  />
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium mb-1">Expected columns:</p>
                    <div className="grid grid-cols-2 gap-1">
                      <span>• phone_number (required)</span>
                      <span>• first_name</span>
                      <span>• last_name</span>
                      <span>• email</span>
                      <span>• company</span>
                      <span>• address</span>
                      <span>• city</span>
                      <span>• state</span>
                      <span>• zip_code</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GHL Integration */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link className="h-5 w-5" />
                  Go High Level
                </CardTitle>
                <CardDescription>Import leads from your GHL account</CardDescription>
              </CardHeader>
              <CardContent>
                {ghlConnected ? (
                  <div className="space-y-3">
                    <Badge variant="default">Connected</Badge>
                    <Button onClick={handleGHLSync} className="w-full">
                      <Database className="h-4 w-4 mr-2" />
                      Import from GHL
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Badge variant="outline">Not Connected</Badge>
                    <p className="text-sm text-muted-foreground">
                      Connect your Go High Level account to import leads automatically.
                    </p>
                    <Button variant="outline" className="w-full" disabled>
                      Connect GHL First
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Assign to Campaigns Tab */}
        <TabsContent value="campaigns">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assign Leads to Campaigns</CardTitle>
              <CardDescription>
                Add selected leads to voice campaigns for calling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handleAddToCampaign}
                  disabled={selectedLeads.length === 0 || !selectedCampaign}
                  className="w-full sm:w-auto"
                >
                  Add {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
                </Button>
              </div>

              {selectedLeads.length > 0 ? (
                <div className="p-4 bg-primary/10 rounded-lg">
                  <p className="text-sm font-medium">
                    {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a campaign above to assign these leads
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-muted rounded-lg text-center">
                  <p className="text-sm text-muted-foreground">
                    Go to the Manage tab and select leads to assign
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Lead Detail Dialog */}
      <LeadDetailDialog
        lead={selectedLead as any}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        onLeadUpdated={loadData}
      />
    </div>
  );
};

export default EnhancedLeadManager;
