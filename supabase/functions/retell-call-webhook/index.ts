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

// Normalize phone number for matching - returns multiple formats to try
function normalizePhoneFormats(phone: string): string[] {
  if (!phone) return [];
  const digitsOnly = phone.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);
  
  return [
    phone,                    // Original
    `+${digitsOnly}`,         // E.164 with +
    `+1${last10}`,            // US E.164
    digitsOnly,               // Just digits
    `1${last10}`,             // US without +
    last10,                   // Last 10 digits
  ].filter((v, i, a) => v && a.indexOf(v) === i); // unique non-empty
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

    // Handle call_started for inbound calls - inject dynamic variables
    if (event === 'call_started') {
      console.log('[Retell Webhook] Processing call_started for dynamic variable injection');
      console.log('[Retell Webhook] Call direction:', call.direction);
      console.log('[Retell Webhook] From:', call.from_number, 'To:', call.to_number);
      
      // For inbound calls, the caller is from_number
      const callerNumber = call.from_number;
      const receivingNumber = call.to_number;
      
      // Get multiple phone format variations for matching
      const callerFormats = normalizePhoneFormats(callerNumber || '');
      const receivingFormats = normalizePhoneFormats(receivingNumber || '');
      
      console.log('[Retell Webhook] Caller formats to match:', callerFormats);
      console.log('[Retell Webhook] Receiving formats to match:', receivingFormats);
      
      // Find the user who owns this receiving number
      let userId: string | null = null;
      
      if (receivingFormats.length > 0) {
        // Build OR query for phone number matching
        const phoneOrQuery = receivingFormats.map(f => `number.eq.${f}`).join(',');
        const { data: phoneNumber, error: phoneError } = await supabase
          .from('phone_numbers')
          .select('user_id')
          .or(phoneOrQuery)
          .limit(1)
          .maybeSingle();
        
        if (phoneError) {
          console.error('[Retell Webhook] Phone lookup error:', phoneError);
        }
        
        userId = phoneNumber?.user_id || null;
        console.log('[Retell Webhook] Phone owner user_id:', userId);
      }
      
      let lead: any = null;
      
      if (userId && callerFormats.length > 0) {
        // Look up lead by caller's phone number - handle duplicates by preferring leads with names
        // Try exact matches first, then partial
        const last10 = callerFormats.find(f => f.length === 10) || callerFormats[callerFormats.length - 1];
        
        const { data: leads, error: leadError } = await supabase
          .from('leads')
          .select('id, first_name, last_name, email, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, phone_number')
          .eq('user_id', userId)
          .or(`phone_number.ilike.%${last10}`)
          .order('updated_at', { ascending: false })
          .limit(10);
        
        if (leadError) {
          console.error('[Retell Webhook] Lead lookup error:', leadError);
        } else if (leads && leads.length > 0) {
          // Prefer leads with first_name populated
          lead = leads.find(l => l.first_name && l.first_name.trim() !== '') || leads[0];
          console.log('[Retell Webhook] Found', leads.length, 'matching leads, selected:', lead.first_name, lead.last_name, '(id:', lead.id, ')');
        } else {
          console.log('[Retell Webhook] No lead found for caller formats:', callerFormats);
        }
      }
      
      // Always create a call log entry at call_started so we have user_id for later events
      const callLogEntry: any = {
        retell_call_id: call.call_id,
        user_id: userId,
        phone_number: callerNumber || '',
        caller_id: receivingNumber || '',
        status: 'in-progress',
        notes: 'Inbound call started',
      };
      
      if (lead) {
        callLogEntry.lead_id = lead.id;
      }
      
      const { error: callLogInsertError } = await supabase
        .from('call_logs')
        .upsert(callLogEntry, { onConflict: 'retell_call_id' });
      
      if (callLogInsertError) {
        console.error('[Retell Webhook] Failed to insert call log:', callLogInsertError);
      } else {
        console.log('[Retell Webhook] Created/updated call_log for call_started');
      }
      
      // If we found a lead, inject dynamic variables
      if (lead) {
        console.log('[Retell Webhook] Found lead for inbound caller:', lead.first_name, lead.last_name);
        
        // Prepare dynamic variables
        const dynamicVariables: Record<string, string> = {
          first_name: lead.first_name || '',
          last_name: lead.last_name || '',
          full_name: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '',
          email: lead.email || '',
          company: lead.company || '',
          lead_source: lead.lead_source || '',
          notes: lead.notes || '',
          tags: Array.isArray(lead.tags) ? lead.tags.join(', ') : '',
          preferred_contact_time: lead.preferred_contact_time || '',
          timezone: lead.timezone || 'America/New_York',
        };
        
        // Add custom fields (including address fields if they exist)
        if (lead.custom_fields && typeof lead.custom_fields === 'object') {
          for (const [key, value] of Object.entries(lead.custom_fields)) {
            dynamicVariables[key] = String(value || '');
            // Also add contact.* aliases for compatibility
            dynamicVariables[`contact.${key}`] = String(value || '');
          }
        }
        
        // Add contact.* aliases for standard fields
        dynamicVariables['contact.first_name'] = dynamicVariables.first_name;
        dynamicVariables['contact.last_name'] = dynamicVariables.last_name;
        dynamicVariables['contact.email'] = dynamicVariables.email;
        dynamicVariables['contact.company'] = dynamicVariables.company;
        
        console.log('[Retell Webhook] Injecting dynamic variables:', Object.keys(dynamicVariables));
        
        // Update the call with dynamic variables via Retell API
        const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
        if (retellApiKey) {
          try {
            const updateResponse = await fetch(`https://api.retellai.com/v2/update-call/${call.call_id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${retellApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                retell_llm_dynamic_variables: dynamicVariables,
                metadata: {
                  lead_id: lead.id,
                  user_id: userId,
                },
              }),
            });
            
            if (updateResponse.ok) {
              console.log('[Retell Webhook] Successfully injected dynamic variables for inbound call');
            } else {
              const errorText = await updateResponse.text();
              console.error('[Retell Webhook] Failed to update call:', updateResponse.status, errorText);
            }
          } catch (apiError) {
            console.error('[Retell Webhook] Error calling Retell update API:', apiError);
          }
        } else {
          console.warn('[Retell Webhook] RETELL_AI_API_KEY not configured');
        }
      } else {
        console.log('[Retell Webhook] No lead found for caller:', callerNumber);
      }
      
      return new Response(JSON.stringify({ 
        received: true, 
        processed: true, 
        event: 'call_started',
        lead_found: !!lead,
        user_id: userId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only process call_ended and call_analyzed events for the rest
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
        .select('user_id, lead_id')
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
        } else if (userId) {
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

      // 5. Update nudge tracking (only if userId is available)
      if (userId) {
        await updateNudgeTracking(supabase, leadId, userId, outcome);

        // 6. Update pipeline position
        await updatePipelinePosition(supabase, leadId, userId, outcome);

        // 7. CRITICAL: Advance workflow to next step after call ends
        await advanceWorkflowAfterCall(supabase, leadId, userId, outcome);
      }
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
  const mapping: Record<string, string> = {
    'appointment_set': 'appointment_set',
    'interested': 'interested',
    'callback_requested': 'callback',
    'callback': 'callback',
    'not_interested': 'not_interested',
    'dnc': 'dnc',
    'do_not_call': 'dnc',
    'voicemail': 'voicemail',
    'no_answer': 'no_answer',
    'busy': 'no_answer',
    'failed': 'failed',
    'completed': 'contacted',
    'contacted': 'contacted',
  };
  
  return mapping[disposition] || 'contacted';
}

async function updateNudgeTracking(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  try {
    // Check if tracking exists
    const { data: existing } = await supabase
      .from('lead_nudge_tracking')
      .select('id, nudge_count')
      .eq('lead_id', leadId)
      .maybeSingle();

    const positiveOutcomes = ['appointment_set', 'interested', 'callback_requested', 'callback'];
    const isEngaged = positiveOutcomes.includes(outcome);

    if (existing) {
      await supabase
        .from('lead_nudge_tracking')
        .update({
          last_ai_contact_at: new Date().toISOString(),
          is_engaged: isEngaged,
          sequence_paused: isEngaged || outcome === 'dnc' || outcome === 'not_interested',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('lead_nudge_tracking')
        .insert({
          lead_id: leadId,
          user_id: userId,
          last_ai_contact_at: new Date().toISOString(),
          is_engaged: isEngaged,
          nudge_count: 0,
        });
    }
  } catch (error) {
    console.error('[Retell Webhook] Nudge tracking update error:', error);
  }
}

async function updatePipelinePosition(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  try {
    // Map outcome to pipeline stage
    const stageMapping: Record<string, string> = {
      'appointment_set': 'Appointment Set',
      'interested': 'Interested',
      'callback_requested': 'Callback Scheduled',
      'callback': 'Callback Scheduled',
      'not_interested': 'Not Interested',
      'dnc': 'DNC',
      'contacted': 'Contacted',
    };

    const stageName = stageMapping[outcome];
    if (!stageName) return;

    // Find the pipeline board for this stage
    const { data: board } = await supabase
      .from('pipeline_boards')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', `%${stageName}%`)
      .maybeSingle();

    if (board) {
      // Update or create pipeline position
      await supabase
        .from('lead_pipeline_positions')
        .upsert({
          lead_id: leadId,
          user_id: userId,
          pipeline_board_id: board.id,
          moved_at: new Date().toISOString(),
          moved_by_user: false,
          notes: `Auto-moved after call: ${outcome}`,
        }, {
          onConflict: 'lead_id,pipeline_board_id',
        });
    }
  } catch (error) {
    console.error('[Retell Webhook] Pipeline position update error:', error);
  }
}

async function advanceWorkflowAfterCall(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string
) {
  try {
    // Find active workflow progress for this lead
    const { data: progress } = await supabase
      .from('lead_workflow_progress')
      .select('*, current_step:workflow_steps(*)')
      .eq('lead_id', leadId)
      .eq('status', 'active')
      .maybeSingle();

    if (!progress || !progress.current_step) {
      return;
    }

    // Get the next step in the workflow
    const { data: nextStep } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('workflow_id', progress.workflow_id)
      .gt('step_order', progress.current_step.step_order)
      .order('step_order', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextStep) {
      // Advance to next step
      const nextActionAt = calculateNextActionTimeForWebhook(nextStep);
      
      await supabase
        .from('lead_workflow_progress')
        .update({
          current_step_id: nextStep.id,
          last_action_at: new Date().toISOString(),
          next_action_at: nextActionAt,
          updated_at: new Date().toISOString(),
        })
        .eq('id', progress.id);

      console.log('[Retell Webhook] Advanced workflow to step:', nextStep.step_order);
    } else {
      // No more steps - complete the workflow
      await supabase
        .from('lead_workflow_progress')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', progress.id);

      console.log('[Retell Webhook] Workflow completed');
    }
  } catch (error) {
    console.error('[Retell Webhook] Workflow advancement error:', error);
  }
}

function calculateNextActionTimeForWebhook(step: any): string {
  const now = new Date();
  const config = step.config || {};
  
  // Default delays based on step type
  const defaultDelays: Record<string, number> = {
    'call': 60,          // 1 hour
    'sms': 30,           // 30 minutes
    'email': 60,         // 1 hour
    'wait': 1440,        // 24 hours
  };

  const delayMinutes = config.delay_minutes || defaultDelays[step.step_type] || 60;
  now.setMinutes(now.getMinutes() + delayMinutes);
  
  return now.toISOString();
}
