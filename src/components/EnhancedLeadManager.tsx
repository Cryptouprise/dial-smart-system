import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { usePredictiveDialing, type LeadQueryFilters } from '@/hooks/usePredictiveDialing';
import { useGoHighLevel } from '@/hooks/useGoHighLevel';
import { useSmartLists, SmartList, SmartListFilters } from '@/hooks/useSmartLists';
import { LeadDetailDialog } from '@/components/LeadDetailDialog';
import { SmartListsSidebar } from '@/components/SmartListsSidebar';
import { AdvancedLeadFilter } from '@/components/AdvancedLeadFilter';
import { supabase } from '@/integrations/supabase/client';
import { RotateCcw, Upload, Users, RefreshCw, Database, Link, Phone, Mail, Building, MapPin, Edit, ChevronRight, Filter, List, PanelLeftClose, PanelLeft, Trash2, Plus, Tag, Loader2 } from 'lucide-react';
import { LeadImportDialog } from '@/components/LeadImportDialog';

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
  const [totalLeadCount, setTotalLeadCount] = useState<number | null>(null);
  const [currentLeadCount, setCurrentLeadCount] = useState<number | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [ghlConnected, setGhlConnected] = useState(false);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSmartList, setSelectedSmartList] = useState<SmartList | null>(null);
  const [builtInFilter, setBuiltInFilter] = useState<'all' | 'new' | 'hot' | 'recent'>('all');
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkSmartListOpen, setBulkSmartListOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [activeAdvancedFilters, setActiveAdvancedFilters] = useState<SmartListFilters>({});
  const [activeTab, setActiveTab] = useState('manage');
  const [bulkTagsInput, setBulkTagsInput] = useState('');
  const [bulkSmartListName, setBulkSmartListName] = useState('');
  const [bulkSmartListDescription, setBulkSmartListDescription] = useState('');
  const [savingBulkTags, setSavingBulkTags] = useState(false);
  const [savingBulkSmartList, setSavingBulkSmartList] = useState(false);
  
  const { toast } = useToast();
  const { getLeads, createLead, importLeads, getCampaigns, getLeadCount, addLeadsToCampaign, resetLeadsForCalling, isLoading } = usePredictiveDialing();
  const { getGHLCredentials, syncContacts, getContacts } = useGoHighLevel();
  const { fetchLists, addTagsToLeads, createList } = useSmartLists();

  const hasActiveSmartFilters = useCallback((filters?: SmartListFilters | null) => {
    return Object.values(filters || {}).some(value => Array.isArray(value) ? value.length > 0 : value !== undefined);
  }, []);

  const mapSmartListFiltersToQuery = useCallback((filters?: SmartListFilters | null): LeadQueryFilters => ({
    statuses: filters?.status,
    lead_source: filters?.lead_source,
    campaign_id: filters?.campaign_id,
    lead_ids: filters?.lead_ids,
    tags: filters?.tags,
    tags_all: filters?.tags_all,
    tags_exclude: filters?.tags_exclude,
    created_after: filters?.created_after,
    created_before: filters?.created_before,
  }), []);

  const getBuiltInFilters = useCallback((type: 'all' | 'new' | 'hot' | 'recent'): LeadQueryFilters => {
    switch (type) {
      case 'new':
        return { status: 'new' };
      case 'hot':
        return { status: 'interested' };
      case 'recent':
        return { created_after: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() };
      default:
        return {};
    }
  }, []);

  const buildViewFilters = useCallback((overrides: Partial<LeadQueryFilters> = {}): LeadQueryFilters => {
    const baseFilters = hasActiveSmartFilters(activeAdvancedFilters)
      ? mapSmartListFiltersToQuery(activeAdvancedFilters)
      : selectedSmartList
        ? mapSmartListFiltersToQuery(selectedSmartList.filters)
        : getBuiltInFilters(builtInFilter);

    const mergedFilters: LeadQueryFilters = {
      ...baseFilters,
      ...overrides,
    };

    if (!overrides.status && !overrides.statuses && statusFilter !== 'all') {
      mergedFilters.status = statusFilter;
    }

    return mergedFilters;
  }, [activeAdvancedFilters, selectedSmartList, builtInFilter, statusFilter, hasActiveSmartFilters, mapSmartListFiltersToQuery, getBuiltInFilters]);

  const loadData = useCallback(async () => {
    const [campaignsData, count] = await Promise.all([
      getCampaigns(),
      getLeadCount()
    ]);
    
    if (campaignsData) setCampaigns(campaignsData);
    if (count !== null) setTotalLeadCount(count);
  }, [getCampaigns, getLeadCount]);

  const loadLeadsForCurrentFilter = useCallback(async () => {
    const viewFilters = buildViewFilters();
    const [filteredLeads, count] = await Promise.all([
      getLeads(viewFilters),
      getLeadCount(viewFilters)
    ]);

    if (filteredLeads) {
      setLeads(filteredLeads);
    }

    if (count !== null) {
      setCurrentLeadCount(count);

      if (!selectedSmartList && !hasActiveSmartFilters(activeAdvancedFilters) && builtInFilter === 'all' && statusFilter === 'all') {
        setTotalLeadCount(count);
      }
    }
  }, [buildViewFilters, getLeads, getLeadCount, selectedSmartList, activeAdvancedFilters, builtInFilter, statusFilter, hasActiveSmartFilters]);

  const refreshCurrentView = useCallback(async () => {
    await Promise.all([loadData(), loadLeadsForCurrentFilter()]);
  }, [loadData, loadLeadsForCurrentFilter]);

  useEffect(() => {
    loadData();
    checkGHLConnection();
    fetchLists();
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      loadLeadsForCurrentFilter();
    }
  }, [selectedSmartList, builtInFilter, statusFilter, activeAdvancedFilters, searchQuery, loadLeadsForCurrentFilter]);

  useEffect(() => {
    if (!searchQuery.trim()) return;

    const timer = setTimeout(async () => {
      const searchFilters = buildViewFilters({ search: searchQuery.trim() });
      const [results, count] = await Promise.all([
        getLeads(searchFilters),
        getLeadCount(searchFilters)
      ]);

      if (results) setLeads(results);
      if (count !== null) setCurrentLeadCount(count);
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, getLeads, getLeadCount, buildViewFilters]);

  const handleSelectSmartList = (list: SmartList | null) => {
    setSelectedSmartList(list);
    setBuiltInFilter('all');
  };

  const handleSelectBuiltIn = (type: 'all' | 'new' | 'hot' | 'recent') => {
    setBuiltInFilter(type);
    setSelectedSmartList(null);
  };

  const handleFilterChange = useCallback(async (filters: SmartListFilters) => {
    setActiveAdvancedFilters(filters);

    const queryFilters = hasActiveSmartFilters(filters)
      ? buildViewFilters(mapSmartListFiltersToQuery(filters))
      : buildViewFilters();

    const results = await getLeads(queryFilters);
    if (results) {
      setLeads(results);
    }

    if (!hasActiveSmartFilters(filters)) {
      const fallbackCount = await getLeadCount(buildViewFilters());
      if (fallbackCount !== null) setCurrentLeadCount(fallbackCount);
    }
  }, [getLeads, getLeadCount, hasActiveSmartFilters, mapSmartListFiltersToQuery, buildViewFilters]);

  const handleLeadCountChange = useCallback((count: number) => {
    setCurrentLeadCount(count);
  }, []);

  const checkGHLConnection = () => {
    const creds = getGHLCredentials();
    setGhlConnected(!!creds);
  };

  const handleGHLSync = async () => {
    const result = await syncContacts('import');
    if (result) {
      refreshCurrentView();
    }
  };

  // File upload is now handled by LeadImportDialog

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
      refreshCurrentView();
    }
  };

  const parseTagInput = (value: string) => Array.from(
    new Set(
      value
        .split(',')
        .map((tagValue) => tagValue.trim())
        .filter(Boolean)
    )
  );

  const handleBulkAddTags = async () => {
    const tags = parseTagInput(bulkTagsInput);

    if (selectedLeads.length === 0) {
      toast({
        title: 'No leads selected',
        description: 'Select at least one lead before adding tags.',
        variant: 'destructive'
      });
      return;
    }

    if (tags.length === 0) {
      toast({
        title: 'No tags entered',
        description: 'Enter one or more comma-separated tags.',
        variant: 'destructive'
      });
      return;
    }

    setSavingBulkTags(true);
    try {
      const updatedCount = await addTagsToLeads(selectedLeads, tags);
      if (updatedCount > 0) {
        setBulkTagOpen(false);
        setBulkTagsInput('');
        await refreshCurrentView();
      }
    } finally {
      setSavingBulkTags(false);
    }
  };

  const openBulkSmartListDialog = () => {
    if (!bulkSmartListName.trim()) {
      setBulkSmartListName(`Selected Leads - ${new Date().toLocaleDateString()}`);
    }
    setBulkSmartListOpen(true);
  };

  const handleSaveSelectedAsSmartList = async () => {
    if (selectedLeads.length === 0) {
      toast({
        title: 'No leads selected',
        description: 'Select leads before saving a smart list.',
        variant: 'destructive'
      });
      return;
    }

    if (!bulkSmartListName.trim()) {
      toast({
        title: 'List name required',
        description: 'Give this smart list a name first.',
        variant: 'destructive'
      });
      return;
    }

    setSavingBulkSmartList(true);
    try {
      const createdList = await createList(
        bulkSmartListName.trim(),
        { lead_ids: selectedLeads },
        bulkSmartListDescription.trim() || `Static list of ${selectedLeads.length} selected leads`,
        false
      );

      if (createdList) {
        setSelectedSmartList(createdList);
        setBuiltInFilter('all');
        setActiveAdvancedFilters({});
        setActiveTab('manage');
        setBulkSmartListOpen(false);
        setBulkSmartListName('');
        setBulkSmartListDescription('');
      }
    } finally {
      setSavingBulkSmartList(false);
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

  const deleteLead = async (lead: Lead) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from('leads').delete().eq('id', lead.id);
      if (error) {
        // If delete fails (FK constraints), archive instead
        await supabase.from('leads').update({ do_not_call: true, status: 'dnc' }).eq('id', lead.id);
        toast({ title: 'Lead archived', description: 'Lead had history and was marked Do Not Call instead.' });
      } else {
        toast({ title: 'Lead deleted' });
      }
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      setSelectedLeads(prev => prev.filter(id => id !== lead.id));
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete lead', variant: 'destructive' });
    } finally {
      setDeleting(false);
      setLeadToDelete(null);
    }
  };

  const bulkDeleteLeads = async () => {
    setDeleting(true);
    let deleted = 0;
    for (const leadId of selectedLeads) {
      const { error } = await supabase.from('leads').delete().eq('id', leadId);
      if (error) {
        await supabase.from('leads').update({ do_not_call: true, status: 'dnc' }).eq('id', leadId);
      }
      deleted++;
    }
    setLeads(prev => prev.filter(l => !selectedLeads.includes(l.id)));
    setSelectedLeads([]);
    setDeleting(false);
    setBulkDeleteOpen(false);
    toast({ title: `${deleted} lead(s) deleted/archived` });
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

  const filteredLeads = leads;
  const displayedLeadCount = currentLeadCount ?? filteredLeads.length;
  const visibleLeadIds = filteredLeads.map(lead => lead.id);
  const allVisibleSelected = visibleLeadIds.length > 0 && visibleLeadIds.every(id => selectedLeads.includes(id));

  const toggleSelectAllVisible = () => {
    setSelectedLeads(prev => {
      if (allVisibleSelected) {
        return prev.filter(id => !visibleLeadIds.includes(id));
      }

      return Array.from(new Set([...prev, ...visibleLeadIds]));
    });
  };

  const [selectingAll, setSelectingAll] = useState(false);
  const selectAllMatching = async () => {
    setSelectingAll(true);
    try {
      const viewFilters = buildViewFilters();
      // Fetch only IDs for all matching leads (no limit)
      const allMatching = await getLeads({ ...viewFilters, limit: 50000 });
      if (allMatching) {
        const allIds = allMatching.map((l: any) => l.id);
        setSelectedLeads(allIds);
        toast({ title: 'Selected All', description: `${allIds.length.toLocaleString()} leads selected` });
      }
    } finally {
      setSelectingAll(false);
    }
  };

  return (
    <div className="flex h-full">
      {/* Smart Lists Sidebar - Desktop */}
      {showSidebar && (
        <div className="hidden lg:block">
          <SmartListsSidebar 
            onSelectList={handleSelectSmartList}
            onSelectBuiltIn={handleSelectBuiltIn}
            selectedListId={selectedSmartList?.id}
          />
        </div>
      )}

      <div className="flex-1 space-y-4 md:space-y-6 p-4">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(!showSidebar)}
              className="hidden lg:flex"
            >
              {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </Button>
            <div>
              <h2 className="text-xl md:text-2xl font-bold">
                {selectedSmartList ? selectedSmartList.name : 'Lead Management'}
              </h2>
              <p className="text-sm text-muted-foreground">
                  {selectedSmartList 
                    ? `${displayedLeadCount.toLocaleString()} leads in this list`
                    : (searchQuery.trim() || builtInFilter !== 'all' || statusFilter !== 'all' || hasActiveSmartFilters(activeAdvancedFilters)) && currentLeadCount !== null
                      ? `${currentLeadCount.toLocaleString()} matching leads`
                      : totalLeadCount !== null 
                        ? `${totalLeadCount.toLocaleString()} total leads`
                        : 'Import, manage, and assign leads to campaigns'}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadLeadsForCurrentFilter()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            {ghlConnected && (
              <Button onClick={handleGHLSync} variant="outline" size="sm" disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Sync GHL
              </Button>
            )}
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <AdvancedLeadFilter 
            onFilterChange={handleFilterChange}
            onLeadCountChange={handleLeadCountChange}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
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
            </div>
          </div>

          {selectedLeads.length > 0 && (
            <Card>
              <CardContent className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-medium">
                    {selectedLeads.length.toLocaleString()} lead{selectedLeads.length !== 1 ? 's' : ''} selected
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Bulk actions now work directly from the lead view.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => setBulkTagOpen(true)}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    <Tag className="h-4 w-4 mr-2" />
                    Add Tags
                  </Button>
                  <Button
                    onClick={openBulkSmartListDialog}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    <List className="h-4 w-4 mr-2" />
                    Save as Smart List
                  </Button>
                  <Button
                    onClick={() => setActiveTab('campaigns')}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    <Link className="h-4 w-4 mr-2" />
                    Assign to Campaign
                  </Button>
                  <Button 
                    onClick={handleResetForCalling}
                    disabled={isLoading}
                    variant="outline"
                    size="sm"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset for Calling
                  </Button>
                  <Button 
                    onClick={() => setBulkDeleteOpen(true)}
                    variant="destructive"
                    size="sm"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Lead Count + Select All */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {filteredLeads.length > 0 && (
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                  aria-label="Select all"
                />
              )}
              <p className="text-sm text-muted-foreground">
                {displayedLeadCount.toLocaleString()} lead{displayedLeadCount !== 1 ? 's' : ''}
                {selectedLeads.length > 0 && ` • ${selectedLeads.length.toLocaleString()} selected`}
              </p>
            </div>
            {allVisibleSelected && displayedLeadCount > filteredLeads.length && selectedLeads.length < displayedLeadCount && (
              <Button
                variant="link"
                size="sm"
                className="text-xs p-0 h-auto"
                onClick={selectAllMatching}
                disabled={selectingAll}
              >
                {selectingAll ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Selecting...</>
                ) : (
                  <>Select all {displayedLeadCount.toLocaleString()} matching leads</>
                )}
              </Button>
            )}
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
                        
                        {/* Status & Actions */}
                        <div className="flex items-center gap-1 shrink-0">
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
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLeadToDelete(lead);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
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
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="font-semibold text-lg">Import Leads</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                Upload a CSV file, map every column before import, then tag leads and drop them into smart lists or campaigns.
              </p>
            </div>
            <Button size="lg" onClick={() => setImportDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Import with Mapping
            </Button>
            {ghlConnected && (
              <Button variant="outline" onClick={handleGHLSync} disabled={isLoading}>
                <Database className="h-4 w-4 mr-2" />
                Import from Go High Level
              </Button>
            )}
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
        onLeadUpdated={refreshCurrentView}
      />

      {/* Delete Single Lead Dialog */}
      <AlertDialog open={!!leadToDelete} onOpenChange={(open) => !open && setLeadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete lead?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {leadToDelete?.first_name || leadToDelete?.phone_number || 'this lead'}. If the lead has call/SMS history, it will be archived (Do Not Call) instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => leadToDelete && deleteLead(leadToDelete)}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Dialog */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLeads.length} leads?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all selected leads. Leads with call/SMS history will be archived (Do Not Call) instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={bulkDeleteLeads}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : `Delete ${selectedLeads.length} Leads`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkTagOpen} onOpenChange={setBulkTagOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tags to selected leads</DialogTitle>
            <DialogDescription>
              Add one or more comma-separated tags to {selectedLeads.length.toLocaleString()} selected leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={bulkTagsInput}
              onChange={(event) => setBulkTagsInput(event.target.value)}
              placeholder="solar, high priority, april import"
            />
            <p className="text-sm text-muted-foreground">
              Existing tags stay in place; new ones are merged in.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkTagOpen(false)} disabled={savingBulkTags}>
              Cancel
            </Button>
            <Button onClick={() => void handleBulkAddTags()} disabled={savingBulkTags}>
              {savingBulkTags && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Tags
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkSmartListOpen} onOpenChange={setBulkSmartListOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save selected leads as a smart list</DialogTitle>
            <DialogDescription>
              Create a reusable list from the {selectedLeads.length.toLocaleString()} leads you have selected right now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={bulkSmartListName}
              onChange={(event) => setBulkSmartListName(event.target.value)}
              placeholder="April import - homeowners"
            />
            <Input
              value={bulkSmartListDescription}
              onChange={(event) => setBulkSmartListDescription(event.target.value)}
              placeholder="Optional description"
            />
            <p className="text-sm text-muted-foreground">
              This saves the current selection as a static smart list so you can come back to the same leads later.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkSmartListOpen(false)} disabled={savingBulkSmartList}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveSelectedAsSmartList()} disabled={savingBulkSmartList}>
              {savingBulkSmartList && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Smart List
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lead Import Dialog */}
      <LeadImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        campaigns={campaigns}
        onImportComplete={(count) => {
          refreshCurrentView();
          fetchLists();
        }}
      />
      </div>
    </div>
  );
};

export default EnhancedLeadManager;
