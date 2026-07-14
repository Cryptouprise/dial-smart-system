
import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrganizationId } from '@/contexts/OrganizationContext';
import {
  ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE,
  browserCampaignStatusMutationAllowed,
  CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE,
} from '@/lib/launchSafety';
import { useToast } from '@/hooks/use-toast';
import { debouncedErrorToast } from '@/lib/toastDedup';
import { normalizePhoneNumber } from '@/lib/phoneUtils';
import {
  CALL_LOG_CONTROL_LAUNCH_LOCK_MESSAGE,
  QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
} from '@/lib/launchSafety';

interface Lead {
  id: string;
  phone_number: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company?: string;
  status: string;
  priority: number;
  notes?: string;
  next_callback_at?: string;
}

interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: string;
  script?: string;
  agent_id?: string;
  calls_per_minute: number;
  max_attempts: number;
  calling_hours_start: string;
  calling_hours_end: string;
  timezone: string;
}

interface CallLog {
  id: string;
  campaign_id?: string;
  lead_id?: string;
  phone_number: string;
  caller_id: string;
  retell_call_id?: string;
  status: string;
  duration_seconds: number;
  outcome?: string;
  notes?: string;
  created_at: string;
  answered_at?: string;
  ended_at?: string;
}

export interface LeadQueryFilters {
  status?: string;
  statuses?: string[];
  campaign_id?: string;
  lead_ids?: string[];
  search?: string;
  limit?: number;
  lead_source?: string;
  tags?: string[];
  tags_all?: string[];
  tags_exclude?: string[];
  created_after?: string;
  created_before?: string;
}

