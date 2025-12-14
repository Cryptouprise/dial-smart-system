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
          .maybeSingle();

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
        .maybeSingle();

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

    if (action === 'generate_and_send') {
      // Generate AI SMS and send it (called from workflow executor)
      const { leadId, userId: targetUserId, fromNumber, context, prompt } = request;

      console.log('[AI SMS] Generate and send for lead:', leadId, 'from:', fromNumber);

      // Get lead data
      const { data: lead, error: leadError } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .maybeSingle();

      if (leadError || !lead) {
        throw new Error('Lead not found: ' + (leadError?.message || 'Unknown'));
      }

      // Get or create conversation
      const { data: conversation } = await supabaseAdmin
        .from('sms_conversations')
        .select('*')
        .eq('user_id', targetUserId)
        .eq('contact_phone', lead.phone_number)
        .maybeSingle();

      let conversationId = conversation?.id;

      if (!conversation) {
        const { data: newConv, error: createError } = await supabaseAdmin
          .from('sms_conversations')
          .insert({
            user_id: targetUserId,
            contact_phone: lead.phone_number,
            contact_name: `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || null,
            last_message_at: new Date().toISOString(),
          })
          .select()
          .maybeSingle();

        if (createError) throw createError;
        conversationId = newConv?.id;
      }

      // Get user's AI SMS settings
      const { data: settings } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('*')
        .eq('user_id', targetUserId)
        .maybeSingle();

      // Build context for AI
      let aiPrompt = prompt || settings?.custom_instructions || 'You are a helpful AI assistant reaching out to follow up.';

      // Add lead context
      const leadContext = `Lead info: ${lead.first_name || 'Unknown'} ${lead.last_name || ''}, Status: ${lead.status}, Phone: ${lead.phone_number}`;
      
      // Generate AI message
      const systemPrompt = `${aiPrompt}

LEAD CONTEXT:
${leadContext}

CONTEXT: ${context || 'follow_up'}

Generate a natural, conversational SMS message to this lead. Keep it brief (under 160 characters if possible), friendly, and include a clear call-to-action. Do not use placeholder brackets like [Name] - use the actual lead name.`;

      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate a follow-up SMS for ${lead.first_name || 'this lead'}.` }
          ],
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('[AI SMS] AI generation failed:', errorText);
        throw new Error(`AI generation failed: ${aiResponse.status}`);
      }

      const aiData = await aiResponse.json();
      const generatedMessage = aiData.choices?.[0]?.message?.content?.trim();

      if (!generatedMessage) {
        throw new Error('AI did not generate a message');
      }

      console.log('[AI SMS] Generated message:', generatedMessage);

      // Get Twilio credentials
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

      if (!twilioAccountSid || !twilioAuthToken) {
        throw new Error('Twilio credentials not configured');
      }

      // Send SMS via Twilio
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
      const twilioResponse = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber,
          To: lead.phone_number,
          Body: generatedMessage,
        }).toString(),
      });

      const twilioData = await twilioResponse.json();

      if (!twilioResponse.ok) {
        console.error('[AI SMS] Twilio send failed:', twilioData);
        throw new Error(`SMS send failed: ${twilioData.message || twilioResponse.status}`);
      }

      console.log('[AI SMS] Message sent via Twilio:', twilioData.sid);

      // Save outbound message to database
      await supabaseAdmin
        .from('sms_messages')
        .insert({
          user_id: targetUserId,
          conversation_id: conversationId,
          lead_id: leadId,
          to_number: lead.phone_number,
          from_number: fromNumber,
          body: generatedMessage,
          direction: 'outbound',
          status: 'sent',
          is_ai_generated: true,
          provider_message_id: twilioData.sid,
          sent_at: new Date().toISOString(),
        });

      // Update conversation
      if (conversationId) {
        await supabaseAdmin
          .from('sms_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            last_from_number: fromNumber,
          })
          .eq('id', conversationId);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message_sid: twilioData.sid,
        generated_message: generatedMessage,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'convert_voice_to_sms') {
      // Convert voice agent prompt to SMS-optimized prompt
      const { voicePrompt, aggressionLevel, aggressionTone, campaignName, settings: conversionSettings } = request;

      console.log('[AI SMS] Converting voice prompt to SMS for campaign:', campaignName);

      const conversionPrompt = `You are an expert at converting AI voice agent scripts into SMS-optimized text agent scripts.

Given a voice agent script/prompt, convert it to work well for SMS text messaging while preserving the core personality and goals.

VOICE AGENT PROMPT TO CONVERT:
${voicePrompt}

CONVERSION GUIDELINES:
1. Remove all voice-specific instructions (tone of voice, pacing, interruption handling)
2. Replace call-specific phrases ("transfer to", "hold on", "let me check") with text-appropriate alternatives
3. Keep messages concise - SMS should be under 160 characters when possible
4. Convert verbal acknowledgments to brief text responses
5. Add clear call-to-action in each message
6. Include instructions for handling:
   - Appointment scheduling via text
   - Question handling with single-question-at-a-time approach
   - Follow-up timing based on lead responses
   - Emoji usage (sparingly)

FOLLOW-UP STYLE: ${aggressionLevel || 'balanced'}
${aggressionTone || ''}

TIMING CONFIGURATION:
- Initial follow-up after ${conversionSettings?.initialDelayHours || 12} hours of no response
- Subsequent follow-ups every ${conversionSettings?.followUpIntervalHours || 24} hours
- Maximum ${conversionSettings?.maxFollowUps || 5} follow-up attempts

Generate a complete SMS agent system prompt that:
1. Captures the original personality and objectives
2. Is optimized for text-based conversation
3. Includes the follow-up timing rules
4. Includes calendar/appointment handling instructions
5. Includes pipeline/status update awareness

Return ONLY the SMS agent prompt, no explanations or meta-commentary.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'user', content: conversionPrompt }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AI SMS] Conversion failed:', errorText);
        throw new Error(`AI conversion failed: ${response.status}`);
      }

      const data = await response.json();
      const smsPrompt = data.choices?.[0]?.message?.content;

      if (!smsPrompt) {
        throw new Error('Failed to generate SMS prompt');
      }

      console.log('[AI SMS] Successfully converted voice prompt to SMS');

      return new Response(JSON.stringify({ success: true, smsPrompt }), {
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
DO NOT include any special characters or formatting that may not work well in SMS.

IMPORTANT CALENDAR/APPOINTMENT CAPABILITIES:
- If the user asks about availability, scheduling, or booking an appointment, let them know you can help with that
- When they want to book, ask for their preferred date and time
- You can check availability and book appointments on their behalf
- If they mention times like "tomorrow at 2pm" or "next Monday", acknowledge and confirm`;

  // Check if message is about appointments/scheduling
  const appointmentKeywords = ['appointment', 'schedule', 'book', 'available', 'meet', 'calendar', 'time slot', 'when can'];
  const isAppointmentRelated = appointmentKeywords.some(kw => 
    currentContent.toLowerCase().includes(kw)
  );

  // If appointment-related, try to invoke calendar function
  if (isAppointmentRelated && settings?.enabled) {
    try {
      // Try to parse date/time from message
      const dateMatch = currentContent.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]?\d{0,4}|\btomorrow\b|\btoday\b|\bnext\s+\w+day\b)/i);
      const timeMatch = currentContent.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);

      if (dateMatch || timeMatch) {
        // Add calendar context to system prompt
        const calendarContext = `
The user is asking about appointments. Based on their message, they may want to:
- Check available times
- Book a specific slot
If they provide a date/time, confirm you'll book it for them.`;
        
        conversationHistory.unshift({
          role: 'system',
          content: calendarContext
        });
      }
    } catch (e) {
      console.log('[AI SMS] Calendar parsing skipped:', e);
    }
  }

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
