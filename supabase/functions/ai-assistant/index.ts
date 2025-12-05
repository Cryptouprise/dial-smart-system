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
You can control EVERYTHING in the Smart Dialer platform:

### Settings & Toggles
- enable_amd: Answering Machine Detection on/off
- amd_sensitivity: low, medium, or high sensitivity level
- enable_local_presence: Match caller ID to lead's area code
- local_presence_strategy: match_area_code, match_state, or random
- enable_timezone_compliance: Respect lead timezones
- enable_dnc_check: Check Do Not Call list
- ai_sms_enabled: Enable AI-powered SMS
- auto_response_enabled: Auto-respond to inbound SMS
- enable_image_analysis: Analyze images in MMS
- prevent_double_texting: Avoid sending duplicate messages
- number_rotation_enabled: Rotate caller IDs automatically
- auto_quarantine: Auto-quarantine spam numbers
- adaptive_pacing: Adjust dialing speed dynamically
- ai_personality: Set AI SMS personality (professional, casual, etc.)
- context_window_size: SMS context history length
- custom_instructions: Custom AI SMS instructions
- knowledge_base: AI knowledge base content
- daily_call_limit, max_concurrent_calls, calls_per_minute, cooldown_period, high_volume_threshold

### Phone Numbers
- Import numbers from Twilio or purchase new ones
- Quarantine spam-flagged numbers
- Track spam scores and call volume
- Check number health and spam status

### Campaigns
- Create, update, start, pause, and complete campaigns
- Set calling hours, calls per minute, max attempts
- Assign AI agents and scripts

### Leads
- Update lead status (new, contacted, qualified, appointment_set, closed_won, closed_lost, dnc)
- Search leads by name, phone, status, or tags
- Schedule callbacks for follow-ups
- Move leads between pipeline stages
- Bulk update multiple leads at once
- Manage pipeline positions

### Automation Rules
- Schedule-based: Call during specific hours/days
- Retry logic: Max calls per day, no-answer thresholds
- Time windows: Morning, afternoon, evening only
- Conditions: Day of week, previous call outcomes
- Weekly timeline view shows when rules are active

### Reports & Analytics
- Generate daily performance reports
- View real-time call metrics, answer rates, appointments
- Get detailed stats for today, this week, or custom periods
- Export data to CSV format
- AI-generated insights and recommendations

### SMS Messaging
- Send SMS to any number
- AI-powered automated responses
- Image analysis for MMS

## AVAILABLE DATABASE TABLES
- campaigns, leads, call_logs, phone_numbers
- campaign_automation_rules, ai_chatbot_settings, ai_sms_settings
- daily_reports, rotation_settings, advanced_dialer_settings, system_settings
- sms_messages, sms_conversations, pipeline_boards, dispositions, lead_pipeline_positions

## WHEN TO USE TOOLS
- "turn on/off X" → toggle_setting
- "set X to Y" → update_setting
- "create automation/schedule" → create_automation_rule
- "import number" → import_phone_number
- "generate report" → generate_daily_report
- "send SMS/text" → send_sms
- "quarantine number" → quarantine_number
- "create campaign" → create_campaign
- "update campaign/start/pause" → update_campaign
- "update lead status" → update_lead_status
- "list automations" → list_automation_rules
- "delete automation" → delete_automation_rule
- "how many calls/stats/metrics" → get_stats
- "find lead/search lead" → search_leads
- "update multiple leads/bulk" → bulk_update_leads
- "schedule callback/follow up" → schedule_callback
- "check number health/spam score" → check_number_health
- "move lead to stage/pipeline" → move_lead_pipeline
- "export data/download" → export_data

