import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Retell Inbound Webhook
// This is called BEFORE the call is connected, so it's the reliable place to set
// dynamic variables like {{first_name}} for the greeting.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type InboundWebhookPayload = {
  event: string;
  call_inbound?: {
    agent_id?: string;
    agent_version?: number;
    from_number?: string;
    to_number?: string;
  };
};

function normalizePhoneFormats(phone: string): string[] {
  if (!phone) return [];
  const digitsOnly = phone.replace(/\D/g, '');
  const last10 = digitsOnly.slice(-10);

  return [
    phone,
    `+${digitsOnly}`,
    `+1${last10}`,
    digitsOnly,
    `1${last10}`,
    last10,
  ].filter((v, i, a) => v && a.indexOf(v) === i);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase configuration missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const payload: InboundWebhookPayload = await req.json();
    console.log('[Retell Inbound Webhook] Event:', payload.event);

    if (payload.event !== 'call_inbound' || !payload.call_inbound) {
      return new Response(JSON.stringify({ received: true, processed: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const fromNumber = payload.call_inbound.from_number || '';
    const toNumber = payload.call_inbound.to_number || '';

    console.log('[Retell Inbound Webhook] From:', fromNumber, 'To:', toNumber);

    const callerFormats = normalizePhoneFormats(fromNumber);
    const receivingFormats = normalizePhoneFormats(toNumber);

    // 1) Identify the owner user_id by matching our DB phone_numbers.number to Retell's to_number
    let userId: string | null = null;

    if (receivingFormats.length > 0) {
      const phoneOrQuery = receivingFormats.map(f => `number.eq.${f}`).join(',');

      const { data: phoneNumber, error: phoneError } = await supabase
        .from('phone_numbers')
        .select('user_id')
        .or(phoneOrQuery)
        .limit(1)
        .maybeSingle();

      if (phoneError) {
        console.error('[Retell Inbound Webhook] Phone lookup error:', phoneError);
      }

      userId = phoneNumber?.user_id || null;
    }

    if (!userId) {
      console.warn('[Retell Inbound Webhook] No user found for receiving number:', toNumber);
      // Return empty config so Retell can fall back to its configured inbound agent
      return new Response(JSON.stringify({ call_inbound: {} }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Try to find the lead by caller number
    let lead: any = null;

    if (callerFormats.length > 0) {
      const last10 = callerFormats.find(f => f.length === 10) || callerFormats[callerFormats.length - 1];

      const { data: leads, error: leadError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, company, lead_source, notes, tags, preferred_contact_time, timezone')
        .eq('user_id', userId)
        .or(`phone_number.ilike.%${last10}`)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (leadError) {
        console.error('[Retell Inbound Webhook] Lead lookup error:', leadError);
      } else if (leads && leads.length > 0) {
        lead = leads.find((l: any) => l.first_name && String(l.first_name).trim() !== '') || leads[0];
      }
    }

    const dynamicVariables: Record<string, string> = {
      first_name: String(lead?.first_name || ''),
      last_name: String(lead?.last_name || ''),
      full_name: String([lead?.first_name, lead?.last_name].filter(Boolean).join(' ') || ''),
      email: String(lead?.email || ''),
      company: String(lead?.company || ''),
      lead_source: String(lead?.lead_source || ''),
      notes: String(lead?.notes || ''),
      tags: String(Array.isArray(lead?.tags) ? lead.tags.join(', ') : ''),
      preferred_contact_time: String(lead?.preferred_contact_time || ''),
      timezone: String(lead?.timezone || 'America/New_York'),
    };

    console.log('[Retell Inbound Webhook] Matched user_id:', userId, 'lead_id:', lead?.id || null);

    return new Response(JSON.stringify({
      call_inbound: {
        dynamic_variables: dynamicVariables,
        metadata: {
          user_id: userId,
          lead_id: lead?.id || null,
        },
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[Retell Inbound Webhook] Fatal error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
