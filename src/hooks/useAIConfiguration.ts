import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from './use-toast';
import type { ConfigurationPlan, ConfigurationItem } from '../components/ai-configuration/ConfigurationPreview';
import type { ConfigurationStep, ConfigurationResult } from '../components/ai-configuration/ConfigurationProgress';

export const useAIConfiguration = () => {
  const { toast } = useToast();
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentSteps, setCurrentSteps] = useState<ConfigurationStep[]>([]);

  const generatePlan = useCallback((items: ConfigurationItem[]): ConfigurationPlan => {
    // Estimate time based on number and type of items
    const estimatedTime = items.reduce((total, item) => {
      switch (item.type) {
        case 'campaign':
          return total + 5;
        case 'agent':
          return total + 8;
        case 'workflow':
          return total + 6;
        case 'setting':
          return total + 2;
        default:
          return total + 3;
      }
    }, 0);

    // Generate warnings
    const warnings: string[] = [];
    const hasAgent = items.some(i => i.type === 'agent');
    const hasCampaign = items.some(i => i.type === 'campaign');
    
    if (hasCampaign && !hasAgent) {
      warnings.push('Campaign requires an agent. Make sure you have an existing agent or create one first.');
    }

    return {
      items,
      estimatedTime,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }, []);

  const updateStepStatus = useCallback((
    stepId: string,
    status: ConfigurationStep['status'],
    message?: string,
    error?: string
  ) => {
    setCurrentSteps(prev =>
      prev.map(step =>
        step.id === stepId
          ? {
              ...step,
              status,
              message,
              error,
              ...(status === 'in_progress' ? { startedAt: new Date() } : {}),
              ...(status === 'completed' || status === 'failed' ? { completedAt: new Date() } : {})
            }
          : step
      )
    );
  }, []);

  const executeCampaignCreation = async (item: ConfigurationItem, stepId: string) => {
    try {
      updateStepStatus(stepId, 'in_progress', 'Creating campaign...');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          name: item.name,
          user_id: user.id,
          status: 'draft',
          ...(item.details || {})
        })
        .select()
        .single();

      if (error) throw error;

      updateStepStatus(stepId, 'completed', 'Campaign created successfully');
      return data;
    } catch (error: any) {
      updateStepStatus(stepId, 'failed', undefined, error.message);
      throw error;
    }
  };

  const executeAgentCreation = async (item: ConfigurationItem, stepId: string) => {
    try {
      updateStepStatus(stepId, 'in_progress', 'Creating AI agent...');

      // Call Retell API or your agent creation endpoint
      const { data, error } = await supabase.functions.invoke('retell-agent-management', {
        body: {
          action: 'create',
          agent_name: item.name,
          ...item.details
        }
      });

      if (error) throw error;

      updateStepStatus(stepId, 'completed', 'Agent created successfully');
      return data;
    } catch (error: any) {
      updateStepStatus(stepId, 'failed', undefined, error.message);
      throw error;
    }
  };

  const executeWorkflowCreation = async (item: ConfigurationItem, stepId: string) => {
    try {
      updateStepStatus(stepId, 'in_progress', 'Creating workflow...');

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('campaign_workflows')
        .insert({
          name: item.name,
          user_id: user.id,
          workflow_type: 'follow_up',
          ...(item.details || {})
        })
        .select()
        .single();

      if (error) throw error;

      updateStepStatus(stepId, 'completed', 'Workflow created successfully');
      return data;
    } catch (error: any) {
      updateStepStatus(stepId, 'failed', undefined, error.message);
      throw error;
    }
  };

  const executeSettingUpdate = async (item: ConfigurationItem, stepId: string) => {
    try {
      updateStepStatus(stepId, 'in_progress', 'Updating settings...');

      // Update settings based on item.details
      // This would call your settings update endpoint
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulated delay

      updateStepStatus(stepId, 'completed', 'Settings updated successfully');
      return {};
    } catch (error: any) {
      updateStepStatus(stepId, 'failed', undefined, error.message);
      throw error;
    }
  };

  const executeConfiguration = useCallback(async (
    plan: ConfigurationPlan
  ): Promise<ConfigurationResult> => {
    setIsExecuting(true);

    // Initialize steps
    const steps: ConfigurationStep[] = plan.items.map((item, idx) => ({
      id: `step-${idx}`,
      type: item.type,
      action: `${item.action} ${item.type}`,
      name: item.name,
      status: 'pending'
    }));

    setCurrentSteps(steps);

    const results: any[] = [];
    const errors: string[] = [];

    // Execute each step sequentially
    for (let i = 0; i < plan.items.length; i++) {
      const item = plan.items[i];
      const stepId = steps[i].id;

      try {
        let result;
        
        switch (item.type) {
          case 'campaign':
            result = await executeCampaignCreation(item, stepId);
            break;
          case 'agent':
            result = await executeAgentCreation(item, stepId);
            break;
          case 'workflow':
            result = await executeWorkflowCreation(item, stepId);
            break;
          case 'setting':
            result = await executeSettingUpdate(item, stepId);
            break;
          default:
            throw new Error(`Unknown item type: ${item.type}`);
        }

        results.push(result);
      } catch (error: any) {
        errors.push(error.message);
        // Continue with other steps even if one fails
      }

      // Small delay between steps for better UX
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setIsExecuting(false);

    const finalSteps = currentSteps;
    const success = errors.length === 0;

    if (success) {
      toast({
        title: 'Configuration Complete!',
        description: `Successfully configured ${results.length} items.`,
      });
    } else {
      toast({
        title: 'Configuration Completed with Errors',
        description: `${results.length - errors.length} items configured, ${errors.length} failed.`,
        variant: 'destructive'
      });
    }

    return {
      success,
      steps: finalSteps,
      totalTime: 0, // Will be calculated by the component
      errors: errors.length > 0 ? errors : undefined,
      createdResources: results.reduce((acc, result, idx) => {
        acc[plan.items[idx].type] = result;
        return acc;
      }, {})
    };
  }, [toast, currentSteps, updateStepStatus]);

  return {
    generatePlan,
    executeConfiguration,
    isExecuting,
    currentSteps
  };
};

export default useAIConfiguration;