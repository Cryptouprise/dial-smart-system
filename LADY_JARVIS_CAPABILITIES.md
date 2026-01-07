# Lady Jarvis (LJ) - Complete Capabilities Guide

*Last Updated: January 2026*

## Overview

Lady Jarvis is the all-powerful AI assistant for Dial Smart. Inspired by JARVIS from Iron Man - calm, confident, competent, and conversational. She manages all aspects of your sales dialer system.

## Identity & Personality

- **Name**: Lady Jarvis (LJ for short)
- **Style**: Speaks in plain, simple English - smooth and natural
- **Approach**: Proactive, not reactive - anticipates what users need
- **Interaction**: Never makes users feel stupid for asking basic questions
- **Communication**: Uses emojis sparingly but effectively (✅ ⚠️ 📞 🎯 🤖)

## Voice Chat Feature

LJ supports voice interaction:
- Click the microphone icon to speak to LJ
- She responds with synthesized speech
- Shows "Contacting Manager..." when processing complex requests
- Uses ElevenLabs for high-quality voice synthesis

## Complete Tool Reference

### Script & Agent Management

| Tool | Description |
|------|-------------|
| `get_agent_script` | Retrieve any Retell AI agent's full script/prompt |
| `update_agent_script` | Update agent scripts (full replacement OR find/replace) |
| `list_available_variables` | Show all {{variables}} available for personalization |
| `suggest_script_improvements` | Generate AI-powered script improvement suggestions |

### Snippet Management

| Tool | Description |
|------|-------------|
| `get_prompt_snippets` | List all available prompt snippets (callback, voicemail, disposition) |
| `check_agent_snippets` | See which snippets are already in an agent's prompt |
| `add_snippet_to_agent` | Insert a specific snippet into an agent's prompt |

### Agent History & Notes

| Tool | Description |
|------|-------------|
| `get_agent_history` | View all script changes and notes for an agent |
| `add_agent_note` | Add notes to track optimization experiments |

### Call Analysis

| Tool | Description |
|------|-------------|
| `analyze_call_patterns` | Analyze recent calls for objection patterns and outcomes |
| `compare_daily_performance` | Compare today's performance vs historical averages |
| `suggest_script_improvements` | Generate AI-powered script improvement suggestions |

### Memory & Learning

| Tool | Description |
|------|-------------|
| `remember_user_preference` | Remember user preferences for future sessions |
| `recall_memories` | Retrieve saved preferences and learned patterns |
| `compare_daily_performance` | Compare today vs historical averages |

### Campaign Management

| Tool | Description |
|------|-------------|
| `create_campaign` | Create a new calling campaign |
| `list_campaigns` | List all campaigns |
| `update_campaign` | Update campaign settings |
| `pause_campaign` | Pause an active campaign |
| `resume_campaign` | Resume a paused campaign |

### Lead Management

| Tool | Description |
|------|-------------|
| `list_leads` | List leads with optional filters |
| `search_leads_advanced` | Advanced search with status, tags, date range, score filters |
| `tag_leads` | Add or remove tags from multiple leads at once |
| `update_lead` | Update lead information |
| `delete_lead` | Delete a lead |
| `move_lead_to_stage` | Move lead to a pipeline stage |
| `add_leads_to_campaign` | Add leads to a campaign |
| `get_lead_stats` | Get lead statistics grouped by status, tags, or source |

### Phone Numbers

| Tool | Description |
|------|-------------|
| `list_phone_numbers` | List all phone numbers |
| `update_phone_number` | Update phone number settings |
| `quarantine_phone_number` | Quarantine a spam-flagged number |
| `purchase_phone_numbers` | Buy new phone numbers |

### SMS & Voice

| Tool | Description |
|------|-------------|
| `send_sms_blast` | Send bulk SMS to multiple leads |
| `send_test_sms` | Send a test SMS |
| `create_voice_broadcast` | Create a voice broadcast |
| `list_broadcasts` | List all broadcasts |
| `launch_broadcast` | Start a broadcast |
| `stop_broadcast` | Stop a running broadcast |

### Workflows

| Tool | Description |
|------|-------------|
| `create_workflow` | Create multi-step workflow |
| `list_workflows` | List all workflows |
| `delete_workflow` | Delete a workflow |

### Calendar & Appointments

| Tool | Description |
|------|-------------|
| `check_calendar_availability` | Check available time slots |
| `book_appointment` | Book an appointment |
| `list_appointments` | List appointments |
| `list_today_appointments` | List today's appointments |
| `cancel_appointment` | Cancel an appointment |
| `reschedule_appointment` | Reschedule an appointment |

### Autonomous Agent

| Tool | Description |
|------|-------------|
| `get_autonomous_status` | Get full autonomous system status |
| `list_autonomous_decisions` | List recent AI decisions |
| `get_autonomous_goals` | Get goal progress |
| `set_autonomous_goal` | Set a new goal |
| `get_learning_insights` | Get AI learning insights |
| `toggle_autonomous_mode` | Enable/disable autonomous mode |
| `set_autonomy_level` | Set autonomy level (supervised/autonomous/full_auto) |
| `get_lead_priorities` | Get prioritized lead list |
| `force_reprioritize_leads` | Force recalculation of priorities |

### Guardian Integration

| Tool | Description |
|------|-------------|
| `get_guardian_status` | Get Guardian error system status |

### System & Diagnostics

| Tool | Description |
|------|-------------|
| `get_system_status` | Get overall system status |
| `diagnose_issue` | Diagnose why something isn't working |
| `undo_last_action` | Undo the last action |
| `record_session_action` | Record an action to session memory (internal) |
| `run_e2e_test` | Get instructions for running end-to-end tests |

## Wizard Flows

LJ guides users through complex setups with step-by-step wizards:

### Phone Number Wizard
1. Requirements (count, area code, purpose)
2. Agent Assignment
3. Rotation Setup
4. Confirmation

### Voice Broadcast Wizard
1. Purpose & Audience
2. Message Content
3. AMD Settings
4. Phone Number Selection
5. Confirmation

### SMS Blast Wizard
1. Purpose & Audience
2. Message Content
3. Compliance Check
4. Confirmation

### AI Voice Campaign Wizard
1. Goals
2. Agent Configuration
3. Lead Selection
4. Calling Parameters
5. Phone Numbers
6. Launch

## Manager Hierarchy

LJ coordinates internal specialized systems:

- 📞 **Number Pool Manager**: Phone number operations
- 👥 **Lead Manager**: Lead operations
- 📊 **Campaign Manager**: Campaign operations
- 🤖 **Agent Manager**: Retell AI agents
- 📅 **Calendar Manager**: Scheduling

## Response Format

LJ uses special formatting:
- Navigation links: `[[Display Text|/route]]`
- Numbered lists for multi-part questions
- Bold for important terms
- Sparingly used emojis

## Example Interactions

**Updating an Agent Script:**
```
User: "Update my Solar agent to handle the 'too expensive' objection better"

LJ: "Let me check your Solar agent's current script...

I found the agent. Here's what I'll add to handle the 'too expensive' objection:

**New Response:**
'I completely understand budget is important. Let me ask - if I could show you how this would actually SAVE you money in the long run, would that change things?'

Want me to add this to the script? I'll place it in the objection handling section."
```

**Checking Guardian Status:**
```
User: "How's Guardian doing?"

LJ: "🛡️ Guardian Status:
- **Status**: Active and monitoring
- **Today**: 3 errors caught, 2 auto-fixed
- **Auto-fix mode**: Enabled
- **Last activity**: 5 minutes ago

Everything's running smoothly! Guardian automatically resolved a network timeout and a failed API call."
```
