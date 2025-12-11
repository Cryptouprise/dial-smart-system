import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Twilio Inbound Call Handler
 */

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[Inbound] ${req.method} ${url.pathname}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Parse Twilio form data
  const body = await req.text();
  const params = new URLSearchParams(body);
  const from = params.get('From') || '';
  const to = params.get('To') || '';
  const digits = params.get('Digits') || '';
  const action = url.searchParams.get('action') || 'greeting';
  
  console.log(`[Inbound] From: ${from}, To: ${to}, Action: ${action}, Digits: "${digits}"`);

  const dtmfUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf`;

  let twiml: string;

  if (action === 'dtmf') {
    // Handle DTMF response
    let message = 'Invalid option. Goodbye.';
    if (digits === '1') message = 'Connecting you now.';
    else if (digits === '2') message = 'We will call you back. Goodbye.';
    else if (digits === '3') message = 'You have been removed from our list. Goodbye.';
    
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${message}</Say><Hangup/></Response>`;
    
    // Log DTMF asynchronously (don't await)
    logCallAsync(supabaseUrl, supabaseServiceKey, from, to, `DTMF: ${digits || 'timeout'}`);
    
    // Handle DNC opt-out
    if (digits === '3') {
      addToDncAsync(supabaseUrl, supabaseServiceKey, from, to);
    }
  } else {
    // Initial greeting with Gather
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10"><Say voice="alice">Thank you for calling back. Press 1 to speak with an agent. Press 2 to request a callback. Press 3 to be removed from our list.</Say></Gather><Say voice="alice">We did not receive a response. Goodbye.</Say><Hangup/></Response>`;
    
    // Log inbound call asynchronously (don't await)
    logCallAsync(supabaseUrl, supabaseServiceKey, from, to, 'Inbound IVR');
  }

  console.log('[Inbound] Returning TwiML');
  
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
});

// Async helper to log calls without blocking
function logCallAsync(supabaseUrl: string, serviceKey: string, from: string, to: string, notes: string) {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    
    // Find phone number and log
    supabase
      .from('phone_numbers')
      .select('user_id')
      .eq('number', to)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.user_id) {
          supabase.from('call_logs').insert({
            user_id: data.user_id,
            phone_number: from,
            caller_id: to,
            status: 'completed',
            outcome: 'completed',
            notes: notes
          }).then(({ error }) => {
            if (error) console.error('[Inbound] Log error:', error.message);
            else console.log('[Inbound] Call logged');
          });
        }
      });
  } catch (e) {
    console.error('[Inbound] logCallAsync error:', e);
  }
}

// Async helper to add to DNC list
function addToDncAsync(supabaseUrl: string, serviceKey: string, from: string, to: string) {
  try {
    const supabase = createClient(supabaseUrl, serviceKey);
    
    supabase
      .from('phone_numbers')
      .select('user_id')
      .eq('number', to)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.user_id) {
          supabase.from('dnc_list').upsert({
            user_id: data.user_id,
            phone_number: from,
            reason: 'IVR opt-out',
            added_at: new Date().toISOString()
          }, { onConflict: 'user_id,phone_number' }).then(({ error }) => {
            if (error) console.error('[Inbound] DNC error:', error.message);
            else console.log('[Inbound] Added to DNC');
          });
        }
      });
  } catch (e) {
    console.error('[Inbound] addToDncAsync error:', e);
  }
}
