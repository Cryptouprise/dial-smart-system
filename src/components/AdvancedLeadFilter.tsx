import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Filter, X, Save, Search, Tag, Calendar, Users, 
  Plus, Trash2, RefreshCw, CheckSquare
} from 'lucide-react';
import { useSmartLists, SmartListFilters } from '@/hooks/useSmartLists';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

interface AdvancedLeadFilterProps {
  onFilterChange?: (filters: SmartListFilters) => void;
  onLeadCountChange?: (count: number) => void;
  compact?: boolean;
}

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'interested', label: 'Interested' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'closed', label: 'Closed' },
];

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: '90days', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom range' },
];

export const AdvancedLeadFilter: React.FC<AdvancedLeadFilterProps> = ({
  onFilterChange,
  onLeadCountChange,
  compact = false
}) => {
  const [filters, setFilters] = useState<SmartListFilters>({});
  const [tagInput, setTagInput] = useState('');
  const [excludeTagInput, setExcludeTagInput] = useState('');
  const [leadSources, setLeadSources] = useState<string[]>([]);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [listDescription, setListDescription] = useState('');
  
  const { createList, getFilteredCount } = useSmartLists();
  const debouncedFilters = useDebounce(filters, 500);

  // Load available lead sources
  useEffect(() => {
    const loadLeadSources = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('leads')
        .select('lead_source')
        .eq('user_id', user.id)
        .not('lead_source', 'is', null);

      const sources = [...new Set(data?.map(d => d.lead_source).filter(Boolean) || [])];
      setLeadSources(sources as string[]);
    };
    loadLeadSources();
  }, []);

  // Update count when filters change
  useEffect(() => {
    const updateCount = async () => {
      setIsLoadingCount(true);
      const count = await getFilteredCount(debouncedFilters);
      setMatchingCount(count);
      onLeadCountChange?.(count);
      setIsLoadingCount(false);
    };
    updateCount();
  }, [debouncedFilters, getFilteredCount, onLeadCountChange]);

  // Notify parent of filter changes
  useEffect(() => {
    onFilterChange?.(filters);
  }, [filters, onFilterChange]);

  const toggleStatus = (status: string) => {
    setFilters(prev => {
      const current = prev.status || [];
      const updated = current.includes(status)
        ? current.filter(s => s !== status)
        : [...current, status];
      return { ...prev, status: updated.length ? updated : undefined };
    });
  };

  const addTag = (type: 'include' | 'exclude') => {
    const input = type === 'include' ? tagInput : excludeTagInput;
    if (!input.trim()) return;

    const tags = input.split(',').map(t => t.trim()).filter(Boolean);
    
    setFilters(prev => {
      if (type === 'include') {
        const current = prev.tags || [];
        return { ...prev, tags: [...new Set([...current, ...tags])] };
      } else {
        const current = prev.tags_exclude || [];
        return { ...prev, tags_exclude: [...new Set([...current, ...tags])] };
      }
    });

    if (type === 'include') setTagInput('');
    else setExcludeTagInput('');
  };

  const removeTag = (tag: string, type: 'include' | 'exclude') => {
    setFilters(prev => {
      if (type === 'include') {
        const updated = (prev.tags || []).filter(t => t !== tag);
        return { ...prev, tags: updated.length ? updated : undefined };
      } else {
        const updated = (prev.tags_exclude || []).filter(t => t !== tag);
        return { ...prev, tags_exclude: updated.length ? updated : undefined };
      }
    });
  };

  const setDatePreset = (preset: string) => {
    const now = new Date();
    let after: string | undefined;

    switch (preset) {
      case 'today':
        after = new Date(now.setHours(0, 0, 0, 0)).toISOString();
        break;
      case '7days':
        after = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '30days':
        after = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        break;
      case '90days':
        after = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
        break;
    }

    setFilters(prev => ({ ...prev, created_after: after }));
  };

  const clearFilters = () => {
    setFilters({});
    setTagInput('');
    setExcludeTagInput('');
  };

  const handleSaveList = async () => {
    if (!listName.trim()) return;
    
    const result = await createList(listName, filters, listDescription);
    if (result) {
      setSaveDialogOpen(false);
      setListName('');
      setListDescription('');
    }
  };

  const hasActiveFilters = Object.keys(filters).some(key => {
    const value = filters[key as keyof SmartListFilters];
    return value !== undefined && (Array.isArray(value) ? value.length > 0 : true);
  });

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <Select onValueChange={(value) => setFilters(prev => ({ ...prev, status: value ? [value] : undefined }))}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {STATUS_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select onValueChange={(value) => setFilters(prev => ({ ...prev, lead_source: value || undefined }))}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Lead Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {leadSources.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {matchingCount !== null && (
          <Badge variant="outline" className="ml-2">
            {isLoadingCount ? '...' : matchingCount.toLocaleString()} leads
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filter Leads
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
            <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={!hasActiveFilters}>
                  <Save className="h-4 w-4 mr-1" />
                  Save as List
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save as Smart List</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>List Name *</Label>
                    <Input 
                      value={listName} 
                      onChange={e => setListName(e.target.value)}
                      placeholder="e.g., Hot Solar Leads"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input 
                      value={listDescription} 
                      onChange={e => setListDescription(e.target.value)}
                      placeholder="Optional description"
                    />
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      This list will dynamically update as leads match or unmatch the filters.
                    </p>
                    <p className="text-sm font-medium mt-1">
                      Current matches: {matchingCount?.toLocaleString() || 0} leads
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleSaveList} disabled={!listName.trim()}>
                    <Save className="h-4 w-4 mr-1" />
                    Save List
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Filter */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Status
          </Label>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(status => (
              <Badge
                key={status.value}
                variant={filters.status?.includes(status.value) ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-primary/80"
                onClick={() => toggleStatus(status.value)}
              >
                {status.label}
              </Badge>
            ))}
          </div>
        </div>

        {/* Tags Filter */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Tag className="h-4 w-4" />
            Include Tags (match any)
          </Label>
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="Enter tags (comma-separated)"
              onKeyDown={e => e.key === 'Enter' && addTag('include')}
            />
            <Button size="sm" onClick={() => addTag('include')}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {filters.tags && filters.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.tags.map(tag => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => removeTag(tag, 'include')} 
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Exclude Tags Filter */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-destructive">
            <Tag className="h-4 w-4" />
            Exclude Tags
          </Label>
          <div className="flex gap-2">
            <Input
              value={excludeTagInput}
              onChange={e => setExcludeTagInput(e.target.value)}
              placeholder="Tags to exclude"
              onKeyDown={e => e.key === 'Enter' && addTag('exclude')}
            />
            <Button size="sm" variant="destructive" onClick={() => addTag('exclude')}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {filters.tags_exclude && filters.tags_exclude.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {filters.tags_exclude.map(tag => (
                <Badge key={tag} variant="destructive" className="gap-1">
                  {tag}
                  <X 
                    className="h-3 w-3 cursor-pointer" 
                    onClick={() => removeTag(tag, 'exclude')} 
                  />
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Lead Source Filter */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Lead Source
          </Label>
          <Select 
            value={filters.lead_source || ''} 
            onValueChange={value => setFilters(prev => ({ 
              ...prev, 
              lead_source: value && value !== 'all' ? value : undefined 
            }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {leadSources.map(source => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Date Filter */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Created Date
          </Label>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.slice(0, -1).map(preset => (
              <Button
                key={preset.value}
                variant={filters.created_after && preset.value !== 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Matching Count */}
        <div className="pt-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Matching:</span>
            <span className="font-bold text-lg">
              {isLoadingCount ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                matchingCount?.toLocaleString() || 0
              )}
            </span>
            <span className="text-sm text-muted-foreground">leads</span>
          </div>
          <Button onClick={() => onFilterChange?.(filters)}>
            Apply Filters
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdvancedLeadFilter;
