import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GeneratedWorkflow {
  name: string;
  description: string;
  steps: Array<{
    step_type: string;
    step_config: Record<string, any>;
  }>;
  sms_templates?: string[];
}

export const useAIWorkflowGenerator = () => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWorkflow, setGeneratedWorkflow] = useState<GeneratedWorkflow | null>(null);
  const { toast } = useToast();

  const generateWorkflow = useCallback(async (prompt: string, workflowType?: string): Promise<GeneratedWorkflow | null> => {
    try {
      setIsGenerating(true);
      setGeneratedWorkflow(null);

      const { data, error } = await supabase.functions.invoke('ai-workflow-generator', {
        body: { prompt, workflowType },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      const workflow = data?.workflow as GeneratedWorkflow;
      setGeneratedWorkflow(workflow);

      toast({
        title: 'Workflow Generated',
        description: `Created "${workflow?.name}" with ${workflow?.steps?.length || 0} steps`,
      });

      return workflow;
    } catch (error: any) {
      console.error('Error generating workflow:', error);
      
      if (error.message?.includes('Rate limit')) {
        toast({
          title: 'Rate Limited',
          description: 'Too many requests. Please try again in a moment.',
          variant: 'destructive',
        });
      } else if (error.message?.includes('credits')) {
        toast({
          title: 'Credits Exhausted',
          description: 'Please add more AI credits to continue.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Generation Failed',
          description: error.message || 'Failed to generate workflow',
          variant: 'destructive',
        });
      }
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [toast]);

  const saveGeneratedWorkflow = useCallback(async (workflow: GeneratedWorkflow, feedback?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create the workflow
      const { data: createdWorkflow, error: workflowError } = await supabase
        .from('campaign_workflows')
        .insert({
          user_id: user.id,
          name: workflow.name,
          description: workflow.description,
          workflow_type: 'mixed',
          active: true,
        })
        .select()
        .single();

      if (workflowError) throw workflowError;

      // Create the steps
      const stepsToInsert = workflow.steps.map((step, index) => ({
        workflow_id: createdWorkflow.id,
        step_number: index + 1,
        step_type: step.step_type,
        step_config: step.step_config,
      }));

      const { error: stepsError } = await supabase
        .from('workflow_steps')
        .insert(stepsToInsert);

      if (stepsError) throw stepsError;

      // Record the generation for learning
      await supabase.from('ai_workflow_generations').insert({
        user_id: user.id,
        user_prompt: workflow.description,
        generated_workflow_id: createdWorkflow.id,
        generated_steps: workflow.steps,
        user_feedback: feedback,
      });

      toast({
        title: 'Workflow Saved',
        description: `"${workflow.name}" has been saved and is ready to use`,
      });

      return createdWorkflow;
    } catch (error: any) {
      console.error('Error saving workflow:', error);
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save workflow',
        variant: 'destructive',
      });
      return null;
    }
  }, [toast]);

  return {
    isGenerating,
    generatedWorkflow,
    generateWorkflow,
    saveGeneratedWorkflow,
    setGeneratedWorkflow,
  };
};