export const usePredictiveDialing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const organizationId = useCurrentOrganizationId();
  const requireOrganization = () => {
    if (!organizationId) throw new Error('Select an organization before managing dialer data');
    return organizationId;
  };

  const applyLeadQueryFilters = useCallback(async (baseQuery: any, filters?: LeadQueryFilters) => {
    let query = baseQuery;

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    if (filters?.statuses?.length) {
      query = query.in('status', filters.statuses);
    }

    if (filters?.lead_source) {
      query = query.eq('lead_source', filters.lead_source);
    }

    if (filters?.tags?.length) {
      query = query.overlaps('tags', filters.tags);
    }

    if (filters?.tags_all?.length) {
      query = query.contains('tags', filters.tags_all);
    }

    if (filters?.tags_exclude?.length) {
      for (const excludedTag of filters.tags_exclude) {
        query = query.not('tags', 'cs', `{${excludedTag}}`);
      }
    }

    if (filters?.created_after) {
      query = query.gte('created_at', filters.created_after);
    }

    if (filters?.created_before) {
      query = query.lte('created_at', filters.created_before);
    }

    if (filters?.search) {
      const term = filters.search.trim();
      const digits = term.replace(/\D/g, '');

      if (digits.length >= 7) {
        const withPlus = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
        query = query.or(`phone_number.ilike.%${digits}%,phone_number.ilike.%${withPlus}%`);
      } else {
        query = query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone_number.ilike.%${term}%`);
      }
    }

    if (filters?.campaign_id) {
      const { data: campaignLeads, error: campaignLeadError } = await supabase
        .from('campaign_leads')
        .select('lead_id')
        .eq('campaign_id', filters.campaign_id);

      if (campaignLeadError) throw campaignLeadError;

      if (!campaignLeads?.length) {
        return { query: null, empty: true };
      }

      query = query.in('id', campaignLeads.map(cl => cl.lead_id));
    }

    if (filters?.lead_ids?.length) {
      query = query.in('id', filters.lead_ids);
    }

    return { query, empty: false };
  }, []);

  // Lead Management
  const createLead = async (leadData: Partial<Lead>) => {
    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!leadData.phone_number) {
        throw new Error('Phone number is required');
      }

      const normalizedPhone = normalizePhoneNumber(leadData.phone_number);
      if (!normalizedPhone) {
        throw new Error('Invalid phone number format. Please use format: +1234567890');
      }

      // Prevent duplicate leads with the same phone number
      const { data: existing, error: existingError } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', selectedOrganizationId)
        .eq('phone_number', normalizedPhone)
        .maybeSingle();

      if (existingError) throw existingError;
      if (existing) {
        throw new Error('A lead with this phone number already exists.');
      }

      const { data, error } = await supabase
        .from('leads')
        .insert([{ ...leadData, user_id: user.id, organization_id: selectedOrganizationId, phone_number: normalizedPhone }])
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead created successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create lead",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateLead = async (leadId: string, updates: Partial<Lead>) => {
    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      // If phone number is being updated, normalize and prevent duplicates
      if (updates.phone_number) {
        const normalizedPhone = normalizePhoneNumber(updates.phone_number);
        if (!normalizedPhone) {
          throw new Error('Invalid phone number format. Please use format: +1234567890');
        }

        const { data: existing, error: existingError } = await supabase
          .from('leads')
          .select('id')
          .eq('organization_id', selectedOrganizationId)
          .eq('phone_number', normalizedPhone)
          .neq('id', leadId)
          .maybeSingle();

        if (existingError) throw existingError;
        if (existing) {
          throw new Error('Another lead with this phone number already exists.');
        }

        updates = { ...updates, phone_number: normalizedPhone };
      }

      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .eq('organization_id', selectedOrganizationId)
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Lead updated successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update lead",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const importLeads = async (leads: Partial<Lead>[]) => {
    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Normalize and validate incoming leads
      const normalizedLeads: { phone_number: string; first_name?: string; last_name?: string; email?: string; company?: string; status?: string; priority?: number; notes?: string; next_callback_at?: string }[] = [];
      const batchPhones = new Set<string>();

      for (const lead of leads) {
        if (!lead.phone_number || lead.phone_number.trim() === '') continue;

        const normalizedPhone = normalizePhoneNumber(lead.phone_number);
        if (!normalizedPhone) continue;

        // Skip duplicates within the same import batch
        if (batchPhones.has(normalizedPhone)) continue;

        batchPhones.add(normalizedPhone);
        normalizedLeads.push({
          phone_number: normalizedPhone,
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          company: lead.company,
          status: lead.status,
          priority: lead.priority,
          notes: lead.notes,
          next_callback_at: lead.next_callback_at,
        });
      }

      if (normalizedLeads.length === 0) {
        throw new Error('No valid leads found. All leads must have a valid phone number.');
      }

      // Fetch existing phone numbers to prevent duplicates against the database
      const { data: existingLeads, error: existingError } = await supabase
        .from('leads')
        .select('phone_number')
        .eq('organization_id', selectedOrganizationId);

      if (existingError) throw existingError;

      const existingPhones = new Set(existingLeads?.map(l => l.phone_number) || []);

      const leadsToInsert = normalizedLeads
        .filter(l => !existingPhones.has(l.phone_number))
        .map(lead => ({
          user_id: user.id,
          organization_id: selectedOrganizationId,
          phone_number: lead.phone_number,
          first_name: lead.first_name || null,
          last_name: lead.last_name || null,
          email: lead.email || null,
          company: lead.company || null,
          status: lead.status || 'new',
          priority: lead.priority || 1,
          notes: lead.notes || null,
          next_callback_at: lead.next_callback_at || null,
        }));

      if (leadsToInsert.length === 0) {
        throw new Error('All leads were skipped because their phone numbers already exist.');
      }

      const { data, error } = await supabase
        .from('leads')
        .insert(leadsToInsert)
        .select();

      if (error) throw error;

      const skippedMissing = leads.length - normalizedLeads.length;
      const skippedDuplicates = normalizedLeads.length - leadsToInsert.length;
      let message = `Successfully imported ${data.length} leads`;
      if (skippedMissing > 0) {
        message += ` (${skippedMissing} skipped due to invalid/missing phone numbers)`;
      }
      if (skippedDuplicates > 0) {
        message += ` (${skippedDuplicates} skipped because they already exist)`;
      }

      toast({
        title: "Success",
        description: message,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import leads",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const resetLeadsForCalling = async (_leadIds: string[]) => {
    toast({
      title: 'Reset for calling is launch-locked',
      description: QUEUE_CONTROL_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
    return false;
  };

  // Fetch ALL matching lead IDs with pagination (only IDs, lightweight)
  const getAllMatchingLeadIds = useCallback(async (filters?: LeadQueryFilters): Promise<string[]> => {
    try {
      const allIds: string[] = [];
      const pageSize = 1000;
      let offset = 0;
      let keepGoing = true;

      while (keepGoing) {
        const { query, empty } = await applyLeadQueryFilters(
          supabase.from('leads').select('id').eq('organization_id', organizationId || '').order('created_at', { ascending: false }),
          filters
        );

        if (empty || !query) return [];

        const { data, error } = await query.range(offset, offset + pageSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;

        allIds.push(...data.map((row: any) => row.id));
        if (data.length < pageSize) {
          keepGoing = false;
        } else {
          offset += pageSize;
        }
      }

      return allIds;
    } catch {
      return [];
    }
  }, [applyLeadQueryFilters, organizationId]);

  const getLeadCount = useCallback(async (filters?: LeadQueryFilters) => {
    try {
      const { query, empty } = await applyLeadQueryFilters(
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId || ''),
        filters
      );

      if (empty || !query) return 0;

      const { count, error } = await query;
      if (error) return null;
      return count;
    } catch {
      return null;
    }
  }, [applyLeadQueryFilters, organizationId]);

  const getLeads = useCallback(async (filters?: LeadQueryFilters) => {
    setIsLoading(true);
    try {
      const { query, empty } = await applyLeadQueryFilters(
        supabase.from('leads').select('*').eq('organization_id', organizationId || '').order('created_at', { ascending: false }),
        filters
      );

      if (empty || !query) return [];

      const limitedQuery = query.limit(filters?.limit || 5000);

      const { data, error } = await limitedQuery;

      if (error) throw error;
      return data;
    } catch (error: any) {
      debouncedErrorToast(toast, error.message || "Failed to fetch leads");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [applyLeadQueryFilters, organizationId, toast]);

  // Campaign Management
  const createCampaign = async (campaignData: Partial<Campaign>) => {
    if (campaignData.status !== undefined && campaignData.status !== 'draft') {
      toast({
        title: 'Campaign creation is launch-locked',
        description: CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE,
        variant: 'destructive',
      });
      return null;
    }

    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!campaignData.name) {
        throw new Error('Campaign name is required');
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert([{ 
          user_id: user.id,
          organization_id: selectedOrganizationId,
          name: campaignData.name,
          description: campaignData.description || null,
          // Browser creation is draft-only. Promotion must eventually cross a
          // separately certified server authorization boundary.
          status: 'draft',
          script: campaignData.script || null,
          agent_id: campaignData.agent_id || null,
          provider: (campaignData as any).provider || 'retell',
          telnyx_assistant_id: (campaignData as any).telnyx_assistant_id || null,
          workflow_id: (campaignData as any).workflow_id || null,
          sms_from_number: (campaignData as any).sms_from_number || null,
          metadata: (campaignData as any).metadata || {},
          calls_per_minute: campaignData.calls_per_minute || 5,
          max_attempts: campaignData.max_attempts || 3,
          calling_hours_start: campaignData.calling_hours_start || '09:00',
          calling_hours_end: campaignData.calling_hours_end || '17:00',
          timezone: campaignData.timezone || 'America/New_York'
        }])
        .select()
        .maybeSingle();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Campaign created successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create campaign",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateCampaign = async (campaignId: string, updates: Partial<Campaign>) => {
    if (updates.status && !browserCampaignStatusMutationAllowed(updates.status)) {
      toast({
        title: 'Campaign status change is launch-locked',
        description: CAMPAIGN_ACTIVATION_LAUNCH_LOCK_MESSAGE,
        variant: 'destructive',
      });
      return null;
    }

    const hasConfigurationUpdates = Object.keys(updates).some((key) => key !== 'status');
    if (updates.status === 'paused' && hasConfigurationUpdates) {
      toast({
        title: 'Pause campaign before editing',
        description: ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE,
        variant: 'destructive',
      });
      return null;
    }

    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      const updateQuery = supabase
        .from('campaigns')
        .update(updates)
        .eq('id', campaignId)
        .eq('organization_id', selectedOrganizationId);

      // This status predicate is part of the update itself, so a stale edit
      // dialog cannot race a server-side activation and mutate a live campaign.
      const guardedUpdateQuery = hasConfigurationUpdates
        ? updateQuery.in('status', ['draft', 'paused'])
        : updateQuery;

      const { data, error } = await guardedUpdateQuery
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data && hasConfigurationUpdates) {
        toast({
          title: 'Campaign editing is launch-locked',
          description: ACTIVE_CAMPAIGN_CONFIGURATION_LAUNCH_LOCK_MESSAGE,
          variant: 'destructive',
        });
        return null;
      }

      toast({
        title: "Success",
        description: "Campaign updated successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update campaign",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const addLeadsToCampaign = async (campaignId: string, leadIds: string[]) => {
    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      const { data: ownedCampaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('id')
        .eq('id', campaignId)
        .eq('organization_id', selectedOrganizationId)
        .maybeSingle();
      if (campaignError) throw campaignError;
      if (!ownedCampaign) throw new Error('Campaign does not belong to the selected organization');

      const { data: ownedLeads, error: leadError } = await supabase
        .from('leads')
        .select('id')
        .eq('organization_id', selectedOrganizationId)
        .in('id', leadIds);
      if (leadError) throw leadError;
      if ((ownedLeads || []).length !== new Set(leadIds).size) {
        throw new Error('One or more leads belong to a different organization');
      }
      // Batch inserts to avoid payload size limits
      const batchSize = 500;
      let totalInserted = 0;
      for (let i = 0; i < leadIds.length; i += batchSize) {
        const batch = leadIds.slice(i, i + batchSize).map(leadId => ({
          campaign_id: campaignId,
          lead_id: leadId
        }));
        const { error } = await supabase
          .from('campaign_leads')
          .insert(batch);
        if (error) throw error;
        totalInserted += batch.length;
      }

      toast({
        title: "Success",
        description: `Added ${totalInserted.toLocaleString()} leads to campaign`,
      });

      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to add leads to campaign",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getCampaigns = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .eq('organization_id', organizationId || '')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error: any) {
      debouncedErrorToast(toast, error.message || "Failed to fetch campaigns");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  // Outbound Calling
  const makeCall = async (campaignId: string, leadId: string, phoneNumber: string, callerId: string) => {
    setIsLoading(true);
    try {
      const selectedOrganizationId = requireOrganization();
      // Check if user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('You must be logged in to make calls. Please refresh the page and log in again.');
      }

      console.log('Making call with authenticated user:', session.user.id);

      // Get campaign details for agent ID
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('agent_id, organization_id')
        .eq('id', campaignId)
        .eq('organization_id', selectedOrganizationId)
        .maybeSingle();

      if (campaignError) throw campaignError;

      if (!campaign?.agent_id) {
        throw new Error('Campaign must have an agent assigned');
      }

      // Call the edge function (auth is handled automatically by Supabase client)
      const { data, error } = await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'create_call',
          organizationId: selectedOrganizationId,
          idempotencyKey: `ui-predictive-call:${crypto.randomUUID()}`,
          campaignId,
          leadId,
          phoneNumber,
          callerId,
          agentId: campaign.agent_id,
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw error;
      }

      if (data?.error) {
        console.error('Edge function returned error:', data.error);
        throw new Error(data.error);
      }

      toast({
        title: "Success",
        description: `Call initiated to ${phoneNumber}`,
      });

      return data;
    } catch (error: any) {
      console.error('Make call error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to make call",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getCallLogs = useCallback(async (campaignId?: string) => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('call_logs')
        .select(`
          *,
          leads(first_name, last_name, company),
          campaigns(name)
        `)
        .eq('organization_id', organizationId || '')
        .order('created_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error: any) {
      debouncedErrorToast(toast, error.message || "Failed to fetch call logs");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, toast]);

  const updateCallOutcome = async (
    _callLogId: string,
    _outcome: string,
    _notes?: string,
  ) => {
    toast({
      title: 'Call outcome launch-locked',
      description: CALL_LOG_CONTROL_LAUNCH_LOCK_MESSAGE,
      variant: 'destructive',
    });
    return null;
  };

  return {
    isLoading,
    // Lead management
    createLead,
    updateLead,
    importLeads,
    getLeads,
    getLeadCount,
    getAllMatchingLeadIds,
    resetLeadsForCalling,
    // Campaign management
    createCampaign,
    updateCampaign,
    addLeadsToCampaign,
    getCampaigns,
    // Calling
    makeCall,
    getCallLogs,
    updateCallOutcome
  };
};
