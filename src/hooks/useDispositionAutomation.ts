import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface DispositionRule {
  id: string;
  disposition_name: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  auto_create_pipeline_stage: boolean;
  pipeline_stage_name?: string;
  follow_up_action: 'none' | 'callback' | 'sequence';
  follow_up_delay_minutes?: number;
  sequence_id?: string;
  created_at: string;
}

export interface FollowUpSequence {
  id: string;
  name: string;
  description: string;
  pipeline_stage_id?: string;
  steps: SequenceStep[];
  active: boolean;
  created_at: string;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_number: number;
  action_type: 'ai_call' | 'ai_sms' | 'manual_sms' | 'email' | 'wait';
  delay_minutes: number;
  content?: string;
  ai_prompt?: string;
  completed: boolean;
}

export interface ScheduledFollowUp {
  id: string;
  lead_id: string;
  scheduled_at: string;
  action_type: 'callback' | 'sequence_step';
  sequence_step_id?: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
}

const STANDARD_DISPOSITIONS = [
  { name: 'Wrong Number', sentiment: 'negative', pipeline_stage: 'invalid_leads', follow_up: 'none' },
  { name: 'Not Interested', sentiment: 'negative', pipeline_stage: 'cold_leads', follow_up: 'none' },
  { name: 'Already Has Solar', sentiment: 'negative', pipeline_stage: 'not_qualified', follow_up: 'none' },
  { name: 'Potential Prospect', sentiment: 'neutral', pipeline_stage: 'prospects', follow_up: 'callback' },
  { name: 'Hot Lead', sentiment: 'positive', pipeline_stage: 'hot_leads', follow_up: 'sequence' },
  { name: 'Follow Up', sentiment: 'neutral', pipeline_stage: 'follow_up', follow_up: 'callback' },
  { name: 'Not Connected', sentiment: 'neutral', pipeline_stage: 'callbacks', follow_up: 'callback' },
  { name: 'Voicemail', sentiment: 'neutral', pipeline_stage: 'follow_up', follow_up: 'callback' },
  { name: 'Dropped Call', sentiment: 'neutral', pipeline_stage: 'callbacks', follow_up: 'callback' },
  { name: 'Dial Tree Workflow', sentiment: 'neutral', pipeline_stage: 'in_progress', follow_up: 'sequence' },
  { name: 'Interested', sentiment: 'positive', pipeline_stage: 'hot_leads', follow_up: 'sequence' },
  { name: 'Appointment Booked', sentiment: 'positive', pipeline_stage: 'appointments', follow_up: 'sequence' },
] as const;

