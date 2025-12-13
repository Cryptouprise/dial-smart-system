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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Say>System configuration error</Say></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
  }

  // Parse Twilio form data
  const body = await req.text();
  const params = new URLSearchParams(body);
  const from = params.get('From') || '';
  const to = params.get('To') || '';
  const digits = params.get('Digits') || '';
  const action = url.searchParams.get('action') || 'greeting';
  
  console.log(`[Inbound] From: ${from}, To: ${to}, Action: ${action}, Digits: "${digits}"`);

  const dtmfUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf`;
  const ttsUrl = `${supabaseUrl}/functions/v1/twilio-tts-audio`;

  let twiml: string;

  if (action === 'dtmf') {
    // Handle DTMF response with ElevenLabs TTS
    let msgKey = 'invalid';
    if (digits === '1') msgKey = 'connecting';
    else if (digits === '2') msgKey = 'callback';
    else if (digits === '3') msgKey = 'removed';
    
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${ttsUrl}?msg=${msgKey}</Play><Hangup/></Response>`;
    
    // Log DTMF asynchronously (don't await)
    logCallAsync(supabaseUrl, supabaseServiceKey, from, to, `DTMF: ${digits || 'timeout'}`);
    
    // Handle DNC opt-out
    if (digits === '3') {
      addToDncAsync(supabaseUrl, supabaseServiceKey, from, to);
    }
  } else {
    // Initial greeting with Gather using ElevenLabs TTS
    twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10"><Play>${ttsUrl}?msg=greeting</Play></Gather><Play>${ttsUrl}?msg=no_response</Play><Hangup/></Response>`;
    
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
