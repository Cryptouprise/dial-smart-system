# Retell AI Comprehensive API Integration Guide

This guide demonstrates how to use the comprehensive Retell AI integration in your application. The integration provides complete access to all Retell AI API endpoints through a simple, type-safe interface.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Call Management](#call-management)
4. [Phone Number Management](#phone-number-management)
5. [Agent Management](#agent-management)
6. [Retell LLM Management](#retell-llm-management)
7. [Conversation Management](#conversation-management)
8. [Knowledge Base Management](#knowledge-base-management)
9. [Voice Management](#voice-management)
10. [Batch Operations](#batch-operations)
11. [Account Management](#account-management)

## Overview

The Retell AI integration consists of:

- **Type definitions** (`src/types/retell.ts`): Comprehensive TypeScript types for all API entities
- **Service module** (`src/lib/retellService.ts`): Static methods for direct API access
- **React hook** (`src/hooks/useRetellService.ts`): React integration with loading states and error handling
- **Supabase Edge Functions**: Backend functions that proxy requests to Retell AI API

## Getting Started

Import the hook in your React component:

```typescript
import { useRetellService } from '@/hooks/useRetellService';

function MyComponent() {
  const retell = useRetellService();
  
  // Use retell.isLoading to show loading states
  // All methods return properly typed data or null on error
}
```

## Call Management

### Create a Phone Call

```typescript
const call = await retell.createPhoneCall({
  from_number: '+14155551234',
  to_number: '+14155555678',
  agent_id: 'agent_xxx',
  metadata: {
    customer_id: '12345',
    campaign: 'summer_sale'
  },
  drop_call_if_machine_detected: true,
  max_call_duration_ms: 600000 // 10 minutes
});

if (call) {
  console.log('Call created:', call.call_id);
}
```

### Create a Web Call

```typescript
const webCall = await retell.createWebCall({
  agent_id: 'agent_xxx',
  metadata: {
    user_id: 'user_123'
  }
});

if (webCall) {
  // Use webCall.access_token to connect from the frontend
  console.log('Access token:', webCall.access_token);
}
```

### Get Call Details

```typescript
const call = await retell.getCall('call_id_xxx');
if (call) {
  console.log('Call status:', call.call_status);
  console.log('Transcript:', call.transcript);
  console.log('Recording:', call.recording_url);
}
```

### List Calls

```typescript
const calls = await retell.listCalls({
  limit: 50,
  sort_order: 'descending',
  filter_criteria: {
    call_status: 'ended'
  }
});
```

## Phone Number Management

### Import a Phone Number

```typescript
const phoneNumber = await retell.importPhoneNumber({
  phone_number: '+14155551234',
  termination_uri: 'sip:example.pstn.twilio.com',
  inbound_agent_id: 'agent_xxx',
  nickname: 'Main Sales Line'
});
```

### List Phone Numbers

```typescript
const numbers = await retell.listPhoneNumbers();
if (numbers) {
  numbers.forEach(num => {
    console.log(`${num.nickname}: ${num.phone_number}`);
  });
}
```

### Update Phone Number

```typescript
await retell.updatePhoneNumber('+14155551234', {
  inbound_agent_id: 'agent_new',
  nickname: 'Updated Nickname'
});
```

### Register Phone Number (Custom Telephony)

```typescript
const registered = await retell.registerPhoneNumber({
  phone_number: '+14155551234',
  agent_id: 'agent_xxx'
});
```

## Agent Management

### Create an Agent

```typescript
const agent = await retell.createAgent({
  agent_name: 'Sales Assistant',
  voice_id: '11labs-Adrian',
  response_engine: {
    type: 'retell-llm',
    llm_id: 'llm_xxx'
  },
  language: 'en-US',
  voice_temperature: 1.0,
  voice_speed: 1.0,
  enable_backchannel: true,
  ambient_sound: 'coffee-shop',
  responsiveness: 1.0,
  interruption_sensitivity: 1.0,
  enable_voicemail_detection: true,
  opt_out_sensitive_data_storage: false
});
```

### Create Agent with Custom LLM

```typescript
const agent = await retell.createAgent({
  agent_name: 'Custom LLM Agent',
  voice_id: '11labs-Adrian',
  response_engine: {
    type: 'custom-llm',
    llm_websocket_url: 'wss://your-server.com/llm-websocket'
  }
});
```

### List and Get Agents

```typescript
const agents = await retell.listAgents();
const agent = await retell.getAgent('agent_xxx');
```

### Update Agent

```typescript
await retell.updateAgent('agent_xxx', {
  agent_name: 'Updated Name',
  voice_temperature: 0.8,
  boosted_keywords: ['important', 'urgent', 'premium']
});
```

## Retell LLM Management

### Create a Retell LLM

```typescript
const llm = await retell.createRetellLLM({
  general_prompt: 'You are a helpful sales assistant...',
  begin_message: 'Hello! How can I help you today?',
  model: 'gpt-4o',
  temperature: 0.7,
  max_tokens: 500,
  general_tools: [{
    name: 'check_inventory',
    description: 'Check product inventory',
    url: 'https://api.example.com/inventory',
    parameters: {
      product_id: { type: 'string', required: true }
    },
    speak_after_execution: true
  }]
});
```

### Create LLM with State Machine

```typescript
const llm = await retell.createRetellLLM({
  general_prompt: 'You are a customer service agent...',
  begin_message: 'Welcome! What can I do for you?',
  model: 'gpt-4o',
  starting_state: 'greeting',
  states: [
    {
      name: 'greeting',
      state_prompt: 'Greet the customer and ask how you can help.',
      edges: [
        {
          destination_state_name: 'issue_collection',
          description: 'Customer has stated their issue'
        }
      ]
    },
    {
      name: 'issue_collection',
      state_prompt: 'Collect details about the customer issue.',
      edges: [
        {
          destination_state_name: 'resolution',
          description: 'Have enough information to resolve'
        }
      ]
    },
    {
      name: 'resolution',
      state_prompt: 'Provide resolution and confirm satisfaction.',
      tools: [{
        name: 'create_ticket',
        description: 'Create support ticket',
        url: 'https://api.example.com/tickets'
      }]
    }
  ]
});
```

### List and Update LLMs

```typescript
const llms = await retell.listRetellLLMs();
const llm = await retell.getRetellLLM('llm_xxx');

await retell.updateRetellLLM('llm_xxx', {
  general_prompt: 'Updated prompt...',
  temperature: 0.8
});
```

## Conversation Management

### Create and Manage Conversations

```typescript
// Create a conversation
const conversation = await retell.createConversation({
  agent_id: 'agent_xxx',
  metadata: {
    customer_id: '12345',
    topic: 'product_inquiry'
  }
});

// Get conversation details
const conv = await retell.getConversation('conversation_xxx');

// List all conversations for an agent
const conversations = await retell.listConversations('agent_xxx');

// Update conversation metadata
await retell.updateConversation('conversation_xxx', {
  metadata: {
    status: 'resolved',
    resolution: 'Product shipped'
  }
});

// Delete conversation
await retell.deleteConversation('conversation_xxx');
```

## Knowledge Base Management

### Create a Knowledge Base

```typescript
const kb = await retell.createKnowledgeBase({
  knowledge_base_name: 'Product Documentation',
  enable_auto_refresh: true,
  refresh_frequency: 'daily',
  texts: [
    {
      text_title: 'Product Features',
      text_content: 'Our product offers the following features...'
    }
  ],
  urls: [
    {
      url: 'https://example.com/docs',
      enable_auto_crawl: true
    }
  ],
  files: [
    {
      file_name: 'user_guide.pdf',
      file_url: 'https://example.com/files/guide.pdf'
    }
  ]
});
```

### Manage Knowledge Bases

```typescript
// List all knowledge bases
const kbs = await retell.listKnowledgeBases();

// Get specific knowledge base
const kb = await retell.getKnowledgeBase('kb_xxx');

// Update knowledge base
await retell.updateKnowledgeBase('kb_xxx', {
  texts: [
    {
      text_title: 'New FAQ',
      text_content: 'Updated frequently asked questions...'
    }
  ]
});

// Delete knowledge base
await retell.deleteKnowledgeBase('kb_xxx');
```

## Voice Management

### List Available Voices

```typescript
const voices = await retell.listVoices();
if (voices) {
  voices.forEach(voice => {
    console.log(`${voice.voice_name} (${voice.voice_provider})`);
    console.log(`  Type: ${voice.voice_type}`);
    console.log(`  Language: ${voice.language}`);
    if (voice.preview_audio_url) {
      console.log(`  Preview: ${voice.preview_audio_url}`);
    }
  });
}
```

### Get Voice Details

```typescript
const voice = await retell.getVoice('11labs-Adrian');
```

## Batch Operations

### Create Batch Call Campaign

```typescript
const batch = await retell.createBatchCall({
  agent_id: 'agent_xxx',
  phone_numbers: [
    '+14155551111',
    '+14155552222',
    '+14155553333'
  ],
  from_number: '+14155550000',
  metadata: {
    campaign: 'holiday_promo'
  },
  drop_call_if_machine_detected: true,
  max_call_duration_ms: 300000,
  start_time: '2024-12-25T10:00:00Z' // Schedule for future
});

if (batch) {
  console.log(`Batch created: ${batch.batch_id}`);
  console.log(`Total calls: ${batch.total_calls}`);
}
```

### Create Batch Test

```typescript
const test = await retell.createBatchTest({
  agent_id: 'agent_xxx',
  test_scenarios: [
    {
      scenario_name: 'Product Inquiry',
      user_messages: [
        'Hi, I want to know about your products',
        'What are the prices?',
        'Great, I will buy one'
      ],
      expected_outcomes: [
        'Agent provides product information',
        'Agent shares pricing',
        'Agent helps complete purchase'
      ]
    },
    {
      scenario_name: 'Support Request',
      user_messages: [
        'I have a problem with my order',
        'Order number is 12345',
        'I need a refund'
      ]
    }
  ]
});
```

## Account Management

### Get Account Information

```typescript
const account = await retell.getAccount();
if (account) {
  console.log(`Balance: ${account.balance} ${account.currency}`);
  console.log(`Auto-recharge: ${account.auto_recharge_enabled}`);
}
```

## Complete Example: Building an Agent from Description

Here's an example of how you could build an agent programmatically based on a description:

```typescript
async function buildAgentFromDescription(description: string) {
  const retell = useRetellService();
  
  // 1. Create the LLM with the description as the prompt
  const llm = await retell.createRetellLLM({
    general_prompt: description,
    begin_message: 'Hello! How can I assist you today?',
    model: 'gpt-4o',
    temperature: 0.7
  });
  
  if (!llm) return null;
  
  // 2. Create the agent with the LLM
  const agent = await retell.createAgent({
    agent_name: 'AI Assistant',
    voice_id: '11labs-Adrian',
    response_engine: {
      type: 'retell-llm',
      llm_id: llm.llm_id
    },
    enable_backchannel: true,
    responsiveness: 1.0
  });
  
  if (!agent) return null;
  
  // 3. Import a phone number and link it to the agent
  const phoneNumber = await retell.importPhoneNumber({
    phone_number: '+14155551234',
    termination_uri: 'sip:example.pstn.twilio.com',
    inbound_agent_id: agent.agent_id,
    nickname: 'AI Assistant Line'
  });
  
  return {
    agent,
    llm,
    phoneNumber
  };
}

// Usage
const result = await buildAgentFromDescription(
  'You are a friendly sales assistant for a tech company. ' +
  'Help customers understand our products and guide them through purchases.'
);
```

## Error Handling

All methods handle errors gracefully:

```typescript
const { isLoading } = retell;

if (isLoading) {
  return <div>Loading...</div>;
}

// Methods return null on error and show toast notification
const agent = await retell.createAgent(config);
if (!agent) {
  // Error already shown to user via toast
  // Handle error case
  return;
}

// Success - agent is properly typed
console.log(agent.agent_id);
```

## Type Safety

All types are imported from `@/types/retell`:

```typescript
import type {
  Agent,
  RetellLLM,
  PhoneNumber,
  Call,
  KnowledgeBase,
  // ... and more
} from '@/types/retell';

// Use types for your component state
const [agent, setAgent] = useState<Agent | null>(null);
```

## Direct Service Access

If you need direct access without React hooks:

```typescript
import { RetellService } from '@/lib/retellService';

// Use anywhere (not just React components)
const calls = await RetellService.listCalls();
const agent = await RetellService.createAgent(config);
```

## Summary

This comprehensive integration provides:

- ✅ Complete type safety with TypeScript
- ✅ All Retell AI API endpoints
- ✅ React hooks with loading states
- ✅ Automatic error handling and user notifications
- ✅ Backend proxying through Supabase Edge Functions
- ✅ Easy-to-use API that matches Retell AI documentation

You can now build, configure, and manage AI phone agents programmatically by describing what you need!
