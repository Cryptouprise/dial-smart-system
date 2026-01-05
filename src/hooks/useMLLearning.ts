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

export interface LearningOutcome {
  decisionId: string;
  outcomeType: 'success' | 'failure' | 'neutral';
  outcomeDetails: Record<string, any>;
  learnedAdjustment: Record<string, any>;
  conversionHappened: boolean;
  responseTimeSeconds?: number;
  leadId?: string;
}

export interface LearnedPattern {
  patternKey: string;
  patternType: string;
  patternValue: any;
  successCount: number;
  failureCount: number;
  lastUsedAt: string;
}

/**
 * Hook for ML-powered self-learning system
 * Continuously learns from outcomes to improve system intelligence
 */
export const useMLLearning = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [insights, setInsights] = useState<LearningInsights | null>(null);
  const [learnedPatterns, setLearnedPatterns] = useState<LearnedPattern[]>([]);
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

  /**
   * Record the outcome of an autonomous decision for learning
   */
  const recordDecisionOutcome = useCallback(async (outcome: LearningOutcome) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { error } = await supabase
        .from('learning_outcomes' as any)
        .insert({
          user_id: user.id,
          decision_id: outcome.decisionId,
          outcome_type: outcome.outcomeType,
          outcome_details: outcome.outcomeDetails,
          learned_adjustment: outcome.learnedAdjustment,
          conversion_happened: outcome.conversionHappened,
          response_time_seconds: outcome.responseTimeSeconds,
          lead_id: outcome.leadId
        } as any);

      if (error) throw error;

      console.log('[ML Learning] Outcome recorded:', outcome.outcomeType);
      return true;
    } catch (error) {
      console.error('Error recording decision outcome:', error);
      return false;
    }
  }, []);

  /**
   * Get learned patterns from AI learning table
   */
  const getLearnedPatterns = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('ai_learning')
        .select('*')
        .eq('user_id', user.id)
        .order('success_count', { ascending: false })
        .limit(50);

      if (error) throw error;

      const patterns = (data || []).map((p: any) => ({
        patternKey: p.pattern_key,
        patternType: p.pattern_type,
        patternValue: p.pattern_value,
        successCount: p.success_count || 0,
        failureCount: p.failure_count || 0,
        lastUsedAt: p.last_used_at
      }));

      setLearnedPatterns(patterns);
      return patterns;
    } catch (error) {
      console.error('Error fetching learned patterns:', error);
      return [];
    }
  }, []);

  /**
   * Apply learned optimizations to the system
   */
  const applyLearnedOptimizations = useCallback(async () => {
    try {
      const patterns = await getLearnedPatterns();
      if (patterns.length === 0) {
        toast({
          title: "No Patterns Yet",
          description: "The system needs more data to learn from",
        });
        return null;
      }

      // Analyze patterns and generate recommendations
      const successfulPatterns = patterns.filter(p => p.successCount > p.failureCount);
      const recommendations: string[] = [];

      // Best time patterns
      const timePatterns = successfulPatterns.filter(p => p.patternType === 'best_contact_time');
      if (timePatterns.length > 0) {
        const bestTime = timePatterns[0];
        recommendations.push(`Best contact time: ${bestTime.patternValue.time || 'Morning'}`);
      }

      // Best action patterns
      const actionPatterns = successfulPatterns.filter(p => p.patternType === 'action_preference');
      if (actionPatterns.length > 0) {
        const bestAction = actionPatterns[0];
        recommendations.push(`Most effective action: ${bestAction.patternValue.action || 'SMS'}`);
      }

      toast({
        title: "Optimizations Applied",
        description: `Applied ${recommendations.length} learned patterns`,
      });

      return { patterns: successfulPatterns, recommendations };
    } catch (error) {
      console.error('Error applying optimizations:', error);
      return null;
    }
  }, [getLearnedPatterns, toast]);

  /**
   * Update a learned pattern with new outcome
   */
  const updatePatternFromOutcome = useCallback(async (
    patternKey: string,
    patternType: string,
    success: boolean
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Try to find existing pattern
      const { data: existing } = await supabase
        .from('ai_learning')
        .select('*')
        .eq('user_id', user.id)
        .eq('pattern_key', patternKey)
        .maybeSingle();

      if (existing) {
        // Update existing pattern
        await supabase
          .from('ai_learning')
          .update({
            success_count: success ? (existing.success_count || 0) + 1 : existing.success_count,
            failure_count: !success ? (existing.failure_count || 0) + 1 : existing.failure_count,
            last_used_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        // Create new pattern
        await supabase
          .from('ai_learning')
          .insert({
            user_id: user.id,
            pattern_key: patternKey,
            pattern_type: patternType,
            pattern_value: {},
            success_count: success ? 1 : 0,
            failure_count: success ? 0 : 1,
            last_used_at: new Date().toISOString()
          });
      }

      return true;
    } catch (error) {
      console.error('Error updating pattern:', error);
      return false;
    }
  }, []);

  return {
    isLoading,
    insights,
    learnedPatterns,
    analyzePerformance,
    recordCallOutcome,
    runOptimizations,
    getScriptAnalytics,
    getDispositionAccuracy,
    getOptimizationInsights,
    markInsightAsRead,
    markInsightAsApplied,
    recordDecisionOutcome,
    getLearnedPatterns,
    applyLearnedOptimizations,
    updatePatternFromOutcome
  };
};
