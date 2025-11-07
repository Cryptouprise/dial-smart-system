
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

export const usePredictiveDialing = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Lead Management
  const createLead = async (leadData: Partial<Lead>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!leadData.phone_number) {
        throw new Error('Phone number is required');
      }

      const { data, error } = await supabase
        .from('leads')
        .insert([{ ...leadData, user_id: user.id, phone_number: leadData.phone_number }])
        .select()
        .single();

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
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Validate and filter leads to ensure phone_number is present
      const validLeads = leads.filter(lead => lead.phone_number && lead.phone_number.trim() !== '');
      
      if (validLeads.length === 0) {
        throw new Error('No valid leads found. All leads must have a phone number.');
      }

      const leadsWithUserId = validLeads.map(lead => ({
        user_id: user.id,
        phone_number: lead.phone_number!,
        first_name: lead.first_name || null,
        last_name: lead.last_name || null,
        email: lead.email || null,
        company: lead.company || null,
        status: lead.status || 'new',
        priority: lead.priority || 1,
        notes: lead.notes || null,
        next_callback_at: lead.next_callback_at || null
      }));

      const { data, error } = await supabase
        .from('leads')
        .insert(leadsWithUserId)
        .select();

      if (error) throw error;

      const skippedCount = leads.length - validLeads.length;
      let message = `Successfully imported ${data.length} leads`;
      if (skippedCount > 0) {
        message += ` (${skippedCount} leads skipped due to missing phone numbers)`;
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

  const getLeads = async (filters?: { status?: string; campaign_id?: string }) => {
    setIsLoading(true);
    try {
      let query = supabase.from('leads').select('*').order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.campaign_id) {
        // Get lead IDs that belong to the campaign
        const { data: campaignLeads } = await supabase
          .from('campaign_leads')
          .select('lead_id')
          .eq('campaign_id', filters.campaign_id);

        if (campaignLeads && campaignLeads.length > 0) {
          const leadIds = campaignLeads.map(cl => cl.lead_id);
          query = query.in('id', leadIds);
        } else {
          // No leads in this campaign
          return [];
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch leads",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Campaign Management
  const createCampaign = async (campaignData: Partial<Campaign>) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      if (!campaignData.name) {
        throw new Error('Campaign name is required');
      }

      const { data, error } = await supabase
        .from('campaigns')
        .insert([{ 
          user_id: user.id,
          name: campaignData.name,
          description: campaignData.description || null,
          status: campaignData.status || 'draft',
          script: campaignData.script || null,
          agent_id: campaignData.agent_id || null,
          calls_per_minute: campaignData.calls_per_minute || 5,
          max_attempts: campaignData.max_attempts || 3,
          calling_hours_start: campaignData.calling_hours_start || '09:00',
          calling_hours_end: campaignData.calling_hours_end || '17:00',
          timezone: campaignData.timezone || 'America/New_York'
        }])
        .select()
        .single();

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
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', campaignId)
        .select()
        .single();

      if (error) throw error;

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
      const campaignLeads = leadIds.map(leadId => ({
        campaign_id: campaignId,
        lead_id: leadId
      }));

      const { data, error } = await supabase
        .from('campaign_leads')
        .insert(campaignLeads)
        .select();

      if (error) throw error;

      toast({
        title: "Success",
        description: `Added ${leadIds.length} leads to campaign`,
      });

      return data;
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

  const getCampaigns = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch campaigns",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Outbound Calling
  const makeCall = async (campaignId: string, leadId: string, phoneNumber: string, callerId: string) => {
    setIsLoading(true);
    try {
      // Check if user is authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error('You must be logged in to make calls. Please refresh the page and log in again.');
      }

      console.log('Making call with authenticated user:', session.user.id);

      // Get campaign details for agent ID
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select('agent_id')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;

      if (!campaign.agent_id) {
        throw new Error('Campaign must have an agent assigned');
      }

      // Call the edge function with explicit auth header
      const { data, error } = await supabase.functions.invoke('outbound-calling', {
        body: {
          action: 'create_call',
          campaignId,
          leadId,
          phoneNumber,
          callerId,
          agentId: campaign.agent_id
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
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

  const getCallLogs = async (campaignId?: string) => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('call_logs')
        .select(`
          *,
          leads(first_name, last_name, company),
          campaigns(name)
        `)
        .order('created_at', { ascending: false });

      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch call logs",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateCallOutcome = async (callLogId: string, outcome: string, notes?: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('call_logs')
        .update({ 
          outcome,
          notes,
          status: 'completed'
        })
        .eq('id', callLogId)
        .select()
        .single();

      if (error) throw error;

      // Update lead status based on outcome
      if (data.lead_id) {
        let leadStatus = 'contacted';
        let nextCallback = null;

        switch (outcome) {
          case 'interested':
            leadStatus = 'interested';
            break;
          case 'not_interested':
            leadStatus = 'not_interested';
            break;
          case 'callback':
            leadStatus = 'callback';
            // Set callback for tomorrow
            nextCallback = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            break;
          case 'converted':
            leadStatus = 'converted';
            break;
          case 'do_not_call':
            leadStatus = 'do_not_call';
            break;
        }

        await supabase
          .from('leads')
          .update({ 
            status: leadStatus,
            last_contacted_at: new Date().toISOString(),
            next_callback_at: nextCallback
          })
          .eq('id', data.lead_id);
      }

      toast({
        title: "Success",
        description: "Call outcome updated successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update call outcome",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    // Lead management
    createLead,
    updateLead,
    importLeads,
    getLeads,
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
