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
    const { data: globalSettings } = await supabaseAdmin
      .from('ai_sms_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Check for workflow-specific auto-reply settings
    // 1. Find lead by phone number
    // 2. Check if lead is in an active workflow with auto_reply_settings enabled
    let workflowAutoReply: {
      enabled: boolean;
      ai_instructions?: string;
      knowledge_base?: string;
      response_delay_seconds?: number;
      stop_on_human_reply?: boolean;
      calendar_enabled?: boolean;
      booking_link?: string;
    } | null = null;
    let workflowName: string | null = null;

    const { data: lead } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('user_id', userId)
      .eq('phone_number', From)
      .maybeSingle();

    if (lead?.id) {
      // Check if this lead is in an active workflow with auto-reply enabled
      const { data: workflowProgress } = await supabaseAdmin
        .from('lead_workflow_progress')
        .select(`
          id,
          workflow_id,
          status,
          campaign_workflows:workflow_id (
            id,
            name,
            auto_reply_settings
          )
        `)
        .eq('lead_id', lead.id)
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();

      if (workflowProgress?.campaign_workflows) {
        const workflow = workflowProgress.campaign_workflows as any;
        const autoReplySettings = workflow.auto_reply_settings;
        
        if (autoReplySettings?.enabled) {
          workflowAutoReply = autoReplySettings;
          workflowName = workflow.name;
          console.log('[Twilio SMS Webhook] Found workflow auto-reply settings for workflow:', workflowName);
        }
      }
    }

    // Determine which settings to use (workflow overrides global)
    const useWorkflowSettings = !!workflowAutoReply?.enabled;
    const shouldAutoRespond = useWorkflowSettings 
      ? true 
      : (globalSettings?.enabled && globalSettings?.auto_response_enabled);

    console.log('[Twilio SMS Webhook] Auto-response config:', JSON.stringify({
      useWorkflowSettings,
      workflowName,
      globalEnabled: globalSettings?.enabled,
      globalAutoResponse: globalSettings?.auto_response_enabled,
      shouldAutoRespond
    }));

    // Double-texting prevention: Check if we've recently sent an AI message
    const preventDoubleTxt = useWorkflowSettings 
      ? true // Workflow auto-reply always prevents double texting
      : globalSettings?.prevent_double_texting;
    const delaySeconds = useWorkflowSettings 
      ? (workflowAutoReply?.response_delay_seconds || 60)
      : (globalSettings?.double_text_delay_seconds || 60);

    if (shouldAutoRespond && preventDoubleTxt && conversationId) {
      const preventionWindowMs = delaySeconds * 1000;
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
    if (shouldAutoRespond && conversationId) {
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
    if (shouldAutoRespond && conversationId) {
      console.log('[Twilio SMS Webhook] Auto-response enabled, generating AI response...' + 
        (useWorkflowSettings ? ` (using workflow: ${workflowName})` : ' (using global settings)'));
      
      // Check for reactions - skip auto-response for simple acknowledgments
      const reactionPatterns = [
        /^(👍|👎|❤️|😀|😊|🙏|👌|✅|ok|okay|k|thanks|thank you|thx|ty|cool|got it|sounds good|perfect|great|yes|no|yep|nope)$/i
      ];
      
      const isReaction = reactionPatterns.some(pattern => pattern.test(messageBody.trim()));
      
      if (isReaction && globalSettings?.enable_reaction_detection) {
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
      
      // Merge settings: workflow settings override global settings where available
      const effectiveSettings = {
        // Use workflow AI instructions if available, otherwise global
        ai_personality: useWorkflowSettings && workflowAutoReply?.ai_instructions 
          ? workflowAutoReply.ai_instructions 
          : globalSettings?.ai_personality,
        custom_instructions: useWorkflowSettings && workflowAutoReply?.ai_instructions 
          ? workflowAutoReply.ai_instructions 
          : globalSettings?.custom_instructions,
        knowledge_base: useWorkflowSettings && workflowAutoReply?.knowledge_base 
          ? workflowAutoReply.knowledge_base 
          : globalSettings?.knowledge_base,
        // Calendar settings - workflow can override
        enable_calendar_integration: useWorkflowSettings 
          ? workflowAutoReply?.calendar_enabled 
          : globalSettings?.enable_calendar_integration,
        calendar_booking_link: useWorkflowSettings && workflowAutoReply?.booking_link 
          ? workflowAutoReply.booking_link 
          : globalSettings?.calendar_booking_link,
        // Other settings from global (workflow doesn't override these)
        include_lead_context: globalSettings?.include_lead_context ?? true,
        include_call_history: globalSettings?.include_call_history ?? true,
        include_sms_history: globalSettings?.include_sms_history ?? true,
        max_history_items: globalSettings?.max_history_items || 5,
        context_window_size: globalSettings?.context_window_size || 20,
        dynamic_variables_enabled: globalSettings?.dynamic_variables_enabled ?? true,
      };
      
      console.log('[Twilio SMS Webhook] Using effective settings:', JSON.stringify({
        source: useWorkflowSettings ? `workflow:${workflowName}` : 'global',
        hasInstructions: !!effectiveSettings.ai_personality,
        hasKnowledgeBase: !!effectiveSettings.knowledge_base,
        calendarEnabled: effectiveSettings.enable_calendar_integration
      }));
      
      try {
        // Fetch lead info for context if enabled
        let leadContext = '';
        let leadData: any = null;
        
        if (effectiveSettings.include_lead_context) {
          const { data: leadInfo } = await supabaseAdmin
            .from('leads')
            .select('*')
            .eq('user_id', userId)
            .eq('phone_number', From)
            .maybeSingle();
          
          if (leadInfo) {
            leadData = leadInfo;
            leadContext = `\n\nLEAD INFORMATION:
- Name: ${leadInfo.first_name || ''} ${leadInfo.last_name || ''}
- Email: ${leadInfo.email || 'Not provided'}
- Company: ${leadInfo.company || 'Not provided'}
- Status: ${leadInfo.status || 'Unknown'}
- Lead Source: ${leadInfo.lead_source || 'Unknown'}
- Notes: ${leadInfo.notes || 'None'}
- Tags: ${leadInfo.tags?.join(', ') || 'None'}`;
            console.log('[Twilio SMS Webhook] Found lead context');
          }
        }
        
        // Fetch call history if enabled
        let callHistoryContext = '';
        if (effectiveSettings.include_call_history) {
          const maxHistoryItems = effectiveSettings.max_history_items || 5;
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
        const { data: historyMessages } = await supabaseAdmin
          .from('sms_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(effectiveSettings.context_window_size || 20);

        // Build conversation history (text only for history)
        const conversationHistory = (historyMessages || [])
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
            if (!text || !effectiveSettings.dynamic_variables_enabled) return text || '';
            
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
          
          // Build comprehensive system prompt with current date/time awareness
          // First, fetch user's timezone from calendar availability
          const { data: userAvailability } = await supabaseAdmin
            .from('calendar_availability')
            .select('timezone')
            .eq('user_id', userId)
            .maybeSingle();
          
          const userTimezone = userAvailability?.timezone || 'America/Denver'; // Default to Mountain Time
          
          // Get current time in user's timezone
          const now = new Date();
          const timeFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });
          const dateFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          const yearFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: userTimezone,
            year: 'numeric'
          });
          
          const currentTime = timeFormatter.format(now);
          const currentDate = dateFormatter.format(now);
          const currentYear = parseInt(yearFormatter.format(now));
          
          // Calculate tomorrow in user's timezone
          const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          const tomorrowDate = dateFormatter.format(tomorrow);
          
          console.log('[Twilio SMS Webhook] Using timezone:', userTimezone, 'Current time:', currentTime);
          
          let systemPrompt = `You are an AI SMS assistant.

CURRENT DATE & TIME (${userTimezone}):
- Today is: ${currentDate}
- Current time: ${currentTime}
- Current year: ${currentYear}
- IMPORTANT: When booking appointments, ALWAYS use the year ${currentYear} or later. Never book appointments in past years.
- IMPORTANT: All times should be in ${userTimezone} timezone.
- When someone says "tomorrow", that means ${tomorrowDate}.
- When someone says "next week", calculate from today (${currentDate}).
- If the user asks for the current date or time, answer directly using the CURRENT DATE & TIME above (do not guess).


PERSONALITY:
${effectiveSettings.ai_personality || 'professional and helpful'}`;

          // Add custom instructions if provided
          if (effectiveSettings.custom_instructions) {
            const processedInstructions = replaceDynamicVariables(effectiveSettings.custom_instructions);
            systemPrompt += `\n\nRULES & GUIDELINES:
${processedInstructions}`;
          }

          // Add knowledge base if provided
          if (effectiveSettings.knowledge_base) {
            const processedKnowledge = replaceDynamicVariables(effectiveSettings.knowledge_base);
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

          // Add calendar availability context if enabled
          if (effectiveSettings.enable_calendar_integration) {
            // Fetch calendar availability
            const { data: availability } = await supabaseAdmin
              .from('calendar_availability')
              .select('*')
              .eq('user_id', userId)
              .maybeSingle();

            // Fetch upcoming appointments (exclude cancelled)
            const now = new Date().toISOString();
            const { data: appointments } = await supabaseAdmin
              .from('calendar_appointments')
              .select('*')
              .eq('user_id', userId)
              .gte('start_time', now)
              .neq('status', 'cancelled')
              .order('start_time', { ascending: true })
              .limit(10);

            if (availability || appointments?.length) {
              systemPrompt += `\n\nCALENDAR INTEGRATION:`;
              
              if (availability) {
                const schedule = availability.weekly_schedule || {};
                const workingDays = Object.entries(schedule)
                  .filter(([_, slots]: [string, any]) => slots && slots.length > 0)
                  .map(([day, slots]: [string, any]) => {
                    const slot = slots[0];
                    return `${day.charAt(0).toUpperCase() + day.slice(1)}: ${slot.start}-${slot.end}`;
                  });
                
                if (workingDays.length > 0) {
                  systemPrompt += `\n- Available hours: ${workingDays.join(', ')}`;
                  systemPrompt += `\n- Timezone: ${availability.timezone || userTimezone}`;
                  systemPrompt += `\n- Meeting duration: ${availability.default_meeting_duration || 30} minutes`;
                }
              }

              if (appointments?.length) {
                systemPrompt += `\n- Upcoming booked slots:`;
                const apptDateFormatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: userTimezone,
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  weekday: 'long',
                });
                const apptTimeFormatter = new Intl.DateTimeFormat('en-US', {
                  timeZone: userTimezone,
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                });

                appointments.slice(0, 5).forEach((apt: any) => {
                  const startDate = new Date(apt.start_time);
                  const dateStr = apptDateFormatter.format(startDate);
                  const timeStr = apptTimeFormatter.format(startDate);
                  systemPrompt += `\n  * ${dateStr} at ${timeStr} - ${apt.title}`;
                });
              }

              if (effectiveSettings.calendar_booking_link) {
                systemPrompt += `\n- Booking link to share: ${effectiveSettings.calendar_booking_link}`;
              }

              systemPrompt += `\n- You CAN check availability and suggest specific open times`;
              systemPrompt += `\n- When the lead confirms they want to book, USE THE book_appointment TOOL to actually create the appointment`;
              systemPrompt += `\n- When scheduling, confirm the date, time, and timezone with the lead BEFORE booking`;
              systemPrompt += `\n- If they want to cancel, USE THE cancel_appointment TOOL`;
              console.log('[Twilio SMS Webhook] Added calendar context');
            }
          }

          // Add general SMS guidelines
          systemPrompt += `\n\nSMS GUIDELINES:
- Keep responses concise and appropriate for SMS (under 300 characters when possible)
- Be conversational and natural
- Don't use markdown formatting
- If asked about scheduling, be helpful and suggest specific times
- Never pretend to be human - you can acknowledge you're an AI assistant if asked
- Be direct and get to the point
- IMPORTANT: When you have tools available, USE THEM to take actions. Don't just say you did something - actually do it by calling the appropriate tool.`;

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

          console.log('[Twilio SMS Webhook] Sending request to Lovable AI Gateway with tool support');
          
          // Define available tools for the AI
          const tools = effectiveSettings.enable_calendar_integration ? [
            {
              type: 'function',
              function: {
                name: 'check_appointments',
                description: 'Check what appointments are scheduled for this lead. Use this when they ask about their upcoming appointments or want to know what is booked.',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: []
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'book_appointment',
                description: 'Book an appointment/meeting with the lead. Use this when the lead confirms they want to schedule.',
                parameters: {
                  type: 'object',
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Title of the appointment (e.g., "Demo Call", "Consultation")'
                    },
                    date: {
                      type: 'string',
                      description: 'Date in YYYY-MM-DD format'
                    },
                    time: {
                      type: 'string',
                      description: 'Time in HH:MM format (24-hour)'
                    },
                    duration_minutes: {
                      type: 'number',
                      description: 'Duration in minutes (default 30)'
                    },
                    timezone: {
                      type: 'string',
                      description: 'Timezone (e.g., "America/Denver", "America/Chicago")'
                    }
                  },
                  required: ['title', 'date', 'time']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'reschedule_appointment',
                description: 'Reschedule an existing appointment to a new date/time. Use this when the lead wants to change their appointment time.',
                parameters: {
                  type: 'object',
                  properties: {
                    new_date: {
                      type: 'string',
                      description: 'New date in YYYY-MM-DD format'
                    },
                    new_time: {
                      type: 'string',
                      description: 'New time in HH:MM format (24-hour)'
                    },
                    timezone: {
                      type: 'string',
                      description: 'Timezone (e.g., "America/Denver", "America/Chicago")'
                    }
                  },
                  required: ['new_date', 'new_time']
                }
              }
            },
            {
              type: 'function',
              function: {
                name: 'cancel_appointment',
                description: 'Cancel an existing appointment for the lead. Use when they want to cancel completely.',
                parameters: {
                  type: 'object',
                  properties: {
                    reason: {
                      type: 'string',
                      description: 'Reason for cancellation'
                    }
                  }
                }
              }
            }
          ] : [];
          
          const aiRequestBody: any = {
            model: 'google/gemini-2.5-flash',
            messages: aiMessages,
          };
          
          if (tools.length > 0) {
            aiRequestBody.tools = tools;
            aiRequestBody.tool_choice = 'auto';
          }

          const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${lovableApiKey}`,
            },
            body: JSON.stringify(aiRequestBody),
          });

          if (!aiResponse.ok) {
            const errorText = await aiResponse.text();
            console.error('[Twilio SMS Webhook] Lovable AI error:', aiResponse.status, errorText);
          } else {
            const aiData = await aiResponse.json();
            const aiMessage = aiData.choices?.[0]?.message;
            
            // Check if AI wants to call a tool
            let aiReply = aiMessage?.content || '';
            const toolCalls = aiMessage?.tool_calls;
            
            if (toolCalls && toolCalls.length > 0) {
              console.log('[Twilio SMS Webhook] AI requested tool calls:', toolCalls.length);
              const toolResults: { function: string; result: string }[] = [];
              
              for (const toolCall of toolCalls) {
                const functionName = toolCall.function?.name;
                const functionArgs = JSON.parse(toolCall.function?.arguments || '{}');
                
                console.log('[Twilio SMS Webhook] Processing tool call:', functionName, functionArgs);
                
                if (functionName === 'check_appointments') {
                  try {
                    // Find all upcoming appointments for this lead
                    let appointmentsInfo = 'No upcoming appointments found.';
                    
                    if (lead?.id) {
                      const now = new Date().toISOString();
                      const { data: appointments } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('lead_id', lead.id)
                        .eq('status', 'scheduled')
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(5);
                      
                      if (appointments && appointments.length > 0) {
                        appointmentsInfo = `Found ${appointments.length} upcoming appointment(s):\n`;
                        appointments.forEach((apt: any, index: number) => {
                          const startDate = new Date(apt.start_time);
                          const dateStr = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                          const timeStr = startDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                          appointmentsInfo += `${index + 1}. ${apt.title} - ${dateStr} at ${timeStr}\n`;
                        });
                      }
                    }
                    
                    // Add this info to the tool response
                    toolResults.push({ function: 'check_appointments', result: appointmentsInfo });
                    console.log('[Twilio SMS Webhook] Checked appointments:', appointmentsInfo);
                  } catch (checkError) {
                    console.error('[Twilio SMS Webhook] Check appointments error:', checkError);
                  }
                }
                
                if (functionName === 'book_appointment') {
                  try {
                    // Parse the date and time
                    const appointmentDateStr = functionArgs.date;
                    const appointmentTime = functionArgs.time || '09:00';
                    const duration = functionArgs.duration_minutes || 30;
                    const timezone = functionArgs.timezone || 'America/Chicago';

                    // Build initial Date from the AI-provided string
                    let startDateTime = new Date(`${appointmentDateStr}T${appointmentTime}:00`);
                    const now = new Date();

                    // If the parsed date is in the past, roll it forward by years
                    let safetyCounter = 0;
                    while (startDateTime.getTime() <= now.getTime() && safetyCounter < 5) {
                      startDateTime = new Date(
                        startDateTime.getFullYear() + 1,
                        startDateTime.getMonth(),
                        startDateTime.getDate(),
                        startDateTime.getHours(),
                        startDateTime.getMinutes(),
                        startDateTime.getSeconds(),
                      );
                      safetyCounter++;
                    }

                    const endDateTime = new Date(startDateTime.getTime() + duration * 60 * 1000);
                    console.log('[Twilio SMS Webhook] Normalized appointment time:', {
                      requestedDate: appointmentDateStr,
                      finalStart: startDateTime.toISOString(),
                      timezone,
                    });
                    let appointmentLeadId = lead?.id || null;
                    if (!appointmentLeadId) {
                      // Create a new lead for this phone number
                      const { data: newLead } = await supabaseAdmin
                        .from('leads')
                        .insert({
                          user_id: userId,
                          phone_number: From,
                          status: 'appointment_scheduled'
                        })
                        .select('id')
                        .maybeSingle();
                      appointmentLeadId = newLead?.id;
                    }
                    
                    // Create the appointment
                    const { data: appointment, error: apptError } = await supabaseAdmin
                      .from('calendar_appointments')
                      .insert({
                        user_id: userId,
                        lead_id: appointmentLeadId,
                        title: functionArgs.title || 'Appointment',
                        start_time: startDateTime.toISOString(),
                        end_time: endDateTime.toISOString(),
                        timezone: timezone,
                        status: 'scheduled',
                        notes: `Booked via AI SMS conversation with ${From}`
                      })
                      .select()
                      .maybeSingle();
                    
                    if (apptError) {
                      console.error('[Twilio SMS Webhook] Failed to create appointment:', apptError);
                    } else {
                      console.log('[Twilio SMS Webhook] Appointment created:', appointment.id);
                      
                      // Update lead status
                      if (appointmentLeadId) {
                        await supabaseAdmin
                          .from('leads')
                          .update({ 
                            status: 'appointment_scheduled',
                            next_callback_at: startDateTime.toISOString()
                          })
                          .eq('id', appointmentLeadId);
                      }
                      
                      // Sync to Google Calendar
                      try {
                        const syncResponse = await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${serviceRoleKey}`,
                          },
                          body: JSON.stringify({
                            action: 'sync_appointment',
                            appointment: appointment
                          }),
                        });
                        
                        if (syncResponse.ok) {
                          console.log('[Twilio SMS Webhook] Appointment synced to calendar');
                        } else {
                          console.error('[Twilio SMS Webhook] Calendar sync failed');
                        }
                      } catch (syncError) {
                        console.error('[Twilio SMS Webhook] Calendar sync error:', syncError);
                      }
                    }
                  } catch (bookingError) {
                    console.error('[Twilio SMS Webhook] Booking error:', bookingError);
                  }
                }
                
                if (functionName === 'reschedule_appointment') {
                  try {
                    const now = new Date().toISOString();
                    let existingAppt = null;
                    
                    // First try to find by lead_id
                    if (lead?.id) {
                      const { data: apptByLead } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('lead_id', lead.id)
                        .eq('status', 'scheduled')
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByLead;
                    }
                    
                    // If not found by lead_id, try to find by phone number in notes
                    if (!existingAppt) {
                      const { data: apptByPhone } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('status', 'scheduled')
                        .gte('start_time', now)
                        .ilike('notes', `%${From}%`)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByPhone;
                      console.log('[Twilio SMS Webhook] Searched reschedule by phone in notes, found:', existingAppt?.id);
                    }
                      
                      if (existingAppt) {
                        const newDateStr = functionArgs.new_date;
                        const newTime = functionArgs.new_time || '09:00';
                        const timezone = functionArgs.timezone || existingAppt.timezone || 'America/Chicago';
                        
                        // Calculate new start time
                        let newStartDateTime = new Date(`${newDateStr}T${newTime}:00`);
                        const currentNow = new Date();
                        
                        // Roll forward if in past
                        let safetyCounter = 0;
                        while (newStartDateTime.getTime() <= currentNow.getTime() && safetyCounter < 5) {
                          newStartDateTime = new Date(
                            newStartDateTime.getFullYear() + 1,
                            newStartDateTime.getMonth(),
                            newStartDateTime.getDate(),
                            newStartDateTime.getHours(),
                            newStartDateTime.getMinutes(),
                            newStartDateTime.getSeconds(),
                          );
                          safetyCounter++;
                        }
                        
                        // Calculate duration from original appointment
                        const originalStart = new Date(existingAppt.start_time);
                        const originalEnd = new Date(existingAppt.end_time);
                        const duration = (originalEnd.getTime() - originalStart.getTime()) / (60 * 1000);
                        const newEndDateTime = new Date(newStartDateTime.getTime() + duration * 60 * 1000);
                        
                        // Update the appointment
                        const { error: updateError } = await supabaseAdmin
                          .from('calendar_appointments')
                          .update({
                            start_time: newStartDateTime.toISOString(),
                            end_time: newEndDateTime.toISOString(),
                            timezone: timezone,
                            notes: `${existingAppt.notes || ''}\nRescheduled via SMS on ${new Date().toLocaleDateString()}`
                          })
                          .eq('id', existingAppt.id);
                        
                        if (!updateError) {
                          console.log('[Twilio SMS Webhook] Appointment rescheduled:', existingAppt.id);
                          
                          // Update lead's next callback if we have a lead
                          if (lead?.id) {
                            await supabaseAdmin
                              .from('leads')
                              .update({ next_callback_at: newStartDateTime.toISOString() })
                              .eq('id', lead.id);
                          }
                          
                          // Sync update to Google Calendar
                          if (existingAppt.google_event_id) {
                            try {
                              await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${serviceRoleKey}`,
                                },
                                body: JSON.stringify({
                                  action: 'update_event',
                                  user_id: userId,
                                  event_id: existingAppt.google_event_id,
                                  updates: {
                                    start_time: newStartDateTime.toISOString(),
                                    end_time: newEndDateTime.toISOString(),
                                    timezone: timezone
                                  }
                                }),
                              });
                              console.log('[Twilio SMS Webhook] Google Calendar event updated');
                            } catch (syncError) {
                              console.error('[Twilio SMS Webhook] Calendar update error:', syncError);
                            }
                          }
                        }
                      } else {
                        console.log('[Twilio SMS Webhook] No appointment to reschedule for:', From);
                      }
                  } catch (rescheduleError) {
                    console.error('[Twilio SMS Webhook] Reschedule error:', rescheduleError);
                  }
                }
                
                if (functionName === 'cancel_appointment') {
                  try {
                    const now = new Date().toISOString();
                    let existingAppt = null;
                    
                    // First try to find by lead_id
                    if (lead?.id) {
                      const { data: apptByLead } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('id, google_event_id, title, start_time')
                        .eq('lead_id', lead.id)
                        .eq('status', 'scheduled')
                        .gte('start_time', now)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByLead;
                    }
                    
                    // If not found by lead_id, try to find by phone number in notes
                    if (!existingAppt) {
                      const { data: apptByPhone } = await supabaseAdmin
                        .from('calendar_appointments')
                        .select('id, google_event_id, title, start_time')
                        .eq('user_id', userId)
                        .eq('status', 'scheduled')
                        .gte('start_time', now)
                        .ilike('notes', `%${From}%`)
                        .order('start_time', { ascending: true })
                        .limit(1)
                        .maybeSingle();
                      existingAppt = apptByPhone;
                      console.log('[Twilio SMS Webhook] Searched by phone in notes, found:', existingAppt?.id);
                    }
                    
                    if (existingAppt) {
                      await supabaseAdmin
                        .from('calendar_appointments')
                        .update({ 
                          status: 'cancelled',
                          notes: `Cancelled via SMS: ${functionArgs.reason || 'No reason provided'}`
                        })
                        .eq('id', existingAppt.id);
                      
                      console.log('[Twilio SMS Webhook] Appointment cancelled:', existingAppt.id);
                      
                      // Update lead status if we have a lead
                      if (lead?.id) {
                        await supabaseAdmin
                          .from('leads')
                          .update({ status: 'callback_requested', next_callback_at: null })
                          .eq('id', lead.id);
                      }
                      
                      // Delete from Google Calendar if synced
                      if (existingAppt.google_event_id) {
                        try {
                          await fetch(`${supabaseUrl}/functions/v1/calendar-integration`, {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': `Bearer ${serviceRoleKey}`,
                            },
                            body: JSON.stringify({
                              action: 'delete_event',
                              user_id: userId,
                              event_id: existingAppt.google_event_id
                            }),
                          });
                          console.log('[Twilio SMS Webhook] Google Calendar event deleted');
                        } catch (syncError) {
                          console.error('[Twilio SMS Webhook] Calendar delete error:', syncError);
                        }
                      }
                    } else {
                      console.log('[Twilio SMS Webhook] No appointment found to cancel for:', From);
                    }
                  } catch (cancelError) {
                    console.error('[Twilio SMS Webhook] Cancel error:', cancelError);
                  }
                }
              }
              
              // If AI provided content alongside tool calls, use that as the reply
              // Otherwise, make another call to get a confirmation message
              if (!aiReply) {
                const confirmMessages = [
                  ...aiMessages,
                  { role: 'assistant', content: null, tool_calls: toolCalls },
                  { role: 'tool', tool_call_id: toolCalls[0].id, content: 'Action completed successfully' }
                ];
                
                const confirmResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${lovableApiKey}`,
                  },
                  body: JSON.stringify({
                    model: 'google/gemini-2.5-flash',
                    messages: confirmMessages,
                  }),
                });
                
                if (confirmResponse.ok) {
                  const confirmData = await confirmResponse.json();
                  aiReply = confirmData.choices?.[0]?.message?.content || 'Done!';
                }
              }
            }
            
            if (aiReply) {
              console.log('[Twilio SMS Webhook] AI response generated:', aiReply.substring(0, 100));
              
              // Store AI response
              const { data: storedMessage, error: aiMsgError } = await supabaseAdmin
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
                console.log('[Twilio SMS Webhook] AI message stored:', storedMessage.id);
                
                // Send via SMS messaging function
                try {
                  const smsResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${serviceRoleKey}`,
                    },
                    body: JSON.stringify({
                      action: 'send_sms',
                      to: From,
                      from: To,
                      body: aiReply,
                      user_id: userId,
                      conversation_id: conversationId,
                    }),
                  });

                  if (!smsResponse.ok) {
                    const smsError = await smsResponse.text();
                    console.error('[Twilio SMS Webhook] Failed to send SMS:', smsError);
                    
                    // Update message status to failed
                    await supabaseAdmin
                      .from('sms_messages')
                      .update({ status: 'failed', error_message: smsError })
                      .eq('id', storedMessage.id);
                  } else {
                    console.log('[Twilio SMS Webhook] SMS sent successfully');
                    
                    // Update message status
                    await supabaseAdmin
                      .from('sms_messages')
                      .update({ status: 'sent', sent_at: new Date().toISOString() })
                      .eq('id', storedMessage.id);
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
