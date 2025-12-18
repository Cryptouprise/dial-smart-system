import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Dispositions that should trigger full DNC (block all future calls)
const DNC_DISPOSITIONS = [
  'dnc', 'do_not_call', 'stop', 'remove',
  'threatening', 'rude', 'hostile', 'abusive'
];

// Dispositions that should remove from all active campaigns/workflows
const REMOVE_ALL_DISPOSITIONS = [
  'not_interested', 'wrong_number', 'already_has_solar', 'already_has_service',
  'deceased', 'business_closed', 'invalid_number', 'disconnected'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, leadId, userId, dispositionName, dispositionId, callOutcome, transcript, callId, aiConfidence, setBy } = await req.json();

    if (action === 'process_disposition') {
      const normalizedDisposition = dispositionName?.toLowerCase().replace(/[^a-z0-9]/g, '_') || '';
      const actions: string[] = [];
      
      // Get lead's current state for before/after tracking
      const { data: leadBefore } = await supabase
        .from('leads')
        .select('status')
        .eq('id', leadId)
        .maybeSingle();
      
      // Get lead's current pipeline position
      const { data: pipelineBefore } = await supabase
        .from('lead_pipeline_positions')
        .select(`
          pipeline_board_id,
          pipeline_boards!inner(name)
        `)
        .eq('lead_id', leadId)
        .order('moved_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Get call timing data if callId provided
      let callEndedAt = null;
      let timeToDisposition = null;
      let workflowId = null;
      let campaignId = null;
      
      if (callId) {
        const { data: call } = await supabase
          .from('call_logs')
          .select('ended_at, campaign_id')
          .eq('id', callId)
          .maybeSingle();
        
        if (call?.ended_at) {
          callEndedAt = call.ended_at;
          campaignId = call.campaign_id;
          const endTime = new Date(call.ended_at).getTime();
          const nowTime = Date.now();
          timeToDisposition = Math.round((nowTime - endTime) / 1000); // seconds
        }
      }
      
      // Check if lead is in an active workflow
      const { data: activeWorkflow } = await supabase
        .from('lead_workflow_progress')
        .select('workflow_id, campaign_id')
        .eq('lead_id', leadId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (activeWorkflow) {
        workflowId = activeWorkflow.workflow_id;
        if (!campaignId) campaignId = activeWorkflow.campaign_id;
      }

      // 1. Check for user-defined auto-actions
      const { data: autoActions } = await supabase
        .from('disposition_auto_actions')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .or(`disposition_id.eq.${dispositionId},disposition_name.ilike.%${dispositionName}%`)
        .order('priority', { ascending: true });

      // Execute user-defined actions
      for (const autoAction of autoActions || []) {
        await executeAction(supabase, leadId, userId, autoAction);
        actions.push(`Executed: ${autoAction.action_type}`);
      }

      // 2. Check for DNC trigger
      if (DNC_DISPOSITIONS.some(d => normalizedDisposition.includes(d))) {
        // Add to DNC list
        const { data: lead } = await supabase
          .from('leads')
          .select('phone_number')
          .eq('id', leadId)
          .maybeSingle();

        if (lead?.phone_number) {
          await supabase.from('dnc_list').upsert({
            user_id: userId,
            phone_number: lead.phone_number,
            reason: `Disposition: ${dispositionName}`,
            added_at: new Date().toISOString(),
          }, { onConflict: 'user_id,phone_number' });

          // Update lead
          await supabase
            .from('leads')
            .update({ do_not_call: true, status: 'dnc' })
            .eq('id', leadId);

          actions.push('Added to DNC list');
        }
      }

      // 3. Check for remove from all campaigns trigger
      if (REMOVE_ALL_DISPOSITIONS.some(d => normalizedDisposition.includes(d))) {
        // Remove from all active workflows
        await supabase
          .from('lead_workflow_progress')
          .update({
            status: 'removed',
            removal_reason: `Disposition: ${dispositionName}`,
            updated_at: new Date().toISOString(),
          })
          .eq('lead_id', leadId)
          .eq('status', 'active');

        // Remove from dialing queues
        await supabase
          .from('dialing_queues')
          .update({ status: 'removed' })
          .eq('lead_id', leadId)
          .in('status', ['pending', 'scheduled']);

        // Update lead status so they won't be re-queued by automations
        await supabase
          .from('leads')
          .update({
            status: normalizedDisposition || 'not_interested',
            updated_at: new Date().toISOString(),
          })
          .eq('id', leadId);

        actions.push('Removed from all active campaigns and workflows');
      }

      // 4. Detect negative sentiment from transcript (if provided)
      if (transcript) {
        const negativePhrases = [
          'stop calling', 'don\'t call again', 'leave me alone', 
          'harassment', 'sue you', 'lawyer', 'block you',
          'f*** you', 'go to hell', 'threatening'
        ];
        
        const transcriptLower = transcript.toLowerCase();
        const hasNegativeSentiment = negativePhrases.some(phrase => 
          transcriptLower.includes(phrase)
        );

        if (hasNegativeSentiment) {
          // Auto-DNC for very negative responses
          const { data: lead } = await supabase
            .from('leads')
            .select('phone_number')
            .eq('id', leadId)
            .maybeSingle();

          if (lead?.phone_number) {
            await supabase.from('dnc_list').upsert({
              user_id: userId,
              phone_number: lead.phone_number,
              reason: 'Negative sentiment detected in transcript',
              added_at: new Date().toISOString(),
            }, { onConflict: 'user_id,phone_number' });

            await supabase
              .from('leads')
              .update({ do_not_call: true, status: 'dnc' })
              .eq('id', leadId);

            actions.push('Auto-DNC: Negative sentiment detected');
          }
        }
      }

      // 5. Update lead pipeline position based on disposition
      const { data: disposition } = await supabase
        .from('dispositions')
        .select('pipeline_stage')
        .eq('id', dispositionId)
        .maybeSingle();

      if (disposition?.pipeline_stage) {
        // Find the pipeline board for this stage
        const { data: pipelineBoard } = await supabase
          .from('pipeline_boards')
          .select('id')
          .eq('user_id', userId)
          .eq('name', disposition.pipeline_stage)
          .maybeSingle();

        if (pipelineBoard) {
          await supabase.from('lead_pipeline_positions').upsert({
            user_id: userId,
            lead_id: leadId,
            pipeline_board_id: pipelineBoard.id,
            moved_at: new Date().toISOString(),
            moved_by_user: false,
            notes: `Auto-moved by disposition: ${dispositionName}`,
          }, { onConflict: 'user_id,lead_id,pipeline_board_id' });

          actions.push(`Moved to pipeline stage: ${disposition.pipeline_stage}`);
        }
      }

      // 6. Record reachability event
      await supabase.from('reachability_events').insert({
        user_id: userId,
        lead_id: leadId,
        event_type: 'disposition_set',
        event_outcome: dispositionName,
        metadata: { dispositionId, callOutcome },
      });
      
      // 7. RECORD DISPOSITION METRICS for analytics
      const { data: leadAfter } = await supabase
        .from('leads')
        .select('status')
        .eq('id', leadId)
        .maybeSingle();
      
      const { data: pipelineAfter } = await supabase
        .from('lead_pipeline_positions')
        .select(`
          pipeline_board_id,
          pipeline_boards!inner(name)
        `)
        .eq('lead_id', leadId)
        .order('moved_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Insert comprehensive metrics
      const metricsInsertResult = await supabase
        .from('disposition_metrics')
        .insert({
          user_id: userId,
          lead_id: leadId,
          call_id: callId || null,
          disposition_id: dispositionId || null,
          disposition_name: dispositionName,
          set_by: setBy || 'manual', // 'ai', 'manual', or 'automation'
          set_by_user_id: setBy === 'manual' ? userId : null,
          ai_confidence_score: aiConfidence || null,
          call_ended_at: callEndedAt,
          disposition_set_at: new Date().toISOString(),
          time_to_disposition_seconds: timeToDisposition,
          previous_status: leadBefore?.status || null,
          new_status: leadAfter?.status || null,
          previous_pipeline_stage: pipelineBefore?.pipeline_boards?.name || null,
          new_pipeline_stage: pipelineAfter?.pipeline_boards?.name || null,
          workflow_id: workflowId,
          campaign_id: campaignId,
          actions_triggered: actions, // Array of actions executed
          metadata: {
            call_outcome: callOutcome,
            had_transcript: !!transcript,
            auto_actions_count: autoActions?.length || 0,
          },
        });
      
      if (metricsInsertResult.error) {
        console.error('[Disposition Metrics] Failed to insert metrics:', metricsInsertResult.error);
        // Don't fail the whole request, just log the error
      } else {
        console.log('[Disposition Metrics] Recorded metrics for disposition:', dispositionName);
      }

      return new Response(JSON.stringify({ success: true, actions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Unknown action');
  } catch (error) {
    console.error('Error in disposition-router:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function executeAction(supabase: any, leadId: string, userId: string, autoAction: any) {
  const config = autoAction.action_config || {};

  switch (autoAction.action_type) {
    case 'remove_all_campaigns':
      await supabase
        .from('lead_workflow_progress')
        .update({ status: 'removed', removal_reason: 'Auto-action', updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('status', 'active');
      break;

    case 'remove_from_campaign':
      if (config.campaign_id) {
        await supabase
          .from('lead_workflow_progress')
          .update({ status: 'removed', removal_reason: 'Auto-action', updated_at: new Date().toISOString() })
          .eq('lead_id', leadId)
          .eq('campaign_id', config.campaign_id);
      }
      break;

    case 'move_to_stage':
      if (config.target_stage_id) {
        await supabase.from('lead_pipeline_positions').upsert({
          user_id: userId,
          lead_id: leadId,
          pipeline_board_id: config.target_stage_id,
          moved_at: new Date().toISOString(),
          moved_by_user: false,
        }, { onConflict: 'user_id,lead_id,pipeline_board_id' });
      }
      break;

    case 'add_to_dnc':
      const { data: lead } = await supabase
        .from('leads')
        .select('phone_number')
        .eq('id', leadId)
        .maybeSingle();

      if (lead) {
        await supabase.from('dnc_list').upsert({
          user_id: userId,
          phone_number: lead.phone_number,
          reason: 'Auto-action from disposition',
          added_at: new Date().toISOString(),
        }, { onConflict: 'user_id,phone_number' });

        await supabase
          .from('leads')
          .update({ do_not_call: true })
          .eq('id', leadId);
      }
      break;

    case 'start_workflow':
      if (config.target_workflow_id) {
        // Call workflow-executor to start the workflow
        await supabase.functions.invoke('workflow-executor', {
          body: {
            action: 'start_workflow',
            userId,
            leadId,
            workflowId: config.target_workflow_id,
            campaignId: config.campaign_id || null,
          },
        });
        console.log(`Started workflow ${config.target_workflow_id} for lead ${leadId}`);
      }
      break;

    case 'send_sms':
      if (config.message) {
        // Get lead phone and user's available numbers
        const { data: leadForSms } = await supabase.from('leads').select('phone_number').eq('id', leadId).maybeSingle();
        const { data: availableNumber } = await supabase
          .from('phone_numbers')
          .select('number')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle();
        
        if (leadForSms?.phone_number && availableNumber?.number) {
          await supabase.functions.invoke('sms-messaging', {
            body: {
              action: 'send_sms',
              to: leadForSms.phone_number,
              from: availableNumber.number,
              body: config.message,
              lead_id: leadId,
            },
          });
        } else {
          console.error('Cannot send SMS: missing lead phone or no available sending number');
        }
      }
      break;

    case 'schedule_callback':
      const delayHours = config.delay_hours || 24;
      const callbackTime = new Date(Date.now() + delayHours * 60 * 60 * 1000).toISOString();
      await supabase
        .from('leads')
        .update({ next_callback_at: callbackTime, status: 'callback' })
        .eq('id', leadId);
      break;

    case 'book_appointment':
      // Book appointment via calendar integration
      if (config.title) {
        const appointmentTime = config.start_time 
          ? new Date(config.start_time).toISOString()
          : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default: tomorrow
        
        const endTime = new Date(new Date(appointmentTime).getTime() + (config.duration_minutes || 30) * 60000).toISOString();
        
        const { data: leadData } = await supabase
          .from('leads')
          .select('first_name, last_name, email, phone_number')
          .eq('id', leadId)
          .maybeSingle();

        // Create appointment in our system
        await supabase.from('calendar_appointments').insert({
          user_id: userId,
          lead_id: leadId,
          title: config.title || `Appointment with ${leadData?.first_name || 'Lead'}`,
          start_time: appointmentTime,
          end_time: endTime,
          timezone: 'America/New_York',
          status: 'scheduled',
        });

        // Sync to Google Calendar if connected
        await supabase.functions.invoke('calendar-integration', {
          body: {
            action: 'book_appointment',
            date: appointmentTime.split('T')[0],
            time: appointmentTime.split('T')[1].substring(0, 5),
            duration_minutes: config.duration_minutes || 30,
            attendee_name: leadData ? `${leadData.first_name || ''} ${leadData.last_name || ''}`.trim() : 'Lead',
            attendee_email: leadData?.email,
            title: config.title || 'Appointment',
          },
        });

        console.log(`Booked appointment for lead ${leadId}`);
      }
      break;
  }
}
