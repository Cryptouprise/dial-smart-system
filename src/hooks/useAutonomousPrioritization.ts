import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface LeadPriorityScore {
  leadId: string;
  priorityScore: number;
  engagementScore: number;
  recencyScore: number;
  sentimentScore: number;
  bestContactTime?: string;
  bestContactDay?: string;
  factors: Record<string, number>;
  lastCalculatedAt: string;
}

interface PrioritizationSettings {
  enabled: boolean;
  intervalMinutes: number;
  weightEngagement: number;
  weightRecency: number;
  weightSentiment: number;
  weightResponseRate: number;
}

const DEFAULT_SETTINGS: PrioritizationSettings = {
  enabled: true,
  intervalMinutes: 15,
  weightEngagement: 0.3,
  weightRecency: 0.25,
  weightSentiment: 0.2,
  weightResponseRate: 0.25
};

/**
 * Hook for autonomous lead prioritization
 * Continuously re-scores leads based on engagement and behavior patterns
 */
export const useAutonomousPrioritization = () => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [priorityScores, setPriorityScores] = useState<LeadPriorityScore[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [settings, setSettings] = useState<PrioritizationSettings>(DEFAULT_SETTINGS);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  /**
   * Calculate priority score for a single lead
   */
  const calculateLeadScore = useCallback(async (leadId: string): Promise<LeadPriorityScore | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // Fetch lead data
      const { data: lead } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .maybeSingle();

      if (!lead) return null;

      // Fetch SMS history for engagement
      const { data: smsHistory } = await supabase
        .from('sms_messages')
        .select('direction, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Fetch call history
      const { data: callHistory } = await supabase
        .from('call_logs')
        .select('status, outcome, created_at, duration_seconds')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(10);

      // Calculate engagement score (0-100)
      const inboundSms = (smsHistory || []).filter(s => s.direction === 'inbound').length;
      const outboundSms = (smsHistory || []).filter(s => s.direction === 'outbound').length;
      const responseRate = outboundSms > 0 ? (inboundSms / outboundSms) * 100 : 0;
      const engagementScore = Math.min(100, responseRate + (inboundSms * 10));

      // Calculate recency score (0-100)
      const lastContactStr = lead.last_contacted_at;
      let recencyScore = 50;
      if (lastContactStr) {
        const lastContact = new Date(lastContactStr);
        const daysSinceContact = (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
        recencyScore = Math.max(0, 100 - (daysSinceContact * 5)); // Lose 5 points per day
      }

      // Calculate sentiment score based on call outcomes
      const positiveOutcomes = (callHistory || []).filter(c => 
        ['interested', 'callback', 'appointment'].includes(c.outcome || '')
      ).length;
      const negativeOutcomes = (callHistory || []).filter(c => 
        ['not_interested', 'dnc', 'wrong_number'].includes(c.outcome || '')
      ).length;
      const totalCalls = (callHistory || []).length;
      const sentimentScore = totalCalls > 0 
        ? 50 + ((positiveOutcomes - negativeOutcomes) / totalCalls) * 50 
        : 50;

      // Calculate answer rate
      const answeredCalls = (callHistory || []).filter(c => c.status === 'completed').length;
      const answerRate = totalCalls > 0 ? (answeredCalls / totalCalls) * 100 : 50;

      // Determine best contact time from successful calls
      const answeredCallTimes = (callHistory || [])
        .filter(c => c.status === 'completed')
        .map(c => new Date(c.created_at).getHours());
      
      let bestContactTime: string | undefined;
      if (answeredCallTimes.length > 0) {
        const hourCounts: Record<number, number> = {};
        answeredCallTimes.forEach(hour => {
          hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });
        const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (bestHour) {
          const hour = parseInt(bestHour);
          bestContactTime = `${hour.toString().padStart(2, '0')}:00-${(hour + 1).toString().padStart(2, '0')}:00`;
        }
      }

      // Calculate weighted priority score
      const priorityScore = 
        (engagementScore * settings.weightEngagement) +
        (recencyScore * settings.weightRecency) +
        (sentimentScore * settings.weightSentiment) +
        (answerRate * settings.weightResponseRate);

      const factors = {
        engagement: engagementScore,
        recency: recencyScore,
        sentiment: sentimentScore,
        answerRate,
        inboundSms,
        outboundSms,
        totalCalls,
        answeredCalls
      };

      const score: LeadPriorityScore = {
        leadId,
        priorityScore: Math.round(priorityScore * 10) / 10,
        engagementScore: Math.round(engagementScore * 10) / 10,
        recencyScore: Math.round(recencyScore * 10) / 10,
        sentimentScore: Math.round(sentimentScore * 10) / 10,
        bestContactTime,
        factors,
        lastCalculatedAt: new Date().toISOString()
      };

      // Save to database
      await supabase
        .from('lead_priority_scores' as any)
        .upsert({
          user_id: user.id,
          lead_id: leadId,
          priority_score: score.priorityScore,
          engagement_score: score.engagementScore,
          recency_score: score.recencyScore,
          sentiment_score: score.sentimentScore,
          best_contact_time: score.bestContactTime,
          factors: score.factors,
          last_calculated_at: score.lastCalculatedAt,
          updated_at: new Date().toISOString()
        } as any, { onConflict: 'user_id,lead_id' });

      return score;
    } catch (error) {
      console.error('Error calculating lead score:', error);
      return null;
    }
  }, [settings]);

  /**
   * Run full prioritization for all active leads
   */
  const runPrioritization = useCallback(async () => {
    if (isCalculating) return;
    
    setIsCalculating(true);
    console.log('[Autonomous Prioritization] Starting prioritization run...');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all active leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id')
        .eq('user_id', user.id)
        .eq('do_not_call', false)
        .in('status', ['new', 'contacted', 'callback', 'warm']);

      if (!leads || leads.length === 0) {
        console.log('[Autonomous Prioritization] No leads to prioritize');
        return;
      }

      console.log(`[Autonomous Prioritization] Calculating scores for ${leads.length} leads`);

      // Calculate scores for all leads
      const scores: LeadPriorityScore[] = [];
      for (const lead of leads) {
        const score = await calculateLeadScore(lead.id);
        if (score) scores.push(score);
      }

      // Sort by priority score
      scores.sort((a, b) => b.priorityScore - a.priorityScore);
      setPriorityScores(scores);
      setLastRunAt(new Date().toISOString());

      // Update lead priorities in the leads table
      for (let i = 0; i < scores.length; i++) {
        const priority = Math.ceil((1 - i / scores.length) * 10); // 1-10 priority
        await supabase
          .from('leads')
          .update({ priority, updated_at: new Date().toISOString() })
          .eq('id', scores[i].leadId);
      }

      console.log(`[Autonomous Prioritization] Completed. Top lead score: ${scores[0]?.priorityScore}`);

    } catch (error) {
      console.error('[Autonomous Prioritization] Error:', error);
    } finally {
      setIsCalculating(false);
    }
  }, [isCalculating, calculateLeadScore]);

  /**
   * Get top N prioritized leads
   */
  const getTopLeads = useCallback(async (limit = 10): Promise<LeadPriorityScore[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data } = await supabase
        .from('lead_priority_scores' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('priority_score', { ascending: false })
        .limit(limit);

      return (data || []).map((d: any) => ({
        leadId: d.lead_id,
        priorityScore: d.priority_score,
        engagementScore: d.engagement_score,
        recencyScore: d.recency_score,
        sentimentScore: d.sentiment_score,
        bestContactTime: d.best_contact_time,
        bestContactDay: d.best_contact_day,
        factors: d.factors || {},
        lastCalculatedAt: d.last_calculated_at
      }));
    } catch (error) {
      console.error('Error fetching top leads:', error);
      return [];
    }
  }, []);

  /**
   * Start autonomous prioritization loop
   */
  const startPrioritizationLoop = useCallback(() => {
    if (!settings.enabled) return;

    console.log(`[Autonomous Prioritization] Starting loop (every ${settings.intervalMinutes} minutes)`);

    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Run immediately
    runPrioritization();

    // Set up interval
    intervalRef.current = setInterval(() => {
      runPrioritization();
    }, settings.intervalMinutes * 60 * 1000);

  }, [settings, runPrioritization]);

  /**
   * Stop the prioritization loop
   */
  const stopPrioritizationLoop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      console.log('[Autonomous Prioritization] Loop stopped');
    }
  }, []);

  /**
   * Update settings
   */
  const updateSettings = useCallback((newSettings: Partial<PrioritizationSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      
      // Restart loop if interval changed
      if (newSettings.intervalMinutes && newSettings.intervalMinutes !== prev.intervalMinutes) {
        stopPrioritizationLoop();
        if (updated.enabled) {
          setTimeout(() => startPrioritizationLoop(), 100);
        }
      }

      // Start/stop based on enabled
      if (newSettings.enabled !== undefined) {
        if (newSettings.enabled) {
          setTimeout(() => startPrioritizationLoop(), 100);
        } else {
          stopPrioritizationLoop();
        }
      }

      return updated;
    });

    toast({
      title: "Prioritization Settings Updated",
      description: `Auto-prioritization: ${newSettings.enabled ? 'Enabled' : 'Disabled'}`,
    });
  }, [startPrioritizationLoop, stopPrioritizationLoop, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isCalculating,
    priorityScores,
    lastRunAt,
    settings,
    calculateLeadScore,
    runPrioritization,
    getTopLeads,
    startPrioritizationLoop,
    stopPrioritizationLoop,
    updateSettings
  };
};
