
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
    // API key is stored in Supabase secrets, not user_credentials table
    return true; // Just return true to indicate credentials are configured
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

  const listAvailableNumbers = async (areaCode?: string): Promise<RetellPhoneNumber[] | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'list_available',
          areaCode
        }
      });

      if (error) throw error;
      return Array.isArray(data) ? data : (data?.available_numbers || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to list available numbers",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const purchaseNumber = async (phoneNumber: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: {
          action: 'purchase',
          phoneNumber
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Phone number ${phoneNumber} purchased from Retell AI`,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to purchase phone number",
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

  const createAgent = async (agentName: string, llmId: string, voiceId?: string, webhookUrl?: string): Promise<Agent | null> => {
    setIsLoading(true);
    try {
      console.log('[useRetellAI] Creating agent:', { agentName, llmId, voiceId, webhookUrl });
      
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'create',
          agentName,
          llmId,
          voiceId,
          webhookUrl
        }
      });

      if (error) {
        console.error('[useRetellAI] Create agent error:', error);
        throw error;
      }

      console.log('[useRetellAI] Agent created:', data);

      toast({
        title: "Success",
        description: `Agent "${agentName}" created successfully with webhook configured`,
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

  const getAgent = async (agentId: string): Promise<any | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'get',
          agentId
        }
      });

      if (error) throw error;
      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to get agent details",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateAgent = async (agentId: string, agentConfig: any): Promise<any | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'update',
          agentId,
          agentConfig
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent updated successfully",
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update agent",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAgent = async (agentId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'delete',
          agentId
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Agent deleted successfully",
      });

      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete agent",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const configureWebhooksOnAllAgents = async (): Promise<{ success: number; failed: number }> => {
    setIsLoading(true);
    const results = { success: 0, failed: 0 };
    
    try {
      // First, list all agents
      const agents = await listAgents();
      if (!agents || agents.length === 0) {
        toast({
          title: "No Agents Found",
          description: "No agents to configure webhooks for",
        });
        return results;
      }

      const webhookUrl = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/call-tracking-webhook';

      // Update each agent with the webhook URL
      for (const agent of agents) {
        try {
          const { error } = await supabase.functions.invoke('retell-agent-management', {
            body: {
              action: 'update',
              agentId: agent.agent_id,
              agentConfig: {
                webhook_url: webhookUrl
              }
            }
          });

          if (error) {
            console.error(`Failed to update agent ${agent.agent_id}:`, error);
            results.failed++;
          } else {
            console.log(`Successfully configured webhook for agent ${agent.agent_id}`);
            results.success++;
          }
        } catch (err) {
          console.error(`Error updating agent ${agent.agent_id}:`, err);
          results.failed++;
        }
      }

      toast({
        title: "Webhook Configuration Complete",
        description: `Updated ${results.success} agents. ${results.failed > 0 ? `${results.failed} failed.` : ''}`,
      });

      return results;
    } catch (error: any) {
      console.error('Failed to configure webhooks:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to configure webhooks",
        variant: "destructive"
      });
      return results;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    importPhoneNumber,
    updatePhoneNumber,
    deletePhoneNumber,
    listPhoneNumbers,
    listAvailableNumbers,
    purchaseNumber,
    listAgents,
    createAgent,
    getAgent,
    updateAgent,
    deleteAgent,
    configureWebhooksOnAllAgents,
    isLoading
  };
};
