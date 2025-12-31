import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Default webhook URL for Retell call events (handles transcript analysis, disposition routing, workflows)
const DEFAULT_WEBHOOK_URL = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/retell-call-webhook';

// Calendar integration function URL
const CALENDAR_FUNCTION_URL = 'https://emonjusymdripmkvtttc.supabase.co/functions/v1/calendar-integration';

interface RetellAgentRequest {
  action: 'create' | 'list' | 'update' | 'delete' | 'get' | 'preview_voice' | 'configure_calendar' | 'test_chat' | 'get_llm';
  agentName?: string;
  agentId?: string;
  voiceId?: string;
  llmId?: string;
  agentConfig?: any;
  text?: string; // For voice preview
  message?: string; // For test chat
  webhookUrl?: string; // Optional custom webhook URL
  userId?: string; // User ID for calendar configuration
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, agentName, agentId, voiceId, llmId, agentConfig, text, message, webhookUrl, userId }: RetellAgentRequest = await req.json();

    const apiKey = Deno.env.get('RETELL_AI_API_KEY');
    if (!apiKey) {
      throw new Error('RETELL_AI_API_KEY is not configured');
    }

    // Create Supabase client for calendar timezone lookup
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`[Retell Agent] Processing ${action} request`);

    const baseUrl = 'https://api.retellai.com';
    const headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    let response;

    switch (action) {
      case 'create':
        if (!agentName) {
          throw new Error('Agent name is required for creation');
        }
        if (!llmId) {
          throw new Error('LLM ID is required for creation');
        }
        
        const createPayload = {
          agent_name: agentName,
          voice_id: voiceId || '11labs-Adrian',
          response_engine: {
            type: 'retell-llm',
            llm_id: llmId
          },
          // Auto-configure webhook URL for call tracking
          webhook_url: webhookUrl || DEFAULT_WEBHOOK_URL,
          // Give time for dynamic variable injection on inbound calls
          begin_message_delay_ms: 2500,
        };
        
        console.log('[Retell Agent] Creating agent with payload:', JSON.stringify(createPayload));
        
        response = await fetch(`${baseUrl}/create-agent`, {
          method: 'POST',
          headers,
          body: JSON.stringify(createPayload),
        });
        break;

      case 'list':
        response = await fetch(`${baseUrl}/list-agents`, {
          method: 'GET',
          headers,
        });
        break;

      case 'get':
        if (!agentId) {
          throw new Error('Agent ID is required for get');
        }
        
        response = await fetch(`${baseUrl}/get-agent/${agentId}`, {
          method: 'GET',
          headers,
        });
        break;

      case 'update':
        if (!agentId) {
          throw new Error('Agent ID is required for update');
        }
        
        // Use agentConfig if provided (full update), otherwise use individual fields
        const updateData: any = agentConfig || {};
        
        // If no agentConfig provided, build from individual fields
        if (!agentConfig) {
          if (agentName) updateData.agent_name = agentName;
          if (voiceId) updateData.voice_id = voiceId;
          if (llmId) {
            updateData.response_engine = {
              type: 'retell-llm',
              llm_id: llmId
            };
          }
        }
        
        console.log(`[Retell Agent] Updating agent ${agentId} with:`, JSON.stringify(updateData));
        
        response = await fetch(`${baseUrl}/update-agent/${agentId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(updateData),
        });
        break;

      case 'delete':
        if (!agentId) {
          throw new Error('Agent ID is required for delete');
        }
        
        response = await fetch(`${baseUrl}/delete-agent/${agentId}`, {
          method: 'DELETE',
          headers,
        });
        break;

      case 'preview_voice':
        if (!voiceId) {
          throw new Error('Voice ID is required for preview');
        }
        
        const previewText = text || 'Hello! This is a preview of how I sound. I can help you with various tasks and have natural conversations.';
        
        // Retell doesn't have a direct voice preview API, so we return voice info
        // The frontend should use pre-recorded samples or ElevenLabs directly
        return new Response(JSON.stringify({ 
          success: true,
          voiceId: voiceId,
          message: 'Voice preview requested. Use the voice samples in the UI for preview.',
          sampleText: previewText
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'configure_calendar':
        if (!agentId) {
          throw new Error('Agent ID is required for calendar configuration');
        }
        if (!userId) {
          throw new Error('User ID is required for calendar configuration');
        }
        
        console.log(`[Retell Agent] Configuring calendar function for agent ${agentId} with user ${userId}`);
        
        // First, get the current agent to find the LLM ID
        const getAgentResp = await fetch(`${baseUrl}/get-agent/${agentId}`, {
          method: 'GET',
          headers,
        });
        
        if (!getAgentResp.ok) {
          const errorText = await getAgentResp.text();
          throw new Error(`Failed to get agent: ${errorText}`);
        }
        
        const currentAgent = await getAgentResp.json();
        console.log(`[Retell Agent] Current agent config:`, JSON.stringify(currentAgent));
        
        // Get the LLM ID from the agent
        const agentLlmId =
          currentAgent?.response_engine?.llm_id ||
          currentAgent?.response_engine?.llmId ||
          currentAgent?.llm_id;
        
        if (!agentLlmId) {
          throw new Error('Could not determine LLM ID from agent config. Make sure the agent uses a Retell LLM.');
        }
        
        console.log(`[Retell Agent] Agent uses LLM: ${agentLlmId}`);
        
        // Get user's timezone for the instructions
        const { data: availability } = await supabaseClient
          .from('calendar_availability')
          .select('timezone')
          .eq('user_id', userId)
          .maybeSingle();
        
        const userTimezone = availability?.timezone || 'America/New_York';
        
        // Build the calendar function configuration for LLM general_tools
        // CRITICAL: This MUST be added to the LLM's general_tools, NOT the agent's functions
        // EMBED user_id directly in the URL so the model doesn't need to remember it
        const calendarToolUrl = `${CALENDAR_FUNCTION_URL}?user_id=${userId}`;
        
        const calendarTool = {
          type: "custom",
          name: "manage_calendar",
          description: "REQUIRED: You MUST call this function before answering ANY question about time, date, or availability. Do NOT guess or assume - always call this first. The function returns current_time and available_slots.",
          url: calendarToolUrl,
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["get_available_slots", "book_appointment", "cancel_appointment"],
                description: "The calendar action to perform. Use get_available_slots for ANY time/availability question."
              },
              date: {
                type: "string",
                description: "Date in YYYY-MM-DD format (optional, defaults to today)"
              },
              time: {
                type: "string",
                description: "Time in HH:MM format (24-hour) - required for booking"
              },
              duration_minutes: {
                type: "number",
                description: "Meeting duration in minutes (default 30)"
              },
              attendee_name: {
                type: "string",
                description: "Name of the person booking"
              },
              attendee_email: {
                type: "string",
                description: "Email of the person booking (optional)"
              },
              attendee_phone: {
                type: "string",
                description: "Phone number of the person booking"
              },
              title: {
                type: "string",
                description: "Meeting title/subject"
              }
            },
            required: ["action"]
          },
          speak_during_execution: false,
          speak_after_execution: true
        };
        
        console.log(`[Retell Agent] Calendar tool URL: ${calendarToolUrl}`);
        
        // Get current LLM config
        const llmGetResp = await fetch(`${baseUrl}/get-retell-llm/${agentLlmId}`, {
          method: 'GET',
          headers,
        });
        
        if (!llmGetResp.ok) {
          const errorText = await llmGetResp.text();
          throw new Error(`Failed to get LLM config: ${errorText}`);
        }
        
        const llm = await llmGetResp.json();
        console.log(`[Retell Agent] Current LLM config:`, JSON.stringify(llm));
        
        // Get existing general_tools and add/replace the calendar tool
        let existingTools = llm.general_tools || [];
        
        // Remove any existing calendar tool
        existingTools = existingTools.filter((t: any) => t.name !== 'manage_calendar');
        
        // Add the new calendar tool
        existingTools.push(calendarTool);
        
        console.log(`[Retell Agent] Updating LLM with ${existingTools.length} general_tools`);
        
        // Update the LLM prompt with calendar instructions
        const currentPrompt = String(llm?.general_prompt || '');
        const markerStart = '[CALENDAR_TOOLING_v2]';
        const oldMarkerStart = '[CALENDAR_TOOLING_v1]';

        // Remove old versions if present
        let updatedPrompt = currentPrompt
          .replace(new RegExp(`${oldMarkerStart}[\\s\\S]*?\\[/CALENDAR_TOOLING_v1\\]`, 'g'), '')
          .replace(new RegExp(`${markerStart}[\\s\\S]*?\\[/CALENDAR_TOOLING_v2\\]`, 'g'), '')
          .trim();

        const calendarToolingBlock = [
          markerStart,
          '=== MANDATORY CALENDAR RULES (YOU MUST FOLLOW THESE) ===',
          '',
          'RULE #1 - NEVER GUESS TIME OR AVAILABILITY:',
          '- You do NOT know what time it is until you call manage_calendar.',
          '- You do NOT know what times are available until you call manage_calendar.',
          '- If you guess or assume, you WILL be wrong. Always call the function FIRST.',
          '',
          'RULE #2 - CALL manage_calendar FOR ANY TIME/DATE/AVAILABILITY QUESTION:',
          '- "What time is it?" → Call manage_calendar(action="get_available_slots") FIRST, then read current_time from response.',
          '- "Do you have availability?" → Call manage_calendar(action="get_available_slots") FIRST, then read available_slots from response.',
          '- "Can I book tomorrow at 3pm?" → Call manage_calendar(action="get_available_slots") FIRST, check if 3pm is in available_slots.',
          '',
          'RULE #3 - USE THE FUNCTION RESPONSE:',
          '- current_time: This is the ACTUAL current date and time. Use it to answer time questions.',
          '- available_slots: This is the list of ACTUAL available times. Only offer these times.',
          '- If available_slots is empty, say "I don\'t have any openings in the next few days. Would you like to check a different week?"',
          '- NEVER say "no availability" unless available_slots returned empty.',
          '',
          'RULE #4 - WAIT FOR FUNCTION RESULTS:',
          '- Do NOT speak while the function is executing.',
          '- Do NOT guess what the results will be.',
          '- Wait for the function to return, then use those results to respond.',
          '',
          `TIMEZONE: ${userTimezone}`,
          `USER_ID FOR ALL CALLS: ${userId}`,
          '',
          'BOOKING FLOW:',
          `1. Call manage_calendar(action="get_available_slots", user_id="${userId}")`,
          '2. Read current_time and available_slots from response',
          '3. Present 2-3 options from available_slots',
          '4. User picks a time',
          `5. Call manage_calendar(action="book_appointment", user_id="${userId}", date="YYYY-MM-DD", time="HH:MM", attendee_name="...", attendee_phone="...")`,
          '6. Confirm booking with full details',
          '',
          '=== END CALENDAR RULES ===',
          '[/CALENDAR_TOOLING_v2]',
        ].join('\n');

        updatedPrompt = `${updatedPrompt}\n\n${calendarToolingBlock}`.trim();
        
        // Update the LLM with both the tool AND the prompt
        const llmUpdateResp = await fetch(`${baseUrl}/update-retell-llm/${agentLlmId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            general_tools: existingTools,
            general_prompt: updatedPrompt
          }),
        });
        
        if (!llmUpdateResp.ok) {
          const errorText = await llmUpdateResp.text();
          console.error(`[Retell Agent] Failed to update LLM with calendar tool: ${errorText}`);
          throw new Error(`Failed to configure calendar on LLM: ${errorText}`);
        }
        
        const updatedLlm = await llmUpdateResp.json();
        console.log(`[Retell Agent] Successfully configured calendar tool on LLM ${agentLlmId}`);
        console.log(`[Retell Agent] LLM now has ${updatedLlm.general_tools?.length || 0} general_tools`);

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Calendar function configured successfully on LLM',
            llmId: agentLlmId,
            agentId: agentId,
            userId: userId,
            toolsCount: updatedLlm.general_tools?.length || 0,
            llmPromptUpdated: true,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );

      case 'test_chat':
        if (!agentId) {
          throw new Error('Agent ID is required for test chat');
        }
        if (!message) {
          throw new Error('Message is required for test chat');
        }
        
        console.log(`[Retell Agent] Testing chat with agent ${agentId}: ${message}`);
        
        // Use Retell's test conversation endpoint
        const testResponse = await fetch(`${baseUrl}/v2/create-web-call`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            agent_id: agentId,
            metadata: { test_mode: true }
          }),
        });
        
        if (!testResponse.ok) {
          const errorText = await testResponse.text();
          console.error(`[Retell Agent] Test chat failed: ${errorText}`);
          // Return a helpful message instead of failing
          return new Response(JSON.stringify({ 
            success: false,
            response: `To test this agent, use the Test Call feature with a real phone number, or test directly in the Retell AI dashboard. Message: "${message}"`,
            error: errorText
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const testData = await testResponse.json();
        return new Response(JSON.stringify({ 
          success: true,
          response: `Web call created for testing. Call ID: ${testData.call_id || 'N/A'}. Use the Retell dashboard or make a real test call to interact with the agent.`,
          callData: testData
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'get_llm':
        if (!llmId) {
          throw new Error('LLM ID is required');
        }
        
        console.log(`[Retell Agent] Fetching LLM: ${llmId}`);
        
        response = await fetch(`${baseUrl}/get-retell-llm/${llmId}`, {
          method: 'GET',
          headers,
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Retell Agent] Get LLM failed: ${errorText}`);
          throw new Error(`Failed to get LLM: ${errorText}`);
        }
        
        const llmData = await response.json();
        console.log(`[Retell Agent] LLM fetched successfully`);
        
        return new Response(JSON.stringify(llmData), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Retell Agent] API error - Status: ${response.status}, Body: ${errorText}`);
      throw new Error(`Retell AI API error: ${response.status} - ${errorText}`);
    }

    const data = action === 'delete' ? { success: true } : await response.json();
    console.log(`[Retell Agent] Success - Response:`, JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[Retell Agent] Error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
