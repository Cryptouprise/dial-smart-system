import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OptimizationMetrics {
  currentAnswerRate: number;
  targetAnswerRate: number;
  currentPacing: number;
  recommendedPacing: number;
  spamRiskLevel: 'low' | 'medium' | 'high';
  numbersAtRisk: number;
  optimalCallingHours: { start: string; end: string };
  lastOptimizedAt: string;
}

export interface OptimizationAction {
  id: string;
  type: 'pacing' | 'hours' | 'rotation' | 'pause';
  description: string;
  impact: 'low' | 'medium' | 'high';
  autoApplied: boolean;
  appliedAt?: string;
  result?: string;
}

interface OptimizerSettings {
  enabled: boolean;
  autoAdjustPacing: boolean;
  autoRotateNumbers: boolean;
  autoOptimizeHours: boolean;
  targetAnswerRate: number;
  maxPacingAdjustment: number;
  checkIntervalSeconds: number;
}

const DEFAULT_SETTINGS: OptimizerSettings = {
  enabled: true,
  autoAdjustPacing: true,
  autoRotateNumbers: true,
  autoOptimizeHours: false,
  targetAnswerRate: 30,
  maxPacingAdjustment: 25,
  checkIntervalSeconds: 60
};

/**
 * Hook for autonomous campaign optimization
 * Real-time adjustments to pacing, number rotation, and calling hours
 */
