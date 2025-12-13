/**
 * AI SMS Processor Edge Function
 * 
 * Handles incoming SMS messages and generates AI-powered responses using:
 * - Retell AI integration for conversation management
 * - Lovable AI for image analysis and text generation
 * - Context management with summarization
 * - Reaction detection
 * - Double-texting prevention
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WebhookMessage {
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured');
    }
    
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured - required for AI SMS responses');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const request = await req.json();
    const action = request.action;

    console.log('[AI SMS] Action:', action);

    if (action === 'process_webhook') {
      // Handle incoming SMS from Twilio webhook
      const message: WebhookMessage = request.message;
      
      // Get or create conversation
      const { data: conversation, error: convError } = await supabaseAdmin
        .from('sms_conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('contact_phone', message.From)
        .maybeSingle();

      let conversationId = conversation?.id;

      if (!conversation) {
        const { data: newConv, error: createError } = await supabaseAdmin
          .from('sms_conversations')
          .insert({
            user_id: user.id,
            contact_phone: message.From,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (createError) throw createError;
        conversationId = newConv.id;
      }

      // Check if it's a reaction (common patterns)
      const isReaction = await detectReaction(message.Body);

      // Check if message has image
      const hasImage = message.NumMedia && parseInt(message.NumMedia) > 0;
      let imageAnalysis = null;

      if (hasImage && message.MediaUrl0) {
        imageAnalysis = await analyzeImage(message.MediaUrl0, lovableApiKey);
      }

      // Save incoming message
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('sms_messages')
        .insert({
          user_id: user.id,
          conversation_id: conversationId,
          to_number: message.To,
          from_number: message.From,
          body: message.Body,
          direction: 'inbound',
          status: 'received',
          has_image: hasImage,
          image_url: message.MediaUrl0 || null,
          image_analysis: imageAnalysis,
          is_reaction: isReaction.isReaction,
          reaction_type: isReaction.reactionType,
        })
        .select()
        .single();

      if (saveError) throw saveError;

      // Get AI settings
      const { data: settings } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const shouldAutoRespond = settings?.enabled && settings?.auto_response_enabled;

      if (shouldAutoRespond && !isReaction.isReaction) {
        // Check double-texting prevention
        const canSend = await checkDoubleTextingPrevention(
          supabaseAdmin,
          conversationId,
          user.id,
          settings?.prevent_double_texting,
          settings?.double_text_delay_seconds
        );

        if (canSend) {
          // Generate AI response
          const response = await generateAIResponse(
            supabaseAdmin,
            lovableApiKey,
            retellApiKey,
            conversationId,
            user.id,
            message,
            imageAnalysis,
            settings
          );

          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Processed and responded',
            response 
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Processed without response' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'generate_response') {
      // Manually generate AI response
      const { conversationId, prompt } = request;

      const { data: settings } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      const response = await generateAIResponse(
        supabaseAdmin,
        lovableApiKey,
        retellApiKey,
        conversationId,
        user.id,
        { Body: prompt } as WebhookMessage,
        null,
        settings
      );

      return new Response(JSON.stringify({ success: true, response }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error('[AI SMS] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function detectReaction(body: string): Promise<{ isReaction: boolean; reactionType: string | null }> {
  const reactions = [
    { pattern: /^👍$/, type: 'thumbs_up' },
    { pattern: /^👎$/, type: 'thumbs_down' },
    { pattern: /^❤️$/, type: 'heart' },
    { pattern: /^😂$/, type: 'laugh' },
    { pattern: /^😮$/, type: 'wow' },
    { pattern: /^😢$/, type: 'sad' },
    { pattern: /^Liked ".*"$/i, type: 'like' },
    { pattern: /^Loved ".*"$/i, type: 'love' },
    { pattern: /^Emphasized ".*"$/i, type: 'emphasis' },
  ];

  for (const reaction of reactions) {
    if (reaction.pattern.test(body.trim())) {
      return { isReaction: true, reactionType: reaction.type };
    }
  }

  return { isReaction: false, reactionType: null };
}

async function analyzeImage(imageUrl: string, lovableApiKey: string): Promise<any> {
  try {
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this image in detail. Describe what you see, any text present, and any relevant context that would be useful for understanding the sender\'s intent.'
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl }
              }
            ]
          }
        ],
      }),
    });

    const data = await response.json();
    return {
      description: data.choices?.[0]?.message?.content || 'Unable to analyze image',
      analyzed_at: new Date().toISOString(),
    };
  } catch (error) {
    console.error('[AI SMS] Image analysis failed:', error);
    return {
      description: 'Image analysis failed',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkDoubleTextingPrevention(
  supabase: any,
  conversationId: string,
  userId: string,
  enabled: boolean = true,
  delaySeconds: number = 300
): Promise<boolean> {
  if (!enabled) return true;

  const { data: recentMessages } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .eq('direction', 'outbound')
    .eq('is_ai_generated', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!recentMessages || recentMessages.length === 0) return true;

  const lastMessage = recentMessages[0];
  const timeSinceLastMessage = (Date.now() - new Date(lastMessage.created_at).getTime()) / 1000;

  return timeSinceLastMessage >= delaySeconds;
}

async function generateAIResponse(
  supabase: any,
  lovableApiKey: string,
  retellApiKey: string | undefined,
  conversationId: string,
  userId: string,
  incomingMessage: WebhookMessage,
  imageAnalysis: any,
  settings: any
): Promise<string> {
  // Get conversation history with context window
  const contextWindow = settings?.context_window_size || 20;
  const { data: messages } = await supabase
    .from('sms_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(contextWindow);

  // Build context for AI
  const conversationHistory = (messages || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.direction === 'inbound' ? 'user' : 'assistant',
      content: msg.body + (msg.image_analysis ? `\n[Image: ${msg.image_analysis.description}]` : '')
    }));

  // Add current message
  let currentContent = incomingMessage.Body;
  if (imageAnalysis) {
    currentContent += `\n[User sent an image: ${imageAnalysis.description}]`;
  }

  conversationHistory.push({
    role: 'user',
    content: currentContent
  });

  const systemPrompt = `You are an AI SMS assistant with the following personality: ${settings?.ai_personality || 'professional and helpful'}. 
  
Keep responses concise and appropriate for SMS (under 300 characters when possible). Be natural and conversational. 
If the user sends an image, acknowledge it and respond appropriately based on the image analysis.
DO NOT include any special characters or formatting that may not work well in SMS.`;

  try {
    const aiProvider = settings?.ai_provider || 'lovable';

    if (aiProvider === 'retell' && retellApiKey && settings?.retell_llm_id) {
      // Use Retell AI
      console.log('[AI SMS] Using Retell AI for response generation');
      
      const retellResponse = await fetch('https://api.retellai.com/v2/create-web-call', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${retellApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: settings.retell_llm_id,
          audio_encoding: 'pcm',
          audio_websocket_protocol: 'web',
          sample_rate: 24000,
          metadata: {
            conversation_id: conversationId,
            user_message: currentContent,
            context: JSON.stringify(conversationHistory.slice(-5)), // Last 5 messages
          },
        }),
      });

      if (!retellResponse.ok) {
        console.error('[AI SMS] Retell API error:', await retellResponse.text());
        throw new Error('Retell AI failed, falling back to Lovable AI');
      }

      const retellData = await retellResponse.json();
      return retellData.access_token ? 'Response generated via Retell AI' : 'I apologize, but I was unable to generate a response.';

    } else {
      // Use Lovable AI (default)
      console.log('[AI SMS] Using Lovable AI for response generation');
      
      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            ...conversationHistory
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`AI generation failed: ${response.status}`);
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.';
    }
  } catch (error) {
    console.error('[AI SMS] Response generation failed:', error);
    throw error;
  }
}
