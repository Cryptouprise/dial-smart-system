import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface SmartListFilters {
  tags?: string[];
  tags_all?: string[];
  tags_exclude?: string[];
  status?: string[];
  lead_source?: string;
  campaign_id?: string;
  lead_ids?: string[];
  created_after?: string;
  created_before?: string;
  has_email?: boolean;
  has_phone?: boolean;
  state?: string[];
}

export interface SmartList {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  filters: SmartListFilters;
  is_dynamic: boolean;
  lead_count: number;
  created_at: string;
  updated_at: string;
}

export const useSmartLists = () => {
  const [lists, setLists] = useState<SmartList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchLists = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('smart_lists')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      // Type cast the data since filters is JSONB
      setLists((data || []).map(item => ({
        ...item,
        filters: (item.filters || {}) as SmartListFilters
      })));
    } catch (error) {
      console.error('Error fetching smart lists:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createList = useCallback(async (
    name: string, 
    filters: SmartListFilters, 
    description?: string,
    isDynamic: boolean = true
  ): Promise<SmartList | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get initial lead count
      const count = await getFilteredCount(filters);

      const { data, error } = await supabase
        .from('smart_lists')
        .insert({
          user_id: user.id,
          name,
          description,
          filters: filters as any,
          is_dynamic: isDynamic,
          lead_count: count
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Failed to create list - no data returned');

      toast({
        title: 'Smart List Created',
        description: `"${name}" with ${count} leads`
      });

      await fetchLists();
      return { ...data, filters: data.filters as SmartListFilters };
    } catch (error: any) {
      console.error('Error creating smart list:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return null;
    }
  }, [toast, fetchLists]);

  const updateList = useCallback(async (
    listId: string, 
    updates: Partial<Pick<SmartList, 'name' | 'description' | 'filters'>>
  ): Promise<boolean> => {
    try {
      const updateData: any = { ...updates };
      if (updates.filters) {
        updateData.filters = updates.filters as any;
        updateData.lead_count = await getFilteredCount(updates.filters);
      }

      const { error } = await supabase
        .from('smart_lists')
        .update(updateData)
        .eq('id', listId);

      if (error) throw error;

      toast({ title: 'Smart List Updated' });
      await fetchLists();
      return true;
    } catch (error: any) {
      console.error('Error updating smart list:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, fetchLists]);

  const deleteList = useCallback(async (listId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('smart_lists')
        .delete()
        .eq('id', listId);

      if (error) throw error;

      toast({ title: 'Smart List Deleted' });
      await fetchLists();
      return true;
    } catch (error: any) {
      console.error('Error deleting smart list:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return false;
    }
  }, [toast, fetchLists]);

  const getFilteredCount = useCallback(async (filters: SmartListFilters): Promise<number> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      let query = supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // Apply filters
      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters.lead_source) {
        query = query.eq('lead_source', filters.lead_source);
      }
      if (filters.campaign_id) {
        const { data: campaignLeads, error: campaignLeadError } = await supabase
          .from('campaign_leads')
          .select('lead_id')
          .eq('campaign_id', filters.campaign_id);

        if (campaignLeadError) throw campaignLeadError;

        const campaignLeadIds = campaignLeads?.map(item => item.lead_id) || [];
        if (campaignLeadIds.length === 0) return 0;

        query = query.in('id', campaignLeadIds);
      }
      if (filters.lead_ids?.length) {
        query = query.in('id', filters.lead_ids);
      }
      if (filters.tags?.length) {
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.tags_all?.length) {
        query = query.contains('tags', filters.tags_all);
      }
      // Handle tags_exclude - exclude leads that have any of these tags
      if (filters.tags_exclude?.length) {
        // Use NOT overlaps to exclude leads with any excluded tags
        for (const excludedTag of filters.tags_exclude) {
          query = query.not('tags', 'cs', `{${excludedTag}}`);
        }
      }
      if (filters.created_after) {
        query = query.gte('created_at', filters.created_after);
      }
      if (filters.created_before) {
        query = query.lte('created_at', filters.created_before);
      }
      if (filters.has_email === true) {
        query = query.not('email', 'is', null);
      }
      if (filters.has_phone === true) {
        query = query.not('phone_number', 'is', null);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting filtered count:', error);
      return 0;
    }
  }, []);

  const getListLeads = useCallback(async (
    listId: string, 
    limit: number = 100, 
    offset: number = 0
  ) => {
    try {
      const list = lists.find(l => l.id === listId);
      if (!list) throw new Error('List not found');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const filters = list.filters;

      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters.lead_source) {
        query = query.eq('lead_source', filters.lead_source);
      }
      if (filters.campaign_id) {
        const { data: campaignLeads, error: campaignLeadError } = await supabase
          .from('campaign_leads')
          .select('lead_id')
          .eq('campaign_id', filters.campaign_id);

        if (campaignLeadError) throw campaignLeadError;

        const campaignLeadIds = campaignLeads?.map(item => item.lead_id) || [];
        if (campaignLeadIds.length === 0) return [];

        query = query.in('id', campaignLeadIds);
      }
      if (filters.lead_ids?.length) {
        query = query.in('id', filters.lead_ids);
      }
      if (filters.tags?.length) {
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.tags_all?.length) {
        query = query.contains('tags', filters.tags_all);
      }
      // Handle tags_exclude - exclude leads that have any of these tags
      if (filters.tags_exclude?.length) {
        for (const excludedTag of filters.tags_exclude) {
          query = query.not('tags', 'cs', `{${excludedTag}}`);
        }
      }
      if (filters.created_after) {
        query = query.gte('created_at', filters.created_after);
      }
      if (filters.created_before) {
        query = query.lte('created_at', filters.created_before);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting list leads:', error);
      return [];
    }
  }, [lists]);

  const addTagsToLeads = useCallback(async (
    leadIds: string[], 
    tags: string[]
  ): Promise<number> => {
    try {
      if (leadIds.length === 0 || tags.length === 0) return 0;

      // Fetch existing tags in batches to avoid PostgREST URL length limits
      const fetchBatchSize = 300;
      const allLeads: { id: string; tags: string[] | null }[] = [];
      for (let i = 0; i < leadIds.length; i += fetchBatchSize) {
        const batchIds = leadIds.slice(i, i + fetchBatchSize);
        const { data, error } = await supabase
          .from('leads')
          .select('id,tags')
          .in('id', batchIds);
        if (error) throw error;
        if (data) allLeads.push(...data);
      }

      const updates = allLeads.map((lead) => ({
        id: lead.id,
        tags: Array.from(new Set([...
          (((lead.tags || []) as string[])),
          ...tags,
        ])),
      }));

      let successCount = 0;
      const batchSize = 100;

      for (let index = 0; index < updates.length; index += batchSize) {
        const batch = updates.slice(index, index + batchSize);
        const results = await Promise.all(
          batch.map((lead) =>
            supabase
              .from('leads')
              .update({ tags: lead.tags })
              .eq('id', lead.id)
          )
        );

        successCount += results.filter((result) => !result.error).length;
      }

      toast({
        title: 'Tags Added',
        description: `Added ${tags.length} tag(s) to ${successCount} leads`
      });

      return successCount;
    } catch (error: any) {
      console.error('Error adding tags:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return 0;
    }
  }, [toast]);

  const removeTagsFromLeads = useCallback(async (
    leadIds: string[], 
    tags: string[]
  ): Promise<number> => {
    try {
      if (leadIds.length === 0 || tags.length === 0) return 0;

      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('id,tags')
        .in('id', leadIds);

      if (leadsError) throw leadsError;

      const updates = (leads || []).map((lead) => ({
        id: lead.id,
        tags: (((lead.tags || []) as string[])).filter((existingTag) => !tags.includes(existingTag)),
      }));

      let successCount = 0;
      const batchSize = 100;

      for (let index = 0; index < updates.length; index += batchSize) {
        const batch = updates.slice(index, index + batchSize);
        const results = await Promise.all(
          batch.map((lead) =>
            supabase
              .from('leads')
              .update({ tags: lead.tags })
              .eq('id', lead.id)
          )
        );

        successCount += results.filter((result) => !result.error).length;
      }

      toast({
        title: 'Tags Removed',
        description: `Removed ${tags.length} tag(s) from ${successCount} leads`
      });

      return successCount;
    } catch (error: any) {
      console.error('Error removing tags:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
      return 0;
    }
  }, [toast]);

  const bulkTagByFilter = useCallback(async (
    filters: SmartListFilters,
    tags: string[],
    action: 'add' | 'remove'
  ): Promise<number> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      // Get matching lead IDs
      let query = supabase
        .from('leads')
        .select('id')
        .eq('user_id', user.id);

      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }
      if (filters.tags?.length) {
        query = query.overlaps('tags', filters.tags);
      }
      if (filters.lead_ids?.length) {
        query = query.in('id', filters.lead_ids);
      }
      if (filters.lead_source) {
        query = query.eq('lead_source', filters.lead_source);
      }

      const { data: leads } = await query;
      const leadIds = leads?.map(l => l.id) || [];

      if (leadIds.length === 0) return 0;

      if (action === 'add') {
        return await addTagsToLeads(leadIds, tags);
      } else {
        return await removeTagsFromLeads(leadIds, tags);
      }
    } catch (error) {
      console.error('Error bulk tagging:', error);
      return 0;
    }
  }, [addTagsToLeads, removeTagsFromLeads]);

  const refreshListCount = useCallback(async (listId: string) => {
    try {
      const list = lists.find(l => l.id === listId);
      if (!list) return;

      const count = await getFilteredCount(list.filters);

      await supabase
        .from('smart_lists')
        .update({ lead_count: count })
        .eq('id', listId);

      await fetchLists();
    } catch (error) {
      console.error('Error refreshing list count:', error);
    }
  }, [lists, getFilteredCount, fetchLists]);

  return {
    lists,
    isLoading,
    fetchLists,
    createList,
    updateList,
    deleteList,
    getFilteredCount,
    getListLeads,
    addTagsToLeads,
    removeTagsFromLeads,
    bulkTagByFilter,
    refreshListCount
  };
};
