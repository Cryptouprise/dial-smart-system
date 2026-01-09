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

export type AutonomyLevel = 'full_auto' | 'approval_required' | 'suggestions_only';

export interface AutonomousSettings {
  enabled: boolean;
  auto_execute_recommendations: boolean;
  auto_approve_script_changes: boolean;
  require_approval_for_high_priority: boolean;
  max_daily_autonomous_actions: number;
  decision_tracking_enabled: boolean;
  autonomy_level: AutonomyLevel;
  daily_goal_appointments: number;
  daily_goal_calls: number;
  daily_goal_conversations: number;
  learning_enabled: boolean;
  auto_optimize_campaigns: boolean;
  auto_prioritize_leads: boolean;
}

const DEFAULT_SETTINGS: AutonomousSettings = {
  enabled: false,
  auto_execute_recommendations: false,
  auto_approve_script_changes: false,
  require_approval_for_high_priority: true,
  max_daily_autonomous_actions: 50,
  decision_tracking_enabled: true,
  autonomy_level: 'suggestions_only',
  daily_goal_appointments: 5,
  daily_goal_calls: 100,
  daily_goal_conversations: 20,
  learning_enabled: true,
  auto_optimize_campaigns: false,
  auto_prioritize_leads: true
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
          decision_tracking_enabled: data.decision_tracking_enabled ?? true,
          autonomy_level: (data.autonomy_level as AutonomyLevel) || 'suggestions_only',
          daily_goal_appointments: data.daily_goal_appointments || 5,
          daily_goal_calls: data.daily_goal_calls || 100,
          daily_goal_conversations: data.daily_goal_conversations || 20,
          learning_enabled: data.learning_enabled ?? true,
          auto_optimize_campaigns: data.auto_optimize_campaigns || false,
          auto_prioritize_leads: data.auto_prioritize_leads ?? true
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
          autonomy_level: updatedSettings.autonomy_level,
          daily_goal_appointments: updatedSettings.daily_goal_appointments,
          daily_goal_calls: updatedSettings.daily_goal_calls,
          daily_goal_conversations: updatedSettings.daily_goal_conversations,
          learning_enabled: updatedSettings.learning_enabled,
          auto_optimize_campaigns: updatedSettings.auto_optimize_campaigns,
          auto_prioritize_leads: updatedSettings.auto_prioritize_leads,
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
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Failed to record decision');

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

      console.log(`[Autonomous] Executing ${actionType} action for lead ${leadId} (${leadName})`);

      switch (actionType) {
        case 'call':
          console.log('[Autonomous] Queueing call...');
          actionResult = await queueCall(leadId);
          console.log('[Autonomous] Call queue result:', actionResult);
          break;
        case 'sms':
          console.log('[Autonomous] Sending SMS...');
          actionResult = await sendSMS(leadId, recommendation.nextBestAction.message);
          console.log('[Autonomous] SMS result:', actionResult);
          break;
        case 'email':
          console.log('[Autonomous] Sending email...');
          actionResult = await sendEmail(leadId, recommendation.nextBestAction.message);
          console.log('[Autonomous] Email result:', actionResult);
          break;
        case 'wait':
          console.log('[Autonomous] Scheduling follow-up...');
          actionResult = await scheduleFollowUp(leadId, recommendation.nextBestAction.timing);
          console.log('[Autonomous] Follow-up result:', actionResult);
          break;
      }
      
      console.log(`[Autonomous] Action ${actionType} completed:`, actionResult ? 'SUCCESS' : 'FAILED');

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get lead phone number
    const { data: lead } = await supabase
      .from('leads')
      .select('phone_number, first_name, last_name')
      .eq('id', leadId)
      .maybeSingle();

    if (!lead?.phone_number) return null;

    // Get an available from number
    const { data: fromNumber } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!fromNumber?.number) {
      console.error('No phone number available for SMS');
      return null;
    }

    // Personalize message
    const personalizedMessage = (message || 'Hi {first_name}, following up on our conversation.')
      .replace('{first_name}', lead.first_name || '')
      .replace('{last_name}', lead.last_name || '');

    try {
      // Call the sms-messaging edge function
      const { data, error } = await supabase.functions.invoke('sms-messaging', {
        body: {
          action: 'send_sms',
          to: lead.phone_number,
          from: fromNumber.number,
          body: personalizedMessage,
          user_id: user.id,
          lead_id: leadId,
        },
      });

      if (error) throw error;
      console.log('SMS sent successfully:', data);
      return true;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      return null;
    }
  };

  const sendEmail = async (leadId: string, message?: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Get lead email
    const { data: lead } = await supabase
      .from('leads')
      .select('email, first_name, last_name')
      .eq('id', leadId)
      .maybeSingle();

    if (!lead?.email) {
      console.log('No email address for lead:', leadId);
      return null;
    }

    // Personalize message
    const personalizedMessage = (message || 'Hi {first_name}, following up on our conversation.')
      .replace('{first_name}', lead.first_name || '')
      .replace('{last_name}', lead.last_name || '');

    try {
      // Call the email-sender edge function
      const { data, error } = await supabase.functions.invoke('email-sender', {
        body: {
          to: lead.email,
          subject: 'Following up on our conversation',
          html: `<p>${personalizedMessage}</p>`,
          user_id: user.id,
          lead_id: leadId,
        },
      });

      if (error) {
        console.error('Email send error:', error);
        // Log the failed attempt
        await supabase.from('agent_decisions').insert({
          user_id: user.id,
          lead_id: leadId,
          lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
          decision_type: 'email',
          reasoning: 'Autonomous email action',
          action_taken: message || 'Email attempted',
          executed_at: new Date().toISOString(),
          approved_by: 'autonomous',
          success: false,
          outcome: error.message || 'Email send failed'
        });
        return null;
      }

      // Log successful email
      await supabase.from('agent_decisions').insert({
        user_id: user.id,
        lead_id: leadId,
        lead_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        decision_type: 'email',
        reasoning: 'Autonomous email action',
        action_taken: message || 'Email sent',
        executed_at: new Date().toISOString(),
        approved_by: 'autonomous',
        success: true,
      });

      console.log('Email sent successfully for lead:', leadId, lead.email);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return null;
    }
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: "Error", description: "You must be logged in", variant: "destructive" });
        return false;
      }

      // Check autonomous settings
      if (isAutonomous && !settings.auto_approve_script_changes) {
        toast({ title: "Auto-approve disabled", description: "Enable auto-approve script changes in settings", variant: "destructive" });
        return false;
      }

      // Check daily limit for autonomous changes
      if (isAutonomous) {
        const today = new Date().toISOString().split('T')[0];
        const { count } = await supabase
          .from('agent_improvement_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('created_by', 'lady_jarvis')
          .gte('created_at', today);

        const maxChanges = 5; // Default max auto changes per day
        if ((count || 0) >= maxChanges) {
          toast({ title: "Daily limit reached", description: `Max ${maxChanges} auto script changes per day`, variant: "destructive" });
          return false;
        }
      }

      // Get the suggestion from scriptSuggestions
      const suggestion = scriptSuggestions.find(s => s.id === suggestionId);
      if (!suggestion) {
        toast({ title: "Error", description: "Suggestion not found", variant: "destructive" });
        return false;
      }

      // Call AI Brain to apply the change
      const { data, error } = await supabase.functions.invoke('ai-brain', {
        body: {
          message: `Apply script improvement to agent ${suggestion.agentId}: "${suggestion.improvement}"`,
          sessionId: `script-opt-${Date.now()}`,
          user_id: user.id
        }
      });

      if (error) throw error;

      // Log to agent_improvement_history
      await supabase.from('agent_improvement_history').insert({
        user_id: user.id,
        agent_id: suggestion.agentId || 'unknown',
        agent_name: suggestion.agentName || 'AI Agent',
        improvement_type: 'script_optimization',
        title: suggestion.title || 'Script Improvement',
        details: {
          suggestion,
          result: data,
          applied_at: new Date().toISOString(),
          autonomous: isAutonomous
        },
        created_by: isAutonomous ? 'lady_jarvis' : 'user'
      });

      toast({
        title: isAutonomous ? "Auto-applied script change" : "Script change applied",
        description: suggestion.title || "Improvement applied successfully"
      });

      return true;
    } catch (error) {
      console.error('Error applying script suggestion:', error);
      toast({ title: "Error", description: "Failed to apply script change", variant: "destructive" });
      return false;
    }
  }, [toast, settings.auto_approve_script_changes, scriptSuggestions]);

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