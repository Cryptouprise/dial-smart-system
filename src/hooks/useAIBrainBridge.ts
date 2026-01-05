import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AutonomyLevel = 'full_auto' | 'approval_required' | 'suggestions_only';

export interface AIBrainTool {
  name: string;
  description: string;
  category: 'campaigns' | 'leads' | 'alerts' | 'phone_numbers' | 'appointments' | 'broadcasts' | 'analytics';
}

export interface BridgeExecutionResult {
  success: boolean;
  toolName: string;
  result?: any;
  error?: string;
  executedAt: string;
}

// Available AI Brain tools that can be invoked programmatically
const AI_BRAIN_TOOLS: AIBrainTool[] = [
  // Campaign Control
  { name: 'pause_campaign', description: 'Pause an active campaign', category: 'campaigns' },
  { name: 'resume_campaign', description: 'Resume a paused campaign', category: 'campaigns' },
  { name: 'run_health_check', description: 'Run system health diagnostics', category: 'campaigns' },
  
  // Lead Management
  { name: 'update_lead', description: 'Update lead information', category: 'leads' },
  { name: 'delete_lead', description: 'Delete a lead', category: 'leads' },
  { name: 'move_lead_to_stage', description: 'Move lead to a pipeline stage', category: 'leads' },
  
  // Alert Management
  { name: 'list_alerts', description: 'List active alerts', category: 'alerts' },
  { name: 'acknowledge_alert', description: 'Acknowledge an alert', category: 'alerts' },
  { name: 'acknowledge_all_alerts', description: 'Acknowledge all alerts', category: 'alerts' },
  
  // Phone Number Management
  { name: 'update_phone_number', description: 'Update phone number settings', category: 'phone_numbers' },
  { name: 'quarantine_phone_number', description: 'Quarantine a phone number', category: 'phone_numbers' },
  
  // Appointment Management
  { name: 'cancel_appointment', description: 'Cancel an appointment', category: 'appointments' },
  { name: 'reschedule_appointment', description: 'Reschedule an appointment', category: 'appointments' },
  { name: 'list_today_appointments', description: 'List today\'s appointments', category: 'appointments' },
  
  // Broadcast Control
  { name: 'list_broadcasts', description: 'List voice broadcasts', category: 'broadcasts' },
  { name: 'launch_broadcast', description: 'Launch a voice broadcast', category: 'broadcasts' },
  { name: 'stop_broadcast', description: 'Stop a running broadcast', category: 'broadcasts' },
];

/**
 * Hook to bridge the Autonomous Agent with AI Brain tools
 * Allows programmatic invocation of any AI Brain capability
 */
