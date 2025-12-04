/**
 * AI Assistant Edge Function with FULL Tool Calling
 * 
 * Can control ALL settings, toggles, and create automations
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_KNOWLEDGE = `You are the Smart Dialer AI Assistant with FULL CONTROL over the entire system.

## YOUR SUPERPOWERS
You can control EVERYTHING:
- All settings toggles (dialer, SMS, rotation, AI settings)
- Phone number management (import, quarantine, purchase)
- Campaign management (create, update, start, pause)
- Lead management (status, pipeline, callbacks)
- Automation rules (create schedules, retry logic)
- Reports (generate, view)
- SMS (send messages)

## WHEN TO USE TOOLS
- User says "turn on/off X" → Use toggle_setting
- User says "set X to Y" → Use update_setting  
- User says "create automation" → Use create_automation_rule
- User says "import number" → Use import_phone_number
- User says "generate report" → Use generate_daily_report
- User says "send SMS" → Use send_sms

Be proactive! When they ask to do something, DO IT with tools.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "toggle_setting",
      description: "Toggle any boolean setting on/off. Settings include: auto_quarantine, enable_amd, enable_local_presence, enable_timezone_compliance, enable_dnc_check, ai_sms_enabled, auto_response_enabled, enable_image_analysis, prevent_double_texting, number_rotation_enabled, adaptive_pacing",
      parameters: {
        type: "object",
        properties: {
          setting_name: { type: "string", description: "Name of the setting to toggle" },
          enabled: { type: "boolean", description: "Turn on (true) or off (false)" }
        },
        required: ["setting_name", "enabled"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_setting",
      description: "Update any numeric or text setting. Examples: daily_call_limit, cooldown_period, max_concurrent_calls, calls_per_minute, ai_personality, context_window_size",
      parameters: {
        type: "object",
        properties: {
          setting_name: { type: "string", description: "Name of the setting" },
          value: { type: "string", description: "New value (number or text)" }
        },
        required: ["setting_name", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_automation_rule",
      description: "Create a campaign automation rule for scheduling calls",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign ID (optional, applies to all if not set)" },
          name: { type: "string", description: "Rule name" },
          rule_type: { type: "string", description: "Type: schedule, retry_logic, time_window, condition" },
          conditions: { 
            type: "object", 
            description: "When to apply: no_answer_count, days_since_last_call, day_of_week array" 
          },
          actions: { 
            type: "object", 
            description: "What to do: max_calls_per_day, call_times array, pause_days, only_call_times" 
          },
          days_of_week: { type: "array", items: { type: "string" }, description: "Days to run: monday, tuesday, etc" },
          time_windows: { type: "array", description: "Time windows like [{start: '09:00', end: '12:00'}]" }
        },
        required: ["name", "rule_type"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_daily_report",
      description: "Generate a daily performance report",
      parameters: {
        type: "object",
        properties: {
          custom_instructions: { type: "string", description: "Custom instructions for the report" }
        }
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
          phone_number: { type: "string", description: "Phone number in E.164 format" },
          area_code: { type: "string", description: "Area code" }
        },
        required: ["phone_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_lead_status",
      description: "Update a lead's status",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Lead's phone number" },
          new_status: { type: "string", description: "new, contacted, qualified, appointment_set, closed_won, closed_lost, dnc" }
        },
        required: ["phone_number", "new_status"]
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
          description: { type: "string", description: "Description" },
          calls_per_minute: { type: "number", description: "Dialing pace" },
          max_attempts: { type: "number", description: "Max call attempts per lead" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_campaign",
      description: "Update an existing campaign's settings or status",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string", description: "Campaign ID" },
          campaign_name: { type: "string", description: "Campaign name (alternative to ID)" },
          status: { type: "string", description: "draft, active, paused, completed" },
          calls_per_minute: { type: "number" },
          max_attempts: { type: "number" },
          calling_hours_start: { type: "string", description: "Start time like 09:00" },
          calling_hours_end: { type: "string", description: "End time like 17:00" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description: "Send an SMS message",
      parameters: {
        type: "object",
        properties: {
          to_number: { type: "string", description: "Recipient phone" },
          message: { type: "string", description: "Message content" }
        },
        required: ["to_number", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "quarantine_number",
      description: "Quarantine a phone number",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string" },
          reason: { type: "string" },
          days: { type: "number", description: "Days to quarantine (default 30)" }
        },
        required: ["phone_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_automation_rules",
      description: "List all automation rules",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_automation_rule",
      description: "Delete an automation rule",
      parameters: {
        type: "object",
        properties: {
          rule_id: { type: "string" },
          rule_name: { type: "string" }
        }
      }
    }
  }
];

async function executeToolCall(supabase: any, toolName: string, args: any, userId: string) {
  console.log(`[AI Assistant] Executing: ${toolName}`, args);
  
  switch (toolName) {
    case 'toggle_setting': {
      const { setting_name, enabled } = args;
      const settingMap: Record<string, { table: string, column: string }> = {
        'auto_quarantine': { table: 'rotation_settings', column: 'auto_remove_quarantined' },
        'enable_amd': { table: 'advanced_dialer_settings', column: 'enable_amd' },
        'enable_local_presence': { table: 'advanced_dialer_settings', column: 'enable_local_presence' },
        'enable_timezone_compliance': { table: 'advanced_dialer_settings', column: 'enable_timezone_compliance' },
        'enable_dnc_check': { table: 'advanced_dialer_settings', column: 'enable_dnc_check' },
        'ai_sms_enabled': { table: 'ai_sms_settings', column: 'enabled' },
        'auto_response_enabled': { table: 'ai_sms_settings', column: 'auto_response_enabled' },
        'enable_image_analysis': { table: 'ai_sms_settings', column: 'enable_image_analysis' },
        'prevent_double_texting': { table: 'ai_sms_settings', column: 'prevent_double_texting' },
        'number_rotation_enabled': { table: 'rotation_settings', column: 'enabled' },
        'adaptive_pacing': { table: 'system_settings', column: 'enable_adaptive_pacing' },
      };
      
      const mapping = settingMap[setting_name];
      if (!mapping) return { success: false, message: `Unknown setting: ${setting_name}` };
      
      const { error } = await supabase
        .from(mapping.table)
        .upsert({ user_id: userId, [mapping.column]: enabled }, { onConflict: 'user_id' });
      
      if (error) throw error;
      return { success: true, message: `${setting_name} ${enabled ? 'enabled' : 'disabled'}` };
    }

    case 'update_setting': {
      const { setting_name, value } = args;
      const numValue = parseFloat(value);
      const isNumeric = !isNaN(numValue);
      
      const settingMap: Record<string, { table: string, column: string }> = {
        'daily_call_limit': { table: 'system_settings', column: 'max_calls_per_agent' },
        'max_concurrent_calls': { table: 'system_settings', column: 'max_concurrent_calls' },
        'calls_per_minute': { table: 'system_settings', column: 'calls_per_minute' },
        'cooldown_period': { table: 'rotation_settings', column: 'rotation_interval_hours' },
        'high_volume_threshold': { table: 'rotation_settings', column: 'high_volume_threshold' },
        'ai_personality': { table: 'ai_sms_settings', column: 'ai_personality' },
        'context_window_size': { table: 'ai_sms_settings', column: 'context_window_size' },
      };
      
      const mapping = settingMap[setting_name];
      if (!mapping) return { success: false, message: `Unknown setting: ${setting_name}` };
      
      const { error } = await supabase
        .from(mapping.table)
        .upsert({ user_id: userId, [mapping.column]: isNumeric ? numValue : value }, { onConflict: 'user_id' });
      
      if (error) throw error;
      return { success: true, message: `${setting_name} set to ${value}` };
    }

    case 'create_automation_rule': {
      const { data, error } = await supabase
        .from('campaign_automation_rules')
        .insert({
          user_id: userId,
          campaign_id: args.campaign_id || null,
          name: args.name,
          rule_type: args.rule_type || 'schedule',
          conditions: args.conditions || {},
          actions: args.actions || {},
          days_of_week: args.days_of_week || ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          time_windows: args.time_windows || [{ start: '09:00', end: '17:00' }],
          enabled: true
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, message: `Automation rule "${args.name}" created!`, data };
    }

    case 'list_automation_rules': {
      const { data, error } = await supabase
        .from('campaign_automation_rules')
        .select('*')
        .eq('user_id', userId);
      
      if (error) throw error;
      return { success: true, message: `Found ${data?.length || 0} automation rules`, data };
    }

    case 'delete_automation_rule': {
      let query = supabase.from('campaign_automation_rules').delete();
      if (args.rule_id) query = query.eq('id', args.rule_id);
      else if (args.rule_name) query = query.eq('name', args.rule_name);
      
      const { error } = await query.eq('user_id', userId);
      if (error) throw error;
      return { success: true, message: 'Automation rule deleted' };
    }

    case 'generate_daily_report': {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-daily-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, customInstructions: args.custom_instructions })
      });
      const result = await response.json();
      return { success: true, message: "Daily report generated!", data: result };
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
      return { success: true, message: `Phone number ${args.phone_number} imported!`, data };
    }

    case 'update_lead_status': {
      const { error } = await supabase
        .from('leads')
        .update({ status: args.new_status })
        .eq('phone_number', args.phone_number)
        .eq('user_id', userId);
      
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
          calls_per_minute: args.calls_per_minute || 5,
          max_attempts: args.max_attempts || 3,
          status: 'draft'
        })
        .select()
        .single();
      
      if (error) throw error;
      return { success: true, message: `Campaign "${args.name}" created!`, data };
    }

    case 'update_campaign': {
      const updates: any = {};
      if (args.status) updates.status = args.status;
      if (args.calls_per_minute) updates.calls_per_minute = args.calls_per_minute;
      if (args.max_attempts) updates.max_attempts = args.max_attempts;
      if (args.calling_hours_start) updates.calling_hours_start = args.calling_hours_start;
      if (args.calling_hours_end) updates.calling_hours_end = args.calling_hours_end;
      
      let query = supabase.from('campaigns').update(updates);
      if (args.campaign_id) query = query.eq('id', args.campaign_id);
      else if (args.campaign_name) query = query.eq('name', args.campaign_name);
      
      const { error } = await query.eq('user_id', userId);
      if (error) throw error;
      return { success: true, message: `Campaign updated!` };
    }

    case 'send_sms': {
      const { data: numbers } = await supabase
        .from('phone_numbers')
        .select('number')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1);
      
      const fromNumber = numbers?.[0]?.number || '+10000000000';
      
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
      return { success: true, message: `Number ${args.phone_number} quarantined for ${args.days || 30} days` };
    }

    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}

async function fetchAnalytics(supabase: any, userId: string) {
  const [calls, leads, campaigns, sms, numbers, rules] = await Promise.all([
    supabase.from('call_logs').select('*').eq('user_id', userId).limit(100),
    supabase.from('leads').select('*').eq('user_id', userId),
    supabase.from('campaigns').select('*').eq('user_id', userId),
    supabase.from('sms_messages').select('*').eq('user_id', userId).limit(100),
    supabase.from('phone_numbers').select('*').eq('user_id', userId),
    supabase.from('campaign_automation_rules').select('*').eq('user_id', userId)
  ]);

  return {
    totalCalls: calls.data?.length || 0,
    totalLeads: leads.data?.length || 0,
    activeCampaigns: campaigns.data?.filter((c: any) => c.status === 'active').length || 0,
    smsSent: sms.data?.filter((m: any) => m.direction === 'outbound').length || 0,
    activeNumbers: numbers.data?.filter((n: any) => n.status === 'active').length || 0,
    automationRules: rules.data?.length || 0
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationHistory = [], userId } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), 
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: 'AI not configured' }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const analytics = await fetchAnalytics(supabase, userId || '');
    const context = `\n\nCURRENT STATS: ${analytics.totalCalls} calls, ${analytics.totalLeads} leads, ${analytics.activeCampaigns} active campaigns, ${analytics.automationRules} automation rules`;

    console.log('[AI Assistant] Processing:', message.substring(0, 100));

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SYSTEM_KNOWLEDGE + context },
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
      if (status === 429) return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      throw new Error(`AI error: ${status}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    
    if (choice?.message?.tool_calls?.length > 0) {
      const results: string[] = [];
      
      for (const tc of choice.message.tool_calls) {
        try {
          const result = await executeToolCall(supabase, tc.function.name, JSON.parse(tc.function.arguments || '{}'), userId || '');
          results.push(`✅ ${tc.function.name}: ${result.message}`);
        } catch (e: any) {
          results.push(`❌ ${tc.function.name}: ${e.message}`);
        }
      }

      const followUp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${lovableApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'Summarize what actions were taken concisely.' },
            { role: 'user', content: `User asked: "${message}"\nActions: ${results.join(', ')}` }
          ],
          max_tokens: 300,
        }),
      });

      const followUpData = await followUp.json();
      
      return new Response(JSON.stringify({ 
        response: followUpData.choices?.[0]?.message?.content || results.join('\n'),
        actions_taken: results,
        analytics
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ 
      response: choice?.message?.content || 'No response',
      analytics
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[AI Assistant] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
