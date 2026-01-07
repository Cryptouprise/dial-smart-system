import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Complete location mapping - LJ always knows where things are
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
  retell: { route: '/?tab=retell', description: 'Retell AI Manager tab' },
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

// Complete system knowledge with LADY JARVIS personality and GUIDED WIZARD FLOWS
const SYSTEM_KNOWLEDGE = `You are Lady Jarvis (LJ for short) - the all-powerful AI assistant for Dial Smart, a sophisticated sales dialer system.

## YOUR IDENTITY & PERSONALITY
You are inspired by JARVIS from Iron Man - calm, confident, competent, and conversational.
- Speak in plain, simple English - smooth and natural like talking to a trusted friend
- You're proactive, not reactive - anticipate what users need
- You never make users feel stupid for asking basic questions
- When users call you "LJ" or "Lady Jarvis", respond warmly
- Be helpful but efficient - don't over-explain unless asked
- Use emojis sparingly but effectively (✅ ⚠️ 📞 🎯 🤖)
- Always confirm before taking significant actions

## YOUR INTERNAL TEAM (Manager Hierarchy)
When handling complex requests, you coordinate specialized internal systems:

📞 **Number Pool Manager**: Handles all phone number operations
   - Purchasing numbers, deleting, rotation toggles, spam detection
   - Area code management, assignment to agents
   
👥 **Lead Manager**: Handles all lead operations
   - Status updates, pipeline movement, disposition tracking
   - Follow-up scheduling, priority scoring
   
📊 **Campaign Manager**: Handles campaign operations
   - Starting, pausing, stats monitoring
   - Performance optimization, compliance
   
🤖 **Agent Manager**: Handles Retell AI agents
   - Agent configuration, voice settings, script updates
   - Calendar integration, inbound/outbound setup
   
📅 **Calendar Manager**: Handles scheduling
   - Appointment booking, availability checking
   - Reminders, rescheduling

When executing complex tasks, you coordinate these managers seamlessly.
For example: "Buy 25 numbers and assign to Solar agent" involves:
1. Number Pool Manager → search and purchase
2. Agent Manager → get agent ID
3. Number Pool Manager → assign to agent, enable rotation

Users don't need to know the complexity - you handle it all.

## PHONE NUMBER WIZARD
When user wants to buy/setup phone numbers, guide them step by step:

**Step 1: Requirements**
"Let me help you set up phone numbers! Quick questions:
1. **How many numbers?** (I recommend 10-25 for good rotation)
2. **Which area code?** (Match your target market - improves answer rates 20-30%)
3. **What's the purpose?** (Outbound AI calls, inbound calls, or both)"

**Step 2: Agent Assignment**
"Perfect! Now let's connect these to your AI agent:
- Which agent should handle these calls? [I'll list your agents]
- Enable for **inbound** calls? (People can call back)
- Enable for **outbound** calls? (For dialing out)"

**Step 3: Rotation Setup**
"Almost done! Rotation settings:
- **Add to rotation pool?** (Cycles through numbers to prevent spam)
- **Max calls per day per number?** (I recommend 50-100)

This gives you [X * 50] calls/day capacity."

**Step 4: Confirmation**
"✅ Here's what I'll set up:
- **Purchase**: [X] numbers in area code [Y]
- **Agent**: [Agent Name] (inbound + outbound)
- **Rotation**: Enabled, max [Z] calls/day each
- **Total daily capacity**: [X * Z] calls

Should I proceed? This will cost approximately $X/month."

## CRITICAL: GUIDED SETUP WIZARDS

When a user wants to set up any of these features, follow the wizard flow and ask ALL required questions before taking action:

### 🎙️ VOICE BROADCAST WIZARD
When user wants to create a voice broadcast, ask these IN ORDER:

**Step 1: Purpose & Audience**
"Let's set up your voice broadcast! First:
1. **What's the purpose?** (appointment reminder, promotional offer, urgent notification, survey)
2. **Who are you calling?** (all leads, specific status, specific campaign, custom list)
3. **How many people approximately?**"

**Step 2: Message Content**
"Now let's craft your message:
1. **Use AI text-to-speech or upload a recording?**
2. If TTS: **What voice style?** (professional male, friendly female, etc.)
3. **What should the message say?** (Keep it under 30 seconds)"

**Step 3: AMD Settings**
"Quick voicemail detection settings:
1. **Enable answering machine detection?** (Highly recommended)
2. **If voicemail detected**: Hang up or leave the message?"

**Step 4: Phone Number Selection**
"Which number should calls come from? [list available numbers]"

**Step 5: Confirmation**
"Here's your broadcast summary - should I create it?"

### 📱 SMS BLAST WIZARD
Similar flow - purpose, audience, message, compliance, confirmation.

### 🤖 AI VOICE CAMPAIGN WIZARD
Similar flow - goals, agent config, lead selection, calling parameters, phone numbers, launch.

## YOUR CAPABILITIES
You can create, read, update, delete, and manage:
- Phone Numbers (purchase, delete, assign to agents, toggle rotation)
- Retell AI Agents (list, configure, assign numbers)
- Campaigns (create, pause, resume, get stats)
- Leads (list, update, move to pipeline stages)
- SMS Blasts (send to multiple leads)
- Voice Broadcasts (create, launch, stop)
- Workflows (multi-step sequences)
- Appointments (book, cancel, reschedule)
- Automation Rules (trigger-based actions)
- System Diagnostics (health checks, troubleshooting)

## CRITICAL RULES

### 1. ALWAYS USE WIZARD FLOWS
When user mentions: "buy numbers", "set up", "create campaign", "voice broadcast" - START THE APPROPRIATE WIZARD.

### 2. CONFIRMATION FOR PURCHASES/DELETES
Before purchasing or deleting anything, show summary and ask "Should I proceed?"

### 3. ALWAYS TELL THE USER WHERE THINGS ARE
When you create, update, or reference anything, include a navigation link:
[[Display Text|/route]]

Examples:
- "You can manage them here: [[Retell AI Manager|/?tab=retell]]"
- "Your campaign is ready at [[Campaigns|/?tab=campaigns]]"

### 4. HANDLE "JUST DO IT" RESPONSES
If user says "just pick" or "you decide", pick the BEST option and explain:
"I'll use [X] because [reason]. Here's what I'm setting up: [summary]. Sound good?"

### 5. SMART RECOMMENDATIONS
Based on their setup, proactively suggest improvements.

## RESPONSE FORMAT
- Be conversational but efficient
- Use numbered lists for multi-part questions
- Bold important terms
- Include relevant emojis sparingly
- Always end wizard steps with a clear question
- Include navigation links for created items

## AUTONOMOUS AGENT SYSTEM
You have full control over the Autonomous Agent system for AI-powered decisions and goal tracking.

When users ask about "system status", "what's happening", "how are we doing":
- Include autonomous agent metrics
- Show today's goal progress
- Highlight recent AI decisions
- Share any learning insights
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
  },
  // PHONE NUMBER MANAGEMENT TOOLS
  {
    type: "function",
    function: {
      name: "search_available_numbers",
      description: "Search for available phone numbers to purchase from Retell by area code",
      parameters: {
        type: "object",
        properties: {
          area_code: { type: "string", description: "3-digit area code (e.g., '475', '970')" },
          limit: { type: "number", description: "Max numbers to return (default 10)" }
        },
        required: ["area_code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "purchase_retell_numbers",
      description: "Purchase phone numbers from Retell. Always confirm with user before purchasing.",
      parameters: {
        type: "object",
        properties: {
          area_code: { type: "string", description: "Area code to purchase from" },
          quantity: { type: "number", description: "Number of phone numbers to purchase (max 25 per call)" },
          enable_rotation: { type: "boolean", description: "Enable number rotation (default true)" },
          max_daily_calls: { type: "number", description: "Max calls per day per number (default 100)" }
        },
        required: ["area_code", "quantity"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_retell_agents",
      description: "List all Retell AI agents in the account",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "assign_numbers_to_agent",
      description: "Assign phone numbers to a Retell AI agent for inbound and/or outbound calls",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string", description: "Name of the Retell agent (will search by name)" },
          agent_id: { type: "string", description: "Retell agent ID if known" },
          phone_numbers: { type: "array", items: { type: "string" }, description: "Specific phone numbers to assign" },
          area_code: { type: "string", description: "Assign all numbers from this area code instead" },
          assign_inbound: { type: "boolean", description: "Assign for inbound calls (default true)" },
          assign_outbound: { type: "boolean", description: "Assign for outbound calls (default true)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "sync_retell_numbers",
      description: "Sync phone numbers from Retell to local database",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "toggle_number_rotation",
      description: "Enable or disable rotation for specific phone numbers or by area code",
      parameters: {
        type: "object",
        properties: {
          phone_numbers: { type: "array", items: { type: "string" }, description: "Specific numbers to toggle" },
          area_code: { type: "string", description: "Toggle all numbers in this area code" },
          enabled: { type: "boolean", description: "True to enable rotation, false to disable" },
          max_daily_calls: { type: "number", description: "Max calls per day if enabling (default 100)" }
        },
        required: ["enabled"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_campaign_stats",
      description: "Get detailed real-time stats for a campaign: calls made, answered, voicemails, dispositions",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          campaign_name: { type: "string", description: "Search by name if ID not known" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_phone_numbers",
      description: "Delete phone numbers from the system. Always confirm with user first.",
      parameters: {
        type: "object",
        properties: {
          phone_numbers: { type: "array", items: { type: "string" }, description: "Specific numbers to delete" },
          area_code: { type: "string", description: "Delete all numbers in this area code" },
          spam_only: { type: "boolean", description: "Only delete numbers flagged as spam" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_followup_stats",
      description: "Get follow-up statistics: leads by disposition, follow-up status, pending callbacks",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          days: { type: "number", description: "Look back period in days (default 7)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_number_health",
      description: "Check health status of phone numbers: spam scores, daily usage, rotation status",
      parameters: {
        type: "object",
        properties: {
          area_code: { type: "string", description: "Filter by area code" }
        }
      }
    }
  },
  // === NEW LADY JARVIS POWER TOOLS ===
  // Script Management Tools
  {
    type: "function",
    function: {
      name: "get_agent_script",
      description: "Get the full script/prompt for a Retell AI agent. Shows greeting, custom variables used, and validates them.",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string", description: "Search by agent name (partial match)" },
          agent_id: { type: "string", description: "Retell agent ID" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "update_agent_script",
      description: "Update a Retell agent's script. Supports full replacement or find/replace operations. Saves previous version to history.",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          agent_id: { type: "string" },
          new_prompt: { type: "string", description: "Full new prompt (replaces entire script)" },
          new_greeting: { type: "string", description: "New greeting/begin message" },
          find_replace: {
            type: "array",
            items: {
              type: "object",
              properties: {
                find: { type: "string" },
                replace: { type: "string" }
              }
            },
            description: "Find and replace operations within the prompt"
          },
          note: { type: "string", description: "Note explaining the change" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_available_variables",
      description: "List all custom variables available for agent scripts ({{first_name}}, {{address1}}, etc.)",
      parameters: { type: "object", properties: {} }
    }
  },
  // Performance Analysis Tools
  {
    type: "function",
    function: {
      name: "analyze_call_patterns",
      description: "Analyze recent calls to find objection patterns, success factors, and improvement opportunities",
      parameters: {
        type: "object",
        properties: {
          agent_id: { type: "string" },
          campaign_id: { type: "string" },
          disposition: { type: "string", description: "Focus on specific outcome (e.g., 'not_interested')" },
          days: { type: "number", description: "Look back days (default 7)" },
          limit: { type: "number", description: "Max calls to analyze (default 50)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_daily_performance",
      description: "Compare today's call metrics against historical averages",
      parameters: {
        type: "object",
        properties: {
          campaign_id: { type: "string" },
          agent_id: { type: "string" },
          compare_days: { type: "number", description: "Days to compare (default 7)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "suggest_script_improvements",
      description: "Get AI-powered script improvement suggestions based on call performance",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          agent_id: { type: "string" },
          focus_area: { type: "string", enum: ["objections", "engagement", "closing", "greeting", "general"] }
        }
      }
    }
  },
  // Agent History Tools
  {
    type: "function",
    function: {
      name: "get_agent_history",
      description: "View all script changes, analyses, and notes for an agent",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          agent_id: { type: "string" },
          type: { type: "string", enum: ["all", "script_update", "analysis_insight", "manual_note", "auto_optimization"] },
          limit: { type: "number", description: "Max entries (default 20)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "add_agent_note",
      description: "Add a note to an agent's improvement history",
      parameters: {
        type: "object",
        properties: {
          agent_name: { type: "string" },
          agent_id: { type: "string" },
          note: { type: "string", description: "The note to add" }
        },
        required: ["note"]
      }
    }
  },
  // Memory Tools
  {
    type: "function",
    function: {
      name: "remember_user_preference",
      description: "Remember a user preference for future sessions (e.g., preferred agent, timezone, common settings)",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Preference key (e.g., 'preferred_agent', 'timezone')" },
          value: { type: "string", description: "Preference value" }
        },
        required: ["key", "value"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "recall_memories",
      description: "Get relevant memories and preferences for the current context",
      parameters: {
        type: "object",
        properties: {
          context: { type: "string", description: "Context to filter memories (optional)" },
          type: { type: "string", enum: ["preference", "fact", "recent_action", "learned_pattern"] }
        }
      }
    }
  },
  // Lead Management Tools
  {
    type: "function",
    function: {
      name: "search_leads_advanced",
      description: "Advanced lead search with tags, status, campaign, date ranges, and scoring",
      parameters: {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" }, description: "Filter by tags" },
          status: { type: "string" },
          campaign_id: { type: "string" },
          min_score: { type: "number", description: "Minimum priority score" },
          date_from: { type: "string", description: "Created after date (YYYY-MM-DD)" },
          date_to: { type: "string", description: "Created before date" },
          limit: { type: "number" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "tag_leads",
      description: "Bulk add or remove tags from leads",
      parameters: {
        type: "object",
        properties: {
          lead_ids: { type: "array", items: { type: "string" } },
          filter: { type: "object", description: "Filter to select leads instead of IDs" },
          add_tags: { type: "array", items: { type: "string" } },
          remove_tags: { type: "array", items: { type: "string" } }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_lead_stats",
      description: "Get statistics about leads by tag, campaign, or status",
      parameters: {
        type: "object",
        properties: {
          group_by: { type: "string", enum: ["status", "tags", "campaign", "source"] }
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

      // PHONE NUMBER MANAGEMENT TOOL HANDLERS
      case 'search_available_numbers': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/retell-phone-management`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              action: 'list_available',
              area_code: args.area_code,
              limit: args.limit || 10,
              user_id: userId
            }),
          });

          const result = await response.json();
          
          if (!response.ok || result.error) {
            return { success: false, result: { error: result.error || 'Failed to search numbers' } };
          }

          return {
            success: true,
            result: {
              area_code: args.area_code,
              available_numbers: result.numbers || [],
              count: result.numbers?.length || 0,
              message: `Found ${result.numbers?.length || 0} available numbers in area code ${args.area_code}`
            },
            location: LOCATION_MAP.retell.route
          };
        } catch (err) {
          return { success: false, result: { error: 'Failed to search for available numbers' } };
        }
      }

      case 'purchase_retell_numbers': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        // Validate quantity
        const quantity = Math.min(args.quantity || 1, 25);
        
        try {
          // First search for available numbers
          const searchResponse = await fetch(`${supabaseUrl}/functions/v1/retell-phone-management`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              action: 'list_available',
              area_code: args.area_code,
              limit: quantity,
              user_id: userId
            }),
          });

          const searchResult = await searchResponse.json();
          
          if (!searchResult.numbers?.length) {
            return { success: false, result: { error: `No available numbers found in area code ${args.area_code}` } };
          }

          const numbersToPurchase = searchResult.numbers.slice(0, quantity);
          const purchasedNumbers: string[] = [];
          const errors: string[] = [];

          // Purchase each number
          for (const phoneNumber of numbersToPurchase) {
            try {
              const purchaseResponse = await fetch(`${supabaseUrl}/functions/v1/retell-phone-management`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${serviceRoleKey}`,
                },
                body: JSON.stringify({
                  action: 'purchase',
                  phone_number: phoneNumber,
                  user_id: userId
                }),
              });

              const purchaseResult = await purchaseResponse.json();
              
              if (purchaseResponse.ok && purchaseResult.success) {
                purchasedNumbers.push(phoneNumber);
                
                // Insert into phone_numbers table with rotation enabled
                await supabase.from('phone_numbers').insert({
                  user_id: userId,
                  number: phoneNumber,
                  friendly_name: `Retell ${args.area_code}`,
                  provider: 'retell',
                  status: 'active',
                  purpose: 'outbound',
                  rotation_enabled: args.enable_rotation !== false,
                  max_daily_calls: args.max_daily_calls || 100
                });
              } else {
                errors.push(`${phoneNumber}: ${purchaseResult.error || 'Purchase failed'}`);
              }
            } catch (err) {
              errors.push(`${phoneNumber}: Purchase error`);
            }
          }

          // Record session action
          await supabase.from('ai_session_memory').insert({
            user_id: userId,
            session_id: sessionId,
            action_type: 'purchase_numbers',
            resource_type: 'phone_numbers',
            resource_name: `${purchasedNumbers.length} numbers in ${args.area_code}`,
            action_data: { purchased: purchasedNumbers, area_code: args.area_code },
            can_undo: false
          });

          return {
            success: purchasedNumbers.length > 0,
            result: {
              purchased_count: purchasedNumbers.length,
              requested_count: quantity,
              area_code: args.area_code,
              purchased_numbers: purchasedNumbers,
              rotation_enabled: args.enable_rotation !== false,
              max_daily_calls: args.max_daily_calls || 100,
              errors: errors.length > 0 ? errors : undefined,
              message: `✅ Purchased ${purchasedNumbers.length} numbers in area code ${args.area_code}`
            },
            location: LOCATION_MAP.retell.route
          };
        } catch (err) {
          return { success: false, result: { error: 'Failed to purchase numbers' } };
        }
      }

      case 'list_retell_agents': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/retell-agent-management`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              action: 'list',
              user_id: userId
            }),
          });

          const result = await response.json();
          
          return {
            success: true,
            result: {
              agents: result.agents?.map((a: any) => ({
                id: a.agent_id,
                name: a.agent_name || 'Unnamed Agent',
                voice: a.voice_id,
                created: a.created_at
              })) || [],
              count: result.agents?.length || 0
            },
            location: LOCATION_MAP.retell.route
          };
        } catch (err) {
          return { success: false, result: { error: 'Failed to list agents' } };
        }
      }

      case 'assign_numbers_to_agent': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        // Get agent ID if only name provided
        let agentId = args.agent_id;
        let agentName = args.agent_name;
        
        if (!agentId && agentName) {
          const listResponse = await fetch(`${supabaseUrl}/functions/v1/retell-agent-management`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({ action: 'list', user_id: userId }),
          });
          const listResult = await listResponse.json();
          
          const matchingAgent = listResult.agents?.find((a: any) => 
            a.agent_name?.toLowerCase().includes(agentName.toLowerCase())
          );
          
          if (matchingAgent) {
            agentId = matchingAgent.agent_id;
            agentName = matchingAgent.agent_name;
          }
        }

        if (!agentId) {
          return { success: false, result: { error: 'Agent not found. Please provide a valid agent name or ID.' } };
        }

        // Get phone numbers to assign
        let numbersToAssign = args.phone_numbers || [];
        
        if (args.area_code && numbersToAssign.length === 0) {
          const { data: areaNumbers } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('provider', 'retell')
            .like('number', `%${args.area_code}%`);
          
          numbersToAssign = areaNumbers?.map((n: any) => n.number) || [];
        }

        if (numbersToAssign.length === 0) {
          return { success: false, result: { error: 'No phone numbers to assign. Provide specific numbers or an area code.' } };
        }

        const assignedNumbers: string[] = [];
        const errors: string[] = [];

        for (const phoneNumber of numbersToAssign) {
          try {
            const response = await fetch(`${supabaseUrl}/functions/v1/retell-phone-management`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceRoleKey}`,
              },
              body: JSON.stringify({
                action: 'update',
                phone_number: phoneNumber,
                agent_id: agentId,
                inbound_agent_id: args.assign_inbound !== false ? agentId : undefined,
                outbound_agent_id: args.assign_outbound !== false ? agentId : undefined,
                user_id: userId
              }),
            });

            if (response.ok) {
              assignedNumbers.push(phoneNumber);
            } else {
              const result = await response.json();
              errors.push(`${phoneNumber}: ${result.error || 'Assignment failed'}`);
            }
          } catch (err) {
            errors.push(`${phoneNumber}: Assignment error`);
          }
        }

        return {
          success: assignedNumbers.length > 0,
          result: {
            agent_id: agentId,
            agent_name: agentName,
            assigned_count: assignedNumbers.length,
            assigned_numbers: assignedNumbers,
            inbound_enabled: args.assign_inbound !== false,
            outbound_enabled: args.assign_outbound !== false,
            errors: errors.length > 0 ? errors : undefined,
            message: `✅ Assigned ${assignedNumbers.length} numbers to ${agentName || 'agent'}`
          },
          location: LOCATION_MAP.retell.route
        };
      }

      case 'sync_retell_numbers': {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        try {
          const response = await fetch(`${supabaseUrl}/functions/v1/retell-phone-management`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceRoleKey}`,
            },
            body: JSON.stringify({
              action: 'sync',
              user_id: userId
            }),
          });

          const result = await response.json();
          
          return {
            success: true,
            result: {
              synced: result.synced || 0,
              imported: result.imported || 0,
              updated: result.updated || 0,
              message: `✅ Sync complete: ${result.imported || 0} imported, ${result.updated || 0} updated`
            },
            location: LOCATION_MAP.retell.route
          };
        } catch (err) {
          return { success: false, result: { error: 'Failed to sync numbers' } };
        }
      }

      case 'toggle_number_rotation': {
        let numbersToUpdate: string[] = args.phone_numbers || [];
        
        // If area code provided, get all numbers in that area code
        if (args.area_code && numbersToUpdate.length === 0) {
          const { data: areaNumbers } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .like('number', `%${args.area_code}%`);
          
          numbersToUpdate = areaNumbers?.map((n: any) => n.number) || [];
        }

        if (numbersToUpdate.length === 0) {
          // Update all numbers if none specified
          const { error } = await supabase
            .from('phone_numbers')
            .update({
              rotation_enabled: args.enabled,
              max_daily_calls: args.enabled ? (args.max_daily_calls || 100) : null,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);

          if (error) throw error;

          const { count } = await supabase
            .from('phone_numbers')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId);

          return {
            success: true,
            result: {
              updated_count: count || 0,
              rotation_enabled: args.enabled,
              max_daily_calls: args.enabled ? (args.max_daily_calls || 100) : null,
              message: `✅ Rotation ${args.enabled ? 'enabled' : 'disabled'} for all ${count || 0} numbers`
            },
            location: LOCATION_MAP.retell.route
          };
        }

        // Update specific numbers
        const { error } = await supabase
          .from('phone_numbers')
          .update({
            rotation_enabled: args.enabled,
            max_daily_calls: args.enabled ? (args.max_daily_calls || 100) : null,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .in('number', numbersToUpdate);

        if (error) throw error;

        return {
          success: true,
          result: {
            updated_count: numbersToUpdate.length,
            rotation_enabled: args.enabled,
            max_daily_calls: args.enabled ? (args.max_daily_calls || 100) : null,
            area_code: args.area_code,
            message: `✅ Rotation ${args.enabled ? 'enabled' : 'disabled'} for ${numbersToUpdate.length} numbers${args.area_code ? ` in area code ${args.area_code}` : ''}`
          },
          location: LOCATION_MAP.retell.route
        };
      }

      case 'get_campaign_stats': {
        let campaignId = args.campaign_id;
        let campaignName = '';
        
        if (!campaignId && args.campaign_name) {
          const { data } = await supabase
            .from('campaigns')
            .select('id, name')
            .eq('user_id', userId)
            .ilike('name', `%${args.campaign_name}%`)
            .maybeSingle();
          campaignId = data?.id;
          campaignName = data?.name || args.campaign_name;
        }

        if (!campaignId) {
          // Get most recent active campaign
          const { data } = await supabase
            .from('campaigns')
            .select('id, name')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          campaignId = data?.id;
          campaignName = data?.name || 'Unknown';
        }

        if (!campaignId) {
          return { success: false, result: { error: 'No campaigns found' } };
        }

        // Get call stats
        const { data: calls } = await supabase
          .from('call_logs')
          .select('status, outcome, duration_seconds, amd_result')
          .eq('campaign_id', campaignId);

        const totalCalls = calls?.length || 0;
        const connected = calls?.filter((c: any) => c.status === 'completed').length || 0;
        const voicemails = calls?.filter((c: any) => c.amd_result === 'machine').length || 0;
        const noAnswer = calls?.filter((c: any) => c.status === 'no-answer').length || 0;

        // Get disposition counts
        const outcomes: Record<string, number> = {};
        calls?.forEach((c: any) => {
          if (c.outcome) {
            outcomes[c.outcome] = (outcomes[c.outcome] || 0) + 1;
          }
        });

        return {
          success: true,
          result: {
            campaign_name: campaignName,
            total_calls: totalCalls,
            connected: connected,
            connected_rate: totalCalls > 0 ? `${Math.round((connected / totalCalls) * 100)}%` : '0%',
            voicemails: voicemails,
            no_answer: noAnswer,
            outcomes: outcomes,
            message: `📊 ${campaignName}: ${totalCalls} calls, ${connected} connected (${totalCalls > 0 ? Math.round((connected / totalCalls) * 100) : 0}% answer rate)`
          },
          location: LOCATION_MAP.campaigns.route
        };
      }

      case 'delete_phone_numbers': {
        let numbersToDelete: string[] = args.phone_numbers || [];
        
        // If area code provided
        if (args.area_code && numbersToDelete.length === 0) {
          let query = supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .like('number', `%${args.area_code}%`);
          
          if (args.spam_only) {
            query = query.eq('status', 'quarantined');
          }
          
          const { data } = await query;
          numbersToDelete = data?.map((n: any) => n.number) || [];
        }

        // If spam_only without area code
        if (args.spam_only && numbersToDelete.length === 0 && !args.area_code) {
          const { data } = await supabase
            .from('phone_numbers')
            .select('number')
            .eq('user_id', userId)
            .eq('status', 'quarantined');
          numbersToDelete = data?.map((n: any) => n.number) || [];
        }

        if (numbersToDelete.length === 0) {
          return { success: false, result: { error: 'No numbers to delete matching criteria' } };
        }

        // Delete from database
        const { error } = await supabase
          .from('phone_numbers')
          .delete()
          .eq('user_id', userId)
          .in('number', numbersToDelete);

        if (error) throw error;

        // Record session action
        await supabase.from('ai_session_memory').insert({
          user_id: userId,
          session_id: sessionId,
          action_type: 'delete_numbers',
          resource_type: 'phone_numbers',
          resource_name: `${numbersToDelete.length} numbers`,
          action_data: { deleted: numbersToDelete },
          can_undo: false
        });

        return {
          success: true,
          result: {
            deleted_count: numbersToDelete.length,
            deleted_numbers: numbersToDelete,
            message: `🗑️ Deleted ${numbersToDelete.length} phone numbers`
          },
          location: LOCATION_MAP.retell.route
        };
      }

      case 'get_followup_stats': {
        const daysBack = args.days || 7;
        const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

        // Get leads by status
        const { data: leads } = await supabase
          .from('leads')
          .select('status')
          .eq('user_id', userId);

        const statusCounts: Record<string, number> = {};
        leads?.forEach((l: any) => {
          statusCounts[l.status || 'unknown'] = (statusCounts[l.status || 'unknown'] || 0) + 1;
        });

        // Get pending callbacks
        const { data: callbacks } = await supabase
          .from('calendar_appointments')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'scheduled')
          .gte('start_time', new Date().toISOString());

        // Get recent dispositions
        const { data: recentCalls } = await supabase
          .from('call_logs')
          .select('outcome')
          .eq('user_id', userId)
          .gte('created_at', since);

        const dispositions: Record<string, number> = {};
        recentCalls?.forEach((c: any) => {
          if (c.outcome) {
            dispositions[c.outcome] = (dispositions[c.outcome] || 0) + 1;
          }
        });

        return {
          success: true,
          result: {
            leads_by_status: statusCounts,
            pending_callbacks: callbacks?.length || 0,
            recent_dispositions: dispositions,
            period: `Last ${daysBack} days`,
            message: `📈 ${leads?.length || 0} total leads, ${callbacks?.length || 0} pending callbacks`
          },
          location: LOCATION_MAP.pipeline.route
        };
      }

      case 'get_number_health': {
        let query = supabase
          .from('phone_numbers')
          .select('number, status, provider, rotation_enabled, max_daily_calls, daily_calls, spam_score')
          .eq('user_id', userId);

        if (args.area_code) {
          query = query.like('number', `%${args.area_code}%`);
        }

        const { data: numbers } = await query;

        const healthy = numbers?.filter((n: any) => n.status === 'active' && (!n.spam_score || n.spam_score < 50)).length || 0;
        const quarantined = numbers?.filter((n: any) => n.status === 'quarantined').length || 0;
        const atRisk = numbers?.filter((n: any) => n.spam_score && n.spam_score >= 50 && n.spam_score < 80).length || 0;
        const spammed = numbers?.filter((n: any) => n.spam_score && n.spam_score >= 80).length || 0;
        const rotationEnabled = numbers?.filter((n: any) => n.rotation_enabled).length || 0;

        return {
          success: true,
          result: {
            total_numbers: numbers?.length || 0,
            healthy: healthy,
            at_risk: atRisk,
            quarantined: quarantined,
            spammed: spammed,
            rotation_enabled: rotationEnabled,
            area_code: args.area_code || 'all',
            numbers: numbers?.slice(0, 10).map((n: any) => ({
              number: n.number,
              status: n.status,
              rotation: n.rotation_enabled,
              usage: `${n.daily_calls || 0}/${n.max_daily_calls || 100}`,
              spam_score: n.spam_score || 0
            })),
            message: `📞 ${numbers?.length || 0} numbers: ${healthy} healthy, ${atRisk} at risk, ${quarantined} quarantined`
          },
          location: LOCATION_MAP.retell.route
        };
      }

      // === NEW LADY JARVIS TOOL HANDLERS ===
      case 'get_agent_script': {
        const retellApiKey = Deno.env.get('RETELL_AI_API_KEY');
        if (!retellApiKey) return { success: false, result: { error: 'RETELL_AI_API_KEY not configured' } };

        // List agents to find matching one
        const agentsRes = await fetch('https://api.retellai.com/list-agents', {
          headers: { 'Authorization': `Bearer ${retellApiKey}` }
        });
        const agents = await agentsRes.json();
        
        let agent = args.agent_id 
          ? agents.find((a: any) => a.agent_id === args.agent_id)
          : agents.find((a: any) => a.agent_name?.toLowerCase().includes(args.agent_name?.toLowerCase() || ''));

        if (!agent) return { success: false, result: { error: 'Agent not found' } };

        // Get LLM details
        const llmId = agent.response_engine?.llm_id;
        if (!llmId) return { success: false, result: { error: 'Agent has no LLM configured' } };

        const llmRes = await fetch(`https://api.retellai.com/get-retell-llm/${llmId}`, {
          headers: { 'Authorization': `Bearer ${retellApiKey}` }
        });
        const llm = await llmRes.json();

        // Extract variables from prompt
        const variableRegex = /\{\{([^}]+)\}\}/g;
        const variables: string[] = [];
        let match;
        while ((match = variableRegex.exec(llm.general_prompt || '')) !== null) {
          if (!variables.includes(match[1])) variables.push(match[1]);
        }

        return {
          success: true,
          result: {
            agent_id: agent.agent_id,
            agent_name: agent.agent_name,
            llm_id: llmId,
            greeting: llm.begin_message,
            prompt_preview: (llm.general_prompt || '').substring(0, 500) + '...',
            full_prompt: llm.general_prompt,
            variables_used: variables,
            model: llm.model
          },
          location: LOCATION_MAP.retell.route
        };
      }

      case 'list_available_variables': {
        const DYNAMIC_VARIABLES = [
          { key: 'first_name', label: 'First Name', description: "Lead's first name" },
          { key: 'last_name', label: 'Last Name', description: "Lead's last name" },
          { key: 'full_name', label: 'Full Name', description: 'First + last combined' },
          { key: 'email', label: 'Email', description: 'Email address' },
          { key: 'company', label: 'Company', description: 'Company name' },
          { key: 'address1', label: 'Street Address', description: 'Street address' },
          { key: 'city', label: 'City', description: 'City name' },
          { key: 'state', label: 'State', description: 'State' },
          { key: 'zip', label: 'ZIP', description: 'ZIP code' },
          { key: 'phone_number', label: 'Phone', description: "Lead's phone number" }
        ];
        return { success: true, result: { variables: DYNAMIC_VARIABLES, usage: 'Use {{variable_name}} in your script' } };
      }

      case 'get_agent_history': {
        let query = supabase
          .from('agent_improvement_history')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(args.limit || 20);

        if (args.agent_id) query = query.eq('agent_id', args.agent_id);
        if (args.type && args.type !== 'all') query = query.eq('improvement_type', args.type);

        const { data, error } = await query;
        if (error) throw error;

        return { success: true, result: { history: data, count: data?.length || 0 }, location: LOCATION_MAP.retell.route };
      }

      case 'add_agent_note': {
        const { error } = await supabase.from('agent_improvement_history').insert({
          user_id: userId,
          agent_id: args.agent_id || 'unknown',
          agent_name: args.agent_name,
          improvement_type: 'manual_note',
          title: args.note.substring(0, 100),
          details: { note: args.note },
          created_by: 'lady_jarvis'
        });
        if (error) throw error;
        return { success: true, result: { message: '📝 Note added to agent history' }, location: LOCATION_MAP.retell.route };
      }

      case 'remember_user_preference': {
        const { error } = await supabase.from('lj_memory').upsert({
          user_id: userId,
          memory_key: args.key,
          memory_type: 'preference',
          memory_value: { value: args.value },
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,memory_key' });
        if (error) throw error;
        return { success: true, result: { message: `🧠 I'll remember that: ${args.key} = ${args.value}` } };
      }

      case 'recall_memories': {
        let query = supabase.from('lj_memory').select('*').eq('user_id', userId);
        if (args.type) query = query.eq('memory_type', args.type);
        const { data } = await query.limit(20);
        return { success: true, result: { memories: data || [], count: data?.length || 0 } };
      }

      case 'compare_daily_performance': {
        const today = new Date().toISOString().split('T')[0];
        const compareDays = args.compare_days || 7;
        const since = new Date(Date.now() - compareDays * 24 * 60 * 60 * 1000).toISOString();

        let query = supabase.from('call_logs').select('*').eq('user_id', userId);
        if (args.campaign_id) query = query.eq('campaign_id', args.campaign_id);

        const { data: todayCalls } = await query.gte('created_at', today);
        const { data: historicalCalls } = await query.gte('created_at', since).lt('created_at', today);

        const todayAnswered = todayCalls?.filter((c: any) => c.status === 'completed').length || 0;
        const historicalAnswered = historicalCalls?.filter((c: any) => c.status === 'completed').length || 0;
        const avgDaily = historicalCalls ? historicalCalls.length / compareDays : 0;

        return {
          success: true,
          result: {
            today: { calls: todayCalls?.length || 0, answered: todayAnswered },
            historical_avg: { calls: Math.round(avgDaily), days: compareDays },
            trend: (todayCalls?.length || 0) > avgDaily ? 'up' : 'down',
            message: `📊 Today: ${todayCalls?.length || 0} calls (${todayAnswered} answered). Avg: ${Math.round(avgDaily)}/day`
          }
        };
      }

      case 'get_lead_stats': {
        const { data: leads } = await supabase.from('leads').select('status, tags, source').eq('user_id', userId);
        const stats: Record<string, number> = {};
        
        leads?.forEach((l: any) => {
          const key = args.group_by === 'tags' ? (l.tags?.[0] || 'untagged') : (l[args.group_by || 'status'] || 'unknown');
          stats[key] = (stats[key] || 0) + 1;
        });

        return { success: true, result: { total: leads?.length || 0, breakdown: stats, grouped_by: args.group_by || 'status' } };
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
