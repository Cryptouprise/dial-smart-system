import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, X, User, Phone, Search, CheckSquare } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';

interface Lead {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone_number: string;
  email: string | null;
  company: string | null;
  status: string;
}

interface CampaignLeadManagerProps {
  campaignId: string;
  campaignName: string;
}

export const CampaignLeadManager = ({ campaignId, campaignName }: CampaignLeadManagerProps) => {
  const { toast } = useToast();
  const [campaignLeads, setCampaignLeads] = useState<Lead[]>([]);
  const [availableLeads, setAvailableLeads] = useState<Lead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(50);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const filteredLeads = useMemo(() => {
    let filtered = availableLeads;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      filtered = filtered.filter(lead =>
        (lead.first_name?.toLowerCase().includes(q)) ||
        (lead.last_name?.toLowerCase().includes(q)) ||
        lead.phone_number.includes(q) ||
        (lead.email?.toLowerCase().includes(q)) ||
        (lead.company?.toLowerCase().includes(q))
      );
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(lead => lead.status === statusFilter);
    }
    return filtered;
  }, [availableLeads, debouncedSearch, statusFilter]);

  const visibleLeads = useMemo(() => filteredLeads.slice(0, visibleCount), [filteredLeads, visibleCount]);

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(availableLeads.map(l => l.status));
    return Array.from(statuses).sort();
  }, [availableLeads]);

  const handleSelectAll = () => {
    const filteredIds = filteredLeads.map(l => l.id);
    const allSelected = filteredIds.every(id => selectedLeads.includes(id));
    if (allSelected) {
      setSelectedLeads(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      setSelectedLeads(prev => [...new Set([...prev, ...filteredIds])]);
    }
  };

  useEffect(() => {
    loadCampaignLeads();
    loadAvailableLeads();
  }, [campaignId]);

  const loadCampaignLeads = async () => {
    try {
      const { data: campaignLeadsData, error } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      const leadIds = campaignLeadsData.map(cl => cl.lead_id);

      if (leadIds.length > 0) {
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select('*')
          .in('id', leadIds);

        if (leadsError) throw leadsError;
        setCampaignLeads(leadsData || []);
      } else {
        setCampaignLeads([]);
      }
    } catch (error) {
      console.error('Error loading campaign leads:', error);
      toast({
        title: "Error",
        description: "Failed to load campaign leads",
        variant: "destructive"
      });
    }
  };

  const loadAvailableLeads = async () => {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Filter out leads already in the campaign
      const { data: campaignLeadsData } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      const assignedLeadIds = campaignLeadsData?.map(cl => cl.lead_id) || [];
      const available = data?.filter(lead => !assignedLeadIds.includes(lead.id)) || [];
      
      setAvailableLeads(available);
    } catch (error) {
      console.error('Error loading available leads:', error);
    }
  };

  const handleAddLeads = async () => {
    if (selectedLeads.length === 0) return;

    setIsLoading(true);
    try {
      const inserts = selectedLeads.map(leadId => ({
        campaign_id: campaignId,
        lead_id: leadId
      }));

      const { error } = await supabase
        .from('campaign_leads')
        .insert(inserts);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Added ${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''} to campaign`
      });

      setSelectedLeads([]);
      setShowAddDialog(false);
      loadCampaignLeads();
      loadAvailableLeads();
    } catch (error) {
      console.error('Error adding leads:', error);
      toast({
        title: "Error",
        description: "Failed to add leads to campaign",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveLead = async (leadId: string) => {
    try {
      const { error } = await supabase
        .from('campaign_leads')
        .delete()
        .eq('campaign_id', campaignId)
        .eq('lead_id', leadId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead removed from campaign"
      });

      loadCampaignLeads();
      loadAvailableLeads();
    } catch (error) {
      console.error('Error removing lead:', error);
      toast({
        title: "Error",
        description: "Failed to remove lead",
        variant: "destructive"
      });
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const getLeadDisplayName = (lead: Lead) => {
    if (lead.first_name || lead.last_name) {
      return `${lead.first_name || ''} ${lead.last_name || ''}`.trim();
    }
    return lead.phone_number;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">Campaign Leads</CardTitle>
            <CardDescription>
              Manage leads assigned to {campaignName}
            </CardDescription>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Leads
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Add Leads to Campaign</DialogTitle>
                <DialogDescription>
                  Search and select leads to add ({availableLeads.length} available)
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                {/* Search & Filter Bar */}
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, email, company..."
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setVisibleCount(50); }}
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setVisibleCount(50); }}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {uniqueStatuses.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Select All + Count */}
                <div className="flex items-center justify-between text-sm">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll} className="h-7 px-2 gap-1.5">
                    <CheckSquare className="h-3.5 w-3.5" />
                    {filteredLeads.length > 0 && filteredLeads.every(l => selectedLeads.includes(l.id))
                      ? 'Deselect All' : `Select All (${filteredLeads.length})`}
                  </Button>
                  <span className="text-muted-foreground">
                    {selectedLeads.length} selected
                  </span>
                </div>

                {/* Lead List */}
                {filteredLeads.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {debouncedSearch || statusFilter !== 'all'
                      ? 'No leads match your search.'
                      : 'No available leads to add.'}
                  </div>
                ) : (
                  <div className="overflow-y-auto flex-1 min-h-0 space-y-1 pr-1" onScroll={(e) => {
                    const el = e.currentTarget;
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100 && visibleCount < filteredLeads.length) {
                      setVisibleCount(prev => Math.min(prev + 50, filteredLeads.length));
                    }
                  }}>
                    {visibleLeads.map(lead => (
                      <div
                        key={lead.id}
                        className="flex items-center space-x-3 p-2.5 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleLeadSelection(lead.id)}
                      >
                        <Checkbox
                          checked={selectedLeads.includes(lead.id)}
                          onCheckedChange={() => toggleLeadSelection(lead.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium truncate">{getLeadDisplayName(lead)}</span>
                            <Badge variant="outline" className="shrink-0">{lead.status}</Badge>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span className="truncate">
                              {lead.phone_number}
                              {lead.company && ` • ${lead.company}`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {visibleCount < filteredLeads.length && (
                      <div className="text-center py-2 text-sm text-muted-foreground">
                        Showing {visibleCount} of {filteredLeads.length} — scroll for more
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedLeads([]);
                        setShowAddDialog(false);
                        setSearchQuery('');
                        setStatusFilter('all');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAddLeads}
                      disabled={selectedLeads.length === 0 || isLoading}
                    >
                      Add {selectedLeads.length > 0 ? `(${selectedLeads.length})` : ''}
                    </Button>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {campaignLeads.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No leads assigned to this campaign yet.
          </div>
        ) : (
          <div className="space-y-2">
            {campaignLeads.map(lead => (
              <div
                key={lead.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{getLeadDisplayName(lead)}</span>
                    <Badge variant="outline">{lead.status}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Phone className="h-3 w-3" />
                    {lead.phone_number}
                    {lead.company && <span>• {lead.company}</span>}
                    {lead.email && <span>• {lead.email}</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveLead(lead.id)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