export const useDispositionAutomation = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Initialize standard dispositions
  const initializeStandardDispositions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Check if dispositions already exist
      const { data: existingDispositions } = await supabase
        .from('dispositions')
        .select('name')
        .eq('user_id', user.id);

      const existingNames = new Set(existingDispositions?.map(d => d.name) || []);

      // Create missing dispositions
      const newDispositions = STANDARD_DISPOSITIONS
        .filter(d => !existingNames.has(d.name))
        .map(d => ({
          user_id: user.id,
          name: d.name,
          description: `Standard disposition: ${d.name}`,
          color: d.sentiment === 'positive' ? '#10B981' : d.sentiment === 'negative' ? '#EF4444' : '#F59E0B',
          pipeline_stage: d.pipeline_stage,
          auto_actions: []
        }));

      if (newDispositions.length > 0) {
        const { error: dispError } = await supabase
          .from('dispositions')
          .insert(newDispositions);

        if (dispError) throw dispError;
      }

      toast({
        title: "Dispositions Initialized",
        description: `Created ${newDispositions.length} standard dispositions`,
      });

      return true;
    } catch (error) {
      console.error('Error initializing dispositions:', error);
      toast({
        title: "Initialization Error",
        description: "Failed to initialize standard dispositions",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Apply disposition to a call/lead
  const applyDisposition = useCallback(async (params: {
    callLogId: string;
    leadId: string;
    dispositionName: string;
    notes?: string;
  }) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get disposition
      const { data: disposition } = await supabase
        .from('dispositions')
        .select('id, name, pipeline_stage')
        .eq('user_id', user.id)
        .eq('name', params.dispositionName)
        .single();

      if (!disposition) throw new Error('Disposition not found');

      // Update call log
      await supabase
        .from('call_logs')
        .update({
          outcome: params.dispositionName.toLowerCase().replace(/\s+/g, '_'),
          notes: params.notes
        })
        .eq('id', params.callLogId);

      // Determine lead status based on disposition
      const dispConfig = STANDARD_DISPOSITIONS.find(d => d.name === params.dispositionName);
      let leadStatus = 'contacted';
      if (dispConfig?.sentiment === 'positive') leadStatus = 'qualified';
      else if (dispConfig?.sentiment === 'negative') leadStatus = 'lost';

      await supabase
        .from('leads')
        .update({
          status: leadStatus,
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', params.leadId);

      // Move to pipeline stage if specified
      if (disposition.pipeline_stage) {
        let { data: pipelineBoard } = await supabase
          .from('pipeline_boards')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', disposition.pipeline_stage)
          .single();

        if (!pipelineBoard) {
          const { data: newBoard } = await supabase
            .from('pipeline_boards')
            .insert({
              user_id: user.id,
              name: disposition.pipeline_stage,
              description: `Auto-created for ${params.dispositionName}`,
              disposition_id: disposition.id,
              position: 999,
              settings: {}
            })
            .select()
            .single();

          pipelineBoard = newBoard;
        }

        if (pipelineBoard) {
          await supabase
            .from('lead_pipeline_positions')
            .upsert({
              user_id: user.id,
              lead_id: params.leadId,
              pipeline_board_id: pipelineBoard.id,
              position: 0,
              moved_at: new Date().toISOString(),
              moved_by_user: false,
              notes: `Auto-moved from disposition: ${params.dispositionName}`
            });
        }
      }

      // Schedule follow-up callback if needed
      if (dispConfig?.follow_up === 'callback') {
        const scheduledAt = new Date();
        scheduledAt.setMinutes(scheduledAt.getMinutes() + 1440); // 24 hours

        await supabase
          .from('leads')
          .update({ next_callback_at: scheduledAt.toISOString() })
          .eq('id', params.leadId);
      }

      toast({
        title: "Disposition Applied",
        description: `${params.dispositionName} applied successfully`,
      });

      return true;
    } catch (error) {
      console.error('Error applying disposition:', error);
      toast({
        title: "Disposition Error",
        description: "Failed to apply disposition",
        variant: "destructive"
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Start a follow-up sequence (placeholder - tables not yet created)
  const startSequence = useCallback(async (leadId: string, sequenceId: string) => {
    console.log('Start sequence: Tables not configured', { leadId, sequenceId });
    return false;
  }, []);

  // Create a new follow-up sequence (placeholder - tables not yet created)
  const createSequence = useCallback(async (params: {
    name: string;
    description: string;
    pipelineStageId?: string;
    steps: Omit<SequenceStep, 'id' | 'sequence_id' | 'completed'>[];
  }) => {
    toast({
      title: "Feature Not Available",
      description: "Follow-up sequences require additional database configuration",
      variant: "destructive"
    });
    return null;
  }, [toast]);

  // Get pending follow-ups (placeholder - tables not yet created)
  const getPendingFollowUps = useCallback(async () => {
    console.log('Pending follow-ups: Tables not configured');
    return [];
  }, []);

  // Execute a follow-up action (placeholder - tables not yet created)
  const executeFollowUp = useCallback(async (followUpId: string) => {
    console.log('Execute follow-up: Tables not configured', { followUpId });
    return false;
  }, []);

  return {
    isLoading,
    initializeStandardDispositions,
    applyDisposition,
    createSequence,
    startSequence,
    getPendingFollowUps,
    executeFollowUp
  };
};
