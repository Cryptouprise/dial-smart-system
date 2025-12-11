import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Generates TTS audio using ElevenLabs and returns MP3 for Twilio <Play>
 * URL format: /twilio-tts-audio?text=Hello&voice=EXAVITQu4vr4xnSDxMaL
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default voice - Sarah (clear, professional)
const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

// Pre-defined messages for IVR to cache
const IVR_MESSAGES: Record<string, string> = {
  'greeting': 'Thank you for calling back. Press 1 to speak with an agent. Press 2 to request a callback at a different time. Press 3 to be removed from our calling list.',
  'no_input': 'We did not receive a response. Goodbye.',
  'connecting': 'Connecting you to an agent now. Please hold.',
  'callback': 'We will call you back at a more convenient time. Goodbye.',
  'dnc': 'You have been removed from our calling list. Goodbye.',
  'invalid': 'Invalid option. Goodbye.',
  'error': 'We are sorry, we are experiencing technical difficulties. Please try again later.',
  'transfer_failed': 'We could not connect you. Please try again later.',
  'interest': 'Thank you for your interest. Someone will contact you shortly. Goodbye.',
};

serve(async (req) => {
  const url = new URL(req.url);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get parameters from URL query string (for Twilio <Play> compatibility)
    const messageKey = url.searchParams.get('msg');
    const customText = url.searchParams.get('text');
    const voiceId = url.searchParams.get('voice') || DEFAULT_VOICE;
    
    // Determine the text to speak
    let text = '';
    if (messageKey && IVR_MESSAGES[messageKey]) {
      text = IVR_MESSAGES[messageKey];
    } else if (customText) {
      text = decodeURIComponent(customText);
    } else {
      console.error('[TTS Audio] No text or message key provided');
      return new Response('Bad Request: text or msg parameter required', { status: 400 });
    }

    console.log(`[TTS Audio] Generating: "${text.substring(0, 50)}..." with voice ${voiceId}`);

    const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
    if (!apiKey) {
      console.error('[TTS Audio] ELEVENLABS_API_KEY not configured');
      // Return silence or a beep instead of error
      return new Response('Service unavailable', { status: 503 });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // Fast model for low latency
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS Audio] ElevenLabs error:', response.status, errorText);
      return new Response('TTS generation failed', { status: 500 });
    }

    console.log('[TTS Audio] Streaming audio response');

    // Stream the audio directly to Twilio
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });

  } catch (error: any) {
    console.error('[TTS Audio] Error:', error.message);
    return new Response('Internal server error', { status: 500 });
  }
});
