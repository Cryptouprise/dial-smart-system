import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface WorkflowStep {
  id?: string;
  workflow_id?: string;
  step_number: number;
  step_type: 'call' | 'sms' | 'ai_sms' | 'ai_auto_reply' | 'wait' | 'condition';
  step_config: {
    delay_minutes?: number;
    delay_hours?: number;
    delay_days?: number;
    time_of_day?: string;
    sms_content?: string;
    ai_prompt?: string;
    // Call step config
    agent_id?: string;
    timing_mode?: 'immediate' | 'scheduled' | 'inherit';
    max_ring_seconds?: number;
    leave_voicemail?: boolean;
    voicemail_message?: string;
    // SMS step config
    use_conversation_context?: boolean;
    // AI auto-reply config
    enabled?: boolean;
    response_delay_seconds?: number;
    channels?: string[];
    ai_instructions?: string;
    stop_on_human_reply?: boolean;
    // Condition-specific fields
    condition_type?: 'disposition' | 'lead_status' | 'call_outcome' | 'attempts' | 'time_of_day' | 'day_of_week' | 'tag_exists' | 'custom_field' | 'call_duration' | 'sms_reply_received' | 'voicemail_left' | 'appointment_scheduled' | 'lead_score' | 'last_contact_days' | 'total_calls' | 'total_sms';
    condition_operator?: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
    condition_value?: string;
    condition_field?: string; // For custom_field type
    then_action?: 'continue' | 'skip' | 'end_workflow' | 'jump_to_step' | 'start_workflow';
    else_action?: 'continue' | 'skip' | 'end_workflow' | 'jump_to_step' | 'start_workflow';
    then_target?: string; // step number or workflow id
    else_target?: string;
  };
}

export interface WorkflowAutoReplySettings {
  enabled: boolean;
  ai_instructions: string;
  response_delay_seconds: number;
  stop_on_human_reply: boolean;
  calendar_enabled: boolean;
  booking_link: string;
  knowledge_base?: string;
}

export interface CampaignWorkflow {
  id?: string;
  user_id?: string;
  name: string;
  description?: string;
  workflow_type: 'calling_only' | 'follow_up' | 'mixed' | 'appointment_reminder' | 'no_show';
  is_template?: boolean;
  settings?: {
    max_calls_per_day?: number;
    call_spacing_hours?: number;
    pause_on_weekends?: boolean;
    pause_days?: string[];
    resume_day?: string;
    resume_time?: string;
  };
  auto_reply_settings?: WorkflowAutoReplySettings | null;
  active?: boolean;
  steps?: WorkflowStep[];
  created_at?: string;
  updated_at?: string;
}

export interface DispositionAutoAction {
  id?: string;
  user_id?: string;
  disposition_id?: string;
  disposition_name?: string;
  action_type: 'remove_all_campaigns' | 'remove_from_campaign' | 'move_to_stage' | 'add_to_dnc' | 'start_workflow';
  action_config?: {
    target_stage_id?: string;
    target_workflow_id?: string;
    target_campaign_id?: string;
  };
  priority?: number;
  active?: boolean;
}

