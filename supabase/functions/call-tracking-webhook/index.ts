
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RetellCallEvent {
  event?: string;
  call?: {
    call_id: string;
    call_status: string;
    from_number: string;
    to_number: string;
    direction: string;
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
  };
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: RetellCallEvent = await req.json();
    console.log('Received webhook payload:', JSON.stringify(payload, null, 2));

    // Handle Retell webhook format
    if (payload.event && payload.call) {
      return await handleRetellWebhook(supabase, payload);
    }

    // Handle legacy/generic format
    return await handleLegacyWebhook(supabase, payload);

  } catch (error) {
    console.error('Call tracking webhook error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

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
  
  if (existingCall) {
    // Update existing call log
    const { error } = await supabase
      .from('call_logs')
      .update({
        status: 'in-progress',
        answered_at: new Date().toISOString()
      })
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
  
  // Determine outcome based on call status and duration
  let outcome = 'completed';
  if (call.disconnection_reason === 'no_answer' || call.call_status === 'no-answer') {
    outcome = 'no-answer';
  } else if (call.disconnection_reason === 'busy' || call.call_status === 'busy') {
    outcome = 'busy';
  } else if (call.disconnection_reason === 'failed' || call.call_status === 'failed') {
    outcome = 'failed';
  } else if (duration < 10) {
    outcome = 'short-call';
  }

  const updateData: Record<string, unknown> = {
    status: 'completed',
    ended_at: new Date().toISOString(),
    duration_seconds: duration,
    outcome: outcome
  };

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
    'Contacted': 'Contacted'
  };

  const stageName = stageMapping[disposition];
  if (!stageName) return;

  // Find or create the pipeline stage
  const { data: stage } = await supabase
    .from('pipeline_boards')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', `%${stageName}%`)
    .maybeSingle();

  if (stage) {
    // Check if lead already has a position
    const { data: existingPosition } = await supabase
      .from('lead_pipeline_positions')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existingPosition) {
      await supabase
        .from('lead_pipeline_positions')
        .update({
          pipeline_board_id: stage.id,
          moved_at: new Date().toISOString(),
          moved_by_user: false,
          notes: `Auto-moved by call disposition: ${disposition}`
        })
        .eq('id', existingPosition.id);
    } else {
      await supabase
        .from('lead_pipeline_positions')
        .insert({
          user_id: userId,
          lead_id: leadId,
          pipeline_board_id: stage.id,
          moved_by_user: false,
          notes: `Auto-added by call disposition: ${disposition}`
        });
    }
    
    console.log(`Updated pipeline position to ${stageName} for lead ${leadId}`);
  }
}

function formatTranscript(transcriptObject: Array<{ role: string; content: string }>, rawTranscript?: string): string | null {
  if (transcriptObject && transcriptObject.length > 0) {
    return transcriptObject
      .map(t => `${t.role === 'agent' ? 'Agent' : 'Customer'}: ${t.content}`)
      .join('\n');
  }
  return rawTranscript || null;
}

async function createCallLogFromRetell(supabase: any, call: any, updateData: Record<string, unknown>) {
  // Try to find user by phone number
  const phoneNumber = call.from_number || call.to_number;
  
  const { data: phoneRecord } = await supabase
    .from('phone_numbers')
    .select('user_id')
    .or(`number.eq.${phoneNumber},number.ilike.%${phoneNumber.replace(/\D/g, '')}%`)
    .maybeSingle();

  if (!phoneRecord) {
    console.log('Could not find user for phone number:', phoneNumber);
    return;
  }

  const { error } = await supabase
    .from('call_logs')
    .insert({
      user_id: phoneRecord.user_id,
      phone_number: call.to_number,
      caller_id: call.from_number,
      retell_call_id: call.call_id,
      ...updateData
    });

  if (error) {
    console.error('Error creating call log:', error);
  }
}

// Legacy webhook handler for non-Retell sources
async function handleLegacyWebhook(supabase: any, callData: RetellCallEvent) {
  console.log('Processing legacy webhook format');
  
  if (!callData.phone_number) {
    return new Response(JSON.stringify({ error: 'No phone number provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const cleanPhoneNumber = callData.phone_number.replace(/\D/g, '');
  
  const { data: phoneNumbers, error: phoneError } = await supabase
    .from('phone_numbers')
    .select('*')
    .or(`number.eq.${callData.phone_number},number.ilike.%${cleanPhoneNumber}%`);

  if (phoneError) {
    console.error('Database error:', phoneError);
    return new Response(JSON.stringify({ 
      error: 'Database error',
      details: phoneError.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!phoneNumbers || phoneNumbers.length === 0) {
    const areaCodeMatch = cleanPhoneNumber.match(/^1?(\d{3})/);
    const areaCode = areaCodeMatch ? areaCodeMatch[1] : '000';
    
    const { data: newPhoneNumber, error: createError } = await supabase
      .from('phone_numbers')
      .insert({
        number: callData.phone_number,
        area_code: areaCode,
        daily_calls: 1,
        status: 'active',
        last_used: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating phone number:', createError);
      return new Response(JSON.stringify({ 
        error: 'Failed to create phone number record',
        details: createError.message 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      phone_number: callData.phone_number,
      daily_calls: 1,
      new_record_created: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const phoneNumber = phoneNumbers[0];
  const newDailyCount = phoneNumber.daily_calls + 1;
  
  await supabase
    .from('phone_numbers')
    .update({
      daily_calls: newDailyCount,
      last_used: new Date().toISOString()
    })
    .eq('id', phoneNumber.id);

  // Trigger spam detection if call count is high
  if (newDailyCount >= 40) {
    console.log(`High call volume detected: ${newDailyCount} calls`);
    await supabase.functions.invoke('spam-detection', {
      body: { phoneNumberId: phoneNumber.id }
    });
  }

  return new Response(JSON.stringify({
    success: true,
    phone_number: callData.phone_number,
    daily_calls: newDailyCount,
    spam_check_triggered: newDailyCount >= 40
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}
