import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, X, User, Phone, Search, CheckSquare, Tag } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { Badge } from '@/components/ui/badge';

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

const LEADS_PAGE_SIZE = 200;

export const CampaignLeadManager = ({ campaignId, campaignName }: CampaignLeadManagerProps) => {
  const { toast } = useToast();
  const [campaignLeads, setCampaignLeads] = useState<Lead[]>([]);
  const [availableLeads, setAvailableLeads] = useState<Lead[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [assignedLeadIds, setAssignedLeadIds] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAvailable, setIsLoadingAvailable] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [availablePage, setAvailablePage] = useState(0);
  const [hasMoreAvailable, setHasMoreAvailable] = useState(true);
  const debouncedSearch = useDebounce(searchQuery, 300);

  const sanitizeSearch = (value: string) => value.replace(/[,%]/g, ' ').trim();

  const leadMatchesSearch = (lead: Lead, query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return true;

    const qDigits = q.replace(/\D/g, '');
    const phoneDigits = lead.phone_number.replace(/\D/g, '');

    return (
      (lead.first_name?.toLowerCase().includes(q) ?? false) ||
      (lead.last_name?.toLowerCase().includes(q) ?? false) ||
      (lead.email?.toLowerCase().includes(q) ?? false) ||
      (lead.company?.toLowerCase().includes(q) ?? false) ||
      lead.phone_number.toLowerCase().includes(q) ||
      (qDigits.length >= 4 && phoneDigits.includes(qDigits))
    );
  };

  const uniqueStatuses = useMemo(() => {
    const statuses = new Set(
      [...availableLeads, ...campaignLeads]
        .map((lead) => lead.status)
        .filter((status): status is string => Boolean(status))
    );

    return Array.from(statuses).sort();
  }, [availableLeads, campaignLeads]);

  const alreadyInCampaignMatch = useMemo(() => {
    if (!debouncedSearch.trim()) return false;
    return campaignLeads.some((lead) => leadMatchesSearch(lead, debouncedSearch));
  }, [campaignLeads, debouncedSearch]);

  useEffect(() => {
    loadCampaignLeads();
    loadAssignedLeadIds();
  }, [campaignId]);

  useEffect(() => {
    if (!showAddDialog) return;

    const load = async () => {
      const latestAssignedIds = await loadAssignedLeadIds();
      await loadAvailableLeads(0, true, latestAssignedIds);
      // Load available tags for filter
      try {
        const { data } = await supabase.from('leads').select('tags').not('tags', 'is', null).limit(500);
        const tagSet = new Set<string>();
        (data || []).forEach((row: any) => {
          if (Array.isArray(row.tags)) row.tags.forEach((t: string) => tagSet.add(t));
        });
        setAvailableTags(Array.from(tagSet).sort());
      } catch { /* non-critical */ }
    };

    void load();
  }, [showAddDialog, campaignId, debouncedSearch, statusFilter, tagFilter]);

  const loadCampaignLeads = async () => {
    try {
      const { data: campaignLeadsData, error } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      const leadIds = campaignLeadsData.map((cl) => cl.lead_id).filter(Boolean);

      if (leadIds.length > 0) {
        const { data: leadsData, error: leadsError } = await supabase
          .from('leads')
          .select('id, first_name, last_name, phone_number, email, company, status')
          .in('id', leadIds);

        if (leadsError) throw leadsError;
        setCampaignLeads((leadsData as Lead[]) || []);
      } else {
        setCampaignLeads([]);
      }
    } catch (error) {
      console.error('Error loading campaign leads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load campaign leads',
        variant: 'destructive',
      });
    }
  };

  const loadAssignedLeadIds = async (): Promise<Set<string>> => {
    try {
      const { data, error } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      const ids = new Set((data || []).map((row) => row.lead_id).filter(Boolean) as string[]);
      setAssignedLeadIds(ids);
      return ids;
    } catch (error) {
      console.error('Error loading assigned lead ids:', error);
      return assignedLeadIds;
    }
  };

  const loadAvailableLeads = async (
    pageNum: number,
    replace: boolean,
    assignedOverride?: Set<string>
  ) => {
    setIsLoadingAvailable(true);

    try {
      let query = supabase
        .from('leads')
        .select('id, first_name, last_name, phone_number, email, company, status')
        .order('created_at', { ascending: false })
        .range(pageNum * LEADS_PAGE_SIZE, (pageNum + 1) * LEADS_PAGE_SIZE - 1);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const normalizedSearch = sanitizeSearch(debouncedSearch);
      if (normalizedSearch) {
        query = query.or(
          `first_name.ilike.%${normalizedSearch}%,last_name.ilike.%${normalizedSearch}%,phone_number.ilike.%${normalizedSearch}%,email.ilike.%${normalizedSearch}%,company.ilike.%${normalizedSearch}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;

      const source = (data as Lead[]) || [];
      const currentAssigned = assignedOverride ?? assignedLeadIds;
      const unassigned = source.filter((lead) => !currentAssigned.has(lead.id));

      if (replace) {
        setAvailableLeads(unassigned);
      } else {
        setAvailableLeads((prev) => {
          const merged = new Map(prev.map((lead) => [lead.id, lead]));
          unassigned.forEach((lead) => merged.set(lead.id, lead));
          return Array.from(merged.values());
        });
      }

      setAvailablePage(pageNum);
      setHasMoreAvailable(source.length === LEADS_PAGE_SIZE);
    } catch (error) {
      console.error('Error loading available leads:', error);
      toast({
        title: 'Error',
        description: 'Failed to load leads for search',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingAvailable(false);
    }
  };

  const handleAddLeads = async () => {
    if (selectedLeads.length === 0) return;

    setIsLoading(true);
    try {
      const inserts = selectedLeads.map((leadId) => ({
        campaign_id: campaignId,
        lead_id: leadId,
      }));

      const { error } = await supabase.from('campaign_leads').insert(inserts);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Added ${selectedLeads.length} lead${selectedLeads.length > 1 ? 's' : ''} to campaign`,
      });

      setSelectedLeads([]);
      await loadCampaignLeads();
      const refreshedAssignedIds = await loadAssignedLeadIds();
      await loadAvailableLeads(0, true, refreshedAssignedIds);
    } catch (error) {
      console.error('Error adding leads:', error);
      toast({
        title: 'Error',
        description: 'Failed to add leads to campaign',
        variant: 'destructive',
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
        title: 'Success',
        description: 'Lead removed from campaign',
      });

      await loadCampaignLeads();
      await loadAssignedLeadIds();
      if (showAddDialog) {
        await loadAvailableLeads(0, true);
      }
    } catch (error) {
      console.error('Error removing lead:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove lead',
        variant: 'destructive',
      });
    }
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeads((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  const handleSelectAllLoaded = () => {
    const loadedIds = availableLeads.map((lead) => lead.id);
    const allLoadedSelected = loadedIds.length > 0 && loadedIds.every((id) => selectedLeads.includes(id));

    if (allLoadedSelected) {
      setSelectedLeads((prev) => prev.filter((id) => !loadedIds.includes(id)));
    } else {
      setSelectedLeads((prev) => [...new Set([...prev, ...loadedIds])]);
    }
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
            <CardDescription>Manage leads assigned to {campaignName}</CardDescription>
          </div>
          <Dialog
            open={showAddDialog}
            onOpenChange={(open) => {
              setShowAddDialog(open);
              if (!open) {
                setSelectedLeads([]);
                setSearchQuery('');
                setStatusFilter('all');
                setAvailableLeads([]);
                setHasMoreAvailable(true);
                setAvailablePage(0);
              }
            }}
          >
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
                  Search your full lead database and add contacts instantly.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 flex-1 flex flex-col min-h-0">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by name, phone, email, company..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {uniqueStatuses.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllLoaded}
                    className="h-7 px-2 gap-1.5"
                    disabled={availableLeads.length === 0}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {availableLeads.length > 0 && availableLeads.every((l) => selectedLeads.includes(l.id))
                      ? 'Deselect Loaded'
                      : `Select Loaded (${availableLeads.length})`}
                  </Button>
                  <span className="text-muted-foreground">{selectedLeads.length} selected</span>
                </div>

                {availableLeads.length === 0 && !isLoadingAvailable ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    {alreadyInCampaignMatch
                      ? 'That contact is already in this campaign.'
                      : debouncedSearch || statusFilter !== 'all'
                        ? 'No leads match your search yet.'
                        : 'No available leads to add.'}
                  </div>
                ) : (
                  <div
                    className="overflow-y-auto flex-1 min-h-0 space-y-1 pr-1"
                    onScroll={(e) => {
                      const el = e.currentTarget;
                      if (
                        el.scrollTop + el.clientHeight >= el.scrollHeight - 120 &&
                        hasMoreAvailable &&
                        !isLoadingAvailable
                      ) {
                        void loadAvailableLeads(availablePage + 1, false);
                      }
                    }}
                  >
                    {availableLeads.map((lead) => (
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
                            <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-foreground shrink-0">
                              {lead.status || 'unknown'}
                            </span>
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

                    {isLoadingAvailable && (
                      <div className="text-center py-2 text-sm text-muted-foreground">Loading more leads…</div>
                    )}

                    {!hasMoreAvailable && availableLeads.length > 0 && (
                      <div className="text-center py-2 text-sm text-muted-foreground">End of results</div>
                    )}
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''} selected
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddLeads} disabled={selectedLeads.length === 0 || isLoading}>
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
          <div className="text-center py-8 text-muted-foreground">No leads assigned to this campaign yet.</div>
        ) : (
          <div className="space-y-2">
            {campaignLeads.map((lead) => (
              <div key={lead.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{getLeadDisplayName(lead)}</span>
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-foreground">
                      {lead.status || 'unknown'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Phone className="h-3 w-3" />
                    {lead.phone_number}
                    {lead.company && <span>• {lead.company}</span>}
                    {lead.email && <span>• {lead.email}</span>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => handleRemoveLead(lead.id)}>
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