export function useCampaignWorkflows() {
  const [workflows, setWorkflows] = useState<CampaignWorkflow[]>([]);
  const [dispositionActions, setDispositionActions] = useState<DispositionAutoAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadWorkflows = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('campaign_workflows')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Load steps for each workflow
      const workflowsWithSteps: CampaignWorkflow[] = [];
      for (const workflow of (data || [])) {
        const { data: steps } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('workflow_id', workflow.id)
          .order('step_number', { ascending: true });

        workflowsWithSteps.push({
          ...workflow,
          workflow_type: workflow.workflow_type as CampaignWorkflow['workflow_type'],
          settings: workflow.settings as CampaignWorkflow['settings'],
          auto_reply_settings: workflow.auto_reply_settings as unknown as WorkflowAutoReplySettings | null,
          steps: (steps || []).map(s => ({
            ...s,
            step_type: s.step_type as WorkflowStep['step_type'],
            step_config: s.step_config as WorkflowStep['step_config']
          }))
        });
      }

      setWorkflows(workflowsWithSteps);
    } catch (error: any) {
      console.error('Error loading workflows:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const createWorkflow = async (workflow: Omit<CampaignWorkflow, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create workflow
      const { data: workflowData, error: workflowError } = await supabase
        .from('campaign_workflows')
        .insert({
          user_id: user.id,
          name: workflow.name,
          description: workflow.description,
          workflow_type: workflow.workflow_type,
          is_template: workflow.is_template || false,
          settings: workflow.settings || {},
          auto_reply_settings: workflow.auto_reply_settings ? JSON.parse(JSON.stringify(workflow.auto_reply_settings)) : null,
          active: workflow.active ?? true
        })
        .select()
        .maybeSingle();

      if (workflowError) throw workflowError;

      // Create steps if provided
      if (workflow.steps && workflow.steps.length > 0) {
        const stepsToInsert = workflow.steps.map((step, index) => ({
          workflow_id: workflowData.id,
          step_number: index + 1,
          step_type: step.step_type,
          step_config: step.step_config
        }));

        const { error: stepsError } = await supabase
          .from('workflow_steps')
          .insert(stepsToInsert);

        if (stepsError) throw stepsError;
      }

      toast({ title: 'Success', description: 'Workflow created successfully' });
      await loadWorkflows();
      return workflowData;
    } catch (error: any) {
      console.error('Error creating workflow:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return null;
    }
  };

  const updateWorkflow = async (id: string, updates: Partial<CampaignWorkflow>) => {
    try {
      const { error } = await supabase
        .from('campaign_workflows')
        .update({
          name: updates.name,
          description: updates.description,
          workflow_type: updates.workflow_type,
          settings: updates.settings,
          auto_reply_settings: updates.auto_reply_settings ? JSON.parse(JSON.stringify(updates.auto_reply_settings)) : null,
          active: updates.active,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      // Update steps if provided
      if (updates.steps) {
        // Delete existing steps
        await supabase.from('workflow_steps').delete().eq('workflow_id', id);
        
        // Insert new steps
        if (updates.steps.length > 0) {
          const stepsToInsert = updates.steps.map((step, index) => ({
            workflow_id: id,
            step_number: index + 1,
            step_type: step.step_type,
            step_config: step.step_config
          }));

          await supabase.from('workflow_steps').insert(stepsToInsert);
        }
      }

      toast({ title: 'Success', description: 'Workflow updated' });
      await loadWorkflows();
    } catch (error: any) {
      console.error('Error updating workflow:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const deleteWorkflow = async (id: string) => {
    try {
      const { error } = await supabase
        .from('campaign_workflows')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Workflow deleted' });
      await loadWorkflows();
    } catch (error: any) {
      console.error('Error deleting workflow:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const loadDispositionActions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('disposition_auto_actions')
        .select('*')
        .eq('user_id', user.id)
        .order('priority', { ascending: true });

      if (error) throw error;

      setDispositionActions((data || []).map(d => ({
        ...d,
        action_type: d.action_type as DispositionAutoAction['action_type'],
        action_config: d.action_config as DispositionAutoAction['action_config']
      })));
    } catch (error: any) {
      console.error('Error loading disposition actions:', error);
    }
  };

  const createDispositionAction = async (action: Omit<DispositionAutoAction, 'id' | 'user_id'>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('disposition_auto_actions')
        .insert({
          user_id: user.id,
          disposition_id: action.disposition_id,
          disposition_name: action.disposition_name,
          action_type: action.action_type,
          action_config: action.action_config || {},
          priority: action.priority || 0,
          active: action.active ?? true
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Disposition action created' });
      await loadDispositionActions();
    } catch (error: any) {
      console.error('Error creating disposition action:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const deleteDispositionAction = async (id: string) => {
    try {
      const { error } = await supabase
        .from('disposition_auto_actions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Success', description: 'Disposition action deleted' });
      await loadDispositionActions();
    } catch (error: any) {
      console.error('Error deleting disposition action:', error);
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadWorkflows();
    loadDispositionActions();
  }, []);

  return {
    workflows,
    dispositionActions,
    isLoading,
    loadWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    loadDispositionActions,
    createDispositionAction,
    deleteDispositionAction
  };
}