export const useAIBrainBridge = () => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [lastExecution, setLastExecution] = useState<BridgeExecutionResult | null>(null);
  const [executionHistory, setExecutionHistory] = useState<BridgeExecutionResult[]>([]);
  const { toast } = useToast();

  /**
   * Get all available AI Brain tools
   */
  const getAvailableTools = useCallback(() => {
    return AI_BRAIN_TOOLS;
  }, []);

  /**
   * Get tools by category
   */
  const getToolsByCategory = useCallback((category: AIBrainTool['category']) => {
    return AI_BRAIN_TOOLS.filter(tool => tool.category === category);
  }, []);

  /**
   * Invoke an AI Brain tool directly
   * This bypasses chat and executes the tool programmatically
   */
  const invokeAIBrainTool = useCallback(async (
    toolName: string,
    args: Record<string, any>
  ): Promise<BridgeExecutionResult> => {
    setIsExecuting(true);
    const executedAt = new Date().toISOString();
    
    try {
      console.log(`[AI Brain Bridge] Invoking tool: ${toolName}`, args);
      
      // Call the AI Brain edge function with a direct tool execution request
      const { data, error } = await supabase.functions.invoke('ai-brain', {
        body: {
          message: `DIRECT_TOOL_EXECUTION: ${toolName}`,
          directToolCall: {
            tool: toolName,
            args
          },
          sessionId: `bridge-${Date.now()}`,
          conversationHistory: []
        }
      });

      if (error) throw error;

      const result: BridgeExecutionResult = {
        success: true,
        toolName,
        result: data,
        executedAt
      };

      setLastExecution(result);
      setExecutionHistory(prev => [result, ...prev.slice(0, 49)]); // Keep last 50

      console.log(`[AI Brain Bridge] Tool ${toolName} executed successfully`, data);
      return result;
    } catch (error) {
      console.error(`[AI Brain Bridge] Tool ${toolName} failed:`, error);
      
      const result: BridgeExecutionResult = {
        success: false,
        toolName,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedAt
      };

      setLastExecution(result);
      setExecutionHistory(prev => [result, ...prev.slice(0, 49)]);

      return result;
    } finally {
      setIsExecuting(false);
    }
  }, []);

  /**
   * Execute a high-level autonomous action
   * This wraps tool invocation with additional logic for autonomy
   */
  const executeAutonomousAction = useCallback(async (
    action: {
      type: 'pause_campaign' | 'resume_campaign' | 'move_lead' | 'send_sms' | 'schedule_callback' | 'quarantine_number';
      targetId: string;
      additionalParams?: Record<string, any>;
      reason?: string;
    },
    autonomyLevel: AutonomyLevel
  ): Promise<BridgeExecutionResult> => {
    // Map action types to tool names
    const actionToTool: Record<string, string> = {
      'pause_campaign': 'pause_campaign',
      'resume_campaign': 'resume_campaign',
      'move_lead': 'move_lead_to_stage',
      'send_sms': 'send_sms',
      'schedule_callback': 'reschedule_appointment',
      'quarantine_number': 'quarantine_phone_number'
    };

    const toolName = actionToTool[action.type];
    if (!toolName) {
      return {
        success: false,
        toolName: action.type,
        error: `Unknown action type: ${action.type}`,
        executedAt: new Date().toISOString()
      };
    }

    // If approval required, just log and return without executing
    if (autonomyLevel === 'approval_required') {
      console.log(`[AI Brain Bridge] Action ${action.type} requires approval`);
      toast({
        title: "Action Requires Approval",
        description: `${action.type} for ${action.targetId} needs manual approval`,
      });
      return {
        success: false,
        toolName,
        error: 'Approval required - action logged but not executed',
        executedAt: new Date().toISOString()
      };
    }

    // If suggestions only, don't execute
    if (autonomyLevel === 'suggestions_only') {
      console.log(`[AI Brain Bridge] Suggestion: ${action.type}`);
      return {
        success: false,
        toolName,
        error: 'Suggestions only mode - action not executed',
        executedAt: new Date().toISOString()
      };
    }

    // Full auto mode - execute the action
    const args = {
      id: action.targetId,
      reason: action.reason,
      ...action.additionalParams
    };

    return invokeAIBrainTool(toolName, args);
  }, [invokeAIBrainTool, toast]);

  /**
   * Execute multiple tools in sequence
   */
  const executeToolChain = useCallback(async (
    tools: Array<{ name: string; args: Record<string, any> }>
  ): Promise<BridgeExecutionResult[]> => {
    const results: BridgeExecutionResult[] = [];
    
    for (const tool of tools) {
      const result = await invokeAIBrainTool(tool.name, tool.args);
      results.push(result);
      
      // Stop chain if a tool fails
      if (!result.success) {
        console.log(`[AI Brain Bridge] Chain stopped at ${tool.name} due to failure`);
        break;
      }
    }

    return results;
  }, [invokeAIBrainTool]);

  /**
   * Check if a tool exists
   */
  const toolExists = useCallback((toolName: string): boolean => {
    return AI_BRAIN_TOOLS.some(tool => tool.name === toolName);
  }, []);

  return {
    isExecuting,
    lastExecution,
    executionHistory,
    getAvailableTools,
    getToolsByCategory,
    invokeAIBrainTool,
    executeAutonomousAction,
    executeToolChain,
    toolExists
  };
};
