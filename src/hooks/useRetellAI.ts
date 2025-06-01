
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RetellPhoneNumber {
  phone_number: string;
  nickname?: string;
  inbound_agent_id?: string;
  outbound_agent_id?: string;
  termination_uri?: string;
}

interface Agent {
  agent_id: string;
  agent_name: string;
  voice_id?: string;
  created_at?: string;
}

export const useRetellAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const getRetellCredentials = () => {
    const credentials = JSON.parse(localStorage.getItem('api-credentials') || '[]');
    const retellCreds = credentials.find((cred: any) => cred.service === 'retell');
    return retellCreds?.credentials?.apiKey;
  };

  const importPhoneNumber = async (phoneNumber: string, terminationUri: string) => {
    const apiKey = getRetellCredentials();
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Retell AI credentials not found. Please add them in API Keys.",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'import',
          apiKey,
          phoneNumber,
          terminationUri
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Phone number ${phoneNumber} imported to Retell AI`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to import phone number",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updatePhoneNumber = async (phoneNumber: string, agentId?: string, nickname?: string) => {
    const apiKey = getRetellCredentials();
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Retell AI credentials not found. Please add them in API Keys.",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'update',
          apiKey,
          phoneNumber,
          agentId,
          nickname
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Phone number ${phoneNumber} updated`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update phone number",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deletePhoneNumber = async (phoneNumber: string) => {
    const apiKey = getRetellCredentials();
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Retell AI credentials not found. Please add them in API Keys.",
        variant: "destructive"
      });
      return false;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'delete',
          apiKey,
          phoneNumber
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Phone number ${phoneNumber} deleted from Retell AI`,
      });

      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete phone number",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const listPhoneNumbers = async (): Promise<RetellPhoneNumber[] | null> => {
    const apiKey = getRetellCredentials();
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Retell AI credentials not found. Please add them in API Keys.",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'list',
          apiKey
        }
      });

      if (error) throw error;
      return data?.phone_numbers || [];
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to list phone numbers",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const listAgents = async (): Promise<Agent[] | null> => {
    const apiKey = getRetellCredentials();
    if (!apiKey) {
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'list',
          apiKey
        }
      });

      if (error) throw error;
      return data?.agents || [];
    } catch (error: any) {
      console.error('Failed to list agents:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const createAgent = async (agentName: string): Promise<Agent | null> => {
    const apiKey = getRetellCredentials();
    if (!apiKey) {
      toast({
        title: "Error",
        description: "Retell AI credentials not found. Please add them in API Keys.",
        variant: "destructive"
      });
      return null;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'create',
          apiKey,
          agentName
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Agent "${agentName}" created successfully`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create agent",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    importPhoneNumber,
    updatePhoneNumber,
    deletePhoneNumber,
    listPhoneNumbers,
    listAgents,
    createAgent,
    isLoading
  };
};
