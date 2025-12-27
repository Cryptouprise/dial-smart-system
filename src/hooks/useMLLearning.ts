import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface LearningInsights {
  scriptPerformance: Record<string, { successRate: number; avgConversionTime: number }>;
  dispositionAccuracy: Record<string, { accuracy: number; confidence: number }>;
  leadScoringFactors: Record<string, number>;
  agentBenchmarks: Record<string, { conversionRate: number; avgCallDuration: number }>;
  recommendations: string[];
}

interface OptimizationResult {
  scriptRecommendations: any[];
  dispositionAdjustments: any[];
  leadScoringUpdates: any[];
  pipelineOptimizations: any[];
}

/**
 * Hook for ML-powered self-learning system
 * Continuously learns from outcomes to improve system intelligence
 */
export const useMLLearning = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const { toast } = useToast();

  /**
   * Analyze system performance and get AI-powered insights
   */
  const analyzePerformance = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ml-learning-engine', {
        body: { action: 'analyze' }
      });

      if (error) throw error;

      setInsights(data.insights);

      toast({
        title: "Analysis Complete",
        description: `Generated ${data.insights.recommendations.length} recommendations`,
      });

      return data.insights;
    } catch (error) {
      console.error('Error analyzing performance:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Failed to analyze performance",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Record learning data for a completed call
   */
  const recordCallOutcome = useCallback(async (data: {
    callOutcome: string;
    disposition: string;
    leadConverted: boolean;
    scriptUsed?: string;
    agentId?: string;
    sentimentScore?: number;
    callDuration?: number;
  }) => {
    try {
      const { error } = await supabase.functions.invoke('ml-learning-engine', {
        body: { action: 'learn', data }
      });

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error recording learning data:', error);
      return false;
    }
  }, []);

  /**
   * Run optimization algorithms and apply improvements
   */
  const runOptimizations = useCallback(async (): Promise<OptimizationResult | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ml-learning-engine', {
        body: { action: 'optimize' }
      });

      if (error) throw error;

      toast({
        title: "Optimization Complete",
        description: "System has been optimized based on learned patterns",
      });

      return data.optimizations;
    } catch (error) {
      console.error('Error running optimizations:', error);
      toast({
        title: "Optimization Failed",
        description: error instanceof Error ? error.message : "Failed to run optimizations",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  /**
   * Get script performance analytics
   */
  const getScriptAnalytics = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await (supabase
        .from('script_performance_analytics' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('success_rate', { ascending: false }) as any);

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error fetching script analytics:', error);
      return null;
    }
  }, []);

  /**
   * Get disposition accuracy metrics
   */
  const getDispositionAccuracy = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await (supabase
        .from('disposition_accuracy_tracking' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('accuracy_rate', { ascending: false }) as any);

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error fetching disposition accuracy:', error);
      return null;
    }
  }, []);

  /**
   * Get system optimization insights
   */
  const getOptimizationInsights = useCallback(async (unreadOnly = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      let query = supabase
        .from('system_optimization_insights' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false }) as any;

      if (unreadOnly) {
        query = query.eq('is_read', false);
      }

      const { data, error } = await query;

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error fetching optimization insights:', error);
      return null;
    }
  }, []);

  /**
   * Mark an insight as read
   */
  const markInsightAsRead = useCallback(async (insightId: string) => {
    try {
      const { error } = await (supabase
        .from('system_optimization_insights' as any)
        .update({ is_read: true })
        .eq('id', insightId) as any);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error marking insight as read:', error);
      return false;
    }
  }, []);

  /**
   * Mark an insight as applied
   */
  const markInsightAsApplied = useCallback(async (insightId: string) => {
    try {
      const { error } = await (supabase
        .from('system_optimization_insights' as any)
        .update({ is_applied: true })
        .eq('id', insightId) as any);

      if (error) throw error;

      toast({
        title: "Optimization Applied",
        description: "System has learned from your action",
      });

      return true;
    } catch (error) {
      console.error('Error marking insight as applied:', error);
      return false;
    }
  }, [toast]);

  return {
    isLoading,
    insights,
    analyzePerformance,
    recordCallOutcome,
    runOptimizations,
    getScriptAnalytics,
    getDispositionAccuracy,
    getOptimizationInsights,
    markInsightAsRead,
    markInsightAsApplied
  };
};
