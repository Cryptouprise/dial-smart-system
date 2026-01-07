import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type ImprovementType = 'script_update' | 'analysis_insight' | 'manual_note' | 'auto_optimization' | 'performance_review';
export type CreatedBy = 'user' | 'lady_jarvis' | 'autonomous';

export interface AgentImprovement {
  id: string;
  user_id: string;
  agent_id: string;
  agent_name: string | null;
  improvement_type: ImprovementType;
  title: string;
  details: Record<string, any>;
  created_by: CreatedBy;
  created_at: string;
}

export interface CreateImprovementParams {
  agent_id: string;
  agent_name?: string;
  improvement_type: ImprovementType;
  title: string;
  details: Record<string, any>;
  created_by?: CreatedBy;
}

export const useAgentImprovementHistory = () => {
  const [improvements, setImprovements] = useState<AgentImprovement[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadImprovements = useCallback(async (agentId?: string, limit = 50) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('agent_improvement_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const typedData = (data || []).map(item => ({
        ...item,
        improvement_type: item.improvement_type as ImprovementType,
        created_by: item.created_by as CreatedBy,
        details: item.details as Record<string, any>
      }));

      setImprovements(typedData);
      return typedData;
    } catch (error) {
      console.error('Error loading improvements:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addImprovement = useCallback(async (params: CreateImprovementParams): Promise<AgentImprovement | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to add improvements",
          variant: "destructive"
        });
        return null;
      }

      const { data, error } = await supabase
        .from('agent_improvement_history')
        .insert({
          user_id: user.id,
          agent_id: params.agent_id,
          agent_name: params.agent_name || null,
          improvement_type: params.improvement_type,
          title: params.title,
          details: params.details,
          created_by: params.created_by || 'user'
        })
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const typedData: AgentImprovement = {
        ...data,
        improvement_type: data.improvement_type as ImprovementType,
        created_by: data.created_by as CreatedBy,
        details: data.details as Record<string, any>
      };

      setImprovements(prev => [typedData, ...prev]);
      return typedData;
    } catch (error) {
      console.error('Error adding improvement:', error);
      toast({
        title: "Error",
        description: "Failed to save improvement",
        variant: "destructive"
      });
      return null;
    }
  }, [toast]);

  const deleteImprovement = useCallback(async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('agent_improvement_history')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setImprovements(prev => prev.filter(i => i.id !== id));
      toast({
        title: "Deleted",
        description: "Improvement record removed"
      });
      return true;
    } catch (error) {
      console.error('Error deleting improvement:', error);
      toast({
        title: "Error",
        description: "Failed to delete improvement",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  const getImprovementsByType = useCallback((type: ImprovementType) => {
    return improvements.filter(i => i.improvement_type === type);
  }, [improvements]);

  const getRecentImprovements = useCallback((count = 5) => {
    return improvements.slice(0, count);
  }, [improvements]);

  return {
    improvements,
    isLoading,
    loadImprovements,
    addImprovement,
    deleteImprovement,
    getImprovementsByType,
    getRecentImprovements
  };
};