Be proactive! When they ask to do something, USE THE TOOLS to do it immediately.`;

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
      description: "Update any numeric or text setting. Examples: daily_call_limit, cooldown_period, max_concurrent_calls, calls_per_minute, ai_personality, context_window_size, amd_sensitivity (low/medium/high), local_presence_strategy (match_area_code/match_state/random)",
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
      description: "Send an SMS message. Can specify which number to send from. If not specified, will use the first available SMS-capable number.",
      parameters: {
        type: "object",
        properties: {
          to_number: { type: "string", description: "Recipient phone number" },
          message: { type: "string", description: "Message content" },
          from_number: { type: "string", description: "Phone number to send from (optional). Use list_sms_numbers to see available numbers." }
        },
        required: ["to_number", "message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_sms_numbers",
      description: "List all available phone numbers that can send SMS. Shows which numbers are SMS-capable and their status. Use this before sending SMS to see your options.",
      parameters: {
        type: "object",
        properties: {
          only_sms_capable: { type: "boolean", description: "Only show SMS-capable numbers (default: true)" }
        }
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
  },
  // NEW TOOLS
  {
    type: "function",
    function: {
      name: "get_stats",
      description: "Get real-time statistics and metrics. Can get stats for today, this week, or all time. Returns call metrics, answer rates, appointments, SMS stats, and more.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", description: "Time period: today, this_week, this_month, all_time (default: today)" },
          metric_type: { type: "string", description: "Specific metric: calls, leads, appointments, sms, numbers, or all (default: all)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_leads",
      description: "Search for leads by name, phone number, status, tags, or company",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search term (name, phone, company)" },
          status: { type: "string", description: "Filter by status: new, contacted, qualified, appointment_set, closed_won, closed_lost, dnc" },
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
          limit: { type: "number", description: "Max results (default 10)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "bulk_update_leads",
      description: "Update multiple leads at once. Can update status, tags, or schedule callbacks for all matching leads.",
      parameters: {
        type: "object",
        properties: {
          filter_status: { type: "string", description: "Select leads with this status" },
          filter_tags: { type: "array", items: { type: "string" }, description: "Select leads with these tags" },
          new_status: { type: "string", description: "New status to set" },
          add_tags: { type: "array", items: { type: "string" }, description: "Tags to add" },
          remove_tags: { type: "array", items: { type: "string" }, description: "Tags to remove" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "schedule_callback",
      description: "Schedule a callback/follow-up for a lead",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Lead's phone number" },
          lead_id: { type: "string", description: "Lead ID (alternative to phone)" },
          callback_time: { type: "string", description: "When to call back (ISO date or relative like 'tomorrow 2pm', 'in 2 hours')" },
          notes: { type: "string", description: "Notes for the callback" }
        },
        required: ["callback_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "check_number_health",
      description: "Check the health and spam status of phone numbers. Returns spam scores, call volume, quarantine status.",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Specific number to check" },
          check_all: { type: "boolean", description: "Check all numbers and return summary" },
          only_problems: { type: "boolean", description: "Only return numbers with issues" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_lead_pipeline",
      description: "Move a lead to a different pipeline stage/board",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string", description: "Lead's phone number" },
          lead_id: { type: "string", description: "Lead ID (alternative to phone)" },
          pipeline_board_name: { type: "string", description: "Name of the pipeline board/stage to move to" },
          pipeline_board_id: { type: "string", description: "ID of the pipeline board (alternative to name)" },
          notes: { type: "string", description: "Notes about why the lead was moved" }
        },
        required: ["pipeline_board_name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "export_data",
      description: "Export data to CSV format. Can export leads, calls, SMS messages, or reports.",
      parameters: {
        type: "object",
        properties: {
          data_type: { type: "string", description: "What to export: leads, calls, sms, campaigns, numbers" },
          filters: { type: "object", description: "Optional filters like status, date range" },
          format: { type: "string", description: "Output format: csv, json (default: csv)" }
        },
        required: ["data_type"]
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
        'amd_sensitivity': { table: 'advanced_dialer_settings', column: 'amd_sensitivity' },
        'local_presence_strategy': { table: 'advanced_dialer_settings', column: 'local_presence_strategy' },
        'custom_instructions': { table: 'ai_sms_settings', column: 'custom_instructions' },
        'knowledge_base': { table: 'ai_sms_settings', column: 'knowledge_base' },
      };
      
      const mapping = settingMap[setting_name];
      if (!mapping) return { success: false, message: `Unknown setting: ${setting_name}. Available: ${Object.keys(settingMap).join(', ')}` };
      
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
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-daily-report`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`
        },
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
      // First find the lead to confirm it exists and get details
      const { data: lead, error: findError } = await supabase
        .from('leads')
        .select('id, first_name, last_name, status')
        .eq('phone_number', args.phone_number)
        .eq('user_id', userId)
        .single();
      
      if (findError || !lead) {
        return { success: false, message: `No lead found with phone number ${args.phone_number}` };
      }
      
      const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || args.phone_number;
      const oldStatus = lead.status;
      
      const { error } = await supabase
        .from('leads')
        .update({ status: args.new_status, updated_at: new Date().toISOString() })
        .eq('id', lead.id);
      
      if (error) throw error;
      return { success: true, message: `Lead "${leadName}" status changed from "${oldStatus}" to "${args.new_status}"` };
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

    case 'list_sms_numbers': {
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      
      if (!twilioAccountSid || !twilioAuthToken) {
        return { success: false, message: 'Twilio credentials not configured.' };
      }
      
      try {
        const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=100`;
        
        const response = await fetch(twilioUrl, {
          headers: { 'Authorization': 'Basic ' + credentials }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch numbers from Twilio');
        }
        
        const data = await response.json();
        const allNumbers = data.incoming_phone_numbers || [];
        
        // Filter for SMS-capable numbers
        const smsNumbers = allNumbers.filter((n: any) => 
          n.capabilities?.sms === true || n.capabilities?.mms === true
        );
        
        const numberList = smsNumbers.map((n: any) => ({
          number: n.phone_number,
          friendlyName: n.friendly_name,
          smsCapable: n.capabilities?.sms || false,
          mmsCapable: n.capabilities?.mms || false,
          voiceCapable: n.capabilities?.voice || false
        }));
        
        const formattedList = numberList.map((n: any) => 
          `• ${n.number} ${n.friendlyName ? `(${n.friendlyName})` : ''} - SMS: ${n.smsCapable ? '✓' : '✗'}, MMS: ${n.mmsCapable ? '✓' : '✗'}`
        ).join('\n');
        
        return { 
          success: true, 
          message: `Found ${numberList.length} SMS-capable numbers:\n${formattedList}`,
          data: { numbers: numberList, total: numberList.length }
        };
      } catch (error: any) {
        console.error('[AI Assistant] Error listing SMS numbers:', error);
        return { success: false, message: `Failed to list numbers: ${error.message}` };
      }
    }

    case 'send_sms': {
      const twilioAccountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
      const twilioAuthToken = Deno.env.get('TWILIO_AUTH_TOKEN');
      
      if (!twilioAccountSid || !twilioAuthToken) {
        return { success: false, message: 'Twilio credentials not configured. Please add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN to Supabase secrets.' };
      }
      
      const toNumber = args.to_number.replace(/[^\d+]/g, '');
      const cleanTo = toNumber.startsWith('+') ? toNumber : '+1' + toNumber;
      let fromNumber = args.from_number;
      
      // If from_number specified, use it directly
      if (fromNumber) {
        fromNumber = fromNumber.replace(/[^\d+]/g, '');
        fromNumber = fromNumber.startsWith('+') ? fromNumber : '+1' + fromNumber;
      } else {
        // Fetch SMS-capable numbers from Twilio directly
        try {
          const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
          const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=50`;
          
          const response = await fetch(twilioUrl, {
            headers: { 'Authorization': 'Basic ' + credentials }
          });
          
          if (!response.ok) {
            return { success: false, message: 'Failed to fetch available numbers from Twilio. Please specify a from_number.' };
          }
          
          const data = await response.json();
          const smsNumbers = (data.incoming_phone_numbers || []).filter((n: any) => 
            n.capabilities?.sms === true
          );
          
          if (smsNumbers.length === 0) {
            return { success: false, message: 'No SMS-capable numbers found in your Twilio account. Please purchase an SMS-enabled number.' };
          }
          
          // Use the first SMS-capable number
          fromNumber = smsNumbers[0].phone_number;
          console.log(`[AI Assistant] Auto-selected SMS number: ${fromNumber} from ${smsNumbers.length} available`);
        } catch (error: any) {
          console.error('[AI Assistant] Error fetching Twilio numbers:', error);
          return { success: false, message: `Failed to find an SMS-capable number: ${error.message}. Use list_sms_numbers to see available options.` };
        }
      }
      
      // Create SMS record
      const { data: smsRecord, error: insertError } = await supabase
        .from('sms_messages')
        .insert({
          user_id: userId,
          from_number: fromNumber,
          to_number: cleanTo,
          body: args.message,
          direction: 'outbound',
          status: 'pending',
          provider_type: 'twilio'
        })
        .select()
        .single();
      
      if (insertError) {
        console.error('[AI Assistant] SMS insert error:', insertError);
        return { success: false, message: 'Failed to create SMS record in database.' };
      }
      
      // Send via Twilio API
      try {
        const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`;
        
        const formData = new URLSearchParams();
        formData.append('To', cleanTo);
        formData.append('From', fromNumber);
        formData.append('Body', args.message);
        
        console.log('[AI Assistant] Sending SMS via Twilio:', { to: cleanTo, from: fromNumber });
        
        const twilioResponse = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + credentials,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        });
        
        const twilioData = await twilioResponse.json();
        
        if (!twilioResponse.ok) {
          console.error('[AI Assistant] Twilio error:', twilioData);
          await supabase
            .from('sms_messages')
            .update({ status: 'failed', error_message: twilioData.message || 'Twilio API error' })
            .eq('id', smsRecord.id);
          
          // Check if it's an A2P/registration error and provide helpful message
          const errorMsg = twilioData.message || '';
          if (errorMsg.includes('unregistered') || errorMsg.includes('A2P') || errorMsg.includes('10DLC')) {
            // Suggest alternative numbers
            try {
              const creds = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
              const numbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/IncomingPhoneNumbers.json?PageSize=10`;
              const resp = await fetch(numbersUrl, { headers: { 'Authorization': 'Basic ' + creds } });
              const numbersData = await resp.json();
              const smsNums = (numbersData.incoming_phone_numbers || [])
                .filter((n: any) => n.capabilities?.sms && n.phone_number !== fromNumber)
                .slice(0, 5)
                .map((n: any) => n.phone_number);
              
              if (smsNums.length > 0) {
                return { 
                  success: false, 
                  message: `❌ Number ${fromNumber} cannot send SMS (likely not A2P registered).\n\nTry one of these numbers instead:\n${smsNums.map((n: string) => `• ${n}`).join('\n')}\n\nUse: send_sms with from_number parameter to specify which number to use.`
                };
              }
            } catch {}
            
            return { success: false, message: `❌ Number ${fromNumber} cannot send SMS - it may not be A2P/10DLC registered. Use list_sms_numbers to see available options.` };
          }
          
          return { success: false, message: `Twilio error: ${twilioData.message || 'Failed to send SMS'}` };
        }
        
        console.log('[AI Assistant] SMS sent successfully:', twilioData.sid);
        
        await supabase
          .from('sms_messages')
          .update({ 
            status: 'sent', 
            provider_message_id: twilioData.sid,
            sent_at: new Date().toISOString()
          })
          .eq('id', smsRecord.id);
        
        return {
          success: true, 
          message: `SMS successfully sent to ${cleanTo} from ${cleanFrom}. Message: "${args.message.substring(0, 50)}${args.message.length > 50 ? '...' : ''}"`,
          data: { messageId: twilioData.sid, to: cleanTo, from: cleanFrom }
        };
      } catch (twilioError: any) {
        console.error('[AI Assistant] Twilio send error:', twilioError);
        await supabase
          .from('sms_messages')
          .update({ status: 'failed', error_message: twilioError.message })
          .eq('id', smsRecord.id);
        return { success: false, message: `Failed to send SMS: ${twilioError.message}` };
      }
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
        .eq('number', args.phone_number)
        .eq('user_id', userId);
      
      if (error) throw error;
      return { success: true, message: `Number ${args.phone_number} quarantined for ${args.days || 30} days` };
    }

    // NEW TOOLS IMPLEMENTATION
    case 'get_stats': {
      const period = args.period || 'today';
      const now = new Date();
      let startDate: Date;
      
      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'this_week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'this_month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(0); // all time
      }
      
      const [callsResult, leadsResult, smsResult, numbersResult] = await Promise.all([
        supabase.from('call_logs').select('*').eq('user_id', userId).gte('created_at', startDate.toISOString()),
        supabase.from('leads').select('*').eq('user_id', userId),
        supabase.from('sms_messages').select('*').eq('user_id', userId).gte('created_at', startDate.toISOString()),
        supabase.from('phone_numbers').select('*').eq('user_id', userId)
      ]);
      
      const calls = callsResult.data || [];
      const leads = leadsResult.data || [];
      const sms = smsResult.data || [];
      const numbers = numbersResult.data || [];
      
      const connectedCalls = calls.filter((c: any) => c.status === 'completed' || c.outcome === 'connected');
      const answerRate = calls.length > 0 ? ((connectedCalls.length / calls.length) * 100).toFixed(1) : '0';
      const appointments = leads.filter((l: any) => l.status === 'appointment_set').length;
      const avgDuration = connectedCalls.length > 0 
        ? Math.round(connectedCalls.reduce((sum: number, c: any) => sum + (c.duration_seconds || 0), 0) / connectedCalls.length)
        : 0;
      
      const stats = {
        period,
        calls: {
          total: calls.length,
          connected: connectedCalls.length,
          answerRate: `${answerRate}%`,
          avgDurationSeconds: avgDuration
        },
        leads: {
          total: leads.length,
          new: leads.filter((l: any) => l.status === 'new').length,
          contacted: leads.filter((l: any) => l.status === 'contacted').length,
          qualified: leads.filter((l: any) => l.status === 'qualified').length,
          appointments: appointments,
          closedWon: leads.filter((l: any) => l.status === 'closed_won').length,
          closedLost: leads.filter((l: any) => l.status === 'closed_lost').length
        },
        sms: {
          sent: sms.filter((m: any) => m.direction === 'outbound').length,
          received: sms.filter((m: any) => m.direction === 'inbound').length,
          total: sms.length
        },
        numbers: {
          total: numbers.length,
          active: numbers.filter((n: any) => n.status === 'active').length,
          quarantined: numbers.filter((n: any) => n.status === 'quarantined').length,
          spam: numbers.filter((n: any) => n.is_spam).length
        }
      };
      
      const detailedMessage = `📊 Stats for ${period}:
• Calls: ${calls.length} total, ${connectedCalls.length} connected (${answerRate}% answer rate)
• Avg call duration: ${avgDuration} seconds
• Leads: ${leads.length} total, ${appointments} appointments set, ${stats.leads.closedWon} won
• SMS: ${stats.sms.sent} sent, ${stats.sms.received} received
• Numbers: ${stats.numbers.active} active, ${stats.numbers.quarantined} quarantined`;
      
      return { 
        success: true, 
        message: detailedMessage,
        data: stats 
      };
    }

    case 'search_leads': {
      let query = supabase.from('leads').select('*').eq('user_id', userId);
      
      if (args.status) {
        query = query.eq('status', args.status);
      }
      
      if (args.query) {
        query = query.or(`first_name.ilike.%${args.query}%,last_name.ilike.%${args.query}%,phone_number.ilike.%${args.query}%,company.ilike.%${args.query}%,email.ilike.%${args.query}%`);
      }
      
      if (args.tags && args.tags.length > 0) {
        query = query.contains('tags', args.tags);
      }
      
      const { data, error } = await query.limit(args.limit || 10);
      
      if (error) throw error;
      
      const leads = data || [];
      const leadDetails = leads.map((l: any) => {
        const name = `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'No name';
        return `• ${name} (${l.phone_number}) - Status: ${l.status}${l.company ? `, Company: ${l.company}` : ''}`;
      });
      
      const detailedMessage = leads.length > 0 
        ? `Found ${leads.length} lead(s):\n${leadDetails.join('\n')}`
        : 'No leads found matching your search';
      
      return { 
        success: true, 
        message: detailedMessage,
        data: leads.map((l: any) => ({
          id: l.id,
          name: `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'No name',
          phone: l.phone_number,
          email: l.email,
          status: l.status,
          company: l.company,
          lastContacted: l.last_contacted_at,
          notes: l.notes
        }))
      };
    }

    case 'bulk_update_leads': {
      let query = supabase.from('leads').select('id, tags').eq('user_id', userId);
      
      if (args.filter_status) {
        query = query.eq('status', args.filter_status);
      }
      if (args.filter_tags && args.filter_tags.length > 0) {
        query = query.contains('tags', args.filter_tags);
      }
      
      const { data: leads, error: fetchError } = await query;
      if (fetchError) throw fetchError;
      
      if (!leads || leads.length === 0) {
        return { success: false, message: 'No leads matched the filters' };
      }
      
      const updates: any = {};
      if (args.new_status) updates.status = args.new_status;
      
      // Handle tag updates
      for (const lead of leads) {
        let currentTags = lead.tags || [];
        if (args.add_tags) {
          currentTags = [...new Set([...currentTags, ...args.add_tags])];
        }
        if (args.remove_tags) {
          currentTags = currentTags.filter((t: string) => !args.remove_tags.includes(t));
        }
        
        const leadUpdates = { ...updates, tags: currentTags };
        await supabase.from('leads').update(leadUpdates).eq('id', lead.id);
      }
      
      return { 
        success: true, 
        message: `Updated ${leads.length} leads` 
      };
    }

    case 'schedule_callback': {
      // Parse callback time
      let callbackTime: Date;
      const timeStr = args.callback_time.toLowerCase();
      
      if (timeStr.includes('tomorrow')) {
        callbackTime = new Date();
        callbackTime.setDate(callbackTime.getDate() + 1);
        const timeMatch = timeStr.match(/(\d{1,2})(:\d{2})?\s*(am|pm)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1]);
          if (timeMatch[3]?.toLowerCase() === 'pm' && hours < 12) hours += 12;
          if (timeMatch[3]?.toLowerCase() === 'am' && hours === 12) hours = 0;
          callbackTime.setHours(hours, 0, 0, 0);
        }
      } else if (timeStr.includes('in ')) {
        callbackTime = new Date();
        const hourMatch = timeStr.match(/in (\d+) hour/i);
        const minMatch = timeStr.match(/in (\d+) min/i);
        if (hourMatch) callbackTime.setHours(callbackTime.getHours() + parseInt(hourMatch[1]));
        if (minMatch) callbackTime.setMinutes(callbackTime.getMinutes() + parseInt(minMatch[1]));
      } else {
        callbackTime = new Date(args.callback_time);
      }
      
      // Find lead
      let leadQuery = supabase.from('leads').select('id').eq('user_id', userId);
      if (args.lead_id) leadQuery = leadQuery.eq('id', args.lead_id);
      else if (args.phone_number) leadQuery = leadQuery.eq('phone_number', args.phone_number);
      
      const { data: leads } = await leadQuery.limit(1);
      
      if (!leads || leads.length === 0) {
        return { success: false, message: 'Lead not found' };
      }
      
      const { error } = await supabase
        .from('leads')
        .update({ 
          next_callback_at: callbackTime.toISOString(),
          notes: args.notes ? `${args.notes}\n[Callback scheduled via AI Assistant]` : '[Callback scheduled via AI Assistant]'
        })
        .eq('id', leads[0].id);
      
      if (error) throw error;
      
      return { 
        success: true, 
        message: `Callback scheduled for ${callbackTime.toLocaleString()}` 
      };
    }

    case 'check_number_health': {
      let query = supabase.from('phone_numbers').select('*').eq('user_id', userId);
      
      if (args.phone_number) {
        query = query.eq('number', args.phone_number);
      }
      
      const { data: numbers, error } = await query;
      if (error) throw error;
      
      let results = numbers || [];
      
      if (args.only_problems) {
        results = results.filter((n: any) => 
          n.is_spam || 
          n.status === 'quarantined' || 
          (n.external_spam_score && n.external_spam_score > 50) ||
          n.daily_calls > 100
        );
      }
      
      const summary = {
        total: numbers?.length || 0,
        healthy: results.filter((n: any) => !n.is_spam && n.status === 'active').length,
        quarantined: results.filter((n: any) => n.status === 'quarantined').length,
        spam_flagged: results.filter((n: any) => n.is_spam).length,
        high_volume: results.filter((n: any) => n.daily_calls > 100).length,
        numbers: args.check_all ? undefined : results.map((n: any) => ({
          number: n.number,
          status: n.status,
          isSpam: n.is_spam,
          spamScore: n.external_spam_score,
          dailyCalls: n.daily_calls,
          quarantineUntil: n.quarantine_until
        }))
      };
      
      return { 
        success: true, 
        message: `${summary.healthy}/${summary.total} numbers healthy, ${summary.spam_flagged} spam-flagged, ${summary.quarantined} quarantined`,
        data: summary 
      };
    }

    case 'move_lead_pipeline': {
      // Find lead
      let leadQuery = supabase.from('leads').select('id, first_name, last_name, phone_number').eq('user_id', userId);
      if (args.lead_id) leadQuery = leadQuery.eq('id', args.lead_id);
      else if (args.phone_number) leadQuery = leadQuery.eq('phone_number', args.phone_number);
      
      const { data: leads } = await leadQuery.limit(1);
      if (!leads || leads.length === 0) {
        return { success: false, message: `Lead not found with ${args.phone_number ? 'phone ' + args.phone_number : 'ID ' + args.lead_id}` };
      }
      
      const lead = leads[0];
      const leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.phone_number;
      
      // Find pipeline board
      let boardQuery = supabase.from('pipeline_boards').select('id, name').eq('user_id', userId);
      if (args.pipeline_board_id) boardQuery = boardQuery.eq('id', args.pipeline_board_id);
      else if (args.pipeline_board_name) boardQuery = boardQuery.ilike('name', `%${args.pipeline_board_name}%`);
      
      const { data: boards } = await boardQuery.limit(1);
      if (!boards || boards.length === 0) {
        // List available boards for user
        const { data: allBoards } = await supabase.from('pipeline_boards').select('name').eq('user_id', userId);
        const boardNames = allBoards?.map((b: any) => b.name).join(', ') || 'none';
        return { success: false, message: `Pipeline board "${args.pipeline_board_name}" not found. Available boards: ${boardNames}` };
      }
      
      // Check if position already exists
      const { data: existing } = await supabase
        .from('lead_pipeline_positions')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('pipeline_board_id', boards[0].id)
        .single();
      
      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('lead_pipeline_positions')
          .update({
            notes: args.notes || 'Updated via AI Assistant',
            moved_at: new Date().toISOString(),
            moved_by_user: false
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('lead_pipeline_positions')
          .insert({
            user_id: userId,
            lead_id: lead.id,
            pipeline_board_id: boards[0].id,
            notes: args.notes || 'Moved via AI Assistant',
            moved_at: new Date().toISOString(),
            moved_by_user: false,
            position: 0
          });
        if (error) throw error;
      }
      
      return { 
        success: true, 
        message: `Lead "${leadName}" moved to "${boards[0].name}" pipeline stage` 
      };
    }

    case 'export_data': {
      const dataType = args.data_type;
      const format = args.format || 'csv';
      let data: any[] = [];
      let columns: string[] = [];
      
      switch (dataType) {
        case 'leads':
          const { data: leads } = await supabase.from('leads').select('*').eq('user_id', userId);
          data = leads || [];
          columns = ['first_name', 'last_name', 'phone_number', 'email', 'company', 'status', 'created_at'];
          break;
        case 'calls':
          const { data: calls } = await supabase.from('call_logs').select('*').eq('user_id', userId).limit(1000);
          data = calls || [];
          columns = ['phone_number', 'caller_id', 'status', 'outcome', 'duration_seconds', 'created_at'];
          break;
        case 'sms':
          const { data: sms } = await supabase.from('sms_messages').select('*').eq('user_id', userId).limit(1000);
          data = sms || [];
          columns = ['from_number', 'to_number', 'body', 'direction', 'status', 'created_at'];
          break;
        case 'campaigns':
          const { data: campaigns } = await supabase.from('campaigns').select('*').eq('user_id', userId);
          data = campaigns || [];
          columns = ['name', 'description', 'status', 'calls_per_minute', 'max_attempts', 'created_at'];
          break;
        case 'numbers':
          const { data: numbers } = await supabase.from('phone_numbers').select('*').eq('user_id', userId);
          data = numbers || [];
          columns = ['number', 'area_code', 'status', 'is_spam', 'daily_calls', 'created_at'];
          break;
        default:
          return { success: false, message: `Unknown data type: ${dataType}. Options: leads, calls, sms, campaigns, numbers` };
      }
      
      if (format === 'csv') {
        const header = columns.join(',');
        const rows = data.map((row: any) => columns.map(col => `"${(row[col] || '').toString().replace(/"/g, '""')}"`).join(','));
        const csv = [header, ...rows].join('\n');
        
        return { 
          success: true, 
          message: `Exported ${data.length} ${dataType} records as CSV`,
          data: { format: 'csv', rowCount: data.length, preview: csv.substring(0, 500) + (csv.length > 500 ? '...' : ''), fullData: csv }
        };
      } else {
        return { 
          success: true, 
          message: `Exported ${data.length} ${dataType} records as JSON`,
          data: { format: 'json', rowCount: data.length, records: data }
        };
      }
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
            { role: 'system', content: `You are a helpful AI assistant. Explain EXACTLY what you did in a clear, natural way. Be specific about:
- What action was taken
- Whether it succeeded or failed
- Key details (names, numbers, counts)
- If something failed, explain why

DO NOT be vague. DO NOT just repeat what the user asked. Tell them what ACTUALLY happened.` },
            { role: 'user', content: `User request: "${message}"\n\nActions taken:\n${results.join('\n')}\n\nExplain what happened in a clear, helpful response.` }
          ],
          max_tokens: 400,
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
