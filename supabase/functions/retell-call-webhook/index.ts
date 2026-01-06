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
      
      const last10 = callerFormats.find(f => f.length === 10) || callerFormats[callerFormats.length - 1];
      
      if (callerFormats.length > 0) {
        // Look up lead by caller's phone number
        // If we have userId, filter by it; otherwise search all leads
        let query = supabase
          .from('leads')
          .select('id, first_name, last_name, email, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, phone_number, address, city, state, zip_code, user_id')
          .or(`phone_number.ilike.%${last10}`)
          .order('updated_at', { ascending: false })
          .limit(10);
        
        if (userId) {
          query = query.eq('user_id', userId);
        }
        
        const { data: leads, error: leadError } = await query;
        
        if (leadError) {
          console.error('[Retell Webhook] Lead lookup error:', leadError);
        } else if (leads && leads.length > 0) {
          // Prefer leads with first_name populated
          lead = leads.find(l => l.first_name && l.first_name.trim() !== '') || leads[0];
          // If we didn't have userId, get it from the lead
          if (!userId && lead.user_id) {
            userId = lead.user_id;
            console.log('[Retell Webhook] Got userId from lead:', userId);
          }
          console.log('[Retell Webhook] Found', leads.length, 'matching leads, selected:', lead.first_name, lead.last_name, '(id:', lead.id, ')');
        } else {
          console.log('[Retell Webhook] No lead found for caller:', callerNumber);
        }
      }
      
      // Create a call log entry at call_started so we have context for later events
      // NOTE: call_logs.status is constrained in Postgres; use an allowed value.
      if (userId) {
        const callLogEntry: any = {
          retell_call_id: call.call_id,
          user_id: userId,
          phone_number: receivingNumber || '',
          caller_id: callerNumber || '',
          status: 'ringing',
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
      }

      // If we found a lead, we *attempt* to inject dynamic variables.
      // For reliable "name on greeting" behavior, configure Retell's Inbound Webhook
      // (retell-inbound-webhook) which provides dynamic variables before call connects.
      if (lead) {
        console.log('[Retell Webhook] Found lead for inbound caller:', lead.first_name, lead.last_name);

        // Support BOTH our variables AND GoHighLevel-style variables (contact.*)
        const firstName = String(lead?.first_name || '');
        const lastName = String(lead?.last_name || '');
        const fullName = String([lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || '');
        const email = String(lead?.email || '');
        const company = String(lead?.company || '');
        const leadSource = String(lead?.lead_source || '');
        const notes = String(lead?.notes || '');
        const tags = String(Array.isArray(lead?.tags) ? lead.tags.join(', ') : '');
        const preferredContactTime = String(lead?.preferred_contact_time || '');
        const timezone = String(lead?.timezone || 'America/New_York');
        const phone = String(lead?.phone_number || callerNumber || '');

        // Address fields
        const address = String(lead?.address || '');
        const city = String(lead?.city || '');
        const state = String(lead?.state || '');
        const zipCode = String(lead?.zip_code || '');
        const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

        // Prepare dynamic variables (Retell requires string values)
        const dynamicVariables: Record<string, string> = {
          // Standard variables
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          name: fullName,
          email: email,
          company: company,
          lead_source: leadSource,
          notes: notes,
          tags: tags,
          preferred_contact_time: preferredContactTime,
          timezone: timezone,
          phone: phone,
          phone_number: phone,

          // Address variables
          address: address,
          city: city,
          state: state,
          zip_code: zipCode,
          zipCode: zipCode,
          zip: zipCode,
          full_address: fullAddress,
          fullAddress: fullAddress,

          // GoHighLevel-style contact.* variables
          'contact.first_name': firstName,
          'contact.firstName': firstName,
          'contact.last_name': lastName,
          'contact.lastName': lastName,
          'contact.full_name': fullName,
          'contact.fullName': fullName,
          'contact.name': fullName,
          'contact.email': email,
          'contact.company': company,
          'contact.companyName': company,
          'contact.phone': phone,
          'contact.phoneNumber': phone,
          'contact.phone_number': phone,
          'contact.source': leadSource,
          'contact.leadSource': leadSource,
          'contact.lead_source': leadSource,
          'contact.timezone': timezone,
          'contact.notes': notes,
          'contact.tags': tags,
          'contact.address': address,
          'contact.city': city,
          'contact.state': state,
          'contact.zip_code': zipCode,
          'contact.zipCode': zipCode,
          'contact.zip': zipCode,
          'contact.full_address': fullAddress,
          'contact.fullAddress': fullAddress,
          // GoHighLevel-specific address aliases
          'contact.address1': address,
          'contact.address_1': address,
          'contact.address_line_1': address,
          'contact.addressLine1': address,
          'contact.street': address,
          'contact.street_address': address,
          'contact.streetAddress': address,
          'contact.postal_code': zipCode,
          'contact.postalCode': zipCode,

          // Alternative formats some systems use
          'customer.first_name': firstName,
          'customer.last_name': lastName,
          'customer.name': fullName,
          'customer.email': email,
          'customer.phone': phone,
          'customer.company': company,
          'customer.address': address,
          'customer.city': city,
          'customer.state': state,
          'customer.zip_code': zipCode,
          'customer.full_address': fullAddress,
          'customer.address1': address,
          'customer.postal_code': zipCode,

          // Lead prefix
          'lead.first_name': firstName,
          'lead.last_name': lastName,
          'lead.name': fullName,
          'lead.email': email,
          'lead.phone': phone,
          'lead.company': company,
          'lead.address': address,
          'lead.city': city,
          'lead.state': state,
          'lead.zip_code': zipCode,
          'lead.full_address': fullAddress,
          'lead.address1': address,
          'lead.postal_code': zipCode,
        };

        // Include lead custom_fields as additional variables
        if (lead?.custom_fields && typeof lead.custom_fields === 'object') {
          for (const [rawKey, rawVal] of Object.entries(lead.custom_fields as Record<string, unknown>)) {
            const key = String(rawKey || '').trim();
            if (!key) continue;

            const value =
              rawVal === null || rawVal === undefined
                ? ''
                : typeof rawVal === 'string'
                  ? rawVal
                  : (typeof rawVal === 'number' || typeof rawVal === 'boolean')
                    ? String(rawVal)
                    : JSON.stringify(rawVal);

            const snakeKey = key
              .replace(/[^\w]+/g, '_')
              .replace(/^_+|_+$/g, '')
              .toLowerCase();

            dynamicVariables[key] = value;
            if (snakeKey) dynamicVariables[snakeKey] = value;

            dynamicVariables[`contact.${key}`] = value;
            if (snakeKey) {
              dynamicVariables[`contact.${snakeKey}`] = value;
              dynamicVariables[`lead.${snakeKey}`] = value;
              dynamicVariables[`customer.${snakeKey}`] = value;
            }
          }
        }

        console.log('[Retell Webhook] Prepared dynamic variables:', Object.keys(dynamicVariables));

        // Best-effort: Update the call with dynamic variables via Retell API.
        // If Retell rejects this (schema validation), inbound webhook is the supported way.
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
        // Use Retell's built-in analysis if available, pass transcript for callback detection
        if (call.call_analysis) {
          dispositionResult = mapRetellAnalysisToDisposition(call.call_analysis, formattedTranscript);
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
        // IMPORTANT: Do NOT let transcript analysis override hard "non-connection" outcomes (voicemail/no_answer/etc)
        // unless it detected a *stronger* intent (callback_requested, appointment_set, etc).
        if (dispositionResult && callLog?.id) {
          const nonConnectionOutcomes = ['voicemail', 'no_answer', 'busy', 'failed', 'unknown'];
          const analyzedDisposition = dispositionResult.disposition;

          const shouldKeepStatusOutcome =
            nonConnectionOutcomes.includes(outcome) && analyzedDisposition === 'contacted';

          const finalOutcome = shouldKeepStatusOutcome ? outcome : analyzedDisposition;

          await supabase
            .from('call_logs')
            .update({ outcome: finalOutcome })
            .eq('id', callLog.id);

          outcome = finalOutcome;
        }
      } catch (analysisError: any) {
        console.error('[Retell Webhook] Analysis error:', analysisError);
        // Queue for retry by logging to system_alerts
        await logFailedOperation(supabase, userId, 'transcript_analysis', {
          callId: call.call_id,
          leadId,
          error: analysisError.message,
          transcript: formattedTranscript.substring(0, 500),
        });
      }
    }

    // 2.5 Update dialing queue status / schedule retries (if this call was dispatched from dialing_queues)
    if (leadId && campaignId) {
      try {
        const { data: queueEntry, error: queueLookupError } = await supabase
          .from('dialing_queues')
          .select('id, attempts, max_attempts, status')
          .eq('lead_id', leadId)
          .eq('campaign_id', campaignId)
          .in('status', ['calling'])
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (queueLookupError) throw queueLookupError;

        if (queueEntry) {
          const attempts = queueEntry.attempts || 1;
          const maxAttempts = queueEntry.max_attempts || 3;
          const retryEligibleOutcomes = ['no_answer', 'voicemail', 'busy', 'failed', 'unknown'];
          const shouldRetry = retryEligibleOutcomes.includes(outcome) && attempts < maxAttempts;

          if (shouldRetry) {
            await supabase
              .from('dialing_queues')
              .update({
                status: 'pending',
                scheduled_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', queueEntry.id);

            console.log(`[Retell Webhook] Scheduled retry for lead ${leadId}: ${attempts}/${maxAttempts} in 30 minutes`);
          } else {
            await supabase
              .from('dialing_queues')
              .update({
                status: retryEligibleOutcomes.includes(outcome) ? 'failed' : 'completed',
                updated_at: new Date().toISOString(),
              })
              .eq('id', queueEntry.id);

            console.log(`[Retell Webhook] Dialing queue marked ${retryEligibleOutcomes.includes(outcome) ? 'failed' : 'completed'} for lead ${leadId}`);
          }
        }
      } catch (queueError: any) {
        console.error('[Retell Webhook] Dialing queue update error:', queueError);
      }
    }

    // 3. Update lead status based on disposition
    if (leadId) {
      console.log('[Retell Webhook] Updating lead status...');
      
      // Always fetch current lead for notes
      const { data: currentLead } = await supabase
        .from('leads')
        .select('notes, first_name')
        .eq('id', leadId)
        .maybeSingle();
      
      const leadUpdate: Record<string, any> = {
        last_contacted_at: new Date().toISOString(),
        status: mapDispositionToLeadStatus(outcome),
      };

      // Build structured call note for EVERY call (not just callbacks)
      const callNote = buildCallNote(outcome, dispositionResult, durationSeconds, currentLead?.first_name);
      const existingNotes = currentLead?.notes || '';
      leadUpdate.notes = (existingNotes + '\n\n' + callNote).trim();

      // If callback requested, extract time from transcript and schedule
      if (outcome === 'callback_requested' || outcome === 'callback') {
        const callbackMinutes = extractCallbackTimeFromTranscript(formattedTranscript);
        const callbackTime = new Date(Date.now() + callbackMinutes * 60 * 1000);
        leadUpdate.next_callback_at = callbackTime.toISOString();
        leadUpdate.status = 'callback'; // Mark lead status as callback for visibility
        console.log(`[Retell Webhook] Callback scheduled in ${callbackMinutes} minutes at ${callbackTime.toISOString()}`);
        
        // Queue callback in dialing queue if we have a campaign
        if (campaignId) {
          try {
            // First delete any existing pending/failed entry for this lead to avoid conflicts
            await supabase
              .from('dialing_queues')
              .delete()
              .eq('lead_id', leadId)
              .in('status', ['pending', 'failed']);
            
            // Then insert fresh with high priority
            const { error: queueInsertError } = await supabase.from('dialing_queues').insert({
              campaign_id: campaignId,
              lead_id: leadId,
              phone_number: call.to_number || '',
              status: 'pending',
              scheduled_at: callbackTime.toISOString(),
              priority: 5, // High priority for callbacks (higher = more urgent)
              max_attempts: 3,
              attempts: 0,
            });
            
            if (queueInsertError) {
              console.error('[Retell Webhook] Failed to insert callback to queue:', queueInsertError);
            } else {
              console.log(`[Retell Webhook] Successfully queued callback for ${leadId} at ${callbackTime.toISOString()}`);
            }
          } catch (queueError) {
            console.error('[Retell Webhook] Failed to add callback to dialing queue:', queueError);
          }
        }
        
        // CRITICAL: Remove lead from active workflow so they don't get called again before callback
        try {
          await supabase
            .from('lead_workflow_progress')
            .update({ 
              status: 'paused', 
              removal_reason: 'Callback scheduled',
              updated_at: new Date().toISOString()
            })
            .eq('lead_id', leadId)
            .eq('status', 'active');
          console.log(`[Retell Webhook] Paused workflow for lead ${leadId} due to callback`);
        } catch (workflowPauseError) {
          console.error('[Retell Webhook] Failed to pause workflow:', workflowPauseError);
        }
        
        // Also add to scheduled_follow_ups for UI visibility
        try {
          await supabase.from('scheduled_follow_ups').insert({
            user_id: userId,
            lead_id: leadId,
            action_type: 'callback',
            scheduled_at: callbackTime.toISOString(),
            status: 'pending',
            notes: `Callback requested during call - ${dispositionResult?.summary || 'No details'}`,
          });
          console.log(`[Retell Webhook] Added callback to scheduled_follow_ups for lead ${leadId}`);
        } catch (followUpError) {
          console.error('[Retell Webhook] Failed to add to scheduled_follow_ups:', followUpError);
        }
        
        // Send auto-confirmation SMS to the lead
        try {
          const formattedTime = callbackTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });
          
          // Get an SMS-capable from number
          const { data: fromNumber } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          
          if (fromNumber?.number && call.to_number) {
            const leadName = currentLead?.first_name ? ` ${currentLead.first_name}` : '';
            const confirmationMessage = `Hi${leadName}! Just confirming - we'll call you back at ${formattedTime}. Looking forward to speaking with you!`;
            
            await supabase.functions.invoke('sms-messaging', {
              body: {
                action: 'send_sms',
                to: call.to_number,
                from: fromNumber.number,
                body: confirmationMessage,
                lead_id: leadId,
              }
            });
            
            console.log(`[Retell Webhook] Sent callback confirmation SMS to ${call.to_number}`);
          } else {
            console.log('[Retell Webhook] Could not send confirmation SMS - no from number available');
          }
        } catch (smsError) {
          console.error('[Retell Webhook] Failed to send confirmation SMS:', smsError);
          // Don't fail the main flow for SMS errors
        }
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
      } catch (routerError: any) {
        console.error('[Retell Webhook] Disposition router error:', routerError);
        // Queue for retry
        await logFailedOperation(supabase, userId, 'disposition_routing', {
          leadId,
          outcome,
          callId: call.call_id,
          error: routerError.message,
        });
      }

      // 5. Update nudge tracking (only if userId is available)
      if (userId) {
        try {
          await updateNudgeTracking(supabase, leadId, userId, outcome);
        } catch (nudgeError: any) {
          console.error('[Retell Webhook] Nudge tracking error:', nudgeError);
        }

        // 6. Update pipeline position
        try {
          await updatePipelinePosition(supabase, leadId, userId, outcome);
        } catch (pipelineError: any) {
          console.error('[Retell Webhook] Pipeline position error:', pipelineError);
        }

        // 7. CRITICAL: Advance workflow to next step after call ends
        // BUT: Skip workflow advancement for terminal dispositions (they're already removed by disposition-router)
        const TERMINAL_DISPOSITIONS = [
          'callback_requested', 'callback', 'appointment_set', 'appointment_booked', 
          'converted', 'not_interested', 'dnc', 'wrong_number', 'do_not_call'
        ];
        
        if (!TERMINAL_DISPOSITIONS.includes(outcome)) {
          try {
            await advanceWorkflowAfterCall(supabase, leadId, userId, outcome);
          } catch (workflowError: any) {
            console.error('[Retell Webhook] Workflow advance error:', workflowError);
            await logFailedOperation(supabase, userId, 'workflow_advance', {
              leadId,
              outcome,
              error: workflowError.message,
            });
          }
        } else {
          console.log(`[Retell Webhook] Skipping workflow advancement for terminal disposition: ${outcome}`);
        }

        // 8. Sync to Go High Level if configured
        try {
          await syncToGoHighLevel(supabase, leadId, userId, outcome, formattedTranscript, durationSeconds, call);
        } catch (ghlError: any) {
          console.error('[Retell Webhook] GHL sync error:', ghlError);
          await logFailedOperation(supabase, userId, 'ghl_sync', {
            leadId,
            outcome,
            error: ghlError.message,
          });
        }
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

function mapRetellAnalysisToDisposition(
  analysis: {
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    custom_analysis_data?: Record<string, any>;
  },
  transcript?: string
): { disposition: string; confidence: number; summary: string } {
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

  // NEW: Check transcript for callback patterns FIRST (before sentiment mapping)
  const transcriptLower = (transcript || analysis.call_summary || '').toLowerCase();
  const callbackPatterns = [
    /call\s*(me\s*)?(back|later|again)/i,
    /try\s*(me\s*)?(again|later|back)/i,
    /not\s*a\s*good\s*time/i,
    /busy\s*(right\s*now|at\s*the\s*moment)/i,
    /can\s*you\s*(call|try)\s*(back|later|again)/i,
    /in\s*(a\s*few|10|15|20|30|an?\s*hour|\d+)\s*(minute|min|hour)/i,
    /give\s*me\s*(a\s*few|10|15|20|30|\d+)\s*(minute|min|hour)/i,
    /tomorrow|next\s*week|morning|afternoon|evening/i,
    /call\s*back\s*(in|at|around|later)/i,
    /i('m|\s*am)\s*(busy|in\s*a\s*meeting)/i,
  ];
  
  if (callbackPatterns.some(pattern => pattern.test(transcriptLower))) {
    console.log('[Retell Webhook] Callback pattern detected in transcript');
    return { 
      disposition: 'callback_requested', 
      confidence: 0.85, 
      summary: analysis.call_summary || '' 
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

// Extract callback time from transcript (e.g. "call me back in 10 minutes" or "four minutes")
function extractCallbackTimeFromTranscript(transcript: string): number {
  const text = transcript.toLowerCase();
  
  // Map spoken numbers to digits - must check BEFORE digit patterns
  const numberWords: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
    'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
    'twenty-five': 25, 'thirty': 30, 'forty': 40, 'forty-five': 45, 'fifty': 50
  };
  
  // Check for spoken number + time unit patterns FIRST (e.g., "four minutes", "ten hours")
  for (const [word, num] of Object.entries(numberWords)) {
    const minutePattern = new RegExp(`${word}\\s*(minute|min)`, 'i');
    const hourPattern = new RegExp(`${word}\\s*hour`, 'i');
    
    if (minutePattern.test(text)) {
      console.log(`[extractCallbackTime] Matched spoken number: "${word}" minutes = ${num}`);
      return num;
    }
    if (hourPattern.test(text)) {
      console.log(`[extractCallbackTime] Matched spoken number: "${word}" hours = ${num * 60} minutes`);
      return num * 60;
    }
  }
  
  // Pattern matching for digit-based time mentions
  const patterns: Array<{ regex: RegExp; unit?: number; value?: number }> = [
    { regex: /(\d+)\s*minutes?/i, unit: 1 },
    { regex: /(\d+)\s*hours?/i, unit: 60 },
    { regex: /half\s*(an?\s*)?hour/i, value: 30 },
    { regex: /an?\s*hour/i, value: 60 },
    { regex: /couple\s*of?\s*hours?/i, value: 120 },
    { regex: /few\s*hours?/i, value: 180 },
    { regex: /tomorrow/i, value: 24 * 60 },
    { regex: /later\s*today/i, value: 4 * 60 },
    { regex: /this\s*afternoon/i, value: 4 * 60 },
    { regex: /this\s*evening/i, value: 6 * 60 },
    { regex: /this\s*morning/i, value: 2 * 60 },
    { regex: /next\s*week/i, value: 7 * 24 * 60 },
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match) {
      if (pattern.value !== undefined) {
        console.log(`[extractCallbackTime] Matched pattern with value: ${pattern.value} minutes`);
        return pattern.value;
      }
      if (match[1] && pattern.unit !== undefined) {
        const result = parseInt(match[1]) * pattern.unit;
        console.log(`[extractCallbackTime] Matched pattern with digits: ${match[1]} * ${pattern.unit} = ${result} minutes`);
        return result;
      }
    }
  }
  
  // Default: 30 minutes if callback requested but no specific time mentioned
  console.log('[extractCallbackTime] No specific time found, defaulting to 30 minutes');
  return 30;
}

// Build structured call note for every call
function buildCallNote(
  outcome: string,
  dispositionResult: { summary?: string; key_points?: string[] } | null,
  durationSeconds: number,
  leadFirstName?: string | null
): string {
  const timestamp = new Date().toLocaleString('en-US', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
  
  const duration = durationSeconds > 0 
    ? `${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s`
    : 'N/A';
  
  const formattedOutcome = outcome.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const summary = dispositionResult?.summary || 'Call completed';
  
  const lines = [
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `📞 CALL LOG - ${timestamp}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `Outcome: ${formattedOutcome}`,
    `Duration: ${duration}`,
    ``,
    `Summary: ${summary}`,
  ];
  
  // Add key points if available
  if (dispositionResult?.key_points?.length) {
    lines.push('');
    lines.push('Key Points:');
    dispositionResult.key_points.forEach((point: string) => {
      lines.push(`  • ${point}`);
    });
  }
  
  // Add next action indicator
  if (outcome === 'callback_requested' || outcome === 'callback') {
    lines.push('');
    lines.push('⏰ Next: Callback scheduled');
  } else if (outcome === 'appointment_set' || outcome === 'appointment_booked') {
    lines.push('');
    lines.push('📅 Next: Appointment confirmed');
  }
  
  return lines.join('\n');
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
  // IMPORTANT: For non-connecting outcomes (voicemail, no_answer, busy, failed),
  // keep the lead status as 'new' so they remain eligible for retry attempts.
  // Only change status to definitive values when a real conversation happens.
  const mapping: Record<string, string> = {
    'appointment_set': 'appointment_set',
    'interested': 'interested',
    'callback_requested': 'callback',
    'callback': 'callback',
    'not_interested': 'not_interested',
    'dnc': 'dnc',
    'do_not_call': 'dnc',
    // Non-connecting outcomes - keep as 'new' to allow retries
    'voicemail': 'new',
    'no_answer': 'new',
    'busy': 'new',
    'failed': 'new',
    'unknown': 'new',
    // Only mark as 'contacted' when a real conversation happened
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
    // Map outcome to pipeline stage with colors and descriptions
    const stageMapping: Record<string, { name: string; color: string; description: string }> = {
      'appointment_set': { name: 'Appointment Set', color: '#22c55e', description: 'Lead has booked an appointment' },
      'interested': { name: 'Interested', color: '#3b82f6', description: 'Lead expressed interest' },
      'callback_requested': { name: 'Callback Scheduled', color: '#f59e0b', description: 'Lead requested a callback' },
      'callback': { name: 'Callback Scheduled', color: '#f59e0b', description: 'Lead requested a callback' },
      'not_interested': { name: 'Not Interested', color: '#ef4444', description: 'Lead declined' },
      'dnc': { name: 'Do Not Call', color: '#991b1b', description: 'Lead requested no further contact' },
      'contacted': { name: 'Contacted', color: '#6b7280', description: 'Lead was reached' },
    };

    const stageInfo = stageMapping[outcome];
    if (!stageInfo) return;

    // Try to find existing board with flexible matching
    let { data: board } = await supabase
      .from('pipeline_boards')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', `%${stageInfo.name}%`)
      .maybeSingle();

    // If no exact match, try keyword-based matching
    if (!board) {
      const keywords = stageInfo.name.toLowerCase().split(' ');
      for (const keyword of keywords) {
        if (keyword.length < 4) continue; // Skip short words
        const { data: keywordBoard } = await supabase
          .from('pipeline_boards')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', `%${keyword}%`)
          .maybeSingle();
        if (keywordBoard) {
          board = keywordBoard;
          break;
        }
      }
    }

    // AUTO-CREATE BOARD if none found
    if (!board) {
      console.log(`[Pipeline] Auto-creating board: ${stageInfo.name}`);
      
      // Get max position for ordering
      const { data: maxPosResult } = await supabase
        .from('pipeline_boards')
        .select('position')
        .eq('user_id', userId)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const newPosition = (maxPosResult?.position || 0) + 1;
      
      // Create the board
      const { data: newBoard, error: createError } = await supabase
        .from('pipeline_boards')
        .insert({
          user_id: userId,
          name: stageInfo.name,
          description: stageInfo.description,
          position: newPosition,
          settings: {
            auto_created: true,
            created_at: new Date().toISOString(),
            created_from: 'call_webhook',
            color: stageInfo.color
          }
        })
        .select('id')
        .single();
      
      if (createError) {
        console.error('[Pipeline] Failed to create board:', createError);
        return;
      }
      
      board = newBoard;
      console.log(`[Pipeline] Created board "${stageInfo.name}" with ID ${board.id}`);
    }

    // Update or create pipeline position using the new unique constraint
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
        onConflict: 'lead_id,user_id',
      });
    
    console.log(`[Pipeline] Moved lead ${leadId} to board "${stageInfo.name}"`);
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

// Helper function to log failed operations for retry
async function logFailedOperation(
  supabase: any,
  userId: string | null,
  operationType: string,
  details: Record<string, any>
): Promise<void> {
  if (!userId) return;
  
  try {
    await supabase.from('system_alerts').insert({
      user_id: userId,
      alert_type: 'failed_operation',
      severity: 'warning',
      title: `Failed Operation: ${operationType}`,
      message: `A ${operationType} operation failed and may need manual review.`,
      metadata: {
        operationType,
        ...details,
        timestamp: new Date().toISOString(),
        requiresRetry: true,
      },
    });
    console.log(`[Retell Webhook] Logged failed ${operationType} operation for retry`);
  } catch (logError) {
    console.error('[Retell Webhook] Failed to log operation for retry:', logError);
  }
}

// Go High Level Sync after call completion
async function syncToGoHighLevel(
  supabase: any,
  leadId: string,
  userId: string,
  outcome: string,
  transcript: string,
  durationSeconds: number,
  callData: any
): Promise<void> {
  console.log('[Retell Webhook] Checking GHL sync settings for user:', userId);

  // Check if user has GHL credentials
  const { data: ghlCredentials } = await supabase
    .from('user_credentials')
    .select('credential_key, credential_value_encrypted')
    .eq('user_id', userId)
    .eq('service_name', 'gohighlevel');

  if (!ghlCredentials || ghlCredentials.length === 0) {
    console.log('[Retell Webhook] No GHL credentials found, skipping sync');
    return;
  }

  // Get GHL sync settings
  const { data: syncSettings } = await supabase
    .from('ghl_sync_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!syncSettings?.sync_enabled) {
    console.log('[Retell Webhook] GHL sync disabled, skipping');
    return;
  }

  // Get lead info including GHL contact ID
  const { data: lead } = await supabase
    .from('leads')
    .select('ghl_contact_id, first_name, last_name, priority, phone_number')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead?.ghl_contact_id) {
    console.log('[Retell Webhook] Lead has no GHL contact ID, skipping sync');
    return;
  }

  // Get call count for this lead
  const { count: totalCalls } = await supabase
    .from('call_logs')
    .select('*', { count: 'exact', head: true })
    .eq('lead_id', leadId);

  // Decode credentials
  let apiKey = '';
  let locationId = '';
  
  for (const cred of ghlCredentials) {
    try {
      const value = atob(cred.credential_value_encrypted);
      if (cred.credential_key === 'apiKey') apiKey = value;
      if (cred.credential_key === 'locationId') locationId = value;
    } catch (e) {
      console.error('[Retell Webhook] Failed to decode GHL credential');
    }
  }

  if (!apiKey || !locationId) {
    console.log('[Retell Webhook] GHL credentials incomplete');
    return;
  }

  console.log('[Retell Webhook] Triggering GHL sync for contact:', lead.ghl_contact_id);

  // Build comprehensive call data object with all 35+ fields
  const comprehensiveCallData: Record<string, any> = {
    // Call Analysis Fields
    outcome,
    notes: transcript?.substring(0, 5000) || '',
    duration: durationSeconds,
    date: new Date().toISOString(),
    recordingUrl: callData.recording_url || '',
    sentiment: callData.call_analysis?.user_sentiment || 'neutral',
    summary: callData.call_analysis?.call_summary || '',
    confidence: callData.call_analysis?.custom_analysis_data?.confidence || 0,
    reasoning: callData.call_analysis?.custom_analysis_data?.reasoning || '',
    keyPoints: callData.call_analysis?.custom_analysis_data?.key_points || [],
    painPoints: callData.call_analysis?.custom_analysis_data?.pain_points || [],
    objections: callData.call_analysis?.custom_analysis_data?.objections || [],
    nextAction: callData.call_analysis?.custom_analysis_data?.next_action || '',
    disposition: callData.call_analysis?.custom_analysis_data?.disposition || outcome,
    callSuccessful: callData.call_analysis?.call_successful || false,
    
    // Lead Data Fields
    firstName: lead.first_name || '',
    lastName: lead.last_name || '',
    fullName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || '',
    phoneNumber: lead.phone_number || '',
    
    // Stats & Metrics
    totalCalls: totalCalls || 1,
    leadScore: lead.priority || 1,
    
    // Appointment Data (if available from analysis)
    appointmentDate: callData.call_analysis?.custom_analysis_data?.appointment_date || '',
    appointmentTime: callData.call_analysis?.custom_analysis_data?.appointment_time || '',
    callbackDate: callData.call_analysis?.custom_analysis_data?.callback_date || '',
  };

  // Call ghl-integration edge function with comprehensive data
  const { error: ghlError } = await supabase.functions.invoke('ghl-integration', {
    body: {
      action: 'sync_with_field_mapping',
      apiKey,
      locationId,
      contactId: lead.ghl_contact_id,
      callData: comprehensiveCallData
    }
  });

  if (ghlError) {
    console.error('[Retell Webhook] GHL sync failed:', ghlError);
    throw new Error(`GHL sync failed: ${ghlError.message}`);
  }

  console.log('[Retell Webhook] GHL sync completed successfully');
}
