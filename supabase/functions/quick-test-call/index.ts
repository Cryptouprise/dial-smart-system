import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Escape XML special characters
const escapeXml = (str: string) => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

// Generate audio with ElevenLabs and upload to storage
async function generateAndUploadAudio(
  supabase: any,
  text: string,
  voiceId: string,
  elevenLabsKey: string,
  supabaseUrl: string,
  speed: number = 1.0
): Promise<string> {
  console.log(`Generating ElevenLabs audio for text (${text.length} chars) with voice ${voiceId}, speed ${speed}`);
  
  const ttsResponse = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': elevenLabsKey,
      },
      body: JSON.stringify({
        text: text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.5,
          use_speaker_boost: true,
          speed: speed,
        },
      }),
    }
  );

  if (!ttsResponse.ok) {
    const errorText = await ttsResponse.text();
    console.error('ElevenLabs error:', errorText);
    throw new Error(`ElevenLabs TTS failed: ${errorText}`);
  }

  const audioBuffer = await ttsResponse.arrayBuffer();
  const audioBytes = new Uint8Array(audioBuffer);
  
  // Generate unique filename
  const filename = `test-calls/${Date.now()}-${crypto.randomUUID()}.mp3`;
  
  // Upload to Supabase storage
  const { error: uploadError } = await supabase.storage
    .from('broadcast-audio')
    .upload(filename, audioBytes, {
      contentType: 'audio/mpeg',
      upsert: true,
    });

  if (uploadError) {
    console.error('Storage upload error:', uploadError);
    throw new Error(`Failed to upload audio: ${uploadError.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('broadcast-audio')
    .getPublicUrl(filename);

  console.log('Audio uploaded to:', urlData.publicUrl);
  return urlData.publicUrl;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get('action');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  
  if (!supabaseUrl || !supabaseKey) {
    return new Response(
      JSON.stringify({ error: 'Supabase configuration missing' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Request received - Method: ${req.method}, Action: ${action || 'none'}, Full URL: ${req.url}`);

  // Handle TwiML request - Twilio fetches this to get call instructions
  if (action === 'twiml') {
    try {
      console.log('Twilio requesting TwiML...');
      const audioUrl = url.searchParams.get('audio') || '';
      const promptUrl = url.searchParams.get('prompt') || '';
      const transferNumber = url.searchParams.get('transfer') || '';
      
      // Use separate DTMF handler function for webhook
      const dtmfUrl = transferNumber 
        ? `${supabaseUrl}/functions/v1/twilio-dtmf-handler?transfer=${encodeURIComponent(transferNumber)}`
        : `${supabaseUrl}/functions/v1/twilio-dtmf-handler`;
      
      let twiml: string;
      
      if (audioUrl && promptUrl) {
        // Use Play verb with ElevenLabs audio for both message and prompt
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10">
    <Play>${escapeXml(audioUrl)}</Play>
    <Pause length="1"/>
    <Play>${escapeXml(promptUrl)}</Play>
  </Gather>
  <Say>No response received. Goodbye.</Say>
  <Hangup/>
</Response>`;
      } else {
        // Fallback to Say verb
        twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" action="${dtmfUrl}" method="POST" timeout="10">
    <Say>Hello, this is a test call.</Say>
    <Pause length="1"/>
    <Say>Press 1 to speak with someone. Press 2 for a callback. Press 3 to opt out.</Say>
  </Gather>
  <Say>No response received. Goodbye.</Say>
  <Hangup/>
</Response>`;
      }

      console.log('Returning TwiML with DTMF, action URL:', dtmfUrl, 'audio:', audioUrl ? 'yes' : 'no', 'prompt:', promptUrl ? 'yes' : 'no');
      return new Response(twiml, {
        status: 200,
        headers: { 
          'Content-Type': 'text/xml; charset=utf-8',
          'Cache-Control': 'no-cache'
        },
      });
    } catch (error: any) {
      console.error('TwiML generation error:', error.message);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, there was an error.</Say>
  <Hangup/>
</Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      });
    }
  }

  // Main call initiation (POST from frontend)
  console.log('Processing call initiation...');
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
    const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');

    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error('Twilio credentials not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { toNumber, fromNumber, message, transferNumber, voiceId, speed } = await req.json();

    if (!toNumber || !fromNumber || !message) {
      throw new Error('Missing required fields: toNumber, fromNumber, message');
    }

    // Format phone numbers
    const cleanTo = toNumber.replace(/\D/g, '');
    const formattedTo = cleanTo.startsWith('1') ? `+${cleanTo}` : `+1${cleanTo}`;
    
    let formattedTransfer = '';
    if (transferNumber) {
      const cleanTransfer = transferNumber.replace(/\D/g, '');
      formattedTransfer = cleanTransfer.startsWith('1') ? `+${cleanTransfer}` : `+1${cleanTransfer}`;
    }

    console.log(`Initiating call: from=${fromNumber}, to=${formattedTo}, transfer=${formattedTransfer || 'none'}, voice=${voiceId || 'default'}, speed=${speed || 1.0}`);

    // Generate ElevenLabs audio if API key is configured
    let audioUrl = '';
    let promptUrl = '';
    if (elevenLabsKey && voiceId) {
      try {
        // Generate main message audio
        audioUrl = await generateAndUploadAudio(
          supabase,
          message,
          voiceId,
          elevenLabsKey,
          supabaseUrl,
          speed || 1.0
        );
        
        // Generate IVR prompt audio with same voice
        const promptText = 'Press 1 to speak with someone. Press 2 for a callback. Press 3 to opt out.';
        promptUrl = await generateAndUploadAudio(
          supabase,
          promptText,
          voiceId,
          elevenLabsKey,
          supabaseUrl,
          speed || 1.0
        );
      } catch (audioError: any) {
        console.warn('ElevenLabs audio generation failed, falling back to Twilio TTS:', audioError.message);
        // Continue without audio URLs - will use Twilio's Say verb
      }
    }

    // Build TwiML URL that Twilio will fetch
    let twimlUrl = `${supabaseUrl}/functions/v1/quick-test-call?action=twiml`;
    if (audioUrl) {
      twimlUrl += `&audio=${encodeURIComponent(audioUrl)}`;
    }
    if (promptUrl) {
      twimlUrl += `&prompt=${encodeURIComponent(promptUrl)}`;
    }
    if (formattedTransfer) {
      twimlUrl += `&transfer=${encodeURIComponent(formattedTransfer)}`;
    }
    
    console.log('TwiML URL:', twimlUrl);

    // Make Twilio call
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: formattedTo,
          From: fromNumber,
          Url: twimlUrl,
          Method: 'GET',
        }),
      }
    );

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text();
      console.error('Twilio API error:', errorText);
      throw new Error(`Twilio error: ${errorText}`);
    }

    const result = await twilioResponse.json();
    console.log('Call initiated successfully:', result.sid);

    // Log call (non-blocking)
    supabase.from('call_logs').insert({
      user_id: user.id,
      phone_number: formattedTo,
      caller_id: fromNumber,
      status: 'queued',
      notes: `Test broadcast (ElevenLabs: ${voiceId || 'none'}, speed: ${speed || 1.0}) | Transfer: ${formattedTransfer || 'none'}`,
    }).then(() => console.log('Call logged'), (e: any) => console.log('Log error (ignored):', e.message));

    return new Response(
      JSON.stringify({ 
        success: true, 
        callSid: result.sid,
        to: formattedTo,
        from: fromNumber,
        transferNumber: formattedTransfer || null,
        voiceId: voiceId || null,
        speed: speed || 1.0,
        audioGenerated: !!audioUrl,
        promptGenerated: !!promptUrl,
        message: 'Test call initiated!',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Call initiation error:', error.message);

    // IMPORTANT: return 200 so supabase-js doesn't surface a generic
    // "Edge Function returned a non-2xx status code" message.
    // The frontend expects `data.error` and will show a friendly toast.
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
