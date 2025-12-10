import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface BudgetSettings {
  id: string;
  user_id: string;
  campaign_id: string | null;
  daily_limit: number | null;
  monthly_limit: number | null;
  alert_threshold_percent: number;
  auto_pause_enabled: boolean;
  is_paused: boolean;
  paused_at: string | null;
  pause_reason: string | null;
}

interface SpendingSummary {
  twilio: number;
  retell: number;
  elevenlabs: number;
  total: number;
  callCount: number;
  smsCount: number;
  durationSeconds: number;
}

interface BudgetAlert {
  id: string;
  alert_type: string;
  threshold_percent: number;
  amount_spent: number;
  budget_limit: number;
  message: string;
  acknowledged: boolean;
  created_at: string;
}

interface BudgetStatus {
  withinBudget: boolean;
  dailySpent: number;
  monthlySpent: number;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  isPaused: boolean;
  alerts: any[];
}

export function useBudgetTracker(campaignId?: string | null) {
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings | null>(null);
  const [dailySummary, setDailySummary] = useState<SpendingSummary | null>(null);
  const [monthlySummary, setMonthlySummary] = useState<SpendingSummary | null>(null);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [budgetStatus, setBudgetStatus] = useState<BudgetStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchBudgetSettings = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let query = supabase
      .from('budget_settings')
      .select('*')
      .eq('user_id', user.id);
    
    if (campaignId) {
      query = query.eq('campaign_id', campaignId);
    } else {
      query = query.is('campaign_id', null);
    }
    
    const { data, error } = await query.maybeSingle();

    if (!error && data) {
      setBudgetSettings(data as BudgetSettings);
    }
  }, [campaignId]);

  const fetchSpendingSummary = useCallback(async (period: 'daily' | 'monthly') => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('budget-tracker', {
        body: {
          action: 'get_spending_summary',
          period,
          campaignId
        }
      });

      if (error) throw error;

      if (period === 'daily') {
        setDailySummary(data.totals);
      } else {
        setMonthlySummary(data.totals);
      }
    } catch (error) {
      console.error('Error fetching spending summary:', error);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  const fetchAlerts = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from('budget_alerts')
      .select('*')
      .eq('user_id', user.id)
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setAlerts(data as BudgetAlert[]);
    }
  }, []);

  const checkBudget = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('budget-tracker', {
        body: {
          action: 'check_budget',
          campaignId
        }
      });

      if (error) throw error;
      setBudgetStatus(data);

      if (data.alerts?.length > 0) {
        const latestAlert = data.alerts[0];
        toast({
          title: latestAlert.type.includes('exceeded') ? '🚨 Budget Exceeded' : '⚠️ Budget Warning',
          description: `${latestAlert.type.includes('daily') ? 'Daily' : 'Monthly'} spending at ${latestAlert.percent.toFixed(1)}%`,
          variant: latestAlert.type.includes('exceeded') ? 'destructive' : 'default'
        });
      }

      return data;
    } catch (error) {
      console.error('Error checking budget:', error);
      return null;
    }
  }, [campaignId, toast]);

  const updateBudgetSettings = useCallback(async (settings: {
    dailyLimit?: number | null;
    monthlyLimit?: number | null;
    alertThreshold?: number;
    autoPause?: boolean;
  }) => {
    try {
      const { data, error } = await supabase.functions.invoke('budget-tracker', {
        body: {
          action: 'update_budget_settings',
          campaignId,
          ...settings
        }
      });

      if (error) throw error;

      setBudgetSettings(data.settings);
      toast({
        title: 'Budget settings updated',
        description: 'Your budget limits have been saved.'
      });

      return data.settings;
    } catch (error) {
      console.error('Error updating budget settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to update budget settings.',
        variant: 'destructive'
      });
      return null;
    }
  }, [campaignId, toast]);

  const acknowledgeAlert = useCallback(async (alertId: string, alertAction: string) => {
    try {
      await supabase.functions.invoke('budget-tracker', {
        body: {
          action: 'acknowledge_alert',
          alertId,
          alertAction
        }
      });

      setAlerts(prev => prev.filter(a => a.id !== alertId));
      toast({
        title: 'Alert acknowledged',
        description: `Action: ${alertAction}`
      });
    } catch (error) {
      console.error('Error acknowledging alert:', error);
    }
  }, [toast]);

  const togglePause = useCallback(async (pause: boolean) => {
    if (!budgetSettings) return;

    try {
      const { data, error } = await supabase.functions.invoke('budget-tracker', {
        body: {
          action: 'toggle_pause',
          budgetSettingId: budgetSettings.id,
          pause,
          campaignId
        }
      });

      if (error) throw error;

      setBudgetSettings(prev => prev ? { ...prev, is_paused: pause } : null);
      toast({
        title: pause ? 'Campaigns paused' : 'Campaigns resumed',
        description: pause ? 'All calls have been paused due to budget.' : 'Calls have been resumed.'
      });
    } catch (error) {
      console.error('Error toggling pause:', error);
    }
  }, [budgetSettings, campaignId, toast]);

  const refreshUsage = useCallback(async () => {
    setIsLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);

      await supabase.functions.invoke('budget-tracker', {
        body: {
          action: 'fetch_usage',
          startDate: firstOfMonth.toISOString().split('T')[0],
          endDate: today
        }
      });

      await Promise.all([
        fetchSpendingSummary('daily'),
        fetchSpendingSummary('monthly'),
        checkBudget()
      ]);

      toast({
        title: 'Usage refreshed',
        description: 'Latest spending data has been fetched.'
      });
    } catch (error) {
      console.error('Error refreshing usage:', error);
      toast({
        title: 'Error',
        description: 'Failed to refresh usage data.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  }, [fetchSpendingSummary, checkBudget, toast]);

  useEffect(() => {
    fetchBudgetSettings();
    fetchSpendingSummary('daily');
    fetchSpendingSummary('monthly');
    fetchAlerts();
  }, [fetchBudgetSettings, fetchSpendingSummary, fetchAlerts]);

  return {
    budgetSettings,
    dailySummary,
    monthlySummary,
    alerts,
    budgetStatus,
    isLoading,
    updateBudgetSettings,
    checkBudget,
    acknowledgeAlert,
    togglePause,
    refreshUsage
  };
}
