/**
 * AI Assistant Edge Function with Tool Calling
 * 
 * An intelligent chatbot with FULL analytics access AND ability to perform actions.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_KNOWLEDGE = `You are the Smart Dialer AI Assistant - an expert analyst with FULL ACCESS to the system's database AND the ability to perform actions.

## YOUR CAPABILITIES
You have real-time access to:
- All call logs, leads, SMS messages, campaigns
- Phone number health and spam status
- System settings and configurations

## ACTIONS YOU CAN PERFORM
You can execute these actions when users ask:
- **generate_daily_report**: Generate a daily performance report
- **update_dialer_settings**: Update dialer configuration (daily_call_limit, auto_quarantine, cooldown_period)
- **import_phone_number**: Import a phone number to the system
- **update_lead_status**: Change a lead's status in the pipeline
- **create_campaign**: Create a new dialing campaign
- **send_sms**: Send an SMS message to a contact
- **quarantine_number**: Quarantine a phone number
- **get_analytics**: Fetch detailed analytics data

When a user asks you to DO something (not just report on data), use the appropriate tool.
When they ask questions about data, provide answers from the analytics.

Be proactive - if they say "generate my report" or "import this number", execute the action!`;

// Tool definitions for the AI
const TOOLS = [
  {
    type: "function",
    function: {
      name: "generate_daily_report",
      description: "Generate a daily performance report with call stats, wins, improvements, and recommendations",
      parameters: {
        type: "object",
        properties: {
          custom_instructions: {
            type: "string",
            description: "Any custom instructions for what to include in the report"
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_dialer_settings",
      description: "Update dialer configuration settings",
      parameters: {
        type: "object",
        properties: {
          daily_call_limit: { type: "number", description: "Maximum calls per number per day" },
          auto_quarantine: { type: "boolean", description: "Auto-quarantine spam numbers" },
          cooldown_period: { type: "number", description: "Quarantine period in days" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "import_phone_number",
      description: "Import a phone number into the system",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "The phone number to import (E.164 format)" },
          area_code: { type: "string", description: "Area code of the number" }
        },
        required: ["phone_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Update a lead's status in the pipeline",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string", description: "The lead's ID" },
          phone_number: { type: "string", description: "The lead's phone number (alternative to ID)" },
          new_status: { type: "string", description: "New status: new, contacted, qualified, appointment_set, closed_won, closed_lost, dnc" }
        },
        required: ["new_status"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "Create a new dialing campaign",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Campaign name" },
          description: { type: "string", description: "Campaign description" },
          script: { type: "string", description: "Call script for agents" },
          calls_per_minute: { type: "number", description: "Dialing pace" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function", 
    function: {
      name: "send_sms",
      description: "Send an SMS message to a contact",
      parameters: {
        type: "object",
        properties: {
          to_number: { type: "string", description: "Recipient phone number" },
          message: { type: "string", description: "Message content" },
          from_number: { type: "string", description: "Sender number (optional, will use default)" }
        },
        required: ["to_number", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "quarantine_number",
      description: "Quarantine a phone number due to spam or issues",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "The phone number to quarantine" },
          reason: { type: "string", description: "Reason for quarantine" },
          days: { type: "number", description: "Number of days to quarantine (default 30)" }
        },
        required: ["phone_number"]
      }
    }
  }
];

// Execute tool functions
async function executeToolCall(supabase: any, toolName: string, args: any, userId: string) {
  console.log(`[AI Assistant] Executing tool: ${toolName}`, args);
  
  switch (toolName) {
    case 'generate_daily_report': {
      // Call the generate-daily-report function
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          customInstructions: args.custom_instructions 
        })
      });
      const result = await response.json();
      return { success: true, message: "Daily report generated!", data: result };
    }

    case 'update_dialer_settings': {
      const updates: any = {};
      if (args.daily_call_limit !== undefined) updates.max_calls_per_agent = args.daily_call_limit;
      if (args.auto_quarantine !== undefined) updates.enable_adaptive_pacing = args.auto_quarantine;
      
      const { error } = await supabase
        .from('system_settings')
        .upsert({ user_id: userId, ...updates }, { onConflict: 'user_id' });
      
      if (error) throw error;
      return { success: true, message: `Settings updated: ${JSON.stringify(args)}` };
    }

    case 'import_phone_number': {
      const areaCode = args.area_code || args.phone_number?.slice(2, 5) || '000';
      const { data, error } = await supabase
        .from('phone_numbers')
        .insert({
          user_id: userId,
          number: args.phone_number,
          area_code: areaCode,
          status: 'active',
          is_spam: false,
          daily_calls: 0
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, message: `Phone number ${args.phone_number} imported successfully!`, data };
    }

    case 'update_lead_status': {
      let query = supabase.from('leads').update({ status: args.new_status });
      
      if (args.lead_id) {
        query = query.eq('id', args.lead_id);
      } else if (args.phone_number) {
        query = query.eq('phone_number', args.phone_number);
      } else {
        return { success: false, message: "Need either lead_id or phone_number to update" };
      }
      
      const { error } = await query;
      if (error) throw error;
      return { success: true, message: `Lead status updated to "${args.new_status}"` };
    }

    case 'create_campaign': {
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          user_id: userId,
          name: args.name,
          description: args.description || '',
          script: args.script || '',
          calls_per_minute: args.calls_per_minute || 5,
          status: 'draft'
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, message: `Campaign "${args.name}" created!`, data };
    }

    case 'send_sms': {
      // Get a from number if not provided
      let fromNumber = args.from_number;
      if (!fromNumber) {
        const { data: numbers } = await supabase
          .from('phone_numbers')
          .select('number')
          .eq('user_id', userId)
          .eq('status', 'active')
          .limit(1);
        fromNumber = numbers?.[0]?.number || '+10000000000';
      }

      const { data, error } = await supabase
        .from('sms_messages')
        .insert({
          user_id: userId,
          from_number: fromNumber,
          to_number: args.to_number,
          body: args.message,
          direction: 'outbound',
          status: 'pending'
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, message: `SMS sent to ${args.to_number}!`, data };
    }

    case 'quarantine_number': {
      const quarantineUntil = new Date();
      quarantineUntil.setDate(quarantineUntil.getDate() + (args.days || 30));
      
      const { error } = await supabase
        .from('phone_numbers')
        .update({ 
          status: 'quarantined',
          quarantine_until: quarantineUntil.toISOString(),
          is_spam: true
        })
        .eq('number', args.phone_number);
      
      if (error) throw error;
      
      // Log the rotation action
      await supabase.from('rotation_history').insert({
        user_id: userId,
        phone_number: args.phone_number,
        action_type: 'quarantined',
        reason: args.reason || 'Manual quarantine via AI assistant'
      });
      
      return { success: true, message: `Number ${args.phone_number} quarantined for ${args.days || 30} days` };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}

// Fetch analytics
async function fetchAnalytics(supabase: any) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [callsToday, allCalls, leads, campaigns, smsMessages, phoneNumbers] = await Promise.all([
    supabase.from('call_logs').select('*').gte('created_at', todayStart),
    supabase.from('call_logs').select('*').limit(500),
    supabase.from('leads').select('*'),
    supabase.from('campaigns').select('*'),
    supabase.from('sms_messages').select('*').limit(500),
    supabase.from('phone_numbers').select('*')
  ]);

  const allCallsData = allCalls.data || [];
  const callsTodayData = callsToday.data || [];
  const leadsData = leads.data || [];
  const smsData = smsMessages.data || [];
  const numbersData = phoneNumbers.data || [];

  const connectedCalls = allCallsData.filter((c: any) => 
    c.status === 'completed' || c.outcome === 'connected' || c.outcome === 'appointment_set'
  ).length;

  return {
    totalCalls: allCallsData.length,
    callsToday: callsTodayData.length,
    connectedCalls,
    answerRate: allCallsData.length > 0 ? Math.round((connectedCalls / allCallsData.length) * 100) : 0,
    totalLeads: leadsData.length,
    activeLeads: leadsData.filter((l: any) => l.status !== 'closed_lost' && l.status !== 'dnc').length,
    smsSent: smsData.filter((m: any) => m.direction === 'outbound').length,
    smsReceived: smsData.filter((m: any) => m.direction === 'inbound').length,
    activeCampaigns: (campaigns.data || []).filter((c: any) => c.status === 'active').length,
    activeNumbers: numbersData.filter((n: any) => n.status === 'active' && !n.is_spam).length,
    quarantinedNumbers: numbersData.filter((n: any) => n.quarantine_until || n.is_spam).length
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory = [], userId } = await req.json();

    if (!message) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch analytics for context
    const analytics = await fetchAnalytics(supabase);
    const analyticsContext = `\n\n## CURRENT STATS\n- Calls today: ${analytics.callsToday}\n- Total calls: ${analytics.totalCalls}\n- Answer rate: ${analytics.answerRate}%\n- Active leads: ${analytics.activeLeads}\n- SMS sent: ${analytics.smsSent}\n- Active numbers: ${analytics.activeNumbers}`;

    console.log('[AI Assistant] Processing:', message.substring(0, 100));

    // First API call with tools
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_KNOWLEDGE + analyticsContext },
          ...conversationHistory.slice(-10),
          { role: 'user', content: message }
        ],
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    
    // Check if AI wants to call tools
    if (choice?.message?.tool_calls?.length > 0) {
      const toolResults: string[] = [];
      
      for (const toolCall of choice.message.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments || '{}');
        
        try {
          const result = await executeToolCall(supabase, toolName, toolArgs, userId || 'system');
          toolResults.push(`✅ ${toolName}: ${result.message}`);
          console.log(`[AI Assistant] Tool ${toolName} result:`, result);
        } catch (error: any) {
          toolResults.push(`❌ ${toolName}: Failed - ${error.message}`);
          console.error(`[AI Assistant] Tool ${toolName} error:`, error);
        }
      }

      // Get a follow-up response from AI with tool results
      const followUpResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: SYSTEM_KNOWLEDGE },
            { role: 'user', content: message },
            { role: 'assistant', content: `I executed the following actions:\n${toolResults.join('\n')}\n\nLet me summarize what I did for you.` }
          ],
          max_tokens: 500,
        }),
      });

      const followUpData = await followUpResponse.json();
      const finalMessage = followUpData.choices?.[0]?.message?.content || `Done! ${toolResults.join('. ')}`;

      return new Response(
        JSON.stringify({ 
          response: finalMessage,
          actions_taken: toolResults,
          analytics
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No tools called, just return the response
    const assistantMessage = choice?.message?.content || 'Sorry, I could not generate a response.';

    return new Response(
      JSON.stringify({ 
        response: assistantMessage,
        analytics
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AI Assistant] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
