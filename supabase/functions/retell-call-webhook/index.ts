/**
 * Retell Call Webhook Handler
 * 
 * Receives call completion webhooks from Retell AI, processes transcripts,
 * triggers disposition analysis, and initiates follow-up workflows.
 * 
 * This is the critical "close the loop" function that connects:
 * Retell Call Complete → Transcript Analysis → Disposition → Workflow
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellWebhookPayload {
  event: string;
  call: {
    call_id: string;
    call_status: string;
    start_timestamp?: number;
    end_timestamp?: number;
    transcript?: string;
    transcript_object?: Array<{
      role: string;
      content: string;
      words?: Array<{ word: string; start: number; end: number }>;
    }>;
    call_analysis?: {
      call_summary?: string;
      user_sentiment?: string;
      call_successful?: boolean;
      custom_analysis_data?: Record<string, any>;
    };
    recording_url?: string;
    metadata?: {
      lead_id?: string;
      campaign_id?: string;
      user_id?: string;
      caller_id?: string;
    };
    from_number?: string;
    to_number?: string;
    direction?: string;
    disconnection_reason?: string;
    agent_id?: string;
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload: RetellWebhookPayload = await req.json();
    console.log('[Retell Webhook] Received event:', payload.event);
    console.log('[Retell Webhook] Call ID:', payload.call?.call_id);

    const { event, call } = payload;

    // Only process call_ended and call_analyzed events
    if (!['call_ended', 'call_analyzed'].includes(event)) {
      console.log('[Retell Webhook] Ignoring event type:', event);
      return new Response(JSON.stringify({ received: true, processed: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const metadata = call.metadata || {};
    const leadId = metadata.lead_id;
    const campaignId = metadata.campaign_id;
    let userId = metadata.user_id;

    // If user_id is missing from metadata, try to look it up from call_logs
    if (!userId) {
      console.log('[Retell Webhook] user_id missing from metadata, looking up from call_logs...');
      const { data: callLogLookup } = await supabase
        .from('call_logs')
        .select('user_id')
        .eq('retell_call_id', call.call_id)
        .maybeSingle();
      
      if (callLogLookup?.user_id) {
        userId = callLogLookup.user_id;
        console.log('[Retell Webhook] Found user_id from call_logs:', userId);
      } else {
        console.error('[Retell Webhook] Could not find user_id for call:', call.call_id);
        return new Response(JSON.stringify({ error: 'Could not determine user_id for call' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Calculate call duration
    const durationSeconds = call.start_timestamp && call.end_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : 0;

    // Format transcript for storage
    const formattedTranscript = formatTranscript(call.transcript_object || [], call.transcript);

    // Determine initial outcome from call status
    let outcome = mapCallStatusToOutcome(call.call_status, call.disconnection_reason, durationSeconds);

    // 1. Update or create call log
    console.log('[Retell Webhook] Updating call log...');
    const { data: callLog, error: callLogError } = await supabase
      .from('call_logs')
      .upsert({
        retell_call_id: call.call_id,
        user_id: userId,
        lead_id: leadId,
        campaign_id: campaignId,
        phone_number: call.to_number || '',
        caller_id: call.from_number || metadata.caller_id || '',
        status: call.call_status === 'ended' ? 'completed' : call.call_status,
        outcome: outcome,
        duration_seconds: durationSeconds,
        notes: formattedTranscript,
        answered_at: call.start_timestamp ? new Date(call.start_timestamp).toISOString() : null,
        ended_at: call.end_timestamp ? new Date(call.end_timestamp).toISOString() : null,
      }, {
        onConflict: 'retell_call_id',
      })
      .select()
      .maybeSingle();

    if (callLogError) {
      console.error('[Retell Webhook] Call log error:', callLogError);
    }

    // 2. If we have a transcript and it's a call_ended/call_analyzed event, analyze it
    let dispositionResult = null;
    if (formattedTranscript && formattedTranscript.length > 50) {
      console.log('[Retell Webhook] Triggering transcript analysis...');
      
      try {
        // Use Retell's built-in analysis if available
        if (call.call_analysis) {
          dispositionResult = mapRetellAnalysisToDisposition(call.call_analysis);
          console.log('[Retell Webhook] Using Retell analysis:', dispositionResult);
        } else {
          // Fall back to our AI analysis
          dispositionResult = await analyzeTranscriptWithAI(supabase, {
            transcript: formattedTranscript,
            callId: callLog?.id,
            userId,
          });
        }

        // Update call log with disposition
        if (dispositionResult && callLog?.id) {
          await supabase
            .from('call_logs')
            .update({ outcome: dispositionResult.disposition })
            .eq('id', callLog.id);
          
          outcome = dispositionResult.disposition;
        }
      } catch (analysisError) {
        console.error('[Retell Webhook] Analysis error:', analysisError);
      }
    }

    // 3. Update lead status based on disposition
    if (leadId) {
      console.log('[Retell Webhook] Updating lead status...');
      const leadUpdate: Record<string, any> = {
        last_contacted_at: new Date().toISOString(),
        status: mapDispositionToLeadStatus(outcome),
      };

      // If callback requested, set next callback
      if (outcome === 'callback_requested' || outcome === 'callback') {
        leadUpdate.next_callback_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // If DNC, mark as do not call
      if (outcome === 'dnc' || outcome === 'do_not_call') {
        leadUpdate.do_not_call = true;
      }

      await supabase
        .from('leads')
        .update(leadUpdate)
        .eq('id', leadId);

      // 4. Trigger disposition router for automated actions
      console.log('[Retell Webhook] Triggering disposition router...');
      try {
        const dispositionResponse = await supabase.functions.invoke('disposition-router', {
          body: {
            action: 'process_disposition',
            leadId,
            userId,
            dispositionName: outcome,
            callOutcome: outcome,
            transcript: formattedTranscript,
          },
        });
        console.log('[Retell Webhook] Disposition router response:', dispositionResponse.data);
      } catch (routerError) {
        console.error('[Retell Webhook] Disposition router error:', routerError);
      }

      // 5. Update nudge tracking
      await updateNudgeTracking(supabase, leadId, userId, outcome);

      // 6. Update pipeline position
      await updatePipelinePosition(supabase, leadId, userId, outcome);

      // 7. CRITICAL: Advance workflow to next step after call ends
      await advanceWorkflowAfterCall(supabase, leadId, userId, outcome);
    }

    // 7. Update phone number usage stats
    if (call.from_number) {
    // First get current daily_calls count
    const { data: phoneData } = await supabase
      .from('phone_numbers')
      .select('daily_calls')
      .eq('number', call.from_number)
      .maybeSingle();

      await supabase
        .from('phone_numbers')
        .update({
          last_used: new Date().toISOString(),
          daily_calls: (phoneData?.daily_calls || 0) + 1,
        })
        .eq('number', call.from_number);
    }

    console.log('[Retell Webhook] Processing complete for call:', call.call_id);

    return new Response(JSON.stringify({
      received: true,
      processed: true,
      callId: call.call_id,
      disposition: outcome,
      leadId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Webhook] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper Functions

function formatTranscript(
  transcriptObject: Array<{ role: string; content: string }>,
  rawTranscript?: string
): string {
  if (transcriptObject && transcriptObject.length > 0) {
    return transcriptObject
      .map(entry => `${entry.role === 'agent' ? 'AI' : 'Lead'}: ${entry.content}`)
      .join('\n');
  }
  return rawTranscript || '';
}

function mapCallStatusToOutcome(
  status: string,
  disconnectionReason?: string,
  durationSeconds?: number
): string {
  // Very short calls are likely no answers or machine
  if (durationSeconds && durationSeconds < 10) {
    return 'no_answer';
  }

  switch (status) {
    case 'ended':
      if (disconnectionReason === 'machine_detected') return 'voicemail';
      if (disconnectionReason === 'dial_no_answer') return 'no_answer';
      if (disconnectionReason === 'dial_busy') return 'busy';
      if (disconnectionReason === 'dial_failed') return 'failed';
      return 'completed';
    case 'error':
      return 'failed';
    default:
      return 'unknown';
  }
}

function mapRetellAnalysisToDisposition(analysis: {
  call_summary?: string;
  user_sentiment?: string;
  call_successful?: boolean;
  custom_analysis_data?: Record<string, any>;
}): { disposition: string; confidence: number; summary: string } {
  const sentiment = analysis.user_sentiment?.toLowerCase() || 'neutral';
  const successful = analysis.call_successful;
  const customData = analysis.custom_analysis_data || {};

  // Check for specific disposition markers in custom data
  if (customData.disposition) {
    return {
      disposition: customData.disposition,
      confidence: 0.9,
      summary: analysis.call_summary || '',
    };
  }

  // Map sentiment and success to disposition
  if (sentiment === 'negative' || customData.not_interested) {
    return { disposition: 'not_interested', confidence: 0.8, summary: analysis.call_summary || '' };
  }
  
  if (customData.appointment_set || customData.booked) {
    return { disposition: 'appointment_set', confidence: 0.95, summary: analysis.call_summary || '' };
  }
  
  if (customData.callback_requested || customData.call_back) {
    return { disposition: 'callback_requested', confidence: 0.85, summary: analysis.call_summary || '' };
  }
  
  if (customData.dnc || customData.do_not_call) {
    return { disposition: 'dnc', confidence: 0.95, summary: analysis.call_summary || '' };
  }

  if (successful && sentiment === 'positive') {
    return { disposition: 'interested', confidence: 0.7, summary: analysis.call_summary || '' };
  }

  return { disposition: 'contacted', confidence: 0.5, summary: analysis.call_summary || '' };
}

async function analyzeTranscriptWithAI(
  supabase: any,
  params: { transcript: string; callId?: string; userId: string }
): Promise<{ disposition: string; confidence: number; summary: string } | null> {
  try {
    const response = await supabase.functions.invoke('analyze-call-transcript', {
      body: {
        callId: params.callId,
        transcript: params.transcript,
        userId: params.userId,
      },
    });
    
    if (response.data?.analysis) {
      return {
        disposition: response.data.analysis.disposition || 'contacted',
        confidence: response.data.analysis.confidence || 0.5,
        summary: response.data.analysis.summary || '',
      };
    }
    return null;
  } catch (error) {
    console.error('[Retell Webhook] AI analysis failed:', error);
    return null;
  }
}

function mapDispositionToLeadStatus(disposition: string): string {
  const statusMap: Record<string, string> = {
    'appointment_set': 'qualified',
    'interested': 'contacted',
    'callback_requested': 'callback',
    'callback': 'callback',
    'not_interested': 'not_interested',
    'dnc': 'dnc',
    'do_not_call': 'dnc',
    'voicemail': 'contacted',
    'no_answer': 'contacted',
    'busy': 'new',
    'failed': 'new',
    'completed': 'contacted',
  };
  return statusMap[disposition] || 'contacted';
}

async function updateNudgeTracking(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  try {
    // Check if nudge tracking exists
    const { data: existing } = await supabase
      .from('lead_nudge_tracking')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    const isEngaged = ['interested', 'appointment_set', 'callback_requested'].includes(outcome);
    const shouldPause = ['appointment_set', 'dnc', 'not_interested'].includes(outcome);

    if (existing) {
      await supabase
        .from('lead_nudge_tracking')
        .update({
          last_ai_contact_at: new Date().toISOString(),
          is_engaged: isEngaged,
          sequence_paused: shouldPause,
          pause_reason: shouldPause ? `Disposition: ${outcome}` : null,
          updated_at: new Date().toISOString(),
        })
        .eq('lead_id', leadId);
    } else {
      await supabase
        .from('lead_nudge_tracking')
        .insert({
          lead_id: leadId,
          user_id: userId,
          last_ai_contact_at: new Date().toISOString(),
          is_engaged: isEngaged,
          sequence_paused: shouldPause,
          pause_reason: shouldPause ? `Disposition: ${outcome}` : null,
        });
    }
  } catch (error) {
    console.error('[Retell Webhook] Nudge tracking error:', error);
  }
}

async function updatePipelinePosition(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  try {
    // Find the appropriate pipeline stage for this disposition
    const { data: stages } = await supabase
      .from('pipeline_boards')
      .select('id, name')
      .eq('user_id', userId);

    if (!stages || stages.length === 0) return;

    // Map disposition to stage name
    const stageMapping: Record<string, string[]> = {
      'appointment_set': ['Qualified', 'Appointments', 'Booked'],
      'interested': ['Interested', 'Hot Leads', 'Warm'],
      'callback_requested': ['Callback', 'Follow Up', 'Pending'],
      'not_interested': ['Not Interested', 'Lost', 'Closed Lost'],
      'dnc': ['DNC', 'Do Not Call', 'Removed'],
      'contacted': ['Contacted', 'In Progress', 'Working'],
    };

    const possibleStageNames = stageMapping[outcome] || ['Contacted', 'New'];
    const matchedStage = stages.find((s: any) => 
      possibleStageNames.some(name => 
        s.name.toLowerCase().includes(name.toLowerCase())
      )
    );

    if (matchedStage) {
      // Update or create pipeline position - first check if exists
      const { data: existingPosition } = await supabase
        .from('lead_pipeline_positions')
        .select('id')
        .eq('lead_id', leadId)
        .eq('user_id', userId)
        .eq('pipeline_board_id', matchedStage.id)
        .maybeSingle();

      if (existingPosition) {
        await supabase
          .from('lead_pipeline_positions')
          .update({
            moved_at: new Date().toISOString(),
            moved_by_user: false,
            notes: `Auto-moved from call disposition: ${outcome}`,
          })
          .eq('id', existingPosition.id);
      } else {
        await supabase
          .from('lead_pipeline_positions')
          .insert({
            lead_id: leadId,
            user_id: userId,
            pipeline_board_id: matchedStage.id,
            position: 0,
            moved_at: new Date().toISOString(),
            moved_by_user: false,
            notes: `Auto-moved from call disposition: ${outcome}`,
          });
      }
    }
  } catch (error) {
    console.error('[Retell Webhook] Pipeline update error:', error);
  }
}

// NEW: Advance workflow to next step after a call completes
async function advanceWorkflowAfterCall(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  try {
    console.log(`[Retell Webhook] Advancing workflow for lead ${leadId} after call with outcome: ${outcome}`);

    // Find active workflow progress for this lead
    const { data: activeProgress } = await supabase
      .from('lead_workflow_progress')
      .select(`
        id,
        workflow_id,
        current_step_id,
        status,
        workflow_steps!lead_workflow_progress_current_step_id_fkey(id, step_type, step_number)
      `)
      .eq('lead_id', leadId)
      .eq('status', 'active')
      .maybeSingle();

    if (!activeProgress) {
      console.log('[Retell Webhook] No active workflow found for lead');
      return;
    }

    const currentStep = activeProgress.workflow_steps;
    
    // Only advance if current step is a call step
    if (currentStep?.step_type !== 'call') {
      console.log(`[Retell Webhook] Current step is not a call step (${currentStep?.step_type}), not advancing`);
      return;
    }

    // Get all steps in order
    const { data: allSteps } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('workflow_id', activeProgress.workflow_id)
      .order('step_number', { ascending: true });

    if (!allSteps || allSteps.length === 0) {
      console.log('[Retell Webhook] No workflow steps found');
      return;
    }

    const currentIndex = allSteps.findIndex((s: any) => s.id === currentStep?.id);
    const nextStep = allSteps[currentIndex + 1];

    if (nextStep) {
      // Calculate when the next action should occur
      const nextActionAt = calculateNextActionTimeForWebhook(nextStep);
      
      await supabase
        .from('lead_workflow_progress')
        .update({
          current_step_id: nextStep.id,
          next_action_at: nextActionAt,
          last_action_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeProgress.id);

      console.log(`[Retell Webhook] Advanced to step ${nextStep.step_number} (${nextStep.step_type}), next action at: ${nextActionAt}`);
    } else {
      // No more steps, mark workflow as completed
      await supabase
        .from('lead_workflow_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeProgress.id);

      console.log('[Retell Webhook] Workflow completed - no more steps');
    }
  } catch (error) {
    console.error('[Retell Webhook] Error advancing workflow:', error);
  }
}

function calculateNextActionTimeForWebhook(step: any): string {
  const config = step.step_config || {};
  const now = new Date();

  if (step.step_type === 'wait') {
    const delayMs =
      (config.delay_minutes || 0) * 60 * 1000 +
      (config.delay_hours || 0) * 60 * 60 * 1000 +
      (config.delay_days || 0) * 24 * 60 * 60 * 1000;

    let nextTime = new Date(now.getTime() + delayMs);

    if (config.time_of_day) {
      const [hours, minutes] = String(config.time_of_day).split(':').map(Number);
      if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
        nextTime.setHours(hours, minutes, 0, 0);
        if (nextTime <= now) {
          nextTime.setDate(nextTime.getDate() + 1);
        }
      }
    }

    return nextTime.toISOString();
  }

  // For SMS/call/other steps, add a small delay (1 minute) to allow webhook processing to complete
  return new Date(now.getTime() + 60 * 1000).toISOString();
}
