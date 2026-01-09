import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface CallRecord {
  id: string;
  created_at: string;
  lead_id: string | null;
  campaign_id: string | null;
  phone_number: string;
  caller_id: string;
  status: string;
  outcome: string | null;
  duration_seconds: number | null;
  transcript: string | null;
  notes: string | null;
  ai_analysis: any | null;
  auto_disposition: string | null;
  confidence_score: number | null;
  agent_id: string | null;
  agent_name: string | null;
  recording_url: string | null;
  sentiment: string | null;
  call_summary: string | null;
  lead?: {
    first_name: string | null;
    last_name: string | null;
    phone_number: string | null;
  };
}

export interface CallFilters {
  agentId?: string;
  disposition?: string;
  sentiment?: string;
  dateFrom?: string;
  dateTo?: string;
  hasTranscript?: boolean;
  minDuration?: number;
  maxDuration?: number;
}

export interface RetellAgent {
  agent_id: string;
  agent_name: string;
}

export const useCallHistory = () => {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [agents, setAgents] = useState<RetellAgent[]>([]);
  const [dispositions, setDispositions] = useState<string[]>([]);
  const { toast } = useToast();

  // Fetch unique agents from call_logs
  const fetchAgents = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('call_logs')
        .select('agent_id, agent_name')
        .eq('user_id', user.id)
        .not('agent_id', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get unique agents
      const uniqueAgents = new Map<string, RetellAgent>();
      (data || []).forEach(row => {
        if (row.agent_id && !uniqueAgents.has(row.agent_id)) {
          uniqueAgents.set(row.agent_id, {
            agent_id: row.agent_id,
            agent_name: row.agent_name || row.agent_id
          });
        }
      });

      setAgents(Array.from(uniqueAgents.values()));
    } catch (error) {
      console.error('Error fetching agents:', error);
    }
  }, []);

  // Fetch all dispositions from dispositions table
  const fetchDispositions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('dispositions')
        .select('name')
        .eq('user_id', user.id)
        .order('name');

      if (error) throw error;

      const unique = new Set<string>();
      (data || []).forEach(row => {
        if (row.name) unique.add(row.name);
      });

      setDispositions(Array.from(unique).sort());
    } catch (error) {
      console.error('Error fetching dispositions:', error);
    }
  }, []);

  // Fetch calls with filters
  const fetchCalls = useCallback(async (filters: CallFilters = {}, limit = 50) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      let query = supabase
        .from('call_logs')
        .select(`
          id, created_at, lead_id, campaign_id, phone_number, caller_id,
          status, outcome, duration_seconds, transcript, notes,
          ai_analysis, auto_disposition, confidence_score,
          agent_id, agent_name, recording_url, sentiment, call_summary,
          leads:lead_id (first_name, last_name, phone_number)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Apply filters
      if (filters.agentId) {
        query = query.eq('agent_id', filters.agentId);
      }
      if (filters.disposition) {
        query = query.or(`outcome.eq.${filters.disposition},auto_disposition.eq.${filters.disposition}`);
      }
      if (filters.sentiment) {
        query = query.eq('sentiment', filters.sentiment);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }
      if (filters.hasTranscript) {
        // Check EITHER transcript OR notes has content
        query = query.or('transcript.neq.null,notes.neq.null');
      }
      if (filters.minDuration !== undefined) {
        query = query.gte('duration_seconds', filters.minDuration);
      }
      if (filters.maxDuration !== undefined) {
        query = query.lte('duration_seconds', filters.maxDuration);
      }

      const { data, error } = await query;

      if (error) throw error;

      const formattedCalls: CallRecord[] = (data || []).map((row: any) => ({
        ...row,
        lead: row.leads || undefined
      }));

      setCalls(formattedCalls);
      return formattedCalls;
    } catch (error) {
      console.error('Error fetching calls:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch call history',
        variant: 'destructive'
      });
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Get aggregated insights from calls
  const getAggregatedInsights = useCallback((callList: CallRecord[]) => {
    const objections: Record<string, number> = {};
    const painPoints: Record<string, number> = {};
    const sentiments: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };
    let totalConfidence = 0;
    let analyzedCount = 0;

    callList.forEach(call => {
      if (call.ai_analysis) {
        analyzedCount++;
        totalConfidence += call.confidence_score || 0;

        // Aggregate objections
        const callObjections = call.ai_analysis.objections || [];
        callObjections.forEach((obj: string) => {
          objections[obj] = (objections[obj] || 0) + 1;
        });

        // Aggregate pain points
        const callPainPoints = call.ai_analysis.pain_points || [];
        callPainPoints.forEach((pp: string) => {
          painPoints[pp] = (painPoints[pp] || 0) + 1;
        });
      }

      // Count sentiments
      if (call.sentiment) {
        sentiments[call.sentiment] = (sentiments[call.sentiment] || 0) + 1;
      }
    });

    // Sort and get top items
    const sortedObjections = Object.entries(objections)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const sortedPainPoints = Object.entries(painPoints)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      totalCalls: callList.length,
      analyzedCalls: analyzedCount,
      avgConfidence: analyzedCount > 0 ? totalConfidence / analyzedCount : 0,
      topObjections: sortedObjections,
      topPainPoints: sortedPainPoints,
      sentimentBreakdown: sentiments
    };
  }, []);

  return {
    calls,
    isLoading,
    agents,
    dispositions,
    fetchCalls,
    fetchAgents,
    fetchDispositions,
    getAggregatedInsights
  };
};
