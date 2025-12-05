import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DialingAlgorithmParams {
  avgCallDuration: number; // seconds
  avgAnswerRate: number; // percentage
  avgAgentWrapTime: number; // seconds
  availableAgents: number;
  targetAbandonmentRate: number; // percentage
}

interface PredictiveMetrics {
  dialingRatio: number; // calls to agent ratio
  optimalConcurrency: number;
  predictedAnswers: number;
  estimatedAbandonments: number;
  recommendation: string;
  complianceStatus: 'compliant' | 'warning' | 'violation';
  efficiency: number;
}

export const usePredictiveDialingAlgorithm = () => {
  const [metrics, setMetrics] = useState<PredictiveMetrics | null>(null);
  const [historicalData, setHistoricalData] = useState<any[]>([]);

  // Load historical performance data
  const loadHistoricalData = async () => {
    try {
      const { data, error } = await supabase
        .from('predictive_dialing_stats')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(100);

      if (error) throw error;
      setHistoricalData(data || []);
      return data;
    } catch (error) {
      console.error('Error loading historical data:', error);
      return [];
    }
  };

  // Validate input parameters
  const validateParams = (params: DialingAlgorithmParams): string | null => {
    if (params.avgCallDuration < 1) return 'Average call duration must be at least 1 second';
    if (params.avgAnswerRate < 1 || params.avgAnswerRate > 100) return 'Answer rate must be between 1% and 100%';
    if (params.avgAgentWrapTime < 0) return 'Wrap time cannot be negative';
    if (params.availableAgents < 0) return 'Available agents cannot be negative';
    if (params.targetAbandonmentRate < 0 || params.targetAbandonmentRate > 10) return 'Target abandonment rate should be between 0% and 10%';
    return null;
  };

  // Calculate optimal dialing ratio using VICIdial-style algorithm
  const calculateDialingRatio = (params: DialingAlgorithmParams): number => {
    const {
      avgCallDuration,
      avgAnswerRate,
      avgAgentWrapTime,
      availableAgents,
      targetAbandonmentRate
    } = params;

    // Validate inputs
    const validationError = validateParams(params);
    if (validationError) {
      console.warn('Invalid parameters:', validationError);
      return 1.0; // Return conservative ratio on invalid input
    }

    // Prevent division by zero
    if (avgAnswerRate === 0) {
      console.warn('Answer rate is 0%, using conservative dialing ratio');
      return 1.0;
    }

    // Base ratio calculation
    // Formula: (1 + (drop_call_percent / 100)) / (answer_rate / 100)
    const baseRatio = (1 + (targetAbandonmentRate / 100)) / (avgAnswerRate / 100);

    // Agent availability factor
    const avgHandleTime = avgCallDuration + avgAgentWrapTime;
    const agentUtilization = availableAgents > 0 ? 0.85 : 0; // Target 85% utilization

    // Adjust ratio based on agent availability
    const adjustedRatio = baseRatio * (1 + (agentUtilization * 0.2));

    // Safety bounds - never go below 1.0 or above 4.0
    // More conservative upper bound of 3.5 for better FCC compliance
    return Math.max(1.0, Math.min(3.5, adjustedRatio));
  };

  // Calculate optimal concurrent calls (similar to Caller.io approach)
  const calculateOptimalConcurrency = (params: DialingAlgorithmParams): number => {
    const { availableAgents, avgAnswerRate, avgCallDuration, avgAgentWrapTime } = params;

    if (availableAgents === 0) return 0;

    // Calculate how many calls we can handle
    const avgHandleTime = avgCallDuration + avgAgentWrapTime;
    const callsPerHourPerAgent = 3600 / avgHandleTime;
    
    // Factor in answer rate
    const effectiveCallRate = callsPerHourPerAgent * (avgAnswerRate / 100);
    
    // Calculate optimal concurrency
    const dialingRatio = calculateDialingRatio(params);
    const optimalConcurrency = Math.ceil(availableAgents * dialingRatio);

    return optimalConcurrency;
  };

  // Predict abandonment rate
  const predictAbandonmentRate = (
    concurrentCalls: number,
    availableAgents: number,
    answerRate: number
  ): number => {
    if (availableAgents === 0) return 100;

    const expectedAnswers = concurrentCalls * (answerRate / 100);
    const excessCalls = Math.max(0, expectedAnswers - availableAgents);
    const abandonmentRate = (excessCalls / expectedAnswers) * 100;

    return Math.min(100, Math.max(0, abandonmentRate));
  };

  // Generate AI-powered recommendations (inspired by modern AI dialers)
  const generateRecommendation = (metrics: PredictiveMetrics, params: DialingAlgorithmParams): string => {
    const { dialingRatio, estimatedAbandonments, optimalConcurrency } = metrics;
    const { targetAbandonmentRate, availableAgents } = params;

    if (availableAgents === 0) {
      return "⚠️ No agents available. Dialing paused.";
    }

    if (estimatedAbandonments > targetAbandonmentRate) {
      return `⚠️ Reduce dialing ratio to ${(dialingRatio * 0.9).toFixed(2)} to meet abandonment targets`;
    }

    if (estimatedAbandonments < targetAbandonmentRate * 0.5) {
      return `✅ Increase dialing to ${(dialingRatio * 1.1).toFixed(2)} for better efficiency`;
    }

    if (dialingRatio > 2.5) {
      return `⚡ Aggressive mode: ${optimalConcurrency} concurrent calls recommended`;
    }

    return `✅ Optimal performance: Maintain current dialing ratio of ${dialingRatio.toFixed(2)}`;
  };

  // Determine compliance status
  const determineComplianceStatus = (
    estimatedAbandonmentRate: number,
    targetRate: number
  ): 'compliant' | 'warning' | 'violation' => {
    if (estimatedAbandonmentRate <= targetRate) return 'compliant';
    if (estimatedAbandonmentRate <= targetRate * 1.2) return 'warning'; // Within 20% of target
    return 'violation';
  };

  // Calculate efficiency score
  const calculateEfficiency = (
    optimalConcurrency: number,
    availableAgents: number,
    dialingRatio: number
  ): number => {
    if (availableAgents === 0) return 0;
    
    // Efficiency based on agent utilization and dialing strategy
    const agentUtilization = (optimalConcurrency / (availableAgents * dialingRatio)) * 100;
    const targetUtilization = 85;
    
    // Score drops off as we deviate from target utilization
    const utilizationScore = Math.max(0, 100 - Math.abs(agentUtilization - targetUtilization));
    
    // Bonus for staying within optimal dialing ratio range (1.5-2.5)
    const ratioScore = dialingRatio >= 1.5 && dialingRatio <= 2.5 ? 100 : 80;
    
    return Math.round((utilizationScore * 0.7 + ratioScore * 0.3));
  };

  // Main calculation function
  const calculatePredictiveMetrics = async (
    params: DialingAlgorithmParams
  ): Promise<PredictiveMetrics> => {
    // Validate parameters first
    const validationError = validateParams(params);
    if (validationError) {
      console.error('Parameter validation failed:', validationError);
      throw new Error(validationError);
    }

    // Calculate dialing ratio
    const dialingRatio = calculateDialingRatio(params);

    // Calculate optimal concurrency
    const optimalConcurrency = calculateOptimalConcurrency(params);

    // Predict number of answers
    const predictedAnswers = optimalConcurrency * (params.avgAnswerRate / 100);

    // Estimate abandonments
    const estimatedAbandonmentRate = predictAbandonmentRate(
      optimalConcurrency,
      params.availableAgents,
      params.avgAnswerRate
    );
    const estimatedAbandonments = predictedAnswers * (estimatedAbandonmentRate / 100);

    // Calculate compliance status
    const complianceStatus = determineComplianceStatus(
      estimatedAbandonmentRate,
      params.targetAbandonmentRate
    );

    // Calculate efficiency
    const efficiency = calculateEfficiency(
      optimalConcurrency,
      params.availableAgents,
      dialingRatio
    );

    const metrics: PredictiveMetrics = {
      dialingRatio: parseFloat(dialingRatio.toFixed(2)),
      optimalConcurrency,
      predictedAnswers: Math.round(predictedAnswers),
      estimatedAbandonments: Math.round(estimatedAbandonments),
      recommendation: '',
      complianceStatus,
      efficiency
    };

    // Generate recommendation
    metrics.recommendation = generateRecommendation(metrics, params);

    setMetrics(metrics);
    return metrics;
  };

  // Adaptive learning from historical data
  const learnFromHistory = async () => {
    const history = await loadHistoricalData();
    
    if (history.length < 10) return null;

    // Calculate average metrics from recent history
    const recentData = history.slice(0, 20);
    const avgAnswerRate = recentData.reduce((sum, d) => sum + (d.answer_rate || 0), 0) / recentData.length;
    const avgAbandonmentRate = recentData.reduce((sum, d) => sum + (d.abandonment_rate || 0), 0) / recentData.length;

    return {
      avgAnswerRate,
      avgAbandonmentRate,
      totalCalls: recentData.reduce((sum, d) => sum + (d.calls_attempted || 0), 0)
    };
  };

  // Track real-time performance
  const trackPerformance = async (data: {
    campaignId?: string;
    concurrentCalls: number;
    callsAttempted: number;
    callsConnected: number;
    callsAbandoned: number;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const answerRate = data.callsAttempted > 0 
        ? (data.callsConnected / data.callsAttempted) * 100 
        : 0;
      
      const abandonmentRate = data.callsConnected > 0
        ? (data.callsAbandoned / data.callsConnected) * 100
        : 0;

      await supabase.from('predictive_dialing_stats').insert({
        user_id: user.id,
        campaign_id: data.campaignId,
        concurrent_calls: data.concurrentCalls,
        calls_attempted: data.callsAttempted,
        calls_connected: data.callsConnected,
        calls_abandoned: data.callsAbandoned,
        answer_rate: answerRate,
        abandonment_rate: abandonmentRate,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking performance:', error);
    }
  };

  useEffect(() => {
    loadHistoricalData();
  }, []);

  return {
    metrics,
    historicalData,
    calculatePredictiveMetrics,
    learnFromHistory,
    trackPerformance,
    loadHistoricalData
  };
};
