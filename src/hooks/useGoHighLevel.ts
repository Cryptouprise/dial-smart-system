
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
          // Invalid base64 encoding - skip this credential
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

      // Delete existing GHL credentials
      await supabase
        .from('user_credentials')
        .delete()
        .eq('user_id', user.id)
        .eq('service_name', 'gohighlevel');

      // Insert new credentials
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
      console.error('Failed to save GoHighLevel credentials:', error);
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
        description: `${direction === 'import' ? 'Imported' : 'Synced'} ${data.count || 0} contacts`,
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

  const updateContactAfterCall = async (contactId: string, callData: {
    outcome: string;
    notes: string;
    duration: number;
    callStatus: string;
    nextAction?: string;
  }) => {
    const credentials = await getGHLCredentials();
    if (!credentials) return null;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-integration', {
        body: {
          action: 'update_contact_post_call',
          contactId,
          callData,
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

  const getPipelines = async () => {
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
    updateContactAfterCall,
    createOpportunity,
    getPipelines,
    getContacts
  };
};
