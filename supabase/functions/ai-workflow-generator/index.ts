import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, workflowType, currentSteps, includeAiAutoReply } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const isEditing = currentSteps && currentSteps.length > 0;

    const systemPrompt = `You are an expert workflow automation builder for a sales dialer system. 
Your job is to create or EDIT detailed workflow steps based on user descriptions.

Available step types:
- call: Make a phone call to the lead (can be immediate, scheduled, or inherit timing)
- sms: Send an SMS message
- wait: Wait for a specified duration
- ai_sms: Send an AI-generated personalized SMS
- ai_auto_reply: Enable AI auto-response for inbound messages (responds automatically to SMS/calls)
- condition: Check a condition before proceeding

For each step, provide:
- step_type: One of the above types
- step_config: Configuration object with:
  - For "call": { "timing_mode": "immediate|scheduled|inherit", "time_of_day": "HH:MM" (only if scheduled), "max_ring_seconds": 30, "leave_voicemail": boolean }
  - For "sms": { "sms_content": "message text" }
  - For "wait": { "delay_minutes": number, "delay_hours": number, "delay_days": number, "time_of_day": "HH:MM" (optional, for scheduling at specific time) }
  - For "ai_sms": { "sms_content": "instructions for AI or fallback message", "ai_prompt": "detailed AI instructions" }
  - For "ai_auto_reply": { "enabled": true, "response_delay_seconds": 5, "channels": ["sms"], "ai_instructions": "How AI should respond", "stop_on_human_reply": true }
  - For "condition": { "condition_type": "disposition|lead_status|call_outcome|attempts|call_duration|sms_reply_received|voicemail_left|appointment_scheduled|lead_score|days_since_last_contact|total_calls|total_sms", "condition_operator": "equals|not_equals|greater_than|less_than|contains", "condition_value": string, "then_action": "continue|skip|end_workflow|jump_to_step|start_workflow", "else_action": "continue|skip|end_workflow|jump_to_step|start_workflow" }

IMPORTANT RULES:
1. Always start with a call step for calling campaigns
2. Use wait steps between actions (realistic delays like 5 min, 1 hour, 1 day)
3. Include follow-up SMS after no-answer calls
4. Be realistic about timing - don't overwhelm leads
5. Include AI-personalized SMS for follow-ups when appropriate
6. Generate engaging, professional SMS copy that sounds human
7. For Saturday blasts, use time_of_day in wait steps
8. ALWAYS use "sms_content" field for SMS message text (not "content" or "message")
9. For ai_sms steps, include both "sms_content" (fallback) and "ai_prompt" (AI instructions)
10. For call steps, use "timing_mode": "immediate" to call right away, "inherit" to use previous wait step timing, or "scheduled" for specific time
11. If user wants AI auto-response, include an ai_auto_reply step - this makes the AI respond automatically to inbound SMS

${isEditing ? `
EDITING MODE: The user has an EXISTING workflow with these steps:
${JSON.stringify(currentSteps, null, 2)}

You must MODIFY this existing workflow based on the user's request. Keep what works, change what they asked for.
` : ''}

${includeAiAutoReply ? `
INCLUDE AI AUTO-REPLY: The user wants AI auto-response enabled. Add an ai_auto_reply step that enables automatic AI responses to inbound messages.
` : ''}

Respond with a JSON object containing:
{
  "name": "Workflow name",
  "description": "Brief description",
  "steps": [array of step objects],
  "sms_templates": [array of SMS templates used]
}`;

    const userPrompt = `Create a workflow for: ${prompt}
    
Workflow type: ${workflowType || 'mixed'}

Generate a complete, production-ready workflow with realistic timing and engaging SMS copy.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add more credits.' }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse the JSON from the response
    let workflow;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        workflow = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse workflow from AI response');
    }

    return new Response(JSON.stringify({ workflow }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in ai-workflow-generator:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
