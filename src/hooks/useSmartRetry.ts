import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RetrySchedule {
  leadId: string;
  leadName: string;
  phoneNumber: string;
  campaignId: string;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string;
  retryReason: string;
  bestTimeScore: number;
  predictedAnswerRate: number;
}

interface RetrySettings {
  maxRetries: number;
  baseDelayMinutes: number;
  maxDelayMinutes: number;
  exponentialBackoff: boolean;
  respectBestTime: boolean;
  learnFromHistory: boolean;
}

interface BestTimeData {
  dayOfWeek: number;
  hourOfDay: number;
  answerRate: number;
  callCount: number;
}

const DEFAULT_SETTINGS: RetrySettings = {
  maxRetries: 5,
  baseDelayMinutes: 30,
  maxDelayMinutes: 1440, // 24 hours
  exponentialBackoff: true,
  respectBestTime: true,
  learnFromHistory: true
};

export const useSmartRetry = () => {
  const [pendingRetries, setPendingRetries] = useState<RetrySchedule[]>([]);
  const [settings, setSettings] = useState<RetrySettings>(DEFAULT_SETTINGS);
  const [bestTimeData, setBestTimeData] = useState<BestTimeData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Learn best contact times from historical call data
  const learnBestTimes = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: calls, error } = await supabase
        .from('call_logs')
        .select('created_at, status, answered_at')
        .eq('user_id', user.id)
        .gte('created_at', thirtyDaysAgo);

      if (error) throw error;

      // Aggregate by day of week and hour
      const timeMap = new Map<string, { answered: number; total: number }>();

      (calls || []).forEach(call => {
        const date = new Date(call.created_at);
        const dayOfWeek = date.getDay();
        const hourOfDay = date.getHours();
        const key = `${dayOfWeek}-${hourOfDay}`;

        const existing = timeMap.get(key) || { answered: 0, total: 0 };
        existing.total++;
        if (call.status === 'completed' || call.answered_at) {
          existing.answered++;
        }
        timeMap.set(key, existing);
      });

      const bestTimes: BestTimeData[] = [];
      timeMap.forEach((value, key) => {
        const [day, hour] = key.split('-').map(Number);
        bestTimes.push({
          dayOfWeek: day,
          hourOfDay: hour,
          answerRate: value.total > 0 ? value.answered / value.total : 0,
          callCount: value.total
        });
      });

      // Sort by answer rate
      bestTimes.sort((a, b) => b.answerRate - a.answerRate);
      setBestTimeData(bestTimes);

      return bestTimes;
    } catch (error) {
      console.error('Error learning best times:', error);
      return [];
    }
  }, []);

  // Calculate optimal retry time for a lead
  const calculateRetryTime = useCallback((
    attemptCount: number,
    leadTimezone?: string
  ): { nextRetryAt: Date; score: number } => {
    const now = new Date();
    
    // Calculate base delay with exponential backoff
    let delayMinutes = settings.baseDelayMinutes;
    if (settings.exponentialBackoff) {
      delayMinutes = Math.min(
        settings.baseDelayMinutes * Math.pow(2, attemptCount - 1),
        settings.maxDelayMinutes
      );
    }

    let nextRetryAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
    let score = 50; // Base score

    // Adjust for best time if enabled
    if (settings.respectBestTime && bestTimeData.length > 0) {
      // Find the best time slot within the next 24 hours
      const candidates: { time: Date; score: number }[] = [];
      
      for (let hoursAhead = Math.ceil(delayMinutes / 60); hoursAhead <= 24; hoursAhead++) {
        const candidateTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
        const dayOfWeek = candidateTime.getDay();
        const hourOfDay = candidateTime.getHours();
        
        // Check if within business hours (8 AM - 8 PM local time)
        if (hourOfDay >= 8 && hourOfDay <= 20) {
          const bestTimeEntry = bestTimeData.find(
            bt => bt.dayOfWeek === dayOfWeek && bt.hourOfDay === hourOfDay
          );
          
          const timeScore = bestTimeEntry 
            ? Math.round(bestTimeEntry.answerRate * 100) 
            : 30;
          
          candidates.push({ time: candidateTime, score: timeScore });
        }
      }

      // Select the best candidate
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];
        nextRetryAt = best.time;
        score = best.score;
      }
    }

    return { nextRetryAt, score };
  }, [settings, bestTimeData]);

  // Schedule a retry for a lead
  const scheduleRetry = useCallback(async (
    leadId: string,
    campaignId: string,
    reason: string
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get lead info and current attempt count
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, phone_number, timezone')
        .eq('id', leadId)
        .maybeSingle();

      const { data: queue } = await supabase
        .from('dialing_queues')
        .select('attempts')
        .eq('lead_id', leadId)
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const attemptCount = (queue?.attempts || 0) + 1;

      if (attemptCount > settings.maxRetries) {
        console.log(`[Smart Retry] Max retries reached for lead ${leadId}`);
        return null;
      }

      const { nextRetryAt, score } = calculateRetryTime(attemptCount, lead?.timezone);

      // Create new queue entry for retry
      const { data: newEntry, error } = await supabase
        .from('dialing_queues')
        .insert({
          campaign_id: campaignId,
          lead_id: leadId,
          phone_number: lead?.phone_number || '',
          status: 'pending',
          priority: Math.max(1, 10 - attemptCount), // Lower priority for more attempts
          max_attempts: settings.maxRetries,
          attempts: attemptCount,
          scheduled_at: nextRetryAt.toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      console.log(`[Smart Retry] Scheduled retry for ${lead?.first_name} ${lead?.last_name} at ${nextRetryAt.toISOString()} (score: ${score})`);

      toast({
        title: "Retry Scheduled",
        description: `Will retry ${lead?.first_name || 'Lead'} at ${nextRetryAt.toLocaleTimeString()}`
      });

      return newEntry;
    } catch (error: any) {
      console.error('Error scheduling retry:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to schedule retry",
        variant: "destructive"
      });
      return null;
    }
  }, [settings, calculateRetryTime, toast]);

  // Load pending retries
  const loadPendingRetries = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('id')
        .eq('user_id', user.id);

      if (!campaigns || campaigns.length === 0) {
        setPendingRetries([]);
        return;
      }

      const { data: queued, error } = await supabase
        .from('dialing_queues')
        .select(`
          *,
          leads (first_name, last_name, phone_number)
        `)
        .in('campaign_id', campaigns.map(c => c.id))
        .eq('status', 'pending')
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      const retries: RetrySchedule[] = (queued || []).map(q => {
        const lead = q.leads as any;
        const { score } = calculateRetryTime(q.attempts);
        
        return {
          leadId: q.lead_id,
          leadName: `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim() || 'Unknown',
          phoneNumber: q.phone_number,
          campaignId: q.campaign_id,
          attemptCount: q.attempts,
          maxAttempts: q.max_attempts,
          nextRetryAt: q.scheduled_at,
          retryReason: `Attempt ${q.attempts + 1} of ${q.max_attempts}`,
          bestTimeScore: score,
          predictedAnswerRate: score / 100
        };
      });

      setPendingRetries(retries);
    } catch (error) {
      console.error('Error loading pending retries:', error);
    } finally {
      setIsLoading(false);
    }
  }, [calculateRetryTime]);

  // Cancel a scheduled retry
  const cancelRetry = useCallback(async (leadId: string, campaignId: string) => {
    try {
      await supabase
        .from('dialing_queues')
        .delete()
        .eq('lead_id', leadId)
        .eq('campaign_id', campaignId)
        .eq('status', 'pending');

      toast({
        title: "Retry Cancelled",
        description: "The scheduled retry has been removed"
      });

      loadPendingRetries();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel retry",
        variant: "destructive"
      });
    }
  }, [loadPendingRetries, toast]);

  // Save settings to localStorage
  const saveSettings = useCallback(async (newSettings: Partial<RetrySettings>) => {
    try {
      const updatedSettings = { ...settings, ...newSettings };
      localStorage.setItem('retry_settings', JSON.stringify(updatedSettings));
      setSettings(updatedSettings);
      toast({
        title: "Settings Saved",
        description: "Smart retry settings updated"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive"
      });
    }
  }, [settings, toast]);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('retry_settings');
      if (saved) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
      }
    } catch (e) {
      console.error('Error loading retry settings:', e);
    }
  }, []);

  // Initial load
  useEffect(() => {
    learnBestTimes();
    loadPendingRetries();

    const interval = setInterval(loadPendingRetries, 60000);
    return () => clearInterval(interval);
  }, [learnBestTimes, loadPendingRetries]);

  return {
    pendingRetries,
    settings,
    bestTimeData,
    isLoading,
    scheduleRetry,
    cancelRetry,
    saveSettings,
    learnBestTimes,
    refreshRetries: loadPendingRetries
  };
};
