import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Complete location mapping - AI always knows where things are
const LOCATION_MAP: Record<string, { route: string; description: string }> = {
  workflow: { route: '/?tab=workflows', description: 'Workflow Builder tab' },
  workflows: { route: '/?tab=workflows', description: 'Workflow Builder tab' },
  campaign: { route: '/?tab=campaigns', description: 'Campaigns tab' },
  campaigns: { route: '/?tab=campaigns', description: 'Campaigns tab' },
  lead: { route: '/?tab=leads', description: 'Leads tab' },
  leads: { route: '/?tab=leads', description: 'Leads tab' },
  sms: { route: '/?tab=sms', description: 'SMS Messaging tab' },
  sms_blast: { route: '/?tab=sms', description: 'SMS Messaging tab' },
  broadcast: { route: '/?tab=broadcast', description: 'Voice Broadcast tab' },
  voice_broadcast: { route: '/?tab=broadcast', description: 'Voice Broadcast tab' },
  phone_numbers: { route: '/?tab=numbers', description: 'Phone Numbers tab' },
  numbers: { route: '/?tab=numbers', description: 'Phone Numbers tab' },
  agents: { route: '/?tab=agents', description: 'AI Agents tab' },
  agent: { route: '/?tab=agents', description: 'AI Agents tab' },
  analytics: { route: '/analytics', description: 'Analytics page' },
  settings: { route: '/settings', description: 'Settings page' },
  api_keys: { route: '/api-keys', description: 'API Keys page' },
  help: { route: '/help', description: 'Help page' },
  automation: { route: '/?tab=automation', description: 'Automation tab' },
  automations: { route: '/?tab=automation', description: 'Automation tab' },
  disposition: { route: '/?tab=dispositions', description: 'Dispositions tab' },
  dispositions: { route: '/?tab=dispositions', description: 'Dispositions tab' },
  calendar: { route: '/?tab=calendar', description: 'Calendar tab' },
  pipeline: { route: '/?tab=pipeline', description: 'Pipeline tab' },
  overview: { route: '/?tab=overview', description: 'Dashboard Overview' },
};

