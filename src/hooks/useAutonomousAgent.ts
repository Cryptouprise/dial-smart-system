import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AgentDecision {
  id: string;
  timestamp: string;
  lead_id: string;
  lead_name: string;
  decision_type: 'call' | 'sms' | 'email' | 'wait' | 'move_stage' | 'disposition';
  reasoning: string;
  action_taken: string;
  outcome?: string;
  success?: boolean;
  executed_at?: string;
  approved_by?: 'autonomous' | 'manual';
}

export interface ScriptPerformance {
  script_id: string;
  script_type: 'call' | 'sms' | 'email';
  script_content: string;
  total_uses: number;
  positive_outcomes: number;
  negative_outcomes: number;
  conversion_rate: number;
  average_duration?: number;
  last_used: string;
  performance_score: number;
}

export interface ScriptSuggestion {
  id: string;
  script_id: string;
  current_script: string;
  suggested_script: string;
  reasoning: string[];
  expected_improvement: number;
  based_on_data: {
    totalCalls: number;
    conversionRate: number;
    avgDuration: number;
  };
  status: 'pending' | 'approved' | 'rejected' | 'auto_applied';
  created_at: string;
}

export interface AutonomousSettings {
  enabled: boolean;
  auto_execute_recommendations: boolean;
  auto_approve_script_changes: boolean;
  require_approval_for_high_priority: boolean;
  max_daily_autonomous_actions: number;
  decision_tracking_enabled: boolean;
}

