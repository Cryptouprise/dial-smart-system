
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
        
        // First, get the current agent to see existing functions
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
        
        // Build the calendar function configuration
        const calendarFunction = {
          type: "custom",
          name: "manage_calendar",
          description: "Check availability and book/cancel appointments. Always call get_available_slots first before booking.",
          url: CALENDAR_FUNCTION_URL,
          parameters: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: ["get_available_slots", "book_appointment", "cancel_appointment"],
                description: "The calendar action to perform"
              },
              user_id: {
                type: "string",
                description: `The user ID for calendar operations. Always use: ${userId}`,
                default: userId
              },
              date: {
                type: "string",
                description: "Date in YYYY-MM-DD format"
              },
              time: {
                type: "string",
                description: "Time in HH:MM format (24-hour)"
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
                description: "Email of the person booking"
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
            required: ["action", "user_id"]
          },
          speak_during_execution: true,
          speak_after_execution: true
        };
        
        // Get existing functions and add/replace the calendar function
        let existingFunctions = currentAgent.functions || [];
        
        // Remove any existing calendar function
        existingFunctions = existingFunctions.filter((f: any) => f.name !== 'manage_calendar');
        
        // Add the new calendar function
        existingFunctions.push(calendarFunction);
        
        console.log(`[Retell Agent] Updating agent with ${existingFunctions.length} functions`);
        
        // Update the agent with the new functions
        response = await fetch(`${baseUrl}/update-agent/${agentId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            functions: existingFunctions
          }),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Retell Agent] Failed to update agent with calendar function: ${errorText}`);
          throw new Error(`Failed to configure calendar: ${errorText}`);
        }
        
        const updatedAgent = await response.json();
        console.log(`[Retell Agent] Successfully configured calendar function`);

        // Also update the underlying Retell LLM prompt so it actually USES the calendar tool
        // (otherwise the model may guess and say "fully booked" without calling manage_calendar).
        let llmPromptUpdated = false;
        let llmPromptUpdateError: string | null = null;

        try {
          const agentLlmId =
            currentAgent?.response_engine?.llm_id ||
            currentAgent?.response_engine?.llmId ||
            currentAgent?.llm_id;

          if (agentLlmId) {
            const llmGetResp = await fetch(`${baseUrl}/get-retell-llm/${agentLlmId}`, {
              method: 'GET',
              headers,
            });

            if (llmGetResp.ok) {
              const llm = await llmGetResp.json();
              const currentPrompt = String(llm?.general_prompt || '');
              const markerStart = '[CALENDAR_TOOLING_v2]';
              const oldMarkerStart = '[CALENDAR_TOOLING_v1]';

              // Remove old version if present
              let updatedPrompt = currentPrompt.replace(new RegExp(`${oldMarkerStart}[\\s\\S]*?\\[/CALENDAR_TOOLING_v1\\]`, 'g'), '').trim();

              if (!updatedPrompt.includes(markerStart)) {
                // Get user's timezone for the instructions
                const { data: availability } = await supabaseClient
                  .from('calendar_availability')
                  .select('timezone')
                  .eq('user_id', userId)
                  .maybeSingle();
                
                const userTimezone = availability?.timezone || 'America/New_York';
                const currentTime = new Date().toLocaleString('en-US', { 
                  timeZone: userTimezone,
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  timeZoneName: 'short'
                });

                const calendarToolingBlock = [
                  markerStart,
                  'CALENDAR BOOKING RULES (CRITICAL - ALWAYS FOLLOW):',
                  '1. ALWAYS call manage_calendar with action="get_available_slots" FIRST before mentioning any appointment times.',
                  '   - The function will return the current_time in the response - use this to know what time it is now.',
                  '2. NEVER suggest times without checking availability first - you do not know what times are available until you call the function.',
                  '3. NEVER book appointments in the past - the get_available_slots response includes current_time, so check that first.',
                  '4. When user requests a specific time, check if it\'s in your available_slots response before confirming.',
                  '5. If the requested time is not available, politely suggest 2-3 alternatives from the available_slots response.',
                  '6. After booking, confirm with: "Perfect! I\'ve scheduled your appointment for [DAY] [DATE] at [TIME]."',
                  '',
                  'TIMEZONE & DATE AWARENESS:',
                  `- Your timezone: ${userTimezone}`,
                  `- IMPORTANT: When you call get_available_slots, the response includes "current_time" - ALWAYS use that to know what time it is now.`,
                  '- All times you mention must be in this timezone.',
                  '- When someone asks "what time is it" or "today", call get_available_slots first to get the current_time, then answer.',
                  '- NEVER book appointments for times that have already passed.',
                  '- The available_slots returned are ONLY future times that are available - never suggest past times.',
                  '',
                  'BOOKING FLOW:',
                  '1. User asks for an appointment',
                  '2. Call manage_calendar(action="get_available_slots", user_id="' + userId + '", duration_minutes=30)',
                  '3. Wait for response with current_time and available_slots array',
                  '4. Use current_time from response to understand what day and time it is now',
                  '5. Present 3-5 available times from the available_slots',
                  '6. User chooses a time',
                  '7. Call manage_calendar(action="book_appointment", user_id="' + userId + '", date="YYYY-MM-DD", time="HH:MM", attendee_name="...", attendee_email="...")',
                  '8. Confirm the booking with full details',
                  '',
                  'EXAMPLE CONVERSATION:',
                  'User: "What time is it?"',
                  'You: [Call manage_calendar with get_available_slots to get current_time] "It\'s currently 2:30 PM on Thursday."',
                  'User: "I need an appointment"',
                  'You: [Call manage_calendar with get_available_slots] "I have availability at 3 PM, 4 PM, and 5 PM today. Which time works best for you?"',
                  'User: "3 PM works"',
                  'You: [Call manage_calendar with book_appointment for 3 PM] "Perfect! I\'ve scheduled your appointment for today at 3 PM."',
                  '[/CALENDAR_TOOLING_v2]',
                ].join('\n');

                updatedPrompt = `${updatedPrompt}\n\n${calendarToolingBlock}`.trim();

                const llmUpdateResp = await fetch(`${baseUrl}/update-retell-llm/${agentLlmId}`, {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({ general_prompt: updatedPrompt }),
                });

                if (llmUpdateResp.ok) {
                  llmPromptUpdated = true;
                } else {
                  llmPromptUpdateError = await llmUpdateResp.text();
                }
              } else {
                // Already updated previously
                llmPromptUpdated = true;
              }
            } else {
              llmPromptUpdateError = await llmGetResp.text();
            }
          } else {
            llmPromptUpdateError = 'Could not determine llm_id from agent config.';
          }
        } catch (e) {
          llmPromptUpdateError = e instanceof Error ? e.message : String(e);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Calendar function configured successfully',
            agent: updatedAgent,
            userId: userId,
            llmPromptUpdated,
            llmPromptUpdateError,
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
