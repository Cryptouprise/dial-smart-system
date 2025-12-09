# Retell AI Integration - Quick Start

This project includes a comprehensive integration with Retell AI's complete API, enabling you to build, configure, and manage AI phone agents programmatically.

## Features

✅ **Complete API Coverage**: All Retell AI endpoints integrated
- Call Management (phone & web calls)
- Phone Number Management
- Agent Management (with custom LLMs)
- Retell LLM Management (with state machines & tools)
- Conversation Management
- Knowledge Base Management
- Voice Management
- Batch Operations
- Account Management

✅ **Type-Safe**: Full TypeScript support with comprehensive type definitions

✅ **Easy to Use**: Simple React hook API with automatic loading states

✅ **Error Handling**: Built-in error handling with toast notifications

## Quick Example

```typescript
import { useRetellService } from '@/hooks/useRetellService';

function MyComponent() {
  const retell = useRetellService();
  
  const createAgent = async () => {
    // 1. Create an LLM
    const llm = await retell.createRetellLLM({
      general_prompt: 'You are a helpful sales assistant...',
      begin_message: 'Hello! How can I help you today?',
      model: 'gpt-4o'
    });
    
    // 2. Create an agent
    const agent = await retell.createAgent({
      agent_name: 'Sales Bot',
      voice_id: '11labs-Adrian',
      response_engine: {
        type: 'retell-llm',
        llm_id: llm.llm_id
      }
    });
    
    // 3. Make a call
    const call = await retell.createPhoneCall({
      from_number: '+1234567890',
      to_number: '+0987654321',
      agent_id: agent.agent_id
    });
  };
  
  return (
    <button onClick={createAgent} disabled={retell.isLoading}>
      Create Agent & Call
    </button>
  );
}
```

## Documentation

See [RETELL_AI_INTEGRATION.md](./RETELL_AI_INTEGRATION.md) for complete documentation with examples.

## Example Component

Check out `src/components/RetellAIExample.tsx` for a complete working example that demonstrates:
- Building an agent from a natural language description
- Creating LLMs and agents programmatically
- Importing phone numbers
- Testing agents with web calls
- Listing all resources

## Architecture

```
src/
├── types/retell.ts              # TypeScript type definitions
├── lib/retellService.ts         # Service layer (static methods)
├── hooks/useRetellService.ts    # React hook (state management)
└── components/
    └── RetellAIExample.tsx      # Example component

supabase/functions/
├── retell-call-management/      # Call operations
├── retell-phone-management/     # Phone number operations
├── retell-agent-management/     # Agent operations
├── retell-llm-management/       # LLM operations
├── retell-conversation-management/  # Conversation operations
├── retell-knowledge-base-management/  # Knowledge base operations
├── retell-voice-management/     # Voice operations
├── retell-batch-operations/     # Batch operations
└── retell-account-management/   # Account operations
```

## Environment Setup

Make sure your Supabase project has the `RETELL_AI_API_KEY` secret configured:

```bash
# In Supabase Dashboard:
# Settings > Edge Functions > Secrets
# Add: RETELL_AI_API_KEY = your_retell_api_key
```

## Usage Patterns

### 1. Building Agents Dynamically

```typescript
async function buildFromDescription(description: string) {
  const llm = await retell.createRetellLLM({
    general_prompt: description,
    model: 'gpt-4o'
  });
  
  const agent = await retell.createAgent({
    agent_name: 'Dynamic Agent',
    voice_id: '11labs-Adrian',
    response_engine: {
      type: 'retell-llm',
      llm_id: llm.llm_id
    }
  });
  
  return agent;
}
```

### 2. Batch Calling

```typescript
const batch = await retell.createBatchCall({
  agent_id: 'agent_xxx',
  phone_numbers: ['+1111111111', '+2222222222'],
  from_number: '+0000000000',
  metadata: { campaign: 'summer_sale' }
});
```

### 3. Knowledge Base Integration

```typescript
const kb = await retell.createKnowledgeBase({
  knowledge_base_name: 'Product Docs',
  texts: [{
    text_title: 'Features',
    text_content: 'Our product offers...'
  }],
  urls: [{
    url: 'https://example.com/docs',
    enable_auto_crawl: true
  }]
});

// Link to agent's LLM
await retell.updateRetellLLM(llm.llm_id, {
  knowledge_base_id: kb.knowledge_base_id
});
```

## Benefits

1. **No Manual API Integration**: Everything is ready to use
2. **Type Safety**: Catch errors at compile time
3. **Consistent API**: Same patterns across all operations
4. **Loading States**: Automatic loading indicators
5. **Error Notifications**: Built-in user feedback
6. **Backend Secure**: API keys never exposed to frontend

## Support

For questions about Retell AI's API, see their [official documentation](https://docs.retellai.com/api-references).

For issues with this integration, check the code in:
- `src/lib/retellService.ts` - Service implementation
- `src/hooks/useRetellService.ts` - React hook wrapper
- `supabase/functions/retell-*/index.ts` - Backend functions
