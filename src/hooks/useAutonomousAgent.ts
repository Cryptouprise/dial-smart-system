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

export interface AutonomousSettings {
  enabled: boolean;
  auto_execute_recommendations: boolean;
  auto_approve_script_changes: boolean;
  require_approval_for_high_priority: boolean;
  max_daily_autonomous_actions: number;
  decision_tracking_enabled: boolean;
}

const DEFAULT_SETTINGS: AutonomousSettings = {
  enabled: false,
  auto_execute_recommendations: false,
  auto_approve_script_changes: false,
  require_approval_for_high_priority: true,
  max_daily_autonomous_actions: 50,
  decision_tracking_enabled: true
};

export const useAutonomousAgent = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [settings, setSettings] = useState<AutonomousSettings>(DEFAULT_SETTINGS);
  const [decisions, setDecisions] = useState<AgentDecision[]>([]);
  const [scriptSuggestions, setScriptSuggestions] = useState<any[]>([]);
  const { toast } = useToast();

  // Load autonomous settings from database
  const loadSettings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('autonomous_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

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
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to update settings",
          variant: "destructive"
        });
        return false;
      }

      const updatedSettings = { ...settings, ...newSettings };

      const { error } = await supabase
        .from('autonomous_settings')
        .upsert({
          user_id: user.id,
          enabled: updatedSettings.enabled,
          auto_execute_recommendations: updatedSettings.auto_execute_recommendations,
          auto_approve_script_changes: updatedSettings.auto_approve_script_changes,
          require_approval_for_high_priority: updatedSettings.require_approval_for_high_priority,
          max_daily_autonomous_actions: updatedSettings.max_daily_autonomous_actions,
          decision_tracking_enabled: updatedSettings.decision_tracking_enabled,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
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
          approved_by: decision.approved_by
        })
        .select()
        .single();

      if (error) throw error;

      const newDecision: AgentDecision = {
        id: data.id,
        timestamp: data.created_at,
        lead_id: data.lead_id,
        lead_name: data.lead_name || '',
        decision_type: data.decision_type as AgentDecision['decision_type'],
        reasoning: data.reasoning || '',
        action_taken: data.action_taken || '',
        outcome: data.outcome,
        success: data.success,
        executed_at: data.executed_at,
        approved_by: data.approved_by as 'autonomous' | 'manual'
      };

      setDecisions(prev => [newDecision, ...prev]);
      return newDecision;
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
        const todayDecisions = decisions.filter(d => 
          d.timestamp.startsWith(today) &&
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
      .maybeSingle();

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
    // Placeholder for SMS sending - can be connected to SMS edge function
    console.log('SMS action queued for lead:', leadId, message);
    return true;
  };

  const sendEmail = async (leadId: string, message?: string) => {
    // Placeholder for email sending
    console.log('Email action queued for lead:', leadId, message);
    return true;
  };

  const scheduleFollowUp = async (leadId: string, timing: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Parse timing and schedule
    let delayMinutes = 24 * 60; // Default 24 hours
    if (timing.includes('hours')) {
      const hours = parseInt(timing.match(/\d+/)?.[0] || '24');
      delayMinutes = hours * 60;
    }

    const scheduledAt = new Date();
    scheduledAt.setMinutes(scheduledAt.getMinutes() + delayMinutes);

    // Update lead with next callback time
    await supabase
      .from('leads')
      .update({
        next_callback_at: scheduledAt.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId);

    // Also create a scheduled follow-up record
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

  // Load decision history from database
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

      const formattedDecisions: AgentDecision[] = (data || []).map(d => ({
        id: d.id,
        timestamp: d.created_at,
        lead_id: d.lead_id || '',
        lead_name: d.lead_name || '',
        decision_type: d.decision_type as AgentDecision['decision_type'],
        reasoning: d.reasoning || '',
        action_taken: d.action_taken || '',
        outcome: d.outcome,
        success: d.success,
        executed_at: d.executed_at,
        approved_by: d.approved_by as 'autonomous' | 'manual'
      }));

      setDecisions(formattedDecisions);
    } catch (error) {
      console.error('Error loading decision history:', error);
    }
  }, []);

  // Placeholder functions for script analysis (can be extended later)
  const analyzeScriptPerformance = useCallback(async (scriptType: 'call' | 'sms' | 'email') => {
    console.log('Script performance analysis for:', scriptType);
    return [];
  }, []);

  const generateScriptSuggestions = useCallback(async (scriptType: 'call' | 'sms' | 'email') => {
    console.log('Generating script suggestions for:', scriptType);
    return [];
  }, []);

  const applyScriptSuggestion = useCallback(async (suggestionId: string, isAutonomous: boolean) => {
    toast({
      title: "Feature Coming Soon",
      description: "Script optimization will be available in a future update",
    });
    return false;
  }, [toast]);

  const loadScriptSuggestions = useCallback(async () => {
    return [];
  }, []);

  // Load settings and decisions on mount
  useEffect(() => {
    loadSettings();
    loadDecisionHistory();
  }, [loadSettings, loadDecisionHistory]);

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