// Complete system knowledge with GUIDED WIZARD FLOWS
const SYSTEM_KNOWLEDGE = `You are the AI Brain for a powerful sales dialer system. You are NOT just an assistant - you are an EXPERT GUIDE that proactively leads users through complex setups.

## YOUR CORE PERSONALITY
- You are PROACTIVE, not reactive
- You ASK the questions users don't know to ask
- You GUIDE users step-by-step through setup wizards
- You NEVER skip important steps
- You EXPLAIN why each step matters
- You make users feel like "Wow, this AI really does everything!"

## CRITICAL: GUIDED SETUP WIZARDS

When a user wants to set up any of these features, you MUST follow the wizard flow and ask ALL required questions before taking action:

### 🎙️ VOICE BROADCAST WIZARD
When user wants to create a voice broadcast, ask these IN ORDER:

**Step 1: Purpose & Audience**
"Let's set up your voice broadcast! First, I need to understand your goals:
1. **What's the purpose?** (appointment reminder, promotional offer, urgent notification, survey)
2. **Who are you calling?** (all leads, specific status, specific campaign, custom list)
3. **How many people approximately?** (I'll check your lead count)"

**Step 2: Message Content**
"Great! Now let's craft your message:
1. **Do you want to use AI text-to-speech or upload a recording?**
2. If TTS: **What voice style?** (professional male, friendly female, etc.)
3. **What should the message say?** (I can help you write it - keep it under 30 seconds)"

**Step 3: Timing & Schedule**
"Perfect! Now let's plan when to send:
1. **When should this go out?** (immediately, scheduled time, best time AI-optimized)
2. **What timezone are your recipients in?** (I'll respect calling hours 8AM-9PM)
3. **Should we pace this?** (all at once, spread over hours, spread over days)"

**Step 4: Phone Number Selection**
"Let me check your available numbers... [list numbers]
1. **Which number should calls come from?** (I recommend [X] because...)
2. **Any numbers to avoid?** (e.g., connected to other services)"

**Step 5: Confirmation**
"Here's your voice broadcast summary:
- Name: [X]
- Message: [preview]
- Recipients: [count] leads
- From Number: [X]
- Schedule: [X]

Should I create this broadcast? You can always edit it before launching."

### 📱 SMS BLAST WIZARD
When user wants to send an SMS blast:

**Step 1: Purpose & Audience**
"Let's set up your SMS blast! Quick questions:
1. **What's this message for?** (follow-up, promotion, appointment reminder, survey)
2. **Who should receive it?** (all leads, specific status, specific campaign)
3. **Is this time-sensitive?** (affects urgency in message)"

**Step 2: Message Content**
"Now let's craft your message (keep it under 160 chars for best delivery):
1. **What's the main message?** (I'll help optimize it)
2. **Should I personalize it?** (use {first_name}, {company}, etc.)
3. **Include a call-to-action?** (reply YES, call this number, click link)"

**Step 3: Compliance Check**
"Important compliance questions:
1. **Have all recipients opted in?** (required for SMS)
2. **Include opt-out language?** (Reply STOP to unsubscribe - required by law)"

**Step 4: Phone Number Selection**
"Let me check your SMS-capable numbers...
- **Which number to send from?** [list options with recommendations]"

**Step 5: Confirmation**
"Ready to send! Summary:
- Message: [preview]
- Recipients: [count]
- From: [number]
- Personalization: [yes/no]

⚠️ This will send immediately to [X] people. Confirm?"

### 🤖 AI VOICE CAMPAIGN WIZARD
When user wants to set up an AI calling campaign:

**Step 1: Campaign Goals**
"Let's set up your AI calling campaign! First:
1. **What's the goal?** (lead qualification, appointment setting, follow-up, survey)
2. **What industry/use case?** (solar, insurance, real estate, etc.)
3. **What should the AI say?** (I can generate a script based on your goal)"

**Step 2: AI Agent Configuration**
"Now let's configure your AI agent:
1. **What personality?** (professional, friendly, urgent, consultative)
2. **What voice?** (male/female, accent preference)
3. **What should AI do on success?** (book appointment, transfer to human, schedule callback)"

**Step 3: Lead Selection**
"Who should the AI call?
1. **Which leads?** (all, by status, by campaign, by tag)
2. **Any exclusions?** (already contacted today, DNC list - I auto-check this)
3. **Priority order?** (newest first, highest score, scheduled callbacks first)"

**Step 4: Calling Parameters**
"Let's set the calling rules:
1. **Calling hours?** (default 9AM-5PM in each lead's timezone)
2. **Max attempts per lead?** (recommend 3)
3. **Calls per minute?** (recommend 5-10 to start)
4. **What to do on no answer?** (leave voicemail, send SMS, retry later)"

**Step 5: Phone Numbers**
"Checking your available numbers...
- **Which number(s) for outbound calls?** [list with recommendations]
- **Enable local presence?** (use area-code matching - improves answer rates 20-30%)"

**Step 6: Review & Launch**
"Campaign Summary:
- Name: [X]
- Goal: [X]
- AI Agent: [X]
- Leads: [X] selected
- Calling Hours: [X]
- From Numbers: [X]
- On No Answer: [X]

Ready to launch? (You can pause anytime)"

## YOUR CAPABILITIES
You can create, read, update, and delete:
- Workflows (multi-step sequences with calls, SMS, waits, conditions)
- Campaigns (calling campaigns with settings)
- Leads (contact records)
- SMS Blasts (bulk SMS to multiple leads)
- Voice Broadcasts (automated voice messages)
- Automation Rules (trigger-based actions)
- Phone Numbers (manage caller IDs)
- Agents (AI voice agents)
- Appointments (calendar scheduling)
- Dispositions (call outcomes)

## CRITICAL RULES

### 1. ALWAYS USE WIZARD FLOWS
When user mentions: "voice broadcast", "sms blast", "ai campaign", "quick start", "set up", "create" - START THE APPROPRIATE WIZARD. Don't skip steps!

### 2. ASK BEFORE ASSUMING
NEVER pick defaults without explaining WHY. Say "I recommend X because..." and ask for confirmation.

### 3. CHECK PREREQUISITES FIRST
Before starting any wizard, verify:
- Phone numbers are configured
- Leads exist in the system
- Required integrations are connected

### 4. ALWAYS TELL THE USER WHERE THINGS ARE
When you create, update, or reference anything, include a navigation link:
[[Display Text|/route]]

Examples:
- "You can find it here: [[Voice Broadcasts|/?tab=broadcast]]"
- "Your campaign is ready at [[Campaigns|/?tab=campaigns]]"

### 5. PROVIDE CONTEXT & EDUCATION
Explain terms users might not know:
- "Local presence means using phone numbers that match the recipient's area code"
- "AMD detects answering machines so we can leave voicemails automatically"
- "A 3% abandonment rate is the FCC limit - we'll monitor this for you"

### 6. CONFIRMATION FOR ALL ACTIONS
Before executing any tool that creates/sends/modifies, show a summary and ask for confirmation.

### 7. SMART RECOMMENDATIONS
Based on their setup, proactively suggest:
- "I notice you have 100 leads but no campaign - want to set one up?"
- "Your answer rate could improve with local presence - should I enable it?"
- "You haven't set up voicemail drops - this could increase callbacks"

### 8. HANDLE "JUST DO IT" RESPONSES
If user says "just pick" or "you decide", pick the BEST option and explain:
"I'll use [X] because [reason]. Here's what I'm setting up: [summary]. Sound good?"

## RESPONSE FORMAT
- Be conversational but efficient
- Use numbered lists for multi-part questions
- Bold important terms
- Include relevant emojis sparingly (🎙️📱🤖✅⚠️)
- Always end wizard steps with a clear question
- Include navigation links for created items

## SLASH COMMANDS
- /create [type] - Start appropriate wizard
- /list [type] - List items
- /status - System status
- /help [topic] - Get help

## CONTEXT AWARENESS
The user's current page is provided. Offer relevant help:
- On broadcast tab? "I see you're on Voice Broadcasts - would you like to create one?"
- On campaigns tab? "Looking at campaigns - need help setting one up or optimizing?"
`;

