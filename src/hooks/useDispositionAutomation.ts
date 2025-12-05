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

  // Initialize standard dispositions with rules
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

      // Create disposition rules
      const { data: dispositions } = await supabase
        .from('dispositions')
        .select('id, name')
        .eq('user_id', user.id);

      const dispositionMap = new Map(dispositions?.map(d => [d.name, d.id]) || []);

      const rules = STANDARD_DISPOSITIONS.map(d => ({
        user_id: user.id,
        disposition_id: dispositionMap.get(d.name),
        disposition_name: d.name,
        sentiment: d.sentiment,
        auto_create_pipeline_stage: true,
        pipeline_stage_name: d.pipeline_stage,
        follow_up_action: d.follow_up,
        follow_up_delay_minutes: d.follow_up === 'callback' ? 1440 : undefined // 24 hours for callbacks
      }));

      // Insert rules (upsert to avoid duplicates)
      for (const rule of rules) {
        await supabase
          .from('disposition_rules')
          .upsert(rule, { onConflict: 'disposition_id' });
      }

      toast({
        title: "Dispositions Initialized",
        description: `Created ${newDispositions.length} standard dispositions with automation rules`,
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

      // Get disposition and rule
      const { data: disposition } = await supabase
        .from('dispositions')
        .select('id, name, pipeline_stage')
        .eq('user_id', user.id)
        .eq('name', params.dispositionName)
        .single();

      if (!disposition) throw new Error('Disposition not found');

      const { data: rule } = await supabase
        .from('disposition_rules')
        .select('*')
        .eq('disposition_id', disposition.id)
        .single();

      // Update call log
      await supabase
        .from('call_logs')
        .update({
          outcome: params.dispositionName.toLowerCase().replace(/\s+/g, '_'),
          auto_disposition: params.dispositionName,
          notes: params.notes,
          updated_at: new Date().toISOString()
        })
        .eq('id', params.callLogId);

      // Update lead status based on sentiment
      let leadStatus = 'contacted';
      if (rule?.sentiment === 'positive') leadStatus = 'qualified';
      else if (rule?.sentiment === 'negative') leadStatus = 'lost';

      await supabase
        .from('leads')
        .update({
          status: leadStatus,
          last_contacted_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', params.leadId);

      // Move to pipeline stage if rule specifies
      if (rule?.auto_create_pipeline_stage && rule.pipeline_stage_name) {
        // Find or create pipeline board
        let { data: pipelineBoard } = await supabase
          .from('pipeline_boards')
          .select('id')
          .eq('user_id', user.id)
          .eq('name', rule.pipeline_stage_name)
          .single();

        if (!pipelineBoard) {
          // Create pipeline board
          const { data: newBoard } = await supabase
            .from('pipeline_boards')
            .insert({
              user_id: user.id,
              name: rule.pipeline_stage_name,
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
          // Move lead to pipeline stage
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

      // Schedule follow-up if rule specifies
      if (rule?.follow_up_action === 'callback' && rule.follow_up_delay_minutes) {
        const scheduledAt = new Date();
        scheduledAt.setMinutes(scheduledAt.getMinutes() + rule.follow_up_delay_minutes);

        await supabase
          .from('scheduled_follow_ups')
          .insert({
            user_id: user.id,
            lead_id: params.leadId,
            scheduled_at: scheduledAt.toISOString(),
            action_type: 'callback',
            status: 'pending'
          });

        // Also update lead's next_callback_at
        await supabase
          .from('leads')
          .update({ next_callback_at: scheduledAt.toISOString() })
          .eq('id', params.leadId);
      }

      // Start sequence if rule specifies
      if (rule?.follow_up_action === 'sequence' && rule.sequence_id) {
        await startSequence(params.leadId, rule.sequence_id);
      }

      toast({
        title: "Disposition Applied",
        description: `${params.dispositionName} applied with automation rules`,
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

  // Start a follow-up sequence
  const startSequence = useCallback(async (leadId: string, sequenceId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get sequence steps
      const { data: steps } = await supabase
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', sequenceId)
        .order('step_number');

      if (!steps || steps.length === 0) return;

      // Schedule each step
      let cumulativeDelay = 0;
      for (const step of steps) {
        cumulativeDelay += step.delay_minutes;
        const scheduledAt = new Date();
        scheduledAt.setMinutes(scheduledAt.getMinutes() + cumulativeDelay);

        await supabase
          .from('scheduled_follow_ups')
          .insert({
            user_id: user.id,
            lead_id: leadId,
            scheduled_at: scheduledAt.toISOString(),
            action_type: 'sequence_step',
            sequence_step_id: step.id,
            status: 'pending'
          });
      }

      return true;
    } catch (error) {
      console.error('Error starting sequence:', error);
      return false;
    }
  }, []);

  // Create a new follow-up sequence
  const createSequence = useCallback(async (params: {
    name: string;
    description: string;
    pipelineStageId?: string;
    steps: Omit<SequenceStep, 'id' | 'sequence_id' | 'completed'>[];
  }) => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Create sequence
      const { data: sequence, error: seqError } = await supabase
        .from('follow_up_sequences')
        .insert({
          user_id: user.id,
          name: params.name,
          description: params.description,
          pipeline_stage_id: params.pipelineStageId,
          active: true
        })
        .select()
        .single();

      if (seqError) throw seqError;

      // Create steps
      const steps = params.steps.map((step, index) => ({
        user_id: user.id,
        sequence_id: sequence.id,
        step_number: index + 1,
        action_type: step.action_type,
        delay_minutes: step.delay_minutes,
        content: step.content,
        ai_prompt: step.ai_prompt,
        completed: false
      }));

      const { error: stepsError } = await supabase
        .from('sequence_steps')
        .insert(steps);

      if (stepsError) throw stepsError;

      toast({
        title: "Sequence Created",
        description: `Created sequence "${params.name}" with ${steps.length} steps`,
      });

      return sequence;
    } catch (error) {
      console.error('Error creating sequence:', error);
      toast({
        title: "Sequence Error",
        description: "Failed to create sequence",
        variant: "destructive"
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Get pending follow-ups for execution
  const getPendingFollowUps = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const now = new Date().toISOString();

      const { data: followUps, error } = await supabase
        .from('scheduled_follow_ups')
        .select(`
          *,
          lead:leads(id, first_name, last_name, phone_number),
          sequence_step:sequence_steps(*)
        `)
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .lte('scheduled_at', now)
        .order('scheduled_at');

      if (error) throw error;
      return followUps || [];
    } catch (error) {
      console.error('Error fetching pending follow-ups:', error);
      return [];
    }
  }, []);

  // Execute a follow-up action
  const executeFollowUp = useCallback(async (followUpId: string) => {
    try {
      const { data: followUp } = await supabase
        .from('scheduled_follow_ups')
        .select(`
          *,
          lead:leads(*),
          sequence_step:sequence_steps(*)
        `)
        .eq('id', followUpId)
        .single();

      if (!followUp) return false;

      // Execute based on action type
      if (followUp.action_type === 'callback') {
        // Trigger callback (this would integrate with your calling system)
        // For now, we'll just update the status
        await supabase
          .from('scheduled_follow_ups')
          .update({ status: 'completed' })
          .eq('id', followUpId);

        toast({
          title: "Follow-up Triggered",
          description: `Callback scheduled for ${followUp.lead?.first_name} ${followUp.lead?.last_name}`,
        });
      } else if (followUp.action_type === 'sequence_step' && followUp.sequence_step) {
        const step = followUp.sequence_step;

        // Execute based on step type
        switch (step.action_type) {
          case 'ai_call':
            // Trigger AI call through your calling system
            // This would integrate with Retell AI or similar
            break;
          case 'ai_sms':
          case 'manual_sms':
            // Send SMS through your SMS system
            break;
          case 'email':
            // Send email
            break;
          case 'wait':
            // Just wait (no action)
            break;
        }

        await supabase
          .from('scheduled_follow_ups')
          .update({ status: 'completed' })
          .eq('id', followUpId);
      }

      return true;
    } catch (error) {
      console.error('Error executing follow-up:', error);
      return false;
    }
  }, [toast]);

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
