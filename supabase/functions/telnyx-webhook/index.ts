/**
 * Telnyx Webhook Handler
 *
 * Handles incoming webhooks from Telnyx for:
 * - Call status updates (initiated, answered, hangup)
 * - AMD (answering machine detection) results
 * - SMS delivery/receive events
 *
 * Webhook URL: https://emonjusymdripmkvtttc.supabase.co/functions/v1/telnyx-webhook
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, telnyx-signature-ed25519, telnyx-timestamp',
};

interface TelnyxWebhookPayload {
  data: {
    event_type: string;
    id: string;
    occurred_at: string;
    payload: {
      call_control_id?: string;
      call_leg_id?: string;
      call_session_id?: string;
      from?: string;
      to?: string;
      direction?: string;
      state?: string;
      hangup_cause?: string;
      hangup_source?: string;
      start_time?: string;
      end_time?: string;
      duration_secs?: number;
      sip_hangup_cause?: string;
      custom_headers?: Record<string, unknown>;
      // AMD fields
      result?: string; // 'human' | 'machine' | 'not_sure'
      // SMS fields
      id?: string;
      type?: string;
      text?: string;
      messaging_profile_id?: string;
      // Common fields
      [key: string]: unknown;
    };
    record_type: string;
  };
  meta: {
    attempt: number;
    delivered_to: string;
  };
}

// ============= HANGUP CAUSE MAPPING =============
// Maps Telnyx hangup causes to broadcast_queue status values
function mapHangupCauseToStatus(hangupCause: string | undefined): 'completed' | 'failed' | 'no_answer' {
  if (!hangupCause) return 'completed';

  const cause = hangupCause.toLowerCase();

  // No answer causes
  const noAnswerCauses = [
    'no_answer', 'no_user_response', 'no_route_destination',
    'subscriber_absent', 'timeout', 'recovery_on_timer_expire',
    'originator_cancel',
  ];
  if (noAnswerCauses.includes(cause)) return 'no_answer';

  // Failed causes
  const failedCauses = [
    'call_rejected', 'unallocated_number', 'user_busy',
    'normal_temporary_failure', 'network_out_of_order',
    'service_or_option_not_available', 'invalid_number_format',
    'facility_rejected', 'bearer_capability_not_authorized',
    'destination_out_of_order', 'number_changed',
    'facility_not_subscribed', 'outgoing_call_barred',
    'incoming_call_barred', 'incompatible_destination',
    'exchange_routing_error',
  ];
  if (failedCauses.includes(cause)) return 'failed';

  // Normal hangup = completed
  if (cause === 'normal_clearing' || cause === 'normal_event') return 'completed';

  // Default: treat unknown causes as completed (call did connect)
  return 'completed';
}

// ============= PHONE NUMBER NORMALIZATION =============
function normalizePhone(phone: string | undefined): string[] {
  if (!phone) return [];
  // Strip SIP URI if present
  let clean = phone;
  if (clean.toLowerCase().startsWith('sip:')) {
    clean = clean.replace(/^sip:/i, '').split('@')[0];
  }
  if (clean.toLowerCase().startsWith('tel:')) {
    clean = clean.replace(/^tel:/i, '');
  }
  // Remove non-digit except leading +
  clean = clean.replace(/[^\d+]/g, '');
  if (!clean.startsWith('+')) {
    clean = clean.length === 10 ? `+1${clean}` : `+${clean}`;
  }
  return [
    clean,                          // +18324936169
    clean.replace('+', ''),         // 18324936169
    clean.replace(/^\+1/, ''),      // 8324936169
  ];
}

// ============= SIGNATURE VERIFICATION =============
// TODO: Make this mandatory once the Telnyx public key is configured.
// Telnyx uses Ed25519 signatures. The public key is available in the Telnyx portal
// under the webhook settings. For now we log a warning and continue processing.
async function verifyTelnyxSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  webhookSecret: string | null,
): Promise<boolean> {
  if (!signature || !timestamp) {
    console.warn('[Telnyx Webhook] Missing signature or timestamp headers - skipping verification');
    return false;
  }
  if (!webhookSecret) {
    console.warn('[Telnyx Webhook] WEBHOOK_SECRET_TELNYX not configured - skipping verification');
    return false;
  }

  try {
    // Telnyx Ed25519 verification:
    // 1. The signed payload is `timestamp|payload`
    // 2. The signature is base64-encoded Ed25519 signature
    // 3. The public key is the WEBHOOK_SECRET_TELNYX value
    const signedPayload = `${timestamp}|${rawBody}`;

    // Decode the base64 public key and signature
    const publicKeyBytes = Uint8Array.from(atob(webhookSecret), c => c.charCodeAt(0));
    const signatureBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    const encoder = new TextEncoder();
    const payloadBytes = encoder.encode(signedPayload);

    // Import the Ed25519 public key
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKeyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    );

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      cryptoKey,
      signatureBytes,
      payloadBytes,
    );

    return isValid;
  } catch (err) {
    console.warn('[Telnyx Webhook] Signature verification error:', (err as Error).message);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET_TELNYX');
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');

    // Read raw body for signature verification
    const rawBody = await req.text();

    console.log('[Telnyx Webhook] Received request');
    console.log('[Telnyx Webhook] Signature present:', !!signature);
    console.log('[Telnyx Webhook] Webhook secret configured:', !!webhookSecret);

    // Verify webhook signature
    const signatureValid = await verifyTelnyxSignature(rawBody, signature, timestamp, webhookSecret);
    if (!signatureValid) {
      // TODO: Once the public key is confirmed working, return 401 here instead of warning.
      console.warn('[Telnyx Webhook] Signature verification failed or skipped - processing anyway');
    } else {
      console.log('[Telnyx Webhook] Signature verified successfully');
    }

    const payload: TelnyxWebhookPayload = JSON.parse(rawBody);
    const eventType = payload.data.event_type;
    const eventPayload = payload.data.payload;

    console.log('[Telnyx Webhook] Event type:', eventType);
    console.log('[Telnyx Webhook] Event ID:', payload.data.id);
    console.log('[Telnyx Webhook] Call Control ID:', eventPayload.call_control_id);

    // Initialize Supabase client with service role for backend operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Handle different event types
    switch (eventType) {

      // =====================================================================
      // CALL.INITIATED - Call has been initiated, update queue to 'calling'
      // =====================================================================
      case 'call.initiated': {
        console.log('[Telnyx Webhook] Processing call.initiated');

        const callControlId = eventPayload.call_control_id;
        const toPhone = eventPayload.to as string | undefined;

        if (!callControlId) {
          console.warn('[Telnyx Webhook] call.initiated missing call_control_id');
          break;
        }

        // Try to find the queue item by call_sid (call_control_id is stored as call_sid)
        let queueItem: any = null;

        const { data: bySid } = await supabaseAdmin
          .from('broadcast_queue')
          .select('id')
          .eq('call_sid', callControlId)
          .maybeSingle();

        if (bySid) {
          queueItem = bySid;
          console.log(`[Telnyx Webhook] Found queue item by call_sid: ${queueItem.id}`);
        }

        // Fallback: match by phone number if call_sid not found
        if (!queueItem && toPhone) {
          const phoneVariants = normalizePhone(toPhone);
          const { data: byPhone } = await supabaseAdmin
            .from('broadcast_queue')
            .select('id')
            .in('status', ['pending', 'queued'])
            .or(phoneVariants.map(p => `phone_number.eq.${p}`).join(','))
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (byPhone) {
            queueItem = byPhone;
            console.log(`[Telnyx Webhook] Found queue item by phone fallback: ${queueItem.id}`);

            // Store the call_control_id as call_sid for subsequent events
            await supabaseAdmin
              .from('broadcast_queue')
              .update({ call_sid: callControlId })
              .eq('id', queueItem.id);
            console.log(`[Telnyx Webhook] Stored call_sid ${callControlId} on queue item ${queueItem.id}`);
          }
        }

        if (queueItem) {
          const { error: updateError } = await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'calling',
              updated_at: new Date().toISOString(),
            })
            .eq('id', queueItem.id);

          if (updateError) {
            console.error('[Telnyx Webhook] Error updating queue item:', updateError);
          } else {
            console.log(`[Telnyx Webhook] Updated queue item ${queueItem.id} to status: calling`);
          }
        } else {
          console.warn(`[Telnyx Webhook] No queue item found for call_control_id=${callControlId}, to=${toPhone}`);
        }

        break;
      }

      // =====================================================================
      // CALL.ANSWERED - Call was answered, play audio via TeXML response
      // =====================================================================
      case 'call.answered': {
        console.log('[Telnyx Webhook] Processing call.answered');

        const callControlId = eventPayload.call_control_id;

        // Find queue item
        let queueItem: any = null;
        if (callControlId) {
          const { data } = await supabaseAdmin
            .from('broadcast_queue')
            .select('id, broadcast_id')
            .eq('call_sid', callControlId)
            .maybeSingle();
          queueItem = data;
        }

        if (queueItem) {
          const { error: updateError } = await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'answered',
              updated_at: new Date().toISOString(),
            })
            .eq('id', queueItem.id);

          if (updateError) {
            console.error('[Telnyx Webhook] Error updating queue to answered:', updateError);
          } else {
            console.log(`[Telnyx Webhook] Updated queue item ${queueItem.id} to status: answered`);
          }
        } else {
          console.warn(`[Telnyx Webhook] No queue item found for answered call: ${callControlId}`);
        }

        // Extract audio URL from custom_headers (passed during call creation in voice-broadcast-engine)
        const customHeaders = eventPayload.custom_headers || {};
        const audioUrl = customHeaders.audio_url as string | undefined;

        if (audioUrl) {
          console.log(`[Telnyx Webhook] Playing audio: ${audioUrl}`);

          // Respond with TeXML to play the audio file
          const texmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${escapeXml(audioUrl)}</Play>
</Response>`;

          return new Response(texmlResponse, {
            headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
          });
        } else {
          console.warn('[Telnyx Webhook] No audio_url in custom_headers, cannot play audio');
        }

        break;
      }

      // =====================================================================
      // CALL.HANGUP - Call ended, update status based on hangup cause
      // =====================================================================
      case 'call.hangup': {
        console.log('[Telnyx Webhook] Processing call.hangup');

        const callControlId = eventPayload.call_control_id;
        const hangupCause = eventPayload.hangup_cause as string | undefined;
        const durationSecs = eventPayload.duration_secs as number | undefined;

        console.log(`[Telnyx Webhook] Hangup cause: ${hangupCause}, duration: ${durationSecs}s`);

        // Map hangup cause to queue status
        const finalStatus = mapHangupCauseToStatus(hangupCause);
        console.log(`[Telnyx Webhook] Mapped status: ${finalStatus}`);

        // Find queue item with broadcast info
        let queueItem: any = null;
        if (callControlId) {
          const { data } = await supabaseAdmin
            .from('broadcast_queue')
            .select('*, voice_broadcasts(*)')
            .eq('call_sid', callControlId)
            .maybeSingle();
          queueItem = data;
        }

        if (queueItem) {
          // Build queue update
          const queueUpdate: Record<string, any> = {
            status: finalStatus,
            updated_at: new Date().toISOString(),
          };

          if (durationSecs !== undefined && durationSecs > 0) {
            queueUpdate.call_duration_seconds = durationSecs;
          }

          // Retry logic for no_answer / failed (mirrors call-tracking-webhook pattern)
          const retryEligibleStatuses = ['no_answer', 'failed'];
          if (retryEligibleStatuses.includes(finalStatus)) {
            const currentAttempts = (queueItem.attempts || 0) + 1;
            const maxAttempts = queueItem.max_attempts || queueItem.voice_broadcasts?.max_attempts || 1;
            const retryDelayMinutes = queueItem.voice_broadcasts?.retry_delay_minutes || 60;

            if (currentAttempts < maxAttempts) {
              const scheduledAt = new Date();
              scheduledAt.setMinutes(scheduledAt.getMinutes() + retryDelayMinutes);

              console.log(`[Telnyx Webhook] Retry eligible: attempt ${currentAttempts}/${maxAttempts}, scheduling retry for ${scheduledAt.toISOString()}`);

              queueUpdate.status = 'pending';
              queueUpdate.scheduled_at = scheduledAt.toISOString();
              queueUpdate.attempts = currentAttempts;
            } else {
              console.log(`[Telnyx Webhook] Max attempts reached (${currentAttempts}/${maxAttempts}), marking as ${finalStatus}`);
              queueUpdate.attempts = currentAttempts;
            }
          }

          const { error: updateError } = await supabaseAdmin
            .from('broadcast_queue')
            .update(queueUpdate)
            .eq('id', queueItem.id);

          if (updateError) {
            console.error('[Telnyx Webhook] Error updating queue on hangup:', updateError);
          } else {
            console.log(`[Telnyx Webhook] Updated queue item ${queueItem.id} to status: ${queueUpdate.status}`);
          }

          // Update voice_broadcasts counters
          if (queueItem.voice_broadcasts && queueItem.broadcast_id) {
            const broadcast = queueItem.voice_broadcasts;
            const statsUpdate: Record<string, number> = {
              calls_made: (broadcast.calls_made || 0) + 1,
            };

            // Only count as answered if the call was actually answered (completed with duration > 0)
            if (finalStatus === 'completed' && durationSecs && durationSecs > 0) {
              statsUpdate.calls_answered = (broadcast.calls_answered || 0) + 1;
            }

            const { error: statsError } = await supabaseAdmin
              .from('voice_broadcasts')
              .update(statsUpdate)
              .eq('id', queueItem.broadcast_id);

            if (statsError) {
              console.error('[Telnyx Webhook] Error updating broadcast stats:', statsError);
            } else {
              console.log(`[Telnyx Webhook] Updated broadcast stats:`, statsUpdate);
            }
          }

          // Update lead status if applicable
          if (queueItem.lead_id) {
            const leadUpdate: Record<string, any> = {
              last_contacted_at: new Date().toISOString(),
            };

            if (finalStatus === 'completed' && durationSecs && durationSecs > 0) {
              leadUpdate.status = 'contacted';
              leadUpdate.next_callback_at = null;
              console.log(`[Telnyx Webhook] Lead ${queueItem.lead_id} answered, status -> contacted`);
            } else {
              console.log(`[Telnyx Webhook] Lead ${queueItem.lead_id} not reached (${finalStatus}), keeping current status`);
            }

            const { error: leadError } = await supabaseAdmin
              .from('leads')
              .update(leadUpdate)
              .eq('id', queueItem.lead_id);

            if (leadError) {
              console.error('[Telnyx Webhook] Error updating lead:', leadError);
            }
          }
        } else {
          console.warn(`[Telnyx Webhook] No queue item found for hangup: ${callControlId}`);
        }

        break;
      }

      // =====================================================================
      // CALL.MACHINE.DETECTION.ENDED - AMD result
      // =====================================================================
      case 'call.machine.detection.ended': {
        console.log('[Telnyx Webhook] Processing AMD result');

        const callControlId = eventPayload.call_control_id;
        const amdResult = eventPayload.result as string | undefined; // 'human', 'machine', 'not_sure'

        console.log(`[Telnyx Webhook] AMD result: ${amdResult} for call ${callControlId}`);

        if (callControlId && amdResult) {
          // Map Telnyx AMD result to our format
          const mappedResult = amdResult === 'machine' ? 'machine_start'
            : amdResult === 'human' ? 'human'
            : 'unknown';

          const updateData: Record<string, any> = {
            amd_result: mappedResult,
            updated_at: new Date().toISOString(),
          };

          // If machine detected, update status to voicemail
          if (amdResult === 'machine') {
            updateData.status = 'voicemail';
          }

          const { error: updateError } = await supabaseAdmin
            .from('broadcast_queue')
            .update(updateData)
            .eq('call_sid', callControlId);

          if (updateError) {
            console.error('[Telnyx Webhook] Error updating AMD result:', updateError);
          } else {
            console.log(`[Telnyx Webhook] Updated AMD result to '${mappedResult}' for call ${callControlId}`);
          }
        }

        break;
      }

      // =====================================================================
      // CALL.RINGING - Call is ringing (transitional state)
      // =====================================================================
      case 'call.ringing': {
        console.log('[Telnyx Webhook] Call ringing:', eventPayload.call_control_id);

        // Optionally update to 'calling' if not already set
        if (eventPayload.call_control_id) {
          await supabaseAdmin
            .from('broadcast_queue')
            .update({
              status: 'calling',
              updated_at: new Date().toISOString(),
            })
            .eq('call_sid', eventPayload.call_control_id)
            .eq('status', 'pending'); // Only update if still pending
        }

        break;
      }

      // =====================================================================
      // MESSAGE.RECEIVED - Inbound SMS from Telnyx
      // =====================================================================
      case 'message.received': {
        console.log('[Telnyx Webhook] Processing inbound SMS');

        const from = (eventPayload.from as any)?.phone_number || eventPayload.from as string;
        const to = (eventPayload.to as any)?.[0]?.phone_number || (eventPayload.to as any)?.phone_number || eventPayload.to as string;
        const messageBody = eventPayload.text || '';
        const messageId = eventPayload.id;
        const messagingProfileId = eventPayload.messaging_profile_id;

        console.log(`[Telnyx Webhook] SMS from ${from} to ${to}: "${messageBody?.substring(0, 50)}..."`);

        // Check for duplicate
        if (messageId) {
          const { data: existing } = await supabaseAdmin
            .from('sms_messages')
            .select('id')
            .eq('provider_message_id', messageId)
            .maybeSingle();

          if (existing) {
            console.log('[Telnyx Webhook] Duplicate SMS webhook, skipping:', messageId);
            break;
          }
        }

        // Find user/owner of the receiving number
        let userId: string | null = null;
        if (to) {
          const toVariants = normalizePhone(to);
          const { data: phoneRecord } = await supabaseAdmin
            .from('phone_numbers')
            .select('user_id')
            .or(toVariants.map(p => `number.eq.${p}`).join(','))
            .limit(1)
            .maybeSingle();

          if (phoneRecord) {
            userId = phoneRecord.user_id;
          }
        }

        // Store the inbound message
        const { data: message, error: msgError } = await supabaseAdmin
          .from('sms_messages')
          .insert({
            user_id: userId,
            to_number: to,
            from_number: from,
            body: messageBody,
            direction: 'inbound',
            status: 'received',
            provider_type: 'telnyx',
            provider_message_id: messageId,
            metadata: {
              messaging_profile_id: messagingProfileId,
              event_id: payload.data.id,
            },
          })
          .select()
          .maybeSingle();

        if (msgError) {
          console.error('[Telnyx Webhook] Failed to store inbound SMS:', msgError);
        } else {
          console.log('[Telnyx Webhook] Inbound SMS stored:', message?.id);
        }

        break;
      }

      // =====================================================================
      // MESSAGE.SENT / MESSAGE.FINALIZED - Outbound SMS delivery status
      // =====================================================================
      case 'message.sent':
      case 'message.finalized': {
        console.log(`[Telnyx Webhook] Processing ${eventType}`);

        const messageId = eventPayload.id;
        const toPayload = eventPayload.to as any;
        const deliveryStatus = toPayload?.[0]?.status || eventPayload.state || 'sent';

        // Map Telnyx delivery status to our status values
        const statusMapping: Record<string, string> = {
          'queued': 'queued',
          'sending': 'sending',
          'sent': 'sent',
          'delivered': 'delivered',
          'sending_failed': 'failed',
          'delivery_failed': 'failed',
          'delivery_unconfirmed': 'sent', // Best-effort delivery
        };
        const mappedStatus = statusMapping[deliveryStatus] || deliveryStatus;

        if (messageId) {
          const { error: updateError } = await supabaseAdmin
            .from('sms_messages')
            .update({
              status: mappedStatus,
              updated_at: new Date().toISOString(),
            })
            .eq('provider_message_id', messageId);

          if (updateError) {
            console.error(`[Telnyx Webhook] Error updating SMS status:`, updateError);
          } else {
            console.log(`[Telnyx Webhook] Updated SMS ${messageId} status to: ${mappedStatus}`);
          }
        }

        break;
      }

      // =====================================================================
      // MESSAGE.DELIVERED - Delivery confirmation
      // =====================================================================
      case 'message.delivered': {
        console.log('[Telnyx Webhook] Processing message.delivered');

        const messageId = eventPayload.id;

        if (messageId) {
          const { error: updateError } = await supabaseAdmin
            .from('sms_messages')
            .update({
              status: 'delivered',
              updated_at: new Date().toISOString(),
            })
            .eq('provider_message_id', messageId);

          if (updateError) {
            console.error('[Telnyx Webhook] Error updating SMS delivered status:', updateError);
          } else {
            console.log(`[Telnyx Webhook] SMS ${messageId} marked as delivered`);
          }
        }

        break;
      }

      // =====================================================================
      // MESSAGE.FAILED - SMS delivery failure
      // =====================================================================
      case 'message.failed': {
        console.log('[Telnyx Webhook] Processing message.failed');

        const messageId = eventPayload.id;
        const errors = eventPayload.errors as any;

        if (messageId) {
          const { error: updateError } = await supabaseAdmin
            .from('sms_messages')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
              metadata: {
                failure_reason: errors?.[0]?.detail || 'Unknown failure',
                failure_code: errors?.[0]?.code,
              },
            })
            .eq('provider_message_id', messageId);

          if (updateError) {
            console.error('[Telnyx Webhook] Error updating SMS failed status:', updateError);
          } else {
            console.log(`[Telnyx Webhook] SMS ${messageId} marked as failed:`, errors?.[0]?.detail);
          }
        }

        break;
      }

      // =====================================================================
      // UNHANDLED EVENT
      // =====================================================================
      default:
        console.log('[Telnyx Webhook] Unhandled event type:', eventType);
    }

    return new Response(JSON.stringify({ received: true, event_type: eventType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Telnyx Webhook] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ============= UTILITY =============
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
