import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PacingMetrics {
  currentDialRate: number;
  targetDialRate: number;
  answerRate: number;
  abandonmentRate: number;
  avgWaitTime: number;
  recommendedAdjustment: 'increase' | 'decrease' | 'maintain';
  pacingScore: number;
  isOptimal: boolean;
}

interface PacingSettings {
  minDialRate: number;
  maxDialRate: number;
  targetAnswerRate: number;
  maxAbandonmentRate: number;
  learningRate: number;
  autoAdjustEnabled: boolean;
}

const DEFAULT_SETTINGS: PacingSettings = {
  minDialRate: 5,
  maxDialRate: 60,
  targetAnswerRate: 0.35,
  maxAbandonmentRate: 0.03,
  learningRate: 0.1,
  autoAdjustEnabled: true
};

export const useIntelligentPacing = () => {
  const [metrics, setMetrics] = useState<PacingMetrics | null>(null);
  const [settings, setSettings] = useState<PacingSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(false);
  const [isAutoAdjusting, setIsAutoAdjusting] = useState(false);
  const { toast } = useToast();

  // Calculate real-time metrics from call logs
  const calculateMetrics = useCallback(async (): Promise<PacingMetrics | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const last15Min = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const lastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();

      // Get recent call data
      const { data: recentCalls, error } = await supabase
        .from('call_logs')
        .select('status, created_at, answered_at, ended_at, duration_seconds')
        .eq('user_id', user.id)
        .gte('created_at', lastHour)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const calls = recentCalls || [];
      const callsLast15Min = calls.filter(c => c.created_at >= last15Min);
      
      // Calculate metrics
      const totalCalls = calls.length;
      const answeredCalls = calls.filter(c => c.status === 'completed' || c.answered_at).length;
      const abandonedCalls = calls.filter(c => c.status === 'abandoned').length;
      
      const answerRate = totalCalls > 0 ? answeredCalls / totalCalls : 0;
      const abandonmentRate = totalCalls > 0 ? abandonedCalls / totalCalls : 0;
      
      // Calculate dial rate (calls per minute)
      const currentDialRate = callsLast15Min.length / 15;
      
      // Calculate average wait time
      const waitTimes = calls
        .filter(c => c.answered_at && c.created_at)
        .map(c => (new Date(c.answered_at).getTime() - new Date(c.created_at).getTime()) / 1000);
      const avgWaitTime = waitTimes.length > 0 
        ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length 
        : 0;

      // Determine recommended adjustment using AI-like logic
      let recommendedAdjustment: 'increase' | 'decrease' | 'maintain' = 'maintain';
      let targetDialRate = currentDialRate;

      if (abandonmentRate > settings.maxAbandonmentRate) {
        // Too many abandonments - slow down
        recommendedAdjustment = 'decrease';
        targetDialRate = Math.max(settings.minDialRate, currentDialRate * (1 - settings.learningRate));
      } else if (answerRate < settings.targetAnswerRate && abandonmentRate < settings.maxAbandonmentRate * 0.5) {
        // Low answer rate but low abandonment - can speed up
        recommendedAdjustment = 'increase';
        targetDialRate = Math.min(settings.maxDialRate, currentDialRate * (1 + settings.learningRate));
      }

      // Calculate pacing score (0-100)
      const abandonmentScore = Math.max(0, 1 - (abandonmentRate / settings.maxAbandonmentRate)) * 40;
      const answerScore = Math.min(1, answerRate / settings.targetAnswerRate) * 40;
      const utilizationScore = Math.min(1, currentDialRate / (settings.maxDialRate * 0.7)) * 20;
      const pacingScore = Math.round(abandonmentScore + answerScore + utilizationScore);

      const isOptimal = abandonmentRate <= settings.maxAbandonmentRate && 
                        answerRate >= settings.targetAnswerRate * 0.8;

      return {
        currentDialRate: Math.round(currentDialRate * 10) / 10,
        targetDialRate: Math.round(targetDialRate * 10) / 10,
        answerRate: Math.round(answerRate * 100) / 100,
        abandonmentRate: Math.round(abandonmentRate * 100) / 100,
        avgWaitTime: Math.round(avgWaitTime),
        recommendedAdjustment,
        pacingScore,
        isOptimal
      };
    } catch (error) {
      console.error('Error calculating pacing metrics:', error);
      return null;
    }
  }, [settings]);

  // Auto-adjust dial rate based on metrics
  const autoAdjustDialRate = useCallback(async () => {
    if (!settings.autoAdjustEnabled || isAutoAdjusting) return;

    setIsAutoAdjusting(true);
    try {
      const currentMetrics = await calculateMetrics();
      if (!currentMetrics) return;

      setMetrics(currentMetrics);

      if (currentMetrics.recommendedAdjustment !== 'maintain') {
        // Store dial rate adjustment in localStorage
        localStorage.setItem('dial_rate', JSON.stringify({ 
          current_rate: currentMetrics.targetDialRate,
          last_adjusted: new Date().toISOString(),
          adjustment_reason: currentMetrics.recommendedAdjustment
        }));

        console.log(`[Intelligent Pacing] Auto-adjusted dial rate: ${currentMetrics.recommendedAdjustment} to ${currentMetrics.targetDialRate} CPM`);
      }
    } catch (error) {
      console.error('Error auto-adjusting dial rate:', error);
    } finally {
      setIsAutoAdjusting(false);
    }
  }, [settings, calculateMetrics, isAutoAdjusting]);

  // Load settings from localStorage
  const loadSettings = useCallback(() => {
    try {
      const saved = localStorage.getItem('pacing_settings');
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (error) {
      console.error('Error loading pacing settings:', error);
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = useCallback(async (newSettings: Partial<PacingSettings>) => {
    setIsLoading(true);
    try {
      const updatedSettings = { ...settings, ...newSettings };
      localStorage.setItem('pacing_settings', JSON.stringify(updatedSettings));
      setSettings(updatedSettings);
      toast({
        title: "Pacing Settings Saved",
        description: "Your intelligent pacing configuration has been updated"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [settings, toast]);

  // Initial load and periodic refresh
  useEffect(() => {
    loadSettings();
    calculateMetrics().then(setMetrics);

    // Refresh metrics every 30 seconds
    const interval = setInterval(() => {
      calculateMetrics().then(setMetrics);
    }, 30000);

    return () => clearInterval(interval);
  }, [loadSettings, calculateMetrics]);

  // Auto-adjust every 2 minutes if enabled
  useEffect(() => {
    if (!settings.autoAdjustEnabled) return;

    const interval = setInterval(autoAdjustDialRate, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [settings.autoAdjustEnabled, autoAdjustDialRate]);

  return {
    metrics,
    settings,
    isLoading,
    isAutoAdjusting,
    calculateMetrics,
    autoAdjustDialRate,
    saveSettings,
    refreshMetrics: () => calculateMetrics().then(setMetrics)
  };
};
