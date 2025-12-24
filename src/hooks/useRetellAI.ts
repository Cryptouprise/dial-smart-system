
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

// Helper to extract user-friendly error messages from edge function responses
const extractErrorMessage = async (error: any, defaultMessage: string): Promise<string> => {
  if (!error) return defaultMessage;
  
  // Try to get error from response body
  try {
    const errorData = await error.context?.json?.();
    if (errorData?.error) return errorData.error;
    if (errorData?.message) return errorData.message;
  } catch (parseError) {
    // Ignore parsing errors - this is expected for some error responses
    console.error('Unable to parse Retell AI error response:', parseError);
  }
  
  // Check if it's a generic edge function error
  if (error.message?.includes('non-2xx status code')) {
    return defaultMessage;
  }
  
  return error.message || defaultMessage;
};

export const useRetellAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Test Retell API connection
  const testConnection = async (): Promise<{ valid: boolean; error?: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('retell-phone-management', {
        body: { action: 'list' }
      });

      if (error) {
        return { valid: false, error: await extractErrorMessage(error, 'Connection failed') };
      }

      if (data?.error) {
        return { valid: false, error: data.error };
      }

      return { valid: true };
    } catch (error: any) {
      return { valid: false, error: error.message || 'Connection test failed' };
    }
  };

  const getRetellCredentials = async () => {
    // API key is stored in Supabase secrets, not user_credentials table
    // Test the connection to verify it's configured
    const result = await testConnection();
    return result.valid;
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
        const errorMessage = await extractErrorMessage(error, 'Failed to import phone number');
        toast({ title: "Import Failed", description: errorMessage, variant: "destructive" });
        return null;
      }
      
      if (data?.error) {
        toast({ title: "Import Failed", description: data.error, variant: "destructive" });
        return null;
      }

      console.log('[useRetellAI] Import success:', data);
      toast({ title: "Success", description: `Phone number ${phoneNumber} imported to Retell AI` });
      return data;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to import phone number');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to update phone number');
        toast({ title: "Update Failed", description: errorMessage, variant: "destructive" });
        return null;
      }
      
      if (data?.error) {
        toast({ title: "Update Failed", description: data.error, variant: "destructive" });
        return null;
      }

      toast({ title: "Success", description: `Phone number ${phoneNumber} updated` });
      return data;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to update phone number');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to delete phone number');
        toast({ title: "Delete Failed", description: errorMessage, variant: "destructive" });
        return false;
      }
      
      if (data?.error) {
        toast({ title: "Delete Failed", description: data.error, variant: "destructive" });
        return false;
      }

      toast({ title: "Success", description: `Phone number ${phoneNumber} deleted from Retell AI` });
      return true;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to delete phone number');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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

      if (error) {
        console.error('[useRetellAI] List phone numbers error:', error);
        return [];
      }
      
      if (data?.error) {
        console.error('[useRetellAI] List phone numbers error:', data.error);
        return [];
      }
      
      console.log('[useRetellAI] Phone numbers response:', data);
      return Array.isArray(data) ? data : (data?.phone_numbers || []);
    } catch (error: any) {
      console.error('[useRetellAI] List phone numbers failed:', error);
      return [];
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

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to list available numbers');
        toast({ title: "Error", description: errorMessage, variant: "destructive" });
        return [];
      }
      
      if (data?.error) {
        toast({ title: "Error", description: data.error, variant: "destructive" });
        return [];
      }
      
      return Array.isArray(data) ? data : (data?.available_numbers || []);
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to list available numbers');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return [];
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

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to purchase phone number');
        toast({ title: "Purchase Failed", description: errorMessage, variant: "destructive" });
        return null;
      }
      
      if (data?.error) {
        toast({ title: "Purchase Failed", description: data.error, variant: "destructive" });
        return null;
      }

      toast({ title: "Success", description: `Phone number ${phoneNumber} purchased from Retell AI` });
      return data;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to purchase phone number');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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

      if (error) {
        console.error('[useRetellAI] List agents error:', error);
        return [];
      }
      
      if (data?.error) {
        console.error('[useRetellAI] List agents error:', data.error);
        return [];
      }
      
      console.log('[useRetellAI] Agents response:', data);
      return Array.isArray(data) ? data : (data?.agents || []);
    } catch (error: any) {
      console.error('[useRetellAI] List agents failed:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  const createAgent = async (agentName: string, llmId: string, voiceId?: string, webhookUrl?: string): Promise<Agent | null> => {
    if (!agentName || !llmId) {
      toast({ title: "Missing Information", description: "Agent name and LLM are required", variant: "destructive" });
      return null;
    }
    
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
        const errorMessage = await extractErrorMessage(error, 'Failed to create agent');
        toast({ title: "Create Failed", description: errorMessage, variant: "destructive" });
        return null;
      }
      
      if (data?.error) {
        toast({ title: "Create Failed", description: data.error, variant: "destructive" });
        return null;
      }

      console.log('[useRetellAI] Agent created:', data);
      toast({ title: "Success", description: `Agent "${agentName}" created successfully` });
      return data;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to create agent');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getAgent = async (agentId: string): Promise<any | null> => {
    if (!agentId) {
      console.warn('[useRetellAI] getAgent called without agentId');
      return null;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'get',
          agentId
        }
      });

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to get agent details');
        console.error('[useRetellAI] Get agent error:', errorMessage);
        return null;
      }
      
      if (data?.error) {
        console.error('[useRetellAI] Get agent error:', data.error);
        return null;
      }
      
      return data;
    } catch (error: any) {
      console.error('[useRetellAI] Get agent failed:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateAgent = async (agentId: string, agentConfig: any): Promise<any | null> => {
    if (!agentId) {
      toast({ title: "Error", description: "Please select an agent first", variant: "destructive" });
      return null;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'update',
          agentId,
          agentConfig
        }
      });

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to update agent');
        toast({ title: "Update Failed", description: errorMessage, variant: "destructive" });
        return null;
      }
      
      if (data?.error) {
        toast({ title: "Update Failed", description: data.error, variant: "destructive" });
        return null;
      }

      toast({ title: "Success", description: "Agent updated successfully" });
      return data;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to update agent');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAgent = async (agentId: string): Promise<boolean> => {
    if (!agentId) {
      toast({ title: "Error", description: "Please select an agent to delete", variant: "destructive" });
      return false;
    }
    
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'delete',
          agentId
        }
      });

      if (error) {
        const errorMessage = await extractErrorMessage(error, 'Failed to delete agent');
        toast({ title: "Delete Failed", description: errorMessage, variant: "destructive" });
        return false;
      }
      
      if (data?.error) {
        toast({ title: "Delete Failed", description: data.error, variant: "destructive" });
        return false;
      }

      toast({ title: "Success", description: "Agent deleted successfully" });
      return true;
    } catch (error: any) {
      const errorMessage = await extractErrorMessage(error, 'Failed to delete agent');
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
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

      const webhookUrl = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook';

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
