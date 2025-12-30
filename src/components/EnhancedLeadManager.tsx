import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePredictiveDialing } from '@/hooks/usePredictiveDialing';
import { useGoHighLevel } from '@/hooks/useGoHighLevel';
import { RotateCcw } from 'lucide-react';
import { Upload, Users, RefreshCw, FileText, Database, Link } from 'lucide-react';

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
  ghl_contact_id?: string;
}

const EnhancedLeadManager = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  
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
      loadData(); // Reload to show new leads
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

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev => 
      prev.includes(leadId) 
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-100 text-blue-800';
      case 'contacted': return 'bg-yellow-100 text-yellow-800';
      case 'interested': return 'bg-green-100 text-green-800';
      case 'not_interested': return 'bg-red-100 text-red-800';
      case 'converted': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            Lead Management
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Import, manage, and assign leads to voice campaigns
          </p>
        </div>
        
        {ghlConnected && (
          <Button onClick={handleGHLSync} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync from GHL
          </Button>
        )}
      </div>

      <Tabs defaultValue="import" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="import">Import Leads</TabsTrigger>
          <TabsTrigger value="manage">Manage Leads</TabsTrigger>
          <TabsTrigger value="campaigns">Assign to Campaigns</TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CSV Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  CSV Upload
                </CardTitle>
                <CardDescription>Upload leads from a CSV file</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                  </div>
                  <div className="text-xs text-gray-500">
                    <p className="font-medium mb-1">Expected columns:</p>
                    <ul className="list-disc list-inside space-y-0.5">
                      <li>phone_number (required)</li>
                      <li>first_name</li>
                      <li>last_name</li>
                      <li>email</li>
                      <li>company</li>
                      <li>address</li>
                      <li>city</li>
                      <li>state</li>
                      <li>zip_code</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* GHL Integration */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link className="h-5 w-5" />
                  Go High Level
                </CardTitle>
                <CardDescription>
                  Import leads from your GHL account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {ghlConnected ? (
                    <div>
                      <Badge variant="default" className="mb-4">Connected</Badge>
                      <Button 
                        onClick={handleGHLSync}
                        className="w-full"
                      >
                        <Database className="h-4 w-4 mr-2" />
                        Import from GHL
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <Badge variant="outline" className="mb-4">Not Connected</Badge>
                      <p className="text-sm text-gray-500 mb-4">
                        Connect your Go High Level account in the GHL tab to import leads automatically.
                      </p>
                      <Button variant="outline" className="w-full" disabled>
                        Connect GHL First
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Leads ({leads.length})
              </CardTitle>
              <CardDescription>Manage your imported leads</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Search and Filters */}
                <div className="flex gap-4">
                  <Input 
                    placeholder="Search leads..." 
                    className="flex-1"
                  />
                  <Select>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="interested">Interested</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleResetForCalling}
                    disabled={selectedLeads.length === 0 || isLoading}
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset for Calling ({selectedLeads.length})
                  </Button>
                </div>

                {/* Leads Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 border-b">
                    <div className="grid grid-cols-6 gap-4 text-sm font-medium text-gray-600">
                      <div>Name</div>
                      <div>Phone</div>
                      <div>Email</div>
                      <div>Company</div>
                      <div>Status</div>
                      <div>Source</div>
                    </div>
                  </div>
                  <div className="max-h-96 overflow-y-auto">
                    {leads.map((lead) => (
                      <div 
                        key={lead.id} 
                        className={`grid grid-cols-6 gap-4 px-4 py-3 border-b hover:bg-gray-50 cursor-pointer ${
                          selectedLeads.includes(lead.id) ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleLeadSelection(lead.id)}
                      >
                        <div className="text-sm">
                          {lead.first_name} {lead.last_name}
                        </div>
                        <div className="text-sm font-mono">
                          {lead.phone_number}
                        </div>
                        <div className="text-sm text-gray-600">
                          {lead.email || 'N/A'}
                        </div>
                        <div className="text-sm text-gray-600">
                          {lead.company || 'N/A'}
                        </div>
                        <div>
                          <Badge className={getStatusColor(lead.status)}>
                            {lead.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500">
                          {lead.ghl_contact_id ? 'GHL' : 'CSV'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {leads.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No leads found. Import some leads to get started.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="campaigns">
          <Card>
            <CardHeader>
              <CardTitle>Assign Leads to Campaigns</CardTitle>
              <CardDescription>
                Add selected leads to voice campaigns for calling
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-4">
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
                  >
                    Add {selectedLeads.length} Leads
                  </Button>
                </div>

                {selectedLeads.length > 0 && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm font-medium text-blue-800">
                      {selectedLeads.length} leads selected
                    </p>
                    <p className="text-xs text-blue-600">
                      Go to the Manage Leads tab to select leads
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EnhancedLeadManager;
