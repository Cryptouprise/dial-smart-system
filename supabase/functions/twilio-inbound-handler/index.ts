import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Twilio Inbound Call Handler with ElevenLabs TTS
 * Uses <Play> with ElevenLabs-generated audio instead of <Say>
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to normalize phone numbers for database lookup
function normalizePhoneNumber(phone: string): string[] {
  const cleaned = phone.replace(/\D/g, '');
  return [
    phone,
    `+${cleaned}`,
    cleaned,
    cleaned.slice(-10),
    `+1${cleaned.slice(-10)}`,
  ];
}

// Generate TwiML with ElevenLabs audio
function twimlWithAudio(supabaseUrl: string, msgKey: string, extraTwiml: string = ''): string {
  const audioUrl = `${supabaseUrl}/functions/v1/twilio-tts-audio?msg=${msgKey}`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${audioUrl}</Play>${extraTwiml}</Response>`;
}

// Generate simple TwiML response
function twiml(content: string): Response {
  console.log('[Inbound] TwiML:', content.substring(0, 300));
  return new Response(content, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

serve(async (req) => {
  const url = new URL(req.url);
  console.log(`[Inbound] ${req.method} ${url.pathname}${url.search}`);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse Twilio form data
    const body = await req.text();
    const params = new URLSearchParams(body);
    
    const from = params.get('From') || '';
    const to = params.get('To') || '';
    const callSid = params.get('CallSid') || '';
    const digits = params.get('Digits') || '';
    const callStatus = params.get('CallStatus') || '';
    
    console.log(`[Inbound] From: ${from}, To: ${to}, Digits: ${digits}, Status: ${callStatus}`);

    // Get action from URL
    const action = url.searchParams.get('action') || 'greeting';
    const transferNumber = url.searchParams.get('transfer') || '';
    
    console.log(`[Inbound] Action: ${action}`);

    // Find phone number in database
    let phoneNumber = null;
    const numberFormats = normalizePhoneNumber(to);
    
    for (const format of numberFormats) {
      const { data } = await supabase
        .from('phone_numbers')
        .select('*')
        .eq('number', format)
        .maybeSingle();
      
      if (data) {
        phoneNumber = data;
        console.log(`[Inbound] Phone found: ${data.id}`);
        break;
      }
    }

    // Handle DTMF response
    if (action === 'dtmf') {
      console.log(`[Inbound] DTMF: "${digits}"`);
      
      // Log asynchronously
      if (phoneNumber?.user_id) {
        supabase.from('call_logs').insert({
          user_id: phoneNumber.user_id,
          phone_number: from,
          caller_id: to,
          status: 'answered',
          outcome: 'answered',
          notes: `IVR pressed: ${digits || 'timeout'}`
        }).then(() => console.log('[Inbound] DTMF logged'));
      }

      if (!digits) {
        return twiml(twimlWithAudio(supabaseUrl, 'no_input', '<Hangup/>'));
      }

      switch (digits) {
        case '1':
          if (transferNumber) {
            return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${supabaseUrl}/functions/v1/twilio-tts-audio?msg=connecting</Play><Dial timeout="30"><Number>${transferNumber}</Number></Dial><Play>${supabaseUrl}/functions/v1/twilio-tts-audio?msg=transfer_failed</Play><Hangup/></Response>`);
          }
          return twiml(twimlWithAudio(supabaseUrl, 'interest', '<Hangup/>'));
        
        case '2':
          return twiml(twimlWithAudio(supabaseUrl, 'callback', '<Hangup/>'));
        
        case '3':
          if (phoneNumber?.user_id) {
            await supabase.from('dnc_list').upsert({
              user_id: phoneNumber.user_id,
              phone_number: from,
              reason: 'IVR opt-out',
              added_at: new Date().toISOString()
            }, { onConflict: 'user_id,phone_number' });
            console.log('[Inbound] Added to DNC:', from);
          }
          return twiml(twimlWithAudio(supabaseUrl, 'dnc', '<Hangup/>'));
        
        default:
          return twiml(twimlWithAudio(supabaseUrl, 'invalid', '<Hangup/>'));
      }
    }

    // Log incoming call
    if (phoneNumber?.user_id) {
      supabase.from('call_logs').insert({
        user_id: phoneNumber.user_id,
        phone_number: from,
        caller_id: to,
        status: 'initiated',
        outcome: 'answered',
        notes: 'Inbound call - IVR started'
      }).then(() => console.log('[Inbound] Call logged'));
    }

    // Build DTMF callback URL
    const dtmfUrl = `${supabaseUrl}/functions/v1/twilio-inbound-handler?action=dtmf&transfer=${encodeURIComponent(transferNumber)}`;
    const greetingAudioUrl = `${supabaseUrl}/functions/v1/twilio-tts-audio?msg=greeting`;
    const noInputAudioUrl = `${supabaseUrl}/functions/v1/twilio-tts-audio?msg=no_input`;

    // Return IVR with Gather and ElevenLabs audio
    const ivrTwiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10"><Play>${greetingAudioUrl}</Play></Gather><Play>${noInputAudioUrl}</Play><Hangup/></Response>`;

    console.log('[Inbound] Returning IVR with ElevenLabs audio');
    return twiml(ivrTwiml);

  } catch (error: any) {
    console.error('[Inbound] Error:', error.message, error.stack);
    
    // Return error message with ElevenLabs
    const errorAudioUrl = `${supabaseUrl}/functions/v1/twilio-tts-audio?msg=error`;
    return twiml(`<?xml version="1.0" encoding="UTF-8"?><Response><Play>${errorAudioUrl}</Play><Hangup/></Response>`);
  }
});
