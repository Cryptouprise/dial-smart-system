import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface WorkflowStep {
  step_number: number;
  step_type: 'call' | 'sms' | 'ai_sms' | 'wait' | 'email' | 'webhook';
  step_config: Record<string, any>;
}

interface WorkflowTemplate {
  name: string;
  description: string;
  workflow_type: string;
  steps: WorkflowStep[];
}

const NURTURE_TEMPLATES: WorkflowTemplate[] = [
  {
    name: 'Aggressive Week 1-2 (Daily Touches)',
    description: 'Daily outreach for hot leads in the first two weeks',
    workflow_type: 'multi_channel',
    steps: [
      { step_number: 1, step_type: 'call', step_config: { priority: 'high' } },
      { step_number: 2, step_type: 'wait', step_config: { delay_hours: 4 } },
      { step_number: 3, step_type: 'sms', step_config: { content: 'Hi {{first_name}}, I just tried calling you. When is a good time to connect?' } },
      { step_number: 4, step_type: 'wait', step_config: { delay_days: 1, time_of_day: '10:00' } },
      { step_number: 5, step_type: 'call', step_config: { priority: 'high' } },
      { step_number: 6, step_type: 'wait', step_config: { delay_days: 1, time_of_day: '14:00' } },
      { step_number: 7, step_type: 'ai_sms', step_config: { context: 'follow_up', prompt: 'Send a friendly follow-up asking about their interest' } },
      { step_number: 8, step_type: 'wait', step_config: { delay_days: 1, time_of_day: '11:00' } },
      { step_number: 9, step_type: 'call', step_config: { priority: 'medium' } },
      { step_number: 10, step_type: 'wait', step_config: { delay_days: 2, time_of_day: '10:00' } },
      { step_number: 11, step_type: 'sms', step_config: { content: 'Hi {{first_name}}, just checking in. Are you still interested in learning more?' } },
      { step_number: 12, step_type: 'wait', step_config: { delay_days: 2, time_of_day: '15:00' } },
      { step_number: 13, step_type: 'call', step_config: { priority: 'medium' } },
    ],
  },
  {
    name: 'Cool Down Week 3-4 (Gentle Pause)',
    description: 'Reduced frequency for leads who haven\'t engaged',
    workflow_type: 'multi_channel',
    steps: [
      { step_number: 1, step_type: 'wait', step_config: { delay_days: 3, time_of_day: '11:00' } },
      { step_number: 2, step_type: 'ai_sms', step_config: { context: 'reengagement', prompt: 'Send a casual check-in message, not pushy' } },
      { step_number: 3, step_type: 'wait', step_config: { delay_days: 4, time_of_day: '14:00' } },
      { step_number: 4, step_type: 'call', step_config: { priority: 'low' } },
      { step_number: 5, step_type: 'wait', step_config: { delay_days: 5, time_of_day: '10:00' } },
      { step_number: 6, step_type: 'sms', step_config: { content: 'Hi {{first_name}}, wanted to make sure you received my previous messages. Let me know if you have any questions!' } },
    ],
  },
  {
    name: 'Maintenance Month 2-6 (Weekly)',
    description: 'Weekly touchpoints to stay top of mind',
    workflow_type: 'multi_channel',
    steps: [
      { step_number: 1, step_type: 'wait', step_config: { delay_days: 7, time_of_day: '10:00' } },
      { step_number: 2, step_type: 'ai_sms', step_config: { context: 'value_add', prompt: 'Share a helpful tip or insight related to their interest' } },
      { step_number: 3, step_type: 'wait', step_config: { delay_days: 7, time_of_day: '14:00' } },
      { step_number: 4, step_type: 'call', step_config: { priority: 'low' } },
      { step_number: 5, step_type: 'wait', step_config: { delay_days: 7, time_of_day: '11:00' } },
      { step_number: 6, step_type: 'sms', step_config: { content: 'Hi {{first_name}}, just a quick check-in. Has anything changed with your situation?' } },
      { step_number: 7, step_type: 'wait', step_config: { delay_days: 7, time_of_day: '15:00' } },
      { step_number: 8, step_type: 'ai_sms', step_config: { context: 'nurture', prompt: 'Send a thoughtful message that provides value without being salesy' } },
    ],
  },
  {
    name: 'Database Reactivation (3-Day Burst)',
    description: 'Short burst campaign to reactivate cold leads',
    workflow_type: 'multi_channel',
    steps: [
      { step_number: 1, step_type: 'sms', step_config: { content: 'Hi {{first_name}}! We haven\'t connected in a while. I have some exciting updates to share. Can we chat?' } },
      { step_number: 2, step_type: 'wait', step_config: { delay_hours: 6 } },
      { step_number: 3, step_type: 'call', step_config: { priority: 'high' } },
      { step_number: 4, step_type: 'wait', step_config: { delay_days: 1, time_of_day: '10:00' } },
      { step_number: 5, step_type: 'ai_sms', step_config: { context: 'reactivation', prompt: 'Send a compelling reason to reconnect based on their original interest' } },
      { step_number: 6, step_type: 'wait', step_config: { delay_hours: 4 } },
      { step_number: 7, step_type: 'call', step_config: { priority: 'high' } },
      { step_number: 8, step_type: 'wait', step_config: { delay_days: 1, time_of_day: '14:00' } },
      { step_number: 9, step_type: 'sms', step_config: { content: 'Last chance {{first_name}}! I\'d love to help but need to hear back from you. Reply YES if interested.' } },
    ],
  },
  {
    name: 'Return to Nurture (Cycle Back)',
    description: 'Restart nurturing sequence for leads who didn\'t convert',
    workflow_type: 'multi_channel',
    steps: [
      { step_number: 1, step_type: 'wait', step_config: { delay_days: 30, time_of_day: '10:00' } },
      { step_number: 2, step_type: 'ai_sms', step_config: { context: 'reconnect', prompt: 'Send a friendly message reconnecting after some time has passed' } },
      { step_number: 3, step_type: 'wait', step_config: { delay_days: 3, time_of_day: '14:00' } },
      { step_number: 4, step_type: 'call', step_config: { priority: 'medium' } },
      { step_number: 5, step_type: 'wait', step_config: { delay_days: 7, time_of_day: '11:00' } },
      { step_number: 6, step_type: 'sms', step_config: { content: 'Hi {{first_name}}, things may have changed since we last spoke. Would you like to revisit our conversation?' } },
    ],
  },
];

