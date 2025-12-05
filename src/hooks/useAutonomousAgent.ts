import { useState, useCallback } from 'react';
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

// Note: This hook requires additional database tables to be created.
// Currently using local state as a placeholder.

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

  // Load autonomous settings (using local state - tables not yet created)
  const loadSettings = useCallback(async () => {
    // Settings loaded from local state - database tables not yet created
    console.log('Autonomous settings: Using local state (database tables not configured)');
  }, []);

  // Update autonomous settings
  const updateSettings = useCallback(async (newSettings: Partial<AutonomousSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);

    toast({
      title: "Settings Updated",
      description: `Autonomous mode: ${updatedSettings.enabled ? 'Enabled' : 'Disabled'} (local state only)`,
    });

    return true;
  }, [settings, toast]);

  // Log a decision made by the AI agent
  const logDecision = useCallback(async (decision: Omit<AgentDecision, 'id' | 'timestamp'>) => {
    if (!settings.decision_tracking_enabled) return null;

    // Store in local state - database table not yet created
    const newDecision: AgentDecision = {
      ...decision,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    };

    setDecisions(prev => [newDecision, ...prev]);
    return newDecision;
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
        const todayDecisions = decisions.filter(d => 
          d.timestamp.startsWith(new Date().toISOString().split('T')[0]) &&
          d.approved_by === 'autonomous'
        );

        if (todayDecisions.length >= settings.max_daily_autonomous_actions) {
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
          actionResult = await queueCall(leadId);
          break;
        case 'sms':
          actionResult = await sendSMS(leadId, recommendation.nextBestAction.message);
          break;
        case 'email':
          actionResult = await sendEmail(leadId, recommendation.nextBestAction.message);
          break;
        case 'wait':
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
  }, [settings, toast, logDecision, decisions]);

  // Helper functions for different action types
  const queueCall = async (leadId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: lead } = await supabase
      .from('leads')
      .select('phone_number')
      .eq('id', leadId)
      .single();

    if (!lead) return null;

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
    return true;
  };

  const sendEmail = async (leadId: string, message?: string) => {
    // Placeholder for email sending
    return true;
  };

  const scheduleFollowUp = async (leadId: string, timing: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Parse timing and schedule via lead update
    let delay = 24 * 60; // Default 24 hours
    if (timing.includes('hours')) {
      const hours = parseInt(timing.match(/\d+/)?.[0] || '24');
      delay = hours * 60;
    }

    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + delay);

    // Update lead with next callback time
    await supabase
      .from('leads')
      .update({
        next_callback_at: scheduledAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    return true;
  };

  // Load decision history (from local state)
  const loadDecisionHistory = useCallback(async (limit = 50) => {
    // Using local state - database table not yet created
    console.log('Decision history: Using local state');
  }, []);

  // Analyze script performance (placeholder)
  const analyzeScriptPerformance = useCallback(async (scriptType: 'call' | 'sms' | 'email'): Promise<ScriptPerformance[]> => {
    // Placeholder - tables not yet created
    console.log('Script performance analysis: Tables not configured');
    return [];
  }, []);

  // Generate script suggestions (placeholder)
  const generateScriptSuggestions = useCallback(async (scriptType: 'call' | 'sms' | 'email') => {
    // Placeholder - tables not yet created
    console.log('Script suggestions: Tables not configured');
    return [];
  }, []);

  // Apply a script suggestion (placeholder)
  const applyScriptSuggestion = useCallback(async (suggestionId: string, isAutonomous: boolean) => {
    toast({
      title: "Feature Not Available",
      description: "Script suggestions require additional database configuration",
      variant: "destructive"
    });
    return false;
  }, [toast]);

  // Load script suggestions (placeholder)
  const loadScriptSuggestions = useCallback(async () => {
    console.log('Script suggestions: Tables not configured');
    return [];
  }, []);

  return {
    isExecuting,
    settings,
    decisions,
    scriptSuggestions,
    loadSettings,
    updateSettings,
    logDecision,
    executeRecommendation,
    loadDecisionHistory,
    analyzeScriptPerformance,
    generateScriptSuggestions,
    applyScriptSuggestion,
    loadScriptSuggestions
  };
};
