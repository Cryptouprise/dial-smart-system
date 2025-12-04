/**
 * Twilio SMS Webhook
 * 
 * Receives inbound SMS messages from Twilio and stores them in the database.
 * Configure this URL in your Twilio Console under Phone Numbers > Messaging webhook.
 * 
 * Webhook URL: https://emonjusymdripmkvtttc.supabase.co/functions/v1/twilio-sms-webhook
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[Twilio SMS Webhook] Received webhook request');

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Supabase configuration missing');
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Parse the webhook data - Twilio sends form-urlencoded data
    const contentType = req.headers.get('content-type') || '';
    let webhookData: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        webhookData[key] = value.toString();
      });
    } else if (contentType.includes('application/json')) {
      webhookData = await req.json();
    } else {
      // Try to parse as text and decode
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        webhookData[key] = value;
      });
    }

    console.log('[Twilio SMS Webhook] Webhook data:', JSON.stringify(webhookData));

    // Extract SMS data from Twilio webhook
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      MediaUrl0,
      MediaContentType0,
    } = webhookData;

    // Allow messages with media but no body (MMS images)
    const hasMedia = NumMedia && parseInt(NumMedia) > 0;
    if (!From || !To || (!Body && !hasMedia)) {
      console.log('[Twilio SMS Webhook] Missing required fields');
      // Return TwiML response even for incomplete data
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { 
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        }
      );
    }

    // Use a placeholder for empty body with media
    const messageBody = Body || (hasMedia ? '[Image]' : '');

    console.log(`[Twilio SMS Webhook] Inbound SMS from ${From} to ${To}: ${messageBody.substring(0, 50)}${hasMedia ? ' [with media]' : ''}`);

    // Find the user who owns the "To" number - try multiple methods
    let userId: string | null = null;
    
    // Method 1: Check phone_numbers table
    const { data: phoneNumber } = await supabaseAdmin
      .from('phone_numbers')
      .select('user_id')
      .eq('number', To)
      .maybeSingle();

    if (phoneNumber?.user_id) {
      userId = phoneNumber.user_id;
      console.log('[Twilio SMS Webhook] Found user via phone_numbers table:', userId);
    }
    
    // Method 2: Try number format variations in phone_numbers
    if (!userId) {
      const cleanedTo = To.replace(/\D/g, '');
      const { data: altNumber } = await supabaseAdmin
        .from('phone_numbers')
        .select('user_id')
        .or(`number.eq.${To},number.eq.+${cleanedTo},number.eq.${cleanedTo}`)
        .limit(1)
        .maybeSingle();

      if (altNumber?.user_id) {
        userId = altNumber.user_id;
        console.log('[Twilio SMS Webhook] Found user via alt format:', userId);
      }
    }
    
    // Method 3: Check existing conversations where we've sent FROM this number
    if (!userId) {
      console.log('[Twilio SMS Webhook] Checking sms_messages for previous outbound from:', To);
      const { data: prevMessage } = await supabaseAdmin
        .from('sms_messages')
        .select('user_id')
        .eq('from_number', To)
        .eq('direction', 'outbound')
        .limit(1)
        .maybeSingle();

      if (prevMessage?.user_id) {
        userId = prevMessage.user_id;
        console.log('[Twilio SMS Webhook] Found user via previous outbound message:', userId);
      }
    }
    
    // Method 4: Check existing conversations with this contact
    if (!userId) {
      console.log('[Twilio SMS Webhook] Checking sms_conversations for contact:', From);
      const { data: existingConvForContact } = await supabaseAdmin
        .from('sms_conversations')
        .select('user_id')
        .eq('contact_phone', From)
        .limit(1)
        .maybeSingle();

      if (existingConvForContact?.user_id) {
        userId = existingConvForContact.user_id;
        console.log('[Twilio SMS Webhook] Found user via existing conversation:', userId);
      }
    }
    
    // Method 5: If still no user, get the most recently active user (for single-user setups)
    if (!userId) {
      console.log('[Twilio SMS Webhook] Fallback: finding most recent active user');
      const { data: recentUser } = await supabaseAdmin
        .from('ai_sms_settings')
        .select('user_id')
        .eq('enabled', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentUser?.user_id) {
        userId = recentUser.user_id;
        console.log('[Twilio SMS Webhook] Found user via ai_sms_settings fallback:', userId);
      }
    }

    if (!userId) {
      console.log('[Twilio SMS Webhook] No user found for number:', To, '- message will not be stored');
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { 
          headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
        }
      );
    }
    
    console.log('[Twilio SMS Webhook] Processing inbound SMS for user:', userId);

    // Find or create conversation
    let conversationId: string | null = null;
    
    const { data: existingConv } = await supabaseAdmin
      .from('sms_conversations')
      .select('id')
      .eq('user_id', userId)
      .eq('contact_phone', From)
      .maybeSingle();

    if (existingConv) {
      conversationId = existingConv.id;
      console.log('[Twilio SMS Webhook] Found existing conversation:', conversationId);
      
      // Update conversation
      await supabaseAdmin
        .from('sms_conversations')
        .update({ 
          last_message_at: new Date().toISOString(),
          unread_count: existingConv.unread_count ? existingConv.unread_count + 1 : 1,
        })
        .eq('id', conversationId);
    } else {
      // Create new conversation
      const { data: newConv, error: convError } = await supabaseAdmin
        .from('sms_conversations')
        .insert({
          user_id: userId,
          contact_phone: From,
          last_message_at: new Date().toISOString(),
          unread_count: 1,
        })
        .select('id')
        .single();

      if (newConv) {
        conversationId = newConv.id;
        console.log('[Twilio SMS Webhook] Created new conversation:', conversationId);
      } else {
        console.error('[Twilio SMS Webhook] Failed to create conversation:', convError);
      }
    }

    // Store the inbound message
    const { data: message, error: msgError } = await supabaseAdmin
      .from('sms_messages')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        to_number: To,
        from_number: From,
        body: messageBody,
        direction: 'inbound',
        status: 'received',
        provider_type: 'twilio',
        provider_message_id: MessageSid,
        has_image: hasMedia,
        image_url: hasMedia ? MediaUrl0 : null,
        metadata: {
          media_content_type: MediaContentType0,
          num_media: NumMedia,
        },
      })
      .select()
      .single();

    if (msgError) {
      console.error('[Twilio SMS Webhook] Failed to store message:', msgError);
    } else {
      console.log('[Twilio SMS Webhook] Message stored successfully:', message.id);
    }

    // Check AI SMS settings for auto-response
    const { data: settings } = await supabaseAdmin
      .from('ai_sms_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    console.log('[Twilio SMS Webhook] AI SMS settings:', JSON.stringify({
      enabled: settings?.enabled,
      auto_response_enabled: settings?.auto_response_enabled,
      delay: settings?.double_text_delay_seconds
    }));

    if (settings?.enabled && settings?.auto_response_enabled && conversationId) {
      console.log('[Twilio SMS Webhook] Auto-response enabled, generating AI response...');
      
      try {
        // Get conversation history for context
        const { data: messages } = await supabaseAdmin
          .from('sms_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(settings.context_window_size || 20);

        // Build conversation history (text only for history)
        const conversationHistory = (messages || [])
          .reverse()
          .slice(0, -1) // Exclude the current message, we'll add it with image
          .map((msg: any) => ({
            role: msg.direction === 'inbound' ? 'user' : 'assistant',
            content: msg.body
          }));

        // Generate AI response using Lovable AI
        const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
        if (!lovableApiKey) {
          console.error('[Twilio SMS Webhook] LOVABLE_API_KEY not configured');
        } else {
          const systemPrompt = `You are an AI SMS assistant with the following personality: ${settings.ai_personality || 'professional and helpful'}. 
Keep responses concise and appropriate for SMS (under 300 characters when possible). Be natural and conversational.
DO NOT include any special characters or formatting that may not work well in SMS.
If the user sends an image, describe what you see and respond appropriately.`;

          // Build the current message - include image if present and image analysis is enabled
          let currentUserMessage: any;
          
          if (hasMedia && settings.enable_image_analysis && MediaUrl0) {
            console.log('[Twilio SMS Webhook] Fetching image for analysis...');
            try {
              // Twilio media URLs require authentication
              const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
              const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
              
              const imageResponse = await fetch(MediaUrl0, {
                headers: {
                  'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                },
              });
              
              if (imageResponse.ok) {
                const imageBuffer = await imageResponse.arrayBuffer();
                const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
                const mimeType = MediaContentType0 || 'image/jpeg';
                
                console.log('[Twilio SMS Webhook] Image fetched and converted to base64');
                
                currentUserMessage = {
                  role: 'user',
                  content: [
                    { type: 'text', text: messageBody || 'What do you see in this image?' },
                    { 
                      type: 'image_url', 
                      image_url: { url: `data:${mimeType};base64,${base64Image}` }
                    }
                  ]
                };
              } else {
                console.error('[Twilio SMS Webhook] Failed to fetch image:', imageResponse.status);
                currentUserMessage = { role: 'user', content: messageBody };
              }
            } catch (imgError) {
              console.error('[Twilio SMS Webhook] Error fetching image:', imgError);
              currentUserMessage = { role: 'user', content: messageBody };
            }
          } else {
            currentUserMessage = { role: 'user', content: messageBody };
          }

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
                ...conversationHistory,
                currentUserMessage
              ],
            }),
          });

          if (!aiResponse.ok) {
            console.error('[Twilio SMS Webhook] AI generation failed:', aiResponse.status);
          } else {
            const aiData = await aiResponse.json();
            const generatedText = aiData.choices?.[0]?.message?.content;

            if (generatedText) {
              console.log('[Twilio SMS Webhook] AI generated response:', generatedText.substring(0, 50) + '...');

              // Wait for the configured delay
              const delayMs = (settings.double_text_delay_seconds || 2) * 1000;
              console.log(`[Twilio SMS Webhook] Waiting ${delayMs}ms before sending...`);
              await new Promise(resolve => setTimeout(resolve, delayMs));

              // Send the response via Twilio
              const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
              const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');

              if (twilioAccountSid && twilioAuthToken) {
                const twilioResponse = await fetch(
                  `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
                  {
                    method: 'POST',
                    headers: {
                      'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
                      'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                      To: From, // Reply to the sender
                      From: To, // Use the same number they texted
                      Body: generatedText,
                    }),
                  }
                );

                if (twilioResponse.ok) {
                  const twilioData = await twilioResponse.json();
                  console.log('[Twilio SMS Webhook] Auto-response sent successfully:', twilioData.sid);

                  // Store the outbound message
                  await supabaseAdmin
                    .from('sms_messages')
                    .insert({
                      user_id: userId,
                      conversation_id: conversationId,
                      to_number: From,
                      from_number: To,
                      body: generatedText,
                      direction: 'outbound',
                      status: 'sent',
                      provider_type: 'twilio',
                      provider_message_id: twilioData.sid,
                      is_ai_generated: true,
                      sent_at: new Date().toISOString(),
                    });

                  // Update conversation
                  await supabaseAdmin
                    .from('sms_conversations')
                    .update({ last_message_at: new Date().toISOString() })
                    .eq('id', conversationId);

                  console.log('[Twilio SMS Webhook] Auto-response stored in database');
                } else {
                  const errorText = await twilioResponse.text();
                  console.error('[Twilio SMS Webhook] Failed to send Twilio message:', errorText);
                }
              } else {
                console.error('[Twilio SMS Webhook] Twilio credentials not configured');
              }
            }
          }
        }
      } catch (autoError) {
        console.error('[Twilio SMS Webhook] Auto-response error:', autoError);
      }
    }

    // Return TwiML response (empty response = no auto-reply from Twilio itself)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      }
    );

  } catch (error) {
    console.error('[Twilio SMS Webhook] Error:', error);
    // Return TwiML even on error to prevent Twilio retries
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      }
    );
  }
});
