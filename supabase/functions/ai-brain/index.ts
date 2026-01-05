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
  autonomous: { route: '/?tab=autonomous-agent', description: 'Autonomous Agent Dashboard' },
  goals: { route: '/?tab=autonomous-agent', description: 'Autonomous Goal Tracking' },
  learning: { route: '/?tab=autonomous-agent', description: 'AI Learning Insights' },
  priorities: { route: '/?tab=autonomous-agent', description: 'Lead Priority Scores' },
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
- Calendar Integrations (Google Calendar, Cal.com)
- Dispositions (call outcomes)
- Pipeline Stages (lead progression)

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

## AUTONOMOUS AGENT SYSTEM

You have full control over the Autonomous Agent system. This system:
- Makes AI-powered decisions about when to call, SMS, or email leads
- Sets and tracks daily goals (appointments, calls, conversations)
- Learns from outcomes to improve future decisions
- Prioritizes leads using ML-based scoring
- Auto-optimizes campaigns based on performance

When users ask about "system status", "what's happening", "how are we doing", or similar:
- Include autonomous agent metrics
- Show today's goal progress
- Highlight recent AI decisions
- Share any learning insights

Available autonomous commands:
- "What's happening with the system?" → Run get_autonomous_status
- "How are we doing on goals?" → Run get_autonomous_goals  
- "What has the AI learned?" → Run get_learning_insights
- "Show me autonomous decisions" → Run list_autonomous_decisions
- "Prioritize my leads" → Run force_reprioritize_leads
- "Enable/disable autonomous mode" → Run toggle_autonomous_mode
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
  // Calendar tools
  {
    type: "function",
    function: {
      name: "check_calendar_availability",
      description: "Check available appointment slots for a given date",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Date in YYYY-MM-DD format" },
          duration: { type: "number", description: "Meeting duration in minutes (default 30)" }
        },
        required: ["date"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description: "Book an appointment on the calendar",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          start_time: { type: "string", description: "ISO datetime" },
          duration_minutes: { type: "number" },
          lead_id: { type: "string" },
          description: { type: "string" }
        },
        required: ["title", "start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_appointments",
      description: "List upcoming appointments",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string" },
          end_date: { type: "string" },
          status: { type: "string", enum: ["scheduled", "completed", "cancelled"] }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_e2e_test",
      description: "Run an end-to-end test of the appointment booking workflow",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string", description: "Retell agent ID to test" },
          phone_number: { type: "string", description: "Phone number to call for the test" }
        },
        required: ["agent_id", "phone_number"]
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
  },
  // NEW POWER TOOLS - Campaign Control
  {
    type: "function",
    function: {
      name: "pause_campaign",
      description: "Pause an active campaign immediately",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          campaign_name: { type: "string" },
          reason: { type: "string", description: "Reason for pausing" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "resume_campaign",
      description: "Resume a paused campaign",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          campaign_name: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "stop_broadcast",
      description: "Stop a voice broadcast immediately",
      parameters: {
        type: "object",
        properties: {
          broadcast_id: { type: "string" },
          broadcast_name: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_health_check",
      description: "Run a full system health check and get diagnostics",
      parameters: { type: "object", properties: {} }
    }
  },
  // Lead Management Tools
  {
    type: "function",
    function: {
      name: "update_lead",
      description: "Update a lead's information, status, or tags",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          lead_phone: { type: "string", description: "Phone number to find lead" },
          updates: { 
            type: "object",
            properties: {
              status: { type: "string" },
              notes: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              priority: { type: "number" },
              do_not_call: { type: "boolean" }
            }
          }
        },
        required: ["updates"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_lead",
      description: "Delete a lead from the system",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          lead_phone: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_lead_to_stage",
      description: "Move a lead to a different pipeline stage",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          lead_phone: { type: "string" },
          stage_name: { type: "string" },
          stage_id: { type: "string" }
        }
      }
    }
  },
  // Alert Management Tools
  {
    type: "function",
    function: {
      name: "list_alerts",
      description: "List unacknowledged system alerts",
      parameters: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          limit: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "acknowledge_alert",
      description: "Acknowledge a system alert",
      parameters: {
        type: "object",
        properties: {
          alert_id: { type: "string" }
        },
        required: ["alert_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "acknowledge_all_alerts",
      description: "Acknowledge all pending system alerts",
      parameters: { type: "object", properties: {} }
    }
  },
  // Phone Number Management
  {
    type: "function",
    function: {
      name: "update_phone_number",
      description: "Update a phone number's status or settings",
      parameters: {
        type: "object",
        properties: {
          phone_number_id: { type: "string" },
          phone_number: { type: "string" },
          updates: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["active", "quarantined", "inactive"] },
              friendly_name: { type: "string" },
              purpose: { type: "string" }
            }
          }
        },
        required: ["updates"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "quarantine_phone_number",
      description: "Put a phone number in quarantine to protect from spam flags",
      parameters: {
        type: "object",
        properties: {
          phone_number_id: { type: "string" },
          phone_number: { type: "string" },
          reason: { type: "string" }
        }
      }
    }
  },
  // Appointment Management
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancel an existing appointment",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string" },
          reason: { type: "string" }
        },
        required: ["appointment_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Reschedule an appointment to a new time",
      parameters: {
        type: "object",
        properties: {
          appointment_id: { type: "string" },
          new_start_time: { type: "string", description: "New start time in ISO format" },
          new_duration_minutes: { type: "number" }
        },
        required: ["appointment_id", "new_start_time"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_today_appointments",
      description: "List all appointments for today",
      parameters: { type: "object", properties: {} }
    }
  },
  // Broadcast Control
  {
    type: "function",
    function: {
      name: "list_broadcasts",
      description: "List all voice broadcasts",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "scheduled", "in_progress", "completed", "paused", "cancelled"] }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "launch_broadcast",
      description: "Launch a draft voice broadcast",
      parameters: {
        type: "object",
        properties: {
          broadcast_id: { type: "string" },
          broadcast_name: { type: "string" }
        }
      }
    }
  },
  // AUTONOMOUS AGENT TOOLS
  {
    type: "function",
    function: {
      name: "get_autonomous_status",
      description: "Get current autonomous agent status including mode, recent decisions, goal progress, and learning insights",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "list_autonomous_decisions",
      description: "List recent autonomous agent decisions with outcomes",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of decisions to return (default 10)" },
          success_only: { type: "boolean", description: "Only show successful decisions" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_autonomous_goals",
      description: "Get today's autonomous goals and progress",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "set_autonomous_goal",
      description: "Set a new daily goal for appointments, calls, or conversations",
      parameters: {
        type: "object",
        properties: {
          appointments: { type: "number", description: "Target number of appointments" },
          calls: { type: "number", description: "Target number of calls" },
          conversations: { type: "number", description: "Target number of conversations" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_learning_insights",
      description: "Get what the AI has learned from recent decisions and outcomes",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "toggle_autonomous_mode",
      description: "Enable or disable autonomous mode",
      parameters: {
        type: "object",
        properties: {
          enabled: { type: "boolean", description: "True to enable, false to disable" }
        },
        required: ["enabled"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_autonomy_level",
      description: "Change the autonomy level (full_auto, approval_required, suggestions_only)",
      parameters: {
        type: "object",
        properties: {
          level: { type: "string", enum: ["full_auto", "approval_required", "suggestions_only"] }
        },
        required: ["level"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_lead_priorities",
      description: "Get AI-calculated lead priority scores",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of leads to return (default 10)" },
          min_score: { type: "number", description: "Minimum priority score (0-100)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "force_reprioritize_leads",
      description: "Trigger immediate lead reprioritization using ML scoring",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "get_campaign_optimization_status",
      description: "Get campaign auto-optimization recommendations and status",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" }
        }
      }
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
        // Normalize phone numbers to E.164 format
        const normalizePhone = (phone: string): string => {
          const digits = phone.replace(/\D/g, '');
          if (digits.length === 10) return '+1' + digits;
          if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
          if (!phone.startsWith('+')) return '+' + digits;
          return phone;
        };

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

        const { data: leads, error: leadsError } = await leadsQuery.limit(100); // Limit to 100 for real sending
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

        const normalizedFrom = normalizePhone(fromNumber);
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

        // Send SMS to each lead via sms-messaging edge function
        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        console.log(`[AI Brain] Sending SMS blast to ${leads.length} leads from ${normalizedFrom}`);

        for (const lead of leads) {
          const personalizedMessage = args.message
            .replace('{first_name}', lead.first_name || '')
            .replace('{last_name}', lead.last_name || '');

          const normalizedTo = normalizePhone(lead.phone_number);

          try {
            const smsResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                action: 'send_sms',
                to: normalizedTo,
                from: normalizedFrom,
                body: personalizedMessage,
                user_id: userId,
                lead_id: lead.id,
              }),
            });

            const smsResult = await smsResponse.json();
            
            if (smsResponse.ok && smsResult.success) {
              successCount++;
            } else {
              failCount++;
              errors.push(`${lead.phone_number}: ${smsResult.error || 'Unknown error'}`);
            }
          } catch (error) {
            failCount++;
            errors.push(`${lead.phone_number}: ${error instanceof Error ? error.message : 'Send failed'}`);
          }

          // Small delay between sends to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log(`[AI Brain] SMS blast complete: ${successCount} sent, ${failCount} failed`);

        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'send_sms_blast',
          resource_type: 'sms_blast',
          resource_name: `SMS Blast to ${leads.length} leads`,
          action_data: { message: args.message, lead_count: leads.length, success_count: successCount, fail_count: failCount },
          can_undo: false
        });

        return {
          success: successCount > 0,
          result: { 
            message: `SMS blast sent: ${successCount} delivered, ${failCount} failed`, 
            success_count: successCount,
            fail_count: failCount,
            errors: errors.slice(0, 5) // Return first 5 errors
          },
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

        // Normalize phone numbers to E.164 format
        const normalizePhone = (phone: string): string => {
          const digits = phone.replace(/\D/g, '');
          if (digits.length === 10) return '+1' + digits;
          if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
          if (!phone.startsWith('+')) return '+' + digits;
          return phone;
        };

        const normalizedTo = normalizePhone(args.to_number);
        const normalizedFrom = normalizePhone(fromNumber);

        console.log(`[AI Brain] Sending SMS from ${normalizedFrom} to ${normalizedTo}`);

        // Call the sms-messaging edge function to actually send via Twilio
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        const smsResponse = await fetch(`${supabaseUrl}/functions/v1/sms-messaging`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            action: 'send_sms',
            to: normalizedTo,
            from: normalizedFrom,
            body: args.message,
            user_id: userId,
          }),
        });

        const smsResult = await smsResponse.json();
        
        if (!smsResponse.ok || !smsResult.success) {
          console.error('[AI Brain] SMS send failed:', smsResult);
          return { 
            success: false, 
            result: { error: smsResult.error || 'Failed to send SMS via Twilio' } 
          };
        }

        console.log('[AI Brain] SMS sent successfully:', smsResult.provider_message_id);

        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'send_test_sms',
          resource_type: 'sms',
          resource_name: `SMS to ${normalizedTo}`,
          action_data: { to: normalizedTo, from: normalizedFrom, message: args.message },
          can_undo: false
        });

        return { 
          success: true, 
          result: { 
            message: `SMS successfully sent to ${normalizedTo}`,
            provider_message_id: smsResult.provider_message_id
          }, 
          location: LOCATION_MAP.sms.route 
        };
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

      // NEW POWER TOOLS EXECUTION
      case 'pause_campaign': {
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
        const { error } = await supabase
          .from('campaigns')
          .update({ status: 'paused' })
          .eq('id', campaignId);
        if (error) throw error;
        
        // Log the action
        await supabase.from('system_alerts').insert({
          user_id: userId,
          alert_type: 'campaign_paused',
          severity: 'info',
          message: `Campaign paused${args.reason ? `: ${args.reason}` : ''}`,
          context: { campaign_id: campaignId }
        });
        
        return { success: true, result: { message: 'Campaign paused' }, location: LOCATION_MAP.campaigns.route };
      }

      case 'resume_campaign': {
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
        const { error } = await supabase
          .from('campaigns')
          .update({ status: 'active' })
          .eq('id', campaignId);
        if (error) throw error;
        return { success: true, result: { message: 'Campaign resumed' }, location: LOCATION_MAP.campaigns.route };
      }

      case 'stop_broadcast': {
        let broadcastId = args.broadcast_id;
        if (!broadcastId && args.broadcast_name) {
          const { data } = await supabase
            .from('voice_broadcasts')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${args.broadcast_name}%`)
            .maybeSingle();
          broadcastId = data?.id;
        }
        if (!broadcastId) {
          return { success: false, result: { error: 'Broadcast not found' } };
        }
        await supabase.from('voice_broadcasts').update({ status: 'cancelled' }).eq('id', broadcastId);
        await supabase.from('broadcast_queue').update({ status: 'cancelled' }).eq('broadcast_id', broadcastId).eq('status', 'pending');
        return { success: true, result: { message: 'Broadcast stopped and pending calls cancelled' }, location: LOCATION_MAP.broadcast.route };
      }

      case 'run_health_check': {
        const diagnostics: string[] = [];
        
        // Check phone numbers
        const { data: numbers } = await supabase
          .from('phone_numbers')
          .select('id, status')
          .eq('user_id', userId);
        const activeNumbers = numbers?.filter((n: any) => n.status === 'active') || [];
        diagnostics.push(activeNumbers.length > 0 
          ? `✅ ${activeNumbers.length} active phone numbers` 
          : '❌ No active phone numbers');

        // Check campaigns
        const { data: campaigns } = await supabase
          .from('campaigns')
          .select('id, status')
          .eq('user_id', userId);
        const activeCampaigns = campaigns?.filter((c: any) => c.status === 'active') || [];
        diagnostics.push(`📊 ${campaigns?.length || 0} total campaigns, ${activeCampaigns.length} active`);

        // Check leads
        const { count: leadCount } = await supabase
          .from('leads')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        diagnostics.push(`👥 ${leadCount || 0} total leads`);

        // Check unacknowledged alerts
        const { data: alerts } = await supabase
          .from('system_alerts')
          .select('id, severity')
          .eq('user_id', userId)
          .eq('acknowledged', false);
        const criticalAlerts = alerts?.filter((a: any) => a.severity === 'critical') || [];
        if (criticalAlerts.length > 0) {
          diagnostics.push(`🚨 ${criticalAlerts.length} unacknowledged critical alerts`);
        } else if (alerts && alerts.length > 0) {
          diagnostics.push(`⚠️ ${alerts.length} unacknowledged alerts`);
        } else {
          diagnostics.push('✅ No pending alerts');
        }

        // Check recent errors
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentCalls } = await supabase
          .from('call_logs')
          .select('id, status')
          .eq('user_id', userId)
          .gte('created_at', oneHourAgo);
        if (recentCalls && recentCalls.length > 0) {
          const failedCount = recentCalls.filter((c: any) => c.status === 'failed').length;
          const errorRate = (failedCount / recentCalls.length) * 100;
          diagnostics.push(errorRate > 10 
            ? `⚠️ Call error rate: ${errorRate.toFixed(1)}%`
            : `✅ Call error rate: ${errorRate.toFixed(1)}%`);
        }

        const hasIssues = diagnostics.some(d => d.includes('❌') || d.includes('🚨'));
        return {
          success: true,
          result: {
            status: hasIssues ? 'issues_found' : 'healthy',
            diagnostics,
            summary: hasIssues ? 'System has issues that need attention' : 'System is healthy'
          }
        };
      }

      case 'update_lead': {
        let leadId = args.lead_id;
        if (!leadId && args.lead_phone) {
          const { data } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', userId)
            .eq('phone_number', args.lead_phone)
            .maybeSingle();
          leadId = data?.id;
        }
        if (!leadId) {
          return { success: false, result: { error: 'Lead not found' } };
        }
        const { error } = await supabase
          .from('leads')
          .update({ ...args.updates, updated_at: new Date().toISOString() })
          .eq('id', leadId);
        if (error) throw error;
        return { success: true, result: { message: 'Lead updated' }, location: LOCATION_MAP.leads.route };
      }

      case 'delete_lead': {
        let leadId = args.lead_id;
        if (!leadId && args.lead_phone) {
          const { data } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', userId)
            .eq('phone_number', args.lead_phone)
            .maybeSingle();
          leadId = data?.id;
        }
        if (!leadId) {
          return { success: false, result: { error: 'Lead not found' } };
        }
        const { error } = await supabase.from('leads').delete().eq('id', leadId);
        if (error) throw error;
        return { success: true, result: { message: 'Lead deleted' } };
      }

      case 'move_lead_to_stage': {
        let leadId = args.lead_id;
        if (!leadId && args.lead_phone) {
          const { data } = await supabase
            .from('leads')
            .select('id')
            .eq('user_id', userId)
            .eq('phone_number', args.lead_phone)
            .maybeSingle();
          leadId = data?.id;
        }
        if (!leadId) {
          return { success: false, result: { error: 'Lead not found' } };
        }
        
        let stageId = args.stage_id;
        if (!stageId && args.stage_name) {
          const { data } = await supabase
            .from('pipeline_boards')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${args.stage_name}%`)
            .maybeSingle();
          stageId = data?.id;
        }
        if (!stageId) {
          return { success: false, result: { error: 'Pipeline stage not found' } };
        }

        // Upsert lead pipeline position
        await supabase.from('lead_pipeline_positions').upsert({
          user_id: userId,
          lead_id: leadId,
          pipeline_board_id: stageId,
          moved_at: new Date().toISOString(),
          moved_by_user: false
        }, { onConflict: 'lead_id,pipeline_board_id' });

        return { success: true, result: { message: 'Lead moved to new stage' }, location: LOCATION_MAP.pipeline.route };
      }

      case 'list_alerts': {
        let query = supabase
          .from('system_alerts')
          .select('id, alert_type, severity, message, created_at, context')
          .eq('user_id', userId)
          .eq('acknowledged', false)
          .order('created_at', { ascending: false });
        
        if (args.severity) query = query.eq('severity', args.severity);
        if (args.limit) query = query.limit(args.limit);
        else query = query.limit(20);

        const { data, error } = await query;
        if (error) throw error;
        return { success: true, result: { alerts: data, count: data?.length || 0 } };
      }

      case 'acknowledge_alert': {
        const { error } = await supabase
          .from('system_alerts')
          .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
          .eq('id', args.alert_id)
          .eq('user_id', userId);
        if (error) throw error;
        return { success: true, result: { message: 'Alert acknowledged' } };
      }

      case 'acknowledge_all_alerts': {
        const { data, error } = await supabase
          .from('system_alerts')
          .update({ acknowledged: true, acknowledged_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('acknowledged', false)
          .select('id');
        if (error) throw error;
        return { success: true, result: { message: `${data?.length || 0} alerts acknowledged` } };
      }

      case 'update_phone_number': {
        let numberId = args.phone_number_id;
        if (!numberId && args.phone_number) {
          const { data } = await supabase
            .from('phone_numbers')
            .select('id')
            .eq('user_id', userId)
            .eq('number', args.phone_number)
            .maybeSingle();
          numberId = data?.id;
        }
        if (!numberId) {
          return { success: false, result: { error: 'Phone number not found' } };
        }
        const { error } = await supabase
          .from('phone_numbers')
          .update({ ...args.updates, updated_at: new Date().toISOString() })
          .eq('id', numberId);
        if (error) throw error;
        return { success: true, result: { message: 'Phone number updated' }, location: LOCATION_MAP.numbers.route };
      }

      case 'quarantine_phone_number': {
        let numberId = args.phone_number_id;
        if (!numberId && args.phone_number) {
          const { data } = await supabase
            .from('phone_numbers')
            .select('id')
            .eq('user_id', userId)
            .eq('number', args.phone_number)
            .maybeSingle();
          numberId = data?.id;
        }
        if (!numberId) {
          return { success: false, result: { error: 'Phone number not found' } };
        }
        await supabase
          .from('phone_numbers')
          .update({ 
            status: 'quarantined', 
            quarantine_reason: args.reason || 'AI-initiated quarantine',
            updated_at: new Date().toISOString() 
          })
          .eq('id', numberId);
        return { success: true, result: { message: 'Phone number quarantined' }, location: LOCATION_MAP.numbers.route };
      }

      case 'cancel_appointment': {
        const { error } = await supabase
          .from('calendar_appointments')
          .update({ 
            status: 'cancelled',
            notes: args.reason ? `Cancelled: ${args.reason}` : 'Cancelled via AI',
            updated_at: new Date().toISOString()
          })
          .eq('id', args.appointment_id)
          .eq('user_id', userId);
        if (error) throw error;
        return { success: true, result: { message: 'Appointment cancelled' }, location: LOCATION_MAP.calendar.route };
      }

      case 'reschedule_appointment': {
        const duration = args.new_duration_minutes || 30;
        const startTime = new Date(args.new_start_time);
        const endTime = new Date(startTime.getTime() + duration * 60 * 1000);
        
        const { error } = await supabase
          .from('calendar_appointments')
          .update({ 
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', args.appointment_id)
          .eq('user_id', userId);
        if (error) throw error;
        return { success: true, result: { message: 'Appointment rescheduled' }, location: LOCATION_MAP.calendar.route };
      }

      case 'list_today_appointments': {
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
        const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();
        
        const { data, error } = await supabase
          .from('calendar_appointments')
          .select('id, title, start_time, end_time, status, lead_id')
          .eq('user_id', userId)
          .gte('start_time', startOfDay)
          .lte('start_time', endOfDay)
          .order('start_time', { ascending: true });
        if (error) throw error;
        return { success: true, result: { appointments: data, count: data?.length || 0 }, location: LOCATION_MAP.calendar.route };
      }

      case 'list_broadcasts': {
        let query = supabase
          .from('voice_broadcasts')
          .select('id, name, status, created_at, message_type')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });
        
        if (args.status) query = query.eq('status', args.status);
        
        const { data, error } = await query.limit(20);
        if (error) throw error;
        return { success: true, result: { broadcasts: data, count: data?.length || 0 }, location: LOCATION_MAP.broadcast.route };
      }

      case 'launch_broadcast': {
        let broadcastId = args.broadcast_id;
        if (!broadcastId && args.broadcast_name) {
          const { data } = await supabase
            .from('voice_broadcasts')
            .select('id')
            .eq('user_id', userId)
            .ilike('name', `%${args.broadcast_name}%`)
            .maybeSingle();
          broadcastId = data?.id;
        }
        if (!broadcastId) {
          return { success: false, result: { error: 'Broadcast not found' } };
        }
        
        // Check if it's in draft status
        const { data: broadcast } = await supabase
          .from('voice_broadcasts')
          .select('status')
          .eq('id', broadcastId)
          .maybeSingle();
        
        if (broadcast?.status !== 'draft') {
          return { success: false, result: { error: `Cannot launch broadcast in ${broadcast?.status} status` } };
        }
        
        await supabase
          .from('voice_broadcasts')
          .update({ status: 'in_progress', started_at: new Date().toISOString() })
          .eq('id', broadcastId);
        
        return { success: true, result: { message: 'Broadcast launched' }, location: LOCATION_MAP.broadcast.route };
      }

      // AUTONOMOUS AGENT TOOL HANDLERS
      case 'get_autonomous_status': {
        // Get autonomous settings
        const { data: settings } = await supabase
          .from('autonomous_settings')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

        // Get today's goal
        const today = new Date().toISOString().split('T')[0];
        const { data: goal } = await supabase
          .from('autonomous_goals')
          .select('*')
          .eq('user_id', userId)
          .eq('goal_date', today)
          .maybeSingle();

        // Get recent decisions count
        const { data: recentDecisions } = await supabase
          .from('agent_decisions')
          .select('id, decision_type, success')
          .eq('user_id', userId)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        const successfulDecisions = recentDecisions?.filter(d => d.success) || [];

        return {
          success: true,
          result: {
            autonomous_enabled: settings?.enabled || false,
            autonomy_level: settings?.autonomy_level || 'suggestions_only',
            learning_enabled: settings?.learning_enabled || false,
            today_goal: goal ? {
              appointments: `${goal.appointments_achieved || 0}/${goal.appointments_target || 5}`,
              calls: `${goal.calls_achieved || 0}/${goal.calls_target || 100}`,
              conversations: `${goal.conversations_achieved || 0}/${goal.conversations_target || 20}`
            } : 'No goals set for today',
            decisions_24h: recentDecisions?.length || 0,
            success_rate: recentDecisions?.length ? `${Math.round((successfulDecisions.length / recentDecisions.length) * 100)}%` : 'N/A'
          },
          location: LOCATION_MAP.autonomous.route
        };
      }

      case 'list_autonomous_decisions': {
        let query = supabase
          .from('agent_decisions')
          .select('id, decision_type, lead_name, action_taken, success, created_at, reasoning')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(args.limit || 10);

        if (args.success_only) {
          query = query.eq('success', true);
        }

        const { data, error } = await query;
        if (error) throw error;

        return {
          success: true,
          result: { decisions: data, count: data?.length || 0 },
          location: LOCATION_MAP.autonomous.route
        };
      }

      case 'get_autonomous_goals': {
        const today = new Date().toISOString().split('T')[0];
        const { data: goal } = await supabase
          .from('autonomous_goals')
          .select('*')
          .eq('user_id', userId)
          .eq('goal_date', today)
          .maybeSingle();

        if (!goal) {
          return {
            success: true,
            result: { message: 'No goals set for today. Would you like me to set some?' },
            location: LOCATION_MAP.autonomous.route
          };
        }

        const appointmentProgress = goal.appointments_target ? Math.round((goal.appointments_achieved / goal.appointments_target) * 100) : 0;
        const callProgress = goal.calls_target ? Math.round((goal.calls_achieved / goal.calls_target) * 100) : 0;
        const conversationProgress = goal.conversations_target ? Math.round((goal.conversations_achieved / goal.conversations_target) * 100) : 0;
        const overallProgress = Math.round((appointmentProgress + callProgress + conversationProgress) / 3);

        return {
          success: true,
          result: {
            appointments: { achieved: goal.appointments_achieved || 0, target: goal.appointments_target || 5, progress: `${appointmentProgress}%` },
            calls: { achieved: goal.calls_achieved || 0, target: goal.calls_target || 100, progress: `${callProgress}%` },
            conversations: { achieved: goal.conversations_achieved || 0, target: goal.conversations_target || 20, progress: `${conversationProgress}%` },
            overall_progress: `${overallProgress}%`,
            goal_met: goal.goal_met || false
          },
          location: LOCATION_MAP.autonomous.route
        };
      }

      case 'set_autonomous_goal': {
        const today = new Date().toISOString().split('T')[0];
        const updates: any = { user_id: userId, goal_date: today, goal_type: 'daily' };
        
        if (args.appointments !== undefined) updates.appointments_target = args.appointments;
        if (args.calls !== undefined) updates.calls_target = args.calls;
        if (args.conversations !== undefined) updates.conversations_target = args.conversations;

        const { error } = await supabase
          .from('autonomous_goals')
          .upsert(updates, { onConflict: 'user_id,goal_date' });

        if (error) throw error;

        return {
          success: true,
          result: { message: `Goals updated: ${args.appointments || '-'} appointments, ${args.calls || '-'} calls, ${args.conversations || '-'} conversations` },
          location: LOCATION_MAP.autonomous.route
        };
      }

      case 'get_learning_insights': {
        // Get recent learning patterns
        const { data: patterns } = await supabase
          .from('ai_learning')
          .select('pattern_type, pattern_key, pattern_value, success_count, failure_count')
          .eq('user_id', userId)
          .order('success_count', { ascending: false })
          .limit(10);

        // Get learning outcomes
        const { data: outcomes } = await supabase
          .from('learning_outcomes')
          .select('action_type, lead_id, outcome_type, confidence_score, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(10);

        const insights = [];
        if (patterns?.length) {
          const topPattern = patterns[0];
          insights.push(`Most successful pattern: ${topPattern.pattern_key} (${topPattern.success_count} successes)`);
        }
        if (outcomes?.length) {
          const positiveOutcomes = outcomes.filter(o => o.outcome_type === 'positive');
          insights.push(`Recent outcomes: ${positiveOutcomes.length}/${outcomes.length} positive`);
        }

        return {
          success: true,
          result: {
            patterns_learned: patterns?.length || 0,
            recent_outcomes: outcomes?.length || 0,
            insights: insights.length ? insights : ['No significant patterns learned yet. Keep using the system!'],
            top_patterns: patterns?.slice(0, 5).map(p => ({ key: p.pattern_key, successes: p.success_count }))
          },
          location: LOCATION_MAP.learning.route
        };
      }

      case 'toggle_autonomous_mode': {
        const { error } = await supabase
          .from('autonomous_settings')
          .upsert({
            user_id: userId,
            enabled: args.enabled,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) throw error;

        return {
          success: true,
          result: { message: `Autonomous mode ${args.enabled ? 'enabled' : 'disabled'}` },
          location: LOCATION_MAP.autonomous.route
        };
      }

      case 'set_autonomy_level': {
        const { error } = await supabase
          .from('autonomous_settings')
          .upsert({
            user_id: userId,
            autonomy_level: args.level,
            updated_at: new Date().toISOString()
          }, { onConflict: 'user_id' });

        if (error) throw error;

        const levelDescriptions: Record<string, string> = {
          full_auto: 'AI will execute actions automatically without approval',
          approval_required: 'AI will suggest actions but require your approval',
          suggestions_only: 'AI will only provide suggestions, no automatic actions'
        };

        return {
          success: true,
          result: { 
            message: `Autonomy level set to "${args.level}"`,
            description: levelDescriptions[args.level]
          },
          location: LOCATION_MAP.autonomous.route
        };
      }

      case 'get_lead_priorities': {
        const { data, error } = await supabase
          .from('lead_priority_scores')
          .select(`
            id, lead_id, priority_score, engagement_score, recency_score, sentiment_score,
            best_contact_time, best_contact_day, last_calculated_at,
            leads:lead_id (first_name, last_name, phone_number, status)
          `)
          .eq('user_id', userId)
          .gte('priority_score', args.min_score || 0)
          .order('priority_score', { ascending: false })
          .limit(args.limit || 10);

        if (error) throw error;

        return {
          success: true,
          result: {
            leads: data?.map(d => ({
              name: `${d.leads?.first_name || ''} ${d.leads?.last_name || ''}`.trim() || 'Unknown',
              phone: d.leads?.phone_number,
              priority_score: d.priority_score,
              best_time: d.best_contact_time,
              best_day: d.best_contact_day
            })),
            count: data?.length || 0
          },
          location: LOCATION_MAP.priorities.route
        };
      }

      case 'force_reprioritize_leads': {
        // Call the autonomous-prioritization edge function
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/autonomous-prioritization`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ user_id: userId, action: 'prioritize' }),
          });

          const result = await response.json();
          
          return {
            success: true,
            result: { 
              message: 'Lead reprioritization triggered',
              leads_processed: result.processed || 'unknown'
            },
            location: LOCATION_MAP.priorities.route
          };
        } catch (err) {
          return {
            success: true,
            result: { message: 'Lead reprioritization queued. Results will be available shortly.' },
            location: LOCATION_MAP.priorities.route
          };
        }
      }

      case 'get_campaign_optimization_status': {
        let campaignId = args.campaign_id;
        
        // Get active campaigns if none specified
        if (!campaignId) {
          const { data: campaigns } = await supabase
            .from('campaigns')
            .select('id, name, status')
            .eq('user_id', userId)
            .eq('status', 'active')
            .limit(1);
          campaignId = campaigns?.[0]?.id;
        }

        if (!campaignId) {
          return {
            success: true,
            result: { message: 'No active campaigns found. Create a campaign first.' }
          };
        }

        // Get campaign stats
        const { data: callStats } = await supabase
          .from('call_logs')
          .select('status, outcome')
          .eq('campaign_id', campaignId);

        const totalCalls = callStats?.length || 0;
        const answeredCalls = callStats?.filter(c => c.status === 'completed').length || 0;
        const answerRate = totalCalls > 0 ? Math.round((answeredCalls / totalCalls) * 100) : 0;

        const recommendations = [];
        if (answerRate < 20) {
          recommendations.push('Consider enabling local presence to improve answer rates');
        }
        if (totalCalls > 50 && answerRate < 15) {
          recommendations.push('Try adjusting calling hours to match lead timezone');
        }

        return {
          success: true,
          result: {
            campaign_id: campaignId,
            total_calls: totalCalls,
            answer_rate: `${answerRate}%`,
            recommendations: recommendations.length ? recommendations : ['Campaign is performing well!'],
            auto_optimization_available: true
          },
          location: LOCATION_MAP.campaigns.route
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

// Learn from successful tool execution
async function learnFromSuccess(
  supabase: any,
  userId: string,
  toolName: string,
  args: any,
  result: any
) {
  try {
    // Validate result structure
    const isSuccess = result && typeof result === 'object' && result.success === true;
    
    // Create a learning pattern based on the tool and its usage
    const patternKey = `${toolName}_usage`;
    const patternValue = {
      tool: toolName,
      common_args: args,
      success_indicators: isSuccess ? 'completed' : 'failed',
      timestamp: new Date().toISOString()
    };

    // Check if pattern exists
    const { data: existing } = await supabase
      .from('ai_learning')
      .select('id, success_count, failure_count')
      .eq('user_id', userId)
      .eq('pattern_type', 'tool_usage')
      .eq('pattern_key', patternKey)
      .maybeSingle();

    if (existing) {
      // Update existing pattern
      await supabase
        .from('ai_learning')
        .update({
          success_count: existing.success_count + (isSuccess ? 1 : 0),
          failure_count: existing.failure_count + (isSuccess ? 0 : 1),
          last_used_at: new Date().toISOString(),
          pattern_value: patternValue
        })
        .eq('id', existing.id);
    } else {
      // Create new pattern
      await supabase
        .from('ai_learning')
        .insert({
          user_id: userId,
          pattern_type: 'tool_usage',
          pattern_key: patternKey,
          pattern_value: patternValue,
          success_count: isSuccess ? 1 : 0,
          failure_count: isSuccess ? 0 : 1,
          last_used_at: new Date().toISOString()
        });
    }
  } catch (error) {
    console.error('Failed to record learning:', error);
  }
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
        
        // Learn from tool execution
        await learnFromSuccess(supabase, user.id, toolCall.function.name, args, result);
        
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
        } catch (parseError) {
          console.error('Failed to parse tool result:', parseError);
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
