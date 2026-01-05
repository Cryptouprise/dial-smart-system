import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AutonomousGoal {
  id: string;
  goalType: 'daily' | 'weekly';
  goalDate: string;
  appointmentsTarget: number;
  appointmentsAchieved: number;
  callsTarget: number;
  callsAchieved: number;
  conversationsTarget: number;
  conversationsAchieved: number;
  goalMet: boolean;
  notes?: string;
}

export interface GoalProgress {
  appointments: { current: number; target: number; percentage: number };
  calls: { current: number; target: number; percentage: number };
  conversations: { current: number; target: number; percentage: number };
  overallProgress: number;
  onTrack: boolean;
  estimatedCompletion: string | null;
}

/**
 * Hook for goal-driven autonomous agent behavior
 * Sets and tracks daily/weekly goals with adaptive behavior
 */
export const useAutonomousGoals = () => {
  const [currentGoal, setCurrentGoal] = useState<AutonomousGoal | null>(null);
  const [progress, setProgress] = useState<GoalProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [goalHistory, setGoalHistory] = useState<AutonomousGoal[]>([]);
  const { toast } = useToast();

  /**
   * Get today's date string
   */
  const getTodayDate = () => new Date().toISOString().split('T')[0];

  /**
   * Load or create today's goal
   */
  const loadTodayGoal = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const today = getTodayDate();

      // Try to load existing goal
      const { data: existingGoal } = await supabase
        .from('autonomous_goals' as any)
        .select('*')
        .eq('user_id', user.id)
        .eq('goal_type', 'daily')
        .eq('goal_date', today)
        .maybeSingle();

      if (existingGoal) {
        const goal: AutonomousGoal = {
          id: (existingGoal as any).id,
          goalType: (existingGoal as any).goal_type,
          goalDate: (existingGoal as any).goal_date,
          appointmentsTarget: (existingGoal as any).appointments_target,
          appointmentsAchieved: (existingGoal as any).appointments_achieved,
          callsTarget: (existingGoal as any).calls_target,
          callsAchieved: (existingGoal as any).calls_achieved,
          conversationsTarget: (existingGoal as any).conversations_target,
          conversationsAchieved: (existingGoal as any).conversations_achieved,
          goalMet: (existingGoal as any).goal_met,
          notes: (existingGoal as any).notes
        };
        setCurrentGoal(goal);
        return goal;
      }

      // Load settings to get default goals
      const { data: settings } = await supabase
        .from('autonomous_settings')
        .select('daily_goal_appointments, daily_goal_calls, daily_goal_conversations')
        .eq('user_id', user.id)
        .maybeSingle();

      // Create new goal with defaults
      const newGoal = {
        user_id: user.id,
        goal_type: 'daily',
        goal_date: today,
        appointments_target: settings?.daily_goal_appointments || 5,
        appointments_achieved: 0,
        calls_target: settings?.daily_goal_calls || 100,
        calls_achieved: 0,
        conversations_target: settings?.daily_goal_conversations || 20,
        conversations_achieved: 0,
        goal_met: false
      };

      const { data: created } = await supabase
        .from('autonomous_goals' as any)
        .insert(newGoal as any)
        .select()
        .maybeSingle();

      if (created) {
        const goal: AutonomousGoal = {
          id: (created as any).id,
          goalType: 'daily',
          goalDate: today,
          appointmentsTarget: (created as any).appointments_target,
          appointmentsAchieved: 0,
          callsTarget: (created as any).calls_target,
          callsAchieved: 0,
          conversationsTarget: (created as any).conversations_target,
          conversationsAchieved: 0,
          goalMet: false
        };
        setCurrentGoal(goal);
        return goal;
      }

      return null;
    } catch (error) {
      console.error('Error loading goal:', error);
      return null;
    }
  }, []);

  /**
   * Calculate current progress
   */
  const calculateProgress = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !currentGoal) return null;

      const today = getTodayDate();
      const startOfDay = `${today}T00:00:00.000Z`;
      const endOfDay = `${today}T23:59:59.999Z`;

      // Count today's calls
      const { count: callsCount } = await supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      // Count conversations (calls with outcome)
      const { count: conversationsCount } = await supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      // Count appointments
      const { count: appointmentsCount } = await supabase
        .from('calendar_appointments')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', startOfDay)
        .lte('created_at', endOfDay);

      const callsAchieved = callsCount || 0;
      const conversationsAchieved = conversationsCount || 0;
      const appointmentsAchieved = appointmentsCount || 0;

      // Calculate percentages
      const callsPercentage = Math.min(100, (callsAchieved / currentGoal.callsTarget) * 100);
      const conversationsPercentage = Math.min(100, (conversationsAchieved / currentGoal.conversationsTarget) * 100);
      const appointmentsPercentage = Math.min(100, (appointmentsAchieved / currentGoal.appointmentsTarget) * 100);

      const overallProgress = (callsPercentage + conversationsPercentage + appointmentsPercentage) / 3;

      // Determine if on track (should be at least proportional to time of day)
      const now = new Date();
      const hoursIntoDay = now.getHours() + now.getMinutes() / 60;
      const workHours = 8; // Assume 8 work hours
      const expectedProgress = Math.min(100, (hoursIntoDay / workHours) * 100);
      const onTrack = overallProgress >= expectedProgress * 0.8;

      // Estimate completion time
      let estimatedCompletion: string | null = null;
      if (overallProgress > 0 && overallProgress < 100) {
        const hoursNeeded = ((100 - overallProgress) / overallProgress) * hoursIntoDay;
        const completionTime = new Date(now.getTime() + hoursNeeded * 60 * 60 * 1000);
        estimatedCompletion = completionTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      }

      const progressData: GoalProgress = {
        appointments: {
          current: appointmentsAchieved,
          target: currentGoal.appointmentsTarget,
          percentage: Math.round(appointmentsPercentage)
        },
        calls: {
          current: callsAchieved,
          target: currentGoal.callsTarget,
          percentage: Math.round(callsPercentage)
        },
        conversations: {
          current: conversationsAchieved,
          target: currentGoal.conversationsTarget,
          percentage: Math.round(conversationsPercentage)
        },
        overallProgress: Math.round(overallProgress),
        onTrack,
        estimatedCompletion
      };

      setProgress(progressData);

      // Update goal in database
      await supabase
        .from('autonomous_goals' as any)
        .update({
          appointments_achieved: appointmentsAchieved,
          calls_achieved: callsAchieved,
          conversations_achieved: conversationsAchieved,
          goal_met: overallProgress >= 100,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', currentGoal.id);

      // Check if goal just met
      if (overallProgress >= 100 && !currentGoal.goalMet) {
        toast({
          title: "🎉 Daily Goal Achieved!",
          description: "Congratulations! You've hit your targets for today.",
        });
      }

      return progressData;
    } catch (error) {
      console.error('Error calculating progress:', error);
      return null;
    }
  }, [currentGoal, toast]);

  /**
   * Update goal targets
   */
  const updateGoalTargets = useCallback(async (targets: {
    appointmentsTarget?: number;
    callsTarget?: number;
    conversationsTarget?: number;
  }) => {
    if (!currentGoal) return false;

    try {
      const { error } = await supabase
        .from('autonomous_goals' as any)
        .update({
          ...targets,
          updated_at: new Date().toISOString()
        } as any)
        .eq('id', currentGoal.id);

      if (error) throw error;

      setCurrentGoal(prev => prev ? { ...prev, ...targets } : null);

      toast({
        title: "Goals Updated",
        description: "Your daily targets have been updated",
      });

      return true;
    } catch (error) {
      console.error('Error updating goals:', error);
      return false;
    }
  }, [currentGoal, toast]);

  /**
   * Get goal history
   */
  const loadGoalHistory = useCallback(async (days = 7) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data } = await supabase
        .from('autonomous_goals' as any)
        .select('*')
        .eq('user_id', user.id)
        .gte('goal_date', startDate.toISOString().split('T')[0])
        .order('goal_date', { ascending: false });

      const history = (data || []).map((g: any) => ({
        id: g.id,
        goalType: g.goal_type,
        goalDate: g.goal_date,
        appointmentsTarget: g.appointments_target,
        appointmentsAchieved: g.appointments_achieved,
        callsTarget: g.calls_target,
        callsAchieved: g.calls_achieved,
        conversationsTarget: g.conversations_target,
        conversationsAchieved: g.conversations_achieved,
        goalMet: g.goal_met,
        notes: g.notes
      }));

      setGoalHistory(history);
      return history;
    } catch (error) {
      console.error('Error loading goal history:', error);
      return [];
    }
  }, []);

  /**
   * Get adaptive recommendation based on progress
   */
  const getAdaptiveRecommendation = useCallback(() => {
    if (!progress || !currentGoal) return null;

    // If falling behind, recommend more aggressive actions
    if (!progress.onTrack) {
      const behindBy = 100 - progress.overallProgress;
      if (behindBy > 50) {
        return {
          urgency: 'high',
          message: 'Significantly behind on goals. Consider increasing dial rate or extending hours.',
          suggestedActions: ['increase_pacing', 'extend_hours', 'prioritize_hot_leads']
        };
      } else if (behindBy > 25) {
        return {
          urgency: 'medium',
          message: 'Behind on goals. Focus on high-priority leads.',
          suggestedActions: ['prioritize_hot_leads', 'increase_pacing']
        };
      }
    }

    // If ahead, can optimize for quality
    if (progress.overallProgress > 80 && progress.onTrack) {
      return {
        urgency: 'low',
        message: 'On track! Consider focusing on quality conversations.',
        suggestedActions: ['focus_on_quality', 'nurture_warm_leads']
      };
    }

    return {
      urgency: 'low',
      message: 'Progress is on track. Keep up the pace.',
      suggestedActions: ['maintain_pace']
    };
  }, [progress, currentGoal]);

  // Initialize on mount
  useEffect(() => {
    setIsLoading(true);
    loadTodayGoal().then(() => {
      setIsLoading(false);
    });
  }, [loadTodayGoal]);

  // Calculate progress when goal changes
  useEffect(() => {
    if (currentGoal) {
      calculateProgress();
    }
  }, [currentGoal, calculateProgress]);

  return {
    currentGoal,
    progress,
    isLoading,
    goalHistory,
    loadTodayGoal,
    calculateProgress,
    updateGoalTargets,
    loadGoalHistory,
    getAdaptiveRecommendation
  };
};
