import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RetellLLM {
  llm_id: string;
  general_prompt: string;
  begin_message: string;
  model: string;
  created_at?: string;
  general_tools?: Array<{
    type: string;
    name: string;
    description?: string;
    url?: string;
    parameters?: any;
    speak_during_execution?: boolean;
    speak_after_execution?: boolean;
  }>;
}

export const useRetellLLM = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const createLLM = async (
    generalPrompt: string,
    beginMessage: string,
    model: string = 'gpt-4o'
  ): Promise<RetellLLM | null> => {
    setIsLoading(true);
    try {
      console.log('[useRetellLLM] Creating LLM with:', { generalPrompt, beginMessage, model });
      
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: {
          action: 'create',
          generalPrompt,
          beginMessage,
          model
        }
      });

      if (error) {
        console.error('[useRetellLLM] Error response:', error);
        throw error;
      }

      console.log('[useRetellLLM] Success:', data);

      toast({
        title: "Success",
        description: "Retell LLM created successfully",
      });

      return data;
    } catch (error: any) {
      console.error('[useRetellLLM] Create error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create Retell LLM",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const listLLMs = async (): Promise<RetellLLM[] | null> => {
    setIsLoading(true);
    try {
      console.log('[useRetellLLM] Listing LLMs');
      
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: {
          action: 'list'
        }
      });

      if (error) {
        console.error('[useRetellLLM] List error response:', error);
        throw error;
      }

      console.log('[useRetellLLM] List success:', data);
      return data?.retell_llms || [];
    } catch (error: any) {
      console.error('[useRetellLLM] List error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to list Retell LLMs",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getLLM = async (llmId: string): Promise<RetellLLM | null> => {
    setIsLoading(true);
    try {
      console.log('[useRetellLLM] Getting LLM:', llmId);
      
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: {
          action: 'get',
          llmId
        }
      });

      if (error) {
        console.error('[useRetellLLM] Get error response:', error);
        throw error;
      }

      console.log('[useRetellLLM] Get success:', data);
      return data;
    } catch (error: any) {
      console.error('[useRetellLLM] Get error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to get Retell LLM",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const updateLLM = async (
    llmId: string,
    updates: {
      generalPrompt?: string;
      beginMessage?: string;
      model?: string;
    }
  ): Promise<RetellLLM | null> => {
    setIsLoading(true);
    try {
      console.log('[useRetellLLM] Updating LLM:', llmId, updates);
      
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: {
          action: 'update',
          llmId,
          ...updates
        }
      });

      if (error) {
        console.error('[useRetellLLM] Update error response:', error);
        throw error;
      }

      console.log('[useRetellLLM] Update success:', data);

      toast({
        title: "Success",
        description: "Retell LLM updated successfully",
      });

      return data;
    } catch (error: any) {
      console.error('[useRetellLLM] Update error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update Retell LLM",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const deleteLLM = async (llmId: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      console.log('[useRetellLLM] Deleting LLM:', llmId);
      
      const { data, error } = await supabase.functions.invoke('retell-llm-management', {
        body: {
          action: 'delete',
          llmId
        }
      });

      if (error) {
        console.error('[useRetellLLM] Delete error response:', error);
        throw error;
      }

      console.log('[useRetellLLM] Delete success:', data);

      toast({
        title: "Success",
        description: "Retell LLM deleted successfully",
      });

      return true;
    } catch (error: any) {
      console.error('[useRetellLLM] Delete error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete Retell LLM",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    createLLM,
    listLLMs,
    getLLM,
    updateLLM,
    deleteLLM,
    isLoading
  };
};
