# Autonomous Agent System Guide

## Overview

The Autonomous Agent System is an AI-powered decision engine that manages your leads 24/7. It learns from your interactions, adapts to your preferences, and continuously improves its performance.

## Features

### 1. Goal-Driven Autonomy
Set daily targets for:
- **Appointments** - Number of meetings to book
- **Calls** - Total outbound calls to make
- **Conversations** - Meaningful interactions to have

The system tracks progress and adjusts strategies to meet your goals.

### 2. Intelligent Lead Prioritization
ML-based scoring considers:
- **Engagement Score** - How responsive the lead has been
- **Recency Score** - Time since last contact
- **Sentiment Score** - Positive/negative interaction history
- **Best Contact Time** - Optimal time to reach this lead
- **Best Contact Day** - Optimal day of the week

### 3. Autonomy Levels

| Level | Description |
|-------|-------------|
| **Full Auto** | AI executes actions automatically without approval |
| **Approval Required** | AI suggests actions but requires your approval |
| **Suggestions Only** | AI provides recommendations, no automatic actions |

### 4. Self-Learning System
The AI learns from:
- Call outcomes (answered, voicemail, no answer)
- Disposition results (appointment set, callback, not interested)
- Engagement patterns (best times, preferred channels)
- Your feedback and corrections

### 5. Campaign Auto-Optimization
Automatically adjusts:
- Calling pace based on answer rates
- Number rotation to avoid spam flags
- Contact timing based on lead behavior
- Follow-up sequences based on outcomes

## Using the AI Chat

You can interact with the Autonomous Agent through the AI chat widget. Try these commands:

| Command | What It Does |
|---------|--------------|
| "What's going on with the system today?" | Get full autonomous status |
| "How are we doing on our goals?" | View today's goal progress |
| "What has the AI learned recently?" | Get learning insights |
| "Show me autonomous decisions" | List recent AI decisions |
| "Show me top priority leads" | Get AI-prioritized lead list |
| "Enable autonomous mode" | Turn on autonomous execution |
| "Set my goal to 10 appointments" | Update daily targets |

## Dashboard

Access the Autonomous Agent Dashboard from the sidebar under **AI & Automation > Autonomous Agent**.

### Dashboard Tabs

1. **Status** - Current mode, goal progress, recent decisions
2. **Goals** - Set and track daily/weekly targets
3. **Decisions** - History of AI decisions with outcomes
4. **Learning** - Insights and patterns the AI has learned
5. **Settings** - Configure autonomy levels and limits

## Configuration

### Autonomous Settings

```typescript
{
  enabled: boolean;              // Master switch for autonomous mode
  autonomy_level: 'full_auto' | 'approval_required' | 'suggestions_only';
  auto_execute_recommendations: boolean;
  auto_prioritize_leads: boolean;
  auto_optimize_campaigns: boolean;
  learning_enabled: boolean;
  max_daily_autonomous_actions: number;  // Safety limit
  require_approval_for_high_priority: boolean;
}
```

### Daily Goals

```typescript
{
  appointments_target: number;  // e.g., 5
  calls_target: number;         // e.g., 100
  conversations_target: number; // e.g., 20
}
```

## Best Practices

1. **Start Conservative** - Begin with "Suggestions Only" mode to understand how the AI thinks
2. **Set Realistic Goals** - Start with achievable targets and increase over time
3. **Review Decisions** - Check the decisions log regularly to provide feedback
4. **Let It Learn** - Give the system time to learn your patterns (1-2 weeks)
5. **Monitor Performance** - Use the dashboard to track improvement over time

## Troubleshooting

### AI Not Making Decisions
- Check that autonomous mode is enabled
- Verify you have active campaigns with leads
- Ensure phone numbers are configured
- Check daily action limits haven't been reached

### Decisions Not Executing
- Confirm autonomy level is "full_auto" or "approval_required"
- Check for any error alerts in the system
- Verify API integrations (Twilio, Retell) are working

### Learning Not Improving
- Ensure learning is enabled in settings
- Provide feedback on decisions (thumbs up/down)
- Allow 1-2 weeks for patterns to emerge

## API Reference

### Get Autonomous Status
```
Tool: get_autonomous_status
Returns: enabled status, autonomy level, goal progress, recent decisions
```

### Set Goals
```
Tool: set_autonomous_goal
Parameters: appointments, calls, conversations (all optional)
```

### Toggle Mode
```
Tool: toggle_autonomous_mode
Parameters: enabled (boolean)
```

### Get Lead Priorities
```
Tool: get_lead_priorities
Parameters: limit, min_score (optional)
```

### Force Reprioritization
```
Tool: force_reprioritize_leads
Triggers immediate ML-based lead scoring
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `autonomous_settings` | User configuration |
| `autonomous_goals` | Daily/weekly goal tracking |
| `agent_decisions` | Decision history |
| `learning_outcomes` | ML learning data |
| `lead_priority_scores` | Calculated lead scores |

## Integration with AI Brain

The Autonomous Agent is fully integrated with the AI Brain chat system. All autonomous tools are available through natural language commands:

- Ask about status, goals, or decisions
- Request learning insights
- Toggle modes and adjust settings
- Trigger lead reprioritization

Simply open the chat widget (⌘K) and ask!