// Tool definitions
const TOOLS = [
  // Workflow tools
  {
    type: "function",
    function: {
      name: "create_workflow",
      description: "Create a new multi-step workflow/sequence with calls, SMS, waits, and conditions",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Workflow name" },
          description: { type: "string", description: "What this workflow does" },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step_type: { type: "string", enum: ["call", "sms", "ai_sms", "wait", "condition"] },
                step_config: { type: "object" }
              }
            }
          }
        },
        required: ["name", "steps"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_workflows",
      description: "List all workflows",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_workflow",
      description: "Delete a workflow by ID or name",
      parameters: {
        type: "object",
        properties: {
          workflow_id: { type: "string" },
          workflow_name: { type: "string" }
        }
      }
    }
  },
  // Campaign tools
  {
    type: "function",
    function: {
      name: "create_campaign",
      description: "Create a new calling campaign",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          agent_id: { type: "string" },
          workflow_id: { type: "string" },
          calling_hours_start: { type: "string", description: "e.g., 09:00" },
          calling_hours_end: { type: "string", description: "e.g., 17:00" },
          max_attempts: { type: "number" },
          calls_per_minute: { type: "number" }
        },
        required: ["name"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_campaigns",
      description: "List all campaigns",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "update_campaign",
      description: "Update a campaign's settings or status",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          campaign_name: { type: "string" },
          updates: { type: "object" }
        }
      }
    }
  },
  // SMS tools
  {
    type: "function",
    function: {
      name: "send_sms_blast",
      description: "Send bulk SMS to multiple leads immediately",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The SMS message to send" },
          lead_ids: { type: "array", items: { type: "string" }, description: "Specific lead IDs to send to" },
          filter: { type: "object", description: "Filter criteria for leads (e.g., status, tags)" },
          from_number: { type: "string", description: "Phone number to send from" }
        },
        required: ["message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "send_test_sms",
      description: "Send a test SMS to a single phone number",
      parameters: {
        type: "object",
        properties: {
          to_number: { type: "string" },
          message: { type: "string" },
          from_number: { type: "string" }
        },
        required: ["to_number", "message"]
      }
    }
  },
  // Lead tools
  {
    type: "function",
    function: {
      name: "list_leads",
      description: "List leads with optional filters",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          limit: { type: "number" },
          search: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_leads_to_campaign",
      description: "Add leads to a campaign",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          campaign_name: { type: "string" },
          lead_ids: { type: "array", items: { type: "string" } },
          filter: { type: "object" }
        }
      }
    }
  },
  // Automation tools
  {
    type: "function",
    function: {
      name: "create_automation_rule",
      description: "Create a trigger-based automation rule",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          trigger: { type: "string" },
          conditions: { type: "object" },
          actions: { type: "array", items: { type: "object" } }
        },
        required: ["name", "trigger", "actions"]
      }
    }
  },
  // System tools
  {
    type: "function",
    function: {
      name: "get_system_status",
      description: "Get overall system status including active campaigns, phone numbers, leads count, etc.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "diagnose_issue",
      description: "Diagnose why something isn't working",
      parameters: {
        type: "object",
        properties: {
          issue_type: { type: "string", description: "e.g., campaign_not_calling, sms_not_sending" },
          resource_id: { type: "string" },
          resource_name: { type: "string" }
        },
        required: ["issue_type"]
      }
    }
  },
  // Memory tools
  {
    type: "function",
    function: {
      name: "undo_last_action",
      description: "Undo the last action performed in this session",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "record_session_action",
      description: "Record an action for session memory (internal use)",
      parameters: {
        type: "object",
        properties: {
          action_type: { type: "string" },
          resource_type: { type: "string" },
          resource_id: { type: "string" },
          resource_name: { type: "string" },
          action_data: { type: "object" },
          can_undo: { type: "boolean" }
        },
        required: ["action_type", "resource_type"]
      }
    }
  },
  // Voice Broadcast tools
  {
    type: "function",
    function: {
      name: "create_voice_broadcast",
      description: "Create a voice broadcast to send automated voice messages",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
          message_type: { type: "string", enum: ["tts", "audio_file"] },
          message_content: { type: "string" },
          lead_ids: { type: "array", items: { type: "string" } },
          scheduled_at: { type: "string" }
        },
        required: ["name", "message_type", "message_content"]
      }
    }
  },
  // Phone number tools
  {
    type: "function",
    function: {
      name: "list_phone_numbers",
      description: "List all phone numbers",
      parameters: { type: "object", properties: {} }
    }
  }
];

