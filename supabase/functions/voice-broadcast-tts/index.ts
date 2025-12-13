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

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const elevenLabsKey = Deno.env.get('ELEVENLABS_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase configuration missing');
    }

    if (!elevenLabsKey) {
      throw new Error('ElevenLabs API key not configured. Please add ELEVENLABS_API_KEY secret.');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { broadcastId, messageText, voiceId, ivrPrompt } = await req.json();

    if (!broadcastId) {
      throw new Error('Missing required parameter: broadcastId');
    }
    
    if (!messageText) {
      throw new Error('Missing required parameter: messageText');
    }

    // Verify broadcast ownership and get voice settings
    const { data: broadcast, error: broadcastError } = await supabase
      .from('voice_broadcasts')
      .select('id, user_id, voice_speed')
      .eq('id', broadcastId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (broadcastError || !broadcast) {
      throw new Error('Broadcast not found or access denied');
    }

    const voiceSpeed = broadcast.voice_speed || 1.0;

    console.log(`Generating TTS for broadcast ${broadcastId} with voice ${voiceId || 'default'}, speed ${voiceSpeed}`);

    // Combine message with IVR prompt if provided
    const fullMessage = ivrPrompt 
      ? `${messageText} ... ${ivrPrompt}`
      : messageText;

    // Validate message length (ElevenLabs has limits)
    if (fullMessage.length > 5000) {
      throw new Error('Message text is too long. Maximum 5000 characters allowed.');
    }

    // Generate speech using ElevenLabs
    const selectedVoiceId = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // Sarah (default)
    
    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${selectedVoiceId}`,
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
            speed: voiceSpeed,
          },
        }),
      }
    );

    if (!ttsResponse.ok) {
      const errorText = await ttsResponse.text();
      console.error('ElevenLabs error:', errorText);
      
      // Parse error for better messaging
      let errorMessage = 'ElevenLabs API error';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail?.message || errorJson.message || errorText;
      } catch {
        errorMessage = errorText;
      }
      
      throw new Error(`TTS generation failed: ${errorMessage}`);
    }

    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBytes = new Uint8Array(audioBuffer);
    
    // Create the bucket if it doesn't exist (will fail silently if exists)
    await supabase.storage.createBucket('broadcast-audio', {
      public: true,
      allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav'],
    });

    // Upload to Supabase Storage
    const fileName = `${user.id}/${broadcastId}-${Date.now()}.mp3`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('broadcast-audio')
      .upload(fileName, audioBytes, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    // Get the public URL
    const { data: urlData } = supabase.storage
      .from('broadcast-audio')
      .getPublicUrl(fileName);

    const audioUrl = urlData.publicUrl;
    console.log(`Audio uploaded to: ${audioUrl}`);

    // Update the broadcast with the audio URL
    const { error: updateError } = await supabase
      .from('voice_broadcasts')
      .update({ 
        audio_url: audioUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', broadcastId);

    if (updateError) {
      console.error('Error updating broadcast:', updateError);
      throw new Error('Failed to save audio URL to broadcast');
    }

    // Estimate duration (rough calculation: ~150 words per minute, ~5 chars per word)
    const estimatedDuration = Math.ceil((fullMessage.length / 5) / 150 * 60);

    console.log(`Audio generated successfully for broadcast ${broadcastId}, estimated ${estimatedDuration}s`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        audioUrl: audioUrl,
        duration: estimatedDuration,
        characterCount: fullMessage.length,
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
