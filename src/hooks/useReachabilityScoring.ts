import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ReachabilityScore {
  id: string;
  lead_id: string;
  reachability_score: number;
  confidence_level: number;
  total_call_attempts: number;
  successful_calls: number;
  voicemails_left: number;
  sms_sent: number;
  sms_replies: number;
  emails_sent: number;
  emails_opened: number;
  last_successful_contact: string | null;
  best_contact_time: string | null;
  best_contact_day: string | null;
  preferred_channel: string | null;
  score_factors: Record<string, any>;
  ai_notes: string | null;
}

interface ReachabilityEvent {
  id: string;
  lead_id: string;
  event_type: string;
  event_outcome: string | null;
  contact_time: string | null;
  contact_day: string | null;
  created_at: string;
}

export const useReachabilityScoring = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [scores, setScores] = useState<ReachabilityScore[]>([]);
  const { toast } = useToast();

  const recordEvent = useCallback(async (
    leadId: string,
    eventType: string,
    eventOutcome?: string,
    metadata?: Record<string, any>
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.functions.invoke('reachability-scoring', {
        body: {
          action: 'record_event',
          userId: user.id,
          leadId,
          eventType,
          eventOutcome,
          metadata,
        },
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error recording reachability event:', error);
    }
  }, []);

  const getLeadScore = useCallback(async (leadId: string): Promise<ReachabilityScore | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('lead_reachability_scores')
        .select('*')
        .eq('lead_id', leadId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return data as ReachabilityScore | null;
    } catch (error) {
      console.error('Error getting lead score:', error);
      return null;
    }
  }, []);

  const getLeadInsights = useCallback(async (leadId: string) => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase.functions.invoke('reachability-scoring', {
        body: {
          action: 'get_insights',
          userId: user.id,
          leadId,
        },
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting lead insights:', error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAllScores = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('lead_reachability_scores')
        .select('*')
        .eq('user_id', user.id)
        .order('reachability_score', { ascending: true });

      if (error) throw error;
      setScores((data as ReachabilityScore[]) || []);
    } catch (error) {
      console.error('Error loading scores:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const recalculateAllScores = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke('reachability-scoring', {
        body: {
          action: 'recalculate_all',
          userId: user.id,
        },
      });

      if (error) throw error;

      toast({
        title: 'Scores Recalculated',
        description: `Updated reachability scores for ${data?.processed || 0} leads`,
      });

      await loadAllScores();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to recalculate scores',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadAllScores, toast]);

  const getLowScoreLeads = useCallback(async (threshold = 30) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('lead_reachability_scores')
        .select(`
          *,
          leads(id, first_name, last_name, phone_number, status)
        `)
        .eq('user_id', user.id)
        .lte('reachability_score', threshold)
        .order('reachability_score', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error getting low score leads:', error);
      return [];
    }
  }, []);

  return {
    isLoading,
    scores,
    recordEvent,
    getLeadScore,
    getLeadInsights,
    loadAllScores,
    recalculateAllScores,
    getLowScoreLeads,
  };
};
