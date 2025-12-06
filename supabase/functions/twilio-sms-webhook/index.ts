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
        .single();

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
        .single();
      
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
- Be natural and conversational
- Emojis are allowed and encouraged when appropriate to add warmth and personality 😊
- Avoid special formatting like markdown, bullet points, or numbered lists that don't render well in SMS
- If the user sends an image, describe what you see and respond appropriately`;

          console.log('[Twilio SMS Webhook] System prompt built, length:', systemPrompt.length);

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

                  // Autonomous SMS analysis and pipeline management
                  await analyzeAndUpdateFromSms(
                    supabaseAdmin,
                    userId,
                    From,
                    messageBody,
                    generatedText,
                    leadData,
                    conversationHistory
                  );

                  console.log('[Twilio SMS Webhook] Auto-response stored and pipeline updated');
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

// Autonomous SMS Analysis and Pipeline Management
async function analyzeAndUpdateFromSms(
  supabase: any,
  userId: string,
  contactPhone: string,
  incomingMessage: string,
  aiResponse: string,
  leadData: any,
  conversationHistory: any[]
) {
  console.log('[Autonomous SMS] Analyzing conversation for disposition...');
  
  // Find or create lead
  let leadId = leadData?.id;
  
  if (!leadId) {
    // Check if lead exists
    const { data: existingLead } = await supabase
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', contactPhone)
      .maybeSingle();
    
    if (existingLead) {
      leadId = existingLead.id;
    } else {
      // Create new lead autonomously
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert({
          user_id: userId,
          phone_number: contactPhone,
          status: 'new',
          lead_source: 'sms_inbound'
        })
        .select()
        .single();
      
      if (!leadError && newLead) {
        leadId = newLead.id;
        console.log('[Autonomous SMS] Created new lead from SMS:', leadId);
        
        // Log the decision
        await supabase.from('agent_decisions').insert({
          user_id: userId,
          lead_id: leadId,
          decision_type: 'create_lead',
          reasoning: 'New inbound SMS from unknown number - created lead for tracking',
          action_taken: 'Created lead from SMS conversation',
          executed_at: new Date().toISOString(),
          success: true
        });
      }
    }
  }

  if (!leadId) {
    console.log('[Autonomous SMS] Could not get or create lead, skipping pipeline update');
    return;
  }

  // Analyze the conversation for intent/disposition
  const disposition = analyzeMessageIntent(incomingMessage, aiResponse, conversationHistory);
  console.log('[Autonomous SMS] Detected disposition:', disposition);

  // Update lead status based on SMS
  const statusMapping: Record<string, string> = {
    'Interested': 'qualified',
    'Appointment Request': 'appointment',
    'Callback Request': 'callback',
    'Not Interested': 'not-interested',
    'Question': 'engaged',
    'Engaged': 'engaged',
    'Hot Lead': 'hot',
    'New': 'new'
  };

  const newStatus = statusMapping[disposition] || 'engaged';
  
  await supabase
    .from('leads')
    .update({
      status: newStatus,
      last_contacted_at: new Date().toISOString()
    })
    .eq('id', leadId);

  // Update pipeline position
  await updateSmsPipelinePosition(supabase, userId, leadId, disposition);

  // Schedule follow-up if needed
  await scheduleFollowUpFromSms(supabase, userId, leadId, disposition, incomingMessage);

  // Log the agent decision
  await supabase.from('agent_decisions').insert({
    user_id: userId,
    lead_id: leadId,
    decision_type: 'sms_disposition',
    reasoning: `SMS conversation analyzed. User message indicates: ${disposition}`,
    action_taken: `Set status to ${newStatus}, updated pipeline to ${disposition}`,
    executed_at: new Date().toISOString(),
    success: true
  });
}

function analyzeMessageIntent(
  incomingMessage: string,
  aiResponse: string,
  conversationHistory: any[]
): string {
  const lowerMessage = incomingMessage.toLowerCase();
  
  // Check for explicit interest signals
  if (
    lowerMessage.includes('interested') ||
    lowerMessage.includes('tell me more') ||
    lowerMessage.includes('how much') ||
    lowerMessage.includes('pricing') ||
    lowerMessage.includes('sign up') ||
    lowerMessage.includes('sign me up') ||
    lowerMessage.includes('yes') && lowerMessage.length < 20
  ) {
    return 'Interested';
  }
  
  // Check for appointment requests
  if (
    lowerMessage.includes('schedule') ||
    lowerMessage.includes('appointment') ||
    lowerMessage.includes('meet') ||
    lowerMessage.includes('call me') ||
    lowerMessage.includes('when can') ||
    lowerMessage.includes('available')
  ) {
    return 'Appointment Request';
  }
  
  // Check for callback requests
  if (
    lowerMessage.includes('call me back') ||
    lowerMessage.includes('callback') ||
    lowerMessage.includes('give me a call') ||
    lowerMessage.includes('phone call')
  ) {
    return 'Callback Request';
  }
  
  // Check for not interested
  if (
    lowerMessage.includes('not interested') ||
    lowerMessage.includes('stop') ||
    lowerMessage.includes('unsubscribe') ||
    lowerMessage.includes('remove me') ||
    lowerMessage.includes('do not contact') ||
    lowerMessage.includes('leave me alone')
  ) {
    return 'Not Interested';
  }
  
  // Check for questions (indicates engagement)
  if (
    lowerMessage.includes('?') ||
    lowerMessage.includes('what') ||
    lowerMessage.includes('how') ||
    lowerMessage.includes('who') ||
    lowerMessage.includes('where') ||
    lowerMessage.includes('when') ||
    lowerMessage.includes('why')
  ) {
    return 'Question';
  }
  
  // Check for high-interest signals
  if (
    lowerMessage.includes('asap') ||
    lowerMessage.includes('urgent') ||
    lowerMessage.includes('today') ||
    lowerMessage.includes('right now') ||
    lowerMessage.includes('immediately')
  ) {
    return 'Hot Lead';
  }
  
  // Default to engaged if they're responding
  if (conversationHistory.length > 2) {
    return 'Engaged';
  }
  
  return 'New';
}

async function updateSmsPipelinePosition(
  supabase: any,
  userId: string,
  leadId: string,
  disposition: string
) {
  // Find or create the pipeline stage
  let stage = await findOrCreateSmsPipelineStage(supabase, userId, disposition);

  if (stage) {
    // Check if lead already has a position
    const { data: existingPosition } = await supabase
      .from('lead_pipeline_positions')
      .select('id')
      .eq('lead_id', leadId)
      .maybeSingle();

    if (existingPosition) {
      await supabase
        .from('lead_pipeline_positions')
        .update({
          pipeline_board_id: stage.id,
          moved_at: new Date().toISOString(),
          moved_by_user: false,
          notes: `Auto-moved by SMS disposition: ${disposition}`
        })
        .eq('id', existingPosition.id);
    } else {
      await supabase
        .from('lead_pipeline_positions')
        .insert({
          user_id: userId,
          lead_id: leadId,
          pipeline_board_id: stage.id,
          moved_by_user: false,
          notes: `Auto-added by SMS disposition: ${disposition}`
        });
    }
    
    console.log(`[Autonomous SMS] Updated pipeline position to ${disposition} for lead ${leadId}`);
  }
}

async function findOrCreateSmsPipelineStage(
  supabase: any,
  userId: string,
  stageName: string
) {
  // First try to find existing stage
  const { data: existingStage } = await supabase
    .from('pipeline_boards')
    .select('id, position')
    .eq('user_id', userId)
    .ilike('name', `%${stageName}%`)
    .maybeSingle();

  if (existingStage) {
    return existingStage;
  }

  // Stage doesn't exist - create it autonomously
  console.log(`[Autonomous SMS] Creating new pipeline stage: ${stageName}`);

  // Get the highest position to add new stage at the end
  const { data: lastStage } = await supabase
    .from('pipeline_boards')
    .select('position')
    .eq('user_id', userId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  const newPosition = (lastStage?.position || 0) + 1;

  // Create the new stage
  const { data: newStage, error: createError } = await supabase
    .from('pipeline_boards')
    .insert({
      user_id: userId,
      name: stageName,
      description: `Auto-created from SMS disposition`,
      position: newPosition,
      settings: {
        auto_created: true,
        created_from: 'sms_webhook',
        created_at: new Date().toISOString()
      }
    })
    .select()
    .single();

  if (createError) {
    console.error('[Autonomous SMS] Error creating pipeline stage:', createError);
    return null;
  }

  // Log the autonomous decision
  await supabase.from('agent_decisions').insert({
    user_id: userId,
    decision_type: 'create_pipeline_stage',
    reasoning: `Created new pipeline stage "${stageName}" to handle SMS disposition`,
    action_taken: `Created pipeline stage with position ${newPosition}`,
    executed_at: new Date().toISOString(),
    success: true
  });

  console.log(`[Autonomous SMS] Created new pipeline stage: ${stageName} (id: ${newStage.id})`);
  return newStage;
}

async function scheduleFollowUpFromSms(
  supabase: any,
  userId: string,
  leadId: string,
  disposition: string,
  message: string
) {
  // Determine follow-up action based on disposition
  const followUpConfig: Record<string, { action: string; delayMinutes: number }> = {
    'Callback Request': { action: 'ai_call', delayMinutes: 5 }, // Call soon
    'Appointment Request': { action: 'ai_sms', delayMinutes: 30 }, // Confirm SMS
    'Interested': { action: 'ai_sms', delayMinutes: 60 }, // Follow-up in 1 hour
    'Question': { action: 'ai_sms', delayMinutes: 120 }, // Check in later
    'Hot Lead': { action: 'ai_call', delayMinutes: 10 }, // Call quickly
  };

  const config = followUpConfig[disposition];
  if (!config) {
    console.log(`[Autonomous SMS] No follow-up configured for disposition: ${disposition}`);
    return;
  }

  // Check if there's already a pending follow-up
  const { data: existingFollowUp } = await supabase
    .from('scheduled_follow_ups')
    .select('id')
    .eq('lead_id', leadId)
    .eq('status', 'pending')
    .maybeSingle();

  if (existingFollowUp) {
    console.log(`[Autonomous SMS] Follow-up already scheduled for lead ${leadId}`);
    return;
  }

  const scheduledAt = new Date();
  scheduledAt.setMinutes(scheduledAt.getMinutes() + config.delayMinutes);

  const { error } = await supabase
    .from('scheduled_follow_ups')
    .insert({
      user_id: userId,
      lead_id: leadId,
      action_type: config.action,
      scheduled_at: scheduledAt.toISOString(),
      status: 'pending'
    });

  if (error) {
    console.error('[Autonomous SMS] Error scheduling follow-up:', error);
  } else {
    console.log(`[Autonomous SMS] Scheduled ${config.action} follow-up for ${disposition} at ${scheduledAt.toISOString()}`);
  }
}
