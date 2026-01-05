
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  tags?: string[];
  customFields?: Record<string, any>;
  source?: string;
  dateAdded?: string;
}

interface GHLOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  monetaryValue?: number;
  contactId: string;
  assignedTo?: string;
}

interface GHLCredentials {
  apiKey: string;
  locationId: string;
  webhookKey?: string;
}

interface GHLCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  placeholder?: string;
  position?: number;
}

interface GHLPipeline {
  id: string;
  name: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
  }>;
}

interface GHLCalendar {
  id: string;
  name: string;
  calendarType?: string;
  isActive?: boolean;
  teamMembers?: Array<{ id: string; name: string }>;
}

interface GHLSyncSettings {
  id?: string;
  user_id?: string;
  field_mappings: Record<string, string>;
  pipeline_stage_mappings: Record<string, string>;
  tag_rules: Record<string, string[]>;
  auto_create_opportunities: boolean;
  default_opportunity_value: number;
  default_pipeline_id: string | null;
  remove_conflicting_tags: boolean;
  sync_enabled: boolean;
  calendar_preference: 'google' | 'ghl' | 'both' | 'none';
  ghl_calendar_id?: string | null;
  ghl_calendar_name?: string | null;
}

export const useGoHighLevel = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const getGHLCredentials = useCallback(async (): Promise<GHLCredentials | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('user_credentials')
        .select('credential_key, credential_value_encrypted')
        .eq('user_id', user.id)
        .eq('service_name', 'gohighlevel');

      if (error || !data || data.length === 0) return null;

      const credentials: GHLCredentials = {
        apiKey: '',
        locationId: '',
        webhookKey: ''
      };

      data.forEach((cred) => {
        try {
          const value = atob(cred.credential_value_encrypted);
          if (cred.credential_key === 'apiKey') credentials.apiKey = value;
          if (cred.credential_key === 'locationId') credentials.locationId = value;
          if (cred.credential_key === 'webhookKey') credentials.webhookKey = value;
        } catch (decodeError) {
          console.error('Failed to decode credential:', cred.credential_key, decodeError);
        }
      });

      if (!credentials.apiKey || !credentials.locationId) return null;
      return credentials;
    } catch (error) {
      console.error('Failed to load GoHighLevel credentials:', error);
      return null;
    }
  }, []);

  const saveGHLCredentials = useCallback(async (credentials: GHLCredentials): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to save credentials",
          variant: "destructive"
        });
        return false;
      }

      await supabase
        .from('user_credentials')
        .delete()
        .eq('user_id', user.id)
        .eq('service_name', 'gohighlevel');

      const credentialsToInsert = [
        {
          user_id: user.id,
          service_name: 'gohighlevel',
          credential_key: 'apiKey',
          credential_value_encrypted: btoa(credentials.apiKey)
        },
        {
          user_id: user.id,
          service_name: 'gohighlevel',
          credential_key: 'locationId',
          credential_value_encrypted: btoa(credentials.locationId)
        }
      ];

      if (credentials.webhookKey) {
        credentialsToInsert.push({
          user_id: user.id,
          service_name: 'gohighlevel',
          credential_key: 'webhookKey',
          credential_value_encrypted: btoa(credentials.webhookKey)
        });
      }

      const { error } = await supabase
        .from('user_credentials')
        .insert(credentialsToInsert);

      if (error) throw error;
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save credentials",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  const deleteGHLCredentials = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('user_credentials')
        .delete()
        .eq('user_id', user.id)
        .eq('service_name', 'gohighlevel');

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Failed to delete GoHighLevel credentials:', error);
      return false;
    }
  }, []);

  const testConnection = async (credentials: GHLCredentials) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'test_connection',
          ...credentials
        }
      });

      if (error) throw error;

      toast({
        title: "Connection Successful!",
        description: `Connected to location: ${data.location?.name || 'Unknown'}`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Go High Level",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const syncContacts = async (direction: 'import' | 'export' | 'bidirectional' = 'import') => {
    const credentials = await getGHLCredentials();
    if (!credentials) {
      toast({
        title: "Error",
        description: "Go High Level credentials not found",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'sync_contacts',
          direction,
          ...credentials
        }
      });

      if (error) throw error;

      toast({
        title: "Sync Complete!",
        description: `${direction === 'import' ? 'Imported' : 'Synced'} ${data.imported || 0} contacts`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync contacts",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getCustomFields = async (): Promise<GHLCustomField[] | null> => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'get_custom_fields',
          ...credentials
        }
      });

      if (error) throw error;
      return data.customFields || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch custom fields",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const createCustomField = async (fieldData: {
    name: string;
    dataType: string;
    placeholder?: string;
  }): Promise<GHLCustomField | null> => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'create_custom_field',
          fieldData,
          ...credentials
        }
      });

      if (error) throw error;

      toast({
        title: "Field Created",
        description: `Created custom field: ${fieldData.name}`,
      });

      return data.customField;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create custom field",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getCalendars = async (): Promise<GHLCalendar[] | null> => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'get_calendars',
          ...credentials
        }
      });

      if (error) throw error;
      return data.calendars || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch calendars",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateContactAfterCall = async (contactId: string, callData: {
    outcome: string;
    notes?: string;
    duration?: number;
    callStatus?: string;
    nextAction?: string;
    recordingUrl?: string;
    sentiment?: string;
    summary?: string;
    totalCalls?: number;
    leadScore?: number;
  }, fieldMappings?: Record<string, string>, tagRules?: Record<string, string[]>) => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'update_contact_post_call',
          contactId,
          callData,
          fieldMappings,
          tagRules,
          ...credentials
        }
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Failed to update GHL contact:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePipelineStage = async (contactId: string, pipelineId: string, stageId: string) => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'update_pipeline_stage',
          contactId,
          pipelineId,
          stageId,
          ...credentials
        }
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Failed to update pipeline stage:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const syncWithFieldMapping = async (contactId: string, callData: Record<string, any>) => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'sync_with_field_mapping',
          contactId,
          callData,
          ...credentials
        }
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      console.error('Failed to sync with field mapping:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getSyncSettings = async (): Promise<GHLSyncSettings | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('ghl_sync_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        // Return default settings if none exist
        return {
          field_mappings: {
            outcome: 'last_call_outcome',
            notes: 'last_call_notes',
            duration: 'last_call_duration',
            date: 'last_call_date'
          },
          pipeline_stage_mappings: {},
          tag_rules: {
            interested: ['interested', 'hot-lead'],
            not_interested: ['not-interested', 'cold-lead'],
            callback_requested: ['callback-requested', 'needs-followup'],
            appointment_set: ['appointment-booked', 'qualified'],
            voicemail: ['voicemail-left'],
            no_answer: ['no-answer'],
            dnc: ['dnc', 'do-not-call']
          },
          auto_create_opportunities: false,
          default_opportunity_value: 0,
          default_pipeline_id: null,
          remove_conflicting_tags: true,
          sync_enabled: true,
          calendar_preference: 'both',
          ghl_calendar_id: null,
          ghl_calendar_name: null
        };
      }

      return {
        id: data.id,
        user_id: data.user_id,
        field_mappings: (data.field_mappings as Record<string, string>) || {},
        pipeline_stage_mappings: (data.pipeline_stage_mappings as Record<string, string>) || {},
        tag_rules: (data.tag_rules as Record<string, string[]>) || {},
        auto_create_opportunities: data.auto_create_opportunities || false,
        default_opportunity_value: data.default_opportunity_value || 0,
        default_pipeline_id: data.default_pipeline_id,
        remove_conflicting_tags: data.remove_conflicting_tags ?? true,
        sync_enabled: data.sync_enabled ?? true,
        calendar_preference: (data.calendar_preference as 'google' | 'ghl' | 'both' | 'none') || 'both',
        ghl_calendar_id: data.ghl_calendar_id || null,
        ghl_calendar_name: data.ghl_calendar_name || null
      };
    } catch (error) {
      console.error('Failed to get sync settings:', error);
      return null;
    }
  };

  const saveSyncSettings = async (settings: Partial<GHLSyncSettings>): Promise<boolean> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to save settings",
          variant: "destructive"
        });
        return false;
      }

      const { error } = await supabase
        .from('ghl_sync_settings')
        .upsert({
          user_id: user.id,
          field_mappings: settings.field_mappings || {},
          pipeline_stage_mappings: settings.pipeline_stage_mappings || {},
          tag_rules: settings.tag_rules || {},
          auto_create_opportunities: settings.auto_create_opportunities || false,
          default_opportunity_value: settings.default_opportunity_value || 0,
          default_pipeline_id: settings.default_pipeline_id || null,
          remove_conflicting_tags: settings.remove_conflicting_tags ?? true,
          sync_enabled: settings.sync_enabled ?? true,
          calendar_preference: settings.calendar_preference || 'both',
          ghl_calendar_id: settings.ghl_calendar_id || null,
          ghl_calendar_name: settings.ghl_calendar_name || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: "GHL sync settings have been saved",
      });

      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive"
      });
      return false;
    }
  };

  const createOpportunity = async (contactId: string, opportunityData: {
    name: string;
    value?: number;
    pipelineId: string;
    stageId: string;
  }) => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'create_opportunity',
          contactId,
          opportunityData,
          ...credentials
        }
      });

      if (error) throw error;

      toast({
        title: "Opportunity Created",
        description: `Created opportunity: ${opportunityData.name}`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create opportunity",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getPipelines = async (): Promise<GHLPipeline[] | null> => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'get_pipelines',
          ...credentials
        }
      });

      if (error) throw error;
      return data.pipelines || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch pipelines",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getContacts = async (filters?: {
    tags?: string[];
    dateRange?: { start: string; end: string };
    search?: string;
  }) => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'get_contacts',
          filters,
          ...credentials
        }
      });

      if (error) throw error;
      return data.contacts || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch contacts",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isLoading,
    testConnection,
    saveGHLCredentials,
    getGHLCredentials,
    deleteGHLCredentials,
    syncContacts,
    getCustomFields,
    createCustomField,
    getCalendars,
    updateContactAfterCall,
    updatePipelineStage,
    syncWithFieldMapping,
    getSyncSettings,
    saveSyncSettings,
    createOpportunity,
    getPipelines,
    getContacts
  };
};
