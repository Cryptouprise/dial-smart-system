
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

  const getRetellCredentials = async () => {
    // Check if credentials are configured by calling the credentials check function
    try {
      const { data, error } = await supabase.functions.invoke('retell-credentials-check');
      
      if (error) {
        console.error('[useRetellAI] Credentials check error:', error);
        return false;
      }

      console.log('[useRetellAI] Credentials status:', data);
      return data?.retell_configured && data?.twilio_configured;
    } catch (error) {
      console.error('[useRetellAI] Credentials check failed:', error);
      return false;
    }
  };

  const checkCredentials = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-credentials-check');
      
      if (error) {
        throw error;
      }

      if (data?.retell_configured && data?.twilio_configured) {
        toast({
          title: "Credentials Configured",
          description: "Retell AI and Twilio credentials are valid",
        });
      } else {
        toast({
          title: "Credentials Missing",
          description: data?.message || "Some credentials are not configured",
          variant: "destructive"
        });
      }

      return data;
    } catch (error: any) {
      console.error('[useRetellAI] Check credentials failed:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to check credentials",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const importPhoneNumber = async (phoneNumber: string, terminationUri: string) => {
    setIsLoading(true);
    try {
      console.log('[useRetellAI] Importing phone number:', { phoneNumber, terminationUri });
      
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'import',
          phoneNumber,
          terminationUri
        }
      });

      if (error) {
        console.error('[useRetellAI] Import error:', error);
        throw error;
      }

      console.log('[useRetellAI] Import success:', data);

      toast({
        title: "Success",
        description: `Phone number ${phoneNumber} imported to Retell AI`,
      });

      return data;
    } catch (error: any) {
      console.error('[useRetellAI] Import failed:', error);
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
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'update',
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
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'delete',
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
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'list'
        }
      });

      if (error) throw error;
      console.log('[useRetellAI] Phone numbers response:', data);
      // Retell AI returns array directly, not wrapped in an object
      return Array.isArray(data) ? data : (data?.phone_numbers || []);
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
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'list'
        }
      });

      if (error) throw error;
      console.log('[useRetellAI] Agents response:', data);
      // Retell AI returns array directly, not wrapped in an object
      return Array.isArray(data) ? data : (data?.agents || []);
    } catch (error: any) {
      console.error('Failed to list agents:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const createAgent = async (agentName: string, llmId: string, voiceId?: string): Promise<Agent | null> => {
    setIsLoading(true);
    try {
      console.log('[useRetellAI] Creating agent:', { agentName, llmId, voiceId });
      
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'create',
          agentName,
          llmId,
          voiceId
        }
      });

      if (error) {
        console.error('[useRetellAI] Create agent error:', error);
        throw error;
      }

      console.log('[useRetellAI] Agent created:', data);

      toast({
        title: "Success",
        description: `Agent "${agentName}" created successfully`,
      });

      return data;
    } catch (error: any) {
      console.error('[useRetellAI] Create agent failed:', error);
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
    getRetellCredentials,
    checkCredentials,
    importPhoneNumber,
    updatePhoneNumber,
    deletePhoneNumber,
    listPhoneNumbers,
    listAgents,
    createAgent,
    isLoading
  };
};
