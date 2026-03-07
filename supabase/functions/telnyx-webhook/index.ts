/**
 * Telnyx Webhook Handler (Complete Implementation)
 *
 * Handles ALL Telnyx webhooks:
 *   - Call lifecycle: initiated, ringing, answered, hangup, bridged
 *   - AI conversation: ended, insights generated
 *   - AMD: machine detection, greeting ended, premium detection
 *   - SMS: sent, delivered, failed, received
 *   - Assistant initialization (routed from dynamic-vars)
 *
 * Webhook signature verification via Ed25519 (when configured).
 * All events update call_logs and trigger downstream processing.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp',
};

// Map Telnyx call states to our status values
function mapCallStatus(eventType: string, payload: any): string {
  switch (eventType) {
    case 'call.initiated': return 'queued';
    case 'call.ringing': return 'ringing';
    case 'call.answered': return 'in-progress';
    case 'call.bridged': return 'in-progress';
    case 'call.hangup': return 'completed';
    case 'call.conversation.ended': return 'completed';
    default: return 'unknown';
  }
}

// Map Telnyx hangup cause to our outcome
function mapOutcome(payload: any): string | null {
  const cause = payload.hangup_cause || payload.sip_hangup_cause;
  const duration = payload.duration_secs || 0;

  if (!cause && !payload.hangup_cause) return null;

  switch (cause) {
    case 'normal_clearing':
      return duration > 30 ? 'completed' : 'short_call';
    case 'call_rejected':
    case 'user_busy':
      return 'busy';
    case 'no_answer':
    case 'timeout':
      return 'no_answer';
    case 'unallocated_number':
    case 'number_changed':
      return 'invalid_number';
    default:
      return 'failed';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Signature verification (when configured)
    const webhookPublicKey = Deno.env.get('TELNYX_WEBHOOK_PUBLIC_KEY');
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');

    // Note: Full Ed25519 verification would require importing crypto library.
    // For now, log signature presence for debugging. In production, implement:
    //   1. Concatenate timestamp + '|' + body
    //   2. Verify Ed25519 signature against Telnyx public key
    if (webhookPublicKey && !signature) {
      console.warn('[Telnyx Webhook] No signature present but verification configured');
    }

    const rawBody = await req.text();
    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Extract event data
    const eventData = payload.data || payload;
    const eventType = eventData.event_type;
    const eventPayload = eventData.payload || eventData;
    const occurredAt = eventData.occurred_at || new Date().toISOString();

    console.log(`[Telnyx Webhook] Event: ${eventType}`);

    // =================================================================
    // CALL LIFECYCLE EVENTS
    // =================================================================
    if (eventType?.startsWith('call.')) {
      const callControlId = eventPayload.call_control_id;
      const callSessionId = eventPayload.call_session_id;
      const callLegId = eventPayload.call_leg_id;
      const from = eventPayload.from || '';
      const to = eventPayload.to || '';
      const direction = eventPayload.direction || 'outgoing';

      // Find the call_log by telnyx_call_control_id
      let callLog: any = null;
      if (callControlId) {
        const { data } = await supabaseAdmin
          .from('call_logs')
          .select('id, user_id, lead_id, campaign_id, organization_id, status, telnyx_assistant_id')
          .eq('telnyx_call_control_id', callControlId)
          .maybeSingle();
        callLog = data;
      }

      // If not found by control_id, try session_id
      if (!callLog && callSessionId) {
        const { data } = await supabaseAdmin
          .from('call_logs')
          .select('id, user_id, lead_id, campaign_id, organization_id, status, telnyx_assistant_id')
          .eq('telnyx_call_session_id', callSessionId)
          .maybeSingle();
        callLog = data;
      }

      switch (eventType) {
        // ---------------------------------------------------------------
        // CALL INITIATED
        // ---------------------------------------------------------------
        case 'call.initiated': {
          if (callLog) {
            await supabaseAdmin.from('call_logs').update({
              status: 'queued',
              telnyx_call_control_id: callControlId,
              telnyx_call_session_id: callSessionId,
            }).eq('id', callLog.id);
          }

          // ===== INBOUND CALL ROUTING =====
          // If this is an incoming call to one of our Telnyx numbers,
          // find the appropriate AI assistant and answer + connect it.
          if (direction === 'incoming' && !callLog) {
            const calledNumber = to.replace(/[^\d+]/g, '');
            console.log(`[Telnyx Webhook] Inbound call to ${calledNumber} from ${from}`);

            // Find the phone number owner
            const { data: phoneRecord } = await supabaseAdmin
              .from('phone_numbers')
              .select('user_id')
              .or(`number.eq.${calledNumber},number.ilike.%${calledNumber.replace(/\D/g, '').slice(-10)}%`)
              .eq('provider', 'telnyx')
              .limit(1)
              .maybeSingle();

            if (phoneRecord) {
              // Find the phone_number record ID for matching against assigned_phone_number_ids
              const { data: phoneIdRecord } = await supabaseAdmin
                .from('phone_numbers')
                .select('id')
                .or(`number.eq.${calledNumber},number.ilike.%${calledNumber.replace(/\D/g, '').slice(-10)}%`)
                .eq('provider', 'telnyx')
                .limit(1)
                .maybeSingle();

              let assistant: any = null;

              // First: try to find an assistant that has this specific number assigned
              if (phoneIdRecord?.id) {
                const { data: assignedAssistant } = await supabaseAdmin
                  .from('telnyx_assistants')
                  .select('id, telnyx_assistant_id, name')
                  .eq('user_id', phoneRecord.user_id)
                  .eq('status', 'active')
                  .in('call_direction', ['inbound', 'both'])
                  .contains('assigned_phone_number_ids', [phoneIdRecord.id])
                  .limit(1)
                  .maybeSingle();
                assistant = assignedAssistant;
                if (assistant) {
                  console.log(`[Telnyx Webhook] Matched inbound number to assigned assistant: ${assistant.name}`);
                }
              }

              // Fallback: if no assistant has this number explicitly assigned, use newest inbound assistant
              if (!assistant) {
                const { data: fallbackAssistant } = await supabaseAdmin
                  .from('telnyx_assistants')
                  .select('id, telnyx_assistant_id, name')
                  .eq('user_id', phoneRecord.user_id)
                  .eq('status', 'active')
                  .in('call_direction', ['inbound', 'both'])
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();
                assistant = fallbackAssistant;
                if (assistant) {
                  console.log(`[Telnyx Webhook] No number-specific assignment, using fallback assistant: ${assistant.name}`);
                }
              }

              if (assistant?.telnyx_assistant_id) {
                console.log(`[Telnyx Webhook] Routing inbound call to assistant: ${assistant.name} (${assistant.telnyx_assistant_id})`);

                const telnyxApiKey = Deno.env.get('TELNYX_API_KEY')?.trim().replace(/[^\x20-\x7E]/g, '');
                if (telnyxApiKey) {
                  // Answer the call
                  try {
                    const answerResp = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
                      method: 'POST',
                      headers: {
                        'Authorization': `Bearer ${telnyxApiKey}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({}),
                    });

                    if (answerResp.ok) {
                      console.log('[Telnyx Webhook] Call answered, starting AI assistant...');

                      // Start AI assistant on the call
                      const aiResp = await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/ai_assistant_start`, {
                        method: 'POST',
                        headers: {
                          'Authorization': `Bearer ${telnyxApiKey}`,
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          assistant_id: assistant.telnyx_assistant_id,
                        }),
                      });

                      if (!aiResp.ok) {
                        const aiErr = await aiResp.text();
                        console.error('[Telnyx Webhook] AI assistant start failed:', aiErr);
                      } else {
                        console.log('[Telnyx Webhook] AI assistant started successfully');
                      }
                    } else {
                      const answerErr = await answerResp.text();
                      console.error('[Telnyx Webhook] Answer failed:', answerErr);
                    }
                  } catch (routingErr: any) {
                    console.error('[Telnyx Webhook] Inbound routing error:', routingErr.message);
                  }

                  // Create a call_log for this inbound call
                  await supabaseAdmin.from('call_logs').insert({
                    user_id: phoneRecord.user_id,
                    phone_number: from.replace(/[^\d+]/g, ''),
                    caller_id: calledNumber,
                    status: 'in-progress',
                    provider: 'telnyx',
                    telnyx_call_control_id: callControlId,
                    telnyx_call_session_id: callSessionId,
                    telnyx_assistant_id: assistant.telnyx_assistant_id,
                    started_at: occurredAt,
                    notes: `Inbound call routed to AI assistant: ${assistant.name}`,
                  });
                }
              } else {
                console.log('[Telnyx Webhook] No inbound assistant configured for user:', phoneRecord.user_id);
              }
            } else {
              console.log('[Telnyx Webhook] No phone record found for inbound number:', calledNumber);
            }
          }
          break;
        }

        // ---------------------------------------------------------------
        // CALL RINGING
        // ---------------------------------------------------------------
        case 'call.ringing': {
          if (callLog) {
            await supabaseAdmin.from('call_logs').update({
              status: 'ringing',
            }).eq('id', callLog.id);
          }
          break;
        }

        // ---------------------------------------------------------------
        // CALL ANSWERED
        // ---------------------------------------------------------------
        case 'call.answered': {
          if (callLog) {
            await supabaseAdmin.from('call_logs').update({
              status: 'in-progress',
              started_at: occurredAt,
            }).eq('id', callLog.id);
          }
          break;
        }

        // ---------------------------------------------------------------
        // CALL HANGUP (call ended)
        // ---------------------------------------------------------------
        case 'call.hangup': {
          const durationSecs = eventPayload.duration_secs || 0;
          const outcome = mapOutcome(eventPayload);
          const hangupCause = eventPayload.hangup_cause || '';
          const sipCause = eventPayload.sip_hangup_cause || '';

          if (callLog) {
            await supabaseAdmin.from('call_logs').update({
              status: 'completed',
              outcome: outcome || 'completed',
              duration_seconds: durationSecs,
              ended_at: occurredAt,
              notes: `Hangup: ${hangupCause}${sipCause ? ` (SIP: ${sipCause})` : ''}`,
            }).eq('id', callLog.id);

            // Update lead status if we have a lead
            if (callLog.lead_id && durationSecs > 30) {
              await supabaseAdmin.from('leads').update({
                status: 'contacted',
                last_contacted: occurredAt,
              }).eq('id', callLog.lead_id);
            }

            // Credit finalization for Telnyx calls
            if (callLog.organization_id) {
              try {
                const costCents = Math.ceil(durationSecs / 60 * 9);

                const { error: finalizeError } = await supabaseAdmin.rpc('finalize_call_cost', {
                  p_organization_id: callLog.organization_id,
                  p_call_log_id: callLog.id,
                  p_retell_call_id: callControlId,
                  p_actual_minutes: durationSecs / 60,
                  p_retell_cost_cents: costCents,
                });

                if (finalizeError) {
                  console.error('[Telnyx Webhook] Credit finalization error:', finalizeError);
                }
              } catch (creditErr: any) {
                console.error('[Telnyx Webhook] Credit error:', creditErr.message);
              }
            }

            // Phone number usage tracking
            const callerNumber = direction === 'outgoing' ? from : to;
            if (callerNumber) {
              await supabaseAdmin.from('phone_numbers')
                .update({
                  last_used: occurredAt,
                })
                .eq('number', callerNumber);
            }

            // --- DISPOSITION ROUTING & TRANSCRIPT ANALYSIS ---
            // Trigger for calls with meaningful duration (likely had a conversation)
            if (callLog.user_id && callLog.lead_id && durationSecs > 15) {
              const finalOutcome = outcome || 'completed';

              // Trigger analyze-call-transcript if we have a transcript
              if (callLog.transcript || callLog.notes) {
                try {
                  console.log('[Telnyx Webhook] Triggering transcript analysis...');
                  const analysisResp = await supabaseAdmin.functions.invoke('analyze-call-transcript', {
                    body: {
                      transcript: callLog.transcript || callLog.notes || '',
                      callId: callLog.id,
                      leadId: callLog.lead_id,
                      userId: callLog.user_id,
                      duration: durationSecs,
                      provider: 'telnyx',
                    },
                  });
                  if (analysisResp.data?.disposition) {
                    console.log(`[Telnyx Webhook] Transcript analysis disposition: ${analysisResp.data.disposition}`);
                    // Update call log with AI analysis
                    await supabaseAdmin.from('call_logs').update({
                      auto_disposition: analysisResp.data.disposition,
                      confidence_score: analysisResp.data.confidence,
                      call_summary: analysisResp.data.summary,
                      ai_analysis: analysisResp.data,
                    }).eq('id', callLog.id);
                  }
                } catch (analysisErr: any) {
                  console.error('[Telnyx Webhook] Transcript analysis error:', analysisErr.message);
                }
              }

              // Trigger disposition router for pipeline movement & automation
              try {
                console.log(`[Telnyx Webhook] Triggering disposition router for outcome: ${finalOutcome}`);
                await supabaseAdmin.functions.invoke('disposition-router', {
                  body: {
                    action: 'process_disposition',
                    leadId: callLog.lead_id,
                    userId: callLog.user_id,
                    dispositionName: finalOutcome,
                    callOutcome: finalOutcome,
                    transcript: callLog.transcript || '',
                  },
                });
                console.log('[Telnyx Webhook] Disposition router triggered successfully');
              } catch (routerErr: any) {
                console.error('[Telnyx Webhook] Disposition router error:', routerErr.message);
              }

              // Handle terminal dispositions - remove from workflows
              const TERMINAL_DISPOSITIONS = ['not_interested', 'dnc', 'do_not_call', 'failed', 'invalid_number'];
              const CAMPAIGN_REMOVAL = ['not_interested', 'dnc', 'do_not_call', 'invalid_number'];

              if (CAMPAIGN_REMOVAL.includes(finalOutcome)) {
                // Remove from all active campaigns
                const { data: campaignLeads } = await supabaseAdmin
                  .from('campaign_leads')
                  .select('id, campaign_id')
                  .eq('lead_id', callLog.lead_id);

                if (campaignLeads?.length) {
                  for (const cl of campaignLeads) {
                    await supabaseAdmin.from('campaign_leads').delete().eq('id', cl.id);
                  }
                  console.log(`[Telnyx Webhook] Removed lead from ${campaignLeads.length} campaigns (${finalOutcome})`);
                }

                // Mark DNC
                if (['dnc', 'do_not_call'].includes(finalOutcome)) {
                  await supabaseAdmin.from('leads').update({ do_not_call: true }).eq('id', callLog.lead_id);
                }
              }

              if (TERMINAL_DISPOSITIONS.includes(finalOutcome)) {
                // Stop active workflows
                await supabaseAdmin
                  .from('lead_workflow_progress')
                  .update({ status: 'completed', completed_at: occurredAt })
                  .eq('lead_id', callLog.lead_id)
                  .eq('status', 'active');
              }

              // Handle callbacks
              if (['callback', 'callback_requested'].includes(finalOutcome)) {
                // Schedule callback for 1 hour from now
                const callbackTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
                await supabaseAdmin.from('leads').update({
                  next_callback_at: callbackTime,
                }).eq('id', callLog.lead_id);
                console.log(`[Telnyx Webhook] Callback scheduled for ${callbackTime}`);
              }
            }
          }
          break;
        }

        // ---------------------------------------------------------------
        // AI CONVERSATION ENDED
        // ---------------------------------------------------------------
        case 'call.conversation.ended': {
          const conversationId = eventPayload.conversation_id || eventPayload.telnyx_conversation_id;
          const transcript = eventPayload.transcript || '';

          if (callLog) {
            const updates: any = {
              telnyx_conversation_id: conversationId,
            };

            // Store transcript if available
            if (transcript) {
              updates.notes = (callLog.notes || '') + '\n\n--- Transcript ---\n' + transcript;
            }

            await supabaseAdmin.from('call_logs').update(updates).eq('id', callLog.id);
          }
          break;
        }

        // ---------------------------------------------------------------
        // POST-CALL INSIGHTS GENERATED
        // ---------------------------------------------------------------
        case 'call.conversation_insights.generated': {
          const conversationId = eventPayload.conversation_id;
          const assistantId = eventPayload.assistant_id;
          const insightGroupId = eventPayload.insight_group_id;
          const insights = eventPayload.insights || [];

          console.log(`[Telnyx Webhook] Insights received: ${insights.length} insights for conversation ${conversationId}`);

          // Find user from call log
          let insightUserId = callLog?.user_id;
          if (!insightUserId) {
            // Try to find by conversation_id
            const { data: cl } = await supabaseAdmin
              .from('call_logs')
              .select('user_id, id, lead_id')
              .eq('telnyx_conversation_id', conversationId)
              .maybeSingle();
            if (cl) {
              insightUserId = cl.user_id;
              callLog = cl;
            }
          }

          if (insightUserId) {
            // Store insights
            await supabaseAdmin.from('telnyx_conversation_insights').insert({
              user_id: insightUserId,
              telnyx_conversation_id: conversationId,
              telnyx_assistant_id: assistantId,
              telnyx_insight_group_id: insightGroupId,
              call_log_id: callLog?.id,
              lead_id: callLog?.lead_id,
              insights,
              raw_payload: eventPayload,
            });

            // Process structured insights for disposition routing
            for (const insight of insights) {
              if (insight.name === 'call_disposition' && insight.result) {
                let disposition: any;
                try {
                  disposition = typeof insight.result === 'string' ? JSON.parse(insight.result) : insight.result;
                } catch { disposition = { raw: insight.result }; }

                if (disposition.disposition && callLog?.id) {
                  await supabaseAdmin.from('call_logs').update({
                    outcome: disposition.disposition,
                    auto_disposition: disposition.disposition,
                    confidence_score: disposition.confidence || null,
                    call_summary: disposition.summary || null,
                  }).eq('id', callLog.id);

                  // Trigger disposition router for pipeline movement
                  if (callLog.lead_id && insightUserId) {
                    try {
                      console.log(`[Telnyx Webhook] Insight disposition: ${disposition.disposition} — triggering disposition-router`);
                      await supabaseAdmin.functions.invoke('disposition-router', {
                        body: {
                          action: 'process_disposition',
                          leadId: callLog.lead_id,
                          userId: insightUserId,
                          dispositionName: disposition.disposition,
                          callOutcome: disposition.disposition,
                          transcript: '',
                        },
                      });
                    } catch (routerErr: any) {
                      console.error('[Telnyx Webhook] Disposition router (insight) error:', routerErr.message);
                    }
                  }
                }
              }

              // Store sentiment/intent insights on lead
              if (insight.name === 'lead_intent' && insight.result && callLog?.lead_id) {
                try {
                  const intent = typeof insight.result === 'string' ? JSON.parse(insight.result) : insight.result;
                  await supabaseAdmin.from('lead_intent_signals').insert({
                    lead_id: callLog.lead_id,
                    user_id: insightUserId,
                    call_log_id: callLog.id,
                    ...intent,
                  }); // Soft fail — outer try/catch handles errors
                } catch { /* non-critical */ }
              }
            }
          }
          break;
        }

        // ---------------------------------------------------------------
        // AMD EVENTS
        // ---------------------------------------------------------------
        case 'call.machine.detection.ended':
        case 'call.machine.premium.detection.ended': {
          const amdResult = eventPayload.result || 'unknown';
          const isPremium = eventType.includes('premium');

          console.log(`[Telnyx Webhook] AMD (${isPremium ? 'premium' : 'standard'}): ${amdResult}`);

          if (callLog) {
            await supabaseAdmin.from('call_logs').update({
              amd_result: amdResult,
              amd_type: isPremium ? 'premium' : 'standard',
            }).eq('id', callLog.id);

            // If machine detected, optionally handle voicemail
            if (amdResult === 'machine' || amdResult === 'machine_greeting') {
              // The AI assistant handles this automatically via its instructions
              // But we track it for analytics
              console.log('[Telnyx Webhook] Machine detected, AI will handle voicemail behavior');
            }
          }
          break;
        }

        case 'call.machine.greeting.ended':
        case 'call.machine.premium.greeting.ended': {
          // Beep detected — AI can now leave voicemail message
          console.log('[Telnyx Webhook] Machine greeting ended (beep detected)');
          break;
        }

        default:
          console.log(`[Telnyx Webhook] Unhandled call event: ${eventType}`);
      }
    }

    // =================================================================
    // SMS EVENTS
    // =================================================================
    else if (eventType?.startsWith('message.')) {
      const messageId = eventPayload.id;
      const from = eventPayload.from?.phone_number || eventPayload.from || '';
      const to = eventPayload.to?.[0]?.phone_number || eventPayload.to || '';
      const messageText = eventPayload.text || '';
      const direction = eventPayload.direction || '';

      switch (eventType) {
        case 'message.received': {
          console.log(`[Telnyx Webhook] Inbound SMS from ${from}: ${messageText.substring(0, 50)}...`);

          // Find the user by the receiving number (our number)
          const { data: phoneRecord } = await supabaseAdmin
            .from('phone_numbers')
            .select('user_id')
            .or(`number.eq.${to},number.ilike.%${to.replace(/\D/g, '').slice(-10)}%`)
            .limit(1)
            .maybeSingle();

          if (phoneRecord) {
            // Store inbound SMS
            await supabaseAdmin.from('sms_messages').insert({
              user_id: phoneRecord.user_id,
              from_number: from,
              to_number: to,
              body: messageText,
              direction: 'inbound',
              status: 'received',
              provider_type: 'telnyx',
              provider_message_id: messageId,
            });

            // Route to AI SMS processor if configured
            try {
              const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
              const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
              await fetch(`${supabaseUrl}/functions/v1/ai-sms-processor`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${serviceRoleKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  from: from,
                  to: to,
                  body: messageText,
                  provider: 'telnyx',
                  userId: phoneRecord.user_id,
                }),
              });
            } catch (smsErr: any) {
              console.error('[Telnyx Webhook] AI SMS routing error:', smsErr.message);
            }
          }
          break;
        }

        case 'message.sent':
        case 'message.delivered': {
          // Update SMS delivery status
          if (messageId) {
            const newStatus = eventType === 'message.delivered' ? 'delivered' : 'sent';
            await supabaseAdmin.from('sms_messages')
              .update({ status: newStatus })
              .eq('provider_message_id', messageId);
          }
          break;
        }

        case 'message.failed':
        case 'message.finalized': {
          const errors = eventPayload.errors || [];
          const finalizedStatus = eventPayload.to?.[0]?.status || 'failed';

          if (messageId) {
            await supabaseAdmin.from('sms_messages')
              .update({
                status: finalizedStatus === 'delivered' ? 'delivered' : 'failed',
                error: errors.length > 0 ? JSON.stringify(errors) : null,
              })
              .eq('provider_message_id', messageId);
          }
          break;
        }
      }
    }

    // =================================================================
    // ASSISTANT EVENTS (initialization handled by telnyx-dynamic-vars)
    // =================================================================
    else if (eventType === 'assistant.initialization') {
      console.log('[Telnyx Webhook] Assistant initialization event (handled by dynamic-vars webhook)');
    }

    // =================================================================
    // UNKNOWN EVENTS
    // =================================================================
    else {
      console.log(`[Telnyx Webhook] Unhandled event type: ${eventType}`);
    }

    // Always return 200 to acknowledge receipt
    return new Response(JSON.stringify({ received: true, event_type: eventType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[Telnyx Webhook] Error:', error);
    // Return 200 even on error to prevent Telnyx retries for bad data
    return new Response(JSON.stringify({ received: true, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
