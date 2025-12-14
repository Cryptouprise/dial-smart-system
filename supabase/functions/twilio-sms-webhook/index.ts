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

// Input validation schema for Twilio webhook data
interface TwilioWebhookData {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
  AccountSid?: string;
  ApiVersion?: string;
  FromCity?: string;
  FromState?: string;
  FromZip?: string;
  FromCountry?: string;
  ToCity?: string;
  ToState?: string;
  ToZip?: string;
  ToCountry?: string;
}

// Validation function for Twilio webhook payload
function validateTwilioPayload(data: Record<string, string>): { valid: boolean; error?: string; data?: TwilioWebhookData } {
  // Basic structure validation
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Invalid payload: expected object' };
  }

  // Validate phone number formats if present
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  
  if (data.From && !phoneRegex.test(data.From.replace(/\s/g, ''))) {
    return { valid: false, error: 'Invalid From phone number format' };
  }
  
  if (data.To && !phoneRegex.test(data.To.replace(/\s/g, ''))) {
    return { valid: false, error: 'Invalid To phone number format' };
  }

  // Validate MessageSid format if present (Twilio SIDs start with SM or MM)
  if (data.MessageSid && !/^(SM|MM)[a-f0-9]{32}$/i.test(data.MessageSid)) {
    console.warn('[Twilio SMS Webhook] Unusual MessageSid format:', data.MessageSid);
    // Don't reject - Twilio might change formats
  }

  // Validate NumMedia is a valid number if present
  if (data.NumMedia && isNaN(parseInt(data.NumMedia))) {
    return { valid: false, error: 'Invalid NumMedia value' };
  }

  // Sanitize body length (prevent extremely large payloads)
  if (data.Body && data.Body.length > 10000) {
    return { valid: false, error: 'Message body too large' };
  }

  // Validate MediaUrl if present
  if (data.MediaUrl0) {
    try {
      const url = new URL(data.MediaUrl0);
      // Twilio media URLs should come from Twilio's domain
      if (!url.hostname.includes('twilio.com') && !url.hostname.includes('cloudfront.net')) {
        console.warn('[Twilio SMS Webhook] Non-Twilio media URL:', url.hostname);
      }
    } catch {
      return { valid: false, error: 'Invalid MediaUrl0 format' };
    }
  }

  return { 
    valid: true, 
    data: {
      MessageSid: data.MessageSid,
      From: data.From,
      To: data.To,
      Body: data.Body,
      NumMedia: data.NumMedia,
      MediaUrl0: data.MediaUrl0,
      MediaContentType0: data.MediaContentType0,
      AccountSid: data.AccountSid,
      ApiVersion: data.ApiVersion,
      FromCity: data.FromCity,
      FromState: data.FromState,
      FromZip: data.FromZip,
      FromCountry: data.FromCountry,
      ToCity: data.ToCity,
      ToState: data.ToState,
      ToZip: data.ToZip,
      ToCountry: data.ToCountry,
    }
  };
}

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
    let rawData: Record<string, string> = {};

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      formData.forEach((value, key) => {
        rawData[key] = value.toString();
      });
    } else if (contentType.includes('application/json')) {
      rawData = await req.json();
    } else {
      // Try to parse as text and decode
      const text = await req.text();
      const params = new URLSearchParams(text);
      params.forEach((value, key) => {
        rawData[key] = value;
      });
    }

    // Validate the webhook payload
    const validation = validateTwilioPayload(rawData);
    if (!validation.valid) {
      console.error('[Twilio SMS Webhook] Validation failed:', validation.error);
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
      );
    }

    const webhookData = validation.data!;
    console.log('[Twilio SMS Webhook] Validated webhook data:', JSON.stringify({
      MessageSid: webhookData.MessageSid,
      From: webhookData.From,
      To: webhookData.To,
      BodyLength: webhookData.Body?.length || 0,
      NumMedia: webhookData.NumMedia,
    }));

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
      .select('id, unread_count')
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
        .maybeSingle();

      if (newConv) {
        conversationId = newConv.id;
        console.log('[Twilio SMS Webhook] Created new conversation:', conversationId);
      } else {
        console.error('[Twilio SMS Webhook] Failed to create conversation:', convError);
      }
    }

    // Check for duplicate webhook (Twilio retries)
    if (MessageSid) {
      const { data: existingMessage } = await supabaseAdmin
        .from('sms_messages')
        .select('id')
        .eq('provider_message_id', MessageSid)
        .maybeSingle();
      
      if (existingMessage) {
        console.log('[Twilio SMS Webhook] Duplicate webhook detected, skipping:', MessageSid);
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
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
      .maybeSingle();

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
      prevent_double_texting: settings?.prevent_double_texting,
      delay: settings?.double_text_delay_seconds
    }));

    // Double-texting prevention: Check if we've recently sent an AI message
    if (settings?.enabled && settings?.auto_response_enabled && settings?.prevent_double_texting && conversationId) {
      const preventionWindowMs = (settings.double_text_delay_seconds || 60) * 1000;
      const cutoffTime = new Date(Date.now() - preventionWindowMs).toISOString();
      
      const { data: recentAiMessage } = await supabaseAdmin
        .from('sms_messages')
        .select('id, created_at')
        .eq('conversation_id', conversationId)
        .eq('direction', 'outbound')
        .eq('is_ai_generated', true)
        .gt('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (recentAiMessage) {
        console.log('[Twilio SMS Webhook] Double-texting prevention: AI message sent recently, skipping auto-response');
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
    }

    // Rapid message batching: Wait briefly then check if more messages arrived
    if (settings?.enabled && settings?.auto_response_enabled && conversationId) {
      // Wait a moment to allow rapid messages to be stored
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Check if this is the most recent inbound message
      const { data: latestInbound } = await supabaseAdmin
        .from('sms_messages')
        .select('id')
        .eq('conversation_id', conversationId)
        .eq('direction', 'inbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (latestInbound && message && latestInbound.id !== message.id) {
        console.log('[Twilio SMS Webhook] Newer inbound message exists, skipping auto-response for this one');
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
    }

    // Check if auto-response should be generated
    if (settings?.enabled && settings?.auto_response_enabled && conversationId) {
      console.log('[Twilio SMS Webhook] Auto-response enabled, generating AI response...');
      
      // Check for reactions - skip auto-response for simple acknowledgments
      const reactionPatterns = [
        /^(👍|👎|❤️|😀|😊|🙏|👌|✅|ok|okay|k|thanks|thank you|thx|ty|cool|got it|sounds good|perfect|great|yes|no|yep|nope)$/i
      ];
      
      const isReaction = reactionPatterns.some(pattern => pattern.test(messageBody.trim()));
      
      if (isReaction && settings.enable_reaction_detection) {
        console.log('[Twilio SMS Webhook] Message is a reaction/acknowledgment, skipping auto-response');
        
        // Mark the message as a reaction
        await supabaseAdmin
          .from('sms_messages')
          .update({ is_reaction: true, reaction_type: 'acknowledgment' })
          .eq('id', message?.id);
        
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
          { headers: { ...corsHeaders, 'Content-Type': 'text/xml' } }
        );
      }
      
      try {
        // Fetch lead info for context if enabled
        let leadContext = '';
        let leadData: any = null;
        
        if (settings.include_lead_context) {
          const { data: lead } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('user_id', userId)
            .eq('phone_number', From)
            .maybeSingle();
          
          if (lead) {
            leadData = lead;
            leadContext = `\n\nLEAD INFORMATION:
- Name: ${lead.first_name || ''} ${lead.last_name || ''}
- Email: ${lead.email || 'Not provided'}
- Company: ${lead.company || 'Not provided'}
- Status: ${lead.status || 'Unknown'}
- Lead Source: ${lead.lead_source || 'Unknown'}
- Notes: ${lead.notes || 'None'}
- Tags: ${lead.tags?.join(', ') || 'None'}`;
            console.log('[Twilio SMS Webhook] Found lead context');
          }
        }
        
        // Fetch call history if enabled
        let callHistoryContext = '';
        if (settings.include_call_history) {
          const maxHistoryItems = settings.max_history_items || 5;
          const { data: calls } = await supabaseAdmin
            .from('call_logs')
            .select('*')
            .eq('user_id', userId)
            .eq('phone_number', From)
            .order('created_at', { ascending: false })
            .limit(maxHistoryItems);
          
          if (calls && calls.length > 0) {
            callHistoryContext = `\n\nRECENT CALL HISTORY:`;
            calls.forEach((call: any) => {
              const date = new Date(call.created_at).toLocaleDateString();
              callHistoryContext += `\n- ${date}: ${call.status} (${call.duration_seconds || 0}s) - Outcome: ${call.outcome || 'N/A'}${call.notes ? ` - Notes: ${call.notes}` : ''}`;
            });
            console.log('[Twilio SMS Webhook] Added call history context');
          }
        }

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
          // Helper function to replace dynamic variables
          const replaceDynamicVariables = (text: string): string => {
            if (!text || !settings.dynamic_variables_enabled) return text || '';
            
            const variables: Record<string, string> = {
              '{{first_name}}': leadData?.first_name || 'there',
              '{{last_name}}': leadData?.last_name || '',
              '{{email}}': leadData?.email || '',
              '{{company}}': leadData?.company || '',
              '{{phone}}': From || '',
              '{{status}}': leadData?.status || '',
            };
            
            let result = text;
            Object.entries(variables).forEach(([key, value]) => {
              result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
            });
            return result;
          };
          
          // Build comprehensive system prompt
          let systemPrompt = `You are an AI SMS assistant.

PERSONALITY:
${settings.ai_personality || 'professional and helpful'}`;

          // Add custom instructions if provided
          if (settings.custom_instructions) {
            const processedInstructions = replaceDynamicVariables(settings.custom_instructions);
            systemPrompt += `\n\nRULES & GUIDELINES:
${processedInstructions}`;
          }

          // Add knowledge base if provided
          if (settings.knowledge_base) {
            const processedKnowledge = replaceDynamicVariables(settings.knowledge_base);
            systemPrompt += `\n\nKNOWLEDGE BASE:
${processedKnowledge}`;
          }

          // Add lead context
          if (leadContext) {
            systemPrompt += leadContext;
          }

          // Add call history context
          if (callHistoryContext) {
            systemPrompt += callHistoryContext;
          }

          // Add general SMS guidelines
          systemPrompt += `\n\nSMS GUIDELINES:
- Keep responses concise and appropriate for SMS (under 300 characters when possible)
- Be conversational and natural
- Don't use markdown formatting
- If asked about scheduling, be helpful and suggest specific times
- Never pretend to be human - you can acknowledge you're an AI assistant if asked
- Be direct and get to the point`;

          console.log('[Twilio SMS Webhook] System prompt length:', systemPrompt.length);

          // Build messages array for AI with image support
          const aiMessages: any[] = [
            { role: 'system', content: systemPrompt },
            ...conversationHistory
          ];

          // Add current message with image if present
          if (hasMedia && MediaUrl0) {
            console.log('[Twilio SMS Webhook] Including image in AI request');
            aiMessages.push({
              role: 'user',
              content: [
                {
                  type: 'image_url',
                  image_url: { url: MediaUrl0 }
                },
                {
                  type: 'text',
                  text: messageBody || 'What is this image?'
                }
              ]
            });
          } else {
            aiMessages.push({
              role: 'user',
              content: messageBody
            });
          }

          console.log('[Twilio SMS Webhook] Sending request to Lovable AI Gateway');
          
          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lovableApiKey}`,
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: aiMessages,
            }),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error('[Twilio SMS Webhook] Lovable AI error:', aiResponse.status, errorText);
          } else {
            const aiData = await aiResponse.json();
            const aiReply = aiData.choices?.[0]?.message?.content;
            
            if (aiReply) {
              console.log('[Twilio SMS Webhook] AI response generated:', aiReply.substring(0, 100));
              
              // Store AI response
              const { data: aiMessage, error: aiMsgError } = await supabaseAdmin
                .from('sms_messages')
                .insert({
                  user_id: userId,
                  conversation_id: conversationId,
                  to_number: From, // Reply to sender
                  from_number: To, // From our number
                  body: aiReply,
                  direction: 'outbound',
                  status: 'pending',
                  provider_type: 'twilio',
                  is_ai_generated: true,
                })
                .select()
                .maybeSingle();

              if (aiMsgError) {
                console.error('[Twilio SMS Webhook] Failed to store AI message:', aiMsgError);
              } else {
                console.log('[Twilio SMS Webhook] AI message stored:', aiMessage.id);
                
                // Send via SMS messaging function
                try {
                  const smsResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${serviceRoleKey}`,
                    },
                    body: JSON.stringify({
                      action: 'send',
                      to: From,
                      from: To,
                      body: aiReply,
                      userId: userId,
                      conversationId: conversationId,
                      isAiGenerated: true,
                    }),
                  });

                  if (!smsResponse.ok) {
                    const smsError = await smsResponse.text();
                    console.error('[Twilio SMS Webhook] Failed to send SMS:', smsError);
                    
                    // Update message status to failed
                    await supabaseAdmin
                      .from('sms_messages')
                      .update({ status: 'failed', error_message: smsError })
                      .eq('id', aiMessage.id);
                  } else {
                    console.log('[Twilio SMS Webhook] SMS sent successfully');
                    
                    // Update message status
                    await supabaseAdmin
                      .from('sms_messages')
                      .update({ status: 'sent', sent_at: new Date().toISOString() })
                      .eq('id', aiMessage.id);
                  }
                } catch (sendError) {
                  console.error('[Twilio SMS Webhook] Error sending SMS:', sendError);
                }
              }
            }
          }
        }
      } catch (aiError) {
        console.error('[Twilio SMS Webhook] AI processing error:', aiError);
      }
    }

    // Return TwiML response (empty response - we handle replies ourselves)
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      }
    );

  } catch (error) {
    console.error('[Twilio SMS Webhook] Error:', error);
    
    // Return TwiML response even on error
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { 
        status: 200, // Return 200 to prevent Twilio retries
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' },
      }
    );
  }
});