export function useNurtureTemplates() {
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const createWorkflowFromTemplate = async (templateIndex: number) => {
    setIsCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const template = NURTURE_TEMPLATES[templateIndex];

      // Create the workflow
      const { data: workflow, error: workflowError } = await supabase
        .from('campaign_workflows')
        .insert({
          user_id: user.id,
          name: template.name,
          description: template.description,
          workflow_type: template.workflow_type,
          is_template: false,
          active: true,
        })
        .select()
        .single();

      if (workflowError) throw workflowError;

      // Create the steps
      const stepsToInsert = template.steps.map(step => ({
        workflow_id: workflow.id,
        step_number: step.step_number,
        step_type: step.step_type,
        step_config: step.step_config,
      }));

      const { error: stepsError } = await supabase
        .from('workflow_steps')
        .insert(stepsToInsert);

      if (stepsError) throw stepsError;

      toast({ 
        title: 'Workflow Created', 
        description: `"${template.name}" is ready to use` 
      });

      return workflow;
    } catch (error: any) {
      console.error('Error creating workflow:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsCreating(false);
    }
  };

  const getTemplates = () => NURTURE_TEMPLATES;

  return {
    templates: NURTURE_TEMPLATES,
    getTemplates,
    createWorkflowFromTemplate,
    isCreating,
  };
}