export const useAutonomousCampaignOptimizer = () => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [metrics, setMetrics] = useState<OptimizationMetrics | null>(null);
  const [recentActions, setRecentActions] = useState<OptimizationAction[]>([]);
  const [settings, setSettings] = useState<OptimizerSettings>(DEFAULT_SETTINGS);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  /**
   * Calculate current optimization metrics
   */
  const calculateMetrics = useCallback(async (): Promise<OptimizationMetrics | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get recent call stats
      const { data: recentCalls } = await supabase
        .from('call_logs')
        .select('status, outcome, created_at')
        .eq('user_id', user.id)
        .gte('created_at', oneHourAgo.toISOString());

      const totalCalls = (recentCalls || []).length;
      const answeredCalls = (recentCalls || []).filter(c => c.status === 'completed').length;
      const currentAnswerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 0;

      // Get current pacing from localStorage or default
      const savedPacing = localStorage.getItem('smartDialer_dialRate');
      const currentPacing = savedPacing ? parseInt(savedPacing) : 30;

      // Calculate recommended pacing
      let recommendedPacing = currentPacing;
      if (currentAnswerRate < settings.targetAnswerRate * 0.8) {
        // Answer rate too low, slow down
        recommendedPacing = Math.max(10, currentPacing - 5);
      } else if (currentAnswerRate > settings.targetAnswerRate * 1.2) {
        // Answer rate high, can speed up
        recommendedPacing = Math.min(60, currentPacing + 5);
      }

      // Check spam risk
      const { data: phoneNumbers } = await supabase
        .from('phone_numbers')
        .select('id, is_spam, status')
        .eq('user_id', user.id);

      const spamNumbers = (phoneNumbers || []).filter(p => p.is_spam).length;
      const totalNumbers = (phoneNumbers || []).length;
      const spamRatio = totalNumbers > 0 ? spamNumbers / totalNumbers : 0;
      
      let spamRiskLevel: 'low' | 'medium' | 'high' = 'low';
      if (spamRatio > 0.3) spamRiskLevel = 'high';
      else if (spamRatio > 0.15) spamRiskLevel = 'medium';

      // Analyze optimal calling hours
      const { data: successfulCalls } = await supabase
        .from('call_logs')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const hourCounts: Record<number, number> = {};
      (successfulCalls || []).forEach(call => {
        const hour = new Date(call.created_at).getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });

      const sortedHours = Object.entries(hourCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([h]) => parseInt(h))
        .sort((a, b) => a - b);

      const optimalStart = sortedHours.length > 0 ? sortedHours[0] : 9;
      const optimalEnd = sortedHours.length > 0 ? sortedHours[sortedHours.length - 1] + 1 : 17;

      const metricsData: OptimizationMetrics = {
        currentAnswerRate: Math.round(currentAnswerRate * 10) / 10,
        targetAnswerRate: settings.targetAnswerRate,
        currentPacing,
        recommendedPacing,
        spamRiskLevel,
        numbersAtRisk: spamNumbers,
        optimalCallingHours: {
          start: `${optimalStart.toString().padStart(2, '0')}:00`,
          end: `${optimalEnd.toString().padStart(2, '0')}:00`
        },
        lastOptimizedAt: now.toISOString()
      };

      setMetrics(metricsData);
      return metricsData;
    } catch (error) {
      console.error('Error calculating metrics:', error);
      return null;
    }
  }, [settings.targetAnswerRate]);

  /**
   * Apply pacing adjustment
   */
  const adjustPacing = useCallback(async (newPacing: number, reason: string) => {
    const action: OptimizationAction = {
      id: crypto.randomUUID(),
      type: 'pacing',
      description: `Adjusted pacing from ${metrics?.currentPacing || 'unknown'} to ${newPacing} calls/min. Reason: ${reason}`,
      impact: Math.abs(newPacing - (metrics?.currentPacing || 30)) > 10 ? 'high' : 'medium',
      autoApplied: true,
      appliedAt: new Date().toISOString()
    };

    localStorage.setItem('smartDialer_dialRate', newPacing.toString());
    
    setRecentActions(prev => [action, ...prev.slice(0, 19)]);
    console.log(`[Campaign Optimizer] Pacing adjusted to ${newPacing}`);
    
    return action;
  }, [metrics?.currentPacing]);

  /**
   * Rotate problematic phone numbers
   */
  const rotateNumbers = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Find numbers with high spam risk
      const { data: riskyNumbers } = await supabase
        .from('phone_numbers')
        .select('id, number')
        .eq('user_id', user.id)
        .eq('is_spam', true)
        .eq('status', 'active');

      if (!riskyNumbers || riskyNumbers.length === 0) {
        return null;
      }

      // Quarantine risky numbers
      for (const num of riskyNumbers) {
        await supabase
          .from('phone_numbers')
          .update({ status: 'quarantined', updated_at: new Date().toISOString() })
          .eq('id', num.id);
      }

      const action: OptimizationAction = {
        id: crypto.randomUUID(),
        type: 'rotation',
        description: `Quarantined ${riskyNumbers.length} phone number(s) with high spam risk`,
        impact: 'high',
        autoApplied: true,
        appliedAt: new Date().toISOString(),
        result: `Numbers quarantined: ${riskyNumbers.map(n => n.number).join(', ')}`
      };

      setRecentActions(prev => [action, ...prev.slice(0, 19)]);
      console.log(`[Campaign Optimizer] Rotated ${riskyNumbers.length} numbers`);

      toast({
        title: "Numbers Rotated",
        description: `${riskyNumbers.length} risky numbers quarantined`,
      });

      return action;
    } catch (error) {
      console.error('Error rotating numbers:', error);
      return null;
    }
  }, [toast]);

  /**
   * Run optimization cycle
   */
  const runOptimizationCycle = useCallback(async () => {
    if (!settings.enabled || isOptimizing) return;

    setIsOptimizing(true);
    console.log('[Campaign Optimizer] Running optimization cycle...');

    try {
      const currentMetrics = await calculateMetrics();
      if (!currentMetrics) return;

      // Auto-adjust pacing if enabled
      if (settings.autoAdjustPacing && currentMetrics.recommendedPacing !== currentMetrics.currentPacing) {
        const diff = Math.abs(currentMetrics.recommendedPacing - currentMetrics.currentPacing);
        if (diff <= settings.maxPacingAdjustment) {
          await adjustPacing(
            currentMetrics.recommendedPacing,
            `Answer rate ${currentMetrics.currentAnswerRate}% vs target ${currentMetrics.targetAnswerRate}%`
          );
        }
      }

      // Auto-rotate numbers if enabled and risk is high
      if (settings.autoRotateNumbers && currentMetrics.spamRiskLevel === 'high') {
        await rotateNumbers();
      }

      console.log('[Campaign Optimizer] Optimization cycle complete');
    } catch (error) {
      console.error('[Campaign Optimizer] Error:', error);
    } finally {
      setIsOptimizing(false);
    }
  }, [settings, isOptimizing, calculateMetrics, adjustPacing, rotateNumbers]);

  /**
   * Start the optimizer loop
   */
  const startOptimizer = useCallback(() => {
    if (!settings.enabled) return;

    console.log(`[Campaign Optimizer] Starting (every ${settings.checkIntervalSeconds}s)`);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Run immediately
    runOptimizationCycle();

    // Set up interval
    intervalRef.current = setInterval(() => {
      runOptimizationCycle();
    }, settings.checkIntervalSeconds * 1000);
  }, [settings, runOptimizationCycle]);

  /**
   * Stop the optimizer
   */
  const stopOptimizer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('[Campaign Optimizer] Stopped');
    }
  }, []);

  /**
   * Update settings
   */
  const updateSettings = useCallback((newSettings: Partial<OptimizerSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };

      if (newSettings.enabled !== undefined) {
        if (newSettings.enabled) {
          setTimeout(() => startOptimizer(), 100);
        } else {
          stopOptimizer();
        }
      }

      return updated;
    });

    toast({
      title: "Optimizer Settings Updated",
      description: `Campaign optimizer: ${newSettings.enabled ?? settings.enabled ? 'Active' : 'Inactive'}`,
    });
  }, [startOptimizer, stopOptimizer, toast, settings.enabled]);

  /**
   * Force immediate optimization
   */
  const forceOptimize = useCallback(async () => {
    toast({
      title: "Running Optimization",
      description: "Analyzing campaign performance...",
    });
    await runOptimizationCycle();
    toast({
      title: "Optimization Complete",
      description: "Campaign settings have been optimized",
    });
  }, [runOptimizationCycle, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isOptimizing,
    metrics,
    recentActions,
    settings,
    calculateMetrics,
    adjustPacing,
    rotateNumbers,
    startOptimizer,
    stopOptimizer,
    updateSettings,
    forceOptimize
  };
};
