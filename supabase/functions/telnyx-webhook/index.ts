/**
 * Telnyx Webhook Handler
 * 
 * Handles incoming webhooks from Telnyx for:
 * - Call status updates
 * - SMS delivery/receive events
 * - RVM status updates
 * 
 * TODO: Complete implementation in PR B
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook signature (TODO: implement in PR B)
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET_TELNYX');
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');
    
    console.log('[Telnyx Webhook] Received request');
    console.log('[Telnyx Webhook] Signature present:', !!signature);
    console.log('[Telnyx Webhook] Webhook secret configured:', !!webhookSecret);

    // TODO: Implement signature verification
    // if (webhookSecret && signature && timestamp) {
    //   const isValid = verifyTelnyxSignature(payload, signature, timestamp, webhookSecret);
    //   if (!isValid) {
    //     return new Response('Invalid signature', { status: 401, headers: corsHeaders });
    //   }
    // }

    const payload: TelnyxWebhookPayload = await req.json();
    console.log('[Telnyx Webhook] Event type:', payload.data.event_type);
    console.log('[Telnyx Webhook] Event ID:', payload.data.id);

    // Initialize Supabase client with service role for backend operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Normalize and process event
    const eventType = payload.data.event_type;
    const eventPayload = payload.data.payload;

    // Handle different event types
    switch (eventType) {
      // Call events
      case 'call.initiated':
      case 'call.ringing':
      case 'call.answered':
      case 'call.hangup':
        console.log('[Telnyx Webhook] Processing call event:', eventType);
        // TODO: Update call_logs table
        // TODO: Update call_signatures if STIR/SHAKEN data present
        break;

      // SMS events
      case 'message.sent':
      case 'message.delivered':
      case 'message.failed':
      case 'message.received':
        console.log('[Telnyx Webhook] Processing SMS event:', eventType);
        // TODO: Update sms_messages table
        break;

      // RVM events (if supported)
      case 'voicemail.detected':
        console.log('[Telnyx Webhook] Processing voicemail event');
        // TODO: Update rvm_queue table
        break;

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