// Execute tool calls
async function executeToolCall(
  supabase: any, 
  userId: string, 
  sessionId: string,
  toolName: string, 
  args: any
): Promise<{ success: boolean; result: any; location?: string }> {
  console.log(`Executing tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case 'create_workflow': {
        const { data: workflow, error } = await supabase
          .from('campaign_workflows')
          .insert({
            user_id: userId,
            name: args.name,
            description: args.description || '',
            workflow_type: 'mixed',
            active: true
          })
          .select()
          .maybeSingle();

        if (error) throw error;

        // Insert steps
        if (args.steps?.length > 0) {
          const stepsToInsert = args.steps.map((step: any, index: number) => ({
            workflow_id: workflow.id,
            step_number: index + 1,
            step_type: step.step_type,
            step_config: step.step_config || {}
          }));

          await supabase.from('workflow_steps').insert(stepsToInsert);
        }

        // Record session action
        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'create',
          resource_type: 'workflow',
          resource_id: workflow.id,
          resource_name: args.name,
          action_data: { workflow, steps: args.steps },
          can_undo: true
        });

        return {
          success: true,
          result: { workflow, message: `Created workflow "${args.name}" with ${args.steps?.length || 0} steps` },
          location: LOCATION_MAP.workflows.route
        };
      }

      case 'list_workflows': {
        const { data, error } = await supabase
          .from('campaign_workflows')
          .select('id, name, description, active, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, result: { workflows: data, count: data?.length || 0 }, location: LOCATION_MAP.workflows.route };
      }

      case 'delete_workflow': {
        let workflowId = args.workflow_id;
        
        if (!workflowId && args.workflow_name) {
          const { data } = await supabase
            .from('campaign_workflows')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${args.workflow_name}%`)
            .maybeSingle();
          workflowId = data?.id;
        }

        if (!workflowId) {
          return { success: false, result: { error: 'Workflow not found' } };
        }

        await supabase.from('workflow_steps').delete().eq('workflow_id', workflowId);
        await supabase.from('campaign_workflows').delete().eq('id', workflowId);

        return { success: true, result: { message: 'Workflow deleted' } };
      }

      case 'create_campaign': {
        const { data: campaign, error } = await supabase
          .from('campaigns')
          .insert({
            user_id: userId,
            name: args.name,
            description: args.description || '',
            agent_id: args.agent_id,
            workflow_id: args.workflow_id,
            calling_hours_start: args.calling_hours_start || '09:00',
            calling_hours_end: args.calling_hours_end || '17:00',
            max_attempts: args.max_attempts || 3,
            calls_per_minute: args.calls_per_minute || 5,
            status: 'draft'
          })
          .select()
          .maybeSingle();

        if (error) throw error;

        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'create',
          resource_type: 'campaign',
          resource_id: campaign.id,
          resource_name: args.name,
          action_data: { campaign },
          can_undo: true
        });

        return {
          success: true,
          result: { campaign, message: `Created campaign "${args.name}"` },
          location: LOCATION_MAP.campaigns.route
        };
      }

      case 'list_campaigns': {
        const { data, error } = await supabase
          .from('campaigns')
          .select('id, name, description, status, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, result: { campaigns: data, count: data?.length || 0 }, location: LOCATION_MAP.campaigns.route };
      }

      case 'update_campaign': {
        let campaignId = args.campaign_id;
        
        if (!campaignId && args.campaign_name) {
          const { data } = await supabase
            .from('campaigns')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${args.campaign_name}%`)
            .maybeSingle();
          campaignId = data?.id;
        }

        if (!campaignId) {
          return { success: false, result: { error: 'Campaign not found' } };
        }

        const { data, error } = await supabase
          .from('campaigns')
          .update(args.updates)
          .eq('id', campaignId)
          .select()
          .maybeSingle();

        if (error) throw error;
        return { success: true, result: { campaign: data, message: 'Campaign updated' }, location: LOCATION_MAP.campaigns.route };
      }

      case 'send_sms_blast': {
        // Get leads to send to
        let leadsQuery = supabase
          .from('leads')
          .select('id, phone_number, first_name, last_name')
          .eq('user_id', userId)
          .eq('do_not_call', false);

        if (args.lead_ids?.length > 0) {
          leadsQuery = leadsQuery.in('id', args.lead_ids);
        }
        if (args.filter?.status) {
          leadsQuery = leadsQuery.eq('status', args.filter.status);
        }
        if (args.filter?.tags) {
          leadsQuery = leadsQuery.contains('tags', args.filter.tags);
        }

        const { data: leads, error: leadsError } = await leadsQuery.limit(500);
        if (leadsError) throw leadsError;

        if (!leads || leads.length === 0) {
          return { success: false, result: { error: 'No leads found matching criteria' } };
        }

        // Get a from number
        let fromNumber = args.from_number;
        if (!fromNumber) {
          const { data: numbers } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          fromNumber = numbers?.number;
        }

        if (!fromNumber) {
          return { success: false, result: { error: 'No phone number available to send from. Add phone numbers first.' } };
        }

        // Create SMS messages
        const messages = leads.map((lead: any) => ({
          user_id: userId,
          to_number: lead.phone_number,
          from_number: fromNumber,
          body: args.message
            .replace('{first_name}', lead.first_name || '')
            .replace('{last_name}', lead.last_name || ''),
          direction: 'outbound',
          status: 'pending',
          lead_id: lead.id
        }));

        const { error: insertError } = await supabase.from('sms_messages').insert(messages);
        if (insertError) throw insertError;

        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'send_sms_blast',
          resource_type: 'sms_blast',
          resource_name: `SMS Blast to ${leads.length} leads`,
          action_data: { message: args.message, lead_count: leads.length },
          can_undo: false
        });

        return {
          success: true,
          result: { message: `SMS blast queued for ${leads.length} leads`, lead_count: leads.length },
          location: LOCATION_MAP.sms.route
        };
      }

      case 'send_test_sms': {
        let fromNumber = args.from_number;
        if (!fromNumber) {
          const { data: numbers } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();
          fromNumber = numbers?.number;
        }

        if (!fromNumber) {
          return { success: false, result: { error: 'No phone number available. Add phone numbers first.' } };
        }

        const { error } = await supabase.from('sms_messages').insert({
          user_id: userId,
          to_number: args.to_number,
          from_number: fromNumber,
          body: args.message,
          direction: 'outbound',
          status: 'pending'
        });

        if (error) throw error;
        return { success: true, result: { message: `Test SMS sent to ${args.to_number}` }, location: LOCATION_MAP.sms.route };
      }

      case 'list_leads': {
        let query = supabase
          .from('leads')
          .select('id, first_name, last_name, phone_number, email, status, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (args.status) query = query.eq('status', args.status);
        if (args.search) query = query.or(`first_name.ilike.%${args.search}%,last_name.ilike.%${args.search}%,phone_number.ilike.%${args.search}%`);
        if (args.limit) query = query.limit(args.limit);
        else query = query.limit(50);

        const { data, error } = await query;
        if (error) throw error;

        // Get total count
        const { count } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);

        return { success: true, result: { leads: data, shown: data?.length || 0, total: count || 0 }, location: LOCATION_MAP.leads.route };
      }

      case 'add_leads_to_campaign': {
        let campaignId = args.campaign_id;
        
        if (!campaignId && args.campaign_name) {
          const { data } = await supabase
            .from('campaigns')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${args.campaign_name}%`)
            .maybeSingle();
          campaignId = data?.id;
        }

        if (!campaignId) {
          return { success: false, result: { error: 'Campaign not found' } };
        }

        let leadIds = args.lead_ids;
        if (!leadIds && args.filter) {
          let query = supabase.from('leads').select('id').eq('user_id', userId);
          if (args.filter.status) query = query.eq('status', args.filter.status);
          const { data } = await query;
          leadIds = data?.map((l: any) => l.id) || [];
        }

        if (!leadIds?.length) {
          return { success: false, result: { error: 'No leads to add' } };
        }

        const inserts = leadIds.map((lid: string) => ({ campaign_id: campaignId, lead_id: lid }));
        const { error } = await supabase.from('campaign_leads').insert(inserts);
        if (error) throw error;

        return { success: true, result: { message: `Added ${leadIds.length} leads to campaign` }, location: LOCATION_MAP.campaigns.route };
      }

      case 'create_automation_rule': {
        const { data, error } = await supabase
          .from('campaign_automation_rules')
          .insert({
            user_id: userId,
            name: args.name,
            rule_type: args.trigger,
            conditions: args.conditions || {},
            actions: args.actions,
            enabled: true
          })
          .select()
          .maybeSingle();

        if (error) throw error;

        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'create',
          resource_type: 'automation_rule',
          resource_id: data.id,
          resource_name: args.name,
          action_data: { rule: data },
          can_undo: true
        });

        return { success: true, result: { rule: data, message: `Created automation rule "${args.name}"` }, location: LOCATION_MAP.automation.route };
      }

      case 'get_system_status': {
        const [campaigns, leads, numbers, workflows] = await Promise.all([
          supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('leads').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('phone_numbers').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase.from('campaign_workflows').select('*', { count: 'exact', head: true }).eq('user_id', userId)
        ]);

        const { data: activeCampaigns } = await supabase
          .from('campaigns')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active');

        return {
          success: true,
          result: {
            total_campaigns: campaigns.count || 0,
            active_campaigns: activeCampaigns?.length || 0,
            total_leads: leads.count || 0,
            total_phone_numbers: numbers.count || 0,
            total_workflows: workflows.count || 0
          }
        };
      }

      case 'diagnose_issue': {
        const diagnostics: string[] = [];

        if (args.issue_type === 'campaign_not_calling' || args.issue_type.includes('call')) {
          // Check phone numbers
          const { data: numbers } = await supabase
            .from('phone_numbers')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'active');
          
          if (!numbers?.length) {
            diagnostics.push('❌ No active phone numbers configured. Add phone numbers first.');
          } else {
            diagnostics.push(`✅ ${numbers.length} active phone numbers found`);
          }

          // Check campaigns
          const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id, name, status, agent_id')
            .eq('user_id', userId);
          
          const activeCampaigns = campaigns?.filter((c: any) => c.status === 'active') || [];
          if (!activeCampaigns.length) {
            diagnostics.push('❌ No active campaigns. Start a campaign first.');
          } else {
            diagnostics.push(`✅ ${activeCampaigns.length} active campaigns found`);
            
            const withoutAgent = activeCampaigns.filter((c: any) => !c.agent_id);
            if (withoutAgent.length) {
              diagnostics.push(`⚠️ ${withoutAgent.length} campaigns have no AI agent assigned`);
            }
          }

          // Check leads in campaigns
          const { data: campaignLeads } = await supabase
            .from('campaign_leads')
            .select('campaign_id')
            .in('campaign_id', campaigns?.map((c: any) => c.id) || []);
          
          if (!campaignLeads?.length) {
            diagnostics.push('❌ No leads assigned to campaigns. Add leads to campaigns first.');
          } else {
            diagnostics.push(`✅ ${campaignLeads.length} lead-campaign assignments found`);
          }
        }

        if (args.issue_type === 'sms_not_sending' || args.issue_type.includes('sms')) {
          const { data: numbers } = await supabase
            .from('phone_numbers')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'active');
          
          if (!numbers?.length) {
            diagnostics.push('❌ No active phone numbers for SMS. Add phone numbers first.');
          } else {
            diagnostics.push(`✅ ${numbers.length} phone numbers available for SMS`);
          }

          const { data: pendingSms } = await supabase
            .from('sms_messages')
            .select('id, status')
            .eq('user_id', userId)
            .eq('status', 'pending');
          
          if (pendingSms?.length) {
            diagnostics.push(`⚠️ ${pendingSms.length} SMS messages pending in queue`);
          }
        }

        return {
          success: true,
          result: {
            issue_type: args.issue_type,
            diagnostics,
            summary: diagnostics.some(d => d.startsWith('❌')) 
              ? 'Issues found that need attention' 
              : 'System appears healthy'
          }
        };
      }

      case 'undo_last_action': {
        const { data: lastAction } = await supabase
          .from('ai_session_memory')
          .select('*')
          .eq('user_id', userId)
          .eq('session_id', sessionId)
          .eq('can_undo', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!lastAction) {
          return { success: false, result: { error: 'No undoable action in this session' } };
        }

        // Perform undo based on action type
        if (lastAction.action_type === 'create') {
          if (lastAction.resource_type === 'workflow') {
            await supabase.from('workflow_steps').delete().eq('workflow_id', lastAction.resource_id);
            await supabase.from('campaign_workflows').delete().eq('id', lastAction.resource_id);
          } else if (lastAction.resource_type === 'campaign') {
            await supabase.from('campaigns').delete().eq('id', lastAction.resource_id);
          } else if (lastAction.resource_type === 'automation_rule') {
            await supabase.from('campaign_automation_rules').delete().eq('id', lastAction.resource_id);
          }
        }

        // Mark as undone
        await supabase
          .from('ai_session_memory')
          .update({ can_undo: false })
          .eq('id', lastAction.id);

        return {
          success: true,
          result: { message: `Undone: ${lastAction.action_type} ${lastAction.resource_type} "${lastAction.resource_name}"` }
        };
      }

      case 'list_phone_numbers': {
        const { data, error } = await supabase
          .from('phone_numbers')
          .select('id, number, friendly_name, status, provider, purpose')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        return { success: true, result: { phone_numbers: data, count: data?.length || 0 }, location: LOCATION_MAP.numbers.route };
      }

      case 'create_voice_broadcast': {
        const { data, error } = await supabase
          .from('voice_broadcasts')
          .insert({
            user_id: userId,
            name: args.name,
            message_type: args.message_type,
            tts_text: args.message_type === 'tts' ? args.message_content : null,
            status: 'draft'
          })
          .select()
          .maybeSingle();

        if (error) throw error;

        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'create',
          resource_type: 'voice_broadcast',
          resource_id: data.id,
          resource_name: args.name,
          action_data: { broadcast: data },
          can_undo: true
        });

        return {
          success: true,
          result: { broadcast: data, message: `Created voice broadcast "${args.name}"` },
          location: LOCATION_MAP.broadcast.route
        };
      }

      default:
        return { success: false, result: { error: `Unknown tool: ${toolName}` } };
    }
  } catch (error: any) {
    console.error(`Tool execution error (${toolName}):`, error);
    return { success: false, result: { error: error.message } };
  }
}

