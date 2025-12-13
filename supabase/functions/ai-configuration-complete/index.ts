import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COMPLETE_SYSTEM_PROMPT = `You are an AI configuration assistant for a comprehensive voice AI dialer system. You help users set up and configure their entire dialer infrastructure through natural conversation.

YOU CAN CONFIGURE ALL OF THESE AREAS:

1. **Phone Numbers** - Purchase, configure, classify, rotate numbers
2. **SIP Trunking** - Set up Twilio or custom SIP providers
3. **Dialer Settings** - AMD, local presence, timezone, recording, transfer logic
4. **Campaigns** - Create and configure calling campaigns
5. **AI Agents** - Create voice AI agents with personalities
6. **Workflows** - Build call/SMS follow-up sequences
7. **Number Pools** - Organize numbers for rotation strategies
8. **Voice Broadcast** - Mass voice messaging campaigns
9. **Integrations** - GoHighLevel, Airtable, CRM connections
10. **Compliance** - DNC lists, TCPA, calling restrictions
11. **Budget & Limits** - Spending controls, cost tracking
12. **Lead Scoring** - AI-powered lead prioritization
13. **Spam Management** - Detection, quarantine, reputation
14. **Chatbot Settings** - AI chat configuration
15. **Performance Analytics** - Reporting and optimization

CONVERSATION STYLE:
- Be conversational and helpful
- Ask clarifying questions when needed
- Explain technical terms simply
- Suggest best practices based on use case
- Show enthusiasm when users make good choices
- Warn about potential issues

WHEN USER SAYS WHAT THEY NEED:
Parse their request and return a JSON configuration plan:

{
  "type": "configuration_plan",
  "areas": ["phone_numbers", "campaign", "dialer_settings"],
  "message": "I'll help you set up phone numbers, a campaign, and dialer settings!",
  "recommendations": [
    "I also recommend enabling AMD to save costs",
    "Local presence dialing will improve answer rates"
  ]
}

EXAMPLES:

User: "I need to set up everything for solar sales"
You: {
  "type": "configuration_plan",
  "areas": ["phone_numbers", "sip_trunk", "dialer_settings", "campaign", "ai_agent", "workflows", "compliance", "budget", "lead_scoring"],
  "message": "Perfect! For solar sales, I'll set up a complete system with local presence dialing, AMD, an AI agent, follow-up workflows, and lead scoring. This is the optimal configuration for solar.",
  "recommendations": [
    "I'll configure 5-10 phone numbers for rotation",
    "Enable AMD to skip voicemails and save money",
    "Set up 3-touch follow-up workflow (call-SMS-call)",
    "Configure lead scoring to prioritize hot prospects"
  ]
}

User: "Just phone numbers and a basic campaign"
You: {
  "type": "configuration_plan",
  "areas": ["phone_numbers", "campaign"],
  "message": "Got it! I'll set up phone numbers and a basic campaign for you.",
  "recommendations": [
    "Consider adding dialer settings (AMD, local presence) for better results",
    "A follow-up workflow can improve conversion by 40%"
  ]
}

User: "I want voice broadcasts only"
You: {
  "type": "configuration_plan",
  "areas": ["phone_numbers", "voice_broadcast", "budget"],
  "message": "Voice broadcast setup! I'll get you phone numbers, set up the broadcast feature, and configure budget limits.",
  "recommendations": []
}

CONFIGURATION DETAILS BY AREA:

**Phone Numbers:**
- How many? (Recommend 5-10 for rotation)
- Area codes? (Local to calling area or toll-free)
- Auto-rotation? (Yes - prevents spam flags)
- Health monitoring? (Yes - auto-quarantine spam numbers)

**SIP Trunk:**
- Provider? (Twilio recommended for ease)
- Account credentials
- Failover settings
- Concurrent call limits

**Dialer Settings:**
- AMD: Enable (saves money, skips voicemails)
- Local Presence: Enable (40% better answer rates)
- Timezone Compliance: Enable (legal requirement)
- Call Recording: Enable (training/compliance)
- Max retries: 3 attempts
- Retry delay: 24 hours

**Campaign:**
- Name
- Calling hours (recommend 10am-7pm for solar)
- Calls per minute (5 recommended)
- Days (weekdays for B2B, include weekends for B2C)
- Agent assignment

**AI Agent:**
- Name
- Voice (Rachel popular for solar, Adrian for B2B)
- Personality (consultative, professional, energetic)
- LLM model (GPT-4 for best results)
- Industry knowledge

**Workflows:**
- Follow-up strategy
- Touch sequence (call-SMS-call recommended)
- Timing (2 hours, 1 day, 3 days)
- Conditions (no answer, voicemail, busy)

**Number Pools:**
- Pool name
- Numbers to include
- Rotation strategy (round-robin, random, performance-based)
- Health thresholds

**Voice Broadcast:**
- Campaign name
- Message (record or text-to-speech)
- Recipient list
- Schedule
- Opt-out handling

**Integrations:**
- GoHighLevel: API key, sync settings
- Airtable: Base ID, table mapping
- Webhooks: Endpoints, events

**Compliance:**
- DNC list upload
- Calling hour restrictions
- Consent tracking
- TCPA compliance

**Budget:**
- Monthly limit
- Daily limit
- Alert thresholds (80%, 90%)
- Auto-pause at limit

**Lead Scoring:**
- Scoring criteria
- Priority weights
- Auto-qualification rules
- Hot lead thresholds

ALWAYS:
- Explain why you recommend something
- Warn about costs or risks
- Celebrate good decisions
- Make it conversational and friendly
- Use emojis sparingly but effectively 🎉 ✓ 💡

Remember: You're making a complex system simple and accessible!`;

