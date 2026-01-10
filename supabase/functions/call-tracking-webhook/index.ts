import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Schema validation for Retell webhook payload
interface RetellCallData {
  call_id: string;
  call_status: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  duration_ms?: number;
  transcript?: string;
  transcript_object?: Array<{
    role: string;
    content: string;
  }>;
  call_analysis?: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, unknown>;
  };
  disconnection_reason?: string;
  agent_id?: string;
}

interface RetellCallEvent {
  event?: string;
  call?: RetellCallData;
  // Legacy format support
  phone_number?: string;
  call_type?: 'inbound' | 'outbound';
  duration?: number;
  status?: string;
  caller_id?: string;
  recipient?: string;
  call_sid?: string;
  transcript?: string;
}

// Validation function for webhook payload
function validateWebhookPayload(payload: unknown): { valid: boolean; error?: string; data?: RetellCallEvent } {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  const data = payload as Record<string, unknown>;

  // Check for Retell format
  if (data.event && data.call) {
    const event = data.event;
    const call = data.call as Record<string, unknown>;

    // Validate event type
    if (typeof event !== 'string') {
      return { valid: false, error: 'Invalid event type' };
    }

    const validEvents = ['call_started', 'call_ended', 'call_analyzed'];
    if (!validEvents.includes(event)) {
      console.warn(`Unknown event type: ${event}, but proceeding`);
    }

    // Validate call_id
    if (!call.call_id || typeof call.call_id !== 'string') {
      return { valid: false, error: 'Missing or invalid call_id' };
    }

    // Validate call_id format (Retell call IDs are typically UUIDs or similar)
    if (call.call_id.length < 10 || call.call_id.length > 100) {
      return { valid: false, error: 'Invalid call_id length' };
    }

    // Validate phone numbers if present
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (call.from_number && typeof call.from_number === 'string') {
      if (!phoneRegex.test(call.from_number.replace(/[\s()-]/g, ''))) {
        console.warn('Unusual from_number format:', call.from_number);
      }
    }
    if (call.to_number && typeof call.to_number === 'string') {
      if (!phoneRegex.test(call.to_number.replace(/[\s()-]/g, ''))) {
        console.warn('Unusual to_number format:', call.to_number);
      }
    }

    // Validate duration if present
    if (call.duration_ms !== undefined && (typeof call.duration_ms !== 'number' || call.duration_ms < 0)) {
      return { valid: false, error: 'Invalid duration_ms value' };
    }

    // Validate transcript length
    if (call.transcript && typeof call.transcript === 'string' && call.transcript.length > 100000) {
      return { valid: false, error: 'Transcript too large' };
    }

    return { valid: true, data: data as RetellCallEvent };
  }

  // Check for legacy format
  if (data.phone_number || data.caller_id || data.call_sid) {
    // Validate phone numbers
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    
    if (data.phone_number && typeof data.phone_number === 'string') {
      if (!phoneRegex.test(data.phone_number.replace(/[\s()-]/g, ''))) {
        console.warn('Unusual phone_number format:', data.phone_number);
      }
    }

    // Validate duration
    if (data.duration !== undefined && (typeof data.duration !== 'number' || data.duration < 0)) {
      return { valid: false, error: 'Invalid duration value' };
    }

    return { valid: true, data: data as RetellCallEvent };
  }

  return { valid: false, error: 'Unrecognized webhook format' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check content type to determine how to parse the payload
    const contentType = req.headers.get('content-type') || '';
    
    // Handle Twilio webhooks (form-urlencoded)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      console.log('Received Twilio webhook (form-urlencoded)');
      const formData = await req.formData();
      const twilioPayload: Record<string, string> = {};
      formData.forEach((value, key) => {
        twilioPayload[key] = value.toString();
      });
      
      console.log('Twilio webhook payload:', JSON.stringify(twilioPayload));
      return await handleTwilioWebhook(supabase, twilioPayload);
    }

    // Handle JSON payloads (Retell and others)
    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch (parseError) {
      console.error('Failed to parse JSON payload:', parseError);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON payload',
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate the webhook payload
    const validation = validateWebhookPayload(rawPayload);
    if (!validation.valid) {
      console.error('Webhook validation failed:', validation.error);
      return new Response(JSON.stringify({ 
        error: validation.error,
        timestamp: new Date().toISOString()
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const payload = validation.data!;
    console.log('Received validated webhook payload:', JSON.stringify({
      event: payload.event,
      call_id: payload.call?.call_id,
      call_status: payload.call?.call_status,
    }));

    // Handle Retell webhook format
    if (payload.event && payload.call) {
      return await handleRetellWebhook(supabase, payload);
    }

    // Handle legacy/generic format
    return await handleLegacyWebhook(supabase, payload);

  } catch (error: unknown) {
    console.error('Call tracking webhook error:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Handle Twilio status callback webhooks - BULLETPROOF matching via call_sid
async function handleTwilioWebhook(supabase: any, payload: Record<string, string>) {
  const callSid = payload.CallSid;
  const callStatus = payload.CallStatus;
  const from = payload.From;
  const to = payload.To;
  const duration = payload.CallDuration ? parseInt(payload.CallDuration) : 0;
  const recordingUrl = payload.RecordingUrl || null;
  
  console.log(`[Twilio Webhook] CallSid=${callSid}, Status=${callStatus}, From=${from}, To=${to}, Duration=${duration}`);

  // Map Twilio status to our internal status
  const statusMapping: Record<string, string> = {
    'queued': 'queued',
    'ringing': 'ringing',
    'in-progress': 'in-progress',
    'completed': 'completed',
    'busy': 'busy',
    'failed': 'failed',
    'no-answer': 'no_answer',
    'canceled': 'canceled',
  };

  const mappedStatus = statusMapping[callStatus] || callStatus;

  // BULLETPROOF MATCHING: First try to find by call_sid (most reliable)
  let queueItem: any = null;
  let queueError: any = null;
  
  if (callSid) {
    const result = await supabase
      .from('broadcast_queue')
      .select('*, voice_broadcasts(*)')
      .eq('call_sid', callSid)
      .maybeSingle();
    
    queueItem = result.data;
    queueError = result.error;
    
    if (queueItem) {
      console.log(`[Twilio Webhook] Found queue item by call_sid: ${queueItem.id}`);
    }
  }
  
  // FALLBACK: If no call_sid match, try phone number matching (handles SIP and E.164 formats)
  if (!queueItem && to) {
    // Normalize the To field - handles sip:number@domain.com AND +1XXXXXXXXXX formats
    let cleanTo = to;
    
    // Handle SIP URI format: sip:18324936169@example.com -> 18324936169
    if (to.toLowerCase().startsWith('sip:')) {
      cleanTo = to.replace(/^sip:/i, '').split('@')[0];
    }
    
    // Remove all non-digit characters except leading +
    cleanTo = cleanTo.replace(/[^\d+]/g, '');
    
    // Normalize to E.164 format
    if (!cleanTo.startsWith('+')) {
      cleanTo = cleanTo.length === 10 ? `+1${cleanTo}` : `+${cleanTo}`;
    }
    
    console.log(`[Twilio Webhook] Normalized phone: ${to} -> ${cleanTo}`);
    
    // Try multiple phone formats for maximum matching
    const phoneVariants = [
      cleanTo,                                    // +18324936169
      cleanTo.replace('+', ''),                   // 18324936169
      cleanTo.replace(/^\+1/, ''),               // 8324936169 (no country code)
    ];
    
    // Find queue item that's currently "calling" for this phone number
    const result = await supabase
      .from('broadcast_queue')
      .select('*, voice_broadcasts(*)')
      .in('status', ['calling', 'in_progress'])
      .or(phoneVariants.map(p => `phone_number.eq.${p}`).join(','))
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    queueItem = result.data;
    queueError = result.error;
    
    if (queueItem) {
      console.log(`[Twilio Webhook] Found queue item by phone fallback: ${queueItem.id}`);
      
      // Store the call_sid for future webhooks (bulletproof for subsequent events)
      if (callSid && !queueItem.call_sid) {
        await supabase
          .from('broadcast_queue')
          .update({ call_sid: callSid })
          .eq('id', queueItem.id);
        console.log(`[Twilio Webhook] Stored call_sid ${callSid} on queue item ${queueItem.id}`);
      }
    }
  }

  if (queueError) {
    console.error('[Twilio Webhook] Error finding queue item:', queueError);
  }

  if (queueItem) {
    console.log(`[Twilio Webhook] Processing queue item: ${queueItem.id} for broadcast ${queueItem.broadcast_id}`);
    
    // Determine final status based on call outcome
    let finalStatus = queueItem.status;
    let updateBroadcastStats = false;
    let shouldUpdateLead = false;
    let shouldUpdatePipeline = false;
    
    if (callStatus === 'completed') {
      finalStatus = duration > 0 ? 'answered' : 'completed';
      updateBroadcastStats = true;
      shouldUpdateLead = true;
      shouldUpdatePipeline = duration > 0; // Move pipeline only if actually answered
    } else if (callStatus === 'no-answer') {
      finalStatus = 'no_answer';
      updateBroadcastStats = true;
      shouldUpdateLead = true;
    } else if (callStatus === 'busy') {
      finalStatus = 'busy';
      updateBroadcastStats = true;
      shouldUpdateLead = true;
    } else if (callStatus === 'failed' || callStatus === 'canceled') {
      finalStatus = 'failed';
      updateBroadcastStats = true;
    } else if (callStatus === 'in-progress') {
      finalStatus = 'in_progress';
    } else if (callStatus === 'ringing') {
      finalStatus = 'calling';
    }

    // Update queue item with status, duration, recording
    const queueUpdate: Record<string, any> = {
      status: finalStatus,
      updated_at: new Date().toISOString(),
    };
    
    if (duration > 0) {
      queueUpdate.call_duration_seconds = duration;
    }
    
    if (recordingUrl) {
      queueUpdate.recording_url = recordingUrl;
    }
    
    const { error: updateError } = await supabase
      .from('broadcast_queue')
      .update(queueUpdate)
      .eq('id', queueItem.id);

    if (updateError) {
      console.error('[Twilio Webhook] Error updating queue item:', updateError);
    } else {
      console.log(`[Twilio Webhook] Updated queue item ${queueItem.id} to status: ${finalStatus}`);
    }

    // Update broadcast stats if call ended
    if (updateBroadcastStats && queueItem.voice_broadcasts) {
      const broadcast = queueItem.voice_broadcasts;
      const statsUpdate: Record<string, number> = {};
      
      if (finalStatus === 'answered') {
        statsUpdate.calls_answered = (broadcast.calls_answered || 0) + 1;
      }
      
      if (Object.keys(statsUpdate).length > 0) {
        await supabase
          .from('voice_broadcasts')
          .update(statsUpdate)
          .eq('id', queueItem.broadcast_id);
        console.log(`[Twilio Webhook] Updated broadcast stats:`, statsUpdate);
      }
    }

    // Update lead status and clear callback if answered
    if (shouldUpdateLead && queueItem.lead_id) {
      const leadUpdate: Record<string, any> = {
        last_contacted_at: new Date().toISOString(),
      };
      
      if (finalStatus === 'answered') {
        leadUpdate.status = 'contacted';
        leadUpdate.next_callback_at = null; // Clear callback - call was made!
      } else if (finalStatus === 'no_answer') {
        // Don't change status, leave for retry
      } else {
        leadUpdate.status = 'contacted';
      }
      
      const { error: leadError } = await supabase
        .from('leads')
        .update(leadUpdate)
        .eq('id', queueItem.lead_id);
      
      if (leadError) {
        console.error('[Twilio Webhook] Error updating lead:', leadError);
      } else {
        console.log(`[Twilio Webhook] Updated lead ${queueItem.lead_id}:`, leadUpdate);
      }
    }

    // Move lead out of "Callback Scheduled" pipeline stage if call was answered
    if (shouldUpdatePipeline && queueItem.lead_id) {
      try {
        // Get the broadcast owner's user_id
        const userId = queueItem.voice_broadcasts?.user_id;
        
        if (userId) {
          // Find "Contacted" pipeline board for this user
          const { data: contactedBoard } = await supabase
            .from('pipeline_boards')
            .select('id')
            .eq('user_id', userId)
            .eq('name', 'Contacted')
            .maybeSingle();
          
          if (contactedBoard) {
            // Move lead to Contacted stage
            const { error: pipelineError } = await supabase
              .from('lead_pipeline_positions')
              .upsert({
                user_id: userId,
                lead_id: queueItem.lead_id,
                pipeline_board_id: contactedBoard.id,
                position: 0,
                moved_at: new Date().toISOString(),
                moved_by_user: false,
                notes: `Auto-moved: Voice broadcast call answered (${duration}s)`
              }, { onConflict: 'lead_id,user_id' });
            
            if (pipelineError) {
              console.error('[Twilio Webhook] Error updating pipeline:', pipelineError);
            } else {
              console.log(`[Twilio Webhook] Moved lead ${queueItem.lead_id} to Contacted pipeline`);
            }
          }
        }
      } catch (pipelineErr) {
        console.error('[Twilio Webhook] Pipeline update error:', pipelineErr);
      }
    }
  } else {
    console.log(`[Twilio Webhook] No matching queue item found for CallSid=${callSid}, To=${to}`);
  }

  // Return TwiML empty response for Twilio
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { ...corsHeaders, 'Content-Type': 'text/xml' }
  });
}

async function handleRetellWebhook(supabase: any, payload: RetellCallEvent) {
  const { event, call } = payload;
  
  console.log(`Processing Retell event: ${event} for call ${call?.call_id}`);

  if (!call) {
    return new Response(JSON.stringify({ error: 'No call data in payload' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Find the call log by retell_call_id
  const { data: existingCall, error: findError } = await supabase
    .from('call_logs')
    .select('*, leads(*)')
    .eq('retell_call_id', call.call_id)
    .maybeSingle();

  if (findError) {
    console.error('Error finding call log:', findError);
  }

  switch (event) {
    case 'call_started':
      return await handleCallStarted(supabase, call, existingCall);
    
    case 'call_ended':
      return await handleCallEnded(supabase, call, existingCall);
    
    case 'call_analyzed':
      return await handleCallAnalyzed(supabase, call, existingCall);
    
    default:
      console.log(`Unhandled event type: ${event}`);
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Event ${event} acknowledged` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
  }
}

async function handleCallStarted(supabase: any, call: any, existingCall: any) {
  console.log('Handling call_started event');
  
  // Prepare update data with agent info
  const updateData: Record<string, unknown> = {
    status: 'in-progress',
    answered_at: new Date().toISOString()
  };
  
  // Store agent_id from Retell payload
  if (call.agent_id) {
    updateData.agent_id = call.agent_id;
    console.log(`Storing agent_id: ${call.agent_id}`);
  }
  
  if (existingCall) {
    // Update existing call log
    const { error } = await supabase
      .from('call_logs')
      .update(updateData)
      .eq('id', existingCall.id);

    if (error) console.error('Error updating call status:', error);
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Call started tracked' 
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleCallEnded(supabase: any, call: any, existingCall: any) {
  console.log('Handling call_ended event');
  
  const duration = call.duration_ms ? Math.floor(call.duration_ms / 1000) : 0;
  const transcript = formatTranscript(call.transcript_object || [], call.transcript);
  
  // Determine outcome based on call status and duration - must match call_logs_outcome_check constraint
  // Valid outcomes: interested, not_interested, callback, callback_requested, converted, do_not_call, 
  //                 contacted, appointment_set, dnc, completed, voicemail, no_answer, busy, failed, unknown
  let outcome = 'completed';
  if (call.disconnection_reason === 'no_answer' || call.call_status === 'no-answer') {
    outcome = 'no_answer'; // Fixed: no hyphen
  } else if (call.disconnection_reason === 'busy' || call.call_status === 'busy') {
    outcome = 'busy';
  } else if (call.disconnection_reason === 'failed' || call.call_status === 'failed') {
    outcome = 'failed';
  } else if (duration < 10) {
    outcome = 'completed'; // Fixed: short-call not valid, use completed
  }

  const updateData: Record<string, unknown> = {
    status: 'completed',
    ended_at: new Date().toISOString(),
    duration_seconds: duration,
    outcome: outcome
  };

  // Store agent_id from Retell payload
  if (call.agent_id) {
    updateData.agent_id = call.agent_id;
    console.log(`Storing agent_id on call_ended: ${call.agent_id}`);
  }

  if (transcript) {
    updateData.notes = transcript;
  }

  if (existingCall) {
    const { error } = await supabase
      .from('call_logs')
      .update(updateData)
      .eq('id', existingCall.id);

    if (error) {
      console.error('Error updating call log:', error);
    } else {
      console.log('Call log updated successfully');
      
      // Update lead's last_contacted_at
      if (existingCall.lead_id) {
        await supabase
          .from('leads')
          .update({ 
            last_contacted_at: new Date().toISOString(),
            status: outcome === 'no-answer' ? 'no-answer' : 'contacted'
          })
          .eq('id', existingCall.lead_id);
      }
    }
  } else {
    // Create new call log if none exists
    console.log('No existing call log found, creating new one');
    await createCallLogFromRetell(supabase, call, updateData);
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Call ended tracked',
    duration: duration,
    outcome: outcome
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function handleCallAnalyzed(supabase: any, call: any, existingCall: any) {
  console.log('Handling call_analyzed event');
  
  const transcript = formatTranscript(call.transcript_object || [], call.transcript);
  const analysis = call.call_analysis;
  
  if (!existingCall) {
    console.log('No existing call log for analyzed call');
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Call log not found for analysis' 
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Update call log with transcript and analysis
  const updateData: Record<string, unknown> = {
    notes: transcript || existingCall.notes
  };

  // Map Retell analysis to disposition
  let disposition = 'Contacted';
  let sentiment = 'neutral';
  
  if (analysis) {
    sentiment = analysis.user_sentiment || 'neutral';
    
    if (analysis.call_successful) {
      disposition = 'Interested';
    } else if (sentiment === 'positive') {
      disposition = 'Callback Requested';
    } else if (sentiment === 'negative') {
      disposition = 'Not Interested';
    }
    
    // Check for specific keywords in transcript
    const lowerTranscript = (transcript || '').toLowerCase();
    if (lowerTranscript.includes('call me back') || lowerTranscript.includes('callback')) {
      disposition = 'Callback Requested';
    } else if (lowerTranscript.includes('not interested') || lowerTranscript.includes('do not call')) {
      disposition = 'Not Interested';
    } else if (lowerTranscript.includes('appointment') || lowerTranscript.includes('schedule')) {
      disposition = 'Appointment Set';
    } else if (lowerTranscript.includes('voicemail')) {
      disposition = 'Left Voicemail';
    }
  }

  updateData.outcome = disposition;

  const { error: updateError } = await supabase
    .from('call_logs')
    .update(updateData)
    .eq('id', existingCall.id);

  if (updateError) {
    console.error('Error updating call with analysis:', updateError);
  }

  // Update lead status and schedule follow-up
  if (existingCall.lead_id) {
    await updateLeadFromAnalysis(supabase, existingCall, disposition, transcript, analysis);
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Call analysis processed',
    disposition: disposition,
    sentiment: sentiment
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

async function updateLeadFromAnalysis(
  supabase: any, 
  callLog: any, 
  disposition: string, 
  transcript: string | null,
  analysis: any
) {
  const leadId = callLog.lead_id;
  const userId = callLog.user_id;
  
  console.log(`Updating lead ${leadId} with disposition: ${disposition}`);

  // Update lead status
  const leadUpdate: Record<string, unknown> = {
    status: mapDispositionToStatus(disposition),
    last_contacted_at: new Date().toISOString()
  };

  // Schedule callback if requested
  if (disposition === 'Callback Requested') {
    // Default to next business day at 10 AM
    const nextCallback = new Date();
    nextCallback.setDate(nextCallback.getDate() + 1);
    nextCallback.setHours(10, 0, 0, 0);
    
    // Check transcript for specific time mentions
    if (transcript) {
      const callbackTime = extractCallbackTime(transcript);
      if (callbackTime) {
        leadUpdate.next_callback_at = callbackTime.toISOString();
      } else {
        leadUpdate.next_callback_at = nextCallback.toISOString();
      }
    } else {
      leadUpdate.next_callback_at = nextCallback.toISOString();
    }
  }

  const { error: leadError } = await supabase
    .from('leads')
    .update(leadUpdate)
    .eq('id', leadId);

  if (leadError) {
    console.error('Error updating lead:', leadError);
  }

  // Log agent decision for autonomous tracking
  await logAgentDecision(supabase, userId, leadId, callLog, disposition, transcript);

  // If appointment was set, book it in calendar
  if (disposition === 'Appointment Set') {
    await bookAppointmentFromCall(supabase, userId, leadId, callLog, transcript);
  }

  // Schedule follow-up based on disposition
  await scheduleFollowUp(supabase, userId, leadId, disposition);

  // Update pipeline position
  await updatePipelinePosition(supabase, userId, leadId, disposition);
}

function mapDispositionToStatus(disposition: string): string {
  const mapping: Record<string, string> = {
    'Interested': 'qualified',
    'Appointment Set': 'appointment',
    'Callback Requested': 'callback',
    'Not Interested': 'not-interested',
    'Left Voicemail': 'voicemail',
    'No Answer': 'no-answer',
    'Contacted': 'contacted'
  };
  return mapping[disposition] || 'contacted';
}

function extractCallbackTime(transcript: string): Date | null {
  const lowerTranscript = transcript.toLowerCase();
  const now = new Date();
  
  // Check for relative time mentions
  if (lowerTranscript.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Try to extract specific time
    const timeMatch = lowerTranscript.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3]?.toLowerCase();
      
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      tomorrow.setHours(hours, minutes, 0, 0);
    } else {
      tomorrow.setHours(10, 0, 0, 0); // Default to 10 AM
    }
    return tomorrow;
  }
  
  // Check for day mentions
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lowerTranscript.includes(days[i])) {
      const targetDay = i;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      targetDate.setHours(10, 0, 0, 0);
      return targetDate;
    }
  }
  
  return null;
}

async function logAgentDecision(
  supabase: any,
  userId: string,
  leadId: string,
  callLog: any,
  disposition: string,
  transcript: string | null
) {
  const { error } = await supabase
    .from('agent_decisions')
    .insert({
      user_id: userId,
      lead_id: leadId,
      lead_name: callLog.leads?.first_name 
        ? `${callLog.leads.first_name} ${callLog.leads.last_name || ''}`.trim()
        : callLog.phone_number,
      decision_type: 'call_disposition',
      reasoning: `Call completed with disposition: ${disposition}. ${transcript ? 'Transcript analyzed.' : 'No transcript available.'}`,
      action_taken: `Set disposition to ${disposition}`,
      executed_at: new Date().toISOString(),
      success: true
    });

  if (error) {
    console.error('Error logging agent decision:', error);
  }
}

async function bookAppointmentFromCall(
  supabase: any,
  userId: string,
  leadId: string,
  callLog: any,
  transcript: string | null
) {
  console.log('[Calendar] Booking appointment from call disposition');
  
  // Try to extract appointment time from transcript
  let appointmentTime = extractAppointmentTime(transcript);
  
  if (!appointmentTime) {
    // Default to next business day at 10 AM
    appointmentTime = new Date();
    appointmentTime.setDate(appointmentTime.getDate() + 1);
    appointmentTime.setHours(10, 0, 0, 0);
    
    // Skip weekends
    while (appointmentTime.getDay() === 0 || appointmentTime.getDay() === 6) {
      appointmentTime.setDate(appointmentTime.getDate() + 1);
    }
  }

  const endTime = new Date(appointmentTime.getTime() + 30 * 60000); // 30 min default

  try {
    // Get lead details
    const { data: lead } = await supabase
      .from('leads')
      .select('first_name, last_name, email, phone_number')
      .eq('id', leadId)
      .maybeSingle();

    const attendeeName = lead 
      ? `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Lead'
      : 'Lead';

    // Create appointment in our system
    const { data: appointment, error: apptError } = await supabase
      .from('calendar_appointments')
      .insert({
        user_id: userId,
        lead_id: leadId,
        title: `Appointment with ${attendeeName}`,
        description: `Booked via AI call.\nPhone: ${lead?.phone_number || callLog.phone_number}`,
        start_time: appointmentTime.toISOString(),
        end_time: endTime.toISOString(),
        timezone: 'America/New_York',
        status: 'scheduled',
      })
      .select()
      .maybeSingle();

    if (apptError) {
      console.error('[Calendar] Error creating appointment:', apptError);
      return;
    }

    console.log('[Calendar] Appointment created:', appointment?.id);

    // Try to sync to Google Calendar
    try {
      await supabase.functions.invoke('calendar-integration', {
        body: {
          action: 'book_appointment',
          date: appointmentTime.toISOString().split('T')[0],
          time: appointmentTime.toISOString().split('T')[1].substring(0, 5),
          duration_minutes: 30,
          attendee_name: attendeeName,
          attendee_email: lead?.email,
          title: `Appointment with ${attendeeName}`,
        },
      });
      console.log('[Calendar] Synced to Google Calendar');
    } catch (syncError) {
      console.log('[Calendar] Google Calendar sync skipped (may not be connected):', syncError);
    }
  } catch (error) {
    console.error('[Calendar] Error in bookAppointmentFromCall:', error);
  }
}

function extractAppointmentTime(transcript: string | null): Date | null {
  if (!transcript) return null;
  
  const lowerTranscript = transcript.toLowerCase();
  const now = new Date();
  
  // Extract time patterns like "2pm", "2:30pm", "14:00"
  const timeMatch = lowerTranscript.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  
  // Check for date patterns
  if (lowerTranscript.includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3]?.toLowerCase();
      
      if (period === 'pm' && hours < 12) hours += 12;
      if (period === 'am' && hours === 12) hours = 0;
      
      tomorrow.setHours(hours, minutes, 0, 0);
    } else {
      tomorrow.setHours(10, 0, 0, 0);
    }
    return tomorrow;
  }
  
  // Check for day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lowerTranscript.includes(days[i])) {
      const targetDay = i;
      const currentDay = now.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + daysUntil);
      
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const period = timeMatch[3]?.toLowerCase();
        
        if (period === 'pm' && hours < 12) hours += 12;
        if (period === 'am' && hours === 12) hours = 0;
        
        targetDate.setHours(hours, minutes, 0, 0);
      } else {
        targetDate.setHours(10, 0, 0, 0);
      }
      return targetDate;
    }
  }
  
  // If only time mentioned with no date, assume today or tomorrow
  if (timeMatch && !lowerTranscript.includes('yesterday')) {
    let hours = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    const period = timeMatch[3]?.toLowerCase();
    
    if (period === 'pm' && hours < 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    
    const appointmentDate = new Date(now);
    appointmentDate.setHours(hours, minutes, 0, 0);
    
    // If the time has already passed today, schedule for tomorrow
    if (appointmentDate <= now) {
      appointmentDate.setDate(appointmentDate.getDate() + 1);
    }
    
    return appointmentDate;
  }
  
  return null;
}

async function scheduleFollowUp(
  supabase: any,
  userId: string,
  leadId: string,
  disposition: string
) {
  // Determine follow-up action based on disposition
  const followUpConfig: Record<string, { action: string; delayMinutes: number }> = {
    'Callback Requested': { action: 'ai_call', delayMinutes: 0 }, // Uses next_callback_at
    'Left Voicemail': { action: 'ai_sms', delayMinutes: 60 }, // SMS 1 hour later
    'No Answer': { action: 'ai_call', delayMinutes: 120 }, // Retry in 2 hours
    'Interested': { action: 'ai_sms', delayMinutes: 30 }, // Follow-up SMS
  };

  const config = followUpConfig[disposition];
  if (!config) {
    console.log(`No follow-up configured for disposition: ${disposition}`);
    return;
  }

  const scheduledAt = new Date();
  scheduledAt.setMinutes(scheduledAt.getMinutes() + config.delayMinutes);

  const { error } = await supabase
    .from('scheduled_follow_ups')
    .insert({
      user_id: userId,
      lead_id: leadId,
      action_type: config.action,
      scheduled_at: scheduledAt.toISOString(),
      status: 'pending'
    });

  if (error) {
    console.error('Error scheduling follow-up:', error);
  } else {
    console.log(`Scheduled ${config.action} follow-up for ${disposition} at ${scheduledAt.toISOString()}`);
  }
}

async function updatePipelinePosition(
  supabase: any,
  userId: string,
  leadId: string,
  disposition: string
) {
  // Map disposition to pipeline stage name
  const stageMapping: Record<string, string> = {
    'Interested': 'Qualified',
    'Appointment Set': 'Appointment',
    'Callback Requested': 'Callback',
    'Not Interested': 'Not Interested',
    'Left Voicemail': 'Follow Up',
    'Contacted': 'Contacted',
    'Hot Lead': 'Hot Lead',
    'Warm Lead': 'Warm Lead',
    'Cold Lead': 'Cold Lead'
  };

  const stageName = stageMapping[disposition] || disposition;

  // Find or create the pipeline stage
  let stage = await findOrCreatePipelineStage(supabase, userId, stageName, disposition);

  if (stage) {
    // Check if lead already has a position
    const { data: existingPosition } = await supabase
      .from('lead_pipeline_positions')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existingPosition) {
      // Update existing position
      const { error } = await supabase
        .from('lead_pipeline_positions')
        .update({
          pipeline_board_id: stage.id,
          moved_at: new Date().toISOString(),
          moved_by_user: false,
          notes: `Auto-moved based on disposition: ${disposition}`
        })
        .eq('id', existingPosition.id);

      if (error) {
        console.error('Error updating pipeline position:', error);
      } else {
        console.log(`Lead moved to ${stageName} stage`);
      }
    } else {
      // Create new position
      const { error } = await supabase
        .from('lead_pipeline_positions')
        .insert({
          user_id: userId,
          lead_id: leadId,
          pipeline_board_id: stage.id,
          moved_at: new Date().toISOString(),
          moved_by_user: false,
          notes: `Auto-placed based on disposition: ${disposition}`
        });

      if (error) {
        console.error('Error creating pipeline position:', error);
      } else {
        console.log(`Lead placed in ${stageName} stage`);
      }
    }
  }
}

async function findOrCreatePipelineStage(
  supabase: any,
  userId: string,
  stageName: string,
  disposition: string
) {
  // First try to find existing stage
  const { data: existingStage } = await supabase
    .from('pipeline_boards')
    .select('id, name')
    .eq('user_id', userId)
    .eq('name', stageName)
    .maybeSingle();

  if (existingStage) {
    return existingStage;
  }

  // Get or create disposition
  const dispositionRecord = await findOrCreateDisposition(supabase, userId, disposition, stageName);

  // Create new stage
  const { data: newStage, error } = await supabase
    .from('pipeline_boards')
    .insert({
      user_id: userId,
      name: stageName,
      disposition_id: dispositionRecord?.id,
      position: 0
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error creating pipeline stage:', error);
    return null;
  }

  return newStage;
}

async function findOrCreateDisposition(
  supabase: any,
  userId: string,
  dispositionName: string,
  pipelineStage: string
) {
  // Try to find existing disposition
  const { data: existing } = await supabase
    .from('dispositions')
    .select('id')
    .eq('user_id', userId)
    .eq('name', dispositionName)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  // Create new disposition
  const colors: Record<string, string> = {
    'Interested': '#22C55E',
    'Appointment Set': '#3B82F6',
    'Callback Requested': '#F59E0B',
    'Not Interested': '#EF4444',
    'Left Voicemail': '#8B5CF6',
    'No Answer': '#6B7280',
    'Contacted': '#06B6D4'
  };

  const { data: newDisposition, error } = await supabase
    .from('dispositions')
    .insert({
      user_id: userId,
      name: dispositionName,
      pipeline_stage: pipelineStage,
      color: colors[dispositionName] || '#3B82F6'
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error creating disposition:', error);
    return null;
  }

  return newDisposition;
}

function formatTranscript(transcriptObject: Array<{ role: string; content: string }>, rawTranscript?: string): string | null {
  if (transcriptObject && transcriptObject.length > 0) {
    return transcriptObject
      .map(entry => `${entry.role}: ${entry.content}`)
      .join('\n');
  }
  return rawTranscript || null;
}

async function createCallLogFromRetell(supabase: any, call: any, additionalData: Record<string, unknown>) {
  // Try to find user by phone number
  const phoneNumber = call.to_number || call.from_number;
  
  if (!phoneNumber) {
    console.error('No phone number available to create call log');
    return;
  }

  // Try to find user through phone_numbers table
  const { data: phoneRecord } = await supabase
    .from('phone_numbers')
    .select('user_id')
    .or(`number.eq.${phoneNumber},number.eq.${call.from_number}`)
    .limit(1)
    .maybeSingle();

  if (!phoneRecord?.user_id) {
    console.log('Could not find user for phone number:', phoneNumber);
    return;
  }

  const callLogData = {
    user_id: phoneRecord.user_id,
    phone_number: call.to_number || phoneNumber,
    caller_id: call.from_number || phoneNumber,
    retell_call_id: call.call_id,
    status: additionalData.status || 'completed',
    ...additionalData
  };

  const { error } = await supabase
    .from('call_logs')
    .insert(callLogData);

  if (error) {
    console.error('Error creating call log:', error);
  } else {
    console.log('Created new call log from Retell webhook');
  }
}

async function handleLegacyWebhook(supabase: any, payload: RetellCallEvent) {
  console.log('Processing legacy webhook format');
  
  const phoneNumber = payload.phone_number || payload.caller_id || '';
  
  if (!phoneNumber) {
    return new Response(JSON.stringify({ 
      error: 'No phone number in payload' 
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // Update phone number usage tracking
  const { data: phoneRecord } = await supabase
    .from('phone_numbers')
    .select('*')
    .eq('number', phoneNumber)
    .maybeSingle();

  if (phoneRecord) {
    const newDailyCalls = (phoneRecord.daily_calls || 0) + 1;
    
    await supabase
      .from('phone_numbers')
      .update({
        daily_calls: newDailyCalls,
        last_used: new Date().toISOString()
      })
      .eq('id', phoneRecord.id);

    console.log(`Updated phone ${phoneNumber} - daily calls: ${newDailyCalls}`);
  }

  return new Response(JSON.stringify({ 
    success: true,
    message: 'Legacy webhook processed'
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
