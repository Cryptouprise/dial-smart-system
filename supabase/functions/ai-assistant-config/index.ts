import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CONFIGURATION_SYSTEM_PROMPT = `You are an AI configuration assistant for a voice AI dialer system. Your job is to help users set up campaigns, agents, workflows, and settings through natural conversation.

CAPABILITIES:
- Create and configure campaigns
- Create and configure AI agents
- Build workflows with calls and SMS
- Optimize system settings
- Import leads
- Test configurations

CONVERSATION FLOW:
1. Understand what the user wants to configure
2. Ask clarifying questions for missing information
3. Generate a configuration plan
4. Present the plan for approval
5. Execute the configuration

WHEN GENERATING CONFIGURATION PLANS:
Return a JSON object with this structure:
{
  "type": "configuration_plan",
  "items": [
    {
      "type": "campaign|agent|workflow|setting",
      "action": "create|update|delete",
      "name": "Name of the item",
      "details": {
        // All configuration details
      }
    }
  ],
  "message": "Human-readable explanation of what will be configured"
}

EXAMPLE INTERACTIONS:

User: "Create a solar campaign"
You: "I'll help you set up a solar campaign! Let me ask a few questions:
- What should we name the campaign?
- Which AI agent should it use? (or should I create a new one?)
- What hours should it run?
- How many calls per minute?"

User: "Solar Outreach Q1, create agent Sarah with Rachel voice, 9am-6pm, 5 calls/min"
You: {
  "type": "configuration_plan",
  "items": [
    {
      "type": "agent",
      "action": "create",
      "name": "Sarah",
      "details": {
        "voice": "Rachel",
        "personality": "Professional solar expert",
        "llm_model": "gpt-4"
      }
    },
    {
      "type": "campaign",
      "action": "create",
      "name": "Solar Outreach Q1",
      "details": {
        "agent_name": "Sarah",
        "start_time": "09:00",
        "end_time": "18:00",
        "max_calls_per_minute": 5,
        "days": ["monday", "tuesday", "wednesday", "thursday", "friday"]
      }
    }
  ],
  "message": "I'll create agent Sarah with Rachel's voice, then set up the Solar Outreach Q1 campaign to run 9am-6pm weekdays at 5 calls/minute."
}

AVAILABLE AGENT VOICES:
- Rachel (warm, professional female)
- Adrian (confident male)
- Alloy (neutral, clear)
- Nova (energetic female)

CAMPAIGN SETTINGS:
- max_calls_per_minute: 1-10
- start_time/end_time: HH:MM format
- days: array of weekday names
- agent_name: name of AI agent to use

WORKFLOW STEPS:
- call: Make a phone call
- sms: Send text message
- wait: Wait period (hours/days)
- condition: Branch based on outcome

Be conversational, helpful, and ask clarifying questions when needed. Always confirm the plan before executing.`;

const CONFIGURATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Create a new calling campaign',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Campaign name' },
          agent_id: { type: 'string', description: 'ID of AI agent to use' },
          start_time: { type: 'string', description: 'Start time (HH:MM)' },
          end_time: { type: 'string', description: 'End time (HH:MM)' },
          max_calls_per_minute: { type: 'number', description: 'Max calls per minute (1-10)' },
          days: { type: 'array', items: { type: 'string' }, description: 'Days to run' }
        },
        required: ['name', 'agent_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_agent',
      description: 'Create a new AI voice agent',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name' },
          voice: { type: 'string', description: 'Voice to use (Rachel, Adrian, Alloy, Nova)' },
          personality: { type: 'string', description: 'Agent personality description' },
          llm_model: { type: 'string', description: 'LLM model (gpt-4, gpt-3.5-turbo)' }
        },
        required: ['name', 'voice']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_workflow',
      description: 'Create a follow-up workflow',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workflow name' },
          steps: { 
            type: 'array', 
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['call', 'sms', 'wait'] },
                delay: { type: 'number', description: 'Delay in hours' },
                message: { type: 'string', description: 'SMS message if type is sms' }
              }
            }
          }
        },
        required: ['name', 'steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'generate_configuration_plan',
      description: 'Generate a complete configuration plan based on user requirements',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['campaign', 'agent', 'workflow', 'setting'] },
                action: { type: 'string', enum: ['create', 'update', 'delete'] },
                name: { type: 'string' },
                details: { type: 'object' }
              }
            }
          },
          message: { type: 'string', description: 'Explanation of the plan' }
        },
        required: ['items', 'message']
      }
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory, userId, configurationMode } = await req.json();

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const messages = [
      { role: 'system', content: configurationMode ? CONFIGURATION_SYSTEM_PROMPT : 'You are a helpful AI assistant for a voice AI dialer system.' },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    console.log('[ai-assistant-config] Calling Lovable AI Gateway...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        tools: configurationMode ? CONFIGURATION_TOOLS : undefined,
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limits exceeded, please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Payment required, please add funds to your Lovable AI workspace.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('Lovable AI Gateway error:', response.status, errorText);
      throw new Error(`Lovable AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[ai-assistant-config] Response received:', JSON.stringify(data).slice(0, 200));
    
    // Safe access to AI response with null check
    const assistantMessage = data.choices?.[0]?.message;
    if (!assistantMessage) {
      throw new Error('Invalid AI response: no message returned');
    }

    // Check if AI wants to use a tool
    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      const toolCall = assistantMessage.tool_calls[0];
      const toolName = toolCall.function.name;
      let toolArgs;
      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch (parseError) {
        console.error('[ai-assistant-config] Failed to parse tool arguments:', parseError);
        throw new Error('Invalid tool call arguments');
      }

      if (toolName === 'generate_configuration_plan') {
        return new Response(
          JSON.stringify({
            response: toolArgs.message,
            configurationPlan: {
              items: toolArgs.items,
              estimatedTime: toolArgs.items.length * 5
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        response: assistantMessage.content || 'I can help you configure your system. What would you like to set up?',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
