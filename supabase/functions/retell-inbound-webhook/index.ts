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
    // We look up by to_number (the Retell number being called, which is the transfer target)
    console.log('[Retell Inbound Webhook] Checking transfer context for to_number:', toNumber);
    
    const { data: transferCtx, error: transferCtxError } = await supabase
      .from('retell_transfer_context')
      .select('lead_id, lead_snapshot, from_number')
      .eq('user_id', userId)
      .eq('to_number', toNumber)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (transferCtxError) {
      console.error('[Retell Inbound Webhook] Transfer context lookup error:', transferCtxError);
    }

    if (transferCtx && transferCtx.lead_snapshot) {
      console.log('[Retell Inbound Webhook] Found transfer context! Lead ID:', transferCtx.lead_id, 'Original caller:', transferCtx.from_number);
      console.log('[Retell Inbound Webhook] Lead snapshot:', JSON.stringify(transferCtx.lead_snapshot));
      lead = { id: transferCtx.lead_id, ...transferCtx.lead_snapshot };

      // IMPORTANT: lead_snapshot may be stale / partial (e.g. missing address).
      // Best-effort: load the latest lead record from DB and merge it in.
      if (transferCtx.lead_id) {
        const { data: dbLead, error: dbLeadError } = await supabase
          .from('leads')
          .select('id, first_name, last_name, email, phone_number, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code')
          .eq('user_id', userId)
          .eq('id', transferCtx.lead_id)
          .maybeSingle();

        if (dbLeadError) {
          console.error('[Retell Inbound Webhook] Lead enrich lookup error:', dbLeadError);
        } else if (dbLead) {
          lead = { ...lead, ...dbLead };
          console.log('[Retell Inbound Webhook] Enriched lead from DB:', dbLead.id);
        }
      }
    } else {
      console.log('[Retell Inbound Webhook] No transfer context found, trying caller lookup');
      
      if (callerFormats.length > 0) {
        const last10 = callerFormats.find(f => f.length === 10) || callerFormats[callerFormats.length - 1];

        const { data: leads, error: leadError } = await supabase
          .from('leads')
          .select('id, first_name, last_name, email, company, lead_source, notes, tags, custom_fields, preferred_contact_time, timezone, address, city, state, zip_code, phone_number')
          .eq('user_id', userId)
          .or(`phone_number.ilike.%${last10}`)
          .order('updated_at', { ascending: false })
          .limit(10);

        if (leadError) {
          console.error('[Retell Inbound Webhook] Lead lookup error:', leadError);
        } else if (leads && leads.length > 0) {
          lead = leads.find((l: any) => l.first_name && String(l.first_name).trim() !== '') || leads[0];
          console.log('[Retell Inbound Webhook] Found lead via caller lookup:', lead?.id, lead?.first_name);
        }
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

    // Address fields
    const address = String(lead?.address || '');
    const city = String(lead?.city || '');
    const state = String(lead?.state || '');
    const zipCode = String(lead?.zip_code || '');
    const fullAddress = [address, city, state, zipCode].filter(Boolean).join(', ');

    // During transfers, Retell's from_number is often our Twilio number (not the lead).
    // Prefer the lead phone from transfer context / lead snapshot when available.
    const phone = String((lead as any)?.phone_number || fromNumber || '');

    // Generate current time in user's timezone for agent awareness
    const currentTimeFormatted = new Date().toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
    const currentTimeIso = new Date().toISOString();
    const currentDateYmd = new Date().toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
    const currentDayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' });

    const dynamicVariables: Record<string, string> = {
      // CRITICAL: Current time variables so agent always knows the date/time
      current_time: currentTimeFormatted,
      current_time_iso: currentTimeIso,
      current_timezone: timezone,
      current_date_ymd: currentDateYmd,
      current_day_of_week: currentDayOfWeek,

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

    // PROOF LOGGING - Easy to verify address is being returned correctly
    console.log('[Retell Inbound Webhook] ===== PROOF OF ADDRESS INJECTION =====');
    console.log('[Retell Inbound Webhook] to_number:', toNumber);
    console.log('[Retell Inbound Webhook] from_number:', fromNumber);
    console.log('[Retell Inbound Webhook] user_id:', userId);
    console.log('[Retell Inbound Webhook] lead_id:', lead?.id || null);
    console.log('[Retell Inbound Webhook] lead_name:', fullName || '(no name)');
    console.log('[Retell Inbound Webhook] RAW ADDRESS FIELDS: address=', address, 'city=', city, 'state=', state, 'zip=', zipCode);
    console.log('[Retell Inbound Webhook] full_address:', fullAddress);
    console.log('[Retell Inbound Webhook] contact.address1:', dynamicVariables['contact.address1']);
    console.log('[Retell Inbound Webhook] contact.postal_code:', dynamicVariables['contact.postal_code']);
    console.log('[Retell Inbound Webhook] Total dynamic variable keys:', Object.keys(dynamicVariables).length);
    console.log('[Retell Inbound Webhook] =========================================');

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
