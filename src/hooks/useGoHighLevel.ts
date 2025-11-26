
import { useState } from 'react';
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
  customFields?: Record<string, unknown>;
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

  const getGHLCredentials = (): GHLCredentials | null => {
    const credentials = JSON.parse(localStorage.getItem('api-credentials') || '[]') as Array<{service: string; credentials: unknown}>;
    const ghlCreds = credentials.find((cred) => cred.service === 'gohighlevel');
    return ghlCreds?.credentials as GHLCredentials || null;
  };

  const saveGHLCredentials = (credentials: GHLCredentials) => {
    const existingCreds = JSON.parse(localStorage.getItem('api-credentials') || '[]') as Array<{service: string; credentials: unknown}>;
    const updatedCreds = existingCreds.filter((cred) => cred.service !== 'gohighlevel');
    updatedCreds.push({
      service: 'gohighlevel',
      credentials
    });
    localStorage.setItem('api-credentials', JSON.stringify(updatedCreds));
  };

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
    } catch (error) {
      toast({
        title: "Connection Failed",
        description: error instanceof Error ? error.message : "Failed to connect to Go High Level",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const syncContacts = async (direction: 'import' | 'export' | 'bidirectional' = 'import') => {
    const credentials = getGHLCredentials();
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
    } catch (error) {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync contacts",
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
    const credentials = getGHLCredentials();
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
    } catch (error) {
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
    const credentials = getGHLCredentials();
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create opportunity",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getPipelines = async () => {
    const credentials = getGHLCredentials();
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch pipelines",
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
    const credentials = getGHLCredentials();
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch contacts",
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
    syncContacts,
    updateContactAfterCall,
    createOpportunity,
    getPipelines,
    getContacts
  };
};
