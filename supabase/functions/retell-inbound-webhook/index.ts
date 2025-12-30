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

    // 2) Try to find the lead by caller number (or via retell_transfer_context if transfer)
    let lead: any = null;

    // First check if there's a recent transfer context for this receiving number (within 15 min)
    // This handles the case where caller ID during transfer is our Twilio number instead of the lead's.
    const { data: transferCtx } = await supabase
      .from('retell_transfer_context')
      .select('lead_id, lead_snapshot')
      .eq('user_id', userId)
      .eq('to_number', toNumber)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transferCtx && transferCtx.lead_snapshot) {
      console.log('[Retell Inbound Webhook] Found transfer context, using lead snapshot');
      lead = { id: transferCtx.lead_id, ...transferCtx.lead_snapshot };
    } else if (callerFormats.length > 0) {
      const last10 = callerFormats.find(f => f.length === 10) || callerFormats[callerFormats.length - 1];

      const { data: leads, error: leadError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, email, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone')
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
    const phone = String(fromNumber || '');

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

      // Alternative formats some systems use
      'customer.first_name': firstName,
      'customer.last_name': lastName,
      'customer.name': fullName,
      'customer.email': email,
      'customer.phone': phone,
      'customer.company': company,

      // Lead prefix
      'lead.first_name': firstName,
      'lead.last_name': lastName,
      'lead.name': fullName,
      'lead.email': email,
      'lead.phone': phone,
      'lead.company': company,
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
