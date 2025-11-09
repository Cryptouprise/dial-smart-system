import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface OptimalRateResult {
  optimal_calls_per_minute: number;
  answer_rate: number;
  avg_call_duration: number;
  confidence: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface LeadScore {
  leadId: string;
  score: number;
  factors: {
    historicalAnswerRate: number;
    timingOptimality: number;
    previousContactSuccess: number;
    leadPriority: number;
    callAttemptCount: number;
  };
}

interface BestTimeResult {
  next_best_time: string;
  best_hours: number[];
  confidence: 'high' | 'low';
  historical_data: Array<{
    hour: number;
    successRate: number;
    attempts: number;
  }>;
}

interface InsightsResult {
  summary: {
    total_calls: number;
    answered_calls: number;
    answer_rate: string;
    data_quality: 'high' | 'medium' | 'low';
  };
  timing_insights: {
    best_hours: Array<{
      hour: number;
      answerRate: number;
      callVolume: number;
    }>;
    best_days: Array<{
      day: string;
      dayNumber: number;
      answerRate: number;
      callVolume: number;
    }>;
  };
  outcome_distribution: Record<string, number>;
  recommendations: string[];
}

export const useAIOptimizedDialer = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const calculateOptimalRate = async (campaignId: string): Promise<OptimalRateResult | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-optimized-dialer', {
        body: {
          action: 'calculate_optimal_rate',
          campaignId
        }
      });

      if (error) throw error;

      toast({
        title: "Optimal Rate Calculated",
        description: data.recommendation,
      });

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to calculate optimal rate",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const prioritizeLeads = async (campaignId: string): Promise<LeadScore[] | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-optimized-dialer', {
        body: {
          action: 'prioritize_leads',
          campaignId
        }
      });

      if (error) throw error;

      toast({
        title: "Leads Prioritized",
        description: `${data.total_leads} leads have been prioritized by AI`,
      });

      return data.prioritized_leads;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to prioritize leads",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const predictBestTime = async (leadId: string): Promise<BestTimeResult | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-optimized-dialer', {
        body: {
          action: 'predict_best_time',
          leadId
        }
      });

      if (error) throw error;

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to predict best time",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getInsights = async (campaignId: string): Promise<InsightsResult | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-optimized-dialer', {
        body: {
          action: 'get_insights',
          campaignId
        }
      });

      if (error) throw error;

      return data;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to get insights",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    calculateOptimalRate,
    prioritizeLeads,
    predictBestTime,
    getInsights,
    isLoading
  };
};
