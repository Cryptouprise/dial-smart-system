import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ error: 'Supabase not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Authentication failed', details: authError?.message || 'Invalid session' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const body = await req.json().catch(() => ({}));
    const from = body.from || body.callerId;
    const to = body.to || body.phoneNumber;
    const twimlUrl = body.twimlUrl || body.url; // URL Twilio will request for TwiML

    if (!from || !to) {
      return new Response(JSON.stringify({ error: 'Missing from or to phone numbers' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_AUTH_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const params = new URLSearchParams();
    params.append('From', from);
    params.append('To', to);
    if (twimlUrl) params.append('Url', twimlUrl);

    const creds = `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`;
    const basicAuth = base64Encode(new TextEncoder().encode(creds));
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`;

    const resp = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const text = await resp.text();
    const contentType = resp.headers.get('content-type') || '';
    let data: any = null;
    if (contentType.includes('application/json')) {
      data = JSON.parse(text);
    } else {
      data = { raw: text };
    }

    if (!resp.ok) {
      console.error('Twilio call create failed', resp.status, data);
      return new Response(JSON.stringify({ error: 'Twilio call creation failed', status: resp.status, details: data }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Optionally record call in DB
    try {
      await supabaseAdmin.from('call_logs').insert({ user_id: user.id, phone_number: to, caller_id: from, status: 'initiated', external_response: data }).select();
    } catch (e) {
      console.warn('Failed to insert call log:', e?.message || e);
    }

    return new Response(JSON.stringify({ success: true, twilio: data }), { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error('twilio-outbound-call error:', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});