// Record feedback for learning
async function recordFeedback(
  supabase: any,
  userId: string,
  responseId: string,
  rating: 'up' | 'down',
  messageContent: string,
  responseContent: string
) {
  await supabase.from('ai_feedback').insert({
    user_id: userId,
    response_id: responseId,
    rating,
    message_content: messageContent,
    response_content: responseContent
  });

  // Update daily insights
  const today = new Date().toISOString().split('T')[0];
  await supabase.rpc('upsert_daily_insight', {
    p_user_id: userId,
    p_date: today,
    p_positive: rating === 'up' ? 1 : 0,
    p_negative: rating === 'down' ? 1 : 0
  }).catch(() => {
    // If RPC doesn't exist, do manual upsert
    supabase
      .from('ai_daily_insights')
      .upsert({
        user_id: userId,
        insight_date: today,
        total_interactions: 1,
        positive_feedback: rating === 'up' ? 1 : 0,
        negative_feedback: rating === 'down' ? 1 : 0
      }, {
        onConflict: 'user_id,insight_date'
      });
  });
}

// Get user preferences from learning
async function getUserPreferences(supabase: any, userId: string): Promise<Record<string, any>> {
  const { data } = await supabase
    .from('ai_learning')
    .select('pattern_type, pattern_key, pattern_value')
    .eq('user_id', userId)
    .order('success_count', { ascending: false })
    .limit(20);

  const preferences: Record<string, any> = {};
  data?.forEach((p: any) => {
    if (!preferences[p.pattern_type]) preferences[p.pattern_type] = {};
    preferences[p.pattern_type][p.pattern_key] = p.pattern_value;
  });

  return preferences;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      message, 
      sessionId, 
      currentRoute, 
      conversationHistory,
      action // 'chat', 'feedback', 'get_preferences'
    } = await req.json();

    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle feedback action
    if (action === 'feedback') {
      const { responseId, rating, messageContent, responseContent } = await req.json();
      await recordFeedback(supabase, user.id, responseId, rating, messageContent, responseContent);
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle get_preferences action
    if (action === 'get_preferences') {
      const preferences = await getUserPreferences(supabase, user.id);
      return new Response(
        JSON.stringify({ preferences }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user preferences for context
    const preferences = await getUserPreferences(supabase, user.id);
    
    // Build context-aware system prompt
    let contextPrompt = SYSTEM_KNOWLEDGE;
    contextPrompt += `\n\n## CURRENT CONTEXT\n`;
    contextPrompt += `- User is on: ${currentRoute || 'unknown page'}\n`;
    if (Object.keys(preferences).length > 0) {
      contextPrompt += `- User preferences: ${JSON.stringify(preferences)}\n`;
    }

    // Build messages
    const messages = [
      { role: 'system', content: contextPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: message }
    ];

    // Call AI with tools
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        tools: TOOLS,
        tool_choice: 'auto'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add more credits.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiResponse = await response.json();
    
    // Safe access to AI response with null check
    const assistantMessage = aiResponse.choices?.[0]?.message;
    if (!assistantMessage) {
      throw new Error('Invalid AI response: no message returned');
    }

    // Handle tool calls
    if (assistantMessage.tool_calls) {
      const toolResults = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (parseError) {
          console.error('[AI Brain] Failed to parse tool arguments:', parseError);
          continue; // Skip this tool call
        }
        const result = await executeToolCall(
          supabase, 
          user.id, 
          sessionId || 'default',
          toolCall.function.name, 
          args
        );
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      // Get final response with tool results
      const finalMessages = [
        ...messages,
        assistantMessage,
        ...toolResults
      ];

      const finalResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: finalMessages
        }),
      });

      const finalAiResponse = await finalResponse.json();
      const finalContent = finalAiResponse.choices?.[0]?.message?.content || 'I apologize, but I was unable to generate a response.';

      // Update daily insights
      const today = new Date().toISOString().split('T')[0];
      await supabase
        .from('ai_daily_insights')
        .upsert({
          user_id: user.id,
          insight_date: today,
          total_interactions: 1
        }, {
          onConflict: 'user_id,insight_date'
        });

      // Safely parse tool results
      const parsedToolResults = toolResults.map(tr => {
        try {
          return JSON.parse(tr.content);
        } catch {
          return { raw: tr.content, parseError: true };
        }
      });

      return new Response(
        JSON.stringify({
          content: finalContent,
          toolResults: parsedToolResults,
          responseId: crypto.randomUUID()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // No tool calls, return direct response
    return new Response(
      JSON.stringify({
        content: assistantMessage.content,
        responseId: crypto.randomUUID()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('AI Brain error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
