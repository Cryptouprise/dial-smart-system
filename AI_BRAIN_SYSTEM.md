# AI Brain System Documentation

## Overview

The AI Brain is a unified, self-improving AI assistant that consolidates all AI functionality into a single intelligent system. It learns from feedback, remembers user preferences, and continuously improves its responses.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Brain System                          │
├─────────────────────────────────────────────────────────────┤
│  Frontend                                                    │
│  ├── AIBrainChat.tsx (UI Component)                         │
│  ├── useAIBrain.ts (Hook)                                   │
│  └── AIBrainContext.tsx (Provider)                          │
├─────────────────────────────────────────────────────────────┤
│  Backend                                                     │
│  └── supabase/functions/ai-brain/index.ts                   │
├─────────────────────────────────────────────────────────────┤
│  Database Tables                                             │
│  ├── ai_feedback (User feedback on AI responses)            │
│  ├── ai_learning (Learned patterns and preferences)         │
│  ├── ai_session_memory (Session action history)             │
│  └── ai_daily_insights (Daily performance analytics)        │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 1. Unified Intelligence
- Single AI endpoint handles all requests
- Context-aware responses based on current page/location
- Understands system state and available data

### 2. Self-Improvement
- **Feedback Learning**: Learns from thumbs up/down ratings
- **Pattern Recognition**: Identifies successful interaction patterns
- **Preference Learning**: Remembers user preferences over time
- **Error Memory**: Avoids repeating past mistakes

### 3. Action Capabilities
The AI can execute the following actions:

| Category | Actions |
|----------|---------|
| **Campaigns** | create_campaign, list_campaigns, update_campaign, delete_campaign |
| **Leads** | create_lead, list_leads, update_lead, delete_lead |
| **Calls** | make_call, get_call_logs |
| **SMS** | send_sms, get_sms_history |
| **Phone Numbers** | add_phone_number, list_phone_numbers |
| **Workflows** | create_workflow, list_workflows |
| **System** | get_analytics, diagnose_issues, undo_action |
| **Learning** | record_feedback |

### 4. Navigation Intelligence
- Understands app structure and can guide users
- Generates clickable navigation links in responses
- Context-aware suggestions based on current page

### 5. Session Memory
- Tracks actions taken during the session
- Supports undo functionality for reversible actions
- Maintains conversation context

## Database Schema

### ai_feedback
Stores user feedback on AI responses for learning.
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key)
- response_id: TEXT (Unique identifier for the response)
- rating: TEXT ('positive' or 'negative')
- message_content: TEXT (Original user message)
- response_content: TEXT (AI's response)
- context: JSONB (Additional context)
- created_at: TIMESTAMP
```

### ai_learning
Stores learned patterns and preferences.
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key)
- pattern_type: TEXT (e.g., 'preference', 'success_pattern', 'error_pattern')
- pattern_key: TEXT (Unique identifier)
- pattern_value: JSONB (The learned pattern data)
- success_count: INTEGER
- failure_count: INTEGER
- last_used_at: TIMESTAMP
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### ai_session_memory
Tracks actions during a session for context and undo.
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key)
- session_id: TEXT
- action_type: TEXT
- action_data: JSONB
- resource_type: TEXT (e.g., 'campaign', 'lead')
- resource_id: TEXT
- resource_name: TEXT
- can_undo: BOOLEAN
- created_at: TIMESTAMP
```

### ai_daily_insights
Aggregated daily performance metrics.
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key)
- insight_date: DATE
- total_interactions: INTEGER
- positive_feedback: INTEGER
- negative_feedback: INTEGER
- top_actions: JSONB
- patterns_learned: JSONB
- recommendations: JSONB
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

## Usage

### In Components
```tsx
import { useAIBrainContext } from '@/contexts/AIBrainContext';

function MyComponent() {
  const { messages, sendMessage, isLoading } = useAIBrainContext();
  
  const handleAsk = async () => {
    await sendMessage('Create a new campaign called Summer Sale');
  };
  
  return (
    <button onClick={handleAsk} disabled={isLoading}>
      Ask AI
    </button>
  );
}
```

### Quick Actions
The AI provides quick action buttons for common tasks:
- 📊 Show Analytics
- 📞 List Campaigns
- 👥 View Leads
- 🔧 Diagnose Issues

### Feedback
Users can provide feedback on any AI response:
```tsx
const { submitFeedback } = useAIBrainContext();

// Positive feedback
submitFeedback(responseId, 'positive');

// Negative feedback
submitFeedback(responseId, 'negative');
```

## API Reference

### Edge Function: ai-brain

**Endpoint**: `POST /functions/v1/ai-brain`

**Headers**:
- `Authorization: Bearer <jwt_token>`
- `Content-Type: application/json`

**Request Body**:
```json
{
  "message": "string",
  "context": {
    "currentPage": "string",
    "sessionId": "string"
  }
}
```

**Response**:
```json
{
  "response": "string",
  "responseId": "string",
  "actions": [
    {
      "type": "string",
      "data": {}
    }
  ],
  "sessionMemory": []
}
```

## Learning System

### How the AI Learns

1. **Feedback Loop**
   - User provides thumbs up/down on responses
   - AI stores the context and outcome
   - Future similar requests reference past feedback

2. **Pattern Recognition**
   - Tracks which action sequences lead to success
   - Identifies common user workflows
   - Suggests optimized approaches

3. **Preference Learning**
   - Remembers user's preferred terminology
   - Adapts response style based on feedback
   - Personalizes suggestions over time

4. **Daily Review**
   - Aggregates daily interactions
   - Identifies improvement opportunities
   - Updates learned patterns

## Best Practices

1. **Provide Feedback**: Rate AI responses to help it learn
2. **Be Specific**: Clear requests get better results
3. **Use Quick Actions**: For common tasks, use the preset buttons
4. **Check Context**: AI responses are context-aware based on your current page

## Troubleshooting

### AI Not Responding
- Check your internet connection
- Verify you're logged in
- Check browser console for errors

### Incorrect Actions
- Provide negative feedback to help the AI learn
- Be more specific in your request
- Check if you have necessary permissions

### Feedback Not Saving
- Ensure you're authenticated
- Check network connectivity
- Verify the response has a valid ID

## Migration from Old System

The AI Brain replaces the previous `AIAssistantChat` component. Key changes:
- Unified backend (single edge function)
- Built-in learning capabilities
- Improved context awareness
- Session memory and undo support