export const useAutonomousAgent = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [settings, setSettings] = useState<AutonomousSettings>({
    enabled: false,
    auto_execute_recommendations: false,
    auto_approve_script_changes: false,
    require_approval_for_high_priority: true,
    max_daily_autonomous_actions: 50,
    decision_tracking_enabled: true
  });
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [scriptSuggestions, setScriptSuggestions] = useState<ScriptSuggestion[]>([]);
  const { toast } = useToast();

  // Load autonomous settings
  const loadSettings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('autonomous_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings({
          enabled: data.enabled || false,
          auto_execute_recommendations: data.auto_execute_recommendations || false,
          auto_approve_script_changes: data.auto_approve_script_changes || false,
          require_approval_for_high_priority: data.require_approval_for_high_priority ?? true,
          max_daily_autonomous_actions: data.max_daily_autonomous_actions || 50,
          decision_tracking_enabled: data.decision_tracking_enabled ?? true
        });
      }
    } catch (error) {
      console.error('Error loading autonomous settings:', error);
    }
  }, []);

  // Update autonomous settings
  const updateSettings = useCallback(async (newSettings: Partial<AutonomousSettings>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const updatedSettings = { ...settings, ...newSettings };
      
      const { error } = await supabase
        .from('autonomous_settings')
        .upsert({
          user_id: user.id,
          ...updatedSettings,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      setSettings(updatedSettings);

      toast({
        title: "Settings Updated",
        description: `Autonomous mode: ${updatedSettings.enabled ? 'Enabled' : 'Disabled'}`,
      });

      return true;
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive"
      });
      return false;
    }
  }, [settings, toast]);

  // Log a decision made by the AI agent
  const logDecision = useCallback(async (decision: Omit<AgentDecision, 'id' | 'timestamp'>) => {
    if (!settings.decision_tracking_enabled) return null;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from('agent_decisions')
        .insert({
          user_id: user.id,
          lead_id: decision.lead_id,
          lead_name: decision.lead_name,
          decision_type: decision.decision_type,
          reasoning: decision.reasoning,
          action_taken: decision.action_taken,
          outcome: decision.outcome,
          success: decision.success,
          executed_at: decision.executed_at,
          approved_by: decision.approved_by,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error logging decision:', error);
      return null;
    }
  }, [settings.decision_tracking_enabled]);

  // Execute a recommendation (autonomous or manual)
  const executeRecommendation = useCallback(async (params: {
    recommendation: any;
    leadId: string;
    leadName: string;
    isAutonomous: boolean;
  }) => {
    setIsExecuting(true);
    try {
      const { recommendation, leadId, leadName, isAutonomous } = params;

      // Check if we should execute based on settings
      if (isAutonomous && !settings.enabled) {
        toast({
          title: "Autonomous Mode Disabled",
          description: "Enable autonomous mode to execute automatically",
          variant: "destructive"
        });
        return false;
      }

      // Check daily limit
      if (isAutonomous) {
        const today = new Date().toISOString().split('T')[0];
        const { data: todayDecisions } = await supabase
          .from('agent_decisions')
          .select('id', { count: 'exact' })
          .gte('created_at', today)
          .eq('approved_by', 'autonomous');

        if ((todayDecisions?.length || 0) >= settings.max_daily_autonomous_actions) {
          toast({
            title: "Daily Limit Reached",
            description: `Autonomous action limit of ${settings.max_daily_autonomous_actions} reached`,
            variant: "destructive"
          });
          return false;
        }
      }

      // Execute the action based on type
      const actionType = recommendation.nextBestAction.type;
      let actionResult = null;

      switch (actionType) {
        case 'call':
          // Queue the call in dialing system
          actionResult = await queueCall(leadId);
          break;
        case 'sms':
          // Send SMS
          actionResult = await sendSMS(leadId, recommendation.nextBestAction.message);
          break;
        case 'email':
          // Send email
          actionResult = await sendEmail(leadId, recommendation.nextBestAction.message);
          break;
        case 'wait':
          // Schedule follow-up
          actionResult = await scheduleFollowUp(leadId, recommendation.nextBestAction.timing);
          break;
      }

      // Log the decision
      await logDecision({
        lead_id: leadId,
        lead_name: leadName,
        decision_type: actionType,
        reasoning: recommendation.reasoning.join('; '),
        action_taken: recommendation.nextBestAction.message || `${actionType} action`,
        executed_at: new Date().toISOString(),
        approved_by: isAutonomous ? 'autonomous' : 'manual',
        success: actionResult !== null
      });

      toast({
        title: isAutonomous ? "Autonomous Action Executed" : "Action Executed",
        description: `${actionType} action completed for ${leadName}`,
      });

      return true;
    } catch (error) {
      console.error('Error executing recommendation:', error);
      toast({
        title: "Execution Error",
        description: "Failed to execute recommendation",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsExecuting(false);
    }
  }, [settings, toast, logDecision]);

  // Helper functions for different action types
  const queueCall = async (leadId: string) => {
    // Add to dialing queue
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: lead } = await supabase
      .from('leads')
      .select('phone_number')
      .eq('id', leadId)
      .single();

    if (!lead) return null;

    // Update lead to mark for callback
    await supabase
      .from('leads')
      .update({ 
        next_callback_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    return true;
  };

  const sendSMS = async (leadId: string, message?: string) => {
    // Placeholder for SMS sending
    // This would integrate with your SMS system
    return true;
  };

  const sendEmail = async (leadId: string, message?: string) => {
    // Placeholder for email sending
    // This would integrate with your email system
    return true;
  };

  const scheduleFollowUp = async (leadId: string, timing: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Parse timing and schedule
    let delay = 24 * 60; // Default 24 hours
    if (timing.includes('hours')) {
      const hours = parseInt(timing.match(/\d+/)?.[0] || '24');
      delay = hours * 60;
    }

    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + delay);

    await supabase
      .from('scheduled_follow_ups')
      .insert({
        user_id: user.id,
        lead_id: leadId,
        scheduled_at: scheduledAt.toISOString(),
        action_type: 'callback',
        status: 'pending'
      });

    return true;
  };

  // Load decision history
  const loadDecisionHistory = useCallback(async (limit = 50) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('agent_decisions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      setDecisions(data || []);
    } catch (error) {
      console.error('Error loading decision history:', error);
    }
  }, []);

  // Analyze script performance
  const analyzeScriptPerformance = useCallback(async (scriptType: 'call' | 'sms' | 'email'): Promise<ScriptPerformance[]> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      // Get all scripts and their usage
      const { data: scripts } = await supabase
        .from('ai_scripts')
        .select('*')
        .eq('user_id', user.id)
        .eq('script_type', scriptType);

      if (!scripts) return [];

      const performance: ScriptPerformance[] = [];

      for (const script of scripts) {
        // Get usage stats
        const { data: usageStats } = await supabase
          .from('script_usage_logs')
          .select('*')
          .eq('script_id', script.id);

        if (!usageStats || usageStats.length === 0) continue;

        const totalUses = usageStats.length;
        const positiveOutcomes = usageStats.filter(u => 
          u.outcome === 'interested' || u.outcome === 'converted' || u.outcome === 'positive'
        ).length;
        const negativeOutcomes = usageStats.filter(u => 
          u.outcome === 'not_interested' || u.outcome === 'negative'
        ).length;

        const conversionRate = totalUses > 0 ? (positiveOutcomes / totalUses) * 100 : 0;
        const avgDuration = scriptType === 'call' 
          ? usageStats.reduce((sum, u) => sum + (u.duration_seconds || 0), 0) / totalUses
          : undefined;

        // Calculate performance score
        const performanceScore = Math.round(
          (conversionRate * 0.7) + 
          ((positiveOutcomes - negativeOutcomes) / totalUses * 100 * 0.3)
        );

        performance.push({
          script_id: script.id,
          script_type: scriptType,
          script_content: script.content,
          total_uses: totalUses,
          positive_outcomes: positiveOutcomes,
          negative_outcomes: negativeOutcomes,
          conversion_rate: Math.round(conversionRate * 10) / 10,
          average_duration: avgDuration ? Math.round(avgDuration) : undefined,
          last_used: usageStats[usageStats.length - 1]?.created_at,
          performance_score: Math.max(0, Math.min(100, performanceScore))
        });
      }

      // Sort by performance score
      performance.sort((a, b) => b.performance_score - a.performance_score);

      return performance;
    } catch (error) {
      console.error('Error analyzing script performance:', error);
      return [];
    }
  }, []);

  // Generate script suggestions based on performance
  const generateScriptSuggestions = useCallback(async (scriptType: 'call' | 'sms' | 'email') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const performance = await analyzeScriptPerformance(scriptType);
      const suggestions: Omit<ScriptSuggestion, 'id' | 'created_at' | 'status'>[] = [];

      for (const script of performance) {
        // Only suggest improvements for scripts with poor performance
        if (script.performance_score < 70 && script.total_uses >= 10) {
          const reasoning: string[] = [];
          let suggestedChanges = '';

          if (script.conversion_rate < 20) {
            reasoning.push(`Low conversion rate: ${script.conversion_rate}%`);
            suggestedChanges += 'Focus on clearer value proposition and stronger call-to-action. ';
          }

          if (script.negative_outcomes > script.positive_outcomes) {
            reasoning.push('More negative than positive outcomes');
            suggestedChanges += 'Soften approach, add more empathy, reduce pressure. ';
          }

          if (scriptType === 'call' && script.average_duration && script.average_duration < 60) {
            reasoning.push('Very short calls - may be getting rejected quickly');
            suggestedChanges += 'Improve opening hook to engage prospect longer. ';
          }

          if (suggestedChanges) {
            suggestions.push({
              script_id: script.script_id,
              current_script: script.script_content,
              suggested_script: `${script.script_content}\n\n[AI Suggestion: ${suggestedChanges}]`,
              reasoning,
              expected_improvement: Math.min(30, 100 - script.performance_score),
              based_on_data: {
                totalCalls: script.total_uses,
                conversionRate: script.conversion_rate,
                avgDuration: script.average_duration || 0
              }
            });
          }
        }
      }

      // Save suggestions to database
      for (const suggestion of suggestions) {
        await supabase
          .from('script_suggestions')
          .insert({
            user_id: user.id,
            ...suggestion,
            status: settings.auto_approve_script_changes ? 'auto_applied' : 'pending',
            created_at: new Date().toISOString()
          });
      }

      return suggestions;
    } catch (error) {
      console.error('Error generating script suggestions:', error);
      return [];
    }
  }, [analyzeScriptPerformance, settings.auto_approve_script_changes]);

  // Apply a script suggestion
  const applyScriptSuggestion = useCallback(async (suggestionId: string, isAutonomous: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data: suggestion } = await supabase
        .from('script_suggestions')
        .select('*')
        .eq('id', suggestionId)
        .single();

      if (!suggestion) return false;

      // Update the script
      await supabase
        .from('ai_scripts')
        .update({ 
          content: suggestion.suggested_script,
          updated_at: new Date().toISOString()
        })
        .eq('id', suggestion.script_id);

      // Update suggestion status
      await supabase
        .from('script_suggestions')
        .update({ 
          status: isAutonomous ? 'auto_applied' : 'approved',
          applied_at: new Date().toISOString()
        })
        .eq('id', suggestionId);

      toast({
        title: "Script Updated",
        description: isAutonomous ? "Auto-applied by AI" : "Script changes applied",
      });

      return true;
    } catch (error) {
      console.error('Error applying script suggestion:', error);
      toast({
        title: "Error",
        description: "Failed to apply script changes",
        variant: "destructive"
      });
      return false;
    }
  }, [toast]);

  // Load script suggestions
  const loadScriptSuggestions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('script_suggestions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setScriptSuggestions(data || []);
    } catch (error) {
      console.error('Error loading script suggestions:', error);
    }
  }, []);

  // Initialize
  useEffect(() => {
    loadSettings();
    loadDecisionHistory();
    loadScriptSuggestions();
  }, [loadSettings, loadDecisionHistory, loadScriptSuggestions]);

  return {
    isExecuting,
    settings,
    decisions,
    scriptSuggestions,
    updateSettings,
    executeRecommendation,
    logDecision,
    loadDecisionHistory,
    analyzeScriptPerformance,
    generateScriptSuggestions,
    applyScriptSuggestion,
    loadScriptSuggestions
  };
};