const CONFIGURATION_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'generate_configuration_plan',
      description: 'Generate a complete configuration plan based on user requirements',
      parameters: {
        type: 'object',
        properties: {
          areas: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of configuration area IDs to set up'
          },
          message: {
            type: 'string',
            description: 'Friendly message explaining what will be configured'
          },
          recommendations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Additional recommendations or suggestions'
          }
        },
        required: ['areas', 'message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'configure_phone_numbers',
      description: 'Purchase and configure phone numbers',
      parameters: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of phone numbers to purchase' },
          area_codes: { type: 'array', items: { type: 'string' }, description: 'Preferred area codes' },
          enable_rotation: { type: 'boolean', description: 'Enable automatic rotation' },
          enable_health_monitoring: { type: 'boolean', description: 'Enable health monitoring' }
        },
        required: ['count']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'configure_sip_trunk',
      description: 'Set up SIP trunk connectivity',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['twilio', 'custom'], description: 'SIP provider' },
          account_sid: { type: 'string', description: 'Twilio Account SID' },
          auth_token: { type: 'string', description: 'Twilio Auth Token' },
          concurrent_calls: { type: 'number', description: 'Max concurrent calls' }
        },
        required: ['provider']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'configure_dialer_settings',
      description: 'Configure advanced dialer settings',
      parameters: {
        type: 'object',
        properties: {
          enable_amd: { type: 'boolean', description: 'Enable Answering Machine Detection' },
          enable_local_presence: { type: 'boolean', description: 'Enable local presence dialing' },
          enable_timezone_compliance: { type: 'boolean', description: 'Enable timezone compliance' },
          enable_recording: { type: 'boolean', description: 'Enable call recording' },
          max_retries: { type: 'number', description: 'Maximum retry attempts' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_campaign',
      description: 'Create a new calling campaign',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Campaign name' },
          start_time: { type: 'string', description: 'Start time (HH:MM)' },
          end_time: { type: 'string', description: 'End time (HH:MM)' },
          max_calls_per_minute: { type: 'number', description: 'Max calls per minute' },
          days: { type: 'array', items: { type: 'string' }, description: 'Days to run' },
          agent_id: { type: 'string', description: 'AI agent ID' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_ai_agent',
      description: 'Create a new AI voice agent',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Agent name' },
          voice: { type: 'string', enum: ['Rachel', 'Adrian', 'Nova', 'Alloy'], description: 'Voice to use' },
          personality: { type: 'string', description: 'Agent personality description' },
          llm_model: { type: 'string', enum: ['gpt-4', 'gpt-3.5-turbo'], description: 'LLM model' },
          industry: { type: 'string', description: 'Industry focus (solar, real estate, etc.)' }
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
                delay_hours: { type: 'number' },
                message: { type: 'string' }
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
      name: 'configure_budget_limits',
      description: 'Set budget and spending limits',
      parameters: {
        type: 'object',
        properties: {
          monthly_limit: { type: 'number', description: 'Monthly spending limit in dollars' },
          daily_limit: { type: 'number', description: 'Daily spending limit in dollars' },
          alert_threshold: { type: 'number', description: 'Alert at percentage (e.g., 80)' },
          auto_pause: { type: 'boolean', description: 'Auto-pause at limit' }
        }
      }
    }
  }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory, userId, mode } = await req.json();

    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY is not configured');
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const messages = [
      { role: 'system', content: COMPLETE_SYSTEM_PROMPT },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: message }
    ];

    console.log('[ai-configuration-complete] Calling Lovable AI Gateway...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        tools: CONFIGURATION_TOOLS,
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
    console.log('[ai-configuration-complete] Response received:', JSON.stringify(data).slice(0, 200));
    
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
        console.error('[ai-configuration-complete] Failed to parse tool arguments:', parseError);
        throw new Error('Invalid tool call arguments');
      }

      if (toolName === 'generate_configuration_plan') {
        return new Response(
          JSON.stringify({
            response: toolArgs.message,
            configurationPlan: {
              areas: toolArgs.areas,
              recommendations: toolArgs.recommendations || [],
              estimatedTime: toolArgs.areas.length * 3
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Handle other tool calls
      return new Response(
        JSON.stringify({
          response: `I'll ${toolName.replace(/_/g, ' ')} for you.`,
          toolCall: { name: toolName, arguments: toolArgs }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        response: assistantMessage.content || 'I can help you configure your dialer system. What would you like to set up?',
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
