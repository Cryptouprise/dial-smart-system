import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');

    if (!elevenLabsKey) {
      throw new Error('ElevenLabs API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { broadcastId, messageText, voiceId, ivrPrompt } = await req.json();

    if (!broadcastId || !messageText) {
      throw new Error('Missing required parameters: broadcastId and messageText');
    }

    console.log(`Generating TTS for broadcast ${broadcastId}`);

    // Combine message with IVR prompt if provided
    const fullMessage = ivrPrompt 
      ? `${messageText} ... ${ivrPrompt}`
      : messageText;

    // Generate speech using ElevenLabs
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || 'EXAVITQu4vr4xnSDxMaL'}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsKey,
        },
        body: JSON.stringify({
          text: fullMessage,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('ElevenLabs error:', errorText);
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));

    // Store audio in Supabase Storage (if bucket exists) or as base64 in the record
    // For now, we'll store a reference and the audio can be retrieved on-demand
    const audioDataUrl = `data:audio/mpeg;base64,${audioBase64}`;

    // Update the broadcast with the audio URL
    const { error: updateError } = await supabase
      .from('voice_broadcasts')
      .update({ audio_url: audioDataUrl })
      .eq('id', broadcastId);

    if (updateError) {
      console.error('Error updating broadcast:', updateError);
      throw updateError;
    }

    console.log(`Audio generated successfully for broadcast ${broadcastId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        audioUrl: audioDataUrl,
        duration: Math.ceil(audioBuffer.byteLength / 16000), // Rough estimate
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Voice broadcast TTS error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
